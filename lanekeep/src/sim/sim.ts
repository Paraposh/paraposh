import type { BarracksTier, BossPhase, DamageType, EnemyDef, GameData, PhaseAction, ShooterTier, ShredDef, SoldierDef } from '../data/types';
import { Rng } from './core/rng';
import type { Command, Enemy, Projectile, SimEvent, SimStatus, Soldier, Tower } from './core/types';
import { damageAfterResist } from './math/damage';
import { leadIntercept } from './math/lead';
import { splashFactor } from './math/splash';
import { SplinePath } from './math/spline';

interface SpawnEntry {
  bossId?: string;
  /** Absolute tick once started; offset from wave start inside `waveEntries`. */
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
  readonly soldiers = new Map<number, Soldier>();
  readonly projectiles = new Map<number, Projectile>();
  readonly commandLog: { tick: number; cmd: Command }[] = [];
  readonly paths: Record<string, SplinePath> = {};

  private events: SimEvent[] = [];
  private pending: Command[] = [];
  private nextId = 1;
  private readonly waveEntries: SpawnEntry[][];
  private pendingSpawns: SpawnEntry[] = [];
  /** Index of the next wave to start. */
  waveIndex = 0;
  /** Absolute tick at which the next wave starts, or null while the current wave is still spawning. */
  private nextWaveTick: number | null;
  private spawnWatch: number | null = null;

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
    this.waveEntries = this.buildWaveEntries();
    const first = data.waves.waves[0];
    this.nextWaveTick = first ? this.ticks(first.preDelay) : null;
  }

  /** Ticks until the next wave starts, or null while the current wave is still spawning. */
  get waveTimer(): number | null {
    return this.nextWaveTick === null ? null : Math.max(0, this.nextWaveTick - this.tick);
  }

  get waveCount(): number {
    return this.data.waves.waves.length;
  }

  /** Stars for a finished level: highest threshold whose minLives the player met. 0 on a loss. */
  get stars(): number {
    if (this.status !== 'won') return 0;
    return this.data.config.stars.filter((s) => this.lives >= s.minLives).reduce((m, s) => Math.max(m, s.stars), 0);
  }

  /** Effective stats of a barracks/shooter tower: base tier merged with its specialization, if any. */
  tierOf(tower: Tower): ShooterTier | BarracksTier {
    const def = this.data.towers[tower.defId];
    const base = (def?.tiers[tower.tier] ?? def?.tiers[0]) as ShooterTier | BarracksTier;
    const spec = tower.specId ? def?.specializations?.[tower.specId] : undefined;
    if (!spec) return base;
    const { name: _name, ...overrides } = spec;
    return { ...base, ...overrides } as ShooterTier | BarracksTier;
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
    this.waveSystem();
    this.spawnSystem();
    this.statusSystem();
    this.traitSystem();
    this.barracksSystem();
    this.soldierSystem();
    this.movementSystem();
    this.enemyCombatSystem();
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
    mix(this.waveIndex);
    mix(this.nextWaveTick ?? -1);
    for (const e of this.enemies.values()) {
      mix(e.id);
      mix(e.dist);
      mix(e.hp);
      mix(e.laneOffset);
      mix(e.shredStacks);
      mix(e.shredTicks);
      mix(e.blockers.length);
      mix(e.phase);
      mix(e.speedMult);
    }
    for (const t of this.towers.values()) (mix(t.id), mix(t.cooldown), mix(t.tier), mix(t.specId.length), mix(t.rallyX), mix(t.rallyY));
    for (const s of this.soldiers.values()) (mix(s.id), mix(s.x), mix(s.y), mix(s.hp), mix(s.targetId));
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

  private buildWaveEntries(): SpawnEntry[][] {
    return this.data.waves.waves.map((wave) => {
      const out: (SpawnEntry & { order: number })[] = [];
      let order = 0;
      for (const g of wave.groups) {
        for (let k = 0; k < g.count; k++) {
          out.push({
            tick: this.ticks(g.startDelay) + this.ticks(g.interval * k),
            enemyId: g.bossId ? (this.data.waves.bosses?.[g.bossId]?.enemyId ?? '') : (g.enemyId ?? ''),
            bossId: g.bossId,
            pathId: g.path,
            order: order++,
          });
        }
      }
      out.sort((x, y) => x.tick - y.tick || x.order - y.order);
      return out;
    });
  }

  private waveSystem(): void {
    if (this.spawnWatch !== null && this.tick >= this.spawnWatch) {
      this.spawnWatch = null;
      const next = this.data.waves.waves[this.waveIndex];
      this.nextWaveTick = next ? this.tick + this.ticks(next.preDelay) : null;
    }
    if (this.nextWaveTick !== null && this.tick >= this.nextWaveTick) this.startNextWave();
  }

  private startNextWave(): void {
    const entries = this.waveEntries[this.waveIndex] ?? [];
    const index = this.waveIndex++;
    this.nextWaveTick = null;
    this.status = 'wave';
    for (const e of entries) this.pendingSpawns.push({ ...e, tick: this.tick + e.tick });
    this.pendingSpawns.sort((x, y) => x.tick - y.tick); // stable: ties keep wave/group order
    const last = entries[entries.length - 1];
    this.spawnWatch = this.tick + (last ? last.tick : 0);
    this.emit({ type: 'waveStarted', tick: this.tick, index });
  }

  // ---------------------------------------------------------------- commands

  private applyCommands(): void {
    const cmds = this.pending;
    this.pending = [];
    for (const cmd of cmds) {
      if (cmd.type === 'placeTower') this.placeTower(cmd.spotId, cmd.towerId);
      else if (cmd.type === 'setRally') this.setRally(cmd.towerId, cmd.x, cmd.y);
      else if (cmd.type === 'upgradeTower') this.upgradeTower(cmd.towerId);
      else if (cmd.type === 'specialize') this.specialize(cmd.towerId, cmd.specId);
      else if (cmd.type === 'sellTower') this.sellTower(cmd.towerId);
      else if (cmd.type === 'callWave') this.callWave();
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
      specId: '',
      cooldown: 0,
      invested: cost,
      rallyX: spot.x,
      rallyY: spot.y,
      slots: [],
    };
    if (def.family === 'meleeBarracks') {
      const tier = def.tiers[0] as BarracksTier;
      tower.slots = Array.from({ length: tier.soldierCount }, () => ({ soldierId: 0, respawn: 0 }));
      const [rx, ry] = this.defaultRally(tower.x, tower.y, tier.rallyRange);
      tower.rallyX = rx;
      tower.rallyY = ry;
    }
    this.towers.set(tower.id, tower);
    this.emit({ type: 'towerPlaced', tick: this.tick, id: tower.id });
  }

  /** Default rally: the point of any path closest to the tower, if within rallyRange; else just below the tower. */
  private defaultRally(x: number, y: number, rallyRange: number): [number, number] {
    let best: { x: number; y: number; dist: number } | undefined;
    for (const path of Object.values(this.paths)) {
      const c = path.closestPoint(x, y);
      if (!best || c.dist < best.dist) best = c;
    }
    if (best && best.dist <= rallyRange) return [best.x, best.y];
    return [x, y + 30];
  }

  private setRally(towerId: number, x: number, y: number): void {
    const tower = this.towers.get(towerId);
    const def = tower && this.data.towers[tower.defId];
    const reject = (reason: string) => this.emit({ type: 'commandRejected', tick: this.tick, reason });
    if (!tower || !def || def.family !== 'meleeBarracks') return reject('not a barracks');
    const range = (this.tierOf(tower) as BarracksTier).rallyRange;
    const d = Math.hypot(x - tower.x, y - tower.y);
    // Clamp into range rather than reject, so a slightly-far click still does something useful.
    const k = d > range ? range / d : 1;
    tower.rallyX = tower.x + (x - tower.x) * k;
    tower.rallyY = tower.y + (y - tower.y) * k;
  }

  private reject(reason: string): void {
    this.emit({ type: 'commandRejected', tick: this.tick, reason });
  }

  /** Buy the next base tier. Specializations are a separate command once the last base tier is reached. */
  private upgradeTower(towerId: number): void {
    const tower = this.towers.get(towerId);
    const def = tower && this.data.towers[tower.defId];
    if (!tower || !def) return this.reject('unknown tower');
    if (tower.specId) return this.reject('already specialized');
    const next = def.tiers[tower.tier + 1];
    if (!next) return this.reject('final tier: specialize instead');
    if (this.gold < next.cost) return this.reject('not enough gold');
    this.gold -= next.cost;
    tower.invested += next.cost;
    tower.tier++;
    this.refreshBarracks(tower);
    this.emit({ type: 'towerUpgraded', tick: this.tick, id: tower.id, tier: tower.tier, specId: '' });
  }

  private specialize(towerId: number, specId: string): void {
    const tower = this.towers.get(towerId);
    const def = tower && this.data.towers[tower.defId];
    if (!tower || !def) return this.reject('unknown tower');
    if (tower.specId) return this.reject('already specialized');
    if (tower.tier !== def.tiers.length - 1) return this.reject('upgrade to the final tier first');
    const spec = def.specializations?.[specId];
    if (!spec) return this.reject(`unknown specialization ${specId}`);
    if (this.gold < spec.cost) return this.reject('not enough gold');
    this.gold -= spec.cost;
    tower.invested += spec.cost;
    tower.specId = specId;
    this.refreshBarracks(tower);
    this.emit({ type: 'towerUpgraded', tick: this.tick, id: tower.id, tier: tower.tier, specId });
  }

  /** After a barracks changes tier/spec its soldiers are replaced at once by the new type and count. */
  private refreshBarracks(tower: Tower): void {
    const def = this.data.towers[tower.defId];
    if (!def || def.family !== 'meleeBarracks') return;
    for (const s of [...this.soldiers.values()]) {
      if (s.towerId !== tower.id) continue;
      this.releaseTarget(s);
      this.soldiers.delete(s.id);
    }
    const count = (this.tierOf(tower) as BarracksTier).soldierCount;
    tower.slots = Array.from({ length: count }, () => ({ soldierId: 0, respawn: 0 }));
  }

  private sellTower(towerId: number): void {
    const tower = this.towers.get(towerId);
    if (!tower) return this.reject('unknown tower');
    const refund = Math.floor(tower.invested * this.data.config.sellRefundPct);
    for (const s of [...this.soldiers.values()]) {
      if (s.towerId !== tower.id) continue;
      this.releaseTarget(s);
      this.soldiers.delete(s.id);
    }
    this.towers.delete(tower.id);
    this.gold += refund;
    this.emit({ type: 'towerSold', tick: this.tick, id: tower.id, refund });
  }

  /** Starts the next wave now. Bonus gold is the time skipped times earlyCallGoldPerSec, capped. */
  private callWave(): void {
    const remaining = this.waveTimer;
    if (remaining === null || remaining <= 0) return this.reject('no wave to call');
    const secondsSkipped = remaining / this.data.config.tickRate;
    const cfg = this.data.config;
    const bonus = Math.min(Math.floor(secondsSkipped * cfg.earlyCallGoldPerSec), cfg.earlyCallMaxBonus);
    this.gold += bonus;
    this.nextWaveTick = this.tick;
    this.emit({ type: 'waveCalled', tick: this.tick, index: this.waveIndex, secondsSkipped, bonus });
  }

  // ------------------------------------------------------------------ enemies

  private spawnSystem(): void {
    while (this.pendingSpawns.length > 0 && (this.pendingSpawns[0] as SpawnEntry).tick <= this.tick) {
      const entry = this.pendingSpawns.shift() as SpawnEntry;
      this.spawnEnemy(entry.enemyId, entry.pathId, 0, { bossId: entry.bossId });
    }
  }

  /** Creates an enemy on a path at arc distance `dist`. Lane and jitter come from the sim RNG. */
  private spawnEnemy(defId: string, pathId: string, dist: number, opts: { bossId?: string; spawned?: boolean } = {}): Enemy | undefined {
    const def = this.data.enemies[defId];
    const pathDef = this.data.level.paths[pathId];
    if (!def || !pathDef) return undefined;
    const lane = this.rng.int(pathDef.lanes);
    const jitter = (this.rng.next() * 2 - 1) * this.data.config.laneOffsetJitter * pathDef.laneSpacing;
    const laneOffset = (lane - (pathDef.lanes - 1) / 2) * pathDef.laneSpacing + jitter;
    const enemy: Enemy = {
      id: this.nextId++,
      defId,
      pathId,
      laneOffset,
      dist,
      hp: def.hp,
      maxHp: def.hp,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      shredArmor: 0,
      shredMagic: 0,
      shredStacks: 0,
      shredTicks: 0,
      blockers: [],
      attackCooldown: 0,
      rangedCooldown: 0,
      traitTimers: def.traits.map((t) => (t.type === 'summons' ? this.ticks(t.interval) : 0)),
      speedMult: 1,
      damageMult: 1,
      enraged: false,
      spawned: opts.spawned ?? false,
      bossId: opts.bossId ?? '',
      phase: -1,
    };
    [enemy.x, enemy.y] = this.positionAt(enemy, dist);
    enemy.prevX = enemy.x;
    enemy.prevY = enemy.y;
    this.enemies.set(enemy.id, enemy);
    this.emit({ type: 'enemySpawned', tick: this.tick, id: enemy.id });
    return enemy;
  }

  private phaseOf(e: Enemy): BossPhase | undefined {
    return e.bossId && e.phase >= 0 ? this.data.waves.bosses?.[e.bossId]?.phases[e.phase] : undefined;
  }

  private applyAction(e: Enemy, a: PhaseAction): void {
    if (a.type === 'summon') {
      for (let i = 0; i < a.count; i++) this.spawnEnemy(a.enemyId, e.pathId, Math.max(0, e.dist - 20 - i * 6), { spawned: true });
    } else if (!e.enraged) {
      this.enrage(e, a.speedMult, a.damageMult);
    }
  }

  private enrage(e: Enemy, speedMult: number, damageMult: number): void {
    e.enraged = true;
    e.speedMult *= speedMult;
    e.damageMult *= damageMult;
    this.emit({ type: 'enemyEnraged', tick: this.tick, id: e.id });
  }

  /** Enemy speed in world units per second after enrage and boss phase modifiers. */
  private speedOf(e: Enemy, def: EnemyDef): number {
    return def.speed * e.speedMult * (this.phaseOf(e)?.speedMult ?? 1);
  }

  /** Composable traits (heal aura, summons, enrage) and boss phase scripts. */
  private traitSystem(): void {
    const rate = this.data.config.tickRate;
    for (const e of [...this.enemies.values()]) {
      const def = this.data.enemies[e.defId];
      if (!def) continue;

      def.traits.forEach((t, i) => {
        if (t.type === 'healsAllies') {
          const r2 = t.radius * t.radius;
          for (const ally of this.enemies.values()) {
            if (ally === e || ally.hp >= ally.maxHp) continue;
            const dx = ally.x - e.x;
            const dy = ally.y - e.y;
            if (dx * dx + dy * dy <= r2) ally.hp = Math.min(ally.maxHp, ally.hp + t.hpPerSec / rate);
          }
        } else if (t.type === 'summons') {
          const left = (e.traitTimers[i] ?? 0) - 1;
          e.traitTimers[i] = left;
          if (left <= 0) {
            e.traitTimers[i] = this.ticks(t.interval);
            for (let k = 0; k < t.count; k++) this.spawnEnemy(t.enemyId, e.pathId, Math.max(0, e.dist - 20 - k * 6), { spawned: true });
          }
        } else if (t.type === 'enrage') {
          if (!e.enraged && e.hp / e.maxHp <= t.hpThreshold) this.enrage(e, t.speedMult, t.damageMult);
        }
      });

      const boss = e.bossId ? this.data.waves.bosses?.[e.bossId] : undefined;
      if (boss) {
        const frac = e.hp / e.maxHp;
        let target = boss.phases.findIndex((p) => frac > p.hpAbove);
        if (target < 0) target = boss.phases.length - 1;
        while (e.phase < target) {
          e.phase++;
          for (const a of boss.phases[e.phase]?.onEnter ?? []) this.applyAction(e, a);
          this.emit({ type: 'bossPhase', tick: this.tick, id: e.id, phase: e.phase });
        }
      }
    }
  }

  private statusSystem(): void {
    for (const e of this.enemies.values()) {
      if (e.shredTicks > 0 && --e.shredTicks === 0) {
        e.shredArmor = 0;
        e.shredMagic = 0;
        e.shredStacks = 0;
      }
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
      if (e.blockers.length > 0) continue; // held in melee by a soldier
      e.dist += this.speedOf(e, def) / rate;
      if (e.dist >= path.length) {
        this.enemies.delete(e.id);
        this.lives = Math.max(0, this.lives - def.livesCost);
        this.emit({ type: 'enemyLeaked', tick: this.tick, id: e.id, lives: this.lives });
        continue;
      }
      [e.x, e.y] = this.positionAt(e, e.dist);
    }
  }

  /** Blocked enemies swing at their primary blocker (the first soldier that made contact). Ranged enemies shoot the nearest soldier in range. */
  private enemyCombatSystem(): void {
    for (const e of this.enemies.values()) {
      const def = this.data.enemies[e.defId];
      if (!def) continue;
      const ranged = def.traits.find((t) => t.type === 'ranged');
      if (ranged && ranged.type === 'ranged') {
        if (e.rangedCooldown > 0) e.rangedCooldown--;
        else {
          let near: Soldier | undefined;
          let best = ranged.range;
          for (const s of this.soldiers.values()) {
            const d = Math.hypot(s.x - e.x, s.y - e.y);
            if (d <= best) (best = d), (near = s);
          }
          if (near) {
            e.rangedCooldown = Math.max(1, this.ticks(ranged.cooldown));
            this.hurtSoldier(e, near, ranged.damage * e.damageMult, ranged.damageType);
          }
        }
      }
      if (e.blockers.length === 0 || !def.melee) continue;
      if (e.attackCooldown > 0) {
        e.attackCooldown--;
        continue;
      }
      const soldier = this.soldiers.get(e.blockers[0] as number);
      if (!soldier) continue;
      e.attackCooldown = Math.max(1, this.ticks(def.melee.cooldown));
      this.hurtSoldier(e, soldier, def.melee.damage * e.damageMult, def.melee.damageType);
    }
  }

  private hurtSoldier(e: Enemy, soldier: Soldier, raw: number, type: DamageType): void {
    const sDef = this.data.soldiers[soldier.defId];
    if (!sDef) return;
    const dealt = damageAfterResist(raw, type, sDef.armor, sDef.magicResist, this.data.config);
    soldier.hp -= dealt;
    this.emit({ type: 'meleeHit', tick: this.tick, attackerId: e.id, targetId: soldier.id, damage: dealt, onSoldier: true });
    if (soldier.hp <= 0) this.killSoldier(soldier);
  }

  // ----------------------------------------------------------------- barracks

  private barracksSystem(): void {
    for (const tower of this.towers.values()) {
      const def = this.data.towers[tower.defId];
      if (!def || def.family !== 'meleeBarracks') continue;
      const tier = this.tierOf(tower) as BarracksTier;
      tower.slots.forEach((slot, i) => {
        if (slot.soldierId !== 0) return;
        if (slot.respawn > 0) {
          slot.respawn--;
          return;
        }
        const sDef = this.data.soldiers[tier.soldierId];
        if (!sDef) return;
        const soldier: Soldier = {
          id: this.nextId++,
          defId: tier.soldierId,
          towerId: tower.id,
          slot: i,
          x: tower.x,
          y: tower.y,
          prevX: tower.x,
          prevY: tower.y,
          hp: sDef.hp,
          maxHp: sDef.hp,
          targetId: 0,
          state: 'moving',
          cooldown: 0,
        };
        this.soldiers.set(soldier.id, soldier);
        slot.soldierId = soldier.id;
        this.emit({ type: 'soldierSpawned', tick: this.tick, id: soldier.id });
      });
    }
  }

  private killSoldier(s: Soldier): void {
    this.releaseTarget(s);
    this.soldiers.delete(s.id);
    const tower = this.towers.get(s.towerId);
    const def = tower && this.data.towers[tower.defId];
    const slot = tower?.slots[s.slot];
    if (slot && def && def.family === 'meleeBarracks') {
      slot.soldierId = 0;
      slot.respawn = this.ticks((this.tierOf(tower) as BarracksTier).respawn);
    }
    this.emit({ type: 'soldierKilled', tick: this.tick, id: s.id });
  }

  /** Drops the soldier's target and removes it from that enemy's blocker list. */
  private releaseTarget(s: Soldier): void {
    const e = this.enemies.get(s.targetId);
    if (e) e.blockers = e.blockers.filter((id) => id !== s.id);
    s.targetId = 0;
  }

  /** Flyers and enemies with the bypassBlockers trait cannot be blocked. */
  private blockable(defId: string): boolean {
    const def = this.data.enemies[defId];
    return !!def && !def.flying && !def.traits.some((t) => t.type === 'bypassBlockers');
  }

  private soldierSystem(): void {
    const cfg = this.data.config;
    const rate = cfg.tickRate;
    // How many soldiers already target each enemy (updated as soldiers pick targets this tick).
    const targeters = new Map<number, number>();
    for (const s of this.soldiers.values()) {
      if (s.targetId !== 0) targeters.set(s.targetId, (targeters.get(s.targetId) ?? 0) + 1);
    }

    for (const s of [...this.soldiers.values()]) {
      const sDef = this.data.soldiers[s.defId] as SoldierDef;
      const tower = this.towers.get(s.towerId);
      if (!tower) continue;
      s.prevX = s.x;
      s.prevY = s.y;
      if (s.cooldown > 0) s.cooldown--;

      // Keep or drop the current target (leash is 1.5x the acquire radius to avoid thrashing).
      let target = s.targetId !== 0 ? this.enemies.get(s.targetId) : undefined;
      if (s.targetId !== 0 && !(target && this.blockable(target.defId) && this.within(target, tower, sDef.engageRadius * 1.5))) {
        const prev = s.targetId;
        this.releaseTarget(s);
        targeters.set(prev, Math.max(0, (targeters.get(prev) ?? 1) - 1));
        target = undefined;
      }
      if (!target) {
        let best: Enemy | undefined;
        for (const e of this.enemies.values()) {
          if (!this.blockable(e.defId) || !this.within(e, tower, sDef.engageRadius)) continue;
          if ((targeters.get(e.id) ?? 0) >= cfg.maxSoldiersPerEnemy) continue;
          if (!best || e.dist > best.dist) best = e;
        }
        if (best) {
          target = best;
          s.targetId = best.id;
          targeters.set(best.id, (targeters.get(best.id) ?? 0) + 1);
        }
      }

      if (target) {
        const dx = target.x - s.x;
        const dy = target.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= sDef.reach) {
          s.state = 'fighting';
          if (!target.blockers.includes(s.id)) target.blockers.push(s.id);
          if (s.cooldown === 0) this.soldierAttack(s, sDef, target);
        } else {
          s.state = 'moving';
          target.blockers = target.blockers.filter((id) => id !== s.id);
          const step = Math.min(dist - sDef.reach * 0.5, sDef.speed / rate);
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
        }
      } else {
        const [fx, fy] = this.formationSpot(tower, s.slot);
        const dx = fx - s.x;
        const dy = fy - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.5) {
          s.state = 'moving';
          const step = Math.min(dist, sDef.speed / rate);
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
        } else {
          s.state = 'idle';
          s.hp = Math.min(s.maxHp, s.hp + sDef.regenPerSec / rate);
        }
      }
    }
  }

  private within(e: Enemy, tower: Tower, radius: number): boolean {
    return Math.hypot(e.x - tower.rallyX, e.y - tower.rallyY) <= radius;
  }

  private formationSpot(tower: Tower, slot: number): [number, number] {
    const n = tower.slots.length;
    if (n <= 1) return [tower.rallyX, tower.rallyY];
    const a = (slot / n) * Math.PI * 2;
    const r = this.data.config.soldierFormationRadius;
    return [tower.rallyX + Math.cos(a) * r, tower.rallyY + Math.sin(a) * r];
  }

  private soldierAttack(s: Soldier, sDef: SoldierDef, target: Enemy): void {
    const raw = this.rng.range(sDef.damage[0], sDef.damage[1]);
    s.cooldown = Math.max(1, this.ticks(sDef.cooldown));
    const dealt = this.damageEnemy(target, raw, sDef.damageType, 0, 0);
    this.emit({ type: 'meleeHit', tick: this.tick, attackerId: s.id, targetId: target.id, damage: dealt, onSoldier: false });
  }

  // ------------------------------------------------------------------ shooters

  private towerSystem(): void {
    const cfg = this.data.config;
    for (const tower of this.towers.values()) {
      const def = this.data.towers[tower.defId];
      if (!def || def.family === 'meleeBarracks') continue;
      if (tower.cooldown > 0) {
        tower.cooldown--;
        continue;
      }
      const tier = this.tierOf(tower) as ShooterTier;

      // Default targeting: furthest along the path within range. Ties go to the lowest id (iteration order).
      let target: Enemy | undefined;
      const r2 = tier.range * tier.range;
      const minR2 = (tier.minRange ?? 0) * (tier.minRange ?? 0);
      for (const e of this.enemies.values()) {
        const eDef = this.data.enemies[e.defId];
        if (!eDef || (eDef.flying && !def.antiAir)) continue;
        const dx = e.x - tower.x;
        const dy = e.y - tower.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 < minR2) continue;
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
        armorPen: tier.armorPen ?? 0,
        magicPen: tier.magicPen ?? 0,
        splashRadius: tier.splash?.radius ?? 0,
        antiAir: def.antiAir,
        shred: tier.shred,
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
      if (p.splashRadius > 0) {
        this.emit({ type: 'splashImpact', tick: this.tick, x: p.x, y: p.y, radius: p.splashRadius });
        for (const e of [...this.enemies.values()]) {
          const def = this.data.enemies[e.defId];
          if (!def || (def.flying && !p.antiAir)) continue;
          const f = splashFactor(Math.hypot(e.x - p.x, e.y - p.y), p.splashRadius, this.data.config.splashEdgeMult);
          if (f > 0) this.hitEnemy(e, p, f);
        }
      } else {
        const target = this.enemies.get(p.targetId);
        if (target) this.hitEnemy(target, p, 1); // target died or leaked in flight: projectile fizzles
      }
    }
  }

  /** Applies one projectile hit (scaled by factor), then shred if the target survived. */
  private hitEnemy(e: Enemy, p: Projectile, factor: number): void {
    const dealt = this.damageEnemy(e, p.damage * factor, p.damageType, p.armorPen, p.magicPen);
    this.emit({ type: 'projectileHit', tick: this.tick, id: p.id, targetId: e.id, damage: dealt });
    if (p.shred && e.hp > 0) this.applyShred(e, p.shred);
  }

  /**
   * Single entry point for damage to enemies. Resist is reduced by active shred plus `armorPen`/`magicPen`
   * for this hit. Kills pay the bounty. Returns the damage actually dealt after resist.
   */
  private damageEnemy(e: Enemy, raw: number, type: DamageType, armorPen: number, magicPen: number): number {
    const def = this.data.enemies[e.defId];
    if (!def) return 0;
    const dealt = damageAfterResist(raw, type, def.armor, def.magicResist, this.data.config, {
      armorReduction: e.shredArmor + armorPen - (this.phaseOf(e)?.armorDelta ?? 0),
      magicReduction: e.shredMagic + magicPen - (this.phaseOf(e)?.magicResistDelta ?? 0),
    });
    e.hp -= dealt;
    if (e.hp <= 0 && this.enemies.delete(e.id)) {
      const gold = e.spawned ? 0 : def.bounty;
      this.gold += gold;
      this.emit({ type: 'enemyKilled', tick: this.tick, id: e.id, gold });
      for (const t of def.traits) {
        if (t.type !== 'splitsOnDeath') continue;
        for (let k = 0; k < t.count; k++) this.spawnEnemy(t.enemyId, e.pathId, Math.max(0, e.dist - k * 8), { spawned: true });
      }
    }
    return dealt;
  }

  /** Shred lands after the damage of the hit that applied it. */
  private applyShred(e: Enemy, s: ShredDef): void {
    e.shredStacks = Math.min(e.shredStacks + 1, s.maxStacks);
    e.shredArmor = e.shredStacks * s.armor;
    e.shredMagic = e.shredStacks * s.magic;
    e.shredTicks = Math.max(1, this.ticks(s.duration));
  }

  private endCheck(): void {
    if (this.lives <= 0) {
      this.status = 'lost';
      this.emit({ type: 'lost', tick: this.tick });
    } else if (
      this.waveIndex >= this.waveCount &&
      this.pendingSpawns.length === 0 &&
      this.enemies.size === 0 &&
      this.status === 'wave'
    ) {
      this.status = 'won';
      this.emit({ type: 'won', tick: this.tick });
    }
  }
}
