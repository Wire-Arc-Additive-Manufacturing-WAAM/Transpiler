import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ContractsModule } from './contracts/contracts.module';
import { DisputesModule } from './disputes/disputes.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ListingsModule } from './listings/listings.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OtpModule } from './otp/otp.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RouteAlertsModule } from './route-alerts/route-alerts.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TripsModule } from './trips/trips.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'storage'),
      serveRoot: '/storage',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 200,
      },
    ]),
    PrismaModule,
    IntegrationsModule,
    NotificationsModule,
    SubscriptionsModule,
    OtpModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    BookingsModule,
    ContractsModule,
    PaymentsModule,
    TripsModule,
    MessagesModule,
    ReviewsModule,
    DisputesModule,
    AdminModule,
    WebhooksModule,
    RouteAlertsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
