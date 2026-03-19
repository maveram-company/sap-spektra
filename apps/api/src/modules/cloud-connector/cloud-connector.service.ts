import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CloudConnectorService {
  private readonly logger = new Logger(CloudConnectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async configureConnector(
    orgId: string,
    data: {
      systemId: string;
      locationId: string;
      virtualHost: string;
      virtualPort: number;
      protocol?: string;
    },
  ) {
    // Verify system belongs to org
    const system = await this.prisma.system.findFirst({
      where: { id: data.systemId, organizationId: orgId },
    });
    if (!system) throw new NotFoundException('System not found');

    const config = await this.prisma.cloudConnectorConfig.upsert({
      where: { systemId: data.systemId },
      update: {
        locationId: data.locationId,
        virtualHost: data.virtualHost,
        virtualPort: data.virtualPort,
        protocol: data.protocol || 'RFC',
        status: 'configured',
      },
      create: {
        organizationId: orgId,
        systemId: data.systemId,
        locationId: data.locationId,
        virtualHost: data.virtualHost,
        virtualPort: data.virtualPort,
        protocol: data.protocol || 'RFC',
      },
    });

    // Update system connectivity profile
    await this.prisma.system.update({
      where: { id: data.systemId },
      data: { connectivityProfile: 'CLOUD_CONNECTOR' },
    });

    this.audit
      .log(orgId, {
        userEmail: 'system',
        action: 'cloud_connector.configured',
        resource: `cloud-connector/${config.id}`,
        details: JSON.stringify({
          systemId: data.systemId,
          locationId: data.locationId,
        }),
        severity: 'info',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return config;
  }

  async testConnection(orgId: string, systemId: string) {
    const config = await this.prisma.cloudConnectorConfig.findFirst({
      where: { systemId, organizationId: orgId },
    });
    if (!config)
      throw new NotFoundException(
        'Cloud Connector not configured for this system',
      );

    // HONEST test: We can verify configuration completeness but NOT actual connectivity
    // Real connectivity test requires SAP BTP tunnel access (not yet implemented)
    const configComplete = !!(
      config.locationId &&
      config.virtualHost &&
      config.virtualPort
    );

    const testResult = {
      configurationValid: configComplete,
      connectivityVerified: false, // HONEST: we cannot verify actual BTP tunnel
      verificationMethod: 'configuration_check_only',
      message: configComplete
        ? 'Configuration is valid. Actual connectivity cannot be verified until BTP tunnel integration is implemented.'
        : 'Configuration incomplete — missing required fields.',
      capabilities: {
        rfcAvailable: config.protocol === 'RFC',
        httpAvailable:
          config.protocol === 'HTTP' || config.protocol === 'HTTPS',
        sapMetrics: configComplete,
        osMetrics: false,
        hostAccess: false,
        runbookExecution: false,
        haFailover: false,
      },
      limitations: [
        'OS-level metrics not available via Cloud Connector',
        'Host-level runbook execution not supported',
        'HA/DR physical failover not supported',
        'Actual connectivity verification pending BTP integration',
      ],
    };

    await this.prisma.cloudConnectorConfig.update({
      where: { id: config.id },
      data: {
        status: configComplete ? 'configured' : 'failed',
        lastTestAt: new Date(),
        lastTestResult: configComplete ? 'config_valid' : 'config_incomplete',
        latencyMs: null, // No latency measurement without real probe
      },
    });

    this.audit
      .log(orgId, {
        userEmail: 'system',
        action: 'cloud_connector.tested',
        resource: `cloud-connector/${config.id}`,
        details: JSON.stringify({
          configurationValid: configComplete,
          connectivityVerified: false,
          verificationMethod: 'configuration_check_only',
        }),
        severity: 'info',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return testResult;
  }

  async getConfig(orgId: string, systemId: string) {
    return this.prisma.cloudConnectorConfig.findFirst({
      where: { systemId, organizationId: orgId },
    });
  }

  async listConfigs(orgId: string) {
    return this.prisma.cloudConnectorConfig.findMany({
      where: { organizationId: orgId },
      include: {
        system: {
          select: {
            id: true,
            sid: true,
            description: true,
            environment: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeConfig(orgId: string, systemId: string) {
    const config = await this.prisma.cloudConnectorConfig.findFirst({
      where: { systemId, organizationId: orgId },
    });
    if (!config) throw new NotFoundException('Cloud Connector not configured');

    await this.prisma.cloudConnectorConfig.delete({
      where: { id: config.id },
    });

    // Reset connectivity profile
    await this.prisma.system.update({
      where: { id: systemId },
      data: { connectivityProfile: 'NONE' },
    });

    this.audit
      .log(orgId, {
        userEmail: 'system',
        action: 'cloud_connector.removed',
        resource: `cloud-connector/${config.id}`,
        severity: 'warning',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return { removed: true };
  }

  // Returns explicit capability limitations for RISE/CC systems
  getCapabilityLimitations() {
    return {
      available: [
        'SAP application monitoring',
        'SAP instance inventory',
        'Alert management',
        'Approval workflows',
        'Analytics (SAP-level)',
        'Chat/Copilot (SAP context)',
        'Compliance reporting (partial)',
      ],
      unavailable: [
        'OS-level metrics (CPU, RAM, disk, IOPS, network)',
        'Host-level runbook execution',
        'HA/DR physical failover',
        'Local evidence collection',
        'OS-based recommendations',
        'Database direct monitoring',
        'Topology auto-discovery (host level)',
      ],
      reason:
        'SAP RISE environments are managed by SAP. Infrastructure access is not available via Cloud Connector.',
    };
  }
}
