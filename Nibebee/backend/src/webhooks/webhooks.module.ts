import { Module } from '@nestjs/common';
import { FlutterwaveWebhookController } from './flutterwave.webhook.controller';

@Module({
  controllers: [FlutterwaveWebhookController],
})
export class WebhooksModule {}
