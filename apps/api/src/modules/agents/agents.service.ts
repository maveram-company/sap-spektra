import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Register a new agent for a host */
  async registerAgent(
    orgId: string,
    data: {
      systemId: string;
      hostId: string;
      agentVersion: string;
      osType: string;
      architecture: string;
    },
  ) {
    // Verify system belongs to org
    const system = await this.prisma.system.findFirst({
      where: { id: data.systemId, organizationId: orgId },
    });
    if (!system) throw new NotFoundException('System not found');

    // Verify host belongs to system
    const host = await this.prisma.host.findFirst({
      where: { id: data.hostId, systemId: data.systemId },
    });
    if (!host) throw new NotFoundException('Host not found');

    // Create or update registration
    const registration = await this.prisma.agentRegistration.upsert({
      where: { hostId: data.hostId },
      update: {
        agentVersion: data.agentVersion,
        osType: data.osType,
        architecture: data.architecture,
        status: 'registered',
        updatedAt: new Date(),
      },
      create: {
        organizationId: orgId,
        systemId: data.systemId,
        hostId: data.hostId,
        agentVersion: data.agentVersion,
        osType: data.osType,
        architecture: data.architecture,
      },
    });

    // Update system connectivity profile to AGENT
    await this.prisma.system.update({
      where: { id: data.systemId },
      data: { connectivityProfile: 'AGENT' },
    });

    this.audit
      .log(orgId, {
        userEmail: 'system',
        action: 'agent.registered',
        resource: `agent/${registration.id}`,
        severity: 'info',
        details: `hostId=${data.hostId} version=${data.agentVersion} os=${data.osType}`,
      })
      .catch(() => {});

    return registration;
  }

  /** Record heartbeat from agent */
  async recordHeartbeat(
    orgId: string,
    hostId: string,
    data: { agentVersion: string; status?: string },
  ) {
    return this.prisma.agentRegistration.update({
      where: { hostId },
      data: {
        lastHeartbeat: new Date(),
        agentVersion: data.agentVersion,
        status: 'connected',
      },
    });
  }

  /** List all agents for an org */
  async listAgents(orgId: string) {
    const agents = await this.prisma.agentRegistration.findMany({
      where: { organizationId: orgId },
      include: {
        system: { select: { id: true, sid: true, description: true } },
        host: { select: { id: true, hostname: true, ip: true, os: true } },
      },
      orderBy: { installedAt: 'desc' },
    });

    // Mark stale agents as degraded/disconnected
    const now = Date.now();
    return agents.map((agent) => {
      if (agent.status === 'revoked') return agent;
      if (!agent.lastHeartbeat) return { ...agent, status: 'registered' };
      const staleMs = now - agent.lastHeartbeat.getTime();
      if (staleMs > 30 * 60 * 1000) return { ...agent, status: 'disconnected' };
      if (staleMs > 5 * 60 * 1000) return { ...agent, status: 'degraded' };
      return { ...agent, status: 'connected' };
    });
  }

  /** Get agent by host */
  async getAgentByHost(orgId: string, hostId: string) {
    return this.prisma.agentRegistration.findFirst({
      where: { hostId, organizationId: orgId },
      include: {
        system: { select: { id: true, sid: true } },
        host: { select: { id: true, hostname: true } },
      },
    });
  }

  /** Revoke agent */
  async revokeAgent(orgId: string, agentId: string) {
    const agent = await this.prisma.agentRegistration.update({
      where: { id: agentId },
      data: { status: 'revoked' },
    });

    this.audit
      .log(orgId, {
        userEmail: 'system',
        action: 'agent.revoked',
        resource: `agent/${agentId}`,
        severity: 'warning',
      })
      .catch(() => {});

    return agent;
  }

  /** Get agent health summary for dashboard */
  async getAgentSummary(orgId: string) {
    const agents = await this.listAgents(orgId);
    return {
      total: agents.length,
      connected: agents.filter((a) => a.status === 'connected').length,
      degraded: agents.filter((a) => a.status === 'degraded').length,
      disconnected: agents.filter((a) => a.status === 'disconnected').length,
      registered: agents.filter((a) => a.status === 'registered').length,
      revoked: agents.filter((a) => a.status === 'revoked').length,
    };
  }

  /** Check version compatibility */
  async checkVersionCompatibility(
    agentVersion: string,
  ): Promise<{ compatible: boolean; minVersion: string; message?: string }> {
    const MIN_VERSION = '1.0.0';
    const compatible = agentVersion >= MIN_VERSION;
    return {
      compatible,
      minVersion: MIN_VERSION,
      message: compatible
        ? undefined
        : `Agent version ${agentVersion} is below minimum ${MIN_VERSION}. Please upgrade.`,
    };
  }
}
