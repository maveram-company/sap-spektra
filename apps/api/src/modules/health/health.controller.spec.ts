import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';

const mockHealthCheckService = {
  check: jest.fn().mockResolvedValue({ status: 'ok', details: {} }),
};

const mockPrismaHealth = {
  isHealthy: jest.fn(),
};

const mockMemory = {
  checkHeap: jest.fn(),
};

const mockDisk = {
  checkStorage: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
        { provide: MemoryHealthIndicator, useValue: mockMemory },
        { provide: DiskHealthIndicator, useValue: mockDisk },
      ],
    }).compile();

    controller = module.get(HealthController);
    jest.clearAllMocks();
    // Re-set default after clearAllMocks
    mockHealthCheckService.check.mockResolvedValue({
      status: 'ok',
      details: {},
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── check ──

  describe('check', () => {
    it('delegates to healthCheckService.check with indicator callbacks', async () => {
      const expected = {
        status: 'ok',
        details: { database: { status: 'up' } },
      };
      mockHealthCheckService.check.mockResolvedValue(expected);

      const result = await controller.check();

      expect(result).toEqual(expected);
      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);

      // Verify the check was called with an array of 3 indicator functions
      const indicators = mockHealthCheckService.check.mock.calls[0][0];
      expect(indicators).toHaveLength(3);
      expect(typeof indicators[0]).toBe('function');
      expect(typeof indicators[1]).toBe('function');
      expect(typeof indicators[2]).toBe('function');
    });

    it('invokes db, memory, and disk indicators when callbacks are executed', async () => {
      mockHealthCheckService.check.mockImplementation(
        (indicators: (() => unknown)[]) => {
          indicators.forEach((fn) => fn());
          return { status: 'ok', details: {} };
        },
      );

      await controller.check();

      expect(mockPrismaHealth.isHealthy).toHaveBeenCalledWith('database');
      expect(mockMemory.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        200 * 1024 * 1024,
      );
      expect(mockDisk.checkStorage).toHaveBeenCalledWith('disk', {
        path: '/',
        thresholdPercent: 0.9,
      });
    });
  });

  // ── liveness ──

  describe('liveness', () => {
    it('returns status ok with a timestamp', () => {
      const result = controller.liveness();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });
  });
});
