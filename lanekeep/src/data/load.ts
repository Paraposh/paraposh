import config from '../../data/config.json';
import enemies from '../../data/enemies.json';
import towers from '../../data/towers.json';
import level from '../../data/levels/level-01.json';
import waves from '../../data/waves/level-01.waves.json';
import { validateGameData } from './validate';
import type { GameData } from './types';

/** Bundled data for the browser build (Vite inlines the JSON). */
export function loadBundledData(): GameData {
  return validateGameData({ config, enemies, towers, level, waves });
}
