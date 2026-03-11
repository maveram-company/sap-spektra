import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters?: { level?: string; source?: string; systemId?: string; limit?: number }) {
    return this.prisma.event.findMany({
      where: {
        organizationId,
        ...(filters?.level && { level: filters.level }),
        ...(filters?.source && { source: filters.source }),
        ...(filters?.systemId && { systemId: filters.systemId }),
      },
      include: { system: { select: { sid: true } } },
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 100,
    });
  }
}
