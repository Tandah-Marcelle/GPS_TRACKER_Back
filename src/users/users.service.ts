import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /** Accepts either the username or the email address used at registration. */
  async findByUsernameOrEmail(identifier: string) {
    const value = identifier.trim();
    return this.prisma.user.findFirst({
      where: { OR: [{ username: value }, { email: { equals: value, mode: 'insensitive' } }] },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findAll(role?: Role) {
    const where = role ? { role } : {};
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    // never return passwordHash
    return users.map(({ passwordHash, ...rest }) => rest);
  }

  async create(data: { username: string; password: string; fullName: string; role: Role }) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
      },
    });
    const { passwordHash: _, ...result } = user;
    return result;
  }
}
