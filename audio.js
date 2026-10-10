'use strict';
// Moteur audio procédural : tous les sons sont synthétisés en temps réel avec la Web Audio API.
const Sound = (() => {
  let ac = null, master, sfx, music, amb, revIn, noiseBuf, distCurve;
  let muted = false, intensity = 0, nextBeat = 0, nextNote = 0;
  const R = (a, b) => a + Math.random() * (b - a);
  const clampPan = p => Math.max(-1, Math.min(1, p));

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ac.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ac.destination);
    sfx = g(1, master); music = g(0.32, master); amb = g(0.5, master);
    const conv = ac.createConvolver(); conv.buffer = impulse(3, 2.4);
    revIn = g(0.5, conv); conv.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) distCurve[i] = Math.tanh((i / 512 - 1) * 3);
    ambience();
    nextNote = ac.currentTime + 1; nextBeat = ac.currentTime + 0.5;
    drone();
    setInterval(scheduler, 60);
  }

  function g(v, dest) { const n = ac.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n; }
  function impulse(sec, decay) {
    const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  // Sortie spatialisée : volume, panoramique stéréo et envoi vers la réverbération.
  function out(pan = 0, vol = 1, wet = 0.25, bus) {
    const gn = g(vol);
    let node = gn;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clampPan(pan); gn.connect(p); node = p; }
    node.connect(bus || sfx);
    if (wet > 0) node.connect(g(wet, revIn));
    return gn;
  }
  function noise(t, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s;
  }
  function osc(type, f, t, dur) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function filt(type, f, q = 1) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function env(t, a, peak, dec) {
    const gn = g(0);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(peak, t + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    return gn;
  }
  function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
  function shaper() { const ws = ac.createWaveShaper(); ws.curve = distCurve; return ws; }

  // ---------- Armes ----------
  const GUNS = {
    pistol: { crack: 0.12, body: 0.25, thump: 150, vol: 0.85, hp: 1100 },
    shotgun: { crack: 0.28, body: 0.55, thump: 85, vol: 1.15, hp: 500 },
    rifle: { crack: 0.09, body: 0.2, thump: 120, vol: 0.75, hp: 1500 },
  };
  function gun(kind, pan = 0) {
    if (!ac) return;
    const t = ac.currentTime, P = GUNS[kind];
    const o = out(pan, P.vol, 0.6);
    const ws = shaper(); ws.connect(o);
    chain(noise(t, P.crack), filt('highpass', P.hp), env(t, 0.001, 1.3, P.crack), ws);
    const lp = filt('lowpass', 4000);
    lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(180, t + P.body);
    chain(noise(t, P.body), lp, env(t, 0.002, 1.1, P.body), ws);
    const th = osc('sine', P.thump, t, 0.3);
    th.frequency.exponentialRampToValueAtTime(32, t + 0.2);
    chain(th, env(t, 0.002, 1.5, 0.25), o);
    if (kind !== 'shotgun') { tink(t + R(0.3, 0.4), pan); }
  }
  function tink(t, pan = 0) {
    if (!ac) return;
    if (t === undefined || t === 0) t = ac.currentTime;
    const o = out(pan, 0.12, 0.15);
    const f = R(3200, 4200);
    chain(osc('sine', f, t, 0.12), env(t, 0.001, 1, 0.1), o);
    chain(osc('sine', f * 1.47, t, 0.08), env(t, 0.001, 0.5, 0.06), o);
    chain(osc('sine', f * 0.97, t + 0.11, 0.06), env(t + 0.11, 0.001, 0.4, 0.05), o);
  }
  function click(t, f = 3000, vol = 0.5, dur = 0.03) {
    const o = out(0, vol, 0.1);
    chain(noise(t, dur), filt('bandpass', f, 3), env(t, 0.001, 1, dur), o);
  }
  function slide(t, d) {
    const o = out(0, 0.3, 0.1), bp = filt('bandpass', 1500, 2);
    bp.frequency.setValueAtTime(1500, t); bp.frequency.linearRampToValueAtTime(3500, t + d);
    chain(noise(t, d), bp, env(t, 0.01, 1, d), o);
  }
  function empty() { if (!ac) return; const t = ac.currentTime; click(t, 3500, 0.6, 0.02); click(t + 0.03, 1800, 0.3, 0.02); }
  function reload(kind, dur) {
    if (!ac) return;
    const t = ac.currentTime;
    if (kind === 'shotgun') {
      for (let i = 0; i < 4; i++) { click(t + 0.2 + i * 0.38, 1800, 0.6, 0.05); click(t + 0.25 + i * 0.38, 900, 0.5, 0.06); }
      slide(t + dur - 0.4, 0.12); click(t + dur - 0.28, 1500, 0.9, 0.06);
      slide(t + dur - 0.2, 0.1); click(t + dur - 0.08, 1100, 0.9, 0.06);
    } else {
      click(t + 0.05, 2500, 0.6); click(t + 0.1, 1200, 0.4, 0.06); slide(t + 0.3, 0.2);
      click(t + dur * 0.65, 900, 0.8, 0.07); click(t + dur * 0.67, 3000, 0.5);
      click(t + dur - 0.2, 2000, 0.7); click(t + dur - 0.09, 1400, 0.8, 0.05);
    }
  }
  function swap() { if (!ac) return; const t = ac.currentTime; click(t, 1500, 0.4, 0.05); click(t + 0.12, 2600, 0.4, 0.03); }

  // ---------- Corps-à-corps / impacts ----------
  function swoosh(pitch = 1) {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.45, 0.15), bp = filt('bandpass', 400, 1.5);
    bp.frequency.setValueAtTime(350 * pitch, t); bp.frequency.exponentialRampToValueAtTime(2600 * pitch, t + 0.18);
    chain(noise(t, 0.22), bp, env(t, 0.06, 1, 0.16), o);
  }
  function flesh(pan = 0, heavy = false) {
    if (!ac) return;
    const t = ac.currentTime, o = out(pan, heavy ? 0.9 : 0.6, 0.2);
    chain(noise(t, 0.15), filt('lowpass', heavy ? 700 : 1100), env(t, 0.002, 1, heavy ? 0.14 : 0.08), o);
    const bp = filt('bandpass', 900, 6);
    bp.frequency.setValueAtTime(R(700, 1100), t); bp.frequency.exponentialRampToValueAtTime(250, t + 0.15);
    chain(noise(t, 0.18), bp, env(t, 0.005, 2.2, 0.16), o);
    const th = osc('sine', 110, t, 0.12); th.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    chain(th, env(t, 0.002, heavy ? 1 : 0.5, 0.1), o);
  }
  function crunch(pan = 0) {
    if (!ac) return;
    const t = ac.currentTime, o = out(pan, 0.8, 0.25);
    for (let i = 0; i < 6; i++) {
      const tt = t + i * R(0.008, 0.02);
      chain(noise(tt, 0.02), filt('bandpass', R(600, 2500), 4), env(tt, 0.001, R(0.6, 1.4), 0.02), o);
    }
    // éclaboussure
    const bp = filt('bandpass', 1200, 1.2);
    bp.frequency.setValueAtTime(2000, t + 0.02); bp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    chain(noise(t + 0.02, 0.4), bp, env(t + 0.02, 0.01, 1.2, 0.35), o);
  }
  function slash(pan = 0) { flesh(pan, true); if (!ac) return; const t = ac.currentTime; const o = out(pan, 0.35, 0.2); chain(noise(t, 0.1), filt('highpass', 3000), env(t, 0.001, 1, 0.08), o); }
  function kick(pan = 0) {
    if (!ac) return;
    const t = ac.currentTime, o = out(pan, 0.9, 0.2);
    const th = osc('sine', 120, t, 0.2); th.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    chain(th, env(t, 0.002, 1.4, 0.18), o);
    chain(noise(t, 0.08), filt('lowpass', 900), env(t, 0.001, 0.9, 0.07), o);
  }
  function impact(pan = 0) {
    if (!ac) return;
    const t = ac.currentTime, o = out(pan, 0.3, 0.3);
    chain(noise(t, 0.06), filt('bandpass', R(1500, 3500), 2), env(t, 0.001, 1, 0.05), o);
    if (Math.random() < 0.35) {
      const w = osc('sine', R(2500, 3500), t, 0.3); w.frequency.exponentialRampToValueAtTime(R(600, 900), t + 0.28);
      chain(w, env(t, 0.005, 0.25, 0.27), o);
    }
  }

  // ---------- Zombies ----------
  function groan(pan = 0, vol = 0.5, kind = 'walker', short = false) {
    if (!ac || vol < 0.02) return;
    const t = ac.currentTime;
    const dur = short ? R(0.35, 0.6) : R(0.9, 2);
    const o = out(pan, vol, 0.45);
    const base = (kind === 'brute' ? 52 : kind === 'runner' ? 150 : 82) * R(0.85, 1.2);
    const v = osc('sawtooth', base, t, dur);
    v.frequency.linearRampToValueAtTime(base * R(0.65, 1.15), t + dur);
    const lfo = osc('sine', R(4, 9), t, dur), lg = g(base * 0.07);
    lfo.connect(lg); lg.connect(v.frequency);
    const ws = shaper();
    const f1 = filt('bandpass', 650, 5), f2 = filt('bandpass', 1150, 7), f3 = filt('bandpass', 2400, 8);
    f1.frequency.setValueAtTime(R(500, 800), t); f1.frequency.linearRampToValueAtTime(R(300, 450), t + dur);
    const env1 = g(0);
    env1.gain.setValueAtTime(0.0001, t);
    env1.gain.linearRampToValueAtTime(1, t + dur * 0.2);
    env1.gain.linearRampToValueAtTime(0.7, t + dur * 0.7);
    env1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    v.connect(ws); ws.connect(f1); ws.connect(f2); ws.connect(f3);
    f1.connect(env1); f2.connect(env1); const f3g = g(0.4); f3.connect(f3g); f3g.connect(env1);
    env1.connect(o);
    // râle (souffle)
    chain(noise(t, dur), filt('bandpass', kind === 'runner' ? 2200 : 1400, 1), env(t, dur * 0.3, kind === 'runner' ? 0.5 : 0.25, dur * 0.7), o);
  }
  function scream(pan = 0, vol = 0.6) {
    if (!ac) return;
    const t = ac.currentTime, dur = R(0.6, 1), o = out(pan, vol, 0.5);
    const v = osc('sawtooth', R(380, 480), t, dur);
    v.frequency.exponentialRampToValueAtTime(R(160, 220), t + dur);
    const ws = shaper(), bp = filt('bandpass', 1600, 2);
    chain(v, ws, bp, env(t, 0.03, 0.9, dur), o);
    chain(noise(t, dur), filt('bandpass', 3000, 1), env(t, 0.03, 0.5, dur), o);
  }
  function zombieDie(pan = 0, vol = 0.5) {
    if (!ac) return;
    groan(pan, vol * 0.8, 'walker', true);
    const t = ac.currentTime, o = out(pan, vol * 0.6, 0.3);
    // gargouillis
    for (let i = 0; i < 5; i++) {
      const tt = t + 0.1 + i * R(0.05, 0.1);
      chain(osc('sine', R(150, 300), tt, 0.05), env(tt, 0.005, 0.5, 0.05), o);
    }
  }
  function bodyFall(pan = 0, vol = 0.6) {
    if (!ac) return;
    const t = ac.currentTime, o = out(pan, vol, 0.25);
    chain(noise(t, 0.25), filt('lowpass', 400), env(t, 0.005, 1, 0.22), o);
    const th = osc('sine', 70, t, 0.2); th.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    chain(th, env(t, 0.003, 0.8, 0.18), o);
    chain(noise(t, 0.15), filt('highpass', 2500), env(t + 0.01, 0.005, 0.25, 0.14), o); // flaque
  }

  // ---------- Joueur ----------
  function hurt() {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.7, 0.2);
    const f = R(170, 210);
    const v = osc('sawtooth', f, t, 0.3); v.frequency.exponentialRampToValueAtTime(f * 0.65, t + 0.28);
    chain(v, filt('bandpass', 750, 3), env(t, 0.01, 1.2, 0.27), o);
    chain(noise(t, 0.25), filt('bandpass', 1500, 1), env(t, 0.01, 0.3, 0.22), o);
  }
  function playerDeath() {
    if (!ac) return;
    hurt();
    const t = ac.currentTime, o = out(0, 0.9, 0.8);
    const v = osc('sine', 110, t, 2.5); v.frequency.exponentialRampToValueAtTime(30, t + 2.4);
    chain(v, env(t, 0.05, 1, 2.4), o);
    const v2 = osc('sawtooth', 55, t, 3); chain(v2, filt('lowpass', 300), env(t, 0.5, 0.5, 2.5), o);
  }
  function step(vol = 0.15) {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, vol, 0.05);
    chain(noise(t, 0.08), filt('lowpass', 350), env(t, 0.003, 1, 0.07), o);
    chain(noise(t, 0.1), filt('bandpass', 3500, 1), env(t + 0.01, 0.005, 0.25, 0.08), o); // flaque
  }
  function jump() { step(0.2); }
  function land() { step(0.4); }
  function pickup() {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.3, 0.3);
    chain(osc('triangle', 660, t, 0.1), env(t, 0.005, 1, 0.1), o);
    chain(osc('triangle', 990, t + 0.08, 0.15), env(t + 0.08, 0.005, 1, 0.15), o);
    click(t, 1500, 0.4, 0.05);
  }
  function heartbeat() {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.9, 0);
    for (const [d, v] of [[0, 1], [0.16, 0.7]]) {
      const h = osc('sine', 60, t + d, 0.15); h.frequency.exponentialRampToValueAtTime(38, t + d + 0.12);
      chain(h, env(t + d, 0.01, v, 0.13), o);
    }
  }

  // ---------- Ambiance ----------
  function thunder(delay = 0.5, close = 0.5) {
    if (!ac) return;
    const t = ac.currentTime + delay, o = out(R(-0.6, 0.6), 0.5 + close * 0.6, 0.6, amb);
    if (close > 0.5) chain(noise(t, 0.3), filt('highpass', 800), env(t, 0.005, 0.8, 0.3), o);
    const dur = R(3, 5.5), lp = filt('lowpass', 180, 0.7);
    const gn = g(0);
    gn.gain.setValueAtTime(0.0001, t);
    let tt = t;
    gn.gain.linearRampToValueAtTime(1, t + 0.15);
    while (tt < t + dur) { tt += R(0.15, 0.5); gn.gain.linearRampToValueAtTime(R(0.25, 1) * (1 - (tt - t) / dur) + 0.02, tt); }
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    chain(noise(t, dur + 0.4), lp, gn, o);
  }
  function ambience() {
    const rain = ac.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
    chain(rain, filt('highpass', 600), filt('lowpass', 7000), g(0.2), amb);
    const rain2 = ac.createBufferSource(); rain2.buffer = noiseBuf; rain2.loop = true;
    chain(rain2, filt('bandpass', 1200, 0.6), g(0.08), amb);
    const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wg = g(0.12), wl = filt('lowpass', 300, 4);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lg = g(0.1); lfo.connect(lg); lg.connect(wg.gain);
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.05; const lg2 = g(150); lfo2.connect(lg2); lg2.connect(wl.frequency);
    chain(wind, wl, wg, amb);
    rain.start(); rain2.start(1); wind.start(); lfo.start(); lfo2.start();
  }
  // Nappe sombre continue
  function drone() {
    const lp = filt('lowpass', 260, 2), gn = g(0.3);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.04; const lg = g(120); lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    for (const f of [55, 55.25, 82.4, 110.3]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    chain(lp, gn, music);
    const hi = ac.createOscillator(); hi.type = 'sine'; hi.frequency.value = 932; // triton inquiétant
    const hg = g(0); const tl = ac.createOscillator(); tl.frequency.value = 0.15; const tlg = g(0.012); tl.connect(tlg); tlg.connect(hg.gain);
    hi.connect(hg); hg.connect(music); hi.start(); tl.start();
  }
  const SCALE = [220, 261.6, 293.7, 329.6, 349.2, 207.7, 440, 164.8];
  function scheduler() {
    if (!ac) return;
    const now = ac.currentTime;
    while (nextNote < now + 0.2) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)];
      const o = out(0, 0.09, 0.9, music);
      chain(osc('triangle', f, nextNote, 3), env(nextNote, 0.01, 1, 2.8), o);
      chain(osc('sine', f * 2, nextNote, 2), env(nextNote, 0.01, 0.3, 1.5), o);
      nextNote += R(1.8, 4) / (1 + intensity);
    }
    if (intensity > 0.25) {
      while (nextBeat < now + 0.2) {
        const o = out(0, 0.6 * intensity, 0.3, music);
        const k = osc('sine', 75, nextBeat, 0.4); k.frequency.exponentialRampToValueAtTime(40, nextBeat + 0.3);
        chain(k, env(nextBeat, 0.005, 1, 0.35), o);
        const k2 = osc('sine', 70, nextBeat + 0.22, 0.4); k2.frequency.exponentialRampToValueAtTime(38, nextBeat + 0.5);
        chain(k2, env(nextBeat + 0.22, 0.005, 0.6, 0.3), o);
        nextBeat += 60 / (70 + intensity * 50) * 2;
      }
    } else nextBeat = now + 0.1;
  }
  function waveStart() {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.7, 0.8, music);
    for (const f of [55, 82.4, 110, 130.8]) {
      const v = osc('sawtooth', f, t, 3.5);
      chain(v, filt('lowpass', 500), env(t, 1.2, 0.35, 2.2), o);
    }
    const b = osc('sine', 98, t, 4); chain(b, env(t, 0.005, 0.8, 3.8), o);
    const b2 = osc('sine', 98 * 2.76, t, 3); chain(b2, env(t, 0.005, 0.3, 2.5), o);
  }
  function waveEnd() {
    if (!ac) return;
    const t = ac.currentTime, o = out(0, 0.4, 0.8, music);
    [220, 261.6, 329.6].forEach((f, i) => chain(osc('triangle', f, t + i * 0.2, 2), env(t + i * 0.2, 0.02, 1, 1.8), o));
  }

  function setIntensity(x) { intensity = Math.max(0, Math.min(1, x)); }
  function toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ac.currentTime, 0.05); return muted; }
  function isMuted() { return muted; }

  return {
    init, gun, empty, reload, swap, swoosh, flesh, crunch, slash, kick, impact, tink,
    groan, scream, zombieDie, bodyFall, hurt, playerDeath, step, jump, land, pickup,
    heartbeat, thunder, waveStart, waveEnd, setIntensity, toggleMute, isMuted,
  };
})();
