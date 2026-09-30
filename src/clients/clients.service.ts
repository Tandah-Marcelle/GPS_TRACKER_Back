import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(search?: string) {
    return this.prisma.client.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { _count: { select: { vehicles: true, interventions: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { vehicles: true },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  create(dto: CreateClientDto) {
    return this.prisma.client.create({ data: dto });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  /** A client that still has vehicles or interventions can never be deleted. */
  async remove(id: string) {
    const client = await this.findOne(id);

    if (client.vehicles.length > 0) {
      throw new ConflictException(
        `Client cannot be deleted: ${client.vehicles.length} vehicle(s) are still linked. Delete or reassign them first.`,
      );
    }

    const interventions = await this.prisma.intervention.count({ where: { clientId: id } });
    if (interventions > 0) {
      throw new ConflictException(
        `Client cannot be deleted: ${interventions} intervention(s) reference this client.`,
      );
    }

    await this.prisma.client.delete({ where: { id } });
    return { deleted: true, id };
  }
}
