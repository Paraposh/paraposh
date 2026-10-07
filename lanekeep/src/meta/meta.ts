import Ajv from 'ajv';
import schema from '../../data/schemas/meta-upgrades.schema.json';
import type { GameData, ShooterTier } from '../data/types';
import type { Progress } from '../game/progress';
import { totalStars } from '../game/progress';

export type EffectKind = 'startGold' | 'startLives' | 'towerDamage' | 'spellCooldown' | 'heroHp';

export interface MetaUpgrade {
  id: string;
  name: string;
  description: string;
  branch: string;
  maxRank: number;
  /** Star cost of each rank, in order. */
  costs: number[];
  effect: { kind: EffectKind; perRank: number };
  requires?: { id: string; rank: number };
}

export interface MetaTree {
  upgrades: MetaUpgrade[];
}

/** Purchased rank per upgrade id. */
export type MetaRanks = Record<string, number>;

/** Spell cooldown reduction never goes past this, however many ranks exist. */
export const MAX_COOLDOWN_REDUCTION = 0.5;

const check = new Ajv({ allErrors: true }).compile(schema);

export function validateMeta(raw: unknown): MetaTree {
  if (!check(raw)) throw new Error(`Invalid meta upgrades:\n${(check.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`).join('\n')}`);
  const tree = raw as unknown as MetaTree;
  const errors: string[] = [];
  const seen = new Map<string, MetaUpgrade>();
  for (const u of tree.upgrades) {
    if (seen.has(u.id)) errors.push(`duplicate upgrade id "${u.id}"`);
    if (u.costs.length !== u.maxRank) errors.push(`upgrade "${u.id}" needs ${u.maxRank} costs, has ${u.costs.length}`);
    if (u.requires) {
      // Prerequisites must come earlier in the list, which rules out cycles.
      const req = seen.get(u.requires.id);
      if (!req) errors.push(`upgrade "${u.id}" requires "${u.requires.id}" which is unknown or listed later`);
      else if (u.requires.rank > req.maxRank) errors.push(`upgrade "${u.id}" requires rank ${u.requires.rank} of "${req.id}" (max ${req.maxRank})`);
    }
    seen.set(u.id, u);
  }
  if (errors.length > 0) throw new Error(`Invalid meta upgrades:\n${errors.join('\n')}`);
  return tree;
}

export const rankOf = (ranks: MetaRanks, id: string): number => ranks[id] ?? 0;

export function starsSpent(tree: MetaTree, ranks: MetaRanks): number {
  let sum = 0;
  for (const u of tree.upgrades) for (let r = 0; r < rankOf(ranks, u.id); r++) sum += u.costs[r] ?? 0;
  return sum;
}

export function starsAvailable(tree: MetaTree, progress: Progress, ranks: MetaRanks): number {
  return totalStars(progress) - starsSpent(tree, ranks);
}

export type BuyBlock = 'unknown' | 'maxed' | 'locked' | 'poor';

/** Why the next rank of an upgrade cannot be bought right now, or undefined if it can. */
export function buyBlock(tree: MetaTree, progress: Progress, ranks: MetaRanks, id: string): BuyBlock | undefined {
  const u = tree.upgrades.find((x) => x.id === id);
  if (!u) return 'unknown';
  const rank = rankOf(ranks, id);
  if (rank >= u.maxRank) return 'maxed';
  if (u.requires && rankOf(ranks, u.requires.id) < u.requires.rank) return 'locked';
  if (starsAvailable(tree, progress, ranks) < (u.costs[rank] ?? Infinity)) return 'poor';
  return undefined;
}

/** Buys the next rank. Returns false (and changes nothing) when blocked. */
export function buy(tree: MetaTree, progress: Progress, ranks: MetaRanks, id: string): boolean {
  if (buyBlock(tree, progress, ranks, id)) return false;
  ranks[id] = rankOf(ranks, id) + 1;
  return true;
}

/** Free full refund: every rank is removed and all stars become available again. */
export function respec(ranks: MetaRanks): void {
  for (const id of Object.keys(ranks)) delete ranks[id];
}

/** Total of one effect kind across purchased ranks. */
export function effectTotal(tree: MetaTree, ranks: MetaRanks, kind: EffectKind): number {
  return tree.upgrades.filter((u) => u.effect.kind === kind).reduce((a, u) => a + u.effect.perRank * rankOf(ranks, u.id), 0);
}

const scaleDamage = (t: Partial<ShooterTier>, k: number): void => {
  if (t.damage) t.damage = [t.damage[0] * k, t.damage[1] * k];
};

/**
 * Returns a copy of the data with purchased upgrades applied as modifiers. Called once at level start,
 * so the sim itself never knows about meta progression and stays deterministic for a given data set.
 */
export function applyMeta(data: GameData, tree: MetaTree, ranks: MetaRanks): GameData {
  const out = structuredClone(data);
  out.level.startGold += Math.round(effectTotal(tree, ranks, 'startGold'));
  out.config.startingLives += Math.round(effectTotal(tree, ranks, 'startLives'));

  const dmg = 1 + effectTotal(tree, ranks, 'towerDamage');
  if (dmg !== 1) {
    for (const def of Object.values(out.towers)) {
      if (def.family === 'meleeBarracks') continue;
      for (const tier of def.tiers) scaleDamage(tier, dmg);
      for (const spec of Object.values(def.specializations ?? {})) scaleDamage(spec, dmg);
    }
  }
  const cd = 1 - Math.min(MAX_COOLDOWN_REDUCTION, effectTotal(tree, ranks, 'spellCooldown'));
  if (cd !== 1) for (const s of Object.values(out.spells)) s.cooldown *= cd;
  const hp = 1 + effectTotal(tree, ranks, 'heroHp');
  if (hp !== 1) for (const h of Object.values(out.heroes)) h.stats.hp = Math.round(h.stats.hp * hp);
  return out;
}
