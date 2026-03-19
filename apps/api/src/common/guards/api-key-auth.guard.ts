import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer sk-spektra-')) {
      return false; // Not an API key — let other guards handle
    }

    const rawKey = authHeader.replace('Bearer ', '');

    // Find API keys by prefix match
    const prefix = rawKey.substring(0, 12);
    const candidates = await this.prisma.apiKey.findMany({
      where: { prefix, status: 'active' },
      include: { organization: true },
    });

    for (const candidate of candidates) {
      const isMatch = await bcrypt.compare(rawKey, candidate.keyHash);
      if (isMatch) {
        // Attach machine identity to request
        request.user = {
          sub: `apikey:${candidate.id}`,
          email: `agent@${candidate.organization.slug}.spektra`,
          organizationId: candidate.organizationId,
          role: 'operator', // API keys get operator-level access
          isApiKey: true,
        };

        // Update last used
        await this.prisma.apiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });

        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
