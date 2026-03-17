import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

const ORG_ID = 'org-test-1';
const USER_ID = 'user-1';

function mockUser(overrides = {}) {
  return {
    id: USER_ID,
    email: 'john@acme.com',
    name: 'John Doe',
    status: 'active',
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    passwordHash: 'hashed-password',
    ...overrides,
  };
}

function mockMembership(overrides = {}) {
  return {
    id: 'mem-1',
    userId: USER_ID,
    organizationId: ORG_ID,
    role: 'viewer',
    createdAt: new Date(),
    user: mockUser(),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      membership: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('maps memberships to user objects', async () => {
      prisma.membership.findMany.mockResolvedValue([mockMembership()]);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: USER_ID,
        email: 'john@acme.com',
        name: 'John Doe',
        role: 'viewer',
        status: 'active',
        lastLoginAt: null,
        createdAt: expect.any(Date),
      });
    });
  });

  // ── findOne ──

  describe('findOne', () => {
    it('returns mapped user object', async () => {
      prisma.membership.findFirst.mockResolvedValue(mockMembership());

      const result = await service.findOne(ORG_ID, USER_ID);

      expect(result).toEqual({
        id: USER_ID,
        email: 'john@acme.com',
        name: 'John Doe',
        role: 'viewer',
        status: 'active',
        mfaEnabled: false,
        lastLoginAt: null,
        createdAt: expect.any(Date),
      });
    });

    it('throws NotFoundException when user not in org', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ──

  describe('create', () => {
    it('creates a new user with transaction', async () => {
      const newUser = mockUser({ id: 'user-new' });

      // Mock $transaction to call the callback with a tx mock
      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(newUser),
          },
          membership: { create: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      // findOne will be called at the end to return the result
      prisma.membership.findFirst.mockResolvedValue(
        mockMembership({ userId: 'user-new', user: newUser }),
      );

      const dto = {
        email: 'new@acme.com',
        name: 'New User',
        password: 'pass123',
        role: 'viewer' as const,
      };
      const result = await service.create(ORG_ID, dto as any);

      expect(result.email).toBe('john@acme.com'); // from the mockMembership
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('adds existing user to org via membership', async () => {
      const existingUser = mockUser({ id: 'user-existing' });
      let txMembershipCreate: jest.Mock;

      // Mock $transaction to call the callback with a tx mock
      prisma.$transaction.mockImplementation(async (cb: Function) => {
        txMembershipCreate = jest.fn().mockResolvedValue({});
        const tx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(existingUser),
          },
          membership: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: txMembershipCreate,
          },
        };
        return cb(tx);
      });

      // findOne called at end
      prisma.membership.findFirst.mockResolvedValue(
        mockMembership({ userId: 'user-existing', user: existingUser }),
      );

      const dto = {
        email: 'john@acme.com',
        name: 'John Doe',
        password: 'pass123',
      };
      const result = await service.create(ORG_ID, dto as any);

      expect(txMembershipCreate!).toHaveBeenCalledWith({
        data: {
          userId: 'user-existing',
          organizationId: ORG_ID,
          role: 'viewer',
        },
      });
      expect(result).toBeDefined();
    });

    it('throws ConflictException if user already in org', async () => {
      const existingUser = mockUser();

      // Mock $transaction to call the callback with a tx mock
      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(existingUser),
          },
          membership: {
            findUnique: jest.fn().mockResolvedValue(mockMembership()),
          },
        };
        return cb(tx);
      });

      const dto = {
        email: 'john@acme.com',
        name: 'John Doe',
        password: 'pass123',
      };

      await expect(service.create(ORG_ID, dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── update ──

  describe('update', () => {
    it('updates user name and role', async () => {
      prisma.membership.findFirst
        .mockResolvedValueOnce(mockMembership()) // first call: find membership
        .mockResolvedValueOnce(
          mockMembership({ role: 'admin', user: mockUser({ name: 'Jane' }) }),
        ); // second call: findOne at the end

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue({}) },
          membership: { update: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      const result = await service.update(ORG_ID, USER_ID, {
        name: 'Jane',
        role: 'admin',
      } as any);

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when user not in org', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', { name: 'Nope' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ──

  describe('remove', () => {
    it('deletes membership and returns confirmation', async () => {
      prisma.membership.findFirst.mockResolvedValue(mockMembership());
      prisma.membership.delete.mockResolvedValue({});

      const result = await service.remove(ORG_ID, USER_ID);

      expect(result).toEqual({ deleted: true });
      expect(prisma.membership.delete).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
      });
    });

    it('throws NotFoundException when user not in org', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
