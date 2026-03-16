import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Runbook } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RunbookExecutionEngineService } from './runbook-execution-engine.service';

@Injectable()
export class RunbooksService {
  private readonly logger = new Logger(RunbooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RunbookExecutionEngineService,
  ) {}

  async findAll(organizationId: string, category?: string) {
    return this.prisma.runbook.findMany({
      where: {
        organizationId,
        ...(category ? { category } : {}),
      },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 5 } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const runbook = await this.prisma.runbook.findFirst({
      where: { id, organizationId },
      include: { executions: { orderBy: { startedAt: 'desc' } } },
    });
    if (!runbook) throw new NotFoundException('Runbook not found');
    return runbook;
  }

  async getExecutions(organizationId: string) {
    return this.prisma.runbookExecution.findMany({
      where: { runbook: { organizationId } },
      include: {
        runbook: { select: { name: true } },
        system: { select: { sid: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getExecutionDetail(organizationId: string, executionId: string) {
    const execution = await this.prisma.runbookExecution.findFirst({
      where: { id: executionId, runbook: { organizationId } },
      include: {
        runbook: { select: { name: true, category: true } },
        system: { select: { sid: true, description: true } },
        stepResults: { orderBy: { stepOrder: 'asc' } },
      },
    });
    if (!execution) throw new NotFoundException('Execution not found');
    return execution;
  }

  /**
   * Valida que un sistema cumple los pre-requisitos de un runbook.
   * Retorna { compatible: boolean, failures: string[] }
   */
  private async validateCompatibility(
    runbook: Runbook,
    systemId: string,
  ): Promise<{ compatible: boolean; failures: string[] }> {
    const system = await this.prisma.system.findUnique({
      where: { id: systemId },
      include: { systemMeta: true },
    });

    if (!system) {
      return { compatible: false, failures: ['Sistema no encontrado'] };
    }

    const failures: string[] = [];

    // 1. RISE_RESTRICTED no soporta ejecución de runbooks
    if (!system.supportsRunbookExecution) {
      failures.push(
        `Sistema ${system.sid} no soporta ejecución de runbooks (${system.monitoringCapabilityProfile})`,
      );
    }

    // 2. Validar compatibilidad de tipo de BD
    const rbDbType = runbook.dbType?.toUpperCase() || '';
    const sysDbType = system.dbType?.toUpperCase() || '';

    if (rbDbType && rbDbType !== 'ALL') {
      const dbCategory = (dt: string) => {
        if (dt.includes('HANA')) return 'HANA';
        if (dt.includes('ORACLE')) return 'ORACLE';
        if (
          dt.includes('MSSQL') ||
          dt.includes('SQL SERVER') ||
          dt.includes('MICROSOFT')
        )
          return 'MSSQL';
        if (dt.includes('DB2') || dt.includes('IBM')) return 'DB2';
        if (dt.includes('ASE') || dt.includes('SYBASE')) return 'ASE';
        if (dt.includes('MAXDB') || dt.includes('SAP DB')) return 'MAXDB';
        return dt;
      };

      const rbCategory = dbCategory(rbDbType);
      const sysCategory = dbCategory(sysDbType);

      const isStackType = ['ABAP', 'JAVA', 'PO', 'DUAL_STACK'].includes(
        rbCategory,
      );

      if (!isStackType && rbCategory !== sysCategory) {
        failures.push(
          `BD incompatible: runbook requiere ${runbook.dbType}, sistema tiene ${system.dbType}`,
        );
      }
    }

    // 3. Validar compatibilidad de stack SAP (ABAP, JAVA, PO)
    if (
      rbDbType === 'ABAP' &&
      system.sapStackType !== 'ABAP' &&
      system.sapStackType !== 'DUAL_STACK'
    ) {
      failures.push(
        `Stack incompatible: runbook requiere ABAP, sistema es ${system.sapStackType}`,
      );
    }
    if (
      rbDbType === 'JAVA' &&
      system.sapStackType !== 'JAVA' &&
      system.sapStackType !== 'DUAL_STACK'
    ) {
      failures.push(
        `Stack incompatible: runbook requiere JAVA, sistema es ${system.sapStackType}`,
      );
    }
    if (rbDbType === 'PO' && !system.sapProduct?.includes('PO')) {
      failures.push(
        `Producto incompatible: runbook es para SAP PO, sistema es ${system.sapProduct}`,
      );
    }

    // 4. Validar compatibilidad de OS
    let params: Record<string, unknown> | null = null;
    if (typeof runbook.parameters === 'string') {
      try {
        params = JSON.parse(runbook.parameters) as Record<string, unknown>;
      } catch {
        params = null;
      }
    } else if (
      runbook.parameters &&
      typeof runbook.parameters === 'object' &&
      !Array.isArray(runbook.parameters)
    ) {
      params = runbook.parameters as Record<string, unknown>;
    }
    if (params?.osType && typeof params.osType === 'string') {
      const osType = params.osType.toUpperCase();
      const sysOs = system.systemMeta?.osVersion?.toUpperCase() || '';

      const osMatch = (required: string, actual: string) => {
        if (required === 'LINUX')
          return (
            actual.includes('SLES') ||
            actual.includes('RHEL') ||
            actual.includes('UBUNTU') ||
            actual.includes('LINUX')
          );
        if (required === 'SLES')
          return actual.includes('SLES') || actual.includes('SUSE');
        if (required === 'RHEL')
          return actual.includes('RHEL') || actual.includes('RED HAT');
        if (required === 'WINDOWS')
          return actual.includes('WINDOWS') || actual.includes('WIN');
        if (required === 'AIX') return actual.includes('AIX');
        if (required === 'HPUX' || required === 'HP-UX')
          return actual.includes('HP-UX') || actual.includes('HPUX');
        if (required === 'SOLARIS')
          return actual.includes('SOLARIS') || actual.includes('SUNOS');
        return actual.includes(required);
      };

      if (!osMatch(osType, sysOs)) {
        failures.push(
          `OS incompatible: runbook requiere ${params.osType}, sistema tiene ${system.systemMeta?.osVersion || 'desconocido'}`,
        );
      }
    }

    // 5. Validar pre-requisitos específicos del runbook
    let prereqs: unknown = runbook.prereqs;
    if (typeof prereqs === 'string') {
      try {
        prereqs = JSON.parse(prereqs);
      } catch {
        prereqs = null;
      }
    }
    if (Array.isArray(prereqs)) {
      for (const prereq of prereqs) {
        if (typeof prereq !== 'string') continue;
        const p = prereq.toUpperCase();
        if (p.includes('HANA') && !sysDbType.includes('HANA')) {
          failures.push(
            `Pre-requisito no cumplido: "${prereq}" — sistema no usa HANA`,
          );
        }
        if (p.includes('HSR') && !sysDbType.includes('HANA')) {
          failures.push(
            `Pre-requisito no cumplido: "${prereq}" — HSR solo disponible en HANA`,
          );
        }
        if (p.includes('ORACLE') && !sysDbType.includes('ORACLE')) {
          failures.push(
            `Pre-requisito no cumplido: "${prereq}" — sistema no usa Oracle`,
          );
        }
        if (p.includes('CLUSTER') || p.includes('PACEMAKER')) {
          const haConfig = await this.prisma.hAConfig.findUnique({
            where: { systemId },
          });
          if (!haConfig?.haEnabled) {
            failures.push(
              `Pre-requisito no cumplido: "${prereq}" — sistema no tiene HA configurado`,
            );
          }
        }
        if (
          p.includes('FULL_STACK') &&
          system.monitoringCapabilityProfile !== 'FULL_STACK_AGENT'
        ) {
          failures.push(
            `Pre-requisito no cumplido: "${prereq}" — sistema no tiene monitoreo full-stack`,
          );
        }
      }
    }

    return { compatible: failures.length === 0, failures };
  }

  async execute(
    organizationId: string,
    runbookId: string,
    systemId: string,
    executedBy: string,
    dryRun = false,
  ) {
    const runbook = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
    });
    if (!runbook) throw new NotFoundException('Runbook not found');

    this.logger.log(
      `Execute request: runbook="${runbook.name}" system=${systemId} dryRun=${dryRun} by=${executedBy}`,
    );

    // Validar compatibilidad sistema-runbook
    const validation = await this.validateCompatibility(runbook, systemId);
    if (!validation.compatible) {
      this.logger.warn(
        `Runbook "${runbook.name}" incompatible with system ${systemId}: ${validation.failures.join('; ')}`,
      );
    }

    const gate = runbook.costSafe ? 'SAFE' : 'HUMAN';

    // Parsear steps y prereqs
    let steps = runbook.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        steps = [];
      }
    }
    let prereqs = runbook.prereqs;
    if (typeof prereqs === 'string') {
      try {
        prereqs = JSON.parse(prereqs);
      } catch {
        prereqs = null;
      }
    }

    const stepCount = Array.isArray(steps) ? steps.length : 3;

    // Dry-run: devolver simulación con validación
    if (dryRun) {
      return {
        dryRun: true,
        runbookId,
        runbookName: runbook.name,
        category: runbook.category,
        systemId,
        gate,
        costSafe: runbook.costSafe,
        autoExecute: runbook.autoExecute,
        steps,
        prereqs,
        estimatedDuration: `~${3 + stepCount * 4}s`,
        wouldCreate:
          gate === 'SAFE' && runbook.autoExecute
            ? 'AUTO_EXECUTE'
            : gate === 'HUMAN'
              ? 'PENDING_APPROVAL'
              : 'MANUAL_EXECUTE',
        compatible: validation.compatible,
        validationFailures: validation.failures,
      };
    }

    // Ejecución real: bloquear si no es compatible
    if (!validation.compatible) {
      throw new BadRequestException({
        message: 'Runbook no compatible con el sistema seleccionado',
        failures: validation.failures,
      });
    }

    // Crear registro de ejecución
    const execution = await this.prisma.runbookExecution.create({
      data: {
        runbookId,
        systemId,
        gate,
        result: gate === 'HUMAN' ? 'PENDING' : 'RUNNING',
        totalSteps: stepCount,
        executedBy,
        startedAt: new Date(),
      },
      include: {
        runbook: { select: { name: true } },
        system: { select: { sid: true } },
      },
    });

    this.logger.log(
      `Execution created: id=${execution.id} gate=${gate} result=${execution.result}`,
    );

    // Gate HUMAN: queda en PENDING para aprobación
    if (gate === 'HUMAN') {
      return execution;
    }

    // Gate SAFE: lanzar ejecución real (async, no bloquea la respuesta HTTP)
    this.engine
      .executeRunbook(execution.id, runbookId, systemId)
      .catch((err) => {
        this.logger.error(
          `Async execution failed for ${execution.id}: ${err.message}`,
        );
      });

    return execution;
  }
}
