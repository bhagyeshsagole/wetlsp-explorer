import { describe, expect, it } from 'vitest';
import { keyDates } from './keyDates';

/** A clean seasonal bump: 0.2 baseline, 0.6 peak on day 181 (2024-06-29). */
function season(days = 366, base = 0.2, peak = 0.6) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
    const x = (i - 180) / 45;
    return { date: d, mean: base + (peak - base) * Math.exp(-x * x) };
  });
}

describe('keyDates', () => {
  it('finds the peak and symmetric half-amplitude crossings', () => {
    const k = keyDates(season())!;
    expect(k.peak.date).toBe('2024-06-29');
    expect(k.amplitude).toBeCloseTo(0.4, 2);
    // exp(-x²) = 0.5 at x ≈ 0.8326 → 37.47 days either side of day index 180.
    expect(k.greenUp!.date).toBe('2024-05-23');
    expect(k.greenDown!.date).toBe('2024-08-05');
    expect(k.seasonDays).toBe(74);
  });

  it('returns null for a flat line', () => {
    expect(keyDates(season(366, 0.3, 0.305))).toBeNull();
  });

  it('returns null with too few points', () => {
    expect(keyDates(season().slice(0, 5))).toBeNull();
  });

  it('leaves green-down empty when the curve is still high at the end of the range', () => {
    const k = keyDates(season().slice(0, 200))!;
    expect(k.greenUp).not.toBeNull();
    expect(k.greenDown).toBeNull();
    expect(k.seasonDays).toBeNull();
  });
});
