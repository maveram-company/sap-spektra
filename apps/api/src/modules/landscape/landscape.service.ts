import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class LandscapeService {
  constructor(private readonly prisma: PrismaService) {}

  async getValidation(organizationId: string) {
    const systems = await this.prisma.system.findMany({
      where: { organizationId },
      include: { connectors: true, haConfig: true },
    });

    return systems.map((sys) => {
      const checks = [
        {
          rule: 'connectivity',
          status: sys.connectors.some((c) => c.status === 'connected')
            ? 'pass'
            : 'fail',
        },
        {
          rule: 'monitoring_enabled',
          status: sys.supportsHostMetrics ? 'pass' : 'warn',
        },
        {
          rule: 'ha_configured',
          status: sys.haConfig?.haEnabled ? 'pass' : 'warn',
        },
        {
          rule: 'health_score',
          status:
            sys.healthScore >= 70
              ? 'pass'
              : sys.healthScore >= 50
                ? 'warn'
                : 'fail',
        },
      ];

      const hasFail = checks.some((c) => c.status === 'fail');
      const hasWarn = checks.some((c) => c.status === 'warn');
      const overallStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

      return {
        systemId: sys.id,
        sid: sys.sid,
        environment: sys.environment,
        checks,
        overallStatus,
      };
    });
  }
}
