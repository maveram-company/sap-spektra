import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  async getLicenses(organizationId: string) {
    const systems = await this.prisma.system.findMany({
      where: { organizationId },
      select: {
        id: true,
        sid: true,
        sapProduct: true,
        mode: true,
        environment: true,
      },
    });

    return systems.map((sys) => ({
      systemId: sys.id,
      sid: sys.sid,
      product: sys.sapProduct,
      licenseType: sys.mode === 'TRIAL' ? 'Trial' : 'Production',
      environment: sys.environment,
      status: sys.mode === 'TRIAL' ? 'trial' : 'active',
      expiresAt:
        sys.mode === 'TRIAL'
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : null,
    }));
  }
}
