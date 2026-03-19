import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WebhookController } from './webhook.controller';
import { BillingService } from './billing.service';

const WEBHOOK_SECRET = 'whsec_test_secret_key_1234567890';

function buildSignedRequest(
  body: Record<string, unknown>,
  secret: string,
  overrides: { timestamp?: number; signature?: string } = {},
) {
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(body);
  const signedPayload = `${timestamp}.${payload}`;
  const sig =
    overrides.signature ??
    createHmac('sha256', secret).update(signedPayload).digest('hex');

  return {
    req: { body, headers: {} } as any,
    signature: `t=${timestamp},v1=${sig}`,
    payload,
  };
}

describe('WebhookController', () => {
  let controller: WebhookController;
  let billingService: Record<string, jest.Mock>;

  beforeEach(async () => {
    billingService = {
      activateSubscription: jest.fn().mockResolvedValue({}),
      cancelSubscription: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: BillingService, useValue: billingService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              if (key === 'stripe.webhookSecret') return WEBHOOK_SECRET;
              return defaultVal ?? '';
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  it('rejects request without signature header', async () => {
    const body = { type: 'invoice.paid', data: { object: {} } };
    const req = { body } as any;

    await expect(
      controller.handleStripeWebhook(req, undefined as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects request with invalid signature', async () => {
    const body = { type: 'invoice.paid', data: { object: {} } };
    const { req } = buildSignedRequest(body, WEBHOOK_SECRET);
    const badSig = `t=${Math.floor(Date.now() / 1000)},v1=00000000deadbeef00000000deadbeef00000000deadbeef00000000deadbeef`;

    await expect(controller.handleStripeWebhook(req, badSig)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects request with expired timestamp (replay attack)', async () => {
    const body = { type: 'invoice.paid', data: { object: {} } };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const { req, signature } = buildSignedRequest(body, WEBHOOK_SECRET, {
      timestamp: oldTimestamp,
    });

    await expect(
      controller.handleStripeWebhook(req, signature),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts valid signature and processes event', async () => {
    const body = { type: 'invoice.paid', data: { object: { id: 'inv_123' } } };
    const { req, signature } = buildSignedRequest(body, WEBHOOK_SECRET);

    const result = await controller.handleStripeWebhook(req, signature);

    expect(result).toEqual({ received: true });
  });

  it('rejects all webhooks when secret is not configured', async () => {
    // Rebuild controller with empty secret
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: BillingService, useValue: billingService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ''),
          },
        },
      ],
    }).compile();

    const ctrl = module.get<WebhookController>(WebhookController);
    const body = { type: 'invoice.paid', data: { object: {} } };
    const { req, signature } = buildSignedRequest(body, 'any-secret');

    await expect(ctrl.handleStripeWebhook(req, signature)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
