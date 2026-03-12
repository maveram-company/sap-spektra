import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const mockService = {
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  getApiKeys: jest.fn(),
  createApiKey: jest.fn(),
  revokeApiKey: jest.fn(),
};

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: SettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    }).compile();

    controller = module.get(SettingsController);
    service = module.get(SettingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getSettings ──

  describe('getSettings', () => {
    it('delegates to settingsService.getSettings with orgId', async () => {
      const expected = { theme: 'dark', notifications: true };
      mockService.getSettings.mockResolvedValue(expected);

      const result = await controller.getSettings('org-1');

      expect(result).toEqual(expected);
      expect(service.getSettings).toHaveBeenCalledWith('org-1');
    });
  });

  // ── updateSettings ──

  describe('updateSettings', () => {
    it('delegates to settingsService.updateSettings with orgId and dto', async () => {
      const dto = { theme: 'light' } as any;
      const expected = { theme: 'light', notifications: true };
      mockService.updateSettings.mockResolvedValue(expected);

      const result = await controller.updateSettings('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.updateSettings).toHaveBeenCalledWith('org-1', dto);
    });
  });

  // ── getApiKeys ──

  describe('getApiKeys', () => {
    it('delegates to settingsService.getApiKeys with orgId', async () => {
      const expected = [{ id: 'key-1', name: 'prod' }];
      mockService.getApiKeys.mockResolvedValue(expected);

      const result = await controller.getApiKeys('org-1');

      expect(result).toEqual(expected);
      expect(service.getApiKeys).toHaveBeenCalledWith('org-1');
    });
  });

  // ── createApiKey ──

  describe('createApiKey', () => {
    it('delegates to settingsService.createApiKey with orgId and name', async () => {
      const dto = { name: 'staging' } as any;
      const expected = { id: 'key-2', name: 'staging', key: 'sk_...' };
      mockService.createApiKey.mockResolvedValue(expected);

      const result = await controller.createApiKey('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.createApiKey).toHaveBeenCalledWith('org-1', 'staging');
    });
  });

  // ── revokeApiKey ──

  describe('revokeApiKey', () => {
    it('delegates to settingsService.revokeApiKey with orgId and id', async () => {
      const expected = { revoked: true };
      mockService.revokeApiKey.mockResolvedValue(expected);

      const result = await controller.revokeApiKey('org-1', 'key-1');

      expect(result).toEqual(expected);
      expect(service.revokeApiKey).toHaveBeenCalledWith('org-1', 'key-1');
    });
  });
});
