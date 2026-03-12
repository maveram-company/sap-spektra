import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHostMetrics(hostId: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 3600000);
    return this.prisma.hostMetric.findMany({
      where: { hostId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getHostMetricsBySystem(
    organizationId: string,
    systemId: string,
    hours: number = 24,
  ) {
    const since = new Date(Date.now() - hours * 3600000);
    return this.prisma.hostMetric.findMany({
      where: {
        host: { systemId, system: { organizationId } },
        timestamp: { gte: since },
      },
      include: { host: { select: { hostname: true } } },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getHealthSnapshots(
    organizationId: string,
    systemId: string,
    hours: number = 24,
  ) {
    const since = new Date(Date.now() - hours * 3600000);
    return this.prisma.healthSnapshot.findMany({
      where: {
        systemId,
        system: { organizationId },
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getBreaches(
    organizationId: string,
    systemId?: string,
    resolved?: boolean,
  ) {
    return this.prisma.breach.findMany({
      where: {
        system: { organizationId },
        ...(systemId && { systemId }),
        ...(resolved !== undefined && { resolved }),
      },
      include: { system: { select: { sid: true } } },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getDependencies(organizationId: string, systemId: string) {
    return this.prisma.dependency.findMany({
      where: { systemId, system: { organizationId } },
      orderBy: { status: 'asc' },
    });
  }

  async getHosts(organizationId: string, systemId: string) {
    return this.prisma.host.findMany({
      where: { systemId, system: { organizationId } },
      include: { instances: true },
    });
  }

  async getComponents(organizationId: string, systemId: string) {
    return this.prisma.component.findMany({
      where: { systemId, system: { organizationId } },
      include: { instances: true },
    });
  }

  async getSystemMeta(organizationId: string, systemId?: string) {
    if (systemId) {
      return this.prisma.systemMeta.findFirst({
        where: { systemId, system: { organizationId } },
      });
    }
    return this.prisma.systemMeta.findMany({
      where: { system: { organizationId } },
      include: { system: { select: { sid: true } } },
    });
  }
}
