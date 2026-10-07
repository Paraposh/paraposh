import config from '../../data/config.json';
import enemies from '../../data/enemies.json';
import towers from '../../data/towers.json';
import soldiers from '../../data/soldiers.json';
import spells from '../../data/spells.json';
import heroes from '../../data/heroes.json';
import level from '../../data/levels/level-01.json';
import waves from '../../data/waves/level-01.waves.json';
import { validateGameData } from './validate';
import type { GameData } from './types';

/** Bundled data for the browser build (Vite inlines the JSON). */
export function loadBundledData(): GameData {
  return validateGameData({ config, enemies, towers, soldiers, spells, heroes, level, waves });
}
