import { describe, expect, it } from 'vitest';
import type { GameData } from '../../src/data/types';
import { validateGameData } from '../../src/data/validate';
import type { SimEvent } from '../../src/sim/core/types';
import { runReplay } from '../../src/sim/replay/replay';
import { Sim } from '../../src/sim/sim';
import { cloneData, injectEnemy, loadData, quietSim } from '../helpers';

const run = (sim: Sim, seconds: number) => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
};

/** Quiet sim with the hero standing on the road near the start, where goblins pass. */
const heroSim = (mut?: (d: GameData) => void) =>
  quietSim((d) => {
    d.level.heroSpawn = [250, 360];
    mut?.(d);
  });

const tough = (d: GameData) => {
  d.enemies['goblin_runner']!.hp = 1e6;
  d.enemies['goblin_runner']!.bounty = 10;
};

describe('area damage spells', () => {
  it('lands after the delay, full damage at the centre and falloff toward the rim', () => {
    const sim = quietSim(tough);
    const near = injectEnemy(sim, 'goblin_runner', 400, 900);
    const spell = sim.data.spells['meteor']! as Extract<typeof sim.data.spells[string], { kind: 'areaDamage' }>;
    near.blockers.push(-1);
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: near.x, y: near.y });
    sim.step();
    expect(near.hp).toBe(1e6); // not yet
    expect(sim.effects).toHaveLength(1);
    const events = run(sim, spell.delay + 0.1);
    const impact = events.find((e) => e.type === 'spellImpact');
    expect(impact).toBeDefined();
    expect(impact!.tick - 0).toBe(sim.ticks(spell.delay));
    expect(1e6 - near.hp).toBeCloseTo(spell.damage * (1 - 0), 5); // magic, goblin mr 0, centre
    expect(sim.effects).toHaveLength(0);
  });

  it('damage at half radius uses the falloff formula; outside radius takes nothing', () => {
    const sim = quietSim(tough);
    const centre = injectEnemy(sim, 'goblin_runner', 400, 900);
    centre.blockers.push(-1);
    const spell = sim.data.spells['meteor']! as { radius: number; damage: number };
    const edge = sim.data.config.splashEdgeMult;
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: centre.x + spell.radius / 2, y: centre.y });
    run(sim, 2);
    const expected = spell.damage * (1 + (edge - 1) * 0.5);
    expect(1e6 - centre.hp).toBeCloseTo(expected, 4);

    const far = injectEnemy(sim, 'goblin_runner', 900, 901);
    far.blockers.push(-1);
    const hp0 = far.hp;
    run(sim, 0.1);
    expect(far.hp).toBe(hp0);
  });

  it('meteor hits flyers; hero slam (hitsAir false) does not', () => {
    const sim = heroSim((d) => {
      d.enemies['cave_bat']!.hp = 1e6;
      d.enemies['cave_bat']!.speed = 0.001;
    });
    const bat = injectEnemy(sim, 'cave_bat', 235, 900);
    sim.queue({ type: 'heroAbility' });
    run(sim, 1);
    expect(bat.hp).toBe(1e6);
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: bat.x, y: bat.y });
    run(sim, 2);
    expect(bat.hp).toBeLessThan(1e6);
  });

  it('enforces cooldowns and level availability', () => {
    const sim = quietSim(tough);
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: 100, y: 100 });
    sim.step();
    expect(sim.cooldownLeft('meteor')).toBeGreaterThan(40);
    sim.drainEvents();
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: 100, y: 100 });
    sim.queue({ type: 'castSpell', spellId: 'hero_slam', x: 100, y: 100 }); // hero-only spell via the player command
    sim.queue({ type: 'castSpell', spellId: 'nope', x: 100, y: 100 });
    sim.step();
    expect(sim.drainEvents().filter((e) => e.type === 'commandRejected')).toHaveLength(3);
    run(sim, sim.data.spells['meteor']!.cooldown);
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: 100, y: 100 });
    const events = run(sim, 0.1);
    expect(events.some((e) => e.type === 'spellCast')).toBe(true);
  });

  it('kills by a player spell pay bounty but give the hero no XP', () => {
    const sim = heroSim((d) => (d.enemies['goblin_runner']!.hp = 5));
    const g = injectEnemy(sim, 'goblin_runner', 400, 900);
    g.blockers.push(-1);
    const gold0 = sim.gold;
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: g.x, y: g.y });
    run(sim, 2);
    expect(sim.gold).toBe(gold0 + sim.data.enemies['goblin_runner']!.bounty);
    expect(sim.hero!.xp).toBe(0);
  });
});

describe('reinforcements', () => {
  it('summons soldiers that fight, then expire without respawning', () => {
    const sim = quietSim(tough);
    const spell = sim.data.spells['reinforcements']! as { count: number; lifetime: number };
    const g = injectEnemy(sim, 'goblin_runner', 300, 900);
    sim.queue({ type: 'castSpell', spellId: 'reinforcements', x: g.x + 40, y: g.y });
    run(sim, 3);
    expect(sim.soldiers.size).toBe(spell.count);
    expect(g.blockers.length).toBeGreaterThan(0); // they block it
    const events = run(sim, spell.lifetime);
    expect(events.filter((e) => e.type === 'soldierKilled').length).toBeGreaterThan(0);
    run(sim, 2);
    expect(sim.soldiers.size).toBe(0);
    expect(g.blockers).toHaveLength(0);
    expect(sim.towers.size).toBe(0);
  });
});

describe('hero movement and combat', () => {
  it('starts alive at heroSpawn and moves to a clicked point at its speed, then guards there', () => {
    const sim = heroSim();
    const h = sim.hero!;
    expect([h.x, h.y]).toEqual([250, 360]);
    const speed = sim.data.heroes['captain_mara']!.stats.speed;
    sim.queue({ type: 'moveHero', x: 250 + speed * 2, y: 360 });
    run(sim, 1);
    expect(h.x).toBeCloseTo(250 + speed, 0);
    expect(h.state).toBe('moving');
    run(sim, 1.2);
    expect(h.x).toBeCloseTo(250 + speed * 2, 5);
    expect(h.state).toBe('idle');
    expect(h.anchorX).toBeCloseTo(h.x, 5);
  });

  it('clamps move orders to the world', () => {
    const sim = heroSim();
    sim.queue({ type: 'moveHero', x: -500, y: 99999 });
    run(sim, 20);
    expect(sim.hero!.x).toBe(0);
    expect(sim.hero!.y).toBe(sim.data.level.world.height);
  });

  it('blocks and kills a walker, earning bounty and XP', () => {
    const sim = heroSim();
    const g = injectEnemy(sim, 'goblin_runner', 215, 900);
    const gold0 = sim.gold;
    const events = run(sim, 15);
    expect(events.some((e) => e.type === 'enemyKilled' && e.id === 900)).toBe(true);
    expect(sim.gold).toBe(gold0 + sim.data.enemies['goblin_runner']!.bounty);
    expect(sim.hero!.xp).toBe(sim.data.enemies['goblin_runner']!.bounty);
    expect(sim.hero!.targetId).toBe(0);
    expect(g.hp).toBeLessThanOrEqual(0);
  });

  it('ignores flyers and bypassBlockers enemies', () => {
    const sim = heroSim();
    injectEnemy(sim, 'cave_bat', 215, 900);
    injectEnemy(sim, 'arcane_wisp', 215, 901);
    run(sim, 2);
    expect(sim.hero!.targetId).toBe(0);
  });

  it('regenerates while idle', () => {
    const sim = heroSim();
    sim.hero!.hp = 100;
    run(sim, 5);
    expect(sim.hero!.hp).toBeCloseTo(100 + 5 * sim.data.heroes['captain_mara']!.stats.regenPerSec, 0);
  });
});

describe('hero levels', () => {
  it('levels up at xpTotal thresholds, scaling stats, with the extra HP granted', () => {
    const sim = heroSim((d) => {
      d.enemies['goblin_runner']!.hp = 3;
      d.enemies['goblin_runner']!.bounty = 10;
    });
    const h = sim.hero!;
    const def = sim.data.heroes['captain_mara']!;
    h.xp = def.levels[0]!.xpTotal - 5;
    h.hp = 100;
    injectEnemy(sim, 'goblin_runner', 215, 900);
    const events = run(sim, 10);
    expect(events.filter((e) => e.type === 'heroLevelUp')).toHaveLength(1);
    expect(h.level).toBe(2);
    expect(h.maxHp).toBeCloseTo(def.stats.hp * def.levels[0]!.hpMult, 5);
    expect(h.hp).toBeGreaterThanOrEqual(100 + (h.maxHp - def.stats.hp) - 1e-6);
    expect(sim.heroStats(h).damage[1]).toBeCloseTo(def.stats.damage[1] * def.levels[0]!.damageMult, 5);
  });

  it('stops at max level and can skip several levels at once', () => {
    const sim = heroSim((d) => {
      d.enemies['goblin_runner']!.hp = 3;
      d.enemies['goblin_runner']!.bounty = 100000;
    });
    injectEnemy(sim, 'goblin_runner', 215, 900);
    run(sim, 10);
    expect(sim.hero!.level).toBe(sim.data.heroes['captain_mara']!.levels.length + 1);
  });
});

describe('hero death and revive', () => {
  it('dies to damage, releases enemies, revives after the timer at spawn with full HP', () => {
    const sim = heroSim((d) => {
      d.enemies['goblin_runner']!.hp = 1e6;
      d.enemies['goblin_runner']!.melee = { damage: 1e6, damageType: 'true', cooldown: 0.5 };
    });
    const g = injectEnemy(sim, 'goblin_runner', 215, 900);
    const events = run(sim, 4);
    expect(events.some((e) => e.type === 'heroDied')).toBe(true);
    const h = sim.hero!;
    expect(h.state).toBe('dead');
    expect(g.blockers).toHaveLength(0);
    sim.drainEvents();
    sim.queue({ type: 'moveHero', x: 1, y: 1 });
    sim.queue({ type: 'heroAbility' });
    sim.step();
    expect(sim.drainEvents().filter((e) => e.type === 'commandRejected')).toHaveLength(2);
    g.hp = 0.0001;
    sim.enemies.delete(900);
    const def = sim.data.heroes['captain_mara']!;
    const wait = def.reviveTime + def.reviveTimePerLevel * (h.level - 1);
    const left = h.reviveTicks / 60;
    expect(left).toBeGreaterThan(wait - 5);
    const revived = run(sim, wait);
    expect(revived.some((e) => e.type === 'heroRevived')).toBe(true);
    expect(h.state).toBe('idle');
    expect(h.hp).toBe(h.maxHp);
    expect([h.x, h.y]).toEqual(sim.data.level.heroSpawn);
  });

  it('revive time grows with level', () => {
    const sim = heroSim((d) => {
      d.enemies['goblin_runner']!.hp = 1e6;
      d.enemies['goblin_runner']!.melee = { damage: 1e6, damageType: 'true', cooldown: 0.5 };
    });
    sim.hero!.level = 3;
    injectEnemy(sim, 'goblin_runner', 215, 900);
    run(sim, 4);
    const def = sim.data.heroes['captain_mara']!;
    expect(sim.hero!.reviveTicks / 60).toBeGreaterThan(def.reviveTime + def.reviveTimePerLevel * 2 - 5);
  });
});

describe('hero ability', () => {
  it('casts the ability spell at the hero, kills grant XP, and it has its own cooldown', () => {
    const sim = heroSim((d) => {
      d.enemies['goblin_runner']!.hp = 5;
      d.enemies['goblin_runner']!.melee = { damage: 0, damageType: 'physical', cooldown: 1 };
    });
    const h = sim.hero!;
    for (const dist of [225, 232, 240]) injectEnemy(sim, 'goblin_runner', dist, 900 + dist).blockers.push(-1);
    sim.queue({ type: 'heroAbility' });
    run(sim, 1);
    expect(sim.hero!.xp).toBe(3 * sim.data.enemies['goblin_runner']!.bounty);
    expect(sim.cooldownLeft('hero:hero_slam')).toBeGreaterThan(10);
    expect(sim.cooldownLeft('meteor')).toBe(0); // independent of player spells
    sim.queue({ type: 'heroAbility' });
    sim.step();
    expect(sim.drainEvents().some((e) => e.type === 'commandRejected')).toBe(true);
    expect(h.state).not.toBe('dead');
  });
});

describe('determinism and data', () => {
  it('a session with hero orders and spells replays to the same hash', () => {
    const data = loadData();
    const live = new Sim(data, 4242);
    for (let i = 0; i < 60 * 60; i++) {
      if (i === 30) live.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
      if (i === 200) live.queue({ type: 'moveHero', x: 500, y: 260 });
      if (i === 900) live.queue({ type: 'castSpell', spellId: 'reinforcements', x: 450, y: 280 });
      if (i === 1500) live.queue({ type: 'heroAbility' });
      if (i === 2000) live.queue({ type: 'castSpell', spellId: 'meteor', x: 700, y: 250 });
      live.step();
    }
    const again = runReplay(data, { seed: 4242, commands: live.commandLog }, 60 * 60);
    expect(again.hash()).toBe(live.hash());
  });

  it('rejects a level that names an unknown hero or spell', () => {
    const d = cloneData(loadData());
    d.level.heroId = 'ghost';
    expect(() => validateGameData(d)).toThrow(/unknown hero "ghost"/);
    const d2 = cloneData(loadData());
    d2.level.spells = ['meteor', 'ghost'];
    expect(() => validateGameData(d2)).toThrow(/unknown spell "ghost"/);
  });

  it('rejects hero data with a missing ability spell or non-increasing XP', () => {
    const d = cloneData(loadData());
    d.heroes['captain_mara']!.ability.spellId = 'ghost';
    expect(() => validateGameData(d)).toThrow(/unknown spell "ghost"/);
    const d2 = cloneData(loadData());
    d2.heroes['captain_mara']!.levels[1]!.xpTotal = 10;
    expect(() => validateGameData(d2)).toThrow(/increasing xpTotal/);
  });

  it('rejects a summon spell naming an unknown soldier', () => {
    const d = cloneData(loadData());
    (d.spells['reinforcements'] as { soldierId: string }).soldierId = 'ghost';
    expect(() => validateGameData(d)).toThrow(/unknown soldier "ghost"/);
  });
});
