import type { GameData } from '../data/types';
import { Rng } from './core/rng';
import type { Command, Enemy, Projectile, SimEvent, SimStatus, Tower } from './core/types';
import { damageAfterResist } from './math/damage';
import { leadIntercept } from './math/lead';
import { SplinePath } from './math/spline';

interface SpawnEntry {
  tick: number;
  enemyId: string;
  pathId: string;
}

/** Deterministic simulation. Advance with step(); feed input with queue(). No DOM, clock or ambient randomness in here. */
export class Sim {
  tick = 0;
  gold: number;
  lives: number;
  status: SimStatus = 'prepare';
  readonly rng: Rng;
  readonly enemies = new Map<number, Enemy>();
  readonly towers = new Map<number, Tower>();
  readonly projectiles = new Map<number, Projectile>();
  readonly commandLog: { tick: number; cmd: Command }[] = [];
  readonly paths: Record<string, SplinePath> = {};

  private events: SimEvent[] = [];
  private pending: Command[] = [];
  private nextId = 1;
  private readonly schedule: SpawnEntry[];
  private spawnIdx = 0;

  constructor(
    readonly data: GameData,
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    this.gold = data.level.startGold;
    this.lives = data.config.startingLives;
    for (const [id, p] of Object.entries(data.level.paths)) {
      this.paths[id] = new SplinePath(p.points, p.spline, data.config.pathSamplesPerSegment);
    }
    this.schedule = this.buildSchedule();
  }

  /** Seconds (from data) to whole ticks. */
  ticks(seconds: number): number {
    return Math.round(seconds * this.data.config.tickRate);
  }

  queue(cmd: Command): void {
    this.commandLog.push({ tick: this.tick, cmd });
    this.pending.push(cmd);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.applyCommands();
    this.spawnSystem();
    this.movementSystem();
    this.towerSystem();
    this.projectileSystem();
    this.endCheck();
    this.tick++;
  }

  /** Cheap state fingerprint for replay/regression tests. */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number) => {
      h = Math.imul(h ^ (Math.round(v * 1000) | 0), 0x01000193) >>> 0;
    };
    mix(this.tick);
    mix(this.gold);
    mix(this.lives);
    mix(this.rng.state);
    for (const e of this.enemies.values()) (mix(e.id), mix(e.dist), mix(e.hp), mix(e.laneOffset));
    for (const t of this.towers.values()) (mix(t.id), mix(t.cooldown), mix(t.tier));
    for (const p of this.projectiles.values()) (mix(p.id), mix(p.x), mix(p.y), mix(p.ticksLeft));
    return h >>> 0;
  }

  /** Enemy world position at an arbitrary path distance (lane offset applied). */
  positionAt(e: Enemy, dist: number): [number, number] {
    const path = this.paths[e.pathId] as SplinePath;
    const s = path.sample(dist);
    return [s.x + s.nx * e.laneOffset, s.y + s.ny * e.laneOffset];
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private buildSchedule(): SpawnEntry[] {
    // Milestone (a): only the first wave, auto-started. Wave sequencing/economy arrive in (d).
    const wave = this.data.waves.waves[0];
    if (!wave) return [];
    const out: (SpawnEntry & { order: number })[] = [];
    const base = this.ticks(wave.preDelay);
    let order = 0;
    for (const g of wave.groups) {
      for (let k = 0; k < g.count; k++) {
        out.push({
          tick: base + this.ticks(g.startDelay) + this.ticks(g.interval * k),
          enemyId: g.enemyId,
          pathId: g.path,
          order: order++,
        });
      }
    }
    out.sort((a, b) => a.tick - b.tick || a.order - b.order);
    return out;
  }

  private applyCommands(): void {
    const cmds = this.pending;
    this.pending = [];
    for (const cmd of cmds) {
      if (cmd.type === 'placeTower') this.placeTower(cmd.spotId, cmd.towerId);
    }
  }

  private placeTower(spotId: string, towerId: string): void {
    const spot = this.data.level.buildSpots.find((s) => s.id === spotId);
    const def = this.data.towers[towerId];
    const reject = (reason: string) => this.emit({ type: 'commandRejected', tick: this.tick, reason });
    if (!spot) return reject(`unknown spot ${spotId}`);
    if (!def) return reject(`unknown tower ${towerId}`);
    if (!spot.allowed.includes(towerId) || !this.data.level.availableTowers.includes(towerId)) {
      return reject(`${towerId} not allowed on ${spotId}`);
    }
    for (const t of this.towers.values()) if (t.spotId === spotId) return reject(`${spotId} occupied`);
    const cost = (def.tiers[0] as { cost: number }).cost;
    if (this.gold < cost) return reject('not enough gold');
    this.gold -= cost;
    const tower: Tower = {
      id: this.nextId++,
      defId: towerId,
      spotId,
      x: spot.x,
      y: spot.y,
      tier: 0,
      cooldown: 0,
      invested: cost,
    };
    this.towers.set(tower.id, tower);
    this.emit({ type: 'towerPlaced', tick: this.tick, id: tower.id });
  }

  private spawnSystem(): void {
    while (this.spawnIdx < this.schedule.length && (this.schedule[this.spawnIdx] as SpawnEntry).tick <= this.tick) {
      const entry = this.schedule[this.spawnIdx++] as SpawnEntry;
      this.status = 'wave';
      const def = this.data.enemies[entry.enemyId];
      const pathDef = this.data.level.paths[entry.pathId];
      if (!def || !pathDef) continue;
      const lane = this.rng.int(pathDef.lanes);
      const jitter = (this.rng.next() * 2 - 1) * this.data.config.laneOffsetJitter * pathDef.laneSpacing;
      const laneOffset = (lane - (pathDef.lanes - 1) / 2) * pathDef.laneSpacing + jitter;
      const enemy: Enemy = {
        id: this.nextId++,
        defId: entry.enemyId,
        pathId: entry.pathId,
        laneOffset,
        dist: 0,
        hp: def.hp,
        maxHp: def.hp,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
      };
      [enemy.x, enemy.y] = this.positionAt(enemy, 0);
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;
      this.enemies.set(enemy.id, enemy);
      this.emit({ type: 'enemySpawned', tick: this.tick, id: enemy.id });
    }
  }

  private movementSystem(): void {
    const rate = this.data.config.tickRate;
    for (const e of [...this.enemies.values()]) {
      const def = this.data.enemies[e.defId];
      const path = this.paths[e.pathId];
      if (!def || !path) continue;
      e.prevX = e.x;
      e.prevY = e.y;
      e.dist += def.speed / rate;
      if (e.dist >= path.length) {
        this.enemies.delete(e.id);
        this.lives = Math.max(0, this.lives - def.livesCost);
        this.emit({ type: 'enemyLeaked', tick: this.tick, id: e.id, lives: this.lives });
        continue;
      }
      [e.x, e.y] = this.positionAt(e, e.dist);
    }
  }

  private towerSystem(): void {
    const cfg = this.data.config;
    for (const tower of this.towers.values()) {
      if (tower.cooldown > 0) {
        tower.cooldown--;
        continue;
      }
      const def = this.data.towers[tower.defId];
      const tier = def?.tiers[tower.tier];
      if (!def || !tier) continue;

      // Default targeting: furthest along the path within range. Ties go to the lowest id (iteration order).
      let target: Enemy | undefined;
      const r2 = tier.range * tier.range;
      for (const e of this.enemies.values()) {
        const eDef = this.data.enemies[e.defId];
        if (!eDef || (eDef.flying && !def.antiAir)) continue;
        const dx = e.x - tower.x;
        const dy = e.y - tower.y;
        if (dx * dx + dy * dy > r2) continue;
        if (!target || e.dist > target.dist) target = e;
      }
      if (!target) continue;

      const eDef = this.data.enemies[target.defId];
      if (!eDef) continue;
      const t = target;
      const aimed = tier.projectile.lead
        ? leadIntercept(
            tower.x,
            tower.y,
            tier.projectile.speed,
            (sec) => this.positionAt(t, t.dist + eDef.speed * sec),
            cfg.projectileLeadIterations,
          )
        : {
            x: t.x,
            y: t.y,
            t: Math.hypot(t.x - tower.x, t.y - tower.y) / tier.projectile.speed,
          };
      const proj: Projectile = {
        id: this.nextId++,
        x: tower.x,
        y: tower.y,
        prevX: tower.x,
        prevY: tower.y,
        tx: aimed.x,
        ty: aimed.y,
        targetId: t.id,
        ticksLeft: Math.max(1, Math.ceil(aimed.t * cfg.tickRate)),
        damage: this.rng.range(tier.damage[0], tier.damage[1]),
        damageType: tier.damageType,
      };
      this.projectiles.set(proj.id, proj);
      tower.cooldown = Math.max(1, this.ticks(tier.cooldown));
      this.emit({ type: 'projectileFired', tick: this.tick, id: proj.id });
    }
  }

  private projectileSystem(): void {
    for (const p of [...this.projectiles.values()]) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += (p.tx - p.x) / p.ticksLeft;
      p.y += (p.ty - p.y) / p.ticksLeft;
      p.ticksLeft--;
      if (p.ticksLeft > 0) continue;
      this.projectiles.delete(p.id);
      const target = this.enemies.get(p.targetId);
      if (!target) continue; // target died or leaked in flight: projectile fizzles
      const def = this.data.enemies[target.defId];
      if (!def) continue;
      const dealt = damageAfterResist(p.damage, p.damageType, def.armor, def.magicResist, this.data.config);
      target.hp -= dealt;
      this.emit({ type: 'projectileHit', tick: this.tick, id: p.id, targetId: target.id, damage: dealt });
      if (target.hp <= 0) {
        this.enemies.delete(target.id);
        this.gold += def.bounty;
        this.emit({ type: 'enemyKilled', tick: this.tick, id: target.id, gold: def.bounty });
      }
    }
  }

  private endCheck(): void {
    if (this.lives <= 0) {
      this.status = 'lost';
      this.emit({ type: 'lost', tick: this.tick });
    } else if (this.spawnIdx >= this.schedule.length && this.enemies.size === 0 && this.status === 'wave') {
      this.status = 'won';
      this.emit({ type: 'won', tick: this.tick });
    }
  }
}
