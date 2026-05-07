import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, EscrowStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async payDepositSimulated(user: User, contractId: string) {
    const c = await this.requireSignedContract(contractId);
    if (c.seekerId !== user.id) throw new ForbiddenException();
    const dep = c.escrowPayments.find((p) => p.kind === 'deposit');
    if (!dep) throw new NotFoundException();
    if (dep.status !== EscrowStatus.PendingDeposit) {
      throw new BadRequestException('Deposit not pending');
    }
    return this.prisma.escrowPayment.update({
      where: { id: dep.id },
      data: {
        status: EscrowStatus.DepositHeld,
        flutterwaveRef: `sim_deposit_${Date.now()}`,
      },
    });
  }

  async payBalanceSimulated(user: User, contractId: string) {
    const c = await this.requireSignedContract(contractId);
    if (c.seekerId !== user.id) throw new ForbiddenException();
    const bal = c.escrowPayments.find((p) => p.kind === 'balance');
    if (!bal) throw new NotFoundException();
    if (bal.status !== EscrowStatus.PendingDeposit) {
      throw new BadRequestException('Balance not pending');
    }
    return this.prisma.escrowPayment.update({
      where: { id: bal.id },
      data: {
        status: EscrowStatus.DepositHeld,
        flutterwaveRef: `sim_balance_${Date.now()}`,
      },
    });
  }

  async releaseDepositAfterPickup(contractId: string) {
    const dep = await this.prisma.escrowPayment.findFirst({
      where: { contractId, kind: 'deposit' },
    });
    if (!dep) return;
    if (dep.status === EscrowStatus.DepositHeld) {
      await this.prisma.escrowPayment.update({
        where: { id: dep.id },
        data: { status: EscrowStatus.DepositReleased },
      });
    }
  }

  async completeBalance(contractId: string) {
    const bal = await this.prisma.escrowPayment.findFirst({
      where: { contractId, kind: 'balance' },
    });
    if (!bal) return;
    await this.prisma.escrowPayment.update({
      where: { id: bal.id },
      data: { status: EscrowStatus.Completed },
    });
  }

  private async requireSignedContract(contractId: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { escrowPayments: true },
    });
    if (!c) throw new NotFoundException();
    if (c.status !== ContractStatus.Signed) {
      throw new BadRequestException('Contract must be signed before payments');
    }
    return c;
  }
}
