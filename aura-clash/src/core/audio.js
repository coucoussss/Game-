// Audio entièrement généré par code (Web Audio API) : aucun fichier son, donc aucun problème de droits.
//  - bruitages synthétisés (impacts, souffles, rayons, explosions…)
//  - musique procédurale : batterie, basse, nappes et mélodie, un thème par arène + un thème de menu.

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Gammes (intervalles en demi-tons)
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];

// Thèmes : 0-4 = arènes, 5 = menu
const THEMES = [
  { name: 'Falaises', bpm: 150, root: 45, scale: DORIAN, prog: [0, 5, 3, 4], drums: 'rock', lead: 'square', seed: 11 },
  { name: 'Temple', bpm: 132, root: 50, scale: PHRYGIAN, prog: [0, 1, 0, 6], drums: 'taiko', lead: 'triangle', seed: 23 },
  { name: 'Néo-Kyoto', bpm: 160, root: 43, scale: MINOR, prog: [0, 5, 6, 4], drums: 'electro', lead: 'sawtooth', seed: 37 },
  { name: 'Glacier', bpm: 140, root: 47, scale: HARM, prog: [0, 3, 5, 4], drums: 'rock', lead: 'triangle', seed: 41 },
  { name: 'Volcan', bpm: 172, root: 40, scale: PHRYGIAN, prog: [0, 1, 5, 4], drums: 'metal', lead: 'sawtooth', seed: 53 },
  { name: 'Menu', bpm: 112, root: 50, scale: DORIAN, prog: [0, 5, 2, 4], drums: 'soft', lead: 'triangle', seed: 7 },
];

const DRUMS = {
  rock: { kick: [0, 6, 8, 11], snare: [4, 12], hat: 2 },
  taiko: { kick: [0, 3, 8, 10, 14], snare: [4, 12], hat: 4 },
  electro: { kick: [0, 4, 8, 12], snare: [4, 12], hat: 1 },
  metal: { kick: [0, 2, 3, 6, 8, 10, 11, 14], snare: [4, 12], hat: 2 },
  soft: { kick: [0, 10], snare: [8], hat: 4 },
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.themeIndex = -1;
    this.pendingTheme = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.lastPlay = new Map();
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    // Réverbération (réponse impulsionnelle générée)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(this.reverb).connect(this.master);
    // Écho pour la mélodie
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.3;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.musicBus);
    // Bruit blanc réutilisable
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.pendingTheme !== null) { const t = this.pendingTheme; this.pendingTheme = null; this.music(t); }
    return true;
  }

  makeImpulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const a = this.settings.data.audio;
    this.master.gain.value = a.master;
    this.sfxBus.gain.value = a.sfx;
    this.musicBus.gain.value = a.music * 0.55;
  }

  // --- Briques de synthèse ---------------------------------------------------------------

  env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(type, f0, f1, dur, vol, o = {}) {
    const ctx = this.ctx;
    const t = (o.at ?? ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    this.env(g, t, vol, o.attack ?? 0.005, dur);
    let node = osc.connect(g);
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.ff || 2000;
      node = g.connect(f);
    }
    node.connect(o.bus || this.sfxBus);
    if (o.verb) node.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur, vol, type, f0, f1, o = {}) {
    const ctx = this.ctx;
    const t = (o.at ?? ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, o.attack ?? 0.003, dur);
    src.connect(f).connect(g).connect(o.bus || this.sfxBus);
    if (o.verb) g.connect(this.reverbSend);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // --- Bruitages ---------------------------------------------------------------------------

  play(name) {
    if (!this.ensure()) return;
    // Limite de répétition : un même son ne part pas plus d'une fois toutes les 30 ms
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(name) || -1) < 0.03) return;
    this.lastPlay.set(name, now);
    const T = (...a) => this.tone(...a);
    const N = (...a) => this.noise(...a);
    switch (name) {
      case 'swing': N(0.12, 0.22, 'bandpass', 1200, 3200, { q: 2 }); break;
      case 'hitLight':
        N(0.09, 0.55, 'lowpass', 3500, 800); T('sine', 190, 60, 0.12, 0.6); T('square', 900, 500, 0.025, 0.12); break;
      case 'hitHeavy':
        N(0.28, 0.8, 'lowpass', 2500, 300); T('sine', 130, 38, 0.32, 0.9); T('square', 600, 200, 0.05, 0.15, { verb: true }); break;
      case 'impact':
        N(0.5, 0.9, 'lowpass', 1500, 100, { verb: true }); T('sine', 90, 30, 0.6, 1); break;
      case 'block':
        T('triangle', 1500, 900, 0.1, 0.35); T('triangle', 2300, 1800, 0.08, 0.2); N(0.05, 0.25, 'highpass', 4000, 4000); break;
      case 'jump': T('sine', 280, 620, 0.1, 0.18); N(0.08, 0.1, 'bandpass', 1500, 3000); break;
      case 'dash': N(0.2, 0.35, 'bandpass', 700, 2600, { q: 1.5 }); break;
      case 'teleport': T('sine', 1900, 180, 0.2, 0.25); N(0.12, 0.2, 'highpass', 5000, 2000); break;
      case 'thud': T('sine', 95, 40, 0.25, 0.7); N(0.2, 0.4, 'lowpass', 500, 200); break;
      case 'shot_kiball': T('sine', 950, 280, 0.18, 0.35); T('square', 480, 160, 0.1, 0.08); break;
      case 'shot_bigki': T('sawtooth', 220, 70, 0.6, 0.35, { filter: 'lowpass', ff: 1200 }); N(0.6, 0.3, 'lowpass', 2000, 300); break;
      case 'shot_shuriken': N(0.08, 0.3, 'highpass', 5000, 3000); T('triangle', 2400, 1800, 0.09, 0.15); break;
      case 'shot_crescent': N(0.32, 0.45, 'bandpass', 3500, 500, { q: 3 }); T('sine', 1200, 300, 0.25, 0.15); break;
      case 'shot_fireball': N(0.45, 0.45, 'lowpass', 600, 1800); T('sine', 160, 90, 0.3, 0.3); break;
      case 'shot_iceshard': T('triangle', 2400, 3300, 0.15, 0.25); T('sine', 3600, 3600, 0.25, 0.1, { verb: true }); break;
      case 'shot_airfist': N(0.22, 0.6, 'lowpass', 900, 200); T('sine', 170, 55, 0.22, 0.6); break;
      case 'shot_spiritorb': T('sine', 600, 900, 0.3, 0.25, { verb: true }); T('sine', 1200, 1350, 0.3, 0.1, { verb: true }); break;
      case 'shot_palmwave': N(0.38, 0.5, 'bandpass', 500, 1200, { q: 1.5 }); T('sine', 220, 110, 0.35, 0.35); break;
      case 'beam': {
        const dur = 1.9;
        T('sawtooth', 110, 105, dur, 0.18, { filter: 'lowpass', ff: 1400, attack: 0.15 });
        T('sawtooth', 111.5, 108, dur, 0.18, { filter: 'lowpass', ff: 1400, attack: 0.15 });
        T('square', 55, 54, dur, 0.12, { filter: 'lowpass', ff: 600, attack: 0.15 });
        N(dur, 0.45, 'bandpass', 1500, 600, { attack: 0.2, q: 0.8 });
        break;
      }
      case 'shockwave': T('sine', 70, 28, 0.7, 0.9); N(0.7, 0.7, 'lowpass', 400, 100, { verb: true }); break;
      case 'explosion': N(0.8, 0.8, 'lowpass', 1400, 150, { verb: true }); T('sine', 85, 30, 0.6, 0.8); break;
      case 'bigExplosion':
        N(1.6, 1, 'lowpass', 2000, 80, { verb: true }); T('sine', 70, 22, 1.4, 1); T('sawtooth', 50, 30, 0.8, 0.3, { filter: 'lowpass', ff: 300 }); break;
      case 'cast': T('sine', 500, 1100, 0.25, 0.2, { verb: true }); T('triangle', 1500, 2200, 0.15, 0.08); break;
      case 'ice':
        [1800, 2400, 3200].forEach((f, i) => T('triangle', f, f * 1.02, 0.35, 0.18, { delay: i * 0.03, verb: true }));
        N(0.12, 0.35, 'highpass', 3000, 6000); break;
      case 'fire': N(0.55, 0.55, 'bandpass', 900, 500, { q: 0.7 }); T('sine', 120, 70, 0.4, 0.3); break;
      case 'meteorFall': N(1.25, 0.6, 'lowpass', 200, 1800, { attack: 0.8 }); T('sawtooth', 200, 70, 1.25, 0.15, { filter: 'lowpass', ff: 600, attack: 0.6 }); break;
      case 'summon': [880, 1320, 1760, 2640].forEach((f, i) => T('sine', f, f, 0.5, 0.14, { delay: i * 0.06, verb: true })); break;
      case 'dragon':
        T('sawtooth', 80, 170, 1.2, 0.25, { filter: 'lowpass', ff: 900, attack: 0.3 });
        N(1.2, 0.4, 'bandpass', 300, 1500, { q: 2, attack: 0.3 });
        [660, 990, 1320].forEach((f, i) => T('sine', f, f, 0.8, 0.1, { delay: 0.2 + i * 0.1, verb: true })); break;
      case 'charge': T('sawtooth', 90, 380, 0.9, 0.18, { filter: 'lowpass', ff: 1500, attack: 0.3 }); N(0.9, 0.2, 'bandpass', 400, 2000, { attack: 0.3 }); break;
      case 'chargeHum': T('sawtooth', 110, 116, 0.38, 0.08, { filter: 'lowpass', ff: 900, attack: 0.05 }); N(0.38, 0.12, 'bandpass', 900, 1300); break;
      case 'specialStart': T('sine', 300, 950, 0.22, 0.22); T('triangle', 1200, 2400, 0.25, 0.08, { verb: true }); break;
      case 'ultStart': N(0.3, 0.35, 'highpass', 1000, 6000); break;
      case 'ultCharge':
        N(1.3, 0.5, 'highpass', 300, 6000, { attack: 1.0 });
        [0, 4, 7].forEach((s) => T('sawtooth', midiHz(45 + s), midiHz(57 + s), 1.3, 0.09, { filter: 'lowpass', ff: 2500, attack: 0.9 }));
        T('sine', 2000, 2000, 1.2, 0.05, { verb: true, attack: 0.05 }); break;
      case 'ultRelease': T('sine', 65, 25, 0.9, 1); N(0.7, 0.8, 'lowpass', 3000, 200, { verb: true }); break;
      case 'ko':
        T('sine', 75, 22, 1.4, 1); N(1.8, 0.9, 'lowpass', 1800, 80, { verb: true });
        [523, 659, 784].forEach((f) => T('triangle', f, f, 1.6, 0.08, { verb: true, attack: 0.02 })); break;
      case 'round': T('square', 440, 440, 0.15, 0.15); T('square', 660, 660, 0.3, 0.15, { delay: 0.16 }); break;
      case 'fight':
        [0, 4, 7, 12].forEach((s) => T('sawtooth', midiHz(57 + s), midiHz(57 + s), 0.6, 0.1, { filter: 'lowpass', ff: 3000, verb: true }));
        N(0.3, 0.5, 'lowpass', 3000, 300); T('sine', 110, 40, 0.4, 0.8); break;
      case 'roundWin': [0, 4, 7, 12, 16].forEach((s, i) => T('triangle', midiHz(64 + s), midiHz(64 + s), 0.4, 0.14, { delay: i * 0.08, verb: true })); break;
      case 'transform':
        T('sawtooth', 100, 600, 0.6, 0.2, { filter: 'lowpass', ff: 2500 }); N(0.9, 0.7, 'lowpass', 3000, 200, { delay: 0.1, verb: true });
        T('sine', 80, 30, 0.8, 0.9, { delay: 0.1 }); break;
      case 'guardBreak': N(0.3, 0.6, 'highpass', 2500, 8000); T('triangle', 3000, 900, 0.3, 0.3); break;
      case 'denied': T('square', 220, 200, 0.07, 0.12); T('square', 180, 160, 0.09, 0.12, { delay: 0.09 }); break;
      case 'clash': T('triangle', 2600, 2500, 0.18, 0.25); T('triangle', 3700, 3600, 0.14, 0.15); N(0.1, 0.4, 'highpass', 3000, 3000); break;
      case 'ui_move': T('sine', 1300, 1300, 0.035, 0.08); break;
      case 'ui_ok': T('sine', 800, 1250, 0.09, 0.16); T('triangle', 1600, 2500, 0.08, 0.05); break;
      case 'ui_back': T('sine', 650, 380, 0.09, 0.14); break;
      case 'ui_start': [0, 7, 12, 19].forEach((s, i) => T('square', midiHz(62 + s), midiHz(62 + s), 0.2, 0.07, { delay: i * 0.05, verb: true })); break;
      default:
        if (name.startsWith('shot_')) this.play('cast');
        break;
    }
  }

  // --- Musique ---------------------------------------------------------------------------

  /** Lance un thème (index d'arène, ou 'menu'), ou coupe la musique avec null. */
  music(theme) {
    const idx = theme === 'menu' ? 5 : theme;
    if (!this.ctx) { this.pendingTheme = theme; return; }
    if (idx === this.themeIndex) return;
    this.themeIndex = idx;
    clearInterval(this.timer);
    this.timer = null;
    if (idx === null || idx === undefined || !THEMES[idx]) return;
    // Petit fondu pour éviter les coupures sèches
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(this.settings.data.audio.music * 0.55, t + 1.2);
    this.theme = this.compose(THEMES[idx]);
    this.step = 0;
    this.nextTime = t + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** Prépare 4 mesures : accords, ligne de basse et mélodie (déterministes pour un thème). */
  compose(th) {
    const r = rng(th.seed);
    const sc = th.scale;
    const note = (deg, oct = 0) => th.root + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
    const bars = th.prog.map((deg) => {
      const chord = [note(deg), note(deg + 2), note(deg + 4)];
      const lead = [];
      let cur = deg + 7 + Math.floor(r() * 3) * 2;
      for (let s = 0; s < 16; s++) {
        const play = th.drums === 'soft' ? s % 4 === 0 || r() < 0.2 : s % 2 === 0 ? r() < 0.75 : r() < 0.3;
        if (play) {
          cur += Math.floor(r() * 5) - 2;
          cur = Math.max(deg + 4, Math.min(deg + 14, cur));
          lead.push({ s, m: note(cur, 1), len: r() < 0.3 ? 2 : 1 });
        }
      }
      const bass = [];
      for (let s = 0; s < 16; s++) {
        if (th.drums === 'soft' ? s % 8 === 0 : s % 2 === 0 || r() < 0.2) bass.push({ s, m: note(deg, -1) + (s % 8 === 6 && r() < 0.5 ? 7 : 0) });
      }
      return { chord, lead, bass };
    });
    return { ...th, bars, stepDur: 60 / th.bpm / 4 };
  }

  schedule() {
    const ctx = this.ctx;
    const th = this.theme;
    if (!th) return;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += th.stepDur;
      this.step++;
    }
  }

  playStep(step, t) {
    const th = this.theme;
    const s = step % 16;
    const barIdx = Math.floor(step / 16) % th.bars.length;
    const bar = th.bars[barIdx];
    const section = Math.floor(step / 64) % 4; // variation : la mélodie se tait une section sur quatre
    const dr = DRUMS[th.drums];
    const bus = this.musicBus;
    const sd = th.stepDur;
    // Batterie
    if (dr.kick.includes(s)) {
      this.tone('sine', 150, 42, 0.22, th.drums === 'soft' ? 0.4 : 0.85, { at: t, bus });
      if (th.drums === 'taiko') this.noise(0.18, 0.25, 'lowpass', 300, 120, { at: t, bus });
    }
    if (dr.snare.includes(s)) {
      this.noise(0.16, th.drums === 'soft' ? 0.15 : 0.45, 'bandpass', 1900, 1400, { at: t, bus, q: 0.8 });
      this.tone('triangle', 210, 160, 0.08, 0.25, { at: t, bus });
    }
    if (s % dr.hat === 0) this.noise(s % 8 === 6 ? 0.12 : 0.035, 0.12, 'highpass', 8000, 8000, { at: t, bus });
    if (th.drums === 'metal' && s === 15) this.noise(0.4, 0.25, 'highpass', 5000, 3000, { at: t, bus });
    // Basse
    for (const b of bar.bass) {
      if (b.s === s) this.tone('sawtooth', midiHz(b.m), midiHz(b.m), sd * 1.6, 0.22, { at: t, bus, filter: 'lowpass', ff: 520 });
    }
    // Nappe (début de mesure)
    if (s === 0) {
      for (const m of bar.chord) {
        this.tone('sawtooth', midiHz(m + 12), midiHz(m + 12), sd * 15, 0.035, { at: t, bus, filter: 'lowpass', ff: 1100, attack: 0.25, detune: 7 });
        this.tone('sawtooth', midiHz(m + 12), midiHz(m + 12), sd * 15, 0.035, { at: t, bus, filter: 'lowpass', ff: 1100, attack: 0.25, detune: -7 });
      }
    }
    // Mélodie
    if (section !== 3) {
      for (const n of bar.lead) {
        if (n.s !== s) continue;
        const f = midiHz(n.m);
        this.tone(th.lead, f, f, sd * n.len * 1.1, th.lead === 'sawtooth' ? 0.06 : 0.09, { at: t, bus: this.delay, filter: 'lowpass', ff: 2600 });
        this.tone(th.lead, f, f, sd * n.len * 1.1, th.lead === 'sawtooth' ? 0.06 : 0.09, { at: t, bus, filter: 'lowpass', ff: 2600 });
      }
    } else if (s % 2 === 0) {
      // Section d'arpège
      const m = bar.chord[(s / 2) % 3] + 24;
      this.tone('triangle', midiHz(m), midiHz(m), sd * 0.9, 0.06, { at: t, bus: this.delay });
    }
  }

  stopMusic() {
    this.music(null);
  }
}
