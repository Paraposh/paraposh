import Ajv from 'ajv';
import campaignSchema from '../../data/schemas/campaign.schema.json';

export interface CampaignLevel {
  id: string;
  name: string;
  /** Position on the map screen as fractions of its width and height. */
  mapPos: [number, number];
  /** Level ids that must be cleared (at least one star) first. */
  requires: string[];
}

export interface Campaign {
  levels: CampaignLevel[];
}

const check = new Ajv({ allErrors: true }).compile(campaignSchema);

export function validateCampaign(raw: unknown, knownLevelIds: string[]): Campaign {
  if (!check(raw)) throw new Error(`Invalid campaign:\n${(check.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`).join('\n')}`);
  const campaign = raw as unknown as Campaign;
  const ids = new Set(campaign.levels.map((l) => l.id));
  const errors: string[] = [];
  for (const l of campaign.levels) {
    if (!knownLevelIds.includes(l.id)) errors.push(`campaign level "${l.id}" has no level file`);
    for (const r of l.requires) if (!ids.has(r)) errors.push(`campaign level "${l.id}" requires unknown level "${r}"`);
  }
  if (errors.length > 0) throw new Error(`Invalid campaign:\n${errors.join('\n')}`);
  return campaign;
}

/** Best stars earned per level id. */
export type StarMap = Record<string, number>;

export function isUnlocked(campaign: Campaign, levelId: string, stars: StarMap): boolean {
  const level = campaign.levels.find((l) => l.id === levelId);
  return !!level && level.requires.every((r) => (stars[r] ?? 0) >= 1);
}
