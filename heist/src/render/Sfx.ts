/** Sons synthétisés en WebAudio : sirène, sonnerie d'alarme, raclement de métal, pas. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private bell: { osc: OscillatorNode; gain: GainNode } | null = null;
  private stepTimer = 0;

  /** À appeler après un geste du joueur (règle des navigateurs). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    this.siren = this.loop('sawtooth');
    this.bell = this.loop('square');
  }

  private loop(type: OscillatorType): { osc: OscillatorNode; gain: GainNode } | null {
    if (!this.ctx || !this.master) return null;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    return { osc, gain };
  }

  /** `siren` : 0..1 selon la proximité de la police ; `alarm` : sonnerie de la porte. */
  update(dt: number, time: number, siren: number, alarm: boolean, walking: number, scraping: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.siren || !this.bell) return;
    const t = ctx.currentTime;
    this.siren.gain.gain.setTargetAtTime(siren * 0.12, t, 0.2);
    this.siren.osc.frequency.setTargetAtTime(Math.sin(time * 3) > 0 ? 960 : 720, t, 0.05);
    this.bell.gain.gain.setTargetAtTime(alarm && Math.sin(time * 40) > 0 ? 0.06 : 0, t, 0.01);
    this.bell.osc.frequency.value = 1400;

    if (walking > 0) {
      this.stepTimer -= dt * walking;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.45;
        this.noise(0.05, 300, 0.12);
      }
    }
    if (scraping && Math.random() < dt * 12) this.noise(0.08, 2500 + Math.random() * 1500, 0.08);
  }

  /** Petit bruit filtré (pas, raclement). */
  noise(duration: number, freq: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** Carillon bref, pour une information notée ou un butin. */
  chime(high: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = high ? 880 : 660;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  }
}
