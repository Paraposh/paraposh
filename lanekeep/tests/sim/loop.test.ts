import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/sim/loop';
import { Sim } from '../../src/sim/sim';
import { loadData } from '../helpers';

describe('FixedStepLoop', () => {
  it('1x runs 60 ticks per second, 2x runs 120, pause runs 0', () => {
    const sim = new Sim(loadData(), 1);
    const loop = new FixedStepLoop(sim, 1000);
    loop.speed = 1;
    loop.advance(1);
    expect(sim.tick).toBe(60);
    loop.speed = 2;
    loop.advance(1);
    expect(sim.tick).toBe(180);
    loop.speed = 0;
    loop.advance(5);
    expect(sim.tick).toBe(180);
  });
  it('frame rate does not change outcome', () => {
    const a = new Sim(loadData(), 7);
    const b = new Sim(loadData(), 7);
    const la = new FixedStepLoop(a, 1000);
    const lb = new FixedStepLoop(b, 1000);
    for (let i = 0; i < 120; i++) la.advance(1 / 60);
    for (let i = 0; i < 30; i++) lb.advance(1 / 15);
    expect(a.tick).toBe(b.tick);
    expect(a.hash()).toBe(b.hash());
  });
});
