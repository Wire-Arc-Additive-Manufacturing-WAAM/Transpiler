import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(params: {
    to: string;
    subject: string;
    html: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<void> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.log.warn(`Email (dev) to=${params.to} subject=${params.subject}`);
      return;
    }
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: this.config.get<string>('EMAIL_FROM') ?? 'Nibebee <onboarding@resend.dev>',
        to: [params.to],
        subject: params.subject,
        html: params.html,
        attachments: params.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      },
      { headers: { Authorization: `Bearer ${key}` } },
    );
  }
}
