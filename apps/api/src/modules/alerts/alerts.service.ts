import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'acknowledged',
        acknowledged: true,
        ackBy: userEmail,
        ackAt: new Date(),
      },
    });

    // Audit log (fire and forget)
    this.audit
      .log(organizationId, {
        userEmail,
        action: 'alert.acknowledged',
        resource: `alert/${alertId}`,
        details: `Alert acknowledged: ${alert.level} - ${alert.message || alertId}`,
        severity: 'info',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return updated;
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

    const resolved = await this.prisma.alert.update({
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

    // Audit log (fire and forget)
    this.audit
      .log(organizationId, {
        userEmail,
        action: 'alert.resolved',
        resource: `alert/${alertId}`,
        details: `Alert resolved: ${alert.level} - ${alert.message || alertId}`,
        severity: 'info',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return resolved;
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
