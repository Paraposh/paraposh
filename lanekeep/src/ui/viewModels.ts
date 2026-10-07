import type { BarracksTier, ShooterTier } from '../data/types';
import { levelPhase, type LevelPhase } from '../game/flow';
import type { Sim } from '../sim/sim';

/** Pure view models: everything the DOM UI shows is computed here so it can be unit tested without a browser. */

export interface BuildOption {
  towerId: string;
  name: string;
  cost: number;
  affordable: boolean;
}

/** Towers that may be built on a free spot, with cost and whether the player can pay now. */
export function buildOptions(sim: Sim, spotId: string): BuildOption[] {
  const spot = sim.data.level.buildSpots.find((s) => s.id === spotId);
  if (!spot || [...sim.towers.values()].some((t) => t.spotId === spotId)) return [];
  return spot.allowed
    .filter((id) => sim.data.level.availableTowers.includes(id) && sim.data.towers[id])
    .map((id) => {
      const def = sim.data.towers[id]!;
      const cost = def.tiers[0]!.cost;
      return { towerId: id, name: def.name, cost, affordable: sim.gold >= cost };
    });
}

export type PanelAction =
  | { kind: 'upgrade'; label: string; cost: number; enabled: boolean }
  | { kind: 'specialize'; specId: string; label: string; cost: number; enabled: boolean }
  | { kind: 'sell'; label: string; refund: number; enabled: true };

export interface TowerPanel {
  towerId: number;
  title: string;
  /** One short stat line per row. */
  stats: string[];
  actions: PanelAction[];
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

function statLines(sim: Sim, tier: ShooterTier | BarracksTier): string[] {
  if ('soldierId' in tier) {
    const s = sim.data.soldiers[tier.soldierId];
    return [
      `${tier.soldierCount} x ${s?.name ?? tier.soldierId}`,
      s ? `HP ${s.hp} · armor ${Math.round(s.armor * 100)}% · dmg ${s.damage[0]}-${s.damage[1]}` : '',
      `Respawn ${n1(tier.respawn)}s · rally range ${tier.rallyRange}`,
    ].filter(Boolean);
  }
  const avg = (tier.damage[0] + tier.damage[1]) / 2;
  const lines = [
    `Damage ${tier.damage[0]}-${tier.damage[1]} ${tier.damageType} · ~${n1(avg / tier.cooldown)} per second`,
    `Range ${tier.range}${tier.minRange ? ` (min ${tier.minRange})` : ''}`,
  ];
  if (tier.splash) lines.push(`Splash radius ${tier.splash.radius}`);
  if (tier.armorPen) lines.push(`Ignores ${Math.round(tier.armorPen * 100)}% armor`);
  if (tier.magicPen) lines.push(`Ignores ${Math.round(tier.magicPen * 100)}% magic resist`);
  if (tier.shred) {
    const bits = [tier.shred.armor > 0 ? `${Math.round(tier.shred.armor * 100)}% armor` : '', tier.shred.magic > 0 ? `${Math.round(tier.shred.magic * 100)}% magic resist` : ''].filter(Boolean);
    lines.push(`Shreds ${bits.join(' + ')} per hit, up to ${tier.shred.maxStacks} stacks`);
  }
  return lines;
}

/** Selected-tower panel: current stats and every action with cost, affordability and sell refund. */
export function towerPanel(sim: Sim, towerId: number): TowerPanel | undefined {
  const tower = sim.towers.get(towerId);
  const def = tower && sim.data.towers[tower.defId];
  if (!tower || !def) return undefined;
  const spec = tower.specId ? def.specializations?.[tower.specId] : undefined;
  const tierText = spec ? spec.name : `Tier ${tower.tier + 1}`;
  const actions: PanelAction[] = [];
  if (!tower.specId) {
    const next = def.tiers[tower.tier + 1];
    if (next) {
      actions.push({ kind: 'upgrade', label: `Upgrade to tier ${tower.tier + 2}`, cost: next.cost, enabled: sim.gold >= next.cost });
    } else {
      for (const [specId, sp] of Object.entries(def.specializations ?? {})) {
        actions.push({ kind: 'specialize', specId, label: sp.name, cost: sp.cost, enabled: sim.gold >= sp.cost });
      }
    }
  }
  actions.push({ kind: 'sell', label: 'Sell', refund: Math.floor(tower.invested * sim.data.config.sellRefundPct), enabled: true });
  return { towerId, title: `${def.name} · ${tierText}`, stats: statLines(sim, sim.tierOf(tower)), actions };
}

export interface Hud {
  phase: LevelPhase;
  gold: number;
  lives: number;
  /** "Wave 2 / 6" while spawning or fighting, "Wave 3 / 6 in 12s" while a countdown runs. */
  waveText: string;
  /** Seconds until the next wave, or null while spawning / after the last wave. */
  countdown: number | null;
  canCallWave: boolean;
  /** Gold the early call would pay right now. */
  callBonus: number;
}

export function hudModel(sim: Sim): Hud {
  const rate = sim.data.config.tickRate;
  const timer = sim.waveTimer;
  const countdown = timer === null ? null : Math.ceil(timer / rate);
  const total = sim.waveCount;
  const cfg = sim.data.config;
  const secondsLeft = timer === null ? 0 : timer / rate;
  const phase = levelPhase(sim);
  const waveText =
    countdown !== null ? `Wave ${sim.waveIndex + 1} / ${total} in ${countdown}s` : `Wave ${Math.min(sim.waveIndex, total)} / ${total}`;
  return {
    phase,
    gold: Math.floor(sim.gold),
    lives: sim.lives,
    waveText,
    countdown,
    canCallWave: timer !== null && timer > 0 && (phase === 'prepare' || phase === 'wave'),
    callBonus: Math.min(Math.floor(secondsLeft * cfg.earlyCallGoldPerSec), cfg.earlyCallMaxBonus),
  };
}

export interface SpellButton {
  /** Command key: spell id for player spells, `hero:<id>` for the hero ability. */
  key: string;
  spellId: string;
  label: string;
  hotkey: string;
  ready: boolean;
  secondsLeft: number;
  /** 0 when ready, 1 right after casting. */
  cooldownFraction: number;
  /** Player spells need a target click; the hero ability fires at once. */
  needsTarget: boolean;
  enabled: boolean;
}

const HOTKEYS: Record<string, string> = { meteor: 'M', reinforcements: 'F' };

export function spellButtons(sim: Sim): SpellButton[] {
  const out: SpellButton[] = [];
  const mk = (key: string, spellId: string, hotkey: string, needsTarget: boolean, enabled: boolean): SpellButton => {
    const spell = sim.data.spells[spellId]!;
    const left = sim.cooldownLeft(key);
    return {
      key,
      spellId,
      label: spell.name,
      hotkey,
      ready: left === 0,
      secondsLeft: Math.ceil(left),
      cooldownFraction: Math.min(1, left / spell.cooldown),
      needsTarget,
      enabled: enabled && left === 0,
    };
  };
  for (const id of sim.data.level.spells) if (sim.data.spells[id]) out.push(mk(id, id, HOTKEYS[id] ?? '', true, true));
  const hero = sim.hero;
  if (hero) {
    const def = sim.data.heroes[hero.defId];
    if (def) out.push(mk(`hero:${def.ability.spellId}`, def.ability.spellId, 'H', false, hero.state !== 'dead'));
  }
  return out;
}

export interface HeroModel {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number | null;
  down: boolean;
  reviveSeconds: number;
}

export function heroModel(sim: Sim): HeroModel | undefined {
  const h = sim.hero;
  const def = h && sim.data.heroes[h.defId];
  if (!h || !def) return undefined;
  return {
    name: def.name,
    level: h.level,
    hp: Math.ceil(h.hp),
    maxHp: Math.ceil(h.maxHp),
    xp: Math.floor(h.xp),
    xpToNext: def.levels[h.level - 1]?.xpTotal ?? null,
    down: h.state === 'dead',
    reviveSeconds: Math.ceil(h.reviveTicks / sim.data.config.tickRate),
  };
}
