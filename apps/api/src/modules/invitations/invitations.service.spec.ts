import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ORG_ID = 'org-inv-1';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      invitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockAudit = { log: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
    jest.clearAllMocks();
  });

  // ── createInvitation ──

  describe('createInvitation', () => {
    it('creates an invitation with 7-day expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      const mockInvitation = {
        id: 'inv-1',
        organizationId: ORG_ID,
        email: 'new@test.com',
        role: 'viewer',
        invitedBy: 'admin@test.com',
        token: 'uuid-token',
        status: 'pending',
        expiresAt: new Date(),
      };
      prisma.invitation.create.mockResolvedValue(mockInvitation);

      const result = await service.createInvitation(
        ORG_ID,
        'new@test.com',
        'viewer',
        'admin@test.com',
      );

      expect(result).toEqual(mockInvitation);
      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          email: 'new@test.com',
          role: 'viewer',
          invitedBy: 'admin@test.com',
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('throws BadRequestException if user is already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
      prisma.membership.findUnique.mockResolvedValue({
        id: 'm-1',
        userId: 'u-1',
        organizationId: ORG_ID,
      });

      await expect(
        service.createInvitation(
          ORG_ID,
          'existing@test.com',
          'viewer',
          'admin@test.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if a pending invitation already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue({ id: 'inv-existing' });

      await expect(
        service.createInvitation(
          ORG_ID,
          'pending@test.com',
          'viewer',
          'admin@test.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── acceptInvitation ──

  describe('acceptInvitation', () => {
    it('accepts a valid pending invitation', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: ORG_ID,
        email: 'invited@test.com',
        role: 'viewer',
        status: 'pending',
        token: 'valid-token',
        expiresAt: futureDate,
        organization: { id: ORG_ID, name: 'Test Org' },
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'invited@test.com',
      });
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          membership: { create: jest.fn().mockResolvedValue({}) },
          invitation: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.acceptInvitation('valid-token');

      expect(result.message).toBe('Invitation accepted');
      expect(result.organizationId).toBe(ORG_ID);
    });

    it('throws NotFoundException for unknown token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for already accepted invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'accepted',
        token: 'used-token',
        organization: { id: ORG_ID },
      });

      await expect(service.acceptInvitation('used-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for expired invitation', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: ORG_ID,
        status: 'pending',
        token: 'expired-token',
        expiresAt: pastDate,
        organization: { id: ORG_ID },
      });
      prisma.invitation.update.mockResolvedValue({});

      await expect(service.acceptInvitation('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if user has not registered', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        organizationId: ORG_ID,
        email: 'unregistered@test.com',
        role: 'viewer',
        status: 'pending',
        token: 'valid-token',
        expiresAt: futureDate,
        organization: { id: ORG_ID },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation('valid-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── listInvitations ──

  describe('listInvitations', () => {
    it('returns pending invitations', async () => {
      const invitations = [
        { id: 'inv-1', email: 'a@test.com', status: 'pending' },
        { id: 'inv-2', email: 'b@test.com', status: 'pending' },
      ];
      prisma.invitation.findMany.mockResolvedValue(invitations);

      const result = await service.listInvitations(ORG_ID);

      expect(result).toEqual(invitations);
      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ── revokeInvitation ──

  describe('revokeInvitation', () => {
    it('revokes an invitation by setting status to expired', async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        organizationId: ORG_ID,
        email: 'revoked@test.com',
      });
      prisma.invitation.update.mockResolvedValue({
        id: 'inv-1',
        status: 'expired',
      });

      const result = await service.revokeInvitation(ORG_ID, 'inv-1');

      expect(result.status).toBe('expired');
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'expired' },
      });
    });

    it('throws NotFoundException for unknown invitation', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(service.revokeInvitation(ORG_ID, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
