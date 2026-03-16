import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsPipelineService } from './metrics-pipeline.service';

const mockService = {
  getHostMetrics: jest.fn(),
  getHostMetricsBySystem: jest.fn(),
  getHealthSnapshots: jest.fn(),
  getBreaches: jest.fn(),
  getDependencies: jest.fn(),
  getHosts: jest.fn(),
  getComponents: jest.fn(),
  getSystemMeta: jest.fn(),
};

const mockPipeline = {
  ingest: jest.fn(),
};

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: mockService },
        { provide: MetricsPipelineService, useValue: mockPipeline },
      ],
    }).compile();

    controller = module.get(MetricsController);
    service = module.get(MetricsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── hostMetrics ──

  describe('hostMetrics', () => {
    it('delegates to metricsService.getHostMetrics with hostId and parsed hours', async () => {
      const expected = [{ timestamp: '2026-01-01', cpu: 50 }];
      mockService.getHostMetrics.mockResolvedValue(expected);

      const result = await controller.hostMetrics('host-1', { hours: '12' });

      expect(result).toEqual(expected);
      expect(service.getHostMetrics).toHaveBeenCalledWith('host-1', 12);
    });

    it('defaults to 24 hours when hours is not provided', async () => {
      mockService.getHostMetrics.mockResolvedValue([]);

      await controller.hostMetrics('host-1', {} as any);

      expect(service.getHostMetrics).toHaveBeenCalledWith('host-1', 24);
    });
  });

  // ── systemHostMetrics ──

  describe('systemHostMetrics', () => {
    it('delegates to metricsService.getHostMetricsBySystem with orgId, systemId, and hours', async () => {
      const expected = [{ hostId: 'host-1', metrics: [] }];
      mockService.getHostMetricsBySystem.mockResolvedValue(expected);

      const result = await controller.systemHostMetrics('org-1', 'sys-1', {
        hours: '6',
      });

      expect(result).toEqual(expected);
      expect(service.getHostMetricsBySystem).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        6,
      );
    });

    it('defaults to 24 hours when hours is not provided', async () => {
      mockService.getHostMetricsBySystem.mockResolvedValue([]);

      await controller.systemHostMetrics('org-1', 'sys-1', {} as any);

      expect(service.getHostMetricsBySystem).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        24,
      );
    });
  });

  // ── healthSnapshots ──

  describe('healthSnapshots', () => {
    it('delegates to metricsService.getHealthSnapshots with orgId, systemId, and hours', async () => {
      const expected = [{ score: 95 }];
      mockService.getHealthSnapshots.mockResolvedValue(expected);

      const result = await controller.healthSnapshots('org-1', 'sys-1', {
        hours: '48',
      });

      expect(result).toEqual(expected);
      expect(service.getHealthSnapshots).toHaveBeenCalledWith(
        'org-1',
        'sys-1',
        48,
      );
    });
  });

  // ── breaches ──

  describe('breaches', () => {
    it('delegates to metricsService.getBreaches with orgId, systemId, and resolved flag', async () => {
      const expected = [{ id: 'breach-1' }];
      mockService.getBreaches.mockResolvedValue(expected);

      const result = await controller.breaches('org-1', {
        systemId: 'sys-1',
        resolved: 'true',
      });

      expect(result).toEqual(expected);
      expect(service.getBreaches).toHaveBeenCalledWith('org-1', 'sys-1', true);
    });

    it('passes resolved as false when string is "false"', async () => {
      mockService.getBreaches.mockResolvedValue([]);

      await controller.breaches('org-1', { resolved: 'false' });

      expect(service.getBreaches).toHaveBeenCalledWith(
        'org-1',
        undefined,
        false,
      );
    });

    it('passes resolved as undefined when not provided', async () => {
      mockService.getBreaches.mockResolvedValue([]);

      await controller.breaches('org-1', {});

      expect(service.getBreaches).toHaveBeenCalledWith(
        'org-1',
        undefined,
        undefined,
      );
    });
  });

  // ── dependencies ──

  describe('dependencies', () => {
    it('delegates to metricsService.getDependencies with orgId and systemId', async () => {
      const expected = [{ from: 'sys-1', to: 'sys-2' }];
      mockService.getDependencies.mockResolvedValue(expected);

      const result = await controller.dependencies('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getDependencies).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── hosts ──

  describe('hosts', () => {
    it('delegates to metricsService.getHosts with orgId and systemId', async () => {
      const expected = [{ id: 'host-1', hostname: 'saphost01' }];
      mockService.getHosts.mockResolvedValue(expected);

      const result = await controller.hosts('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getHosts).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── components ──

  describe('components', () => {
    it('delegates to metricsService.getComponents with orgId and systemId', async () => {
      const expected = [{ id: 'comp-1', name: 'ABAP' }];
      mockService.getComponents.mockResolvedValue(expected);

      const result = await controller.components('org-1', 'sys-1');

      expect(result).toEqual(expected);
      expect(service.getComponents).toHaveBeenCalledWith('org-1', 'sys-1');
    });
  });

  // ── systemMeta ──

  describe('systemMeta', () => {
    it('delegates to metricsService.getSystemMeta with orgId and systemId', async () => {
      const expected = [{ sid: 'EP1', environment: 'PRD' }];
      mockService.getSystemMeta.mockResolvedValue(expected);

      const result = await controller.systemMeta('org-1', {
        systemId: 'sys-1',
      });

      expect(result).toEqual(expected);
      expect(service.getSystemMeta).toHaveBeenCalledWith('org-1', 'sys-1');
    });

    it('passes undefined systemId when not provided', async () => {
      mockService.getSystemMeta.mockResolvedValue([]);

      await controller.systemMeta('org-1', {});

      expect(service.getSystemMeta).toHaveBeenCalledWith('org-1', undefined);
    });
  });
});
