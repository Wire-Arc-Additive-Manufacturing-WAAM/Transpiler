import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [PaymentsModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
