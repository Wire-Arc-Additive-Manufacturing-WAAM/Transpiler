import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dev / staging: activate subscription without Flutterwave.
   * Remove or protect in production.
   */
  @Post('activate')
  async activate(
    @CurrentUser() user: User,
    @Body()
    body: { plan: SubscriptionPlanType; days?: number },
  ) {
    const days = body.days ?? 30;
    const renewsAt = new Date(Date.now() + days * 86400000);
    await this.prisma.subscription.deleteMany({
      where: { userId: user.id, plan: body.plan },
    });
    return this.prisma.subscription.create({
      data: {
        userId: user.id,
        plan: body.plan,
        status: SubscriptionStatus.Active,
        renewsAt,
        flutterwaveSubRef: 'simulated',
      },
    });
  }
}
