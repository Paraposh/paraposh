import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateGameData } from '../src/data/validate';
import type { GameData } from '../src/data/types';

const root = join(import.meta.dirname, '..', 'data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(root, p), 'utf8'));

export function loadData(): GameData {
  const level = read('levels/level-01.json') as { waves: string };
  return validateGameData({
    config: read('config.json'),
    enemies: read('enemies.json'),
    towers: read('towers.json'),
    level,
    waves: read(level.waves),
  });
}

/** Deep clone so tests can tweak data without touching other tests. */
export function cloneData(d: GameData): GameData {
  return JSON.parse(JSON.stringify(d)) as GameData;
}

export function runUntil(sim: import('../src/sim/sim').Sim, maxTicks: number): void {
  while (sim.tick < maxTicks && sim.status !== 'won' && sim.status !== 'lost') sim.step();
}
