/**
 * Property-style "backtest" over randomized cancellation windows
 * to assert invariants (refund fractions stay in [0,1], forfeiture bounded).
 */
import { computeCancellation } from './cancellation.policy';
import { UserRole } from '@prisma/client';

function rndDate(base: number, offsetHours: number): Date {
  return new Date(base + offsetHours * 3600000);
}

describe('backtest.simulation — cancellation invariants', () => {
  const base = Date.UTC(2026, 3, 1, 8, 0, 0);

  it('1000 random seeker cancellations stay valid', () => {
    for (let i = 0; i < 1000; i++) {
      const signedOffset = -Math.floor(Math.random() * 200);
      const pickupOffset = Math.floor(Math.random() * 300) + 5;
      const nowOffset =
        signedOffset + Math.floor(Math.random() * (pickupOffset - signedOffset));
      const signedAt = rndDate(base, signedOffset);
      const pickupAt = rndDate(base, pickupOffset);
      const now = rndDate(base, nowOffset);
      const enRoute = Math.random() > 0.7;
      const o = computeCancellation('seeker', UserRole.LoadSeeker, {
        signedAt,
        pickupAt,
        now,
        ownerEnRouteAt: enRoute ? rndDate(base, nowOffset - 1) : null,
        tripStatus: enRoute ? 'InTransit' : 'Planned',
        fuelCostEstimate: Math.random() * 0.4,
      });
      expect(o.seekerRefundFraction).toBeGreaterThanOrEqual(0);
      expect(o.seekerRefundFraction).toBeLessThanOrEqual(1);
      expect(o.ownerReceivesForfeitFraction).toBeGreaterThanOrEqual(0);
      expect(o.ownerReceivesForfeitFraction).toBeLessThanOrEqual(1);
    }
  });
});
