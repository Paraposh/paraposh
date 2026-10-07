import Ajv from 'ajv';
import type { GameData } from './types';
import configSchema from '../../data/schemas/config.schema.json';
import enemiesSchema from '../../data/schemas/enemies.schema.json';
import towersSchema from '../../data/schemas/towers.schema.json';
import levelSchema from '../../data/schemas/level.schema.json';
import wavesSchema from '../../data/schemas/waves.schema.json';

export interface RawGameData {
  config: unknown;
  enemies: unknown;
  towers: unknown;
  level: unknown;
  waves: unknown;
}

const ajv = new Ajv({ allErrors: true });
const checks = {
  config: ajv.compile(configSchema),
  enemies: ajv.compile(enemiesSchema),
  towers: ajv.compile(towersSchema),
  level: ajv.compile(levelSchema),
  waves: ajv.compile(wavesSchema),
};

/** Validates raw JSON against the schemas and cross-references ids. Throws one error listing every problem. */
export function validateGameData(raw: RawGameData): GameData {
  const errors: string[] = [];
  for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
    const check = checks[key];
    if (!check(raw[key])) {
      for (const e of check.errors ?? []) errors.push(`${key}${e.instancePath}: ${e.message}`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);

  const data = raw as GameData;
  const { level, waves, enemies, towers, config } = data;
  if (config.resistMin > config.resistMax) errors.push('config: resistMin > resistMax');
  for (const towerId of level.availableTowers) {
    if (!towers[towerId]) errors.push(`level.availableTowers: unknown tower "${towerId}"`);
  }
  for (const spot of level.buildSpots) {
    for (const towerId of spot.allowed) {
      if (!towers[towerId]) errors.push(`level.buildSpots.${spot.id}: unknown tower "${towerId}"`);
    }
  }
  for (const wave of waves.waves) {
    for (const g of wave.groups) {
      if (!enemies[g.enemyId]) errors.push(`wave ${wave.id}: unknown enemy "${g.enemyId}"`);
      if (!level.paths[g.path]) errors.push(`wave ${wave.id}: unknown path "${g.path}"`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
  return data;
}
