import { describe, expect, it } from 'vitest';
import { validateGameData } from '../../src/data/validate';
import type { SimEvent } from '../../src/sim/core/types';
import { Sim } from '../../src/sim/sim';
import { runReplay } from '../../src/sim/replay/replay';
import { cloneData, injectEnemy, loadData, quietSim } from '../helpers';

const build = (sim: Sim, spot = 's1') => sim.queue({ type: 'placeTower', spotId: spot, towerId: 'barracks' });
const run = (sim: Sim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
};
const barracks = (sim: Sim) => [...sim.towers.values()].find((t) => t.defId === 'barracks')!;

describe('barracks placement and rally', () => {
  it('spawns one soldier per slot and walks them to formation spots around the rally point', () => {
    const sim = quietSim();
    build(sim);
    run(sim, 6);
    const b = barracks(sim);
    expect(sim.soldiers.size).toBe(3);
    expect(sim.gold).toBe(sim.data.level.startGold - 70);
    for (const s of sim.soldiers.values()) {
      expect(s.state).toBe('idle');
      expect(Math.hypot(s.x - b.rallyX, s.y - b.rallyY)).toBeLessThanOrEqual(sim.data.config.soldierFormationRadius + 1);
    }
  });

  it('default rally sits on the path when the road is within rally range', () => {
    const sim = quietSim();
    build(sim);
    sim.step();
    const b = barracks(sim);
    const closest = sim.paths['main']!.closestPoint(b.x, b.y);
    expect(Math.hypot(b.rallyX - closest.x, b.rallyY - closest.y)).toBeLessThan(1);
  });

  it('setRally moves the rally point and clamps it to rallyRange', () => {
    const sim = quietSim();
    build(sim);
    sim.step();
    const b = barracks(sim);
    sim.queue({ type: 'setRally', towerId: b.id, x: b.x + 1000, y: b.y });
    sim.step();
    expect(Math.hypot(b.rallyX - b.x, b.rallyY - b.y)).toBeCloseTo(120, 3);
    run(sim, 8);
    for (const s of sim.soldiers.values()) expect(Math.hypot(s.x - b.rallyX, s.y - b.rallyY)).toBeLessThan(20);
  });

  it('setRally on a non-barracks is rejected', () => {
    const sim = quietSim();
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    sim.step();
    sim.drainEvents();
    sim.queue({ type: 'setRally', towerId: [...sim.towers.keys()][0]!, x: 0, y: 0 });
    sim.step();
    expect(sim.drainEvents().some((e) => e.type === 'commandRejected')).toBe(true);
  });
});

describe('blocking and melee', () => {
  it('a soldier stops a walker, fights it, and the kill pays the bounty', () => {
    const sim = quietSim();
    build(sim);
    run(sim, 5);
    const goblin = injectEnemy(sim, 'goblin_runner', 250, 900);
    const gold0 = sim.gold;
    let blockedDist = -1;
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 * 40 && sim.enemies.has(900); i++) {
      sim.step();
      events.push(...sim.drainEvents());
      if (goblin.blockers.length > 0 && blockedDist < 0) blockedDist = goblin.dist;
    }
    expect(blockedDist).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'meleeHit' && !e.onSoldier)).toBe(true);
    expect(events.some((e) => e.type === 'enemyKilled' && e.id === 900)).toBe(true);
    expect(sim.gold).toBe(gold0 + sim.data.enemies['goblin_runner']!.bounty);
    // while blocked it never advanced further than the contact point
    expect(goblin.dist).toBeLessThan(blockedDist + 2);
  });

  it('enemy melee damage on a soldier follows dmg * (1 - armor)', () => {
    const sim = quietSim();
    build(sim);
    run(sim, 5);
    injectEnemy(sim, 'goblin_runner', 250, 900);
    const hits: Extract<SimEvent, { type: 'meleeHit' }>[] = [];
    for (let i = 0; i < 60 * 20 && hits.length === 0; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'meleeHit' && e.onSoldier) hits.push(e);
    }
    expect(hits[0]!.damage).toBeCloseTo(6 * (1 - 0.2), 6);
  });

  it('bypassBlockers enemies and flyers walk through soldiers', () => {
    const sim = quietSim();
    build(sim);
    run(sim, 5);
    const wisp = injectEnemy(sim, 'arcane_wisp', 250, 900);
    const bat = injectEnemy(sim, 'cave_bat', 250, 901);
    const d0 = [wisp.dist, bat.dist];
    run(sim, 3);
    expect(wisp.blockers).toHaveLength(0);
    expect(bat.blockers).toHaveLength(0);
    expect(wisp.dist).toBeGreaterThan(d0[0]! + 100);
    expect(bat.dist).toBeGreaterThan(d0[1]! + 150);
    for (const s of sim.soldiers.values()) expect(s.targetId).toBe(0);
  });

  it('at most maxSoldiersPerEnemy soldiers target one enemy; extras take other enemies', () => {
    const sim = quietSim((d) => {
      d.config.maxSoldiersPerEnemy = 1;
      d.enemies['goblin_runner']!.hp = 1e6;
    });
    build(sim);
    run(sim, 5);
    const b = barracks(sim);
    // three goblins around the rally point
    const ds = [235, 245, 255].map((d, i) => injectEnemy(sim, 'goblin_runner', d, 900 + i));
    run(sim, 1);
    const counts = new Map<number, number>();
    for (const s of sim.soldiers.values()) if (s.targetId) counts.set(s.targetId, (counts.get(s.targetId) ?? 0) + 1);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(1);
    // the rally point is near these enemies
    expect(ds.every((e) => Math.hypot(e.x - b.rallyX, e.y - b.rallyY) < 200)).toBe(true);
  });

  it('with the default cap of 2, three soldiers can double up on one enemy but never triple', () => {
    const sim = quietSim((d) => {
      d.enemies['goblin_runner']!.hp = 1e6;
    });
    build(sim);
    run(sim, 5);
    injectEnemy(sim, 'goblin_runner', 250, 900);
    run(sim, 2);
    const onE = [...sim.soldiers.values()].filter((s) => s.targetId === 900).length;
    expect(onE).toBeGreaterThan(0);
    expect(onE).toBeLessThanOrEqual(2);
  });

  it('soldiers regenerate while idle', () => {
    const sim = quietSim();
    build(sim);
    run(sim, 5);
    const s = [...sim.soldiers.values()][0]!;
    s.hp = 10;
    run(sim, 5);
    expect(s.hp).toBeCloseTo(10 + 2 * 5, 0);
  });
});

describe('death and respawn', () => {
  it('a dead soldier is replaced after the respawn timer and the enemy resumes walking', () => {
    const sim = quietSim((d) => {
      d.enemies['goblin_runner']!.hp = 1e6;
      d.enemies['goblin_runner']!.melee = { damage: 1000, damageType: 'physical', cooldown: 0.5 };
    });
    build(sim);
    run(sim, 5);
    injectEnemy(sim, 'goblin_runner', 250, 900);
    const events = run(sim, 40);
    const killed = events.filter((e) => e.type === 'soldierKilled');
    expect(killed.length).toBeGreaterThan(0);
    const firstKill = killed[0]!.tick;
    const respawns = events.filter((e) => e.type === 'soldierSpawned' && e.tick > firstKill);
    expect(respawns.length).toBeGreaterThan(0);
    expect(respawns[0]!.tick - firstKill).toBeGreaterThanOrEqual(sim.ticks(10) - 1);
  });
});

describe('determinism with barracks', () => {
  it('a recorded session with barracks replays to the same hash', () => {
    const data = loadData();
    const live = new Sim(data, 31337);
    for (let i = 0; i < 60 * 45; i++) {
      if (i === 5) live.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
      if (i === 200) live.queue({ type: 'placeTower', spotId: 's3', towerId: 'barracks' });
      if (i === 400) live.queue({ type: 'setRally', towerId: [...live.towers.keys()][0]!, x: 470, y: 250 });
      live.step();
    }
    const replayed = runReplay(data, { seed: 31337, commands: live.commandLog }, 60 * 45);
    expect(replayed.hash()).toBe(live.hash());
  });
});

describe('data validation for barracks', () => {
  it('rejects a barracks tier missing soldierId', () => {
    const d = cloneData(loadData());
    delete (d.towers['barracks']!.tiers[0] as unknown as { soldierId?: string }).soldierId;
    expect(() => validateGameData(d)).toThrow(/soldierId/);
  });
  it('rejects an unknown soldier reference', () => {
    const d = cloneData(loadData());
    (d.towers['barracks']!.tiers[0] as { soldierId: string }).soldierId = 'ghost';
    expect(() => validateGameData(d)).toThrow(/unknown soldier "ghost"/);
  });
  it('rejects a shooter tier missing range', () => {
    const d = cloneData(loadData());
    delete (d.towers['archer']!.tiers[0] as unknown as { range?: number }).range;
    expect(() => validateGameData(d)).toThrow(/range/);
  });
});
