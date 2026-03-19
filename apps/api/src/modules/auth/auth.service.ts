import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { LoginDto, RegisterDto, LoginResponseDto } from './dto/login.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          include: { organization: true },
          take: 1,
        },
      },
    });

    if (!user) {
      this.logger.warn('Login attempt with unknown email');
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      this.logger.warn(`Failed login attempt for user ${user.id}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.warn(`User ${user.id} has no organization membership`);
      throw new UnauthorizedException('No organization membership');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    this.logger.log(
      `User ${user.id} logged in → org ${membership.organization.slug}`,
    );

    // Audit log (fire and forget)
    this.audit
      .log(membership.organizationId, {
        userId: user.id,
        userEmail: user.email,
        action: 'auth.login',
        resource: `user/${user.id}`,
        details: `User logged in`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
      },
    };
  }

  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const slug = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          plan: 'professional',
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          status: 'active',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'admin',
        },
      });

      return { user, org };
    });

    // Create trial subscription (fire and forget — non-blocking)
    this.billing
      .createTrialSubscription(result.org.id, 'starter')
      .catch((err) =>
        this.logger.warn('Trial subscription creation failed', {
          error: err?.message,
        }),
      );

    const payload: JwtPayload = {
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      role: 'admin',
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(result.user.id);

    this.logger.log(`New registration: user ${result.user.id} → org ${slug}`);

    // Audit log (fire and forget)
    this.audit
      .log(result.org.id, {
        userId: result.user.id,
        userEmail: result.user.email,
        action: 'auth.register',
        resource: `user/${result.user.id}`,
        details: `New user registered, organization "${result.org.name}" created`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return {
      accessToken,
      refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: 'admin',
        organizationId: result.org.id,
        organizationName: result.org.name,
      },
    };
  }

  async validateUser(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'active') {
      this.logger.warn(
        `Token validation failed for user ${payload.sub}: ${!user ? 'not found' : 'disabled'}`,
      );
      throw new UnauthorizedException('User not found or disabled');
    }

    return payload;
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });

    return token;
  }

  async refreshAccessToken(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            memberships: { include: { organization: true }, take: 1 },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const membership = stored.user.memberships[0];
    if (!membership)
      throw new UnauthorizedException('No organization membership');

    const payload: JwtPayload = {
      sub: stored.user.id,
      email: stored.user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        role: membership.role,
      },
    };
  }

  async revokeRefreshToken(token: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user)
      return { message: 'If the email exists, a reset link has been sent' };

    const resetToken = randomBytes(32).toString('hex');
    // In production, this would send an email with a reset link
    this.logger.log(
      `Password reset requested for user ${user.id} (token: ${resetToken.substring(0, 8)}...)`,
    );

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(_token: string, _newPassword: string) {
    // Placeholder: In production, validate token against stored reset tokens
    throw new BadRequestException(
      'Password reset tokens not yet implemented — use admin reset',
    );
  }
}
