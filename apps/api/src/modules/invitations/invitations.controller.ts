import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create invitation' })
  create(
    @TenantId() orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { email: string; role: string },
  ) {
    return this.invitations.createInvitation(
      orgId,
      body.email,
      body.role,
      user.email,
    );
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'List pending invitations' })
  list(@TenantId() orgId: string) {
    return this.invitations.listInvitations(orgId);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept invitation via token' })
  accept(@Body() body: { token: string }) {
    return this.invitations.acceptInvitation(body.token);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke invitation' })
  revoke(@TenantId() orgId: string, @Param('id') id: string) {
    return this.invitations.revokeInvitation(orgId, id);
  }
}
