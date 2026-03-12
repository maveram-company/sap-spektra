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
      alertsByLevel: Object.fromEntries(
        alertsByLevel.map((a) => [a.level, a._count]),
      ),
      operationsByStatus: Object.fromEntries(
        operationsByStatus.map((o) => [o.status, o._count]),
      ),
      recentBreaches,
      healthTrend,
    };
  }

  async getRunbookAnalytics(organizationId: string) {
    // Use groupBy to aggregate at the DB level instead of loading all rows
    const [byResultRows, byRunbookRows] = await Promise.all([
      this.prisma.runbookExecution.groupBy({
        by: ['result'],
        _count: true,
        where: { runbook: { organizationId } },
      }),
      this.prisma.runbookExecution.groupBy({
        by: ['runbookId', 'result'],
        _count: true,
        where: { runbook: { organizationId } },
      }),
    ]);

    // Build byResult map
    const byResult = { SUCCESS: 0, FAILED: 0, PENDING: 0, RUNNING: 0 };
    let totalExecutions = 0;
    for (const row of byResultRows) {
      byResult[row.result as keyof typeof byResult] = row._count;
      totalExecutions += row._count;
    }

    // Collect unique runbook IDs and fetch their names in a single query
    const runbookIds = [...new Set(byRunbookRows.map((r) => r.runbookId))];
    const runbooks = runbookIds.length
      ? await this.prisma.runbook.findMany({
          where: { id: { in: runbookIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(runbooks.map((r) => [r.id, r.name]));

    // Build byRunbook map
    const byRunbook: Record<
      string,
      { total: number; success: number; failed: number }
    > = {};
    for (const row of byRunbookRows) {
      const name = nameMap[row.runbookId] || row.runbookId;
      if (!byRunbook[name])
        byRunbook[name] = { total: 0, success: 0, failed: 0 };
      byRunbook[name].total += row._count;
      if (row.result === 'SUCCESS') byRunbook[name].success += row._count;
      if (row.result === 'FAILED') byRunbook[name].failed += row._count;
    }

    return { totalExecutions, byResult, byRunbook };
  }

  async getSystemTrends(
    organizationId: string,
    systemId: string,
    days: number = 7,
  ) {
    const since = new Date(Date.now() - days * 86400000);

    const [snapshots, breaches, alerts] = await Promise.all([
      this.prisma.healthSnapshot.findMany({
        where: {
          systemId,
          system: { organizationId },
          timestamp: { gte: since },
        },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.breach.findMany({
        where: {
          systemId,
          system: { organizationId },
          timestamp: { gte: since },
        },
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
