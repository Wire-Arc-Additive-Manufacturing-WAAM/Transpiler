import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutStatus } from '@prisma/client';

@Controller('webhooks')
@SkipThrottle()
export class FlutterwaveWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('flutterwave')
  async flutterwave(
    @Body() body: { event?: string; data?: { amount?: number; currency?: string; tx_ref?: string } },
    @Headers('verif-hash') verif?: string,
  ) {
    const secret = this.config.get<string>('FLW_WEBHOOK_SECRET');
    if (secret && verif !== secret) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (body.event === 'charge.completed' && body.data?.amount) {
      await this.prisma.revenueLedger.create({
        data: {
          source: 'flutterwave_subscription_or_addon',
          amount: body.data.amount,
          currency: body.data.currency ?? 'KES',
          flutterwaveRef: body.data.tx_ref ?? null,
        },
      });
      const paypalEmail = this.config.get<string>('PAYPAL_BUSINESS_EMAIL');
      if (paypalEmail) {
        await this.prisma.payoutRecord.create({
          data: {
            amount: body.data.amount * 0.97,
            currency: body.data.currency ?? 'KES',
            paypalEmail,
            status: PayoutStatus.Pending,
            note: 'Auto-queue from Flutterwave webhook (configure payout worker)',
          },
        });
      }
    }
    return { received: true };
  }
}
