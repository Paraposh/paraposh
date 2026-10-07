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
  speeds: number[];
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
  traits: { type: string }[];
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

export interface TowerTier {
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

export interface TowerDef {
  family: 'rangedPhysical' | 'meleeBarracks' | 'magic' | 'areaArtillery';
  name: string;
  antiAir: boolean;
  targeting: 'furthestAlongPath';
  tiers: TowerTier[];
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
  heroSpawn?: Vec2;
  waves: string;
}

export interface WaveGroup {
  enemyId: string;
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
}

export interface GameData {
  config: Config;
  enemies: Record<string, EnemyDef>;
  towers: Record<string, TowerDef>;
  level: LevelDef;
  waves: WavesFile;
}
