import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from '../auth/jwt-payload.interface';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly log = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth as { token?: string })?.token ??
        (client.handshake.headers.authorization as string | undefined)?.replace(
          /^Bearer\s+/i,
          '',
        );
      if (!raw) {
        client.disconnect();
        return;
      }
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(raw, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
    } catch (e) {
      this.log.warn(`WS auth failed: ${(e as Error).message}`);
      client.disconnect();
    }
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    const userId = client.data.userId as string;
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId)) {
      return { ok: false, error: 'forbidden' };
    }
    await client.join(conversationId);
    return { ok: true };
  }

  @SubscribeMessage('send')
  async send(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { conversationId: string; text?: string; imageUrl?: string },
  ) {
    const userId = client.data.userId as string;
    const conv = await this.prisma.conversation.findUnique({
      where: { id: body.conversationId },
    });
    if (!conv || (conv.userAId !== userId && conv.userBId !== userId)) {
      return { ok: false };
    }
    const msg = await this.prisma.message.create({
      data: {
        conversationId: body.conversationId,
        senderId: userId,
        body: body.text ?? null,
        imageUrl: body.imageUrl ?? null,
      },
    });
    this.server.to(body.conversationId).emit('message', msg);
    return { ok: true, id: msg.id };
  }
}
