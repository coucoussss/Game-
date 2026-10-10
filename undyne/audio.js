'use strict';
// ============================================================
//  Audio procédural (Web Audio API) : musique chiptune originale
//  « Lance de la Justice » (inspirée de l'énergie des combats de
//  boss d'Undertale, mélodie composée pour ce fan game) + bruitages.
// ============================================================
const Audio8 = (() => {
  let ac = null, master, musicBus, sfxBus, echoIn, noiseBuf, pulse25, pulse12;
  let muted = false;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return 0;
    const midi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function pulseWave(duty) {
    const N = 64, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * k * Math.PI * duty) / 2; im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) ** 2; }
    return ac.createPeriodicWave(re, im);
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
    master.connect(comp); comp.connect(ac.destination);
    musicBus = gain(0.36, master);
    sfxBus = gain(0.9, master);
    // Écho façon chiptune (retard de 3 doubles-croches)
    echoIn = gain(1);
    const dl = ac.createDelay(1); dl.delayTime.value = STEP * 3;
    const fb = gain(0.32), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(gain(0.55, musicBus));
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    pulse25 = pulseWave(0.25); pulse12 = pulseWave(0.125);
    setInterval(tick, 25);
  }
  function gain(v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function now() { return ac ? ac.currentTime : 0; }

  // ---------- Instruments ----------
  function tone(t, f, dur, { type = 'square', wave, vol = 0.2, att = 0.004, rel = 0.05, dest = musicBus, vib = 0, slide = 0, echo = false, cut = 0 } = {}) {
    const o = ac.createOscillator();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    if (vib && dur > 0.18) {
      const l = ac.createOscillator(), lg = gain(0);
      l.frequency.value = 5.8; l.connect(lg); lg.connect(o.frequency);
      lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.14); lg.gain.linearRampToValueAtTime(f * vib, t + 0.3);
      l.start(t); l.stop(t + dur + rel + 0.05);
    }
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur - 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    let node = o;
    if (cut) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = cut; o.connect(f2); node = f2; }
    node.connect(g); g.connect(dest);
    if (echo) g.connect(echoIn);
    o.start(t); o.stop(t + dur + rel + 0.05);
    return o;
  }
  function noise(t, dur, { vol = 0.2, type = 'highpass', f = 6000, q = 0.7, dest = musicBus, decay = true, f2 = 0 } = {}) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bq = ac.createBiquadFilter(); bq.type = type; bq.frequency.setValueAtTime(f, t); bq.Q.value = q;
    if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(vol, t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else { g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur); }
    s.connect(bq); bq.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const kick = t => { tone(t, 150, 0.12, { type: 'sine', vol: 0.9, slide: 0.28, rel: 0.06 }); noise(t, 0.02, { vol: 0.25, type: 'lowpass', f: 2000 }); };
  const snare = (t, v = 1) => { noise(t, 0.16, { vol: 0.45 * v, type: 'bandpass', f: 2600, q: 0.6 }); tone(t, 220, 0.06, { type: 'triangle', vol: 0.35 * v, slide: 0.5 }); };
  const hat = (t, open) => noise(t, open ? 0.14 : 0.035, { vol: open ? 0.12 : 0.09, f: 8000 });
  const crash = t => noise(t, 1.1, { vol: 0.22, f: 5000 });

  // ---------- Partition ----------
  const BPM = 156, STEP = 60 / BPM / 4;
  const CH = { Dm: ['D', 'F', 'A'], Bb: ['Bb', 'D', 'F'], C: ['C', 'E', 'G'], A: ['A', 'C#', 'E'], Gm: ['G', 'Bb', 'D'], F: ['F', 'A', 'C'] };
  const ROOT = { Dm: 'D', Bb: 'Bb', C: 'C', A: 'A', Gm: 'G', F: 'F' };
  const SONG = [
    { name: 'intro', chords: ['Dm', 'Dm', 'Bb', 'C'], mel: [
      'D5 . . D5 . . D5 . . . F5 . E5 . . .',
      'D5 . . D5 . . D5 . . . A5 . G5 . . .',
      'F5 . . F5 . . F5 . . . G5 . F5 . . .',
      'E5 . . E5 . . G5 . . . C6 . . . . .',
    ], drums: 'intro', bass: 'drive', arp: 0 },
    { name: 'A', chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A'], mel: [
      'D5 - - - A4 - D5 - F5 - - - E5 - D5 -',
      'E5 - F5 - G5 - - - A5 - - - - - D5 E5',
      'Bb5 - A5 - G5 - F5 - G5 - - - D5 - - -',
      'C5 - D5 - E5 - G5 - E5 - - - C5 - D5 E5',
      'D5 - - - A4 - D5 - F5 - - - E5 - D5 -',
      'A5 - - - G5 - F5 - G5 - A5 - C6 - - -',
      'D6 - - - C6 - Bb5 - A5 - - - G5 - F5 -',
      'E5 - - - C#5 - - - A4 - C#5 - E5 - G5 -',
    ], drums: 'A', bass: 'drive', arp: 0.035 },
    { name: 'B', chords: ['Gm', 'Gm', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A'], mel: [
      'G5 . G5 A5 Bb5 - A5 - G5 - D5 - G5 - Bb5 -',
      'A5 - - - G5 - F5 - G5 - - - - - D5 F5',
      'F5 . F5 G5 A5 - G5 - F5 - D5 - A5 - D6 -',
      'C6 - - - A5 - F5 - A5 - - - - - A5 C6',
      'D6 - C6 - Bb5 - A5 - Bb5 - C6 - D6 - F6 -',
      'E6 - - - D6 - C6 - G5 - - - C6 - E6 -',
      'E6 - C#6 - A5 - C#6 - E6 - - - A6 - - -',
      'G6 - F6 - E6 - D6 - C#6 - - - A5 - - -',
    ], drums: 'B', bass: 'drive', arp: 0.04 },
    { name: 'C', chords: ['Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'A', 'A'], mel: [
      'A5 - - - - - - - - - - - D6 - C6 -',
      'Bb5 - - - - - - - F5 - - - - - - -',
      'A5 - - - - - - - - - - - C6 - Bb5 -',
      'G5 - - - - - - - E5 - - - - - - -',
      'Bb5 - - - - - - - D6 - - - G6 - - -',
      'F6 - - - - - - - D6 - - - Bb5 - - -',
      'C#6 - - - - - - - E6 - - - - - - -',
      'A6 - - - - - - - - - - - . . . .',
    ], drums: 'C', bass: 'long', arp: 0.07 },
  ];
  const LOOP_FROM = 1; // après l'intro, on boucle A-B-C
  // Pré-calcul : liste de mesures
  const BARS = [];
  SONG.forEach((sec, si) => sec.chords.forEach((ch, bi) => BARS.push({ sec, si, bi, ch, mel: sec.mel[bi].split(/\s+/) })));
  const LOOP_BAR = BARS.findIndex(b => b.si === LOOP_FROM);

  let song = null; // { kind, bar, step, t }
  function playBattle() {
    init(); if (!ac) return;
    stopMusic();
    song = { kind: 'battle', bar: 0, step: 0, t: ac.currentTime + 0.1, gain: gain(1, musicBus) };
  }
  function stopMusic(fade = 0.05) {
    if (song && song.gain && ac) {
      const g = song.gain; g.gain.setValueAtTime(g.gain.value, ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + fade);
      setTimeout(() => g.disconnect(), fade * 1000 + 100);
    }
    song = null;
  }
  function tick() {
    if (!song) return;
    while (song && song.t < ac.currentTime + 0.12) {
      if (song.kind === 'battle') battleStep(); else if (song.kind === 'gameover') overStep(); else if (song.kind === 'drone') droneStep();
    }
  }
  function noteLen(mel, i) { let n = 1; while (mel[i + n] === '-') n++; return n; }
  function battleStep() {
    const { t, step } = song, B = BARS[song.bar], dest = song.gain, sec = B.sec;
    // Mélodie
    const tok = B.mel[step];
    if (tok && tok !== '.' && tok !== '-') {
      const len = noteLen(B.mel, step) * STEP, f = freq(tok);
      tone(t, f, len * 0.92, { wave: pulse25, vol: 0.17, vib: 0.012, dest, echo: true });
      tone(t, f * 1.004, len * 0.92, { wave: pulse12, vol: 0.05, dest });
    }
    // Basse
    const root = ROOT[B.ch];
    if (sec.bass === 'drive') {
      const pat = [0, null, 0, 12, null, 0, 12, null, 0, null, 0, 12, null, 7, 12, 7];
      const p = pat[step];
      if (p !== null) tone(t, freq(root + '2') * Math.pow(2, p / 12), STEP * 0.85, { type: 'sawtooth', vol: 0.2, cut: 700, dest, rel: 0.03 });
    } else if (step % 8 === 0) {
      tone(t, freq(root + '2'), STEP * 7.5, { type: 'sawtooth', vol: 0.2, cut: 500, dest, rel: 0.1 });
      tone(t, freq(root + '1'), STEP * 7.5, { type: 'triangle', vol: 0.3, dest, rel: 0.1 });
    }
    // Arpèges
    if (sec.arp) {
      const tones = CH[B.ch], order = [0, 1, 2, 3, 2, 1];
      const k = order[step % order.length], n = tones[k % 3], oct = k === 3 ? 5 : 4;
      tone(t, freq(n + oct), STEP * 0.7, { wave: pulse12, vol: sec.arp, dest, rel: 0.02 });
    }
    // Batterie
    const dr = sec.drums, bi = B.bi, last = bi === sec.chords.length - 1;
    if (step === 0 && bi === 0) crash(t);
    if (dr === 'intro') {
      if (bi < 3) { if (step % 8 === 0) kick(t); if (step % 8 === 4) snare(t); if (step % 2 === 0) hat(t); if ([3, 6, 10].includes(step)) kick(t); }
      else snare(t, 0.4 + step / 24);
    } else if (dr === 'A') {
      if ([0, 6, 8, 11].includes(step)) kick(t);
      if (step === 4 || step === 12) snare(t);
      if (step % 2 === 0) hat(t, step === 14);
      if (last && step >= 12) snare(t, 0.6);
    } else if (dr === 'B') {
      if ([0, 3, 8, 10].includes(step)) kick(t);
      if (step === 4 || step === 12) snare(t);
      if (step === 15) snare(t, 0.35);
      hat(t, step === 6 || step === 14);
    } else {
      if (step === 0 || step === 8 || (bi % 2 === 1 && step === 10)) kick(t);
      if (step === 12 && !last) snare(t);
      if (step % 4 === 0) hat(t);
      if (last) { if (step >= 8 || step % 2 === 0) snare(t, 0.3 + step / 22); }
    }
    // Avance
    song.t += STEP; song.step++;
    if (song.step >= 16) { song.step = 0; song.bar++; if (song.bar >= BARS.length) song.bar = LOOP_BAR; }
  }

  // Musique de Game Over : mélodie lente et mélancolique (originale)
  const OVER = 'G4 - - - Eb5 - - - D5 - C5 - Bb4 - - - C5 - - - G4 - - - - - - - . . . . Ab4 - - - F5 - - - Eb5 - D5 - C5 - - - D5 - - - - - - - - - - - . . . .'.split(' ');
  const OVER_B = ['C3', 'C3', 'Ab2', 'G2', 'F2', 'Ab2', 'G2', 'G2'];
  function playGameOver() {
    init(); if (!ac) return;
    stopMusic();
    song = { kind: 'gameover', step: 0, t: ac.currentTime + 0.3, gain: gain(1, musicBus), STEP: 60 / 84 / 2 };
  }
  function overStep() {
    const { t, step } = song, i = step % OVER.length, tok = OVER[i], S = song.STEP, dest = song.gain;
    if (tok !== '.' && tok !== '-') tone(t, freq(tok), noteLen(OVER, i) * S * 0.95, { type: 'triangle', vol: 0.32, vib: 0.01, rel: 0.25, dest, echo: true });
    if (i % 8 === 0) tone(t, freq(OVER_B[(i / 8) % 8]), S * 7.6, { type: 'triangle', vol: 0.22, rel: 0.4, dest });
    if (i % 2 === 0) { const ch = [0, 7, 12, 15][(i / 2) % 4]; tone(t, freq(OVER_B[Math.floor(i / 8) % 8]) * 2 * Math.pow(2, ch / 12), S * 0.8, { wave: pulse12, vol: 0.035, dest, rel: 0.1 }); }
    song.t += S; song.step++;
  }
  // Grondement sourd pendant le monologue
  function playDrone() {
    init(); if (!ac) return;
    stopMusic();
    song = { kind: 'drone', step: 0, t: ac.currentTime + 0.1, gain: gain(1, musicBus) };
  }
  function droneStep() {
    const { t, gain: dest } = song;
    tone(t, freq('D2'), 3.2, { type: 'sawtooth', vol: 0.06, cut: 220, att: 1.2, rel: 1, dest });
    tone(t, freq('A2'), 3.2, { type: 'triangle', vol: 0.07, att: 1.2, rel: 1, dest });
    noise(t, 3.4, { vol: 0.03, type: 'bandpass', f: 400, f2: 900, q: 0.8, decay: false, dest });
    song.t += 3; song.step++;
  }

  // ---------- Bruitages ----------
  const S = (fn) => (...a) => { if (!ac || muted) return; fn(ac.currentTime, ...a); };
  const sfx = {
    voice: S((t) => { tone(t, 150 + Math.random() * 30, 0.05, { wave: pulse25, vol: 0.16, dest: sfxBus, rel: 0.02, cut: 1800 }); tone(t, 75, 0.05, { type: 'triangle', vol: 0.1, dest: sfxBus, rel: 0.02 }); }),
    text: S((t) => tone(t, 520, 0.022, { wave: pulse25, vol: 0.07, dest: sfxBus, rel: 0.01, cut: 3000 })),
    move: S((t) => tone(t, 1300, 0.035, { wave: pulse25, vol: 0.07, dest: sfxBus, slide: 0.8, rel: 0.01 })),
    select: S((t) => { tone(t, 880, 0.04, { wave: pulse25, vol: 0.08, dest: sfxBus, rel: 0.01 }); tone(t + 0.04, 1320, 0.05, { wave: pulse25, vol: 0.08, dest: sfxBus, rel: 0.02 }); }),
    slash: S((t) => { noise(t, 0.28, { vol: 0.5, type: 'bandpass', f: 5000, f2: 600, q: 1.2, dest: sfxBus }); tone(t, 1800, 0.2, { type: 'sawtooth', vol: 0.05, slide: 0.2, dest: sfxBus }); }),
    damage: S((t) => { noise(t, 0.25, { vol: 0.6, type: 'lowpass', f: 3000, f2: 300, dest: sfxBus }); tone(t, 160, 0.22, { wave: pulse25, vol: 0.3, slide: 0.4, dest: sfxBus }); tone(t + 0.05, 90, 0.2, { type: 'square', vol: 0.15, slide: 0.5, dest: sfxBus }); }),
    hurt: S((t) => { tone(t, 330, 0.12, { type: 'square', vol: 0.2, slide: 0.45, dest: sfxBus, cut: 2200 }); noise(t, 0.12, { vol: 0.25, type: 'bandpass', f: 1500, dest: sfxBus }); }),
    block: S((t) => { tone(t, 1760, 0.02, { type: 'triangle', vol: 0.35, rel: 0.3, dest: sfxBus }); tone(t, 2640, 0.02, { type: 'sine', vol: 0.15, rel: 0.2, dest: sfxBus }); noise(t, 0.05, { vol: 0.15, f: 7000, dest: sfxBus }); }),
    spear: S((t) => { tone(t, 2200, 0.08, { type: 'sine', vol: 0.06, slide: 1.6, dest: sfxBus }); noise(t, 0.08, { vol: 0.08, f: 6000, dest: sfxBus }); }),
    warn: S((t) => tone(t, 1050, 0.05, { wave: pulse25, vol: 0.06, dest: sfxBus, rel: 0.02 })),
    thrust: S((t) => noise(t, 0.12, { vol: 0.2, type: 'bandpass', f: 1200, f2: 4000, dest: sfxBus })),
    soul: S((t) => { tone(t, 660, 0.02, { type: 'sine', vol: 0.35, rel: 0.7, dest: sfxBus }); tone(t, 990, 0.02, { type: 'sine', vol: 0.18, rel: 0.5, dest: sfxBus }); tone(t, 1320, 0.02, { type: 'triangle', vol: 0.08, rel: 0.4, dest: sfxBus }); }),
    heal: S((t) => ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(t + i * 0.05, freq(n), 0.06, { wave: pulse25, vol: 0.08, dest: sfxBus, rel: 0.05 }))),
    crack: S((t) => { noise(t, 0.18, { vol: 0.7, type: 'highpass', f: 1500, dest: sfxBus }); tone(t, 120, 0.15, { type: 'square', vol: 0.25, slide: 0.5, dest: sfxBus }); }),
    shatter: S((t) => { for (let i = 0; i < 6; i++) noise(t + i * 0.03, 0.1, { vol: 0.35, type: 'bandpass', f: 2000 + Math.random() * 4000, dest: sfxBus }); }),
    dust: S((t) => noise(t, 2.2, { vol: 0.25, type: 'highpass', f: 3000, f2: 9000, dest: sfxBus })),
    slam: S((t) => { tone(t, 90, 0.4, { type: 'sine', vol: 0.8, slide: 0.3, dest: sfxBus }); noise(t, 0.5, { vol: 0.4, type: 'lowpass', f: 1500, f2: 100, dest: sfxBus }); }),
    flash: S((t) => { noise(t, 1.2, { vol: 0.3, type: 'bandpass', f: 800, f2: 6000, dest: sfxBus }); tone(t, 220, 1, { type: 'sawtooth', vol: 0.08, slide: 4, dest: sfxBus, cut: 3000 }); }),
    targetHit: S((t) => tone(t, 600, 0.03, { wave: pulse25, vol: 0.06, dest: sfxBus })),
    levelup: S((t) => ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((n, i) => tone(t + i * 0.07, freq(n), 0.07, { wave: pulse25, vol: 0.09, dest: sfxBus, rel: 0.05 }))),
  };

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.02);
    return muted;
  }
  return { init, playBattle, playGameOver, playDrone, stopMusic, sfx, toggleMute, now, isMuted: () => muted };
})();
