import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

function mockPlan(overrides = {}) {
  return {
    id: 'plan-1',
    tier: 'starter',
    name: 'Starter',
    price: 0,
    features: ['5 systems', 'Email support'],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PlansService', () => {
  let service: PlansService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      plan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PlansService>(PlansService);
    jest.clearAllMocks();
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns plans ordered by price', async () => {
      const plans = [
        mockPlan({ tier: 'starter', price: 0 }),
        mockPlan({ id: 'plan-2', tier: 'professional', price: 99 }),
        mockPlan({ id: 'plan-3', tier: 'enterprise', price: 299 }),
      ];
      prisma.plan.findMany.mockResolvedValue(plans);

      const result = await service.findAll();

      expect(result).toHaveLength(3);
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: { price: 'asc' },
      });
    });
  });

  // ── findByTier ──

  describe('findByTier', () => {
    it('returns a single plan by tier', async () => {
      const plan = mockPlan({ tier: 'professional', price: 99 });
      prisma.plan.findUnique.mockResolvedValue(plan);

      const result = await service.findByTier('professional');

      expect(result).toEqual(plan);
      expect(prisma.plan.findUnique).toHaveBeenCalledWith({
        where: { tier: 'professional' },
      });
    });
  });
});
