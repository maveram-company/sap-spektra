import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    filters?: { severity?: string; action?: string; limit?: number },
  ) {
    return this.prisma.auditEntry.findMany({
      where: {
        organizationId,
        ...(filters?.severity && { severity: filters.severity }),
        ...(filters?.action && { action: { contains: filters.action } }),
      },
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 100,
    });
  }

  async log(
    organizationId: string,
    data: {
      userId?: string;
      userEmail: string;
      action: string;
      resource: string;
      details?: string;
      severity?: string;
    },
  ) {
    return this.prisma.auditEntry.create({
      data: { organizationId, ...data, severity: data.severity || 'info' },
    });
  }
}
