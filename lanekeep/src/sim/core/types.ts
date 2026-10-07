import type { DamageType, ShredDef } from '../../data/types';

export type Command =
  | { type: 'placeTower'; spotId: string; towerId: string }
  | { type: 'setRally'; towerId: number; x: number; y: number }
  | { type: 'upgradeTower'; towerId: number }
  | { type: 'specialize'; towerId: number; specId: string }
  | { type: 'sellTower'; towerId: number }
  | { type: 'callWave' }
  | { type: 'moveHero'; x: number; y: number }
  | { type: 'castSpell'; spellId: string; x: number; y: number }
  | { type: 'heroAbility' };

export type SimStatus = 'prepare' | 'wave' | 'won' | 'lost';

export interface Enemy {
  id: number;
  defId: string;
  pathId: string;
  laneOffset: number;
  /** Arc distance travelled along the path. */
  dist: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Armor removed by active shred stacks (fraction points). */
  shredArmor: number;
  shredMagic: number;
  shredStacks: number;
  /** Ticks until shred falls off. */
  shredTicks: number;
  /** Soldier ids currently in contact with this enemy. While non-empty the enemy stops. */
  blockers: number[];
  /** Ticks until the enemy's next melee swing. */
  attackCooldown: number;
  /** Ticks until the next ranged shot (ranged trait). */
  rangedCooldown: number;
  /** Countdown per trait index (summon timers); unused slots are 0. */
  traitTimers: number[];
  /** Runtime multipliers set by enrage. */
  speedMult: number;
  damageMult: number;
  enraged: boolean;
  /** Summoned or split-off enemies pay no bounty. */
  spawned: boolean;
  /** Set for bosses; phase is -1 until the first phase is entered. */
  bossId: string;
  phase: number;
}

export interface Tower {
  id: number;
  defId: string;
  spotId: string;
  x: number;
  y: number;
  /** Index into the base tiers. */
  tier: number;
  /** Chosen specialization id, or '' for none. */
  specId: string;
  /** Ticks until the tower may fire again. */
  cooldown: number;
  invested: number;
  /** Barracks only. */
  rallyX: number;
  rallyY: number;
  slots: { soldierId: number; respawn: number }[];
}

export interface Soldier {
  id: number;
  defId: string;
  towerId: number;
  slot: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  /** 0 = none. */
  targetId: number;
  state: 'moving' | 'idle' | 'fighting';
  cooldown: number;
  /** Where this soldier stands guard and from where it acquires targets (tower rally point, or the summon point). */
  anchorX: number;
  anchorY: number;
  /** Ticks of life left for summoned soldiers; -1 for barracks soldiers. */
  lifetime: number;
}

export interface Hero {
  id: number;
  defId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  state: 'idle' | 'moving' | 'fighting' | 'dead';
  /** Click-to-move order, or null. */
  moveX: number | null;
  moveY: number | null;
  /** The hero guards the spot where it last stopped. */
  anchorX: number;
  anchorY: number;
  targetId: number;
  cooldown: number;
  reviveTicks: number;
}

/** Delayed world effect (spell blasts). */
export interface Effect {
  id: number;
  spellId: string;
  x: number;
  y: number;
  ticksLeft: number;
  totalTicks: number;
  fromHero: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  tx: number;
  ty: number;
  targetId: number;
  ticksLeft: number;
  damage: number;
  damageType: DamageType;
  armorPen: number;
  magicPen: number;
  /** 0 = single target. */
  splashRadius: number;
  antiAir: boolean;
  shred?: ShredDef;
}

export type SimEvent =
  | { type: 'enemySpawned'; tick: number; id: number }
  | { type: 'enemyKilled'; tick: number; id: number; gold: number; x: number; y: number }
  | { type: 'enemyLeaked'; tick: number; id: number; lives: number }
  | { type: 'towerPlaced'; tick: number; id: number }
  | { type: 'projectileFired'; tick: number; id: number }
  | { type: 'projectileHit'; tick: number; id: number; targetId: number; damage: number; x: number; y: number }
  | { type: 'waveStarted'; tick: number; index: number }
  | { type: 'waveCalled'; tick: number; index: number; secondsSkipped: number; bonus: number }
  | { type: 'towerUpgraded'; tick: number; id: number; tier: number; specId: string }
  | { type: 'towerSold'; tick: number; id: number; refund: number }
  | { type: 'soldierSpawned'; tick: number; id: number }
  | { type: 'soldierKilled'; tick: number; id: number }
  | { type: 'meleeHit'; tick: number; attackerId: number; targetId: number; damage: number; onSoldier: boolean; x: number; y: number }
  | { type: 'spellCast'; tick: number; spellId: string }
  | { type: 'spellImpact'; tick: number; spellId: string; x: number; y: number; radius: number }
  | { type: 'heroLevelUp'; tick: number; level: number; x: number; y: number }
  | { type: 'heroDied'; tick: number }
  | { type: 'heroRevived'; tick: number }
  | { type: 'enemyEnraged'; tick: number; id: number }
  | { type: 'bossPhase'; tick: number; id: number; phase: number }
  | { type: 'splashImpact'; tick: number; x: number; y: number; radius: number }
  | { type: 'commandRejected'; tick: number; reason: string }
  | { type: 'won'; tick: number }
  | { type: 'lost'; tick: number };
