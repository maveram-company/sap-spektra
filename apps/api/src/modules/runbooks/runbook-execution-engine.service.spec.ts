import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RunbookExecutionEngineService } from './runbook-execution-engine.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('RunbookExecutionEngineService', () => {
  let engine: RunbookExecutionEngineService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((args) => Promise.all(args)),
      runbook: {
        findUnique: jest.fn(),
      },
      system: {
        findUnique: jest.fn(),
      },
      runbookExecution: {
        update: jest.fn(),
      },
      runbookStepResult: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunbookExecutionEngineService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback: string) => {
              if (key === 'RUNTIME_MODE') return 'LOCAL_SIMULATED';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    engine = module.get<RunbookExecutionEngineService>(
      RunbookExecutionEngineService,
    );
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  describe('executeRunbook', () => {
    it('marks execution as FAILED when runbook not found', async () => {
      prisma.runbook.findUnique.mockResolvedValue(null);

      await expect(
        engine.executeRunbook('exec-1', 'rb-missing', 'sys-1'),
      ).rejects.toThrow('Runbook not found');
    });

    it('marks execution as FAILED when system not found', async () => {
      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        steps: JSON.stringify([
          { order: 1, action: 'Test', command: 'echo test' },
        ]),
      });
      prisma.system.findUnique.mockResolvedValue(null);

      await expect(
        engine.executeRunbook('exec-1', 'rb-1', 'sys-missing'),
      ).rejects.toThrow('System not found');
    });

    it('completes execution with FAILED when runbook has no steps', async () => {
      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        steps: JSON.stringify([]),
      });
      prisma.system.findUnique.mockResolvedValue({
        id: 'sys-1',
        sid: 'EP1',
        connectors: [],
        systemMeta: { kernelVersion: '793', kernelPatch: '100' },
      });
      prisma.runbookExecution.update.mockResolvedValue({});

      await engine.executeRunbook('exec-1', 'rb-1', 'sys-1');

      expect(prisma.runbookExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exec-1' },
          data: expect.objectContaining({ result: 'FAILED' }),
        }),
      );
    });

    it('executes all steps and marks SUCCESS in simulated mode', async () => {
      const steps = [
        { order: 1, action: 'Check version', command: 'disp+work --version' },
        { order: 2, action: 'Verify', command: 'echo done' },
      ];

      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        name: 'SAP Kernel Check',
        description: 'Check SAP kernel version',
        steps: JSON.stringify(steps),
      });
      prisma.system.findUnique.mockResolvedValue({
        id: 'sys-1',
        sid: 'EP1',
        connectors: [],
        systemMeta: {
          kernelVersion: '793',
          kernelPatch: '100',
          osVersion: 'SLES 15 SP5',
        },
      });
      prisma.runbookExecution.update.mockResolvedValue({});
      prisma.runbookStepResult.createMany.mockResolvedValue({ count: 2 });
      prisma.runbookStepResult.findFirst
        .mockResolvedValueOnce({ id: 'step-1', stepOrder: 1 })
        .mockResolvedValueOnce({ id: 'step-2', stepOrder: 2 });
      prisma.runbookStepResult.update.mockResolvedValue({});

      await engine.executeRunbook('exec-1', 'rb-1', 'sys-1');

      // Should have created step results
      expect(prisma.runbookStepResult.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ stepOrder: 1, action: 'Check version' }),
          expect.objectContaining({ stepOrder: 2, action: 'Verify' }),
        ]),
      });

      // Step results should be updated to RUNNING then SUCCESS
      expect(prisma.runbookStepResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
      expect(prisma.runbookStepResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS', exitCode: 0 }),
        }),
      );

      // Final execution should be SUCCESS
      const lastExecUpdate = prisma.runbookExecution.update.mock.calls.at(-1);
      expect(lastExecUpdate[0].data.result).toBe('SUCCESS');
    });

    it('generates realistic SAP kernel output for disp+work commands', async () => {
      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        name: 'SAP Kernel Version Check',
        description: 'Check version',
        steps: JSON.stringify([
          {
            order: 1,
            action: 'Check version',
            command: 'disp+work --version | grep kernel',
          },
        ]),
      });
      prisma.system.findUnique.mockResolvedValue({
        id: 'sys-1',
        sid: 'EP1',
        connectors: [],
        systemMeta: { kernelVersion: '793', kernelPatch: '100' },
      });
      prisma.runbookExecution.update.mockResolvedValue({});
      prisma.runbookStepResult.createMany.mockResolvedValue({ count: 1 });
      prisma.runbookStepResult.findFirst.mockResolvedValue({
        id: 'step-1',
        stepOrder: 1,
      });
      prisma.runbookStepResult.update.mockResolvedValue({});

      await engine.executeRunbook('exec-1', 'rb-1', 'sys-1');

      // Verify that stdout contains kernel information
      const stepUpdateCalls = prisma.runbookStepResult.update.mock.calls;
      const successCall = stepUpdateCalls.find(
        (call: any) => call[0].data.status === 'SUCCESS',
      );
      expect(successCall).toBeDefined();
      expect(successCall[0].data.stdout).toContain('kernel release');
      expect(successCall[0].data.stdout).toContain('793');
      expect(successCall[0].data.stdout).toContain('patch number');
      expect(successCall[0].data.stdout).toContain('100');
    });

    it('handles string-format steps (legacy)', async () => {
      prisma.runbook.findUnique.mockResolvedValue({
        id: 'rb-1',
        name: 'Test',
        description: 'test',
        steps: 'not valid json [[[',
      });
      prisma.system.findUnique.mockResolvedValue({
        id: 'sys-1',
        sid: 'EP1',
        connectors: [],
        systemMeta: {},
      });
      prisma.runbookExecution.update.mockResolvedValue({});

      await engine.executeRunbook('exec-1', 'rb-1', 'sys-1');

      // Should mark as FAILED because no valid steps
      expect(prisma.runbookExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'FAILED',
            detail: 'Runbook no tiene pasos definidos',
          }),
        }),
      );
    });
  });
});
