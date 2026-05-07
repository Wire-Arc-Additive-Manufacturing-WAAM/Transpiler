import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phoneE164: string, message: string): Promise<void> {
    const user = this.config.get<string>('AT_USERNAME');
    const key = this.config.get<string>('AT_API_KEY');
    if (!user || !key) {
      this.log.warn(`SMS (dev): ${phoneE164} -> ${message}`);
      return;
    }
    const url = 'https://api.africastalking.com/version1/messaging';
    await axios.post(
      url,
      new URLSearchParams({
        username: user,
        to: phoneE164,
        message,
        from: this.config.get<string>('AT_SENDER_ID') ?? 'NIBEBEE',
      }).toString(),
      {
        headers: {
          apiKey: key,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
    );
  }
}
