import { describe, expect, it } from 'vitest';
import { leadIntercept } from '../../src/sim/math/lead';

describe('leadIntercept', () => {
  it('stationary target: aims at it', () => {
    const r = leadIntercept(0, 0, 100, () => [100, 0], 4);
    expect(r.x).toBeCloseTo(100);
    expect(r.t).toBeCloseTo(1);
  });
  it('moving target: aims ahead and arrival time matches', () => {
    // target at (100,0) moving +y at 50/s; projectile speed 200 from origin
    const posAt = (t: number): [number, number] => [100, 50 * t];
    const r = leadIntercept(0, 0, 200, posAt, 8);
    expect(r.y).toBeGreaterThan(0);
    expect(Math.hypot(r.x, r.y) / 200).toBeCloseTo(r.t, 3);
  });
});
