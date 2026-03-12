import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: settings as object },
    });
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
    });
  }

  async createApiKey(organizationId: string, name: string) {
    const rawKey = `sk-spektra-${randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 12);
    const prefix = rawKey.substring(0, 12);

    const key = await this.prisma.apiKey.create({
      data: { organizationId, name, keyHash, prefix, status: 'active' },
    });

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

    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'inactive' },
    });
  }
}
