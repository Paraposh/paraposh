export type SfxName = 'shoot' | 'hit' | 'kill' | 'build' | 'spell' | 'leak' | 'wave' | 'win' | 'lose' | 'levelup' | 'click';

/** Tiny Web Audio synth for placeholder effects. All sounds are generated here; nothing is sampled or copied. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | undefined;
  private last = new Map<SfxName, number>();

  /** Browsers only allow audio after a user gesture; call from the first click. */
  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = undefined;
    }
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const gap = name === 'hit' || name === 'shoot' ? 0.045 : 0.02;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    switch (name) {
      case 'shoot': return this.tone(560, 0.07, 'square', 0.04, 280);
      case 'hit': return this.noise(0.05, 0.05);
      case 'kill': return this.tone(320, 0.14, 'triangle', 0.09, 90);
      case 'build': return (this.tone(300, 0.08, 'square', 0.06), this.tone(450, 0.12, 'square', 0.06, undefined, 0.07));
      case 'spell': return this.tone(110, 0.5, 'sawtooth', 0.1, 40);
      case 'leak': return this.tone(140, 0.3, 'square', 0.12, 70);
      case 'wave': return (this.tone(220, 0.25, 'sawtooth', 0.08), this.tone(330, 0.35, 'sawtooth', 0.08, undefined, 0.2));
      case 'win': return [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, undefined, i * 0.14));
      case 'lose': return [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, undefined, i * 0.18));
      case 'levelup': return [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.08, undefined, i * 0.08));
      case 'click': return this.tone(700, 0.04, 'square', 0.03);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}
