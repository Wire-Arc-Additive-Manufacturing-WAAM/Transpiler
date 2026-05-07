import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversation(user: User, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw new NotFoundException();
    if (conv.userAId !== user.id && conv.userBId !== user.id) {
      throw new ForbiddenException();
    }
    return conv;
  }

  async send(user: User, conversationId: string, body?: string, imageUrl?: string) {
    if (!body && !imageUrl) {
      throw new ForbiddenException('Message must have body or imageUrl');
    }
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException();
    if (conv.userAId !== user.id && conv.userBId !== user.id) {
      throw new ForbiddenException();
    }
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        body: body ?? null,
        imageUrl: imageUrl ?? null,
      },
    });
  }
}
