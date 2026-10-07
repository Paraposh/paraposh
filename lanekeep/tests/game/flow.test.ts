import { describe, expect, it } from 'vitest';
import { isUnlocked, validateCampaign, type Campaign } from '../../src/game/campaign';
import { GameFlow, levelPhase } from '../../src/game/flow';
import { newProgress, recordResult, totalStars } from '../../src/game/progress';
import { Sim } from '../../src/sim/sim';
import { firstWaveOnly, loadData, quietSim } from '../helpers';

describe('GameFlow', () => {
  it('walks Menu > Map > Level > Results > Map > Menu', () => {
    const f = new GameFlow();
    expect(f.screen).toBe('menu');
    f.openMap();
    f.startLevel('level-01');
    expect(f.screen).toBe('level');
    expect(f.levelId).toBe('level-01');
    f.backToMap();
    f.backToMenu();
    expect(f.screen).toBe('menu');
  });

  it('rejects illegal transitions', () => {
    const f = new GameFlow();
    expect(() => f.startLevel('x')).toThrow(/menu -> level/);
    f.openMap();
    expect(() => f.retry()).toThrow();
    f.startLevel('level-01');
    expect(() => f.backToMenu()).toThrow(/level -> menu/);
  });

  it('moves to Results exactly once when the sim ends, with stars and lives', () => {
    const f = new GameFlow();
    f.openMap();
    f.startLevel('level-01');
    const sim = quietSim();
    expect(f.update(sim)).toBeUndefined();
    sim.status = 'won';
    sim.lives = 18;
    const r = f.update(sim);
    expect(r).toMatchObject({ levelId: 'level-01', won: true, stars: 3, livesLeft: 18 });
    expect(f.screen).toBe('results');
    expect(f.update(sim)).toBeUndefined();
    f.retry();
    expect(f.screen).toBe('level');
    expect(f.result).toBeUndefined();
  });

  it('a lost level goes to Results with 0 stars', () => {
    const f = new GameFlow();
    f.openMap();
    f.startLevel('level-01');
    const sim = quietSim();
    sim.status = 'lost';
    sim.lives = 0;
    expect(f.update(sim)).toMatchObject({ won: false, stars: 0 });
  });

  it('levelPhase follows the sim: Prepare, Wave, Win, Lose', () => {
    const sim = new Sim(firstWaveOnly(loadData()), 1);
    expect(levelPhase(sim)).toBe('prepare');
    for (let i = 0; i < 60 * 12; i++) sim.step();
    expect(levelPhase(sim)).toBe('wave');
    sim.status = 'won';
    expect(levelPhase(sim)).toBe('win');
    sim.status = 'lost';
    expect(levelPhase(sim)).toBe('lose');
  });
});

describe('campaign and progress', () => {
  const campaign: Campaign = {
    levels: [
      { id: 'a', name: 'A', mapPos: [0.2, 0.5], requires: [] },
      { id: 'b', name: 'B', mapPos: [0.6, 0.5], requires: ['a'] },
    ],
  };

  it('unlocks a level once its requirements have at least one star', () => {
    expect(isUnlocked(campaign, 'a', {})).toBe(true);
    expect(isUnlocked(campaign, 'b', {})).toBe(false);
    expect(isUnlocked(campaign, 'b', { a: 1 })).toBe(true);
    expect(isUnlocked(campaign, 'zzz', {})).toBe(false);
  });

  it('validates campaign data', () => {
    expect(() => validateCampaign(campaign, ['a', 'b'])).not.toThrow();
    expect(() => validateCampaign(campaign, ['a'])).toThrow(/no level file/);
    expect(() => validateCampaign({ levels: [{ ...campaign.levels[0]!, requires: ['q'] }] }, ['a'])).toThrow(/unknown level "q"/);
    expect(() => validateCampaign({ levels: [] }, [])).toThrow();
  });

  it('keeps best stars per level and reports newly earned stars', () => {
    const p = newProgress();
    const res = (stars: number, won = true) => ({ levelId: 'a', won, stars, livesLeft: 0, ticks: 0 });
    expect(recordResult(p, res(2))).toBe(2);
    expect(recordResult(p, res(1))).toBe(0);
    expect(recordResult(p, res(3))).toBe(1);
    expect(recordResult(p, res(0, false))).toBe(0);
    expect(p.stars['a']).toBe(3);
    expect(totalStars(p)).toBe(3);
  });
});
