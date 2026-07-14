import { describe, expect, it } from 'vitest';
import { calculatePrice, haversineKm, overlaps, roundDurationMinutes } from './domain.js';

describe('reservation calculations', () => {
  it('rounds charging duration up to 15-minute blocks', () => {
    expect(roundDurationMinutes(20, 30)).toBe(45);
    expect(roundDurationMinutes(5, 100)).toBe(15);
    expect(roundDurationMinutes(45, 30)).toBe(90);
  });

  it('calculates INR cost without floating point noise', () => {
    expect(calculatePrice(12.5, 18)).toBe(225);
  });

  it('detects overlaps but permits adjacent reservations', () => {
    expect(overlaps('2026-07-15T10:00:00Z', '2026-07-15T11:00:00Z', '2026-07-15T10:30:00Z', '2026-07-15T11:30:00Z')).toBe(true);
    expect(overlaps('2026-07-15T10:00:00Z', '2026-07-15T11:00:00Z', '2026-07-15T11:00:00Z', '2026-07-15T12:00:00Z')).toBe(false);
  });

  it('computes geographic distance for routing shortlist', () => {
    expect(haversineKm([13.3409, 77.101], [13.35, 77.11])).toBeGreaterThan(1);
  });
});
