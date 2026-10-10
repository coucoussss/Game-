'use strict';
// Moteur audio 8-bit : effets et musiques synthétisés en temps réel (Web Audio API).
// Toutes les mélodies sont des compositions originales.
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
    sfx = gain(0.8, master); mus = gain(0.5, master);
    // Écho léger sur la mélodie (typique des musiques de boss 8-bit)
    delayNode = ac.createDelay(1); delayNode.delayTime.value = 0.36;
    const fb = gain(0.28), wet = gain(0.3, mus);
    delayIn = gain(1); delayIn.connect(delayNode); delayNode.connect(fb); fb.connect(delayNode); delayNode.connect(wet);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    waves.p12 = pulse(0.125); waves.p25 = pulse(0.25); waves.p50 = pulse(0.5);
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
      const lg = gain(o.vib[1]); l.connect(lg); lg.connect(osc.frequency);
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
    osc.connect(g); g.connect(o.bus || sfx);
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
  // Empêche un même son de se superposer des dizaines de fois par seconde.
  function busy(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return true;
    last[name] = now; return false;
  }

  // ---------- Effets ----------
  const fx = {
    blip(v) {
      if (v === 'sans') tone(190, 0.05, { w: 'p50', v: 0.11, to: 170 });
      else if (v === 'deep') tone(98, 0.08, { w: 'p50', v: 0.12 });
      else tone(600, 0.035, { w: 'p50', v: 0.06 });
    },
    move() { tone(1046, 0.035, { w: 'p50', v: 0.05 }); },
    select() {
      const t = ac.currentTime;
      tone(784, 0.04, { w: 'p50', v: 0.06, t }); tone(1568, 0.06, { w: 'p50', v: 0.05, t: t + 0.04 });
    },
    beep() { tone(1318, 0.06, { w: 'p50', v: 0.1 }); },
    whoosh() { nz(0.28, { ft: 'bandpass', f: 500, fTo: 2600, v: 0.18, q: 1.2 }); },
    dodge() { nz(0.25, { ft: 'bandpass', f: 1200, fTo: 400, v: 0.12, q: 1 }); },
    hurt() {
      if (busy('hurt', 75)) return;
      nz(0.08, { f: 2000, v: 0.3 });
      tone(150, 0.08, { w: 'square', to: 70, v: 0.12 });
    },
    heal() {
      const t = ac.currentTime;
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.09, { w: 'p25', v: 0.08, t: t + i * 0.05 }));
    },
    slash() {
      nz(0.32, { ft: 'bandpass', f: 4500, fTo: 350, q: 2, v: 0.4 });
      tone(1200, 0.22, { w: 'sawtooth', to: 160, v: 0.05 });
    },
    blCharge() {
      if (busy('blc', 50)) return;
      tone(240, 0.48, { w: 'sawtooth', to: 1300, v: 0.06, vib: [30, 50] });
      tone(480, 0.48, { w: 'p25', to: 1900, v: 0.03 });
    },
    blFire() {
      if (busy('blf', 50)) return;
      nz(0.8, { f: 6000, fTo: 700, v: 0.42 });
      tone(75, 0.75, { w: 'sawtooth', to: 42, v: 0.2, decay: true });
      tone(150, 0.5, { w: 'square', to: 85, v: 0.06, decay: true });
    },
    warn() {
      if (busy('warn', 60)) return;
      const t = ac.currentTime;
      tone(1760, 0.05, { w: 'p25', v: 0.07, t }); tone(1760, 0.05, { w: 'p25', v: 0.07, t: t + 0.09 });
    },
    stab() {
      if (busy('stab', 50)) return;
      nz(0.13, { ft: 'highpass', f: 1500, v: 0.22 });
      tone(330, 0.1, { w: 'square', to: 900, v: 0.07 });
    },
    slam() {
      if (busy('slam', 60)) return;
      tone(140, 0.32, { w: 'sine', to: 34, v: 0.75, decay: true });
      nz(0.2, { f: 700, v: 0.45 });
    },
    ding() {
      tone(1568, 0.6, { w: 'triangle', v: 0.14, decay: true });
      tone(2093, 0.4, { w: 'sine', v: 0.06, decay: true });
    },
    crack() {
      nz(0.09, { ft: 'highpass', f: 2500, v: 0.35 });
      tone(700, 0.13, { w: 'square', to: 170, v: 0.12 });
    },
    shatter() {
      const t = ac.currentTime;
      for (let i = 0; i < 10; i++) tone(1500 + Math.random() * 2200, 0.06, { w: 'p25', v: 0.045, t: t + i * 0.022 });
      nz(0.45, { ft: 'highpass', f: 4000, v: 0.12 });
    },
    bigHit() {
      nz(0.7, { f: 3000, fTo: 150, v: 0.6 });
      tone(95, 0.7, { w: 'square', to: 28, v: 0.28, decay: true });
    },
    dust() { nz(1.8, { ft: 'bandpass', f: 3500, fTo: 400, v: 0.16, a: 0.4, q: 0.6 }); },
    scrape() { if (busy('scr', 110)) return; nz(0.1, { ft: 'bandpass', f: 420, v: 0.08 }); },
    cymbal() { nz(2.2, { ft: 'highpass', f: 5000, fTo: 9000, v: 0.2, a: 1.2 }); },
  };

  // ---------- Musique ----------
  const CH = {
    Dm: [38, [62, 65, 69]], C: [36, [60, 64, 67]], Bb: [34, [58, 62, 65]], A: [33, [57, 61, 64]],
    F: [41, [65, 69, 72]], G: [43, [67, 71, 74]], Am: [33, [57, 60, 64]], Em: [40, [64, 67, 71]],
  };
  function midi(n) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  }
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  function parseMel(str) {
    const out = []; let p = 0;
    if (!str) return out;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, l] = tok.split(':'); const len = +l;
      if (n !== 'r') out.push({ s: p, m: midi(n), len });
      p += len;
    }
    return out;
  }
  function song(def) {
    const bars = def.bars.map(b => ({ ch: CH[b[0]], mel: parseMel(b[1]), dr: b[2] || 'none', arp: !!b[3] }));
    return { ...def, bars, total: bars.length * 16, loopStep: (def.loop || 0) * 16 };
  }

  const SONGS = {
    // « Jugement » : thème de combat, ré mineur, 125 BPM
    battle: song({
      bpm: 125, bass: 'oct', lead: 'battle', loop: 2, bars: [
        ['Dm', '', 'intro'], ['C', '', 'intro'],
        ['Dm', 'A4:2 D5:2 F5:2 A5:4 G5:2 F5:2 E5:2', 'full'],
        ['C', 'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4', 'full'],
        ['Bb', 'F5:2 D5:2 Bb4:2 D5:2 F5:3 G5:1 F5:2 D5:2', 'full'],
        ['A', 'E5:4 C#5:2 E5:2 A5:4 C#6:4', 'full'],
        ['Dm', 'A4:2 D5:2 F5:2 A5:4 G5:2 F5:2 E5:2', 'full'],
        ['C', 'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4', 'full'],
        ['Bb', 'F5:2 D5:2 Bb4:2 D5:2 F5:3 G5:1 F5:2 D5:2', 'full'],
        ['A', 'E5:2 F5:2 G5:2 A5:2 Bb5:2 A5:2 G5:2 E5:2', 'fill'],
        ['Dm', 'D6:3 C6:1 A5:2 F5:2 A5:2 C6:2 D6:4', 'full', 1],
        ['F', 'C6:3 A5:1 F5:2 C5:2 F5:2 A5:2 C6:4', 'full', 1],
        ['C', 'B5:2 C6:2 G5:2 E5:2 G5:2 E5:2 C5:2 E5:2', 'full', 1],
        ['A', 'C#6:4 A5:2 E5:2 C#5:2 E5:2 A5:4', 'full', 1],
        ['Bb', 'D6:2 F6:2 D6:2 Bb5:2 F5:2 Bb5:2 D6:4', 'full', 1],
        ['C', 'E6:2 G6:2 E6:2 C6:2 G5:2 C6:2 E6:4', 'full', 1],
        ['Dm', 'F6:3 E6:1 D6:2 A5:2 F5:2 A5:2 D6:2 E6:2', 'full', 1],
        ['A', 'C#6:6 A5:2 E5:4 r:4', 'fill', 1],
        ['Dm', 'D5:1 r:1 D5:1 r:1 F5:2 D5:2 r:2 A4:2 C5:2 D5:2', 'break', 1],
        ['Dm', 'D5:1 r:1 D5:1 r:1 F5:2 A5:2 r:2 G5:2 F5:2 E5:2', 'break', 1],
        ['Bb', 'D5:1 r:1 D5:1 r:1 F5:2 D5:2 r:2 Bb4:2 C5:2 D5:2', 'break', 1],
        ['C', 'E5:2 G5:2 C6:2 G5:2 E5:2 G5:2 C6:2 E6:2', 'fill', 1],
      ],
    }),
    // Boîte à musique de l'écran titre
    title: song({
      bpm: 84, bass: 'hold', lead: 'box', bars: [
        ['F', 'A5:4 C6:4 A5:2 G5:2 F5:4'], ['C', 'G5:4 E5:4 C5:4 E5:4'],
        ['Dm', 'F5:4 A5:4 D6:4 C6:2 A5:2'], ['Bb', 'Bb5:6 A5:2 G5:4 F5:4'],
        ['F', 'A5:4 C6:4 F6:4 E6:2 C6:2'], ['C', 'D6:4 C6:4 G5:8'],
        ['Bb', 'F5:4 G5:4 A5:4 Bb5:4'], ['C', 'A5:6 G5:2 E5:8'],
      ],
    }),
    gameover: song({
      bpm: 66, bass: 'hold', lead: 'soft', bars: [
        ['C', 'E5:8 G5:4 C6:4'], ['Am', 'B5:8 A5:4 E5:4'], ['F', 'F5:8 A5:4 C6:4'], ['G', 'B5:6 D6:2 G5:8'],
        ['C', 'E5:8 G5:4 C6:4'], ['Am', 'D6:8 C6:4 B5:4'], ['F', 'A5:8 G5:4 F5:4'], ['G', 'G5:12 r:4'],
      ],
    }),
    ending: song({
      bpm: 60, bass: 'hold', lead: 'box', bars: [
        ['Am', 'E5:8 A5:8'], ['F', 'C6:8 A5:8'], ['C', 'G5:8 E5:4 D5:4'], ['G', 'D5:12 r:4'],
        ['Am', 'E5:8 A5:8'], ['F', 'C6:8 E6:8'], ['C', 'D6:4 C6:4 G5:8'], ['Em', 'B5:12 r:4'],
      ],
    }),
  };

  function lead(sg, m, dur, t, g) {
    if (sg.lead === 'battle') {
      tone(mf(m), dur * 0.92, { w: 'p25', v: 0.08, t, bus: g, send: delayIn, vib: dur > 0.3 ? [6, 5] : null });
      tone(mf(m - 12), dur * 0.9, { w: 'p50', v: 0.025, t, bus: g });
    } else if (sg.lead === 'box') {
      tone(mf(m), dur * 1.6, { w: 'triangle', v: 0.13, t, bus: g, decay: true });
      tone(mf(m + 12), dur, { w: 'sine', v: 0.04, t, bus: g, decay: true });
    } else {
      tone(mf(m), dur * 0.95, { w: 'p50', v: 0.04, t, bus: g, a: 0.06, r: 0.25, vib: [5, 3], send: delayIn });
      tone(mf(m), dur * 0.95, { w: 'triangle', v: 0.08, t, bus: g, a: 0.06, r: 0.25 });
    }
  }
  function drums(p, s, t, g) {
    if (p === 'none') return;
    const kick = () => tone(150, 0.18, { w: 'sine', to: 42, toT: 0.12, v: 0.42, t, bus: g, decay: true });
    const snare = () => { nz(0.14, { ft: 'highpass', f: 1200, v: 0.18, t, bus: g }); tone(190, 0.08, { w: 'triangle', v: 0.1, t, bus: g, decay: true }); };
    const hat = v => nz(0.03, { ft: 'highpass', f: 7000, v, t, bus: g });
    if (p === 'full') { if (s === 0 || s === 8 || s === 10) kick(); if (s === 4 || s === 12) snare(); hat(s % 2 ? 0.018 : 0.045); }
    else if (p === 'intro') { if (s === 0 || s === 8) kick(); if (s % 4 === 2) hat(0.045); }
    else if (p === 'break') { if (s === 0 || s === 3 || s === 6 || s === 10) kick(); if (s === 4 || s === 12 || s === 14 || s === 15) snare(); hat(s % 2 ? 0.018 : 0.035); }
    else if (p === 'fill') { if (s === 0 || s === 8) kick(); if ((s >= 8 && s % 2 === 0) || s >= 12) snare(); hat(0.03); }
  }
  function playStep(sg, step, t, sd, g) {
    const bar = sg.bars[Math.floor(step / 16)], s = step % 16;
    for (const n of bar.mel) if (n.s === s) lead(sg, n.m, n.len * sd, t, g);
    if (sg.bass === 'oct') {
      if (s % 2 === 0) tone(mf(bar.ch[0] + (s % 4 === 2 ? 12 : 0)), sd * 1.7, { w: 'p50', v: 0.1, t, bus: g, r: 0.03 });
    } else if (s === 0) {
      tone(mf(bar.ch[0] + 12), sd * 16, { w: 'triangle', v: 0.12, t, bus: g, a: 0.05, r: 0.4 });
      for (const m of bar.ch[1]) tone(mf(m), sd * 16, { w: 'sine', v: 0.018, t, bus: g, a: 0.3, r: 0.6 });
    }
    if (bar.arp) tone(mf(bar.ch[1][s % 3] + 12), sd * 0.9, { w: 'p12', v: 0.03, t, bus: g });
    drums(bar.dr, s, t, g);
  }
  function tick() {
    if (!cur || !ac || ac.state !== 'running') return;
    const sg = cur.sg, sd = 60 / sg.bpm / 4;
    if (cur.next < ac.currentTime - 0.2) cur.next = ac.currentTime + 0.05;
    while (cur.next < ac.currentTime + 0.15) {
      playStep(sg, cur.pos, cur.next, sd, cur.g);
      cur.pos++;
      if (cur.pos >= sg.total) cur.pos = sg.loopStep;
      cur.next += sd;
    }
  }
  function music(name) {
    if (!ac) { wanted = name; return; }
    if (cur && cur.name === name) return;
    stopMusic(0.25);
    const sg = SONGS[name]; if (!sg) return;
    delayNode.delayTime.setValueAtTime(60 / sg.bpm * 0.75, ac.currentTime);
    cur = { name, sg, g: gain(1, mus), pos: 0, next: ac.currentTime + 0.08 };
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
    init, music, stopMusic,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.02); },
    suspend() { if (ac) ac.suspend(); },
    resume() { if (ac) ac.resume(); },
  };
  for (const k in fx) api[k] = (...a) => { if (ac && ac.state === 'running') fx[k](...a); };
  return api;
})();
