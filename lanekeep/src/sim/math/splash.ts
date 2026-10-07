/**
 * Splash damage multiplier at distance d from the blast centre:
 * 1 at the centre, falling linearly to edgeMult at the radius, 0 beyond.
 */
export function splashFactor(d: number, radius: number, edgeMult: number): number {
  if (d > radius) return 0;
  return 1 + (edgeMult - 1) * (d / radius);
}
