import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export const QUOTA_KEY = 'quota';
export const Quota = (resource: string) => SetMetadata(QUOTA_KEY, resource);

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.get<string>(
      QUOTA_KEY,
      context.getHandler(),
    );
    if (!resource) return true;

    const request = context.switchToHttp().getRequest();
    const orgId = request.user?.organizationId;
    if (!orgId) return true;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { _count: { select: { systems: true } } },
    });
    if (!org) return true;

    const plan = await this.prisma.plan.findUnique({
      where: { tier: org.plan },
    });
    if (!plan) return true;

    const limits = plan.limits as Record<string, number>;

    if (resource === 'systems' && limits.maxSystems > 0) {
      if (org._count.systems >= limits.maxSystems) {
        throw new ForbiddenException(
          `Plan ${org.plan} allows maximum ${limits.maxSystems} systems. ` +
            `Current: ${org._count.systems}. Upgrade your plan to add more.`,
        );
      }
    }

    return true;
  }
}
