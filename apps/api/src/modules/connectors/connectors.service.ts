import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConnectorEntity } from '../../common/types/sap-system.types';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly runtime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.runtime = this.config.get<string>('RUNTIME_MODE', 'LOCAL_SIMULATED');
  }

  async findAll(organizationId: string) {
    return this.prisma.connector.findMany({
      where: { organizationId },
      include: {
        system: { select: { sid: true, description: true, environment: true } },
      },
      orderBy: { status: 'asc' },
      take: 500,
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

  /**
   * Actively probes a connector to validate real connectivity.
   * For Spektra Agent: sends a GET /health to the agent URL.
   * For other methods: validates based on lastHeartbeat age.
   * Updates connector status and latency.
   */
  async validateConnectivity(organizationId: string, id: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, organizationId },
      include: { system: { select: { sid: true } } },
    });
    if (!connector) throw new NotFoundException('Connector not found');

    if (this.runtime === 'LOCAL_SIMULATED') {
      return this.simulateValidation(connector);
    }

    return this.probeConnector(connector);
  }

  /**
   * Validates all connectors for an organization.
   * Returns a summary of connectivity status.
   */
  async validateAll(organizationId: string) {
    const connectors = await this.prisma.connector.findMany({
      where: { organizationId },
      include: { system: { select: { sid: true } } },
    });

    const settled = await Promise.allSettled(
      connectors.map((connector) =>
        this.runtime === 'LOCAL_SIMULATED'
          ? this.simulateValidation(connector)
          : this.probeConnector(connector),
      ),
    );
    const results = settled
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof this.probeConnector>>
        > => r.status === 'fulfilled',
      )
      .map((r) => r.value);

    const connected = results.filter((r) => r.status === 'connected').length;
    const degraded = results.filter((r) => r.status === 'degraded').length;
    const disconnected = results.filter(
      (r) => r.status === 'disconnected',
    ).length;

    return {
      total: results.length,
      connected,
      degraded,
      disconnected,
      connectors: results,
    };
  }

  private async probeConnector(
    connector: ConnectorEntity & { system?: { sid: string } },
  ) {
    const startTime = Date.now();
    let status = 'disconnected';
    let latencyMs: number | null = null;
    let details = '';

    if (connector.method === 'Spektra Agent') {
      const agentUrl = this.resolveAgentUrl(connector);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const response = await fetch(`${agentUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeout);
        latencyMs = Date.now() - startTime;

        if (response.ok) {
          status = latencyMs > 2000 ? 'degraded' : 'connected';
          details = `Agent responded in ${latencyMs}ms`;
        } else {
          status = 'degraded';
          details = `Agent returned HTTP ${response.status}`;
        }
      } catch (error) {
        latencyMs = Date.now() - startTime;
        status = 'disconnected';
        details =
          error instanceof Error && error.name === 'AbortError'
            ? 'Agent health check timed out (10s)'
            : `Agent unreachable: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      // For non-agent connectors: check heartbeat freshness
      const heartbeatAge = connector.lastHeartbeat
        ? Date.now() - new Date(connector.lastHeartbeat).getTime()
        : Infinity;

      if (heartbeatAge < 5 * 60 * 1000) {
        status = 'connected';
        details = `Last heartbeat ${Math.round(heartbeatAge / 1000)}s ago`;
      } else if (heartbeatAge < 30 * 60 * 1000) {
        status = 'degraded';
        details = `Last heartbeat ${Math.round(heartbeatAge / 60000)}m ago`;
      } else {
        status = 'disconnected';
        details = connector.lastHeartbeat
          ? `No heartbeat for ${Math.round(heartbeatAge / 60000)}m`
          : 'Never connected';
      }
      latencyMs = connector.latencyMs ?? null;
    }

    // Update connector in DB
    await this.prisma.connector.update({
      where: { id: connector.id },
      data: { status, latencyMs },
    });

    return {
      id: connector.id,
      method: connector.method,
      systemSid: connector.system?.sid,
      status,
      latencyMs,
      details,
    };
  }

  private async simulateValidation(
    connector: ConnectorEntity & { system?: { sid: string } },
  ) {
    // Simulate latency 5-50ms
    const latencyMs = 5 + Math.round(Math.random() * 45);
    const status = 'connected';
    const details = `Simulated: agent healthy (${latencyMs}ms)`;

    await this.prisma.connector.update({
      where: { id: connector.id },
      data: { status, latencyMs, lastHeartbeat: new Date() },
    });

    return {
      id: connector.id,
      method: connector.method,
      systemSid: connector.system?.sid,
      status,
      latencyMs,
      details,
    };
  }

  private resolveAgentUrl(connector: ConnectorEntity): string {
    if (connector.features && typeof connector.features === 'object') {
      const features = connector.features as Record<string, unknown>;
      if (features.agentUrl && typeof features.agentUrl === 'string') {
        return features.agentUrl;
      }
    }
    return this.config.get<string>('spektraAgentUrl', 'http://localhost:9110');
  }
}
