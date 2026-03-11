import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(organizationId: string) {
    const [
      systemCount,
      alertsByLevel,
      operationsByStatus,
      recentBreaches,
      healthTrend,
    ] = await Promise.all([
      this.prisma.system.count({ where: { organizationId } }),
      this.prisma.alert.groupBy({
        by: ['level'],
        where: { organizationId },
        _count: true,
      }),
      this.prisma.operationRecord.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      this.prisma.breach.findMany({
        where: { system: { organizationId }, resolved: false },
        include: { system: { select: { sid: true } } },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      this.prisma.healthSnapshot.findMany({
        where: { system: { organizationId } },
        orderBy: { timestamp: 'desc' },
        take: 50,
        include: { system: { select: { sid: true } } },
      }),
    ]);

    return {
      systemCount,
      alertsByLevel: Object.fromEntries(alertsByLevel.map(a => [a.level, a._count])),
      operationsByStatus: Object.fromEntries(operationsByStatus.map(o => [o.status, o._count])),
      recentBreaches,
      healthTrend,
    };
  }

  async getRunbookAnalytics(organizationId: string) {
    const executions = await this.prisma.runbookExecution.findMany({
      where: { runbook: { organizationId } },
      include: { runbook: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    });

    const byResult = { SUCCESS: 0, FAILED: 0, PENDING: 0, RUNNING: 0 };
    const byRunbook: Record<string, { total: number; success: number; failed: number }> = {};

    for (const exec of executions) {
      byResult[exec.result as keyof typeof byResult] = (byResult[exec.result as keyof typeof byResult] || 0) + 1;
      const name = exec.runbook.name;
      if (!byRunbook[name]) byRunbook[name] = { total: 0, success: 0, failed: 0 };
      byRunbook[name].total++;
      if (exec.result === 'SUCCESS') byRunbook[name].success++;
      if (exec.result === 'FAILED') byRunbook[name].failed++;
    }

    return { totalExecutions: executions.length, byResult, byRunbook };
  }

  async getSystemTrends(organizationId: string, systemId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 86400000);

    const [snapshots, breaches, alerts] = await Promise.all([
      this.prisma.healthSnapshot.findMany({
        where: { systemId, system: { organizationId }, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.breach.findMany({
        where: { systemId, system: { organizationId }, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.alert.findMany({
        where: { systemId, organizationId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { snapshots, breaches, alerts };
  }
}
