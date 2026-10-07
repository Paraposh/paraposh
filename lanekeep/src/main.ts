import { Application, Graphics } from 'pixi.js';
import { loadBundledData } from './data/load';
import { Sim } from './sim/sim';
import { FixedStepLoop } from './sim/loop';

const SEED = 1234;

async function boot(): Promise<void> {
  const data = loadBundledData();
  const sim = new Sim(data, SEED);
  const loop = new FixedStepLoop(sim);
  const { width, height } = data.level.world;

  const app = new Application();
  await app.init({ width, height, background: 0x1b2a1f, antialias: true });
  document.getElementById('game')?.appendChild(app.canvas);
  const hud = document.getElementById('hud') as HTMLElement;
  const g = new Graphics();
  app.stage.addChild(g);

  // Click an empty build spot to place the archer.
  app.canvas.addEventListener('pointerdown', (ev) => {
    const r = app.canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const y = ((ev.clientY - r.top) / r.height) * height;
    for (const s of data.level.buildSpots) {
      if (Math.hypot(s.x - x, s.y - y) < 24) sim.queue({ type: 'placeTower', spotId: s.id, towerId: 'archer' });
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === ' ') loop.speed = 0;
    if (ev.key === '1') loop.speed = 1;
    if (ev.key === '2') loop.speed = 2;
  });

  app.ticker.add((t) => {
    const alpha = loop.advance(t.deltaMS / 1000);
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    sim.drainEvents();
    g.clear();
    for (const [id, p] of Object.entries(data.level.paths)) {
      const path = sim.paths[id];
      if (!path) continue;
      for (let d = 0; d <= path.length; d += 8) {
        const s = path.sample(d);
        if (d === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      }
      g.stroke({ width: p.lanes * p.laneSpacing, color: 0x6b5a3a, alpha: 0.8 });
    }
    for (const s of data.level.buildSpots) g.circle(s.x, s.y, 18).fill({ color: 0x3a4a60 });
    for (const t of sim.towers.values()) g.circle(t.x, t.y, 16).fill({ color: 0xc8a24a });
    for (const e of sim.enemies.values()) {
      const x = lerp(e.prevX, e.x);
      const y = lerp(e.prevY, e.y);
      g.circle(x, y, 9).fill({ color: 0x8a3030 });
      g.rect(x - 10, y - 16, 20 * (e.hp / e.maxHp), 3).fill({ color: 0x40c060 });
    }
    for (const p of sim.projectiles.values()) g.circle(lerp(p.prevX, p.x), lerp(p.prevY, p.y), 3).fill({ color: 0xffffff });
    hud.textContent = `gold ${sim.gold}  lives ${sim.lives}  status ${sim.status}  speed ${loop.speed}x  (click a spot to build, space = pause, 1 / 2 = speed)`;
  });
}

void boot();
