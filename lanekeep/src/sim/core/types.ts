import type { DamageType } from '../../data/types';

export type Command = { type: 'placeTower'; spotId: string; towerId: string };

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
}

export interface Tower {
  id: number;
  defId: string;
  spotId: string;
  x: number;
  y: number;
  tier: number;
  /** Ticks until the tower may fire again. */
  cooldown: number;
  invested: number;
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
}

export type SimEvent =
  | { type: 'enemySpawned'; tick: number; id: number }
  | { type: 'enemyKilled'; tick: number; id: number; gold: number }
  | { type: 'enemyLeaked'; tick: number; id: number; lives: number }
  | { type: 'towerPlaced'; tick: number; id: number }
  | { type: 'projectileFired'; tick: number; id: number }
  | { type: 'projectileHit'; tick: number; id: number; targetId: number; damage: number }
  | { type: 'commandRejected'; tick: number; reason: string }
  | { type: 'won'; tick: number }
  | { type: 'lost'; tick: number };
