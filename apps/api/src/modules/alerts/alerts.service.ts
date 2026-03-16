import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { status?: string; level?: string; systemId?: string },
  ) {
    return this.prisma.alert.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.level && { level: filters.level }),
        ...(filters?.systemId && { systemId: filters.systemId }),
      },
      include: { system: { select: { sid: true, description: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async acknowledge(
    organizationId: string,
    alertId: string,
    userEmail: string,
  ) {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'acknowledged',
        acknowledged: true,
        ackBy: userEmail,
        ackAt: new Date(),
      },
    });
  }

  async resolve(
    organizationId: string,
    alertId: string,
    userEmail: string,
    data: { category?: string; note?: string },
  ) {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'resolved',
        resolved: true,
        resolvedBy: userEmail,
        resolvedAt: new Date(),
        resolutionCategory: data.category,
        resolutionNote: data.note,
      },
    });
  }

  async getStats(organizationId: string) {
    const [total, active, acknowledged, resolved, critical, warning] =
      await Promise.all([
        this.prisma.alert.count({ where: { organizationId } }),
        this.prisma.alert.count({
          where: { organizationId, status: 'active' },
        }),
        this.prisma.alert.count({
          where: { organizationId, status: 'acknowledged' },
        }),
        this.prisma.alert.count({
          where: { organizationId, status: 'resolved' },
        }),
        this.prisma.alert.count({
          where: { organizationId, level: 'critical', status: 'active' },
        }),
        this.prisma.alert.count({
          where: { organizationId, level: 'warning', status: 'active' },
        }),
      ]);

    return { total, active, acknowledged, resolved, critical, warning };
  }
}
