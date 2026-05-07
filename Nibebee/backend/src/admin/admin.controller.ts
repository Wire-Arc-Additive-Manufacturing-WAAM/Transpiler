import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DisputeStatus, User, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SmsService } from '../integrations/sms.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  @Get('users')
  users() {
    return this.admin.listUsers();
  }

  @Patch('users/:id/suspend')
  suspend(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body('until') until?: string,
  ) {
    return this.admin.suspendUser(
      admin.id,
      id,
      until ? new Date(until) : undefined,
    );
  }

  @Get('disputes')
  disputes() {
    return this.admin.listDisputes();
  }

  @Post('disputes/:id/resolve')
  resolveDispute(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() body: { resolution: string; status?: DisputeStatus },
  ) {
    return this.admin.resolveDispute(admin, id, body);
  }

  @Get('revenue')
  revenue() {
    return this.admin.revenueSummary();
  }

  @Get('promos')
  promos() {
    return this.admin.listPromos();
  }

  @Post('promos')
  createPromo(
    @Body()
    body: {
      code: string;
      percentOff?: number;
      freeDays?: number;
      maxUses?: number;
      validFrom: string;
      validUntil: string;
    },
  ) {
    return this.admin.createPromo(body);
  }

  @Post('sms/broadcast')
  async smsBroadcast(@Body() body: { message: string }) {
    const users = await this.prisma.user.findMany({ select: { phoneE164: true } });
    for (const u of users) {
      await this.sms.send(u.phoneE164, body.message);
    }
    return { sent: users.length };
  }

  @Delete('listings/:id')
  removeListing(@CurrentUser() admin: User, @Param('id') id: string) {
    return this.admin.removeListing(admin.id, id);
  }

  @Get('logs')
  logs() {
    return this.prisma.adminLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
