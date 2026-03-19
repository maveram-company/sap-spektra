import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RunbookExecutionEngineService } from '../runbooks/runbook-execution-engine.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RunbookExecutionEngineService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    filters?: { status?: string; systemId?: string },
  ) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.systemId && { systemId: filters.systemId }),
      },
      include: {
        system: { select: { sid: true, description: true } },
        runbook: { select: { category: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      ...r,
      type: r.runbook?.category ?? 'MANUAL',
      reason: r.description,
    }));
  }

  async findOne(organizationId: string, id: string) {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId },
      include: {
        system: { select: { sid: true, description: true } },
        runbook: { select: { category: true, name: true } },
      },
    });
    if (!approval) throw new NotFoundException('Approval request not found');
    return {
      ...approval,
      type: approval.runbook?.category ?? 'MANUAL',
      reason: approval.description,
    };
  }

  async create(
    organizationId: string,
    data: {
      systemId: string;
      description: string;
      severity: string;
      requestedBy: string;
      runbookId?: string;
      metric?: string;
      value?: number;
    },
  ) {
    return this.prisma.approvalRequest.create({
      data: { organizationId, ...data, status: 'PENDING' },
    });
  }

  async process(
    organizationId: string,
    id: string,
    action: 'APPROVED' | 'REJECTED',
    processedBy: string,
  ) {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot process — status is ${approval.status}`,
      );
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: action, processedBy, processedAt: new Date() },
    });

    // Audit log
    await this.audit.log(organizationId, {
      userEmail: processedBy,
      action: action === 'APPROVED' ? 'approval.approve' : 'approval.reject',
      resource: `approval/${id}`,
      details: `${action === 'APPROVED' ? 'Approved' : 'Rejected'} request: ${approval.description}`,
      severity: action === 'APPROVED' ? 'info' : 'warning',
    });

    // When approved and linked to a runbook, trigger execution
    if (action === 'APPROVED' && approval.runbookId) {
      await this.triggerRunbookExecution(organizationId, approval, processedBy);
    }

    return updated;
  }

  /**
   * Creates a RunbookExecution and fires the engine async.
   * Called when an approval with a runbookId is approved.
   */
  private async triggerRunbookExecution(
    organizationId: string,
    approval: {
      id: string;
      runbookId: string | null;
      systemId: string;
      requestedBy: string;
      description: string;
    },
    approvedBy: string,
  ) {
    if (!approval.runbookId) return;

    const runbook = await this.prisma.runbook.findUnique({
      where: { id: approval.runbookId },
    });
    if (!runbook) {
      this.logger.warn(
        `Approved approval ${approval.id} references missing runbook ${approval.runbookId}`,
      );
      return;
    }

    let steps: unknown = runbook.steps;
    if (typeof steps === 'string') {
      try {
        steps = JSON.parse(steps);
      } catch {
        steps = [];
      }
    }
    const stepCount = Array.isArray(steps) ? steps.length : 3;

    const execution = await this.prisma.runbookExecution.create({
      data: {
        runbookId: approval.runbookId,
        systemId: approval.systemId,
        gate: 'HUMAN',
        result: 'RUNNING',
        totalSteps: stepCount,
        executedBy: approval.requestedBy,
        startedAt: new Date(),
      },
    });

    // Update approval status to EXECUTED
    await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: 'EXECUTED',
        evidence: { executionId: execution.id, approvedBy },
      },
    });

    this.logger.log(
      `Approval ${approval.id} triggered execution ${execution.id} for runbook ${approval.runbookId}`,
    );

    // Fire engine async
    this.engine
      .executeRunbook(execution.id, approval.runbookId, approval.systemId)
      .catch((err) => {
        this.logger.error(
          `Execution ${execution.id} from approval ${approval.id} failed: ${err.message}`,
        );
      });
  }
}
