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
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { VerifyContractOtpDto } from './dto/verify-contract-otp.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post('from-booking/:bookingId')
  create(
    @CurrentUser() user: User,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.createFromBooking(user, bookingId, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.contracts.listMine(user);
  }

  @Get(':id')
  one(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contracts.getOne(user, id);
  }

  @Post(':id/otp/request')
  otpRequest(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contracts.requestOtp(user, id);
  }

  @Post(':id/otp/verify')
  otpVerify(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: VerifyContractOtpDto,
  ) {
    return this.contracts.verifyOtp(user, id, dto.party, dto.code);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contracts.cancel(user, id);
  }
}
