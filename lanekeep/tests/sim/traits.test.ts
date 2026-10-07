import { describe, expect, it } from 'vitest';
import { validateGameData } from '../../src/data/validate';
import type { SimEvent } from '../../src/sim/core/types';
import type { Sim } from '../../src/sim/sim';
import { cloneData, injectEnemy, loadData, quietSim } from '../helpers';

const run = (sim: Sim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
};
const rate = 60;

describe('healsAllies', () => {
  it('heals wounded allies in radius by hpPerSec, never above max, never itself or those outside', () => {
    const sim = quietSim();
    const shaman = injectEnemy(sim, 'goblin_shaman', 100, 900);
    const near = injectEnemy(sim, 'goblin_runner', 110, 901);
    const far = injectEnemy(sim, 'goblin_runner', 600, 902);
    shaman.blockers.push(-1); // pin everyone in place so distances hold
    near.blockers.push(-1);
    far.blockers.push(-1);
    near.hp = 10;
    far.hp = 10;
    shaman.hp = 50;
    run(sim, 2);
    const hps = (sim.data.enemies['goblin_shaman']!.traits[0] as { hpPerSec: number }).hpPerSec;
    expect(near.hp).toBeCloseTo(10 + 2 * hps, 1);
    expect(far.hp).toBe(10);
    expect(shaman.hp).toBe(50);
    run(sim, 30);
    expect(near.hp).toBe(near.maxHp);
  });
});

describe('summons and splitsOnDeath', () => {
  const brood = (mut?: (d: ReturnType<typeof loadData>) => void) =>
    quietSim((d) => {
      d.level.startGold = 5000;
      mut?.(d);
    });

  it('summons count enemies every interval behind the summoner; they pay no bounty', () => {
    const sim = brood();
    const mother = injectEnemy(sim, 'brood_mother', 300, 900);
    const trait = sim.data.enemies['brood_mother']!.traits.find((t) => t.type === 'summons') as { interval: number; count: number };
    run(sim, trait.interval + 0.1);
    const kids = [...sim.enemies.values()].filter((e) => e.spawned);
    expect(kids).toHaveLength(trait.count);
    expect(kids.every((k) => k.defId === 'goblin_runner' && k.dist < mother.dist)).toBe(true);
    // killing a spawned enemy pays nothing
    const gold0 = sim.gold;
    kids[0]!.hp = 1;
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    run(sim, 8);
    expect(sim.gold).toBeLessThanOrEqual(gold0 - 70 + sim.data.enemies['goblin_runner']!.bounty * 0); // only spend, no bounty from spawned kills
  });

  it('splits into count enemies at the death position; parent pays bounty, children do not', () => {
    const sim = brood((d) => {
      d.enemies['brood_mother']!.traits = d.enemies['brood_mother']!.traits.filter((t) => t.type === 'splitsOnDeath');
    });
    const mother = injectEnemy(sim, 'brood_mother', 400, 900);
    mother.hp = 1;
    mother.blockers.push(-1);
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    const gold0 = sim.gold - 70;
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 6 && !events.some((e) => e.type === 'enemyKilled'); i++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(events.some((e) => e.type === 'enemyKilled' && e.id === 900)).toBe(true);
    const kids = [...sim.enemies.values()].filter((e) => e.spawned);
    expect(kids.length).toBe(3);
    expect(kids.every((k) => Math.abs(k.dist - mother.dist) <= 8 * 3)).toBe(true);
    run(sim, 6);
    expect(sim.gold).toBeGreaterThanOrEqual(gold0 + sim.data.enemies['brood_mother']!.bounty);
    // children never carry bounty
    const kill = events.filter((e) => e.type === 'enemyKilled');
    expect(kill.filter((e) => e.type === 'enemyKilled' && e.id !== 900 && e.gold > 0)).toHaveLength(0);
  });
});

describe('ranged', () => {
  it('shoots a soldier in range while walking, without needing to be blocked', () => {
    const sim = quietSim();
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    run(sim, 6);
    const soldier = [...sim.soldiers.values()][0]!;
    const hp0 = soldier.hp;
    const archer = injectEnemy(sim, 'goblin_archer', 300, 900);
    const events = run(sim, 4);
    const shots = events.filter((e) => e.type === 'meleeHit' && e.onSoldier && e.attackerId === 900);
    expect(shots.length).toBeGreaterThan(0);
    const sDef = sim.data.soldiers['footman']!;
    expect(shots[0]!.type === 'meleeHit' && shots[0]!.damage).toBeCloseTo(5 * (1 - sDef.armor), 5);
    expect(hp0).toBeGreaterThan(0);
  });

  it('does not fire at soldiers beyond range', () => {
    const sim = quietSim();
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    run(sim, 6);
    injectEnemy(sim, 'goblin_archer', 20, 900); // far from the rally point
    const events = run(sim, 2);
    expect(events.some((e) => e.type === 'meleeHit' && e.attackerId === 900)).toBe(false);
  });
});

describe('enrage', () => {
  it('triggers once at the hp threshold, speeds the enemy up and boosts damage', () => {
    const sim = quietSim();
    const ogre = injectEnemy(sim, 'ogre', 100, 900);
    const trait = sim.data.enemies['ogre']!.traits[0] as { hpThreshold: number; speedMult: number; damageMult: number };
    run(sim, 1);
    const d1 = ogre.dist;
    expect(ogre.enraged).toBe(false);
    ogre.hp = ogre.maxHp * trait.hpThreshold - 1;
    const events = run(sim, 1);
    expect(events.filter((e) => e.type === 'enemyEnraged')).toHaveLength(1);
    expect(ogre.enraged).toBe(true);
    expect(ogre.speedMult).toBeCloseTo(trait.speedMult);
    expect(ogre.damageMult).toBeCloseTo(trait.damageMult);
    const before = ogre.dist;
    run(sim, 1);
    const speed = sim.data.enemies['ogre']!.speed;
    expect(ogre.dist - before).toBeCloseTo((speed * trait.speedMult) / rate * rate, 0);
    expect(d1).toBeGreaterThan(100);
    // does not stack on repeated checks
    run(sim, 2);
    expect(ogre.speedMult).toBeCloseTo(trait.speedMult);
  });
});

describe('boss phases', () => {
  const boss = (dist = 50) => {
    const sim = quietSim();
    const e = injectEnemy(sim, 'warlord', dist, 900);
    e.bossId = 'warlord';
    return { sim, e, def: sim.data.waves.bosses!['warlord']! };
  };

  it('enters phase 0 on its first tick and moves forward as hp drops, once each', () => {
    const { sim, e } = boss();
    let events = run(sim, 0.1);
    expect(e.phase).toBe(0);
    expect(events.filter((x) => x.type === 'bossPhase')).toHaveLength(1);
    e.hp = e.maxHp * 0.5;
    events = run(sim, 0.1);
    expect(e.phase).toBe(1);
    expect(events.filter((x) => x.type === 'bossPhase')).toHaveLength(1);
    e.hp = e.maxHp * 0.1;
    run(sim, 0.1);
    expect(e.phase).toBe(2);
    e.hp = e.maxHp; // healing back does not rewind phases
    run(sim, 0.1);
    expect(e.phase).toBe(2);
  });

  it('phase actions run on entry: summons, enrage; modifiers apply while active', () => {
    const { sim, e, def } = boss();
    run(sim, 0.1);
    e.hp = e.maxHp * 0.5;
    run(sim, 0.1);
    const summon = def.phases[1]!.onEnter![0] as { count: number };
    expect([...sim.enemies.values()].filter((x) => x.spawned)).toHaveLength(summon.count);
    const base = sim.data.enemies['warlord']!.speed;
    const d0 = e.dist;
    e.blockers = [];
    run(sim, 1);
    expect(e.dist - d0).toBeCloseTo(base * def.phases[1]!.speedMult!, 0);
    e.hp = e.maxHp * 0.1;
    run(sim, 0.1);
    expect(e.enraged).toBe(true);
  });

  it('armorDelta changes damage taken in that phase', () => {
    const phaseDamage = (hpFrac: number) => {
      const { sim, e } = boss(400);
      sim.data.enemies['warlord']!.hp = 1e6;
      e.hp = e.maxHp = 1e6;
      e.hp = e.maxHp * hpFrac;
      e.blockers.push(-1);
      sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
      const dmg: number[] = [];
      for (let i = 0; i < 60 * 20 && dmg.length === 0; i++) {
        sim.step();
        for (const ev of sim.drainEvents()) if (ev.type === 'projectileHit' && ev.targetId === 900) dmg.push(ev.damage);
      }
      return dmg[0]!;
    };
    // phase 2 armorDelta -0.15 vs phase 0 base armor: raw rolls differ, so compare effective multiplier
    const tier = loadData().towers['archer'] as unknown as { tiers: { damage: [number, number]; armorPen: number }[] };
    const armor = loadData().enemies['warlord']!.armor;
    const lo = phaseDamage(0.9) / (1 - (armor - tier.tiers[0]!.armorPen));
    const hi = phaseDamage(0.1) / (1 - (armor - 0.15 - tier.tiers[0]!.armorPen));
    for (const raw of [lo, hi]) {
      expect(raw).toBeGreaterThanOrEqual(tier.tiers[0]!.damage[0] - 1e-6);
      expect(raw).toBeLessThanOrEqual(tier.tiers[0]!.damage[1] + 1e-6);
    }
  });
});

describe('trait/boss data validation', () => {
  it('rejects a summon trait naming an unknown enemy', () => {
    const d = cloneData(loadData());
    (d.enemies['brood_mother']!.traits[0] as { enemyId: string }).enemyId = 'nope';
    expect(() => validateGameData(d)).toThrow(/unknown enemy "nope"/);
  });
  it('rejects unknown trait fields', () => {
    const d = cloneData(loadData());
    d.enemies['ogre']!.traits = [{ type: 'enrage', hpThreshold: 0.4 } as never];
    expect(() => validateGameData(d)).toThrow();
  });
  it('rejects boss phases that do not strictly decrease', () => {
    const d = cloneData(loadData());
    d.waves.bosses!['warlord']!.phases[1]!.hpAbove = 0.9;
    expect(() => validateGameData(d)).toThrow(/strictly decreasing/);
  });
  it('rejects a group naming both enemyId and bossId, or a missing boss', () => {
    const d = cloneData(loadData());
    d.waves.waves[5]!.groups[1]!.enemyId = 'goblin_runner';
    expect(() => validateGameData(d)).toThrow();
    const d2 = cloneData(loadData());
    d2.waves.waves[5]!.groups[1]!.bossId = 'ghost';
    expect(() => validateGameData(d2)).toThrow(/unknown boss "ghost"/);
  });
});
