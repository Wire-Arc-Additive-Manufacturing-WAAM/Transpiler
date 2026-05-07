import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string, title: string, body: string, meta?: object) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
        meta: meta as object,
      },
    });
  }
}
