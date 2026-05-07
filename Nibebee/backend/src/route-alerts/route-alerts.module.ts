import { Module } from '@nestjs/common';
import { RouteAlertsController } from './route-alerts.controller';
import { RouteAlertsScheduler } from './route-alerts.scheduler';

@Module({
  controllers: [RouteAlertsController],
  providers: [RouteAlertsScheduler],
})
export class RouteAlertsModule {}
