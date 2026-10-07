import { Application, Graphics } from 'pixi.js';
import { loadBundledData } from './data/load';
import { Sim } from './sim/sim';
import { FixedStepLoop } from './sim/loop';

const SEED = 1234;
const TOWER_KEYS: Record<string, string> = { q: 'archer', w: 'mage', e: 'mortar', r: 'barracks' };
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

async function boot(): Promise<void> {
  const data = loadBundledData();
  const sim = new Sim(data, SEED);
  const loop = new FixedStepLoop(sim);
  const { width, height } = data.level.world;

  const app = new Application();
  await app.init({ width, height, background: 0x1b2a1f, antialias: true });
  document.getElementById('game')?.appendChild(app.canvas);
  const hud = document.getElementById('hud') as HTMLElement;
  let selected = 'archer';
  let selectedTowerId = 0;
  const rings: { x: number; y: number; r: number; age: number }[] = [];
  const g = new Graphics();
  app.stage.addChild(g);

  // Right-click: move the rally point of the nearest barracks (it clamps to the barracks' range).
  app.canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const r = app.canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const y = ((ev.clientY - r.top) / r.height) * height;
    let best: { id: number; d: number } | undefined;
    for (const t of sim.towers.values()) {
      if (t.slots.length === 0) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (!best || d < best.d) best = { id: t.id, d };
    }
    if (best) sim.queue({ type: 'setRally', towerId: best.id, x, y });
  });

  // Click an empty build spot to place the archer.
  app.canvas.addEventListener('pointerdown', (ev) => {
    const r = app.canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const y = ((ev.clientY - r.top) / r.height) * height;
    for (const s of data.level.buildSpots) {
      if (Math.hypot(s.x - x, s.y - y) >= 24) continue;
      const here = [...sim.towers.values()].find((t) => t.spotId === s.id);
      if (here) selectedTowerId = here.id;
      else sim.queue({ type: 'placeTower', spotId: s.id, towerId: selected });
    }
  });
  window.addEventListener('keydown', (ev) => {
    const pick = TOWER_KEYS[ev.key.toLowerCase()];
    if (pick) selected = pick;
    const k = ev.key.toLowerCase();
    const sel = sim.towers.get(selectedTowerId);
    if (k === 'n') sim.queue({ type: 'callWave' });
    if (sel && k === 'u') sim.queue({ type: 'upgradeTower', towerId: sel.id });
    if (sel && k === 's') sim.queue({ type: 'sellTower', towerId: sel.id });
    if (sel && (k === 'z' || k === 'x')) {
      const specs = Object.keys(data.towers[sel.defId]?.specializations ?? {});
      const id = specs[k === 'z' ? 0 : 1];
      if (id) sim.queue({ type: 'specialize', towerId: sel.id, specId: id });
    }
    if (ev.key === ' ') loop.speed = 0;
    if (ev.key === '1') loop.speed = 1;
    if (ev.key === '2') loop.speed = 2;
  });

  app.ticker.add((t) => {
    const alpha = loop.advance(t.deltaMS / 1000);
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    for (const e of sim.drainEvents()) if (e.type === 'splashImpact') rings.push({ x: e.x, y: e.y, r: e.radius, age: 0 });
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
    for (const t of sim.towers.values()) g.circle(t.x, t.y, 16).fill({ color: TOWER_COLORS[t.defId] ?? 0xffffff });
    for (const t of sim.towers.values()) {
      if (t.slots.length > 0) g.circle(t.rallyX, t.rallyY, 5).stroke({ width: 2, color: 0x4a78c8 });
    }
    for (const sd of sim.soldiers.values()) {
      const x = lerp(sd.prevX, sd.x);
      const y = lerp(sd.prevY, sd.y);
      g.circle(x, y, 7).fill({ color: 0x4a78c8 });
      g.rect(x - 9, y - 14, 18 * (sd.hp / sd.maxHp), 3).fill({ color: 0x60c0ff });
    }
    for (const e of sim.enemies.values()) {
      const x = lerp(e.prevX, e.x);
      const y = lerp(e.prevY, e.y);
      const flying = data.enemies[e.defId]?.flying ?? false;
      const radius = data.enemies[e.defId]?.radius ?? 9;
      g.circle(x, flying ? y - 8 : y, radius).fill({ color: ENEMY_COLORS[e.defId] ?? 0xaa3030 });
      if (e.enraged) g.circle(x, y, radius + 3).stroke({ width: 2, color: 0xff5030 });
      g.rect(x - radius, y - radius - 7, radius * 2 * (e.hp / e.maxHp), 3).fill({ color: e.bossId ? 0xffb030 : 0x40c060 });
    }
    for (const p of sim.projectiles.values()) g.circle(lerp(p.prevX, p.x), lerp(p.prevY, p.y), 3).fill({ color: 0xffffff });
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]!;
      ring.age += t.deltaMS / 1000;
      if (ring.age > 0.35) rings.splice(i, 1);
      else g.circle(ring.x, ring.y, ring.r * (0.4 + ring.age * 1.7)).stroke({ width: 2, color: 0xffd9a0, alpha: 1 - ring.age / 0.35 });
    }
    const sel = sim.towers.get(selectedTowerId);
    if (sel) g.circle(sel.x, sel.y, 24).stroke({ width: 2, color: 0xffffff });
    const timer = sim.waveTimer;
    const waveInfo = timer === null ? 'spawning' : `next wave in ${Math.ceil(timer / data.config.tickRate)}s (N calls it early)`;
    const selInfo = sel
      ? `  | selected ${sel.defId} tier ${sel.tier + 1}${sel.specId ? ' ' + sel.specId : ''} (U upgrade, Z/X specialize, S sell)`
      : '';
    const end = sim.status === 'won' ? `  VICTORY ${'*'.repeat(sim.stars)}` : sim.status === 'lost' ? '  DEFEAT' : '';
    hud.textContent = `gold ${sim.gold}  lives ${sim.lives}  wave ${sim.waveIndex}/${sim.waveCount}  ${waveInfo}  speed ${loop.speed}x  build ${selected}${selInfo}${end}  (Q archer 70, W mage 100, E mortar 120, R barracks 70 | click a spot to build | right-click moves rally | space = pause, 1 / 2 = speed)`;
  });
}

void boot();
