'use strict';
// Sons générés en temps réel avec la Web Audio API (aucun fichier).
// Chaîne : les sons du champ de bataille sont spatialisés (panoramique selon la caméra, filtre de l'air,
// retard du son, réverbération propre à la carte) et passent par le bus extérieur, étouffé dans la
// lunette ; ceux du char du joueur (moteur, chenilles, tourelle, culasse, interphone) passent par le bus
// intérieur. Les deux rejoignent master (volume des effets). La musique synthétisée a son propre bus.
const Sfx = (() => {
  let ac = null, comp = null, master = null, noiseBuf = null, eng = null, trk = null, vol = 0.8;
  let ext = null, extLp = null, extG = null, self = null, selfG = null, ratD = null;
  let verbIn = null, verb = null, verbG = null, room = '', roomWant = 'open', tankArgs = null, dst = null, inside = false, gearWas = null, icT = -9, stT = -9;
  const pool = [], ends = [];
  // quatre coupures indépendantes : touche M (muted), publicité (adMute), onglet masqué (bgMute)
  // et réglage « muet » du portail CrazyGames (portalMute)
  let muted = false, adMute = false, bgMute = false, portalMute = false;
  const VOL = 0.55, MAXV = 32;
  const hold = () => adMute || bgMute || portalMute;
  // Applique les coupures : gain nul, et contexte suspendu tant qu'une coupure extérieure dure,
  // pour que moteur et chenilles ne bourdonnent pas derrière une publicité ou dans un onglet masqué
  function apply() {
    if (!ac) return;
    master.gain.value = muted || hold() ? 0 : VOL * vol;
    musicGain();
    try {
      if (hold() && ac.state === 'running') ac.suspend().catch(() => {});
      else if (!hold() && ac.state === 'suspended') ac.resume().catch(() => {});
    } catch (e) { /* contexte audio fermé */ }
  }

  // Caractère des moteurs : cylindres (fréquence d'allumage = tr/min ÷ 60 × cyl ÷ 2), coupure du filtre
  // (Hz), poids du vilebrequin (triangle à f/2) et souffle de l'échappement (bruit à 3f)
  const ENGINES = {
    light: { cyl: 6, lp: 700, rumble: 0.5, exh: 0.5 },    // Maybach HL 66 P : 6 cylindres en ligne
    pz4: { cyl: 12, lp: 520, rumble: 0.8, exh: 0.4 },     // HL 120 TRM : V12 de 11,9 l
    medium: { cyl: 12, lp: 420, rumble: 1.3, exh: 0.35 }, // HL 230 : V12 de 23 l, plus grave et plus lourd
  };
  ENGINES.stug = ENGINES.pz4;
  ENGINES.heavy = ENGINES.destroyer = ENGINES.kingtiger = ENGINES.medium;
  // Alliés : diesel V-2 (V12 de 38,9 l, claquant), radial Continental R975 (9 cylindres, sec et aigu),
  // V8 Ford GAA, Chrysler Multibank (30 cylindres, bourdonnant), deux diesels deux-temps GM 6-71 (hurlants)
  Object.assign(ENGINES, {
    t34: { cyl: 12, lp: 460, rumble: 1.0, exh: 0.6 }, m4a1: { cyl: 9, lp: 640, rumble: 0.55, exh: 0.55 },
    m4a3e8: { cyl: 8, lp: 480, rumble: 1.1, exh: 0.45 }, firefly: { cyl: 30, lp: 560, rumble: 0.6, exh: 0.4 }, m10: { cyl: 24, lp: 700, rumble: 0.7, exh: 0.6 },
  });
  ENGINES.t3485 = ENGINES.kv1s = ENGINES.is2 = ENGINES.t34;
  // Chenilles selon le sol : [hauteur, niveau] du claquement (sol dur : clair et fort ; boue, neige : sourd)
  const GROUND = { road: [1.5, 1.25], packed: [1.25, 1], track: [1, 1], steppe: [0.9, 0.9], forest: [0.75, 0.8], mud: [0.6, 0.7],
    sand: [0.7, 0.75], snow: [0.65, 0.7], rubble: [1.3, 1.3], crater: [0.9, 1], trunk: [1.1, 1.2] };
  // Réverbération de la carte : [durée (s), réflexions précoces (troncs, façades), niveau]
  const ROOMS = { open: [1.6, 0, 0.5], desert: [1.6, 0, 0.35], snow: [1.3, 0, 0.3], forest: [2.4, 14, 0.8], city: [2.4, 22, 0.9] };

  const mkPan = () => ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
  const setPan = (p, v, t) => { if (p.pan) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), t, 0.05); };
  const lpOf = dm => 300 + 16000 * Math.exp(-dm / 350);

  // Voix de moteur : allumage (dent de scie à f), vilebrequin (triangle à f/2) et échappement
  function engineVoice(to) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle';
    const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    const ng = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.Q.value = 2; g.gain.value = 0;
    o.connect(f); o2.connect(g2); g2.connect(f); ns.connect(bp); bp.connect(ng); ng.connect(g); f.connect(g); g.connect(to);
    o.start(); o2.start(); ns.start(0, Math.random());
    return { o, o2, g2, bp, ng, f, g, E: ENGINES.pz4, rated: 3000, id: null };
  }
  function engineSet(v, rpmA, load, gain) {
    const t = ac.currentTime, E = v.E, f = Math.max(10, rpmA / 60 * E.cyl / 2);
    v.o.frequency.setTargetAtTime(f, t, 0.09); v.o2.frequency.setTargetAtTime(f / 2, t, 0.09);
    v.bp.frequency.setTargetAtTime(f * 3, t, 0.09);
    v.f.frequency.setTargetAtTime(E.lp * (0.8 + load * 0.6) + f * 0.5, t, 0.12);
    v.g2.gain.setTargetAtTime(E.rumble, t, 0.1); v.ng.gain.setTargetAtTime(E.exh * (0.15 + 0.35 * load), t, 0.1);
    v.g.gain.setTargetAtTime(gain, t, 0.2);
  }

  function init() {
    if (ac) { apply(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted || hold() ? 0 : VOL * vol;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // bus extérieur (filtre de la lunette) et bus intérieur (vibration de la caisse à 30 Hz dans la lunette)
    ext = ac.createGain(); extLp = ac.createBiquadFilter(); extLp.type = 'lowpass'; extLp.frequency.value = 20000; extLp.Q.value = 0.5;
    extG = ac.createGain(); ext.connect(extLp); extLp.connect(extG); extG.connect(master);
    self = ac.createGain(); selfG = ac.createGain(); self.connect(selfG); selfG.connect(master);
    const rat = ac.createGain(), rl = ac.createOscillator(); ratD = ac.createGain(); ratD.gain.value = 0;
    rl.frequency.value = 30; rl.connect(ratD); ratD.connect(rat.gain); rat.connect(self); rl.start();
    verbIn = ac.createGain(); verbG = ac.createGain(); verbG.connect(ext);
    setRoom(roomWant);

    // Moteur du char du joueur
    eng = engineVoice(rat);
    // autres chars : trois voix réservées aux plus proches qui roulent, vus ou non
    for (let i = 0; i < 3; i++) {
      const pn = mkPan(), lp = ac.createBiquadFilter(); lp.type = 'lowpass';
      pn.connect(lp); lp.connect(ext);
      pool.push(Object.assign(engineVoice(pn), { pn, lp }));
    }

    // Chenilles : bruit filtré modulé par le passage des maillons sur le barbotin (pas de 15 cm)
    const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const tf = ac.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 700; tf.Q.value = 0.9;
    const tg = ac.createGain(); tg.gain.value = 0;
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 5;
    const lg = ac.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    ns.connect(tf); tf.connect(am); am.connect(tg); tg.connect(rat);
    ns.start(); lfo.start();
    // tourelle : pompe hydraulique, moteur électrique ou cliquet de la manivelle (voir setTank)
    const to = ac.createOscillator(); to.type = 'sawtooth'; to.frequency.value = 110;
    const tlp = ac.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 600;
    const tgg = ac.createGain(); tgg.gain.value = 0;
    to.connect(tlp); tlp.connect(tgg); tgg.connect(self); to.start();
    trk = { tg, lfo, tf, tgg, to, tlp, kind: 'hyd' };
    if (tankArgs) api.setTank(...tankArgs);
    apply();
  }

  // Réverbération : bruit stéréo qui décroît de 60 dB sur la durée, plus des réflexions précoces serrées
  function setRoom(k) {
    roomWant = k;
    if (!ac || k === room || !ROOMS[k]) return;
    room = k;
    const [len, refl, lvl] = ROOMS[k], sr = ac.sampleRate, n = Math.floor(sr * len), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * i / n);
      for (let j = 0; j < refl; j++) { const i = Math.floor(sr * (0.015 + Math.random() * 0.22)); d[i] += (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8) * Math.exp(-8 * i / sr); }
    }
    // un convolueur neuf à chaque carte (certains navigateurs refusent de changer sa réponse)
    if (verb) { verbIn.disconnect(); verb.disconnect(); }
    verb = ac.createConvolver(); verb.buffer = b;
    verbIn.connect(verb); verb.connect(verbG); verbG.gain.value = lvl * 0.3;
  }

  // Atténuation avec la distance (m) : sons ordinaires jusqu'à 1,2 km, canons et explosions jusqu'à 4 km
  const att = d => d == null ? 1 : Math.pow(Math.max(0, 1 - d / 1200), 1.6);
  const attFar = d => d == null ? 1 : Math.pow(Math.max(0, 1 - d / 4000), 3);

  function noise(t0, dur, freq, q, gain, type, fEnd) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dst || master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  function tone(t0, dur, f0, f1, gain, type) {
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dst || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // Voie d'un son placé : panoramique → filtre de l'air → bus extérieur, et envoi vers la réverbération
  // (plus fort au loin) ; fc fixe le filtre (écho tardif)
  function chain(dm, pan, wet, fc) {
    const pn = mkPan(), lp = ac.createBiquadFilter(), s = ac.createGain();
    if (pn.pan) pn.pan.value = Math.max(-1, Math.min(1, pan));
    lp.type = 'lowpass'; lp.frequency.value = fc || lpOf(dm);
    s.gain.value = Math.min(1, wet + 0.15 + 0.5 * Math.min(1, dm / 800));
    pn.connect(lp); lp.connect(ext); lp.connect(s); s.connect(verbIn);
    return pn;
  }
  const ok = () => ac && !muted && !hold();
  // son du char du joueur, sur le bus intérieur
  function inner(fn, t) { if (!ok()) return; dst = self; fn(t || ac.currentTime); dst = null; }

  // p : distance en mètres (nombre, droit devant) ou { d, pan } ; null : son d'interface (sans espace).
  // o : far (portée des canons), delay (le son voyage à 343 m/s), echo (écho tardif au-delà de 300 m),
  // wet (réverbération en plus), low (sacrifiable quand trop de voix jouent)
  function play(p, fn, o = {}) {
    if (!ok()) return;
    const d = p == null ? null : typeof p === 'number' ? p : p.d, pan = p && p.pan || 0;
    const a = o.far ? attFar(d) : att(d);
    if (a < 0.02) return;
    const now = ac.currentTime;
    for (let i = ends.length; i--;) if (ends[i] < now) ends.splice(i, 1);
    if (o.low && ends.length >= MAXV) return;
    const dm = d || 0, t = now + (o.delay && dm > 120 ? dm / 343 : 0);
    ends.push(t + 1.2);
    dst = d == null ? master : chain(dm, pan, o.wet || 0);
    fn(t, a);
    if (o.echo && dm > 300) { dst = chain(dm, -pan * 0.5, 0.3, 600); fn(t + 0.4 + Math.random() * 0.5, a * 0.32); }
    dst = null;
  }

  // Étapes du chargement du joueur (fraction du temps de rechargement) : obus tiré du râtelier, refoulé
  // dans la chambre, culasse qui se ferme puis « prêt » à l'interphone
  const breech = t => { noise(t, 0.04, 1800, 2, 0.3, 'bandpass'); tone(t, 0.15, 160, 120, 0.3, 'square'); };
  const LOAD = [
    [0.3, t => { noise(t, 0.35, 1300, 1.2, 0.08, 'bandpass', 700); tone(t + 0.3, 0.08, 700, 600, 0.04, 'triangle'); }],
    [0.82, t => { tone(t, 0.12, 90, 60, 0.35, 'sine'); noise(t, 0.1, 600, 1, 0.2, 'lowpass'); }],
    [1, t => { breech(t); intercom(t + 0.35, true); }],
  ];
  // bip d'interphone : souffle filtré et deux petites tonalités
  function intercom(t, force) {
    if (!ok() || !force && t - icT < 1.5) return;
    icT = t;
    const k = inside ? 1 : 0.5;
    dst = self;
    noise(t, 0.06, 2500, 2, 0.06 * k, 'bandpass');
    tone(t + 0.02, 0.04, 1400, 1400, 0.03 * k, 'square'); tone(t + 0.09, 0.05, 1100, 1100, 0.025 * k, 'square');
    dst = null;
  }

  // ===================== Musique synthétisée =====================
  // Ré mineur, i–VI–III–VII, deux mesures par accord. Couches : nappe (deux scies désaccordées par note,
  // filtre à 700 Hz, attaque lente), ostinato de basse en croches (triangle), caisse claire en rythme de
  // marche (bruit à 1,8 kHz) et cuivres (scies, enveloppe de filtre). Le menu joue la nappe, l'ostinato
  // et un thème de cor lent ; en bataille, l'intensité du combat ouvre les couches une à une.
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const ss = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const PROG = [[50, 53, 57, 38], [46, 50, 53, 34], [53, 57, 60, 41], [48, 52, 55, 36]]; // nappe (3 notes) + basse : Ré m, Si♭, Fa, Do
  const STYLE = {
    // ost : demi-tons au-dessus de la basse par croche (−1 : silence) ; snare : accent par croche ;
    // mel : thème en blanches, une note par demi-mesure ; stab : croches des coups de cuivres
    menu: { bpm: 66, ost: [0, -1, 7, -1, 12, -1, 7, -1], snare: [0, 0, 0, 0, 0, 0, 0.35, 0.55],
      mel: [[69, 65, 62, 65], [70, 65, 62, 58], [72, 69, 65, 60], [67, 64, 60, 64]] },
    battle: { bpm: 84, ost: [0, 0, 12, 0, 0, 0, 12, 7], snare: [1, 0, 0.45, 0.45, 0.8, 0, 0.45, 0.6], stab: [0, 3, 6, 10, 12, 14] },
  };
  const LV = [0.05, 0.16, 0.22, 0.07], MV = 1; // niveaux des couches (nappe, ostinato, caisse claire, cuivres)
  // Piste du menu facultative : si un fichier est livré un jour (par exemple 'music/menu.mp3'), il remplace
  // le thème synthétisé ; s'il ne se charge pas, on revient au thème synthétisé sans réessayer.
  const MENU_FILE = '';
  let fileEl = null, fileBad = !MENU_FILE;
  const Mu = { on: false, want: '', mode: 'menu', vol: 0.6, duck: 1, I: 0, Is: 0, L: [0, 0, 0, 0] };

  function musicGain() {
    if (!Mu.on) return;
    Mu.bus.gain.setTargetAtTime(muted || hold() ? 0 : Mu.vol * MV * Mu.duck, ac.currentTime, 0.3);
  }
  function musicStart() {
    const M = Mu, osc = (type, to) => { const o = ac.createOscillator(); o.type = type; o.connect(to); o.start(); M.oscs.push(o); return o; };
    const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; g.connect(to); return g; };
    const lp = (f, to) => { const b = ac.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.connect(to); return b; };
    M.on = true; M.oscs = []; M.step = 0; M.nextT = ac.currentTime + 0.1; M.last = ac.currentTime;
    M.bus = gain(0, comp);
    M.lay = LV.map(() => gain(0, M.bus));
    M.padEnv = gain(1, M.lay[0]); M.padLp = lp(700, M.padEnv);
    M.pad = [0, 1, 2, 3, 4, 5].map(i => { const o = osc('sawtooth', M.padLp); o.detune.value = i & 1 ? 7 : -7; o.frequency.value = mtof(PROG[0][i >> 1]); return o; });
    M.ostEnv = gain(0, M.lay[1]); M.ost = osc('triangle', M.ostEnv); M.ost2 = osc('triangle', gain(0.35, M.ostEnv));
    M.brEnv = gain(0, M.lay[3]); M.brLp = lp(500, M.brEnv); M.brLp.Q.value = 3;
    M.br = [osc('sawtooth', M.brLp), osc('sawtooth', gain(0.6, M.brLp))];
    M.timer = setInterval(musicTick, 90);
    musicGain();
  }
  function musicStop() {
    const M = Mu;
    if (!M.on) return;
    M.on = false; clearInterval(M.timer);
    const t = ac.currentTime, b = M.bus;
    b.gain.setTargetAtTime(0, t, 0.15);
    for (const o of M.oscs) o.stop(t + 0.8);
    setTimeout(() => b.disconnect(), 1200);
  }
  function brass(M, t, f, dur, at) {
    M.br.forEach((o, i) => o.frequency.setTargetAtTime(f * (i ? 0.5 : 1), t, 0.02));
    const g = M.brEnv.gain, q = M.brLp.frequency;
    g.cancelScheduledValues(t); g.setTargetAtTime(1, t, at); g.setTargetAtTime(0, t + dur, 0.12);
    q.cancelScheduledValues(t); q.setTargetAtTime(2400, t, at * 1.5); q.setTargetAtTime(500, t + at * 3, dur * 0.6);
  }
  function snare(M, t, v) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    s.connect(f); f.connect(g); g.connect(M.lay[2]);
    s.start(t, Math.random()); s.stop(t + 0.15);
  }
  function musicStep(M, S, n, t, e) {
    const ci = (n >> 4) & 3, c = PROG[ci], s = n & 15, b = s & 7;
    if (s === 0) {
      // nouvel accord : la nappe glisse vers ses notes et regonfle lentement
      M.pad.forEach((o, i) => o.frequency.setTargetAtTime(mtof(c[i >> 1]), t, 0.06));
      M.padEnv.gain.setTargetAtTime(0.5, t, 0.05); M.padEnv.gain.setTargetAtTime(1, t + 0.12, 1.2);
    }
    const ov = S.ost[b];
    if (ov >= 0) {
      const f = mtof(c[3] + ov), p = M.ostEnv.gain;
      M.ost.frequency.setValueAtTime(f, t); M.ost2.frequency.setValueAtTime(f * 2, t);
      p.cancelScheduledValues(t); p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(1, t + 0.008); p.exponentialRampToValueAtTime(0.001, t + e * 0.85);
    }
    if (S.snare[b] && M.L[2] > 0.02) snare(M, t, S.snare[b] * (s === 15 ? 1.2 : 1));
    if (S.mel && s % 4 === 0) brass(M, t, mtof(S.mel[ci][s >> 2]), e * 3.6, 0.15);
    if (S.stab && S.stab.includes(s) && M.L[3] > 0.02) brass(M, t, mtof(c[0] + 12), e * 0.8, 0.015);
  }
  function musicTick() {
    const M = Mu;
    if (!M.on || ac.state !== 'running') return;
    const S = STYLE[M.mode], e = 30 / S.bpm, now = ac.currentTime, dt = now - M.last;
    M.last = now;
    if (M.nextT < now) M.nextT = now + 0.05; // rattrapage après une suspension
    M.Is += (M.I - M.Is) * (1 - Math.exp(-dt / (M.I > M.Is ? 1.2 : 4)));
    const I = M.Is;
    M.L = M.mode === 'menu' ? [1, 0.6, 0.3, 0.7] : [0.45 + 0.55 * ss(0, 0.2, I), ss(0.25, 0.45, I), ss(0.5, 0.7, I), ss(0.75, 0.9, I)];
    M.lay.forEach((g, i) => g.gain.setTargetAtTime(M.L[i] * LV[i], now, 0.4));
    while (M.nextT < now + 0.3) { musicStep(M, S, M.step, M.nextT, e); M.step++; M.nextT += e; }
  }
  // Ponctuations : victoire (ré majeur qui monte), défaite (descente et timbale), coup critique (appel bref)
  const STINGS = {
    win: [[62, 0, 1.8], [66, 0.12, 1.7], [69, 0.24, 1.6], [74, 0.36, 1.5]],
    lose: [[57, 0, 0.5], [53, 0.35, 0.5], [50, 0.7, 2.2], [38, 0.7, 2.2]],
    crit: [[74, 0, 0.22], [81, 0.09, 0.3]],
  };
  function sting(k) {
    if (!Mu.on || !ok() || !STINGS[k]) return;
    const t0 = ac.currentTime + 0.05, lv = k === 'crit' ? 0.25 : 1;
    if (k === 'crit' && t0 - stT < 1.2) return;
    stT = t0;
    if (k !== 'crit') { Mu.I = Mu.Is = 0; dst = Mu.bus; tone(t0, k === 'lose' ? 1.4 : 0.9, 75, 52, 0.5, 'sine'); dst = null; }
    for (const [m, at, dur] of STINGS[k]) {
      const t = t0 + at, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(m);
      f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.setTargetAtTime(2600, t, 0.05); f.frequency.setTargetAtTime(700, t + 0.15, dur * 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(0.09 * lv, t, 0.03); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
      o.connect(f); f.connect(g); g.connect(Mu.bus);
      o.start(t); o.stop(t + dur * 1.4);
    }
  }
  function useFile(v) {
    if (fileBad) return false;
    if (!fileEl) {
      fileEl = new Audio(MENU_FILE); fileEl.loop = true;
      fileEl.addEventListener('error', () => { fileBad = true; fileEl = null; if (Mu.want === 'menu') api.playMusic(Mu.vol, 'menu'); }, { once: true });
    }
    fileEl.volume = Math.min(1, v); fileEl.play().catch(() => {});
    return true;
  }

  const api = {
    init,
    toggle() { muted = !muted; apply(); return muted; },
    setUserMute(m) { muted = !!m; apply(); },
    // volume des effets (options) et coupures : publicité, onglet masqué, portail
    setVolume(v) { vol = v; apply(); },
    setMuted(m) { adMute = !!m; apply(); },
    setBgMute(m) { bgMute = !!m; apply(); },
    setPortalMute(m) { portalMute = !!m; apply(); },
    // vrai si une coupure empêche d'entendre quoi que ce soit (musique comprise)
    get silenced() { return muted || hold(); },
    get state() { return ac ? ac.state : 'none'; },
    // char du joueur (type, régime nominal, entraînement de la tourelle : hyd, elec, hand) et réverbération
    // de la carte (open, desert, snow, forest, city)
    setTank(id, rated, trav) {
      tankArgs = [id, rated, trav];
      if (!eng) return;
      eng.E = ENGINES[id] || ENGINES.pz4; eng.rated = rated || 3000; gearWas = null;
      trk.kind = trav || 'hyd';
      trk.to.type = trk.kind === 'hand' ? 'square' : 'sawtooth'; trk.tlp.type = trk.kind === 'hand' ? 'highpass' : 'lowpass';
      trk.tlp.frequency.value = trk.kind === 'hand' ? 1800 : trk.kind === 'elec' ? 1400 : 600;
    },
    setRoom,
    // Vue du tireur : l'extérieur s'étouffe (1,2 kHz, −4 dB), l'intérieur monte (+3 dB) et vibre ; clunk du périscope
    setInterior(on) {
      on = !!on;
      if (!ac || on === inside) return;
      inside = on;
      const t = ac.currentTime;
      extLp.frequency.setTargetAtTime(on ? 1200 : 20000, t, 0.05); extG.gain.setTargetAtTime(on ? 0.63 : 1, t, 0.05);
      selfG.gain.setTargetAtTime(on ? 1.41 : 1, t, 0.05); ratD.gain.setTargetAtTime(on ? 0.25 : 0, t, 0.05);
      inner(t => { tone(t, 0.12, 120, 80, 0.18, 'sine'); noise(t, 0.05, 900, 2, 0.12, 'bandpass'); });
    },
    // tir ; own : le joueur (infra-grave, réverbération large, douille qui tinte au sol de la tourelle)
    fire(p, big, own) {
      play(p, (t, a) => {
        const k = big ? 1.15 : 1;
        noise(t, 1.1 * k, 2600, 0.7, 0.95 * a, 'lowpass', 90);
        noise(t, 0.07, 5000, 0.5, 0.6 * a, 'highpass');
        tone(t, 0.55 * k, 120 / k, 32, 1.0 * a, 'sine');
      }, { far: 1, delay: 1, echo: 1, wet: own ? 0.35 : 0 });
      if (own) inner(t => {
        tone(t, 0.8, 45, 38, 0.5, 'sine');
        tone(t + 0.6, 0.4, 1100, 1000, 0.07, 'triangle'); tone(t + 0.85, 0.25, 960, 900, 0.035, 'triangle');
      });
    },
    explosion(p, big) {
      play(p, (t, a) => {
        noise(t, big ? 2.4 : 1.4, 1400, 0.6, 1.0 * a, 'lowpass', 50);
        tone(t, big ? 1.2 : 0.7, 80, 22, 1.0 * a, 'sine');
        if (big) noise(t + 0.15, 1.6, 600, 1, 0.5 * a, 'lowpass', 80);
      }, { far: 1, delay: 1, echo: 1 });
    },
    ricochet(p) {
      play(p, (t, a) => {
        tone(t, 0.45, 2600 + Math.random() * 900, 700, 0.22 * a, 'triangle');
        noise(t, 0.08, 4500, 3, 0.35 * a, 'bandpass');
      }, { delay: 1 });
    },
    clang(p) {
      play(p, (t, a) => {
        tone(t, 0.3, 540, 470, 0.28 * a, 'square');
        tone(t, 0.4, 1310, 1180, 0.14 * a, 'triangle');
        noise(t, 0.06, 3000, 2, 0.4 * a, 'bandpass');
      }, { delay: 1, low: 1 });
    },
    penetrate(p) {
      play(p, (t, a) => {
        tone(t, 0.25, 320, 160, 0.4 * a, 'square');
        noise(t, 0.5, 1800, 1, 0.7 * a, 'lowpass', 200);
        tone(t, 0.4, 90, 40, 0.7 * a, 'sine');
      }, { delay: 1 });
    },
    impact(p) {
      play(p, (t, a) => {
        noise(t, 0.5, 1200, 0.8, 0.6 * a, 'lowpass', 100);
        tone(t, 0.3, 90, 40, 0.4 * a, 'sine');
      }, { delay: 1, low: 1 });
    },
    tree(p) {
      play(p, (t, a) => {
        noise(t, 0.4, 900, 1.5, 0.5 * a, 'bandpass', 300);
        tone(t, 0.15, 180, 90, 0.3 * a, 'triangle');
      }, { low: 1 });
    },
    // rafale de mitrailleuse : un claquement par coup
    mg(p) {
      play(p, (t, a) => {
        noise(t, 0.05, 2600, 0.8, 0.32 * a, 'lowpass', 500);
        tone(t, 0.04, 160, 70, 0.25 * a, 'sine');
      }, { low: 1 });
    },
    // balle qui frappe l'acier
    ping(p) {
      play(p, (t, a) => { tone(t, 0.09, 2100 + Math.random() * 600, 1600, 0.09 * a, 'triangle'); noise(t, 0.03, 5000, 3, 0.12 * a, 'bandpass'); }, { low: 1 });
    },
    // coup critique infligé : petite cloche, plus grave pour les munitions et le feu
    critical(kind) {
      const f = { ammo: 520, fire: 620, track: 740, engine: 700, gun: 800, radio: 990, optic: 940 }[kind] || 880;
      play(null, (t, a) => { tone(t, 0.2, f * 2, f * 1.98, 0.07 * a, 'sine'); tone(t + 0.04, 0.28, f, f, 0.06 * a, 'triangle'); });
      sting('crit');
    },
    // obus passé tout près (p : point le plus proche) : claquement de l'onde de choc s'il est supersonique,
    // puis sifflement qui s'éloigne
    whiz(p, crack) {
      play(p, (t, a) => {
        if (crack) { noise(t, 0.012, 3000, 0.7, 0.9 * a, 'highpass'); tone(t, 0.02, 1400, 300, 0.3 * a, 'square'); }
        noise(t + (crack ? 0.02 : 0), 0.4, 3500, 7, 0.45 * a, 'bandpass', 500);
      });
    },
    smoke(p) {
      play(p, (t, a) => noise(t, 1.2, 2000, 0.5, 0.35 * a, 'highpass', 400));
    },
    // chargement du joueur, de a à b (fractions du temps de rechargement écoulées)
    loading(a, b) { for (const [at, fn] of LOAD) if (a < at && b >= at) inner(fn); },
    intercom() { if (ok()) intercom(ac.currentTime); },
    // confirmation d'un coup du joueur, sans distance : perforé (choc sourd et éclat), non perforé (bruit
    // mat), ricochet (sifflement aigu), coup critique (tintement en plus), destruction (deux notes de cuivre)
    confirm(kind) {
      play(null, (t, a) => {
        if (kind === 'ric') { tone(t, 0.14, 3000, 1800, 0.06 * a, 'triangle'); return; }
        if (kind === 'nopen') { tone(t, 0.1, 140, 120, 0.14 * a, 'sine'); noise(t, 0.05, 900, 1, 0.05 * a, 'lowpass'); return; }
        tone(t, 0.12, 220, 110, 0.12 * a, 'square'); noise(t, 0.06, 2500, 2, 0.1 * a, 'bandpass');
        if (kind === 'crit') tone(t + 0.07, 0.12, 1250, 1180, 0.05 * a, 'triangle');
        if (kind === 'kill') for (const [f, at, d] of [[392, 0.1, 0.22], [587, 0.3, 0.55]]) { tone(t + at, d, f, f * 0.995, 0.06 * a, 'sawtooth'); tone(t + at, d, f, f, 0.06 * a, 'triangle'); }
      });
    },
    // avis d'interface (mission, roue, réparation)
    notify() {
      play(null, (t, a) => { tone(t, 0.08, 900, 700, 0.12 * a, 'square'); tone(t + 0.09, 0.12, 400, 300, 0.15 * a, 'square'); });
    },
    // fanfare de déblocage : arpège de cuivres et scintillement ; rare = 1 à 3 (plus riche)
    unlock(rare = 1) {
      play(null, (t, a) => {
        const notes = [392, 494, 587, 784, 988].slice(0, 3 + Math.min(2, rare));
        notes.forEach((f, i) => { tone(t + i * 0.09, 0.5, f, f * 0.995, 0.07 * a, 'sawtooth'); tone(t + i * 0.09, 0.6, f * 2, f * 2, 0.03 * a, 'triangle'); });
        const e = t + notes.length * 0.09;
        tone(e, 1.1, notes[notes.length - 1], notes[notes.length - 1], 0.08 * a, 'triangle');
        for (let i = 0; i < 6 * rare; i++) tone(e + Math.random() * 0.8, 0.12, 2400 + Math.random() * 2400, 2000, 0.025 * a, 'sine');
        noise(e, 0.9, 6000, 1, 0.06 * a, 'highpass');
      });
    },
    alarm() {
      play(null, (t, a) => { tone(t, 0.12, 880, 870, 0.12 * a, 'square'); tone(t + 0.15, 0.12, 660, 650, 0.12 * a, 'square'); });
    },
    // régime moteur 0..1 (fraction du régime nominal, < 0 : coupé), charge 0..1 et rapport engagé
    // (un changement de rapport fait claquer la boîte)
    engine(rpm, load = 0, gear = 0) {
      if (!eng) return;
      const on = rpm > 0.05, r = Math.max(0, rpm);
      engineSet(eng, Math.max(400, r * eng.rated), load, on ? 0.04 + r * 0.07 + load * 0.05 : 0);
      if (on && gearWas !== null && gear !== gearWas) inner(t => { tone(t, 0.1, 150, 70, 0.12, 'triangle'); noise(t, 0.05, 1200, 1.5, 0.08, 'bandpass'); });
      gearWas = on ? gear : null;
    },
    // vitesse des chenilles (m/s, < 0 : à l'arrêt) et sol sous le char (identifiant de Vehicle.SOILS)
    tracks(vms, soil) {
      if (!trk) return;
      const t = ac.currentTime, k = vms < 0 ? 0 : Math.min(1, vms / 12), G = GROUND[soil] || GROUND.track;
      trk.lfo.frequency.setTargetAtTime(Math.max(2, vms / 0.15 * 0.5), t, 0.1);
      trk.tf.frequency.setTargetAtTime((500 + k * 900) * G[0], t, 0.1);
      trk.tg.gain.setTargetAtTime(vms <= 0.2 ? 0 : (0.03 + k * 0.09) * G[1], t, 0.15);
    },
    // k : vitesse de la tourelle 0..1 ; p : régime de la pompe hydraulique, k par défaut. Pompe : chant qui
    // suit le moteur ; électrique : sifflement plus aigu ; manivelle : cliquet au rythme des tours
    turret(k, p = k) {
      if (!trk) return;
      const t = ac.currentTime, h = trk.kind === 'hand', f = h ? 2 + k * 10 : trk.kind === 'elec' ? 300 + k * 80 : 90 + p * 70;
      trk.to.frequency.setTargetAtTime(f, t, 0.1);
      trk.tgg.gain.setTargetAtTime(k > 0.05 ? (h ? 0.05 : 0.012 + k * 0.025) : 0, t, 0.08);
    },
    // moteurs des autres chars : jusqu'à trois { id, type, d, pan, rpm (tr/min), k (vitesse 0..1) },
    // chacun garde sa voix tant qu'il reste dans la liste
    others(list) {
      if (!pool.length) return;
      const t = ac.currentTime, free = pool.filter(v => !list.some(s => s.id === v.id));
      for (const v of pool) v.used = false;
      for (const s of list) {
        const v = pool.find(v => v.id === s.id) || free.shift();
        if (!v) continue;
        v.id = s.id; v.used = true; v.E = ENGINES[s.type] || ENGINES.pz4;
        engineSet(v, s.rpm, s.k, (0.03 + 0.08 * s.k) * att(s.d));
        setPan(v.pn, s.pan, t); v.lp.frequency.setTargetAtTime(lpOf(s.d), t, 0.1);
      }
      for (const v of pool) if (!v.used) { v.id = null; v.g.gain.setTargetAtTime(0, t, 0.2); }
    },
    // musique : mode 'menu' ou 'battle', volume 0..1 ; l'intensité 0..1 du combat ouvre les couches,
    // duck baisse la musique de 6 dB (caméra d'impact) ; sting : 'win', 'lose', 'crit'
    playMusic(v, mode = 'menu') {
      if (!ac) return;
      Mu.vol = v; Mu.want = mode;
      if (mode === 'menu' && useFile(v)) { musicStop(); return; }
      if (fileEl) fileEl.pause();
      if (!Mu.on) musicStart();
      if (Mu.mode !== mode) { Mu.mode = mode; Mu.I = Mu.Is = 0; }
      musicGain();
    },
    stopMusic() { Mu.want = ''; if (fileEl) fileEl.pause(); if (ac) musicStop(); },
    setIntensity(I, duck) {
      const d = duck ? 0.5 : 1;
      Mu.I = Math.max(0, Math.min(1, I));
      if (d !== Mu.duck) { Mu.duck = d; musicGain(); }
    },
    sting,
  };
  return api;
})();
