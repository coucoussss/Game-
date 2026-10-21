'use strict';
// Sons générés en temps réel avec la Web Audio API (aucun fichier).
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null, eng = null, trk = null, muted = false;
  const VOL = 0.55;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOL;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Moteur du char du joueur : grondement continu
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 19;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; f.Q.value = 2;
    const g = ac.createGain(); g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o.start(); o2.start();
    eng = { o, o2, f, g };

    // Chenilles : bruit filtré modulé par le passage des maillons sur le barbotin (pas de 15 cm)
    const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const tf = ac.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 700; tf.Q.value = 0.9;
    const tg = ac.createGain(); tg.gain.value = 0;
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 5;
    const lg = ac.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    ns.connect(tf); tf.connect(am); am.connect(tg); tg.connect(master);
    ns.start(); lfo.start();
    // moteur électrique ou hydraulique de la tourelle : bourdonnement
    const to = ac.createOscillator(); to.type = 'sawtooth'; to.frequency.value = 110;
    const tlp = ac.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 600;
    const tgg = ac.createGain(); tgg.gain.value = 0;
    to.connect(tlp); tlp.connect(tgg); tgg.connect(master); to.start();
    trk = { tg, lfo, tf, tgg, to };
  }

  // Atténuation avec la distance à l'auditeur (la caméra)
  const att = d => d == null ? 1 : Math.pow(Math.max(0, 1 - d / 1900), 1.6);

  function noise(t0, dur, freq, q, gain, type, fEnd) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  function tone(t0, dur, f0, f1, gain, type) {
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function play(d, fn) {
    if (!ac || muted) return;
    const a = att(d);
    if (a < 0.02) return;
    fn(ac.currentTime, a);
  }

  return {
    init,
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : VOL; return muted; },
    fire(d, big) {
      play(d, (t, a) => {
        const k = big ? 1.15 : 1;
        noise(t, 1.1 * k, 2600, 0.7, 0.95 * a, 'lowpass', 90);
        noise(t, 0.07, 5000, 0.5, 0.6 * a, 'highpass');
        tone(t, 0.55 * k, 120 / k, 32, 1.0 * a, 'sine');
      });
    },
    explosion(d, big) {
      play(d, (t, a) => {
        noise(t, big ? 2.4 : 1.4, 1400, 0.6, 1.0 * a, 'lowpass', 50);
        tone(t, big ? 1.2 : 0.7, 80, 22, 1.0 * a, 'sine');
        if (big) noise(t + 0.15, 1.6, 600, 1, 0.5 * a, 'lowpass', 80);
      });
    },
    ricochet(d) {
      play(d, (t, a) => {
        tone(t, 0.45, 2600 + Math.random() * 900, 700, 0.22 * a, 'triangle');
        noise(t, 0.08, 4500, 3, 0.35 * a, 'bandpass');
      });
    },
    clang(d) {
      play(d, (t, a) => {
        tone(t, 0.3, 540, 470, 0.28 * a, 'square');
        tone(t, 0.4, 1310, 1180, 0.14 * a, 'triangle');
        noise(t, 0.06, 3000, 2, 0.4 * a, 'bandpass');
      });
    },
    penetrate(d) {
      play(d, (t, a) => {
        tone(t, 0.25, 320, 160, 0.4 * a, 'square');
        noise(t, 0.5, 1800, 1, 0.7 * a, 'lowpass', 200);
        tone(t, 0.4, 90, 40, 0.7 * a, 'sine');
      });
    },
    impact(d) {
      play(d, (t, a) => {
        noise(t, 0.5, 1200, 0.8, 0.6 * a, 'lowpass', 100);
        tone(t, 0.3, 90, 40, 0.4 * a, 'sine');
      });
    },
    tree(d) {
      play(d, (t, a) => {
        noise(t, 0.4, 900, 1.5, 0.5 * a, 'bandpass', 300);
        tone(t, 0.15, 180, 90, 0.3 * a, 'triangle');
      });
    },
    // rafale de mitrailleuse : un claquement par coup
    mg(d) {
      play(d, (t, a) => {
        noise(t, 0.05, 2600, 0.8, 0.32 * a, 'lowpass', 500);
        tone(t, 0.04, 160, 70, 0.25 * a, 'sine');
      });
    },
    // balle qui frappe l'acier
    ping(d) {
      play(d, (t, a) => { tone(t, 0.09, 2100 + Math.random() * 600, 1600, 0.09 * a, 'triangle'); noise(t, 0.03, 5000, 3, 0.12 * a, 'bandpass'); });
    },
    whiz() {
      play(null, (t, a) => noise(t, 0.4, 3500, 7, 0.45 * a, 'bandpass', 500));
    },
    smoke(d) {
      play(d, (t, a) => noise(t, 1.2, 2000, 0.5, 0.35 * a, 'highpass', 400));
    },
    reload() {
      play(null, (t, a) => { tone(t, 0.08, 900, 700, 0.12 * a, 'square'); tone(t + 0.09, 0.12, 400, 300, 0.15 * a, 'square'); });
    },
    alarm() {
      play(null, (t, a) => { tone(t, 0.12, 880, 870, 0.12 * a, 'square'); tone(t + 0.15, 0.12, 660, 650, 0.12 * a, 'square'); });
    },
    engine(v) {
      if (!eng) return;
      const t = ac.currentTime;
      // boîte à 7 rapports : le régime monte dans chaque rapport puis retombe au passage du suivant
      const g7 = Math.max(0, v) * 7, rpm = v < 0 ? 0 : Math.min(1, g7 < 1 ? 0.35 + g7 * 0.55 : 0.55 + (g7 % 1) * 0.45);
      eng.o.frequency.setTargetAtTime(34 + rpm * 52, t, 0.09);
      eng.o2.frequency.setTargetAtTime(17 + rpm * 26, t, 0.09);
      eng.f.frequency.setTargetAtTime(150 + rpm * 340, t, 0.12);
      eng.g.gain.setTargetAtTime(v < 0 ? 0 : 0.06 + v * 0.1, t, 0.2);
    },
    tracks(vms) {
      if (!trk) return;
      const t = ac.currentTime, k = vms < 0 ? 0 : Math.min(1, vms / 12);
      trk.lfo.frequency.setTargetAtTime(Math.max(2, vms / 0.15 * 0.5), t, 0.1);
      trk.tf.frequency.setTargetAtTime(500 + k * 900, t, 0.1);
      trk.tg.gain.setTargetAtTime(vms <= 0.2 ? 0 : 0.03 + k * 0.09, t, 0.15);
    },
    turret(k) {
      if (!trk) return;
      const t = ac.currentTime;
      trk.to.frequency.setTargetAtTime(90 + k * 70, t, 0.1);
      trk.tgg.gain.setTargetAtTime(k > 0.05 ? 0.012 + k * 0.025 : 0, t, 0.08);
    },
  };
})();
