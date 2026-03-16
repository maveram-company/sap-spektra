import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  SystemWithConnectors,
  ConnectorEntity,
  SystemMetaEntity,
  RunbookEntity,
} from '../../common/types/sap-system.types';

interface StepDefinition {
  order: number;
  action: string;
  command?: string;
}

interface AgentCommandResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: string;
}

@Injectable()
export class RunbookExecutionEngineService {
  private readonly logger = new Logger(RunbookExecutionEngineService.name);
  private readonly runtime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.runtime = this.config.get<string>('RUNTIME_MODE', 'LOCAL_SIMULATED');
  }

  /**
   * Ejecuta un runbook end-to-end: step-by-step con tracking real.
   * En modo LOCAL_SIMULATED, simula la ejecución con resultados realistas.
   * En modo AWS_REAL, envía comandos al agente vía HTTP.
   */
  async executeRunbook(
    executionId: string,
    runbookId: string,
    systemId: string,
  ): Promise<void> {
    const runbook = await this.prisma.runbook.findUnique({
      where: { id: runbookId },
    });
    if (!runbook) throw new NotFoundException('Runbook not found');

    const system = await this.prisma.system.findUnique({
      where: { id: systemId },
      include: { connectors: true, systemMeta: true },
    });
    if (!system) throw new NotFoundException('System not found');

    // Parse steps
    const steps = this.parseSteps(runbook.steps);
    if (steps.length === 0) {
      await this.completeExecution(
        executionId,
        'FAILED',
        'Runbook no tiene pasos definidos',
      );
      return;
    }

    // Marcar ejecución como RUNNING
    await this.prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        result: 'RUNNING',
        totalSteps: steps.length,
        currentStep: 0,
        completedSteps: 0,
      },
    });

    // Crear step results iniciales
    await this.prisma.runbookStepResult.createMany({
      data: steps.map((step) => ({
        executionId,
        stepOrder: step.order,
        action: step.action,
        command: step.command || null,
        status: 'PENDING',
      })),
    });

    this.logger.log(
      `Starting execution ${executionId}: ${runbook.name} on ${system.sid} (${steps.length} steps)`,
    );

    // Ejecutar steps secuencialmente
    let allSucceeded = true;
    const startTime = Date.now();

    for (const step of steps) {
      const stepResult = await this.prisma.runbookStepResult.findFirst({
        where: { executionId, stepOrder: step.order },
      });
      if (!stepResult) continue;

      // Marcar step como RUNNING
      await this.prisma.runbookStepResult.update({
        where: { id: stepResult.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      await this.prisma.runbookExecution.update({
        where: { id: executionId },
        data: { currentStep: step.order },
      });

      this.logger.log(`Step ${step.order}/${steps.length}: ${step.action}`);

      try {
        // Ejecutar el comando
        const result = await this.executeStep(step, system, runbook);

        // Actualizar step result
        await this.prisma.runbookStepResult.update({
          where: { id: stepResult.id },
          data: {
            status: result.exitCode === 0 ? 'SUCCESS' : 'FAILED',
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            duration: result.duration,
            completedAt: new Date(),
          },
        });

        await this.prisma.runbookExecution.update({
          where: { id: executionId },
          data: { completedSteps: { increment: 1 } },
        });

        if (result.exitCode !== 0) {
          this.logger.warn(
            `Step ${step.order} failed with exit code ${result.exitCode}: ${result.stderr}`,
          );
          allSucceeded = false;
          // Marcar steps restantes como SKIPPED
          await this.skipRemainingSteps(executionId, step.order, steps.length);
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Step ${step.order} threw error: ${errorMsg}`);

        await this.prisma.runbookStepResult.update({
          where: { id: stepResult.id },
          data: {
            status: 'FAILED',
            stderr: errorMsg,
            exitCode: -1,
            completedAt: new Date(),
          },
        });

        await this.prisma.runbookExecution.update({
          where: { id: executionId },
          data: { completedSteps: { increment: 1 } },
        });

        allSucceeded = false;
        await this.skipRemainingSteps(executionId, step.order, steps.length);
        break;
      }
    }

    // Finalizar ejecución
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    const finalResult = allSucceeded ? 'SUCCESS' : 'FAILED';
    const detail = allSucceeded
      ? `Completado: ${runbook.description} (${steps.length} pasos)`
      : `Falló en paso ${await this.getFailedStepOrder(executionId)} de ${steps.length}`;

    await this.completeExecution(
      executionId,
      finalResult,
      detail,
      `${totalDuration}s`,
    );

    this.logger.log(
      `Execution ${executionId} finished: ${finalResult} in ${totalDuration}s`,
    );
  }

  /**
   * Ejecuta un step individual.
   * En LOCAL_SIMULATED: genera resultado simulado realista.
   * En AWS_REAL: envía comando al agente del sistema.
   */
  private async executeStep(
    step: StepDefinition,
    system: SystemWithConnectors,
    runbook: RunbookEntity,
  ): Promise<AgentCommandResponse> {
    if (this.runtime === 'LOCAL_SIMULATED' || !step.command) {
      return this.simulateStep(step, system, runbook);
    }

    return this.executeViaAgent(step, system);
  }

  /**
   * Envía un comando al agente Spektra del sistema vía HTTP.
   */
  private async executeViaAgent(
    step: StepDefinition,
    system: SystemWithConnectors,
  ): Promise<AgentCommandResponse> {
    const connector = system.connectors?.find(
      (c: ConnectorEntity) =>
        c.method === 'Spektra Agent' && c.status === 'connected',
    );

    if (!connector) {
      throw new BadRequestException(
        `No hay agente Spektra conectado para el sistema ${system.sid}. Verifique el connector.`,
      );
    }

    // Construir URL del agente desde el heartbeat
    const agentBaseUrl = this.resolveAgentUrl(connector);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`${agentBaseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: step.command,
          timeout: 120,
          sid: system.sid,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          exitCode: response.status,
          stdout: '',
          stderr: `Agent returned ${response.status}: ${body}`,
          duration: '0s',
        };
      }

      const data = (await response.json()) as AgentCommandResponse;
      return {
        exitCode: data.exitCode ?? 0,
        stdout: data.stdout ?? '',
        stderr: data.stderr ?? '',
        duration: data.duration ?? '0s',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Timeout: el comando excedió 120 segundos',
          duration: '120s',
        };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Simula la ejecución de un step con resultado realista.
   * Genera stdout/stderr basado en el tipo de comando.
   */
  private async simulateStep(
    step: StepDefinition,
    system: SystemWithConnectors,
    runbook: RunbookEntity,
  ): Promise<AgentCommandResponse> {
    // Simular latencia realista (300ms - 2s por step)
    const delayMs = 300 + Math.random() * 1700;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const duration = `${(delayMs / 1000).toFixed(1)}s`;
    const command = step.command || '';
    const sid = system.sid || 'SYS';
    const meta = system.systemMeta ?? null;

    // Generar stdout basado en el tipo de comando
    const stdout = this.generateSimulatedOutput(command, sid, meta, runbook);

    return {
      exitCode: 0,
      stdout,
      stderr: '',
      duration,
    };
  }

  /**
   * Genera output simulado realista basado en el patrón del comando.
   */
  private generateSimulatedOutput(
    command: string,
    sid: string,
    meta: SystemMetaEntity | null,
    _runbook: RunbookEntity,
  ): string {
    const cmd = command.toLowerCase();

    // disp+work version
    if (cmd.includes('disp+work') && cmd.includes('version')) {
      const kv = meta?.kernelVersion || '793';
      const kp = meta?.kernelPatch || '100';
      return [
        `--------------------`,
        `disp+work information`,
        `--------------------`,
        `kernel release                : ${kv}`,
        `kernel make variant           : 793_REL`,
        `compiled on                   : Linux GNU SLES-15 x86_64 cc14.2.0`,
        `compilation mode              : UNICODE`,
        `compile time                  : Jan 15 2026 14:22:33`,
        `patch number                  : ${kp}`,
        `source id                     : 0.${kp}`,
        `update level                  : 0`,
        `kernel patch level            : ${kp}`,
        `supported environment         : SAP HANA 2.0, Oracle 19c, DB2 11.5`,
        `database library              : SQLDBC 2.10.20.1688330`,
      ].join('\n');
    }

    // sapcontrol GetProcessList
    if (cmd.includes('getprocesslist')) {
      return [
        `${sid} GetProcessList`,
        `  name, description, dispstatus, textstatus, starttime, elapsedtime, pid`,
        `  disp+work, Dispatcher, GREEN, Running, 2026 03 13 06:00:00, 7:23:15, 12345`,
        `  igswd_mt, IGS Watchdog, GREEN, Running, 2026 03 13 06:00:01, 7:23:14, 12346`,
        `  gwrd, Gateway, GREEN, Running, 2026 03 13 06:00:01, 7:23:14, 12347`,
        `  icman, ICM, GREEN, Running, 2026 03 13 06:00:02, 7:23:13, 12348`,
      ].join('\n');
    }

    // sapcontrol GetVersionInfo
    if (cmd.includes('getversioninfo')) {
      const kv = meta?.kernelVersion || '793';
      const kp = meta?.kernelPatch || '100';
      return [
        `${sid} GetVersionInfo`,
        `  name, version, patchlevel, compilation`,
        `  disp+work, ${kv}, ${kp}, Jan 15 2026`,
        `  sapstartsrv, ${kv}, ${kp}, Jan 15 2026`,
        `  gwrd, ${kv}, ${kp}, Jan 15 2026`,
        `  icman, ${kv}, ${kp}, Jan 15 2026`,
      ].join('\n');
    }

    // StopSystem / StartSystem
    if (cmd.includes('stopsystem')) {
      return `${sid} StopSystem ALL\nOK — all instances stopped.`;
    }
    if (cmd.includes('startsystem')) {
      return `${sid} StartSystem ALL\nOK — all instances started.`;
    }

    // WaitforStopped / WaitforStarted
    if (cmd.includes('waitfor')) {
      return `OK — system reached expected state.`;
    }

    // SAPCAR
    if (cmd.includes('sapcar') && cmd.includes('-tvf')) {
      return [
        `SAPCAR: processing archive SAPEXE.SAR`,
        `-rwxr-xr-x 23456789  15 Jan 2026 14:22  disp+work`,
        `-rwxr-xr-x  8765432  15 Jan 2026 14:22  sapstartsrv`,
        `-rwxr-xr-x  4321098  15 Jan 2026 14:22  gwrd`,
        `-rwxr-xr-x  3210987  15 Jan 2026 14:22  icman`,
        `... (124 more files)`,
      ].join('\n');
    }
    if (cmd.includes('sapcar') && cmd.includes('-xvf')) {
      return `SAPCAR: extracting archive...\n128 files extracted successfully.`;
    }

    // tar backup
    if (cmd.includes('tar czf') && cmd.includes('kernel_backup')) {
      return `Backup created: kernel_backup_20260313_140000.tar.gz (245MB)`;
    }

    // df -h
    if (cmd.includes('df -h')) {
      return [
        `Filesystem      Size  Used Avail Use% Mounted on`,
        `/dev/sda1        50G   28G   22G  56% /`,
        `/dev/sdb1       200G  142G   58G  71% /usr/sap`,
        `/dev/sdc1       500G  320G  180G  64% /hana/data`,
      ].join('\n');
    }

    // uname
    if (cmd.includes('uname -r')) {
      return meta?.osVersion?.includes('SLES')
        ? '5.14.21-150500.55.83-default'
        : meta?.osVersion?.includes('RHEL')
          ? '4.18.0-553.el8_10.x86_64'
          : '5.15.0-generic';
    }

    // ls backup files
    if (cmd.includes('kernel_backup') && cmd.includes('ls')) {
      return `-rw-r--r-- 1 ${sid.toLowerCase()}adm sapsys 256789012 Mar 13 14:00 /usr/sap/trans/tmp/kernel_backup_20260313_140000.tar.gz`;
    }

    // ABAPGetWPTable
    if (cmd.includes('abapgetwptable')) {
      return [
        `No  Typ Pid    Status  Reason Start         Err Sem CPU  Time  Program`,
        `0   DIA 12345  Wait         0 14:00:00        0   0  0:01 0:00 SAPMSSY1`,
        `1   DIA 12346  Wait         0 14:00:00        0   0  0:00 0:00`,
        `2   BTC 12347  Wait         0 14:00:00        0   0  0:02 0:00`,
      ].join('\n');
    }

    // rpm / kernel queries
    if (cmd.includes('rpm -q kernel')) {
      return `kernel-5.14.21-150500.55.83.1.x86_64`;
    }

    // mkdir
    if (cmd.includes('mkdir')) {
      return `Directory created.`;
    }

    // cp
    if (cmd.includes('cp -p') || cmd.includes('cp ')) {
      return `Files copied successfully.`;
    }

    // chown/chmod
    if (cmd.includes('chown') || cmd.includes('chmod')) {
      return `Permissions updated.`;
    }

    // HDB stop/start
    if (cmd.includes('hdb stop')) {
      return `hdbdaemon is stopped.\nhdbindexserver stopped.`;
    }
    if (cmd.includes('hdb start')) {
      return `hdbdaemon is running.\nhdbindexserver is running.`;
    }

    // Windows commands
    if (cmd.includes('get-hotfix')) {
      return `Source  Description     HotFixID  InstalledBy          InstalledOn\n------  -----------     --------  -----------          -----------\nSERVER  Security Update  KB5034441 NT AUTHORITY\\SYSTEM  3/10/2026`;
    }
    if (cmd.includes('get-service')) {
      return `Status   Name               DisplayName\n------   ----               -----------\nRunning  SAPService${sid}      SAP${sid}_00`;
    }

    // Generic echo / report
    if (cmd.includes('echo')) {
      const kv = meta?.kernelVersion || '793';
      const kp = meta?.kernelPatch || '100';
      return `Sistema: ${sid} | Kernel: ${kv} | Patch: ${kp}`;
    }

    // Default
    return `Step executed successfully on ${sid}.`;
  }

  private async skipRemainingSteps(
    executionId: string,
    failedStep: number,
    totalSteps: number,
  ): Promise<void> {
    for (let i = failedStep + 1; i <= totalSteps; i++) {
      const step = await this.prisma.runbookStepResult.findFirst({
        where: { executionId, stepOrder: i },
      });
      if (step) {
        await this.prisma.runbookStepResult.update({
          where: { id: step.id },
          data: { status: 'SKIPPED' },
        });
      }
    }
  }

  private async completeExecution(
    executionId: string,
    result: string,
    detail: string,
    duration?: string,
  ): Promise<void> {
    await this.prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        result,
        detail,
        duration: duration || null,
        completedAt: new Date(),
      },
    });
  }

  private async getFailedStepOrder(executionId: string): Promise<number> {
    const failedStep = await this.prisma.runbookStepResult.findFirst({
      where: { executionId, status: 'FAILED' },
      orderBy: { stepOrder: 'asc' },
    });
    return failedStep?.stepOrder ?? 0;
  }

  private parseSteps(raw: unknown): StepDefinition[] {
    let steps: unknown = raw;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(steps)) return [];
    return steps
      .filter(
        (s: Record<string, unknown>) => s && typeof s === 'object' && s.action,
      )
      .map((s: Record<string, unknown>, i: number) => ({
        order: (s.order as number) ?? i + 1,
        action: s.action as string,
        command: (s.command as string) || undefined,
      }));
  }

  private resolveAgentUrl(connector: ConnectorEntity): string {
    // Si el connector tiene features con agentUrl, usar eso
    if (connector.features && typeof connector.features === 'object') {
      const features = connector.features as Record<string, unknown>;
      if (features.agentUrl && typeof features.agentUrl === 'string') {
        return features.agentUrl;
      }
    }
    // Fallback: construir desde la IP/hostname del sistema
    return process.env.SPEKTRA_AGENT_URL || 'http://localhost:9110';
  }
}
