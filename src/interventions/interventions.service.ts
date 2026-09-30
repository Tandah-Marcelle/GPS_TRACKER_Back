import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InterventionStatus, Prisma, Role, TrackerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackerAction } from '../trackers/trackers.constants';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { QueryInterventionsDto } from './dto/query-interventions.dto';

const INCLUDE = {
  client: { select: { id: true, name: true, phone: true, address: true } },
  vehicle: { select: { id: true, plate: true, brand: true, model: true } },
  technician: { select: { id: true, username: true, fullName: true } },
  tracker: { select: { id: true, imei: true, model: true, simNumber: true } },
} satisfies Prisma.InterventionInclude;

@Injectable()
export class InterventionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Planning (manager only).
   * Rule 5: the target must be a real technician, and the vehicle must belong
   * to the submitted client.
   */
  async create(dto: CreateInterventionDto) {
    const [client, vehicle, technician] = await Promise.all([
      this.prisma.client.findUnique({ where: { id: dto.clientId } }),
      this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } }),
      this.prisma.user.findUnique({ where: { id: dto.technicianId } }),
    ]);

    if (!client) throw new BadRequestException(`Client ${dto.clientId} does not exist`);
    if (!vehicle) throw new BadRequestException(`Vehicle ${dto.vehicleId} does not exist`);
    if (!technician) throw new BadRequestException(`Technician ${dto.technicianId} does not exist`);
    if (technician.role !== Role.TECHNICIAN) {
      throw new BadRequestException(
        `${technician.fullName} is not a technician, an intervention cannot be assigned to them.`,
      );
    }
    if (vehicle.clientId !== client.id) {
      throw new BadRequestException(
        `Vehicle ${vehicle.plate} does not belong to client ${client.name}.`,
      );
    }

    return this.prisma.intervention.create({
      data: {
        clientId: client.id,
        vehicleId: vehicle.id,
        technicianId: technician.id,
        scheduledAt: new Date(dto.scheduledAt),
        address: dto.address.trim(),
        status: InterventionStatus.PLANNED,
      },
      include: INCLUDE,
    });
  }

  /**
   * Ownership is applied here, not only in the controller (rule 4): a technician
   * can never see another technician's interventions, whatever they pass as a filter.
   */
  async findAll(query: QueryInterventionsDto, currentUser: { id: string; role: Role }) {
    const isTech = currentUser.role === Role.TECHNICIAN;

    const where: Prisma.InterventionWhereInput = {
      ...(isTech ? { technicianId: currentUser.id } : {}),
      ...(!isTech && query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.date
        ? {
            scheduledAt: {
              // Scheduled on the given calendar day, in UTC.
              gte: startOfUtcDay(query.date),
              lt: endOfUtcDay(query.date),
            },
          }
        : {}),
    };

    if (query.all) {
      const data = await this.prisma.intervention.findMany({
        where,
        include: INCLUDE,
        orderBy: { scheduledAt: 'asc' },
      });
      return { data, meta: { total: data.length, page: 1, limit: data.length, totalPages: 1 } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.intervention.findMany({
        where,
        include: INCLUDE,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.intervention.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * A technician asking for someone else's intervention gets 404, never 403,
   * so the endpoint does not confirm that the record exists.
   */
  async findOne(id: string, currentUser: { id: string; role: Role }) {
    const intervention = await this.prisma.intervention.findUnique({
      where: { id },
      include: INCLUDE,
    });

    if (!intervention) throw new NotFoundException(`Intervention ${id} not found`);

    if (currentUser.role === Role.TECHNICIAN && intervention.technicianId !== currentUser.id) {
      throw new NotFoundException(`Intervention ${id} not found`);
    }

    return intervention;
  }

  /**
   * A manager cancels a PLANNED intervention. DONE and CANCELLED are final (rule 5).
   */
  async cancel(id: string) {
    const intervention = await this.prisma.intervention.findUnique({ where: { id } });
    if (!intervention) throw new NotFoundException(`Intervention ${id} not found`);

    if (intervention.status !== InterventionStatus.PLANNED) {
      throw new ConflictException(
        `Only a PLANNED intervention can be cancelled. This one is ${intervention.status}, which is final.`,
      );
    }

    return this.prisma.intervention.update({
      where: { id },
      data: { status: InterventionStatus.CANCELLED },
      include: INCLUDE,
    });
  }

  /**
   * Completing an intervention installs a tracker, atomically (rule 3).
   *
   * Everything below happens in ONE prisma.$transaction, so two concurrent
   * requests for the same tracker produce exactly one success and one 409:
   * the conditional `updateMany` on status = IN_STOCK is the lock.
   */
  async complete(id: string, trackerId: string, currentUser: { id: string; role: Role }) {
    // Ownership + existence are resolved before the transaction, but re-checked
    // inside it so a concurrent cancel cannot slip through.
    await this.findOne(id, currentUser);

    return this.prisma.$transaction(async (tx) => {
      const intervention = await tx.intervention.findUnique({ where: { id } });
      if (!intervention) throw new NotFoundException(`Intervention ${id} not found`);

      // Rule 4 again, enforced where the data is read.
      if (intervention.technicianId !== currentUser.id) {
        throw new NotFoundException(`Intervention ${id} not found`);
      }

      if (intervention.status !== InterventionStatus.PLANNED) {
        throw new ConflictException(
          `Only a PLANNED intervention can be completed. This one is ${intervention.status}, which is final.`,
        );
      }

      // Rule 3c: the vehicle must not already carry an installed tracker.
      // Checked up front for a clear message; the partial unique index
      // `one_installed_tracker_per_vehicle` remains the final guard.
      const alreadyInstalled = await tx.tracker.count({
        where: { vehicleId: intervention.vehicleId, status: TrackerStatus.INSTALLED },
      });
      if (alreadyInstalled > 0) {
        throw new ConflictException(
          'This vehicle already has an installed tracker. Remove it before installing another one.',
        );
      }

      // Rule 3b: atomic claim. The WHERE clause on status is the concurrency guard.
      const claimed = await tx.tracker.updateMany({
        where: { id: trackerId, status: TrackerStatus.IN_STOCK },
        data: { status: TrackerStatus.INSTALLED, vehicleId: intervention.vehicleId },
      });

      if (claimed.count !== 1) {
        const existing = await tx.tracker.findUnique({
          where: { id: trackerId },
          select: { status: true },
        });
        throw new ConflictException(
          existing
            ? `Tracker is not available: it is already ${existing.status}. Choose another one.`
            : 'Tracker not available: it does not exist or was just taken. Choose another one.',
        );
      }

      // Rule 3d
      await tx.intervention.update({
        where: { id },
        data: {
          status: InterventionStatus.DONE,
          trackerId,
          completedAt: new Date(),
        },
      });

      // Rule 3e
      await tx.trackerHistory.create({
        data: {
          trackerId,
          oldStatus: TrackerStatus.IN_STOCK,
          newStatus: TrackerStatus.INSTALLED,
          action: TrackerAction.INSTALLED,
          userId: currentUser.id,
          vehicleId: intervention.vehicleId,
          interventionId: intervention.id,
          comment: 'Installed during intervention completion',
        },
      });

      return tx.intervention.findUnique({ where: { id }, include: INCLUDE });
    });
  }
}

function startOfUtcDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function endOfUtcDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}
