import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ConnectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.connector.findMany({
      where: { organizationId },
      include: {
        system: { select: { sid: true, description: true, environment: true } },
      },
      orderBy: { status: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, organizationId },
      include: { system: true },
    });
    if (!connector) throw new NotFoundException('Connector not found');
    return connector;
  }

  async heartbeat(organizationId: string, id: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, organizationId },
    });
    if (!connector) throw new NotFoundException('Connector not found');

    return this.prisma.connector.update({
      where: { id },
      data: { lastHeartbeat: new Date(), status: 'connected' },
    });
  }
}
