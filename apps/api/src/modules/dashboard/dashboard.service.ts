import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getSummary(organizationId: string) {
    const cacheKey = `dashboard:${organizationId}`;

    // Try to return cached result
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        return cached;
      }
    } catch (error) {
      this.logger.warn(
        `Cache GET failed for ${cacheKey}: ${(error as Error).message}`,
      );
    }

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

    const result = {
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

    // Store in cache (30s TTL)
    try {
      await this.cache.set(cacheKey, result, 30000);
      this.logger.debug(`Cache SET for ${cacheKey}`);
    } catch (error) {
      this.logger.warn(
        `Cache SET failed for ${cacheKey}: ${(error as Error).message}`,
      );
    }

    return result;
  }
}
