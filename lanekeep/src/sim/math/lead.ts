export interface Intercept {
  x: number;
  y: number;
  /** Flight time in seconds. */
  t: number;
}

/**
 * Fixed-point iteration for a projectile of constant speed fired from (sx, sy)
 * at a target whose position at time t is given by posAt(t).
 */
export function leadIntercept(
  sx: number,
  sy: number,
  projSpeed: number,
  posAt: (t: number) => [number, number],
  iterations: number,
): Intercept {
  let [x, y] = posAt(0);
  let t = Math.hypot(x - sx, y - sy) / projSpeed;
  for (let i = 0; i < iterations; i++) {
    [x, y] = posAt(t);
    t = Math.hypot(x - sx, y - sy) / projSpeed;
  }
  return { x, y, t };
}
