import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingRequestStatus,
  ContractStatus,
  EscrowStatus,
  MilestoneType,
  TripStatus,
  User,
  UserRole,
} from '@prisma/client';
import { computeCancellation } from '../domain/cancellation.policy';
import { EmailService } from '../integrations/email.service';
import { PdfService } from '../integrations/pdf.service';
import { OtpService } from '../otp/otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly pdf: PdfService,
    private readonly email: EmailService,
  ) {}

  async createFromBooking(user: User, bookingId: string, dto: CreateContractDto) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingId },
      include: { listing: true, contract: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingRequestStatus.AwaitingContract) {
      throw new BadRequestException('Booking must be awaiting contract');
    }
    if (booking.contract) throw new BadRequestException('Contract already exists');
    if (booking.seekerId !== user.id && booking.ownerId !== user.id) {
      throw new ForbiddenException();
    }

    const agreedPrice = booking.offeredPrice;
    const depositPercent = dto.depositPercent ?? 30;
    const depositAmount = (agreedPrice * depositPercent) / 100;
    const balanceAmount = agreedPrice - depositAmount;
    const pickupAt = booking.pickupDate;
    const deliveryEta = new Date(
      pickupAt.getTime() + 48 * 60 * 60 * 1000,
    );

    return this.prisma.contract.create({
      data: {
        bookingRequestId: booking.id,
        seekerId: booking.seekerId,
        ownerId: booking.ownerId,
        agreedPrice,
        depositPercent,
        depositAmount,
        balanceAmount,
        cargoDescription: dto.cargoDescription,
        pickupAt,
        deliveryEta,
        cancellationTerms: dto.cancellationTerms,
        pickupAddress: dto.pickupAddress,
        destinationAddress: dto.destinationAddress,
        status: ContractStatus.Draft,
      },
    });
  }

  async listMine(user: User) {
    return this.prisma.contract.findMany({
      where: {
        OR: [{ seekerId: user.id }, { ownerId: user.id }],
      },
      include: { bookingRequest: { include: { listing: true } }, trip: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: User, id: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        bookingRequest: { include: { listing: true } },
        trip: true,
        escrowPayments: true,
      },
    });
    if (!c) throw new NotFoundException();
    if (c.seekerId !== user.id && c.ownerId !== user.id && user.role !== UserRole.Admin) {
      throw new ForbiddenException();
    }
    return c;
  }

  async requestOtp(user: User, contractId: string) {
    const c = await this.getContractForParty(user, contractId);
    const party = c.seekerId === user.id ? 'seeker' : 'owner';
    const phone =
      party === 'seeker' ? c.seeker.phoneE164 : c.owner.phoneE164;
    const purpose = `contract:${contractId}:${party}`;
    const code = await this.otp.issue(phone, purpose, user.id);
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.AwaitingOtp },
    });
    return { sent: true, devCode: process.env.NODE_ENV !== 'production' ? code : undefined };
  }

  private async getContractForParty(user: User, contractId: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { seeker: true, owner: true },
    });
    if (!c) throw new NotFoundException();
    if (c.seekerId !== user.id && c.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    return c;
  }

  async verifyOtp(user: User, contractId: string, party: 'seeker' | 'owner', code: string) {
    const c = await this.getContractForParty(user, contractId);
    if (party === 'seeker' && c.seekerId !== user.id) throw new ForbiddenException();
    if (party === 'owner' && c.ownerId !== user.id) throw new ForbiddenException();
    const phone = party === 'seeker' ? c.seeker.phoneE164 : c.owner.phoneE164;
    await this.otp.verifyOrThrow(phone, `contract:${contractId}:${party}`, code);

    const data =
      party === 'seeker'
        ? { seekerOtpVerifiedAt: new Date() }
        : { ownerOtpVerifiedAt: new Date() };

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data,
      include: { seeker: true, owner: true },
    });

    if (updated.seekerOtpVerifiedAt && updated.ownerOtpVerifiedAt) {
      await this.finalizeSignedContract(contractId);
    }
    return this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { trip: true, escrowPayments: true },
    });
  }

  private async finalizeSignedContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { seeker: true, owner: true },
    });
    if (!contract || contract.status === ContractStatus.Signed) return;

    const signedAt = new Date();
    const pdfUrl = await this.pdf.renderContractPdf({
      publicId: contract.publicId,
      agreedPrice: contract.agreedPrice,
      depositPercent: contract.depositPercent,
      depositAmount: contract.depositAmount,
      balanceAmount: contract.balanceAmount,
      cargoDescription: contract.cargoDescription,
      pickupAt: contract.pickupAt,
      deliveryEta: contract.deliveryEta,
      cancellationTerms: contract.cancellationTerms,
      pickupAddress: contract.pickupAddress,
      destinationAddress: contract.destinationAddress,
      signedAt,
    });

    await this.prisma.$transaction(async (tx) => {
      const cur = await tx.contract.findUnique({ where: { id: contractId } });
      if (!cur || cur.status === ContractStatus.Signed) return;
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: ContractStatus.Signed,
          signedAt,
          pdfUrl,
        },
      });
      await tx.escrowPayment.create({
        data: {
          contractId,
          amount: contract.depositAmount,
          kind: 'deposit',
          status: EscrowStatus.PendingDeposit,
        },
      });
      await tx.escrowPayment.create({
        data: {
          contractId,
          amount: contract.balanceAmount,
          kind: 'balance',
          status: EscrowStatus.PendingDeposit,
        },
      });
      const trip = await tx.trip.create({
        data: {
          contractId,
          seekerId: contract.seekerId,
          ownerId: contract.ownerId,
          status: TripStatus.Planned,
        },
      });
      await tx.tripMilestone.create({
        data: {
          tripId: trip.id,
          type: MilestoneType.ContractSigned,
        },
      });
    });

    const html = `<p>Your Nibebee contract <strong>${contract.publicId}</strong> is signed.</p><p>PDF: ${pdfUrl}</p>`;
    await this.email.send({
      to: contract.seeker.email,
      subject: 'Nibebee — contract signed',
      html,
    });
    await this.email.send({
      to: contract.owner.email,
      subject: 'Nibebee — contract signed',
      html,
    });
  }

  async cancel(user: User, contractId: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { trip: true, escrowPayments: true },
    });
    if (!c) throw new NotFoundException();
    if (c.status !== ContractStatus.Signed) {
      throw new BadRequestException('Only signed contracts use this cancel flow');
    }
    if (c.seekerId !== user.id && c.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    const party = c.seekerId === user.id ? 'seeker' : 'owner';
    const role = user.role;
    const trip = c.trip;
    const outcome = computeCancellation(
      party,
      role,
      {
        signedAt: c.signedAt ?? c.createdAt,
        pickupAt: c.pickupAt,
        now: new Date(),
        ownerEnRouteAt: c.ownerEnRouteAt,
        tripStatus: trip?.status ?? null,
        fuelCostEstimate: Number(
          (c.escrowPayments[0]?.meta as { fuel?: number } | null)?.fuel ?? 0.05,
        ),
      },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: ContractStatus.Cancelled,
          cancelledAt: new Date(),
          cancelledByRole: role,
        },
      });
      for (const p of c.escrowPayments) {
        await tx.escrowPayment.update({
          where: { id: p.id },
          data: {
            status: EscrowStatus.Refunded,
            meta: {
              cancellation: outcome,
              party,
            } as object,
          },
        });
      }
      if (trip) {
        await tx.trip.update({
          where: { id: trip.id },
          data: { status: TripStatus.Cancelled, liveSharingEnabled: false },
        });
      }
      if (outcome.suspendOwnerHours > 0 && party === 'owner') {
        const until = new Date(Date.now() + outcome.suspendOwnerHours * 3600000);
        await tx.user.update({
          where: { id: c.ownerId },
          data: { suspendedUntil: until, isSuspended: true },
        });
      }
      if (outcome.suspendListingHours > 0 && party === 'owner') {
        const listingId = (
          await tx.bookingRequest.findUnique({
            where: { id: c.bookingRequestId },
          })
        )?.listingId;
        if (listingId) {
          await tx.lorryListing.update({
            where: { id: listingId },
            data: { isActive: false },
          });
        }
      }
      if (outcome.ownerRatingDelta !== 0 && party === 'owner') {
        const owner = await tx.user.findUnique({ where: { id: c.ownerId } });
        if (owner) {
          await tx.user.update({
            where: { id: c.ownerId },
            data: {
              averageRating: Math.max(
                0,
                owner.averageRating + outcome.ownerRatingDelta,
              ),
            },
          });
        }
      }
    });

    return { outcome };
  }
}
