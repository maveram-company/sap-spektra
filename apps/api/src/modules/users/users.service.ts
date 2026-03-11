import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      status: m.user.status,
      lastLoginAt: m.user.lastLoginAt,
      createdAt: m.user.createdAt,
    }));
  }

  async findOne(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId, userId },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException('User not found in this organization');
    }

    return {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      status: membership.user.status,
      mfaEnabled: membership.user.mfaEnabled,
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.user.createdAt,
    };
  }

  async create(organizationId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: existing.id,
            organizationId,
          },
        },
      });

      if (existingMembership) {
        throw new ConflictException('User already in this organization');
      }

      await this.prisma.membership.create({
        data: {
          userId: existing.id,
          organizationId,
          role: dto.role || 'viewer',
        },
      });

      return this.findOne(organizationId, existing.id);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          status: 'active',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId,
          role: dto.role || 'viewer',
        },
      });

      return user;
    });

    this.logger.log(`User created: ${dto.email} → org ${organizationId}`);
    return this.findOne(organizationId, result.id);
  }

  async update(organizationId: string, userId: string, dto: UpdateUserDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId, userId },
    });

    if (!membership) {
      throw new NotFoundException('User not found in this organization');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.status) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(dto.name && { name: dto.name }),
            ...(dto.status && { status: dto.status }),
          },
        });
      }

      if (dto.role) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { role: dto.role },
        });
      }
    });

    return this.findOne(organizationId, userId);
  }

  async remove(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { organizationId, userId },
    });

    if (!membership) {
      throw new NotFoundException('User not found in this organization');
    }

    await this.prisma.membership.delete({
      where: { id: membership.id },
    });

    this.logger.log(`User ${userId} removed from org ${organizationId}`);
    return { deleted: true };
  }
}
