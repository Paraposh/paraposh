import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/types';
import { damageAfterResist, effectiveResist } from '../../src/sim/math/damage';
import { splashFactor } from '../../src/sim/math/splash';
import { Sim } from '../../src/sim/sim';
import type { Enemy, SimEvent } from '../../src/sim/core/types';
import { cloneData, loadData } from '../helpers';

const cfg = { resistMin: 0, resistMax: 0.9 };

describe('damage formula with reductions', () => {
  it('effective resist subtracts shred + pen then clamps', () => {
    expect(effectiveResist(0.5, 0.2, cfg)).toBeCloseTo(0.3);
    expect(effectiveResist(0.5, 0.9, cfg)).toBe(0);
    expect(effectiveResist(1.5, 0, cfg)).toBe(0.9);
  });
  it('armor reduction only affects physical, magic reduction only magic', () => {
    const mods = { armorReduction: 0.2, magicReduction: 0 };
    expect(damageAfterResist(100, 'physical', 0.5, 0.5, cfg, mods)).toBeCloseTo(70);
    expect(damageAfterResist(100, 'magic', 0.5, 0.5, cfg, mods)).toBeCloseTo(50);
    expect(damageAfterResist(100, 'true', 0.5, 0.5, cfg, mods)).toBe(100);
  });
  it('penetration cannot push resist below the floor', () => {
    expect(damageAfterResist(100, 'physical', 0.1, 0, cfg, { armorReduction: 1, magicReduction: 0 })).toBe(100);
  });
});

describe('splashFactor', () => {
  it('1 at centre, edgeMult at the rim, 0 outside, linear between', () => {
    expect(splashFactor(0, 50, 0.4)).toBe(1);
    expect(splashFactor(50, 50, 0.4)).toBeCloseTo(0.4);
    expect(splashFactor(25, 50, 0.4)).toBeCloseTo(0.7);
    expect(splashFactor(50.01, 50, 0.4)).toBe(0);
  });
});

function setup(mut?: (d: GameData) => void): Sim {
  const d = cloneData(loadData());
  // no scheduled spawns interfere: we inject enemies by hand
  d.waves.waves[0]!.groups = [{ enemyId: 'goblin_runner', count: 1, interval: 0, startDelay: 999, path: 'main' }];
  mut?.(d);
  return new Sim(d, 1);
}

function inject(sim: Sim, defId: string, dist: number, id: number): Enemy {
  const e: Enemy = {
    id, defId, pathId: 'main', laneOffset: 0, dist,
    hp: (sim.data.enemies[defId] as { hp: number }).hp, maxHp: 0, x: 0, y: 0, prevX: 0, prevY: 0,
    shredArmor: 0, shredMagic: 0, shredStacks: 0, shredTicks: 0,
  };
  e.maxHp = e.hp;
  [e.x, e.y] = sim.positionAt(e, dist);
  e.prevX = e.x;
  e.prevY = e.y;
  sim.enemies.set(id, e);
  return e;
}

/** Run until the first projectileHit event batch and return all hit events. */
function firstHits(sim: Sim, maxTicks = 600): Extract<SimEvent, { type: 'projectileHit' }>[] {
  const hits: Extract<SimEvent, { type: 'projectileHit' }>[] = [];
  for (let i = 0; i < maxTicks && hits.length === 0; i++) {
    sim.step();
    for (const ev of sim.drainEvents()) if (ev.type === 'projectileHit') hits.push(ev);
  }
  return hits;
}

describe('armor penetration', () => {
  const dmgWithPen = (pen: number) => {
    const sim = setup((d) => {
      d.towers['archer']!.tiers[0]!.armorPen = pen;
      d.enemies['armored_brute']!.hp = 10000;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    inject(sim, 'armored_brute', 400, 900);
    return firstHits(sim)[0]!.damage;
  };
  it('pen raises damage against armor by exactly the formula', () => {
    const base = dmgWithPen(0); // armor 0.5 -> x0.5
    const pen = dmgWithPen(0.3); // armor 0.2 -> x0.8
    expect(pen / base).toBeCloseTo(0.8 / 0.5, 5);
  });
});

describe('magic damage', () => {
  it('mage ignores armor and is reduced by magic resist', () => {
    const run = (enemy: string) => {
      const sim = setup((d) => {
        d.enemies[enemy]!.hp = 10000;
      });
      sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'mage' });
      inject(sim, enemy, 400, 900);
      return firstHits(sim)[0]!.damage;
    };
    const vsBrute = run('armored_brute'); // armor 0.5, mr 0 -> full magic damage
    const vsWisp = run('arcane_wisp'); // mr 0.6 -> x0.4
    expect(vsWisp / vsBrute).toBeCloseTo(0.4, 5);
  });
  it('archer physical vs wisp is unaffected by magic resist', () => {
    const sim = setup((d) => {
      d.towers['archer']!.tiers[0]!.armorPen = 0;
      d.enemies['arcane_wisp']!.hp = 10000;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    inject(sim, 'arcane_wisp', 400, 900);
    const hit = firstHits(sim)[0]!;
    const tier = sim.data.towers['archer']!.tiers[0]!;
    expect(hit.damage).toBeGreaterThanOrEqual(tier.damage[0]);
    expect(hit.damage).toBeLessThanOrEqual(tier.damage[1]);
  });
});

describe('shred', () => {
  it('stacks up to maxStacks, raises later damage, and falls off after the duration', () => {
    const sim = setup((d) => {
      d.enemies['armored_brute']!.hp = 1e6;
      const mortar = d.towers['mortar']!.tiers[0]!;
      mortar.damage = [100, 100]; // remove the roll
      mortar.cooldown = 0.5;
      mortar.minRange = 0;
      mortar.shred = { armor: 0.1, magic: 0, duration: 4, maxStacks: 3 };
      mortar.splash = { radius: 60 };
      d.config.splashEdgeMult = 1; // isolate shred from falloff
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'mortar' });
    const e = inject(sim, 'armored_brute', 400, 900);
    e.dist = 400; // keep it parked: brute moves slowly, fine for a short run
    const dmgs: number[] = [];
    for (let i = 0; i < 60 * 8 && dmgs.length < 5; i++) {
      sim.step();
      for (const ev of sim.drainEvents()) if (ev.type === 'projectileHit') dmgs.push(ev.damage);
    }
    expect(dmgs.length).toBe(5);
    // armor 0.5, -0.1 per stack, max 3 stacks: 100*(0.5, 0.4, 0.3, 0.2) = 50, 60, 70, 80, then capped at 80
    expect(dmgs[0]).toBeCloseTo(50, 3);
    expect(dmgs[1]).toBeCloseTo(60, 3);
    expect(dmgs[2]).toBeCloseTo(70, 3);
    expect(dmgs[3]).toBeCloseTo(80, 3);
    expect(dmgs[4]).toBeCloseTo(80, 3);
    expect(e.shredStacks).toBe(3);
    // stop firing by removing towers, wait out the duration
    sim.towers.clear();
    sim.projectiles.clear();
    for (let i = 0; i < 60 * 5; i++) sim.step();
    expect(e.shredStacks).toBe(0);
    expect(e.shredArmor).toBe(0);
  });
});

describe('splash artillery', () => {
  function splashRun(positions: { dist: number; flying?: boolean }[]) {
    const sim = setup((d) => {
      const m = d.towers['mortar']!.tiers[0]!;
      m.damage = [100, 100];
      m.shred = undefined;
      m.splash = { radius: 80 };
      m.minRange = 0;
      m.cooldown = 99;
      d.enemies['goblin_runner']!.hp = 1e6;
      d.enemies['goblin_runner']!.speed = 0.0001;
      d.enemies['cave_bat']!.hp = 1e6;
      d.enemies['cave_bat']!.speed = 0.0001;
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'mortar' });
    const ids = positions.map((p, i) => inject(sim, p.flying ? 'cave_bat' : 'goblin_runner', p.dist, 900 + i).id);
    for (let i = 0; i < 60 * 6; i++) sim.step();
    return { sim, ids };
  }

  it('damages every enemy in radius with falloff, none outside', () => {
    // dist 400 is the primary target (furthest within range). Others spread along the road around it.
    const { sim, ids } = splashRun([{ dist: 400 }, { dist: 410 }, { dist: 440 }, { dist: 700 }]);
    const dealt = ids.map((id) => 1e6 - sim.enemies.get(id)!.hp);
    expect(dealt[0]).toBeGreaterThan(0);
    // the splash is centred near the target; the farthest enemy (300 away) is untouched
    expect(dealt[3]).toBe(0);
    // damage never exceeds raw damage (armor 0) and respects falloff floor
    for (const v of dealt.slice(0, 3)) {
      if (v > 0) {
        expect(v).toBeLessThanOrEqual(100 + 1e-6);
        expect(v).toBeGreaterThanOrEqual(100 * sim.data.config.splashEdgeMult - 1e-6);
      }
    }
  });

  it('splash from a ground-only tower does not hurt flyers', () => {
    const { sim, ids } = splashRun([{ dist: 400 }, { dist: 405, flying: true }]);
    expect(1e6 - sim.enemies.get(ids[0]!)!.hp).toBeGreaterThan(0);
    expect(sim.enemies.get(ids[1]!)!.hp).toBe(1e6);
  });

  it('minRange: targets inside it are ignored', () => {
    const sim = setup((d) => {
      d.towers['mortar']!.tiers[0]!.minRange = 500; // larger than range: nothing is ever eligible
    });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'mortar' });
    inject(sim, 'goblin_runner', 400, 900);
    for (let i = 0; i < 60 * 5; i++) sim.step();
    expect(sim.projectiles.size).toBe(0);
    expect(sim.drainEvents().some((e) => e.type === 'projectileFired')).toBe(false);
  });
});

describe('shipped balance sanity', () => {
  it('armored brutes take noticeably more from mage than archer per hit', () => {
    const d = loadData();
    const archer = d.towers['archer']!.tiers[0]!;
    const mage = d.towers['mage']!.tiers[0]!;
    const brute = d.enemies['armored_brute']!;
    const avg = (t: typeof archer) => (t.damage[0] + t.damage[1]) / 2;
    const a = damageAfterResist(avg(archer), archer.damageType, brute.armor, brute.magicResist, d.config, {
      armorReduction: archer.armorPen ?? 0, magicReduction: 0,
    });
    const m = damageAfterResist(avg(mage), mage.damageType, brute.armor, brute.magicResist, d.config);
    expect(m).toBeGreaterThan(a);
  });
});
