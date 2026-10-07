import type { Sim } from '../sim/sim';

export type Pick = { kind: 'tower'; towerId: number; spotId: string } | { kind: 'spot'; spotId: string } | { kind: 'ground' };

/** What is under a world-space point: a built tower, a free build spot, or bare ground. */
export function pick(sim: Sim, x: number, y: number, radius = 26): Pick {
  let best: { spotId: string; d: number } | undefined;
  for (const s of sim.data.level.buildSpots) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= radius && (!best || d < best.d)) best = { spotId: s.id, d };
  }
  if (!best) return { kind: 'ground' };
  const tower = [...sim.towers.values()].find((t) => t.spotId === best!.spotId);
  return tower ? { kind: 'tower', towerId: tower.id, spotId: best.spotId } : { kind: 'spot', spotId: best.spotId };
}

/** Nearest barracks to a point (for right-click rally), or undefined. */
export function nearestBarracks(sim: Sim, x: number, y: number): number | undefined {
  let best: { id: number; d: number } | undefined;
  for (const t of sim.towers.values()) {
    if (sim.data.towers[t.defId]?.family !== 'meleeBarracks') continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (!best || d < best.d) best = { id: t.id, d };
  }
  return best?.id;
}
