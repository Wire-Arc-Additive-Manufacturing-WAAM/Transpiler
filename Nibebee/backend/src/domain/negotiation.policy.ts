import { BookingRequestStatus, NegotiationActor } from '@prisma/client';

export const MAX_COUNTERS = 3;

export type OwnerAction = 'accept' | 'reject' | 'counter';
export type SeekerAction = 'accept' | 'reject' | 'counter';

export interface NegotiationRoundRow {
  roundIndex: number;
  actor: NegotiationActor;
  action: string;
  amount: number | null;
}

export function countCounters(rounds: NegotiationRoundRow[]): number {
  return rounds.filter((r) => r.action === 'counter').length;
}

export function lastRound(
  rounds: NegotiationRoundRow[],
): NegotiationRoundRow | undefined {
  return [...rounds].sort((a, b) => b.roundIndex - a.roundIndex)[0];
}

export function assertOwnerCanAct(
  status: BookingRequestStatus,
  rounds: NegotiationRoundRow[],
  action: OwnerAction,
  counterAmount?: number,
): void {
  if (status !== BookingRequestStatus.Pending) {
    throw new Error('Booking is not awaiting owner action');
  }
  const last = lastRound(rounds);
  if (!last) throw new Error('No negotiation rounds');
  if (last.actor !== NegotiationActor.Seeker) {
    throw new Error('Owner cannot act twice in a row');
  }
  if (action === 'counter') {
    const c = countCounters(rounds);
    if (c >= MAX_COUNTERS) {
      throw new Error('Maximum negotiation counters reached');
    }
    if (counterAmount == null || counterAmount <= 0) {
      throw new Error('Counter requires positive amount');
    }
  }
}

export function assertSeekerCanAct(
  status: BookingRequestStatus,
  rounds: NegotiationRoundRow[],
  action: SeekerAction,
  counterAmount?: number,
): void {
  if (status !== BookingRequestStatus.Countered) {
    throw new Error('Booking is not awaiting seeker response');
  }
  const last = lastRound(rounds);
  if (!last || last.actor !== NegotiationActor.Owner) {
    throw new Error('Seeker cannot act now');
  }
  if (action === 'counter') {
    const c = countCounters(rounds);
    if (c >= MAX_COUNTERS) {
      throw new Error('Maximum negotiation counters reached');
    }
    if (counterAmount == null || counterAmount <= 0) {
      throw new Error('Counter requires positive amount');
    }
  }
}

export function nextRoundIndex(rounds: NegotiationRoundRow[]): number {
  if (!rounds.length) return 1;
  return Math.max(...rounds.map((r) => r.roundIndex)) + 1;
}
