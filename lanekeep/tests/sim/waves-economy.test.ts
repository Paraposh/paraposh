import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/core/types';
import type { ShooterTowerDef } from '../../src/data/types';
import { Sim } from '../../src/sim/sim';
import { loadData, quietSim, shooterTier } from '../helpers';

const run = (sim: Sim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
};

describe('wave sequencing', () => {
  it('wave 1 starts after its preDelay; the next wave timer starts once spawning finishes', () => {
    const sim = new Sim(loadData(), 1);
    const w = sim.data.waves.waves;
    const events = run(sim, w[0]!.preDelay + 1);
    const started = events.filter((e) => e.type === 'waveStarted');
    expect(started).toHaveLength(1);
    expect(started[0]!.tick).toBe(sim.ticks(w[0]!.preDelay));
    expect(sim.status).toBe('wave');
    expect(sim.waveIndex).toBe(1);
  });

  it('starts waves in order and ends the level only after the last wave is cleared', () => {
    const d = loadData();
    d.config.startingLives = 100000; // outlast the waves with no defenses so every wave starts
    const sim = new Sim(d, 1);
    const started: number[] = [];
    while (sim.status !== 'won' && sim.status !== 'lost' && sim.tick < 60 * 600) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'waveStarted') started.push(e.index);
    }
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(sim.status).toBe('won');
    expect(sim.stars).toBe(3);
  });

  it('next wave preDelay counts from the end of the previous wave spawning', () => {
    const sim = new Sim(loadData(), 1);
    const waves = sim.data.waves.waves;
    const starts: number[] = [];
    for (let i = 0; i < 60 * 120; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'waveStarted') starts.push(e.tick);
    }
    const lastOffset = Math.max(...waves[0]!.groups.map((g) => sim.ticks(g.startDelay) + sim.ticks(g.interval * (g.count - 1))));
    expect(starts[1]! - starts[0]!).toBe(lastOffset + sim.ticks(waves[1]!.preDelay));
  });
});

describe('call next wave early', () => {
  it('grants 1 gold per second skipped, capped, and starts the wave immediately', () => {
    const sim = new Sim(loadData(), 1);
    const gold0 = sim.gold;
    run(sim, 4); // 10s preDelay: 6s left
    sim.queue({ type: 'callWave' });
    const events = run(sim, 1);
    const called = events.find((e) => e.type === 'waveCalled');
    expect(called && called.type === 'waveCalled' ? called.bonus : -1).toBe(Math.floor(6 * sim.data.config.earlyCallGoldPerSec));
    expect(sim.gold).toBe(gold0 + 6);
    expect(events.some((e) => e.type === 'waveStarted')).toBe(true);
  });

  it('respects earlyCallMaxBonus', () => {
    const sim = quietSim((d) => {
      d.waves.waves[0]!.preDelay = 500;
      d.config.earlyCallMaxBonus = 40;
    });
    const gold0 = sim.gold;
    sim.queue({ type: 'callWave' });
    sim.step();
    expect(sim.gold).toBe(gold0 + 40);
  });

  it('is rejected while a wave is still spawning (nothing to call)', () => {
    const sim = quietSim(); // wave 1 spawns at t=9999s, so no next wave is pending
    run(sim, 11);
    sim.queue({ type: 'callWave' });
    const events = run(sim, 1);
    expect(events.some((e) => e.type === 'commandRejected')).toBe(true);
  });
});

describe('upgrades, specializations, selling', () => {
  const setup = () => {
    const sim = quietSim((d) => {
      d.level.startGold = 5000;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    sim.step();
    return { sim, tower: [...sim.towers.values()][0]! };
  };

  it('upgrades through all base tiers, then only specialization remains', () => {
    const { sim, tower } = setup();
    const costs = sim.data.towers['archer']!.tiers.map((t) => t.cost);
    const gold0 = sim.gold;
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'upgradeTower', towerId: tower.id }); // beyond final tier: rejected
    sim.step();
    expect(tower.tier).toBe(2);
    expect(gold0 - sim.gold).toBe(costs[1]! + costs[2]!);
    expect(tower.invested).toBe(costs[0]! + costs[1]! + costs[2]!);
    expect(sim.drainEvents().filter((e) => e.type === 'commandRejected')).toHaveLength(1);
  });

  it('cannot specialize before the final tier, and only once', () => {
    const { sim, tower } = setup();
    sim.queue({ type: 'specialize', towerId: tower.id, specId: 'sharpshooter' });
    sim.step();
    expect(tower.specId).toBe('');
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'specialize', towerId: tower.id, specId: 'sharpshooter' });
    sim.queue({ type: 'specialize', towerId: tower.id, specId: 'rapidRanger' });
    sim.step();
    expect(tower.specId).toBe('sharpshooter');
    const rejected = sim.drainEvents().filter((e) => e.type === 'commandRejected');
    expect(rejected.length).toBeGreaterThanOrEqual(2);
  });

  it('specialization overrides stats of the last tier', () => {
    const { sim, tower } = setup();
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'upgradeTower', towerId: tower.id });
    sim.queue({ type: 'specialize', towerId: tower.id, specId: 'sharpshooter' });
    sim.step();
    const eff = sim.tierOf(tower) as ReturnType<typeof shooterTier>;
    const spec = (sim.data.towers['archer'] as ShooterTowerDef).specializations!['sharpshooter']!;
    expect(eff.damage).toEqual(spec.damage);
    expect(eff.cooldown).toBe(spec.cooldown);
    expect(eff.damageType).toBe('physical'); // inherited from tier 3
  });

  it('upgrades fail without gold', () => {
    const sim = quietSim((d) => {
      d.level.startGold = 80;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    sim.step();
    sim.queue({ type: 'upgradeTower', towerId: [...sim.towers.keys()][0]! });
    sim.step();
    expect([...sim.towers.values()][0]!.tier).toBe(0);
  });

  it('selling refunds sellRefundPct of total invested, frees the spot and removes soldiers', () => {
    const sim = quietSim((d) => {
      d.level.startGold = 5000;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    sim.step();
    const b = [...sim.towers.values()][0]!;
    sim.queue({ type: 'upgradeTower', towerId: b.id });
    run(sim, 4);
    expect(sim.soldiers.size).toBe(3);
    const invested = b.invested;
    const gold0 = sim.gold;
    sim.queue({ type: 'sellTower', towerId: b.id });
    sim.step();
    expect(sim.gold - gold0).toBe(Math.floor(invested * sim.data.config.sellRefundPct));
    expect(sim.towers.size).toBe(0);
    expect(sim.soldiers.size).toBe(0);
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    sim.step();
    expect(sim.towers.size).toBe(1);
  });

  it('upgrading a barracks swaps its soldiers for the new type', () => {
    const sim = quietSim((d) => {
      d.level.startGold = 5000;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    run(sim, 3);
    const b = [...sim.towers.values()][0]!;
    sim.queue({ type: 'upgradeTower', towerId: b.id });
    run(sim, 2);
    expect([...sim.soldiers.values()].every((s) => s.defId === 'veteran')).toBe(true);
    sim.queue({ type: 'upgradeTower', towerId: b.id });
    sim.queue({ type: 'specialize', towerId: b.id, specId: 'skirmishers' });
    run(sim, 2);
    expect(sim.soldiers.size).toBe(5);
    expect([...sim.soldiers.values()].every((s) => s.defId === 'raider')).toBe(true);
  });
});

describe('stars', () => {
  it('maps lives remaining to stars using config thresholds, 0 on a loss', () => {
    const sim = quietSim();
    sim.status = 'won';
    for (const [lives, stars] of [[20, 3], [18, 3], [17, 2], [10, 2], [9, 1], [1, 1]] as const) {
      sim.lives = lives;
      expect(sim.stars, `lives ${lives}`).toBe(stars);
    }
    sim.status = 'lost';
    sim.lives = 0;
    expect(sim.stars).toBe(0);
  });
});
