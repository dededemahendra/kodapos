import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOYALTY,
  maxRedeemablePoints,
  pointsEarned,
  redemptionIDR,
} from '../../convex/lib/loyalty';

const cfg = { ...DEFAULT_LOYALTY, enabled: true }; // 1pt/Rp1000, 100pt=Rp10000

describe('pointsEarned', () => {
  it('floors net base by earn rate', () => {
    expect(pointsEarned(50000, cfg)).toBe(50); // 50000 / 1000
    expect(pointsEarned(50999, cfg)).toBe(50); // floors
  });
  it('returns 0 when disabled', () => {
    expect(pointsEarned(50000, { ...cfg, enabled: false })).toBe(0);
  });
  it('returns 0 for a non-positive base or rate', () => {
    expect(pointsEarned(0, cfg)).toBe(0);
    expect(pointsEarned(50000, { ...cfg, earnRatePerIDR: 0 })).toBe(0);
  });
});

describe('redemptionIDR', () => {
  it('values whole blocks', () => {
    expect(redemptionIDR(100, cfg)).toBe(10000);
    expect(redemptionIDR(250, cfg)).toBe(20000); // floors to 2 blocks
  });
  it('returns 0 for sub-block or disabled', () => {
    expect(redemptionIDR(50, cfg)).toBe(0);
    expect(redemptionIDR(100, { ...cfg, enabled: false })).toBe(0);
  });
});

describe('maxRedeemablePoints', () => {
  it('limited by balance, in whole blocks', () => {
    expect(maxRedeemablePoints(250, 100000, cfg)).toBe(200); // 2 blocks
  });
  it('limited by remaining goods value', () => {
    expect(maxRedeemablePoints(1000, 15000, cfg)).toBe(100); // only 1 block fits Rp15000
  });
  it('returns 0 when disabled or nothing fits', () => {
    expect(maxRedeemablePoints(1000, 100000, { ...cfg, enabled: false })).toBe(0);
    expect(maxRedeemablePoints(50, 100000, cfg)).toBe(0);
  });
});
