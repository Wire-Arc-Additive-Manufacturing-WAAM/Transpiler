import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@prisma/client';

@Controller('route-alerts')
@UseGuards(JwtAuthGuard)
export class RouteAlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.prisma.routeAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() body: { origin: string; destination: string },
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        plan: SubscriptionPlanType.RouteAlertWeekly,
        status: SubscriptionStatus.Active,
      },
    });
    if (!sub) {
      return this.prisma.routeAlert.create({
        data: {
          userId: user.id,
          origin: body.origin,
          destination: body.destination,
          paused: true,
        },
      });
    }
    return this.prisma.routeAlert.create({
      data: {
        userId: user.id,
        origin: body.origin,
        destination: body.destination,
        paused: false,
      },
    });
  }

  @Patch(':id/pause')
  pause(@CurrentUser() user: User, @Param('id') id: string) {
    return this.prisma.routeAlert.updateMany({
      where: { id, userId: user.id },
      data: { paused: true },
    });
  }

  @Patch(':id/resume')
  resume(@CurrentUser() user: User, @Param('id') id: string) {
    return this.prisma.routeAlert.updateMany({
      where: { id, userId: user.id },
      data: { paused: false },
    });
  }
}
