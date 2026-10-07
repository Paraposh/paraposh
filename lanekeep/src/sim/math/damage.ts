import type { Config, DamageType } from '../../data/types';

/** Flat reductions (fraction points) subtracted from a target's resist before the damage formula. */
export interface ResistMods {
  armorReduction: number;
  magicReduction: number;
}

export const NO_MODS: ResistMods = { armorReduction: 0, magicReduction: 0 };

/** Effective resist = clamp(base - reduction, resistMin, resistMax). Reduction is shred + penetration. */
export function effectiveResist(base: number, reduction: number, cfg: Pick<Config, 'resistMin' | 'resistMax'>): number {
  return Math.min(Math.max(base - reduction, cfg.resistMin), cfg.resistMax);
}

/**
 * Damage after resistance.
 *   physical: dmg * (1 - armor_eff)
 *   magic:    dmg * (1 - magicResist_eff)
 *   true:     dmg (ignores both)
 * where resist_eff = clamp(resist - reduction, resistMin, resistMax).
 */
export function damageAfterResist(
  dmg: number,
  type: DamageType,
  armor: number,
  magicResist: number,
  cfg: Pick<Config, 'resistMin' | 'resistMax'>,
  mods: ResistMods = NO_MODS,
): number {
  if (type === 'true') return dmg;
  const resist =
    type === 'physical'
      ? effectiveResist(armor, mods.armorReduction, cfg)
      : effectiveResist(magicResist, mods.magicReduction, cfg);
  return dmg * (1 - resist);
}
