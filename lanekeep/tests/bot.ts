import type { GameData } from '../src/data/types';
import { Sim } from '../src/sim/sim';

export type BotStep =
  | { do: 'place'; spot: string; tower: string }
  | { do: 'upgrade'; spot: string }
  | { do: 'spec'; spot: string; spec: string }
  | { do: 'call' };

/**
 * Plays a level from a fixed build order, executing the next step whenever it is affordable.
 * Used for balance regression tests and tuning; the order is deliberately dumb.
 */
export function playBot(data: GameData, seed: number, plan: BotStep[], maxSeconds = 900): Sim {
  const sim = new Sim(data, seed);
  let i = 0;
  const towerAt = (spot: string) => [...sim.towers.values()].find((t) => t.spotId === spot);
  while (sim.status !== 'won' && sim.status !== 'lost' && sim.tick < maxSeconds * 60) {
    if (sim.tick % 30 === 0 && i < plan.length) {
      const step = plan[i] as BotStep;
      const g0 = sim.gold;
      if (step.do === 'place') sim.queue({ type: 'placeTower', spotId: step.spot, towerId: step.tower });
      else if (step.do === 'upgrade') {
        const t = towerAt(step.spot);
        if (t) sim.queue({ type: 'upgradeTower', towerId: t.id });
      } else if (step.do === 'spec') {
        const t = towerAt(step.spot);
        if (t) sim.queue({ type: 'specialize', towerId: t.id, specId: step.spec });
      } else sim.queue({ type: 'callWave' });
      sim.step();
      const ev = sim.drainEvents();
      const failed = ev.some((e) => e.type === 'commandRejected');
      if (!failed) i++;
      void g0;
    } else {
      sim.step();
      sim.drainEvents();
    }
  }
  return sim;
}
