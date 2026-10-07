import type { Config, DamageType } from '../../data/types';

/**
 * Damage after resistance.
 *   physical: dmg * (1 - armor)
 *   magic:    dmg * (1 - magicResist)
 *   true:     dmg (ignores both)
 * Resist is clamped to [resistMin, resistMax] first.
 */
export function damageAfterResist(
  dmg: number,
  type: DamageType,
  armor: number,
  magicResist: number,
  cfg: Pick<Config, 'resistMin' | 'resistMax'>,
): number {
  if (type === 'true') return dmg;
  const raw = type === 'physical' ? armor : magicResist;
  const resist = Math.min(Math.max(raw, cfg.resistMin), cfg.resistMax);
  return dmg * (1 - resist);
}
