import { describe, expect, it } from 'vitest';
import { SplinePath } from '../../src/sim/math/spline';

describe('SplinePath', () => {
  it('linear path has exact length and endpoints', () => {
    const p = new SplinePath([[0, 0], [100, 0], [100, 50]], 'linear', 8);
    expect(p.length).toBeCloseTo(150);
    expect(p.sample(0)).toMatchObject({ x: 0, y: 0 });
    const end = p.sample(150);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
  it('catmull-rom passes through control points', () => {
    const pts: [number, number][] = [[0, 0], [100, 50], [200, 0], [300, 80]];
    const p = new SplinePath(pts, 'catmullRom', 32);
    const s0 = p.sample(0);
    expect([s0.x, s0.y]).toEqual([0, 0]);
    const end = p.sample(p.length);
    expect(end.x).toBeCloseTo(300);
    expect(end.y).toBeCloseTo(80);
  });
  it('normal is unit length and perpendicular to travel', () => {
    const p = new SplinePath([[0, 0], [100, 0]], 'linear', 2);
    const s = p.sample(50);
    expect(Math.hypot(s.nx, s.ny)).toBeCloseTo(1);
    expect(s.nx).toBeCloseTo(0);
    expect(s.ny).toBeCloseTo(1);
  });
  it('clamps distance outside [0, length]', () => {
    const p = new SplinePath([[0, 0], [10, 0]], 'linear', 2);
    expect(p.sample(-5).x).toBe(0);
    expect(p.sample(999).x).toBe(10);
  });
});
