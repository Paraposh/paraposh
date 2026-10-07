import type { Sim } from '../sim/sim';

export type Screen = 'menu' | 'map' | 'level' | 'results';
export type LevelPhase = 'prepare' | 'wave' | 'win' | 'lose';

export interface LevelResult {
  levelId: string;
  won: boolean;
  stars: number;
  livesLeft: number;
  ticks: number;
}

/** Level sub-state shown to the player: Prepare (before wave 1), Wave, then Win or Lose. */
export function levelPhase(sim: Sim): LevelPhase {
  if (sim.status === 'won') return 'win';
  if (sim.status === 'lost') return 'lose';
  return sim.status === 'wave' ? 'wave' : 'prepare';
}

const ALLOWED: Record<Screen, Screen[]> = {
  menu: ['map'],
  map: ['menu', 'level'],
  level: ['results', 'map'],
  results: ['level', 'map'],
};

/** Menu > Map > Level(Prepare > Wave > Win/Lose) > Results. Pure state: no DOM, no rendering. */
export class GameFlow {
  screen: Screen = 'menu';
  levelId = '';
  result: LevelResult | undefined;

  private go(to: Screen): void {
    if (!ALLOWED[this.screen].includes(to)) throw new Error(`Illegal transition ${this.screen} -> ${to}`);
    this.screen = to;
  }

  openMap(): void {
    this.go('map');
  }

  backToMenu(): void {
    this.go('menu');
  }

  startLevel(levelId: string): void {
    this.go('level');
    this.levelId = levelId;
    this.result = undefined;
  }

  /** From the results screen. */
  retry(): void {
    if (this.screen !== 'results') throw new Error(`Illegal transition ${this.screen} -> retry`);
    this.startLevel(this.levelId);
  }

  /** From a level or results screen back to the map (quit or continue). */
  backToMap(): void {
    this.go('map');
  }

  /**
   * Call once per frame with the live sim. When the level ends it records the result and moves to
   * Results; returns the result exactly once.
   */
  update(sim: Sim | undefined): LevelResult | undefined {
    if (this.screen !== 'level' || !sim || (sim.status !== 'won' && sim.status !== 'lost')) return undefined;
    const result: LevelResult = {
      levelId: this.levelId,
      won: sim.status === 'won',
      stars: sim.stars,
      livesLeft: sim.lives,
      ticks: sim.tick,
    };
    this.result = result;
    this.go('results');
    return result;
  }
}
