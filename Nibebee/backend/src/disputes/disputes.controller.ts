import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { DisputesService } from './disputes.service';

@Controller('disputes')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.disputes.listMine(user);
  }
}
