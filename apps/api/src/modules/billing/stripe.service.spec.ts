import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  // ── isEnabled: key missing ──

  describe('when Stripe key is missing', () => {
    let service: StripeService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('') },
          },
        ],
      }).compile();

      service = module.get<StripeService>(StripeService);
    });

    it('isEnabled() returns false', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('createCustomer returns empty object when disabled', async () => {
      const result = await service.createCustomer(
        'test@example.com',
        'Test',
        'org-1',
      );
      expect(result).toEqual({});
    });

    it('createSubscription returns empty object when disabled', async () => {
      const result = await service.createSubscription('cus_123', 'price_123');
      expect(result).toEqual({});
    });
  });

  // ── isEnabled: key present ──

  describe('when Stripe key is present', () => {
    let service: StripeService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('sk_test_fake_key') },
          },
        ],
      }).compile();

      service = module.get<StripeService>(StripeService);
    });

    it('isEnabled() returns true', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  // ── createCustomer with mocked fetch ──

  describe('createCustomer (mocked fetch)', () => {
    let service: StripeService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('sk_test_fake_key') },
          },
        ],
      }).compile();

      service = module.get<StripeService>(StripeService);

      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'cus_mock123',
          email: 'test@example.com',
          name: 'Test Org',
          metadata: { organizationId: 'org-1', platform: 'spektra' },
        }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('calls Stripe API and returns customer', async () => {
      const result = await service.createCustomer(
        'test@example.com',
        'Test Org',
        'org-1',
      );

      expect(result.id).toBe('cus_mock123');
      expect(result.email).toBe('test@example.com');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/customers',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_fake_key',
          }),
        }),
      );
    });
  });

  // ── createSubscription with mocked fetch ──

  describe('createSubscription (mocked fetch)', () => {
    let service: StripeService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('sk_test_fake_key') },
          },
        ],
      }).compile();

      service = module.get<StripeService>(StripeService);

      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'sub_mock456',
          customer: 'cus_mock123',
          status: 'incomplete',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          items: { data: [{ id: 'si_1', price: { id: 'price_starter' } }] },
        }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('calls Stripe API and returns subscription', async () => {
      const result = await service.createSubscription(
        'cus_mock123',
        'price_starter',
      );

      expect(result.id).toBe('sub_mock456');
      expect(result.customer).toBe('cus_mock123');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.stripe.com/v1/subscriptions',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    let service: StripeService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('sk_test_fake_key') },
          },
        ],
      }).compile();

      service = module.get<StripeService>(StripeService);

      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Invalid card' },
        }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('throws on Stripe API error', async () => {
      await expect(
        service.createCustomer('bad@email.com', 'Test', 'org-1'),
      ).rejects.toThrow('Stripe error: Invalid card');
    });
  });
});
