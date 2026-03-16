import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto, RegisterDto, LoginResponseDto } from './dto/login.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
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
      this.logger.warn(`Login attempt with unknown email: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      this.logger.warn(`Failed login attempt for user: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.warn(`User ${dto.email} has no organization membership`);
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

    this.logger.log(
      `User ${user.email} logged in → org ${membership.organization.slug}`,
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

    const payload: JwtPayload = {
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      role: 'admin',
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`New registration: ${dto.email} → org ${slug}`);

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
}
