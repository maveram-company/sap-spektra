import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findOne(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async update(
    organizationId: string,
    data: { name?: string; timezone?: string; language?: string },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });
  }

  async getStats(organizationId: string) {
    const [systemCount, userCount, alertCount, activeAlerts] =
      await Promise.all([
        this.prisma.system.count({ where: { organizationId } }),
        this.prisma.membership.count({ where: { organizationId } }),
        this.prisma.alert.count({ where: { organizationId } }),
        this.prisma.alert.count({
          where: { organizationId, status: 'active' },
        }),
      ]);

    return { systemCount, userCount, alertCount, activeAlerts };
  }
}
