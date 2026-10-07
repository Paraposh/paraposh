import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyMeta, buy, buyBlock, effectTotal, MAX_COOLDOWN_REDUCTION, respec, starsAvailable, starsSpent, validateMeta, type MetaRanks, type MetaTree } from '../../src/meta/meta';
import { cloneData, loadData } from '../helpers';
import { runReplay } from '../../src/sim/replay/replay';

const tree = validateMeta(JSON.parse(readFileSync(join(import.meta.dirname, '../../data/meta-upgrades.json'), 'utf8')));
const progress = (n: number) => ({ stars: { 'level-01': n } });

describe('meta upgrade data', () => {
  it('ships a valid tree', () => {
    expect(tree.upgrades.length).toBeGreaterThan(3);
  });
  it('rejects wrong cost counts, unknown or later prerequisites and duplicates', () => {
    const bad = (u: unknown[]) => () => validateMeta({ upgrades: u });
    const base = { id: 'a', name: 'A', description: 'd', branch: 'x', maxRank: 2, costs: [1, 2], effect: { kind: 'startGold', perRank: 1 } };
    expect(bad([{ ...base, costs: [1] }])).toThrow(/needs 2 costs/);
    expect(bad([{ ...base, requires: { id: 'b', rank: 1 } }])).toThrow(/unknown or listed later/);
    expect(bad([base, { ...base }])).toThrow(/duplicate/);
    expect(bad([base, { ...base, id: 'b', requires: { id: 'a', rank: 3 } }])).toThrow(/max 2/);
    expect(bad([{ ...base, effect: { kind: 'nope', perRank: 1 } }])).toThrow(/Invalid meta/);
  });
});

describe('buying', () => {
  it('spends stars, respects costs, prerequisites and max rank', () => {
    const ranks: MetaRanks = {};
    const p = progress(3);
    expect(starsAvailable(tree, p, ranks)).toBe(3);
    expect(buyBlock(tree, p, ranks, 'tax_collectors')).toBe('locked');
    expect(buy(tree, p, ranks, 'war_chest')).toBe(true); // 1
    expect(buy(tree, p, ranks, 'war_chest')).toBe(true); // 2
    expect(starsSpent(tree, ranks)).toBe(3);
    expect(buyBlock(tree, p, ranks, 'war_chest')).toBe('poor'); // rank 3 costs 3
    expect(buy(tree, p, ranks, 'war_chest')).toBe(false);
    expect(ranks.war_chest).toBe(2);
    expect(buyBlock(tree, progress(99), ranks, 'war_chest')).toBeUndefined();
    ranks.war_chest = 3;
    expect(buyBlock(tree, progress(99), ranks, 'war_chest')).toBe('maxed');
    expect(buyBlock(tree, p, ranks, 'nope')).toBe('unknown');
  });
  it('respec refunds everything', () => {
    const ranks: MetaRanks = { war_chest: 2, sturdy_walls: 1 };
    const p = progress(10);
    respec(ranks);
    expect(starsAvailable(tree, p, ranks)).toBe(10);
  });
});

describe('applyMeta', () => {
  it('changes nothing with no ranks, and never mutates its input', () => {
    const d = loadData();
    const before = JSON.stringify(d);
    expect(JSON.stringify(applyMeta(d, tree, {}))).toBe(before);
    applyMeta(d, tree, { war_chest: 3, sharp_arrows: 3, arcane_focus: 3, heroic_vigor: 3 });
    expect(JSON.stringify(d)).toBe(before);
  });
  it('adds gold and lives', () => {
    const d = loadData();
    const out = applyMeta(d, tree, { war_chest: 2, sturdy_walls: 3 });
    expect(out.level.startGold).toBe(d.level.startGold + 80);
    expect(out.config.startingLives).toBe(d.config.startingLives + 6);
  });
  it('scales tower damage on tiers and specializations, not barracks', () => {
    const d = loadData();
    const out = applyMeta(d, tree, { sturdy_walls: 1, sharp_arrows: 2 });
    const a0 = d.towers.archer as { tiers: { damage: [number, number] }[]; specializations: Record<string, { damage?: [number, number] }> };
    const a1 = out.towers.archer as typeof a0;
    expect(a1.tiers[0]!.damage[0]).toBeCloseTo(a0.tiers[0]!.damage[0] * 1.1, 6);
    const specId = Object.keys(a0.specializations).find((k) => a0.specializations[k]!.damage)!;
    expect(a1.specializations[specId]!.damage![1]).toBeCloseTo(a0.specializations[specId]!.damage![1] * 1.1, 6);
    expect(out.towers.barracks).toEqual(d.towers.barracks);
  });
  it('shortens spell cooldowns up to a cap, and raises hero hp', () => {
    const d = loadData();
    const out = applyMeta(d, tree, { arcane_focus: 3, heroic_vigor: 2 });
    expect(out.spells.meteor!.cooldown).toBeCloseTo(d.spells.meteor!.cooldown * (1 - 0.24), 6);
    expect(out.heroes.captain_mara!.stats.hp).toBe(Math.round(d.heroes.captain_mara!.stats.hp * 1.2));
    const huge: MetaTree = { upgrades: [{ id: 'x', name: 'x', description: 'x', branch: 'x', maxRank: 1, costs: [1], effect: { kind: 'spellCooldown', perRank: 5 } }] };
    const capped = applyMeta(d, huge, { x: 1 });
    expect(effectTotal(huge, { x: 1 }, 'spellCooldown')).toBe(5);
    expect(capped.spells.meteor!.cooldown).toBeCloseTo(d.spells.meteor!.cooldown * (1 - MAX_COOLDOWN_REDUCTION), 6);
  });
  it('keeps the sim deterministic for modified data', () => {
    const run = () => runReplay(cloneData(applyMeta(loadData(), tree, { war_chest: 1, sharp_arrows: 1, sturdy_walls: 1 })), { seed: 7, commands: [] }, 600).hash();
    expect(run()).toBe(run());
  });
});
