'use strict';
// ============================================================
//  Audio 8-bit (Web Audio API) : bruitages et musiques synthétisés.
//  Toutes les mélodies sont des compositions originales, écrites pour
//  évoquer l'ambiance de chaque zone et de chaque boss.
// ============================================================
const Snd = (() => {
  let ac = null, master, sfx, mus, noiseBuf, delayIn, delayNode;
  const waves = {};
  const last = {};
  let muted = false, cur = null, wanted = null;

  function gain(v, dest) { const n = ac.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n; }
  function pulse(d) {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
    return ac.createPeriodicWave(re, im);
  }
  function organ() {
    const n = 12, re = new Float32Array(n), im = new Float32Array(n);
    [0, 1, 0.5, 0.3, 0.25, 0, 0.12, 0, 0.08].forEach((v, k) => { im[k] = v; });
    return ac.createPeriodicWave(re, im);
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = gain(muted ? 0 : 0.8);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);
    sfx = gain(0.75, master); mus = gain(0.5, master);
    delayNode = ac.createDelay(1); delayNode.delayTime.value = 0.36;
    const fb = gain(0.28), wet = gain(0.3, mus);
    delayIn = gain(1); delayIn.connect(delayNode); delayNode.connect(fb); fb.connect(delayNode); delayNode.connect(wet);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    waves.p12 = pulse(0.125); waves.p25 = pulse(0.25); waves.p50 = pulse(0.5); waves.organ = organ();
    setInterval(tick, 25);
    if (wanted) { const w = wanted; wanted = null; music(w); }
  }

  function tone(f, dur, o = {}) {
    const t = o.t ?? ac.currentTime;
    const osc = ac.createOscillator();
    const w = o.w || 'p50';
    if (waves[w]) osc.setPeriodicWave(waves[w]); else osc.type = w;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.toT ?? dur));
    if (o.vib) {
      const l = ac.createOscillator(); l.frequency.value = o.vib[0];
      const lg = gain(0); l.connect(lg); lg.connect(osc.frequency);
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib[1], t + Math.min(0.25, dur * 0.6));
      l.start(t); l.stop(t + dur + 0.05);
    }
    const g = ac.createGain(), v = o.v ?? 0.2, a = o.a ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.decay) g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    else {
      const r = o.r ?? 0.02;
      g.gain.setValueAtTime(v, t + Math.max(a, dur - r));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    if (o.lp) { const bq = ac.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = o.lp; osc.connect(bq); bq.connect(g); }
    else osc.connect(g);
    g.connect(o.bus || sfx);
    if (o.send) g.connect(o.send);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function nz(dur, o = {}) {
    const t = o.t ?? ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    let node = s;
    if (o.f) {
      const bq = ac.createBiquadFilter(); bq.type = o.ft || 'lowpass';
      bq.frequency.setValueAtTime(o.f, t);
      if (o.fTo) bq.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
      bq.Q.value = o.q ?? 0.7; s.connect(bq); node = bq;
    }
    const g = ac.createGain(), v = o.v ?? 0.2, a = o.a ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g); g.connect(o.bus || sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function busy(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return true;
    last[name] = now; return false;
  }

  // ---------- Voix (une par personnage) ----------
  const VOICES = {
    text: [600, 0.035, 'p50', 0.05], narr: [600, 0.035, 'p50', 0.05],
    sans: [190, 0.05, 'p50', 0.1, 170], papyrus: [330, 0.05, 'square', 0.07, 290], toriel: [260, 0.06, 'triangle', 0.16],
    undyne: [160, 0.05, 'p25', 0.12], asgore: [110, 0.08, 'triangle', 0.2], flowey: [520, 0.04, 'p25', 0.08, 600],
    evil: [140, 0.07, 'sawtooth', 0.08, 110], mettaton: [420, 0.04, 'p12', 0.08], alphys: [480, 0.04, 'triangle', 0.12],
    asriel: [300, 0.06, 'triangle', 0.14], monster: [380, 0.04, 'p25', 0.06], deep: [98, 0.08, 'p50', 0.12],
    temmie: [700, 0.03, 'p12', 0.07, 900], napsta: [220, 0.08, 'sine', 0.12, 200], muffet: [560, 0.04, 'p25', 0.07, 500],
    gaster: [80, 0.1, 'sawtooth', 0.06], kid: [450, 0.04, 'p25', 0.07],
  };
  // ---------- Effets ----------
  const fx = {
    voice(v) {
      const p = VOICES[v] || VOICES.text;
      if (v === 'temmie' || v === 'gaster') tone(p[0] * (0.8 + Math.random() * 0.5), p[1], { w: p[2], v: p[3] });
      else tone(p[0] * (0.97 + Math.random() * 0.06), p[1], { w: p[2], v: p[3], to: p[4] });
    },
    move() { tone(1046, 0.035, { w: 'p50', v: 0.05 }); },
    select() { const t = ac.currentTime; tone(784, 0.04, { w: 'p50', v: 0.06, t }); tone(1568, 0.06, { w: 'p50', v: 0.05, t: t + 0.04 }); },
    beep() { tone(1318, 0.06, { w: 'p50', v: 0.1 }); },
    alert() { const t = ac.currentTime; tone(1568, 0.08, { w: 'p25', v: 0.1, t }); tone(2093, 0.12, { w: 'p25', v: 0.1, t: t + 0.08 }); },
    whoosh() { nz(0.28, { ft: 'bandpass', f: 500, fTo: 2600, v: 0.18, q: 1.2 }); },
    dodge() { nz(0.25, { ft: 'bandpass', f: 1200, fTo: 400, v: 0.12, q: 1 }); },
    hurt() { if (busy('hurt', 75)) return; nz(0.08, { f: 2000, v: 0.3 }); tone(150, 0.08, { w: 'square', to: 70, v: 0.12 }); },
    heal() { const t = ac.currentTime; [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.09, { w: 'p25', v: 0.08, t: t + i * 0.05 })); },
    slash() { nz(0.32, { ft: 'bandpass', f: 4500, fTo: 350, q: 2, v: 0.4 }); tone(1200, 0.22, { w: 'sawtooth', to: 160, v: 0.05 }); },
    damage() { nz(0.25, { f: 3000, fTo: 300, v: 0.5 }); tone(160, 0.22, { w: 'p25', to: 64, v: 0.25 }); tone(90, 0.2, { w: 'square', to: 45, v: 0.12, t: ac.currentTime + 0.05 }); },
    blCharge() { if (busy('blc', 50)) return; tone(240, 0.48, { w: 'sawtooth', to: 1300, v: 0.06, vib: [30, 50] }); tone(480, 0.48, { w: 'p25', to: 1900, v: 0.03 }); },
    blFire() { if (busy('blf', 50)) return; nz(0.8, { f: 6000, fTo: 700, v: 0.42 }); tone(75, 0.75, { w: 'sawtooth', to: 42, v: 0.2, decay: true }); tone(150, 0.5, { w: 'square', to: 85, v: 0.06, decay: true }); },
    warn() { if (busy('warn', 60)) return; const t = ac.currentTime; tone(1760, 0.05, { w: 'p25', v: 0.07, t }); tone(1760, 0.05, { w: 'p25', v: 0.07, t: t + 0.09 }); },
    stab() { if (busy('stab', 50)) return; nz(0.13, { ft: 'highpass', f: 1500, v: 0.22 }); tone(330, 0.1, { w: 'square', to: 900, v: 0.07 }); },
    slam() { if (busy('slam', 60)) return; tone(140, 0.32, { w: 'sine', to: 34, v: 0.75, decay: true }); nz(0.2, { f: 700, v: 0.45 }); },
    ding() { tone(1568, 0.6, { w: 'triangle', v: 0.14, decay: true }); tone(2093, 0.4, { w: 'sine', v: 0.06, decay: true }); },
    crack() { nz(0.09, { ft: 'highpass', f: 2500, v: 0.35 }); tone(700, 0.13, { w: 'square', to: 170, v: 0.12 }); },
    shatter() { const t = ac.currentTime; for (let i = 0; i < 10; i++) tone(1500 + Math.random() * 2200, 0.06, { w: 'p25', v: 0.045, t: t + i * 0.022 }); nz(0.45, { ft: 'highpass', f: 4000, v: 0.12 }); },
    bigHit() { nz(0.7, { f: 3000, fTo: 150, v: 0.6 }); tone(95, 0.7, { w: 'square', to: 28, v: 0.28, decay: true }); },
    dust() { nz(1.8, { ft: 'bandpass', f: 3500, fTo: 400, v: 0.16, a: 0.4, q: 0.6 }); },
    spare() { const t = ac.currentTime; nz(0.5, { ft: 'highpass', f: 3000, v: 0.12 }); tone(880, 0.25, { w: 'triangle', to: 1760, v: 0.08, t }); },
    flee() { const t = ac.currentTime; [784, 659, 523, 392].forEach((f, i) => tone(f, 0.05, { w: 'p50', v: 0.06, t: t + i * 0.04 })); },
    cymbal() { nz(2.2, { ft: 'highpass', f: 5000, fTo: 9000, v: 0.2, a: 1.2 }); },
    block() { tone(1760, 0.3, { w: 'triangle', v: 0.3, decay: true }); tone(2640, 0.2, { w: 'sine', v: 0.12, decay: true }); nz(0.05, { ft: 'highpass', f: 7000, v: 0.12 }); },
    spear() { if (busy('spear', 40)) return; tone(2200, 0.08, { w: 'sine', to: 3500, v: 0.05 }); nz(0.08, { ft: 'highpass', f: 6000, v: 0.08 }); },
    soul() { tone(660, 0.7, { w: 'sine', v: 0.3, decay: true }); tone(990, 0.5, { w: 'sine', v: 0.15, decay: true }); tone(1320, 0.4, { w: 'triangle', v: 0.07, decay: true }); },
    levelup() { const t = ac.currentTime; [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.07, { w: 'p25', v: 0.09, t: t + i * 0.07 })); },
    save() { const t = ac.currentTime; [784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, { w: 'triangle', v: 0.12, t: t + i * 0.08, decay: true })); },
    door() { nz(0.25, { f: 900, fTo: 200, v: 0.25 }); tone(120, 0.2, { w: 'triangle', to: 80, v: 0.2 }); },
    fire() { if (busy('fire', 60)) return; nz(0.25, { ft: 'bandpass', f: 900, fTo: 300, v: 0.12, q: 0.8 }); },
    laser() { if (busy('laser', 60)) return; tone(1800, 0.2, { w: 'sawtooth', to: 300, v: 0.05 }); },
    shoot() { if (busy('shoot', 40)) return; tone(1400, 0.06, { w: 'p25', to: 700, v: 0.06 }); },
    coin() { const t = ac.currentTime; tone(1318, 0.06, { w: 'p50', v: 0.07, t }); tone(1760, 0.12, { w: 'p50', v: 0.07, t: t + 0.06 }); },
    ring() { const t = ac.currentTime; for (let i = 0; i < 6; i++) tone(i % 2 ? 1318 : 1568, 0.07, { w: 'p50', v: 0.05, t: t + i * 0.08 }); },
    squeak() { tone(1400, 0.08, { w: 'sine', to: 2200, v: 0.1 }); },
    bark() { tone(420, 0.09, { w: 'square', to: 260, v: 0.1, lp: 1500 }); },
    splash() { nz(0.35, { ft: 'bandpass', f: 1200, fTo: 400, v: 0.2, q: 0.5 }); },
    bell() { tone(880, 1.2, { w: 'sine', v: 0.18, decay: true }); tone(1760, 0.8, { w: 'sine', v: 0.06, decay: true }); },
    rumble() { nz(1.4, { f: 300, fTo: 80, v: 0.35 }); tone(55, 1.3, { w: 'sawtooth', v: 0.08, lp: 300, decay: true }); },
    noise() { nz(0.6, { ft: 'bandpass', f: 2000, v: 0.2, q: 0.3 }); },
    glitch() { const t = ac.currentTime; for (let i = 0; i < 8; i++) tone(200 + Math.random() * 1800, 0.04, { w: 'square', v: 0.05, t: t + i * 0.03 }); },
    laugh() { const t = ac.currentTime; for (let i = 0; i < 6; i++) tone(300 - i * 20, 0.06, { w: 'sawtooth', v: 0.06, t: t + i * 0.09, lp: 1800 }); },
  };

  // ---------- Musique ----------
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  }
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  // Accords : « Dm », « F# », « Bb7 », « Cdim », « Gsus »
  function chord(name) {
    const m = /^([A-G])(#|b)?(m|7|m7|dim|sus|maj7)?$/.exec(name);
    const r = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const q = m[3] || '';
    const iv = q === 'm' ? [0, 3, 7] : q === 'dim' ? [0, 3, 6] : q === 'sus' ? [0, 5, 7] : q === '7' ? [0, 4, 10] : q === 'm7' ? [0, 3, 10] : q === 'maj7' ? [0, 4, 11] : [0, 4, 7];
    const root = 36 + r; // octave 2
    return [root, iv.map(i => 60 + r + i - (r > 6 ? 12 : 0))];
  }
  // Mélodie : « D5:2 r:1 A5:1 » (durées en doubles croches)
  function parseMel(str) {
    const out = []; let p = 0;
    if (!str) return out;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, l] = tok.split(':'); const len = +(l || 1);
      if (n !== 'r') out.push({ s: p, m: midi(n), len });
      p += len;
    }
    return out;
  }
  // Mélodie en pas : « D5 - - . A4 - » (- = tenue, . = silence)
  function parseSteps(str) {
    const tk = str.trim().split(/\s+/), out = [];
    for (let i = 0; i < tk.length; i++) {
      if (tk[i] === '.' || tk[i] === '-') continue;
      let n = 1; while (tk[i + n] === '-') n++;
      out.push({ s: i, m: midi(tk[i]), len: n });
    }
    return out;
  }
  function song(def) {
    const bars = def.bars.map(b => {
      const o = Array.isArray(b) ? { ch: b[0], mel: b[1], dr: b[2], arp: b[3] } : b;
      const mel = o.steps ? parseSteps(o.steps) : parseMel(o.mel);
      return { ...o, chName: o.ch, ch: chord(o.ch), mel, dr: o.dr || def.dr || 'none', arp: o.arp ?? def.arp ?? false };
    });
    return { ...def, bars, total: bars.length * 16, loopStep: (def.loop || 0) * 16 };
  }
  const rep = (arr, n) => Array.from({ length: n }, () => arr).flat();

  // ---------- Partitions (originales) ----------
  const S = {};
  // Écran titre / souvenirs
  S.title = song({ bpm: 84, bass: 'hold', lead: 'box', bars: [
    ['F', 'A5:4 C6:4 A5:2 G5:2 F5:4'], ['C', 'G5:4 E5:4 C5:4 E5:4'], ['Dm', 'F5:4 A5:4 D6:4 C6:2 A5:2'], ['Bb', 'Bb5:6 A5:2 G5:4 F5:4'],
    ['F', 'A5:4 C6:4 F6:4 E6:2 C6:2'], ['C', 'D6:4 C6:4 G5:8'], ['Bb', 'F5:4 G5:4 A5:4 Bb5:4'], ['C', 'A5:6 G5:2 E5:8'],
  ] });
  // Chute et rencontre avec la fleur : petite ritournelle sautillante
  S.flowey = song({ bpm: 112, bass: 'oct', lead: 'box', dr: 'none', bars: [
    ['C', 'E5:2 G5:2 C6:2 G5:2 E5:2 G5:2 C6:4'], ['G', 'D5:2 G5:2 B5:2 G5:2 D5:2 G5:2 B5:4'],
    ['Am', 'C5:2 E5:2 A5:2 E5:2 C5:2 E5:2 A5:4'], ['F', 'F5:2 A5:2 C6:2 A5:2 G5:4 r:4'],
  ] });
  // Ruines : mystérieuses, arpèges lents
  S.ruins = song({ bpm: 88, bass: 'half', lead: 'soft', arp: true, bars: [
    ['Am', 'E5:6 D5:2 C5:4 B4:4'], ['F', 'C5:6 D5:2 E5:8'], ['G', 'D5:6 C5:2 B4:4 G4:4'], ['E', 'G#4:8 B4:8'],
    ['Am', 'A5:6 G5:2 E5:4 C5:4'], ['Dm', 'D5:4 F5:4 A5:8'], ['F', 'G5:4 F5:4 E5:4 D5:4'], ['E', 'E5:12 r:4'],
  ] });
  // Maison de Toriel : douce et chaleureuse
  S.home = song({ bpm: 76, bass: 'hold', lead: 'box', bars: [
    ['F', 'C5:4 F5:4 A5:6 G5:2'], ['Bb', 'F5:4 D5:4 F5:8'], ['C', 'E5:4 G5:4 C6:6 Bb5:2'], ['F', 'A5:12 r:4'],
    ['Dm', 'A5:4 F5:4 D5:6 E5:2'], ['Bb', 'F5:4 G5:4 A5:4 Bb5:4'], ['C', 'C6:4 Bb5:4 A5:4 G5:4'], ['F', 'F5:12 r:4'],
  ] });
  // Combat ordinaire
  S.battle = song({ bpm: 150, bass: 'drive', lead: 'battle', dr: 'full', loop: 0, bars: [
    ['Em', 'E5:2 G5:2 B5:2 A5:2 G5:2 F#5:2 G5:4'], ['C', 'E5:2 G5:2 C6:2 B5:2 A5:2 G5:2 A5:4'],
    ['D', 'F#5:2 A5:2 D6:2 C6:2 B5:2 A5:2 B5:4'], ['B', 'D#5:2 F#5:2 B5:4 A5:2 F#5:2 D#5:4'],
    ['Em', 'G5:3 F#5:1 E5:2 B4:2 E5:2 G5:2 B5:4'], ['Am', 'C6:3 B5:1 A5:2 E5:2 A5:2 C6:2 E6:4'],
    ['D', 'D6:2 C6:2 B5:2 A5:2 G5:2 A5:2 B5:4', 'fill'], ['B', 'B5:4 A5:2 G5:2 F#5:4 D#5:4', 'roll'],
  ] });
  // Toriel : tourmentée et rapide
  S.toriel = song({ bpm: 164, bass: 'drive', lead: 'battle', dr: 'drive', arp: true, bars: [
    ['Bm', 'B5:2 F#5:2 D5:2 F#5:2 B5:2 C#6:2 D6:4'], ['G', 'D6:2 B5:2 G5:2 B5:2 D6:2 E6:2 F#6:4'],
    ['A', 'E6:2 C#6:2 A5:2 C#6:2 E6:4 D6:2 C#6:2'], ['F#', 'C#6:4 A#5:4 F#5:8'],
    ['Bm', 'D6:4 C#6:2 B5:2 F#5:4 B5:4'], ['Em', 'G5:4 B5:2 E6:2 D6:4 B5:4'],
    ['G', 'B5:2 C#6:2 D6:2 E6:2 F#6:4 E6:4', 'fill'], ['F#', 'F#6:8 r:4 F#5:4', 'roll'],
  ] });
  // Forêt enneigée
  S.snowy = song({ bpm: 104, bass: 'oct', lead: 'bell', dr: 'light', bars: [
    ['G', 'B5:4 D6:4 G6:4 F#6:2 D6:2'], ['C', 'E6:4 C6:4 G5:8'], ['Em', 'G5:4 B5:4 E6:4 D6:2 B5:2'], ['D', 'A5:4 F#5:4 D5:8'],
    ['G', 'B5:2 C6:2 D6:4 B5:4 G5:4'], ['C', 'C6:2 D6:2 E6:4 G6:4 E6:4'], ['Am', 'D6:4 C6:4 B5:4 A5:4'], ['D', 'A5:8 D6:8'],
  ] });
  // Village de Snowdin : chaleureux, cloches
  S.snowdin = song({ bpm: 96, bass: 'waltz', lead: 'bell', dr: 'light', arp: true, bars: [
    ['C', 'G5:4 E5:2 G5:2 C6:4 B5:2 A5:2'], ['F', 'A5:4 F5:2 A5:2 C6:8'], ['G', 'B5:4 G5:2 B5:2 D6:4 C6:2 B5:2'], ['C', 'C6:8 G5:8'],
    ['Am', 'E6:4 C6:2 E6:2 A6:4 G6:2 E6:2'], ['F', 'F6:4 E6:2 D6:2 C6:8'], ['Dm', 'D6:4 C6:2 A5:2 F5:4 A5:4'], ['G', 'G5:8 B5:4 D6:4'],
  ] });
  // Chiens de garde : rengaine idiote
  S.dogs = song({ bpm: 132, bass: 'oct', lead: 'square', dr: 'light', bars: [
    ['F', 'F5:2 F5:2 A5:2 C6:2 A5:2 F5:2 G5:4'], ['C', 'E5:2 E5:2 G5:2 C6:2 G5:2 E5:2 F5:4'],
    ['F', 'F5:2 A5:2 C6:2 F6:2 E6:2 C6:2 A5:4'], ['C7', 'G5:2 Bb5:2 C6:2 E6:2 D6:2 C6:2 F5:4'],
  ] });
  // Papyrus : grandiloquent et fanfaron
  S.papyrus = song({ bpm: 152, bass: 'drive', lead: 'battle', dr: 'full', bars: [
    ['Dm', 'D5:2 D5:1 D5:1 A5:4 G#5:2 G5:2 F5:4'], ['C', 'C5:2 C5:1 C5:1 G5:4 F#5:2 F5:2 E5:4'],
    ['Bb', 'Bb4:2 Bb4:1 Bb4:1 F5:4 E5:2 Eb5:2 D5:4'], ['A', 'A4:2 C#5:2 E5:2 A5:2 G5:2 E5:2 C#5:4'],
    ['Dm', 'F5:2 A5:2 D6:4 C6:2 A5:2 F5:4'], ['C', 'E5:2 G5:2 C6:4 Bb5:2 G5:2 E5:4'],
    ['Bb', 'D6:2 C6:2 Bb5:2 A5:2 G5:2 A5:2 Bb5:4', 'fill'], ['A', 'A5:4 C#6:4 E6:4 A6:4', 'roll'],
  ] });
  // Waterfall : calme, écho
  S.waterfall = song({ bpm: 80, bass: 'half', lead: 'soft', arp: true, bars: [
    ['Cm', 'G5:6 Eb5:2 C5:8'], ['Ab', 'Ab5:6 G5:2 Eb5:8'], ['Eb', 'G5:4 Bb5:4 Eb6:6 D6:2'], ['Bb', 'D6:8 Bb5:8'],
    ['Cm', 'C6:6 Bb5:2 G5:4 Eb5:4'], ['Fm', 'F5:4 Ab5:4 C6:8'], ['Ab', 'Eb6:4 D6:4 C6:4 Bb5:4'], ['G', 'B5:12 r:4'],
  ] });
  // Undyne : héroïque
  S.undyne = song({ bpm: 154, bass: 'drive', lead: 'battle', dr: 'drive', bars: [
    ['Cm', 'C5:2 Eb5:2 G5:2 C6:4 Bb5:2 G5:2 Ab5:2'], ['Ab', 'Ab5:4 G5:2 F5:2 Eb5:4 C5:4'],
    ['Bb', 'D5:2 F5:2 Bb5:2 D6:4 C6:2 Bb5:2 C6:2'], ['G', 'B5:4 D6:4 G6:8'],
    ['Cm', 'G6:3 F6:1 Eb6:2 D6:2 C6:2 G5:2 C6:4'], ['Fm', 'F6:3 Eb6:1 D6:2 C6:2 Ab5:2 F5:2 C6:4'],
    ['Ab', 'Eb6:2 F6:2 G6:4 Ab6:4 G6:4', 'fill'], ['G', 'G6:4 F6:4 D6:4 B5:4', 'roll'],
  ] });
  // Undyne l'Immortelle (repris du fan game précédent)
  S.undying = song({ bpm: 156, bass: 'drive', lead: 'battle', dr: 'full', arp: true, bars: [
    { ch: 'Dm', steps: 'D5 - - - A4 - D5 - F5 - - - E5 - D5 -' }, { ch: 'Dm', steps: 'E5 - F5 - G5 - - - A5 - - - - - D5 E5' },
    { ch: 'Bb', steps: 'Bb5 - A5 - G5 - F5 - G5 - - - D5 - - -' }, { ch: 'C', steps: 'C5 - D5 - E5 - G5 - E5 - - - C5 - D5 E5' },
    { ch: 'Dm', steps: 'D5 - - - A4 - D5 - F5 - - - E5 - D5 -' }, { ch: 'Dm', steps: 'A5 - - - G5 - F5 - G5 - A5 - C6 - - -' },
    { ch: 'Bb', steps: 'D6 - - - C6 - Bb5 - A5 - - - G5 - F5 -' }, { ch: 'A', steps: 'E5 - - - C#5 - - - A4 - C#5 - E5 - G5 -', dr: 'fill' },
    { ch: 'Gm', steps: 'G5 . G5 A5 Bb5 - A5 - G5 - D5 - G5 - Bb5 -' }, { ch: 'Gm', steps: 'A5 - - - G5 - F5 - G5 - - - - - D5 F5' },
    { ch: 'Dm', steps: 'F5 . F5 G5 A5 - G5 - F5 - D5 - A5 - D6 -' }, { ch: 'Dm', steps: 'C6 - - - A5 - F5 - A5 - - - - - A5 C6' },
    { ch: 'Bb', steps: 'D6 - C6 - Bb5 - A5 - Bb5 - C6 - D6 - F6 -' }, { ch: 'C', steps: 'E6 - - - D6 - C6 - G5 - - - C6 - E6 -' },
    { ch: 'A', steps: 'E6 - C#6 - A5 - C#6 - E6 - - - A6 - - -' }, { ch: 'A', steps: 'G6 - F6 - E6 - D6 - C#6 - - - A5 - - -', dr: 'roll' },
  ] });
  // Temmie : absurde
  S.temmie = song({ bpm: 140, bass: 'oct', lead: 'box', dr: 'light', bars: [
    ['C', 'C6:1 E6:1 G6:2 E6:2 C6:2 D6:1 E6:1 D6:2 B5:4'], ['F', 'A5:1 C6:1 F6:2 C6:2 A5:2 G5:4 r:4'],
    ['G', 'B5:1 D6:1 G6:2 D6:2 B5:2 C6:1 D6:1 C6:2 A5:4'], ['C', 'G5:2 C6:2 E6:2 G6:2 C6:8'],
  ] });
  // Boutique : jazzy
  S.shop = song({ bpm: 100, bass: 'walk', lead: 'soft', dr: 'swing', bars: [
    ['Fmaj7', 'A5:3 C6:1 E6:4 D6:2 C6:2 A5:4'], ['Dm7', 'F5:3 A5:1 C6:4 A5:2 F5:2 D5:4'],
    ['Gm7', 'Bb5:3 D6:1 F6:4 D6:2 Bb5:2 G5:4'], ['C7', 'E5:3 G5:1 Bb5:4 C6:8'],
  ] });
  // Hotland : moteur qui tourne
  S.hotland = song({ bpm: 132, bass: 'pump', lead: 'bright', dr: 'drive', arp: true, bars: [
    ['Am', 'A5:4 E5:2 A5:2 C6:4 B5:4'], ['F', 'A5:4 F5:2 A5:2 C6:4 D6:4'], ['G', 'D6:4 B5:2 G5:2 B5:4 D6:4'], ['E', 'E6:8 G#5:8'],
    ['Am', 'E6:2 D6:2 C6:2 B5:2 A5:4 E5:4'], ['Dm', 'F5:2 A5:2 D6:2 E6:2 F6:4 E6:4'], ['F', 'C6:2 D6:2 E6:2 F6:2 G6:4 F6:4'], ['E', 'E6:4 D6:4 B5:4 G#5:4', 'fill'],
  ] });
  // Muffet : danse d'araignée, rapide et dansante
  S.muffet = song({ bpm: 170, bass: 'drive', lead: 'battle', dr: 'swing', bars: [
    ['Em', 'E5:1 r:1 B5:2 G5:1 r:1 E5:2 F#5:2 G5:2 A5:2 B5:2'], ['C', 'C6:2 B5:1 A5:1 G5:2 E5:2 G5:4 r:4'],
    ['Am', 'A5:1 r:1 E6:2 C6:1 r:1 A5:2 B5:2 C6:2 D6:2 E6:2'], ['B', 'D#6:2 C6:1 B5:1 A5:2 F#5:2 B5:8'],
    ['Em', 'G6:2 F#6:2 E6:2 B5:2 G5:2 B5:2 E6:4'], ['C', 'E6:2 D6:2 C6:2 G5:2 E5:2 G5:2 C6:4'],
    ['Am', 'C6:2 B5:2 A5:2 E5:2 C5:2 E5:2 A5:4'], ['B', 'B5:4 A5:4 G5:4 F#5:4', 'fill'],
  ] });
  // Mettaton : disco paillettes
  S.mettaton = song({ bpm: 124, bass: 'disco', lead: 'bright', dr: 'disco', bars: [
    ['Gm', 'G5:2 Bb5:2 D6:2 Bb5:2 F6:4 D6:4'], ['Eb', 'Eb6:2 D6:2 C6:2 Bb5:2 G5:4 Bb5:4'],
    ['F', 'A5:2 C6:2 F6:2 C6:2 A6:4 F6:4'], ['D', 'F#6:4 D6:4 A5:4 F#5:4'],
    ['Gm', 'D6:1 D6:1 r:2 Bb5:2 G5:2 D6:2 F6:2 G6:4'], ['Cm', 'Eb6:1 Eb6:1 r:2 C6:2 G5:2 Eb6:2 G6:2 C7:4'],
    ['Eb', 'Bb6:2 G6:2 Eb6:2 Bb5:2 G6:4 F6:4'], ['D', 'F#6:2 A6:2 D7:4 A6:4 F#6:4', 'fill'],
  ] });
  // Core : électronique
  S.core = song({ bpm: 138, bass: 'pump', lead: 'saw', dr: 'drive', arp: true, bars: [
    ['Fm', 'F5:2 Ab5:2 C6:2 F6:2 Eb6:4 C6:4'], ['Db', 'Db6:2 C6:2 Ab5:2 F5:2 Ab5:8'], ['Eb', 'G5:2 Bb5:2 Eb6:2 G6:2 F6:4 Eb6:4'], ['C', 'E6:8 C6:8'],
  ] });
  // Nouvelle Maison : reprise mélancolique du thème titre
  S.newhome = song({ bpm: 64, bass: 'hold', lead: 'soft', bars: [
    ['Dm', 'A5:4 C6:4 A5:2 G5:2 F5:4'], ['Am', 'G5:4 E5:4 C5:4 E5:4'], ['Bb', 'F5:4 A5:4 D6:4 C6:2 A5:2'], ['A', 'C#6:6 A5:2 E5:8'],
  ] });
  // Asgore : solennel et puissant
  S.asgore = song({ bpm: 120, bass: 'drive', lead: 'brass', dr: 'march', bars: [
    ['Dm', 'D5:4 F5:2 A5:2 D6:6 C6:2'], ['Bb', 'Bb5:4 A5:2 G5:2 F5:4 D5:4'], ['C', 'E5:4 G5:2 C6:2 E6:6 D6:2'], ['A', 'C#6:8 A5:8'],
    ['Dm', 'F6:3 E6:1 D6:2 A5:2 F5:2 A5:2 D6:4'], ['Gm', 'G6:3 F6:1 D6:2 Bb5:2 G5:2 Bb5:2 D6:4'],
    ['Bb', 'F6:2 E6:2 D6:2 C6:2 Bb5:2 C6:2 D6:4', 'fill'], ['A', 'E6:4 C#6:4 A5:4 E5:4', 'roll'],
  ] });
  // Flowey Oméga : cauchemar dissonant
  S.omega = song({ bpm: 168, bass: 'drive', lead: 'saw', dr: 'full', arp: true, bars: [
    ['C#m', 'C#6:2 G#5:2 E5:2 G#5:2 C#6:2 D6:2 C#6:4'], ['A', 'A5:2 E5:2 C#5:2 E5:2 A5:2 Bb5:2 A5:4'],
    ['F#m', 'F#5:2 A5:2 C#6:2 F#6:2 F6:2 E6:2 C#6:4'], ['G#', 'G#5:4 C6:4 D#6:4 G#6:4'],
  ] });
  // Asriel : espoir et rêves
  S.asriel = song({ bpm: 144, bass: 'drive', lead: 'battle', dr: 'full', arp: true, bars: [
    ['C', 'E5:4 G5:4 C6:6 B5:2'], ['G', 'B5:4 A5:2 G5:2 D6:8'], ['Am', 'C6:4 E6:4 A6:6 G6:2'], ['F', 'F6:4 E6:2 D6:2 C6:8'],
    ['C', 'G6:3 F6:1 E6:2 C6:2 G5:2 C6:2 E6:4'], ['G', 'D6:3 C6:1 B5:2 G5:2 D5:2 G5:2 B5:4'],
    ['F', 'A5:2 C6:2 F6:4 E6:2 D6:2 C6:4', 'fill'], ['G', 'D6:4 G6:4 B6:8', 'roll'],
  ] });
  // Napstablook : triste et lent
  S.napsta = song({ bpm: 70, bass: 'hold', lead: 'soft', bars: [
    ['Am', 'E5:8 C5:4 A4:4'], ['F', 'F5:8 E5:4 C5:4'], ['C', 'G5:8 E5:4 C5:4'], ['E', 'B4:8 G#4:8'],
  ] });
  // Mannequin furieux : nerveux
  S.dummy = song({ bpm: 168, bass: 'oct', lead: 'square', dr: 'drive', bars: [
    ['Gm', 'G5:1 G5:1 Bb5:2 D6:2 G5:1 G5:1 C6:2 Bb5:2 A5:4'], ['Eb', 'G5:1 G5:1 Bb5:2 Eb6:2 D6:2 C6:2 Bb5:2 G5:4'],
    ['F', 'F5:1 F5:1 A5:2 C6:2 F5:1 F5:1 D6:2 C6:2 A5:4'], ['D', 'F#5:2 A5:2 D6:2 F#6:2 A6:8'],
  ] });
  // Laboratoire secret : inquiétant
  S.lab = song({ bpm: 60, bass: 'hold', lead: 'eerie', bars: [
    ['Cm', 'Eb5:8 D5:8'], ['Ab', 'C5:8 B4:8'], ['Fm', 'Ab4:8 G4:8'], ['G', 'B4:8 D5:8'],
  ] });
  S.amalgam = song({ bpm: 120, bass: 'drive', lead: 'eerie', dr: 'half', arp: true, bars: [
    ['Cm', 'C6:2 B5:2 C6:2 G5:2 Ab5:4 G5:4'], ['Ab', 'Eb6:2 D6:2 Eb6:2 C6:2 B5:4 G5:4'], ['Fm', 'F5:2 Ab5:2 C6:2 F6:2 E6:8'], ['G', 'D6:4 B5:4 G5:4 D5:4'],
  ] });
  // Sans : « Jugement dernier » (repris du fan game précédent)
  const PROG = ['Dm', 'C', 'B', 'Bb'];
  const HOOK = ['F5:1 E5:1 D5:2 A5:2 r:1 A5:1 C6:2 A5:1 G5:1 F5:2 E5:2', 'E5:1 D5:1 C5:2 G5:2 r:1 G5:1 Bb5:2 G5:1 F5:1 E5:2 C5:2',
    'D5:1 C5:1 B4:2 G5:2 r:1 G5:1 B5:2 D6:2 C6:1 B5:1 G5:2', 'D5:2 F5:2 Bb5:2 D6:2 C6:1 Bb5:1 A5:2 G5:2 A5:2'];
  const RUN = 'Bb5:1 A5:1 G5:1 F5:1 E5:1 D5:1 C#5:1 D5:1 E5:1 F5:1 G5:1 A5:1 Bb5:1 C6:1 C#6:2';
  const SOAR = ['D6:6 C6:2 A5:4 F5:4', 'E6:6 D6:2 C6:4 G5:4', 'D6:4 B5:2 G5:2 B5:2 D6:2 G6:4', 'F6:6 E6:2 D6:2 C6:2 Bb5:2 A5:2',
    'A6:4 G6:2 F6:2 E6:2 F6:2 D6:4', 'G6:4 F6:2 E6:2 D6:2 E6:2 C6:4', 'F6:3 E6:1 D6:4 B5:4 G5:4', 'A5:2 Bb5:2 C6:2 D6:2 E6:2 F6:2 G6:2 A6:2'];
  const BREAK = ['A5:2 r:2 A5:2 r:2 G5:2 F5:2 E5:2 D5:2', 'G5:2 r:2 G5:2 r:2 F5:2 E5:2 D5:2 C5:2', 'G5:2 r:2 G5:2 r:2 B5:2 D6:2 C6:2 B5:2', 'D5:2 E5:2 F5:2 G5:2 A5:2 Bb5:2 C6:2 C#6:2'];
  S.sans = song({ bpm: 120, bass: 'drive', lead: 'battle', loop: 4, bars: [
    ...PROG.map((ch, i) => ({ ch, dr: i < 2 ? 'intro1' : 'intro2', bass: 'drive' })),
    ...PROG.map((ch, i) => ({ ch, mel: HOOK[i], dr: 'full', crash: i === 0 })),
    ...PROG.map((ch, i) => ({ ch, mel: i === 3 ? RUN : HOOK[i], dr: i === 3 ? 'fill' : 'full' })),
    ...SOAR.map((mel, i) => ({ ch: PROG[i % 4], mel, dr: i === 7 ? 'fill' : 'drive', harm: true, pad: true, crash: i % 4 === 0 })),
    ...BREAK.map((mel, i) => ({ ch: PROG[i], mel, dr: i === 3 ? 'roll' : 'half', bass: i === 3 ? 'drive' : 'half', arp: true })),
    ...PROG.map((ch, i) => ({ ch, mel: HOOK[i], dr: 'drive', harm: true, saw: true, pad: true, crash: i === 0 })),
  ] });
  S.gameover = song({ bpm: 66, bass: 'hold', lead: 'soft', bars: [
    ['C', 'E5:8 G5:4 C6:4'], ['Am', 'B5:8 A5:4 E5:4'], ['F', 'F5:8 A5:4 C6:4'], ['G', 'B5:6 D6:2 G5:8'],
    ['C', 'E5:8 G5:4 C6:4'], ['Am', 'D6:8 C6:4 B5:4'], ['F', 'A5:8 G5:4 F5:4'], ['G', 'G5:12 r:4'],
  ] });
  S.ending = song({ bpm: 60, bass: 'hold', lead: 'box', bars: [
    ['Am', 'E5:8 A5:8'], ['F', 'C6:8 A5:8'], ['C', 'G5:8 E5:4 D5:4'], ['G', 'D5:12 r:4'],
    ['Am', 'E5:8 A5:8'], ['F', 'C6:8 E6:8'], ['C', 'D6:4 C6:4 G5:8'], ['Em', 'B5:12 r:4'],
  ] });
  S.happy = song({ bpm: 92, bass: 'oct', lead: 'bell', dr: 'light', arp: true, bars: [
    ['C', 'E5:4 G5:4 C6:4 E6:4'], ['G', 'D6:4 B5:4 G5:8'], ['Am', 'C6:4 E6:4 A6:4 G6:4'], ['F', 'F6:4 E6:4 C6:8'],
    ['C', 'G6:4 E6:4 C6:4 E6:4'], ['F', 'A6:4 F6:4 C6:8'], ['G', 'B5:4 D6:4 G6:4 F6:4'], ['C', 'E6:12 r:4'],
  ] });
  S.mk = song({ bpm: 120, bass: 'oct', lead: 'square', dr: 'light', bars: [
    ['G', 'G5:2 B5:2 D6:2 B5:2 C6:2 A5:2 B5:4'], ['C', 'C6:2 E6:2 G6:2 E6:2 D6:4 r:4'],
  ] });
  S.spooky = song({ bpm: 90, bass: 'half', lead: 'eerie', dr: 'none', bars: [
    ['Em', 'E5:4 G5:4 F#5:4 D#5:4'], ['C', 'E5:4 G5:4 B5:8'], ['Am', 'C6:4 B5:4 A5:4 E5:4'], ['B', 'D#5:8 F#5:8'],
  ] });

  // Tierce inférieure dans la gamme de l'accord
  function harmony(m, ch) {
    const sc = ch === 'B' ? [2, 4, 5, 7, 9, 11, 0] : ch === 'A' ? [2, 4, 5, 7, 9, 10, 1] : [2, 4, 5, 7, 9, 10, 0];
    for (const d of [3, 4]) if (sc.includes(((m - d) % 12 + 12) % 12)) return m - d;
    return m - 5;
  }
  function lead(sg, bar, m, dur, t, g) {
    const L = sg.lead, f = mf(m);
    if (L === 'battle') {
      tone(f, dur * 0.92, { w: 'p25', v: 0.07, t, bus: g, send: delayIn, vib: dur > 0.25 ? [6, 6] : null });
      tone(f * 1.005, dur * 0.9, { w: 'p25', v: 0.028, t, bus: g });
      if (bar.harm) tone(mf(harmony(m, bar.chName)), dur * 0.9, { w: 'p50', v: 0.032, t, bus: g });
      if (bar.saw) tone(f * 2, dur * 0.9, { w: 'sawtooth', v: 0.03, t, bus: g, lp: 3200 });
    } else if (L === 'box') {
      tone(f, dur * 1.6, { w: 'triangle', v: 0.13, t, bus: g, decay: true });
      tone(f * 2, dur, { w: 'sine', v: 0.04, t, bus: g, decay: true });
    } else if (L === 'bell') {
      tone(f, dur * 2, { w: 'sine', v: 0.11, t, bus: g, decay: true, send: delayIn });
      tone(f * 3, dur * 0.8, { w: 'sine', v: 0.02, t, bus: g, decay: true });
      tone(f, dur * 0.9, { w: 'p12', v: 0.025, t, bus: g });
    } else if (L === 'square') {
      tone(f, dur * 0.85, { w: 'p50', v: 0.06, t, bus: g });
      tone(f / 2, dur * 0.85, { w: 'triangle', v: 0.05, t, bus: g });
    } else if (L === 'bright') {
      tone(f, dur * 0.9, { w: 'p12', v: 0.07, t, bus: g, send: delayIn, vib: dur > 0.25 ? [6, 5] : null });
      tone(f * 2, dur * 0.6, { w: 'p25', v: 0.02, t, bus: g });
    } else if (L === 'saw') {
      tone(f, dur * 0.9, { w: 'sawtooth', v: 0.05, t, bus: g, lp: 2600, send: delayIn, vib: dur > 0.25 ? [6, 6] : null });
      tone(f * 1.008, dur * 0.9, { w: 'p25', v: 0.03, t, bus: g });
    } else if (L === 'brass') {
      tone(f, dur * 0.95, { w: 'sawtooth', v: 0.06, t, bus: g, lp: 1800, a: 0.03, vib: dur > 0.25 ? [5, 5] : null });
      tone(f / 2, dur * 0.95, { w: 'organ', v: 0.05, t, bus: g, a: 0.03 });
    } else if (L === 'eerie') {
      tone(f, dur * 1.1, { w: 'sine', v: 0.1, t, bus: g, a: 0.08, r: 0.3, vib: [4, 8], send: delayIn });
      tone(f * 1.5, dur * 1.1, { w: 'triangle', v: 0.02, t, bus: g, a: 0.1, r: 0.3 });
    } else {
      tone(f, dur * 0.95, { w: 'p50', v: 0.04, t, bus: g, a: 0.06, r: 0.25, vib: [5, 3], send: delayIn });
      tone(f, dur * 0.95, { w: 'triangle', v: 0.08, t, bus: g, a: 0.06, r: 0.25 });
    }
  }
  function drums(p, s, t, g) {
    if (p === 'none') return;
    const kick = (v = 0.45) => { tone(160, 0.2, { w: 'sine', to: 40, toT: 0.12, v, t, bus: g, decay: true }); nz(0.02, { ft: 'highpass', f: 2000, v: 0.05, t, bus: g }); };
    const snare = (v = 0.2) => { nz(0.16, { ft: 'highpass', f: 1100, v, t, bus: g }); tone(200, 0.09, { w: 'triangle', to: 150, v: v * 0.6, t, bus: g, decay: true }); };
    const hat = v => nz(0.03, { ft: 'highpass', f: 7500, v, t, bus: g });
    const tom = f => tone(f, 0.18, { w: 'sine', to: f * 0.6, v: 0.3, t, bus: g, decay: true });
    switch (p) {
      case 'intro1': if (s === 0 || s === 8) kick(); if (s % 2 === 0) hat(0.03); break;
      case 'intro2': if (s % 4 === 0) kick(); hat(s % 2 ? 0.015 : 0.04); if (s >= 12) snare(0.06 + (s - 12) * 0.04); break;
      case 'full': if (s === 0 || s === 8 || s === 10) kick(); if (s === 4 || s === 12) snare(); if (s === 15) snare(0.05); hat(s % 4 === 2 ? 0.05 : s % 2 ? 0.015 : 0.03); break;
      case 'drive': if ([0, 3, 6, 8, 11, 14].includes(s)) kick(0.4); if (s === 4 || s === 12) snare(0.22); hat(s % 2 ? 0.02 : 0.045); break;
      case 'half': if (s === 0) kick(); if (s === 8) snare(0.22); if (s % 2 === 0) hat(0.03); break;
      case 'light': if (s === 0 || s === 8) kick(0.25); if (s === 4 || s === 12) hat(0.06); if (s % 2 === 0) hat(0.02); break;
      case 'march': if (s % 4 === 0) kick(0.4); if (s === 4 || s === 12) snare(0.2); if (s === 14 || s === 15) snare(0.08); break;
      case 'swing': if (s === 0 || s === 10) kick(0.35); if (s === 4 || s === 12) snare(0.15); if (s % 4 === 0 || s % 4 === 3) hat(0.04); break;
      case 'disco': if (s % 4 === 0) kick(0.45); if (s === 4 || s === 12) snare(0.2); if (s % 4 === 2) hat(0.08); else if (s % 2) hat(0.02); break;
      case 'roll': if (s === 0 || s === 8) kick(); snare(0.04 + s * 0.012); break;
      case 'fill':
        if (s === 0 || s === 4) kick(); if (s === 2 || s === 6) snare();
        if (s === 8) tom(220); if (s === 10) tom(180); if (s === 12) tom(140);
        if (s >= 13) snare(0.15 + (s - 13) * 0.04);
        hat(0.02); break;
    }
  }
  const DRIVE = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12];
  function playStep(sg, step, t, sd, g) {
    const bar = sg.bars[Math.floor(step / 16)], s = step % 16;
    if (bar.crash && s === 0) nz(1.4, { ft: 'highpass', f: 5000, v: 0.13, t, bus: g });
    for (const n of bar.mel) if (n.s === s) lead(sg, bar, n.m, n.len * sd, t, g);
    const bass = bar.bass || sg.bass, root = bar.ch[0], tri = bar.ch[1];
    if (bass === 'drive') {
      tone(mf(root + DRIVE[s]), sd * 0.8, { w: 'p50', v: 0.085, t, bus: g, r: 0.02 });
      if (s % 8 === 0) tone(mf(root - 12), sd * 4, { w: 'triangle', v: 0.16, t, bus: g, r: 0.05 });
    } else if (bass === 'half') {
      if (s % 8 === 0) { tone(mf(root), sd * 7, { w: 'p50', v: 0.07, t, bus: g, r: 0.1 }); tone(mf(root - 12), sd * 7, { w: 'triangle', v: 0.16, t, bus: g, r: 0.1 }); }
    } else if (bass === 'oct') {
      if (s % 2 === 0) tone(mf(root + (s % 4 === 2 ? 12 : 0)), sd * 1.7, { w: 'p50', v: 0.08, t, bus: g, r: 0.03 });
    } else if (bass === 'waltz') {
      if (s === 0 || s === 8) tone(mf(root), sd * 3, { w: 'triangle', v: 0.18, t, bus: g });
      if (s === 4 || s === 6 || s === 12 || s === 14) for (const m of tri) tone(mf(m - 12), sd * 1.5, { w: 'p25', v: 0.02, t, bus: g });
    } else if (bass === 'walk') {
      if (s % 4 === 0) tone(mf(root + [0, 4, 7, 9][s / 4]), sd * 3.5, { w: 'triangle', v: 0.2, t, bus: g });
    } else if (bass === 'pump') {
      if (s % 2 === 0) tone(mf(root + (s % 8 === 6 ? 7 : 0)), sd * 1.2, { w: 'sawtooth', v: 0.06, t, bus: g, lp: 900 });
    } else if (bass === 'disco') {
      if (s % 2 === 0) tone(mf(root + (s % 4 === 2 ? 12 : 0)), sd * 1.4, { w: 'p50', v: 0.09, t, bus: g, lp: 1400 });
      if (s === 6 || s === 14) for (const m of tri) tone(mf(m), sd * 1.5, { w: 'p25', v: 0.025, t, bus: g });
    } else if (s === 0) {
      tone(mf(root + 12), sd * 16, { w: 'triangle', v: 0.12, t, bus: g, a: 0.05, r: 0.4 });
      for (const m of tri) tone(mf(m), sd * 16, { w: 'sine', v: 0.018, t, bus: g, a: 0.3, r: 0.6 });
    }
    if (bar.pad && s === 0) for (const m of tri) tone(mf(m), sd * 16, { w: 'sawtooth', v: 0.014, t, bus: g, a: 0.15, r: 0.3, lp: 1600 });
    if (bar.arp) tone(mf(tri[s % 3] + 12 + (s % 6 >= 3 ? 12 : 0)), sd * 0.9, { w: 'p12', v: 0.03, t, bus: g, send: delayIn });
    drums(bar.dr, s, t, g);
  }
  function tick() {
    if (!cur || !ac || ac.state !== 'running') return;
    const sg = cur.sg, sd = 60 / sg.bpm / 4 / cur.rate;
    if (cur.next < ac.currentTime - 0.2) cur.next = ac.currentTime + 0.05;
    while (cur.next < ac.currentTime + 0.15) {
      playStep(sg, cur.pos, cur.next, sd, cur.g);
      cur.pos++;
      if (cur.pos >= sg.total) cur.pos = sg.loopStep;
      cur.next += sd;
    }
  }
  function music(name, rate = 1) {
    if (!ac) { wanted = name; return; }
    if (cur && cur.name === name) { cur.rate = rate; return; }
    stopMusic(0.25);
    const sg = S[name]; if (!sg) return;
    delayNode.delayTime.setValueAtTime(60 / sg.bpm * 0.75, ac.currentTime);
    cur = { name, sg, g: gain(1, mus), pos: 0, next: ac.currentTime + 0.08, rate };
  }
  function stopMusic(fade = 0.3) {
    if (!ac) { wanted = null; return; }
    if (!cur) return;
    const g = cur.g, now = ac.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.01, fade));
    setTimeout(() => g.disconnect(), fade * 1000 + 600);
    cur = null;
  }

  const api = {
    init, music, stopMusic, SONGS: S,
    get current() { return cur ? cur.name : null; },
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.02); },
    suspend() { if (ac) ac.suspend(); },
    resume() { if (ac) ac.resume(); },
  };
  for (const k in fx) api[k] = (...a) => { if (ac && ac.state === 'running' && !muted) fx[k](...a); };
  return api;
})();
