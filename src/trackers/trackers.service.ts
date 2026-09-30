import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TrackerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrackerDto } from './dto/create-tracker.dto';
import { UpdateTrackerDto } from './dto/update-tracker.dto';
import { QueryTrackersDto } from './dto/query-trackers.dto';
import {
  allowedTargetsFrom,
  STATUSES_CLEARING_VEHICLE,
  TrackerAction,
  TrackerActionValue,
  TRACKER_TRANSITIONS,
} from './trackers.constants';

@Injectable()
export class TrackersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Receives a new tracker: it always starts IN_STOCK and the first history row
   * (oldStatus null, action RECEIVED) is written in the same transaction.
   */
  async create(dto: CreateTrackerDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const tracker = await tx.tracker.create({
        data: {
          imei: dto.imei,
          model: dto.model,
          simNumber: dto.simNumber,
          status: TrackerStatus.IN_STOCK,
        },
      });

      await tx.trackerHistory.create({
        data: {
          trackerId: tracker.id,
          oldStatus: null,
          newStatus: TrackerStatus.IN_STOCK,
          action: TrackerAction.RECEIVED,
          userId,
          comment: 'Tracker received into stock',
        },
      });

      return tracker;
    });
  }

  /** Paginated list with optional status filter and IMEI search. */
  async findAll(query: QueryTrackersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TrackerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { imei: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tracker.findMany({
        where,
        include: { vehicle: { select: { id: true, plate: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tracker.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** IN_STOCK trackers, used by technicians when completing an intervention. */
  async findAvailable(search?: string) {
    return this.prisma.tracker.findMany({
      where: {
        status: TrackerStatus.IN_STOCK,
        ...(search ? { imei: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    if (!id || id.length < 8) throw new BadRequestException('Invalid tracker id');
    const tracker = await this.prisma.tracker.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, plate: true, brand: true, model: true } },
      },
    });
    if (!tracker) throw new NotFoundException(`Tracker ${id} not found`);
    return tracker;
  }

  /** Only the editable attributes: status is changed exclusively via updateStatus. */
  async update(id: string, dto: UpdateTrackerDto) {
    await this.findOne(id);
    return this.prisma.tracker.update({
      where: { id },
      data: {
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.simNumber !== undefined ? { simNumber: dto.simNumber } : {}),
      },
    });
  }

  /**
   * Applies a manual status change, enforcing the transition map.
   * Every accepted change writes a TrackerHistory row in the same transaction.
   */
  async updateStatus(id: string, newStatus: TrackerStatus, comment: string | undefined, userId: string) {
    const tracker = await this.findOne(id);

    if (newStatus === TrackerStatus.INSTALLED) {
      throw new BadRequestException(
        'A tracker can only be installed by completing an intervention',
      );
    }

    if (tracker.status === newStatus) {
      throw new BadRequestException(`Tracker is already ${newStatus}`);
    }

    const action = TRACKER_TRANSITIONS[tracker.status]?.[newStatus] as TrackerActionValue | undefined;
    if (!action) {
      const allowed = allowedTargetsFrom(tracker.status);
      throw new ConflictException(
        `Cannot change a ${tracker.status} tracker to ${newStatus}. ` +
          (allowed.length
            ? `Allowed from ${tracker.status}: ${allowed.join(', ')}.`
            : `No transition is allowed from ${tracker.status}.`),
      );
    }

    const oldStatus = tracker.status;
    const previousVehicleId = tracker.vehicleId;
    const clearsVehicle = STATUSES_CLEARING_VEHICLE.includes(oldStatus);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tracker.update({
        where: { id },
        data: {
          status: newStatus,
          ...(clearsVehicle ? { vehicleId: null } : {}),
        },
      });

      await tx.trackerHistory.create({
        data: {
          trackerId: id,
          oldStatus,
          newStatus,
          action,
          userId,
          // Keep a trace of the vehicle the tracker was removed from.
          vehicleId: clearsVehicle ? previousVehicleId : null,
          comment: comment ?? null,
        },
      });

      return updated;
    });
  }

  async history(id: string) {
    await this.findOne(id);
    return this.prisma.trackerHistory.findMany({
      where: { trackerId: id },
      include: {
        user: { select: { id: true, username: true, fullName: true, role: true } },
        vehicle: { select: { id: true, plate: true } },
        intervention: { select: { id: true, status: true, scheduledAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Referenced trackers are never deleted (rule: no destructive delete of linked data). */
  async remove(id: string) {
    const tracker = await this.findOne(id);

    if (tracker.status !== TrackerStatus.IN_STOCK) {
      throw new ConflictException(
        `Only IN_STOCK trackers can be deleted. This tracker is ${tracker.status}.`,
      );
    }

    const interventionCount = await this.prisma.intervention.count({ where: { trackerId: id } });
    if (interventionCount > 0) {
      throw new ConflictException(
        'Tracker is referenced by an intervention and cannot be deleted',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trackerHistory.deleteMany({ where: { trackerId: id } });
      await tx.tracker.delete({ where: { id } });
    });

    return { deleted: true, id };
  }
}
