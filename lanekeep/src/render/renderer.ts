import { Application, Container, Graphics } from 'pixi.js';
import type { BarracksTier, ShooterTier } from '../data/types';
import type { Sim } from '../sim/sim';
import { drawEnemy, drawHero, drawProjectile, drawSoldier, drawTerrain, drawTower } from './art';
import { Juice } from './juice';

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
  private readonly terrain = new Graphics();
  private readonly g = new Graphics();
  private readonly vignette = new Graphics();
  private terrainFor: string | undefined;
  private time = 0;

  constructor(private readonly app: Application) {
    this.world.addChild(this.terrain, this.g, this.juice.layer);
    app.stage.addChild(this.world, this.vignette);
  }

  clear(): void {
    this.g.clear();
    this.vignette.clear();
    this.juice.clear();
    this.world.position.set(0, 0);
    this.terrainFor = undefined;
  }

  draw(sim: Sim, alpha: number, view: DrawState, dt: number): void {
    const g = this.g;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const { width, height } = sim.data.level.world;
    this.time += dt;
    const time = this.time;
    if (this.terrainFor !== sim.data.level.id) {
      drawTerrain(this.terrain, sim);
      this.terrainFor = sim.data.level.id;
    }
    g.clear();

    // Range ring of the selected tower under everything else
    const sel = view.selectedTowerId !== null ? sim.towers.get(view.selectedTowerId) : undefined;
    if (sel) {
      const tier = sim.tierOf(sel);
      const r = 'range' in tier ? (tier as ShooterTier).range : (tier as BarracksTier).rallyRange;
      g.ellipse(sel.x, sel.y, r, r).fill({ color: 0xffffff, alpha: 0.06 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.4 });
      if (sel.slots.length > 0) g.circle(sel.rallyX, sel.rallyY, sim.data.soldiers[(tier as BarracksTier).soldierId]?.engageRadius ?? 60).stroke({ width: 1, color: 0x4a78c8, alpha: 0.6 });
    }

    // Spell telegraphs
    for (const fx of sim.effects) {
      const sp = sim.data.spells[fx.spellId];
      if (sp?.kind !== 'areaDamage') continue;
      const k = 1 - fx.ticksLeft / Math.max(1, fx.totalTicks);
      g.circle(fx.x, fx.y, sp.radius).stroke({ width: 2, color: 0xff7a40, alpha: 0.3 + 0.6 * k });
      g.circle(fx.x, fx.y, sp.radius * k).fill({ color: 0xff7a40, alpha: 0.18 });
      // falling meteor
      const my = fx.y - 380 * (1 - k) ** 2;
      g.circle(fx.x + 40 * (1 - k), my, 16).fill({ color: 0xff9040 }).circle(fx.x + 40 * (1 - k), my, 8).fill({ color: 0xfff0a0 });
    }

    // Everything standing on the ground is drawn back to front
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const tickRate = sim.data.config.tickRate;

    for (const t of sim.towers.values()) {
      const tier = sim.tierOf(t);
      const cd = 'cooldown' in tier ? (tier as ShooterTier).cooldown * tickRate : 1;
      const since = cd > 0 ? 1 - Math.min(1, t.cooldown / cd) : 1;
      const fire = 'range' in tier ? Math.max(0, 1 - since / 0.3) : 0;
      items.push({ y: t.y, draw: () => {
        drawTower(g, { defId: t.defId, tier: t.tier, specId: t.specId, x: t.x, y: t.y, selected: t.id === view.selectedTowerId, time, fire });
        if (t.slots.length > 0) {
          g.ellipse(t.rallyX, t.rallyY + 6, 9, 4).stroke({ width: 2, color: 0x4a78c8, alpha: 0.9 });
          g.moveTo(t.rallyX, t.rallyY + 4).lineTo(t.rallyX, t.rallyY - 14).stroke({ width: 1.5, color: 0x3a2a1a });
          g.poly([t.rallyX, t.rallyY - 14, t.rallyX + 9, t.rallyY - 11, t.rallyX, t.rallyY - 7]).fill({ color: 0x4a78c8 });
        }
      } });
    }
    for (const s of sim.soldiers.values()) {
      const x = lerp(s.prevX, s.x), y = lerp(s.prevY, s.y);
      const tgt = s.targetId ? sim.enemies.get(s.targetId) : undefined;
      const face = tgt ? Math.sign(tgt.x - x) : Math.sign(s.x - s.prevX);
      items.push({ y, draw: () => {
        drawSoldier(g, x, y, face, time + s.id, s.lifetime >= 0, s.state === 'fighting');
        if (s.hp < s.maxHp) g.rect(x - 9, y - 19, 18, 3).fill({ color: 0x20242c }).rect(x - 9, y - 19, 18 * (s.hp / s.maxHp), 3).fill({ color: 0x60c0ff });
      } });
    }
    const hero = sim.hero;
    if (hero && hero.state !== 'dead') {
      const x = lerp(hero.prevX, hero.x), y = lerp(hero.prevY, hero.y);
      const tgt = hero.targetId ? sim.enemies.get(hero.targetId) : undefined;
      const face = tgt ? Math.sign(tgt.x - x) : Math.sign(hero.x - hero.prevX);
      items.push({ y, draw: () => {
        g.ellipse(x, y + 12, 16, 6).fill({ color: 0xf2d060, alpha: 0.25 });
        drawHero(g, x, y, face, time, hero.state === 'fighting', hero.state === 'moving');
        g.rect(x - 14, y - 33, 28, 4).fill({ color: 0x20242c }).rect(x - 14, y - 33, 28 * (hero.hp / hero.maxHp), 4).fill({ color: 0xf2d060 });
        if (hero.moveX !== null && hero.moveY !== null) g.ellipse(hero.moveX, hero.moveY + 4, 8, 4).stroke({ width: 1.5, color: 0xf2d060, alpha: 0.8 });
      } });
    }
    for (const e of sim.enemies.values()) {
      const def = sim.data.enemies[e.defId];
      const x = lerp(e.prevX, e.x), y = lerp(e.prevY, e.y);
      const r = def?.radius ?? 9;
      const face = e.x - e.prevX >= 0 ? 1 : -1;
      items.push({ y: y + (def?.flying ? 100 : 0), draw: () => {
        drawEnemy(g, { defId: e.defId, x, y, r, face, time: time + e.id * 0.37, enraged: e.enraged, boss: !!e.bossId, hurt: false });
        const top = y - r * (e.bossId ? 2.3 : 1.9) - (def?.flying ? 14 : 0);
        g.roundRect(x - r, top, r * 2, 4, 2).fill({ color: 0x14181e }).stroke({ width: 1, color: 0x000000 });
        g.roundRect(x - r + 0.5, top + 0.5, (r * 2 - 1) * Math.max(0, e.hp / e.maxHp), 3, 1.5).fill({ color: e.bossId ? 0xffb030 : e.hp / e.maxHp > 0.4 ? 0x50d070 : 0xe05040 });
        if (e.shredStacks > 0) g.circle(x, y, r + 3).stroke({ width: 1, color: 0xb0e0ff, alpha: 0.7 });
      } });
    }
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    for (const p of sim.projectiles.values()) {
      const kind = p.splashRadius > 0 ? 'shell' : p.damageType === 'magic' ? 'magic' : 'arrow';
      drawProjectile(g, lerp(p.prevX, p.x), lerp(p.prevY, p.y), p.prevX, p.prevY, kind, time);
    }

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
