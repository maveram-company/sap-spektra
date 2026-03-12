import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateSystemDto, UpdateSystemDto } from './dto/system.dto';

@Injectable()
export class SystemsService {
  private readonly logger = new Logger(SystemsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.system.findMany({
      where: { organizationId },
      include: {
        components: true,
        instances: true,
        hosts: true,
        connectors: { select: { id: true, method: true, status: true } },
        haConfig: true,
        systemMeta: true,
      },
      orderBy: { sid: 'asc' },
    });
  }

  async findOne(organizationId: string, systemId: string) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
      include: {
        components: { include: { instances: true } },
        instances: { include: { host: true } },
        hosts: true,
        dependencies: true,
        connectors: true,
        haConfig: true,
        systemMeta: true,
      },
    });

    if (!system) {
      throw new NotFoundException('System not found');
    }

    return system;
  }

  async create(organizationId: string, dto: CreateSystemDto) {
    const existing = await this.prisma.system.findUnique({
      where: {
        organizationId_sid: {
          organizationId,
          sid: dto.sid,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`System with SID ${dto.sid} already exists`);
    }

    const system = await this.prisma.system.create({
      data: {
        organizationId,
        sid: dto.sid,
        description: dto.description,
        sapProduct: dto.sapProduct,
        productFamily: dto.productFamily,
        sapStackType: dto.sapStackType,
        dbType: dto.dbType,
        environment: dto.environment,
        deploymentModel: dto.deploymentModel || 'ON_PREMISE',
        connectionMode: dto.connectionMode || 'AGENT_FULL',
      },
    });

    this.logger.log(`System created: ${dto.sid} → org ${organizationId}`);
    return system;
  }

  async update(organizationId: string, systemId: string, dto: UpdateSystemDto) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
    });

    if (!system) {
      throw new NotFoundException('System not found');
    }

    return this.prisma.system.update({
      where: { id: systemId },
      data: {
        ...(dto.description && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.deploymentModel && { deploymentModel: dto.deploymentModel }),
        ...(dto.connectionMode && { connectionMode: dto.connectionMode }),
      },
    });
  }

  async remove(organizationId: string, systemId: string) {
    const system = await this.prisma.system.findFirst({
      where: { id: systemId, organizationId },
    });

    if (!system) {
      throw new NotFoundException('System not found');
    }

    await this.prisma.system.delete({ where: { id: systemId } });
    this.logger.log(`System deleted: ${system.sid} → org ${organizationId}`);
    return { deleted: true };
  }

  async getHealthSummary(organizationId: string) {
    const systems = await this.prisma.system.findMany({
      where: { organizationId },
      select: {
        id: true,
        sid: true,
        status: true,
        healthScore: true,
        environment: true,
      },
    });

    const summary = {
      total: systems.length,
      healthy: systems.filter((s) => s.status === 'healthy').length,
      warning: systems.filter((s) => s.status === 'warning').length,
      critical: systems.filter((s) => s.status === 'critical').length,
      unreachable: systems.filter((s) => s.status === 'unreachable').length,
      avgHealthScore:
        systems.length > 0
          ? Math.round(
              systems.reduce((sum, s) => sum + s.healthScore, 0) /
                systems.length,
            )
          : 0,
      systems,
    };

    return summary;
  }
}
