import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AvailabilityStatus,
  SubscriptionPlanType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../integrations/sms.service';

@Injectable()
export class RouteAlertsScheduler {
  private readonly log = new Logger(RouteAlertsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async matchRoutes() {
    const alerts = await this.prisma.routeAlert.findMany({
      where: { paused: false },
      include: { user: true },
    });
    for (const a of alerts) {
      const sub = await this.prisma.subscription.findFirst({
        where: {
          userId: a.userId,
          plan: SubscriptionPlanType.RouteAlertWeekly,
          status: SubscriptionStatus.Active,
        },
      });
      if (!sub) continue;

      const listings = await this.prisma.lorryListing.findMany({
        where: {
          isActive: true,
          availability: AvailabilityStatus.Available,
          AND: [
            { supportedRoutes: { has: a.origin } },
            { supportedRoutes: { has: a.destination } },
          ],
        },
        include: { owner: true },
      });

      for (const l of listings) {
        await this.notify.notify(
          a.userId,
          'Route alert — lorry available',
          `${l.numberPlate} is now available on ${a.origin} → ${a.destination}.`,
          { listingId: l.id, routeAlertId: a.id },
        );
        await this.sms.send(
          a.user.phoneE164,
          `Nibebee route alert: ${l.numberPlate} available ${a.origin}-${a.destination}.`,
        );
      }
    }
    if (alerts.length) {
      this.log.debug(`Processed ${alerts.length} route alert(s)`);
    }
  }
}
