import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { status?: string; systemId?: string },
  ) {
    return this.prisma.approvalRequest.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.systemId && { systemId: filters.systemId }),
      },
      include: { system: { select: { sid: true, description: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId },
      include: { system: { select: { sid: true, description: true } } },
    });
    if (!approval) throw new NotFoundException('Approval request not found');
    return approval;
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

    return this.prisma.approvalRequest.update({
      where: { id },
      data: { status: action, processedBy, processedAt: new Date() },
    });
  }
}
