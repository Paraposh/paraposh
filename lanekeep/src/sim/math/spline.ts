import type { Vec2 } from '../../data/types';

export interface PathSample {
  x: number;
  y: number;
  /** Unit normal (left of travel direction). */
  nx: number;
  ny: number;
}

/** Arc-length parameterised path. Catmull-Rom (or linear) through control points, baked to a polyline. */
export class SplinePath {
  readonly length: number;
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly cum: number[] = [];

  constructor(points: Vec2[], kind: 'catmullRom' | 'linear', samplesPerSegment: number) {
    if (points.length < 2) throw new Error('A path needs at least 2 points');
    const push = (x: number, y: number) => {
      const n = this.xs.length;
      const prev = n > 0 ? (this.cum[n - 1] as number) : 0;
      const d = n > 0 ? Math.hypot(x - (this.xs[n - 1] as number), y - (this.ys[n - 1] as number)) : 0;
      this.xs.push(x);
      this.ys.push(y);
      this.cum.push(prev + d);
    };
    const pt = (i: number): Vec2 => points[Math.min(Math.max(i, 0), points.length - 1)] as Vec2;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = pt(i - 1);
      const p1 = pt(i);
      const p2 = pt(i + 1);
      const p3 = pt(i + 2);
      const steps = kind === 'linear' ? 1 : samplesPerSegment;
      for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
        const t = s / steps;
        if (kind === 'linear') {
          push(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t);
        } else {
          push(catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t));
        }
      }
    }
    this.length = this.cum[this.cum.length - 1] as number;
  }

  /** Closest sampled point on the path to (x, y), scanning every `step` units of arc length. */
  closestPoint(x: number, y: number, step = 6): { x: number; y: number; dist: number; d: number } {
    let best = { x: 0, y: 0, dist: Infinity, d: 0 };
    for (let d = 0; d <= this.length + step; d += step) {
      const s = this.sample(d);
      const dist = Math.hypot(s.x - x, s.y - y);
      if (dist < best.dist) best = { x: s.x, y: s.y, dist, d };
    }
    return best;
  }

  /** Position and normal at arc distance d (clamped to [0, length]). */
  sample(d: number): PathSample {
    const dist = Math.min(Math.max(d, 0), this.length);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((this.cum[mid] as number) <= dist) lo = mid;
      else hi = mid;
    }
    const c0 = this.cum[lo] as number;
    const c1 = this.cum[hi] as number;
    const f = c1 > c0 ? (dist - c0) / (c1 - c0) : 0;
    const x0 = this.xs[lo] as number;
    const y0 = this.ys[lo] as number;
    const dx = (this.xs[hi] as number) - x0;
    const dy = (this.ys[hi] as number) - y0;
    const len = Math.hypot(dx, dy) || 1;
    return { x: x0 + dx * f, y: y0 + dy * f, nx: -dy / len, ny: dx / len };
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
