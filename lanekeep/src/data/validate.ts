import Ajv from 'ajv';
import type { GameData } from './types';
import configSchema from '../../data/schemas/config.schema.json';
import enemiesSchema from '../../data/schemas/enemies.schema.json';
import towersSchema from '../../data/schemas/towers.schema.json';
import soldiersSchema from '../../data/schemas/soldiers.schema.json';
import spellsSchema from '../../data/schemas/spells.schema.json';
import heroesSchema from '../../data/schemas/heroes.schema.json';
import levelSchema from '../../data/schemas/level.schema.json';
import wavesSchema from '../../data/schemas/waves.schema.json';

export interface RawGameData {
  config: unknown;
  enemies: unknown;
  towers: unknown;
  soldiers: unknown;
  spells: unknown;
  heroes: unknown;
  level: unknown;
  waves: unknown;
}

const ajv = new Ajv({ allErrors: true });
const checks = {
  config: ajv.compile(configSchema),
  enemies: ajv.compile(enemiesSchema),
  towers: ajv.compile(towersSchema),
  soldiers: ajv.compile(soldiersSchema),
  spells: ajv.compile(spellsSchema),
  heroes: ajv.compile(heroesSchema),
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
  const { level, waves, enemies, towers, soldiers, spells, heroes, config } = data;
  if (config.resistMin > config.resistMax) errors.push('config: resistMin > resistMax');
  for (const [towerId, tower] of Object.entries(towers)) {
    if (tower.family !== 'meleeBarracks') continue;
    for (const tier of tower.tiers) {
      if (!soldiers[tier.soldierId]) errors.push(`towers.${towerId}: unknown soldier "${tier.soldierId}"`);
    }
  }
  for (const [spellId, spell] of Object.entries(spells)) {
    if (spell.kind === 'summonSoldiers' && !soldiers[spell.soldierId]) errors.push(`spells.${spellId}: unknown soldier "${spell.soldierId}"`);
  }
  for (const [heroId, hero] of Object.entries(heroes)) {
    if (!spells[hero.ability.spellId]) errors.push(`heroes.${heroId}: unknown spell "${hero.ability.spellId}"`);
    for (let i = 1; i < hero.levels.length; i++) {
      if ((hero.levels[i] as { xpTotal: number }).xpTotal <= (hero.levels[i - 1] as { xpTotal: number }).xpTotal) {
        errors.push(`heroes.${heroId}: levels must have increasing xpTotal`);
      }
    }
  }
  if (!heroes[level.heroId]) errors.push(`level.heroId: unknown hero "${level.heroId}"`);
  for (const spellId of level.spells) if (!spells[spellId]) errors.push(`level.spells: unknown spell "${spellId}"`);
  for (const towerId of level.availableTowers) {
    if (!towers[towerId]) errors.push(`level.availableTowers: unknown tower "${towerId}"`);
  }
  for (const spot of level.buildSpots) {
    for (const towerId of spot.allowed) {
      if (!towers[towerId]) errors.push(`level.buildSpots.${spot.id}: unknown tower "${towerId}"`);
    }
  }
  const known = (id: string, where: string) => {
    if (!enemies[id]) errors.push(`${where}: unknown enemy "${id}"`);
  };
  for (const [enemyId, def] of Object.entries(enemies)) {
    for (const t of def.traits) {
      if (t.type === 'summons' || t.type === 'splitsOnDeath') known(t.enemyId, `enemies.${enemyId}.traits`);
    }
  }
  for (const [bossId, boss] of Object.entries(waves.bosses ?? {})) {
    known(boss.enemyId, `boss ${bossId}`);
    for (const ph of boss.phases) for (const a of ph.onEnter ?? []) if (a.type === 'summon') known(a.enemyId, `boss ${bossId}`);
    for (let i = 1; i < boss.phases.length; i++) {
      if ((boss.phases[i] as { hpAbove: number }).hpAbove >= (boss.phases[i - 1] as { hpAbove: number }).hpAbove) {
        errors.push(`boss ${bossId}: phases must have strictly decreasing hpAbove`);
      }
    }
  }
  for (const wave of waves.waves) {
    for (const g of wave.groups) {
      if (g.enemyId) known(g.enemyId, `wave ${wave.id}`);
      if (g.bossId && !waves.bosses?.[g.bossId]) errors.push(`wave ${wave.id}: unknown boss "${g.bossId}"`);
      if (!level.paths[g.path]) errors.push(`wave ${wave.id}: unknown path "${g.path}"`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
  return data;
}
