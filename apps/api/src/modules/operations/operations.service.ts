import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  SystemWithConnectors,
  ConnectorEntity,
  AgentCommandResult,
} from '../../common/types/sap-system.types';

/** SAP operation commands by type */
const OPERATION_COMMANDS: Record<string, { label: string; command: string }[]> =
  {
    BACKUP: [
      {
        label: 'Stop application layer',
        command: 'sapcontrol -nr 00 -function StopSystem ALL',
      },
      {
        label: 'Create HANA backup',
        command:
          'hdbsql -U SYSTEM "BACKUP DATA USING FILE (\'COMPLETE_DATA_BACKUP\')"',
      },
      {
        label: 'Verify backup integrity',
        command:
          'hdbsql -U SYSTEM "SELECT * FROM M_BACKUP_CATALOG ORDER BY UTC_END_TIME DESC LIMIT 1"',
      },
      {
        label: 'Start application layer',
        command: 'sapcontrol -nr 00 -function StartSystem ALL',
      },
    ],
    RESTART: [
      {
        label: 'Check running processes',
        command: 'sapcontrol -nr 00 -function GetProcessList',
      },
      {
        label: 'Stop SAP system',
        command: 'sapcontrol -nr 00 -function StopSystem ALL',
      },
      {
        label: 'Wait for stop',
        command: 'sapcontrol -nr 00 -function WaitforStopped 300 2',
      },
      {
        label: 'Start SAP system',
        command: 'sapcontrol -nr 00 -function StartSystem ALL',
      },
      {
        label: 'Wait for start',
        command: 'sapcontrol -nr 00 -function WaitforStarted 300 2',
      },
      {
        label: 'Verify processes',
        command: 'sapcontrol -nr 00 -function GetProcessList',
      },
    ],
    MAINTENANCE: [
      {
        label: 'Set maintenance mode',
        command:
          'sapcontrol -nr 00 -function SetProcessParameter name=maintenance value=true',
      },
      {
        label: 'Deregister from load balancer',
        command: 'sapcontrol -nr 00 -function ABAPSoftShutdown 120',
      },
      {
        label: 'Execute maintenance task',
        command: 'sapcontrol -nr 00 -function GetProcessList',
      },
      {
        label: 'Clear maintenance mode',
        command:
          'sapcontrol -nr 00 -function SetProcessParameter name=maintenance value=false',
      },
    ],
    DR_DRILL: [
      {
        label: 'Verify DR prerequisites',
        command: 'sapcontrol -nr 00 -function HAGetFailoverConfig',
      },
      {
        label: 'Check replication status',
        command: 'hdbsql -U SYSTEM "SELECT * FROM M_SERVICE_REPLICATION"',
      },
      {
        label: 'Simulate failover (dry-run)',
        command: 'sapcontrol -nr 00 -function HACheckFailoverConfig',
      },
      {
        label: 'Verify DR readiness',
        command: 'sapcontrol -nr 00 -function GetProcessList',
      },
    ],
    HOUSEKEEPING: [
      {
        label: 'Clean old logs',
        command:
          'find /usr/sap/SID/DVEBMGS00/work -name "*.old" -mtime +30 -delete',
      },
      {
        label: 'Archive trace files',
        command:
          'tar czf /tmp/traces_$(date +%Y%m%d).tar.gz /usr/sap/SID/DVEBMGS00/work/dev_*',
      },
      {
        label: 'Check disk space',
        command: 'df -h /usr/sap /hana/data /hana/log',
      },
      {
        label: 'Clean temp tables',
        command:
          'hdbsql -U SYSTEM "CALL SYS.MANAGEMENT_CONSOLE_PROC(\'CLEANUP\', NULL, NULL)"',
      },
    ],
  };

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);
  private readonly runtime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.runtime = this.config.get<string>('RUNTIME_MODE', 'LOCAL_SIMULATED');
  }

  async findAll(
    organizationId: string,
    filters?: { status?: string; type?: string; systemId?: string },
  ) {
    return this.prisma.operationRecord.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.type && { type: filters.type }),
        ...(filters?.systemId && { systemId: filters.systemId }),
      },
      include: { system: { select: { sid: true, description: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    organizationId: string,
    data: {
      systemId: string;
      type: string;
      description: string;
      requestedBy: string;
      riskLevel?: string;
      scheduledTime?: Date;
      schedule?: string;
    },
  ) {
    const op = await this.prisma.operationRecord.create({
      data: {
        organizationId,
        ...data,
        status: 'SCHEDULED',
        riskLevel: data.riskLevel || 'LOW',
      },
    });

    await this.audit.log(organizationId, {
      userEmail: data.requestedBy,
      action: 'operation.create',
      resource: `operation/${op.id}`,
      details: `Scheduled ${data.type} operation on system ${data.systemId}`,
    });

    return op;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: string,
    userEmail?: string,
  ) {
    const op = await this.prisma.operationRecord.findFirst({
      where: { id, organizationId },
      include: { system: { select: { sid: true } } },
    });
    if (!op) throw new NotFoundException('Operation not found');

    const updated = await this.prisma.operationRecord.update({
      where: { id },
      data: {
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
        ...(status === 'FAILED' && { completedAt: new Date() }),
      },
    });

    // When status changes to RUNNING, execute the operation
    if (status === 'RUNNING') {
      this.executeOperation(organizationId, op).catch((err) => {
        this.logger.error(`Operation ${id} execution failed: ${err.message}`);
      });
    }

    await this.audit.log(organizationId, {
      userEmail: userEmail || op.requestedBy,
      action: `operation.${status.toLowerCase()}`,
      resource: `operation/${id}`,
      details: `Operation ${op.type} status → ${status} (system: ${(op as any).system?.sid || op.systemId})`,
      severity: status === 'FAILED' ? 'warning' : 'info',
    });

    return updated;
  }

  /**
   * Executes an operation end-to-end:
   * - Resolves command sequence from operation type
   * - In LOCAL_SIMULATED: generates realistic output
   * - In AWS_REAL: sends commands to agent via HTTP
   */
  private async executeOperation(
    organizationId: string,
    op: { id: string; type: string; systemId: string; requestedBy: string },
  ): Promise<void> {
    const system = await this.prisma.system.findUnique({
      where: { id: op.systemId },
      include: { connectors: true, systemMeta: true },
    });
    if (!system) {
      await this.failOperation(op.id, 'Sistema no encontrado');
      return;
    }

    const commands = OPERATION_COMMANDS[op.type] || [
      {
        label: 'Execute operation',
        command: `echo "Executing ${op.type} on ${system.sid}"`,
      },
    ];

    this.logger.log(
      `Executing operation ${op.id}: ${op.type} on ${system.sid} (${commands.length} steps, mode=${this.runtime})`,
    );

    const startTime = Date.now();

    for (let i = 0; i < commands.length; i++) {
      const step = commands[i];
      const command = step.command.replaceAll('SID', system.sid);

      this.logger.log(`  Step ${i + 1}/${commands.length}: ${step.label}`);

      try {
        const result =
          this.runtime === 'LOCAL_SIMULATED'
            ? await this.simulateCommand(command, system)
            : await this.executeViaAgent(command, system);

        if (result.exitCode !== 0) {
          const errorMsg = `Step "${step.label}" failed (exit ${result.exitCode}): ${result.stderr}`;
          this.logger.warn(errorMsg);
          await this.failOperation(op.id, errorMsg);
          return;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Step "${step.label}" threw: ${errorMsg}`);
        await this.failOperation(op.id, errorMsg);
        return;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    await this.prisma.operationRecord.update({
      where: { id: op.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    this.logger.log(`Operation ${op.id} completed in ${duration}s`);
  }

  private async failOperation(id: string, error: string): Promise<void> {
    await this.prisma.operationRecord.update({
      where: { id },
      data: { status: 'FAILED', error, completedAt: new Date() },
    });
  }

  private async simulateCommand(
    command: string,
    system: SystemWithConnectors,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Realistic latency
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 800));

    const sid = system.sid || 'SYS';
    const cmd = command.toLowerCase();

    let stdout = `Executed on ${sid}: OK`;

    if (cmd.includes('getprocesslist')) {
      stdout = [
        `  name, dispstatus, textstatus, pid`,
        `  disp+work, GREEN, Running, 12345`,
        `  igswd_mt, GREEN, Running, 12346`,
        `  gwrd, GREEN, Running, 12347`,
        `  icman, GREEN, Running, 12348`,
      ].join('\n');
    } else if (cmd.includes('stopsystem')) {
      stdout = `${sid} StopSystem ALL\nOK — all instances stopped.`;
    } else if (cmd.includes('startsystem')) {
      stdout = `${sid} StartSystem ALL\nOK — all instances started.`;
    } else if (cmd.includes('waitfor')) {
      stdout = `OK — system reached expected state.`;
    } else if (cmd.includes('backup data')) {
      stdout = `BACKUP DATA successfully completed. Backup ID: 1710345678`;
    } else if (cmd.includes('backup_catalog')) {
      stdout = `ENTRY_ID,BACKUP_TYPE,UTC_END_TIME,STATE_NAME\n1710345678,complete data,2026-03-13 14:30:00,successful`;
    } else if (cmd.includes('df -h')) {
      stdout = [
        `Filesystem      Size  Used Avail Use% Mounted on`,
        `/dev/sda1        50G   28G   22G  56% /`,
        `/dev/sdb1       200G  142G   58G  71% /usr/sap`,
        `/dev/sdc1       500G  320G  180G  64% /hana/data`,
      ].join('\n');
    } else if (cmd.includes('hdb stop')) {
      stdout = `hdbdaemon is stopped.`;
    } else if (cmd.includes('hdb start')) {
      stdout = `hdbdaemon is running.\nhdbindexserver is running.`;
    } else if (cmd.includes('replication')) {
      stdout = `HOST,PORT,REPLICATION_MODE,REPLICATION_STATUS\n${sid}db,30015,PRIMARY,ACTIVE`;
    } else if (cmd.includes('failoverconfig')) {
      stdout = `HAActive: TRUE\nHANodes: ${sid}db01, ${sid}db02\nHAMode: sync`;
    } else if (cmd.includes('softshutdown')) {
      stdout = `Soft shutdown initiated. Waiting for active users...`;
    } else if (cmd.includes('setprocessparameter')) {
      stdout = `Parameter set successfully.`;
    } else if (cmd.includes('find') && cmd.includes('delete')) {
      stdout = `Removed 47 old log files.`;
    } else if (cmd.includes('tar czf')) {
      stdout = `Archive created successfully.`;
    } else if (cmd.includes('cleanup')) {
      stdout = `Housekeeping completed. 128 temp entries removed.`;
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
      throw new Error(`No Spektra Agent connected for system ${system.sid}`);
    }

    const agentUrl = this.resolveAgentUrl(connector);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.OPERATION_TIMEOUT_MS) || 120_000,
    );

    try {
      const response = await fetch(`${agentUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          timeout: Number(process.env.OPERATION_TIMEOUT_S) || 120,
          sid: system.sid,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          exitCode: response.status,
          stdout: '',
          stderr: `Agent error ${response.status}: ${body}`,
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
      if (features.agentUrl && typeof features.agentUrl === 'string') {
        return features.agentUrl;
      }
    }
    return this.config.get<string>('spektraAgentUrl', 'http://localhost:9110');
  }

  async getJobs(organizationId: string, systemId?: string) {
    if (systemId) {
      const system = await this.prisma.system.findFirst({
        where: { id: systemId, organizationId },
      });
      if (!system) throw new NotFoundException('System not found');
    }
    return this.prisma.jobRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getTransports(organizationId: string, systemId?: string) {
    if (systemId) {
      const system = await this.prisma.system.findFirst({
        where: { id: systemId, organizationId },
      });
      if (!system) throw new NotFoundException('System not found');
    }
    return this.prisma.transportRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCertificates(organizationId: string, systemId?: string) {
    if (systemId) {
      const system = await this.prisma.system.findFirst({
        where: { id: systemId, organizationId },
      });
      if (!system) throw new NotFoundException('System not found');
    }
    return this.prisma.certificateRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { daysLeft: 'asc' },
    });
  }
}
