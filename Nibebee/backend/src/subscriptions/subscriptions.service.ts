import { Injectable } from '@nestjs/common';
import {
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActive(userId: string, plan: SubscriptionPlanType) {
    const row = await this.prisma.subscription.findFirst({
      where: { userId, plan, status: SubscriptionStatus.Active },
    });
    return !!row;
  }

  async startFreeIfNone(userId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId },
    });
    if (existing) return;
    await this.prisma.subscription.create({
      data: {
        userId,
        plan: SubscriptionPlanType.Free,
        status: SubscriptionStatus.Active,
      },
    });
  }

  monthRange(d = new Date()) {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return { start, end };
  }

  async seekerMonthlyRequestCount(seekerId: string) {
    const { start, end } = this.monthRange();
    return this.prisma.bookingRequest.count({
      where: { seekerId, createdAt: { gte: start, lt: end } },
    });
  }

  async ownerMonthlyInboundRequestCount(ownerId: string) {
    const { start, end } = this.monthRange();
    return this.prisma.bookingRequest.count({
      where: { ownerId, createdAt: { gte: start, lt: end } },
    });
  }
}
