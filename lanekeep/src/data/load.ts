import config from '../../data/config.json';
import enemies from '../../data/enemies.json';
import towers from '../../data/towers.json';
import soldiers from '../../data/soldiers.json';
import spells from '../../data/spells.json';
import heroes from '../../data/heroes.json';
import campaignRaw from '../../data/campaign.json';
import { validateCampaign, type Campaign } from '../game/campaign';
import { validateGameData } from './validate';
import type { GameData } from './types';

// Vite inlines every level and wave file at build time.
const levelFiles = import.meta.glob('../../data/levels/*.json', { eager: true, import: 'default' }) as Record<string, { id: string; waves: string }>;
const waveFiles = import.meta.glob('../../data/waves/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const levels = Object.values(levelFiles);

export function loadCampaign(): Campaign {
  return validateCampaign(campaignRaw, levels.map((l) => l.id));
}

/** Validated data for one level (shared balance data plus that level's map and waves). */
export function loadLevelData(levelId: string): GameData {
  const level = levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`Unknown level "${levelId}"`);
  const waves = waveFiles[`../../data/${level.waves}`];
  if (!waves) throw new Error(`Missing waves file ${level.waves}`);
  return validateGameData({ config, enemies, towers, soldiers, spells, heroes, level, waves });
}
