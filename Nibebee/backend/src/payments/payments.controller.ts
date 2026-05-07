import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('contracts/:contractId/deposit')
  payDeposit(
    @CurrentUser() user: User,
    @Param('contractId') contractId: string,
  ) {
    return this.payments.payDepositSimulated(user, contractId);
  }

  @Post('contracts/:contractId/balance')
  payBalance(
    @CurrentUser() user: User,
    @Param('contractId') contractId: string,
  ) {
    return this.payments.payBalanceSimulated(user, contractId);
  }
}
