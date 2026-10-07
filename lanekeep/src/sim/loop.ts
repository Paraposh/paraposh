import type { Sim } from './sim';

/**
 * Fixed-timestep driver. The renderer calls advance(frameSeconds) every display frame;
 * speed (0 pause, 1x, 2x) scales how many sim steps run, never the renderer.
 * Returns the interpolation alpha for drawing between the last two sim states.
 */
export class FixedStepLoop {
  speed = 1;
  private acc = 0;

  constructor(
    private readonly sim: Sim,
    private readonly maxStepsPerFrame = 8,
  ) {}

  advance(frameSeconds: number): number {
    const dt = 1 / this.sim.data.config.tickRate;
    this.acc += frameSeconds * this.speed;
    let steps = 0;
    while (this.acc >= dt - 1e-9 && steps < this.maxStepsPerFrame) {
      this.sim.step();
      this.acc -= dt;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0; // drop backlog after a long stall
    return this.acc / dt;
  }
}
