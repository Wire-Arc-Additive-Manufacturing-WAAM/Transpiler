import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';
import { SmsService } from './sms.service';

@Global()
@Module({
  providers: [SmsService, EmailService, PdfService],
  exports: [SmsService, EmailService, PdfService],
})
export class IntegrationsModule {}
