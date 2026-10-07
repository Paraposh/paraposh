import { describe, expect, it } from 'vitest';
import { validateGameData } from '../../src/data/validate';
import { cloneData, loadData } from '../helpers';

describe('data validation', () => {
  it('shipped data is valid', () => {
    expect(() => loadData()).not.toThrow();
  });
  it('rejects a bad enemy field with a readable message', () => {
    const d = cloneData(loadData());
    (d.enemies['goblin_runner'] as unknown as { hp: unknown }).hp = 'lots';
    expect(() => validateGameData(d)).toThrow(/enemies\/goblin_runner\/hp/);
  });
  it('rejects unknown enemy reference in waves', () => {
    const d = cloneData(loadData());
    (d.waves.waves[0] as { groups: { enemyId: string }[] }).groups[0]!.enemyId = 'nope';
    expect(() => validateGameData(d)).toThrow(/unknown enemy "nope"/);
  });
  it('rejects unknown path reference in waves', () => {
    const d = cloneData(loadData());
    (d.waves.waves[0] as { groups: { path: string }[] }).groups[0]!.path = 'nope';
    expect(() => validateGameData(d)).toThrow(/unknown path "nope"/);
  });
});
