import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
    });

    await this.audit.log(organizationId, {
      userEmail: 'system',
      action: 'tenant.update',
      resource: `organization:${organizationId}`,
      details: JSON.stringify(data),
      severity: 'info',
    });

    return updated;
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
