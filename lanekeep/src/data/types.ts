export type DamageType = 'physical' | 'magic' | 'true';
export type Vec2 = [number, number];

export interface Config {
  tickRate: number;
  startingLives: number;
  sellRefundPct: number;
  earlyCallGoldPerSec: number;
  earlyCallMaxBonus: number;
  resistMin: number;
  resistMax: number;
  splashEdgeMult: number;
  laneOffsetJitter: number;
  projectileLeadIterations: number;
  pathSamplesPerSegment: number;
  stars: { stars: number; minLives: number }[];
  maxSoldiersPerEnemy: number;
  soldierFormationRadius: number;
  speeds: number[];
}

export type Trait =
  | { type: 'healsAllies'; radius: number; hpPerSec: number }
  | { type: 'summons'; enemyId: string; count: number; interval: number }
  | { type: 'splitsOnDeath'; enemyId: string; count: number }
  | { type: 'ranged'; range: number; damage: number; damageType: DamageType; cooldown: number }
  | { type: 'enrage'; hpThreshold: number; speedMult: number; damageMult: number }
  | { type: 'bypassBlockers' };

export type PhaseAction =
  | { type: 'summon'; enemyId: string; count: number }
  | { type: 'enrage'; speedMult: number; damageMult: number };

export interface BossPhase {
  /** The phase is active while the boss's HP fraction is above this. Phases only move forward. */
  hpAbove: number;
  onEnter?: PhaseAction[];
  speedMult?: number;
  /** Added to the boss's armor / magic resist while in this phase. */
  armorDelta?: number;
  magicResistDelta?: number;
}

export interface BossDef {
  enemyId: string;
  phases: BossPhase[];
}

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  armor: number;
  magicResist: number;
  bounty: number;
  livesCost: number;
  flying: boolean;
  radius: number;
  traits: Trait[];
  /** Melee attack used against blockers. Enemies without it stop but do not hit back. */
  melee?: { damage: number; damageType: DamageType; cooldown: number };
}

export interface ShredDef {
  /** Armor removed per stack (fraction points). */
  armor: number;
  /** Magic resist removed per stack (fraction points). */
  magic: number;
  /** Seconds before all stacks fall off; refreshed on every application. */
  duration: number;
  maxStacks: number;
}

export interface SplashDef {
  radius: number;
}

export interface ShooterTier {
  cost: number;
  range: number;
  damage: [number, number];
  damageType: DamageType;
  cooldown: number;
  projectile: { speed: number; lead: boolean };
  /** Armor ignored by this tower's hits (fraction points, applied on top of shred). */
  armorPen?: number;
  /** Magic resist ignored by this tower's hits (fraction points). */
  magicPen?: number;
  /** Targets closer than this are not eligible (artillery). */
  minRange?: number;
  splash?: SplashDef;
  shred?: ShredDef;
}

export interface BarracksTier {
  cost: number;
  soldierId: string;
  soldierCount: number;
  /** Max distance from the tower at which the rally point can be placed. */
  rallyRange: number;
  /** Seconds until a dead soldier is replaced. */
  respawn: number;
}

/** A tier-4 branch: overrides stats of the final base tier. `cost` is paid once on specialising. */
export type ShooterSpec = Partial<ShooterTier> & { name: string; cost: number };
export type BarracksSpec = Partial<BarracksTier> & { name: string; cost: number };

export interface ShooterTowerDef {
  family: 'rangedPhysical' | 'magic' | 'areaArtillery';
  name: string;
  antiAir: boolean;
  targeting: 'furthestAlongPath';
  tiers: ShooterTier[];
  /** Exactly two branches, unlocked after the last base tier. */
  specializations?: Record<string, ShooterSpec>;
}

export interface BarracksTowerDef {
  family: 'meleeBarracks';
  name: string;
  antiAir: boolean;
  tiers: BarracksTier[];
  specializations?: Record<string, BarracksSpec>;
}

export type TowerDef = ShooterTowerDef | BarracksTowerDef;

export interface SoldierDef {
  name: string;
  hp: number;
  armor: number;
  magicResist: number;
  speed: number;
  damage: [number, number];
  damageType: DamageType;
  cooldown: number;
  regenPerSec: number;
  /** A soldier acquires enemies within this distance of its rally point. */
  engageRadius: number;
  /** Distance at which a soldier counts as in contact with its target. */
  reach: number;
}

export interface AreaDamageSpell {
  kind: 'areaDamage';
  name: string;
  cooldown: number;
  radius: number;
  damage: number;
  damageType: DamageType;
  /** Seconds between casting and the blast landing. */
  delay: number;
  hitsAir: boolean;
}

export interface SummonSpell {
  kind: 'summonSoldiers';
  name: string;
  cooldown: number;
  soldierId: string;
  count: number;
  /** Seconds the summoned soldiers last. */
  lifetime: number;
}

export type SpellDef = AreaDamageSpell | SummonSpell;

export interface HeroLevel {
  /** Total XP at which this level is reached. */
  xpTotal: number;
  hpMult: number;
  damageMult: number;
}

export interface HeroDef {
  name: string;
  stats: {
    hp: number;
    armor: number;
    magicResist: number;
    speed: number;
    damage: [number, number];
    damageType: DamageType;
    cooldown: number;
    regenPerSec: number;
    engageRadius: number;
    reach: number;
  };
  /** Entry i describes level i + 2. Level 1 uses the base stats. */
  levels: HeroLevel[];
  ability: { spellId: string };
  reviveTime: number;
  reviveTimePerLevel: number;
}

export interface PathDef {
  points: Vec2[];
  spline: 'catmullRom' | 'linear';
  lanes: number;
  laneSpacing: number;
}

export interface BuildSpotDef {
  id: string;
  x: number;
  y: number;
  allowed: string[];
}

export interface LevelDef {
  id: string;
  name: string;
  world: { width: number; height: number };
  startGold: number;
  paths: Record<string, PathDef>;
  buildSpots: BuildSpotDef[];
  availableTowers: string[];
  heroId: string;
  heroSpawn: Vec2;
  /** Player cooldown spells available on this level. */
  spells: string[];
  waves: string;
}

export interface WaveGroup {
  /** Exactly one of enemyId or bossId. */
  enemyId?: string;
  bossId?: string;
  count: number;
  interval: number;
  startDelay: number;
  path: string;
}

export interface WaveDef {
  id: number;
  preDelay: number;
  groups: WaveGroup[];
}

export interface WavesFile {
  waves: WaveDef[];
  bosses?: Record<string, BossDef>;
}

export interface GameData {
  config: Config;
  enemies: Record<string, EnemyDef>;
  towers: Record<string, TowerDef>;
  soldiers: Record<string, SoldierDef>;
  spells: Record<string, SpellDef>;
  heroes: Record<string, HeroDef>;
  level: LevelDef;
  waves: WavesFile;
}
