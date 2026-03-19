import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-agent-1';
const SYSTEM_ID = 'sys-1';
const HOST_ID = 'host-1';

function mockRegistration(overrides = {}) {
  return {
    id: 'reg-1',
    organizationId: ORG_ID,
    systemId: SYSTEM_ID,
    hostId: HOST_ID,
    agentVersion: '1.2.0',
    osType: 'linux-sles',
    architecture: 'x64',
    status: 'registered',
    apiKeyId: null,
    lastHeartbeat: null,
    lastMetricsAt: null,
    installedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      system: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      host: {
        findFirst: jest.fn(),
      },
      agentRegistration: {
        upsert: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const mockAudit = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    jest.clearAllMocks();
  });

  // ── registerAgent ──

  describe('registerAgent', () => {
    const regData = {
      systemId: SYSTEM_ID,
      hostId: HOST_ID,
      agentVersion: '1.2.0',
      osType: 'linux-sles',
      architecture: 'x64',
    };

    it('registers an agent successfully', async () => {
      prisma.system.findFirst.mockResolvedValue({
        id: SYSTEM_ID,
        organizationId: ORG_ID,
      });
      prisma.host.findFirst.mockResolvedValue({
        id: HOST_ID,
        systemId: SYSTEM_ID,
      });
      prisma.agentRegistration.upsert.mockResolvedValue(mockRegistration());
      prisma.system.update.mockResolvedValue({});

      const result = await service.registerAgent(ORG_ID, regData);

      expect(result.hostId).toBe(HOST_ID);
      expect(result.agentVersion).toBe('1.2.0');
      expect(prisma.agentRegistration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hostId: HOST_ID },
          create: expect.objectContaining({
            organizationId: ORG_ID,
            systemId: SYSTEM_ID,
            hostId: HOST_ID,
          }),
        }),
      );
      expect(prisma.system.update).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID },
        data: { connectivityProfile: 'AGENT' },
      });
    });

    it('throws NotFoundException when system not found', async () => {
      prisma.system.findFirst.mockResolvedValue(null);

      await expect(service.registerAgent(ORG_ID, regData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when host not found', async () => {
      prisma.system.findFirst.mockResolvedValue({
        id: SYSTEM_ID,
        organizationId: ORG_ID,
      });
      prisma.host.findFirst.mockResolvedValue(null);

      await expect(service.registerAgent(ORG_ID, regData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── recordHeartbeat ──

  describe('recordHeartbeat', () => {
    it('updates heartbeat timestamp and sets status to connected', async () => {
      const updated = mockRegistration({
        status: 'connected',
        lastHeartbeat: new Date(),
      });
      prisma.agentRegistration.update.mockResolvedValue(updated);

      const result = await service.recordHeartbeat(ORG_ID, HOST_ID, {
        agentVersion: '1.2.0',
      });

      expect(result.status).toBe('connected');
      expect(prisma.agentRegistration.update).toHaveBeenCalledWith({
        where: { hostId: HOST_ID },
        data: expect.objectContaining({
          status: 'connected',
          lastHeartbeat: expect.any(Date),
          agentVersion: '1.2.0',
        }),
      });
    });
  });

  // ── listAgents ──

  describe('listAgents', () => {
    it('returns agents with computed status based on heartbeat freshness', async () => {
      const now = Date.now();

      prisma.agentRegistration.findMany.mockResolvedValue([
        // No heartbeat → registered
        mockRegistration({
          id: 'reg-1',
          lastHeartbeat: null,
          status: 'registered',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: { id: HOST_ID, hostname: 'host1', ip: '10.0.0.1', os: 'Linux' },
        }),
        // Recent heartbeat → connected
        mockRegistration({
          id: 'reg-2',
          hostId: 'host-2',
          lastHeartbeat: new Date(now - 60 * 1000),
          status: 'connected',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-2',
            hostname: 'host2',
            ip: '10.0.0.2',
            os: 'Linux',
          },
        }),
        // Stale heartbeat (10 min) → degraded
        mockRegistration({
          id: 'reg-3',
          hostId: 'host-3',
          lastHeartbeat: new Date(now - 10 * 60 * 1000),
          status: 'connected',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-3',
            hostname: 'host3',
            ip: '10.0.0.3',
            os: 'Linux',
          },
        }),
        // Very stale heartbeat (60 min) → disconnected
        mockRegistration({
          id: 'reg-4',
          hostId: 'host-4',
          lastHeartbeat: new Date(now - 60 * 60 * 1000),
          status: 'connected',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-4',
            hostname: 'host4',
            ip: '10.0.0.4',
            os: 'Linux',
          },
        }),
        // Revoked → stays revoked
        mockRegistration({
          id: 'reg-5',
          hostId: 'host-5',
          lastHeartbeat: new Date(now - 1000),
          status: 'revoked',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-5',
            hostname: 'host5',
            ip: '10.0.0.5',
            os: 'Linux',
          },
        }),
      ]);

      const result = await service.listAgents(ORG_ID);

      expect(result).toHaveLength(5);
      expect(result[0].status).toBe('registered');
      expect(result[1].status).toBe('connected');
      expect(result[2].status).toBe('degraded');
      expect(result[3].status).toBe('disconnected');
      expect(result[4].status).toBe('revoked');
    });
  });

  // ── revokeAgent ──

  describe('revokeAgent', () => {
    it('sets agent status to revoked', async () => {
      prisma.agentRegistration.update.mockResolvedValue(
        mockRegistration({ status: 'revoked' }),
      );

      const result = await service.revokeAgent(ORG_ID, 'reg-1');

      expect(result.status).toBe('revoked');
      expect(prisma.agentRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: { status: 'revoked' },
      });
    });
  });

  // ── getAgentSummary ──

  describe('getAgentSummary', () => {
    it('returns correct status counts', async () => {
      const now = Date.now();
      prisma.agentRegistration.findMany.mockResolvedValue([
        mockRegistration({
          id: 'reg-1',
          lastHeartbeat: null,
          status: 'registered',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: { id: HOST_ID, hostname: 'h1', ip: '10.0.0.1', os: 'Linux' },
        }),
        mockRegistration({
          id: 'reg-2',
          hostId: 'host-2',
          lastHeartbeat: new Date(now - 30 * 1000),
          status: 'connected',
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-2',
            hostname: 'h2',
            ip: '10.0.0.2',
            os: 'Linux',
          },
        }),
        mockRegistration({
          id: 'reg-3',
          hostId: 'host-3',
          status: 'revoked',
          lastHeartbeat: new Date(now - 1000),
          system: { id: SYSTEM_ID, sid: 'EP1', description: 'Dev' },
          host: {
            id: 'host-3',
            hostname: 'h3',
            ip: '10.0.0.3',
            os: 'Linux',
          },
        }),
      ]);

      const summary = await service.getAgentSummary(ORG_ID);

      expect(summary.total).toBe(3);
      expect(summary.registered).toBe(1);
      expect(summary.connected).toBe(1);
      expect(summary.revoked).toBe(1);
      expect(summary.degraded).toBe(0);
      expect(summary.disconnected).toBe(0);
    });
  });

  // ── checkVersionCompatibility ──

  describe('checkVersionCompatibility', () => {
    it('returns compatible for version >= 1.0.0', async () => {
      const result = await service.checkVersionCompatibility('1.2.0');
      expect(result.compatible).toBe(true);
      expect(result.minVersion).toBe('1.0.0');
      expect(result.message).toBeUndefined();
    });

    it('returns incompatible for version < 1.0.0', async () => {
      const result = await service.checkVersionCompatibility('0.9.0');
      expect(result.compatible).toBe(false);
      expect(result.message).toContain('below minimum');
    });
  });
});
