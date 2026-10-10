/**
 * Moteur audio en WebAudio, sans dépendance :
 * - deux bus (musique, bruitages) vers un compresseur, avec une réverbération partagée ;
 * - une musique faite de nappes d'accords et d'arpèges de cloches, dont l'humeur colore
 *   les timbres (souvenirs, ambiance du jeu) ;
 * - des sons organiques synthétisés : gouttes, craquements, grondements, crépitements…
 * Le contexte n'est créé qu'au premier geste du joueur, comme l'exigent les navigateurs.
 */

export type Mood = 'warm' | 'sad' | 'tense' | 'cold' | 'hopeful';
export type SfxName = 'chime' | 'crack' | 'rumble' | 'drip' | 'burn' | 'rain' | 'hiss' | 'grow' | 'pop' | 'betray';

interface Voice {
  stop: (when: number) => void;
}

const MOODS: Record<Mood, { wave: OscillatorType; cutoff: number; detune: number; bell: number }> = {
  warm: { wave: 'sawtooth', cutoff: 1100, detune: 6, bell: 1 },
  sad: { wave: 'triangle', cutoff: 900, detune: 4, bell: 0.7 },
  tense: { wave: 'sawtooth', cutoff: 700, detune: 14, bell: 0.6 },
  cold: { wave: 'triangle', cutoff: 1800, detune: 3, bell: 1.2 },
  hopeful: { wave: 'triangle', cutoff: 1500, detune: 5, bell: 1.1 },
};

const semitone = (root: number, n: number) => root * 2 ** (n / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private pad: Voice[] = [];
  private chord: number[] = [];
  private root = 220;
  private mood: Mood = 'warm';
  private tempo = 60;
  /** Densité des arpèges (0..1) : l'ambiance du jeu la fait varier avec le réseau. */
  private density = 0.5;
  private nextArp = 0;
  private arpStep = 0;
  private timer: number | null = null;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private lastSfx = new Map<SfxName, number>();

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(ctx, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(comp);
    this.music.connect(comp);
    this.sfxBus.connect(comp);
    this.music.connect(this.reverb);
    this.sfxBus.connect(this.reverb);
    // Bruit blanc réutilisable (pluie, craquements…).
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /** Réponse impulsionnelle synthétique : bruit à décroissance exponentielle (sous-bois humide). */
  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    return buffer;
  }

  /** À appeler sur un geste du joueur. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.ctx && this.music && this.sfxBus) {
      this.music.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
    }
  }

  // ─── Musique ────────────────────────────────────────────────────────────

  /** Lance (ou reconfigure) la musique : fondamentale, tempo des arpèges et humeur. */
  startMusic(root: number, tempo: number, mood: Mood): void {
    this.root = root;
    this.tempo = tempo;
    this.mood = mood;
    if (!this.ensure()) return;
    if (this.timer === null) {
      this.nextArp = this.ctx!.currentTime + 0.5;
      this.timer = window.setInterval(() => this.scheduleArps(), 100);
    }
  }

  /** Change d'accord (demi-tons relatifs à la fondamentale), avec un fondu enchaîné. */
  setChord(semitones: number[]): void {
    const ctx = this.ensure();
    if (!ctx || !this.music || !this.reverb) return;
    const t = ctx.currentTime;
    for (const v of this.pad) v.stop(t + 2.5);
    this.chord = semitones;
    const m = MOODS[this.mood];
    this.pad = semitones.map((n) => {
      const freq = semitone(this.root / 2, n);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = m.cutoff;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.05 / Math.sqrt(semitones.length), t + 2);
      const oscs = [-m.detune, m.detune].map((d) => {
        const o = ctx.createOscillator();
        o.type = m.wave;
        o.frequency.value = freq;
        o.detune.value = d;
        o.connect(filter);
        o.start(t);
        return o;
      });
      filter.connect(env).connect(this.music!);
      return {
        stop: (when: number) => {
          env.gain.cancelScheduledValues(t);
          env.gain.setTargetAtTime(0, Math.max(t, when - 2.4), 0.6);
          for (const o of oscs) o.stop(when + 1);
        },
      };
    });
  }

  /** Densité des arpèges (0..1). */
  setDensity(density: number): void {
    this.density = Math.max(0, Math.min(1, density));
  }

  stopMusic(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) for (const v of this.pad) v.stop(this.ctx.currentTime + 2.5);
    this.pad = [];
    this.chord = [];
  }

  /** Planifie les notes de cloche des 200 prochaines ms (horloge audio précise). */
  private scheduleArps(): void {
    const ctx = this.ctx;
    if (!ctx || this.chord.length === 0) return;
    const step = 60 / this.tempo / 2;
    while (this.nextArp < ctx.currentTime + 0.2) {
      const n = this.chord[this.arpStep % this.chord.length]!;
      const octave = this.arpStep % 7 === 3 ? 12 : 0;
      // Notes clairsemées quand le réseau est petit, plus serrées quand il grandit.
      if (Math.random() < 0.15 + 0.7 * this.density) {
        this.bell(semitone(this.root, n + octave), this.nextArp, 0.05 * MOODS[this.mood].bell);
      }
      this.arpStep++;
      this.nextArp += step;
    }
  }

  private bell(freq: number, when: number, gain: number, bus: GainNode | null = this.music): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    for (const [ratio, g, decay] of [
      [1, 1, 2.2],
      [2.76, 0.35, 0.9],
      [5.4, 0.12, 0.4],
    ] as const) {
      const o = ctx.createOscillator();
      const env = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(gain * g, when + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      o.connect(env).connect(bus);
      o.start(when);
      o.stop(when + decay + 0.05);
    }
  }

  // ─── Bruitages ──────────────────────────────────────────────────────────

  /** Note percussive douce (mini-jeu, interface). */
  pluck(freq: number, duration = 0.35, gain = 0.25): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** Bruit filtré, avec enveloppe : base des sons organiques. */
  private noiseBurst(type: BiquadFilterType, freq: number, q: number, gain: number, attack: number, decay: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(filter).connect(env).connect(this.sfxBus!);
    src.start(t, Math.random());
    src.stop(t + attack + decay + 0.05);
  }

  /** Joue un son organique. Les répétitions trop rapprochées d'un même son sont ignorées. */
  sfx(name: SfxName, intensity = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const now = ctx.currentTime;
    if (now - (this.lastSfx.get(name) ?? -1) < 0.06) return;
    this.lastSfx.set(name, now);
    const k = Math.max(0.1, Math.min(2, intensity));
    switch (name) {
      case 'drip': {
        // Goutte : sinus dont la hauteur chute vite.
        const o = ctx.createOscillator();
        const env = ctx.createGain();
        const f = 900 + Math.random() * 700;
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.45, now + 0.12);
        env.gain.setValueAtTime(0.18 * k, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        o.connect(env).connect(this.sfxBus);
        o.start(now);
        o.stop(now + 0.2);
        break;
      }
      case 'crack':
        // Craquement de bois : quelques claquements de bruit très brefs.
        for (let i = 0; i < 4; i++) this.noiseBurst('bandpass', 1800 + Math.random() * 1500, 3, 0.35 * k, 0.002, 0.04 + Math.random() * 0.05, i * 0.03 + Math.random() * 0.03);
        break;
      case 'rumble':
        this.noiseBurst('lowpass', 120, 1, 0.5 * k, 0.05, 1.4);
        break;
      case 'burn':
        for (let i = 0; i < 10; i++) this.noiseBurst('highpass', 2500, 1, 0.08 * k, 0.001, 0.03, Math.random() * 1.5);
        this.noiseBurst('lowpass', 400, 1, 0.12 * k, 0.4, 1.5);
        break;
      case 'rain':
        this.noiseBurst('bandpass', 3000, 0.6, 0.06 * k, 1.5, 6);
        break;
      case 'hiss':
        this.noiseBurst('highpass', 5000, 0.7, 0.1 * k, 0.2, 1.2);
        break;
      case 'chime':
        [0, 4, 7, 12].forEach((n, i) => this.bell(semitone(440, n), now + i * 0.09, 0.08 * k, this.sfxBus));
        break;
      case 'grow':
        this.pluck(330 + Math.random() * 60, 0.12, 0.05 * k);
        break;
      case 'pop':
        this.noiseBurst('bandpass', 700, 4, 0.2 * k, 0.003, 0.08);
        break;
      case 'betray': {
        // Deux notes dissonantes qui glissent vers le grave.
        for (const f of [233, 247]) {
          const o = ctx.createOscillator();
          const env = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now);
          o.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.6);
          env.gain.setValueAtTime(0.12 * k, now);
          env.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
          o.connect(env).connect(this.sfxBus);
          o.start(now);
          o.stop(now + 0.75);
        }
        break;
      }
    }
  }
}

export const audio = new AudioEngine();
