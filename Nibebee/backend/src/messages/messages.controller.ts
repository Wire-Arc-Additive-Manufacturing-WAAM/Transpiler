import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations/:id')
  list(@CurrentUser() user: User, @Param('id') id: string) {
    return this.messages.listConversation(user, id);
  }

  @Post('conversations/:id')
  send(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(user, id, dto.body, dto.imageUrl);
  }
}
