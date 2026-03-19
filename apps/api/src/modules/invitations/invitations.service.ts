import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createInvitation(
    organizationId: string,
    email: string,
    role: string,
    invitedBy: string,
  ) {
    // Check if user is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId,
          },
        },
      });
      if (existingMembership) {
        throw new BadRequestException(
          'User is already a member of this organization',
        );
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await this.prisma.invitation.findFirst({
      where: { organizationId, email, status: 'pending' },
    });
    if (existingInvitation) {
      throw new BadRequestException(
        'An invitation is already pending for this email',
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        role,
        invitedBy,
        expiresAt,
      },
    });

    this.audit
      .log(organizationId, {
        userEmail: invitedBy,
        action: 'invitation.created',
        resource: `invitation/${invitation.id}`,
        severity: 'info',
        details: `Invited ${email} as ${role}`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return invitation;
  }

  async acceptInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation is no longer pending');
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Invitation has expired');
    }

    // Find or verify the user exists
    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      throw new BadRequestException(
        'User must register before accepting an invitation',
      );
    }

    // Create membership and mark invitation as accepted in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' },
      });
    });

    this.audit
      .log(invitation.organizationId, {
        userEmail: invitation.email,
        action: 'invitation.accepted',
        resource: `invitation/${invitation.id}`,
        severity: 'info',
        details: `${invitation.email} accepted invitation as ${invitation.role}`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return {
      message: 'Invitation accepted',
      organizationId: invitation.organizationId,
    };
  }

  async listInvitations(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(organizationId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'expired' },
    });

    this.audit
      .log(organizationId, {
        userEmail: 'system',
        action: 'invitation.revoked',
        resource: `invitation/${invitationId}`,
        severity: 'info',
        details: `Invitation to ${invitation.email} revoked`,
      })
      .catch((err) =>
        this.logger.warn('Audit log failed', { error: err?.message }),
      );

    return updated;
  }
}
