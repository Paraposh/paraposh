import { describe, expect, it } from 'vitest';
import { nearestBarracks, pick } from '../../src/ui/picking';
import { buildOptions, heroModel, hudModel, spellButtons, towerPanel } from '../../src/ui/viewModels';
import { Sim } from '../../src/sim/sim';
import { loadData, quietSim } from '../helpers';

const step = (sim: Sim, n = 1) => {
  for (let i = 0; i < n; i++) sim.step();
  sim.drainEvents();
};

describe('buildOptions', () => {
  it('lists allowed towers with cost and affordability; empty for an occupied spot', () => {
    const sim = quietSim((d) => (d.level.startGold = 100));
    const opts = buildOptions(sim, 's1');
    expect(opts.map((o) => o.towerId).sort()).toEqual(['archer', 'barracks', 'mage', 'mortar']);
    expect(opts.find((o) => o.towerId === 'archer')).toMatchObject({ cost: 70, affordable: true });
    expect(opts.find((o) => o.towerId === 'mortar')).toMatchObject({ cost: 120, affordable: false });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    step(sim);
    expect(buildOptions(sim, 's1')).toEqual([]);
    expect(buildOptions(sim, 'nope')).toEqual([]);
  });
});

describe('towerPanel', () => {
  const setup = () => {
    const sim = quietSim((d) => (d.level.startGold = 5000));
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    step(sim);
    return { sim, id: [...sim.towers.keys()][0]! };
  };

  it('offers an upgrade with its cost and a sell refund of 70% of invested', () => {
    const { sim, id } = setup();
    const p = towerPanel(sim, id)!;
    expect(p.title).toContain('Tier 1');
    const up = p.actions.find((a) => a.kind === 'upgrade')!;
    expect(up).toMatchObject({ cost: 90, enabled: true });
    expect(p.actions.find((a) => a.kind === 'sell')).toMatchObject({ refund: Math.floor(70 * 0.7) });
    expect(p.stats[0]).toMatch(/Damage \d+-\d+ physical/);
  });

  it('after the last tier it offers the two specializations, then only sell', () => {
    const { sim, id } = setup();
    sim.queue({ type: 'upgradeTower', towerId: id });
    sim.queue({ type: 'upgradeTower', towerId: id });
    step(sim);
    const p = towerPanel(sim, id)!;
    expect(p.actions.filter((a) => a.kind === 'specialize').map((a) => a.kind === 'specialize' && a.specId).sort()).toEqual(['rapidRanger', 'sharpshooter']);
    expect(p.actions.some((a) => a.kind === 'upgrade')).toBe(false);
    sim.queue({ type: 'specialize', towerId: id, specId: 'sharpshooter' });
    step(sim);
    const after = towerPanel(sim, id)!;
    expect(after.title).toContain('Sharpshooter');
    expect(after.actions.map((a) => a.kind)).toEqual(['sell']);
  });

  it('disables unaffordable actions', () => {
    const sim = quietSim((d) => (d.level.startGold = 75));
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    step(sim);
    const p = towerPanel(sim, [...sim.towers.keys()][0]!)!;
    expect(p.actions.find((a) => a.kind === 'upgrade')).toMatchObject({ enabled: false });
  });

  it('describes barracks soldiers and unknown towers gracefully', () => {
    const sim = quietSim((d) => (d.level.startGold = 500));
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    step(sim);
    expect(towerPanel(sim, [...sim.towers.keys()][0]!)!.stats[0]).toBe('3 x Footman');
    expect(towerPanel(sim, 999)).toBeUndefined();
  });
});

describe('hudModel', () => {
  it('shows a countdown and early-call bonus before a wave, then spawning text', () => {
    const sim = new Sim(loadData(), 1);
    step(sim, 4 * 60);
    const h = hudModel(sim);
    expect(h.phase).toBe('prepare');
    expect(h.waveText).toBe('Wave 1 / 6 in 6s');
    expect(h.canCallWave).toBe(true);
    expect(h.callBonus).toBe(6);
    step(sim, 7 * 60);
    const w = hudModel(sim);
    expect(w.phase).toBe('wave');
    expect(w.waveText).toBe('Wave 1 / 6');
    expect(w.canCallWave).toBe(false);
    expect(w.countdown).toBeNull();
  });
});

describe('spellButtons and heroModel', () => {
  it('lists player spells then the hero ability, with cooldown state', () => {
    const sim = quietSim();
    const before = spellButtons(sim);
    expect(before.map((b) => b.spellId)).toEqual(['meteor', 'reinforcements', 'hero_slam']);
    expect(before.every((b) => b.enabled)).toBe(true);
    expect(before.map((b) => b.needsTarget)).toEqual([true, true, false]);
    sim.queue({ type: 'castSpell', spellId: 'meteor', x: 100, y: 100 });
    step(sim);
    const m = spellButtons(sim)[0]!;
    expect(m).toMatchObject({ ready: false, enabled: false });
    expect(m.secondsLeft).toBeGreaterThan(40);
    expect(m.cooldownFraction).toBeGreaterThan(0.9);
  });

  it('hero model reports level, HP and revive state', () => {
    const sim = quietSim();
    expect(heroModel(sim)).toMatchObject({ name: 'Captain Mara', level: 1, down: false, xpToNext: 60 });
    sim.hero!.state = 'dead';
    sim.hero!.reviveTicks = 600;
    expect(heroModel(sim)).toMatchObject({ down: true, reviveSeconds: 10 });
    expect(spellButtons(sim).find((b) => b.key.startsWith('hero:'))!.enabled).toBe(false);
  });
});

describe('picking', () => {
  it('finds spots, towers and ground; nearest wins', () => {
    const sim = quietSim();
    expect(pick(sim, 420, 300)).toEqual({ kind: 'spot', spotId: 's1' });
    expect(pick(sim, 100, 100)).toEqual({ kind: 'ground' });
    sim.queue({ type: 'placeTower', spotId: 's1', towerId: 'barracks' });
    step(sim);
    const t = pick(sim, 425, 305);
    expect(t.kind).toBe('tower');
    expect(nearestBarracks(sim, 400, 300)).toBe([...sim.towers.keys()][0]);
    expect(nearestBarracks(quietSim(), 0, 0)).toBeUndefined();
  });
});
