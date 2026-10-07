import { describe, expect, it } from 'vitest';
import { runReplay } from '../../src/sim/replay/replay';
import { Sim } from '../../src/sim/sim';
import { loadData } from '../helpers';

describe('determinism', () => {
  it('same seed + same commands => identical state hash tick by tick', () => {
    const data = loadData();
    const a = new Sim(data, 99);
    const b = new Sim(data, 99);
    a.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    b.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
    for (let i = 0; i < 60 * 40; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });

  it('different seeds diverge', () => {
    const data = loadData();
    const a = new Sim(data, 1);
    const b = new Sim(data, 2);
    for (let i = 0; i < 60 * 15; i++) (a.step(), b.step());
    expect(a.hash()).not.toBe(b.hash());
  });

  it('a recorded session replays to the same final hash', () => {
    const data = loadData();
    const live = new Sim(data, 2024);
    for (let i = 0; i < 600; i++) {
      if (i === 10) live.queue({ type: 'placeTower', spotId: 's1', towerId: 'archer' });
      if (i === 300) live.queue({ type: 'placeTower', spotId: 's3', towerId: 'archer' });
      live.step();
    }
    const replayed = runReplay(data, { seed: 2024, commands: live.commandLog }, 600);
    expect(replayed.tick).toBe(live.tick);
    expect(replayed.hash()).toBe(live.hash());
  });

  it('sim source never uses nondeterministic APIs', () => {
    const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = walk(join(import.meta.dirname, '..', '..', 'src', 'sim')).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
    }
  });
});
