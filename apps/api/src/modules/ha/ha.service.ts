import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class HAService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.hAConfig.findMany({
      where: { system: { organizationId } },
      include: { system: { select: { sid: true, description: true, environment: true, status: true, healthScore: true } } },
    });
  }

  async findBySystem(organizationId: string, systemId: string) {
    const config = await this.prisma.hAConfig.findFirst({
      where: { systemId, system: { organizationId } },
      include: { system: true },
    });
    if (!config) throw new NotFoundException('HA config not found for this system');
    return config;
  }

  async triggerFailover(organizationId: string, systemId: string) {
    const config = await this.prisma.hAConfig.findFirst({
      where: { systemId, system: { organizationId } },
    });
    if (!config) throw new NotFoundException('HA config not found');

    return this.prisma.hAConfig.update({
      where: { id: config.id },
      data: {
        status: 'failover_in_progress',
        lastFailoverAt: new Date(),
      },
    });
  }

  async updateStatus(organizationId: string, systemId: string, status: string) {
    const config = await this.prisma.hAConfig.findFirst({
      where: { systemId, system: { organizationId } },
    });
    if (!config) throw new NotFoundException('HA config not found');

    return this.prisma.hAConfig.update({
      where: { id: config.id },
      data: { status },
    });
  }
}
