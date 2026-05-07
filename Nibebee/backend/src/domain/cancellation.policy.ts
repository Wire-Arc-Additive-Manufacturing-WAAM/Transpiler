import { UserRole } from '@prisma/client';

export type CancellationParty = 'seeker' | 'owner';

export interface CancellationContext {
  signedAt: Date;
  pickupAt: Date;
  now: Date;
  ownerEnRouteAt: Date | null;
  tripStatus: string | null;
  fuelCostEstimate: number;
}

export interface CancellationOutcome {
  seekerRefundFraction: number;
  ownerReceivesForfeitFraction: number;
  suspendOwnerHours: number;
  suspendListingHours: number;
  ownerRatingDelta: number;
  notes: string[];
}

const HOUR_MS = 60 * 60 * 1000;

export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / HOUR_MS;
}

export function computeSeekerCancellation(
  ctx: CancellationContext,
): CancellationOutcome {
  const notes: string[] = [];
  const hoursSinceSign = hoursBetween(ctx.signedAt, ctx.now);
  const hoursToPickup = hoursBetween(ctx.now, ctx.pickupAt);
  const enRoute =
    ctx.ownerEnRouteAt != null ||
    (ctx.tripStatus &&
      ['DriverEnRoute', 'CargoLoaded', 'InTransit', 'Approaching'].includes(
        ctx.tripStatus,
      ));

  if (hoursSinceSign <= 2) {
    notes.push('Seeker cancel within 2h of signing: full refund.');
    return {
      seekerRefundFraction: 1,
      ownerReceivesForfeitFraction: 0,
      suspendOwnerHours: 0,
      suspendListingHours: 0,
      ownerRatingDelta: 0,
      notes,
    };
  }

  if (!enRoute) {
    if (hoursToPickup >= 2 && hoursToPickup <= 24) {
      notes.push('Seeker cancel 2–24h before pickup: 15% forfeited.');
      return {
        seekerRefundFraction: 0.85,
        ownerReceivesForfeitFraction: 0.15,
        suspendOwnerHours: 0,
        suspendListingHours: 0,
        ownerRatingDelta: 0,
        notes,
      };
    }
    notes.push('Seeker cancel >24h before pickup: full refund (no en route).');
    return {
      seekerRefundFraction: 1,
      ownerReceivesForfeitFraction: 0,
      suspendOwnerHours: 0,
      suspendListingHours: 0,
      ownerRatingDelta: 0,
      notes,
    };
  }

  const forfeit = Math.min(1, 0.3 + ctx.fuelCostEstimate);
  notes.push(
    'Seeker cancel after en route: 30% + fuel cost share applied (capped at total held).',
  );
  return {
    seekerRefundFraction: Math.max(0, 1 - forfeit),
    ownerReceivesForfeitFraction: forfeit,
    suspendOwnerHours: 0,
    suspendListingHours: 0,
    ownerRatingDelta: 0,
    notes,
  };
}

export function computeOwnerCancellation(
  ctx: CancellationContext,
): CancellationOutcome {
  const notes: string[] = [];
  const hoursSinceSign = hoursBetween(ctx.signedAt, ctx.now);
  const hoursToPickup = hoursBetween(ctx.now, ctx.pickupAt);
  const enRoute =
    ctx.ownerEnRouteAt != null ||
    (ctx.tripStatus &&
      ['DriverEnRoute', 'CargoLoaded', 'InTransit', 'Approaching'].includes(
        ctx.tripStatus,
      ));

  if (hoursSinceSign <= 2) {
    notes.push('Owner cancel within 2h of signing: full refund to seeker.');
    return {
      seekerRefundFraction: 1,
      ownerReceivesForfeitFraction: 0,
      suspendOwnerHours: 0,
      suspendListingHours: 0,
      ownerRatingDelta: 0,
      notes,
    };
  }

  if (!enRoute) {
    if (hoursToPickup >= 2 && hoursToPickup <= 24) {
      notes.push(
        'Owner cancel 2–24h before pickup: listing suspended 48h, full refund + platform credit (tracked separately).',
      );
      return {
        seekerRefundFraction: 1,
        ownerReceivesForfeitFraction: 0,
        suspendOwnerHours: 0,
        suspendListingHours: 48,
        ownerRatingDelta: 0,
        notes,
      };
    }
    notes.push('Owner cancel >24h before pickup: full refund.');
    return {
      seekerRefundFraction: 1,
      ownerReceivesForfeitFraction: 0,
      suspendOwnerHours: 0,
      suspendListingHours: 0,
      ownerRatingDelta: 0,
      notes,
    };
  }

  notes.push(
    'Owner cancel after en route: 3-day owner suspension + rating penalty + full refund to seeker.',
  );
  return {
    seekerRefundFraction: 1,
    ownerReceivesForfeitFraction: 0,
    suspendOwnerHours: 72,
    suspendListingHours: 0,
    ownerRatingDelta: -0.5,
    notes,
  };
}

export function computeCancellation(
  party: CancellationParty,
  role: UserRole,
  ctx: CancellationContext,
): CancellationOutcome {
  if (party === 'seeker' && role === UserRole.LoadSeeker) {
    return computeSeekerCancellation(ctx);
  }
  if (party === 'owner' && role === UserRole.LorryOwner) {
    return computeOwnerCancellation(ctx);
  }
  throw new Error('Invalid party/role for cancellation');
}
