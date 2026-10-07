import { describe, expect, it } from 'vitest';
import { damageAfterResist } from '../../src/sim/math/damage';

const cfg = { resistMin: 0, resistMax: 0.9 };

describe('damageAfterResist', () => {
  it('physical uses armor', () => expect(damageAfterResist(100, 'physical', 0.3, 0.9, cfg)).toBeCloseTo(70));
  it('magic uses magic resist', () => expect(damageAfterResist(100, 'magic', 0.9, 0.5, cfg)).toBeCloseTo(50));
  it('true ignores resist', () => expect(damageAfterResist(100, 'true', 0.9, 0.9, cfg)).toBe(100));
  it('clamps resist to max', () => expect(damageAfterResist(100, 'physical', 1, 0, cfg)).toBeCloseTo(10));
  it('clamps negative resist to min', () => expect(damageAfterResist(100, 'physical', -1, 0, cfg)).toBe(100));
});
