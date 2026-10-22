'use strict';
// Mécanique de conduite des chars, sans rendu ni état de partie (unités SI : m, s, kg, N, W).
// - données historiques approximatives de chaque char : boîte (vitesse de chaque rapport au régime
//   nominal), régime régulé, direction, entraînement de tourelle, débattement et vitesse de pointage
// - sols : résistance au roulement, adhérence longitudinale et latérale, enfoncement selon la pression
// - moteur et boîte automatique : courbe de puissance, régime, rupture de couple pendant les passages
// - direction : lacet visé (embrayages et freins, ou différentielle à rayon fixe par rapport et pivot
//   au point mort), retard d'inertie, limite d'adhérence latérale et dérapage, puissance de braquage
// - collisions en boîtes orientées (théorème des axes séparateurs) : dégagement et point de contact
const Vehicle = (() => {
  const G = 9.81, D2R = Math.PI / 180, KMH = 1 / 3.6, ETA = 0.6, IDLE = 800;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // rapports en progression géométrique de la première à la dernière (km/h au régime nominal)
  const geo = (a, b, n) => Array.from({ length: n }, (_, i) => +(a * Math.pow(b / a, i / (n - 1))).toFixed(1));
  // boîtes synchronisées (passage ≈ 0,8 s, marche arrière ≈ 1,2 s) et présélectives Maybach Olvar
  const SYNC = { name: 'synchromesh', shift: 0.8, rs: 1.2 }, OLVAR = { name: 'Olvar preselector', shift: 0.45, rs: 0.8 };
  const PZ3 = { gears: [4.2, 8.3, 14.4, 21.5, 29.8, 40.8], rev: [5.4], rated: 3000, gov: 2800, box: SYNC, press: 0.89 };
  const PANTHER = { gears: geo(4.8, 55, 7), rev: [4.8], rated: 3000, gov: 2500, box: SYNC, steer: { kind: 'regen', r: [5, 80], neutral: 25 }, press: 0.88, ext: 1 };
  // trav : vitesse de tourelle en °/s. hyd : pompe entraînée par le moteur, de idle (ralenti) à max au
  // régime rpm ; elec : génératrice auxiliaire, indépendante du moteur ; hand : manivelle seule.
  // elev : débattement du canon (°) ; elevRate : volant de pointage en hauteur (°/s)
  const DATA = {
    // Pz.Kpfw. II L Luchs : HL 66 P, 180 ch à 3200 tr/min, boîte 6+1, embrayages et freins
    light: { gears: geo(5, 60, 6), rev: [7], rated: 3200, gov: 3200, box: SYNC, steer: { kind: 'clutch', max: 45 }, trav: { kind: 'hand', hand: 9 }, elev: [-9, 18], elevRate: 5, press: 0.8 },
    // Pz.Kpfw. IV H : HL 120 TRM, 300 ch, SSG 76 6+1, tourelle électrique (groupe DKW)
    pz4: Object.assign({}, PZ3, { steer: { kind: 'clutch', max: 36 }, trav: { kind: 'elec', max: 14, hand: 3 }, elev: [-8, 20], elevRate: 4 }),
    // StuG III G : même moteur, SSG 77 6+1, casemate pointée à la main (±10°)
    stug: Object.assign({}, PZ3, { steer: { kind: 'clutch', max: 36 }, trav: { kind: 'hand', hand: 3 }, elev: [-6, 20], elevRate: 4, press: 0.93 }),
    // Panther A/G : HL 230 P30, 700 ch à 3000 tr/min régulé à 2500, ZF AK 7-200 7+1, direction MAN à un
    // rayon par rapport, tourelle hydraulique à deux vitesses
    medium: Object.assign({}, PANTHER, { trav: { kind: 'hyd', idle: 5, max: 18, rpm: 3000, hand: 1 }, elev: [-8, 18], elevRate: 4 }),
    // Jagdpanther : châssis du Panther, casemate pointée à la main (±11°)
    destroyer: Object.assign({}, PANTHER, { trav: { kind: 'hand', hand: 3 }, elev: [-8, 14], elevRate: 4 }),
    // Tiger I : HL 230 P45, Olvar 40 12 16 8+4 (marches arrière = 4 premiers rapports), direction
    // Henschel L 600 C, tourelle hydraulique sur le moteur (≈ 6 °/s à 2000 tr/min, 2 °/s au ralenti)
    heavy: { gears: [2.8, 4.3, 6.2, 9.2, 14.1, 20.0, 30.5, 45.4], rev: [2.8, 4.3, 6.2, 9.2], rated: 3000, gov: 2500, box: OLVAR, steer: { kind: 'regen', r: [3.4, 165], neutral: 20 }, trav: { kind: 'hyd', idle: 2, max: 7, rpm: 2500, hand: 0.7 }, elev: [-8, 15], elevRate: 4, press: 1.05, ext: 1 },
    // Tiger II : HL 230 P30, Olvar B 8+4, direction L 801, tourelle : 360° en 19 s à 2000 tr/min, 77 s à 1000
    kingtiger: { gears: geo(2.6, 41.5, 8), rev: geo(2.6, 41.5, 8).slice(0, 4), rated: 3000, gov: 2500, box: OLVAR, steer: { kind: 'regen', r: [3.5, 165], neutral: 15 }, trav: { kind: 'hyd', idle: 1.9, max: 19, rpm: 2000, hand: 0.6 }, elev: [-8, 15], elevRate: 4, press: 1.0, ext: 1 },
  };
  // Sols : crr, résistance au roulement ; mu, adhérence (traction, freinage) ; lat, adhérence latérale ;
  // sink, sensibilité à la pression au sol ; path, coût pour l'itinéraire ; bump, bosses
  const SOILS = [
    { id: 'road', name: 'road', crr: 0.035, mu: 0.85, lat: 0.65, sink: 0, path: 0.7 },
    { id: 'track', name: 'dirt track', crr: 0.05, mu: 0.8, lat: 0.6, sink: 0.2, path: 0.8 },
    { id: 'steppe', name: 'dry grass', crr: 0.09, mu: 0.8, lat: 0.6, sink: 0.3, path: 1 },
    { id: 'forest', name: 'muddy undergrowth', crr: 0.12, mu: 0.6, lat: 0.5, sink: 0.7, path: 1.15 },
    { id: 'mud', name: 'mud', crr: 0.17, mu: 0.45, lat: 0.4, sink: 1, path: 1.6 },
    { id: 'sand', name: 'sand', crr: 0.12, mu: 0.55, lat: 0.45, sink: 0.6, path: 1.2 },
    { id: 'snow', name: 'snow', crr: 0.11, mu: 0.35, lat: 0.3, sink: 0.8, path: 1.2 },
    { id: 'packed', name: 'packed snow', crr: 0.045, mu: 0.3, lat: 0.25, sink: 0, path: 0.75 },
    { id: 'rubble', name: 'rubble', crr: 0.1, mu: 0.6, lat: 0.55, sink: 0.2, path: 1.2, bump: 1 },
    { id: 'crater', name: 'crater', crr: 0.14, mu: 0.6, lat: 0.5, sink: 0.4, path: 1.3, bump: 1.5 },
    { id: 'trunk', name: 'fallen trunk', crr: 0.25, mu: 0.6, lat: 0.5, sink: 0, path: 1.5, bump: 2 },
  ];
  const SOIL = {};
  SOILS.forEach((s, i) => { s.i = i; SOIL[s.id] = s; });
  // résistance au roulement selon la pression au sol (kg/cm²) : les chars lourds s'enfoncent
  const crrOf = (s, press) => s.crr * (1 + s.sink * (press / 0.9 - 1));

  // Grandeurs dérivées d'un char (S : géométrie du modèle, mass en t, hp en ch)
  function prep(D, S, mass, hp) {
    const m = mass * 1000;
    D.m = m; D.P = hp * 735.5;
    D.B = S.W - S.tw; D.Lc = S.L * 0.62; D.Iz = m * (S.L * S.L + S.W * S.W) / 12;
    D.tau = clamp(0.15 + D.Iz / 5.5e5, 0.25, 0.6);
    D.top = D.gears[D.gears.length - 1] * KMH * D.gov / D.rated;
    D.revTop = D.rev[D.rev.length - 1] * KMH * D.gov / D.rated;
    const st = D.steer;
    if (st.kind === 'regen') D.radius = geo(st.r[0], st.r[1], D.gears.length);
    D.wRef = (st.kind === 'regen' ? st.neutral : st.max) * D2R;
    D.travMax = (D.trav.max || D.trav.hand) * D2R;
    return D;
  }
  // puissance normalisée selon le régime (fraction du régime nominal)
  const pc = x => Math.max(0.15, x * (2 - x));
  // effort à la jante dans un rapport (vitesse vg au régime nominal) : l'embrayage patine sous la moitié
  // du régime nominal ; le régulateur coupe l'admission au régime gov
  function force(D, P, gov, vg, v) {
    const r = Math.max(v / vg, 0.5), gk = clamp((gov - v / vg * D.rated) / (0.04 * gov), 0, 1);
    return ETA * P * pc(r) * gk / (r * vg);
  }
  // rapport de départ : le plus long du premier tiers de la boîte qui démarre franchement
  function startGear(D, P, R) {
    for (let g = Math.ceil(D.gears.length / 3); g > 1; g--) if (force(D, P, D.rated, D.gears[g - 1] * KMH, 0) > 1.8 * R) return g;
    return 1;
  }
  const regen = D => D.steer.kind === 'regen';

  // Un pas de conduite. t : char (speed et vl en unités de jeu, k unités par mètre ; turnRate en rad/s)
  // c : thr, turn (−1..1, thr = fraction de la vitesse de pointe demandée), brake ; P, gov (régulateur) ;
  //     crr, crrD (droite − gauche), mu, lat, slope (sinus de la pente, montée > 0), grip ; drive (pilote
  //     et moteur en état), driver, engine ; broken (côté de la chenille cassée, 0 sinon) ; vCap ;
  //     maxGear, stuck (rapport bloqué) ; rev (régime demandé au point mort, 0..1)
  function step(t, D, c, dt, k) {
    let v = t.speed / k, vl = (t.vl || 0) / k, w = t.turnRate;
    const m = D.m, mg = m * G, gov = c.gov, av = Math.abs(v), rg = regen(D), turn = c.turn;
    let dir = Math.abs(c.thr) > 0.05 ? Math.sign(c.thr) : 0;
    // embrayages et freins : pas de pivot sur place, le pilote tire la chenille extérieure autour de l'autre
    const pivot = !rg && !dir && Math.abs(turn) > 0.1 && c.drive && !c.broken;
    if (pivot) dir = 1;
    const req = pivot ? 0.08 * Math.abs(turn) : Math.abs(c.thr);
    const outK = rg || c.broken ? 1 : 1 + Math.abs(turn); // chenille extérieure / centre
    // boîte automatique
    if (!c.drive) { t.gear = 0; t.shiftT = 0; }
    else if (dir && Math.sign(t.shiftT > 0 ? t.nextGear : t.gear) !== dir) {
      if (av < 0.3) { t.nextGear = dir > 0 ? startGear(D, c.P, c.crr * mg) : -1; t.shiftT = t.gear === 0 && dir > 0 ? 0.35 : D.box.rs; t.gear = 0; }
    } else if (t.shiftT > 0) { if ((t.shiftT -= dt) <= 0) { t.shiftT = 0; t.gear = t.nextGear; } }
    else if (!dir && av < 0.3) t.gear = 0;
    else if (t.gear) {
      const gs = t.gear > 0 ? D.gears : D.rev, n = Math.abs(t.gear), sg = Math.sign(t.gear);
      const top = c.stuck ? n : Math.min(gs.length, t.gear > 0 ? c.maxGear : 9), vo = av * outK;
      const rr = vo / (gs[n - 1] * KMH) * D.rated;
      // l'embrayage patine sous la moitié du régime : on ne rétrograde que si l'effort ne suffit plus
      const R = (c.crr + c.slope) * mg, Fg = h => force(D, c.P, gov, gs[h - 1] * KMH, vo), hard = rg && Math.abs(turn) > 0.5;
      if (n > top) { t.nextGear = sg * top; t.shiftT = D.box.shift * 0.6; }
      else if (req > 0 && rr > 0.93 * gov && n < top && !hard && Fg(n + 1) > 1.1 * R) {
        let h = n + 1;
        while (h < top && vo / (gs[h] * KMH) * D.rated > 0.62 * gov && Fg(h + 1) > 1.1 * R) h++;
        t.nextGear = sg * h; t.shiftT = D.box.shift;
      } else if (n > 1 && !c.stuck && (!req && rr < 0.3 * gov || req > 0 && Fg(n) < 0.9 * R || hard && rr < 0.6 * gov)) { t.nextGear = sg * (n - 1); t.shiftT = D.box.shift * 0.6; }
    }
    // effort moteur (nul pendant un passage de rapport : rupture de couple)
    const ing = t.gear !== 0 && !(t.shiftT > 0), gi = Math.abs(t.gear || t.nextGear) || 1;
    const vg = (t.gear < 0 ? D.rev : D.gears)[Math.min(gi, (t.gear < 0 ? D.rev : D.gears).length) - 1] * KMH;
    let F = 0;
    if (ing && c.drive && Math.sign(t.gear) === dir) {
      const vR = pivot ? 0.5 * D.gears[0] * KMH * gov / D.rated : req * (dir > 0 ? D.top : D.revTop) * 1.03;
      F = Math.min(c.mu * mg, force(D, c.P, gov, vg, av * outK)) * clamp((vR - av) / 0.4, 0, 1);
      if (av > c.vCap || c.broken && av > c.vBroken) F = 0;
      F *= dir;
    }
    // résistances : roulement, frein moteur, freins, puissance de braquage (moment de ripage × lacet)
    const brake = c.brake && !pivot || dir !== 0 && v * dir < -0.3 || !dir && av < 0.3 && c.driver || !c.drive && c.driver;
    let Fr = c.crr * mg * (c.broken ? 2 : 1);
    if (ing && !F && !brake) Fr += 0.04 * mg;
    if (brake) Fr += 0.55 * c.mu * mg;
    const Ms = c.lat * (1 + 2 * c.crr) * mg * D.Lc / 4;
    if (av > 0.3) Fr += Ms * Math.abs(w) / Math.max(av, 1);
    v += (F - mg * c.slope) / m * dt;
    const dv = Fr / m * dt;
    v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;
    const av2 = Math.abs(v);
    // direction
    let wc = 0;
    const neutral = rg && t.gear === 0 && !(t.shiftT > 0) && av2 < 0.5;
    if (c.broken) wc = c.broken * 2 * v / D.B;
    else if (!c.drive) wc = 0;
    else if (!rg) wc = clamp(turn * 2 * av2 / D.B, -D.steer.max * D2R, D.steer.max * D2R);
    else if (neutral) wc = turn * D.steer.neutral * D2R * clamp((t.rpmA - IDLE) / (gov * 0.85 - IDLE), 0, 1);
    else wc = turn * av2 / D.radius[Math.min(gi, D.radius.length) - 1];
    const f = c.lat * G * c.grip, wp = c.drive && c.P > 0 ? ETA * c.P / Ms : 0;
    if (!c.broken) wc = clamp(wc, -wp, wp);
    if (av2 > 0.5) wc = clamp(wc, -1.25 * f / av2, 1.25 * f / av2);
    w += (wc - w) * (1 - Math.exp(-dt / D.tau));
    // chenilles sur des sols différents : la plus freinée tire la caisse de son côté
    if (av2 > 0.3) w += c.crrD * mg / 2 * (D.B / 2) / D.Iz * Math.sign(v) * dt;
    // adhérence latérale : au-delà, la caisse dérape vers l'extérieur du virage
    const aD = v * w, spare = f - Math.abs(aD);
    if (spare < 0) vl -= Math.sign(aD) * -spare * dt;
    else vl = Math.abs(vl) <= spare * dt ? 0 : vl - Math.sign(vl) * spare * dt;
    // régime moteur (lancé en ≈ 0,6 s) et charge
    let rt;
    if (!c.engine) rt = 0;
    else if (ing) rt = Math.min(gov, Math.max(IDLE, av2 * outK / vg * D.rated, F ? IDLE + (0.55 * D.rated - IDLE) * Math.min(1, req * 3) : 0));
    else rt = IDLE + (gov - IDLE) * Math.max(c.rev || 0, t.shiftT > 0 ? req * 0.4 : 0, neutral ? Math.abs(turn) : 0);
    t.rpmA = (t.rpmA || 0) + (rt - (t.rpmA || 0)) * (1 - Math.exp(-dt / 0.25));
    t.rpm = clamp(t.rpmA / D.rated, 0, 1);
    t.load = F ? Math.min(1, req * 1.2) : 0;
    t.fDrive = F; t.braking = brake;
    t.speed = v * k; t.vl = vl * k; t.turnRate = w;
    t.slip = Math.abs(aD) > f ? Math.abs(aD) - f : 0;
  }
  // traverse de tourelle (rad/s) selon l'entraînement, le régime et l'état du moteur
  function traverse(D, rpmA, engine) {
    const tv = D.trav;
    if (tv.kind === 'hyd') return (engine ? tv.idle + (tv.max - tv.idle) * clamp((rpmA - IDLE) / (tv.rpm - IDLE), 0, 1) : tv.hand) * D2R;
    return (tv.kind === 'elec' ? tv.max : tv.hand) * D2R;
  }

  // Boîtes orientées : centre, axe longitudinal (c, s), demi-longueur hl et demi-largeur hw
  function box(x, y, a, hl, hw, o = {}) { o.x = x; o.y = y; o.c = Math.cos(a); o.s = Math.sin(a); o.hl = hl; o.hw = hw; return o; }
  const rad = (b, ux, uy) => b.hl * Math.abs(b.c * ux + b.s * uy) + b.hw * Math.abs(b.c * uy - b.s * ux);
  // coin de b le plus loin dans la direction u
  function corner(b, ux, uy) {
    const sl = b.c * ux + b.s * uy >= 0 ? 1 : -1, sw = b.c * uy - b.s * ux >= 0 ? 1 : -1;
    return [b.x + b.c * b.hl * sl - b.s * b.hw * sw, b.y + b.s * b.hl * sl + b.c * b.hw * sw];
  }
  function inside(b, x, y) {
    const dx = x - b.x, dy = y - b.y;
    return Math.abs(dx * b.c + dy * b.s) <= b.hl + 1e-6 && Math.abs(dy * b.c - dx * b.s) <= b.hw + 1e-6;
  }
  // Séparation de A et B : normale unitaire (de B vers A), profondeur d et point de contact, ou null
  function sat(A, B) {
    const dx = A.x - B.x, dy = A.y - B.y;
    let d = Infinity, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const b = i < 2 ? A : B, ux = i & 1 ? -b.s : b.c, uy = i & 1 ? b.c : b.s;
      const p = dx * ux + dy * uy, o = rad(A, ux, uy) + rad(B, ux, uy) - Math.abs(p);
      if (o <= 0) return null;
      if (o < d) { d = o; nx = p < 0 ? -ux : ux; ny = p < 0 ? -uy : uy; }
    }
    let q = corner(A, -nx, -ny);
    if (!inside(B, q[0], q[1])) q = corner(B, nx, ny);
    return { nx, ny, d, px: q[0], py: q[1] };
  }
  // demi-étendues d'une boîte sur les axes du monde
  const extent = b => [b.hl * Math.abs(b.c) + b.hw * Math.abs(b.s), b.hl * Math.abs(b.s) + b.hw * Math.abs(b.c)];

  return { G, DATA, SOILS, SOIL, crrOf, prep, step, traverse, force, box, sat, extent, IDLE };
})();
