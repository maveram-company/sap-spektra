import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Default thresholds for SAP system metrics */
const DEFAULT_THRESHOLDS: Record<
  string,
  { warning: number; critical: number }
> = {
  cpu: { warning: 80, critical: 95 },
  memory: { warning: 85, critical: 95 },
  disk: { warning: 80, critical: 90 },
};

interface MetricPayload {
  hostId: string;
  cpu: number;
  memory: number;
  disk: number;
  iops?: number;
  networkIn?: number;
  networkOut?: number;
}

@Injectable()
export class MetricsPipelineService {
  private readonly logger = new Logger(MetricsPipelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ingests a metric data point from a host agent.
   * Pipeline: store metric → update host → evaluate thresholds → breaches → alerts → health snapshot.
   */
  async ingest(
    payload: MetricPayload,
    orgId: string,
  ): Promise<{ breaches: number; alerts: number }> {
    const host = await this.prisma.host.findUnique({
      where: { id: payload.hostId },
      include: {
        system: { select: { id: true, sid: true, organizationId: true } },
      },
    });
    if (!host) {
      this.logger.warn(`Ignoring metric for unknown host ${payload.hostId}`);
      return { breaches: 0, alerts: 0 };
    }

    if (host.system.organizationId !== orgId) {
      throw new ForbiddenException('Host does not belong to your organization');
    }

    const now = new Date();

    // 1. Store metric data point
    await this.prisma.hostMetric.create({
      data: {
        hostId: payload.hostId,
        cpu: payload.cpu,
        memory: payload.memory,
        disk: payload.disk,
        iops: payload.iops ?? null,
        networkIn: payload.networkIn ?? null,
        networkOut: payload.networkOut ?? null,
        timestamp: now,
      },
    });

    // 2. Update host current values
    await this.prisma.host.update({
      where: { id: payload.hostId },
      data: { cpu: payload.cpu, memory: payload.memory, disk: payload.disk },
    });

    // 3. Evaluate thresholds → create breaches + alerts
    const breachResults = await this.evaluateThresholds(
      host.system.id,
      host.system.organizationId,
      host.system.sid,
      payload,
      now,
    );

    // 4. Update health snapshot
    await this.updateHealthSnapshot(host.system.id, host.system.organizationId);

    return breachResults;
  }

  /**
   * Evaluates metric values against thresholds.
   * Creates Breach records and corresponding Alerts for violations.
   */
  private async evaluateThresholds(
    systemId: string,
    organizationId: string,
    sid: string,
    payload: MetricPayload,
    timestamp: Date,
  ): Promise<{ breaches: number; alerts: number }> {
    let breachCount = 0;
    let alertCount = 0;

    const metrics: [string, number][] = [
      ['cpu', payload.cpu],
      ['memory', payload.memory],
      ['disk', payload.disk],
    ];

    for (const [metric, value] of metrics) {
      const thresholds = DEFAULT_THRESHOLDS[metric];
      if (!thresholds) continue;

      let severity: string | null = null;
      if (value >= thresholds.critical) {
        severity = 'CRITICAL';
      } else if (value >= thresholds.warning) {
        severity = 'HIGH';
      }

      if (!severity) continue;

      // Check for existing unresolved breach for same metric/system to avoid duplicates
      const existingBreach = await this.prisma.breach.findFirst({
        where: { systemId, metric, resolved: false },
        orderBy: { timestamp: 'desc' },
      });

      // If there's a recent unresolved breach (< 5 min), update value instead of creating new
      const fiveMinAgo = new Date(timestamp.getTime() - 5 * 60 * 1000);
      if (existingBreach && existingBreach.timestamp > fiveMinAgo) {
        continue; // Skip duplicate breach
      }

      // Create breach
      await this.prisma.breach.create({
        data: {
          systemId,
          metric,
          value,
          threshold:
            severity === 'CRITICAL' ? thresholds.critical : thresholds.warning,
          severity,
          timestamp,
        },
      });
      breachCount++;

      // Create corresponding alert
      const level = severity === 'CRITICAL' ? 'critical' : 'warning';
      await this.prisma.alert.create({
        data: {
          organizationId,
          systemId,
          title: `${metric.toUpperCase()} ${severity} en ${sid}`,
          message: `${metric} en ${value.toFixed(1)}% (umbral: ${severity === 'CRITICAL' ? thresholds.critical : thresholds.warning}%)`,
          level,
          status: 'active',
          escalation: severity === 'CRITICAL' ? 'L2' : 'L1',
        },
      });
      alertCount++;

      this.logger.warn(
        `Breach: ${sid} ${metric}=${value.toFixed(1)}% (${severity}) → alert created`,
      );
    }

    // Auto-resolve breaches when metric drops below warning
    await this.autoResolveBreaches(systemId, payload, timestamp);

    return { breaches: breachCount, alerts: alertCount };
  }

  /**
   * Automatically resolves breaches when metrics drop below warning thresholds.
   */
  private async autoResolveBreaches(
    systemId: string,
    payload: MetricPayload,
    now: Date,
  ): Promise<void> {
    const metrics: [string, number][] = [
      ['cpu', payload.cpu],
      ['memory', payload.memory],
      ['disk', payload.disk],
    ];

    for (const [metric, value] of metrics) {
      const thresholds = DEFAULT_THRESHOLDS[metric];
      if (!thresholds || value >= thresholds.warning) continue;

      // Resolve any open breaches for this metric
      const openBreaches = await this.prisma.breach.findMany({
        where: { systemId, metric, resolved: false },
      });

      for (const breach of openBreaches) {
        await this.prisma.breach.update({
          where: { id: breach.id },
          data: { resolved: true, resolvedAt: now },
        });
      }
    }
  }

  /**
   * Computes and stores a health snapshot for a system.
   * Score: 100 - penalties for each host's CPU/mem/disk.
   */
  async updateHealthSnapshot(
    systemId: string,
    _organizationId?: string,
  ): Promise<void> {
    const recent = await this.prisma.healthSnapshot.findFirst({
      where: { systemId },
      orderBy: { timestamp: 'desc' },
    });
    if (recent && Date.now() - recent.timestamp.getTime() < 60_000) return;

    const hosts = await this.prisma.host.findMany({
      where: { systemId },
    });

    if (hosts.length === 0) return;

    const avgCpu = hosts.reduce((s, h) => s + h.cpu, 0) / hosts.length;
    const avgMem = hosts.reduce((s, h) => s + h.memory, 0) / hosts.length;
    const avgDisk = hosts.reduce((s, h) => s + h.disk, 0) / hosts.length;

    // Score: start at 100, deduct for high usage
    let score = 100;
    if (avgCpu > 95) score -= 30;
    else if (avgCpu > 80) score -= 15;
    else if (avgCpu > 60) score -= 5;

    if (avgMem > 95) score -= 30;
    else if (avgMem > 85) score -= 15;
    else if (avgMem > 70) score -= 5;

    if (avgDisk > 90) score -= 25;
    else if (avgDisk > 80) score -= 10;
    else if (avgDisk > 70) score -= 5;

    score = Math.max(0, Math.min(100, score));

    const status =
      score >= 80
        ? 'HEALTHY'
        : score >= 60
          ? 'WARNING'
          : score >= 30
            ? 'DEGRADED'
            : 'CRITICAL';

    await this.prisma.healthSnapshot.create({
      data: {
        systemId,
        score,
        status,
        cpu: avgCpu,
        memory: avgMem,
        disk: avgDisk,
        details: { hosts: hosts.length, avgCpu, avgMem, avgDisk },
        timestamp: new Date(),
      },
    });
  }
}
