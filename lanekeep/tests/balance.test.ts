import { describe, expect, it } from 'vitest';
import { playBot, type BotStep } from './bot';
import { loadData } from './helpers';

const P = (spot: string, tower: string): BotStep => ({ do: 'place', spot, tower });
const U = (spot: string): BotStep => ({ do: 'upgrade', spot });
const S = (spot: string, spec: string): BotStep => ({ do: 'spec', spot, spec });

const MIXED: BotStep[] = [
  P('s1', 'barracks'), P('s3', 'archer'), P('s2', 'mage'), P('s4', 'archer'),
  U('s3'), U('s2'), U('s1'), U('s4'), U('s3'), U('s2'), U('s1'), U('s4'),
  S('s3', 'sharpshooter'), S('s2', 'hexer'), S('s1', 'phalanx'),
];

/** Coarse balance guard rails for level 1. Not a tuning target: they fail only if the level becomes trivially easy or impossible. */
describe('level 1 balance', () => {
  it('doing nothing loses', () => {
    const sim = playBot(loadData(), 1, []);
    expect(sim.status).toBe('lost');
  });

  it('a sensible mixed build wins on several seeds with at least one star', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = playBot(loadData(), seed, MIXED);
      expect(sim.status, `seed ${seed}`).toBe('won');
      expect(sim.stars, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic: same seed and plan give the same result', () => {
    const a = playBot(loadData(), 7, MIXED);
    const b = playBot(loadData(), 7, MIXED);
    expect(a.hash()).toBe(b.hash());
  });
});
