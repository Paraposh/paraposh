import type { GameData } from '../../data/types';
import type { Command } from '../core/types';
import { Sim } from '../sim';

export interface ReplayLog {
  seed: number;
  commands: { tick: number; cmd: Command }[];
}

/** Re-runs a recorded session headlessly. Returns the finished sim. */
export function runReplay(data: GameData, log: ReplayLog, maxTicks: number): Sim {
  const sim = new Sim(data, log.seed);
  let i = 0;
  while (sim.tick < maxTicks && sim.status !== 'won' && sim.status !== 'lost') {
    while (i < log.commands.length && (log.commands[i] as { tick: number }).tick <= sim.tick) {
      sim.queue((log.commands[i++] as { cmd: Command }).cmd);
    }
    sim.step();
  }
  return sim;
}
