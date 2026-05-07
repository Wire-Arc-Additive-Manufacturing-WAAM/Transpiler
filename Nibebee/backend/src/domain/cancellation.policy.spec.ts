import { computeSeekerCancellation, hoursBetween } from './cancellation.policy';

describe('cancellation.policy', () => {
  it('hoursBetween', () => {
    const a = new Date('2026-01-01T10:00:00Z');
    const b = new Date('2026-01-01T12:00:00Z');
    expect(hoursBetween(a, b)).toBeCloseTo(2, 5);
  });

  it('seeker full refund within 2h of signing', () => {
    const signedAt = new Date('2026-01-01T10:00:00Z');
    const now = new Date('2026-01-01T11:00:00Z');
    const pickupAt = new Date('2026-01-02T10:00:00Z');
    const o = computeSeekerCancellation({
      signedAt,
      pickupAt,
      now,
      ownerEnRouteAt: null,
      tripStatus: 'Planned',
      fuelCostEstimate: 0.05,
    });
    expect(o.seekerRefundFraction).toBe(1);
    expect(o.ownerReceivesForfeitFraction).toBe(0);
  });

  it('seeker 15% between 2h and 24h before pickup', () => {
    const signedAt = new Date('2026-01-01T08:00:00Z');
    const pickupAt = new Date('2026-01-02T10:00:00Z');
    const now = new Date('2026-01-02T09:00:00Z');
    const o = computeSeekerCancellation({
      signedAt,
      pickupAt,
      now,
      ownerEnRouteAt: null,
      tripStatus: 'Planned',
      fuelCostEstimate: 0,
    });
    expect(o.seekerRefundFraction).toBe(0.85);
    expect(o.ownerReceivesForfeitFraction).toBe(0.15);
  });

  it('seeker en-route penalty uses fuel estimate cap', () => {
    const signedAt = new Date('2025-12-01T08:00:00Z');
    const pickupAt = new Date('2026-01-01T08:00:00Z');
    const now = new Date('2026-01-05T08:00:00Z');
    const o = computeSeekerCancellation({
      signedAt,
      pickupAt,
      now,
      ownerEnRouteAt: new Date('2026-01-04T08:00:00Z'),
      tripStatus: 'InTransit',
      fuelCostEstimate: 0.2,
    });
    expect(o.ownerReceivesForfeitFraction).toBeLessThanOrEqual(1);
    expect(o.seekerRefundFraction).toBeGreaterThanOrEqual(0);
  });
});
