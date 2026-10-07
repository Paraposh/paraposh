import type { LevelResult } from './flow';
import type { StarMap } from './campaign';

export interface Progress {
  /** Best stars per level. */
  stars: StarMap;
}

export function newProgress(): Progress {
  return { stars: {} };
}

/** Keeps the best stars per level. Returns how many new stars this result added. */
export function recordResult(progress: Progress, result: LevelResult): number {
  const before = progress.stars[result.levelId] ?? 0;
  if (!result.won || result.stars <= before) return 0;
  progress.stars[result.levelId] = result.stars;
  return result.stars - before;
}

export function totalStars(progress: Progress): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}
