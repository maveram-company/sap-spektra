import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class RunbooksService {
  private readonly logger = new Logger(RunbooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.runbook.findMany({
      where: { organizationId },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 5 } },
      orderBy: { name: 'asc' },
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

  async execute(organizationId: string, runbookId: string, systemId: string, executedBy: string) {
    const runbook = await this.prisma.runbook.findFirst({
      where: { id: runbookId, organizationId },
    });
    if (!runbook) throw new NotFoundException('Runbook not found');

    const gate = runbook.costSafe ? 'SAFE' : 'HUMAN';

    return this.prisma.runbookExecution.create({
      data: {
        runbookId,
        systemId,
        gate,
        result: gate === 'SAFE' && runbook.autoExecute ? 'RUNNING' : 'PENDING',
        executedBy,
      },
    });
  }
}
