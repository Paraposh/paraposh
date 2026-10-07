import { Container, Graphics, Text } from 'pixi.js';
import type { SimEvent } from '../sim/core/types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
}
interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
}
interface Floater {
  text: Text;
  vy: number;
  life: number;
  max: number;
}

/**
 * Render-only effects driven by sim events: particles, rings, floating numbers, screen shake.
 * Uses Math.random freely; none of this feeds back into the sim.
 */
export class Juice {
  readonly layer = new Container();
  private readonly g = new Graphics();
  private readonly texts = new Container();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private flash = 0;

  constructor() {
    this.layer.addChild(this.g, this.texts);
  }

  /** Current screen-shake offset to apply to the world container. */
  get shakeOffset(): [number, number] {
    return this.shake > 0.1 ? [(Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake] : [0, 0];
  }

  /** 0 to 1 red vignette strength after a leak. */
  get leakFlash(): number {
    return this.flash;
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    for (const f of this.floaters) f.text.destroy();
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
    this.g.clear();
  }

  handle(ev: SimEvent): void {
    switch (ev.type) {
      case 'projectileHit':
        this.burst(ev.x, ev.y, 4, 0xffe9a0, 70, 0.25);
        this.number(ev.x, ev.y - 10, String(Math.max(1, Math.round(ev.damage))), 0xffffff, 13);
        break;
      case 'meleeHit':
        this.burst(ev.x, ev.y, 3, ev.onSoldier ? 0xff6050 : 0xffe9a0, 55, 0.22);
        this.number(ev.x, ev.y - 12, String(Math.max(1, Math.round(ev.damage))), ev.onSoldier ? 0xff7060 : 0xffffff, 13);
        break;
      case 'enemyKilled':
        this.burst(ev.x, ev.y, 10, 0xc8b090, 110, 0.5);
        if (ev.gold > 0) this.number(ev.x, ev.y - 22, `+${ev.gold}`, 0xf5c542, 15);
        break;
      case 'splashImpact':
        this.ring(ev.x, ev.y, ev.radius * 0.3, ev.radius, 0.35, 0xffd9a0);
        this.burst(ev.x, ev.y, 10, 0xffa050, 120, 0.4);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'spellImpact':
        this.ring(ev.x, ev.y, ev.radius * 0.2, ev.radius, 0.5, 0xff8a50);
        this.burst(ev.x, ev.y, 26, 0xff9040, 200, 0.7);
        this.shake = Math.max(this.shake, 9);
        break;
      case 'enemyLeaked':
        this.flash = 1;
        this.shake = Math.max(this.shake, 6);
        break;
      case 'bossPhase':
        this.shake = Math.max(this.shake, 7);
        break;
      case 'heroLevelUp':
        this.ring(ev.x, ev.y, 6, 60, 0.7, 0xf2d060);
        this.burst(ev.x, ev.y, 18, 0xf2d060, 140, 0.8);
        this.number(ev.x, ev.y - 30, `LEVEL ${ev.level}`, 0xf2d060, 18);
        break;
      default:
        break;
    }
  }

  /** World position effect for a placed tower (not carried by the event). */
  towerPlaced(x: number, y: number): void {
    this.ring(x, y, 8, 34, 0.3, 0xc8d0e0);
    this.burst(x, y, 8, 0xb8a888, 70, 0.4);
  }

  private burst(x: number, y: number, n: number, color: number, speed: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life, max: life, size: 1.5 + Math.random() * 2, color });
    }
  }

  private ring(x: number, y: number, r0: number, r1: number, life: number, color: number): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color });
  }

  private number(x: number, y: number, text: string, color: number, size: number): void {
    if (this.floaters.length > 60) return;
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: 'system-ui, sans-serif', fontWeight: '700', stroke: { color: 0x000000, width: 3 } } });
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() * 10 - 5), y);
    this.texts.addChild(t);
    this.floaters.push({ text: t, vy: -38, life: 0.8, max: 0.8 });
  }

  /** Advance and draw. `dt` is real seconds (effects keep animating while the sim is paused). */
  update(dt: number): void {
    const g = this.g;
    g.clear();
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: Math.max(0, p.life / p.max) });
    }
    this.rings = this.rings.filter((r) => (r.life -= dt) > 0);
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      g.circle(r.x, r.y, r.r0 + (r.r1 - r.r0) * k).stroke({ width: 3, color: r.color, alpha: 1 - k });
    }
    for (const f of this.floaters) {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.text.alpha = Math.max(0, f.life / f.max);
    }
    const dead = this.floaters.filter((f) => f.life <= 0);
    for (const f of dead) f.text.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
