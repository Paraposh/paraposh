import { Application, Container, Graphics } from 'pixi.js';
import type { BarracksTier, ShooterTier } from '../data/types';
import type { Sim } from '../sim/sim';
import { Juice } from './juice';

const TOWER_COLORS: Record<string, number> = { archer: 0xc8a24a, mage: 0x7a6adf, mortar: 0xb06a3a, barracks: 0x4a78c8 };
const ENEMY_COLORS: Record<string, number> = {
  goblin_runner: 0x8a3030,
  armored_brute: 0x6a6f7a,
  arcane_wisp: 0x4fb6c9,
  cave_bat: 0xb8a0d8,
  goblin_shaman: 0x4a9a4a,
  goblin_archer: 0xb8742a,
  ogre: 0x8a5a3a,
  brood_mother: 0x7a2a6a,
  warlord: 0xc03030,
};

export interface DrawState {
  selectedTowerId: number | null;
  /** Spell waiting for a target click, drawn as a cursor ring. */
  armedSpellRadius: number | null;
  pointer: [number, number];
}

/** Draws a Sim to a PixiJS stage. Read-only with respect to the sim. */
export class Renderer {
  readonly juice = new Juice();
  private readonly world = new Container();
  private readonly g = new Graphics();
  private readonly vignette = new Graphics();

  constructor(private readonly app: Application) {
    this.world.addChild(this.g, this.juice.layer);
    app.stage.addChild(this.world, this.vignette);
  }

  clear(): void {
    this.g.clear();
    this.vignette.clear();
    this.juice.clear();
    this.world.position.set(0, 0);
  }

  draw(sim: Sim, alpha: number, view: DrawState, dt: number): void {
    const g = this.g;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const { width, height } = sim.data.level.world;
    g.clear();

    // Roads
    for (const [id, p] of Object.entries(sim.data.level.paths)) {
      const path = sim.paths[id];
      if (!path) continue;
      for (let d = 0; d <= path.length; d += 8) {
        const s = path.sample(d);
        if (d === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      }
      g.stroke({ width: p.lanes * p.laneSpacing + 10, color: 0x4a3f2a, alpha: 1 });
      for (let d = 0; d <= path.length; d += 8) {
        const s = path.sample(d);
        if (d === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      }
      g.stroke({ width: p.lanes * p.laneSpacing, color: 0x6b5a3a, alpha: 1 });
    }

    // Build spots and towers
    const occupied = new Set([...sim.towers.values()].map((t) => t.spotId));
    for (const s of sim.data.level.buildSpots) {
      if (!occupied.has(s.id)) g.circle(s.x, s.y, 18).fill({ color: 0x3a4a60 }).stroke({ width: 2, color: 0x5a6e8c });
    }
    const sel = view.selectedTowerId !== null ? sim.towers.get(view.selectedTowerId) : undefined;
    if (sel) {
      const tier = sim.tierOf(sel);
      const r = 'range' in tier ? (tier as ShooterTier).range : (tier as BarracksTier).rallyRange;
      g.circle(sel.x, sel.y, r).fill({ color: 0xffffff, alpha: 0.05 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
      if (sel.slots.length > 0) g.circle(sel.rallyX, sel.rallyY, sim.data.soldiers[(tier as BarracksTier).soldierId]?.engageRadius ?? 60).stroke({ width: 1, color: 0x4a78c8, alpha: 0.5 });
    }
    for (const t of sim.towers.values()) {
      const color = TOWER_COLORS[t.defId] ?? 0xffffff;
      g.circle(t.x, t.y, 17).fill({ color }).stroke({ width: t.id === view.selectedTowerId ? 3 : 2, color: t.id === view.selectedTowerId ? 0xffffff : 0x20242c });
      for (let i = 0; i <= t.tier; i++) g.circle(t.x - t.tier * 4 + i * 8, t.y + 24, 2.5).fill({ color: 0xffffff });
      if (t.specId) g.circle(t.x, t.y, 7).fill({ color: 0xffffff, alpha: 0.85 });
      if (t.slots.length > 0) g.circle(t.rallyX, t.rallyY, 5).stroke({ width: 2, color: 0x4a78c8 });
    }

    // Spell telegraphs
    for (const fx of sim.effects) {
      const sp = sim.data.spells[fx.spellId];
      if (sp?.kind !== 'areaDamage') continue;
      const k = 1 - fx.ticksLeft / Math.max(1, fx.totalTicks);
      g.circle(fx.x, fx.y, sp.radius).stroke({ width: 2, color: 0xff7a40, alpha: 0.3 + 0.6 * k });
      g.circle(fx.x, fx.y, sp.radius * k).fill({ color: 0xff7a40, alpha: 0.18 });
    }

    // Soldiers, hero
    for (const s of sim.soldiers.values()) {
      const x = lerp(s.prevX, s.x);
      const y = lerp(s.prevY, s.y);
      g.circle(x, y, 7).fill({ color: s.lifetime >= 0 ? 0x7aa8d8 : 0x4a78c8 }).stroke({ width: 1.5, color: 0x1a2a44 });
      if (s.hp < s.maxHp) g.rect(x - 9, y - 14, 18 * (s.hp / s.maxHp), 3).fill({ color: 0x60c0ff });
    }
    const hero = sim.hero;
    if (hero && hero.state !== 'dead') {
      const x = lerp(hero.prevX, hero.x);
      const y = lerp(hero.prevY, hero.y);
      g.circle(x, y, 11).fill({ color: 0xf2d060 }).stroke({ width: 2, color: 0x806010 });
      g.rect(x - 13, y - 19, 26 * (hero.hp / hero.maxHp), 3.5).fill({ color: 0xf2d060 });
      if (hero.moveX !== null && hero.moveY !== null) g.circle(hero.moveX, hero.moveY, 5).stroke({ width: 1.5, color: 0xf2d060, alpha: 0.8 });
    }

    // Enemies
    for (const e of sim.enemies.values()) {
      const def = sim.data.enemies[e.defId];
      const x = lerp(e.prevX, e.x);
      const y = lerp(e.prevY, e.y);
      const r = def?.radius ?? 9;
      const fly = def?.flying ? 10 : 0;
      if (def?.flying) g.ellipse(x, y + 4, r, r * 0.4).fill({ color: 0x000000, alpha: 0.25 });
      g.circle(x, y - fly, r).fill({ color: ENEMY_COLORS[e.defId] ?? 0xaa3030 }).stroke({ width: 1.5, color: 0x1a1210 });
      if (e.enraged) g.circle(x, y - fly, r + 3).stroke({ width: 2, color: 0xff5030 });
      if (e.shredStacks > 0) g.circle(x, y - fly, r + 2).stroke({ width: 1, color: 0xb0e0ff, alpha: 0.7 });
      g.rect(x - r, y - fly - r - 7, r * 2, 3).fill({ color: 0x20242c });
      g.rect(x - r, y - fly - r - 7, r * 2 * Math.max(0, e.hp / e.maxHp), 3).fill({ color: e.bossId ? 0xffb030 : 0x40c060 });
    }
    for (const p of sim.projectiles.values()) g.circle(lerp(p.prevX, p.x), lerp(p.prevY, p.y), p.splashRadius > 0 ? 4 : 2.5).fill({ color: 0xffffff });

    // Armed spell cursor
    if (view.armedSpellRadius !== null) {
      g.circle(view.pointer[0], view.pointer[1], view.armedSpellRadius).stroke({ width: 2, color: 0xffd080, alpha: 0.8 }).fill({ color: 0xffd080, alpha: 0.08 });
    }

    // Juice and shake
    this.juice.update(dt);
    const [sx, sy] = this.juice.shakeOffset;
    this.world.position.set(sx, sy);
    const v = this.vignette;
    v.clear();
    if (this.juice.leakFlash > 0.02) v.rect(0, 0, width, height).fill({ color: 0xff2020, alpha: this.juice.leakFlash * 0.22 });
  }
}
