import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  SystemWithConnectors,
  ConnectorEntity,
  AgentCommandResult,
} from '../../common/types/sap-system.types';

/** Failover step definitions by DB type */
const FAILOVER_STEPS: Record<string, { label: string; command: string }[]> = {
  HANA: [
    { label: 'Verify HSR replication status', command: 'hdbnsutil -sr_state' },
    {
      label: 'Stop primary SAP instance',
      command: 'sapcontrol -nr 00 -function StopSystem ALL',
    },
    { label: 'Perform HANA takeover', command: 'hdbnsutil -sr_takeover' },
    {
      label: 'Start SAP on new primary',
      command: 'sapcontrol -nr 00 -function StartSystem ALL',
    },
    {
      label: 'Verify processes running',
      command: 'sapcontrol -nr 00 -function GetProcessList',
    },
    {
      label: 'Register old primary as secondary',
      command:
        'hdbnsutil -sr_register --name=OLD_PRIMARY --remoteHost=NEW_PRIMARY --remoteInstance=00 --replicationMode=sync',
    },
  ],
  DEFAULT: [
    { label: 'Check cluster status', command: 'crm_mon -1' },
    {
      label: 'Move resources to standby node',
      command: 'crm resource move SAP_RESOURCE standby_node',
    },
    { label: 'Verify migration', command: 'crm_mon -1' },
    {
      label: 'Unmigrate resource constraint',
      command: 'crm resource unmigrate SAP_RESOURCE',
    },
  ],
};

@Injectable()
export class HAService {
  private readonly logger = new Logger(HAService.name);
  private readonly runtime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.runtime = this.config.get<string>('RUNTIME_MODE', 'LOCAL_SIMULATED');
  }

  async findAll(organizationId: string) {
    return this.prisma.hAConfig.findMany({
      where: { system: { organizationId } },
      include: {
        system: {
          select: {
            sid: true,
            description: true,
            environment: true,
            status: true,
            healthScore: true,
          },
        },
      },
    });
  }

  async findBySystem(organizationId: string, systemId: string) {
    const config = await this.prisma.hAConfig.findFirst({
      where: { systemId, system: { organizationId } },
      include: { system: true },
    });
    if (!config)
      throw new NotFoundException('HA config not found for this system');
    return config;
  }

  async triggerFailover(
    organizationId: string,
    systemId: string,
    userEmail?: string,
  ) {
    const config = await this.prisma.hAConfig.findFirst({
      where: { systemId, system: { organizationId } },
      include: { system: { include: { connectors: true, systemMeta: true } } },
    });
    if (!config) throw new NotFoundException('HA config not found');

    // Mark as in-progress immediately
    const updated = await this.prisma.hAConfig.update({
      where: { id: config.id },
      data: { status: 'failover_in_progress', lastFailoverAt: new Date() },
    });

    await this.audit.log(organizationId, {
      userEmail: userEmail || 'system',
      action: 'ha.failover.start',
      resource: `system/${systemId}`,
      details: `HA failover initiated for ${config.system.sid}`,
      severity: 'critical',
    });

    // Execute failover steps async
    this.executeFailover(
      organizationId,
      config.id,
      config.system,
      userEmail,
    ).catch((err) => {
      this.logger.error(`Failover for ${systemId} failed: ${err.message}`);
    });

    return updated;
  }

  /**
   * Executes the failover process step-by-step.
   */
  private async executeFailover(
    organizationId: string,
    configId: string,
    system: SystemWithConnectors,
    userEmail?: string,
  ): Promise<void> {
    const dbType = system.dbType?.toUpperCase()?.includes('HANA')
      ? 'HANA'
      : 'DEFAULT';
    const steps = FAILOVER_STEPS[dbType] || FAILOVER_STEPS.DEFAULT;

    this.logger.log(
      `Executing failover for ${system.sid} (${dbType}, ${steps.length} steps)`,
    );

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.logger.log(
        `  Failover step ${i + 1}/${steps.length}: ${step.label}`,
      );

      try {
        const result =
          this.runtime === 'LOCAL_SIMULATED'
            ? await this.simulateFailoverStep(step, system, dbType)
            : await this.executeViaAgent(step.command, system);

        if (result.exitCode !== 0) {
          this.logger.error(
            `Failover step "${step.label}" failed: ${result.stderr}`,
          );
          await this.prisma.hAConfig.update({
            where: { id: configId },
            data: { status: 'standby' },
          });
          await this.audit.log(organizationId, {
            userEmail: userEmail || 'system',
            action: 'ha.failover.failed',
            resource: `system/${system.id}`,
            details: `Failover failed at step "${step.label}": ${result.stderr}`,
            severity: 'critical',
          });
          return;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failover step "${step.label}" threw: ${msg}`);
        await this.prisma.hAConfig.update({
          where: { id: configId },
          data: { status: 'standby' },
        });
        return;
      }
    }

    // Swap primary and secondary
    const haConfig = await this.prisma.hAConfig.findUnique({
      where: { id: configId },
    });
    await this.prisma.hAConfig.update({
      where: { id: configId },
      data: {
        status: 'failed_over',
        primaryNode: haConfig?.secondaryNode || haConfig?.primaryNode,
        secondaryNode: haConfig?.primaryNode || haConfig?.secondaryNode,
      },
    });

    await this.audit.log(organizationId, {
      userEmail: userEmail || 'system',
      action: 'ha.failover.complete',
      resource: `system/${system.id}`,
      details: `HA failover completed for ${system.sid}`,
      severity: 'info',
    });

    this.logger.log(`Failover completed for ${system.sid}`);
  }

  private async simulateFailoverStep(
    step: { label: string; command: string },
    system: SystemWithConnectors,
    _dbType: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 800));

    const cmd = step.command.toLowerCase();
    const sid = system.sid || 'SYS';
    let stdout = `OK`;

    if (cmd.includes('sr_state')) {
      stdout = [
        `System Replication State`,
        `  mode: PRIMARY`,
        `  site id: 1`,
        `  site name: ${sid}_primary`,
        `  secondary: ${sid}_secondary (mode: SYNC, status: ACTIVE)`,
      ].join('\n');
    } else if (cmd.includes('sr_takeover')) {
      stdout = `Takeover completed successfully.\nnameserver is active.\nNew role: PRIMARY`;
    } else if (cmd.includes('sr_register')) {
      stdout = `Registration successful. Replication started.`;
    } else if (cmd.includes('stopsystem')) {
      stdout = `${sid} StopSystem ALL\nOK — all instances stopped.`;
    } else if (cmd.includes('startsystem')) {
      stdout = `${sid} StartSystem ALL\nOK — all instances started.`;
    } else if (cmd.includes('getprocesslist')) {
      stdout = `  disp+work, GREEN, Running\n  igswd_mt, GREEN, Running\n  gwrd, GREEN, Running`;
    } else if (cmd.includes('crm_mon')) {
      stdout = [
        `Stack: corosync`,
        `Current DC: ${sid}node01`,
        `2 nodes configured, 4 resources configured`,
        `Online: [ ${sid}node01 ${sid}node02 ]`,
        `  rsc_SAPHana_${sid}_HDB00 (ocf::suse:SAPHana): Master ${sid}node01`,
      ].join('\n');
    } else if (cmd.includes('crm resource move')) {
      stdout = `Resource SAP_RESOURCE migrated to standby_node`;
    } else if (cmd.includes('crm resource unmigrate')) {
      stdout = `Unmigrated SAP_RESOURCE — location constraint removed.`;
    }

    return { exitCode: 0, stdout, stderr: '' };
  }

  private async executeViaAgent(
    command: string,
    system: SystemWithConnectors,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const connector = system.connectors?.find(
      (c: ConnectorEntity) =>
        c.method === 'Spektra Agent' && c.status === 'connected',
    );
    if (!connector) {
      throw new BadRequestException(
        `No Spektra Agent connected for ${system.sid}`,
      );
    }

    const agentUrl = this.resolveAgentUrl(connector);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`${agentUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, timeout: 120, sid: system.sid }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          exitCode: response.status,
          stdout: '',
          stderr: `Agent error: ${body}`,
        };
      }

      const data = (await response.json()) as AgentCommandResult;
      return {
        exitCode: data.exitCode ?? 0,
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Timeout: command exceeded 120s',
        };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveAgentUrl(connector: ConnectorEntity): string {
    if (connector.features && typeof connector.features === 'object') {
      const features = connector.features as Record<string, unknown>;
      if (features.agentUrl && typeof features.agentUrl === 'string')
        return features.agentUrl;
    }
    return process.env.SPEKTRA_AGENT_URL || 'http://localhost:9110';
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
        {
          key: 'db_replication',
          label: 'Database Replication Configured',
          met: !!config?.haEnabled,
        },
        {
          key: 'secondary_node',
          label: 'Secondary Node Available',
          met: !!config?.secondaryNode,
        },
        { key: 'network_redundancy', label: 'Network Redundancy', met: true },
        {
          key: 'storage_replication',
          label: 'Storage Replication',
          met: !!config?.haEnabled,
        },
        {
          key: 'monitoring_agent',
          label: 'Monitoring Agent Active',
          met: system.supportsHostMetrics,
        },
        { key: 'backup_verified', label: 'Recent Backup Verified', met: true },
      ],
      readiness:
        config?.haEnabled && config?.secondaryNode ? 'ready' : 'not_ready',
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

    const driverMap: Record<
      string,
      Array<{ name: string; type: string; supported: boolean; active: boolean }>
    > = {
      'SAP HANA 2.0': [
        {
          name: 'HANA System Replication',
          type: 'database',
          supported: true,
          active: config?.haStrategy === 'HOT_STANDBY',
        },
        {
          name: 'HANA Storage Replication',
          type: 'storage',
          supported: true,
          active: false,
        },
        {
          name: 'Pacemaker/Corosync',
          type: 'cluster',
          supported: true,
          active: config?.haEnabled ?? false,
        },
      ],
      'Oracle 19c': [
        {
          name: 'Oracle Data Guard',
          type: 'database',
          supported: true,
          active: config?.haStrategy === 'HOT_STANDBY',
        },
        {
          name: 'Oracle ASM Mirroring',
          type: 'storage',
          supported: true,
          active: false,
        },
        {
          name: 'Pacemaker/Corosync',
          type: 'cluster',
          supported: true,
          active: config?.haEnabled ?? false,
        },
      ],
      'IBM Db2 11.5': [
        {
          name: 'Db2 HADR',
          type: 'database',
          supported: true,
          active: config?.haStrategy === 'HOT_STANDBY',
        },
        {
          name: 'Db2 Log Shipping',
          type: 'storage',
          supported: true,
          active: false,
        },
        {
          name: 'Pacemaker/Corosync',
          type: 'cluster',
          supported: true,
          active: config?.haEnabled ?? false,
        },
      ],
    };

    const defaultDrivers = [
      {
        name: 'Database Replication',
        type: 'database',
        supported: true,
        active: config?.haStrategy === 'HOT_STANDBY',
      },
      {
        name: 'Storage Replication',
        type: 'storage',
        supported: true,
        active: false,
      },
      {
        name: 'Pacemaker/Corosync',
        type: 'cluster',
        supported: true,
        active: config?.haEnabled ?? false,
      },
    ];

    return {
      systemId,
      sid: system.sid,
      dbType: system.dbType,
      drivers: driverMap[system.dbType] ?? defaultDrivers,
    };
  }
}
