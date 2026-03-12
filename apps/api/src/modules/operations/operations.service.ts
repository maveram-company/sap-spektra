import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { status?: string; type?: string; systemId?: string }) {
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

  async create(organizationId: string, data: {
    systemId: string; type: string; description: string;
    requestedBy: string; riskLevel?: string; scheduledTime?: Date; schedule?: string;
  }) {
    return this.prisma.operationRecord.create({
      data: { organizationId, ...data, status: 'SCHEDULED', riskLevel: data.riskLevel || 'LOW' },
    });
  }

  async updateStatus(organizationId: string, id: string, status: string) {
    const op = await this.prisma.operationRecord.findFirst({ where: { id, organizationId } });
    if (!op) throw new NotFoundException('Operation not found');

    return this.prisma.operationRecord.update({
      where: { id },
      data: {
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
      },
    });
  }

  async getJobs(systemId?: string) {
    return this.prisma.jobRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getTransports(systemId?: string) {
    return this.prisma.transportRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCertificates(systemId?: string) {
    return this.prisma.certificateRecord.findMany({
      where: systemId ? { systemId } : {},
      include: { system: { select: { sid: true } } },
      orderBy: { daysLeft: 'asc' },
    });
  }
}
