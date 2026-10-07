import { Graphics } from 'pixi.js';
import type { Sim } from '../sim/sim';

/**
 * All art is drawn from primitives here, so it is original and needs no image files.
 * Render-only: nothing in this file touches sim state. Decor uses its own small PRNG so the map looks the same every visit.
 */

export const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
};

// ---------------------------------------------------------------- terrain

export function drawTerrain(g: Graphics, sim: Sim): void {
  const { width: W, height: H } = sim.data.level.world;
  const rnd = lcg(1337);
  g.clear();
  g.rect(0, 0, W, H).fill({ color: 0x2f5e36 });
  // Soft meadow patches
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, rx = 40 + rnd() * 110, ry = 20 + rnd() * 60;
    g.ellipse(x, y, rx, ry).fill({ color: rnd() < 0.5 ? 0x3b7040 : 0x275430, alpha: 0.35 });
  }

  const pathPts: { x: number; y: number }[] = [];
  let halfWidth = 30;
  for (const [id, p] of Object.entries(sim.data.level.paths)) {
    const path = sim.paths[id];
    if (!path) continue;
    halfWidth = Math.max(halfWidth, (p.lanes * p.laneSpacing) / 2 + 10);
    for (let d = 0; d <= path.length; d += 10) pathPts.push(path.sample(d));
  }
  const spots = sim.data.level.buildSpots;
  const clear = (x: number, y: number, pad: number): boolean =>
    pathPts.every((p) => Math.hypot(p.x - x, p.y - y) > halfWidth + pad) && spots.every((s) => Math.hypot(s.x - x, s.y - y) > 52 + pad * 0.3);

  // Pond bottom-left (kept off the road)
  const pond = { x: 230, y: 600, rx: 120, ry: 52 };
  if (pathPts.every((p) => Math.hypot((p.x - pond.x) / (pond.rx + 40), (p.y - pond.y) / (pond.ry + 40)) > 1)) {
    g.ellipse(pond.x, pond.y + 4, pond.rx + 10, pond.ry + 8).fill({ color: 0x1f3d2a });
    g.ellipse(pond.x, pond.y, pond.rx, pond.ry).fill({ color: 0x2c7fa8 });
    g.ellipse(pond.x - 10, pond.y - 8, pond.rx * 0.78, pond.ry * 0.6).fill({ color: 0x3a9bc4, alpha: 0.7 });
    for (let i = 0; i < 6; i++) g.ellipse(pond.x - 60 + i * 24, pond.y - 14 + (i % 3) * 10, 12, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
    for (let i = 0; i < 5; i++) g.circle(pond.x + 30 + i * 14, pond.y + 12 - (i % 2) * 6, 7).fill({ color: 0x3f8a3a }).circle(pond.x + 33 + i * 14, pond.y + 10 - (i % 2) * 6, 2).fill({ color: 0xf5a0c0 });
  }

  // Road: shadowed edge, packed dirt, lighter center, ruts, pebbles
  for (const [id, p] of Object.entries(sim.data.level.paths)) {
    const path = sim.paths[id];
    if (!path) continue;
    const trace = (offset: number): void => {
      for (let d = 0; d <= path.length; d += 8) {
        const s = path.sample(d);
        const n = path.sample(Math.min(path.length, d + 1));
        const dx = n.x - s.x, dy = n.y - s.y, l = Math.hypot(dx, dy) || 1;
        const x = s.x - (dy / l) * offset, y = s.y + (dx / l) * offset;
        if (d === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    };
    const w = p.lanes * p.laneSpacing;
    trace(0); g.stroke({ width: w + 26, color: 0x22402a, alpha: 0.55, cap: 'round', join: 'round' });
    trace(0); g.stroke({ width: w + 14, color: 0x6f5a38, cap: 'round', join: 'round' });
    trace(0); g.stroke({ width: w + 2, color: 0x8d7449, cap: 'round', join: 'round' });
    trace(0); g.stroke({ width: w - 12, color: 0x9d8556, alpha: 0.8, cap: 'round', join: 'round' });
    for (const o of [-p.laneSpacing * 0.9, p.laneSpacing * 0.9]) { trace(o); g.stroke({ width: 2, color: 0x6a5634, alpha: 0.55 }); }
    for (let i = 0; i < path.length / 9; i++) {
      const s = path.sample(rnd() * path.length);
      const o = (rnd() - 0.5) * (w + 16);
      g.ellipse(s.x + o * 0.3, s.y + o, 1.5 + rnd() * 2.5, 1 + rnd() * 1.5).fill({ color: rnd() < 0.5 ? 0x6a5634 : 0xb9a273, alpha: 0.8 });
    }
  }

  // Grass tufts and flowers
  const flowers = [0xf5e050, 0xf0f0f0, 0xe070a0, 0x9080f0];
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (!clear(x, y, 6)) continue;
    const c = rnd() < 0.5 ? 0x4d9a52 : 0x3a7a42;
    g.moveTo(x, y).lineTo(x - 3, y - 6).moveTo(x, y).lineTo(x, y - 8).moveTo(x, y).lineTo(x + 3, y - 6).stroke({ width: 1.4, color: c });
  }
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (!clear(x, y, 10)) continue;
    g.circle(x, y, 2.4).fill({ color: flowers[Math.floor(rnd() * flowers.length)]! }).circle(x, y, 0.9).fill({ color: 0xf0c030 });
  }

  // Rocks and bushes, then trees (sorted by y so they overlap correctly)
  type Prop = { y: number; draw: () => void };
  const props: Prop[] = [];
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, s = 6 + rnd() * 10;
    if (!clear(x, y, 22)) continue;
    props.push({ y, draw: () => {
      g.ellipse(x + 2, y + s * 0.5, s * 1.2, s * 0.45).fill({ color: 0x000000, alpha: 0.25 });
      g.poly([x - s, y + s * 0.4, x - s * 0.7, y - s * 0.5, x + s * 0.2, y - s * 0.8, x + s, y - s * 0.1, x + s * 0.8, y + s * 0.5]).fill({ color: 0x8a8d94 }).stroke({ width: 1.5, color: 0x4a4d54 });
      g.poly([x - s * 0.6, y - s * 0.4, x + s * 0.2, y - s * 0.7, x + s * 0.5, y - s * 0.2, x - s * 0.2, y - s * 0.1]).fill({ color: 0xaeb1b8, alpha: 0.7 });
      g.ellipse(x - s * 0.3, y - s * 0.6, s * 0.5, s * 0.2).fill({ color: 0x4d9a52, alpha: 0.85 });
    } });
  }
  for (let i = 0; i < 24; i++) {
    const x = rnd() * W, y = rnd() * H, s = 8 + rnd() * 8;
    if (!clear(x, y, 20)) continue;
    props.push({ y, draw: () => {
      g.ellipse(x, y + s * 0.5, s * 1.4, s * 0.5).fill({ color: 0x000000, alpha: 0.25 });
      for (const [dx, dy, k] of [[-s * 0.6, 0, 0.9], [s * 0.6, 0, 0.9], [0, -s * 0.5, 1]] as const) g.circle(x + dx, y + dy, s * k).fill({ color: 0x2e7a3a }).stroke({ width: 1.5, color: 0x1c4a26 });
      g.circle(x - s * 0.2, y - s * 0.8, s * 0.35).fill({ color: 0x4fb050, alpha: 0.8 });
    } });
  }
  const treeSpots: [number, number][] = [];
  for (let i = 0; i < 160 && treeSpots.length < 34; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (!clear(x, y, 38)) continue;
    if (treeSpots.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 64)) continue;
    if (Math.hypot((x - pond.x) / (pond.rx + 30), (y - pond.y) / (pond.ry + 30)) < 1) continue;
    treeSpots.push([x, y]);
  }
  for (const [x, y] of treeSpots) {
    const s = 0.8 + rnd() * 0.6, pine = rnd() < 0.4;
    props.push({ y, draw: () => {
      g.ellipse(x + 6, y + 2, 26 * s, 9 * s).fill({ color: 0x000000, alpha: 0.28 });
      g.roundRect(x - 4 * s, y - 22 * s, 8 * s, 26 * s, 2).fill({ color: 0x5a3c22 }).stroke({ width: 1.5, color: 0x33210f });
      if (pine) {
        for (let k = 0; k < 3; k++) {
          const by = y - (20 + k * 18) * s, w = (28 - k * 6) * s;
          g.poly([x - w, by + 10 * s, x, by - 20 * s, x + w, by + 10 * s]).fill({ color: shade(0x2a6a3a, 1 + k * 0.12) }).stroke({ width: 1.5, color: 0x173d22 });
        }
      } else {
        g.circle(x - 14 * s, y - 36 * s, 18 * s).fill({ color: 0x2a7a3a }).stroke({ width: 1.5, color: 0x173d22 });
        g.circle(x + 14 * s, y - 38 * s, 19 * s).fill({ color: 0x2f8640 }).stroke({ width: 1.5, color: 0x173d22 });
        g.circle(x, y - 50 * s, 22 * s).fill({ color: 0x3a9a4a }).stroke({ width: 1.5, color: 0x173d22 });
        g.circle(x - 6 * s, y - 56 * s, 9 * s).fill({ color: 0x5cc060, alpha: 0.6 });
      }
    } });
  }
  props.sort((a, b) => a.y - b.y).forEach((p) => p.draw());

  // Build pads: mossy stone rings
  for (const s of spots) {
    g.ellipse(s.x + 2, s.y + 6, 24, 12).fill({ color: 0x000000, alpha: 0.3 });
    g.ellipse(s.x, s.y + 3, 22, 13).fill({ color: 0x5b5f68 }).stroke({ width: 1.5, color: 0x33363c });
    g.ellipse(s.x, s.y, 21, 12.5).fill({ color: 0x8a8e98 }).stroke({ width: 1.5, color: 0x4a4d54 });
    g.ellipse(s.x, s.y - 1, 14, 8).fill({ color: 0x6f737d });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.circle(s.x + Math.cos(a) * 20, s.y + Math.sin(a) * 11.5, 2).fill({ color: 0x4d9a52, alpha: 0.9 }); }
  }

  // Dark edges pull the eye toward the road
  for (let i = 0; i < 6; i++) g.rect(-i * 6, -i * 6, W + i * 12, H + i * 12).stroke({ width: 26, color: 0x07140c, alpha: 0.09 });
}

// ---------------------------------------------------------------- towers

export interface TowerLook {
  defId: string;
  tier: number;
  specId: string;
  x: number;
  y: number;
  selected: boolean;
  /** Seconds, for idle animation. */
  time: number;
  /** 0..1 recoil/flash right after firing. */
  fire: number;
}

const SPEC_ACCENT: Record<string, number> = {
  sharpshooter: 0xe8e8ff, rapidRanger: 0xffd060, archmage: 0xff80ff, hexer: 0x70ff90, bombard: 0xff7a40, clusterMortar: 0xffd040, phalanx: 0xc8d4e8, skirmishers: 0xff6a5a,
};

function banner(g: Graphics, x: number, y: number, h: number, color: number, t: number): void {
  g.moveTo(x, y).lineTo(x, y - h).stroke({ width: 2, color: 0x3a2a1a });
  const wave = Math.sin(t * 4) * 2;
  g.poly([x, y - h, x + 14, y - h + 3 + wave, x + 10, y - h + 7, x + 14, y - h + 11 - wave, x, y - h + 12]).fill({ color }).stroke({ width: 1, color: shade(color, 0.5) });
}

export function drawTower(g: Graphics, o: TowerLook): void {
  const { x, y, tier, time } = o;
  const accent = SPEC_ACCENT[o.specId];
  g.ellipse(x + 3, y + 10, 26, 10).fill({ color: 0x000000, alpha: 0.3 });
  if (o.selected) g.ellipse(x, y + 8, 30, 13).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });

  switch (o.defId) {
    case 'archer': {
      const h = 30 + tier * 10;
      g.poly([x - 18, y + 8, x - 14, y - h, x + 14, y - h, x + 18, y + 8]).fill({ color: 0x8a6a3e }).stroke({ width: 2, color: 0x3a2812 });
      for (let k = 1; k < 3 + tier; k++) g.moveTo(x - 16, y + 8 - k * (h / (3 + tier))).lineTo(x + 16, y + 8 - k * (h / (3 + tier))).stroke({ width: 1, color: 0x5a4020, alpha: 0.7 });
      g.rect(x - 20, y - h - 5, 40, 8).fill({ color: 0x6a4e2c }).stroke({ width: 2, color: 0x3a2812 });
      for (let k = 0; k < 4; k++) g.rect(x - 19 + k * 10.5, y - h - 10, 7, 6).fill({ color: 0x8a6a3e }).stroke({ width: 1, color: 0x3a2812 });
      g.poly([x - 18, y - h - 10, x, y - h - 30 - tier * 4, x + 18, y - h - 10]).fill({ color: 0xb03a30 }).stroke({ width: 2, color: 0x5a1a14 });
      g.circle(x, y - h - 14, 5).fill({ color: 0xe8c9a0 }).stroke({ width: 1.2, color: 0x6a4a2a });
      { const ax = x + 9 + o.fire * -3, ay = y - h - 8; g.moveTo(ax + 8 * Math.cos(-1.2), ay + 8 * Math.sin(-1.2)).arc(ax, ay, 8, -1.2, 1.2).stroke({ width: 2, color: 0xe0c070 }); }
      if (tier >= 1) banner(g, x - 18, y - h - 8, 18, 0xc03030, time);
      if (tier >= 2) banner(g, x + 18, y - h - 8, 18, 0xc03030, time + 1);
      break;
    }
    case 'mage': {
      const h = 38 + tier * 9;
      g.poly([x - 17, y + 8, x - 11, y - h, x + 11, y - h, x + 17, y + 8]).fill({ color: 0x8a86a0 }).stroke({ width: 2, color: 0x34304a });
      for (let k = 0; k < 4 + tier; k++) g.rect(x - 8 + (k % 2) * 7, y - 6 - k * (h / (4 + tier)), 7, 3).fill({ color: 0x6a668a, alpha: 0.8 });
      g.rect(x - 14, y - h - 3, 28, 6).fill({ color: 0x5a5680 }).stroke({ width: 2, color: 0x34304a });
      g.poly([x - 14, y - h - 3, x, y - h - 26 - tier * 4, x + 14, y - h - 3]).fill({ color: 0x5a3aa8 }).stroke({ width: 2, color: 0x2a1a5a });
      const orbY = y - h - 22 - tier * 4 - 8 + Math.sin(time * 2.4) * 3;
      const col = accent ?? 0x9fe8ff;
      g.circle(x, orbY, 12 + o.fire * 4).fill({ color: col, alpha: 0.25 });
      g.circle(x, orbY, 6).fill({ color: col }).stroke({ width: 1.5, color: 0xffffff });
      for (let k = 0; k < tier + 1; k++) { const a = time * 1.6 + (k * Math.PI * 2) / (tier + 1); g.poly([x + Math.cos(a) * 20, orbY - 5 + Math.sin(a) * 6, x + Math.cos(a) * 20 + 3, orbY + Math.sin(a) * 6, x + Math.cos(a) * 20, orbY + 5 + Math.sin(a) * 6, x + Math.cos(a) * 20 - 3, orbY + Math.sin(a) * 6]).fill({ color: col, alpha: 0.9 }); }
      break;
    }
    case 'mortar': {
      g.roundRect(x - 24, y - 12 - tier * 3, 48, 22 + tier * 3, 5).fill({ color: 0x7a7e86 }).stroke({ width: 2, color: 0x33363c });
      for (let k = 0; k < 5; k++) g.rect(x - 22 + k * 9.5, y - 15 - tier * 3, 6, 5).fill({ color: 0x8e929a }).stroke({ width: 1, color: 0x33363c });
      g.ellipse(x - 14, y + 12, 8, 8).fill({ color: 0x5a3c22 }).stroke({ width: 2, color: 0x2a1a0a });
      g.ellipse(x + 14, y + 12, 8, 8).fill({ color: 0x5a3c22 }).stroke({ width: 2, color: 0x2a1a0a });
      const n = tier + 1;
      for (let k = 0; k < n; k++) {
        const bx = x + (k - (n - 1) / 2) * 11, rec = o.fire * 4;
        g.poly([bx - 6, y - 14 - tier * 3, bx - 4, y - 38 - rec * -1 + rec, bx + 4, y - 38 + rec, bx + 6, y - 14 - tier * 3]).fill({ color: accent ? shade(accent, 0.55) : 0x3a3d44 }).stroke({ width: 2, color: 0x16181c });
        g.ellipse(bx, y - 38 + rec, 5, 2.5).fill({ color: 0x0c0d10 });
      }
      if (o.fire > 0.1) g.circle(x, y - 42, 8 * o.fire).fill({ color: 0xffb040, alpha: o.fire * 0.8 });
      break;
    }
    default: {
      // barracks
      const w = 28 + tier * 3;
      g.rect(x - w, y - 18, w * 2, 28).fill({ color: 0xa88a5a }).stroke({ width: 2, color: 0x4a3418 });
      g.poly([x - w - 6, y - 16, x, y - 44 - tier * 4, x + w + 6, y - 16]).fill({ color: accent ? shade(accent, 0.7) : 0x3a64b8 }).stroke({ width: 2, color: 0x1a2f66 });
      g.poly([x - 8, y + 10, x - 8, y - 6, x, y - 12, x + 8, y - 6, x + 8, y + 10]).fill({ color: 0x3a2812 });
      g.moveTo(x - w + 4, y - 18).lineTo(x - w + 4, y + 10).moveTo(x + w - 4, y - 18).lineTo(x + w - 4, y + 10).stroke({ width: 2, color: 0x6a4e2c });
      banner(g, x, y - 44 - tier * 4, 16, accent ?? 0x3a64b8, time);
      for (let k = 0; k < tier + 1; k++) { g.poly([x - 22 + k * 22, y - 2, x - 18 + k * 22, y - 12, x - 14 + k * 22, y - 2, x - 18 + k * 22, y + 6]).fill({ color: 0xc8d0e0 }).stroke({ width: 1, color: 0x4a4f5c }); }
    }
  }
  // Tier pips
  for (let i = 0; i <= tier; i++) g.circle(x - tier * 5 + i * 10, y + 20, 3).fill({ color: 0xffd050 }).stroke({ width: 1, color: 0x6a4a10 });
}

// ---------------------------------------------------------------- units

export interface EnemyLook {
  defId: string;
  x: number;
  y: number;
  r: number;
  /** +1 facing right, -1 left. */
  face: number;
  /** Walk phase in seconds. */
  time: number;
  enraged: boolean;
  boss: boolean;
  hurt: boolean;
}

const legs = (g: Graphics, x: number, y: number, r: number, t: number, color: number): void => {
  const s = Math.sin(t * 12) * r * 0.35;
  g.moveTo(x - r * 0.3, y + r * 0.6).lineTo(x - r * 0.3 + s, y + r * 1.15).moveTo(x + r * 0.3, y + r * 0.6).lineTo(x + r * 0.3 - s, y + r * 1.15).stroke({ width: Math.max(2, r * 0.22), color, cap: 'round' });
};

export function drawEnemy(g: Graphics, o: EnemyLook): void {
  const { x, r, face: f, time: t } = o;
  const fly = o.defId === 'cave_bat';
  const bob = Math.sin(t * 12) * 1.3;
  const y = o.y - (fly ? 14 : 0) + (fly ? Math.sin(t * 5) * 3 : bob);
  g.ellipse(o.x, o.y + (fly ? 6 : r * 1.1), r * (fly ? 0.8 : 1.1), r * 0.35).fill({ color: 0x000000, alpha: fly ? 0.2 : 0.3 });
  const tint = (c: number) => (o.hurt ? shade(c, 1.35) : c);
  const eye = (ex: number, ey: number, c = 0xffe040, s = 0.16) => g.circle(x + ex * f, ey, r * s).fill({ color: c }).circle(x + ex * f + f * r * 0.04, ey, r * s * 0.45).fill({ color: 0x200808 });

  switch (o.defId) {
    case 'goblin_runner': {
      legs(g, x, y, r, t, 0x2a4a22);
      g.poly([x - r * 0.9 * f, y - r * 0.5, x - r * 1.5 * f, y - r * 0.9, x - r * 0.8 * f, y - r * 0.2]).fill({ color: tint(0x5aa43a) });
      g.ellipse(x, y, r * 0.95, r * 0.85).fill({ color: tint(0x6cc04a) }).stroke({ width: 1.5, color: 0x1e3a14 });
      g.poly([x + r * 0.5 * f, y - r * 0.6, x + r * 1.3 * f, y - r * 1.1, x + r * 0.8 * f, y - r * 0.2]).fill({ color: tint(0x5aa43a) });
      eye(r * 0.35, y - r * 0.25, 0xffe040, 0.2);
      g.moveTo(x + r * 0.9 * f, y + r * 0.1).lineTo(x + r * 1.7 * f, y - r * 0.5).stroke({ width: 2.5, color: 0xcfd6e0 });
      break;
    }
    case 'armored_brute': {
      legs(g, x, y, r, t * 0.6, 0x2a2c32);
      g.roundRect(x - r * 0.95, y - r * 0.8, r * 1.9, r * 1.7, r * 0.45).fill({ color: tint(0x8c93a3) }).stroke({ width: 2, color: 0x2a2c32 });
      g.moveTo(x - r * 0.9, y - r * 0.1).lineTo(x + r * 0.9, y - r * 0.1).moveTo(x - r * 0.9, y + r * 0.4).lineTo(x + r * 0.9, y + r * 0.4).stroke({ width: 1.5, color: 0x4a4d58 });
      g.ellipse(x + r * 0.2 * f, y - r * 1.0, r * 0.65, r * 0.55).fill({ color: tint(0xaab0be) }).stroke({ width: 2, color: 0x2a2c32 });
      g.rect(x + r * 0.2 * f - r * 0.5 * (f > 0 ? 0 : 1), y - r * 1.1, r * 0.5, r * 0.14).fill({ color: 0x101216 });
      g.poly([x + r * 0.2 * f, y - r * 1.5, x + r * 0.05 * f, y - r * 1.1, x + r * 0.35 * f, y - r * 1.1]).fill({ color: 0xc03030 });
      g.roundRect(x + r * 0.95 * f - r * 0.4, y - r * 0.5, r * 0.8, r * 1.2, 4).fill({ color: 0x5a6a9a }).stroke({ width: 2, color: 0x20243a });
      g.circle(x + r * 0.95 * f, y + r * 0.1, r * 0.2).fill({ color: 0xd8d8e0 });
      break;
    }
    case 'arcane_wisp': {
      const p = 0.75 + Math.sin(t * 6) * 0.25;
      for (let k = 4; k >= 1; k--) g.circle(x - f * k * r * 0.6, y + Math.sin(t * 8 + k) * 2, r * (0.9 - k * 0.14)).fill({ color: 0x4fd0f0, alpha: 0.12 * k });
      g.circle(x, y, r * 1.5 * p).fill({ color: 0x4fd0f0, alpha: 0.18 });
      g.circle(x, y, r * 0.95).fill({ color: tint(0x6fe0ff) }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
      g.circle(x + r * 0.2 * f, y - r * 0.1, r * 0.4).fill({ color: 0xffffff });
      eye(r * 0.35, y - r * 0.1, 0x0a3a5a, 0.14);
      break;
    }
    case 'cave_bat': {
      const flap = Math.sin(t * 16);
      for (const s of [-1, 1]) {
        g.poly([x, y - 1, x + s * r * 2.2, y - r * (1.3 + flap * 0.9), x + s * r * 1.7, y - r * (0.1 + flap * 0.4), x + s * r * 1.2, y + r * 0.3, x + s * r * 0.8, y - r * 0.1, x + s * r * 0.35, y + r * 0.35]).fill({ color: tint(0x7a5ca8) }).stroke({ width: 1.5, color: 0x2a1a4a });
      }
      g.ellipse(x, y, r * 0.65, r * 0.8).fill({ color: tint(0x4a3a6a) }).stroke({ width: 1.5, color: 0x1a1030 });
      g.poly([x - r * 0.5, y - r * 0.5, x - r * 0.45, y - r * 1.1, x - r * 0.1, y - r * 0.6]).fill({ color: 0x4a3a6a });
      g.poly([x + r * 0.5, y - r * 0.5, x + r * 0.45, y - r * 1.1, x + r * 0.1, y - r * 0.6]).fill({ color: 0x4a3a6a });
      g.circle(x - r * 0.25, y - r * 0.15, r * 0.14).fill({ color: 0xff4040 }).circle(x + r * 0.25, y - r * 0.15, r * 0.14).fill({ color: 0xff4040 });
      break;
    }
    case 'goblin_shaman': {
      legs(g, x, y, r, t * 0.8, 0x2a3a22);
      g.poly([x - r * 0.9, y + r * 0.9, x - r * 0.55, y - r * 0.5, x + r * 0.55, y - r * 0.5, x + r * 0.9, y + r * 0.9]).fill({ color: tint(0x4a7a8a) }).stroke({ width: 1.5, color: 0x1a2f38 });
      g.circle(x, y - r * 0.8, r * 0.62).fill({ color: tint(0x6cc04a) }).stroke({ width: 1.5, color: 0x1e3a14 });
      g.poly([x - r * 0.8, y - r * 0.7, x, y - r * 1.7, x + r * 0.8, y - r * 0.7]).fill({ color: 0x3a5a6a }).stroke({ width: 1.5, color: 0x1a2f38 });
      eye(r * 0.25, y - r * 0.7, 0xffe040, 0.15);
      const sx = x + r * 1.0 * f;
      g.moveTo(sx, y + r * 0.9).lineTo(sx, y - r * 1.3).stroke({ width: 2.5, color: 0x6a4a2a });
      g.circle(sx, y - r * 1.5, r * (0.35 + Math.sin(t * 6) * 0.05)).fill({ color: 0x70ff90 }).stroke({ width: 1.2, color: 0xffffff });
      g.circle(sx, y - r * 1.5, r * 0.9).fill({ color: 0x70ff90, alpha: 0.15 });
      break;
    }
    case 'goblin_archer': {
      legs(g, x, y, r, t, 0x2a3a22);
      g.ellipse(x, y, r * 0.9, r * 0.8).fill({ color: tint(0x8a6a3e) }).stroke({ width: 1.5, color: 0x3a2812 });
      g.circle(x, y - r * 0.75, r * 0.58).fill({ color: tint(0x6cc04a) }).stroke({ width: 1.5, color: 0x1e3a14 });
      g.poly([x - r * 0.7, y - r * 0.8, x, y - r * 1.55, x + r * 0.7, y - r * 0.8]).fill({ color: 0x6a4a2a }).stroke({ width: 1.5, color: 0x33210f });
      eye(r * 0.25, y - r * 0.7, 0xffe040, 0.14);
      { const a0 = f > 0 ? -1.3 : Math.PI - 1.3; g.moveTo(x + r * 0.9 * f + r * 0.9 * Math.cos(a0), y - r * 0.1 + r * 0.9 * Math.sin(a0)).arc(x + r * 0.9 * f, y - r * 0.1, r * 0.9, a0, a0 + 2.6).stroke({ width: 2.5, color: 0x6a4a2a }); }
      g.moveTo(x + r * 0.9 * f, y - r * 0.1 - r * 0.9 * 0.96).lineTo(x + r * 0.9 * f, y - r * 0.1 + r * 0.9 * 0.96).stroke({ width: 1, color: 0xe8e8e8 });
      break;
    }
    case 'ogre': {
      legs(g, x, y, r, t * 0.5, 0x4a3420);
      g.ellipse(x, y, r * 1.05, r * 0.95).fill({ color: tint(o.enraged ? 0xc0603a : 0xc09060) }).stroke({ width: 2, color: 0x4a3420 });
      g.roundRect(x - r * 0.8, y + r * 0.1, r * 1.6, r * 0.45, 4).fill({ color: 0x5a3c22 });
      g.circle(x + r * 0.2 * f, y - r * 0.95, r * 0.6).fill({ color: tint(o.enraged ? 0xd07040 : 0xd0a070) }).stroke({ width: 2, color: 0x4a3420 });
      g.poly([x + r * 0.2 * f - r * 0.3, y - r * 0.5, x + r * 0.2 * f - r * 0.2, y - r * 0.3, x + r * 0.2 * f - r * 0.05, y - r * 0.5]).fill({ color: 0xffffff });
      g.poly([x + r * 0.2 * f + r * 0.3, y - r * 0.5, x + r * 0.2 * f + r * 0.2, y - r * 0.3, x + r * 0.2 * f + r * 0.05, y - r * 0.5]).fill({ color: 0xffffff });
      eye(r * 0.4, y - r * 1.05, o.enraged ? 0xff4020 : 0xffe040, 0.13);
      g.moveTo(x + r * 1.0 * f, y + r * 0.3).lineTo(x + r * 1.7 * f, y - r * 0.9).stroke({ width: r * 0.28, color: 0x6a4a2a, cap: 'round' });
      g.circle(x + r * 1.7 * f, y - r * 1.0, r * 0.38).fill({ color: 0x6a4a2a }).stroke({ width: 1.5, color: 0x33210f });
      break;
    }
    case 'brood_mother': {
      for (let k = -1; k <= 1; k += 2) for (let j = 0; j < 3; j++) { const s = Math.sin(t * 8 + j * 1.3) * r * 0.2; g.moveTo(x + k * r * 0.5, y + (j - 1) * r * 0.4).lineTo(x + k * r * 1.5, y + (j - 1) * r * 0.9 + s).lineTo(x + k * r * 1.7, y + (j - 1) * r * 1.2 + s).stroke({ width: 2.5, color: 0x3a1a3a }); }
      g.ellipse(x - f * r * 0.5, y + r * 0.1, r * 1.0, r * 0.85).fill({ color: tint(0x8a3a80) }).stroke({ width: 2, color: 0x2a0f2a });
      for (let k = 0; k < 4; k++) g.circle(x - f * r * (0.1 + k * 0.35), y - r * 0.3 + (k % 2) * r * 0.4, r * 0.18).fill({ color: 0xe8d890, alpha: 0.9 });
      g.ellipse(x + f * r * 0.6, y - r * 0.1, r * 0.65, r * 0.55).fill({ color: tint(0xa04a98) }).stroke({ width: 2, color: 0x2a0f2a });
      for (let k = 0; k < 4; k++) g.circle(x + f * (r * 0.5 + (k % 2) * r * 0.25), y - r * 0.35 + (k >> 1) * r * 0.22, r * 0.1).fill({ color: 0xff3040 });
      g.poly([x + f * r * 1.1, y + r * 0.1, x + f * r * 1.4, y + r * 0.5, x + f * r * 1.0, y + r * 0.3]).fill({ color: 0xe8e0d0 });
      break;
    }
    case 'warlord': {
      legs(g, x, y, r, t * 0.45, 0x2a1010);
      g.poly([x - f * r * 0.7, y - r * 0.6, x - f * r * 1.5, y + r * 1.0, x - f * r * 0.2, y + r * 0.9]).fill({ color: 0x701a1a, alpha: 0.95 }).stroke({ width: 2, color: 0x2a0808 });
      g.roundRect(x - r * 0.9, y - r * 0.7, r * 1.8, r * 1.6, r * 0.35).fill({ color: tint(0x9a2a2a) }).stroke({ width: 2.5, color: 0x2a0808 });
      g.roundRect(x - r * 0.95, y - r * 0.8, r * 0.5, r * 0.5, 4).fill({ color: 0x5a5e68 }).roundRect(x + r * 0.45, y - r * 0.8, r * 0.5, r * 0.5, 4).fill({ color: 0x5a5e68 });
      g.moveTo(x - r * 0.9, y + r * 0.2).lineTo(x + r * 0.9, y + r * 0.2).stroke({ width: 4, color: 0xd0a030 });
      g.circle(x, y - r * 1.0, r * 0.65).fill({ color: tint(0x78b040) }).stroke({ width: 2, color: 0x1e3a14 });
      g.poly([x - r * 0.7, y - r * 1.0, x - r * 0.65, y - r * 1.9, x - r * 0.3, y - r * 1.25, x, y - r * 1.8, x + r * 0.3, y - r * 1.25, x + r * 0.65, y - r * 1.9, x + r * 0.7, y - r * 1.0]).fill({ color: 0xe0b030 }).stroke({ width: 2, color: 0x6a4a10 });
      eye(r * 0.28, y - r * 0.95, 0xff4020, 0.15);
      g.moveTo(x + r * 1.1 * f, y + r * 0.6).lineTo(x + r * 1.5 * f, y - r * 1.2).stroke({ width: 4, color: 0x4a3420, cap: 'round' });
      g.poly([x + r * 1.5 * f, y - r * 1.9, x + r * 2.4 * f, y - r * 1.2, x + r * 1.5 * f, y - r * 0.5]).fill({ color: 0xc8d0dc }).stroke({ width: 2, color: 0x3a3f4c });
      break;
    }
    default:
      g.circle(x, y, r).fill({ color: tint(0xaa3030) }).stroke({ width: 1.5, color: 0x1a1210 });
  }
  if (o.enraged) g.circle(x, y, r * 1.5).stroke({ width: 2, color: 0xff5030, alpha: 0.5 + Math.sin(t * 10) * 0.3 });
  if (o.boss) g.ellipse(o.x, o.y + r * 1.1, r * 1.6, r * 0.5).stroke({ width: 2, color: 0xffb030, alpha: 0.7 });
}

export function drawSoldier(g: Graphics, x: number, y: number, face: number, time: number, summoned: boolean, fighting: boolean): void {
  const f = face || 1;
  g.ellipse(x, y + 8, 8, 3).fill({ color: 0x000000, alpha: 0.3 });
  const s = Math.sin(time * 12) * 2;
  g.moveTo(x - 2, y + 3).lineTo(x - 2 + s, y + 9).moveTo(x + 2, y + 3).lineTo(x + 2 - s, y + 9).stroke({ width: 2.5, color: 0x2a2e3a });
  g.roundRect(x - 5, y - 6, 10, 11, 3).fill({ color: summoned ? 0x8ac0f0 : 0x3a64b8 }).stroke({ width: 1.2, color: 0x16223f });
  g.circle(x, y - 9, 4.5).fill({ color: 0xc8d0dc }).stroke({ width: 1.2, color: 0x3a3f4c });
  g.rect(x - 3, y - 10, 6, 1.6).fill({ color: 0x20242c });
  g.circle(x - 6 * f, y - 1, 4).fill({ color: 0xc8a050 }).stroke({ width: 1, color: 0x4a3418 });
  const sw = fighting ? Math.sin(time * 18) * 4 : 0;
  g.moveTo(x + 5 * f, y - 1).lineTo(x + 11 * f, y - 9 + sw).stroke({ width: 2, color: 0xe0e6f0 });
}

export function drawHero(g: Graphics, x: number, y: number, face: number, time: number, fighting: boolean, moving: boolean): void {
  const f = face || 1;
  g.ellipse(x, y + 12, 12, 4).fill({ color: 0x000000, alpha: 0.3 });
  const s = moving ? Math.sin(time * 12) * 3 : 0;
  g.moveTo(x - 3, y + 5).lineTo(x - 3 + s, y + 13).moveTo(x + 3, y + 5).lineTo(x + 3 - s, y + 13).stroke({ width: 3.5, color: 0x5a3c22 });
  g.poly([x - f * 5, y - 8, x - f * 15, y + 12 + Math.sin(time * 5) * 1.5, x - f * 3, y + 9]).fill({ color: 0xc03030 }).stroke({ width: 1.2, color: 0x5a1010 });
  g.roundRect(x - 7, y - 9, 14, 17, 4).fill({ color: 0xe0b840 }).stroke({ width: 1.8, color: 0x6a4a10 });
  g.moveTo(x - 7, y + 1).lineTo(x + 7, y + 1).stroke({ width: 2, color: 0xa07818 });
  g.circle(x, y - 14, 6.5).fill({ color: 0xf0d070 }).stroke({ width: 1.8, color: 0x6a4a10 });
  g.rect(x - 4.5, y - 15, 9, 2).fill({ color: 0x20180a });
  g.poly([x - 1, y - 20, x, y - 28, x + 1, y - 20]).fill({ color: 0xc03030 });
  const sw = fighting ? Math.sin(time * 16) * 6 : 0;
  g.moveTo(x + 7 * f, y - 2).lineTo(x + 18 * f, y - 16 + sw).stroke({ width: 3, color: 0xf0f4ff });
  g.moveTo(x + 5 * f, y - 5).lineTo(x + 10 * f, y - 1).stroke({ width: 2.5, color: 0xa07818 });
}

export function drawProjectile(g: Graphics, x: number, y: number, px: number, py: number, kind: 'arrow' | 'magic' | 'shell', time: number): void {
  if (kind === 'arrow') {
    const dx = x - px, dy = y - py, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    g.moveTo(x - ux * 12, y - uy * 12).lineTo(x, y).stroke({ width: 2, color: 0xe8d8a8 });
    g.poly([x, y, x - ux * 4 - uy * 3, y - uy * 4 + ux * 3, x - ux * 4 + uy * 3, y - uy * 4 - ux * 3]).fill({ color: 0xd0d6e0 });
    g.moveTo(x - ux * 12, y - uy * 12).lineTo(x - ux * 15 - uy * 3, y - uy * 15 + ux * 3).moveTo(x - ux * 12, y - uy * 12).lineTo(x - ux * 15 + uy * 3, y - uy * 15 - ux * 3).stroke({ width: 1.5, color: 0xc03030 });
  } else if (kind === 'magic') {
    g.circle(x, y, 9).fill({ color: 0xb080ff, alpha: 0.25 });
    g.circle(x, y, 4.5 + Math.sin(time * 20) * 0.7).fill({ color: 0xd8b8ff }).stroke({ width: 1.2, color: 0xffffff });
    g.circle(px, py, 3).fill({ color: 0xb080ff, alpha: 0.4 });
  } else {
    g.circle(x + 2, y + 6, 4).fill({ color: 0x000000, alpha: 0.25 });
    g.circle(x, y, 5.5).fill({ color: 0x2a2d34 }).stroke({ width: 1.5, color: 0x0c0d10 });
    g.circle(x - 1.5, y - 1.5, 1.8).fill({ color: 0x8a8e98 });
  }
}
