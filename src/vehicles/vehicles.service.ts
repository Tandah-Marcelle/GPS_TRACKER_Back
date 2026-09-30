import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clientId?: string) {
    return this.prisma.vehicle.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { trackers: true, interventions: true } },
      },
      orderBy: { plate: 'asc' },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true } }, trackers: true },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found`);
    return vehicle;
  }

  /** The client must exist before a vehicle can be attached to it. */
  private async assertClientExists(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new BadRequestException(`Client ${clientId} does not exist`);
  }

  async create(dto: CreateVehicleDto) {
    await this.assertClientExists(dto.clientId);
    return this.prisma.vehicle.create({
      data: dto,
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);
    if (dto.clientId) await this.assertClientExists(dto.clientId);

    // Moving a vehicle that already carries an installed tracker would break the
    // "one installed tracker per vehicle" invariant from the other side.
    if (dto.clientId) {
      const installed = await this.prisma.tracker.count({
        where: { vehicleId: id, status: 'INSTALLED' },
      });
      if (installed > 0) {
        throw new ConflictException(
          'This vehicle has an installed tracker. Remove the tracker before reassigning the vehicle.',
        );
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: dto,
      include: { client: { select: { id: true, name: true } } },
    });
  }

  /** A vehicle linked to a tracker or an intervention can never be deleted. */
  async remove(id: string) {
    const vehicle = await this.findOne(id);

    if (vehicle.trackers.length > 0) {
      throw new ConflictException(
        `Vehicle cannot be deleted: ${vehicle.trackers.length} tracker(s) are still linked to it.`,
      );
    }

    const interventions = await this.prisma.intervention.count({ where: { vehicleId: id } });
    if (interventions > 0) {
      throw new ConflictException(
        `Vehicle cannot be deleted: ${interventions} intervention(s) reference this vehicle.`,
      );
    }

    await this.prisma.vehicle.delete({ where: { id } });
    return { deleted: true, id };
  }
}
