import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/types';
import { Sim } from '../../src/sim/sim';
import { cloneData, injectEnemy, loadData, runUntil, shooterTier } from '../helpers';

const totalLivesCost = (d: GameData): number =>
  (d.waves.waves[0] as { groups: { enemyId: string; count: number }[] }).groups.reduce(
    (sum, g) => sum + g.count * (d.enemies[g.enemyId] as { livesCost: number }).livesCost,
    0,
  );

const place = (sim: Sim, spotId = 's1') => sim.queue({ type: 'placeTower', spotId, towerId: 'archer' });

describe('milestone (a): one path, one enemy, one tower', () => {
  it('without towers every enemy leaks and the level is lost or won with lives spent', () => {
    const sim = new Sim(loadData(), 1);
    runUntil(sim, 60 * 120);
    expect(sim.lives).toBe(20 - totalLivesCost(loadData()));
    expect(sim.enemies.size).toBe(0);
    expect(sim.status).toBe('won'); // wave cleared, lives still > 0
  });

  it('losing all lives ends in lost', () => {
    const d = cloneData(loadData());
    d.config.startingLives = 3;
    const sim = new Sim(d, 1);
    runUntil(sim, 60 * 120);
    expect(sim.status).toBe('lost');
    expect(sim.lives).toBe(0);
  });

  it('placing a tower spends gold; invalid placements are rejected', () => {
    const sim = new Sim(loadData(), 1);
    place(sim);
    place(sim); // occupied
    sim.queue({ type: 'placeTower', spotId: 'zzz', towerId: 'archer' });
    sim.step();
    expect(sim.towers.size).toBe(1);
    expect(sim.gold).toBe(300 - 70);
    const rejected = sim.drainEvents().filter((e) => e.type === 'commandRejected');
    expect(rejected).toHaveLength(2);
  });

  it('cannot place without enough gold', () => {
    const d = cloneData(loadData());
    d.level.startGold = 10;
    const sim = new Sim(d, 1);
    place(sim);
    sim.step();
    expect(sim.towers.size).toBe(0);
  });

  it('towers kill enemies, pay bounty and reduce leaks', () => {
    const sim = new Sim(loadData(), 1);
    place(sim, 's1');
    place(sim, 's3');
    runUntil(sim, 60 * 120);
    const kills = sim.commandLog.length; // 2 placements logged
    expect(kills).toBe(2);
    expect(sim.lives).toBeGreaterThan(20 - totalLivesCost(loadData()));
    expect(sim.gold).toBeGreaterThan(300 - 140);
  });

  it('tower fires only at enemies in range and prefers the one furthest along', () => {
    const d = cloneData(loadData());
    const sim = new Sim(d, 1);
    place(sim, 's1');
    sim.step();
    // inject two enemies near the tower with different progress
    const mk = (dist: number) => injectEnemy(sim, 'goblin_runner', dist, 9000 + dist);
    const behind = mk(380);
    const ahead = mk(420);
    const tower = [...sim.towers.values()][0]!;
    const inRange = (e: { x: number; y: number }) => Math.hypot(e.x - tower.x, e.y - tower.y) <= 160;
    expect(inRange(behind) && inRange(ahead)).toBe(true);
    sim.step();
    const proj = [...sim.projectiles.values()][0]!;
    expect(proj.targetId).toBe(ahead.id);
  });

  it('ground-only tower ignores flyers; anti-air tower hits them', () => {
    const run = (antiAir: boolean) => {
      const d = cloneData(loadData());
      d.towers['archer']!.antiAir = antiAir;
      (d.enemies['goblin_runner'] as { flying: boolean }).flying = true;
      const sim = new Sim(d, 1);
      place(sim, 's1');
      runUntil(sim, 60 * 20);
      return sim.drainEvents().some((e) => e.type === 'projectileFired');
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('armor reduces physical damage dealt by the projectile', () => {
    const hit = (armor: number) => {
      const d = cloneData(loadData());
      d.enemies['goblin_runner']!.armor = armor;
      shooterTier(d, 'archer').armorPen = 0;
      d.enemies['goblin_runner']!.hp = 10000;
      const sim = new Sim(d, 5);
      place(sim, 's1');
      runUntil(sim, 60 * 20);
      const ev = sim.drainEvents().find((e) => e.type === 'projectileHit');
      return ev && ev.type === 'projectileHit' ? ev.damage : -1;
    };
    // same seed => same raw roll
    expect(hit(0.5) / hit(0)).toBeCloseTo(0.5, 5);
  });

  it('lane offsets spread enemies across the road', () => {
    const sim = new Sim(loadData(), 3);
    runUntil(sim, 60 * 5 + 60 * 12);
    const offsets = new Set([...sim.enemies.values()].map((e) => Math.round(e.laneOffset)));
    expect(offsets.size).toBeGreaterThan(1);
  });
});
