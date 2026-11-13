/**
 * Son synthétisé en WebAudio : ambiance de ville (jour et nuit), pas, coups de feu proches et lointains,
 * verre brisé, métal forcé, perceuse, alarmes, sirène, rechargement, impacts. Aucun fichier son.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private loops: Record<'siren' | 'bell' | 'car' | 'drill' | 'city' | 'night', { src: AudioScheduledSourceNode; gain: GainNode; osc?: OscillatorNode; filter?: BiquadFilterNode }> | null = null;
  private stepTimer = 0;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;

  /** À appeler après un geste du joueur (règle des navigateurs). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // Réverbération courte : une réponse impulsionnelle de bruit décroissant.
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.reverb.connect(wet).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const osc = (type: OscillatorType, freq: number, lp: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master as GainNode);
      if (this.reverb) g.connect(this.reverb);
      o.start();
      return { src: o, gain: g, osc: o, filter: f };
    };
    const noise = (type: BiquadFilterType, freq: number, q: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master as GainNode);
      s.start();
      return { src: s, gain: g, filter: f };
    };
    this.loops = {
      siren: osc('sawtooth', 700, 2200),
      bell: osc('square', 1400, 3000),
      car: osc('square', 900, 2500),
      drill: osc('sawtooth', 180, 1600),
      city: noise('lowpass', 380, 0.6),
      night: noise('bandpass', 4200, 8),
    };
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Atténuation selon la distance. */
  private att(dist: number, ref = 4): number {
    return ref / (ref + Math.max(0, dist));
  }

  private burst(duration: number, freq: number, volume: number, type: BiquadFilterType = 'bandpass', q = 1, wet = 0.4): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
    src.connect(f).connect(g).connect(this.master);
    if (this.reverb && wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.reverb);
    }
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  private tone(freq: number, duration: number, volume: number, type: OscillatorType = 'sine', slide = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  /** Coup de feu : claquement, détonation grave, écho ; étouffé avec la distance. */
  gunshot(dist: number): void {
    const a = this.att(dist, 8);
    this.burst(0.08, 2500 * (0.3 + a), 1.4 * a, 'lowpass', 0.7, 0.8);
    this.burst(0.35, 160, 1.6 * a, 'lowpass', 1, 1);
    this.tone(90, 0.18, 0.7 * a, 'sine', -50);
  }

  dryFire(): void {
    this.burst(0.03, 3000, 0.3, 'highpass', 1, 0);
  }

  reload(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.burst(0.05, 1800, 0.4, 'bandpass', 3, 0);
    setTimeout(() => this.burst(0.04, 2400, 0.35, 'bandpass', 4, 0), 550);
    setTimeout(() => this.burst(0.06, 1300, 0.5, 'bandpass', 3, 0), 1150);
  }

  swing(hit: boolean): void {
    this.burst(0.18, 900, 0.25, 'bandpass', 0.8, 0);
    if (hit) {
      this.tone(110, 0.15, 0.6, 'sine', -60);
      this.burst(0.08, 400, 0.6, 'lowpass', 1, 0.2);
    }
  }

  glass(dist: number): void {
    const a = this.att(dist, 6);
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        this.tone(2500 + Math.random() * 4000, 0.25 + Math.random() * 0.3, 0.12 * a, 'triangle');
        this.burst(0.12, 5000 + Math.random() * 3000, 0.35 * a, 'highpass', 1, 0.3);
      }, i * (20 + Math.random() * 40));
    }
  }

  hurt(armor: boolean): void {
    if (armor) {
      this.tone(320, 0.2, 0.35, 'triangle', -120);
      this.burst(0.1, 1500, 0.4, 'bandpass', 2, 0.2);
    } else {
      this.tone(160, 0.25, 0.5, 'sine', -80);
      this.burst(0.15, 300, 0.5, 'lowpass', 1, 0);
    }
  }

  chime(high: boolean): void {
    this.tone(high ? 880 : 660, 0.4, 0.12, 'sine');
    setTimeout(() => this.tone(high ? 1320 : 990, 0.5, 0.08, 'sine'), 90);
  }

  /** Grondement de la chambre forte qui s'ouvre. */
  vault(): void {
    this.tone(55, 2.5, 0.7, 'sawtooth', -20);
    this.burst(2.5, 120, 0.5, 'lowpass', 1, 1);
  }

  /** Pas : rythme selon l'allure, son selon le sol. */
  steps(dt: number, rate: number, hard: boolean): void {
    if (rate <= 0) {
      this.stepTimer = Math.min(this.stepTimer, 0.1);
      return;
    }
    this.stepTimer -= dt * rate;
    if (this.stepTimer > 0) return;
    this.stepTimer = 0.5;
    this.burst(0.07, hard ? 900 : 380, hard ? 0.18 : 0.22, 'bandpass', hard ? 2 : 1, 0.1);
  }

  /** Métal qu'on force : grincements aléatoires. */
  scrape(dt: number): void {
    if (Math.random() < dt * 9) this.burst(0.09, 2200 + Math.random() * 2400, 0.22, 'bandpass', 6, 0.3);
    if (Math.random() < dt * 2) this.tone(300 + Math.random() * 500, 0.3, 0.06, 'sawtooth', -100);
  }

  /** Boucles continues : sirène (0..1), alarme de site, alarme de voiture, perceuse, ambiance. */
  update(time: number, s: { siren: number; bell: number; car: number; drill: number; day: number; indoor: boolean }): void {
    const ctx = this.ctx;
    const l = this.loops;
    if (!ctx || !l) return;
    const t = ctx.currentTime;
    l.siren.gain.gain.setTargetAtTime(s.siren * 0.1, t, 0.25);
    l.siren.osc?.frequency.setTargetAtTime(Math.sin(time * 2.2) > 0 ? 960 : 700, t, 0.12);
    l.bell.gain.gain.setTargetAtTime(s.bell > 0 && Math.sin(time * 45) > 0 ? 0.05 * s.bell : 0, t, 0.005);
    l.car.gain.gain.setTargetAtTime(s.car > 0 && Math.sin(time * 8) > 0 ? 0.05 * s.car : 0, t, 0.01);
    l.car.osc?.frequency.setTargetAtTime(Math.sin(time * 3) > 0 ? 1100 : 800, t, 0.02);
    l.drill.gain.gain.setTargetAtTime(s.drill * 0.07, t, 0.1);
    l.drill.osc?.frequency.setTargetAtTime(180 + Math.sin(time * 7) * 25 + Math.random() * 10, t, 0.05);
    const muffle = s.indoor ? 0.45 : 1;
    l.city.gain.gain.setTargetAtTime((0.05 + s.day * 0.07) * muffle, t, 0.5);
    l.night.gain.gain.setTargetAtTime((1 - s.day) * 0.006 * muffle * (0.6 + 0.4 * Math.sin(time * 9)), t, 0.05);
  }
}
