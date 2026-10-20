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
    Dm: [38, [62, 65, 69]], C: [36, [60, 64, 67]], B: [35, [59, 62, 67]], Bb: [34, [58, 62, 65]], A: [33, [57, 61, 64]],
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
    const bars = def.bars.map(b => {
      const o = Array.isArray(b) ? { ch: b[0], mel: b[1], dr: b[2], arp: b[3] } : b;
      return { ...o, chName: o.ch, ch: CH[o.ch], mel: parseMel(o.mel), dr: o.dr || 'none', arp: !!o.arp };
    });
    return { ...def, bars, total: bars.length * 16, loopStep: (def.loop || 0) * 16 };
  }

  // « Jugement dernier » : thème de combat original, ré mineur, 120 BPM,
  // sur la descente de basse ré – do – si – si bémol.
  const PROG = ['Dm', 'C', 'B', 'Bb'];
  const HOOK = [
    'F5:1 E5:1 D5:2 A5:2 r:1 A5:1 C6:2 A5:1 G5:1 F5:2 E5:2',
    'E5:1 D5:1 C5:2 G5:2 r:1 G5:1 Bb5:2 G5:1 F5:1 E5:2 C5:2',
    'D5:1 C5:1 B4:2 G5:2 r:1 G5:1 B5:2 D6:2 C6:1 B5:1 G5:2',
    'D5:2 F5:2 Bb5:2 D6:2 C6:1 Bb5:1 A5:2 G5:2 A5:2',
  ];
  const RUN = 'Bb5:1 A5:1 G5:1 F5:1 E5:1 D5:1 C#5:1 D5:1 E5:1 F5:1 G5:1 A5:1 Bb5:1 C6:1 C#6:2';
  const SOAR = [
    'D6:6 C6:2 A5:4 F5:4', 'E6:6 D6:2 C6:4 G5:4', 'D6:4 B5:2 G5:2 B5:2 D6:2 G6:4', 'F6:6 E6:2 D6:2 C6:2 Bb5:2 A5:2',
    'A6:4 G6:2 F6:2 E6:2 F6:2 D6:4', 'G6:4 F6:2 E6:2 D6:2 E6:2 C6:4', 'F6:3 E6:1 D6:4 B5:4 G5:4', 'A5:2 Bb5:2 C6:2 D6:2 E6:2 F6:2 G6:2 A6:2',
  ];
  const BREAK = ['A5:2 r:2 A5:2 r:2 G5:2 F5:2 E5:2 D5:2', 'G5:2 r:2 G5:2 r:2 F5:2 E5:2 D5:2 C5:2', 'G5:2 r:2 G5:2 r:2 B5:2 D6:2 C6:2 B5:2', 'D5:2 E5:2 F5:2 G5:2 A5:2 Bb5:2 C6:2 C#6:2'];
  const battleBars = [
    ...PROG.map((ch, i) => ({ ch, dr: i < 2 ? 'intro1' : 'intro2', bass: 'drive' })),
    ...PROG.map((ch, i) => ({ ch, mel: HOOK[i], dr: 'full', crash: i === 0 })),
    ...PROG.map((ch, i) => ({ ch, mel: i === 3 ? RUN : HOOK[i], dr: i === 3 ? 'fill' : 'full' })),
    ...SOAR.map((mel, i) => ({ ch: PROG[i % 4], mel, dr: i === 7 ? 'fill' : 'drive', harm: true, pad: true, crash: i % 4 === 0 })),
    ...BREAK.map((mel, i) => ({ ch: PROG[i], mel, dr: i === 3 ? 'roll' : 'half', bass: i === 3 ? 'drive' : 'half', arp: true })),
    ...PROG.map((ch, i) => ({ ch, mel: HOOK[i], dr: 'drive', harm: true, saw: true, pad: true, crash: i === 0 })),
    ...PROG.map((ch, i) => ({ ch, mel: i === 3 ? RUN : HOOK[i], dr: i === 3 ? 'fill' : 'drive', harm: true, saw: true, pad: true })),
  ];

  const SONGS = {
    battle: song({ bpm: 120, bass: 'drive', lead: 'battle', loop: 4, bars: battleBars }),
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

  // Tierce inférieure dans la gamme de l'accord en cours
  function harmony(m, ch) {
    const sc = ch === 'B' ? [2, 4, 5, 7, 9, 11, 0] : ch === 'A' ? [2, 4, 5, 7, 9, 10, 1] : [2, 4, 5, 7, 9, 10, 0];
    for (const d of [3, 4]) if (sc.includes(((m - d) % 12 + 12) % 12)) return m - d;
    return m - 5;
  }
  function lead(sg, bar, m, dur, t, g) {
    if (sg.lead === 'battle') {
      tone(mf(m), dur * 0.92, { w: 'p25', v: 0.07, t, bus: g, send: delayIn, vib: dur > 0.25 ? [6, 6] : null });
      tone(mf(m) * 1.005, dur * 0.9, { w: 'p25', v: 0.028, t, bus: g });
      if (bar.harm) tone(mf(harmony(m, bar.chName)), dur * 0.9, { w: 'p50', v: 0.032, t, bus: g });
      if (bar.saw) tone(mf(m + 12), dur * 0.9, { w: 'sawtooth', v: 0.03, t, bus: g, lp: 3200, vib: dur > 0.25 ? [6, 8] : null });
    } else if (sg.lead === 'box') {
      tone(mf(m), dur * 1.6, { w: 'triangle', v: 0.13, t, bus: g, decay: true });
      tone(mf(m + 12), dur, { w: 'sine', v: 0.04, t, bus: g, decay: true });
    } else {
      tone(mf(m), dur * 0.95, { w: 'p50', v: 0.04, t, bus: g, a: 0.06, r: 0.25, vib: [5, 3], send: delayIn });
      tone(mf(m), dur * 0.95, { w: 'triangle', v: 0.08, t, bus: g, a: 0.06, r: 0.25 });
    }
  }
  function drums(p, s, t, g, sd) {
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
      case 'roll': if (s === 0 || s === 8) kick(); snare(0.04 + s * 0.012); break;
      case 'fill':
        if (s === 0 || s === 4) kick(); if (s === 2 || s === 6) snare();
        if (s === 8) tom(220); if (s === 10) tom(180); if (s === 12) tom(140);
        if (s >= 13) snare(0.15 + (s - 13) * 0.04);
        hat(0.02); break;
    }
    void sd;
  }
  const DRIVE = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12];
  function playStep(sg, step, t, sd, g) {
    const bar = sg.bars[Math.floor(step / 16)], s = step % 16;
    if (bar.crash && s === 0) nz(1.4, { ft: 'highpass', f: 5000, v: 0.13, t, bus: g });
    for (const n of bar.mel) if (n.s === s) lead(sg, bar, n.m, n.len * sd, t, g);
    const bass = bar.bass || sg.bass, root = bar.ch[0];
    if (bass === 'drive') {
      tone(mf(root + DRIVE[s]), sd * 0.8, { w: 'p50', v: 0.085, t, bus: g, r: 0.02 });
      if (s % 8 === 0) tone(mf(root - 12), sd * 4, { w: 'triangle', v: 0.16, t, bus: g, r: 0.05 });
    } else if (bass === 'half') {
      if (s % 8 === 0) { tone(mf(root), sd * 7, { w: 'p50', v: 0.07, t, bus: g, r: 0.1 }); tone(mf(root - 12), sd * 7, { w: 'triangle', v: 0.16, t, bus: g, r: 0.1 }); }
    } else if (bass === 'oct') {
      if (s % 2 === 0) tone(mf(root + (s % 4 === 2 ? 12 : 0)), sd * 1.7, { w: 'p50', v: 0.1, t, bus: g, r: 0.03 });
    } else if (s === 0) {
      tone(mf(root + 12), sd * 16, { w: 'triangle', v: 0.12, t, bus: g, a: 0.05, r: 0.4 });
      for (const m of bar.ch[1]) tone(mf(m), sd * 16, { w: 'sine', v: 0.018, t, bus: g, a: 0.3, r: 0.6 });
    }
    if (bar.pad && s === 0) for (const m of bar.ch[1]) tone(mf(m), sd * 16, { w: 'sawtooth', v: 0.014, t, bus: g, a: 0.15, r: 0.3, lp: 1600 });
    if (bar.arp) tone(mf(bar.ch[1][s % 3] + 12 + (s % 6 >= 3 ? 12 : 0)), sd * 0.9, { w: 'p12', v: 0.035, t, bus: g, send: delayIn });
    drums(bar.dr, s, t, g, sd);
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
