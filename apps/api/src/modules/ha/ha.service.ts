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

  async getPrereqs(organizationId: string, systemId: string) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
      include: { haConfig: true },
    });
    if (!system) throw new NotFoundException('System not found');

    const config = system.haConfig;

    return {
      systemId,
      sid: system.sid,
      dbType: system.dbType,
      haEnabled: config?.haEnabled ?? false,
      prerequisites: [
        { key: 'db_replication', label: 'Database Replication Configured', met: !!config?.haEnabled },
        { key: 'secondary_node', label: 'Secondary Node Available', met: !!config?.secondaryNode },
        { key: 'network_redundancy', label: 'Network Redundancy', met: true },
        { key: 'storage_replication', label: 'Storage Replication', met: !!config?.haEnabled },
        { key: 'monitoring_agent', label: 'Monitoring Agent Active', met: system.supportsHostMetrics },
        { key: 'backup_verified', label: 'Recent Backup Verified', met: true },
      ],
      readiness: config?.haEnabled && config?.secondaryNode ? 'ready' : 'not_ready',
    };
  }

  async getOpsHistory(organizationId: string, systemId: string) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
      include: { haConfig: true },
    });
    if (!system) throw new NotFoundException('System not found');

    const operations = await this.prisma.operationRecord.findMany({
      where: {
        systemId,
        organizationId,
        type: { in: ['DR_DRILL', 'MAINTENANCE', 'RESTART'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const entries: Array<{
      id: string;
      type: string;
      status: string;
      date: Date;
      requestedBy: string;
      description: string;
    }> = operations.map((op) => ({
      id: op.id,
      type: op.type,
      status: op.status,
      date: op.completedAt ?? op.createdAt,
      requestedBy: op.requestedBy,
      description: op.description,
    }));

    if (system.haConfig?.lastFailoverAt) {
      entries.push({
        id: `failover-${systemId}`,
        type: 'FAILOVER',
        status: 'COMPLETED',
        date: system.haConfig.lastFailoverAt,
        requestedBy: 'system',
        description: 'HA failover event',
      });
    }

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());

    return entries.slice(0, 50);
  }

  async getDrivers(organizationId: string, systemId: string) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
      include: { haConfig: true },
    });
    if (!system) throw new NotFoundException('System not found');

    const config = system.haConfig;

    const driverMap: Record<string, Array<{ name: string; type: string; supported: boolean; active: boolean }>> = {
      'SAP HANA 2.0': [
        { name: 'HANA System Replication', type: 'database', supported: true, active: config?.haStrategy === 'HOT_STANDBY' },
        { name: 'HANA Storage Replication', type: 'storage', supported: true, active: false },
        { name: 'Pacemaker/Corosync', type: 'cluster', supported: true, active: config?.haEnabled ?? false },
      ],
      'Oracle 19c': [
        { name: 'Oracle Data Guard', type: 'database', supported: true, active: config?.haStrategy === 'HOT_STANDBY' },
        { name: 'Oracle ASM Mirroring', type: 'storage', supported: true, active: false },
        { name: 'Pacemaker/Corosync', type: 'cluster', supported: true, active: config?.haEnabled ?? false },
      ],
      'IBM Db2 11.5': [
        { name: 'Db2 HADR', type: 'database', supported: true, active: config?.haStrategy === 'HOT_STANDBY' },
        { name: 'Db2 Log Shipping', type: 'storage', supported: true, active: false },
        { name: 'Pacemaker/Corosync', type: 'cluster', supported: true, active: config?.haEnabled ?? false },
      ],
    };

    const defaultDrivers = [
      { name: 'Database Replication', type: 'database', supported: true, active: config?.haStrategy === 'HOT_STANDBY' },
      { name: 'Storage Replication', type: 'storage', supported: true, active: false },
      { name: 'Pacemaker/Corosync', type: 'cluster', supported: true, active: config?.haEnabled ?? false },
    ];

    return {
      systemId,
      sid: system.sid,
      dbType: system.dbType,
      drivers: driverMap[system.dbType] ?? defaultDrivers,
    };
  }
}
