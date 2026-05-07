import {
  BookingRequestStatus,
  NegotiationActor,
} from '@prisma/client';
import {
  MAX_COUNTERS,
  assertOwnerCanAct,
  assertSeekerCanAct,
  countCounters,
  nextRoundIndex,
} from './negotiation.policy';

describe('negotiation.policy', () => {
  const r1 = {
    roundIndex: 1,
    actor: NegotiationActor.Seeker,
    action: 'offer',
    amount: 100,
  };

  it('counts counters', () => {
    expect(
      countCounters([
        r1,
        {
          roundIndex: 2,
          actor: NegotiationActor.Owner,
          action: 'counter',
          amount: 110,
        },
      ]),
    ).toBe(1);
  });

  it('owner can counter when under cap', () => {
    expect(() =>
      assertOwnerCanAct(BookingRequestStatus.Pending, [r1], 'counter', 120),
    ).not.toThrow();
  });

  it('seeker cannot counter after MAX_COUNTERS', () => {
    const rounds = [
      r1,
      {
        roundIndex: 2,
        actor: NegotiationActor.Owner,
        action: 'counter',
        amount: 110,
      },
      {
        roundIndex: 3,
        actor: NegotiationActor.Seeker,
        action: 'counter',
        amount: 105,
      },
      {
        roundIndex: 4,
        actor: NegotiationActor.Owner,
        action: 'counter',
        amount: 108,
      },
    ];
    expect(countCounters(rounds)).toBe(MAX_COUNTERS);
    expect(() =>
      assertSeekerCanAct(BookingRequestStatus.Countered, rounds, 'counter', 106),
    ).toThrow();
  });

  it('nextRoundIndex', () => {
    expect(nextRoundIndex([r1])).toBe(2);
    expect(nextRoundIndex([])).toBe(1);
  });

  it('seeker acts only when countered', () => {
    expect(() =>
      assertSeekerCanAct(BookingRequestStatus.Pending, [r1], 'accept'),
    ).toThrow();
  });
});
