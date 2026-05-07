import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { DisputeStatus, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DisputesService } from '../disputes/disputes.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputes: DisputesService,
  ) {}

  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        country: true,
        firstName: true,
        lastName: true,
        isSuspended: true,
        suspendedUntil: true,
        averageRating: true,
        createdAt: true,
      },
    });
  }

  async suspendUser(adminId: string, userId: string, until?: Date) {
    await this.prisma.adminLog.create({
      data: { adminId, action: 'suspend_user', target: userId },
    });
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended: true,
        suspendedUntil: until ?? new Date(Date.now() + 365 * 86400000),
      },
    });
  }

  async listDisputes() {
    return this.prisma.dispute.findMany({
      include: { trip: true, evidence: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveDispute(
    admin: User,
    disputeId: string,
    body: { resolution: string; status?: DisputeStatus },
  ) {
    return this.disputes.adminResolve(admin, disputeId, {
      status: body.status ?? DisputeStatus.Resolved,
      resolution: body.resolution,
    });
  }

  async revenueSummary() {
    const now = new Date();
    const startDay = new Date(now);
    startDay.setUTCHours(0, 0, 0, 0);
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [today, month, allTime, payouts] = await Promise.all([
      this.prisma.revenueLedger.aggregate({
        where: { recordedAt: { gte: startDay } },
        _sum: { amount: true },
      }),
      this.prisma.revenueLedger.aggregate({
        where: { recordedAt: { gte: startMonth } },
        _sum: { amount: true },
      }),
      this.prisma.revenueLedger.aggregate({ _sum: { amount: true } }),
      this.prisma.payoutRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const pendingPayouts = await this.prisma.payoutRecord.count({
      where: { status: PayoutStatus.Pending },
    });
    return {
      today: today._sum.amount ?? 0,
      thisMonth: month._sum.amount ?? 0,
      allTime: allTime._sum.amount ?? 0,
      pendingPayouts,
      payoutHistory: payouts,
    };
  }

  async createPromo(body: {
    code: string;
    percentOff?: number;
    freeDays?: number;
    maxUses?: number;
    validFrom: string;
    validUntil: string;
  }) {
    return this.prisma.promoCode.create({
      data: {
        code: body.code.toUpperCase(),
        percentOff: body.percentOff,
        freeDays: body.freeDays,
        maxUses: body.maxUses,
        validFrom: new Date(body.validFrom),
        validUntil: new Date(body.validUntil),
      },
    });
  }

  async listPromos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async removeListing(adminId: string, listingId: string) {
    await this.prisma.adminLog.create({
      data: { adminId, action: 'remove_listing', target: listingId },
    });
    const l = await this.prisma.lorryListing.findUnique({ where: { id: listingId } });
    if (!l) throw new NotFoundException();
    return this.prisma.lorryListing.update({
      where: { id: listingId },
      data: { isActive: false },
    });
  }
}
