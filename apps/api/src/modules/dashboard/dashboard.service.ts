import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string) {
    const [
      systems,
      activeAlerts,
      criticalAlerts,
      pendingApprovals,
      recentEvents,
      connectors,
    ] = await Promise.all([
      this.prisma.system.findMany({
        where: { organizationId },
        select: {
          id: true,
          sid: true,
          status: true,
          healthScore: true,
          environment: true,
          sapProduct: true,
        },
      }),
      this.prisma.alert.count({ where: { organizationId, status: 'active' } }),
      this.prisma.alert.count({
        where: { organizationId, level: 'critical', status: 'active' },
      }),
      this.prisma.approvalRequest.count({
        where: { organizationId, status: 'PENDING' },
      }),
      this.prisma.event.findMany({
        where: { organizationId },
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { system: { select: { sid: true } } },
      }),
      this.prisma.connector.findMany({
        where: { organizationId },
        select: {
          id: true,
          systemId: true,
          method: true,
          status: true,
          latencyMs: true,
        },
      }),
    ]);

    const statusCounts = {
      healthy: systems.filter((s) => s.status === 'healthy').length,
      warning: systems.filter((s) => s.status === 'warning').length,
      critical: systems.filter((s) => s.status === 'critical').length,
      unreachable: systems.filter((s) => s.status === 'unreachable').length,
    };

    const avgHealthScore =
      systems.length > 0
        ? Math.round(
            systems.reduce((sum, s) => sum + s.healthScore, 0) / systems.length,
          )
        : 0;

    return {
      systems: {
        total: systems.length,
        ...statusCounts,
        avgHealthScore,
        list: systems,
      },
      alerts: { active: activeAlerts, critical: criticalAlerts },
      approvals: { pending: pendingApprovals },
      connectors: {
        total: connectors.length,
        connected: connectors.filter((c) => c.status === 'connected').length,
        disconnected: connectors.filter((c) => c.status === 'disconnected')
          .length,
      },
      recentEvents,
    };
  }
}
