import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateGameData } from '../src/data/validate';
import type { GameData, ShooterTier } from '../src/data/types';
import type { Enemy } from '../src/sim/core/types';
import { Sim as SimImpl, type Sim } from '../src/sim/sim';

const root = join(import.meta.dirname, '..', 'data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(root, p), 'utf8'));

export function loadData(): GameData {
  const level = read('levels/level-01.json') as { waves: string };
  return validateGameData({
    config: read('config.json'),
    enemies: read('enemies.json'),
    towers: read('towers.json'),
    soldiers: read('soldiers.json'),
    spells: read('spells.json'),
    heroes: read('heroes.json'),
    level,
    waves: read(level.waves),
  });
}

/** Parks the hero far from every road so tests of other systems are not affected by it. */
export function parkHero(d: GameData): GameData {
  d.level.heroSpawn = [1270, 710];
  return d;
}

/** Deep clone so tests can tweak data without touching other tests. */
export function cloneData(d: GameData): GameData {
  return JSON.parse(JSON.stringify(d)) as GameData;
}

export function runUntil(sim: import('../src/sim/sim').Sim, maxTicks: number): void {
  while (sim.tick < maxTicks && sim.status !== 'won' && sim.status !== 'lost') sim.step();
}

/** Tier 1 of a non-barracks tower, narrowed for tests that tweak shooter stats. */
export function shooterTier(d: GameData, id: string): ShooterTier {
  const def = d.towers[id];
  if (!def || def.family === 'meleeBarracks') throw new Error(`${id} is not a shooter tower`);
  return def.tiers[0] as ShooterTier;
}

/** Puts an enemy on the path at `dist` without going through the wave schedule. */
export function injectEnemy(sim: Sim, defId: string, dist: number, id: number, pathId = 'main'): Enemy {
  const hp = (sim.data.enemies[defId] as { hp: number }).hp;
  const e: Enemy = {
    id, defId, pathId, laneOffset: 0, dist, hp, maxHp: hp, x: 0, y: 0, prevX: 0, prevY: 0,
    shredArmor: 0, shredMagic: 0, shredStacks: 0, shredTicks: 0, blockers: [], attackCooldown: 0,
    rangedCooldown: 0, traitTimers: sim.data.enemies[defId]!.traits.map((t) => (t.type === 'summons' ? sim.ticks(t.interval) : 0)), speedMult: 1, damageMult: 1, enraged: false, spawned: false, bossId: '', phase: -1,
  };
  [e.x, e.y] = sim.positionAt(e, dist);
  e.prevX = e.x;
  e.prevY = e.y;
  sim.enemies.set(id, e);
  return e;
}

/** A sim whose scheduled wave is pushed far into the future, so tests control enemies via injectEnemy. */
export function quietSim(mut?: (d: GameData) => void, seed = 1): Sim {
  const d = parkHero(cloneData(loadData()));
  d.waves.waves = [d.waves.waves[0]!];
  d.waves.waves[0]!.groups = [{ enemyId: 'goblin_runner', count: 1, interval: 0, startDelay: 9999, path: 'main' }];
  mut?.(d);
  return new SimImpl(d, seed);
}

/** Shipped data cut down to the first wave (for tests that predate multi-wave levels). */
export function firstWaveOnly(d: GameData): GameData {
  const c = parkHero(cloneData(d));
  c.waves.waves = [c.waves.waves[0]!];
  return c;
}
