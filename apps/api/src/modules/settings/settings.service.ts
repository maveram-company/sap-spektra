import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        settings: true,
        limits: true,
        plan: true,
        timezone: true,
        language: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateSettings(
    organizationId: string,
    settings: Record<string, unknown>,
  ) {
    const ALLOWED_SETTINGS_KEYS = new Set([
      'notifications',
      'alertThresholds',
      'timezone',
      'language',
      'dashboardLayout',
      'emailReports',
      'slackWebhook',
      'maintenanceWindows',
      'retentionDays',
      'autoResolveAlerts',
      'defaultView',
    ]);

    const invalidKeys = Object.keys(settings).filter(
      (k) => !ALLOWED_SETTINGS_KEYS.has(k),
    );
    if (invalidKeys.length > 0) {
      throw new BadRequestException(
        `Invalid settings keys: ${invalidKeys.join(', ')}`,
      );
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: settings as object },
    });

    // Audit log (fire and forget)
    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'settings.updated',
        resource: `organization/${organizationId}/settings`,
        details: `Settings updated: ${Object.keys(settings).join(', ')}`,
        severity: 'info',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return updated;
  }

  async getApiKeys(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createApiKey(organizationId: string, name: string) {
    const rawKey = `sk-spektra-${randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 12);
    const prefix = rawKey.substring(0, 12);

    const key = await this.prisma.apiKey.create({
      data: { organizationId, name, keyHash, prefix, status: 'active' },
    });

    // Audit log (fire and forget)
    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'apikey.created',
        resource: `apikey/${key.id}`,
        details: `API key created: ${name} (${prefix}...)`,
        severity: 'critical',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    // Return raw key only once — it won't be retrievable after
    return {
      id: key.id,
      name: key.name,
      prefix,
      key: rawKey,
      createdAt: key.createdAt,
    };
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, organizationId },
    });
    if (!key) throw new NotFoundException('API key not found');

    const revoked = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'inactive' },
    });

    // Audit log (fire and forget)
    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'apikey.revoked',
        resource: `apikey/${keyId}`,
        details: `API key revoked: ${key.name} (${key.prefix}...)`,
        severity: 'warning',
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return revoked;
  }
}
