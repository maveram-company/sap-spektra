import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

@Injectable()
export class HybridAuthGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || '';

    // If it looks like an API key, use API key auth
    if (authHeader.startsWith('Bearer sk-spektra-')) {
      return this.apiKeyGuard.canActivate(context);
    }

    // Otherwise, use JWT auth
    return this.jwtGuard.canActivate(context) as Promise<boolean>;
  }
}
