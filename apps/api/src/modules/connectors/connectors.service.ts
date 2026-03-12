import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

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
    if (!connector) {
      this.logger.warn(`Heartbeat for unknown connector ${id}`);
      throw new NotFoundException('Connector not found');
    }

    this.logger.debug(
      `Heartbeat received for connector ${connector.method}:${id}`,
    );
    return this.prisma.connector.update({
      where: { id },
      data: { lastHeartbeat: new Date(), status: 'connected' },
    });
  }
}
