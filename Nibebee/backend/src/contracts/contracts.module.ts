import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [OtpModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
