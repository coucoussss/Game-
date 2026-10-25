'use strict';
// Steel Front : combat de chars 5 contre 5, vue de dessus.
// Le jeu démarre une fois le SDK prêt (loadingStart déjà envoyé), puis construit modèles et menu.
Meta.whenReady(() => {
  // ===================== Outils =====================
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const angNorm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Intersection segment / boîte alignée (méthode des dalles).
  // Renvoie l'instant d'entrée t ∈ [0,1], celui de sortie t1 et la normale de la face touchée.
  function segAABB(x0, y0, dx, dy, minx, miny, maxx, maxy) {
    let tmin = 0, tmax = 1, nx = 0, ny = 0;
    if (Math.abs(dx) < 1e-9) { if (x0 < minx || x0 > maxx) return null; }
    else {
      let t1 = (minx - x0) / dx, t2 = (maxx - x0) / dx, n = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = n; ny = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (Math.abs(dy) < 1e-9) { if (y0 < miny || y0 > maxy) return null; }
    else {
      let t1 = (miny - y0) / dy, t2 = (maxy - y0) / dy, n = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = n; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (nx === 0 && ny === 0) { // départ à l'intérieur
      const l = Math.hypot(dx, dy) || 1;
      return { t: 0, t1: tmax, nx: -dx / l, ny: -dy / l, inside: true };
    }
    return { t: tmin, t1: tmax, nx, ny };
  }
  // Même chose en 3D : renvoie [entrée, sortie] le long du rayon, ou null
  function ray3(o, d, mn, mx) {
    let t0 = -1e9, t1 = 1e9;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return null; continue; }
      let a = (mn[k] - o[k]) / d[k], b = (mx[k] - o[k]) / d[k];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return null;
    }
    return [t0, t1];
  }

  // ===================== Données =====================
  // Deux échelles, choix assumé : les unifier imposerait de redessiner la carte, les obstacles, la caméra,
  // le brouillard et l'IA, pour un gain de réalisme qui ne compense pas le risque.
  // - PX : conduite et 3D. Chars, obstacles, vitesses (km/h affichés), collisions, sols et vue 3D sont en
  //   vrais mètres de 7 px : le terrain praticable fait 371 × 243 m.
  // - RK : balistique. Portées, chute, temps de vol, pénétration et toutes les distances affichées
  //   (lunette, marqueurs, caméra d'impact) comptent 0,5 m par px : le champ de tir fait 1300 × 850 m.
  // Toute distance montrée au joueur est donc en mètres balistiques (px × RK), toute vitesse en km/h de
  // conduite (px/s ÷ PX × 3,6) ; les hauteurs (z) sont en vrais mètres partout.
  const PX = 7;    // pixels de jeu par mètre (taille des chars)
  const RK = 0.5;  // mètres de balistique par pixel (distances de tir)
  const G = 9.81;  // pesanteur (m/s²)
  const TYPES = {
    light: {
      id: 'light', hp: 180, ready: 10, mass: 12, name: 'Lynx', cls: 'Light tank',
      reload: 3.2, disp: 0.016, view: 760, range: 470,
      caliber: 50, obs: 60,
      ammo: { AP: 20, APHE: 30, APCR: 10, HEAT: 6, HE: 20, SMOKE: 4, CAN: 8 },
    },
    medium: {
      id: 'medium', hp: 700, ready: 8, mass: 45, name: 'Panther', cls: 'Medium tank',
      reload: 5.5, disp: 0.011, view: 680, range: 420,
      caliber: 75, obs: 110,
      ammo: { AP: 15, APHE: 35, APCR: 10, HEAT: 5, HE: 15, SMOKE: 4, CAN: 5 },
    },
    heavy: {
      id: 'heavy', hp: 700, ready: 6, mass: 57, name: 'Tiger', cls: 'Heavy tank',
      reload: 7.0, disp: 0.010, view: 620, range: 330,
      caliber: 88, obs: 150,
      ammo: { AP: 12, APHE: 40, APCR: 8, HEAT: 10, HE: 22, SMOKE: 4, CAN: 4 },
    },
    pz4: {
      id: 'pz4', hp: 300, ready: 8, mass: 25, name: 'Panzer IV', cls: 'Medium tank',
      reload: 5.0, disp: 0.012, view: 680, range: 420,
      caliber: 75, obs: 100,
      ammo: { AP: 15, APHE: 40, APCR: 8, HEAT: 6, HE: 20, SMOKE: 4, CAN: 6 },
    },
    stug: {
      id: 'stug', hp: 300, ready: 6, mass: 24, name: 'StuG', cls: 'Assault gun',
      reload: 5.0, disp: 0.010, view: 650, range: 450, arc: 0.17,
      caliber: 75, obs: 100,
      ammo: { AP: 12, APHE: 30, APCR: 6, HEAT: 4, HE: 18, SMOKE: 4, CAN: 4 },
    },
    kingtiger: {
      id: 'kingtiger', hp: 700, ready: 6, mass: 68, name: 'King Tiger', cls: 'Heavy tank',
      reload: 8.0, disp: 0.008, view: 640, range: 520,
      caliber: 88, obs: 170,
      ammo: { AP: 10, APHE: 40, APCR: 8, HEAT: 4, HE: 20, SMOKE: 4, CAN: 4 },
    },
    destroyer: {
      id: 'destroyer', hp: 700, ready: 6, mass: 46, name: 'Jagd', cls: 'Tank destroyer',
      reload: 7.5, disp: 0.007, view: 720, range: 600, arc: 0.21,
      caliber: 88, obs: 160,
      ammo: { AP: 12, APHE: 25, APCR: 10, HEAT: 5, HE: 5, SMOKE: 3, CAN: 2 },
    },
  };
  // Géométrie de jeu tirée des modèles 3D
  for (const T of Object.values(TYPES)) {
    const I = TankModels.info(T.id);
    T.I = I; T.S = I.S;
    T.len = I.S.L * PX; T.wid = I.S.W * PX;
    T.pivX = I.pivotX * PX; T.pivY = -I.pivotY * PX;
    T.gunEnd = I.gunEnd * PX;
    T.tb = I.turretBox ? { x0: I.turretBox.x0 * PX, x1: I.turretBox.x1 * PX, y0: -I.turretBox.y1 * PX, y1: -I.turretBox.y0 * PX } : null;
    T.tr = T.tb ? (T.tb.y1 - T.tb.y0) / 2 : 5;
    T.barrel = I.S.gun.len * PX; T.bw = Math.max(2.5, I.S.gun.r * 2 * PX * 1.6);
    T.crewN = I.S.crew.length;
    // inertie en tangage et en roulis (parallélépipède plein), longueur de recul du canon
    T.Ip = T.mass * 1000 * (I.S.L * I.S.L + I.S.ht * I.S.ht) / 12; T.Ir = T.mass * 1000 * (I.S.W * I.S.W + I.S.ht * I.S.ht) / 12;
    T.recoilLen = 0.3 + (T.caliber - 50) / 38 * 0.28;
    // conduite (vehicle.js) : boîte, direction, tourelle, pointage ; hp = puissance en ch. Vitesse de
    // pointe régulée et marche arrière en px/s, lacet et traverse de référence en rad/s
    T.D = Vehicle.prep(Object.assign({}, Vehicle.DATA[T.id]), I.S, T.mass, T.hp);
    T.speed = T.D.top * PX; T.rev = T.D.revTop * PX; T.kmh = Math.round(T.D.top * 3.6);
    T.turn = T.D.wRef; T.tturn = T.D.travMax;
  }

  const SHELLS = {
    AP: { key: 'AP', n: 1, name: 'Armor-piercing', full: 'Armor-piercing (AP)', pen: 1.0, drop: 0.15, ric: 70 },
    APHE: { key: 'APHE', n: 2, name: 'AP high-explosive', full: 'Armor-piercing high-explosive (APHE)', pen: 0.92, drop: 0.15, ric: 70, fuse: 1.2, sens: 15 },
    APCR: { key: 'APCR', n: 3, name: 'Sub-caliber', full: 'Sub-caliber (APCR)', pen: 1.32, drop: 0.45, ric: 62 },
    HEAT: { key: 'HEAT', n: 4, name: 'Shaped charge', full: 'Shaped charge (HEAT)', drop: 0, ric: 80 },
    HE: { key: 'HE', n: 5, name: 'High-explosive', full: 'High-explosive (HE)', drop: 0, ric: 90 },
    SMOKE: { key: 'SMOKE', n: 6, tag: 'SMK', name: 'Smoke', full: 'Smoke shell (Nebelgranate): smoke screen at the point of impact', drop: 0, ric: 90 },
    CAN: { key: 'CAN', n: 7, tag: 'CAN', name: 'Canister', full: 'Canister (Kartätsche): a spray of steel balls at short range', drop: 0, ric: 90 },
  };
  const SHELL_KEYS = ['AP', 'APHE', 'APCR', 'HEAT', 'HE', 'SMOKE', 'CAN'];
  // Vitesse des obus à l'écran : 1 px = RK m de balistique ; en balistique réaliste, chaque obus vole à
  // sa vraie vitesse (durées de trajet réelles), en arcade à 60 % pour qu'on le voie venir
  let TOF = 1;
  const shellPxK = () => TOF / RK;
  // Pénétration à une distance donnée (pixels de jeu), selon la balistique réelle
  const penAt = (T, key, dpx) => Ballistics.penAt(T.id, key, dpx * RK);


  const TEAM = [
    { accent: '#4aa3ff', label: 'Ally', camo: [[0.33, 0.36, 0.22], [0.20, 0.25, 0.15], [0.36, 0.27, 0.17]], hull: '#56663a', top: '#66794a', dark: '#3d4a28' },
    { accent: '#ff4a3d', label: 'Enemy', camo: [[0.62, 0.55, 0.36], [0.40, 0.22, 0.15], [0.25, 0.30, 0.18]], hull: '#8a7d55', top: '#9a8d62', dark: '#5a4f35' },
  ];

  // couleur d'un camp à l'interface (orange au lieu de rouge pour l'ennemi avec la palette pour daltoniens)
  const teamCol = k => k === 1 && Meta.P.opts.cb ? '#ff9a1a' : TEAM[k].accent;
  const W_ = (a, b, c, d, e) => [a, b, c, d, e];
  const LEVELS = [
    {
      name: 'Kursk Plain', when: 'Prokhorovka · 12 July 1943', soils: ['steppe', 'track'], dustK: 0.7, soil: 'dry grass', gRic: 1, atm: { T: 25, rho: 1.18, wind: 3 }, sub: 'Summer steppe, wide open spaces',
      ground: ['#7b8446', '#6c763b', '#8a9352'], road: '#8d7d58', dust: '#a59a6a', track: 'rgba(40,35,20,0.16)',
      trees: 45, treeCl: 6, bushes: 34, buildings: 6, walls: 9, rocks: 8,
      tree: ['#36521f', '#4a6a2b'], bush: '#4c6b2a', wall: '#a59a86', roof: ['#8a4f3a', '#73402f'],
      waves: [W_('light', 'light', 'medium', 'light', 'pz4'), W_('pz4', 'light', 'medium', 'stug', 'light'), W_('pz4', 'medium', 'heavy', 'stug', 'medium')],
      forms: [['line', 'wedge'], ['late', 'pincer'], ['wedge', 'ambush', 'late']],
      // houle de la steppe (± 2 m), deux balkas, et le Psel : un pont de bois de 30 t et deux gués
      relief: { oct: [[900, 2.2], [380, 1], [150, 0.3]], balkas: { n: 2, depth: 2.5, hw: 75 }, water: { wl: -0.9, river: { x: 0.76, hw: 36, depth: 2.6, bank: 0.09, fords: 2, bridge: 30 } } },
    },
    {
      forest: true, name: 'Ardennes Forest', when: 'Ardennes · 16 December 1944', soils: ['forest', 'track'], mud: 14, dustK: 0.2, soil: 'muddy undergrowth', gRic: 0.5, atm: { T: 8, rho: 1.25, wind: 1.5 }, sub: 'Dense undergrowth, close-quarters fighting',
      ground: ['#4c5c30', '#425228', '#58693a'], road: '#6d5d3f', dust: '#6b6a48', track: 'rgba(25,25,10,0.2)',
      trees: 150, treeCl: 14, bushes: 70, buildings: 3, walls: 4, rocks: 10,
      tree: ['#24401a', '#335726'], bush: '#3a5a22', wall: '#8f8a7a', roof: ['#5a4a3a', '#4a3c30'],
      waves: [W_('medium', 'light', 'medium', 'light', 'medium'), W_('pz4', 'medium', 'heavy', 'stug', 'destroyer'), W_('heavy', 'medium', 'medium', 'destroyer', 'stug')],
      forms: [['line', 'pincer'], ['ambush', 'late'], ['ambush', 'wedge']],
      // collines boisées (± 8 m), un ruisseau guéable partout et une mare profonde
      relief: { oct: [[1100, 6.5], [450, 3], [180, 0.9]], water: { wl: -1.5, river: { x: 0.47, hw: 22, depth: 0.7, bank: 0.04 }, ponds: { n: 1, r: [60, 80], depth: 1.8 } } },
    },
    {
      name: 'Stalingrad Ruins', when: 'Stalingrad · January 1943', soils: ['rubble', 'road'], dustK: 0.5, soil: 'rubble', gRic: 1, atm: { T: -5, rho: 1.31, wind: 4 }, sub: 'Ruined streets, destructible buildings', city: true,
      ground: ['#6d665c', '#615a51', '#79726a'], road: '#55504a', dust: '#8a8378', track: 'rgba(20,18,15,0.18)',
      trees: 8, treeCl: 2, bushes: 10, buildings: 0, walls: 12, rocks: 4,
      tree: ['#3c4a2a', '#4a5a34'], bush: '#4a5530', wall: '#8f877b', roof: ['#7a7268', '#686057'],
      waves: [W_('medium', 'heavy', 'medium', 'light', 'medium'), W_('heavy', 'pz4', 'destroyer', 'medium', 'kingtiger'), W_('heavy', 'heavy', 'destroyer', 'medium', 'medium')],
      forms: [['line', 'pincer'], ['wedge', 'late'], ['pincer', 'ambush']],
      // ville presque plate, buttes de gravats
      relief: { oct: [[800, 0.35]], mounds: { n: 14, h: [1, 2.2], r: [45, 90] } },
    },
    {
      desert: true, name: 'El Alamein Desert', when: 'Tel el Aqqaqir · 2 November 1942', soils: ['sand', 'track'], dustK: 1, soil: 'sand', gRic: 0.4, atm: { T: 35, rho: 1.15, wind: 5 }, sub: 'Open terrain, long-range shooting',
      ground: ['#cdb27a', '#c1a46b', '#d9c08c'], road: '#b39463', dust: '#dcc391', track: 'rgba(90,60,30,0.16)',
      trees: 0, treeCl: 1, bushes: 16, buildings: 5, walls: 5, rocks: 36,
      tree: ['#5a6a2a', '#6a7a3a'], bush: '#8c8a4a', wall: '#d8c7a0', roof: ['#e0d2ad', '#cdbd96'],
      waves: [W_('destroyer', 'medium', 'light', 'destroyer', 'medium'), W_('heavy', 'destroyer', 'stug', 'destroyer', 'pz4'), W_('heavy', 'heavy', 'destroyer', 'destroyer', 'medium')],
      forms: [['ambush', 'line'], ['ambush', 'late'], ['wedge', 'pincer']],
      // dunes en crêtes nord-sud et l'escarpement de Tel el Aqqaqir (5 m), tenu par l'ennemi à l'est
      relief: { oct: [[520, 1.8, 1], [200, 0.5]], st: 2.5, escarp: { x: 0.62, h: 5, w: 260 } },
    },
    {
      name: 'Bastogne Night', when: 'Bastogne · 26 December 1944', soils: ['snow', 'packed'], dustK: 0.6, soil: 'snow', gRic: 0.5, atm: { T: -10, rho: 1.34, wind: 2.5 }, sub: 'Snow and darkness, reduced vision', night: true,
      ground: ['#dfe4e8', '#cfd6dc', '#eaeef1'], road: '#b9b3a8', dust: '#ffffff', track: 'rgba(60,60,70,0.22)',
      trees: 95, treeCl: 10, bushes: 34, buildings: 8, walls: 6, rocks: 6,
      tree: ['#203828', '#2c4a36'], bush: '#3c5a46', wall: '#9a958c', roof: ['#eef3f6', '#d8e0e6'], snow: true,
      waves: [W_('medium', 'heavy', 'medium', 'light', 'heavy'), W_('heavy', 'heavy', 'destroyer', 'medium', 'medium'), W_('kingtiger', 'heavy', 'kingtiger', 'destroyer', 'destroyer')],
      forms: [['wedge', 'line'], ['late', 'ambush'], ['wedge', 'ambush']],
      // collines enneigées et mares gelées : la glace cède sous plus de 30 t
      relief: { oct: [[1000, 3.5], [400, 1.2]], water: { wl: -0.6, ponds: { n: 4, r: [60, 110], depth: 1.8 }, ice: true } },
    },
  ];
  const WAVES = 3;
  const WW = 2600, WH = 1700, CELL = 20, STEP = 1 / 60;

  // Réglages de développement, actifs seulement avec ?debug : ?auto ?god ?speed=4 ?level=2 ?wave=1
  // ?type=heavy ?mode=survie|duel ?form=late (dispositif de la vague) ?2d. Ceux qui touchent aux gains font jouer sur un profil jetable,
  // jamais sauvegardé : l'adresse du jeu ouverte à la main ne débloque rien.
  const Q = new URLSearchParams(location.search);
  const DEV = Q.has('debug'), dq = k => DEV && Q.has(k);
  const AUTO = dq('auto'), GOD = dq('god');
  const timeScale = DEV ? clamp(Number(Q.get('speed')) || 1, 0.1, 16) : 1;
  const DEV_RUN = DEV && ['auto', 'god', 'speed', 'level', 'wave', 'type', 'mode'].some(k => Q.has(k));
  const DEV_START = DEV && (Q.has('level') || AUTO);

  // ===================== État =====================
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');
  // Niveaux de qualité : résolution maximale, plafond de particules, densité du feuillage, et rendu 3D
  // (kr : texels du filtrage des ombres par axe, nl : lumières dynamiques, sms et smd : cartes d'ombre
  // statique et dynamique, lod : échelle des distances de détail, gt : texture du sol, aniso : filtrage
  // anisotrope, wx : particules de météo, bloom : halo des lueurs). Un préréglage
  // (mobile par exemple) s'ajoute simplement ici et dans la liste du menu Options.
  const QUALITY = {
    // mobile : choisi d'office sur un écran tactile sans souris (téléphone, tablette) ; lite : sans MSAA
    mobile: { dpr: 1.25, pcap: 500, leaf: 0.25, lite: true, r3: { kr: 2, nl: 2, sms: 1024, smd: 1024, lod: 0.5, gt: [2048, 1024], aniso: 1, wx: 300, bloom: 0 } },
    basse: { dpr: 1, pcap: 900, leaf: 0.35, lite: true, r3: { kr: 2, nl: 3, sms: 2048, smd: 1024, lod: 0.6, gt: [2048, 1024], aniso: 2, wx: 500, bloom: 0 } },
    moyenne: { dpr: 1.25, pcap: 1700, leaf: 0.6, r3: { kr: 2, nl: 5, sms: 2048, smd: 2048, lod: 0.8, gt: [4096, 2048], aniso: 4, wx: 1200 } },
    haute: { dpr: 2, pcap: 2600, leaf: 1, r3: { kr: 3, nl: 8, sms: 4096, smd: 2048, lod: 1, gt: [4096, 2048], aniso: 8, wx: 2500 } },
  };
  const QL = () => QUALITY[Meta.P.opts.quality] || QUALITY.haute;
  let QDPR = 2, PCAP = 2600; // qualité graphique : résolution maximale et nombre de particules
  let W = 0, H = 0, DPR = 1, S = 1, uiK = 1, redraw = false;
  function resize() {
    DPR = Math.min(QDPR, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    S = clamp(Math.min(W / 1200, H / 740), 0.5, 1.6);
    // échelle de l'interface : 1 en 1280×720, jamais sous 0,8 (lisible en 640×360), croissance
    // adoucie au-delà (×1,36 en 1080p), multipliée par le réglage « taille de l'interface »
    uiK = clamp(Math.pow(Math.min(W / 1280, H / 720), 0.75), 0.8, 2) * (Meta.P.opts.hud || 1);
    redraw = true; // canevas vidés : image figée à redessiner
  }
  addEventListener('resize', resize);
  resize();

  let state = 'menu'; // menu, intro, play, ending, result, pause, revive, leaving (publicité avant de quitter)
  const inBattle = () => state === 'intro' || state === 'play' || state === 'ending';
  let levelIdx = 0, waveIdx = 0, chosenType = 'medium';
  let bullets = [], mgCamT = -99;
  let tanks = [], shells = [], parts = [], texts = [], feed = [], smokes = [], logs = [], runners = [];
  let obstacles = [], bushes = [];
  let player = null, specIdx = 0;
  let camX = WW / 2, camY = WH / 2;
  // Secousses : « traumatisme » 0..1 ajouté par les tirs, les coups et les souffles, qui décroît de 1,6/s
  // (temps réel, une seule fois par image) ; décalage = trauma² × bruit lissé (sommes de sinus) en lacet,
  // tangage et roulis, donc indépendant de la cadence ; réglage « secousses » et mouvements réduits
  let trauma = 0, shakeT = 0;
  const addTrauma = k => { trauma = Math.min(1, trauma + k); };
  function shakeOff() {
    const o = Meta.P.opts, a = trauma * trauma * o.shake * (o.calm ? 0.3 : 1), t = shakeT;
    return { yaw: a * 0.02 * (Math.sin(37 * t) + 0.5 * Math.sin(71 * t + 1)), pitch: a * 0.025 * (Math.sin(43 * t + 2) + 0.5 * Math.sin(89 * t)), roll: a * 0.015 * (Math.sin(29 * t + 4) + 0.5 * Math.sin(61 * t + 3)) };
  }
  const spotted = [new Set(), new Set()];
  let spotTimer = 0, waveTime = 0, introT = 0, endT = 0, waveResult = null, gameTime = 0;
  let groundCv = null, gctx = null;
  let waveStats = null, campaignScore = 0, msgs = [], ffMsgT = 0, helpT = 0;
  // secteur en cours : score cumulé des vagues gagnées et alliés détruits par le joueur (étoiles) ;
  // retried : vagues déjà reprises dans la session (la prime de revanche ne vaut qu'à la première reprise)
  let sectorScore = 0, sectorTk = 0;
  const retried = new Set();
  let tankId = 0, shellId = 0, hitcamOn = true, hcLast = -99, slowT = 0;
  // modes de jeu : campagne 5 contre 5, survie seul contre des vagues, duel en 3 manches
  const MODES = {
    campagne: { name: 'Campaign', sub: '5 vs 5 · 3 waves per battlefield' },
    survie: { name: 'Survival', sub: 'Alone against ever harder waves' },
    duel: { name: 'Duel', sub: '1 vs 1, identical tanks, best of 3' },
  };
  let mode = 'campagne', survWave = 0, nextWaveT = 0, duelScore = [0, 0], enemyN = 0;
  // vue du tireur : lunette à grossissement fixe, la souris oriente la visée
  const MAGS = [2.5, 5, 8];
  const sight = { on: false, yaw: 0, pitch: 0, cx: 0, cy: 0, aimYaw: 0, aimPitch: 0, mag: 0, probe: null, probeT: 0, dust: false, z0: 2, gunPitch: 0, rangeSet: 400 };
  const mouse = { x: W / 2, y: H / 2, down: false };
  const keys = {};
  // État de commande partagé, alimenté par les commandes tactiles (et demain par d'autres sources :
  // manette, couche d'entrées centrale) : axes analogiques et commandes maintenues, que playerInput
  // ajoute au clavier et à la souris. tap : tir demandé par une pression brève, consommé au pas suivant.
  const ctl = { thr: 0, turn: 0, fire: false, tap: false, mg: false, brake: false };
  // préréglage de visée : « assisté » (télémétrie automatique et verdict de perforation) ou « réaliste »
  const assisted = () => Meta.P.opts.assist !== 'real';

  // secteurs de campagne ouverts (profil sauvegardé, borné au nombre de secteurs)
  const unlockedIdx = () => Math.min(Meta.P.unlocked, LEVELS.length - 1);

  const L = () => LEVELS[levelIdx];

  // ===================== 3D : maillages et sprites =====================
  let R3 = null;
  const MESH = {}, SPR = {}, MODMESH = {};
  try { R3 = G3.createRenderer(); } catch (e) { R3 = null; console.warn('WebGL indisponible', e); }
  const SP = 22; // pixels par mètre dans les sprites
  function topRender(mesh, hx, hy, opts) {
    const w = Math.ceil(2 * hx * SP), h = Math.ceil(2 * hy * SP);
    R3.begin(w, h, [0, 0, 0, 0]);
    const eye = [0, 0, 30];
    R3.camera(G3.M4.lookAt(eye, [0, 0, 0], [0, 1, 0]), G3.M4.ortho(-hx, hx, -hy, hy, 1, 60), eye, [-0.35, 0.45, 0.82], true);
    R3.draw(mesh, G3.M4.ident(), opts);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(R3.canvas, 0, 0);
    return c;
  }
  function silhouette(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  if (R3) {
    try {
      for (const id of Object.keys(TYPES)) {
        const b = TankModels.build(id);
        MESH[id] = { hull: R3.upload(b.hull), turret: R3.upload(b.turret) };
        MODMESH[id] = TankModels.makeModules(id).map(m => R3.upload(TankModels.moduleMesh(m, TYPES[id].caliber)));
        const I = TYPES[id].I, Sd = I.S;
        const hx = Sd.L / 2 + 0.25, hy = Sd.W / 2 + 0.25;
        let rt = I.gunEnd + 0.3;
        if (Sd.turret) for (const p of Sd.turret.poly) rt = Math.max(rt, Math.abs(p[0]) + 0.7, Math.abs(p[1]) + 0.3);
        const sp = { hx, hy, rt, hull: [], tur: [] };
        for (let tm = 0; tm < 2; tm++) {
          sp.hull[tm] = topRender(MESH[id].hull, hx, hy, { camo: TEAM[tm].camo, seed: tm * 3.7 });
          sp.tur[tm] = topRender(MESH[id].turret, rt, rt, { camo: TEAM[tm].camo, seed: tm * 3.7 });
        }
        sp.hullB = topRender(MESH[id].hull, hx, hy, { burnt: 1 });
        sp.turB = topRender(MESH[id].turret, rt, rt, { burnt: 1 });
        sp.hullSh = silhouette(sp.hull[0]); sp.turSh = silhouette(sp.tur[0]);
        SPR[id] = sp;
      }
      HitCam.init(R3, MESH, MODMESH);
    } catch (e) { console.warn('3D rendering disabled', e); R3 = null; }
  }

  // ===================== Carte =====================
  function rectOverlap(a, b, m) {
    return a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;
  }

  function genMap() {
    const lv = L();
    const R = mulberry32(1000 + levelIdx * 7919);
    const rr = (a, b) => a + R() * (b - a);
    obstacles = []; bushes = [];
    // routes tracées d'abord : le relief s'adoucit le long des routes et le pont porte la première
    roads = [];
    if (!lv.city) {
      const RR = mulberry32(3000 + levelIdx * 7919);
      for (let k = 0; k < 2; k++) {
        let y = WH * (0.3 + k * 0.4) + (RR() - 0.5) * 200;
        const pts = [[-20, y]];
        for (let x = 0; x <= WW + 200; x += 200) { y = clamp(y + (RR() - 0.5) * 160, 120, WH - 120); pts.push([x, y]); }
        roads.push(pts);
      }
    }
    terra = Terrain.make(lv.relief || {}, WW, WH, 5000 + levelIdx * 7919, roads, 23);
    // ni dans l'eau, ni à cheval sur une forte pente (maisons et murets sont ensuite aplanis)
    const dry = r => {
      let lo = 1e9, hi = -1e9;
      for (const [fx, fy] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = r.x + r.w * fx, y = r.y + r.h * fy, z = terra.bed(x, y);
        if (terra.wetAt(x, y)) return false;
        lo = Math.min(lo, z); hi = Math.max(hi, z);
      }
      return hi - lo < (r.type === 'building' ? 1.6 : r.type === 'wall' ? 1.2 : 9);
    };
    const spawnA = { x: 0, y: WH / 2 - 420, w: 460, h: 840 };
    const spawnB = { x: WW - 460, y: WH / 2 - 420, w: 460, h: 840 };
    const free = (r, m) => {
      if (r.x < 20 || r.y < 20 || r.x + r.w > WW - 20 || r.y + r.h > WH - 20) return false;
      if (rectOverlap(r, spawnA, 0) || rectOverlap(r, spawnB, 0) || !dry(r)) return false;
      for (const o of obstacles) {
        const mm = (o.type === 'tree' && r.type === 'tree') ? 2 : m;
        if (rectOverlap(r, o, mm)) return false;
      }
      return true;
    };
    const add = o => {
      o.maxHp = o.hp; o.dead = false;
      o.spots = [];
      for (let i = 0; i < 6; i++) o.spots.push({ x: R(), y: R(), r: 0.08 + R() * 0.12 });
      obstacles.push(o);
    };
    const tryPlace = (make, tries, m) => {
      for (let i = 0; i < tries; i++) { const o = make(); if (free(o, m)) { add(o); return o; } }
      return null;
    };

    if (lv.city) {
      const block = 230, street = 100;
      for (let bx = 480; bx + block < WW - 480; bx += block + street) {
        for (let by = 60; by + block < WH - 40; by += block + street) {
          const kind = R();
          if (kind < 0.18) continue; // place vide
          const n = kind < 0.5 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const w = n === 1 ? rr(130, block) : rr(80, block / 2 - 10);
            const h = rr(90, block);
            const x = bx + (n === 1 ? rr(0, block - w) : k * (block / 2 + 10));
            const y = by + rr(0, block - h);
            const o = { type: 'building', x, y, w, h, hp: 900 };
            if (free(o, 20)) add(o);
          }
        }
      }
    }
    for (let i = 0; i < lv.buildings; i++) {
      tryPlace(() => { const w = rr(70, 150), h = rr(60, 120); return { type: 'building', x: rr(0, WW - w), y: rr(0, WH - h), w, h, hp: 700 }; }, 40, 70);
    }
    for (let i = 0; i < lv.walls; i++) {
      tryPlace(() => {
        const long = rr(110, 240), horiz = R() < 0.5;
        const w = horiz ? long : 14, h = horiz ? 14 : long;
        return { type: 'wall', x: rr(0, WW - w), y: rr(0, WH - h), w, h, hp: 350 };
      }, 40, 70);
    }
    for (let i = 0; i < lv.rocks; i++) {
      const o = tryPlace(() => { const s = rr(30, 72); return { type: 'rock', x: rr(0, WW - s), y: rr(0, WH - s * 0.8), w: s, h: s * rr(0.7, 1), hp: Infinity }; }, 40, 70);
      if (o) {
        o.poly = [];
        const n = 8;
        for (let k = 0; k < n; k++) {
          const a = k / n * TAU + R() * 0.3, f = 0.8 + R() * 0.25;
          o.poly.push([o.w / 2 + Math.cos(a) * o.w / 2 * f, o.h / 2 + Math.sin(a) * o.h / 2 * f]);
        }
      }
    }
    let placedTrees = 0;
    while (placedTrees < lv.trees) {
      const cx = rr(100, WW - 100), cy = rr(60, WH - 60);
      const n = Math.max(1, Math.round(lv.treeCl * rr(0.5, 1.4)));
      for (let k = 0; k < n && placedTrees < lv.trees; k++) {
        const a = R() * TAU, d = R() * (30 + lv.treeCl * 9);
        const o = { type: 'tree', x: cx + Math.cos(a) * d - 8, y: cy + Math.sin(a) * d - 8, w: 16, h: 16, hp: 1, size: rr(0.85, 1.25) };
        if (free(o, 30)) add(o);
        placedTrees++;
      }
    }
    for (let i = 0; i < lv.bushes; i++) {
      const cx = rr(80, WW - 80), cy = rr(80, WH - 80);
      const n = 2 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) { const b = { x: cx + rr(-30, 30), y: cy + rr(-20, 20), r: rr(22, 38) }; if (!terra.wetAt(b.x, b.y)) bushes.push(b); }
    }
    for (const o of obstacles) if (o.type === 'building' || o.type === 'wall') terra.flatten(o.x - 4, o.y - 4, o.x + o.w + 4, o.y + o.h + 4);
    buildGround(R);
    buildGrid();
  }

  function buildGround(R) {
    const lv = L();
    groundCv = document.createElement('canvas');
    groundCv.width = WW; groundCv.height = WH;
    gctx = groundCv.getContext('2d', { willReadFrequently: true });
    gctx.fillStyle = lv.ground[0];
    gctx.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 2600; i++) {
      gctx.globalAlpha = 0.18 + R() * 0.2;
      gctx.fillStyle = lv.ground[1 + Math.floor(R() * 2)];
      const r = 10 + R() * 60;
      gctx.beginPath(); gctx.ellipse(R() * WW, R() * WH, r, r * (0.5 + R() * 0.5), R() * TAU, 0, TAU); gctx.fill();
    }
    gctx.globalAlpha = 1;
    for (let i = 0; i < 26000; i++) {
      gctx.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      gctx.fillRect(R() * WW, R() * WH, 2, 2);
    }
    // sol de conduite maille par maille : fond de la carte, routes et pistes, flaques de boue
    soil = new Uint8Array(Math.ceil(WW / CELL) * Math.ceil(WH / CELL)).fill(Vehicle.SOIL[lv.soils[0]].i);
    const road = lv.soils[1];
    for (let i = 0; i < (lv.mud || 0); i++) {
      const x = R() * WW, y = R() * WH, r = 40 + R() * 50;
      gctx.fillStyle = 'rgba(38,30,16,0.32)';
      gctx.beginPath(); gctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); gctx.fill();
      soilSeg(x, y, x, y, r * 0.75, 'mud');
    }
    gctx.strokeStyle = lv.road; gctx.lineCap = 'round';
    if (lv.city) {
      gctx.globalAlpha = 0.7;
      gctx.lineWidth = 80;
      for (let x = 480 - 50; x < WW; x += 330) { gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, WH); gctx.stroke(); soilSeg(x, 0, x, WH, 40, road); }
      for (let y = 60 - 50; y < WH; y += 330) { gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(WW, y); gctx.stroke(); soilSeg(0, y, WW, y, 40, road); }
      gctx.globalAlpha = 1;
    } else {
      gctx.globalAlpha = 0.55; gctx.lineWidth = 46;
      for (const pts of roads) {
        gctx.beginPath();
        pts.forEach(([x, y], i) => { if (i) { gctx.lineTo(x, y); soilSeg(pts[i - 1][0], pts[i - 1][1], x, y, 23, road); } else gctx.moveTo(x, y); });
        gctx.stroke();
      }
      gctx.globalAlpha = 1;
    }
    if (lv.snow) {
      for (let i = 0; i < 400; i++) {
        gctx.fillStyle = 'rgba(150,170,195,0.12)';
        gctx.beginPath(); gctx.ellipse(R() * WW, R() * WH, 40 + R() * 90, 15 + R() * 30, R() * TAU, 0, TAU); gctx.fill();
      }
    }
    if (lv.desert) {
      gctx.strokeStyle = 'rgba(150,110,60,0.15)'; gctx.lineWidth = 3;
      for (let i = 0; i < 160; i++) {
        const x = R() * WW, y = R() * WH;
        gctx.beginPath(); gctx.moveTo(x, y); gctx.quadraticCurveTo(x + 60, y - 18, x + 130, y + 4); gctx.stroke();
      }
    }
    // eau, glace et tabliers des ponts dans le sol de conduite
    const nc = Math.ceil(WW / CELL);
    if (terra.wl > -1e9) for (let i = 0; i < soil.length; i++) {
      const x = (i % nc + 0.5) * CELL, y = (Math.floor(i / nc) + 0.5) * CELL;
      if (terra.bridgeAt(x, y)) soil[i] = Vehicle.SOIL.track.i;
      else if (terra.iceAt(x, y)) soil[i] = Vehicle.SOIL.ice.i;
      else if (terra.depth(x, y) > 0.05) soil[i] = Vehicle.SOIL.water.i;
    }
    paintTerrain();
    for (const o of obstacles) {
      if (o.type === 'tree' || W3D) continue;
      gctx.fillStyle = 'rgba(0,0,0,0.22)';
      gctx.fillRect(o.x + 6, o.y + 7, o.w, o.h);
    }
  }
  // Relief vu de dessus : ombrage des pentes (vue 2D seulement, la 3D éclaire son maillage), eau teintée
  // selon la profondeur, glace, ponts ; peint à 1 px pour 7 puis agrandi en lissant
  const waterCol = () => terra.ice ? [214, 228, 238] : L().forest ? [38, 52, 44] : [52, 70, 72];
  function paintTerrain() {
    const T = terra, k = 7, w = Math.ceil(WW / k), h = Math.ceil(WH / k), cv = document.createElement('canvas'), wc = waterCol();
    cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d'), im = c2.createImageData(w, h), d = im.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * k, y = (j + 0.5) * k, o = (j * w + i) * 4, dep = T.wl - T.bed(x, y);
      if (dep > 0) { d[o] = wc[0]; d[o + 1] = wc[1]; d[o + 2] = wc[2]; d[o + 3] = 255 * (T.ice ? 0.85 * clamp(dep * 4, 0, 1) : clamp(dep * 1.4, 0, 0.92)); continue; }
      if (W3D) continue;
      const g = T.grad(x, y), sh = clamp((g[0] * 0.6 + g[1] * 0.8) * PX * 1.6, -0.5, 0.5); // soleil au nord-ouest
      d[o] = d[o + 1] = d[o + 2] = sh < 0 ? 255 : 0; d[o + 3] = Math.abs(sh) * 130;
    }
    c2.putImageData(im, 0, 0);
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(cv, 0, 0, w * k, h * k);
    for (const b of T.bridges) paintBridge(b);
  }
  // pont de bois vu de dessus ; effondré : l'eau reprend la travée, deux moignons restent aux berges
  function paintBridge(b) {
    gctx.save(); gctx.translate(b.x, b.y); gctx.rotate(Math.atan2(b.uy, b.ux));
    const span = terra.spec.water.river.hw + 6;
    if (b.dead) { const wc = waterCol(); gctx.fillStyle = `rgb(${wc[0]},${wc[1]},${wc[2]})`; gctx.fillRect(-span, -b.hw - 2, 2 * span, 2 * b.hw + 4); }
    for (let x = -b.hl; x < b.hl; x += 3.5) {
      if (b.dead && Math.abs(x) < span) continue;
      gctx.fillStyle = (Math.round(x / 3.5) & 1) ? '#6b5236' : '#5e4830'; gctx.fillRect(x, -b.hw, 3.2, 2 * b.hw);
    }
    if (!b.dead) { gctx.fillStyle = '#3e2e1c'; gctx.fillRect(-b.hl, -b.hw, 2 * b.hl, 2.5); gctx.fillRect(-b.hl, b.hw - 2.5, 2 * b.hl, 2.5); }
    gctx.restore();
    markDirty(b.x, b.y, b.hl + 10);
  }

  // ===================== Grille de navigation =====================
  let grid = null, GC = 0, GR = 0;
  // Sols de conduite (indices de Vehicle.SOILS) sur la grille de l'itinéraire
  let soil = null;
  // segment épaissi de hw px (un point pour un disque) : chaque maille dont le centre est assez proche
  function soilSeg(x0, y0, x1, y1, hw, id) {
    if (!soil) return;
    const v = Vehicle.SOIL[id].i, nc = Math.ceil(WW / CELL), nr = Math.ceil(WH / CELL), dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - hw) / CELL)), c1 = Math.min(nc - 1, Math.floor((Math.max(x0, x1) + hw) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - hw) / CELL)), r1 = Math.min(nr - 1, Math.floor((Math.max(y0, y1) + hw) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = (c + 0.5) * CELL, py = (r + 0.5) * CELL, u = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
      if (Math.hypot(px - x0 - dx * u, py - y0 - dy * u) <= hw) soil[r * nc + c] = v;
    }
  }
  // Sol sous un point : hauteur, normale et nature. Terrain plat pour l'instant : un relief remplira z et
  // la normale (nx, ny, nz) sans toucher à la conduite, qui en tire déjà la pente
  const GND = { z: 0, type: Vehicle.SOIL.steppe };
  function groundAt(x, y) { GND.type = soil ? Vehicle.SOILS[soil[cellOf(x, y)]] : Vehicle.SOIL.steppe; GND.z = terra ? terra.ground(x, y) : 0; return GND; }
  // Relief (terrain.js), la même hauteur partout : conduite et assiette des chars, obus et balles, vue et
  // repérage, décor 3D, effets et itinéraire. Conventions des hauteurs (m) : obus et balles en altitude
  // absolue ; un char à t.gz (son appui) plus sa hauteur propre ; un obstacle à sa base obsBase ;
  // particules, fumées, fusées et éclats au-dessus du sol sous eux (le rendu ajoute hAt).
  let terra = null, roads = [];
  const hAt = (x, y) => terra ? terra.surf(x, y) : 0;
  const obsBase = o => o.gz != null ? o.gz : (o.gz = o.type === 'tree' ? hAt(o.x + 8, o.y + 8) : hAt(o.x + o.w / 2, o.y + o.h / 2));
  const obsTop = o => obsBase(o) + obsH(o);
  function buildGrid() {
    GC = Math.ceil(WW / CELL); GR = Math.ceil(WH / CELL);
    grid = new Uint8Array(GC * GR); wgrid = new Uint8Array(GC * GR); navBlocks = [];
    for (const o of obstacles) markGrid(o);
    terrainGrid();
  }
  // Couche mobile du pathfinding, refaite toutes les 0,5 s : épaves (contournées, ou seulement coûteuses
  // quand elles sont assez légères pour qu'on les pousse) et passages où un char s'est bloqué deux fois
  let wgrid = null, navBlocks = [], navT = 0;
  function stampW(x, y, rad, v) {
    const c0 = Math.max(0, Math.floor((x - rad) / CELL)), c1 = Math.min(GC - 1, Math.floor((x + rad) / CELL));
    const r0 = Math.max(0, Math.floor((y - rad) / CELL)), r1 = Math.min(GR - 1, Math.floor((y + rad) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * GC + c;
      if (wgrid[i] !== 1 && Math.hypot((c + 0.5) * CELL - x, (r + 0.5) * CELL - y) < rad + CELL / 2) wgrid[i] = v;
    }
  }
  function buildWGrid(dt) {
    wgrid.fill(0);
    for (const w of tanks) if (w.dead) stampW(w.x, w.y, w.r + 12, w.T.mass < 28 ? 2 : 1);
    navBlocks = navBlocks.filter(b => (b.t -= dt) > 0);
    for (const b of navBlocks) stampW(b.x, b.y, b.r, 1);
    OBJ.nav(stampW);
  }
  const blocked = i => grid[i] === 1 || wgrid[i] === 1;
  // Relief et eau dans l'itinéraire : coût selon la pente (m/m) ; infranchissables au-delà de 28° ou de
  // 0,75 m d'eau (le gué le plus bas, celui du StuG, est de 0,8 m) ; tcost garde le coût de chaque maille
  let tcost = null, heavyNo = null, navHeavy = false;
  function terrainGrid() {
    tcost = new Float32Array(GC * GR).fill(1); heavyNo = new Uint8Array(GC * GR);
    if (!terra) return;
    for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
      const i = r * GC + c, x = (c + 0.5) * CELL, y = (r + 0.5) * CELL, e = CELL / 2, G0 = terra.ground;
      const sl = Math.hypot(G0(x + e, y) - G0(x - e, y), G0(x, y + e) - G0(x, y - e)) / (2 * e) * PX;
      if (sl > 0.53 || terra.depth(x, y) > 0.75) { grid[i] = 1; continue; }
      // glace et pont : interdits aux chars de plus de 30 t (navHeavy)
      if (terra.iceAt(x, y) || terra.bridgeAt(x, y)) heavyNo[i] = 1;
      tcost[i] = 1 + 4 * sl * sl + (terra.depth(x, y) > 0 ? 1.5 : 0);
    }
  }
  function markGrid(o) {
    if (o.dead) return;
    const tree = o.type === 'tree';
    const inf = tree ? 2 : 22, v = tree ? 2 : 1;
    const c0 = Math.max(0, Math.floor((o.x - inf) / CELL)), c1 = Math.min(GC - 1, Math.floor((o.x + o.w + inf) / CELL));
    const r0 = Math.max(0, Math.floor((o.y - inf) / CELL)), r1 = Math.min(GR - 1, Math.floor((o.y + o.h + inf) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * GC + c; if (grid[i] !== 1) grid[i] = v; }
  }
  const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, GR - 1) * GC + clamp(Math.floor(x / CELL), 0, GC - 1);
  function nearestFree(i) {
    if (!blocked(i)) return i;
    const c = i % GC, r = (i / GC) | 0;
    for (let d = 1; d < 20; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        const cc = c + dx, rr = r + dy;
        if (cc < 0 || rr < 0 || cc >= GC || rr >= GR) continue;
        const j = rr * GC + cc;
        if (!blocked(j)) return j;
      }
    }
    return -1;
  }

  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v;
      let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0];
      const lk = k.pop(), lv = v.pop();
      if (k.length) {
        let i = 0; const n = k.length;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i, mk = lk;
          if (l < n && k[l] < mk) { m = l; mk = k[l]; }
          if (r < n && k[r] < mk) { m = r; }
          if (m === i) break;
          k[i] = k[m]; v[i] = v[m]; i = m;
        }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
  }

  let gScore = null, came = null, seenId = null, closedId = null, searchId = 0;
  function findPath(sx, sy, gx, gy) {
    const s = nearestFree(cellOf(sx, sy)), g = nearestFree(cellOf(gx, gy));
    if (s < 0 || g < 0) return null;
    const N = GC * GR;
    if (!gScore || gScore.length !== N) {
      gScore = new Float32Array(N); came = new Int32Array(N); seenId = new Uint32Array(N); closedId = new Uint32Array(N);
    }
    searchId++;
    const gc = g % GC, gr = (g / GC) | 0;
    const h = i => { const dx = Math.abs(i % GC - gc), dy = Math.abs(((i / GC) | 0) - gr); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
    const open = new Heap();
    gScore[s] = 0; seenId[s] = searchId; came[s] = -1;
    open.push(h(s), s);
    let it = 0, found = false;
    while (open.size && it++ < 14000) {
      const cur = open.pop();
      if (closedId[cur] === searchId) continue;
      closedId[cur] = searchId;
      if (cur === g) { found = true; break; }
      const c = cur % GC, r = (cur / GC) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= GC || nr >= GR) continue;
        const ni = nr * GC + nc;
        if (blocked(ni) || closedId[ni] === searchId || navHeavy && heavyNo[ni]) continue;
        if (dx && dy && (blocked(r * GC + nc) || blocked(nr * GC + c))) continue;
        const cost = (dx && dy ? 1.414 : 1) * (grid[ni] === 2 || wgrid[ni] === 2 ? 2.5 : 1) * (soil ? Vehicle.SOILS[soil[ni]].path : 1) * tcost[ni];
        const ng = gScore[cur] + cost;
        if (seenId[ni] !== searchId || ng < gScore[ni]) {
          seenId[ni] = searchId; gScore[ni] = ng; came[ni] = cur;
          open.push(ng + h(ni), ni);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = g; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => ({ x: (i % GC + 0.5) * CELL, y: (((i / GC) | 0) + 0.5) * CELL }));
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 14);
      while (j > i + 1 && !gridLineFree(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    if (!out.length) out.push({ x: gx, y: gy });
    return out;
  }
  function gridLineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 8);
    for (let k = 1; k < n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
      if (blocked(cellOf(x, y))) return false;
    }
    return true;
  }

  // ===================== Chars et équipage =====================
  // Équipage de l'IA : tireur (dispersion, réaction), mémoire de la cible, corrections de tir, repli,
  // réaction à un canon braqué, débordement et embuscade
  function makeAI(skill) {
    return {
      skill, aimStd: 0.05 * (1 - skill) + 0.006, react: (1.1 - 0.75 * skill) * aiReact, careless: Math.random() < (1 - skill) * 0.35,
      target: null, threat: null, threatK: 0, los: false, lastKnown: null, dest: null, path: null, pi: 0, pathT: 0, pathDest: null,
      thinkT: Math.random() * 0.3, reactT: 0, aimErr: 0, biasA: 0, corrA: 0, leadErr: 0, rngK: 1, bearErr: 0, trackT: 0, lostT: 0, mem: null, vx: 0, vy: 0, shots: 0, pen: 1,
      stuckT: 0, unstickT: 0, unstickDir: -1, unstickTurn: 1, wiggleT: 0, wig: 1, laneY: WH / 2, waitT: 0, noContactT: 0, pushT: 0,
      state: 'engage', wdT: 0, wdCd: 0, noFireT: 0, cover: null, evadeT: 0, evadeDir: 0, evCd: 0, aimedT: 0, mode: null, flankT: 0, post: null,
    };
  }
  // multiplicateurs neutres (IA) ; en Vétéran et As, les chars ennemis ont des pièces (Meta.enemyUp)
  const DEF_UP = { hp: 1, pen: 1, armor: 1, grip: 1, optic: 1, view: 1, reload: 1, ready: 0, armorLv: 0, disp: 1, moveDisp: 1, relay: 1, sixth: false };
  function makeTank(typeId, team, x, y, angle, isPlayer, name, skill) {
    const T = TYPES[typeId], up = isPlayer ? Meta.mods(typeId) : (team === 1 && Meta.enemyUp()) || DEF_UP;
    const mods = TankModels.makeModules(typeId);
    const roles = {};
    mods.forEach((m, i) => { if (m.kind === 'crew') roles[m.role] = i; });
    const t = {
      id: ++tankId, T, team, x, y, x0: x, angle, turret: 0, speed: 0, turnRate: 0, turretRate: 0, vx: 0, vy: 0,
      // conduite : glissement latéral (px/s), rapport (0 point mort, < 0 marche arrière), régime (tr/min, et
      // 0..1 pour le son), charge du moteur, effort à la jante (N)
      vl: 0, gear: 0, nextGear: 0, shiftT: 0, rpmA: Vehicle.IDLE, rpm: 0, load: 0, fDrive: 0, braking: false, slip: 0,
      dead: false, deadT: 0, isPlayer, name, r: (T.len + T.wid) / 4,
      mods, roles, seat: Object.assign({}, roles), swap: null, rep: {}, ammo: Object.assign({}, T.ammo), shell: 'APHE', nextShell: null,
      reloadT: rnd(0.8, 1.6), disp: T.disp * 3, smoke: 2, trackT: 0, fires: [], cookT: 0, extN: 2, extT: 0, stunT: 0,
      // moral de l'équipage (0..1) : sous 0,2, l'IA abandonne le char
      morale: isPlayer ? 1 : 0.6 + 0.4 * (skill || 0.5), wreck: null, dismount: false, aid: null, leak: 0,
      mg: { ammo: 2700, ammoH: 150, type: 'SmK', heat: 0, jam: 0, cd: 0, n: 0, burst: 0, wait: rnd(1, 4) },
      // chef de char sorti de la coupole (meilleure vue, mais exposé aux balles), optiques endommagées
      sus: { p: 0, vp: 0, r: 0, vr: 0, v0: 0 }, gz: 0, vz: 0, gp: 0, gr: 0, wd: [0, 0], trackSide: 1, up, ready: T.ready + up.ready, readyT: 0, reloadMax: T.reload, elev: 0, fireAge: 9, scars: [], scarDirty: false, scarT: 0, scar3: null,
      hatch: !isPlayer, underFire: 0, calm: 20, optic: { driver: 0, gunner: 0, cmd: 0 },
      revealT: 0, recoil: 0, flash: 0, trackAcc: 0, treadPhase: 0, hitFlash: 0, turretGone: false,
      in: { throttle: 0, turn: 0, brake: false, aim: angle, fire: false },
      ai: (isPlayer && !AUTO) ? null : makeAI(skill),
    };
    stowAmmo(t);
    // jamais dans l'eau profonde ni sur une berge trop raide : la maille praticable la plus proche
    if (grid && terra && blocked(cellOf(t.x, t.y))) { const j = nearestFree(cellOf(t.x, t.y)); if (j >= 0) { t.x = (j % GC + 0.5) * CELL; t.y = ((j / GC | 0) + 0.5) * CELL; } }
    tankPose(t, 0); t.sus.p = t.gp; t.sus.r = t.gr;
    return t;
  }
  // Soutes : chaque râtelier reçoit sa part de chaque obus au prorata de son volume (m.rounds) ; t.ammo en
  // reste la somme. Rangé de nouveau au ravitaillement.
  const rackN = m => { let n = 0; for (const k in m.rounds) n += m.rounds[k]; return n; };
  function stowAmmo(t) {
    const racks = t.mods.filter(m => m.kind === 'ammo'), vol = m => m.s[0] * m.s[1] * m.s[2], V = racks.reduce((a, m) => a + vol(m), 0);
    for (const m of racks) m.rounds = {};
    for (const k of SHELL_KEYS) {
      let left = t.ammo[k];
      racks.forEach((m, i) => { m.rounds[k] = i === racks.length - 1 ? left : Math.min(left, Math.round(t.ammo[k] * vol(m) / V)); left -= m.rounds[k]; });
    }
    for (const m of racks) m.cap = Math.max(m.cap || 1, rackN(m));
  }
  // un obus pris pour le tir : râtelier de tourelle d'abord, puis la soute de caisse la mieux garnie
  function takeRound(t, key) {
    t.ammo[key]--;
    let best = null;
    const sc = m => (m.frame === 'turret' ? 1e3 : 0) + m.rounds[key];
    for (const m of t.mods) if (m.kind === 'ammo' && m.rounds[key] > 0 && (!best || sc(m) > sc(best))) best = m;
    if (best) best.rounds[key]--;
  }
  // soute crevée : une part des obus est ruinée (douilles fendues, charges éparpillées)
  function ruinRack(t, m, frac) {
    let lost = 0;
    for (const k in m.rounds) { const n = Math.round(m.rounds[k] * frac); m.rounds[k] -= n; t.ammo[k] = Math.max(0, t.ammo[k] - n); lost += n; }
    if (m.frame === 'turret') t.ready = 0;
    return lost;
  }
  // Place de chaque homme : la géométrie des modules d'origine (les remplaçants changent de place)
  function resetSeats(t) {
    const fresh = TankModels.makeModules(t.T.id);
    t.roles = {};
    t.mods.forEach((m, i) => {
      const f = fresh[i];
      m.frame = f.frame; m.c = f.c; m.s = f.s; m.min = f.min; m.max = f.max; m.sub = false; m.out = false; m.band = false;
      if (m.kind === 'crew') t.roles[m.role] = i;
    });
    t.seat = Object.assign({}, t.roles); t.swap = null; t.aid = null; t.dismount = false;
  }
  // Équipage remis en état (char réparé sur place) : chacun à son poste, plus de minuteries en cours
  function resetCrew(t) {
    resetSeats(t);
    t.rep = {}; t.optic = { driver: 0, gunner: 0, cmd: 0 }; t.mg.jam = 0; t.mg.heat = 0;
    t.fires = []; t.cookT = 0; t.stunT = 0; t.ringT = 0; t.elevJamT = 0; t.gunT = 0; t.morale = 1; t.leak = 0; t.extN = 2; t.extT = 0;
    for (const m of t.mods) m.wreckd = false;
  }
  function pivot(t) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    return { x: t.x + c * t.T.pivX - s * t.T.pivY, y: t.y + s * t.T.pivX + c * t.T.pivY };
  }
  function crewAlive(t) { let n = 0; for (const m of t.mods) if (m.kind === 'crew' && m.hp > 0) n++; return n; }
  const crewFrac = t => crewAlive(t) / t.T.crewN;
  function roleOk(t, r) { const i = t.roles[r]; return i != null && i >= 0 && t.mods[i].hp > 0 && !t.mods[i].out; }
  function modOk(t, kind) { for (const m of t.mods) if (m.kind === kind && m.hp <= 0) return false; return true; }
  // état d'un module : 0 intact (≥ 60 %), 1 endommagé, 2 détruit
  const modState = m => m.hp <= 0 ? 2 : m.hp < m.max0 * 0.6 ? 1 : 0;
  // aptitude d'un blessé : 100 % au-dessus de 60 points de vie, 75 % au-dessus de 25, 50 % en dessous
  const woundK = m => m.hp >= 60 ? 1 : m.hp >= 25 ? 0.75 : 0.5;
  // Efficacité d'un poste (0 s'il est vacant) : blessure, remplaçant ou recrue moins entraînés (80 %),
  // équipage sonné par un coup (50 %)
  function eff(t, r) {
    const i = t.roles[r], m = i != null && i >= 0 ? t.mods[i] : null;
    if (!m || m.hp <= 0 || m.out) return 0;
    return woundK(m) * (m.sub || m.rookie ? 0.8 : 1) * (t.stunT > 0 ? 0.5 : 1);
  }
  // position d'un module dans le repère de la caisse (la tourelle tourne autour de son pivot)
  function hullC(t, m) {
    if (m.frame !== 'turret') return m.c;
    const q = rotZ(m.c, -t.turret);
    return [q[0] + t.T.I.pivotX, q[1] + t.T.I.pivotY, q[2]];
  }
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const modOf = (t, kind) => t.mods.find(m => m.kind === kind);
  function ammoFrac(t) {
    let a = 0, b = 0;
    for (const k of SHELL_KEYS) { a += t.ammo[k]; b += t.T.ammo[k]; }
    return b ? a / b : 0;
  }
  const canFire = t => roleOk(t, 'gunner') && modOk(t, 'breech') && t.ammo[t.shell] > 0 && !(t.gunT > 0) && !(t.extT > 0);
  // Chargeur (ou chef de char sans chargeur) : sa blessure ralentit le chargement ; absent, le tireur
  // ou le chef charge (× 2,2 ou × 1,6). Culasse endommagée : × 1,3.
  const loaderRole = t => t.T.S.crew.includes('loader') ? 'loader' : 'commander';
  function reloadMul(t) {
    const r = loaderRole(t), e = eff(t, r);
    return (e > 0 ? 1 / e : r === 'loader' ? 2.2 : 1.6) * (modState(modOf(t, 'breech')) === 1 ? 1.3 : 1);
  }
  function nextShell(t, pref) {
    for (const k of [pref, 'APHE', 'AP', 'APCR', 'HEAT', 'HE']) if (k && t.ammo[k] > 0) return k;
    return t.shell;
  }
  // Durée d'un rechargement : chargeur (amélioration), puis soutes de caisse une fois le râtelier de
  // tourelle vide
  const reloadTime = t => t.T.reload * t.up.reload * (t.ready > 0 ? 1 : 1.45);
  // Changement d'obus. L'obus déjà dans la culasse y reste : on le tire et le chargeur prend ensuite celui
  // demandé (mis en attente). Pendant un rechargement, il prend directement l'autre. Demander deux fois le
  // même obus, ou unload, fait extraire l'obus chargé : rechargement complet plus 1,5 s.
  function selectShell(t, key, unload) {
    if (key === t.shell) { const had = !!t.nextShell; t.nextShell = null; return had ? 'cancelled' : 'loaded'; }
    if (t.reloadT > 0) { t.shell = key; t.nextShell = null; return 'switched'; }
    if (unload || t.nextShell === key) { t.shell = key; t.nextShell = null; t.reloadMax = reloadTime(t) + 1.5; t.reloadT = t.reloadMax; return 'unloaded'; }
    t.nextShell = key;
    return 'queued';
  }

  // Habileté de l'IA ennemie : habileté de base + décalage de la difficulté choisie et aide adaptative du
  // secteur (Meta.aiSkill), puis un multiplicateur global (1 = réglage d'origine). aiReact : temps de
  // réaction selon la difficulté, relu à chaque vague.
  let aiSkillK = 1, aiReact = 1;
  const aiSkill = s => clamp(Meta.aiSkill(s, mode === 'campagne' ? levelIdx : null) * aiSkillK, 0.1, 0.98);
  // Dispositifs d'attaque de la campagne : places [recul depuis le bord est, décalage vertical, délai
  // d'entrée en s], du plus lourd au plus léger. « late » : deux chars débouchent du coin nord-est
  // 40 s plus tard ; « ambush » : les chasseurs de chars attendent dans des buissons à mi-terrain.
  const FORMS = {
    line: [[0, 0], [60, -150], [60, 150], [0, -300], [0, 300]],
    wedge: [[0, 0], [80, -100], [80, 100], [160, -200], [160, 200]],
    pincer: [[120, 0], [0, -480], [0, 480], [60, -560], [60, 560]],
    late: [[0, 0], [60, -150], [60, 150], [0, -650, 40], [60, -590, 40]],
    ambush: [[0, 0], [60, -150], [60, 150], [0, -300], [0, 300]],
  };
  const HEAVY = ['kingtiger', 'heavy', 'destroyer', 'medium', 'stug', 'pz4', 'light'];
  let reinf = [], waveForm = 'line', revengeNext = false; // revengeNext : première reprise d'une vague perdue (prime de revanche)
  function spawnWave() {
    if (W3D0) for (const t of tanks) if (t.scar3) { W3D0.free(t.scar3.hull); W3D0.free(t.scar3.turret); }
    reviveT = 0; reviveUsed = false;
    clearFalls3();
    tanks = []; shells = []; bullets = []; smokes = []; texts = []; feed = []; parts = []; logs = []; runners = []; ribbons = []; ribbonQ = []; flares = []; hitMk = null; slowT = 0;
    dmgDirs = []; radio = null; radioQ = []; chat = {}; deathCamT = 0; killCard = null; flareT = [rnd(15, 30), rnd(20, 40)];
    if (obstacles.some(o => o.type === 'wreck')) { obstacles = obstacles.filter(o => o.type !== 'wreck'); buildGrid(); }
    orders = { kind: 'free', pos: null, target: null, t: 0 }; reinf = []; veils = [];
    spotted[0].clear(); spotted[1].clear(); seenAt.clear(); artyMarks = []; contactT = [0, 0]; artyT = [0, 0];
    HitCam.stop();
    if (W3D && groundCv) setEnv3();
    const lv = L();
    aiReact = Meta.diff().react;
    const allyTypes = levelIdx < 2 ? ['pz4', 'light', 'medium', 'stug'] : levelIdx < 4 ? ['medium', 'heavy', 'destroyer', 'pz4'] : ['kingtiger', 'medium', 'stug', 'heavy'];
    // camp d'entraînement : la toute première bataille oppose des chars légers peu aguerris, plus proches
    const boot = mode === 'campagne' && levelIdx === 0 && waveIdx === 0 && (DEV_RUN ? dq('tut') : Meta.P.stats.battles === 0);
    const enemyTypes = boot ? ['light', 'light', 'pz4', 'light', 'pz4'] : lv.waves[waveIdx];
    const eSkill = boot ? 0.2 : aiSkill(Math.min(0.95, 0.3 + levelIdx * 0.14 + waveIdx * 0.04));
    const aSkill = Math.min(0.7, 0.5 + levelIdx * 0.05);
    const slots = [-300, -150, 0, 150, 300];
    const aT = [allyTypes[0], allyTypes[1], chosenType, allyTypes[2], allyTypes[3]];
    let n = 1;
    enemyN = 0;
    if (mode !== 'campagne') {
      player = makeTank(chosenType, 0, 200, WH / 2, 0, true, 'You', aSkill);
      tanks.push(player);
      if (mode === 'duel') {
        const t = makeTank(chosenType, 1, WW - 200, WH / 2 + rnd(-300, 300), Math.PI, false, 'Enemy 1', aiSkill(0.45 + 0.08 * levelIdx));
        t.ai.laneY = clamp(t.y + rnd(-200, 200), 150, WH - 150);
        tanks.push(t); enemyN = 1;
      } else { survWave = 1; nextWaveT = 0; survivalEnemies(survWave); }
    } else for (let i = 0; i < 5; i++) {
      const isP = i === 2;
      const t = makeTank(aT[i], 0, 200 + (i % 2) * 60, WH / 2 + slots[i], 0, isP, isP ? 'You' : 'Ally ' + (n++), aSkill);
      if (t.ai) t.ai.laneY = clamp(t.y + rnd(-150, 150), 150, WH - 150);
      tanks.push(t);
      if (isP) player = t;
    }
    if (mode === 'campagne') {
      // dispositif tiré au sort parmi ceux de la vague, retourné une fois sur deux ; les plus lourds aux
      // premières places
      const fl = boot ? ['line'] : (lv.forms && lv.forms[waveIdx]) || ['line'], f = waveForm = FORMS[dq('form') && Q.get('form')] ? Q.get('form') : fl[Math.floor(Math.random() * fl.length)], F = FORMS[f], sg = Math.random() < 0.5 ? 1 : -1, used = [];
      enemyTypes.slice().sort((a, b) => HEAVY.indexOf(a) - HEAVY.indexOf(b)).forEach((type, i) => {
        const q = F[i], name = 'Enemy ' + (i + 1);
        let x = (boot ? WW * 0.62 : WW - 200) - q[0], y = WH / 2 + sg * q[1], post = null;
        if (f === 'ambush' && ROLES[type] === 'ambush') {
          // chasseur de chars posté d'avance dans un buisson à mi-terrain, loin des autres postes
          const bs = bushes.filter(b => b.x > WW * 0.45 && b.x < WW * 0.62 && !blocked(cellOf(b.x, b.y)) && used.every(u => Math.abs(u.y - b.y) > 250)), b = bs[Math.floor(Math.random() * bs.length)];
          if (b) { used.push(b); x = b.x; y = b.y; post = { x: b.x, y: b.y }; }
        }
        if (q[2]) { reinf.push({ type, x, y, at: q[2], name, skill: eSkill }); return; }
        const t = makeTank(type, 1, x, clamp(y, 120, WH - 120), Math.PI, false, name, eSkill);
        t.ai.laneY = clamp(t.y + rnd(-200, 200), 150, WH - 150);
        if (post) { t.ai.post = post; t.ai.mode = 'ambush'; }
        tanks.push(t);
      });
    }
    camX = player.x + 300; camY = player.y;
    Sfx.setTank(player.T.id, player.T.D.rated, player.T.D.trav.kind);
    Sfx.setRoom(lv.forest ? 'forest' : lv.city ? 'city' : lv.desert ? 'desert' : lv.snow ? 'snow' : 'open');
    specIdx = 0;
    waveStats = { kills: 0, pens: 0, crew: 0, mods: 0, ffCrew: 0, tk: 0, hits: 0, shots: 0, ric: 0, dodged: 0, crits: 0, fires: 0, bailed: 0, saved: 0,
      ffPens: 0, medals: [], killT: [], streak: 0, streakCr: 0, firstKill: false, ricSelf: 0, pened: false, revived: false, longest: 0, maxPen: 0, revenge: revengeNext };
    if (revengeNext) addLog('Revenge bonus: +50% credits if you win this wave', '#ffd76a');
    revengeNext = false;
    // introduction allongée quand la fiche des commandes s'affiche (deux premières batailles)
    state = 'intro'; introT = cardOn() ? 5 : 3.2; waveTime = 0; tut.t = 0; tut.drv = 0;
    playMusic();
    if (waveIdx === 0) { sectorScore = 0; sectorTk = 0; }
    hideDeadBar();
    if (mode === 'campagne' && waveIdx === 0) addLog('Radio orders: 8 attack my target · 9 follow me · 0 hold · N move there', '#bcd8ff');
    Meta.sdk.gameplayStart();
    msgs = [];
    OBJ.onWave();
  }

  // Survie : la vague n arrive d'un bord ou d'un coin éloigné du joueur, tiré au sort, plus nombreuse,
  // plus lourde et plus habile ; toutes les 5 vagues un Tigre royal et son escorte, et entre-temps des
  // reconnaissances rapides de Lynx. Les chars visent la position du joueur à leur arrivée.
  const SURV_SIDES = [[1, 0.5], [1, 0.12], [1, 0.88], [0.5, 0.1], [0.5, 0.9], [0, 0.5], [0, 0.12], [0, 0.88]];
  function survivalEnemies(n) {
    const pool = ['light', 'pz4', 'light', 'stug', 'medium', 'pz4', 'destroyer', 'heavy', 'kingtiger'];
    const skill = aiSkill(Math.min(0.95, 0.3 + n * 0.06)), px = player ? player.x : 200, py = player ? player.y : WH / 2;
    let types;
    if (n % 5 === 0) types = ['kingtiger', 'pz4', 'pz4', 'heavy'].slice(0, 3 + (n >= 10));
    else if (n % 5 === 3) types = Array(Math.min(5, Math.ceil(n * 0.7) + 1)).fill('light');
    else types = Array.from({ length: Math.min(5, Math.ceil(n * 0.7)) }, () => pool[clamp(Math.floor(Math.random() * (1.5 + n * 0.8)), 0, pool.length - 1)]);
    const far = SURV_SIDES.map(q => ({ x: clamp(q[0] * WW, 200, WW - 200), y: clamp(q[1] * WH, 150, WH - 150) })).sort((a, b) => Math.hypot(b.x - px, b.y - py) - Math.hypot(a.x - px, a.y - py));
    const o = far[Math.floor(Math.random() * 3)], ang = Math.atan2(py - o.y, px - o.x), ux = Math.cos(ang), uy = Math.sin(ang);
    types.forEach((type, i) => {
      // colonne double tournée vers le joueur
      const back = (i >> 1) * 70, lat = types.length > 1 ? (i % 2 ? 1 : -1) * 55 : 0;
      const t = makeTank(type, 1, clamp(o.x - ux * back - uy * lat, 120, WW - 120), clamp(o.y - uy * back + ux * lat, 120, WH - 120), ang, false, 'Enemy ' + (++enemyN), skill);
      t.ai.homeX = t.x; t.ai.goalX = px; t.ai.laneY = clamp(py + rnd(-200, 200), 150, WH - 150);
      tanks.push(t);
    });
    contactT = [waveTime, waveTime];
    return types.length;
  }
  // Entre deux vagues de survie : munitions complétées de moitié, réparations de campagne ; les blessés
  // sont soignés en partie, les morts remplacés par des recrues (80 %), chacun reprend son poste
  function resupply(t) {
    for (const k of SHELL_KEYS) t.ammo[k] = Math.min(t.T.ammo[k], t.ammo[k] + Math.ceil(t.T.ammo[k] * 0.5));
    for (const m of t.mods) {
      if (m.kind !== 'crew') { m.hp = m.max0; m.wreckd = false; }
      else if (m.hp <= 0) { m.hp = m.max0; m.rookie = true; }
      else m.hp = Math.min(m.max0, m.hp + 40);
    }
    resetSeats(t); stowAmmo(t);
    t.optic = { driver: 0, gunner: 0, cmd: 0 }; t.gunT = 0; t.ringT = 0; t.elevJamT = 0; t.cookT = 0; t.leak = 0; t.extN = 2;
    t.rep = {}; t.trackT = 0; t.fires = []; t.wheelK = 1; t.smoke = Math.min(2, t.smoke + 1); t.noFuel = false; t.fuelOutT = null; t.bentT = 0;
    if (t.ammo[t.shell] <= 0) t.shell = nextShell(t);
  }

  // ===================== Visibilité =====================
  function inBush(t) {
    for (const b of bushes) if (Math.hypot(t.x - b.x, t.y - b.y) < b.r * 0.85) return true;
    return false;
  }
  // Hauteur des obstacles en mètres (comme dans le décor 3D) : un muret de 1,3 m cache la caisse
  // mais laisse voir et tirer par-dessus, depuis et vers une tourelle
  function obsH(o) {
    if (o.type === 'wall') return 1.3;
    if (o.type === 'wreck') return o.ht;
    if (o.type === 'rock') return Math.min(o.w, o.h) / PX * 0.45;
    return o.type === 'tree' ? 14 : 9;
  }
  // Blindage équivalent (mm d'acier) d'une paroi d'obstacle traversée de face : brique 0,13 mm par mm,
  // bois 0,04 ; la roche arrête tout
  function obsEq(o) {
    if (o.type === 'wall') return 45;              // muret de briques de 35 cm
    if (o.type === 'building') return 65;          // mur de maison de 50 cm (chaque paroi)
    if (o.type === 'tree') return 16 * o.size;     // tronc d'environ 40 cm
    return Infinity;
  }
  // z0, z1 : hauteurs absolues des deux bouts (par défaut 2,2 m et 1,8 m au-dessus du sol). Le relief
  // coupe la ligne (une crête cache ce qui est derrière elle) ; un obstacle ne la coupe que s'il dépasse
  // sa hauteur à cet endroit (un rocher bas laisse voir une tourelle)
  function losClear(x0, y0, x1, y1, vision, blast, self, z0, z1) {
    const dx = x1 - x0, dy = y1 - y0;
    if (z0 == null) z0 = hAt(x0, y0) + 2.2;
    if (z1 == null) z1 = hAt(x1, y1) + 1.8;
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    for (const o of obstacles) {
      if (o.dead || ((o.type === 'wall' || o.type === 'wreck') && !blast)) continue;
      if (o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny) continue;
      const h = segAABB(x0, y0, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
      if (h && h.t < 1 && z0 + (z1 - z0) * h.t <= obsTop(o)) return false;
    }
    if (terra && terra.cut(x0, y0, z0, x1, y1, z1) >= 0) return false;
    if (vision) {
      const l2 = dx * dx + dy * dy || 1;
      for (const s of smokes) {
        const k = clamp(((s.x - x0) * dx + (s.y - y0) * dy) / l2, 0, 1);
        if (Math.hypot(x0 + dx * k - s.x, y0 + dy * k - s.y) < s.r * 0.8) return false;
      }
      // poussières (sauf celle de son propre coup) et panaches des épaves en feu, rabattus par le vent
      let op = 0;
      for (const v of veils) if (v.by !== self) op += v.dens * veilA(v) * chord(x0, y0, dx, dy, l2, v.x, v.y, v.r);
      const wk = 6 * PX / Math.max(1, Math.hypot(WIND.x, WIND.y));
      for (const w of tanks) if (w.dead && (w.wreck === 'burning' || w.wreck === 'brewed' && w.deadT < 12)) op += 0.6 * chord(x0, y0, dx, dy, l2, w.x + WIND.x * wk, w.y + WIND.y * wk, 6 * PX);
      if (op >= 1) return false;
    }
    return true;
  }
  // Corde traversée dans un disque (en rayons, de 0 à 2) par le segment (x0, y0) + k·(dx, dy)
  // Hauteurs de vue : œil du chef (sorti de sa coupole ou aux épiscopes), haut de la tourelle, milieu de
  // la caisse ; caisse défilée : vue du canon de a, une crête ou un obstacle cache la caisse de e
  const eyeZ = a => a.gz + a.T.I.totalH + (a.hatch ? 0.6 : 0.1), topZ = e => e.gz + e.T.I.totalH - 0.1;
  const hullMasked = (a, e) => !losClear(a.x, a.y, e.x, e.y, false, true, a, a.gz + a.T.S.gun.z, e.gz + e.T.S.ht * 0.6);
  function chord(x0, y0, dx, dy, l2, cx, cy, r) {
    const k = clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1), h = Math.hypot(x0 + dx * k - cx, y0 + dy * k - cy);
    return h < r ? 2 * Math.sqrt(1 - h * h / (r * r)) : 0;
  }
  // Voiles de poussière : départ du coup (selon le calibre et le sol de la carte, dustK) et explosion
  // d'obus explosif. « dens » : opacité par rayon traversé ; la vue est coupée quand la somme des cordes
  // pondérées atteint 1. Le tireur ne compte pas la sienne : elle voile sa lunette et lui cache la chute
  // du coup (seul un chef sorti de la coupole la voit encore).
  let veils = [];
  const veilA = v => Math.min(1, 2 * v.life / v.max);
  function muzzleVeil(t, mx, my) {
    const q = (L().dustK || 0) * Math.min(1.3, t.T.caliber / 75), ta = t.angle + t.turret, r = (3 + 4 * q) * PX;
    if (q >= 0.3) veils.push({ x: mx + Math.cos(ta) * r * 0.6, y: my + Math.sin(ta) * r * 0.6, r, life: 1 + 1.6 * q, max: 1 + 1.6 * q, dens: 0.7 * q, by: t });
  }
  const ownVeil = t => { let a = 0; for (const v of veils) if (v.by === t) a = Math.max(a, v.dens * veilA(v)); return a; };
  // Radio : poste intact et quelqu'un pour le servir (radio, chef ou chargeur)
  const radioOk = t => modOk(t, 'radio') && (roleOk(t, 'radio') || roleOk(t, 'commander') || roleOk(t, 'loader'));
  // Une épave sur la ligne de visée cache ce qui est plus bas qu'elle (portée de détection divisée par deux)
  function wreckCover(a, e) {
    const dx = e.x - a.x, dy = e.y - a.y, l2 = dx * dx + dy * dy || 1;
    for (const w of tanks) {
      if (!w.dead || w === e) continue;
      const k = ((w.x - a.x) * dx + (w.y - a.y) * dy) / l2;
      if (k > 0 && k < 1 && Math.hypot(a.x + dx * k - w.x, a.y + dy * k - w.y) < w.r && e.gz + e.T.I.totalH < w.gz + wreckTop(w) + 0.3) return true;
    }
    return false;
  }
  const wreckTop = w => w.turretGone ? w.T.S.ht : w.T.I.totalH;
  // Détection progressive : chaque observateur accumule sur chaque ennemi (a.det) selon la distance, la
  // taille de la silhouette (Panther de référence), le mouvement ou l'immobilité, le buisson et le coup de
  // feu ; repéré à 1, l'acquis s'efface de 0,5 par seconde hors de vue. Chaque char voit par lui-même
  // (t.sees) ; ce que voient les chars dont la radio marche est partagé entre eux (t.knows).
  const REF_AREA = 6.9 * 3.42;
  let contactT = [0, 0], artyT = [0, 0], artyMarks = [];
  const seenAt = new Map();
  function updateSpotting(dt) {
    const night = !!L().night, prev0 = new Set(spotted[0]);
    for (const a of tanks) { (a.sees || (a.sees = new Set())).clear(); if (!a.det) a.det = new Map(); }
    for (let team = 0; team < 2; team++) {
      const set = spotted[team], net = new Set();
      set.clear();
      for (const e of tanks) {
        if (e.dead || e.team === team) continue;
        const bush = e.revealT <= 0 && inBush(e);
        const vis = Math.sqrt(e.T.S.L * e.T.S.W / REF_AREA) * (Math.abs(e.speed) > 1.5 * PX ? 1.3 : e.stillT > 3 ? 0.7 : 1) * (bush ? 0.35 : 1);
        for (const a of tanks) {
          if (a.dead || a.team !== team) continue;
          const d = dist(a, e);
          let rate = -0.5;
          // tout près, on entend et on voit le char, sauf derrière une maison
          if (d < 90 && losClear(a.x, a.y, e.x, e.y, false, false, a, eyeZ(a), topZ(e))) rate = 9;
          else {
            let range = a.T.view * a.up.view * (a.team === 0 && player && a !== player && !player.dead ? player.up.relay : 1) * (night && !flareLit(e) ? 0.6 : 1) * (0.75 + 0.25 * eff(a, 'commander')) * (a.hatch ? 1.15 : 1) * (a.optic.cmd > 0 && !a.hatch ? 0.8 : 1);
            if (e.revealT > 0) range *= 1.3;
            // un char qui roule vite soulève un panache de poussière qui se voit de loin
            if (!night && !L().snow && Math.abs(e.speed) > e.T.speed * 0.5) range *= 1.2;
            if (d < range && wreckCover(a, e)) range *= 0.5;
            // la lueur et la poussière d'un coup de feu se voient même à travers la poussière soulevée
            if (d < range && e.revealT > 0 && losClear(a.x, a.y, e.x, e.y, false, false, a, eyeZ(a), topZ(e))) rate = 9;
            // caisse défilée derrière une crête : seule la tourelle dépasse, elle se repère moins vite
            else if (d < range && losClear(a.x, a.y, e.x, e.y, true, false, a, eyeZ(a), topZ(e))) rate = clamp(1.6 * (1 - d / range), 0.05, 1.6) * vis * (hullMasked(a, e) ? 0.6 : 1);
          }
          const v = clamp((a.det.get(e) || 0) + rate * dt, 0, 1.5);
          if (v > 0) a.det.set(e, v); else a.det.delete(e);
          if (rate > 0 && v >= 1) a.sees.add(e);
        }
      }
      for (const a of tanks) if (!a.dead && a.team === team) for (const e of a.sees) { set.add(e); if (radioOk(a)) net.add(e); }
      for (const a of tanks) if (a.team === team) a.knows = radioOk(a) ? net : a.sees;
      // Sans contact depuis 90 s, l'artillerie signale toutes les 20 s la position approximative (± 80 px)
      // d'un ennemi caché : l'IA va voir, le joueur la voit 4 s sur la carte ; ce n'est jamais un repérage
      if (set.size) contactT[team] = waveTime;
      else if (state === 'play' && !OBJ.active() && waveTime - contactT[team] > 90 && (artyT[team] -= dt) <= 0) {
        artyT[team] = 20;
        const foes = tanks.filter(e => !e.dead && e.team !== team);
        if (foes.length) {
          const e = foes[Math.floor(Math.random() * foes.length)], p = { x: clamp(e.x + rnd(-80, 80), 60, WW - 60), y: clamp(e.y + rnd(-80, 80), 60, WH - 60) };
          for (const a of tanks) if (!a.dead && a.team === team && a.ai && radioOk(a) && !a.ai.target) a.ai.lastKnown = p;
          if (team === 0) { artyMarks.push({ x: p.x, y: p.y, life: 4 }); addLog('Artillery observer: enemy armour reported', '#e9d9a6'); }
        }
      }
    }
    // sixième sens du chef de char (compétence) : alerte quand l'ennemi repère le joueur
    if (player && !player.dead && player.up.sixth) {
      const sp = spotted[1].has(player);
      if (sp && !player.spottedB && state === 'play') { chatter('Commander: we\'ve been spotted!', 2); Sfx.alarm(); }
      if (!sp && player.spottedB) player.lostT = gameTime;
      player.spottedB = sp;
    }
    // chef de char : ennemis nouvellement repérés, en position horaire par rapport à la caisse
    if (player && !player.dead && !player.ai && state === 'play') for (const e of spotted[0]) {
      const g = seenAt.get(e);
      if (prev0.has(e) || (g && gameTime - g.t < 8)) continue;
      const a = angNorm(Math.atan2(e.y - player.y, e.x - player.x) - player.angle), clock = (Math.round(a / (TAU / 12)) + 12) % 12 || 12;
      chatter(`${player.sees.has(e) && roleOk(player, 'commander') ? 'Commander' : 'Radio'}: ${e.T.name}, ${clock} o'clock, ${Math.round(dist(player, e) * RK / 50) * 50} m!`, 2);
    }
    // dernière position vue de chaque ennemi (repère fantôme 6 s pour le joueur)
    for (const e of (player && player.knows) || spotted[0]) seenAt.set(e, { x: e.x, y: e.y, t: gameTime });
  }

  // ===================== IA =====================
  function wreckClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    for (const w of tanks) {
      if (!w.dead) continue;
      const k = clamp(((w.x - a.x) * dx + (w.y - a.y) * dy) / l2, 0, 1);
      if (k <= 0 || k >= 1 || b.gz + b.T.S.ht - 0.25 >= w.gz + wreckTop(w) + 0.2) continue;
      if (Math.hypot(a.x + dx * k - w.x, a.y + dy * k - w.y) < w.r * 0.9) return false;
    }
    return true;
  }
  // Seule une épave masque la cible : pas de côté perpendiculaire à la ligne de tir, d'où on la voit
  function sideStep(t, e) {
    const d = dist(t, e) || 1, nx = -(e.y - t.y) / d, ny = (e.x - t.x) / d;
    let w = null;
    for (const o of tanks) if (o.dead && (!w || dist(t, o) < dist(t, w))) w = o;
    if (!w) return null;
    for (const sg of [1, -1]) {
      const k = sg * (t.T.wid * 2 + w.r), p = { x: clamp(t.x + nx * k, 60, WW - 60), y: clamp(t.y + ny * k, 60, WH - 60) };
      if (wreckClear(p, e) && losClear(p.x, p.y, e.x, e.y, false) && gridLineFree(t, p)) return p;
    }
    return null;
  }
  // Tireur sans précaution : il frôle ses alliés de plus près, jamais le char du joueur
  function friendlyClear(t, aim, d) {
    const pv = pivot(t), ux = Math.cos(aim), uy = Math.sin(aim);
    for (const a of tanks) {
      if (a === t || a.dead || a.team !== t.team) continue;
      const rx = a.x - pv.x, ry = a.y - pv.y;
      const along = rx * ux + ry * uy;
      if (along < 0 || along > d + 30) continue;
      if (Math.abs(rx * -uy + ry * ux) < a.r + (t.ai && t.ai.careless && !a.isPlayer ? 4 : 14)) return false;
    }
    return true;
  }

  // ----- Blindage vu du tireur -----
  const AI_SHELLS = ['APHE', 'AP', 'APCR', 'HEAT'];
  // Plaque que la cible présente au tireur : face (à moins de 35° de son axe), flanc ou arrière, avec le
  // lacet (degrés) qui s'ajoute à l'inclinaison propre de la plaque
  function aspectOf(t, e) {
    const rel = Math.abs(angNorm(Math.atan2(t.y - e.y, t.x - e.x) - e.angle)) / D2R, A = e.T.S.armor.hull;
    return rel < 35 ? { k: 'front', p: A.up, yaw: rel } : rel < 145 ? { k: 'side', p: A.side, yaw: Math.abs(90 - rel) } : { k: 'rear', p: A.rear, yaw: 180 - rel };
  }
  // Épaisseur à vaincre (mm) : obliquité composée (inclinaison et lacet), majorée par le risque de bris
  function plateNeed(sb, p, yaw, V) {
    const ang = Math.min(80, Math.acos(Math.cos(p[1] * D2R) * Math.cos(yaw * D2R)) / D2R);
    const shP = sb.heat || sb.he ? 0 : Ballistics.shatterChance(sb, p[0], ang, V);
    return Ballistics.effective(sb, p[0], ang).eff / (1 - shP * (1 - (Ballistics.SHATTER_PEN[sb.key] || 0.7)));
  }
  // Rapport perforation / épaisseur à vaincre de l'obus k, ou du meilleur obus en soute, sur la plaque p
  function penRatio(t, e, d, k, a = aspectOf(t, e), p = a.p) {
    let best = 0;
    for (const s of k ? [k] : AI_SHELLS) {
      if (!k && !(t.ammo[s] > 0)) continue;
      const sb = Ballistics.shell(t.T.id, s);
      best = Math.max(best, penAt(t.T, s, d) / plateNeed(sb, p, a.yaw, Ballistics.velAt(sb, d * RK)));
    }
    return best;
  }
  // Danger que l'ennemi e fait courir à t : sa perforation sur ce que t lui montre, plus grand s'il pointe
  // déjà son canon sur t, ou s'il est sur le point de tirer
  function threatOf(t, e, d) {
    const b = Math.atan2(t.y - e.y, t.x - e.x);
    return penRatio(e, t, d) * (Math.abs(angNorm(e.angle + e.turret - b)) < 5 * D2R ? 1.5 : 1) * (e.reloadT < 1 ? 1.2 : 1);
  }
  // Lacet de caisse (rad) qui maximise le plus faible des blindages de face et de flanc contre l'obus
  // probable de la menace, ricochet compris ; en cache par couple de types et tranche de 100 px
  const YAW = new Map();
  function bestYaw(t, e, d) {
    const key = t.T.id + e.T.id + Math.round(d / 100);
    if (YAW.has(key)) return YAW.get(key);
    const A = t.T.S.armor.hull, sb = Ballistics.shell(e.T.id, AI_SHELLS.find(k => e.T.ammo[k] > 0) || 'APHE');
    const eff = (p, i) => Ballistics.effective(sb, p[0], Math.min(i, 86)).eff * (1 + Ballistics.ricochetChance(sb, p[0], Math.min(i, 86)));
    let y = 0, bv = -1;
    for (let a = 0; a <= 45; a += 5) {
      const iF = Math.acos(Math.cos(A.up[1] * D2R) * Math.cos(a * D2R)) / D2R, iS = Math.acos(Math.cos(A.side[1] * D2R) * Math.sin(a * D2R)) / D2R;
      const v = Math.min(eff(A.up, iF), eff(A.side, iS));
      if (v > bv * 1.02) { bv = v; y = a * D2R; }
    }
    YAW.set(key, y);
    return y;
  }
  // Choix de l'obus selon la plaque visée : l'obus chargé tant qu'il perce ; sinon explosif perforant avec
  // 10 % de marge, sous-calibré de près, charge creuse, perforant ; si rien ne passe, un tireur exercé tire
  // de l'explosif dans le train de roulement ; mitraille sur un chef de char sorti, de près
  function aiShell(t, e, d) {
    const has = k => t.ammo[k] > 0, ok = k => has(k) && penRatio(t, e, d, k) >= 1;
    if (e.hatch && d < 120 && has('CAN')) return 'CAN';
    if (AI_SHELLS.includes(t.shell) && ok(t.shell)) return t.shell;
    if (has('APHE') && penRatio(t, e, d, 'APHE') >= 1.1) return 'APHE';
    if (d < 300 && ok('APCR')) return 'APCR';
    for (const k of ['HEAT', 'AP', 'APHE']) if (ok(k)) return k;
    if (t.ai.skill > 0.5 && has('HE')) return 'HE';
    let best = null, bp = -1;
    for (const k of AI_SHELLS) { const p = has(k) ? penRatio(t, e, d, k) : -1; if (p > bp) { bp = p; best = k; } }
    return best && has(best) ? best : nextShell(t);
  }
  // Hauteur visée (m) : haut de caisse ; un tireur exercé prend la plaque la plus faible (caisse basse,
  // caisse haute ou tourelle) ; l'explosif vise le train de roulement, la mitraille le chef de char
  function aiAimZ(t, e, d) {
    const S = e.T.S, A = S.armor;
    if (t.shell !== 'HE' && hullMasked(t, e)) return (S.ht + e.T.I.totalH) / 2;
    if (t.shell === 'HE') return S.gc + 0.3;
    if (t.shell === 'CAN') return e.T.I.totalH;
    if (t.ai.skill <= 0.6 || !AI_SHELLS.includes(t.shell)) return S.ht - 0.25;
    const a = aspectOf(t, e), f = a.k === 'front', s = a.k === 'side';
    const tu = A.turret || {}, C = [[S.ht - 0.25, a.p], [S.gc + 0.45, (f ? A.hull.low : s ? A.hull.lowSide : 0) || a.p], [(S.ht + e.T.I.totalH) / 2, (f ? tu.front : s ? tu.side : tu.rear) || a.p]];
    let z = C[0][0], bv = -1;
    for (const [zz, p] of C) { const v = penRatio(t, e, d, t.shell, a, p); if (v > bv * 1.05) { bv = v; z = zz; } }
    return z;
  }

  // ----- Postes et itinéraires -----
  // Rôles par type : reconnaissance (Lynx), ligne et débordement (moyens), fer de lance (lourds),
  // embuscade (chasseurs de chars et canons d'assaut, qui ne poursuivent pas)
  const ROLES = { light: 'scout', pz4: 'line', medium: 'line', heavy: 'spear', kingtiger: 'spear', stug: 'ambush', destroyer: 'ambush' };
  const bushNear = (p, r) => { let best = null, bd = r; for (const b of bushes) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = b; } } return best; };
  // Couvert le plus proche (à moins de rmax) qu'aucune des menaces ne voit
  function coverPoint(t, threats, rmax) {
    let best = null, bs = 1e9;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, R = rmax * (i % 2 ? 0.55 : 1), p = { x: clamp(t.x + Math.cos(a) * R, 60, WW - 60), y: clamp(t.y + Math.sin(a) * R, 60, WH - 60) };
      if (blocked(cellOf(p.x, p.y)) || threats.some(e => losClear(e.x, e.y, p.x, p.y, false))) continue;
      const s = dist(t, p);
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }
  // Caisse défilée face à e (aide pour l'IA) : parmi des points à moins de rmax px (anneaux de 12), le plus
  // proche où une crête ou un obstacle bas cache la caisse au canon de e tandis que notre canon voit encore
  // la sienne, au sec et sur une maille praticable ; null s'il n'y en a pas
  function hullDown(t, e, rmax = 140) {
    let best = null, bs = 1e9;
    const T = t.T, ez = e.gz + e.T.S.gun.z, eh = e.gz + e.T.S.ht * 0.6;
    for (let k = 0; k < 37; k++) {
      const ring = k ? 1 + Math.floor((k - 1) / 12) : 0, a = (k - 1) / 12 * TAU + ring * 0.26, R = rmax * ring / 3;
      const p = k ? { x: clamp(t.x + Math.cos(a) * R, 60, WW - 60), y: clamp(t.y + Math.sin(a) * R, 60, WH - 60) } : { x: t.x, y: t.y };
      if (blocked(cellOf(p.x, p.y)) || terra.depth(p.x, p.y) > 0.3) continue;
      const g = terra.ground(p.x, p.y), sc = R + (Math.hypot(p.x - e.x, p.y - e.y) > e.T.range * 1.3 ? 400 : 0);
      if (sc >= bs || losClear(e.x, e.y, p.x, p.y, false, true, e, ez, g + T.S.ht * 0.6)) continue;
      if (!losClear(p.x, p.y, e.x, e.y, false, true, t, g + T.S.gun.z, eh)) continue;
      bs = sc; best = p;
    }
    return best;
  }
  // position défilée retenue quelques secondes (pas d'hésitation entre deux crêtes)
  function hdSpot(t, e, rmax) {
    const ai = t.ai;
    if (ai.hdT <= 0 || ai.hdE !== e) { ai.hd = hullDown(t, e, rmax); ai.hdE = e; ai.hdT = ai.hd ? 6 : 3; }
    return ai.hd;
  }
  // Poste d'embuscade : un buisson sur l'axe d'approche, à environ « ahead » px en avant vers l'objectif
  function ambushPost(t, goalX, ahead, not) {
    const dir = Math.sign(goalX - t.x) || (t.team ? -1 : 1);
    let best = null, bs = 1e9;
    for (const b of bushes) {
      const f = (b.x - t.x) * dir;
      if (f < -200 || f > 750 || (not && Math.hypot(b.x - not.x, b.y - not.y) < 60) || blocked(cellOf(b.x, b.y))) continue;
      const s = Math.abs(f - ahead) + Math.abs(b.y - t.y) * 0.6;
      if (s < bs) { bs = s; best = { x: b.x, y: b.y }; }
    }
    return best;
  }
  // Point de débordement : à 80° de l'axe de la cible, aux trois quarts de la portée ; pénalisé s'il est
  // en vue d'autres ennemis, favorisé près d'un buisson
  function flankPoint(t, e, foes) {
    const R = 0.75 * t.T.range;
    let best = null, bs = -1e9;
    for (const sg of [-1, 1]) {
      const a = e.angle + sg * 80 * D2R, p = { x: clamp(e.x + Math.cos(a) * R, 80, WW - 80), y: clamp(e.y + Math.sin(a) * R, 80, WH - 80) };
      if (blocked(cellOf(p.x, p.y))) continue;
      let s = -dist(t, p) + (bushNear(p, 90) ? 150 : 0);
      for (const o of foes) if (o !== e && !o.dead && losClear(o.x, o.y, p.x, p.y, false)) s -= 300;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  // ----- Ordres du joueur à ses alliés (campagne) -----
  let orders = { kind: 'free', pos: null, target: null, t: 0 };
  const FOLLOW = [[-70, -60], [-70, 60], [-130, -120], [-130, 120]], SPREAD = [[0, 0], [40, 40], [-40, 40], [40, -40], [-40, -40]];
  function orderDest(t) {
    const i = Math.max(0, tanks.filter(a => a.team === 0 && a !== player && !a.dead).indexOf(t));
    if (orders.kind === 'follow') {
      const q = FOLLOW[i % 4], c = Math.cos(player.angle), s = Math.sin(player.angle);
      return { x: clamp(player.x + c * q[0] - s * q[1], 60, WW - 60), y: clamp(player.y + s * q[0] + c * q[1], 60, WH - 60) };
    }
    if (orders.kind === 'move') { const q = SPREAD[i % 5]; return { x: clamp(orders.pos.x + q[0], 60, WW - 60), y: clamp(orders.pos.y + q[1], 60, WH - 60) }; }
    if (orders.kind === 'hold') return t.ai.holdPt || (t.ai.holdPt = bushNear(t, 150) || { x: t.x, y: t.y });
    return null;
  }

  // Ordres radio (campagne) : 8 attaquer ma cible (20 s), 9 me suivre, 0 tenir la position, N aller au point
  // visé ; le même ordre une seconde fois (même cible, même point) rend la liberté de manœuvre. Seuls les
  // chars dont la radio marche les reçoivent.
  const ORDER_TXT = { free: 'As you were: free engagement', follow: 'Follow me', hold: 'Hold position', attack: 'Attack my target', move: 'Move to the marked point' };
  const ACK = ['Wilco', 'Roger', 'Understood', 'On my way'];
  function giveOrder(kind) {
    if (mode !== 'campagne' || state !== 'play') return;
    if (!radioOk(player)) { showMsg('Radio out: you cannot give orders', '#ff9a7a', 1.4); return; }
    // point visé : sous le réticule, ou au bout de la ligne de visée à la lunette
    const pv = pivot(player), a = sight.on && sight.probe ? { x: pv.x + Math.cos(sight.aimYaw) * sight.probe.dist, y: pv.y + Math.sin(sight.aimYaw) * sight.probe.dist } : player.aim3 || player;
    let target = null, bd = 90;
    if (kind === 'attack') for (const e of player.knows || spotted[0]) if (!e.dead) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < bd) { bd = d; target = e; } }
    if (orders.kind === kind && (kind === 'follow' || kind === 'hold' || kind === 'attack' && (!target || target === orders.target) || kind === 'move' && Math.hypot(a.x - orders.pos.x, a.y - orders.pos.y) < 80)) kind = 'free';
    else if (kind === 'attack' && !target) { showMsg('No spotted enemy under the reticle', '#ff9a7a', 1.2); return; }
    orders = { kind, pos: kind === 'move' ? { x: clamp(a.x, 60, WW - 60), y: clamp(a.y, 60, WH - 60) } : null, target, t: kind === 'attack' ? 20 : 0 };
    showMsg(ORDER_TXT[kind], '#bcd8ff', 1.4);
    let n = 0;
    for (const t of tanks) {
      if (!t.ai || t.team !== 0 || t === player || t.dead) continue;
      t.ai.holdPt = null; t.ai.pathT = 0; t.ai.thinkT = 0;
      if (n++ < 2) addLog(radioOk(t) ? `${t.name}: ${ACK[(n + tankId) % ACK.length]}` : `${t.name}: no answer (radio out)`, radioOk(t) ? '#9fd0ff' : '#ff9a7a');
    }
    Sfx.ping(0);
  }
  // L'IA observe la chute de son coup sur la cible visée et corrige le suivant (encadrement) : 70 % de
  // l'écart latéral en direction, et la hausse selon le coup court ou long
  function aiObserve(s, x, y, hit) {
    const a = s.by && s.by.ai, e = s.tgt;
    if (s.obs || !a || !e || e.dead || a.target !== e || !(s.by.sees && s.by.sees.has(e))) return;
    s.obs = true;
    if (hit === e || ownVeil(s.by) >= 0.45 && !(s.by.hatch && roleOk(s.by, 'commander'))) return;
    const d = Math.hypot(e.x - s.fx, e.y - s.fy) || 1, ux = (e.x - s.fx) / d, uy = (e.y - s.fy) / d, rx = x - e.x, ry = y - e.y;
    a.corrA -= 0.7 * Math.atan2(-rx * uy + ry * ux, d);
    a.rngK = clamp(a.rngK * (1 - 0.7 * clamp((rx * ux + ry * uy) / d, -0.15, 0.15)), 0.7, 1.3);
  }

  function aiThink(t, dt) {
    const ai = t.ai, T = t.T, role = ROLES[T.id] || 'line';
    ai.hdT = (ai.hdT || 0) - dt;
    ai.thinkT -= dt; ai.reactT -= dt; ai.unstickT -= dt; ai.pathT -= dt; ai.pushT -= dt; ai.evadeT -= dt; ai.evCd -= dt; ai.flankT -= dt; ai.wdT -= dt; ai.wdCd -= dt;
    ai.noFireT = canFire(t) ? 0 : ai.noFireT + dt;
    if (ai.waitT > 5) { ai.waitT = 0; if (role !== 'ambush') ai.pushT = 3; } // impossible de tirer d'ici : on se rapproche
    const seen = t.knows || spotted[t.team], own = t.sees || seen;
    const ordered = t.team === 0 && orders.kind !== 'free' && player && !player.dead && radioOk(t);
    const amb = role === 'ambush' || ai.mode === 'ambush';
    const homeX = ai.homeX != null ? ai.homeX : t.team === 0 ? 160 : WW - 160, goalX = ai.goalX != null ? ai.goalX : t.team === 0 ? WW - 260 : 260;
    if (ai.thinkT <= 0) {
      const iv = ai.iv || 0.35;
      ai.iv = ai.thinkT = rnd(0.25, 0.45);
      // --- cible : celle qu'on peut percer, qui nous menace, que les autres visent déjà ; on ne change que
      // pour bien mieux, ou si la cible est hors de vue depuis 1,5 s ---
      const cur = ai.target && !ai.target.dead ? ai.target : null;
      let best = null, bs = 0, curS = 0, threat = null, ts = 0, tk = 0, pens = 0, aimed = false, bWreck = false;
      for (const e of seen) {
        if (e.dead) continue;
        const d = dist(t, e), lo = losClear(t.x, t.y, e.x, e.y, true, false, t, t.gz + t.T.S.gun.z, e.gz + (e.T.S.ht + e.T.I.totalH) / 2), wc = wreckClear(t, e), vis = own.has(e), los = lo && wc && vis;
        const pen = penRatio(t, e, d), th = threatOf(t, e, d);
        let focus = 0;
        for (const a of tanks) if (a !== t && !a.dead && a.team === t.team && a.ai && a.ai.target === e) focus++;
        const sc = (pen >= 1 ? 1 : 0.3 + 0.4 * pen) * (0.6 + 0.4 * Math.min(th, 2)) * (1 + 0.25 * focus) * (e === cur ? 1.3 : 1) * (crewFrac(e) < 0.5 ? 1.2 : 1) * (los ? 1 : 0.6) / (d + 150);
        if (sc > bs) { bs = sc; best = e; bWreck = lo && !wc && vis; }
        if (e === cur) curS = sc;
        if (vis) {
          if (th / (d + 150) > ts) { ts = th / (d + 150); threat = e; tk = th; }
          // ennemi qui nous perce et qu'aucun allié ne voit
          if (th >= 1 && !tanks.some(a => a !== t && !a.dead && a.team === t.team && a.sees && a.sees.has(e))) pens++;
          // canon ennemi pointé sur nous et prêt à tirer
          if (e.reloadT <= 0.5 && Math.abs(angNorm(e.angle + e.turret - Math.atan2(t.y - e.y, t.x - e.x))) < 2.5 * D2R) aimed = true;
        }
      }
      if (cur && seen.has(cur) && best !== cur && bs < curS * 1.3 && ai.lostT < 1.5) { best = cur; bWreck = false; }
      if (ordered && orders.kind === 'attack' && orders.target && !orders.target.dead) best = orders.target;
      if (best && best !== ai.target) {
        // chef de char blessé ou mort : l'équipage réagit plus lentement
        const eC = eff(t, 'commander'), d = dist(t, best);
        ai.reactT = ai.react * rnd(0.6, 1.3) * (eC > 0 ? 1 / eC : 1.6);
        // nouvelle cible : estimation de la distance et du pointage à refaire, mémoire effacée
        ai.trackT = 0; ai.lostT = 0; ai.corrA = 0; ai.shots = 0; ai.mem = null; ai.vx = ai.vy = 0;
        ai.rngK = 1 + gauss() * 0.12 * (1 - ai.skill); ai.biasA = gauss() * ai.aimStd * (0.6 + d / 700); ai.bearErr = gauss() * 6 * D2R;
        if (ai.mode === 'flank') ai.mode = null;
      }
      ai.target = best; ai.threat = threat; ai.threatK = tk;
      const d = best ? dist(t, best) : 0;
      ai.los = !!best && own.has(best) && losClear(t.x, t.y, best.x, best.y, true, false, t, t.gz + t.T.S.gun.z, best.gz + (best.T.S.ht + best.T.I.totalH) / 2) && wreckClear(t, best);
      ai.side = bWreck ? sideStep(t, best) : null;
      ai.pen = best ? penRatio(t, best, d) : 0;
      // pièce antichar repérée (objectives.js) : prise à l'explosif quand aucun char n'est plus pressant
      ai.soft = OBJ.aiSoft(t, best, d);
      if (ai.soft) {
        if (best) { ai.target = best = null; ai.los = false; }
        ai.los = true;
        const k = t.ammo.HE > 0 ? 'HE' : nextShell(t, 'APHE');
        if (k !== t.shell && k !== t.nextShell) selectShell(t, k);
      }
      if (best) {
        // demande l'obus voulu, ou annule celui qui attendait si l'obus chargé convient (jamais d'extraction)
        const k = aiShell(t, best, d);
        if (k === t.shell ? t.nextShell : k !== t.nextShell) selectShell(t, k);
        ai.az = aiAimZ(t, best, d);
        ai.lastKnown = ai.mem ? { x: ai.mem.x, y: ai.mem.y } : { x: best.x, y: best.y }; ai.noContactT = 0;
      } else ai.noContactT += iv;

      // --- repli : canon hors d'usage, incendie, équipage décimé sous le feu, ou deux ennemis en vue qui
      // nous percent sans qu'aucun allié ne les voie (trois si l'équipage est au complet) ; vers un couvert qu'aucun ne voit, fumée vers la menace ---
      const want = ai.noFireT > 1 ? 'gun' : t.fires.length > 0 ? 'fire' : crewFrac(t) < 0.5 && pens > 0 ? 'crew' : pens >= 3 || pens >= 2 && crewFrac(t) < 0.85 ? 'odds' : '';
      if (want) ai.wdWhy = want;
      if (want && ai.state !== 'withdraw' && ai.wdCd <= 0) {
        ai.state = 'withdraw'; ai.wdT = 25;
        ai.cover = coverPoint(t, [...own].filter(e => !e.dead), 250);
        if (!ai.cover && threat) { const a = Math.atan2(t.y - threat.y, t.x - threat.x); ai.cover = { x: clamp(t.x + Math.cos(a) * 160, 60, WW - 60), y: clamp(t.y + Math.sin(a) * 160, 60, WH - 60) }; }
        if (t.smoke > 0 && threat && ai.los) deploySmoke(t, Math.atan2(threat.y - t.y, threat.x - t.x));
      } else if (ai.state === 'withdraw' && (!want && ai.wdT < 19 || ai.wdT <= 0)) { ai.state = 'engage'; ai.wdCd = 8; }
      // --- canon braqué sur nous depuis 0,6 s : arrêt ou marche arrière, caisse de biais (indice visible,
      // donc une réaction lisible, jamais une esquive d'obus en vol) ---
      ai.aimedT = aimed ? ai.aimedT + iv : 0;
      if (ai.aimedT >= 0.6 && ai.evCd <= 0 && ai.state !== 'withdraw') {
        ai.evCd = 3;
        if (Math.random() < 0.6 * ai.skill * (roleOk(t, 'commander') ? 1 : 0.6)) {
          ai.evadeT = rnd(0.8, 1.4); ai.evadeDir = Math.abs(t.speed) > 1.5 * PX ? 0 : -1;
          if (t.smoke > 0 && crewFrac(t) < 0.6 && threat) deploySmoke(t, Math.atan2(threat.y - t.y, threat.x - t.x));
        }
      }

      // --- destination ---
      let dest = null, od;
      const range = T.range * (crewFrac(t) < 0.6 ? 1.3 : 1);
      if (ai.state === 'withdraw') dest = ai.cover;
      else if (best && ai.side) dest = ai.side;
      else if (best && ai.mode === 'flank') { dest = ai.flankPt; if (dist(t, dest) < 50 || ai.flankT <= 0 || ai.flankE !== best) { ai.mode = null; dest = null; } }
      else if (best && ai.pushT > 0) dest = { x: best.x, y: best.y };
      else if (best && amb) {
        // embuscade : caisse défilée derrière une crête proche s'il y en a une, sinon on reste au poste et
        // on en change après deux coups ; sans poste, on approche à 80 % de la portée sans jamais poursuivre
        if (ai.shots >= 2 && ai.post) { ai.post = ambushPost(t, goalX, 0, ai.post) || ai.post; ai.shots = 0; }
        const hd = hdSpot(t, best, 160);
        if (hd) dest = dist(t, hd) > 18 ? hd : null;
        else if (ai.post) dest = dist(t, ai.post) > 25 ? ai.post : null;
        else if (!ai.los && d > range * 0.8) { const k = (d - range * 0.8) / d; dest = { x: t.x + (best.x - t.x) * k, y: t.y + (best.y - t.y) * k }; }
      } else if (best && role === 'scout' && ai.pen < 1.2) {
        // éclaireur : il ne gaspille pas d'obus sur un blindage trop épais, il observe depuis un buisson
        const b = bushNear(t, 220);
        dest = b && dist(t, b) > 25 ? b : null;
        if (!b && !ai.los) dest = { x: best.x, y: best.y };
      } else if (best) {
        // débordement : la face est imperméable mais le flanc ne l'est pas ; un seul flanqueur par cible,
        // les autres la fixent de face
        if (role !== 'spear' && !ordered && ai.pen < 0.9 && penRatio(t, best, d, null, { k: 'side', p: best.T.S.armor.hull.side, yaw: 0 }) >= 1.1 &&
          !tanks.some(a => a !== t && a.ai && !a.dead && a.team === t.team && a.ai.mode === 'flank' && a.ai.flankE === best)) {
          const p = flankPoint(t, best, seen);
          if (p) { ai.mode = 'flank'; ai.flankE = best; ai.flankPt = p; ai.flankT = 25; dest = p; }
        }
        if (!dest) {
          // à bonne distance : on tient, caisse défilée si une crête est à portée de chenilles
          if (ai.los && d < range * 1.25 && d > range * 0.5) { const hd = hdSpot(t, best, 110); dest = hd && dist(t, hd) > 18 ? hd : null; }
          else if (ai.los && d <= range * 0.5) {
            const a = Math.atan2(t.y - best.y, t.x - best.x);
            dest = { x: clamp(t.x + Math.cos(a) * 160, 60, WW - 60), y: clamp(t.y + Math.sin(a) * 160, 60, WH - 60) };
          } else dest = { x: best.x, y: best.y };
        }
      } else if ((od = OBJ.aiDest(t)) !== false) dest = od;
      else if (ai.lastKnown) {
        dest = ai.lastKnown;
        if (dist(t, dest) < 90) ai.lastKnown = null;
      } else if (amb && (ai.post || (ai.post = ambushPost(t, goalX, 350)))) {
        // sans contact depuis 45 s, l'embuscade se reporte plus en avant
        if (ai.noContactT > 45) { ai.post = ambushPost(t, goalX, 350, ai.post) || ai.post; ai.noContactT = 0; }
        dest = dist(t, ai.post) > 25 ? ai.post : null;
      } else {
        // en coin derrière un char lourd de l'équipe, sinon sur son couloir (le lourd prend le centre)
        const lead = role === 'line' && tanks.find(a => !a.dead && a.team === t.team && a.ai && ROLES[a.T.id] === 'spear');
        if (lead) {
          const dir = Math.sign(goalX - lead.x) || 1, sl = t.id % 2 ? 1 : -1;
          dest = { x: clamp(lead.x - dir * 110, 60, WW - 60), y: clamp(lead.y + sl * 110, 60, WH - 60) };
          if (dist(t, dest) < 40) dest = null;
        } else {
          dest = { x: goalX, y: role === 'spear' ? WH / 2 + (ai.laneY - WH / 2) * 0.35 : ai.laneY };
          if (Math.hypot(t.x - dest.x, t.y - dest.y) < 150) { ai.laneY = rnd(150, WH - 150); ai.goalX = clamp(goalX + rnd(-500, 500), 200, WW - 200); }
        }
      }
      // ordres du joueur : place dans la formation, position tenue ou point désigné (il tire sur ce qu'il
      // voit sans s'en éloigner) ; un repli reste prioritaire
      if (ordered && ai.state !== 'withdraw') {
        const od = orderDest(t);
        if (od) dest = dist(t, od) > 45 ? od : null;
        if (od && !dest && orders.kind === 'move' && !orders.done) { orders.done = true; addLog(`${t.name}: in position`, '#9fd0ff'); }
      }
      if (orders.kind !== 'hold') ai.holdPt = null;
      ai.dest = dest;
      if (dest) {
        if (!ai.path || ai.pathT <= 0 || !ai.pathDest || Math.hypot(ai.pathDest.x - dest.x, ai.pathDest.y - dest.y) > 60) {
          navHeavy = T.mass > HEAVY_T && !heavyNo[cellOf(t.x, t.y)];
          ai.path = findPath(t.x, t.y, dest.x, dest.y); ai.pi = 0; navHeavy = false; ai.pathDest = { x: dest.x, y: dest.y }; ai.pathT = 2.5;
        }
      } else ai.path = null;
    }

    // --- conduite : caisse de biais face à la menace principale ---
    let thr = 0, turn = 0;
    // (une menace qui ne nous perce pas compte moins que la cible)
    const tg = ai.target && !ai.target.dead ? ai.target : null, th = ai.threat && !ai.threat.dead && (ai.threatK >= 1 || !tg) ? ai.threat : tg;
    let des = null;
    if (th) {
      const b = Math.atan2(th.y - t.y, th.x - t.x), y = T.arc ? 0 : bestYaw(t, th, dist(t, th));
      des = Math.abs(angNorm(b + y - t.angle)) < Math.abs(angNorm(b - y - t.angle)) ? b + y : b - y;
    }
    if (t.trackT > 0 && des != null) {
      // chenille cassée : la chenille intacte fait pivoter la caisse vers la menace, puis on s'arrête
      const err = angNorm(des - t.angle);
      thr = Math.abs(err) > 0.15 ? 0.6 * Math.sign(err) * t.trackSide : 0
    } else if (ai.evadeT > 0) { thr = ai.evadeDir; if (des != null) turn = clamp(angNorm(des - t.angle) * 3, -1, 1); }
    else if (ai.unstickT > 0) { thr = ai.unstickDir; turn = ai.unstickTurn; }
    else if (ai.path && ai.pi < ai.path.length) {
      let wp = ai.path[ai.pi];
      if (Math.hypot(wp.x - t.x, wp.y - t.y) < 28) { ai.pi++; wp = ai.path[ai.pi]; }
      if (wp) {
        const dw = Math.hypot(wp.x - t.x, wp.y - t.y), des2 = Math.atan2(wp.y - t.y, wp.x - t.x);
        let df = angNorm(des2 - t.angle);
        // point de passage derrière soi par rapport à la menace : on recule, face à elle
        const back = th && dw < 300 && (wp.x - t.x) * (th.x - t.x) + (wp.y - t.y) * (th.y - t.y) < 0 && T.rev >= 6 / 3.6 * PX;
        if (back || Math.abs(df) > 2.4 && dw < 160) {
          df = angNorm(des2 + Math.PI - t.angle);
          turn = clamp(df * 3, -1, 1); thr = Math.abs(df) < 0.8 ? -1 : -0.2;
        } else {
          turn = clamp(df * 3, -1, 1);
          thr = Math.abs(df) < 0.7 ? 1 : Math.abs(df) < 1.4 ? 0.4 : 0;
        }
      }
    } else if (des != null) {
      // à l'arrêt : caisse au lacet le plus favorable ; un canon fixe garde la cible dans son champ de tir
      const df = angNorm((T.arc && tg ? Math.atan2(tg.y - t.y, tg.x - t.x) : des) - t.angle);
      turn = Math.abs(df) > 0.04 ? clamp(df * 3, -1, 1) : 0;
      // le Lynx tire et se déplace sans cesse (rien qui ressemble à une esquive des obus)
      if (T.id === 'light' && ai.los) {
        if ((ai.wiggleT -= dt) <= 0) { ai.wiggleT = rnd(0.8, 2); ai.wig = -ai.wig; }
        thr = ai.wig * 0.6;
      }
    }
    // bloqué : un rapport est engagé dans le bon sens et le char n'avance ni ne tourne (le passage d'un
    // rapport et l'engagement de la marche arrière prennent du temps ; un lourd qui démarre dans le sable
    // en braquant avance au pas sans être bloqué) ; rien pendant l'introduction
    if (state !== 'play') ai.stuckT = ai.unstickT = 0;
    else if (Math.abs(thr) > 0.3 && Math.hypot(t.vx, t.vy) < 6 && Math.abs(t.turnRate) < 0.1 && !(t.shiftT > 0) && t.gear * thr > 0 && ai.unstickT <= 0 && t.trackT <= 0 && roleOk(t, 'driver') && modOk(t, 'engine') && modOk(t, 'trans')) {
      ai.stuckT += dt;
      if (ai.stuckT > 1.5) {
        ai.stuckT = 0; ai.unstickT = T.D.box.rs + 1.4; ai.unstickDir = thr > 0 ? -1 : 1;
        ai.unstickTurn = Math.random() < 0.5 ? -1 : 1; ai.pathT = 0;
        // deuxième blocage au même endroit en 6 s : le passage devant la caisse est interdit 10 s
        const u = ai.lastStuck;
        if (u && gameTime - u.t < 6 && Math.hypot(t.x - u.x, t.y - u.y) < 25) {
          const k = thr > 0 ? 30 : -30;
          navBlocks.push({ x: t.x + Math.cos(t.angle) * k, y: t.y + Math.sin(t.angle) * k, r: 14, t: 10 }); navT = 0;
        }
        ai.lastStuck = { x: t.x, y: t.y, t: gameTime };
      }
    } else ai.stuckT = Math.max(0, ai.stuckT - dt);

    // --- pointage : sur ce qu'on voit soi-même, sinon sur le souvenir (extrapolé 1 s au plus) ou sur le
    // relèvement transmis par radio (± 6°) ; anticipation sur la vitesse observée, erreurs humaines ---
    let aim = t.angle + t.turret, fire = false;
    if (tg) {
      const pv = pivot(t), vis = own.has(tg) && ai.los;
      let bx = null, by = 0, vx = 0, vy = 0;
      if (vis) {
        // la cible réapparaît après plus d'une seconde : temps de réaction, et premier coup moins précis
        if (ai.lostT > 1) { ai.reactT = Math.max(ai.reactT, ai.react * rnd(0.5, 1)); ai.aimErr = gauss() * ai.aimStd * 1.5; }
        const k = Math.min(1, dt / 0.6);
        ai.vx += (tg.vx - ai.vx) * k; ai.vy += (tg.vy - ai.vy) * k;
        ai.mem = { x: tg.x, y: tg.y, t: gameTime }; ai.trackT += dt; ai.lostT = 0;
        bx = tg.x; by = tg.y; vx = ai.vx; vy = ai.vy;
      } else {
        ai.lostT += dt;
        if (ai.mem && gameTime - ai.mem.t < 6) { const age = Math.min(1, gameTime - ai.mem.t); bx = ai.mem.x + ai.vx * age; by = ai.mem.y + ai.vy * age; }
        else if (seen.has(tg)) { const a = Math.atan2(tg.y - pv.y, tg.x - pv.x) + ai.bearErr, dd = dist(t, tg); bx = pv.x + Math.cos(a) * dd; by = pv.y + Math.sin(a) * dd; }
      }
      if (bx != null) {
        const d = Math.hypot(bx - pv.x, by - pv.y) || 1;
        ai.ax = bx; ai.ay = by;
        const tt = Ballistics.tof(Ballistics.shell(T.id, t.shell), d * RK) / TOF;
        aim = Math.atan2(by + vy * tt * (1 + ai.leadErr) - pv.y, bx + vx * tt * (1 + ai.leadErr) - pv.x) + ai.biasA + ai.corrA + ai.aimErr;
        // tir à l'aveugle dans la fumée, sur la position retenue : seulement les tireurs exercés
        const blind = !vis && ai.skill > 0.7 && ai.mem && gameTime - ai.mem.t < 3 && losClear(t.x, t.y, tg.x, tg.y, false);
        // feu retenu : embuscade tant que la cible est loin et qu'on n'est pas repéré, éclaireur devant un
        // blindage trop épais, débordement pas encore assez de flanc
        const hold = (amb && d > 0.8 * T.range && !spotted[1 - t.team].has(t)) || (role === 'scout' && ai.pen < 1.2) || (ai.mode === 'flank' && ai.pen < 1);
        // arrêt court (Kurzhalt) : obus prêt, le char s'arrête et attend que la caisse se calme ; une tourelle
        // lente se fait aider par la caisse quand la cible est loin de son axe
        if (vis && !hold && t.reloadT < 0.6 && canFire(t) && ai.state !== 'withdraw' && ai.evadeT <= 0 && ai.unstickT <= 0 && !(t.trackT > 0)) {
          thr = 0;
          if (ai.path) turn = 0;
          // canon fixe : toute la caisse pointe
          if (T.arc) turn = clamp(angNorm(aim - t.angle) * 3, -1, 1);
          else if (T.tturn < 15 * D2R && Math.abs(angNorm(aim - t.angle - t.turret)) > 30 * D2R) turn = clamp(angNorm(aim - t.angle) * 3, -1, 1);
        }
        if ((vis || blind) && !hold && ai.reactT <= 0 && t.reloadT <= 0 && canFire(t)) {
          ai.waitT += dt;
          const err = Math.abs(angNorm(t.angle + t.turret - aim));
          const steady = (t.disp < T.disp * (2.6 - ai.skill) || d < 300 || ai.waitT > 2) && (t.stillT > 1.1 || d < 250 || ai.waitT > 4);
          if (err < Math.max(0.012, 9 / d) * (blind ? 3 : 1) && steady && friendlyClear(t, aim, d)) {
            fire = true; ai.waitT = 0; ai.shots++;
            // coup suivant : dispersion de pointage selon la distance, la vitesse angulaire de la cible et
            // le temps de suivi ; erreur d'anticipation qui diminue à mesure qu'on suit la cible
            const w = Math.abs(vx * (by - pv.y) - vy * (bx - pv.x)) / (d * d);
            ai.aimErr = gauss() * ai.aimStd * (0.6 + d / 700) * (1 + 2 * w / 0.1) * (ai.trackT < 2 ? 1.4 : 1) * (blind ? 3 : 0.6);
            ai.leadErr = gauss() * 0.35 * (1 - ai.skill) / (1 + ai.trackT);
          }
        }
      }
    } else if (ai.soft) {
      // pièce antichar : coup d'explosif à l'arrêt, canon dans l'axe
      const s = ai.soft, pv = pivot(t), d = Math.hypot(s.x - pv.x, s.y - pv.y) || 1;
      aim = Math.atan2(s.y - pv.y, s.x - pv.x) + ai.aimErr * 0.5;
      if (t.reloadT < 0.6 && canFire(t) && ai.state !== 'withdraw') { thr = 0; if (ai.path) turn = 0; if (T.arc) turn = clamp(angNorm(aim - t.angle) * 3, -1, 1); }
      if (ai.reactT <= 0 && t.reloadT <= 0 && canFire(t) && t.stillT > 0.6 && Math.abs(angNorm(t.angle + t.turret - aim)) < Math.max(0.012, 9 / d) && friendlyClear(t, aim, d)) { fire = true; ai.aimErr = gauss() * ai.aimStd * (0.6 + d / 700); }
    } else if (ai.lastKnown) aim = Math.atan2(ai.lastKnown.y - t.y, ai.lastKnown.x - t.x);
    else if (ai.path) aim = t.angle;
    // le pilote freine pour s'arrêter ou ralentir à la vitesse demandée (lâcher l'accélérateur ne fait
    // que rouler en roue libre)
    t.in.brake = Math.abs(thr) < 0.05 || Math.abs(t.speed) > Math.abs(thr) * T.speed + 1.5 * PX;
    t.in.throttle = thr; t.in.turn = turn; t.in.aim = aim; t.in.fire = fire;
  }

  // ===================== Simulation des chars =====================
  // Collisions d'un char (boîte orientée) avec les obstacles (boîtes alignées) : dégagement minimal, et un
  // pivot qui fait buter la caisse est annulé. Au premier contact, choc selon l'énergie d'approche ; en
  // appui prolongé, l'effort de traction renverse un muret ou un arbre. posOnly : épave poussée.
  const BOX = {}, BOX2 = {};
  function collideObstacles(t, vPre = t.speed, lPre = t.vl, a0 = t.angle, posOnly = false) {
    const T = t.T, hl = T.len / 2, hw = T.wid / 2, R = Math.hypot(hl, hw), now = new Set();
    for (const o of obstacles) {
      if (o.dead || t.x + R < o.x || t.x - R > o.x + o.w || t.y + R < o.y || t.y - R > o.y + o.h) continue;
      const ob = o.box || (o.box = Vehicle.box(o.x + o.w / 2, o.y + o.h / 2, 0, o.w / 2, o.h / 2));
      const h = Vehicle.sat(Vehicle.box(t.x, t.y, t.angle, hl, hw, BOX), ob);
      if (!h) continue;
      // pivot contre l'obstacle : la caisse garde son orientation d'avant
      if (t.angle !== a0 && !Vehicle.sat(Vehicle.box(t.x, t.y, a0, hl, hw, BOX2), ob)) { t.angle = a0; t.turnRate = 0; continue; }
      now.add(o);
      if (!posOnly) {
        const c = Math.cos(t.angle), s = Math.sin(t.angle);
        if (!(t.touch && t.touch.has(o))) {
          // vitesse d'approche (m/s) le long de la normale, d'avant le contact
          const vn = -((c * vPre - s * lPre) * h.nx + (s * vPre + c * lPre) * h.ny) / PX;
          if (vn > 0.3 && obstacleImpact(t, o, h, vn)) continue;
        } else {
          const F = Math.max(0, -t.fDrive * (c * h.nx + s * h.ny)); // effort de traction contre l'obstacle (N)
          if (o.type === 'tree' && F > 40e3 * o.size * o.size) { knockTree(o, t.angle); continue; }
          if (o.type === 'wall') { damageObstacle(o, F * 0.3 * STEP / 1000); if (o.dead) continue; }
        }
      }
      t.x += h.nx * h.d; t.y += h.ny * h.d;
    }
    t.touch = now;
  }
  // Choc contre un obstacle à vn m/s : énergie ½·m·vn² (J). Un arbre tombe au-delà de 25 kJ × taille², un
  // muret absorbe ses points en kJ avant de céder, un char de 40 t et plus enfonce une grange à 2 m/s ;
  // les rochers et les maisons de ville tiennent. Renvoie vrai si le char passe.
  function obstacleImpact(t, o, h, vn) {
    const T = t.T, m = T.mass * 1000, E = 0.5 * m * vn * vn;
    let Eabs = E, pass = false;
    if (o.type === 'tree') { const need = 25e3 * o.size * o.size; if (E > need) { knockTree(o, t.angle); Eabs = need; pass = true; } }
    else if (o.type === 'wall') { const cap = o.hp * 1000; damageObstacle(o, Math.min(E, cap) / 1000); if (o.dead) { Eabs = cap; pass = true; } }
    else if (o.type === 'building' && o.maxHp <= 700 && T.mass >= 40 && vn >= 2) { damageObstacle(o, o.hp); Eabs = E * 0.6; pass = true; }
    const k = pass ? Math.sqrt(Math.max(0, 1 - Eabs / E)) : 0;
    if (pass) { t.speed *= k; t.vl *= k; }
    // secousse de la caisse (choc reçu le long de la normale), bruit une seule fois par contact
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    rock(t, 0.4 * m * vn * (1 - k), c * h.nx + s * h.ny, c * h.ny - s * h.nx, 0.6);
    if (vn > 1.5 && o.type !== 'tree') Sfx.impact(listenerDist(t.x, t.y));
    if (vn > 4) bruise(t, ['driver', 'radio'], 2, 8, 0.2);
    return pass;
  }
  // Équipage secoué (points de vie entre a et b) et chenille qui saute avec la probabilité pTrack
  function bruise(t, roles, a, b, pTrack) {
    for (const r of roles) if (roleOk(t, r)) modDamage(t, t.mods[t.roles[r]], rnd(a, b), null, true);
    if (Math.random() < pTrack) { t.trackT = Math.max(t.trackT, 8); t.trackSide = Math.random() < 0.5 ? 1 : -1; if (t === player) addLog('Impact: track thrown', '#ffb070'); }
  }
  // Bord de la carte : la boîte du char reste dedans
  function clampMap(t) {
    const e = Vehicle.extent(Vehicle.box(t.x, t.y, t.angle, t.T.len / 2, t.T.wid / 2, BOX));
    t.x = clamp(t.x, e[0], WW - e[0]); t.y = clamp(t.y, e[1], WH - e[1]);
  }

  // Contacts entre chars (boîtes orientées). Premier contact : choc à restitution 0,1, en 2D (avance,
  // glissement latéral, lacet), secousse et dégâts selon l'énergie. Contact prolongé : équilibre des
  // forces. Le pousseur n'avance que si son effort dépasse la résistance de l'autre (freins ou roulement en
  // long, ripage en travers) et l'entraîne alors à sa vitesse ; sinon il cale. Une épave a les chenilles
  // bloquées et ne bouge que sous la poussée d'un char lourd, lentement.
  let pairs = new Set();
  function resistTo(t, nx, ny) {
    const g = groundAt(t.x, t.y).type, c = Math.cos(t.angle), s = Math.sin(t.angle), mg = t.T.mass * 1000 * Vehicle.G;
    const lon = t.dead ? 0.5 * g.mu : t.braking ? 0.55 * g.mu : Vehicle.crrOf(g, t.T.D.press) + (t.gear ? 0.04 : 0);
    return mg * (Math.abs(c * nx + s * ny) * lon + Math.abs(c * ny - s * nx) * g.lat);
  }
  const driveTo = (t, nx, ny) => t.dead ? 0 : Math.max(0, t.fDrive * (Math.cos(t.angle) * nx + Math.sin(t.angle) * ny));
  // vitesse ajoutée (px/s, repère du monde), répartie entre l'avance et le glissement latéral
  function addVel(t, vx, vy) {
    if (t.dead) return;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    t.speed += vx * c + vy * s; t.vl += vy * c - vx * s;
  }
  function tankCollisions(dt) {
    const now = new Set();
    for (let i = 0; i < tanks.length; i++) {
      const a = tanks[i], Ra = Math.hypot(a.T.len, a.T.wid) / 2;
      for (let j = i + 1; j < tanks.length; j++) {
        const b = tanks[j];
        if (a.dead && b.dead) continue;
        if (Math.hypot(b.x - a.x, b.y - a.y) >= Ra + Math.hypot(b.T.len, b.T.wid) / 2) continue;
        const h = Vehicle.sat(Vehicle.box(b.x, b.y, b.angle, b.T.len / 2, b.T.wid / 2, BOX), Vehicle.box(a.x, a.y, a.angle, a.T.len / 2, a.T.wid / 2, BOX2));
        if (!h) continue;
        const nx = h.nx, ny = h.ny, key = a.id * 4096 + b.id; // normale de a vers b
        now.add(key);
        const ma = a.T.mass * 1000, mb = b.T.mass * 1000, ia = a.dead ? 0 : 1 / ma, ib = b.dead ? 0 : 1 / mb;
        const vrel = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) / PX;
        let wa, wb, impact = false;
        if (!pairs.has(key) && vrel > 0.3) {
          impact = true;
          const M = 1 / (ia + ib), J = 1.1 * M * vrel; // kg·m/s
          for (const [t, sg, inv] of [[a, -1, ia], [b, 1, ib]]) {
            if (!inv) continue;
            const fx = sg * nx, fy = sg * ny, c = Math.cos(t.angle), sn = Math.sin(t.angle);
            addVel(t, fx * J * inv * PX, fy * J * inv * PX);
            t.turnRate += ((h.px - t.x) * fy - (h.py - t.y) * fx) / PX * J / t.T.D.Iz;
            rock(t, J, c * fx + sn * fy, c * fy - sn * fx, 0.6);
          }
          // énergie du choc : suspension ou chenille au-delà de 50 kJ, tube faussé et équipage contusionné
          // pour le plus léger au-delà de 150 kJ
          const E = 0.5 * M * vrel * vrel, lt = a.dead ? b : b.dead ? a : ma < mb ? a : b, mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
          if (vrel > 1.5) { Sfx.clang(listenerDist(mid[0], mid[1])); Fx.armorHit(mid[0], mid[1], 0.8, 'non', nx, ny); }
          if (E > 50e3) for (const t of [a, b]) if (!t.dead && Math.random() < 0.3) { if (Math.random() < 0.5) bruise(t, [], 0, 0, 1); else t.wheelK = Math.max(0.6, (t.wheelK || 1) * 0.92); }
          if (E > 150e3 && !lt.dead) {
            lt.bentT = 30; bruise(lt, lt.T.S.crew.filter(() => Math.random() < 0.5), 3, 10, 0);
            if (lt === player) addLog('Ram: gun barrel bent, accuracy reduced (30 s)', '#ffb070');
          }
          if ((a === player || b === player) && E > 50e3) floatText(mid[0], mid[1] - 10, 'RAM!', '#ffcf7a', 1.2);
          wa = ia / (ia + ib); wb = 1 - wa;
        } else {
          const Fa = driveTo(a, nx, ny), Fb = driveTo(b, -nx, -ny), net = Fa - Fb, Rb = resistTo(b, nx, ny), Ra2 = resistTo(a, -nx, -ny);
          if (net > Rb) { wa = 0; wb = 1; addVel(a, -nx * Rb / ma * dt * PX, -ny * Rb / ma * dt * PX); }
          else if (-net > Ra2) { wa = 1; wb = 0; addVel(b, nx * Ra2 / mb * dt * PX, ny * Ra2 / mb * dt * PX); }
          else if (Fa || Fb) { wa = net >= 0 ? 1 : 0; wb = 1 - wa; }
          else { wa = ia / (ia + ib); wb = 1 - wa; }
        }
        // dégagement ; hors choc, le déplacement imposé devient la vitesse du char (pas d'une épave)
        a.x -= nx * h.d * wa; a.y -= ny * h.d * wa; b.x += nx * h.d * wb; b.y += ny * h.d * wb;
        if (!impact) { addVel(a, -nx * h.d * wa / dt, -ny * h.d * wa / dt); addVel(b, nx * h.d * wb / dt, ny * h.d * wb / dt); }
      }
    }
    pairs = now;
  }

  // Remplacements d'équipage : chaque poste vide est repris par ordre d'importance, par l'homme qui
  // l'atteint le plus vite (3 s + 3 s par mètre, 4 s de plus entre caisse et tourelle). Il prend la place
  // du mort, dont le corps reste à la sienne : les coups suivants le touchent là où il est assis.
  const SEAT_PRI = ['gunner', 'driver', 'loader', 'commander'];
  const SEAT_FROM = { gunner: ['loader', 'radio', 'commander'], driver: ['radio', 'loader', 'commander'], loader: ['radio', 'commander'], commander: ['radio'] };
  function crewSwap(t, dt) {
    if (!t.swap) for (const role of SEAT_PRI) {
      const occ = t.roles[role];
      if (!t.T.S.crew.includes(role) || (occ >= 0 && t.mods[occ].hp > 0)) continue;
      const to = t.mods[t.seat[role]];
      let best = null;
      for (const r of SEAT_FROM[role]) {
        if (!roleOk(t, r)) continue;
        const m = t.mods[t.roles[r]], time = 3 + 3 * d3(hullC(t, m), hullC(t, to)) + (m.frame !== to.frame ? 4 : 0);
        if (!best || time < best.t) best = { role, from: r, t: time };
      }
      if (best) { t.swap = best; break; }
    }
    if (t.swap && (t.swap.t -= dt) <= 0) {
      const s = t.swap; t.swap = null;
      const occ = t.roles[s.role];
      if (!roleOk(t, s.from) || (occ >= 0 && t.mods[occ].hp > 0)) return;
      const j = t.roles[s.from], i = t.seat[s.role], a = t.mods[j], b = t.mods[i];
      for (const k of ['frame', 'c', 's', 'min', 'max']) { const q = a[k]; a[k] = b[k]; b[k] = q; }
      t.seat[s.role] = j; t.seat[s.from] = i; t.roles[s.role] = j; t.roles[s.from] = -1; a.sub = true;
      if (t === player) addLog(`${a.name} takes over as ${TankModels.NAMES[s.role].toLowerCase()} (80% efficiency)`, '#bcd8ff');
    }
  }
  // Blessés : sous 30 points de vie, un homme saigne (0,4 par seconde) jusqu'à ce qu'un camarade valide
  // (le radio d'abord) le panse en 10 s : l'hémorragie s'arrête et il regagne 10 points
  function firstAid(t, dt) {
    const crew = t.mods.filter(m => m.kind === 'crew' && m.hp > 0);
    for (const m of crew) if (m.hp < 30 && !m.band) modDamage(t, m, 0.4 * dt, t.lastHit && t.lastHit.by);
    if (t.aid) {
      const a = t.aid;
      if (a.m.hp <= 0 || a.by.hp <= 0) t.aid = null;
      else if ((a.t -= dt) <= 0) { a.m.band = true; a.m.hp = Math.min(a.m.max0, a.m.hp + 10); t.aid = null; if (t === player) addLog(`${a.m.name} bandaged`, '#a6f08a'); }
      return;
    }
    const w = crew.find(m => m.hp < 30 && !m.band);
    if (!w) return;
    const medics = crew.filter(m => m !== w && m.hp >= 60 && !m.out).sort((p, q) => (q.role === 'radio') - (p.role === 'radio'));
    if (medics.length) t.aid = { m: w, by: medics[0], t: 10 };
  }
  // Réparations de campagne (moteur, boîte, culasse) : à l'arrêt seulement, sans incendie, quatre fois
  // plus lentes sous le feu, au rythme des hommes valides. Un organe brûlé ou broyé est irréparable.
  const crewWork = t => { let k = 0; for (const m of t.mods) if (m.kind === 'crew' && m.hp > 0 && !m.out) k += woundK(m); return k / t.T.crewN; };
  const REP = { engine: 22, trans: 18, breech: 14 };
  function crewLogic(t, dt) {
    crewSwap(t, dt);
    firstAid(t, dt);
    checkKnock(t, t.lastHit && t.lastHit.by);
    if (t.dead) return;
    const moving = Math.abs(t.speed) > 0.5 * PX, rk = moving || t.fires.length ? 0 : (t.underFire > 0 ? 0.25 : 1) * crewWork(t);
    t.repOk = rk > 0;
    for (const [k, l] of [['gunT', 'Gun barrel repaired'], ['ringT', 'Turret ring freed']]) if (t[k] > 0 && (t[k] -= dt * rk) <= 0 && t === player) addLog(l, '#a6f08a');
    for (const kind of ['engine', 'trans', 'breech']) {
      const m = modOf(t, kind);
      if (!m) continue;
      if (m.hp > 0 || m.wreckd) { delete t.rep[kind]; continue; }
      if (t.rep[kind] == null) t.rep[kind] = REP[kind];
      t.rep[kind] -= dt * rk;
      if (t.rep[kind] <= 0) {
        m.hp = m.max0 * 0.5; delete t.rep[kind];
        if (t === player) addLog(`${m.name} repaired (damaged)`, '#a6f08a');
      }
    }
    if (t.fuelFireT > 0 && (t.fuelFireT -= dt) <= 0) startFire(t, 'fuel', t.fuelFireM, t.lastHit && t.lastHit.by);
    fireLogic(t, dt);
    if (t.dead) return;
    moraleLogic(t, dt);
  }

  // Incendies (t.fires) : essence, moteur ou charges propulsives. Chaque foyer a une intensité I (0..1) qui
  // croît tant qu'il a de quoi brûler, puis retombe ; il brûle les hommes d'autant plus qu'ils en sont près
  // (e^(−d / 1,2 m)) et, au-delà de 0,6, gagne les réservoirs et les soutes voisins.
  const FIRE = { fuel: { I: 0.35, g: 0.06, burn: [25, 45] }, engine: { I: 0.25, g: 0.04, burn: [15, 35] }, propellant: { I: 0.7, g: 0.12, burn: [6, 12] } };
  const FIRE_NAMES = { fuel: 'Fuel fire', engine: 'Engine fire', propellant: 'Propellant fire' };
  const fireI = t => t.fires.reduce((a, f) => Math.max(a, f.I), 0);
  // cloison pare-feu, juste devant le moteur (repère de la caisse)
  const fwX = T => { const e = TankModels.makeModules(T.id).find(m => m.kind === 'engine'); return e ? e.max[0] + 0.05 : -99; };
  function startFire(t, src, m, by, I) {
    if (t.dead || !m) return;
    const f0 = t.fires.find(f => f.mod === m);
    if (f0) { f0.I = Math.min(1, f0.I + 0.2); f0.left += 5; return; }
    if (t.T.fwX == null) t.T.fwX = fwX(t.T);
    t.fires.push({ src, mod: m, I: I || FIRE[src].I, left: rnd(...FIRE[src].burn), by, bay: m.frame === 'hull' && m.c[0] < t.T.fwX + 0.3 });
    t.morale -= 0.3;
    if (by === player && t.team !== player.team) { waveStats.fires++; if (Meta.track('fire')) missionToast(); }
    if (t === player) { addLog(`${FIRE_NAMES[src]}!${src === 'propellant' ? ' The ammunition may cook off' : player.extN > 0 ? ' T: extinguisher' : ''}`, '#ff6a3a'); Sfx.alarm(); }
  }
  // Soute qui prend feu : les charges brûlent, et l'équipage a de 4 à 30 s avant que les obus ne sautent
  function cookOff(t, m, by) {
    startFire(t, 'propellant', m, by);
    if (t.cookT > 0) return;
    t.cookT = rnd(4, 30); t.cookBy = by;
    if (t === player) showMsg(touch.on ? 'AMMUNITION COOKING OFF · BAIL OUT!' : `AMMUNITION COOKING OFF · ${keyName('bail')}: bail out!`, '#ff6a3a', 3, 3);
  }
  function fireLogic(t, dt) {
    if (t.cookT > 0 && (t.cookT -= dt) <= 0) { if (t === player) addLog('The ammunition cooks off!', '#ff6a5a'); destroyTank(t, t.cookBy, 'brewed'); return; }
    // extincteur à main (3 s, le tireur ne tire pas pendant ce temps) ; l'IA s'en sert aussitôt
    if (t.ai && t !== player && t.extN > 0 && !(t.extT > 0) && t.fires.some(f => f.src !== 'propellant')) { t.extN--; t.extT = 3; }
    if (t.extT > 0 && (t.extT -= dt) <= 0) {
      let n = 0;
      for (const f of t.fires) if (f.src !== 'propellant' && Math.random() < (f.I < 0.5 ? 0.6 : 0.2)) { f.I = 0; n++; }
      if (t === player && t.fires.length) addLog(n ? 'Extinguisher: fire out' : 'Extinguisher: the fire is too strong', n ? '#bcd8ff' : '#ff6a5a');
    }
    if (!t.fires.length) return;
    // extincteur automatique du compartiment moteur (Tigre, Panther, Tigre royal) : une décharge, 3 fois sur 4
    if (t.T.D.ext && !t.extAuto && t.fires.some(f => f.bay && f.src !== 'propellant' && f.I > 0.3)) {
      t.extAuto = true;
      const ok = Math.random() < 0.75;
      if (ok) for (const f of t.fires) if (f.bay && f.src !== 'propellant') f.I = 0;
      if (t === player) addLog(ok ? 'Automatic extinguisher: engine fire out' : 'Automatic extinguisher discharged: still burning', ok ? '#bcd8ff' : '#ffb070');
    }
    const crew = t.mods.filter(m => m.kind === 'crew' && m.hp > 0), eng = modOf(t, 'engine');
    let by = null;
    for (const f of t.fires) {
      if (!f.I) continue;
      by = f.by;
      f.left -= dt;
      f.I = clamp(f.I + ((f.left > 0 ? FIRE[f.src].g : -0.1) - (t.extT > 0 && f.src !== 'propellant' ? 0.15 : 0)) * dt, 0, 1);
      const p = hullC(t, f.mod);
      for (const m of crew) modDamage(t, m, 18 * f.I * dt * Math.exp(-d3(hullC(t, m), p) / 1.2), f.by);
      // le moteur que le feu a détruit est irréparable
      if (f.bay && eng.hp > 0) { modDamage(t, eng, 5 * f.I * dt, f.by); if (eng.hp <= 0) eng.wreckd = true; }
      if (f.I > 0.6) for (const m of t.mods) {
        if (m === f.mod || d3(hullC(t, m), p) > 1.2 + Math.max(...m.s) / 2) continue;
        if (m.kind === 'fuel' && Math.random() < 0.1 * f.I * dt) startFire(t, 'fuel', m, f.by);
        else if (m.kind === 'ammo' && rackN(m) > 0 && Math.random() < 0.03 * f.I * dt) cookOff(t, m, f.by);
      }
      if (Math.random() < 30 * f.I * dt) { const w = worldOf(t, p); addFire(w.x + rnd(-6, 6), w.y + rnd(-6, 6)); }
      burnFx(t, dt, 0.4 + 0.8 * f.I, f.mod, f.src === 'propellant' && f.I > 0.5);
    }
    t.fires = t.fires.filter(f => f.I > 0.01);
    if (!t.fires.length && t === player) addLog('Fire out', '#bcd8ff');
    t.morale -= 0.04 * dt;
    checkKnock(t, by);
  }
  // point du repère de la caisse (m) vers le terrain (px)
  function worldOf(t, q) {
    const c = Math.cos(t.angle), sn = Math.sin(t.angle);
    return { x: t.x + (c * q[0] + sn * q[1]) * PX, y: t.y + (sn * q[0] - c * q[1]) * PX };
  }
  // Moral : il fond sous les coups, les pertes et le feu, remonte au calme. L'IA abandonne le char quand il
  // s'effondre, quand le feu gagne ou que les munitions vont sauter, ou quand le char ne peut plus rouler ni tirer.
  function moraleLogic(t, dt) {
    const mobile = roleOk(t, 'driver') && modOk(t, 'engine') && modOk(t, 'trans') && !t.noFuel && !(t.trackT > 0);
    if (!mobile && t.underFire > 0) t.morale -= 0.03 * dt;
    if (t.cookT > 0) t.morale -= 0.1 * dt;
    if (t.calm > 8) t.morale += 0.01 * dt;
    t.morale = clamp(t.morale, 0, 1);
    if (t === player || !t.ai || state !== 'play') return;
    const shoot = roleOk(t, 'gunner') && modOk(t, 'breech') && !(t.gunT > 0) && SHELL_KEYS.some(k => t.ammo[k] > 0);
    if (t.morale < 0.2 || (t.fires.length && (t.cookT > 0 || fireI(t) > 0.6)) || (!mobile && !shoot && t.morale < 0.5)) bail(t);
  }
  // L'équipage abandonne le char : les survivants sautent à terre et courent vers leurs lignes
  function bail(t) {
    const by = t.lastHit && gameTime - t.lastHit.time < 20 ? t.lastHit.by : t.fires.length ? t.fires[0].by : t.cookBy || null;
    let n = 0;
    for (const m of t.mods) if (m.kind === 'crew' && m.hp > 0) {
      const w = worldOf(t, hullC(t, m));
      runners.push({ x: w.x + rnd(-5, 5), y: w.y + rnd(-5, 5), team: t.team, hp: m.hp, tx: t.x0 < WW / 2 ? 0 : WW, a: rnd(-0.5, 0.5), v: rnd(2.2, 3.2), life: 45, ph: Math.random() * 9 });
      n++;
    }
    if (visibleToPlayer(t)) floatText(t.x, t.y - 20, 'Crew bailing out', '#bcd8ff');
    if (t === player) waveStats.saved += n;
    destroyTank(t, by, 'abandoned');
  }
  // Équipages à pied : ils courent vers leurs lignes, à la merci des mitrailleuses et des obus explosifs
  function updateRunners(dt) {
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i], dir = Math.sign(r.tx - r.x) || 1;
      r.x += dir * Math.cos(r.a) * r.v * PX * dt; r.y = clamp(r.y + Math.sin(r.a) * r.v * PX * dt, 10, WH - 10); r.ph += dt * 9;
      if ((r.life -= dt) <= 0 || r.hp <= 0 || Math.abs(r.tx - r.x) < 30) runners.splice(i, 1);
    }
  }

  // Char en feu : flammes au-dessus du foyer (m, compartiment moteur par défaut), colonne de fumée noire
  // d'huile et de caoutchouc qui monte (gaz chauds) puis s'étale et dérive avec le vent ; elle grisaille quand
  // le feu baisse. Feu de charges (jets) : longues flammes qui jaillissent des écoutilles.
  // Fusées éclairantes (la nuit) : montée en 2 s à 70-90 m vers la zone visée, puis descente sous
  // parachute à 2,5 m/s en se balançant, 20 à 25 s. Elles éclairent le terrain (rendu) et, à moins de
  // 120 m de leur aplomb, la vue y redevient celle du jour (repérage). L'IA en tire une toutes les
  // 40 s environ par camp ; le joueur avec la touche L.
  let flares = [], flareT = [30, 40];
  function launchFlare(t, tx, ty) {
    if (flares.length >= 4) return;
    const ux = tx - t.x, uy = ty - t.y, d = Math.hypot(ux, uy) || 1, r = clamp(d, 60 * PX, 260 * PX);
    flares.push({ x0: t.x, y0: t.y, tx: t.x + ux / d * r, ty: t.y + uy / d * r, x: t.x, y: t.y, z: 2.5, top: rnd(70, 90), age: 0, life: rnd(22, 27), seed: rnd(0, 9) });
    Sfx.smoke(listenerDist(t.x, t.y));
  }
  const flareLit = e => flares.some(f => f.age > 1.5 && (f.x - e.x) ** 2 + (f.y - e.y) ** 2 < (120 * PX) ** 2);
  function updateFlares(dt) {
    for (const f of flares) {
      f.age += dt;
      if (f.age < 2) {
        const k = f.age / 2, e = 1 - (1 - k) * (1 - k);
        f.x = f.x0 + (f.tx - f.x0) * k; f.y = f.y0 + (f.ty - f.y0) * k; f.z = 2.5 + (f.top - 2.5) * e;
        P3({ x: f.x, y: f.y, z: f.z, vz: 0.3, drag: 0.6, wind: 1, size: 0.25, grow: 0.6, life: rnd(2, 3.5), c: [0.6, 0.6, 0.58, 0.35] });
      } else {
        f.z = f.top - 2.5 * (f.age - 2);
        f.x = f.tx + Math.sin(f.age * 1.3 + f.seed) * 2 * PX + WIND.x * (f.age - 2) * PX * 0.5; f.y = f.ty + WIND.y * (f.age - 2) * PX * 0.5;
      }
    }
    flares = flares.filter(f => f.z > 0.5 && f.age < f.life);
    if (!L().night || state !== 'play') return;
    for (let team = 0; team < 2; team++) {
      if ((flareT[team] -= dt) > 0) continue;
      flareT[team] = rnd(32, 48);
      const own = tanks.filter(t => t.team === team && !t.dead && t !== player), foes = tanks.filter(t => t.team !== team && !t.dead);
      if (!own.length || !foes.length) continue;
      const a = own[Math.floor(Math.random() * own.length)], e = foes.reduce((b, t) => dist(a, t) < dist(a, b) ? t : b);
      launchFlare(a, e.x, e.y);
    }
  }
  function burnFx(t, dt, k, m, jets) {
    const T = t.T, q = m ? hullC(t, m) : [-T.len * 0.3 / PX, 0, 0], w = worldOf(t, q), rx = w.x, ry = w.y, z = T.S.ht + 0.2;
    if (Math.random() < dt * 9 * k) {
      const late = t.dead && t.deadT > 30, g = late ? 0.32 : 0.07;
      P3({ x: rx + rnd(-4, 4), y: ry + rnd(-4, 4), z, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: rnd(2, 4.5), drag: 0.35, g: -0.35, wind: 1.6, size: rnd(0.5, 0.9), grow: rnd(0.55, 0.95), life: rnd(5, 9), c: [g, g * 0.95, g * 0.9, late ? 0.35 : 0.62] });
    }
    if (k >= 0.6 && Math.random() < dt * 30 * k) P3({ x: rx + rnd(-6, 6), y: ry + rnd(-5, 5), z: z + rnd(-0.1, 0.3), vz: rnd(1.5, 3.5), g: -1.2, wind: 0.5, size: rnd(0.25, 0.55), grow: -0.5, glow: true, life: rnd(0.25, 0.55), c: [1, rnd(0.38, 0.6), 0.12, 1.7] });
    if (jets && Math.random() < dt * 25) {
      const h = T.S.turret && !t.turretGone ? hatchPos(t) : { x: rx, y: ry, z0: T.S.ht };
      P3({ x: h.x, y: h.y, z: h.z0, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(6, 12), g: -0.5, size: rnd(0.3, 0.6), grow: 1.2, glow: true, life: rnd(0.3, 0.6), c: [1, 0.55, 0.18, 2.2] });
    }
  }
  // Chenille cassée : deux hommes descendent la réparer, char arrêté (le joueur avec R) ; dehors, ils sont
  // exposés aux balles et aux éclats. Seul, un homme va deux fois moins vite ; sous le feu, encore moitié moins.
  function trackRepair(t, dt) {
    if (t.ai && t !== player) t.dismount = !(t.underFire > 0) && !t.fires.length && Math.abs(t.speed) < 0.5 * PX;
    if (t.dismount && (t.fires.length || (t === player && Math.abs(t.in.throttle) > 0.1))) { t.dismount = false; if (t === player) showMsg('Crew back inside', '#bcd8ff', 1.2); }
    let n = 0;
    for (const m of t.mods) m.out = false;
    if (t.dismount) for (const r of ['radio', 'loader', 'commander', 'gunner']) {
      const i = t.roles[r];
      if (n < 2 && i != null && i >= 0 && t.mods[i].hp > 0) { t.mods[i].out = true; n++; }
    }
    if (n) t.trackT -= dt * n / 2 * (t.underFire > 0 ? 0.5 : 1);
    if (t.trackT <= 0) {
      t.trackT = 0; t.dismount = false;
      for (const m of t.mods) m.out = false;
      if (t === player) addLog('Track repaired', '#a6f08a');
    }
  }
  // Suspension à barres de torsion : caisse en tangage et en roulis, ressort amorti (≈ 1,2 Hz,
  // amortissement 0,3). Elle s'accroupit à l'accélération, plonge au freinage, se couche dans les
  // virages, encaisse les bosses, le recul du canon et les coups reçus.
  // Appui sur le relief : hauteur (moyenne) et assiette (tangage gp, nez en haut > 0 ; roulis gr, flanc
  // gauche en haut > 0) tirées du sol sous les quatre coins des chenilles. Un pont qui cède ou une glace
  // qui se brise laissent le char tomber.
  function tankPose(t, dt) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle), hl = t.T.len * 0.4, hb = t.T.D.B / 2 * PX, g = (u, v) => groundAt(t.x + c * u + s * v, t.y + s * u - c * v).z;
    const fl = g(hl, hb), fr = g(hl, -hb), rl = g(-hl, hb), rr = g(-hl, -hb), z = (fl + fr + rl + rr) / 4;
    t.gp = Math.atan((fl + fr - rl - rr) / 2 / (2 * hl / PX)); t.gr = Math.atan((fl + rl - fr - rr) / 2 / (2 * hb / PX));
    if (dt > 0 && z < t.gz - 0.05) { t.vz -= G * dt; t.gz = Math.max(z, t.gz + t.vz * dt); }
    else { t.gz = z; t.vz = 0; }
  }
  function suspension(t, dt) {
    const T = t.T, u = t.sus, K = 57, C = 4.5;
    const acc = (t.speed - u.v0) / dt / PX; u.v0 = t.speed;
    const lat = (t.speed / PX) * t.turnRate, sp = Math.abs(t.speed) / T.speed, ph = t.treadPhase / PX;
    const bump = sp * (t.bumpK || 1) * (Math.sin(ph * 2.3) * 0.6 + Math.sin(ph * 5.1 + 1.3) * 0.4 + Math.sin(ph * 9.7) * 0.25);
    const fp = K * (0.005 * clamp(acc, -6, 6) + 0.008 * bump), fr = K * (0.006 * clamp(lat, -4, 4) + 0.005 * Math.sin(ph * 3.7 + 0.5) * sp * (t.bumpK || 1));
    u.vp += (-K * (u.p - t.gp) - C * u.vp + fp) * dt; u.p += u.vp * dt;
    u.vr += (-K * (u.r - t.gr) - C * u.vr + fr) * dt; u.r += u.vr * dt;
  }
  // Impulsion angulaire sur la caisse : quantité de mouvement × bras de levier / inertie
  function rock(t, J, dirX, dirY, h) {
    t.sus.vp += J * h / t.T.Ip * dirX * 3;
    t.sus.vr += J * h / t.T.Ir * dirY * 3;
  }
  const DRV = {};
  // Organes de mobilité : boîte bloquée qui finit par casser (1 % par seconde), réservoirs tous percés
  // (le moteur s'arrête 20 à 40 s plus tard)
  function mobility(t, dt) {
    const tf = modOf(t, 'trans'), fuel = t.mods.filter(m => m.kind === 'fuel');
    if (tf.hp > 0 && tf.hp < tf.max0 * 0.3) {
      if (!t.grind) { t.grind = true; if (t === player) { addLog('Gearbox damaged: stuck in gear', '#ffb070'); Sfx.clang(0); } }
      if (Math.random() < 0.01 * dt) { modDamage(t, tf, tf.hp, null); if (t === player) addLog('The gearbox has failed', '#ff6a5a'); }
    } else t.grind = false;
    // réservoir percé : l'essence fuit (trace au sol), les coups suivants l'allument plus souvent
    t.leak = fuel.filter(m => m.hp < m.max0 * 0.6).length;
    if (t.leak && Math.random() < dt * 0.6 * t.leak) {
      const w = worldOf(t, [-t.T.len * 0.35 / PX, rnd(-0.5, 0.5), 0]);
      markDirty(w.x, w.y, 8); gctx.fillStyle = 'rgba(18,14,10,0.22)'; gctx.beginPath(); gctx.ellipse(w.x, w.y, rnd(3, 6), rnd(2, 4), rnd(0, 3), 0, TAU); gctx.fill();
    }
    if (!t.noFuel && fuel.length && fuel.every(m => m.hp <= 0)) {
      if (t.fuelOutT == null) { t.fuelOutT = rnd(20, 40); if (t === player) addLog('Fuel tanks holed: the engine will stop soon', '#ffb070'); }
      else if ((t.fuelOutT -= dt) <= 0) { t.noFuel = true; if (t === player) addLog('Out of fuel: engine stopped', '#ff6a5a'); }
    }
  }
  // Tourelles : vitesses réelles (TRAV_K = 1) ; TRAV_K est le réglage arcade si les essais le demandent.
  // TRAV_ACC : accélération angulaire de la tourelle (rad/s²)
  const TRAV_K = 1, TRAV_ACC = 30 * D2R;
  // direction d'un coup ramenée dans le repère de la caisse inclinée (tangage puis roulis, relief et
  // suspension) : un char qui franchit une crête face à l'ennemi lui présente son ventre et son bas de caisse
  function tiltIn(t, d) {
    const p = t.sus.p, r = t.sus.r, cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r), z = -d[0] * sp + d[2] * cp;
    return [d[0] * cp + d[2] * sp, d[1] * cr + z * sr, -d[1] * sr + z * cr];
  }
  // pente du tube due à la caisse (tangage, roulis) et dévers du canon (roulis autour de l'âme)
  const hullPitch = t => t.sus.p * Math.cos(t.turret) - t.sus.r * Math.sin(t.turret);
  const gunCant = t => t.sus.r * Math.cos(t.turret) + t.sus.p * Math.sin(t.turret);
  // Épave : intacte (abandonnée, hors de combat), en feu, ou soufflée par ses munitions. Le feu peut
  // prendre plus tard dans une épave intacte et finir par faire sauter ce qui reste d'obus à bord.
  function wreckLogic(t, dt) {
    if (t.wFireT > 0 && (t.wFireT -= dt) <= 0) {
      if (t.wreck !== 'brewed') t.wreck = 'burning';
      t.burnLeft = rnd(30, 60); t.brewAt = t.cookLeft > 0 ? t.cookLeft : ammoFrac(t) > 0.05 && Math.random() < 0.6 ? rnd(4, 25) : 0;
    }
    const brewed = t.wreck === 'brewed', fire = t.wreck === 'burning' || (brewed && t.deadT < 12);
    if (fire) { t.burnT += dt; if (Math.random() < dt * 22) addFire(t.x + rnd(-10, 10), t.y + rnd(-8, 8)); }
    if (t.wreck === 'burning') {
      if ((t.burnLeft -= dt) <= 0) t.wreck = 'burnt';
      else if (t.brewAt > 0 && (t.brewAt -= dt) <= 0) brewUp(t);
    }
    burnFx(t, dt, fire ? 1.4 : brewed ? (t.deadT < 45 ? 0.6 : 0.2) : t.wreck === 'burnt' ? 0.3 : 0, null);
    // munitions qui détonent une à une dans l'épave
    if (brewed && t.deadT < 10 && Math.random() < dt * 0.9) {
      const z = t.T.S.ht + 0.4;
      parts.push({ k: 'flash', x: t.x, y: t.y, life: 0.1, max: 0.1, size: 26, z });
      Fx.armorHit(t.x + rnd(-6, 6), t.y + rnd(-6, 6), z, 'non', rnd(-1, 1), rnd(-1, 1));
      Sfx.impact(listenerDist(t.x, t.y));
    }
  }
  // Eau, glace et ponts sous un char. Traînée de l'eau ½ ρ Cd A v² (A : largeur × profondeur mouillée) en
  // plus du fond (sol « gué ») ; au-delà de sa profondeur de gué, le moteur se noie en 3 s ; la caisse sous
  // l'eau jusqu'au toit, l'équipage évacue (renvoie true). La glace cède sous plus de 30 t, un pont sous plus
  // que sa charge. t.wet : profondeur sous le char (m)
  const HEAVY_T = 30;
  function waterLogic(t, dt, c) {
    const T = t.T, D = T.D;
    if (T.mass > HEAVY_T) {
      // le tablier craque une seconde avant de céder : le temps de reculer
      const b = terra.bridges.length && terra.bridgeAt(t.x, t.y);
      if (b && T.mass > b.cap) {
        if (!b.creak && t === player) addLog(`The bridge is creaking: it takes ${b.cap} t, your ${T.name} weighs ${T.mass} t!`, '#ffb070');
        if ((b.creak = (b.creak || 0) + dt) > 1.2) collapseBridge(b, t);
      }
      if (terra.ice && terra.iceAt(t.x, t.y)) breakIce(t);
    }
    const dep = t.wet = Math.max(0, terra.wl - t.gz);
    if (!dep) { t.floodT = 0; return false; }
    const v = Math.abs(t.speed) / PX;
    c.crr += 500 * T.S.W * Math.min(dep, T.S.ht) * v * v / (T.mass * 1000 * G);
    // gerbes d'étrave
    if (v > 1 && Math.random() < dt * v * 3) { const f = Math.sign(t.speed) * T.len * 0.5; Fx.splash(t.x + Math.cos(t.angle) * f, t.y + Math.sin(t.angle) * f, 0.1 + v * 0.03); }
    if (dep > D.ford && modOk(t, 'engine')) {
      if (t === player && !t.floodT) addLog(`Water too deep (${dep.toFixed(1)} m, fording limit ${D.ford} m): the engine is flooding!`, '#ffb070');
      if ((t.floodT = (t.floodT || 0) + dt) > 3) { modDamage(t, modOf(t, 'engine'), 1e9, null, true); if (t === player) addLog('Engine flooded', '#ff6a5a'); }
    } else if (dep <= D.ford) t.floodT = 0;
    if (dep > T.S.ht + 0.2) { if (t === player) addLog('The tank is sinking: abandon ship!', '#ff6a5a'); bail(t); return true; }
    return false;
  }
  // Garde-corps : un char engagé sur le tablier n'en sort que par les bouts
  function bridgeRails(t) {
    let on = null;
    for (const b of terra.bridges) {
      if (b.dead) continue;
      const dx = t.x - b.x, dy = t.y - b.y, u = dx * b.ux + dy * b.uy, v = dy * b.ux - dx * b.uy, lim = b.hw - 3;
      if (t.deck === b && Math.abs(u) < b.hl - 5 && Math.abs(v) > lim) { const w = Math.sign(v) * lim; t.x = b.x + b.ux * u - b.uy * w; t.y = b.y + b.uy * u + b.ux * w; on = b; }
      else if (Math.abs(u) <= b.hl && Math.abs(v) <= b.hw) on = b;
    }
    t.deck = on;
  }
  // Pont qui cède : la travée tombe à l'eau, le char avec ; le passage disparaît de l'itinéraire
  function collapseBridge(b, t) {
    b.dead = true;
    paintBridge(b);
    soilSeg(b.x - b.ux * b.hl, b.y - b.uy * b.hl, b.x + b.ux * b.hl, b.y + b.uy * b.hl, b.hw, 'water');
    for (let i = 0; i < 6; i++) Fx.splash(b.x + b.ux * rnd(-30, 30), b.y + b.uy * rnd(-30, 30), 0.8);
    Sfx.explosion(listenerDist(b.x, b.y), false); addTrauma(t === player ? 0.5 : 0);
    if (W3D && scene3On) W3D.putCell('br', World3D.buildBridges(terra, PX));
    buildGrid();
    if (t === player || visibleToPlayer(t)) addLog(`The bridge collapses under the ${t.T.name}!`, '#ffb070');
  }
  // Glace qui se brise sous un char lourd : trou d'eau noire, sol « gué », plus de passage pour l'itinéraire
  let iceDirty = false;
  function breakIce(t) {
    const r = t.r + 12;
    if (!terra.breakIce(t.x, t.y, r)) return;
    iceDirty = true;
    markDirty(t.x, t.y, r + 8); gctx.fillStyle = 'rgba(34,48,58,0.92)'; gctx.beginPath(); gctx.ellipse(t.x, t.y, r, r * 0.85, t.angle, 0, TAU); gctx.fill();
    soilSeg(t.x, t.y, t.x, t.y, r, 'water');
    terrainGrid();
    Fx.splash(t.x, t.y, 0.6); Sfx.impact(listenerDist(t.x, t.y));
    if (!t.iceMsg && (t === player || visibleToPlayer(t))) { t.iceMsg = true; addLog(`The ice gives way under ${t === player ? 'your tank' : 'the ' + t.T.name}!`, '#ffb070'); }
  }
  function updateTank(t, dt) {
    if (t.dead) {
      t.deadT += dt;
      t.speed = t.vl = t.turnRate = t.vx = t.vy = 0;
      if (t.x !== t.lx || t.y !== t.ly || t.vz) { collideObstacles(t, 0, 0, t.angle, true); clampMap(t); t.lx = t.x; t.ly = t.y; tankPose(t, dt); t.sus.p = t.gp; t.sus.r = t.gr; }
      wreckLogic(t, dt);
      return;
    }
    crewLogic(t, dt);
    if (t.dead) return;
    const T = t.T, D = T.D, inp = t.in;
    if (t.trackT > 0) trackRepair(t, dt);
    if (t.elevJamT > 0) t.elevJamT -= dt;
    mobility(t, dt);
    const driverOk = roleOk(t, 'driver'), engOn = modOk(t, 'engine') && !t.noFuel && !t.fires.some(f => f.bay), canDrive = driverOk && engOn && modOk(t, 'trans') && !t.dismount;
    // puissance selon l'état du moteur ; en dessous de 40 %, des ratés coupent la puissance un instant
    const eng = modOf(t, 'engine'), ef = Math.max(0, eng.hp) / eng.max0;
    t.misT = (t.misT || 0) - dt;
    if (ef < 0.4 && t.misT < -1 && Math.random() < dt * 1.5 * (1 - ef)) t.misT = 0.3;
    // moteur endommagé (sous 60 %) : puissance réduite, jusqu'à 45 % ; réparé à 50 %, il rend environ 90 %
    const engK = (0.45 + 0.55 * clamp(ef / 0.6, 0, 1)) * (t.misT > 0 ? 0.3 : 1);
    // optiques : l'équipage remplace la visière ou l'épiscope brisé ; le chef rentre sous le feu
    for (const k in t.optic) if (t.optic[k] > 0 && (t.optic[k] -= dt) <= 0 && t === player) addLog(`${OPTIC_NAMES[k]} replaced`, '#a6f08a');
    t.underFire -= dt;
    if (t.underFire > 0) { t.calm = 0; if (t.ai) t.hatch = false; }
    else if ((t.calm += dt) > 12 && t.ai && roleOk(t, 'commander')) t.hatch = true;
    if (!roleOk(t, 'commander')) t.hatch = false;
    // Conduite (vehicle.js) : sol sous chaque chenille, pression au sol ; la chenille la plus freinée tire
    // la caisse de son côté. Le moteur préparé (régulateur retiré) monte vers son régime nominal.
    const ca = Math.cos(t.angle), sa = Math.sin(t.angle), hb = D.B / 2 * PX;
    // pente : la pesanteur tire le long de la caisse (montée > 0) et en travers, où seule l'adhérence
    // latérale retient le char ; au-delà de sa pente limite (30 à 35°), les chenilles patinent
    tankPose(t, dt);
    const slope = Math.sin(t.gp);
    t.vl += Math.sin(t.gr) * G * PX * dt;
    const gR = groundAt(t.x - sa * hb, t.y + ca * hb).type, gL = groundAt(t.x + sa * hb, t.y - ca * hb).type;
    const crrR = Vehicle.crrOf(gR, D.press), crrL = Vehicle.crrOf(gL, D.press), broken = t.trackT > 0 && canDrive;
    const c = DRV, gov = D.gov + (D.rated - D.gov) * clamp((t.up.hp - 1) / 0.24, 0, 1);
    c.thr = canDrive ? clamp(inp.throttle, -1, 1) : 0; c.turn = canDrive && !broken ? clamp(inp.turn, -1, 1) : 0; c.brake = !!inp.brake;
    // pilote blessé ou remplaçant : il passe les rapports et braque moins vite
    const eD = 0.6 + 0.4 * eff(t, 'driver');
    c.turn *= eD; c.P = T.hp * 735.5 * t.up.hp * engK * eD; c.gov = gov;
    c.crr = (crrR + crrL) / 2; c.crrD = crrR - crrL; c.mu = (gR.mu + gL.mu) / 2; c.lat = (gR.lat + gL.lat) / 2; c.slope = slope; c.grip = t.up.grip;
    if (Math.abs(slope) > 0.25) c.mu = Math.min(c.mu, Math.tan(D.climb * D2R));
    c.drive = canDrive; c.driver = driverOk; c.engine = engOn; c.broken = broken ? t.trackSide : 0;
    c.vCap = D.top * gov / D.gov * (t.wheelK || 1) * (t.optic.driver > 0 ? 0.7 : 1) * 1.02;
    // chenille cassée : la chenille intacte entraîne seule, ses roues labourent le sol
    c.vBroken = clamp(1.6 - T.mass / 100, 0.9, 1.5) / 2;
    // boîte abîmée : le dernier rapport est perdu sous 60 %, la boîte se bloque sur un rapport sous 30 %
    const tf = modOf(t, 'trans'), tq = tf.hp / tf.max0;
    c.maxGear = tq < 0.6 ? D.gears.length - 1 : 9; c.stuck = tq < 0.3;
    // tourelle hydraulique à l'arrêt : le pilote fait monter le régime pour que la pompe la tourne vite
    c.rev = D.trav.kind === 'hyd' && t.travWant && Math.abs(t.speed) < 0.5 * PX ? 0.9 : 0;
    t.bumpK = 1 + ((gR.bump || 0) + (gL.bump || 0)) / 2;
    if (waterLogic(t, dt, c)) return;
    const vPre = t.speed, lPre = t.vl, a0 = t.angle, ox = t.x, oy = t.y;
    Vehicle.step(t, D, c, dt, PX);
    t.angle = angNorm(t.angle + t.turnRate * dt);
    const c2 = Math.cos(t.angle), s2 = Math.sin(t.angle);
    t.x += (c2 * t.speed - s2 * t.vl) * dt;
    t.y += (s2 * t.speed + c2 * t.vl) * dt;
    collideObstacles(t, vPre, lPre, a0);
    clampMap(t);
    bridgeRails(t);
    // vitesse réelle : ce qu'un obstacle ou le bord de la carte a retenu est perdu, sans élan fantôme
    const mvx = (t.x - ox) / dt, mvy = (t.y - oy) / dt, va = mvx * c2 + mvy * s2, la = mvy * c2 - mvx * s2;
    t.spin = Math.abs(t.speed - va);
    if (Math.abs(va) < Math.abs(t.speed)) t.speed = va;
    if (Math.abs(la) < Math.abs(t.vl)) t.vl = la;
    const moved = Math.hypot(t.x - ox, t.y - oy);
    t.vx = mvx; t.vy = mvy;
    t.treadPhase += t.speed * dt;
    // chaque chenille avance à sa vitesse : v ∓ ω·B/2 (droite, gauche) ; la chenille cassée ne tourne plus
    for (const k of [0, 1]) {
      const side = k === 0 ? 1 : -1;
      if (broken && side === t.trackSide) continue;
      t.wd[k] += (t.speed / PX - side * t.turnRate * D.B / 2) * dt;
    }
    t.trackAcc += moved + Math.abs(t.turnRate) * 40 * dt;
    if (t.trackAcc > 9) { t.trackAcc = 0; stampTracks(t); }
    if ((moved > 0.6 || t.slip > 0.5) && Math.random() < dt * (Math.abs(t.speed) / 9 + t.slip * 6)) {
      // poussière soulevée par les chenilles : dense par temps sec, rare sur la neige ; nuage de dérapage
      const c = Math.cos(t.angle), s = Math.sin(t.angle), side = Math.random() < 0.5 ? -1 : 1, dc = Fx.dust();
      const bk = Math.sign(t.speed) || 1, k = L().snow ? 0.5 : L().trees > 100 ? 0.7 : 1;
      if (Math.random() < k) P3({ x: t.x - c * T.len * 0.5 * bk - s * side * T.wid * 0.4, y: t.y - s * T.len * 0.5 * bk + c * side * T.wid * 0.4, z: 0.25, vx: -c * bk * rnd(0.5, 2) - s * side * rnd(0, 1), vy: -s * bk * rnd(0.5, 2) + c * side * rnd(0, 1), vz: rnd(0.3, 1.1), drag: 1.4, wind: 1, size: rnd(0.4, 0.8), grow: rnd(0.8, 1.3), life: rnd(1.5, 3), c: [dc[0], dc[1], dc[2], 0.34] });
    }
    // gaz d'échappement : bouffées bleutées sous forte charge
    if (t.load > 0 && Math.random() < dt * (t.load > 0.6 ? 10 : 2)) {
      const c = Math.cos(t.angle), s = Math.sin(t.angle);
      P3({ x: t.x - c * T.len * 0.48, y: t.y - s * T.len * 0.48, z: T.S.ht * 0.75, vx: -c * rnd(1, 2.5), vy: -s * rnd(1, 2.5), vz: rnd(0.3, 0.9), drag: 1.5, wind: 1, size: rnd(0.15, 0.3), grow: 0.7, life: rnd(1.2, 2.2), c: [0.33, 0.34, 0.37, 0.35] });
    }

    // Tourelle : vitesse de rotation limitée ; le chasseur n'a qu'un petit secteur de tir
    const desiredRel = angNorm(inp.aim - t.angle);
    let d;
    if (T.arc) d = clamp(desiredRel, -T.arc, T.arc) - t.turret;
    else d = angNorm(desiredRel - t.turret);
    // entraînement hydraulique (régime du moteur, manivelle s'il est arrêté), électrique ou à la main,
    // avec l'inertie de la tourelle : accélération limitée, freinage avant le point visé
    const eG = eff(t, 'gunner'), ts = Vehicle.traverse(D, t.rpmA, engOn) * TRAV_K * eG * (t.turretGone ? 0 : 1) * (t.ringT > 0 ? 0.1 : 1);
    t.travWant = ts > 0 && Math.abs(d) > 0.01;
    const want = Math.sign(d) * Math.min(ts, Math.sqrt(2 * TRAV_ACC * Math.abs(d)));
    let rate = t.turretRate + clamp(want - t.turretRate, -TRAV_ACC * dt, TRAV_ACC * dt), rot = rate * dt;
    if (rot * d >= 0 && Math.abs(rot) > Math.abs(d)) { rot = d; rate = 0; }
    const nt = T.arc ? clamp(t.turret + rot, -T.arc, T.arc) : angNorm(t.turret + rot);
    // le tube ne traverse ni les maisons, ni les rochers, ni les autres chars : la tourelle bute (les arbres
    // plient) ; déjà engagé, il peut toujours se dégager
    if (rot !== 0 && barrelHit(t, t.angle + nt, false) && !barrelHit(t, t.angle + t.turret, false)) {
      t.turretRate = 0;
      if (gameTime - (t.barrelT || -9) > 1) { t.barrelT = gameTime; Sfx.clang(listenerDist(t.x, t.y)); }
    } else { t.turret = nt; t.turretRate = rate; }

    // Dispersion : elle augmente en mouvement et se resserre à l'arrêt
    if (t.bentT > 0 && (t.bentT -= dt) <= 0 && t === player) addLog('Gun barrel straightened', '#a6f08a');
    const goal = T.disp / t.up.optic * t.up.disp / Math.max(0.4, eG) * (t.optic.gunner > 0 ? 2.5 : 1) * (t.bentT > 0 ? 3 : 1) * (1 + t.up.moveDisp * (0.6 * Math.abs(t.speed) / T.speed + 0.8 * Math.abs(t.turnRate) / T.turn) + 1.1 * Math.abs(t.turretRate) / T.tturn);
    t.disp += (goal - t.disp) * Math.min(1, dt * (goal > t.disp ? 6 : 1.3));

    // hors du tir, le chargeur regarnit le râtelier : un obus toutes les 8 s
    // (plus vite ou plus lentement selon son état ; plus de râtelier s'il a été détruit)
    const rack = t.mods.find(m => m.kind === 'ammo' && m.frame === 'turret');
    if (t.reloadT <= 0 && t.ready < T.ready + t.up.ready && !(rack && rack.hp <= 0) && (t.readyT += dt * eff(t, loaderRole(t))) > 8) { t.ready++; t.readyT = 0; }
    // équipage sonné par un coup : le chargement s'interrompt
    if (t.stunT > 0) t.stunT -= dt;
    else if (t.reloadT > 0) {
      const r0 = t.reloadT;
      t.reloadT -= dt / reloadMul(t);
      // étapes sonores du chargement : râtelier, refouloir, culasse
      if (t === player) Sfx.loading(1 - r0 / t.reloadMax, 1 - t.reloadT / t.reloadMax);
    }
    t.recoil = Math.max(0, t.recoil - dt * 3);
    t.fireAge += dt;
    // Pointage en hauteur, relatif à la caisse (aucun char de l'époque n'était stabilisé) : le tireur
    // cherche au volant (≈ 4 °/s) l'élévation qui amène l'obus sur le point visé, chute comprise ; le
    // tangage de la caisse s'y ajoute. Tirer juste demande un arrêt court, le temps que la suspension se calme.
    {
      const sb = Ballistics.shell(T.id, t.shell), pv = pivot(t), ta = t.angle + t.turret, hp = hullPitch(t);
      const ap = aimPoint(t, pv.x + Math.cos(ta) * T.gunEnd, pv.y + Math.sin(ta) * T.gunEnd);
      const want = Math.atan(aimSlope(sb, ap.D, t.gz + T.S.gun.z, ap.z) * PX * RK), er = D.elevRate * D2R * eG * (t.elevJamT > 0 ? 0 : 1);
      // le tireur corrige le tangage qu'il voit dans la lunette, avec un temps de réaction (≈ 0,5 s)
      t.hpSeen = (t.hpSeen || 0) + (hp - (t.hpSeen || 0)) * Math.min(1, dt / 0.5);
      t.elev = clamp(t.elev + clamp(want - t.hpSeen - t.elev, -er * dt, er * dt), D.elev[0] * D2R, D.elev[1] * D2R);
      t.elevErr = t.elev + hp - want;
    }
    t.stillT = Math.abs(t.speed) < 0.3 * PX && Math.abs(t.turnRate) < 0.05 ? (t.stillT || 0) + dt : 0;
    suspension(t, dt);
    // fumée de poudre qui s'échappe encore de la bouche après le coup
    if (t.fireAge < 2.5 && Math.random() < dt * 7 * (1 - t.fireAge / 2.5)) {
      const pv = pivot(t), ta = t.angle + t.turret;
      P3({ x: pv.x + Math.cos(ta) * T.gunEnd, y: pv.y + Math.sin(ta) * T.gunEnd, z: T.S.gun.z, vz: rnd(0.3, 0.8), drag: 1, g: -0.15, wind: 1, size: rnd(0.08, 0.15), grow: 0.35, life: rnd(1.5, 2.5), c: [0.7, 0.7, 0.68, 0.3] });
    }
    // moteur endommagé : fumée grise qui sort des grilles, noire quand il rate
    if (eng.hp < eng.max0 * 0.6 && Math.random() < dt * 5) {
      const c = Math.cos(t.angle), sn = Math.sin(t.angle), g = ef < 0.4 ? 0.1 : 0.3;
      P3({ x: t.x - c * T.len * 0.32 + rnd(-4, 4), y: t.y - sn * T.len * 0.32 + rnd(-4, 4), z: T.S.ht, vz: rnd(0.8, 1.6), drag: 0.8, g: -0.25, wind: 1.2, size: rnd(0.25, 0.4), grow: 0.6, life: rnd(2, 3.5), c: [g, g, g, 0.45] });
    }
    t.flash = Math.max(0, t.flash - dt);
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    t.revealT -= dt;
    if (inp.fire && t.reloadT <= 0 && state === 'play' && canFire(t)) {
      // culasse endommagée : un coup sur seize ne part pas, il faut l'extraire (6 s)
      if (modState(modOf(t, 'breech')) === 1 && Math.random() < 0.06) { t.reloadMax = t.reloadT = 6; if (t === player) addLog('Misfire: clearing the damaged breech (6 s)', '#ffb070'); }
      else fireShell(t);
    }
    updateMG(t, dt);
  }

  // Pente initiale (dz par mètre balistique) pour qu'un obus parti de z0 passe à zt à la distance D (px) :
  // ligne droite + surélévation qui compense la chute lue dans la table de tir de l'obus (traînée
  // comprise) ; la mitraille suit la loi des billes d'acier (freinage exponentiel sur 250 m)
  function aimSlope(sb, Dpx, z0, zt) {
    const X = Math.max(5, Dpx * RK);
    const drop = sb.can ? Ballistics.dropExp(MG_AMMO.CAN.v0, 1 / MG_AMMO.CAN.kd, X) : Ballistics.drop(sb, X);
    return (zt - z0) / X + drop / X;
  }
  // Point que le tireur veut toucher : sa cible pour l'IA, le point visé à la souris ou à la lunette
  function aimPoint(t, mx, my) {
    if (t === player && !t.ai) {
      // à la lunette : distance télémétrée (assisté) ou hausse affichée sur le tambour (réaliste)
      if (sight.on) { const D = !assisted() ? sight.rangeSet / RK : sight.probe && sight.probe.kind !== 'sky' ? sight.probe.dist : 700; return { D, z: sight.z0 + Math.tan(sight.gunPitch) * D / PX }; }
      if (t.aim3) return { D: Math.hypot(t.aim3.x - mx, t.aim3.y - my), z: t.aim3.z };
    }
    const a = t.ai, e = a && a.target;
    if (a && a.soft && !(e && !e.dead)) return { D: Math.hypot(a.soft.x - mx, a.soft.y - my), z: a.soft.z };
    if (e && !e.dead) return a.ax != null ? { D: Math.hypot(a.ax - mx, a.ay - my) * a.rngK, z: e.gz + (a.az != null ? a.az : e.T.S.ht - 0.25) } : { D: Math.hypot(e.x - mx, e.y - my), z: e.gz + e.T.S.ht - 0.25 };
    return { D: 600, z: t.gz + 1.4 };
  }
  // Tube du canon, du pivot à la bouche, à hauteur de tourillons : premier obstacle (assez haut) ou char
  // qu'il traverse ; trees : les arbres comptent (sinon ils plient sous le tube)
  function barrelHit(t, ta, trees) {
    const pv = pivot(t), z = t.gz + t.T.S.gun.z, dx = Math.cos(ta) * t.T.gunEnd, dy = Math.sin(ta) * t.T.gunEnd;
    const minx = Math.min(pv.x, pv.x + dx), maxx = Math.max(pv.x, pv.x + dx), miny = Math.min(pv.y, pv.y + dy), maxy = Math.max(pv.y, pv.y + dy);
    let best = null;
    for (const o of obstacles) {
      if (o.dead || (o.type === 'tree' && !trees) || o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny || obsTop(o) < z) continue;
      const h = segAABB(pv.x, pv.y, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
      if (h && h.t < 1 && (!best || h.t < best.t)) best = { t: h.t, o, nx: h.nx, ny: h.ny };
    }
    for (const e of tanks) {
      if (e === t || e.x > maxx + 40 || e.x < minx - 40 || e.y > maxy + 40 || e.y < miny - 40) continue;
      const c = tankCand(e, pv.x, pv.y, dx, dy, z, z);
      if (c && c.t < 1 && (!best || c.t < best.t)) best = c;
    }
    if (best) { best.x = pv.x + dx * best.t; best.y = pv.y + dy * best.t; }
    return best;
  }
  function fireShell(t) {
    const T = t.T, key = t.shell, sh = SHELLS[key];
    const ta = t.angle + t.turret, hp = hullPitch(t), lo = D2R * T.D.elev[0] + hp, hi = D2R * T.D.elev[1] + hp;
    // le dévers du canon (roulis) décale le coup du côté penché, d'autant plus que la hausse est forte
    const ang = ta + gauss() * t.disp + gunCant(t) * Math.tan(t.elev);
    const pv = pivot(t);
    // canon collé à un arbre, un mur ou un char : la bouche est au-delà, l'obus part du point de contact
    const blk = barrelHit(t, ta, true);
    const mx = blk ? blk.x : pv.x + Math.cos(ta) * T.gunEnd, my = blk ? blk.y : pv.y + Math.sin(ta) * T.gunEnd;
    takeRound(t, key);
    const sb = Ballistics.shell(T.id, key), v0 = Ballistics.muzzle(sb), pxk = shellPxK(), sp = v0 * pxk;
    // vertical : élévation du tube, caisse comprise, et dispersion, isotrope avec l'horizontale ; la bouche
    // monte ou descend avec le tangage
    const z0 = t.gz + T.S.gun.z + Math.sin(hp) * T.S.gun.len, k3 = PX * RK;
    let slope = Math.tan(t.elev + hp) / k3 + gauss() * t.disp / k3;
    // recul : la caisse bascule vers l'arrière du tir (canon au-dessus du centre de gravité)
    t.fireAge = 0;
    rock(t, sb.m * sb.v0 * (key === 'CAN' ? 0.9 : 1.3), Math.cos(t.turret), -Math.sin(t.turret), T.S.gun.z - T.S.ht * 0.5);
    slope = clamp(slope, Math.tan(lo) / k3, Math.tan(hi) / k3);
    if (key === 'CAN') {
      // la boîte s'ouvre à la bouche : une gerbe de billes d'acier qui s'ouvre d'environ 3°
      for (let i = 0; i < sb.balls; i++) {
        const a = ang + gauss() * 0.028, bsp = v0 * 0.92 * (0.95 + Math.random() * 0.1);
        bullets.push({ x: mx, y: my, z: z0, vx: Math.cos(a) * bsp, vy: Math.sin(a) * bsp, sp: bsp, slope: slope + gauss() * 0.028 / k3, dist: 0, tracer: i % 9 === 0, by: t, team: t.team, type: 'CAN' });
      }
    } else {
      const s = {
        id: ++shellId, x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, pxk, V: v0, team: t.team, owner: t, by: t,
        key, sb, v0, dist: 0, z: z0, slope, trail: [], ric: 0, yaw: false, whiz: false, warned: false, tgt: t.ai && t.ai.target, fx: mx, fy: my,
      };
      // touché à bout portant dès la bouche ; l'obus ne continue que s'il traverse ou ricoche
      const res = blk ? (blk.tank ? hitTank(s, blk.tank, blk, mx, my) : hitObstacle(s, blk.o, blk, mx, my)) : 'continue';
      if (res !== 'stop') shells.push(s);
    }
    // les premiers obus viennent du râtelier de tourelle ; ensuite le chargeur va les chercher dans
    // les soutes de caisse, plus lentement
    if (t.ready > 0) t.ready--;
    t.reloadMax = reloadTime(t);
    t.reloadT = t.reloadMax; t.readyT = 0;
    // le chargeur prend l'obus demandé pendant le tir
    if (t.nextShell && t.ammo[t.nextShell] > 0) t.shell = t.nextShell;
    t.nextShell = null;
    t.disp += T.disp * 3;
    t.recoil = 1; t.flash = 0.09; t.revealT = 3;
    // recul : quantité de mouvement de l'obus et des gaz, presque toute absorbée par le frein de tir et les
    // chenilles ; rien sur un char freiné ou arrêté
    if (!t.braking && (Math.abs(t.speed) > 0.3 * PX || t.in.throttle)) t.speed -= sb.m * sb.v0 * 1.5 / (T.mass * 1000) * Math.cos(t.turret) * 0.3 * PX;
    if (t.ammo[t.shell] <= 0) {
      t.shell = nextShell(t);
      if (t === player) showMsg(`Out of ${sh.name.toLowerCase()} rounds: ${SHELLS[t.shell].name.toLowerCase()} loaded`, '#e9d9a6', 1.6);
    }
    if (t === player) {
      waveStats.shots++; addTrauma(0.18 + T.caliber / 600); padRumble(0.6, 120);
      // recul visible : le regard de la caméra extérieure monte et le champ s'ouvre un instant
      const o = Meta.P.opts; cam3.kick = 0.03 * T.caliber / 75 * (0.4 + 0.6 * o.shake) * (o.calm ? 0.5 : 1);
    }
    parts.push({ k: 'flash', x: mx, y: my, life: 0.08, max: 0.08, size: 20 + T.caliber / 4, z: T.S.gun.z });
    addBlast3(mx, my, T.caliber / 60);
    Fx.muzzle(t, mx, my); muzzleVeil(t, mx, my);
    Sfx.fire(listenerDist(mx, my), T.caliber >= 85, t === player);
  }

  // ===================== Mitrailleuses =====================
  const OPTIC_NAMES = { driver: 'Driver’s visor', gunner: 'Gunner’s sight', cmd: 'Cupola periscopes' };
  const OPTIC_AGR = { driver: 'e', gunner: '', cmd: 's' }; // accords : brisée, brisé, brisés
  // Balles perforantes de 7,92 mm : S.m.K. (noyau d'acier) et S.m.K.H. (noyau de carbure de tungstène,
  // rare). Perforation à incidence nulle, décroissante avec la distance.
  const MG_AMMO = {
    SmK: { name: 'S.m.K.', full: 'S.m.K. · steel core', m: 11.5, v0: 785, p100: 11 },
    SmKH: { name: 'S.m.K.H.', full: 'S.m.K.H. · tungsten carbide core', m: 11.5, v0: 810, p100: 15 },
    CAN: { name: 'Ball', full: 'canister steel ball (Kartätsche)', m: 24, v0: 450, p100: 3, kd: 250 },
  };
  const mgPen = (type, xm) => MG_AMMO[type].p100 * Math.exp(-(xm - 100) / (MG_AMMO[type].kd || 600));
  const mgVel = (type, xm) => MG_AMMO[type].v0 * Math.exp(-xm / (MG_AMMO[type].kd || 900));
  // Point où se tient le chef de char à découvert : coupole (char à tourelle) ou trappe du toit
  function hatchPos(t) {
    const T = t.T, S = T.S;
    if (S.turret) {
      const c = S.turret.cupola, pv = pivot(t), ta = t.angle + t.turret, ox = c[0] * PX, oy = -c[1] * PX;
      return { x: pv.x + Math.cos(ta) * ox - Math.sin(ta) * oy, y: pv.y + Math.sin(ta) * ox + Math.cos(ta) * oy, z0: T.I.totalH - 0.05, m: [c[0], c[1]] };
    }
    const m = t.mods[t.roles.commander], ox = m.c[0] * PX, oy = -m.c[1] * PX, a = t.angle;
    return { x: t.x + Math.cos(a) * ox - Math.sin(a) * oy, y: t.y + Math.sin(a) * ox + Math.cos(a) * oy, z0: S.ht, m: [m.c[0], m.c[1]] };
  }
  // Mitrailleuse coaxiale (type MG 34) : 7,92 mm, 755 m/s, environ 900 coups/min, une balle traçante
  // sur cinq. Le canon chauffe en tir continu : au-delà de 250 coups d'affilée, il faut le changer.
  // Sans effet sur un blindage de char (8 mm perforés à 100 m), mais la gerbe se voit et s'entend.
  const MG_V = 755;
  function updateMG(t, dt) {
    const g = t.mg;
    g.cd -= dt; g.heat = Math.max(0, g.heat - 6 * dt);
    if (g.jam > 0) { g.jam -= dt; if (g.jam <= 0 && t === player) addLog('Machine-gun barrel changed', '#bcd8ff'); return; }
    let want = t.in.mg;
    if (t.ai) {
      // l'IA lâche des rafales courtes sur une cible visible à moyenne portée
      const e = t.ai.target || t.ai.soft, d = e ? Math.hypot(e.x - t.x, e.y - t.y) : 0;
      if (e && !e.dead && t.ai.los && d < 900 && friendlyClear(t, t.angle + t.turret, d)) {
        if (g.burst > 0) { g.burst -= dt; want = true; } else if ((g.wait -= dt) <= 0) { g.burst = rnd(0.4, 1.3); g.wait = rnd(2, 6); }
      } else g.burst = 0;
    }
    if (!want || state !== 'play' || g.ammo <= 0 || !roleOk(t, 'gunner') || t.turretGone || g.cd > 0) return;
    g.cd = 1 / 15 + rnd(-0.004, 0.004);
    g.ammo--; g.heat++; g.n++;
    if (g.heat > 250) { g.jam = 7; if (t === player) addLog('Machine gun overheated: changing barrel', '#ffb070'); }
    const T = t.T, ta = t.angle + t.turret, pv = pivot(t), side = -0.3 * PX;
    const mx = pv.x + Math.cos(ta) * T.gunEnd * 0.45 - Math.sin(ta) * side, my = pv.y + Math.sin(ta) * T.gunEnd * 0.45 + Math.cos(ta) * side;
    const a = ta + gauss() * (0.0035 + t.disp * 0.35), sp = MG_V * 0.92, zl = T.S.gun.z - 0.05, z0 = t.gz + zl;
    const ap = aimPoint(t, mx, my), X = Math.max(5, ap.D * RK), vm = MG_V * Math.exp(-X * 0.5 / 900);
    const slope = (ap.z - z0) / X + 0.5 * G * X / (vm * vm) + gauss() * (0.0035 + t.disp * 0.35) / (PX * RK);
    let type = 'SmK';
    if (g.type === 'SmKH' && g.ammoH > 0) { type = 'SmKH'; g.ammoH--; if (g.ammoH === 0 && t === player) { g.type = 'SmK'; addLog('Out of S.m.K.H.: back to S.m.K.', '#e9d9a6'); } }
    bullets.push({ x: mx, y: my, z: z0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, slope, dist: 0, tracer: g.n % 5 === 0, by: t, team: t.team, type });
    t.revealT = Math.max(t.revealT, 1.5);
    if (Math.random() < 0.5) parts.push({ k: 'flash', x: mx, y: my, life: 0.03, max: 0.03, size: 6, z: zl });
    Sfx.mg(listenerDist(mx, my));
  }
  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const dx = b.vx * dt, dy = b.vy * dt, dX = b.sp * dt * RK, zNext = b.z + b.slope * dX;
      let best = null;
      const minx = Math.min(b.x, b.x + dx) - 30, maxx = Math.max(b.x, b.x + dx) + 30, miny = Math.min(b.y, b.y + dy) - 30, maxy = Math.max(b.y, b.y + dy) + 30;
      for (const o of obstacles) {
        if (o.dead || o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny) continue;
        const h = segAABB(b.x, b.y, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
        if (h && b.z + (zNext - b.z) * h.t <= obsTop(o) && (!best || h.t < best.t)) best = { t: h.t, o };
      }
      for (const t of tanks) {
        if (t === b.by || t.x > maxx || t.x < minx || t.y > maxy || t.y < miny) continue;
        const c = tankCand(t, b.x, b.y, dx, dy, b.z, zNext);
        if (c && (!best || c.t < best.t)) best = { t: c.t, tank: t, z: c.z, h: c };
        if (t.dead) continue;
        // balles qui claquent autour : l'équipage se sent pris à partie
        const rx = t.x - b.x, ry = t.y - b.y, l2 = dx * dx + dy * dy || 1, kk = clamp((rx * dx + ry * dy) / l2, 0, 1);
        if (Math.hypot(b.x + dx * kk - t.x, b.y + dy * kk - t.y) < t.r + 3 * PX && b.by.team !== t.team) t.underFire = 6;
        // hommes descendus réparer une chenille, à côté de la caisse
        if (t.dismount) {
          const q = worldOf(t, [0, -t.trackSide * (t.T.S.W / 2 + 0.45), 0]), k2 = clamp(((q.x - b.x) * dx + (q.y - b.y) * dy) / l2, 0, 1);
          if (Math.hypot(b.x + dx * k2 - q.x, b.y + dy * k2 - q.y) < 0.5 * PX && b.z + (zNext - b.z) * k2 < t.gz + 1.6 && (!best || k2 < best.t)) best = { t: k2, tank: t, z: 0.8, crewOut: true };
        }
        // chef de char debout dans sa coupole : la tête et le buste dépassent du blindage
        if (t.hatch && roleOk(t, 'commander')) {
          const hp = hatchPos(t), qx = hp.x - b.x, qy = hp.y - b.y, k2 = clamp((qx * dx + qy * dy) / l2, 0, 1);
          const zz = b.z + (zNext - b.z) * k2 - t.gz;
          if (Math.hypot(b.x + dx * k2 - hp.x, b.y + dy * k2 - hp.y) < 0.26 * PX && zz > hp.z0 && zz < hp.z0 + 0.6 && (!best || k2 < best.t)) best = { t: k2, tank: t, z: zz, exposed: hp };
        }
      }
      for (const r of runners) {
        if (r.team === b.team) continue;
        const l2 = dx * dx + dy * dy || 1, k2 = clamp(((r.x - b.x) * dx + (r.y - b.y) * dy) / l2, 0, 1);
        if (b.z + (zNext - b.z) * k2 < hAt(r.x, r.y) + 1.7 && Math.hypot(b.x + dx * k2 - r.x, b.y + dy * k2 - r.y) < 0.3 * PX && (!best || k2 < best.t)) best = { t: k2, runner: r };
      }
      const bc = OBJ.bulletCand(b, dx, dy, zNext);
      if (bc && (!best || bc.t < best.t)) best = bc;
      const tg = terra.cut(b.x, b.y, b.z, b.x + dx, b.y + dy, zNext);
      if (tg >= 0 && (!best || tg < best.t)) best = { t: tg, ground: true };
      if (!best) {
        b.x += dx; b.y += dy; b.z = zNext; b.dist += b.sp * dt;
        const vr = mgVel(b.type, b.dist * RK);
        b.slope -= G / (vr * vr) * dX;
        if (b.type === 'CAN') { b.vx *= Math.exp(-b.sp * dt * RK / 250); b.vy *= Math.exp(-b.sp * dt * RK / 250); b.sp = Math.hypot(b.vx, b.vy); if (b.sp < 60) { bullets.splice(i, 1); continue; } }
        if (b.dist > 2400 || b.x < -50 || b.y < -50 || b.x > WW + 50 || b.y > WH + 50) bullets.splice(i, 1);
        continue;
      }
      const hx = b.x + dx * best.t, hy = b.y + dy * best.t, hz = Math.max(0, b.z + (zNext - b.z) * best.t - hAt(hx, hy)), ux = b.vx / b.sp, uy = b.vy / b.sp;
      if (best.tank) {
        mgNow = b.by === player; const mr = mgHitTank(b, best.tank, best, hx, hy); mgNow = false;
        if (mr === 'continue') continue;
      } else if (best.soft) OBJ.bulletHit(b, best, hx, hy);
      else if (best.runner) { best.runner.hp -= rnd(60, 130); Fx.bulletGround(hx, hy, ux, uy); }
      else if (best.ground) { if (terra.depth(hx, hy) > 0.1) Fx.splash(hx, hy, 0.12); else Fx.bulletGround(hx, hy, ux, uy); }
      else Fx.chips(hx, hy, hz, best.o.type === 'tree');
      // une traçante qui frappe l'acier ou le sol en rasant repart en chandelle, souvent vers le ciel
      if (b.tracer && (best.tank || (best.ground && Math.random() < 0.55))) {
        const a = Math.atan2(uy, ux) + rnd(-0.9, 0.9), v = rnd(120, 300), e = rnd(0.15, 0.9);
        P3({ x: hx, y: hy, z: hz, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v, vz: Math.sin(e) * v, g: G, glow: true, line: 0.03, size: 0.05, life: rnd(0.4, 1.2), c: [1, 0.5, 0.25, 2.2] });
      }
      bullets.splice(i, 1);
    }
  }

  // Balle qui touche un char. Elle ne perce un blindage que s'il est mince (plaque arrière d'un char
  // léger, à courte portée et avec un noyau de tungstène) ; ailleurs elle cherche les points faibles :
  // chef à découvert, visière du pilote, viseur du tireur, épiscopes de la coupole.
  function mgHitTank(b, t, best, hx, hy) {
    const by = b.by, ux = b.vx / b.sp, uy = b.vy / b.sp, xm = b.dist * RK, Am = MG_AMMO[b.type];
    const V = mgVel(b.type, xm), pen = mgPen(b.type, xm), show = visibleToPlayer(t) || by === player;
    if (!t.dead && by.team !== t.team) t.underFire = 6;
    if (t.dead) { Fx.armorHit(hx, hy, best.z, 'mg', ux, uy); return 'stop'; }
    const c = Math.cos(t.angle), sn = Math.sin(t.angle), ll = 1;
    const ldx = ux * c + uy * sn, ldy = -ux * sn + uy * c;
    const d = tiltIn(t, norm3([ldx / ll, -ldy / ll, b.slope]));
    const lx = (hx - t.x) * c + (hy - t.y) * sn, ly = -(hx - t.x) * sn + (hy - t.y) * c;
    const E = [lx / PX, -ly / PX, best.z], S = t.T.S, tAng = -t.turret;
    let kind = null, lines = [], mod = null, outcome = 'nopen', eff = 0, mm = 0, plate = '';
    if (best.h && best.h.part === 'barrel') { Fx.armorHit(hx, hy, best.z, 'mg', ux, uy); return 'stop'; }
    if (best.crewOut) {
      const m = t.mods.find(q => q.out && q.hp > 0);
      if (m) {
        modDamage(t, m, rnd(60, 130), by);
        if (t === player) addLog(`${m.name} ${m.hp <= 0 ? 'killed' : 'wounded'} while repairing the track`, '#ff6a5a');
        if (show) floatText(hx, hy - 10, m.hp <= 0 ? 'Crewman killed' : 'Crewman wounded', '#ffb070');
        checkKnock(t, by);
      }
      return 'stop';
    }
    if (best.exposed) {
      // le chef de char est touché à la tête ou au buste
      const m = t.mods[t.roles.commander], dmg = rnd(60, 130);
      modDamage(t, m, dmg, by); t.hatch = false; mod = m.i; kind = 'cmd'; outcome = 'pen';
      lines.push({ t: m.hp <= 0 ? 'Exposed commander killed' : 'Commander wounded: he ducks into the turret', c: '#ff8a6a' });
      if (by === player && m.hp <= 0 && t.team !== by.team) { medal('headhunter'); if (Meta.track('cmd')) missionToast(); }
      if (show) floatText(hx, hy - 10, m.hp <= 0 ? 'Commander killed' : 'Commander wounded', '#ffb070');
      if (t === player) addLog(m.hp <= 0 ? 'Your commander was killed while exposed' : 'Your commander is wounded', '#ff6a5a');
      Fx.armorHit(hx, hy, best.z, 'mg', ux, uy);
      checkKnock(t, by);
    } else {
      const h = best.h, pp = platePick(t, h, d, 'MG', 7.92);
      const cosI = Math.max(0.03, -dot3(pp.dd, pp.n)), angle = Math.acos(Math.min(1, cosI)) / D2R;
      const scf = scarFrame(t, h, E), scw = scarWeak(t, scf.frame, scf.p, pp.plate);
      mm = Math.round((scw.hole ? pp.mm * 0.1 : pp.mm * (1 - scw.w)) * t.up.armor); plate = pp.plate; eff = mm / cosI + pp.extra;
      if (mm < pp.mm) lines.push({ t: `Plate already damaged: ${mm} mm effective instead of ${pp.mm} mm`, c: '#ffcf7a' });
      // points faibles, dans le repère du modèle
      const tq = h.part === 'turret' ? rotZ([E[0] - t.T.I.pivotX, E[1] - t.T.I.pivotY, E[2]], -tAng) : null;
      const drv = t.mods[t.roles.driver];
      if (h.part === 'hull' && pp.face === 'front' && !pp.low && Math.abs(E[1] - drv.c[1]) < 0.16 && E[2] > S.ht - 0.4 && t.optic.driver <= 0) kind = 'driver';
      else if (tq && pp.face === 'front' && Math.abs(tq[1] - 0.3) < 0.1 && Math.abs(tq[2] - S.gun.z - 0.1) < 0.12 && t.optic.gunner <= 0) kind = 'gunner';
      else if (tq && S.turret && Math.hypot(tq[0] - S.turret.cupola[0], tq[1] - S.turret.cupola[1]) < S.turret.cupola[2] + 0.06 && tq[2] > t.T.I.totalH - S.turret.cupola[3] && t.optic.cmd <= 0 && Math.random() < 0.5) kind = 'cmdo';
      if (kind && kind !== 'cmd') {
        const key = kind === 'cmdo' ? 'cmd' : kind;
        t.optic[key] = 15;
        lines.push({ t: `${OPTIC_NAMES[key]} shattered: ${key === 'driver' ? 'the driver is driving blind (−30% speed)' : key === 'gunner' ? 'backup sight, dispersion × 2.5' : 'reduced vision when buttoned up'}`, c: '#ffcf7a' });
        if (show) floatText(hx, hy - 10, `${OPTIC_NAMES[key]} shattered`, '#ffcf7a');
        if (t === player) addLog(`${OPTIC_NAMES[key]} shattered by a bullet: replacing (15 s)`, '#ffb070');
        Fx.armorHit(hx, hy, best.z, 'mg', ux, uy);
        // éclats de verre
        for (let i = 0; i < 6; i++) P3({ x: hx, y: hy, z: best.z, vx: -ux * rnd(1, 4) + rnd(-2, 2), vy: -uy * rnd(1, 4) + rnd(-2, 2), vz: rnd(0.5, 3), g: G, glow: true, size: 0.025, life: rnd(0.3, 0.7), c: [0.75, 0.9, 1, 1.4] });
      } else if (angle < 70 && pen > eff) {
        // la balle traverse la tôle : premier module rencontré sur sa trajectoire dans le char
        outcome = 'pen'; kind = 'pen';
        addScar(t, h, E, d, plate, 'mgpen', 8, 1);
        let tb = 1e9;
        for (const m of t.mods) {
          if (m.hp <= 0) continue;
          const o = m.frame === 'turret' ? rotZ([E[0] - t.T.I.pivotX, E[1] - t.T.I.pivotY, E[2]], -tAng) : E, dl = m.frame === 'turret' ? rotZ(d, -tAng) : d;
          const tt = slab(o, dl, m.min, m.max);
          if (tt >= 0 && tt < 3 && tt < tb) { tb = tt; mod = m.i; }
        }
        lines.push({ t: `PENETRATED: ${Math.round(pen)} mm vs ${Math.round(eff)} mm`, c: '#a6f08a' });
        if (mod != null) {
          const m = t.mods[mod];
          modDamage(t, m, m.kind === 'crew' ? rnd(35, 80) : rnd(4, 10), by);
          lines.push({ t: `${m.name} hit${m.kind === 'crew' ? (m.hp <= 0 ? ': killed' : ': wounded') : ''}`, c: '#ff8a6a' });
          // balle dans un réservoir : l'essence s'allume parfois ; dans une soute, une douille fendue
          if (m.kind === 'fuel' && Math.random() < (b.type === 'SmKH' ? 0.07 : 0.04)) { startFire(t, 'fuel', m, by, 0.2); lines.push({ t: 'Fuel ignited', c: '#ff9a3a' }); }
          if (m.kind === 'ammo') { const k = SHELL_KEYS.find(q => m.rounds[q] > 0); if (k) { m.rounds[k]--; t.ammo[k]--; lines.push({ t: 'One round ruined', c: '#ffb070' }); } }
          checkKnock(t, by);
        } else lines.push({ t: 'The bullet passes through without hitting anything', c: '#c8c8c8' });
        if (show) floatText(hx, hy - 10, 'Armor-piercing bullet!', '#ffe27a');
        if (t === player) addLog(`Bullet penetration: ${plate.toLowerCase()} (${mm} mm)`, '#ff8a6a');
        Fx.armorHit(hx, hy, best.z, 'mg', ux, uy);
      } else {
        Fx.armorHit(hx, hy, best.z, 'mg', ux, uy);
        if (Math.random() < 0.25) Sfx.ping(listenerDist(hx, hy));
        addScar(t, h, E, d, plate, 'mg', 8, 0);
        return 'stop';
      }
    }
    Sfx.ping(listenerDist(hx, hy));
    // caméra d'impact aux rayons X pour les balles du joueur qui font quelque chose
    if (by === player && hitcamOn && Meta.P.opts.hitcam === 'all' && R3 && !HitCam.active() && gameTime - (mgCamT || -99) > 5) {
      mgCamT = gameTime;
      const f = (v, k = 0) => v.toFixed(k);
      const ev = {
        typeId: t.T.id, turretAng: tAng, dir: d, entry: E, n: [-d[0], -d[1], -d[2]], cosI: 1, V, cal: b.type === 'CAN' ? 18 : 7.92,
        shellKey: 'MG', shellLen: 4.2, spin: V / (0.24 * 1), target: `${t.T.name} ${t.team === 0 ? '(ally)' : '(enemy)'} · ${Math.round(xm)} m`,
        friendly: t.team === by.team, mods: t.mods.map(m => ({ kind: m.kind, frame: m.frame, c: m.c, s: m.s })),
        before: t.mods.map(m => m.hp / m.max0), after: t.mods.map(m => Math.max(0, m.hp) / m.max0), touch: [], sim: null, sparks: [], chunks: [],
        results: lines.map(l => ({ t: l.t, c: l.c, time: 0 })), data: [], detT: null, ricDir: null, outcome, metal: null, scars: scarsForXray(t),
      };
      for (let k = 0; k < 10; k++) ev.sparks.push({ d: norm3([-d[0] + gauss() * 0.7, -d[1] + gauss() * 0.7, -d[2] + gauss() * 0.7 + 0.2]), v: rnd(100, 400), life: rnd(0.8e-3, 2e-3) });
      // aux rayons X, le chef à découvert est montré debout dans sa coupole
      if (best.exposed) { const em = ev.mods[mod]; em.c = [best.exposed.m[0], best.exposed.m[1], best.exposed.z0 - 0.12]; }
      if (mod != null) {
        const m = ev.mods[mod], mc = m.frame === 'turret' ? (() => { const q = rotZ(m.c, tAng); return [q[0] + t.T.I.pivotX, q[1] + t.T.I.pivotY, q[2]]; })() : m.c;
        const tHit = 0.25e-3 + Math.hypot(mc[0] - E[0], mc[1] - E[1], mc[2] - E[2]) / V;
        ev.touch[mod] = tHit;
        ev.sim = { tEnd: tHit + 1.2e-3, core: [{ t: 0, p: E, v: V }, { t: tHit, p: mc, v: V * 0.6 }], coreStop: true, frags: [], exit: null, blast: null, jet: null, fuel: null };
      } else if (outcome === 'nopen') for (let k = 0; k < 7; k++) ev.chunks.push({ d: norm3([-d[0] * 0.3 + gauss() * 0.6, -d[1] * 0.3 + gauss() * 0.6, gauss() * 0.4 + 0.3]), v: rnd(60, 250), r: 0.004 });
      ev.data.push({ t: b.type === 'CAN' ? `18 mm steel ball (Kartätsche) · ${f(Am.m, 0)} g · muzzle ${Am.v0} m/s` : `7.92 mm bullet ${Am.full} · ${f(Am.m, 1)} g · muzzle ${Am.v0} m/s`, c: '#e9d9a6' });
      ev.data.push({ t: `Impact velocity ${Math.round(V)} m/s · energy ${f(0.5 * Am.m / 1000 * V * V / 1000, 2)} kJ · penetration ${f(pen, 1)} mm at ${Math.round(xm)} m`, c: '#d8d4c6' });
      if (best.exposed) ev.data.push({ t: 'Target: commander standing in the cupola, head and torso above the armor', c: '#d8d4c6' });
      else if (kind === 'pen') ev.data.push({ t: `${plate}: ${mm} mm · ${Math.round(eff)} mm effective`, c: '#d8d4c6' });
      else ev.data.push({ t: `${plate}: ${mm} mm, but the bullet strikes a weak spot (optics)`, c: '#d8d4c6' });
      startHitCam(ev, false);
    }
    return 'stop';
  }

  // Obus fumigène : la charge éjecte et allume la composition fumigène, rideau en quelques secondes
  function smokeShell(s, x, y) {
    const k = s.by.T.caliber / 75;
    smokes.push({ x, y, r: 12, maxR: 85 * Math.sqrt(k) + 25, life: 22 });
    for (let i = 0; i < 14; i++) P3({ x, y, z: 0.4, vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(1, 5), drag: 1.6, g: -0.2, wind: 1, size: rnd(0.5, 1), grow: 1.8, life: rnd(4, 7), c: [0.85, 0.85, 0.83, 0.55] });
    parts.push({ k: 'flash', x, y, life: 0.08, max: 0.08, size: 14, z: 0.4 });
    Sfx.smoke(listenerDist(x, y));
    return 'stop';
  }
  function deploySmoke(t, ang = t.angle) {
    if (t.smoke <= 0) return;
    t.smoke--;
    const c = Math.cos(ang), s = Math.sin(ang);
    smokes.push({ x: t.x + c * 30, y: t.y + s * 30, r: 20, maxR: 110, life: 13 });
    Sfx.smoke(listenerDist(t.x, t.y));
  }

  // ===================== Obus =====================
  function updateShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      const dx = s.vx * dt, dy = s.vy * dt;
      let best = null;
      const minx = Math.min(s.x, s.x + dx) - 30, maxx = Math.max(s.x, s.x + dx) + 30;
      const miny = Math.min(s.y, s.y + dy) - 30, maxy = Math.max(s.y, s.y + dy) + 30;
      for (const o of obstacles) {
        if (o.dead || o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny) continue;
        if (o === s.skipObs) continue;
        const h = segAABB(s.x, s.y, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
        if (h && (!best || h.t < best.t)) best = { t: h.t, o, nx: h.nx, ny: h.ny };
      }
      // hauteur en fin de pas : l'obus suit sa trajectoire balistique (pente en m par mètre balistique) ;
      // la pesanteur courbe la trajectoire de g / v² par mètre (v réelle à mi-pas, ralentie par la traînée
      // et les ricochets)
      const dX = s.sp * dt * RK, kd = Ballistics.kDrag(s.sb, s.V) * dX * Math.hypot(1, s.slope);
      const vr = s.V * Math.exp(-0.5 * kd) / Math.hypot(1, s.slope), gk = G / (vr * vr);
      const zNext = s.z + s.slope * dX - 0.5 * gk * dX * dX;
      if (best && s.z + (zNext - s.z) * best.t > obsTop(best.o)) best = null; // passe au-dessus
      if (!best) {
        // un obstacle plus loin sur le pas peut encore être touché s'il est assez haut
        for (const o of obstacles) {
          if (o.dead || o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny || o === s.skipObs) continue;
          const h = segAABB(s.x, s.y, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
          if (h && s.z + (zNext - s.z) * h.t <= obsTop(o) && (!best || h.t < best.t)) best = { t: h.t, o, nx: h.nx, ny: h.ny };
        }
      }
      for (const t of tanks) {
        if (t === s.owner || t.x > maxx + 30 || t.x < minx - 30 || t.y > maxy + 30 || t.y < miny - 30) continue;
        const cand = tankCand(t, s.x, s.y, dx, dy, s.z, zNext);
        if (cand && (!best || cand.t < best.t)) best = cand;
      }
      const sc = OBJ.shellCand(s, dx, dy, zNext);
      if (sc && (!best || sc.t < best.t)) best = sc;
      // maison traversée : le mur opposé, là où l'obus le franchit sur ce pas (avant un char collé derrière)
      const ew = s.exitWall;
      if (ew && ew.o === s.skipObs && !ew.o.dead) {
        const o = ew.o, h = segAABB(s.x, s.y, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
        if (h && h.t1 < 1 && s.z + (zNext - s.z) * h.t1 <= obsTop(o) && (!best || h.t1 < best.t)) best = { t: h.t1, exit: true };
      }
      // relief ou surface de l'eau sur le pas
      const tg = terra.cut(s.x, s.y, s.z, s.x + dx, s.y + dy, zNext);
      if (tg >= 0 && (!best || tg < best.t)) best = { t: tg, ground: true };
      // fusée de culot armée par un obstacle traversé : l'APHE éclate au bout du délai, là où il est
      if (s.fuzeAt) {
        const tf = Math.max(0, (s.fuzeAt - s.dist * RK) / dX);
        if (tf <= 1 && (!best || tf < best.t)) best = { t: tf, burst: true };
      }
      if (player && !player.dead && s.by !== player && !s.whiz) {
        const rx = player.x - s.x, ry = player.y - s.y, l2 = dx * dx + dy * dy || 1;
        const k = clamp((rx * dx + ry * dy) / l2, 0, 1);
        if (Math.hypot(s.x + dx * k - player.x, s.y + dy * k - player.y) < 75) {
          s.whiz = true; Sfx.whiz(listenerDist(s.x + dx * k, s.y + dy * k), s.V > 343);
          // obus allié passé tout près : le joueur le signale à la radio
          if (s.by.team === player.team && gameTime - ffMsgT > 5) { ffMsgT = gameTime; addLog(`You: check fire, ${s.by.name}!`, '#ffcf7a'); }
        }
      }
      s.trail.push(s.x, s.y, s.z);
      if (s.trail.length > 24) s.trail.splice(0, 3);
      let remove = false;
      if (best) {
        const hx = s.x + dx * best.t, hy = s.y + dy * best.t;
        if (!best.burst && !best.exit) aiObserve(s, hx, hy, best.tank);
        s.dist += s.sp * dt * best.t;
        s.x = hx; s.y = hy; s.z = Math.max(hAt(hx, hy), s.z + (zNext - s.z) * best.t);
        const res = best.burst ? apheBurst(s) : best.exit ? exitWall(s, hx, hy) : best.ground ? hitGround(s, hx, hy) : best.soft ? OBJ.shellHit(s, best.soft, hx, hy) : best.tank ? hitTank(s, best.tank, best, hx, hy) : hitObstacle(s, best.o, best, hx, hy);
        if (res === 'stop') remove = true;
      } else {
        s.x += dx; s.y += dy;
        s.dist += s.sp * dt;
        // dérive due au vent de travers, règle du retard de Didion : y = Wc · (t − X / v0) ; sur ce pas,
        // Wc · (1 − v / v0) pendant la durée balistique dX / v (m, convertis à l'échelle des chars)
        const ux = s.vx / s.sp, uy = s.vy / s.sp, wc = -uy * WIND.x + ux * WIND.y;
        const lat = wc * Math.max(0, 1 - vr / s.v0) * dX / vr * PX;
        s.x -= uy * lat; s.y += ux * lat;
        // la traînée freine l'obus le long du chemin parcouru : vitesse affichée proportionnelle à la vitesse réelle
        s.V *= Math.exp(-kd);
        s.z = zNext; s.slope -= gk * dX;
        shellAim(s, s.vx / s.sp, s.vy / s.sp);
        // obstacle traversé derrière lui (une maison quittée par le toit n'a plus de mur à percer)
        const so = s.skipObs;
        if (so && !(s.x >= so.x - 1 && s.x <= so.x + so.w + 1 && s.y >= so.y - 1 && s.y <= so.y + so.h + 1)) { s.skipObs = null; s.exitWall = null; }
      }
      // l'obus vole jusqu'au sol (traité plus haut), hors de la carte ou très haut après un ricochet ;
      // un compteur de sécurité borne son trajet
      if (!remove && (s.z > 70 || s.dist > 8000 || s.x < -50 || s.y < -50 || s.x > WW + 50 || s.y > WH + 50)) remove = true;
      if (remove) {
        if (s.tgt && !s.obs && s.by.ai && s.tgt === s.by.ai.target) { s.obs = true; s.by.ai.rngK = Math.max(0.7, s.by.ai.rngK * 0.95); } // passé au-dessus : on raccourcit
        if (player && !player.dead && s.by !== player && s.warned && !s.hitPlayer) waveStats.dodged++;
        shells.splice(i, 1);
      }
    }
  }

  // Vitesse horizontale à l'écran (px/s) tirée de la vitesse réelle et de la pente, dans la direction (ux, uy)
  function shellAim(s, ux, uy) {
    s.sp = s.V / Math.hypot(1, s.slope) * s.pxk; s.vx = ux * s.sp; s.vy = uy * s.sp;
  }

  // Impact du segment (x, y, z0) → (x + dx, y + dy, z1) sur un char : face de caisse ou de tourelle à la
  // hauteur où l'obus y entre, ou toit qu'il crève en descendant. Rien s'il passe à côté ou au-dessus.
  function tankCand(t, x, y, dx, dy, z0, z1 = z0) {
    z0 -= t.gz; z1 -= t.gz; // hauteurs absolues ramenées à l'appui du char
    const c = Math.cos(t.angle), sn = Math.sin(t.angle);
    const lx = (x - t.x) * c + (y - t.y) * sn, ly = -(x - t.x) * sn + (y - t.y) * c;
    const ldx = dx * c + dy * sn, ldy = -dx * sn + dy * c;
    const hl = t.T.len / 2, hw = t.T.wid / 2;
    const hh = segAABB(lx, ly, ldx, ldy, -hl, -hw, hl, hw);
    const zAt = k => z0 + (z1 - z0) * k;
    let cand = null;
    // tube du canon : l'obus croise son axe (vu de dessus) entre le masque et la bouche, à sa hauteur
    const gn = t.T.S.gun;
    if (gn && !t.turretGone) {
      const ux = Math.cos(t.turret), uy = Math.sin(t.turret), ax = lx - t.T.pivX, ay = ly - t.T.pivY;
      const d0 = ax * uy - ay * ux, dd = ldx * uy - ldy * ux, k = Math.abs(dd) > 1e-9 ? -d0 / dd : -1;
      if (k >= 0 && k <= 1) {
        const al = ((ax + ldx * k) * ux + (ay + ldy * k) * uy) / PX, gz = gn.z + Math.tan(t.elev) * al;
        if (al > gn.fx && al < gn.fx + gn.len && Math.abs(zAt(k) - gz) < gn.r * 1.3 + 0.04) cand = { t: k, part: 'barrel', nx: -uy, ny: ux, z: zAt(k), along: al };
      }
    }
    // une épave arrête ce qui la touche à sa hauteur, pas ce qui passe au-dessus
    if (hh) {
      const Sd = t.T.S, ze = zAt(hh.t), zx = zAt(hh.t1);
      const hc = ze <= Sd.ht ? { t: hh.t, part: 'hull', nx: hh.nx, ny: hh.ny, z: Math.max(0.15, ze) }
        : zx < Sd.ht ? { t: hh.t + (hh.t1 - hh.t) * (ze - Sd.ht) / (ze - zx), part: 'hull', roof: true, nx: 0, ny: 0, z: Sd.ht } : null;
      if (hc && (!cand || hc.t < cand.t)) cand = hc;
      if (t.T.tb && !t.turretGone && ze > Sd.ht) {
        const tc = Math.cos(t.turret), ts = Math.sin(t.turret);
        const qx = lx - t.T.pivX, qy = ly - t.T.pivY;
        const tx = qx * tc + qy * ts, ty = -qx * ts + qy * tc, tdx = ldx * tc + ldy * ts, tdy = -ldx * ts + ldy * tc;
        const B = t.T.tb, th = segAABB(tx, ty, tdx, tdy, B.x0, B.y0, B.x1, B.y1), H = t.T.I.totalH;
        let tc2 = null;
        if (th) {
          const zt = zAt(th.t), zo = zAt(th.t1);
          if (zt > Sd.ht && zt <= H) tc2 = { t: th.t, part: 'turret', nx: th.nx, ny: th.ny, z: zt };
          else if (zt > H && zo < H) tc2 = { t: th.t + (th.t1 - th.t) * (zt - H) / (zt - zo), part: 'turret', roof: true, nx: 0, ny: 0, z: H };
        }
        if (tc2 && (!cand || tc2.t < cand.t)) cand = Object.assign(tc2, { tx: tx + tdx * tc2.t, ty: ty + tdy * tc2.t });
      }
    }
    if (cand) Object.assign(cand, { tank: t, c, sn, lx: lx + ldx * cand.t, ly: ly + ldy * cand.t, ldx, ldy });
    return cand;
  }

  // Obus qui touche le sol. Sous un angle de chute rasant (angle réel), un obus perforant rebondit
  // (« ricochet de sol », bien connu des artilleurs) : souvent sur un sol sec et dur, deux fois moins
  // dans la boue ou la neige, encore moins dans le sable ; il repart plus haut, ralenti et en tumbling.
  // Sinon il s'enfonce en soulevant une gerbe de terre.
  // L'angle de chute se compte par rapport au sol : la pente du relief le long du tir s'y ajoute. Dans
  // l'eau, l'obus ricoche aussi en rasant (sinon l'eau l'arrête : la caisse immergée est à l'abri).
  function hitGround(s, x, y, forced) {
    if (s.key === 'SMOKE') { stampCrater(x, y, 4); return smokeShell(s, x, y); }
    const ux = s.vx / s.sp, uy = s.vy / s.sp, wet = terra.depth(x, y) > 0.15;
    const gs = (hAt(x + ux * 7, y + uy * 7) - hAt(x - ux * 7, y - uy * 7)) / (14 * RK), fall = Math.atan(gs - s.slope) / D2R;
    const pRic = clamp(1 - fall / 8, 0, 0.85) * (wet ? 1 : L().gRic || 1);
    if (!forced && !s.sb.he && !s.sb.heat && s.ric < 3 && Math.random() < pRic) {
      s.slope = gs + (gs - s.slope) * rnd(1.2, 2.5) + rnd(0, 0.01); s.z = hAt(x, y) + 0.05; s.ric++; s.yaw = true;
      s.V *= 0.6; shellAim(s, ux, uy);
      if (wet) Fx.splash(x, y, 0.5); else { Fx.groundHit(x, y, ux, uy, 0.4, true); stampCrater(x, y, 4); }
      Sfx.ricochet(listenerDist(x, y));
      return 'continue';
    }
    const k = Math.sqrt(s.by.T.caliber / 75);
    if (wet) { Fx.splash(x, y, k * (s.sb.he ? 1.6 : 1)); if (s.key === 'HE' || s.key === 'HEAT') blastNear(x, y, s, null); Sfx.impact(listenerDist(x, y)); }
    else if (s.key === 'HE') explode(x, y, s, null);
    else if (s.key === 'HEAT') { Fx.blast(x, y, 0.2, 0.45); stampCrater(x, y, 9); Sfx.explosion(listenerDist(x, y), false); blastNear(x, y, s, null); }
    else { Fx.groundHit(x, y, ux, uy, k, false); stampCrater(x, y, 7); Sfx.impact(listenerDist(x, y)); }
    return 'stop';
  }

  // le joueur ne voit sur le champ de bataille que ce que son char connaît (radio comprise) ; mort, il suit
  // ce que voit son équipe
  function visibleToPlayer(t) { return t.team === 0 || t.dead || (player && !player.dead && player.knows ? player.knows : spotted[0]).has(t); }

  // ===================== Simulation du métal (metal.js) =====================
  // Calage : vitesse limite propre à la simulation, Vlim = A · (T/d)^b / cos(θ)^c (mesurée par dichotomie),
  // pour que la simulation tranche comme la balistique empirique (même rapport V / Vlim).
  const PD_FIT = { APHE: [844.4, 1.231, 0.942], APCR: [734.8, 1.251, 0.971] };
  const HE_P0 = [[0.01, 22.7e9], [0.02, 27.4e9], [0.04, 49.7e9]];
  function heP0lim(T) {
    const a = T <= HE_P0[1][0] ? 0 : 1, p0 = HE_P0[a], p1 = HE_P0[a + 1];
    const b = Math.log(p1[1] / p0[1]) / Math.log(p1[0] / p0[0]);
    return p0[1] * Math.pow(T / p0[0], b);
  }
  function pdConfig(sb, mmT, angDeg, pen, eff, perforate) {
    const d = sb.cal / 1000, T = mmT / 1000, th = Math.min(72, angDeg) * D2R, r = pen / eff;
    const marg = k => perforate ? Math.max(k, 1.2) : Math.min(k, 0.83);
    const cfg = { d, T, theta: th, kind: sb.key };
    if (sb.heat) cfg.jetLen = 0.554 * (T / Math.cos(th)) * marg(r);
    else if (sb.he) cfg.P0 = heP0lim(T) * Math.pow(marg(r), 2);
    else {
      const f = PD_FIT[sb.key === 'APCR' ? 'APCR' : 'APHE'];
      cfg.V = Math.min(3800, f[0] * Math.pow(T / d, f[1]) / Math.pow(Math.cos(th), f[2]) * marg(Math.pow(r, 0.7)));
    }
    return cfg;
  }
  function metalFor(sb, mm, angle, pen, eff, perforate) {
    if (typeof MetalSim === 'undefined') return null;
    try { const m = MetalSim.create(pdConfig(sb, mm, angle, pen, eff, perforate)); m.info = { mm, angle: Math.round(angle), sb, perforate }; return m; }
    catch (e) { console.warn('Metal simulation unavailable', e); return null; }
  }

  // Normale extérieure d'une plaque (repère de la caisse ou de la tourelle)
  function plateNormal(face, slopeDeg, sideSign, low) {
    if (face === 'roof') return [0, 0, 1];
    const s = slopeDeg * D2R, c = Math.cos(s), n = Math.sin(s);
    if (face === 'front') return [c, 0, low ? -n : n];
    if (face === 'rear') return [-c, 0, n];
    return [0, sideSign * c, n];
  }

  // ===================== Blindage marqué par les impacts =====================
  // Chaque coup laisse une trace qui reste sur le char et affaiblit la plaque autour du point d'impact :
  // - obus arrêté : cratère et zone écrouie, fissurée s'il a failli percer (rapport pén./blindage > 0,8) ;
  //   l'acier perd jusqu'à 45 % de sa résistance sur environ 1,5 calibre, plus loin s'il est fissuré ;
  // - perforation : trou du calibre, pétales et fissures autour ; un coup dans le trou ne rencontre
  //   presque plus rien ;
  // - explosif : suie, piqûres, et sur une tôle mince, soudures et plaque fissurées ;
  // - balles : écaillage de la peinture et de la surface, presque rien sur l'acier, mais ça s'accumule.
  // La perte locale se somme (gaussienne de rayon rz), plafonnée à 80 %.
  function scarFrame(t, h, E) {
    if (h.part !== 'turret') return { frame: 'hull', p: E };
    return { frame: 'turret', p: rotZ([E[0] - t.T.I.pivotX, E[1] - t.T.I.pivotY, E[2]], t.turret) };
  }
  function scarWeak(t, frame, p, plate) {
    let w = 0, hole = null, near = 1e9;
    for (const sc of t.scars) {
      if (sc.frame !== frame || sc.plate !== plate) continue;
      const d = Math.hypot(p[0] - sc.p[0], p[1] - sc.p[1], p[2] - sc.p[2]);
      if (sc.hole && d < sc.hole) hole = sc;
      const k = sc.w * Math.exp(-Math.pow(d / sc.rz, 2));
      if (k > 0.01) near = Math.min(near, d);
      w += k;
    }
    return { w: Math.min(0.8, w), hole, near };
  }
  // Rayon contre les triangles du modèle (Möller-Trumbore) : point et normale de la vraie surface
  function rayMesh(v, o, d) {
    let best = 1e9, n = null;
    for (let i = 0; i < v.length; i += 30) {
      const ax = v[i], ay = v[i + 1], az = v[i + 2];
      const e1x = v[i + 10] - ax, e1y = v[i + 11] - ay, e1z = v[i + 12] - az, e2x = v[i + 20] - ax, e2y = v[i + 21] - ay, e2z = v[i + 22] - az;
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt > 0 && tt < best) { best = tt; n = norm3([e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x]); }
    }
    if (!n) return null;
    if (dot3(n, d) > 0) n = [-n[0], -n[1], -n[2]];
    return { p: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best], n };
  }
  // kind : dent, crack, ric, pen, heat, heatpen, he, hepen, mg, mgpen
  function addScar(t, h, E, d, plate, kind, cal, q) {
    const { frame, p } = scarFrame(t, h, E), c = cal / 1000;
    const dl = frame === 'turret' ? rotZ(d, t.turret) : d;
    let sp = p, n = [-dl[0], -dl[1], -dl[2]];
    const tri = RAYTRI[t.T.id] && RAYTRI[t.T.id][frame];
    if (tri) { const r = rayMesh(tri, [p[0] - dl[0] * 3, p[1] - dl[1] * 3, p[2] - dl[2] * 3], dl); if (r) { sp = r.p; n = r.n; } }
    const sc = { frame, plate, p, sp, n, kind, dl, r: c * 0.6, rz: c * 1.5, w: 0, hole: 0, seed: Math.random() * 1000 };
    if (kind === 'dent') { sc.w = 0.45 * q * q; if (q > 0.8) { sc.kind = 'crack'; sc.rz = c * 2.5; sc.w += 0.15; } sc.r = c * (0.45 + 0.4 * q); }
    else if (kind === 'ric') { sc.w = 0.1 * q; sc.rz = c * 1.2; sc.r = c * 0.5; }
    else if (kind === 'pen') { sc.hole = c * 0.53; sc.w = 0.35; sc.rz = c * 2; sc.r = c * 0.53; }
    else if (kind === 'heatpen') { sc.hole = c * 0.18; sc.w = 0.12; sc.rz = c; sc.r = 0.17; }
    else if (kind === 'heat') { sc.w = 0.2; sc.rz = c; sc.r = 0.15; }
    else if (kind === 'he' || kind === 'hepen') { sc.w = q; sc.rz = 0.4; sc.r = 0.14 + 0.12 * Math.min(1, cal / 88); if (kind === 'hepen') sc.hole = 0.12; }
    else if (kind === 'mg') { sc.w = 0.015; sc.rz = 0.03; sc.r = 0.012; }
    else if (kind === 'mgpen') { sc.hole = 0.005; sc.w = 0.05; sc.rz = 0.02; sc.r = 0.006; }
    t.scars.push(sc);
    // on garde les plus importantes : les traces de balles partent en premier
    if (t.scars.length > 140) { const i = t.scars.findIndex(x => x.kind === 'mg'); t.scars.splice(i >= 0 ? i : 0, 1); }
    t.scarDirty = true;
    return sc;
  }
  // Maillage des traces, collées à la surface (léger décalage le long de la normale)
  function scarMesh(t, frame) {
    const g = new G3.Builder();
    const disc = (sc, rad, col, mat, off, sx = 1, jit = 0.15, k = 12) => {
      const n = sc.n, up = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      let u = norm3([n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]]);
      if (sc.kind === 'ric') { const dd = sc.dl, pr = dot3(dd, n), tg = norm3([dd[0] - n[0] * pr, dd[1] - n[1] * pr, dd[2] - n[2] * pr]); if (Math.hypot(...tg) > 0.1) u = tg; }
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const R = mulberry32(Math.floor(sc.seed * 97 + rad * 1000)), c = [sc.sp[0] + n[0] * off, sc.sp[1] + n[1] * off, sc.sp[2] + n[2] * off];
      const pts = [];
      for (let i = 0; i < k; i++) {
        const a = i / k * TAU, rr = rad * (1 - jit + 2 * jit * R());
        pts.push([c[0] + (u[0] * Math.cos(a) * sx + v[0] * Math.sin(a)) * rr, c[1] + (u[1] * Math.cos(a) * sx + v[1] * Math.sin(a)) * rr, c[2] + (u[2] * Math.cos(a) * sx + v[2] * Math.sin(a)) * rr]);
      }
      for (let i = 0; i < k; i++) g.triN(c, pts[i], pts[(i + 1) % k], n, n, n, col, mat);
    };
    const PRIMER = '#7a4430', STEEL = '#a8a7a0', SOOT = '#2e2a25', DARKS = '#4c4b46', HOLE = '#040404';
    for (const sc of t.scars) {
      if (sc.frame !== frame) continue;
      const r = sc.r;
      switch (sc.kind) {
        case 'dent': case 'crack':
          disc(sc, r * 1.9, PRIMER, 7, 0.006, 1, 0.35); disc(sc, r, STEEL, 3, 0.009); disc(sc, r * 0.5, DARKS, 3, 0.012);
          if (sc.kind === 'crack') for (let k = 0; k < 4; k++) disc(Object.assign({}, sc, { seed: sc.seed + k }), r * 2.6, SOOT, 7, 0.0075, 0.08, 0.05, 4);
          break;
        case 'ric': disc(sc, r * 3.6, PRIMER, 7, 0.006, 2.2, 0.3); disc(sc, r * 2.6, STEEL, 3, 0.009, 2.8, 0.1); break;
        case 'pen': disc(sc, r * 3.2, SOOT, 7, 0.005, 1, 0.4); disc(sc, r * 2, PRIMER, 7, 0.007, 1, 0.35); disc(sc, r * 1.35, STEEL, 3, 0.009, 1, 0.3, 9); disc(sc, r, HOLE, 7, 0.012, 1, 0.12); break;
        case 'heatpen': disc(sc, r, SOOT, 7, 0.005, 1, 0.5, 14); disc(sc, sc.hole * 1.6, STEEL, 3, 0.009); disc(sc, sc.hole, HOLE, 7, 0.012); break;
        case 'heat': disc(sc, r, SOOT, 7, 0.005, 1, 0.5, 14); disc(sc, 0.04, STEEL, 3, 0.009); break;
        case 'he': case 'hepen':
          disc(sc, r, SOOT, 7, 0.005, 1, 0.55, 16); disc(sc, r * 0.45, '#2a2724', 7, 0.007, 1, 0.4);
          if (sc.hole) disc(sc, sc.hole, HOLE, 7, 0.012, 1, 0.3);
          break;
        case 'mg': disc(sc, r * 2.2, PRIMER, 7, 0.006, 1, 0.4, 7); disc(sc, r, '#c4c3bc', 3, 0.009, 1, 0.3, 7); break;
        case 'mgpen': disc(sc, r * 3, STEEL, 3, 0.008, 1, 0.3, 7); disc(sc, r, HOLE, 7, 0.011, 1, 0.2, 7); break;
      }
    }
    return g;
  }
  function updateScarMeshes(t, dt) {
    t.scarT -= dt;
    if (!t.scarDirty || t.scarT > 0 || !W3D) return;
    t.scarDirty = false; t.scarT = 0.25;
    if (t.scar3) { W3D.free(t.scar3.hull); W3D.free(t.scar3.turret); }
    t.scar3 = { hull: W3D.upload(scarMesh(t, 'hull'), false), turret: W3D.upload(scarMesh(t, 'turret'), false) };
  }
  // traces pour la vue aux rayons X (repère de la caisse)
  function scarsForXray(t) {
    return t.scars.filter(sc => sc.kind !== 'mg').map(sc => ({ kind: sc.kind, p: sc.frame === 'turret' ? (() => { const q = rotZ(sc.sp, -t.turret); return [q[0] + t.T.I.pivotX, q[1] + t.T.I.pivotY, q[2]]; })() : sc.sp }));
  }

  // Plaque touchée : épaisseur, inclinaison, normale extérieure et protections annexes
  // probe : visée seulement (lunette), épaisseurs moyennes au lieu d'un tirage
  function platePick(t, h, d, key, cal = 75, probe = false) {
    if (h.part === 'barrel') return { face: 'barrel', sideSign: 1, plate: 'Gun barrel', mm: 20, slope: 0, dd: d, low: false, extra: 0, extraOf: '', heatK: 1, gear: null, n: [-d[0], -d[1], -d[2]] };
    const Sd = t.T.S, A = Sd.armor, tAng = -t.turret, rr = (a, b) => Math.round(probe ? (a + b) / 2 : rnd(a, b));
    const face = h.roof ? 'roof' : h.nx > 0.5 ? 'front' : h.nx < -0.5 ? 'rear' : 'side';
    const sideSign = h.ny > 0 ? -1 : 1;
    let plate, mm, slope, dd = d, low = false, extra = 0, heatK = 1, gear = null, extraOf = '', nm = null;
    if (face === 'roof') {
      // toit de caisse ou de tourelle (même tôle de pont) : un obus qui plonge dessus après un ricochet
      if (h.part === 'turret') dd = rotZ(d, -tAng);
      mm = A.hull.roof; slope = 90; plate = h.part === 'turret' ? 'Turret roof' : 'Hull roof';
    } else if (h.part === 'hull') {
      if (face === 'front') {
        low = h.z < Sd.zn;
        [mm, slope] = low ? A.hull.low : A.hull.up;
        plate = low ? 'Lower front hull' : 'Upper front hull';
        // visière du pilote et rotule de la mitrailleuse de caisse : trouées de la plaque (0,7 × l'épaisseur)
        const ey = -h.ly / PX, dv = t.mods[t.seat.driver], rv = t.seat.radio != null ? t.mods[t.seat.radio] : null;
        if (!low && key !== 'MG' && Math.abs(h.z - (Sd.ht - 0.28)) < 0.08) {
          if (dv && Math.abs(ey - dv.c[1]) < 0.13) { mm = Math.round(mm * 0.7); plate = 'Driver’s visor'; }
          else if (rv && Math.abs(ey - rv.c[1]) < 0.13) { mm = Math.round(mm * 0.7); plate = 'Hull MG ball mount'; }
        }
      } else if (face === 'rear') { [mm, slope] = A.hull.rear; plate = 'Rear hull'; }
      else {
        // flanc : couches successives traversées par l'obus. D'abord la jupe (Schürzen) si l'impact tombe sur
        // un panneau ; puis, sous le brin supérieur de chenille, le train de roulement : chenille (brins haut
        // et bas), roues porteuses (entrelacées et pleines d'acier, ou petites et ajourées) ou barbotin et
        // réducteur à l'avant ; enfin la caisse, dont le bas de flanc derrière les roues est une autre plaque
        const mx = h.lx / PX, K = t.T.I.skirt, Wh = Sd.wheels, under = h.z < Sd.tt, layers = [];
        const inSkirt = !!K && h.z >= K.z0 && h.z <= K.z1 && mx >= K.x0 && mx <= K.x1 && !K.missing.some(m => m.side === sideSign && m.k === Math.floor((mx - K.x0) / K.pw));
        [mm, slope] = under ? A.hull.lowSide : A.hull.side;
        if (inSkirt) {
          layers.push('Skirt');
          // le jet de la charge creuse se forme sur la tôle et s'étire jusqu'à la caisse
          if (key === 'HEAT') heatK = Ballistics.standoffK(K.off + Sd.tw, cal); else extra += 5;
        }
        if (under) {
          if (mx > Wh.x0 + Wh.r * 0.8) { gear = 'sprocket'; extra += rr(20, 35); layers.push('Sprocket'); }
          else if (h.z >= Sd.tt - 0.12 || h.z < 0.25) { gear = 'track'; extra += rr(15, 25); layers.push('Track'); }
          else { gear = 'wheels'; extra += Wh.inter ? rr(20, 40) : rr(0, 15); layers.push('Road wheels'); }
          if (key === 'HEAT' && !inSkirt) heatK = 0.8; // jet perturbé par l'acier du train de roulement
        }
        plate = layers.length ? `${layers.join(' + ')} + ${under ? 'lower side' : 'side'}` : 'Side hull';
        if (layers.length) extraOf = layers.join(' and ').toLowerCase();
      }
    } else {
      dd = rotZ(d, -tAng);
      const ty = -h.ty / PX;
      if (face === 'front') {
        const M = Sd.turret.mantlet, mw = M.w || 0.3, mh = M.h || M.r;
        if (Math.abs(ty) < mw + 0.05 && Math.abs(h.z - Sd.gun.z) < mh + 0.05) {
          // normale tirée de la forme du masque, au point d'impact : plat (Tigre), cylindre d'axe horizontal
          // (Panther : sous l'axe du canon, la normale regarde vers le bas) aux bords arrondis, ou cloche
          // « Saukopf » (Tigre royal)
          const dz = h.z - Sd.gun.z;
          mm = A.turret.mantlet[0]; plate = 'Gun mantlet';
          if (M.type === 'cyl') {
            const ph = Math.asin(clamp(dz / M.r, -0.97, 0.97)), ex = clamp((Math.abs(ty) - 0.7 * mw) / (0.3 * mw), 0, 1) * 0.7;
            nm = norm3([Math.cos(ph) * Math.cos(ex), Math.sign(ty) * Math.sin(ex), Math.sin(ph) * Math.cos(ex)]);
          } else if (M.type === 'bell') nm = norm3([M.r, ty, dz]);
          else nm = [1, 0, 0];
          slope = Math.round(Math.acos(clamp(nm[0], -1, 1)) / D2R);
        } else { [mm, slope] = A.turret.front; plate = 'Front turret'; }
      } else if (face === 'rear') { [mm, slope] = A.turret.rear; plate = 'Rear turret'; }
      else { [mm, slope] = A.turret.side; plate = 'Side turret'; }
    }
    return { face, sideSign, plate, mm, slope, dd, low, extra, extraOf, heatK, gear, n: nm || plateNormal(face, slope, sideSign, low) };
  }

  // Cloison pare-feu entre moteur et compartiment de combat (environ 8 mm d'acier) : elle freine le noyau
  // et arrête la plupart des éclats (ballistics.js, kind 'wall')
  function fwMod(T) {
    if (T.fwMod !== undefined) return T.fwMod;
    const x = fwX(T), I = T.I.inner;
    return (T.fwMod = x < -90 ? null : { kind: 'wall', frame: 'hull', name: 'Firewall', hp: Infinity, max0: Infinity, c: [x, 0, (I.z0 + T.S.ht) / 2], s: [0.02, I.y1 - I.y0, T.S.ht - I.z0], min: [x - 0.01, I.y0, I.z0], max: [x + 0.01, I.y1, T.S.ht] });
  }
  // part d'une soute qui peut s'enflammer : rien si elle est vide ou détruite, moins si elle est entamée
  const ammoK = m => m.hp > 0 && rackN(m) > 0 ? 0.3 + 0.7 * rackN(m) / m.cap : 0;
  // arrêt du noyau dans la simulation terminale (codes de ballistics.js, sinon nom du module atteint)
  const CORE_STOP = { sorti: 'exits the far side', paroi: 'stopped by the far wall', shattered: 'shattered', Firewall: 'stopped by the firewall' };
  function hitTank(s, t, h, hx, hy) {
    if (t === player) s.hitPlayer = true;
    if (s.key === 'SMOKE') { Fx.armorHit(hx, hy, h.z, 'mg', s.vx / s.sp, s.vy / s.sp); Sfx.clang(listenerDist(hx, hy)); return smokeShell(s, hx, hy); }
    if (h.part === 'barrel' && !t.dead) return barrelStrike(s, t, h, hx, hy);
    if (t.dead) {
      Fx.armorHit(hx, hy, h.z || 1, 'non', s.vx / s.sp, s.vy / s.sp);
      if (s.key === 'HE') explode(hx, hy, s, null);
      Sfx.clang(listenerDist(hx, hy));
      return 'stop';
    }
    const by = s.by;
    // l'équipage touché sait à peu près d'où vient le coup (± 10°), pas qui tire ni de quelle distance
    if (t.ai && by && by.team !== t.team && !(t.ai.target && t.ai.los)) {
      const a = Math.atan2(-s.vy, -s.vx) + gauss() * 10 * D2R, d = dist(t, by) * rnd(0.7, 1.3);
      t.ai.lastKnown = { x: clamp(t.x + Math.cos(a) * d, 60, WW - 60), y: clamp(t.y + Math.sin(a) * d, 60, WH - 60) };
    }
    if (by === player && t.team !== by.team) { waveStats.hits++; t.pHits = (t.pHits || 0) + 1; }
    if (by.team !== t.team) t.underFire = 8;
    // Géométrie 3D de l'impact (repère du modèle : y vers la gauche), avec la vraie pente balistique de
    // la trajectoire (la vue 3D écrase les distances, pas les angles d'incidence)
    const ll = Math.hypot(h.ldx, h.ldy) || 1;
    const d = tiltIn(t, norm3([h.ldx / ll, -h.ldy / ll, s.slope]));
    return strike(s, t, h, hx, hy, d, [h.lx / PX, -h.ly / PX, h.z], null);
  }

  // Coup au tube : au-delà de 15 mm de perforation, il est faussé ou percé. Près de la bouche, le canon tire
  // encore mais disperse ; ailleurs il est hors d'usage le temps de le remettre en état (25 s à l'arrêt).
  function barrelStrike(s, t, h, hx, hy) {
    const sb = s.sb, by = s.by, pen = sb.he || sb.heat ? 99 : Ballistics.penVel(sb, s.V);
    if (by.team !== t.team) t.underFire = 8;
    if (by === player && t.team !== by.team) { waveStats.hits++; t.pHits = (t.pHits || 0) + 1; }
    Fx.armorHit(hx, hy, h.z, 'non', s.vx / s.sp, s.vy / s.sp); Sfx.clang(listenerDist(hx, hy));
    if (pen >= 15) {
      const muzzle = h.along > t.T.S.gun.fx + t.T.S.gun.len * 0.75, l = muzzle ? 'Gun barrel holed near the muzzle' : 'Gun barrel damaged';
      if (muzzle) t.bentT = Math.max(t.bentT || 0, 40); else t.gunT = 25;
      if (visibleToPlayer(t) || by === player) floatText(hx, hy - 12, l, '#ffcf7a');
      if (t === player) addLog(muzzle ? `${l}: dispersion × 3 (40 s)` : `${l}: the gun cannot fire (25 s of repairs, stopped)`, '#ff8a6a');
      else if (by === player) ribbon(l);
    }
    if (by === player && t.team !== by.team) hitMark(pen >= 15 ? 'crit' : 'nopen', pen >= 15 ? 'Critical: gun barrel hit' : null);
    if (sb.he) explode(hx, hy, s, null);
    return 'stop';
  }
  // Coup sur une plaque : d est la direction réelle de l'obus et E le point d'impact (repère de la caisse) ;
  // trap nomme la plaque qui vient de dévier l'obus sur celle-ci (piège à obus), sinon null
  function strike(s, t, h, hx, hy, d, E, trap) {
    const T = t.T, Sd = T.S, A = Sd.armor, by = s.by, sb = s.sb;
    const show = visibleToPlayer(t) || by === player, mine = by === player && t.team !== by.team, hp0 = mine ? t.mods.map(m => m.hp) : null;
    const tAng = -t.turret;
    const { face, plate, mm: mm0, slope, dd, low, extra, extraOf, heatK, gear, n } = platePick(t, h, d, s.key, sb.cal);
    const scf = scarFrame(t, h, E), scw = scarWeak(t, scf.frame, scf.p, plate);
    const mm = Math.round((scw.hole ? mm0 * 0.1 : mm0 * (1 - scw.w)) * t.up.armor);
    // vitesse d'impact réelle : traînée et pertes des ricochets comprises
    const V = s.V, xm = s.dist * RK, kinetic = !sb.heat && !sb.he;
    rock(t, sb.m * V, -d[0], -d[1], Math.max(0.2, h.z - T.S.ht * 0.5));
    const nHull = h.part === 'turret' ? rotZ(n, tAng) : n;
    const cosI = Math.max(0.03, -dot3(dd, n));
    const angle = Math.acos(Math.min(1, cosI)) / D2R;
    // obus déformé et en travers après un ricochet ou un rebond : il perd la moitié de sa perforation,
    // frappe comme sous 10° de plus et ricoche plus facilement
    const yaw = s.yaw && kinetic;
    const ef = Ballistics.effective(sb, mm, yaw ? Math.min(86, angle + 10) : angle);
    const eff = ef.eff + extra;
    let pen = Ballistics.penVel(sb, V) * rnd(0.95, 1.05) * heatK * (kinetic ? by.up.pen : 1) * (yaw ? 0.5 : 1);
    // obus brisé à l'impact : il ne ricoche pas d'un bloc, il perd une bonne part de sa perforation
    const shP = kinetic ? Ballistics.shatterChance(sb, mm, angle, V) : 0, shattered = Math.random() < shP;
    if (shattered) pen *= Ballistics.SHATTER_PEN[s.key] || 0.7;
    // charge creuse rasante (> 80°) : la fusée de nez fonctionne 6 fois sur 10 et le jet effleure la
    // plaque, qu'il creuse sans la traverser ; sinon l'obus se brise sans fonctionner. Il ne repart
    // jamais intact
    const graze = sb.heat && angle > 80, fuzed = graze && Math.random() < 0.6;
    if (graze) pen = fuzed ? Math.min(pen, mm) : 0;
    const ricP = sb.heat || sb.he ? 0 : Ballistics.ricochetChance(sb, mm, angle, yaw ? 10 : 0);
    const ric = !shattered && Math.random() < ricP;
    const Ek = 0.5 * sb.m * V * V;
    const ev = by === player && hitcamOn && R3 ? {
      typeId: T.id, turretAng: tAng, dir: d, entry: E, n: nHull, cosI: Math.max(0.05, -dot3(d, nHull)), V, cal: sb.cal,
      shellKey: s.key, shellLen: sb.len, spin: Ballistics.spin(sb, V),
      target: `${T.name} ${t.team === 0 ? '(ally)' : '(enemy)'} · ${Math.round(xm)} m`,
      friendly: t.team === by.team, mods: t.mods.map(m => ({ kind: m.kind, frame: m.frame, c: m.c, s: m.s })),
      before: t.mods.map(m => m.hp / m.max0), after: null, touch: [], sim: null, sparks: [], chunks: [],
      results: [], data: [], detT: null, ricDir: null, outcome: null, scars: scarsForXray(t),
    } : null;
    if (ev) {
      for (let k = 0; k < 18; k++) ev.sparks.push({ d: norm3([nHull[0] + gauss() * 0.6, nHull[1] + gauss() * 0.6, nHull[2] + gauss() * 0.6 + 0.15]), v: rnd(150, 700), life: rnd(1.5e-3, 4e-3) });
      const f = (v, k = 0) => v.toFixed(k);
      ev.data.push({ t: `${sb.name} · ${f(sb.m, 2)} kg · ${sb.cal} mm`, c: '#e9d9a6' });
      ev.data.push({ t: `Impact velocity ${Math.round(V)} m/s (muzzle: ${Math.round(s.v0)}) · energy ${f(Ek / 1e6, 2)} MJ · ${Math.round(Ballistics.spin(sb, V))} rev/s`, c: '#d8d4c6' });
      const fall = Math.atan(-s.slope) / D2R;
      if (trap) ev.data.push({ t: `SHOT TRAP: deflected off the ${trap.toLowerCase()} into the ${plate.toLowerCase()}`, c: '#ffb070' });
      else ev.data.push({ t: `Trajectory: ${fall >= 0 ? 'dropping' : 'rising'} ${f(Math.abs(fall), 2)}° under gravity · impact ${f(h.z, 2)} m above ground${s.ric ? ' · after ricochet' : ''}`, c: '#d8d4c6' });
      if (yaw) ev.data.push({ t: 'Deformed and yawing after the ricochet: −50% penetration, +10° obliquity', c: '#ffcf7a' });
      if (s.wallLoss) ev.data.push({ t: `Fired through cover: ${Math.round(s.wallLoss)} mm of steel equivalent (brick, timber) on the way`, c: '#ffcf7a' });
      ev.data.push({ t: `${plate}: ${mm} mm at ${slope}° · incidence ${Math.round(angle)}°${!sb.heat && !sb.he ? ` → normalized ${Math.round(ef.angN)}°` : ''}`, c: '#d8d4c6' });
      if (mm < mm0) ev.data.push({ t: scw.hole ? `Into the hole of an earlier penetration: only ${mm} of ${mm0} mm left` : `Plate already scarred by a hit ${Math.round(scw.near * 100)} cm away: ${mm} mm effective instead of ${mm0} mm (work-hardened, cracked steel)`, c: '#ffcf7a' });
      ev.data.push({ t: `Effective armor ${Math.round(eff)} mm${extra ? ` (incl. ${extra} mm of ${extraOf})` : ''} · penetration ${Math.round(pen)} mm${heatK < 1 ? ` (jet disrupted by the ${extraOf || 'running gear'}: × ${heatK.toFixed(2)})` : ''}`, c: '#d8d4c6' });
      if (shattered) ev.data.push({ t: `SHATTERED on impact (risk ${Math.round(shP * 100)}%): penetration × ${Ballistics.SHATTER_PEN[s.key] || 0.7}`, c: '#ffcf7a' });
      if (graze) ev.data.push({ t: fuzed ? `Grazing impact (${Math.round(angle)}°): the nose fuze functions, the jet skims the plate` : `Grazing impact (${Math.round(angle)}°): the fuze fails and the round breaks up`, c: '#ffcf7a' });
    }
    t.hitFlash = 0.15;
    // train de roulement touché : la chenille casse presque toujours sur un coup franc, rarement à travers
    // les roues (qui se brisent) ; un coup au barbotin ou au réducteur immobilise le char
    let gearRes = null;
    if (gear && pen >= 20) {
      const side = h.ny > 0 ? 1 : -1; // côté touché (repère du char : y vers la droite)
      if (gear === 'track' && Math.random() < 0.9 || gear === 'wheels' && Math.random() < 0.2) {
        t.trackT = Math.max(t.trackT, rnd(14, 22)); t.trackSide = side; gearRes = 'Track broken';
        if (t === player) addLog(`Track broken: stop and ${touch.on ? 'tap REPAIR' : 'press R'} to repair it`, '#ffb070');
      } else if (gear === 'wheels') {
        t.wheelK = Math.max(0.6, (t.wheelK || 1) * 0.92); gearRes = 'Road wheel destroyed';
        if (t === player) addLog('Road wheel destroyed: top speed −8%', '#ffb070');
      } else if (gear === 'sprocket' && Math.random() < 0.8) {
        t.trackT = Math.max(t.trackT, rnd(25, 35)); t.trackSide = side; gearRes = 'Final drive hit';
        if (t === player) addLog('Sprocket and final drive hit: immobilised (R: repair)', '#ffb070');
      }
      if (gearRes && show) floatText(hx, hy + 8, gearRes, '#ffb070');
    }

    // trace du coup pour les effets de dégâts (points faibles, conséquences sans perforation, souffle) :
    // zone touchée, plaque, énergie à l'impact et issue ; Vr, vitesse résiduelle derrière la plaque
    // anneau de tourelle (jonction caisse-tourelle) : la tourelle se bloque, il faut la tourner à la main
    const crit = [];
    if (!ric && t.T.tb && (face === 'front' || face === 'side') && Math.abs(h.z - Sd.ht) < 0.1 && pen > 20 && Math.random() < 0.6) { t.ringT = rnd(20, 30); crit.push('Turret ring jammed'); }
    t.lastHit = { by, key: s.key, part: h.part, face, plate, gear, z: h.z, E, d, V, Ek, pen, eff, shattered, outcome: ric ? 'ricochet' : pen >= eff ? 'pen' : 'nopen', Vr: 0, time: gameTime };
    // Ricochet : probabilité croissante avec l'incidence, nulle en cas de surcalibrage
    if (ric) {
      // réflexion 3D de la direction sur la normale de la plaque (un glacis à 55° renvoie l'obus presque
      // à la verticale), ramenée dans le repère de la caisse puis dans le monde (y du jeu vers le bas)
      const dn3 = dot3(dd, n), R0 = [dd[0] - 2 * dn3 * n[0], dd[1] - 2 * dn3 * n[1], dd[2] - 2 * dn3 * n[2]];
      const Rh = norm3(h.part === 'turret' ? rotZ(R0, tAng) : R0);
      const c = Math.cos(t.angle), sn = Math.sin(t.angle), wx = Rh[0] * c + Rh[1] * sn, wy = Rh[0] * sn - Rh[1] * c, wl = Math.hypot(wx, wy);
      const ux = wl > 1e-6 ? wx / wl : s.vx / s.sp, uy = wl > 1e-6 ? wy / wl : s.vy / s.sp;
      s.slope = Rh[2] / Math.max(0.05, wl); s.z = t.gz + h.z;
      s.V *= 0.72; s.ric++; s.yaw = true;
      s.x += ux * 2; s.y += uy * 2;
      shellAim(s, ux, uy);
      // l'APHE qui a ricoché sur une plaque assez épaisse a pu armer sa fusée : une fois sur deux,
      // il éclate dehors, juste après le rebond
      const burst = s.key === 'APHE' && sb.filler && mm / cosI >= sb.sens && Math.random() < 0.5;
      if (burst) { Fx.blast(hx, hy, h.z, 0.25); Sfx.explosion(listenerDist(hx, hy), false); }
      addScar(t, h, E, d, plate, 'ric', sb.cal, Math.min(1, pen / eff));
      Fx.armorHit(hx, hy, h.z, 'ric', s.vx / s.sp, s.vy / s.sp);
      s.owner = t; // l'obus dévié peut toucher n'importe qui d'autre
      Sfx.ricochet(listenerDist(hx, hy));
      if (show) floatText(hx, hy - 10, 'Ricochet', '#cfe3ff');
      if (by === player) waveStats.ric++;
      if (t === player) { hitFrom(by, false); addLog(`Ricochet off ${plate.toLowerCase()}`, '#cfe3ff'); if (Meta.track('ricself')) missionToast(); if (++waveStats.ricSelf === 5) medal('steel_wall'); }
      // piège à obus : la moitié basse d'un masque arrondi renvoie l'obus vers le bas, à travers le toit de
      // caisse mince au-dessus du pilote et du radio (d'où le masque « à menton » du Panther G) ; à
      // l'inverse, un ricochet qui remonte du glacis peut frapper la face avant de la tourelle
      if (!trap && !burst) {
        let h2 = null, E2 = null;
        if (h.part === 'turret' && Rh[2] < -0.15) {
          // départ de la vraie surface du masque, en avant de la boîte de collision de la tourelle
          const M = Sd.turret.mantlet, fx = Math.max(...Sd.turret.poly.map(q => q[0]));
          const front = M.type === 'cyl' ? fx - 0.05 + M.r * Math.cos(Math.asin(clamp((E[2] - Sd.gun.z) / M.r, -0.97, 0.97))) : M.type === 'bell' ? fx + M.len * 0.3 : fx;
          const off = rotZ([Math.max(0, front - T.I.turretBox.x1), 0, 0], tAng), Em = [E[0] + off[0], E[1] + off[1], E[2]];
          const k = (Sd.ht - Em[2]) / Rh[2], P = [Em[0] + Rh[0] * k, Em[1] + Rh[1] * k, Sd.ht];
          if (k > 0 && P[0] < T.I.xUp(Sd.ht) && P[0] > Sd.rearX && Math.abs(P[1]) < Sd.W / 2 - Sd.tw * 0.5) { h2 = { part: 'hull', roof: true, nx: 0, ny: 0, z: Sd.ht, lx: P[0] * PX, ly: -P[1] * PX }; E2 = P; }
        } else if (h.part === 'hull' && face === 'front' && !low && Rh[2] > 0.15 && T.I.turretBox && !t.turretGone) {
          const I = T.I, B = I.turretBox, Et = rotZ([E[0] - I.pivotX, E[1] - I.pivotY, E[2]], t.turret), Rt = rotZ(Rh, t.turret);
          const k = slab(Et, Rt, [B.x0, B.y0, Sd.ht], [B.x1, B.y1, I.totalH]);
          if (k > 0 && k < 4 && Math.abs(Et[0] + Rt[0] * k - B.x1) < 1e-3) {
            const Pt = [Et[0] + Rt[0] * k, Et[1] + Rt[1] * k, Et[2] + Rt[2] * k];
            h2 = { part: 'turret', nx: 1, ny: 0, z: Pt[2], ty: -Pt[1] * PX }; E2 = [E[0] + Rh[0] * k, E[1] + Rh[1] * k, E[2] + Rh[2] * k];
          }
        }
        if (h2) {
          if (show) floatText(hx, hy - 24, 'SHOT TRAP', '#ffb070');
          if (t === player || by === player) addLog(`SHOT TRAP: deflected into the ${h2.part === 'hull' ? 'hull roof' : 'turret front'}`, '#ffb070');
          return strike(s, t, h2, hx, hy, Rh, E2, plate);
        }
      }
      if (ev) {
        ev.ricDir = Rh; ev.ricV = s.V;
        ev.outcome = 'ricochet'; ev.after = ev.before.slice();
        ev.metal = metalFor(sb, mm, angle, pen, eff, false);
        ev.data.push({ t: `RICOCHET: incidence ${Math.round(angle)}° > critical angle (probability ${Math.round(ricP * 100)}%)`, c: '#9fd0ff' });
        if (burst) ev.data.push({ t: 'The base fuze armed on the plate: the round bursts just after the ricochet', c: '#ffcf7a' });
        ev.results.push({ t: 'No damage', c: '#9fd0ff', time: 0 });
        startHitCam(ev, false);
      }
      if (mine) hitMark('ric');
      return burst ? 'stop' : 'continue';
    }

    // Simulation de ce qui se passe derrière la plaque
    const I = T.I, inner = I.inner;
    const wall = (wf, sign) => {
      if (wf === 'roof') return { T: A.hull.roof, n: [0, 0, 1] };
      if (wf === 'floor') return { T: 16, n: [0, 0, -1] };
      if (wf === 'front') return { T: A.hull.up[0], n: plateNormal('front', A.hull.up[1], 1, false) };
      if (wf === 'rear') return { T: A.hull.rear[0], n: plateNormal('rear', A.hull.rear[1], 1, false) };
      return { T: A.hull.side[0], n: plateNormal('side', A.hull.side[1], sign, false) };
    };
    // f : perforation retenue / loi de de Marre, pour que la simulation trouve la même limite balistique
    const ctxSim = { mods: t.mods.concat(fwMod(T) || []), ammoK, piv: [I.pivotX, I.pivotY], tAng, inner, wall, E, d, n: nHull, s: sb, V, T: mm, los: mm / cosI, eff, pen, shatter: shattered, f: kinetic ? pen / Ballistics.penVel(sb, V) : 1 };
    let sim = null;
    const penetrated = pen >= eff;
    if (penetrated) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'pen' }));
    else if (!sb.heat && !sb.he && pen >= eff * 0.85) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'spall' }));
    else if (sb.he && pen * 1.4 >= mm) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'heout' }));

    let out = null;
    if (sim) { t.lastHit.Vr = sim.Vr; out = applySim(t, sim, by, ev); }
    if (sim && ev && gearRes) ev.results.unshift({ t: gearRes, c: '#ffb070', time: 0.1e-3 });
    if (gearRes) crit.push(gearRes);
    addScar(t, h, E, d, plate, penetrated ? (sb.heat ? 'heatpen' : sb.he ? 'hepen' : 'pen') : (sb.heat ? 'heat' : sb.he ? 'he' : 'dent'), sb.cal,
      sb.he ? (mm0 < 30 ? 0.2 : 0.06) : Math.min(1, pen / eff));
    if (penetrated) {
      t.morale -= 0.25;
      if (t === player) waveStats.pened = true;
      if (by === player && t.team === by.team) waveStats.ffPens++;
      else if (by === player) {
        waveStats.pens++; waveStats.maxPen = Math.max(waveStats.maxPen, pen);
        if (show && !t.dead) floatText(hx, hy - 30, '+✪ 20', '#e9c46a', 0.9);
        const dp = Meta.track('pen'), df = /side|rear/i.test(plate) && Meta.track('flank');
        if (dp || df) missionToast();
      }
      if (show) {
        const col = t === player ? '#ff5a4a' : t.team === 0 ? '#ffaa44' : '#ffe27a';
        floatText(hx, hy - 12, out.knocked ? 'DESTROYED' : out.crewKilled ? `Penetrated · ${out.crewKilled} killed` : 'Penetrated', col, 1.15);
        if (shattered) floatText(hx, hy + 18, 'SHATTERED', '#ffcf7a');
        if (out.fire) floatText(hx, hy + 6, 'Fire!', '#ffb070');
      }
      if (t === player) {
        addLog(`Penetrated: ${plate.toLowerCase()} (${Math.round(pen)} mm vs ${Math.round(eff)} mm)`, '#ff8a6a');
        for (const l of out.lines) addLog(l.t, l.c);
      }
      Fx.armorHit(hx, hy, h.z, s.key === 'HEAT' ? 'heat' : 'pen', s.vx / s.sp, s.vy / s.sp);
      Sfx.penetrate(listenerDist(hx, hy));
      if (t === player) { addTrauma(0.5); hitFrom(by, true); padRumble(0.9, 220); }
    } else {
      // explosif ou charge creuse qui éclate contre la plaque, sans la percer
      if (s.key === 'HE' || (sb.heat && pen > 0)) heBlast(t, hx, hy, sb, by, E, face);
      const why = plate === 'Gun mantlet' ? 'Hit the mantlet' : sb.heat && heatK < 1 && /Skirt/.test(plate) ? 'Skirt detonated the HEAT' : gear ? `Absorbed by the ${gear === 'wheels' ? 'road wheels' : gear}` : 'No penetration';
      if (show) floatText(hx, hy - 12, shattered ? 'SHATTERED' : out && out.crewHurt ? 'Spalling!' : why, shattered ? '#ffcf7a' : '#c8c8c8');
      if (t === player) {
        addLog(`Not penetrated: ${plate.toLowerCase()} (${Math.round(pen)} mm vs ${Math.round(eff)} mm)`, '#c8c8c8');
        if (out) for (const l of out.lines) addLog(l.t, l.c);
      }
      Fx.armorHit(hx, hy, h.z, s.key === 'HEAT' ? 'heat' : 'non', s.vx / s.sp, s.vy / s.sp);
      Sfx.clang(listenerDist(hx, hy));
      if (t === player) { addTrauma(0.25); hitFrom(by, false); }
      // masque frappé fort : le berceau du canon se bloque en hauteur
      if (plate === 'Gun mantlet' && pen / eff > 0.6 && Math.random() < 0.5) { t.elevJamT = 8; crit.push('Gun elevation jammed'); }
      // choc d'un gros obus qui ne perce pas (plus de 1,5 MJ) : l'équipage est sonné 2 à 3 s
      if (kinetic && Ek > 1.5e6) { t.stunT = rnd(2, 3); crit.push('Crew stunned by the impact'); if (t === player) addTrauma(0.6); }
      checkKnock(t, by);
    }
    for (const c of crit) {
      if (t === player) addLog(c, '#ffb070');
      else if (by === player && t.team !== by.team) ribbon(c);
      if (ev) ev.results.push({ t: c, c: '#ffb070', time: 0.15e-3 });
    }
    if (out && by === player && t.team !== by.team) for (const l of out.lines) ribbon(l.t);
    if (ev) {
      const f = (v, k = 0) => v.toFixed(k);
      if (penetrated) {
        if (sim.jet) ev.data.push({ t: `PENETRATED · copper jet at 6,500 m/s · ${Math.round(sim.jet.res)} mm of penetration left, spent within ${f(Math.hypot(sim.jet.b[0] - sim.jet.a[0], sim.jet.b[1] - sim.jet.a[1], sim.jet.b[2] - sim.jet.a[2]), 2)} m`, c: '#a6f08a' });
        else if (sb.he) ev.data.push({ t: `PENETRATED · ${Math.round(sb.filler * 1000)} g of explosive detonates behind the plate`, c: '#a6f08a' });
        else ev.data.push({ t: `PENETRATED · ballistic limit ${Math.round(sim.Vbl)} m/s → residual ${Math.round(sim.Vr)} m/s${sim.plug ? ` · ${f(sim.plug.m, 2)} kg plug punched out` : ''}`, c: '#a6f08a' });
        if (sim.blast) {
          const kpa = Ballistics.blastKPa(sim.blast.W, 0.5, 2);
          ev.data.push({ t: `Charge: ${Math.round(sim.blast.raw * 1000)} g at +${f(sim.blast.t * 1000, 2)} ms · ${f(sim.blast.W * 1000, 0)} g TNT eq. · blast ${f(kpa / 1000, 1)} MPa at 0.5 m`, c: '#ffcf7a' });
        }
        const nf = sim.frags.length, mt = sim.frags.reduce((a, q) => a + q.m, 0);
        ev.data.push({ t: `${nf} fragments · ${f(mt, 2)} kg${sim.coreStop ? ` · core: ${CORE_STOP[sim.coreStop] || (sim.coreStop === true ? 'stopped' : 'stopped by the ' + String(sim.coreStop).toLowerCase())}` : ''}`, c: '#ffcf7a' });
      } else {
        ev.data.push({ t: `NOT PENETRATED: ${Math.round(pen)} mm < ${Math.round(eff)} mm${sim ? ' · spalling off the inner face' : ''}`, c: '#ff8a6a' });
      }
      for (const nt of sim ? sim.notes : []) ev.data.push({ t: nt, c: '#bcd8ff' });
      if (sb.he) {
        // détonation contre la plaque : boule de feu, onde de choc, éclats d'enveloppe (vitesse de Gurney)
        const We = sb.filler * (sb.re || 1), gv = Ballistics.gurney(We, sb.m - sb.filler);
        ev.extBlast = { p: [E[0] + nHull[0] * 0.05, E[1] + nHull[1] * 0.05, E[2] + nHull[2] * 0.05], t: 0.03e-3, E: We * 4.184e6 };
        for (let k = 0; k < 40; k++) {
          const u = norm3([gauss(), gauss(), gauss()]);
          const dd2 = dot3(u, nHull) < 0 ? norm3([u[0] - 2 * dot3(u, nHull) * nHull[0], u[1] - 2 * dot3(u, nHull) * nHull[1], u[2] - 2 * dot3(u, nHull) * nHull[2]]) : u;
          ev.chunks.push({ d: dd2, v: gv * rnd(0.6, 1.2), r: 0.012 });
        }
        ev.data.push({ t: `External detonation: ${Math.round(sb.filler * 1000)} g · fragments at ${Math.round(gv)} m/s · blast ${(Ballistics.blastKPa(We, 1, 1) / 1000).toFixed(1)} MPa at 1 m`, c: '#ffcf7a' });
      }
      if (sim) ev.sim = sim;
      else {
        ev.after = t.mods.map(m => Math.max(0, m.hp) / m.max0);
        // éclats de surface ; un obus brisé part en morceaux le long de la plaque
        if (!sb.he) for (let k = 0; k < 6; k++) ev.chunks.push({ d: norm3([nHull[0] + gauss() * 0.5, nHull[1] + gauss() * 0.5, nHull[2] + gauss() * 0.5]), v: rnd(60, 250), r: sb.cal / 6000 });
        if (shattered) {
          const dn = dot3(d, nHull), gl = norm3([d[0] - dn * nHull[0], d[1] - dn * nHull[1], d[2] - dn * nHull[2]]);
          for (let k = 0; k < 12; k++) ev.chunks.push({ d: norm3([gl[0] + nHull[0] * 0.4 + gauss() * 0.35, gl[1] + nHull[1] * 0.4 + gauss() * 0.35, gl[2] + nHull[2] * 0.4 + gauss() * 0.35]), v: V * rnd(0.15, 0.45), r: sb.cal / 4000 });
        }
        t.mods.forEach((m, i) => {
          if (ev.after[i] >= ev.before[i]) return;
          ev.touch[i] = 0.3e-3;
          ev.results.push({ t: `${m.name}: ${ev.after[i] <= 0 ? (m.kind === 'crew' ? 'knocked out' : 'destroyed') : (m.kind === 'crew' ? 'wounded (shock wave)' : 'damaged')}`, c: ev.after[i] <= 0 ? '#ff6a5a' : '#ffb070', time: 0.3e-3 });
        });
        if (gearRes) ev.results.push({ t: gearRes, c: '#ffb070', time: 0.1e-3 });
        if (!ev.results.length) ev.results.push({ t: 'No internal damage', c: '#c8c8c8', time: 0.2e-3 });
      }
      if (t.dead && !ev.results.some(r => /DESTROYED/.test(r.t))) ev.results.push({ t: 'TANK DESTROYED', c: '#ff4a2a', time: ev.tEnd || 0 });
      ev.outcome = penetrated ? 'pen' : 'nopen';
      ev.metal = metalFor(sb, mm, angle, pen, eff, penetrated);
      // moment fort : char détruit, munitions, équipage tué, premier perforant de la bataille, tir lointain
      startHitCam(ev, penetrated && (t.dead || out.detonate || out.crewKilled > 0 || !waveStats.pipPen || xm >= 600));
    }
    if (penetrated && mine) waveStats.pipPen = true;
    if (mine && !t.dead) {
      const k = t.mods.find((m, i) => hp0[i] > 0 && m.hp <= 0);
      if (k || crit.length) hitMark('crit', `Critical: ${k ? `${k.name.toLowerCase()} ${k.kind === 'crew' ? 'knocked out' : 'destroyed'}` : crit[0].toLowerCase()}`);
      else hitMark(penetrated ? 'pen' : 'nopen');
    }
    if (s.key === 'HE') explode(hx, hy, s, t);
    else if (sb.heat) blastNear(hx, hy, s, t);
    return 'stop';
  }

  // Applique les dégâts de la simulation, en déduit les conséquences
  function applySim(t, sim, by, ev) {
    const before = new Map(t.mods.map(m => [m, m.hp]));
    for (const [m, h] of sim.hits) modDamage(t, m, h.dmg, by, true);
    let detonate = false, crewKilled = 0, crewHurt = false, detT = null;
    const lines = [];
    const timeOf = m => { const h = sim.hits.get(m); return h ? h.time : 0; };
    for (const m of t.mods) {
      const b = before.get(m);
      if (m.hp === b || m.kind !== 'crew') continue;
      crewHurt = true;
      if (m.hp <= 0) { crewKilled++; lines.push({ t: `${m.name}: knocked out`, c: '#ff6a5a', time: timeOf(m) }); }
      else lines.push({ t: `${m.name}: wounded`, c: '#ffb070', time: timeOf(m) });
    }
    // un réservoir déjà percé fuit : les coups suivants allument deux fois plus souvent le feu
    const leakK = t.leak ? 2 : 1;
    let fire = false;
    for (const m of t.mods) {
      const b = before.get(m), h = sim.hits.get(m), tm = timeOf(m);
      if (m.hp === b || m.kind === 'crew') continue;
      if (m.hp <= 0) {
        lines.push({ t: `${m.name}: destroyed`, c: '#ff6a5a', time: tm });
        if (m.kind === 'fuel') {
          if (Math.random() < 0.3 * leakK) { startFire(t, 'fuel', m, by); fire = true; }
          else if (Math.random() < 0.25) { t.fuelFireT = rnd(2, 10); t.fuelFireM = m; } // essence qui coule sur le moteur chaud
        }
        if (m.kind === 'ammo') { const n = ruinRack(t, m, rnd(0.3, 0.7)); if (n) lines.push({ t: `Ammo rack hit: ${n} rounds lost`, c: '#ffb070', time: tm }); }
      } else lines.push({ t: `${m.name}: damaged`, c: '#ffb070', time: tm });
      // moteur touché : huile et essence des carburateurs (Maybach) s'enflamment facilement
      if (m.kind === 'engine' && Math.random() < (h && h.hot ? 0.5 : 0.12 + 0.4 * (b - Math.max(0, m.hp)) / m.max0)) { startFire(t, 'engine', m, by); fire = true; }
    }
    // charges propulsives enflammées : les obus explosifs de la soute la font sauter (d'autant plus qu'il y
    // en a) ; sinon les douilles de laiton brûlent et l'équipage a quelques secondes pour sortir
    if (sim.ignite.length) {
      const ig = sim.ignite.reduce((a, b) => (a.t < b.t ? a : b));
      let any = null;
      for (const m of new Set(sim.ignite.map(q => q.m))) {
        const n = rackN(m), r = m.rounds;
        if (!n) continue;
        any = any || m;
        if (Math.random() < clamp(0.08 + 0.55 * (r.HE + 0.35 * r.APHE + 0.1 * r.SMOKE) / n + (sim.jet ? 0.15 : 0), 0, 0.85)) { detonate = true; detT = ig.t + rnd(1.5e-3, 4e-3); break; }
      }
      if (!detonate && any) { cookOff(t, any, by); fire = true; lines.push({ t: `Propellant charges ignited: cook-off in ${Math.round(t.cookT)} s`, c: '#ff9a3a', time: ig.t }); }
    }
    if (sim.fuel != null) {
      const fm = [...sim.hits.keys()].find(m => m.kind === 'fuel') || modOf(t, 'fuel');
      startFire(t, 'fuel', fm, by); fire = true;
      lines.push({ t: 'Fuel ignited', c: '#ff9a3a', time: sim.fuel });
    }
    if (!lines.length) lines.push({ t: 'No module hit', c: '#c8c8c8', time: 0 });
    if (detonate) fire = false;
    else if (fire) lines.push({ t: 'Fire!', c: '#ff9a3a', time: sim.tEnd * 0.8 });
    if (detonate) { sim.tEnd = Math.max(sim.tEnd, detT + 6e-3); lines.push({ t: 'AMMO RACK: DETONATION', c: '#ff4a2a', time: detT }); }
    const knocked = detonate || crewAlive(t) < 2;
    if (knocked) lines.push({ t: 'TANK DESTROYED', c: '#ff4a2a', time: detonate ? detT : sim.tEnd * 0.9 });
    lines.sort((a, b) => a.time - b.time);
    if (ev) {
      ev.after = t.mods.map(m => Math.max(0, m.hp) / m.max0);
      t.mods.forEach((m, i) => { const h = sim.hits.get(m); if (h) ev.touch[i] = h.time; });
      ev.detT = detT; ev.results = lines.slice();
      ev.sim = sim;
    }
    if (knocked) destroyTank(t, by, detonate ? 'brewed' : null);
    return { detonate, fire, knocked, crewKilled, crewHurt, lines };
  }

  const ROLE_FX = { gunner: 'aim', driver: 'driving', loader: 'loading', commander: 'awareness', radio: 'first aid' };
  // Dégâts à un module ; statistiques et tirs alliés
  let mgNow = false; // dégâts en cours d'une balle de mitrailleuse du joueur (mission « mitrailleuse »)
  function modDamage(t, m, amount, by, silent) {
    if (t.dead || m.hp <= 0 || amount <= 0) return;
    if (GOD && t === player) return;
    if (t.invulnT > 0) return;
    // organe broyé (dégâts au-delà de 160 % de sa résistance) : hors de portée d'une réparation de campagne
    if (m.kind !== 'crew' && amount - m.hp > 0.6 * m.max0) m.wreckd = true;
    const k0 = woundK(m);
    m.hp = Math.max(0, m.hp - amount);
    if (t === player && m.kind === 'crew' && m.hp > 0 && woundK(m) < k0) {
      const r = Object.keys(t.roles).find(q => t.roles[q] === m.i) || m.role;
      addLog(`${m.name} ${woundK(m) < 0.75 ? 'badly ' : ''}wounded: ${ROLE_FX[r]} −${Math.round((1 - woundK(m)) * 100)}%`, '#ffb070');
    }
    if (m.kind === 'crew' && m.hp <= 0) t.morale -= 0.2;
    if (m.hp > 0 || !by || by === t) return;
    if (m.kind === 'crew') {
      if (by.team === t.team) {
        if (by === player) {
          waveStats.ffCrew++;
          if (gameTime - ffMsgT > 1.2) { ffMsgT = gameTime; showMsg('⚠ FRIENDLY FIRE: an allied crewman killed!', '#ffaa44'); Sfx.alarm(); }
        }
      } else if (by === player) { waveStats.crew++; const dc = Meta.track('crew'), dm = mgNow && Meta.track('mg'); if (dc || dm) missionToast(); }
    } else if (by === player && by.team !== t.team) { waveStats.mods++; if (Meta.track('mod')) missionToast(); }
    if (!silent && t === player) addLog(`${m.name} ${m.kind === 'crew' ? 'knocked out' : 'destroyed'}`, '#ff6a5a');
  }
  function checkKnock(t, by) { if (!t.dead && crewAlive(t) < 2) destroyTank(t, by, null); }

  // Charge explosive d'un obus (kg d'équivalent TNT) ; charge creuse : environ 0,5 kg en 7,5 cm, 0,7 en 8,8 cm
  const heW = sb => sb.heat ? 0.9 * (sb.cal / 100) ** 2 : (sb.filler || 0) * (sb.re || 1);
  // probabilité qu'un homme à découvert (surface exposée A, m²) soit touché par l'un des 90 éclats par cm
  // de calibre, répartis sur une demi-sphère de rayon r
  const fragP = (cal, r, A) => 1 - Math.exp(-90 * cal / 10 * A / (2 * Math.PI * Math.max(0.3, r) ** 2));
  // Explosion contre la caisse (E : point d'impact dans le repère du char, face touchée) ou au sol tout près
  // (x, y). Chenille coupée seulement si elle est à moins de 0,8·W^(1/3) m ; épiscopes brisés sous 2,5·W^(1/3) ;
  // éclats sur le chef sorti et les hommes descendus ; à travers la caisse, l'onde de choc n'atteint
  // l'équipage fermé que sur un coup au but (toit mince surtout), chaque homme selon sa distance.
  function heBlast(t, x, y, sb, by, E, face) {
    const S = t.T.S, W = heW(sb), k = Math.cbrt(Math.max(0.01, W)), show = visibleToPlayer(t) || by === player, res = [];
    const c = Math.cos(t.angle), sn = Math.sin(t.angle);
    const lx = E ? E[0] : ((x - t.x) * c + (y - t.y) * sn) / PX, ly = E ? -E[1] : (-(x - t.x) * sn + (y - t.y) * c) / PX, lz = E ? E[2] : 0;
    const ox = Math.max(0, Math.abs(lx) - S.L / 2), r = Math.hypot(ox, Math.max(0, Math.abs(ly) - S.W / 2));
    const rt = Math.hypot(ox, Math.max(0, Math.abs(Math.abs(ly) - (S.W - S.tw) / 2) - S.tw / 2), Math.max(0, lz - S.tt));
    t.morale -= 0.02;
    if (rt < 0.8 * k && Math.random() < 0.7) {
      t.trackT = Math.max(t.trackT, rnd(14, 22)); t.trackSide = ly > 0 ? 1 : -1; res.push('Track broken by the blast');
    }
    if (r < 2.5 * k && Math.random() < 0.4) { const o = Math.random() < 0.5 ? 'cmd' : 'driver'; if (t.optic[o] <= 0) { t.optic[o] = 15; res.push(`${OPTIC_NAMES[o]} broken`); } }
    if (t.hatch && roleOk(t, 'commander')) {
      const h = hatchPos(t), m = t.mods[t.roles.commander];
      if (Math.random() < fragP(sb.cal, Math.hypot(h.x - x, h.y - y) / PX, 0.15)) {
        modDamage(t, m, rnd(50, 130), by); t.hatch = false;
        res.push(m.hp <= 0 ? 'Exposed commander killed by fragments' : 'Commander hit by shell fragments');
        if (by === player && m.hp <= 0 && t.team !== by.team) { medal('headhunter'); if (Meta.track('cmd')) missionToast(); }
      }
    }
    for (const m of t.mods) if (m.out && m.hp > 0 && Math.random() < fragP(sb.cal, r, 0.5)) { modDamage(t, m, rnd(50, 130), by); res.push(`${m.name} hit while repairing the track`); }
    if (E) {
      const att = face === 'roof' ? (S.armor.hull.roof >= 16 ? 0.15 : 0.5) : 0.08;
      for (const m of t.mods) {
        if (m.kind !== 'crew' || m.hp <= 0 || m.out) continue;
        const dmg = clamp((Ballistics.blastKPa(W * 1.3, Math.max(0.2, d3(hullC(t, m), E)), 1) * att - 150) / 4, 0, 120);
        if (dmg > 0) { modDamage(t, m, dmg, by); res.push(`Shock wave: ${m.name.toLowerCase()} ${m.hp <= 0 ? 'knocked out' : 'wounded'}`); }
      }
    }
    for (const l of res) {
      if (t === player) addLog(l, '#ffb070');
      else if (by === player && t.team !== by.team) ribbon(l);
    }
    if (res.length && show) floatText(t.x, t.y + 10, res[0], '#ffb070');
    checkKnock(t, by);
  }

  // Obus contre un obstacle. Les fusées de nez (explosif, charge creuse) fonctionnent au contact, arbres
  // compris (souvent sur un tronc, moins dans le feuillage). Un perforant traverse une paroi qu'il perce
  // (brique, bois) en y laissant de la vitesse (Lambert-Jonas), dévié de quelques degrés ; la fusée de
  // culot de l'APHE s'y arme et le fait éclater un mètre plus loin, dans la maison ou derrière le muret.
  // La roche arrête tout.
  function hitObstacle(s, o, h, hx, hy) {
    if (s.key === 'SMOKE') return smokeShell(s, hx, hy);
    const sb = s.sb, ux = s.vx / s.sp, uy = s.vy / s.sp, ang = Math.atan2(uy, ux);
    let eq = obsEq(o), cosI = Math.max(0.2, Math.abs(ux * (h.nx || 0) + uy * (h.ny || 0)));
    if (o.type === 'tree') {
      // tronc (sous le houppier, s'il est sur la ligne de tir) ou feuillage
      const cx = o.x + 8, cy = o.y + 8, miss = Math.abs((cx - hx) * -uy + (cy - hy) * ux) / PX, r = 0.3 * o.size + sb.cal / 2000;
      const zo = s.z - obsBase(o), trunk = zo < 3 * o.size && miss < r, crown = zo >= 2.2 * o.size;
      if (!trunk && !crown) { s.skipObs = o; return 'continue'; }
      if (sb.he || sb.heat) {
        if (Math.random() < (trunk ? (sb.he ? 0.9 : 0.7) : (sb.he ? 0.5 : 0.3))) {
          if (trunk) knockTree(o, ang);
          if (sb.he) explode(hx, hy, s, null); else { Fx.blast(hx, hy, zo, 0.3); Sfx.explosion(listenerDist(hx, hy), false); }
          return 'stop';
        }
        s.skipObs = o; return 'continue';
      }
      if (!trunk) { s.skipObs = o; return 'continue'; }
      knockTree(o, ang);
      eq *= Math.sqrt(Math.max(0.05, 1 - Math.pow(miss / r, 2))); cosI = 1; // corde du tronc
    }
    const zr = Math.max(0.2, s.z - obsBase(o)), chips = () => { for (let k = 0; k < 5; k++) Fx.chips(hx, hy, Math.min(obsH(o), zr), o.type === 'tree'); };
    if (sb.he) { explode(hx, hy, s, null); return 'stop'; }
    if (sb.heat) {
      chips(); Fx.blast(hx, hy, zr, 0.3); Sfx.explosion(listenerDist(hx, hy), false);
      if (o.hp !== Infinity) damageObstacle(o, s.by.T.obs * 0.5);
      return 'stop';
    }
    // perforant : il passe si la paroi (vue sous son incidence) ne l'arrête pas
    const los = eq / cosI, V = s.V;
    if (o.type !== 'tree') chips();
    if (!(Ballistics.penVel(sb, V) > los)) {
      Fx.groundHit(hx, hy, -ux, -uy, 0.5, true);
      if (o.hp !== Infinity && o.type !== 'tree') damageObstacle(o, s.by.T.obs * 0.5);
      Sfx.impact(listenerDist(hx, hy));
      return 'stop';
    }
    const vl = Ballistics.vLimit(sb, los);
    s.V = Math.sqrt(Math.max(1, V * V - vl * vl));
    if (o.type === 'tree') s.yaw = true; // un tronc touché hors axe fait basculer l'obus
    const a2 = ang + gauss() * 2 * D2R;
    shellAim(s, Math.cos(a2), Math.sin(a2));
    s.skipObs = o;
    s.exitWall = o.type === 'building' ? { o, los } : null;
    if (o.hp !== Infinity && o.type !== 'tree') damageObstacle(o, s.by.T.obs * 0.25);
    Sfx.impact(listenerDist(hx, hy));
    // fusée de culot armée par la paroi (6 % de ratés) : éclatement après le délai, à la vitesse restante
    if (s.key === 'APHE' && sb.filler && !s.fuzeAt && los >= sb.sens && Math.random() > 0.06) s.fuzeAt = s.dist * RK + rnd(1.1e-3, 1.5e-3) * s.V;
    if (s.wallLoss == null) s.wallLoss = 0;
    s.wallLoss += los;
    return 'continue';
  }
  // Obus qui ressort d'une maison : il perce le mur opposé à son tour, ou s'y arrête
  function exitWall(s, x, y) {
    const o = s.exitWall.o, los = s.exitWall.los;
    s.exitWall = null;
    Sfx.impact(listenerDist(x, y));
    if (!(Ballistics.penVel(s.sb, s.V) > los)) {
      Fx.chips(x, y, Math.min(obsH(o), Math.max(0.2, s.z - obsBase(o))), false);
      damageObstacle(o, s.by.T.obs * 0.5);
      return 'stop';
    }
    const vl = Ballistics.vLimit(s.sb, los);
    s.V = Math.sqrt(Math.max(1, s.V * s.V - vl * vl)); s.wallLoss += los;
    shellAim(s, s.vx / s.sp, s.vy / s.sp);
    return 'continue';
  }
  // Éclatement en vol de l'APHE dont la fusée s'est armée sur un obstacle : petite charge, éclats ;
  // dans une maison, il en souffle l'intérieur
  function apheBurst(s) {
    const o = s.skipObs;
    Fx.blast(s.x, s.y, s.z - hAt(s.x, s.y), 0.3); Sfx.explosion(listenerDist(s.x, s.y), false); stampCrater(s.x, s.y, 4);
    if (o && o.type === 'building' && !o.dead && s.x >= o.x && s.x <= o.x + o.w && s.y >= o.y && s.y <= o.y + o.h) damageObstacle(o, s.by.T.obs);
    return 'stop';
  }

  // Éclats et souffle d'un obus explosif ou d'une charge creuse sur les chars et les hommes à pied voisins ;
  // l'IA ferme ses écoutilles quand un obus tombe à moins de 30 m
  function blastNear(x, y, s, direct) {
    for (const t of tanks) {
      if (t.dead || t === direct) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < 30 * PX) t.underFire = Math.max(t.underFire, 2);
      if (d > 25 * PX + t.r || !losClear(x, y, t.x, t.y, false, true, null, hAt(x, y) + 0.6, t.gz + t.T.S.ht * 0.5)) continue;
      heBlast(t, x, y, s.sb, s.by, null, null);
    }
    for (const r of runners) if (Math.random() < fragP(s.sb.cal, Math.hypot(r.x - x, r.y - y) / PX, 0.5)) r.hp = 0;
    OBJ.blast(x, y, s);
  }
  function explode(x, y, s, direct) {
    const R = 75 * Math.sqrt(s.by.T.caliber / 75), q = 0.6 + 0.4 * (L().dustK || 0);
    veils.push({ x, y, r: (3 + 3 * Math.min(1, s.by.T.caliber / 88)) * PX * q, life: 2.2, max: 2.2, dens: 0.55 * q, by: null });
    blastNear(x, y, s, direct);
    for (const o of obstacles) {
      if (o.dead || o.hp === Infinity) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      const d = Math.hypot(cx - x, cy - y);
      if (d > R) continue;
      if (o.type === 'tree') knockTree(o, Math.atan2(o.y - y, o.x - x));
      else damageObstacle(o, s.by.T.obs * 1.4 * (1 - d / R));
    }
    boom(x, y, 0.8);
    stampCrater(x, y, 18);
  }

  function damageObstacle(o, amount) {
    const before = Math.floor((1 - o.hp / o.maxHp) * 6);
    o.hp -= amount;
    if (Math.floor((1 - Math.max(0, o.hp) / o.maxHp) * 6) !== before) dirty3Obs(o);
    if (o.hp <= 0 && !o.dead) {
      o.dead = true;
      dirty3Obs(o); markDirty(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h));
      const R = mulberry32(o.x * 13 + o.y * 7);
      gctx.fillStyle = 'rgba(0,0,0,0.3)';
      gctx.fillRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8);
      for (let i = 0; i < (o.w * o.h) / 60; i++) {
        const sz = 3 + R() * 9;
        gctx.fillStyle = R() < 0.5 ? L().wall : R() < 0.5 ? L().roof[0] : '#4a4540';
        gctx.fillRect(o.x - 8 + R() * (o.w + 16), o.y - 8 + R() * (o.h + 16), sz, sz * (0.5 + R()));
      }
      if (!collapse3(o)) for (let i = 0; i < 20; i++) addSmoke(o.x + R() * o.w, o.y + R() * o.h, rnd(14, 26), 'rgba(150,140,125,', 3);
      // gravats : un sol cahoteux qui freine
      if (o.w >= o.h) soilSeg(o.x, o.y + o.h / 2, o.x + o.w, o.y + o.h / 2, o.h / 2 + 8, 'rubble');
      else soilSeg(o.x + o.w / 2, o.y, o.x + o.w / 2, o.y + o.h, o.w / 2 + 8, 'rubble');
      Sfx.explosion(listenerDist(o.x + o.w / 2, o.y + o.h / 2), false);
      buildGrid();
    }
  }

  function knockTree(o, ang) {
    if (o.dead) return;
    o.dead = true; o.fall = ang;
    fallTree(o);
    dirty3Obs(o); markDirty(o.x + 8, o.y + 8, 40);
    const cx = o.x + 8, cy = o.y + 8, len = 34 * o.size;
    // en 3D, le tronc couché est un vrai modèle : seule la souche marque le sol
    if (!W3D) {
    gctx.save();
    gctx.translate(cx, cy); gctx.rotate(ang);
    gctx.fillStyle = '#4a3622'; gctx.fillRect(0, -3, len, 6);
    gctx.fillStyle = L().tree[0];
    gctx.globalAlpha = 0.9;
    gctx.beginPath(); gctx.arc(len, 0, 11 * o.size, 0, TAU); gctx.fill();
    gctx.restore();
    }
    gctx.fillStyle = '#5a4630';
    gctx.beginPath(); gctx.arc(cx, cy, 4, 0, TAU); gctx.fill();
    for (let i = 0; i < 6; i++) parts.push({ k: 'leaf', x: cx + rnd(-10, 10), y: cy + rnd(-10, 10), vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(0.6, 1.2), max: 1.2, color: L().tree[1] });
    Sfx.tree(listenerDist(cx, cy));
    soilSeg(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, 5, 'trunk'); // tronc couché : une marche de 40 cm
    const c0 = Math.floor(o.x / CELL), r0 = Math.floor(o.y / CELL);
    for (let r = r0 - 1; r <= r0 + 2; r++) for (let c = c0 - 1; c <= c0 + 2; c++) if (r >= 0 && c >= 0 && r < GR && c < GC && grid[r * GC + c] === 2) grid[r * GC + c] = 0;
  }

  // Issue : 'brewed' (munitions sautées), 'burning' (hors de combat, en feu), 'knocked' (hors de combat),
  // 'abandoned' (équipage parti). Seule l'explosion des munitions souffle le char.
  const HOW = { brewed: 'brewed up', burning: 'burning', knocked: 'knocked out', abandoned: 'abandoned' };
  function destroyTank(t, by, how) {
    if (t.dead) return;
    how = how === true ? 'brewed' : how || (t.fires.length ? 'burning' : 'knocked');
    t.dead = true; t.deadT = 0; t.speed = 0; t.trackT = 0; t.vx = t.vy = t.vl = t.turnRate = 0; t.gear = 0; t.load = 0;
    // une épave intacte prend parfois feu plus tard (plus souvent si l'essence fuyait) ; des munitions qui
    // cuisaient sautent à l'heure dite, équipage parti ou non
    t.wFireT = how === 'burning' || t.cookT > 0 ? 0.01 : how !== 'brewed' && Math.random() < (t.leak ? 0.6 : 0.3) ? rnd(5, 40) : 0;
    t.cookLeft = t.cookT; t.wreck = how; t.burnT = 0; t.cookT = 0; t.dismount = false;
    t.fires = [];
    if (how === 'brewed') brewUp(t);
    const ff = by && by !== t && by.team === t.team, enemy = by === player && t.team !== player.team;
    feed.unshift({ a: by ? by.name : '—', at: by ? by.team : -1, v: t.name, vt: t.team, ff, det: how === 'brewed', how, life: 7 });
    if (feed.length > 6) feed.pop();
    if (by === player) {
      if (ff) { waveStats.tk++; showMsg('Ally destroyed by your fire!', '#ff7a4a', 2.5, 2); }
      else if (by !== t) {
        waveStats.kills++; floatText(t.x, t.y - 26, '+✪ 150', '#e9c46a', 1.3); hitMark('kill');
        if (Meta.P.opts.slowmo && !Meta.P.opts.calm) slowT = 0.5; playerKill(t, how); showMsg(how === 'brewed' ? 'Enemy tank destroyed: ammo detonated!' : how === 'abandoned' ? 'Enemy crew bailed out!' : how === 'burning' ? 'Enemy tank knocked out and burning' : 'Enemy tank knocked out', '#ffe27a', 2, 2); }
    }
    if (t.team !== (player ? player.team : 0) && waveStats && !waveStats.firstKill) { waveStats.firstKill = true; if (enemy) medal('first_blood'); }
    if (enemy && how === 'brewed' && Meta.track('det')) missionToast();
    if (enemy && how === 'abandoned') { waveStats.bailed++; if (Meta.track('bail')) missionToast(); }
    if (t === player) {
      waveStats.streak = 0; killedBy(by, how); msgs = msgs.filter(m => !/COOKING OFF/.test(m.text));
      if (!reviveUsed && mode !== 'duel' && state === 'play' && !Meta.diff().noRevive) reviveT = deathCamT + 0.3; // après la caméra sur l'épave
      addLog(how === 'brewed' ? 'Your ammunition exploded.' : how === 'abandoned' ? 'Your crew bailed out.' : 'Your crew is out of action.', '#ff6a5a');
      showMsg(`Your tank is destroyed. Spectating an ally (${touch.on ? 'tap' : 'click'} to switch)`, '#ff7a5c', 4, 3);
    }
  }
  // Char ennemi détruit par le joueur : missions, série de destructions (prime × 1,1 à 2, × 1,25 à 3,
  // × 1,5 à 5 et plus, sans mourir), médailles (doublé, blitz, feu d'artifice, tireur d'élite, retour)
  function playerKill(t, how) {
    const ws = waveStats, now = gameTime, m = dist(player, t) * RK, key = t.lastHit && t.lastHit.by === player ? t.lastHit.key : '';
    let done = Meta.track('kill');
    if (key === 'HE' || key === 'HEAT') done = Meta.track('killhe') || done;
    if (m >= 400) done = Meta.track('snipe') || done;
    if (t.T.id === 'heavy' || t.T.id === 'kingtiger') done = Meta.track('killheavy') || done;
    if (done) missionToast();
    ws.longest = Math.max(ws.longest, m);
    ws.killT.push(now); ws.streak++;
    const k = ws.streak >= 5 ? 1.5 : ws.streak >= 3 ? 1.25 : ws.streak >= 2 ? 1.1 : 1;
    if (k > 1) { ws.streakCr += Math.round(150 * (k - 1)); floatText(t.x, t.y - 44, `Streak ×${k}`, '#ffd76a', 1); }
    if (ws.streak === 3 || ws.streak === 5 || ws.streak === 8) goldRibbon(`🔥 KILL STREAK ${ws.streak}`, `rewards ×${k}`);
    const n = s => ws.killT.filter(x => now - x <= s).length;
    if (n(15) === 3) medal('blitz'); else if (n(10) === 2) medal('double');
    if (how === 'brewed') medal('fireworks');
    if (m >= 500) medal('sniper', false, `${Math.round(m / 10) * 10} m`);
    if (ws.revived) medal('comeback');
    if (t.pHits === 1) medal('oneshot');
    if (mode === 'campagne' && !tanks.some(a => a.team === 0 && a !== player && !a.dead)) medal('last_stand');
  }
  // Médaille de bataille : bandeau et fanfare (quiet : décernée sur l'écran de résultats) ; la plupart
  // une fois par bataille, les doublés, blitz, tirs lointains et explosions à chaque fois
  const MEDAL_REP = { double: 1, blitz: 1, sniper: 1, fireworks: 1, headhunter: 1, oneshot: 1 };
  function medal(id, quiet, extra) {
    const m = Meta.MEDALS.find(k => k.id === id), ws = waveStats;
    if (!m || !ws || (ws.medals.includes(id) && !MEDAL_REP[id])) return;
    ws.medals.push(id);
    if (quiet) return;
    goldRibbon(`${m.ic} ${m.name.toUpperCase()}${extra ? ' · ' + extra : ''}`, `+✪ ${m.c}`);
    if (performance.now() - medalSnd > 700) { medalSnd = performance.now(); Sfx.unlock(1); } // une fanfare pour plusieurs médailles d'un coup
  }
  let medalSnd = -1e9;
  // Explosion des munitions : boule de feu, cratère, tourelle arrachée (sur une casemate, le toit)
  function brewUp(t) {
    t.wreck = 'brewed'; t.deadT = 0; t.burnT = Math.max(t.burnT, 12); t.wFireT = 0;
    boom(t.x, t.y, 2.2);
    stampCrater(t.x, t.y, 40);
    if (t.T.tb && !t.turretGone) {
      t.turretGone = true;
      const a = Math.random() * TAU, v = rnd(40, 110), pv = pivot(t);
      // vol balistique (z du centre de la tourelle, en m) avec culbute sur les trois axes
      const I = t.T.I, zc = (t.T.S.ht + I.totalH) / 2;
      parts.push({ k: 'turret', x: pv.x, y: pv.y, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v * 0.6, z: zc, vz: rnd(10, 16), zc, rest: (I.totalH - t.T.S.ht) / 2, rot: t.angle + t.turret, vr: rnd(-6, 6), ax: 0, ay: 0, wx: rnd(-4, 4), wy: rnd(-4, 4), life: 9, max: 9, tank: t });
    } else if (!t.T.tb) for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      P3({ x: t.x, y: t.y, z: t.T.S.ht, vx: Math.cos(a) * rnd(2, 6), vy: Math.sin(a) * rnd(2, 6), vz: rnd(8, 15), g: G, drag: 0.2, bounce: 0.15, size: rnd(0.5, 0.9), life: rnd(4, 6), c: [0.12, 0.11, 0.1, 1] });
    }
  }
  // Tourelle arrachée retombée : une épave basse qui reste sur le terrain (couvert et obstacle)
  function turretWreck(p) {
    const T = p.tank.T, B = T.tb, sz = Math.max(B.x1 - B.x0, B.y1 - B.y0) * 0.8;
    // au repos : à l'endroit, un peu de travers, ou retournée (deux fois sur cinq)
    const flip = Math.random() < 0.4 ? Math.PI + rnd(-0.3, 0.3) : rnd(-0.12, 0.12);
    const o = { type: 'wreck', x: p.x - sz / 2, y: p.y - sz / 2, w: sz, h: sz, hp: Infinity, maxHp: Infinity, ht: T.I.totalH - T.S.ht + 0.1, rot: p.rot, tid: T.id, flip, zc: p.zc, rest: p.rest, smokeT: 20 };
    obstacles.push(o); markGrid(o);
  }

  // ===================== Effets 3D =====================
  // Particule physique : position (px au sol, z en m), vitesses en m/s, pesanteur, traînée de l'air,
  // rebond, croissance (fumée qui se dilate), poussée d'Archimède (g négatif pour les gaz chauds).
  function P3(o) {
    if (parts.length > PCAP) return null;
    const p = Object.assign({ k: 'p3', z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0.2, grow: 0, bounce: -1, glow: false, line: 0, delay: 0, c: [1, 1, 1, 1], wind: 0 }, o);
    p.vx *= PX; p.vy *= PX; p.max = p.life;
    parts.push(p);
    return p;
  }
  const hex3 = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const WIND = { x: 0.9, y: -0.4 }; // vent au sol en m/s, propre à chaque bataille (setAir)
  const Fx = {
    soil() {
      const lv = L();
      if (lv.snow) return Math.random() < 0.6 ? [0.86, 0.88, 0.9] : [0.28, 0.24, 0.2];
      const g = hex3(lv.ground[1]);
      return lv.city ? [g[0] * 0.7, g[1] * 0.7, g[2] * 0.7] : [0.18 + g[0] * 0.25, 0.14 + g[1] * 0.18, 0.1 + g[2] * 0.12];
    },
    dust() { const d = hex3(L().dust); return [d[0] * 0.85, d[1] * 0.82, d[2] * 0.78]; },
    // Départ du coup : boule de feu en bouche, jets latéraux du frein de bouche, fumée de poudre,
    // et anneau de poussière soulevé par l'onde de souffle sous le canon
    muzzle(t, mx, my) {
      const T = t.T, ta = t.angle + t.turret, ux = Math.cos(ta), uy = Math.sin(ta), z = T.S.gun.z, k = T.caliber / 75;
      const brake = !!T.S.gun.brake;
      for (let i = 0; i < 4; i++) { const f = rnd(0, 1.6) * k; P3({ x: mx + ux * f * PX, y: my + uy * f * PX, z, vx: ux * rnd(5, 20), vy: uy * rnd(5, 20), size: rnd(0.5, 1.1) * k * (brake ? 0.7 : 1), grow: 6, glow: true, life: rnd(0.05, 0.09), c: [1, 0.72, 0.32, 2.6] }); }
      if (brake) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) P3({ x: mx, y: my, z, vx: -uy * sd * rnd(15, 35) + ux * 4, vy: ux * sd * rnd(15, 35) + uy * 4, size: rnd(0.35, 0.6) * k, grow: 5, glow: true, life: rnd(0.04, 0.07), c: [1, 0.65, 0.28, 2.2] });
      for (let i = 0; i < 16; i++) {
        const side = brake && i % 3 === 0 ? (i % 2 ? 1 : -1) : 0, v = rnd(4, 24);
        P3({ x: mx, y: my, z: z + rnd(-0.1, 0.2), vx: ux * v * (side ? 0.3 : 1) - uy * side * v, vy: uy * v * (side ? 0.3 : 1) + ux * side * v, vz: rnd(-0.3, 0.8), drag: 2.2, g: -0.12, wind: 1, size: rnd(0.3, 0.6) * k, grow: rnd(0.9, 1.6), life: rnd(2, 4.5), c: [0.62, 0.6, 0.57, 0.34] });
      }
      const gx = mx - ux * 1.5 * PX, gy = my - uy * 1.5 * PX, dc = Fx.dust(), dry = L().snow ? 0.5 : 1;
      for (let i = 0; i < 22 * dry; i++) {
        const a = Math.random() * TAU, v = rnd(6, 16) * k;
        P3({ x: gx + Math.cos(a) * PX * 0.8, y: gy + Math.sin(a) * PX * 0.8, z: 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(0.2, 1.2), drag: 3.2, wind: 1, size: rnd(0.3, 0.6), grow: 1.1, life: rnd(1.4, 2.6), c: [dc[0], dc[1], dc[2], 0.32] });
      }
    },
    // Obus perforant qui fiche dans le sol : gerbe de mottes projetées vers l'avant, colonne de poussière
    groundHit(x, y, ux, uy, k, graze) {
      const sc = Fx.soil(), dc = Fx.dust(), n = Math.round((graze ? 8 : 18) * k);
      for (let i = 0; i < n; i++) {
        const f = rnd(2, 9) * k, sp = rnd(-3, 3);
        P3({ x, y, z: 0.05, vx: ux * f - uy * sp, vy: uy * f + ux * sp, vz: rnd(3, graze ? 5 : 11) * k, g: G, drag: 0.3, bounce: 0.15, size: rnd(0.05, 0.16), life: rnd(1.2, 2), c: [sc[0] * rnd(0.8, 1.2), sc[1] * rnd(0.8, 1.2), sc[2] * rnd(0.8, 1.2), 1] });
      }
      for (let i = 0; i < (graze ? 4 : 10) * k; i++) P3({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), z: rnd(0.2, 1), vx: ux * rnd(1, 4), vy: uy * rnd(1, 4), vz: rnd(0.8, 3) * k, drag: 1.2, wind: 1, size: rnd(0.3, 0.6) * k, grow: rnd(0.7, 1.3), life: rnd(1.8, 3.5), c: [dc[0], dc[1], dc[2], 0.5] });
    },
    // Explosion : boule de feu brève, onde de choc rasante qui chasse la poussière, éclats incandescents,
    // mottes projetées en hauteur, puis colonne de fumée brune qui monte et dérive avec le vent
    blast(x, y, z, k) {
      const sc = Fx.soil(), dc = Fx.dust();
      for (let i = 0; i < 7; i++) P3({ x: x + rnd(-1, 1) * PX * k, y: y + rnd(-1, 1) * PX * k, z: z + rnd(0, 1.2) * k, vz: rnd(1, 4), size: rnd(1.2, 2.6) * k, grow: 7 * k, glow: true, life: rnd(0.09, 0.18), c: [1, rnd(0.45, 0.7), 0.2, 2.4] });
      for (let i = 0; i < 34 * Math.min(2, k + 0.3); i++) {
        const a = i / 34 * TAU + rnd(-0.1, 0.1), v = rnd(22, 40) * Math.sqrt(k);
        P3({ x, y, z: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(0, 1), drag: 5, wind: 1, size: rnd(0.4, 0.8) * k, grow: 1.6, life: rnd(1.2, 2.2), c: [dc[0], dc[1], dc[2], 0.38] });
      }
      for (let i = 0; i < 26 * k; i++) {
        const a = Math.random() * TAU, v = rnd(2, 12) * Math.sqrt(k);
        P3({ x, y, z: z + 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(6, 20) * Math.sqrt(k), g: G, drag: 0.25, bounce: 0.1, size: rnd(0.06, 0.22), life: rnd(1.5, 2.6), c: [sc[0] * rnd(0.7, 1.1), sc[1] * rnd(0.7, 1.1), sc[2] * rnd(0.7, 1.1), 1] });
      }
      for (let i = 0; i < 22 * k; i++) {
        const a = Math.random() * TAU, e = rnd(-0.1, 0.7), v = rnd(60, 160);
        P3({ x, y, z: z + 0.3, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v, vz: Math.sin(e) * v, g: G, drag: 1.5, glow: true, line: 0.012, size: 0.04, life: rnd(0.08, 0.22), c: [1, 0.8, 0.45, 2] });
      }
      for (let i = 0; i < 18 * k; i++) P3({ x: x + rnd(-1, 1) * PX * k, y: y + rnd(-1, 1) * PX * k, z: z + rnd(0.3, 2.5) * k, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(1.5, 4.5) * Math.sqrt(k), drag: 0.7, g: -0.25, wind: 1, size: rnd(0.6, 1.2) * k, grow: rnd(1, 1.8) * k, life: rnd(3, 6.5), c: [0.13, 0.11, 0.09, 0.55] });
    },
    // Coup sur blindage. Gerbe d'étincelles (acier arraché porté au blanc) projetée dans le plan de la
    // plaque, poussière de peinture et de calamine ; perforation : éclair et fumée qui ressort ensuite
    // des écoutilles ; charge creuse : flash et boule de fumée noire de l'explosif.
    armorHit(x, y, z, kind, ux, uy) {
      const n = kind === 'pen' ? 34 : kind === 'ric' ? 22 : kind === 'mg' ? 4 : 26;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(-uy, -ux) + rnd(-1.6, 1.6), v = kind === 'mg' ? rnd(6, 18) : rnd(10, 45), e = rnd(-0.3, 1);
        P3({ x, y, z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v, vz: Math.sin(e) * v, g: G, drag: 1.2, bounce: 0.35, glow: true, line: 0.02, size: 0.03, life: rnd(0.25, kind === 'mg' ? 0.4 : 1.1), c: [1, rnd(0.65, 0.9), rnd(0.3, 0.55), 2.2] });
      }
      if (kind === 'mg') { P3({ x, y, z, size: 0.12, glow: true, life: 0.04, c: [1, 0.9, 0.6, 2] }); return; }
      P3({ x, y, z, size: kind === 'pen' ? 1.1 : 0.6, grow: 4, glow: true, life: 0.07, c: [1, 0.85, 0.6, 3] });
      for (let i = 0; i < 6; i++) P3({ x, y, z, vx: -ux * rnd(1, 4) + rnd(-1, 1), vy: -uy * rnd(1, 4) + rnd(-1, 1), vz: rnd(0, 1.5), drag: 2, wind: 1, size: rnd(0.2, 0.4), grow: 0.8, life: rnd(0.8, 1.6), c: [0.5, 0.47, 0.42, 0.4] });
      if (kind === 'heat') for (let i = 0; i < 9; i++) P3({ x: x - ux * PX * 0.6, y: y - uy * PX * 0.6, z, vx: -ux * rnd(1, 5) + rnd(-2, 2), vy: -uy * rnd(1, 5) + rnd(-2, 2), vz: rnd(0.5, 2), drag: 1.5, g: -0.2, wind: 1, size: rnd(0.4, 0.8), grow: 1.4, life: rnd(2, 3.5), c: [0.1, 0.09, 0.08, 0.6] });
      if (kind === 'pen') for (let i = 0; i < 12; i++) P3({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), z: z + 0.6, delay: rnd(0.25, 1.2), vz: rnd(1, 2.5), drag: 0.6, g: -0.3, wind: 1, size: rnd(0.25, 0.5), grow: 0.9, life: rnd(1.8, 3), c: [0.55, 0.53, 0.5, 0.45] });
    },
    // Coup dans l'eau : gerbe qui monte et retombe, embruns qui dérivent
    splash(x, y, k) {
      for (let i = 0; i < 26 * k; i++) { const a = Math.random() * TAU, v = rnd(0.5, 2.5) * k; P3({ x, y, z: 0.05, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(4, 11) * Math.sqrt(k), g: G, drag: 0.4, size: rnd(0.08, 0.2) * k, life: rnd(0.9, 1.6), c: [0.78, 0.84, 0.86, 0.9] }); }
      for (let i = 0; i < 8 * k; i++) P3({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), z: rnd(0.3, 1.5) * k, vz: rnd(0.5, 1.5), drag: 1.2, wind: 1, size: rnd(0.5, 1) * k, grow: 1.2, life: rnd(1.5, 2.5), c: [0.85, 0.88, 0.9, 0.35] });
    },
    // Balle de mitrailleuse au sol : petit jet de terre et de poussière
    bulletGround(x, y, ux, uy) {
      const sc = Fx.soil(), dc = Fx.dust();
      for (let i = 0; i < 3; i++) P3({ x, y, z: 0.02, vx: ux * rnd(0.5, 2) + rnd(-1, 1), vy: uy * rnd(0.5, 2) + rnd(-1, 1), vz: rnd(1.5, 4), g: G, size: rnd(0.03, 0.06), life: rnd(0.4, 0.7), c: [sc[0], sc[1], sc[2], 1] });
      P3({ x, y, z: 0.1, vz: rnd(0.6, 1.4), drag: 1.5, wind: 1, size: rnd(0.12, 0.22), grow: 0.5, life: rnd(0.6, 1.1), c: [dc[0], dc[1], dc[2], 0.5] });
    },
    // Éclats de bois (arbre) ou de pierre (mur, rocher, maison)
    chips(x, y, z, wood) {
      const c = wood ? [0.45, 0.32, 0.18] : [0.55, 0.52, 0.48];
      for (let i = 0; i < 4; i++) P3({ x, y, z, vx: rnd(-3, 3), vy: rnd(-3, 3), vz: rnd(1, 4), g: G, bounce: 0.1, size: rnd(0.03, 0.08), life: rnd(0.5, 1), c: [c[0], c[1], c[2], 1] });
      P3({ x, y, z, vz: 0.5, drag: 1.5, wind: 1, size: 0.18, grow: 0.6, life: 0.9, c: [c[0], c[1], c[2], 0.4] });
    },
  };

  // ===================== Effets =====================
  // Place d'un son pour Sfx : distance en mètres balistiques et panoramique (−1 gauche, 1 droite) selon
  // l'axe droit de la caméra (vue 3D ou lunette), atténué tout près pour ne pas sauter d'une oreille à l'autre
  function listenerDist(x, y) {
    const dx = x - camX, dy = y - camY, l = Math.hypot(dx, dy), v = W3D && cam3.view;
    const rx = v ? v[0] : 1, ry = v ? -v[4] : 0, rl = Math.hypot(rx, ry) || 1;
    return { d: l * RK, pan: l < 1 ? 0 : (dx * rx + dy * ry) / (l * rl) * Math.min(1, l / 60) * 0.85 };
  }
  function addSmoke(x, y, size, color, life, vx = 0, vy = 0) {
    if (parts.length > 1800) return;
    parts.push({ k: 'smoke', x, y, vx: vx + rnd(-8, 8), vy: vy + rnd(-8, 8) - 6, life, max: life, size, color, grow: 10 });
  }
  function addFire(x, y) {
    if (parts.length > 1800) return;
    parts.push({ k: 'fire', x, y, vx: rnd(-10, 10), vy: rnd(-30, -5), life: rnd(0.3, 0.7), max: 0.7, size: rnd(4, 9) });
  }
  function addDust(x, y, color) {
    if (parts.length > 1800) return;
    parts.push({ k: 'dust', x, y, vx: rnd(-15, 15), vy: rnd(-15, 15), life: rnd(0.6, 1.3), max: 1.3, size: rnd(4, 9), color: color || L().dust, grow: 12 });
  }
  function sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rnd(80, 320);
      parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.15, 0.4), max: 0.4 });
    }
  }
  function boom(x, y, k, z = 0.3) {
    addBlast3(x, y, 1.5 * k);
    parts.push({ k: 'flash', x, y, life: 0.25 * k, max: 0.25 * k, size: 70 * k });
    Fx.blast(x, y, z, k * 0.8);
    for (let i = 0; i < 6 * k; i++) addFire(x + rnd(-10, 10) * k, y + rnd(-10, 10) * k);
    const d = player ? Math.hypot(player.x - x, player.y - y) : 9999;
    if (d < 900) addTrauma(Math.min(1, k) * (1 - d / 900) * 0.6);
    Sfx.explosion(listenerDist(x, y), k > 1);
  }
  // Traces : ornières de la largeur des chenilles, bords tassés plus sombres et barrettes des patins ;
  // rien sur l'eau, à peine sur la glace
  function stampTracks(t) {
    if (t.wet > 0.1) return;
    markDirty(t.x, t.y, t.T.len);
    const c = Math.cos(t.angle), s = Math.sin(t.angle), T = t.T, ice = terra.iceAt(t.x, t.y);
    const tw = T.S.tw * PX;
    gctx.fillStyle = L().track; gctx.globalAlpha = ice ? 0.3 : 1;
    for (const side of [-1, 1]) {
      const off = T.wid / 2 - tw / 2;
      const ox = -s * side * off, oy = c * side * off;
      for (const f of [-0.4, 0.4]) {
        gctx.save();
        gctx.translate(t.x + ox + c * T.len * f, t.y + oy + s * T.len * f);
        gctx.rotate(t.angle);
        gctx.fillRect(-4, -tw / 2, 8, tw);
        gctx.fillRect(-4, -tw / 2, 8, 1); gctx.fillRect(-4, tw / 2 - 1, 8, 1);
        for (let k = -3; k < 4; k += 2.5) gctx.fillRect(k, -tw / 2 + 1, 0.8, tw - 2);
        gctx.restore();
      }
    }
    gctx.globalAlpha = 1;
  }
  // entonnoir sombre puis bourrelet de terre rejetée, plus clair, qui marque le relief quelle que soit
  // l'heure du jour (dans l'eau, rien)
  function stampCrater(x, y, r) {
    if (terra && terra.depth(x, y) > 0.1) return;
    markDirty(x, y, r * 1.35);
    soilSeg(x, y, x, y, r * 0.6, 'crater');
    const g = gctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
    g.addColorStop(0, 'rgba(20,16,12,0.6)'); g.addColorStop(0.5, 'rgba(30,24,18,0.38)'); g.addColorStop(0.7, 'rgba(60,50,38,0.12)');
    g.addColorStop(0.8, 'rgba(235,225,200,0.13)'); g.addColorStop(1, 'rgba(235,225,200,0)');
    gctx.fillStyle = g;
    gctx.beginPath(); gctx.arc(x, y, r * 1.35, 0, TAU); gctx.fill();
  }
  function missionToast() { toast('🎖 Mission complete! Claim your reward in “Missions”'); Sfx.notify(); }
  // Bandeaux des coups critiques infligés par le joueur (4 au plus, 2,5 s chacun), son selon la catégorie
  const RIB = [[/detonat|cook|rack|round/i, 'ammo', '✹', '#ff6a3a'], [/fire/i, 'fire', '🔥', '#ff9a3a'], [/track|drive|wheel/i, 'track', '⛓', '#ffcf7a'],
    [/engine|transmission|fuel/i, 'engine', '⚙', '#ffcf7a'], [/breech|barrel|ring|elevation/i, 'gun', '⌖', '#ffcf7a'], [/radio set/i, 'radio', '⌁', '#bcd8ff'],
    [/visor|sight|periscope|stunned/i, 'optic', '◉', '#bcd8ff'], [/./, 'crew', '✚', '#ff8a6a']];
  // File des bandeaux : quatre à l'écran, les suivants attendent leur tour (aucun ne chasse l'autre) ;
  // ceux des médailles et des séries sont dorés
  let ribbons = [], ribbonQ = [];
  function pushRibbon(r) {
    r.life = r.max = r.gold ? 2.6 : 2.5; r.y = null;
    if (ribbons.length < 4) ribbons.push(r);
    else { ribbonQ.push(r); if (ribbonQ.length > 6) ribbonQ.splice(Math.max(0, ribbonQ.findIndex(q => !q.gold)), 1); }
  }
  const goldRibbon = (t, sub) => pushRibbon({ t, sub, gold: true, ic: '', c: '#ffd76a' });
  function ribbon(text) {
    if (/: damaged|: wounded|No module|DESTROYED|^Fire!$|hit$/.test(text)) return;
    const lab = text.replace(/^(.*): knocked out$/, '$1 knocked out').replace(/^(.*): destroyed$/, '$1 destroyed').replace(/^AMMO RACK: DETONATION$/, 'Ammo rack detonated')
      .replace(/^Propellant charges ignited.*/, 'Ammo cooking off').replace(/^Fuel ignited$/, 'Set on fire');
    if (ribbons.some(r => r.t === lab && r.life > 2) || ribbonQ.some(r => r.t === lab)) return;
    const k = RIB.find(r => r[0].test(lab));
    pushRibbon({ t: lab, ic: k[2], c: k[3] });
    waveStats.crits++;
    if (lab === 'Driver knocked out' && Meta.track('drv')) missionToast();
    Sfx.critical(k[1]);
  }
  function floatText(x, y, text, color, scale = 1) { texts.push({ x, y, text, color, life: 1.4, max: 1.4, scale }); }
  // Messages du centre : deux lignes au plus ; un nouveau message ne chasse qu'un message de priorité
  // inférieure ou égale (le plus ancien), jamais un plus important (pri : 0 réglage, 1 avis, 2 et plus fait de jeu)
  function showMsg(text, color, life = 2, pri = life >= 2 ? 1 : 0) {
    const same = msgs.find(m => m.text === text);
    if (same) { same.life = Math.max(same.life, life); return; }
    if (msgs.length >= 2) {
      let i = -1;
      msgs.forEach((m, j) => { if (m.pri <= pri && (i < 0 || m.pri < msgs[i].pri)) i = j; });
      if (i < 0) return;
      msgs.splice(i, 1);
    }
    msgs.push({ text, color, life, max: life, pri });
  }
  function addLog(text, color) { logs.unshift({ text, color, life: 6 }); if (logs.length > 6) logs.pop(); if (inBattle()) Sfx.intercom(); }

  // Touche de la caméra d'impact : passe la séquence en cours, sinon change de mode (réglage sauvegardé)
  const HC_MODES = { off: 'off', high: 'highlights only', all: 'every hit' };
  function xrayKey() {
    if (HitCam.active()) { HitCam.stop(); return; }
    const o = Meta.P.opts, l = Object.keys(HC_MODES);
    o.hitcam = l[(l.indexOf(o.hitcam) + 1) % l.length]; Meta.save(); applyOptions();
    showMsg(`Impact camera: ${HC_MODES[o.hitcam]}`, '#bcd8ff', 1.4);
  }
  // un obus arrive sur le joueur : la caméra d'impact s'efface
  const threatened = () => player && !player.dead && shells.some(s => s.warned && s.by !== player);
  // Caméra d'impact : en « moments forts », seulement les coups marquants (destruction, munitions,
  // équipage tué, premier perforant, tir lointain), pas plus d'une fois toutes les 25 s
  function startHitCam(ev, notable) {
    const m = Meta.P.opts.hitcam;
    if (m === 'off' || (m === 'high' && (!notable || gameTime - hcLast < 25)) || threatened()) return;
    if (!ev.after) ev.after = ev.before.slice();
    hcLast = gameTime;
    HitCam.play(ev);
  }
  // Repère de coup au réticule (obus du joueur sur un ennemi) : forme, couleur et son selon l'issue ; un
  // repère plus fort n'est pas remplacé par un moindre tant qu'il s'affiche. [rang, annonce, couleur,
  // couleur de la palette pour daltoniens]
  const HITMK = { ric: [0, 'Ricochet!', '#9fd0ff', '#9fd0ff'], nopen: [1, 'Didn\'t penetrate', '#e8e8e8', '#e8e8e8'], pen: [2, 'Penetration!', '#ffa040', '#ffb000'],
    crit: [3, 'Critical hit!', '#ff4a3a', '#ff4ad2'], kill: [4, 'Target destroyed!', '#ffd23a', '#fff06a'] };
  let hitMk = null;
  function hitMark(kind, text) {
    const d = HITMK[kind];
    if (hitMk && hitMk.life > 0.5 && HITMK[hitMk.kind][0] > d[0]) return;
    hitMk = { kind, t: 0, life: kind === 'kill' ? 1.8 : 1.3, text: text || d[1], col: d[Meta.P.opts.cb ? 3 : 2] };
    Sfx.confirm(kind);
  }
  function drawHitMark(x, y, above) {
    const h = hitMk, k = uiK * (1 + 0.4 * Math.max(0, 1 - h.t / 0.12)), big = h.kind === 'pen' || h.kind === 'crit' || h.kind === 'kill';
    ctx.save(); ctx.globalAlpha = Math.min(1, h.life / 0.4); ctx.strokeStyle = h.col; ctx.fillStyle = h.col; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3;
    ctx.lineWidth = (big ? 3 : 2) * uiK;
    const r0 = 7 * k, r1 = (big ? 16 : 13) * k, rot = h.kind === 'ric' ? 0 : Math.PI / 4;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a); ctx.moveTo(x + c * r0, y + sn * r0); ctx.lineTo(x + c * r1, y + sn * r1); }
    ctx.stroke();
    ctx.lineWidth = 1.8 * uiK;
    if (h.kind === 'kill') { ctx.beginPath(); ctx.arc(x, y, 21 * k, 0, TAU); ctx.stroke(); }
    if (h.kind === 'ric') for (const a of [0, Math.PI]) { ctx.beginPath(); ctx.arc(x, y, 18 * k, a - 0.5, a + 0.5); ctx.stroke(); }
    if (h.kind === 'crit') { const q = 4 * k; ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath(); ctx.fill(); }
    // annonce de l'équipage, du côté opposé à la lecture de distance
    ctx.shadowBlur = 0; ctx.textAlign = 'center'; ctx.font = F(800, 13);
    const ty = above ? y - 30 * uiK : y + 40 * uiK;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(h.text, x + 1, ty + 1);
    ctx.fillStyle = h.col; ctx.fillText(h.text, x, ty);
    ctx.restore();
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.k === 'p3') {
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        if (p.wind) { const kw = Math.min(1, 0.5 * p.wind * dt); p.vx += (WIND.x * PX - p.vx) * kw; p.vy += (WIND.y * PX - p.vy) * kw; }
        p.vz -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          if (p.bounce >= 0) { p.vz = -p.vz * p.bounce; p.vx *= 0.45; p.vy *= 0.45; } else p.vz = 0;
        }
        p.size = Math.max(0.01, p.size + p.grow * dt);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.k === 'smoke' || p.k === 'dust') { p.vx *= 0.96; p.vy *= 0.96; p.size += p.grow * dt; }
      else if (p.k === 'spark' || p.k === 'debris' || p.k === 'leaf') { p.vx *= 0.92; p.vy *= 0.92; }
      else if (p.k === 'turret') {
        p.rot += p.vr * dt; p.vr *= 0.98; p.ax += p.wx * dt; p.ay += p.wy * dt; p.vz -= G * dt; p.z += p.vz * dt;
        if (p.z <= p.rest && p.vz < 0) { stampCrater(p.x, p.y, 14); addDust(p.x, p.y); turretWreck(p); p.life = 0; }
      }
    }
    for (let i = veils.length - 1; i >= 0; i--) if ((veils[i].life -= dt) <= 0) veils.splice(i, 1);
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.life -= dt; s.r = Math.min(s.maxR, s.r + 70 * dt);
      // en 3D, l'écran est fait de bouffées qui gonflent, dérivent avec le vent et se dissipent
      if (W3D && s.life > 5 && Math.random() < dt * 4) {
        const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * s.r * 0.8;
        P3({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, z: rnd(0.4, 2.5), vz: rnd(0.1, 0.5), drag: 0.8, wind: 0.8, size: s.r / PX * rnd(0.18, 0.3), grow: 0.5, life: rnd(6, 9), c: [0.62, 0.62, 0.6, 0.42] });
      }
      if (s.life <= 0) smokes.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) texts.splice(i, 1); }
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].life -= dt; if (feed[i].life <= 0) feed.splice(i, 1); }
    for (let i = ribbons.length - 1; i >= 0; i--) if ((ribbons[i].life -= dt) <= 0) ribbons.splice(i, 1);
    while (ribbons.length < 4 && ribbonQ.length) ribbons.push(ribbonQ.shift());
    ribbons.forEach((r, i) => { r.y = r.y == null ? i * 24 - 12 : r.y + (i * 24 - r.y) * Math.min(1, dt * 14); });
    for (let i = logs.length - 1; i >= 0; i--) { logs[i].life -= dt; if (logs[i].life <= 0) logs.splice(i, 1); }
    for (let i = msgs.length - 1; i >= 0; i--) if ((msgs[i].life -= dt) <= 0) msgs.splice(i, 1);
    if (hitMk && (hitMk.t += dt, hitMk.life -= dt) <= 0) hitMk = null;
    if (helpT > 0) helpT -= dt;
    for (let i = dmgDirs.length - 1; i >= 0; i--) if ((dmgDirs[i].life -= dt) <= 0) dmgDirs.splice(i, 1);
    if (radio && (radio.life -= dt) <= 0) radio = null;
    if (radioQ.length && (!radio || radio.max - radio.life > 1.2)) { radio = radioQ.shift(); radio.max = radio.life; Sfx.intercom(); }
  }

  // Radio de l'équipage : une ligne à la fois au-dessus du panneau, chacune au moins 1,2 s, la plus
  // importante d'abord ; les moins importantes sont abandonnées quand la file déborde
  let radio = null, radioQ = [], chat = {};
  function chatter(text, pri = 1) {
    if (!player || player.dead || player.ai || (radio && radio.text === text) || radioQ.some(r => r.text === text)) return;
    radioQ.push({ text, pri, life: 3.2 });
    radioQ.sort((a, b) => b.pri - a.pri);
    if (radioQ.length > 3) radioQ.length = 3;
  }
  const ROLE_NAME = { driver: 'driver', radio: 'radio operator', gunner: 'gunner', commander: 'commander', loader: 'loader' };
  // annonces nées de l'état du char : obus d'un autre type chargé, chenille, feu, équipier tué ou remplacé
  function crewChatter() {
    const p = player, c = chat;
    if (!p || p.dead || p.ai) return;
    if (c.p !== p) { chat = { p, rl: 0, sh: p.shell, tr: 0, fi: 0, dead: new Set(p.mods.filter(m => m.kind === 'crew' && m.hp <= 0)), sw: null }; return; }
    if (c.rl > 0 && p.reloadT <= 0 && p.shell !== c.sh) chatter(`Loader: ${SHELLS[p.shell].tag || p.shell} up!`, 1);
    c.rl = p.reloadT; if (p.reloadT <= 0) c.sh = p.shell;
    if (p.trackT > 0 && !(c.tr > 0) && !p.dismount) chatter('Driver: track\'s broken!', 2);
    c.tr = p.trackT;
    if (p.fires.length && !c.fi) chatter(`Radio op: we're on fire! ${p.extN > 0 && !touch.on ? `${keyName('ext')}: extinguisher!` : p.extN > 0 ? 'Extinguisher!' : 'Get ready to bail out!'}`, 3);
    c.fi = p.fires.length;
    for (const m of p.mods) if (m.kind === 'crew' && m.hp <= 0 && !c.dead.has(m)) { c.dead.add(m); chatter(`${m.name} is down!`, 3); }
    if (p.swap && p.swap !== c.sw) chatter(`The ${ROLE_NAME[p.swap.from]} takes over as ${ROLE_NAME[p.swap.role]}`, 2);
    c.sw = p.swap;
  }
  // Indicateur de direction des coups reçus : arc rouge (perforé) ou orange autour du centre de l'écran
  let dmgDirs = [];
  function hitFrom(by, pen) {
    if (!by || by === player) return;
    const a = Math.atan2(by.y - player.y, by.x - player.x), d = dmgDirs.find(q => Math.abs(angNorm(q.a - a)) < 0.35);
    if (d) { d.a = a; d.life = 1.6; d.pen = d.pen || pen; } else dmgDirs.push({ a, pen, life: 1.6 });
  }
  function drawDmgDirs() {
    if (!player || player.dead || !dmgDirs.length) return;
    const R = Math.min(W, H) * 0.28, head = sight.on ? sight.yaw : W3D && cam3.vp ? -cam3.yaw : -Math.PI / 2;
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = 9 * uiK;
    for (const d of dmgDirs) {
      const ca = d.a - head - Math.PI / 2;
      ctx.globalAlpha = Math.min(1, d.life / 0.6) * 0.85;
      ctx.strokeStyle = d.pen ? (Meta.P.opts.cb ? '#ff4ad2' : '#ff3a2a') : '#ffa040';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, R, ca - 0.35, ca + 0.35); ctx.stroke();
    }
    ctx.restore();
  }
  // Fin du joueur : la caméra reste sur l'épave puis se tourne vers le tireur ; fiche « détruit par »
  let deathCamT = 0, killCard = null;
  function killedBy(by, how) {
    const lh = player.lastHit && player.lastHit.by === by && gameTime - player.lastHit.time < 30 ? player.lastHit : null;
    const l2 = [by && by !== player ? `${Math.round(dist(by, player) * RK)} m` : '', lh ? SHELLS[lh.key] ? SHELLS[lh.key].tag || lh.key : lh.key : '', lh && lh.plate ? lh.plate.toLowerCase() : '',
      how === 'brewed' ? 'ammo rack detonated' : HOW[how]].filter(Boolean).join(' · ');
    killCard = { by, l1: by && by !== player ? `${by.T.name} (${by.name})` : 'Knocked out', l2, life: 7 };
    deathCamT = 2.5;
  }
  function drawKillCard(y) {
    const k = killCard, w = Math.min(ui.half * 2, 460);
    ctx.globalAlpha = Math.min(1, k.life);
    ctx.fillStyle = 'rgba(30,8,6,0.82)'; ctx.fillRect(W / 2 - w / 2, y, w, 52);
    ctx.fillStyle = '#ff6a50'; ctx.fillRect(W / 2 - w / 2, y, 3, 52);
    ctx.textAlign = 'center'; ctx.font = '700 10px system-ui, sans-serif'; ctx.fillStyle = '#c9a29a'; ctx.fillText('DESTROYED BY', W / 2, y + 14);
    fitFont(k.l1, w - 20, 16, 800); ctx.fillStyle = '#ffd0c4'; ctx.fillText(k.l1, W / 2, y + 32);
    fitFont(k.l2, w - 20, 12, 600); ctx.fillStyle = '#e8d8d0'; ctx.fillText(k.l2, W / 2, y + 47);
    ctx.globalAlpha = 1;
  }
  // Lampe « repéré » (sixième sens du chef) au-dessus du panneau, à droite ; « caché » 2 s, 3 s après
  // la fin du repérage ; ligne radio à gauche
  function drawRadioRow() {
    const P = ui.panel;
    if (!P || !player || player.dead) return;
    const y = P.top - 10;
    const sp = player.spottedB, hid = !sp && player.lostT != null && gameTime - player.lostT > 3 && gameTime - player.lostT < 5;
    let lw = 0;
    if (sp || hid) {
      const on = !sp || Math.sin(gameTime * 9) > -0.3, col = sp ? '#ffb020' : '#7ad06a', tx = sp ? 'SPOTTED!' : 'HIDDEN';
      ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'right';
      lw = ctx.measureText(tx).width + 34;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(P.x1 - lw, y - 13, lw, 18);
      ctx.fillStyle = on ? col : 'rgba(120,90,40,0.6)'; ctx.beginPath(); ctx.arc(P.x1 - 11, y - 4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.fillText(tx, P.x1 - 22, y);
    }
    if (radio) {
      ctx.textAlign = 'left'; ctx.font = '600 12px ui-monospace, Menlo, monospace';
      ctx.globalAlpha = Math.min(1, radio.life * 2);
      fitFont(radio.text, P.w - lw - 30, 12, 600); ctx.font = ctx.font.replace('system-ui, sans-serif', 'ui-monospace, Menlo, monospace');
      const w = ctx.measureText(radio.text).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(P.x0, y - 13, w, 18);
      ctx.fillStyle = '#bfe3a0'; ctx.fillText(radio.text, P.x0 + 8, y);
      ctx.globalAlpha = 1;
    }
  }

  // ===================== Tutoriel et aide =====================
  // Commandes du joueur selon l'appareil qu'il utilise (manette, toucher ou clavier et souris)
  let padOn = false;
  const device = () => padOn ? 'pad' : touch.on ? 'touch' : 'kb';
  const K = a => keyName(a);
  const CONTROLS = {
    kb: () => [[`${K('fwd')} ${K('left')} ${K('back')} ${K('right')}`, 'Drive and turn'], ['Mouse', 'Aim the turret'], [`Click · ${K('fire')}`, 'Fire'],
      [K('sight'), 'Gunner\'s sight · wheel: zoom'], ['1 – 7', `Shells · ${K('smoke')}: smoke · ${K('cam')}: camera`]],
    touch: () => [['Left stick', 'Drive and turn'], ['Drag right', 'Aim the turret'], ['FIRE', 'Fire · hold MG: machine gun'], ['SIGHT', 'Gunner\'s sight · pinch: zoom'], ['AMMO', 'Switch shell · SMOKE: smoke screen']],
    pad: () => [['Left stick', 'Drive and turn'], ['Right stick', 'Aim the turret'], ['RT · LT', 'Fire · machine gun'], ['A', 'Gunner\'s sight · D-pad ↑↓: zoom'], ['LB · RB', 'Shells · B: smoke · Y: camera']],
  };
  const helpRows = () => CONTROLS[device()]();
  // Étapes du premier combat, une à la fois, chacune validée par l'état du jeu (et non par « suivant »)
  const spotted0 = () => [...spotted[0]].some(t => t.team === 1 && !t.dead);
  const TUT = [
    { id: 'drive', text: { kb: () => `Hold ${K('fwd')} to drive · ${K('left')} / ${K('right')} to turn`, touch: () => 'Drag the left stick to drive', pad: () => 'Left stick: drive and turn' },
      done: dt => (tut.drv += Math.abs(player.speed) > 1.5 * PX ? dt : 0) > 1.5 },
    { id: 'fire', text: { kb: () => spotted0() ? 'Aim at a red chevron and left-click to fire' : 'Drive east: red chevrons will mark the enemy',
      touch: () => spotted0() ? 'Drag on the right to aim · FIRE to shoot' : 'Drive east: red chevrons will mark the enemy', pad: () => spotted0() ? 'Right stick: aim · RT: fire' : 'Drive east: red chevrons will mark the enemy' },
      done: () => waveStats.shots > 0 },
    { id: 'reload', text: { kb: () => 'The ring around the reticle is your reload: fire again when it turns gold' }, done: () => tut.t > 3 && player.reloadT <= 0 },
    { id: 'sight', text: { kb: () => `Press ${K('sight')} for the gunner's sight · mouse wheel: zoom`, touch: () => 'Tap SIGHT for the gunner\'s sight · pinch: zoom', pad: () => 'Press A for the gunner\'s sight · D-pad: zoom' },
      done: () => tut.flag.sight || !W3D },
    { id: 'shell', text: { kb: () => 'Thick armor? Press 3 for APCR, or hit the sides and rear', touch: () => 'Thick armor? Tap AMMO for APCR, or hit the sides and rear', pad: () => 'Thick armor? LB / RB: switch shell, or hit the sides' },
      done: () => tut.flag.shell || tut.t > 15 },
  ];
  const tut = { t: 0, drv: 0, flag: {} };
  const cardOn = () => !AUTO && (DEV_RUN ? dq('tut') : Meta.P.stats.battles < 2);
  const tutOn = () => !Meta.P.tut.done && !AUTO && (!DEV_RUN || dq('tut'));
  const tutCur = () => tutOn() && state === 'play' && player && !player.dead && !player.ai ? TUT[Meta.P.tut.step] : null;
  function tutDone(id) { tut.flag[id] = true; }
  function tutStep(dt) {
    const s = tutCur();
    if (!s) return;
    tut.t += dt;
    if (!s.done(dt)) return;
    const P = Meta.P.tut;
    P.step++; tut.t = 0;
    if (P.step >= TUT.length) { P.done = true; goldRibbon('🎖 TRAINING COMPLETE', 'good hunting'); }
    Meta.save(); Sfx.notify();
  }
  function skipTut() { Meta.P.tut.done = true; Meta.save(); toast('Tutorial skipped: replay it any time from Options'); $('tutSkip').hidden = true; }
  // Consigne en cours : pastille sous les messages, qui pulse à son apparition
  function drawTut(s, y) {
    const tx = (s.text[device()] || s.text.kb)(), w = Math.min(ui.half * 2, Math.max(300, (fitFont(tx, ui.half * 2 - 30, 15, 700), ctx.measureText(tx).width + 34)));
    const pulse = 0.55 + 0.45 * Math.max(0, Math.cos(Math.min(tut.t, 1.5) * 6));
    ctx.fillStyle = 'rgba(12,14,9,0.85)'; ctx.fillRect(W / 2 - w / 2, y - 18, w, 40);
    ctx.strokeStyle = `rgba(233,196,106,${pulse})`; ctx.lineWidth = 1.5; ctx.strokeRect(W / 2 - w / 2 + 0.5, y - 17.5, w - 1, 39);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f0e6c8'; ctx.fillText(tx, W / 2, y + 1);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#a39d88';
    ctx.fillText(`TRAINING ${Meta.P.tut.step + 1}/${TUT.length} · skip it from the pause menu`, W / 2, y + 16);
  }
  // Fiche des commandes : pendant l'introduction des premières batailles, ou sur demande (?)
  function drawControls(y) {
    const rows = helpRows(), w = 460, h = 30 + rows.length * 24;
    ctx.fillStyle = 'rgba(12,14,9,0.88)'; ctx.fillRect(W / 2 - w / 2, y, w, h);
    ctx.strokeStyle = 'rgba(233,196,106,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - w / 2 + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = 'center'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#e9c46a';
    ctx.fillText(device() === 'pad' ? 'CONTROLLER' : device() === 'touch' ? 'TOUCH CONTROLS' : 'CONTROLS', W / 2, y + 18);
    rows.forEach(([k, d], i) => {
      const ry = y + 40 + i * 24;
      ctx.font = '700 12px system-ui, sans-serif';
      const kw = ctx.measureText(k).width + 12;
      ctx.fillStyle = '#2b2f23'; ctx.fillRect(W / 2 - 12 - kw, ry - 13, kw, 18);
      ctx.textAlign = 'right'; ctx.fillStyle = '#efe3bf'; ctx.fillText(k, W / 2 - 18, ry);
      ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#c9c4b2'; ctx.fillText(d, W / 2 + 4, ry);
    });
    return y + h;
  }
  // Rappel des touches sous la mini-carte pendant les trois premières batailles (clavier et manette)
  function drawHints() {
    if (Meta.P.stats.battles >= 3 || device() === 'touch' || ui.pip || state !== 'play') return;
    const tx = device() === 'pad' ? `A: sight · B: smoke ×${player ? player.smoke : 0} · Y: camera · View: x-ray`
      : `${K('sight')}: sight · ${K('smoke')}: smoke ×${player ? player.smoke : 0} · ${K('cam')}: camera · ${K('xray')}: x-ray · ${K('help')}: controls`;
    fitFont(tx, ui.mm.w + 60, 11, 600);
    const w = ctx.measureText(tx).width + 14, x1 = ui.mm.x0 + ui.mm.w + 3, y = ui.mm.bottom + 18;
    ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x1 - w, y - 13, w, 18);
    ctx.textAlign = 'right'; ctx.fillStyle = '#d8d0b4'; ctx.fillText(tx, x1 - 7, y); ctx.globalAlpha = 1;
  }

  // ===================== Boucle =====================
  function screenToWorld(x, y) { if (W3D && cam3.vp) return ray3(x, y, 1.6 + (cam3.tz || 0)); return { x: camX + (x - W / 2) / S, y: camY + (y - H / 2) / S }; }
  function worldToScreen(x, y, z = 1.6) { if (W3D && cam3.vp) return project3(x, y, z + hAt(x, y)); return { x: (x - camX) * S + W / 2, y: (y - camY) * S + H / 2 }; }

  function playerInput() {
    let thr = 0, turn = 0;
    if (held('fwd')) thr += 1;
    if (held('back')) thr -= 1;
    if (held('left')) turn -= 1;
    if (held('right')) turn += 1;
    thr = clamp(thr + ctl.thr, -1, 1); turn = clamp(turn + ctl.turn, -1, 1);
    const pv = pivot(player);
    const m = W3D && cam3.view && !sight.on ? (player.aim3 = aimRay3(mouse.x, mouse.y)) : screenToWorld(mouse.x, mouse.y);
    if (!(W3D && cam3.view && !sight.on)) player.aim3 = { x: m.x, y: m.y, z: 1.5 };
    player.in.throttle = thr; player.in.turn = turn; player.in.brake = held('brake') || ctl.brake;
    player.in.aim = sight.on ? sight.aimYaw : Math.atan2(m.y - pv.y, m.x - pv.x);
    player.in.mg = held('mg') || (sight.on && mouse.right) || ctl.mg;
    player.in.fire = mouse.down || held('fire') || ctl.fire || ctl.tap;
    ctl.tap = false;
  }

  function step(dt) {
    gameTime += dt;
    if (reviveT > 0 && (reviveT -= dt) <= 0) { reviveT = 0; openRevive(); }
    if (player && player.invulnT > 0) player.invulnT -= dt;
    if (state === 'play') waveTime += dt;
    if (state === 'intro') { introT -= dt; if (introT <= 0) { state = 'play'; showMsg('ADVANCE!', '#ffe27a', 1.2); } }
    if (player && !player.dead && !player.ai) playerInput();
    tutStep(dt); crewChatter();
    if (deathCamT > 0) deathCamT -= dt;
    if (killCard && (killCard.life -= dt) <= 0) killCard = null;
    spotTimer -= dt;
    if (spotTimer <= 0) { spotTimer = 0.2; updateSpotting(0.2); }
    for (let i = artyMarks.length - 1; i >= 0; i--) if ((artyMarks[i].life -= dt) <= 0) artyMarks.splice(i, 1);
    if (orders.kind === 'attack' && ((orders.t -= dt) <= 0 || !orders.target || orders.target.dead)) {
      if (orders.target && orders.target.dead) addLog('Target destroyed: free engagement', '#9fd0ff');
      orders = { kind: 'free', pos: null, target: null, t: 0 };
    }
    if ((navT -= dt) <= 0) { navT = 0.5; buildWGrid(0.5); }
    for (const t of tanks) if (!t.dead && t.ai) aiThink(t, dt);
    if (state === 'intro') for (const t of tanks) { t.in.throttle = 0; t.in.turn = 0; t.in.fire = false; }
    for (const t of tanks) updateTank(t, dt);
    tankCollisions(dt);
    updateShells(dt);
    updateBullets(dt);
    OBJ.update(dt);
    updateRunners(dt);
    updateParts(dt);
    updateFlares(dt);
    updateFalls3(dt);
    if (state === 'play' && mode === 'survie') {
      // les épaves refroidies disparaissent (obstacles, fumées et calculs en moins)
      for (let i = tanks.length - 1; i >= 0; i--) {
        const w = tanks[i];
        if (!w.dead || w === player || w.deadT < 45) continue;
        if (W3D0 && w.scar3) { W3D0.free(w.scar3.hull); W3D0.free(w.scar3.turret); }
        tanks.splice(i, 1); seenAt.delete(w);
        for (const a of tanks) if (a.det) a.det.delete(w);
        navT = 0;
      }
      const e = tanks.some(t => t.team === 1 && !t.dead);
      if (player.dead && !revivePending()) { state = 'ending'; endT = 3.5; waveResult = 'lose'; showMsg('TANK DESTROYED', '#ff7a5c', 3, 4); Sfx.sting('lose'); }
      else if (!e) {
        if (nextWaveT <= 0) {
          nextWaveT = 8; resupply(player);
          showMsg(`WAVE ${survWave} REPELLED · resupply`, '#b8e07a', 3, 3); Sfx.sting('win');
          addLog('Resupply: ammunition topped up, modules repaired', '#b8e07a');
        } else if ((nextWaveT -= dt) <= 0) {
          survWave++;
          const k = survivalEnemies(survWave);
          showMsg(`WAVE ${survWave} · ${k} enemy tank${k > 1 ? 's' : ''}`, '#ffb070', 2.5, 3);
        }
      }
    } else if (state === 'play') {
      if (cmdT > 0 && (cmdT -= dt) <= 0) commandSwitch();
      // renforts ennemis : ils débouchent à l'heure prévue
      for (let i = reinf.length - 1; i >= 0; i--) {
        const r = reinf[i];
        if (waveTime < r.at) continue;
        reinf.splice(i, 1);
        const t = makeTank(r.type, 1, r.x, clamp(r.y, 120, WH - 120), Math.PI, false, r.name, r.skill);
        t.ai.laneY = clamp(t.y + rnd(-200, 200), 150, WH - 150);
        tanks.push(t);
        if (!i) addLog(`Radio: enemy reinforcements to the ${r.y < WH / 2 ? 'north' : 'south'}-east`, '#ff9a7a');
      }
      const a = tanks.some(t => t.team === 0 && !t.dead) || revivePending(), e = reinf.length || tanks.some(t => t.team === 1 && !t.dead), ov = a && OBJ.verdict();
      if (ov || !a || !e) { const w = ov ? ov === 'win' : a; state = 'ending'; endT = 3.5; waveResult = w ? 'win' : 'lose'; showMsg(OBJ.endMsg(w) || (w ? 'WAVE WON' : 'WAVE LOST'), w ? '#b8e07a' : '#ff7a5c', 3, 4); Sfx.sting(w ? 'win' : 'lose'); }
    } else if (state === 'ending') {
      endT -= dt;
      if (endT <= 0 && !HitCam.active()) showResult();
    }
  }

  let last = performance.now(), acc = 0, viewerT = 0, errRun = 0, errLogged = false, dbgFreeze = false;
  // ===================== Destruction animée (3D) =====================
  // Arbres qui tombent (tige pivotant sur sa souche), maisons qui s'affaissent et leurs éclats de
  // maçonnerie. Purement visuel : l'état du jeu a déjà changé. Un arbre est ôté de sa cellule de décor
  // pendant sa chute puis y revient couché ; sous une maison qui s'enfonce, les gravats sont déjà là.
  let falls3 = [], debris3 = [], cube3 = null;
  function rotAxis(kx, ky, kz, a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return new Float32Array([c + kx * kx * t, ky * kx * t + kz * s, kz * kx * t - ky * s, 0, kx * ky * t - kz * s, c + ky * ky * t, kz * ky * t + kx * s, 0, kx * kz * t + ky * s, ky * kz * t - kx * s, c + kz * kz * t, 0, 0, 0, 0, 1]);
  }
  // maillage d'un obstacle seul, intact (proche et commun à toutes les distances)
  function soloMesh(o) {
    const B = World3D.buildScene(L(), [Object.assign({}, o, { dead: false, falling: false, hp: Math.max(0, o.hp) })], PX, WW / PX, WH / PX, 0, World3D.obstacleCell(o, PX)).b;
    return [B[0], B[3]].filter(b => b && b.n);
  }
  function fallTree(o) {
    if (!W3D || !scene3On) return;
    const a = -(o.fall || 0);
    falls3.push({ o, mm: soloMesh(o).map(b => W3D.upload(b, false)), x: (o.x + 8) / PX, y: -(o.y + 8) / PX, z: obsBase(o), k: [-Math.sin(a), Math.cos(a), 0], th: 0.04, w: 0, L: 8 * o.size, t: 0 });
    o.falling = true;
  }
  // La maison s'enfonce de 70 % de sa hauteur en 1,2 s en penchant de 3° vers le souffle ; 25 à 40
  // éclats rebondissent puis s'immobilisent ; un nuage de poussière roule au ras du sol.
  function collapse3(o) {
    if (!W3D || !scene3On) return false;
    const bs = soloMesh(o), cx = (o.x + o.w / 2) / PX, cy = -(o.y + o.h / 2) / PX, lv = L();
    let H = 3;
    for (const b of bs) for (let i = 2; i < b.n; i += 10) H = Math.max(H, b.a[i] - obsBase(o));
    const a = Math.random() * TAU;
    falls3.push({ house: true, mm: bs.map(b => W3D.upload(b, false)), x: cx, y: cy, z: obsBase(o), k: [-Math.sin(a), Math.cos(a), 0], H, t: 0 });
    if (!cube3) { const g = new G3.Builder(); g.box(0, 0, 0, 1, 1, 1, [1, 1, 1], 12); cube3 = W3D.upload(g); }
    const wc = G3.hex(lv.wall), rc = G3.hex(lv.roof[0]), hw = o.w / PX / 2, hh = o.h / PX / 2;
    for (let i = 0, n = 25 + Math.floor(Math.random() * 16); i < n; i++) {
      const x = cx + rnd(-hw, hw), y = cy + rnd(-hh, hh), dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1, v = rnd(1, 5), c = Math.random() < 0.7 ? wc : rc, k = rnd(0.6, 1);
      debris3.push({ x, y, z: rnd(0.3, 0.9) * H, vx: dx / l * v, vy: dy / l * v, vz: rnd(2, 6), ax: 0, ay: 0, az: rnd(0, TAU), wx: rnd(-5, 5), wy: rnd(-5, 5), wz: rnd(-3, 3), s: rnd(0.3, 1.2), c: [c[0] * k, c[1] * k, c[2] * k, 0.85], rest: 0 });
    }
    if (debris3.length > 140) debris3.splice(0, debris3.length - 140);
    const dc = G3.hex(lv.dust);
    for (let i = 0; i < 30; i++) { const b = rnd(0, TAU), v = rnd(3, 8); P3({ x: o.x + o.w / 2, y: o.y + o.h / 2, z: rnd(0.3, 1.5), vx: Math.cos(b) * v, vy: Math.sin(b) * v, vz: rnd(0, 0.8), drag: 0.8, wind: 0.6, size: rnd(0.8, 1.5), grow: 1.1, life: rnd(3, 5), c: [dc[0], dc[1], dc[2], 0.28] }); }
    return true;
  }
  // souffles récents qui agitent le feuillage (rendu 3D) : [x, y, force, instant] en mètres
  let blasts3 = [];
  function addBlast3(x, y, k) { if (!W3D) return; blasts3.push([x / PX, -y / PX, k, gameTime]); if (blasts3.length > 12) blasts3.shift(); }
  function blastList3() {
    const tg = cam3.target, now = gameTime;
    blasts3 = blasts3.filter(b => now - b[3] < 2);
    const L4 = blasts3.filter(b => Math.hypot(b[0] - tg[0], b[1] - tg[1]) < 90);
    // char qui roule dans un buisson : poussée continue, selon sa vitesse
    for (const t of tanks) if (!t.dead && Math.abs(t.speed) > 0.5 * PX && inBush(t)) { const P = to3(t.x, t.y); L4.push([P[0], P[1], Math.min(1.2, Math.abs(t.speed) / t.T.speed), now - 0.17]); }
    return L4.sort((a, b) => b[2] * Math.exp(-(now - b[3]) * 3) - a[2] * Math.exp(-(now - a[3]) * 3)).slice(0, 4);
  }
  function fallModel(f) {
    const T = M4.trs(f.x, f.y, f.z || 0, 0), Ti = M4.trs(-f.x, -f.y, -(f.z || 0), 0);
    if (!f.house) return M4.mul(T, M4.mul(rotAxis(f.k[0], f.k[1], 0, f.th), Ti));
    const e = Math.min(1, f.t / 1.2) ** 2;
    return M4.mul(T, M4.mul(rotAxis(f.k[0], f.k[1], 0, 0.052 * e), M4.mul(M4.trs(0, 0, -0.7 * f.H * e, 0), Ti)));
  }
  function updateFalls3(dt) {
    for (const f of falls3) {
      f.t += dt;
      if (f.house) { if (f.t > 1.5) f.done = true; continue; }
      // tige qui pivote sur sa base : θ'' = 3g / (2L) · sin θ, petit rebond à l'impact
      f.w += 1.5 * G / f.L * Math.sin(f.th) * dt; f.th += f.w * dt;
      if (f.th >= Math.PI / 2 - 0.03) {
        f.th = Math.PI / 2 - 0.03;
        if (!f.hit) {
          f.hit = true;
          const o = f.o, cx = o.x + 8 + Math.cos(o.fall) * f.L * 0.75 * PX, cy = o.y + 8 + Math.sin(o.fall) * f.L * 0.75 * PX, tc = G3.hex(L().tree[1]), dc = G3.hex(L().dust);
          for (let i = 0; i < 24; i++) P3({ x: cx + rnd(-3, 3) * PX, y: cy + rnd(-3, 3) * PX, z: rnd(0.5, 3), vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(1, 4), g: 2.5, drag: 1.6, wind: 1, size: rnd(0.06, 0.12), life: rnd(1.5, 3), c: [tc[0], tc[1], tc[2], 1] });
          for (let i = 0; i < 12; i++) { const b = i / 12 * TAU; P3({ x: cx, y: cy, z: 0.3, vx: Math.cos(b) * 3, vy: Math.sin(b) * 3, drag: 0.9, size: 0.7, grow: 1.2, life: rnd(2, 3.5), c: [dc[0], dc[1], dc[2], 0.35] }); }
        }
        f.w = -0.18 * f.w;
        if (Math.abs(f.w) < 0.12 || f.t > 6) f.done = true;
      }
    }
    for (const f of falls3) if (f.done) endFall3(f);
    falls3 = falls3.filter(f => !f.done);
    // tourelle arrachée : elle fume encore une vingtaine de secondes là où elle est tombée
    for (const o of obstacles) if (o.type === 'wreck' && o.smokeT > 0) {
      o.smokeT -= dt;
      if (Math.random() < dt * 4) P3({ x: o.x + o.w / 2, y: o.y + o.h / 2, z: 0.6, vz: rnd(1, 2), drag: 0.4, g: -0.3, wind: 1.4, size: rnd(0.4, 0.7), grow: 0.7, life: rnd(4, 7), c: [0.12, 0.115, 0.11, 0.5 * Math.min(1, o.smokeT / 5)] });
    }
    // éclats : pesanteur, rebonds amortis, frottement au sol, puis immobiles
    for (const d of debris3) {
      if (d.rest > 1) continue;
      d.vz -= G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.ax += d.wx * dt; d.ay += d.wy * dt; d.az += d.wz * dt;
      if (d.z < d.s * 0.4) {
        d.z = d.s * 0.4; d.vz = Math.abs(d.vz) > 1 ? -d.vz * 0.2 : 0;
        const fr = Math.exp(-6 * dt); d.vx *= fr; d.vy *= fr; d.wx *= fr; d.wy *= fr; d.wz *= fr;
        if (Math.hypot(d.vx, d.vy, d.vz) < 0.2) d.rest += dt;
      }
    }
  }
  function endFall3(f) {
    for (const m of f.mm) W3D0.free(m);
    if (f.o) { f.o.falling = false; dirty3Obs(f.o); }
  }
  function clearFalls3() { for (const f of falls3) endFall3(f); falls3 = []; debris3 = []; }

  // Résolution dynamique du champ de bataille 3D. Moyenne glissante de la durée des images : au-delà
  // de 22 ms pendant 2 s, la scène est rendue plus petite (étirée par le CSS), par pas de 10 % jusqu'à
  // 60 % ; à 60 images/s stables, elle remonte d'un pas. Une remontée suivie d'une rechute en moins de
  // 4 s double l'attente avant la suivante, pour ne pas osciller. Si trois pas de baisse (deux fois
  // moins de pixels) n'ont rien gagné, c'est le processeur qui limite : la résolution revient et y reste.
  const dyn = { k: 1, ema: 16.7, slow: 0, fast: 0, upWait: 3, upAt: -1e9, floor: 0.6, ref: null };
  function dynRes(ms, dt) {
    dyn.ema += (ms - dyn.ema) * 0.08;
    if (dyn.ema > 22) { dyn.slow += dt; dyn.fast = 0; } else if (dyn.ema < 18) { dyn.fast += dt; dyn.slow = 0; } else dyn.slow = dyn.fast = 0;
    const now = performance.now();
    if (dyn.slow > 2 && dyn.k > dyn.floor) {
      if (!dyn.ref) dyn.ref = { k: dyn.k, ema: dyn.ema };
      else if (dyn.ref.k - dyn.k > 0.25 && dyn.ema > dyn.ref.ema * 0.9) { dyn.k = dyn.floor = dyn.ref.k; dyn.ref = null; dyn.slow = 0; return; }
      if (now - dyn.upAt < 4000) dyn.upWait = Math.min(60, dyn.upWait * 2);
      dyn.k = Math.round(dyn.k * 10 - 1) / 10; dyn.slow = 0; dyn.ema = 20;
    } else if (dyn.fast > dyn.upWait && dyn.k < 1) {
      dyn.k = Math.round(dyn.k * 10 + 1) / 10; dyn.fast = 0; dyn.upAt = now; dyn.ref = null;
    }
  }
  // nouvelle qualité ou nouvelle carte : la mesure repart de zéro (la résolution acquise est gardée)
  function dynReset(full) { if (full) { dyn.k = 1; dyn.upWait = 3; } dyn.floor = 0.6; dyn.ref = null; dyn.slow = dyn.fast = 0; }
  // Boucle principale : l'image suivante est demandée d'abord, et une exception n'arrête rien. Elle
  // est journalisée une fois ; si elle se répète 30 images de suite, retour au QG.
  function frame(now) {
    requestAnimationFrame(frame);
    try { frameBody(now); errRun = 0; } catch (e) {
      if (!errLogged) { errLogged = true; console.error(e); }
      if (++errRun > 30) {
        errRun = 0;
        if (state !== 'menu') { console.error('Repeated errors, back to menu', e); toast('Something went wrong, back to HQ'); try { toMenu(); } catch (e2) { console.error(e2); } }
      }
    }
  }
  // Simulation du métal (caméra d'impact, banc d'essai) : elle prend le temps qui reste dans l'image
  // (16,7 ms visées), entre 1 et 6 ms (jusqu'à max quand rien d'autre ne tourne, comme dans le menu)
  let metalMs = 0, metalPrev = 0;
  function metalRun(sim, ms, max) { const t0 = performance.now(); sim.run(clamp(16.7 - (ms - metalPrev) - 2, 1, max)); metalMs += performance.now() - t0; }
  function frameBody(now) {
    const ms = now - last, dt = Math.min(0.1, ms / 1000);
    pollPad(dt);
    metalPrev = metalMs; metalMs = 0;
    last = now;
    if (W3D && state === 'play' && ms > 0 && ms < 1000) dynRes(Math.min(ms, 100), ms / 1000);
    if ((state === 'intro' || state === 'play' || state === 'ending') && !dbgFreeze) {
      // ralenti bref quand le joueur détruit un char (réglable, coupé par les mouvements réduits), sauf en
      // jeu automatique ; la caméra d'impact ne ralentit plus la bataille et s'efface sous le feu
      const slow = slowT > 0 && !AUTO ? 0.3 : 1;
      slowT -= dt;
      if (HitCam.active() && threatened()) HitCam.stop();
      acc += dt * timeScale * slow * ffK;
      let n = 0;
      while (acc >= STEP && n++ < 40) { step(STEP); acc -= STEP; }
      if (n >= 40) acc = 0;
      deadBarTick();
      HitCam.update(dt);
      trauma = Math.max(0, trauma - 1.6 * dt); shakeT += dt; cam3.kick *= Math.exp(-dt / 0.25);
      const hev = HitCam.ev();
      if (hev && hev.metal && !hev.metal.st.done) metalRun(hev.metal, ms, 6);
    }
    if (state === 'menu' && bench.sim && !bench.sim.st.done) metalRun(bench.sim, ms, 14);
    if (state === 'menu' && R3 && !R3.lost) { viewerT += dt; renderViewer(dt); }
    if (state === 'menu') renderBench();
    // le champ de bataille n'est dessiné qu'en jeu : en pause, réparation, résultats ou pendant la
    // publicité de sortie, la dernière image reste affichée (redessinée une fois après un
    // redimensionnement) ; dans le menu, rien n'est dessiné derrière la vitrine
    if (groundCv && state !== 'menu' && (inBattle() || redraw)) { render(inBattle() ? dt : 0); redraw = false; }
    const live = player && !player.dead && inBattle();
    // moteur au régime réel et selon sa charge ; chenilles à leur vitesse moyenne, pivot compris
    Sfx.engine(live ? player.rpm : -1, live ? player.load : 0, live ? player.gear : 0);
    Sfx.tracks(live ? Math.abs(player.speed) / PX + Math.abs(player.turnRate) * player.T.D.B / 2 : -1, live ? groundAt(player.x, player.y).type.id : '');
    // moteur de tourelle, ou pompe hydraulique qui chante avec le régime
    Sfx.turret(live ? Math.abs(player.turretRate) / player.T.tturn : 0, live && player.T.D.trav.kind === 'hyd' && modOk(player, 'engine') ? player.rpm : undefined);
    battleSound(dt, live);
  }
  // Ambiance de bataille : vue intérieure dans la lunette, moteurs des trois chars les plus proches qui
  // roulent (à moins de 500 m, vus ou non) et intensité de la musique : ennemis repérés, obus qui arrivent
  // sur le joueur, feu subi, équipage décimé
  let sndT = 0;
  function battleSound(dt, live) {
    Sfx.setInterior(live && sight.on);
    if ((sndT -= dt) > 0) return;
    sndT = 0.25;
    const near = [];
    let n = 0;
    if (inBattle()) for (const t of tanks) {
      if (t === player || t.dead) continue;
      if (live && t.team !== player.team && (player.knows || spotted[0]).has(t)) n++;
      if (Math.abs(t.speed) < 0.5 * PX) continue;
      const p = listenerDist(t.x, t.y);
      if (p.d < 500) near.push({ id: t.id, type: t.T.id, d: p.d, pan: p.pan, rpm: t.rpmA, k: Math.min(1, Math.abs(t.speed) / t.T.speed) });
    }
    Sfx.others(near.sort((a, b) => a.d - b.d).slice(0, 3));
    const I = live ? Math.max(n / 3, shells.some(s => s.warned) ? 0.8 : 0, player.underFire > 0 ? 0.7 : 0, crewFrac(player) < 0.6 ? 0.6 : 0) : 0;
    Sfx.setIntensity(I, HitCam.active());
  }

  // ===================== Rendu =====================
  function camFocus() {
    if (player && (!player.dead || deathCamT > 0)) return player;
    const allies = tanks.filter(t => t.team === 0 && !t.dead);
    if (!allies.length) return player;
    return allies[specIdx % allies.length];
  }

  // ===================== Rendu 3D =====================
  // fogH : nappe de brume basse (densité au sol par mètre, décroissance avec l'altitude) ; cloud : ciel
  // couvert ; wx : météo ; grade : étalonnage de l'image (gain par canal, relèvement des noirs, saturation)
  const ENV = [
    { az: 135, el: 36, sunCol: [1.9, 1.75, 1.5], skyCol: [0.2, 0.25, 0.34], bounce: [0.13, 0.12, 0.08], horizon: [0.5, 0.58, 0.68], zenith: [0.12, 0.24, 0.5], fogD: 0.0042, fogH: [0.0015, 0.1], cloud: 0.45, grade: { gain: [1.03, 1.0, 0.94], sat: 1.05 } },
    { az: 120, el: 28, sunCol: [1.5, 1.42, 1.2], skyCol: [0.18, 0.23, 0.27], bounce: [0.09, 0.12, 0.06], horizon: [0.4, 0.47, 0.47], zenith: [0.14, 0.22, 0.33], fogD: 0.0075, fogH: [0.006, 0.3], cloud: 0.8, wx: { kind: 'rain', rate: 0.7, chance: 0.5 }, grade: { gain: [0.97, 1.0, 0.98], sat: 0.9 } },
    { az: 150, el: 40, sunCol: [1.05, 1.0, 0.96], skyCol: [0.27, 0.28, 0.3], bounce: [0.12, 0.11, 0.1], horizon: [0.4, 0.4, 0.41], zenith: [0.24, 0.26, 0.3], fogD: 0.0065, fogH: [0.004, 0.08], cloud: 0.85, wx: { kind: 'ash', rate: 0.35 }, grade: { gain: [1, 0.99, 0.97], lift: 0.02, sat: 0.7 } },
    { az: 160, el: 55, sunCol: [2.3, 2.0, 1.6], skyCol: [0.24, 0.26, 0.32], bounce: [0.26, 0.2, 0.12], horizon: [0.72, 0.64, 0.5], zenith: [0.17, 0.32, 0.58], fogD: 0.0038, fogH: [0.002, 0.2], cloud: 0.12, wx: { kind: 'sand', rate: 1, wave: 2 }, grade: { gain: [1.05, 1.0, 0.92], sat: 1.08 } },
    { az: 210, el: 34, sunCol: [0.28, 0.33, 0.5], skyCol: [0.03, 0.045, 0.08], bounce: [0.04, 0.05, 0.07], horizon: [0.02, 0.03, 0.06], zenith: [0.004, 0.006, 0.016], fogD: 0.011, snow: 1, fogH: [0.008, 0.35], cloud: 0.5, wx: { kind: 'snow', rate: 0.8 }, grade: { gain: [0.9, 0.95, 1.1], sat: 0.6 } },
  ];
  // Météo : vitesse de chute (m/s), couleur, taille (m), traînée (s), opacité. Le vent les pousse.
  const WEATHER = {
    rain: { fall: 9, drift: 0.5, col: [0.72, 0.76, 0.8], a: 0.3, size: 0.008, px: 0.9, len: 0.03, streak: true, wet: 0.7 },
    snow: { fall: 1.1, drift: 0.4, col: [0.93, 0.95, 0.98], a: 0.9, size: 0.04, px: 2.2, lum: 1.8 },
    sand: { fall: 0.4, drift: 0, gust: 8, col: null, a: 0.25, size: 0.01, px: 1, len: 0.05, streak: true },
    ash: { fall: 0.5, drift: 0.3, col: [0.26, 0.25, 0.24], a: 0.75, size: 0.03, px: 1.6 },
  };
  // Heure du jour selon la vague : matin (soleil bas à l'est, lumière chaude), milieu de journée, fin
  // d'après-midi (soleil rasant, orangé). La nuit, seule la lune tourne.
  const DAYTIME = [
    { el: 16, az: -45, sun: [0.95, 0.78, 0.62], hor: [1.06, 0.96, 0.88], sky: 0.85, cloud: 0.8 },
    { el: 0, az: 0, sun: [1, 1, 1], hor: [1, 1, 1], sky: 1, cloud: 1 },
    { el: 11, az: 50, sun: [1.0, 0.66, 0.42], hor: [1.14, 0.9, 0.74], sky: 0.8, cloud: 1.2 },
  ];
  function setEnv3() {
    const e = ENV[levelIdx], lv = L(), w = DAYTIME[(mode === 'survie' ? survWave : waveIdx) % 3], d = lv.night ? DAYTIME[1] : w;
    const el = (d.el ? Math.min(e.el, d.el) : e.el) * D2R, az = (e.az + w.az) * D2R, mul = (a, b) => a.map((v, i) => v * b[i]);
    let hor = mul(e.horizon, d.hor), sunCol = mul(e.sunCol, d.sun), fogD = e.fogD * 0.6, weather = null, wet = 0;
    // météo de la vague : tirée au hasard (chance) ou réservée à une vague ; la tempête de sable
    // épaissit la brume, la teinte de poussière et voile le soleil
    const wx = e.wx, wi = (mode === 'survie' ? survWave : waveIdx) % 3;
    if (wx && (wx.wave == null || wx.wave === wi) && (!wx.chance || Math.random() < wx.chance)) {
      const k = WEATHER[wx.kind], wl = Math.hypot(WIND.x, WIND.y) || 1;
      if (wx.kind === 'sand') { const dc = G3.hex(lv.dust); fogD *= 2.2; hor = hor.map((v, i) => v * 0.4 + dc[i] * 0.6); sunCol = sunCol.map(v => v * 0.6); }
      const lit = (k.col || G3.hex(lv.dust)).map((c, i) => Math.min(1, Math.pow(c * c * (e.skyCol[i] * 1.3 + sunCol[i] * 0.4) * (k.lum || 1), 1 / 2.2)));
      weather = { vel: [WIND.x * k.drift + (k.gust || 0) * WIND.x / wl, -WIND.y * k.drift - (k.gust || 0) * WIND.y / wl, -k.fall], col: [...lit, k.a], size: k.size, px: k.px, len: k.len, streak: !!k.streak, rate: wx.rate };
      wet = k.wet || 0;
    }
    W3D.setEnv({
      sun: [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)], sunCol, skyCol: e.skyCol.map(v => v * d.sky), bounce: e.bounce,
      fogCol: hor, fogD, horizon: hor, zenith: e.zenith, snow: e.snow || 0, fogH: e.fogH, cloud: clamp(e.cloud * w.cloud, 0, 1),
      wind: [WIND.x, -WIND.y], night: lv.night ? 1 : 0, outer: G3.hex(lv.ground[0]), weather, wet, grade: e.grade,
    });
  }

  let CMDR3 = null; const RAYTRI = {}, ADD3 = {}, ADDR = {};
  // maillages du blindage additionnel, construits à la demande (jeu et vitrine)
  function addon3(id, lv) {
    const k = id + lv;
    if (!ADD3[k] && W3D) { const b = TankModels.addonArmor(id, lv); ADD3[k] = { hull: W3D.upload(b.hull), turret: W3D.upload(b.turret) }; }
    return ADD3[k];
  }
  function addonR3(id, lv) {
    const k = id + lv;
    if (!ADDR[k] && R3) { const b = TankModels.addonArmor(id, lv); ADDR[k] = { hull: R3.upload(b.hull), turret: R3.upload(b.turret) }; }
    return ADDR[k];
  }
  // décor 3D : cellules statiques (W3D.putCell), et cellules à reconstruire après une destruction
  let W3D = null, MESH3 = {}, scene3On = false, scene3T = 0;
  const dirty3 = new Set();
  function dirty3Obs(o) { if (W3D0 && scene3On) dirty3.add(World3D.obstacleCell(o, PX)); }
  // modes de caméra (touche C) : hauteur, recul et part du regard portée vers la visée
  const CAM_MODES = [
    { name: 'Chase camera', pitch: 0.52, dist: 46, ahead: 0.18, look: 0.3 },
    { name: 'Tactical camera', pitch: 1.15, dist: 90, ahead: 0, look: 0.25 },
    { name: 'Close camera', pitch: 0.48, dist: 24, ahead: 0.14, look: 0.3 },
  ];
  const cam3 = { mode: 0, lx: 0, ly: 0, yaw: 0, pitch: 0.52, dist: 46, off: 0, eye: [0, 0, 40], target: [0, 0, 0], view: null, vp: null, init: false, drag: null, kick: 0 };
  const dirtyTiles = new Set();
  try {
    const c3 = document.getElementById('game3d');
    if (c3 && typeof World3D !== 'undefined' && !dq('2d')) {
      W3D = World3D.create(c3, { q: QL().r3, msaa: !QL().lite });
      if (W3D) W3D.q = QL();
      if (W3D) for (const id of Object.keys(TYPES)) { const b = TankModels.build(id, true); MESH3[id] = { wheel: W3D.upload(b.wheel), wheels: b.wheels, hull: W3D.upload(b.hull), turret: W3D.upload(b.turret), body: W3D.upload(b.turretBody), gun: W3D.upload(b.gun), gunPivot: b.gunPivot }; RAYTRI[id] = { hull: b.hull.v, turret: b.turret.v }; }
      if (W3D) {
        // chef de char debout dans sa coupole : buste en vareuse, bras, tête, calot et écouteurs
        const g = new G3.Builder();
        g.cyl([0, 0, 0], [0, 0, 0.42], 0.17, 0.19, 10, '#3d4236', 7);
        g.box(0, 0.08, -0.42, 0.12, 0.11, 0.84, '#34382e', 7); g.box(0, -0.08, -0.42, 0.12, 0.11, 0.84, '#34382e', 7);
        g.box(0.02, 0.2, 0.36, 0.1, 0.09, 0.3, '#3d4236', 7); g.box(0.02, -0.2, 0.36, 0.1, 0.09, 0.3, '#3d4236', 7);
        g.box(0.12, 0.18, 0.5, 0.18, 0.08, 0.08, '#3d4236', 7); g.box(0.12, -0.18, 0.5, 0.18, 0.08, 0.08, '#3d4236', 7);
        g.cyl([0, 0, 0.42], [0, 0, 0.47], 0.06, 0.06, 8, '#b48a6a', 7);
        g.sphere([0.01, 0, 0.56], 0.095, 0.085, 0.11, 10, '#c49a78', 7);
        g.cyl([-0.01, 0, 0.62], [-0.01, 0, 0.68], 0.1, 0.095, 10, '#1e1f1c', 7);
        g.box(0, 0.09, 0.57, 0.05, 0.03, 0.06, '#1a1a1a', 7); g.box(0, -0.09, 0.57, 0.05, 0.03, 0.06, '#1a1a1a', 7);
        CMDR3 = W3D.upload(g);
      }
    }
  } catch (e) { console.warn('3D rendering unavailable, switching to 2D', e); W3D = null; }
  if (!W3D) { const c3 = document.getElementById('game3d'); if (c3) c3.style.display = 'none'; }
  // Perte du contexte WebGL du champ de bataille : pause, puis tout est renvoyé au GPU à son retour ;
  // s'il ne revient pas vite, la bataille continue en vue 2D (et repasse en 3D au retour)
  const W3D0 = W3D;
  let lostT = 0;
  if (W3D0) {
    W3D0.onLost = () => {
      autoPause();
      if (state !== 'menu') toast('Graphics reset, restoring the 3D view…');
      clearTimeout(lostT);
      lostT = setTimeout(() => { if (W3D0.lost && W3D) use2D(true); }, 4000);
    };
    W3D0.onRestored = () => { clearTimeout(lostT); if (!W3D) use2D(false); reupload3D(); if (state !== 'menu') toast('3D view restored'); };
  }
  function use2D(on) {
    const c3 = document.getElementById('game3d');
    if (on) { setSight(false); W3D = null; c3.style.display = 'none'; if (state !== 'menu') toast('3D unavailable: switching to the 2D view'); }
    else { W3D = W3D0; c3.style.display = ''; cam3.init = false; }
    redraw = true;
  }
  // après un retour du contexte : sol, décor et cicatrices de blindage renvoyés au GPU
  function reupload3D() {
    if (groundCv) W3D.setGround(groundCv, WW / PX, WH / PX);
    dirtyTiles.clear();
    if (groundCv && scene3On) build3DScene();
    for (const t of tanks) if (t.scar3) { W3D.free(t.scar3.hull); W3D.free(t.scar3.turret); t.scar3 = null; t.scarDirty = true; t.scarT = 0; }
    redraw = true;
  }
  const to3 = (x, y, z = 0) => [x / PX, -y / PX, z];
  function markDirty(x, y, r) {
    const T = 256;
    for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y + r) / T); ty++) for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
      if (tx >= 0 && ty >= 0 && tx * T < WW && ty * T < WH) dirtyTiles.add(ty * 64 + tx);
    }
  }
  function setup3D() {
    if (!W3D) return;
    setEnv3();
    W3D.setGround(groundCv, WW / PX, WH / PX);
    dirtyTiles.clear();
    build3DScene();
    cam3.init = false;
  }
  // gros décors : sommets non gardés côté W3D (reconstruits ici après une perte du contexte)
  // sol, herbe et lisière (jamais reconstruits), buissons, puis obstacles par cellule
  function build3DScene() {
    W3D.clearCells();
    const lv = L(), wm = WW / PX, hm = WH / PX, seed = 1000 + levelIdx * 7919;
    World3D.setTerrain(terra, PX);
    for (const [k, c] of World3D.buildGround(terra, PX, wm, hm)) W3D.putCell(k, c);
    W3D.putCell('w', World3D.buildWater(terra, PX, lv)); W3D.putCell('br', World3D.buildBridges(terra, PX));
    for (const [k, c] of World3D.buildScene(lv, obstacles, PX, wm, hm, seed, null, true)) W3D.putCell('x' + k, c);
    for (const [k, c] of World3D.buildBushes(lv, bushes, PX, 4242 + levelIdx * 131, QL().leaf)) W3D.putCell('b' + k, c);
    for (const [k, c] of World3D.buildScene(lv, obstacles, PX, wm, hm, seed)) W3D.putCell('s' + k, c);
    dirty3.clear(); scene3On = true;
  }
  // une cellule abîmée à la fois, la plus proche de la caméra d'abord
  function rebuild3DCell() {
    let best = null, bd = 1e18;
    for (const k of dirty3) { const x = ((k % 256) - 63.5) * 32 - cam3.tx, y = -(Math.floor(k / 256) - 63.5) * 32 - cam3.ty, d = x * x + y * y; if (d < bd) { bd = d; best = k; } }
    dirty3.delete(best);
    W3D.putCell('s' + best, World3D.buildScene(L(), obstacles, PX, WW / PX, WH / PX, 0, best));
  }
  // rayon depuis la caméra à travers un point de l'écran, coupé par le plan z = h
  function ray3(sx, sy, h) {
    const v = cam3.view, fy = Math.tan(cam3.fov / 2), fx = fy * W / H;
    const nx = (sx / W) * 2 - 1, ny = 1 - (sy / H) * 2;
    const r = [v[0], v[4], v[8]], u = [v[1], v[5], v[9]], f = [-v[2], -v[6], -v[10]];
    const d = [f[0] + r[0] * nx * fx + u[0] * ny * fy, f[1] + r[1] * nx * fx + u[1] * ny * fy, f[2] + r[2] * nx * fx + u[2] * ny * fy];
    const e = cam3.eye;
    let t = (h - e[2]) / (d[2] || -1e-6);
    if (t < 0) t = 2000;
    return { x: (e[0] + d[0] * t) * PX, y: -(e[1] + d[1] * t) * PX };
  }
  // Rayon souris → premier objet touché en 3D : char (caisse puis tourelle), obstacle à sa hauteur,
  // ou sol. Permet de viser haut ou bas : bas de caisse, masque, tourelle, ou le sol devant un char.
  function slab(o, d, mn, mx) {
    let t0 = 0, t1 = 1e9;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; continue; }
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const q = a; a = b; b = q; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function aimRay3(sx, sy) {
    const v = cam3.view, fy = Math.tan(cam3.fov / 2), fx = fy * W / H;
    const nx = (sx / W) * 2 - 1, ny = 1 - (sy / H) * 2;
    const r = [v[0], v[4], v[8]], u = [v[1], v[5], v[9]], f = [-v[2], -v[6], -v[10]];
    const e = cam3.eye;
    const dm = [f[0] + r[0] * nx * fx + u[0] * ny * fy, f[1] + r[1] * nx * fx + u[1] * ny * fy, f[2] + r[2] * nx * fx + u[2] * ny * fy];
    const O = [e[0] * PX, -e[1] * PX, e[2]], D = [dm[0] * PX, -dm[1] * PX, dm[2]];
    let best = 400, hit = null;
    const tg = terra ? terra.cut(O[0], O[1], O[2], O[0] + D[0] * 400, O[1] + D[1] * 400, O[2] + D[2] * 400) : -1;
    if (tg >= 0) best = tg * 400; else if (dm[2] < 0 && !terra) best = -e[2] / dm[2];
    for (const o of obstacles) {
      if (o.dead) continue;
      const t = slab(O, D, [o.x, o.y, obsBase(o)], [o.x + o.w, o.y + o.h, obsTop(o)]);
      if (t >= 0 && t < best) { best = t; hit = null; }
    }
    for (const t of tanks) {
      if (t === player || (!t.dead && !visibleToPlayer(t))) continue;
      const c = Math.cos(t.angle), sn = Math.sin(t.angle), qx = O[0] - t.x, qy = O[1] - t.y;
      const lo = [qx * c + qy * sn, -qx * sn + qy * c, O[2] - t.gz], ld = [D[0] * c + D[1] * sn, -D[0] * sn + D[1] * c, D[2]];
      const hl = t.T.len / 2, hw = t.T.wid / 2, Sd = t.T.S;
      let tt = slab(lo, ld, [-hl, -hw, 0], [hl, hw, Sd.ht]);
      if (t.T.tb && !t.turretGone) {
        const tc = Math.cos(t.turret), ts = Math.sin(t.turret), px = lo[0] - t.T.pivX, py = lo[1] - t.T.pivY;
        const to = [px * tc + py * ts, -px * ts + py * tc, lo[2]], td = [ld[0] * tc + ld[1] * ts, -ld[0] * ts + ld[1] * tc, ld[2]], B = t.T.tb;
        const t2 = slab(to, td, [B.x0, B.y0, Sd.ht], [B.x1, B.y1, t.T.I.totalH]);
        if (t2 >= 0 && (tt < 0 || t2 < tt)) tt = t2;
      }
      if (tt >= 0 && tt < best) { best = tt; hit = t; }
      // chef de char debout dans sa coupole : on peut le viser
      if (t.hatch && !t.dead && roleOk(t, 'commander')) {
        const hp = hatchPos(t), r = 0.22 * PX;
        const t3 = slab(O, D, [hp.x - r, hp.y - r, t.gz + hp.z0], [hp.x + r, hp.y + r, t.gz + hp.z0 + 0.62]);
        if (t3 >= 0 && t3 < best) { best = t3; hit = t; }
      }
    }
    const x = O[0] + D[0] * best, y = O[1] + D[1] * best;
    return { x, y, z: Math.max(hAt(x, y), O[2] + D[2] * best), tank: hit };
  }
  function project3(x, y, z) {
    const q = G3.M4.apply(cam3.vp, to3(x, y, z));
    return { x: (q[0] * 0.5 + 0.5) * W, y: (1 - (q[1] * 0.5 + 0.5)) * H, behind: q[3] < 0 };
  }
  function setSight(on) {
    on = !!(on && W3D && player && !player.dead && (state === 'play' || state === 'intro' || state === 'ending'));
    if (on === sight.on) return;
    sight.on = on;
    if (on) {
      sight.yaw = sight.aimYaw = player.angle + player.turret; sight.pitch = sight.aimPitch = -0.004; sight.cx = sight.cy = 0; sight.probe = null;
      lockPointer(); tutDone('sight');
      showMsg(`Gunner sight · ×${MAGS[sight.mag]}`, '#bcd8ff', 1);
    }
  }
  // préréglage réaliste : hausse réglée à la main sur le tambour des distances, par pas de 50 m
  function setRange(dir) { sight.rangeSet = clamp(sight.rangeSet + dir * 50, 0, 2000); }
  // estimation de distance du chef : vraie distance ± 8 % (sorti), 15 % (fermé), 25 % (chef hors de
  // combat), arrondie à 50 m, après 1,5 s de visée sur le même char
  function cmdEstimate(pr) {
    const t = pr && pr.kind === 'tank' && !pr.tank.dead ? pr.tank : null;
    if (t !== sight.estTank) { sight.estTank = t; sight.estT = gameTime; sight.est = null; }
    if (!t || gameTime - sight.estT < 1.5) return null;
    if (sight.est == null) {
      const sg = !roleOk(player, 'commander') ? 0.25 : player.hatch ? 0.08 : 0.15;
      sight.est = Math.max(50, Math.round(pr.dist * RK * (1 + gauss() * sg) / 50) * 50);
    }
    return sight.est;
  }
  // Lunette du tireur, coaxiale au canon, à gauche du masque. Sans stabilisateur (aucun char de
  // l'époque n'en avait), l'image tremble quand le char roule ou pivote, et saute au départ du coup.
  function sightCam(dt) {
    const T = player.T, Sd = T.S, pv = pivot(player), ta = player.angle + player.turret;
    // Curseur incrusté dans la lunette : il désigne le point visé, la vue le suit en douceur, et la
    // tourelle suit à sa propre vitesse. Curseur verrouillé : la vue recentre le curseur. Sans
    // verrouillage (page intégrée) : visée libre au centre, la vue ne pivote que vers les bords.
    cam3.fov = 2 * Math.atan(Math.tan(0.49) / MAGS[sight.mag]);
    const ppr = (H / 2) / Math.tan(cam3.fov / 2), R = sightR() * 0.92, locked = relAim();
    if (!locked) { sight.cx = mouse.x - W / 2; sight.cy = mouse.y - H / 2; }
    const rl = Math.hypot(sight.cx, sight.cy);
    if (rl > R) { sight.cx *= R / rl; sight.cy *= R / rl; }
    let ay = Math.atan(sight.cx / ppr), ap = -Math.atan(sight.cy / ppr);
    if (locked) {
      const k = 1 - Math.exp(-3 * dt);
      sight.yaw += ay * k; sight.pitch += ap * k; ay *= 1 - k; ap *= 1 - k;
      sight.cx = Math.tan(ay) * ppr; sight.cy = -Math.tan(ap) * ppr;
    } else {
      const ex = Math.max(0, Math.hypot(sight.cx, sight.cy) / R - 0.6) / 0.4;
      sight.yaw += ay * ex * 2.5 * dt; sight.pitch += ap * ex * 2.5 * dt;
    }
    const lo = T.D.elev[0] * D2R, hi = T.D.elev[1] * D2R;
    sight.pitch = clamp(sight.pitch, lo, hi);
    sight.aimYaw = sight.yaw + ay; sight.aimPitch = clamp(sight.pitch + ap, lo, hi);
    // la lunette est liée au canon : la vue montre l'écart entre le tube et le point visé (tangage de la
    // caisse, retard du volant de pointage), penche avec le roulis et sursaute au départ du coup
    const so = shakeOff(), yaw = sight.yaw + so.yaw, pitch = sight.pitch + (player.elevErr || 0) + player.recoil * 0.03 + so.pitch, roll = gunCant(player) + so.roll;
    sight.gunPitch = sight.aimPitch;
    const fx = pv.x + Math.cos(ta) * 0.9 * PX - Math.sin(ta) * 0.35 * PX, fy = pv.y + Math.sin(ta) * 0.9 * PX + Math.cos(ta) * 0.35 * PX;
    sight.z0 = Sd.gun.z + 0.08 + player.gz;
    const eye = to3(fx, fy, sight.z0), cp = Math.cos(pitch);
    const dir = [Math.cos(yaw) * cp, -Math.sin(yaw) * cp, Math.sin(pitch)];
    const tgt = [eye[0] + dir[0] * 60, eye[1] + dir[1] * 60, eye[2] + dir[2] * 60];
    cam3.eye = eye; cam3.target = tgt;
    cam3.view = G3.M4.lookAt(eye, tgt, [-Math.sin(yaw) * Math.sin(roll), -Math.cos(yaw) * Math.sin(roll), Math.cos(roll)]);
    cam3.vp = G3.M4.mul(G3.M4.persp(cam3.fov, W / H, 0.25, 2400), cam3.view);
    camX = player.x; camY = player.y;
    // la vue extérieure reprendra derrière le char
    const P = to3(player.x, player.y, 0); cam3.tx = P[0]; cam3.ty = P[1]; cam3.yaw = -player.angle;
    sight.probeT -= dt;
    if (sight.probeT <= 0) { sight.probeT = 0.1; sight.probe = sightProbe(); sight.dust = ownVeil(player) >= 0.45; }
  }
  // Ce que vise la lunette : premier obstacle, char ou point du sol sur la ligne de visée,
  // et, sur un char, la plaque touchée et la perforation attendue
  // a : direction ; z0 : hauteur de départ (m) ; sv : montée de la ligne de visée en m par px
  function sightProbe(a = sight.aimYaw, z0 = sight.z0, sv = Math.tan(sight.gunPitch) / PX) {
    const pv = pivot(player), ux = Math.cos(a), uy = Math.sin(a), L0 = 1600, key = player.shell, sb = Ballistics.shell(player.T.id, key);
    const kin = !sb.heat && !sb.he;
    let best = { t: 1, kind: 'sky' };
    const tg = terra.cut(pv.x, pv.y, z0, pv.x + ux * L0, pv.y + uy * L0, z0 + sv * L0);
    if (tg >= 0) best = { t: tg, kind: 'ground' };
    // obstacles sur la ligne : le premier qui arrête l'obus la termine ; un perforant traverse les murs et
    // les troncs qu'il perce, en y perdant de la vitesse (comme hitObstacle)
    const hits = [];
    for (const o of obstacles) {
      if (o.dead) continue;
      const h = segAABB(pv.x, pv.y, ux * L0, uy * L0, o.x, o.y, o.x + o.w, o.y + o.h);
      if (h && h.t < best.t && z0 + sv * h.t * L0 <= obsTop(o)) hits.push({ t: h.t, o, h });
    }
    hits.sort((p, q) => p.t - q.t);
    let V = null, walls = [];
    for (const { t: k, o, h } of hits) {
      let eq = obsEq(o), cosI = Math.max(0.2, Math.abs(ux * h.nx + uy * h.ny));
      if (o.type === 'tree') {
        const z = z0 + sv * k * L0 - obsBase(o), miss = Math.abs((o.x + 8 - pv.x) * -uy + (o.y + 8 - pv.y) * ux) / PX, r = 0.3 * o.size + sb.cal / 2000;
        // un perforant ne s'arrête que sur le tronc ; la fusée d'un explosif fonctionne aussi dans le feuillage
        const trunk = z < 3 * o.size && miss < r;
        if (!trunk && (kin || z < 2.2 * o.size)) continue;
        eq *= Math.sqrt(Math.max(0.05, 1 - Math.pow(miss / r, 2))); cosI = 1;
      }
      const los = eq / cosI * (o.type === 'building' ? 2 : 1);
      if (V == null) V = Ballistics.velAt(sb, k * L0 * RK);
      if (!kin || !(Ballistics.penVel(sb, V) > los)) { best = { t: k, kind: 'obstacle', o }; break; }
      const vl = Ballistics.vLimit(sb, los);
      V = Math.sqrt(Math.max(1, V * V - vl * vl)); walls.push({ t: k, los });
    }
    for (const t of tanks) {
      if (t === player || (!t.dead && !visibleToPlayer(t))) continue;
      const c = tankCand(t, pv.x, pv.y, ux * L0, uy * L0, z0, z0 + sv * L0);
      if (c && c.t < best.t) best = { t: c.t, kind: 'tank', tank: t, h: c };
    }
    const dist = best.t * L0;
    best.dist = dist;
    if (best.kind === 'tank' && !best.tank.dead) {
      const t = best.tank, h = best.h;
      const ll = Math.hypot(h.ldx, h.ldy) || 1, desc = Ballistics.descent(sb, dist * RK);
      const pp = platePick(t, h, tiltIn(t, norm3([h.ldx / ll, -h.ldy / ll, -desc])), key, sb.cal, true);
      const cosI = Math.max(0.03, -dot3(pp.dd, pp.n)), angle = Math.acos(Math.min(1, cosI)) / D2R;
      const eff = Ballistics.effective(sb, pp.mm, angle).eff + pp.extra;
      // vitesse à l'impact, réduite par les murs traversés en chemin
      let Vt = Ballistics.velAt(sb, dist * RK);
      for (const w of walls) if (w.t < best.t) { const vl = Ballistics.vLimit(sb, w.los); Vt = Math.sqrt(Math.max(1, Vt * Vt - vl * vl)); }
      const k = pp.heatK * (kin ? player.up.pen : 1), pen0 = penAt(player.T, key, dist) * k, pen = Ballistics.penVel(sb, Vt) * k;
      best.fall = Math.atan(desc) / D2R;
      Object.assign(best, { plate: pp.plate, mm: pp.mm, angle, eff, pen, wall: Math.round(pen0 - pen), ric: kin ? Ballistics.ricochetChance(sb, pp.mm, angle) : 0, shat: kin ? Ballistics.shatterChance(sb, pp.mm, angle, Vt) : 0 });
    }
    return best;
  }
  const T3recoil = t => t.dead ? 0 : t.T.recoilLen;
  const M4 = G3.M4;
  function rotYm(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function rotXm(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  // tangage et roulis de la caisse, autour d'un point à mi-hauteur des chenilles
  function susM(t) {
    const zc = t.T.S.tt * 0.6, u = t.sus;
    return M4.mul(M4.trs(0, 0, zc, 0), M4.mul(rotYm(-u.p), M4.mul(rotXm(u.r), M4.trs(0, 0, -zc, 0))));
  }
  function updateCam3(dt) {
    if (sight.on && !(player && !player.dead && !player.ai && (state === 'play' || state === 'intro' || state === 'ending'))) setSight(false);
    if (sight.on) { sightCam(dt); return; }
    const f = camFocus();
    if (!f) return;
    const T = to3(f.x, f.y, 0);
    // la caméra suit la tourelle (la direction du canon), pas la caisse : on peut pivoter la caisse
    // sans que la vue bouge ; le clic droit glissé la décale
    const kb = deathCamT > 0 && f === player && killCard && killCard.by && killCard.by !== player ? killCard.by : null;
    const heading = kb ? -Math.atan2(kb.y - f.y, kb.x - f.x) : -(f.angle + (f.turretGone ? 0 : f.turret));
    if (kb) cam3.dist += (30 - cam3.dist) * (1 - Math.pow(0.2, dt)); // la caméra se rapproche de l'épave
    if (!cam3.init) { cam3.yaw = heading; cam3.tx = T[0]; cam3.ty = T[1]; cam3.init = true; }
    const dyaw = angNorm(heading + cam3.off - cam3.yaw) * (1 - Math.pow(0.08, dt));
    cam3.yaw += dyaw;
    // curseur verrouillé : il reste sur le même point du terrain pendant que la vue tourne, si bien
    // que la tourelle rejoint la visée et que la caméra s'arrête (visée à la World of Tanks).
    // Sans verrouillage, un curseur décalé fait tourner tourelle et caméra tant qu'il le reste.
    if (relAim() && cam3.view) {
      const ppr = (W / 2) / (Math.tan(cam3.fov / 2) * W / H);
      mouse.x = clamp(mouse.x + dyaw * ppr, 0, W);
    }
    const kk = 1 - Math.pow(0.0008, dt);
    cam3.tx += (T[0] - cam3.tx) * kk; cam3.ty += (T[1] - cam3.ty) * kk;
    // le regard se porte devant le char et vers la souris : le char reste en bas de l'écran,
    // le terrain devant lui (et les ennemis) occupe le reste. On lit la position de la souris
    // à l'écran, pas dans le monde, pour éviter que la caméra ne coure après sa propre visée.
    const md = CAM_MODES[cam3.mode], fw = [Math.cos(cam3.yaw), Math.sin(cam3.yaw)];
    const mx = clamp((mouse.x - W / 2) / (W / 2), -1, 1), my = clamp((H / 2 - mouse.y) / (H / 2), -1, 1);
    const reach = cam3.dist * md.look * (player && !player.dead ? 1 : 0.3);
    const lx = mx * reach * (W / H) * 0.5, ly = cam3.dist * md.ahead + my * reach;
    const kl = 1 - Math.pow(0.08, dt);
    cam3.lx += (lx - cam3.lx) * kl; cam3.ly += (ly - cam3.ly) * kl;
    const tgt = [cam3.tx + fw[0] * cam3.ly + fw[1] * cam3.lx, cam3.ty + fw[1] * cam3.ly - fw[0] * cam3.lx, 0];
    // le regard suit le relief en douceur : hauteur du sol au point visé, sans descendre sous le char
    const gz = Math.max(hAt(tgt[0] * PX, -tgt[1] * PX), f.gz != null ? f.gz : hAt(f.x, f.y));
    cam3.tz = cam3.tz == null ? gz : cam3.tz + (gz - cam3.tz) * (1 - Math.pow(0.02, dt));
    tgt[2] = cam3.tz + 1.2;
    cam3.pitch += (md.pitch - cam3.pitch) * (1 - Math.pow(0.02, dt));
    const cp = Math.cos(cam3.pitch), sp = Math.sin(cam3.pitch);
    const eye = [tgt[0] - Math.cos(cam3.yaw) * cp * cam3.dist, tgt[1] - Math.sin(cam3.yaw) * cp * cam3.dist, tgt[2] + sp * cam3.dist];
    eye[2] = Math.max(eye[2], hAt(eye[0] * PX, -eye[1] * PX) + 1.5);
    // secousse : rotation du regard (lacet, tangage, roulis) ; recul du tir : le regard monte, le champ s'ouvre
    const so = shakeOff(), dd = cam3.dist, rx = Math.sin(cam3.yaw), ry = -Math.cos(cam3.yaw);
    tgt[0] += rx * so.yaw * dd; tgt[1] += ry * so.yaw * dd; tgt[2] += (so.pitch + cam3.kick) * dd;
    cam3.fov = 0.9 + cam3.kick * 1.3;
    cam3.eye = eye; cam3.target = tgt;
    cam3.view = G3.M4.lookAt(eye, tgt, [rx * Math.sin(so.roll), ry * Math.sin(so.roll), Math.cos(so.roll)]);
    cam3.vp = G3.M4.mul(G3.M4.persp(cam3.fov, W / H, 0.8, 2400), cam3.view);
    camX = cam3.tx * PX; camY = -cam3.ty * PX;
  }
  function render3D(dt) {
    updateCam3(dt);
    if (!cam3.vp) return;
    // gravats et arbres abattus : reconstruction des cellules touchées, une toutes les 0,1 s au plus
    scene3T += dt;
    if (dirty3.size && scene3T > 0.1 && !W3D.lost) { rebuild3DCell(); scene3T = 0; }
    // glace brisée : la nappe d'eau est refaite, deux fois par seconde au plus
    if (iceDirty && scene3T > 0.5 && !W3D.lost && scene3On) { iceDirty = false; scene3T = 0; W3D.putCell('w', World3D.buildWater(terra, PX, L())); }
    // traces et cratères : envoi des tuiles modifiées de la texture du sol
    let n = 0;
    if (!W3D.lost) for (const k of dirtyTiles) {
      if (n++ >= 6) break;
      dirtyTiles.delete(k);
      const tx = (k % 64) * 256, ty = Math.floor(k / 64) * 256, w = Math.min(256, WW - tx), h = Math.min(256, WH - ty);
      W3D.updateGround(groundCv, tx, ty, w, h);
    }
    const M4 = G3.M4, items = [];
    for (const t of tanks) {
      if (!t.dead && !visibleToPlayer(t)) continue;
      if (sight.on && t === player) continue;
      const p = to3(t.x, t.y), hm = M4.mul(M4.trs(p[0], p[1], t.gz, -t.angle), susM(t));
      const psk = t === player ? Meta.skinOf(t.T.id) : null;
      const o = { gz: t.gz, camo: psk ? psk.camo : TEAM[t.team].camo, pat: psk ? psk.pat : 0, seed: t.team * 3.7 + t.id * 0.37, burnt: t.dead ? clamp(t.burnT / 25, 0, 1) : 0, tread: -t.treadPhase / PX, tint: t.hitFlash > 0 ? [1, 0.9, 0.7, t.hitFlash * 2.5] : null };
      const MS = MESH3[t.T.id];
      items.push({ mesh: MS.hull, model: hm, o });
      const ad = t.up.armorLv ? addon3(t.T.id, t.up.armorLv) : null;
      if (ad) items.push({ mesh: ad.hull, model: hm, o });
      // roues porteuses : rotation selon le chemin parcouru par leur chenille, débattement sur les bosses
      const bk = t.dead ? 0 : Math.min(1, Math.abs(t.speed) / t.T.speed * 2);
      MS.wheels.forEach((w, i) => {
        // côté +1 du modèle = gauche du char = chenille 1 (t.wd[0] est la chenille droite)
        const d = t.wd[w.side === 1 ? 1 : 0], bz = 0.028 * bk * Math.sin(d * 3.1 + i * 1.9) * (t.trackT > 0 && -w.side === t.trackSide ? 0 : 1);
        items.push({ mesh: MS.wheel, model: M4.mul(hm, M4.mul(M4.trs(w.x, w.y, w.z + bz, 0), M4.mul(rotYm(d / w.r), M4.trs(0, 0, 0, 0, w.r, w.w, w.r)))), o });
      });
      updateScarMeshes(t, 1 / 60);
      if (t.scar3) items.push({ mesh: t.scar3.hull, model: hm, o: { burnt: o.burnt, gz: t.gz } });
      if (t.hatch && !t.dead && CMDR3 && roleOk(t, 'commander')) {
        const hp = hatchPos(t), I = t.T.I;
        const base = t.T.S.turret ? M4.mul(hm, M4.mul(M4.trs(I.pivotX, I.pivotY, 0, -t.turret), M4.trs(hp.m[0], hp.m[1], hp.z0 - 0.05, 0))) : M4.mul(hm, M4.trs(hp.m[0], hp.m[1], hp.z0 - 0.05, 0));
        items.push({ mesh: CMDR3, model: base, o: { gz: t.gz } });
      }
      if (!t.turretGone) {
        const I = t.T.I;
        const tmm = M4.mul(hm, M4.trs(I.pivotX, I.pivotY, 0, -t.turret));
        items.push({ mesh: MS.body, model: tmm, o });
        if (ad) items.push({ mesh: ad.turret, model: tmm, o });
        if (t.scar3) items.push({ mesh: t.scar3.turret, model: tmm, o: { burnt: o.burnt, gz: t.gz } });
        // canon : élévation autour des tourillons, recul rapide (≈ 0,05 s) puis retour en batterie
        const fa = t.fireAge, rc = fa < 0.05 ? fa / 0.05 : Math.exp(-(fa - 0.05) * 4.5), gp = MS.gunPivot;
        const gm = M4.mul(tmm, M4.mul(M4.trs(gp[0], gp[1], gp[2], 0), M4.mul(rotYm(-t.elev), M4.trs(-T3recoil(t) * rc, 0, 0, 0))));
        items.push({ mesh: MS.gun, model: gm, o });
      }
    }
    // tourelles arrachées, au sol (retournées ou non)
    for (const o of obstacles) if (o.type === 'wreck') {
      const P = to3(o.x + o.w / 2, o.y + o.h / 2), up = Math.abs(o.flip || 0) < 1, gz = obsBase(o);
      const model = o.zc == null ? M4.trs(P[0], P[1], gz - TYPES[o.tid].S.ht + 0.05, -o.rot)
        : M4.mul(M4.trs(P[0], P[1], gz + (up ? o.zc - TYPES[o.tid].S.ht + 0.05 : o.rest + 0.05), -o.rot), M4.mul(rotXm(o.flip), M4.trs(0, 0, -o.zc, 0)));
      items.push({ mesh: MESH3[o.tid].turret, model, o: { burnt: 1, gz }, cull: [P[0], P[1], gz + 1, 4] });
    }
    // arbres qui tombent, maisons qui s'affaissent, éclats
    for (const f of falls3) { const m = fallModel(f); for (const mm of f.mm) items.push({ mesh: mm, model: m, o: {} }); }
    for (const d of debris3) { const gz = hAt(d.x * PX, -d.y * PX); items.push({ mesh: cube3, model: M4.mul(M4.trs(d.x, d.y, gz + d.z, d.az, d.s), M4.mul(rotXm(d.ax), rotYm(d.ay))), o: { tint: d.c, gz }, cull: [d.x, d.y, gz + d.z, d.s] }); }
    if (CMDR3) for (const r of runners) {
      const P = to3(r.x, r.y), dir = Math.sign(r.tx - r.x) || 1;
      const gz = hAt(r.x, r.y);
      items.push({ mesh: CMDR3, model: M4.trs(P[0], P[1], gz + 0.84 + Math.abs(Math.sin(r.ph)) * 0.05, -Math.atan2(Math.sin(r.a), dir * Math.cos(r.a))), o: { gz } });
    }
    // particules et lumières
    const soft = [], glow = [], lights = [];
    const night = !!L().night;
    for (const p of parts) {
      const a = p.life / p.max, age = 1 - a;
      const P = to3(p.x, p.y), g = hAt(p.x, p.y);
      switch (p.k) {
        case 'p3': {
          if (p.delay > 0) break;
          if (p.glow) {
            const q = { p: [P[0], P[1], g + p.z], s: p.size, c: [p.c[0], p.c[1], p.c[2], p.c[3] * a], g };
            if (p.line) q.a2 = [P[0] - p.vx / PX * p.line, P[1] + p.vy / PX * p.line, g + p.z - p.vz * p.line];
            glow.push(q);
          } else {
            const fin = Math.min(1, (p.max - p.life) * 12) * Math.pow(a, 0.8);
            soft.push({ p: [P[0], P[1], g + Math.max(p.z, p.size * 0.2)], s: p.size, c: [p.c[0], p.c[1], p.c[2], p.c[3] * fin], rot: p.x * 0.13 + p.y * 0.07, g });
          }
          break;
        }
        case 'smoke': {
          const dark = p.color.indexOf('30,28') > 0 || p.color.indexOf('45,40') > 0;
          const c = dark ? [0.09, 0.085, 0.08] : [0.55, 0.53, 0.5];
          const sz = p.size / PX * 1.25;
          soft.push({ p: [P[0], P[1], g + Math.max(sz * 0.7, 1.2 + age * (dark ? 7 : 3))], s: sz, c: [c[0], c[1], c[2], a * 0.5], rot: p.x * 0.1, g });
          break;
        }
        case 'dust': { const sz = p.size / PX * 1.3; soft.push({ p: [P[0], P[1], g + Math.max(sz * 0.65, 0.4 + age * 1.2)], s: sz, c: [0.5, 0.45, 0.36, a * 0.3], rot: p.y * 0.1, g }); break; }
        case 'fire': glow.push({ p: [P[0], P[1], g + 0.8 + age * 2.2], s: p.size / PX * 1.6, c: [1.0, 0.45 + a * 0.35, 0.12, a * 1.4], g }); break;
        case 'spark': glow.push({ p: [P[0], P[1], g + 1.4], a2: [P[0] - p.vx / PX * 0.03, P[1] + p.vy / PX * 0.03, g + 1.4], s: 0.05, c: [1, 0.8, 0.4, a * 1.5], g }); break;
        case 'debris': soft.push({ p: [P[0], P[1], g + 0.3 + Math.sin(age * Math.PI) * 3], s: 0.18, c: [0.05, 0.05, 0.05, a], g }); break;
        case 'leaf': soft.push({ p: [P[0], P[1], g + 2 + age * 1.5], s: 0.12, c: [0.2, 0.3, 0.1, a], g }); break;
        case 'flash': {
          const fz = g + (p.z != null ? p.z : 1.8);
          glow.push({ p: [P[0], P[1], fz], s: p.size / PX * 1.6, c: [1, 0.75, 0.4, a * 2.2], g });
          lights.push({ p: [P[0], P[1], fz + 0.4], r: p.size / PX * 7, c: [6 * a, 3.8 * a, 1.6 * a] });
          break;
        }
        case 'turret': {
          // modèle à la hauteur du toit de caisse : recentré sur son milieu pour culbuter
          items.push({ mesh: MESH3[p.tank.T.id].turret, model: M4.mul(M4.trs(P[0], P[1], g + p.z, -p.rot), M4.mul(rotXm(p.ax), M4.mul(rotYm(p.ay), M4.trs(0, 0, -p.zc, 0)))), o: { burnt: 1, gz: g } });
          break;
        }
      }
    }
    for (const s of shells) {
      if (s.dist * RK > 2000 || s.arty) continue; // le traceur s'éteint après environ 2 km de vol
      // traceur au culot : il brûle derrière l'obus, la traînée suit la vraie trajectoire
      const head = to3(s.x, s.y, s.z), tail = s.trail.length >= 3 ? to3(s.trail[0], s.trail[1], s.trail[2]) : head;
      const hot = s.key === 'HE' || s.key === 'HEAT';
      const g = hAt(s.x, s.y) - 1;
      glow.push({ p: tail, a2: head, s: 0.09, c: hot ? [1, 0.45, 0.2, 1.6] : s.key === 'APCR' ? [0.7, 0.85, 1, 1.6] : [1, 0.85, 0.55, 1.6], g });
      glow.push({ p: head, s: 0.55, c: [1, 0.8, 0.5, 1.2], g });
      lights.push({ p: head, r: 7, c: [1.6, 1.1, 0.6] });
    }
    for (const b of bullets) {
      if (!b.tracer) continue;
      const head = to3(b.x, b.y, b.z), L2 = 0.035;
      glow.push({ p: head, a2: [head[0] - b.vx / PX * L2, head[1] + b.vy / PX * L2, head[2] - b.slope * b.sp * RK * L2], s: 0.05, c: b.team === 0 ? [1, 0.55, 0.25, 2.4] : [1, 0.32, 0.2, 2.4], g: hAt(b.x, b.y) - 1 });
    }
    for (const t of tanks) {
      const P = to3(t.x, t.y);
      // flammes : la lumière dure autant qu'elles (même intensité que burnFx), vacillement continu
      const fk = t.dead ? (t.wreck === 'burning' || (t.wreck === 'brewed' && t.deadT < 12) ? 1.4 : t.wreck === 'brewed' && t.deadT < 45 ? 0.6 : 0) : t.fires.length ? 0.6 + 0.6 * Math.max(...t.fires.map(f => f.I)) : 0;
      if (fk) { const fl = (0.85 + 0.1 * Math.sin(17 * gameTime + t.id) + 0.05 * Math.sin(41 * gameTime + 2 * t.id)) * (0.5 + 0.36 * fk); lights.push({ p: [P[0], P[1], t.gz + 2], r: 8 + 3 * fk, c: [3.2 * fl, 1.4 * fl, 0.35 * fl] }); }
      // phares des alliés la nuit : un projecteur à l'avant de la caisse, légèrement plongeant
      if (night && !t.dead && t.team === 0) { const c = Math.cos(t.angle), sn = Math.sin(t.angle), hl = t.T.S.L / 2; lights.push({ p: [P[0] + c * hl, P[1] - sn * hl, t.gz + 1.4], r: 45, c: [1.3, 1.2, 0.95], d: [c * 0.99, -sn * 0.99, -0.1], cone: 0.92 }); }
    }
    for (const f of flares) {
      const P = to3(f.x, f.y), k = Math.min(1, f.age / 0.6) * Math.min(1, (f.life - f.age) / 2), fl = (0.9 + 0.07 * Math.sin(23 * gameTime + f.seed) + 0.04 * Math.sin(57 * gameTime)) * k, g = hAt(f.x, f.y);
      glow.push({ p: [P[0], P[1], g + f.z], s: 0.8, c: [1, 1, 0.92, 1.6 * k], g });
      if (f.age > 1.5) lights.push({ p: [P[0], P[1], g + f.z], r: 220, c: [2.2 * fl, 2.3 * fl, 2.1 * fl] });
    }
    OBJ.draw3D(items, glow);
    // ombre de contact des chars les plus proches de la zone regardée
    const tg = cam3.target, contacts = [];
    for (const t of tanks) { const P = to3(t.x, t.y), d = Math.hypot(P[0] - tg[0], P[1] - tg[1]); if (d < 90 && (t.dead || visibleToPlayer(t))) contacts.push([P[0], P[1], -t.angle, t.T.S.L / 2, t.T.S.W / 2, d]); }
    contacts.sort((a, b) => a[5] - b[5]);
    lights.sort((a, b) => Math.hypot(a.p[0] - tg[0], a.p[1] - tg[1]) / a.r - Math.hypot(b.p[0] - tg[0], b.p[1] - tg[1]) / b.r);
    W3D.render({ cam: { eye: cam3.eye, target: cam3.target, vp: cam3.vp, view: cam3.view, fov: cam3.fov, time: gameTime, lights, contacts, blasts: blastList3() }, items, parts: { soft, glow }, vig: sight.on ? 0 : 0.38, hit: player && !player.dead ? clamp(player.hitFlash * 2, 0, 1) : 0, shadowExt: sight.on ? 110 : Math.max(60, cam3.dist * 1.6) }, Math.round(W * DPR * dyn.k), Math.round(H * DPR * dyn.k));
    // interface par-dessus
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // vignettage léger, comme à travers une optique : fait par le rendu 3D (scene.vig)
    if (sight.on) drawSightMask();
    drawThreats3D();
    drawWorldLabels();
    if (state !== 'menu') { drawHUD(); drawTouchUI(); }
  }
  // Obus qui menacent le joueur : trajectoire prévue et cercle d'impact au sol
  function drawThreats3D() {
    if (!player || player.dead || state === 'menu') return;
    const T = player.T;
    for (const s of shells) {
      if (s.by === player) continue;
      const rx = player.x - s.x, ry = player.y - s.y, ux = s.vx / s.sp, uy = s.vy / s.sp;
      const along = rx * ux + ry * uy;
      if (along < 0) continue;
      const tt = along / s.sp;
      if (tt > 1.6) continue;
      if (Math.abs(rx * -uy + ry * ux) > T.len * 0.6 + 16) continue;
      s.warned = true;
      const ix = s.x + ux * along, iy = s.y + uy * along, a = clamp(1.3 - tt, 0.25, 1);
      const gi = hAt(ix, iy), p0 = project3(s.x, s.y, s.z), p1 = project3(ix, iy, Math.max(gi, s.z + s.slope * along * RK));
      if (p0.behind || p1.behind) continue;
      ctx.strokeStyle = `rgba(255,60,40,${a * 0.85})`; ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
      const rr = (1.6 + 0.6 * Math.sin(gameTime * 20)) * PX;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const q = project3(ix + Math.cos(k / 24 * TAU) * rr, iy + Math.sin(k / 24 * TAU) * rr, gi + 0.05); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.stroke();
    }
  }

  function render(dt) {
    if (W3D && groundCv) { render3D(dt); return; }
    const f = camFocus();
    if (f) {
      let tx = f.x, ty = f.y;
      if (f === player && !player.dead) {
        const m = screenToWorld(mouse.x, mouse.y);
        tx += clamp(m.x - f.x, -600, 600) * 0.28; ty += clamp(m.y - f.y, -400, 400) * 0.28;
      }
      const k = 1 - Math.pow(0.002, dt);
      camX += (tx - camX) * k; camY += (ty - camY) * k;
    }
    const hw = W / 2 / S, hh = H / 2 / S;
    camX = WW > hw * 2 ? clamp(camX, hw, WW - hw) : WW / 2;
    camY = WH > hh * 2 ? clamp(camY, hh, WH - hh) : WH / 2;
    const so = shakeOff(), sx = so.yaw * 700, sy = so.pitch * 700;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0f0c'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * (W / 2 - camX * S + sx), DPR * (H / 2 - camY * S + sy));
    ctx.drawImage(groundCv, 0, 0);
    const vx0 = camX - hw - 80, vx1 = camX + hw + 80, vy0 = camY - hh - 80, vy1 = camY + hh + 80;
    const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    for (const t of tanks) if (t.dead && inView(t.x, t.y)) drawTank(t);
    for (const t of tanks) if (!t.dead && inView(t.x, t.y) && visibleToPlayer(t)) drawTank(t);
    for (const r of runners) { ctx.fillStyle = r.team === 0 ? '#8cc4ff' : '#ff8c80'; ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, TAU); ctx.fill(); }

    for (const o of obstacles) {
      if (o.dead || o.x > vx1 || o.x + o.w < vx0 || o.y > vy1 || o.y + o.h < vy0) continue;
      drawObstacle(o);
    }
    ctx.fillStyle = L().bush;
    for (const b of bushes) {
      if (!inView(b.x, b.y)) continue;
      ctx.globalAlpha = 0.82;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(b.x + 4, b.y + 5, b.r * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = L().bush;
    }
    ctx.globalAlpha = 1;

    OBJ.draw2D(ctx);
    drawParticles(inView);
    drawShells();

    for (const s of smokes) {
      const a = Math.min(1, s.life / 2) * 0.85;
      for (let k = 0; k < 7; k++) {
        const ang = k / 7 * TAU + gameTime * 0.1, rr = s.r * 0.45;
        ctx.fillStyle = `rgba(205,205,200,${a * 0.5})`;
        ctx.beginPath(); ctx.arc(s.x + Math.cos(ang) * rr, s.y + Math.sin(ang) * rr, s.r * 0.55, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `rgba(215,215,210,${a * 0.6})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.6, 0, TAU); ctx.fill();
    }

    drawThreats();

    if (L().night) drawNight();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWorldLabels();
    if (state !== 'menu') { drawHUD(); drawTouchUI(); }
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0, g = clamp(((n >> 8) & 255) * k, 0, 255) | 0, b = clamp((n & 255) * k, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  function drawTank(t) {
    const T = t.T, sp = SPR[T.id];
    if (sp) {
      const hxp = sp.hx * PX, hyp = sp.hy * PX, rtp = sp.rt * PX;
      ctx.save();
      ctx.translate(t.x, t.y); ctx.rotate(t.angle);
      ctx.globalAlpha = 0.38;
      ctx.drawImage(sp.hullSh, -hxp + 3, -hyp + 4, hxp * 2, hyp * 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(t.dead && t.burnT > 8 ? sp.hullB : sp.hull[t.team], -hxp, -hyp, hxp * 2, hyp * 2);
      // défilement des patins de chenille
      if (!t.dead) {
        const tw = T.S.tw * PX, ph = ((t.treadPhase % 4) + 4) % 4;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let x = -T.len / 2 + ph; x < T.len / 2; x += 4) { ctx.fillRect(x, -T.wid / 2, 1, tw); ctx.fillRect(x, T.wid / 2 - tw, 1, tw); }
        ctx.fillStyle = TEAM[t.team].accent;
        ctx.fillRect(-T.len / 2 + 2, -1.5, 2.5, 3);
        if (t.trackT > 0) { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(-3, -T.wid / 2 - 2, 6, 2.5); ctx.fillRect(-3, T.wid / 2 - 0.5, 6, 2.5); }
      }
      if (t.hitFlash > 0) { ctx.globalAlpha = t.hitFlash * 2.5; ctx.drawImage(sp.hullSh, -hxp, -hyp, hxp * 2, hyp * 2); ctx.globalAlpha = 1; }
      ctx.restore();
      if (!t.turretGone) {
        const pv = pivot(t), ta = t.angle + t.turret, rec = -t.recoil * 4;
        ctx.save();
        ctx.translate(pv.x, pv.y); ctx.rotate(ta);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(sp.turSh, -rtp + rec + 4, -rtp + 5, rtp * 2, rtp * 2);
        ctx.globalAlpha = 1;
        ctx.drawImage(t.dead && t.burnT > 8 ? sp.turB : sp.tur[t.team], -rtp + rec, -rtp, rtp * 2, rtp * 2);
        if (t.flash > 0) {
          ctx.fillStyle = `rgba(255,230,140,${t.flash * 10})`;
          ctx.beginPath(); ctx.arc(T.gunEnd + 6, 0, 8, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      return;
    }
    // Rendu vectoriel de secours (sans WebGL)
    const team = TEAM[t.team], Ln = T.len, Wd = T.wid, tw = T.S.tw * PX;
    ctx.save();
    ctx.translate(t.x, t.y); ctx.rotate(t.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-Ln / 2 + 4, -Wd / 2 + 4, Ln, Wd);
    ctx.fillStyle = '#1e1e1c';
    ctx.fillRect(-Ln / 2, -Wd / 2, Ln, tw); ctx.fillRect(-Ln / 2, Wd / 2 - tw, Ln, tw);
    ctx.fillStyle = t.dead ? '#2b2724' : team.hull;
    ctx.fillRect(-Ln / 2 + 2, -Wd / 2 + tw - 2, Ln - 4, Wd - 2 * tw + 4);
    if (!t.dead) { ctx.fillStyle = team.accent; ctx.fillRect(-Ln / 2 + 2, -2, 3, 4); }
    ctx.restore();
    if (t.turretGone) return;
    const pv = pivot(t), ta = t.angle + t.turret, rec = -t.recoil * 4;
    ctx.save();
    ctx.translate(pv.x, pv.y); ctx.rotate(ta);
    ctx.fillStyle = '#2c2e26';
    ctx.fillRect(rec, -T.bw / 2, T.gunEnd, T.bw);
    if (T.tb) {
      ctx.fillStyle = t.dead ? '#35302b' : team.top;
      ctx.fillRect(T.tb.x0, T.tb.y0, T.tb.x1 - T.tb.x0, T.tb.y1 - T.tb.y0);
    }
    ctx.restore();
  }

  function drawObstacle(o) {
    if (o.type === 'wreck') {
      const sp = SPR[o.tid];
      if (sp) { const r = sp.rt * PX; ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate(o.rot); ctx.drawImage(sp.turB, -r, -r, r * 2, r * 2); ctx.restore(); }
      return;
    }
    const lv = L();
    if (o.type === 'tree') {
      const cx = o.x + 8, cy = o.y + 8, r = 14 * o.size;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(cx + 5, cy + 6, r, 0, TAU); ctx.fill();
      ctx.fillStyle = lv.tree[0];
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = lv.tree[1];
      ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.6, 0, TAU); ctx.fill();
      if (lv.snow) { ctx.fillStyle = 'rgba(240,245,250,0.7)'; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.35, 0, TAU); ctx.fill(); }
      return;
    }
    if (o.type === 'rock') {
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.fillStyle = lv.snow ? '#8d9196' : '#7a7670';
      ctx.beginPath(); o.poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.ellipse(o.w * 0.4, o.h * 0.35, o.w * 0.25, o.h * 0.18, -0.4, 0, TAU); ctx.fill();
      if (lv.snow) { ctx.fillStyle = 'rgba(240,245,250,0.8)'; ctx.beginPath(); ctx.ellipse(o.w * 0.45, o.h * 0.35, o.w * 0.28, o.h * 0.2, -0.3, 0, TAU); ctx.fill(); }
      ctx.restore();
      return;
    }
    if (o.type === 'wall') {
      ctx.fillStyle = shade(lv.wall, 0.85);
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      const horiz = o.w > o.h;
      for (let k = 10; k < (horiz ? o.w : o.h); k += 12) horiz ? ctx.fillRect(o.x + k, o.y, 1.5, o.h) : ctx.fillRect(o.x, o.y + k, o.w, 1.5);
    } else {
      const horiz = o.w >= o.h;
      ctx.fillStyle = lv.roof[0];
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = lv.roof[1];
      if (horiz) ctx.fillRect(o.x, o.y + o.h / 2, o.w, o.h / 2); else ctx.fillRect(o.x + o.w / 2, o.y, o.w / 2, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (horiz) ctx.fillRect(o.x, o.y + o.h / 2 - 1, o.w, 2); else ctx.fillRect(o.x + o.w / 2 - 1, o.y, 2, o.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    }
    const dmg = 1 - o.hp / o.maxHp;
    if (dmg > 0.1) {
      const n = Math.ceil(dmg * o.spots.length);
      for (let i = 0; i < n; i++) {
        const s = o.spots[i];
        ctx.fillStyle = 'rgba(20,16,12,0.7)';
        ctx.beginPath(); ctx.arc(o.x + s.x * o.w, o.y + s.y * o.h, s.r * Math.min(o.w, o.h) * (0.6 + dmg), 0, TAU); ctx.fill();
      }
    }
  }

  function drawParticles(inView) {
    for (const p of parts) {
      if (!inView(p.x, p.y)) continue;
      const a = p.life / p.max;
      switch (p.k) {
        case 'p3': {
          if (p.delay > 0) break;
          const c = p.c, al = Math.min(1, c[3] * a * (p.glow ? 0.6 : 1));
          ctx.fillStyle = `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${al.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y - p.z * PX * 0.6, Math.max(1, p.size * PX * 0.6), 0, TAU); ctx.fill(); break;
        }
        case 'smoke':
          ctx.fillStyle = p.color + (a * 0.45).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        case 'dust':
          ctx.globalAlpha = a * 0.35; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'fire':
          ctx.fillStyle = a > 0.6 ? `rgba(255,240,170,${a})` : `rgba(255,${(90 + a * 120) | 0},30,${a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill(); break;
        case 'spark':
          ctx.strokeStyle = `rgba(255,220,120,${a})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
        case 'debris':
          ctx.fillStyle = `rgba(40,36,30,${a})`;
          ctx.fillRect(p.x - 2, p.y - 2, 4, 3); break;
        case 'leaf':
          ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); ctx.globalAlpha = 1; break;
        case 'turret': {
          // tourelle projetée en l'air : elle grossit puis retombe
          const sp = SPR[p.tank.T.id], up = Math.sin((1 - a) * Math.PI), sc = 1 + up * 0.7;
          ctx.save(); ctx.translate(p.x, p.y - up * 30); ctx.rotate(p.rot); ctx.scale(sc, sc);
          if (sp) { const r = sp.rt * PX; ctx.drawImage(sp.turB, -r, -r, r * 2, r * 2); }
          else { ctx.fillStyle = '#2a2622'; ctx.fillRect(-10, -8, 20, 16); }
          ctx.restore(); break;
        }
        case 'flash': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, `rgba(255,245,200,${a})`); g.addColorStop(0.4, `rgba(255,170,60,${a * 0.6})`); g.addColorStop(1, 'rgba(255,120,30,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        }
      }
    }
  }

  function drawShells() {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,150,70,0.9)'; ctx.lineWidth = 1.5;
    for (const b of bullets) if (b.tracer) { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.stroke(); }
    for (const s of shells) {
      const tr = s.trail, hot = s.key === 'HE' || s.key === 'HEAT';
      if (tr.length >= 2) {
        const x0 = tr[0], y0 = tr[1];
        const g = ctx.createLinearGradient(x0, y0, s.x, s.y);
        g.addColorStop(0, 'rgba(255,160,60,0)');
        g.addColorStop(1, hot ? 'rgba(255,110,50,0.9)' : s.key === 'APCR' ? 'rgba(200,230,255,0.9)' : 'rgba(255,220,140,0.9)');
        ctx.strokeStyle = g; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.fillStyle = hot ? 'rgba(255,120,60,0.35)' : 'rgba(255,230,150,0.35)';
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, TAU); ctx.fill();
    }
  }

  // Obus qui menacent le joueur : trajectoire prévue et point d'impact
  function drawThreats() {
    if (!player || player.dead || state === 'menu') return;
    const T = player.T;
    for (const s of shells) {
      if (s.by === player) continue;
      const rx = player.x - s.x, ry = player.y - s.y, ux = s.vx / s.sp, uy = s.vy / s.sp;
      const along = rx * ux + ry * uy;
      if (along < 0) continue;
      const tt = along / s.sp;
      if (tt > 1.6) continue;
      const perp = Math.abs(rx * -uy + ry * ux);
      if (perp > T.len * 0.6 + 16) continue;
      s.warned = true;
      const ix = s.x + ux * along, iy = s.y + uy * along;
      const a = clamp(1.3 - tt, 0.25, 1);
      ctx.strokeStyle = `rgba(255,60,40,${a * 0.8})`; ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ix, iy); ctx.stroke();
      ctx.setLineDash([]);
      const pr = 10 + 6 * Math.sin(gameTime * 20);
      ctx.beginPath(); ctx.arc(ix, iy, pr, 0, TAU); ctx.stroke();
    }
  }

  function drawNight() {
    // voile de nuit de la vue 2D, alloué seulement quand il sert (20 Mo de moins en 3D à haute résolution)
    if (dark.width !== cv.width || dark.height !== cv.height) { dark.width = cv.width; dark.height = cv.height; }
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = 'rgba(4,8,24,0.84)';
    dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const p = worldToScreen(x, y), R = r * S * DPR;
      if (p.x * DPR < -R || p.y * DPR < -R || p.x * DPR > dark.width + R || p.y * DPR > dark.height + R) return;
      const g = dctx.createRadialGradient(p.x * DPR, p.y * DPR, 0, p.x * DPR, p.y * DPR, R);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.beginPath(); dctx.arc(p.x * DPR, p.y * DPR, R, 0, TAU); dctx.fill();
    };
    for (const t of tanks) {
      if (t.dead) { if (t.deadT < 12) hole(t.x, t.y, 150, 0.7); continue; }
      if (t.team === 0) {
        hole(t.x, t.y, 260, 0.95);
        const c = Math.cos(t.angle), s = Math.sin(t.angle);
        hole(t.x + c * 120, t.y + s * 120, 120, 0.6);
      } else if (visibleToPlayer(t)) hole(t.x, t.y, 70, 0.5);
    }
    for (const s of shells) hole(s.x, s.y, 50, 0.8);
    for (const p of parts) if (p.k === 'flash') hole(p.x, p.y, p.size * 3, p.life / p.max);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
  }

  // verdict de perforation : couleur (bleu, blanc et orange pour les daltoniens) et forme du point de
  // visée (plein : perce, anneau : incertain, croix : ne perce pas)
  const CB_COL = { '#7ad06a': '#4aa8ff', '#ffe27a': '#ffffff', '#ff6a50': '#ff9a1a', '#ffb070': '#ffd9a0' };
  function verdictOf(pr) {
    const t = pr.tank, v = (col, verdict, shape) => ({ col: Meta.P.opts.cb ? CB_COL[col] || col : col, verdict, shape });
    if (t.dead) return v('#aaa', 'wreck', 'ring');
    if (t.team === 0) return v('#6ab8ff', 'ALLY: HOLD FIRE', 'cross');
    if (player.shell === 'HE') return pr.pen >= pr.eff ? v('#7ad06a', 'penetrates', 'dot') : v('#ffb070', 'blast effect', 'ring');
    if (pr.ric > 0.5) return v('#ffb070', 'likely ricochet', 'ring');
    if (pr.pen >= pr.eff * 1.08) return v('#7ad06a', 'penetrates', 'dot');
    if (pr.pen >= pr.eff * 0.92) return v('#ffe27a', 'uncertain', 'ring');
    return v('#ff6a50', 'no penetration', 'cross');
  }

  // ===================== Lunette du tireur =====================
  // rayon de l'oculaire : entre le bandeau du score et la rangée des obus, à l'échelle de l'interface
  const sightR = () => Math.max(60, Math.min(W / 2, H / 2 - 60 * uiK));
  function drawSightMask() {
    const R = sightR(), cx = W / 2, cy = H / 2, vd = ownVeil(player);
    // poussière soulevée par le départ du coup : la lunette est voilée un instant
    if (vd > 0) { const c = hex3(L().dust); ctx.fillStyle = `rgba(${c.map(v => Math.round(v * 200)).join(',')},${Math.min(0.85, vd * 1.1)})`; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = '#050605';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, R, 0, TAU, true); ctx.fill();
    // bord de l'oculaire : assombrissement et léger liseré coloré (aberration chromatique)
    const g = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,60,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R - 6, 0, TAU); ctx.stroke();
  }
  // Réticule inspiré de la TZF allemande : triangle central (pointe = point visé), triangles de
  // part et d'autre tous les 4 millièmes pour estimer la correction sur une cible en mouvement,
  // et réglette des distances à gauche. Les traits sont gravés à l'échelle angulaire réelle.
  function drawSightReticle() {
    const R = sightR(), cx = W / 2, cy = H / 2;
    const ppr = (H / 2) / Math.tan(cam3.fov / 2), mil = ppr / 1000;
    const night = !!L().night, ink = night ? 'rgba(255,120,60,0.95)' : 'rgba(8,8,8,0.92)';
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.4;
    const tri = (x, w, hh) => { ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x - w / 2, cy + hh); ctx.lineTo(x + w / 2, cy + hh); ctx.closePath(); ctx.fill(); };
    const step = 4 * mil, tw = Math.max(9, 4 * mil);
    tri(cx, tw * 1.3, tw * 1.3);
    for (let k = 1; k <= 3; k++) { tri(cx - k * step * 2, tw * 0.75, tw * 0.75); tri(cx + k * step * 2, tw * 0.75, tw * 0.75); }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 7 * step * 2 / 7 * 3.6, cy);
    ctx.moveTo(cx + 7 * step * 2 / 7 * 3.6, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy + R); ctx.lineTo(cx, cy + tw * 1.3 + 8 * mil);
    ctx.stroke();
    // réglette des distances (en hectomètres), curseur sur la distance télémétrée
    const pr = sight.probe, real = !assisted(), dm = real ? sight.rangeSet : pr && pr.kind !== 'sky' ? pr.dist * RK : null;
    const sx = cx - R * 0.72, sy0 = cy - R * 0.45, sy1 = cy + R * 0.45;
    ctx.lineWidth = 1; ctx.font = F(600, 10); ctx.textAlign = 'right';
    for (let hm = 0; hm <= 20; hm++) {
      const y = sy1 - (sy1 - sy0) * hm / 20, big = hm % 4 === 0;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + (big ? 10 : 5), y); ctx.stroke();
      if (big) ctx.fillText(String(hm), sx - 4, y + 3);
    }
    if (dm != null) {
      const y = sy1 - (sy1 - sy0) * Math.min(1, dm / 2000);
      ctx.beginPath(); ctx.moveTo(sx + 12, y); ctx.lineTo(sx + 20, y - 4); ctx.lineTo(sx + 20, y + 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // canon réel (la tourelle suit à sa vitesse de rotation) et cercle de dispersion
    const pv = pivot(player), ta = player.angle + player.turret, dd = pr && pr.kind !== 'sky' ? pr.dist : 400;
    const gz = sight.z0 + Math.tan(sight.gunPitch + (player.elevErr || 0)) * dd / PX;
    const gp = project3(pv.x + Math.cos(ta) * dd, pv.y + Math.sin(ta) * dd, gz);
    if (!gp.behind) {
      const rr = Math.max(5, player.disp * ppr);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, rr, 0, TAU); ctx.stroke();
      const rf = player.reloadT > 0 ? 1 - player.reloadT / player.reloadMax : 1;
      ctx.strokeStyle = rf >= 1 ? '#ffe27a' : 'rgba(255,200,90,0.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, rr + 4, -Math.PI / 2, -Math.PI / 2 + TAU * rf); ctx.stroke();
    }

    // curseur de la souris incrusté : point visé, avec distance et perforation à cette distance
    const ca = sight.aimYaw, cpz = Math.cos(sight.aimPitch), e3 = cam3.eye;
    const q = G3.M4.apply(cam3.vp, [e3[0] + Math.cos(ca) * cpz * 100, e3[1] - Math.sin(ca) * cpz * 100, e3[2] + Math.sin(sight.aimPitch) * 100]);
    if (q[3] > 0) {
      const mx = (q[0] * 0.5 + 0.5) * W, my = (1 - (q[1] * 0.5 + 0.5)) * H;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU);
      ctx.moveTo(mx - 15, my); ctx.lineTo(mx - 11, my); ctx.moveTo(mx + 11, my); ctx.lineTo(mx + 15, my);
      ctx.moveTo(mx, my - 15); ctx.lineTo(mx, my - 11); ctx.moveTo(mx, my + 11); ctx.lineTo(mx, my + 15);
      ctx.stroke();
      const vd = pr && pr.kind === 'tank' && !sight.dust && assisted() ? verdictOf(pr) : null;
      ctx.fillStyle = ctx.strokeStyle = vd ? vd.col : '#fff';
      if (!vd || vd.shape === 'dot') { ctx.beginPath(); ctx.arc(mx, my, vd ? 3 : 1.8, 0, TAU); ctx.fill(); }
      else if (vd.shape === 'ring') { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, 3.5, 0, TAU); ctx.stroke(); }
      else { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(mx - 4, my - 4); ctx.lineTo(mx + 4, my + 4); ctx.moveTo(mx + 4, my - 4); ctx.lineTo(mx - 4, my + 4); ctx.stroke(); }
      if (hitMk) drawHitMark(mx, my, true);
      if (dm != null && !real) {
        ctx.font = F(600, 11); ctx.textAlign = 'left';
        const tx = `${Math.round(dm)} m · ${Math.round(penAt(player.T, player.shell, pr.dist))} mm`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(tx, mx + 19 * uiK, my + 17 * uiK);
        ctx.fillStyle = '#fff'; ctx.fillText(tx, mx + 18 * uiK, my + 16 * uiK);
      }
    }

    // indicateur de perforation sous le réticule
    ctx.textAlign = 'center';
    const sb = SHELLS[player.shell];
    ctx.font = F(700, 13);
    const top = real ? `×${MAGS[sight.mag]} · ${sb.name} · range set ${sight.rangeSet} m` : `×${MAGS[sight.mag]} · ${sb.name}${dm != null ? ` · ${Math.round(dm)} m · ${Math.round(penAt(player.T, player.shell, pr.dist))} mm` : ''}`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(top, cx + 1, cy + R * 0.42 + 1);
    ctx.fillStyle = '#e9d9a6'; ctx.fillText(top, cx, cy + R * 0.42);
    if (sight.dust) { ctx.font = F(700, 14); ctx.fillStyle = '#e9d9a6'; ctx.fillText('Muzzle dust: target obscured', cx, cy + R * 0.55); }
    else if (real) {
      // réaliste : estimation du chef de char (après 1,5 s sur la même cible), et rappel des stadia
      const e = cmdEstimate(pr);
      ctx.font = F(700, 14); ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const l1 = pr && pr.kind === 'tank' ? `${pr.tank.T.name}${pr.tank.team === 0 ? ' (ally)' : ''}${e ? ` · commander: about ${e} m` : ''}` : '';
      if (l1) { ctx.fillText(l1, cx + 1, cy + R * 0.55 + 1); ctx.fillStyle = pr.tank.team === 0 ? '#6ab8ff' : '#e8e4d8'; ctx.fillText(l1, cx, cy + R * 0.55); }
      ctx.font = F(600, 11); ctx.fillStyle = '#c9c4b2';
      ctx.fillText('Triangles are 8 mils apart: a 6 m tank side-on spans one gap at 750 m', cx, cy + R * 0.55 + 18 * uiK);
    } else if (pr && pr.kind === 'tank') {
      const t = pr.tank, ally = t.team === 0, { col, verdict } = verdictOf(pr);
      const l1 = `${t.T.name}${ally ? ' (ally)' : ''} · ${verdict}`;
      const l2 = t.dead ? '' : `${pr.plate}: ${pr.mm} mm at ${Math.round(pr.angle)}° → ${Math.round(pr.eff)} mm effective · penetration ${Math.round(pr.pen)} mm${pr.wall > 0 ? ` (through wall: −${pr.wall} mm)` : ''}`;
      ctx.font = F(700, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(l1, cx + 1, cy + R * 0.55 + 1);
      ctx.fillStyle = col; ctx.fillText(l1, cx, cy + R * 0.55);
      if (l2) {
        ctx.font = F(600, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(l2, cx + 1, cy + R * 0.55 + 19 * uiK);
        ctx.fillStyle = '#e8e4d8'; ctx.fillText(l2, cx, cy + R * 0.55 + 18 * uiK);
        // risques de ricochet et de bris de l'obus chargé sur cette plaque
        const l3 = `ricochet ${Math.round(pr.ric * 100)}%${pr.shat >= 0.01 ? ` · shatter risk ${Math.round(pr.shat * 100)}%` : ''}`;
        ctx.font = F(600, 11);
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(l3, cx + 1, cy + R * 0.55 + 35 * uiK);
        ctx.fillStyle = pr.ric > 0.5 || pr.shat > 0.4 ? '#ffb070' : '#c9c4b2'; ctx.fillText(l3, cx, cy + R * 0.55 + 34 * uiK);
      }
    }
    ctx.font = F(600, 11); ctx.fillStyle = 'rgba(220,215,200,0.7)';
    ctx.fillText(device() === 'pad' ? `A: outside view · D-pad: ${assisted() ? 'magnification' : 'range · R3: magnification'}` : touch.on ? `SIGHT: outside view · ZOOM / pinch: magnification${assisted() ? '' : ' · R+ R−: range'}`
      : `${keyName('sight')}: outside view · wheel: ${assisted() ? 'magnification' : `range · ${keyName('zoom')}: magnification`}`, cx, cy + R - 12 * uiK);
    // vent : flèche dans le repère du tireur (vers le haut = dans l'axe du tir) et composante de travers,
    // qui fait dériver les obus lents de plusieurs décimètres à 1 km
    const wf = Math.cos(ta) * WIND.x + Math.sin(ta) * WIND.y, wr = -Math.sin(ta) * WIND.x + Math.cos(ta) * WIND.y, ws = Math.hypot(wf, wr);
    const wx = cx + R * 0.62, wy = cy - R * 0.5;
    ctx.strokeStyle = 'rgba(220,215,200,0.75)'; ctx.fillStyle = 'rgba(220,215,200,0.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(wx, wy, 13, 0, TAU); ctx.stroke();
    if (ws > 0.05) {
      const ax = wr / ws, ay = -wf / ws;
      ctx.beginPath(); ctx.moveTo(wx - ax * 10, wy - ay * 10); ctx.lineTo(wx + ax * 10, wy + ay * 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx + ax * 11, wy + ay * 11); ctx.lineTo(wx + ax * 4 - ay * 4, wy + ay * 4 + ax * 4); ctx.lineTo(wx + ax * 4 + ay * 4, wy + ay * 4 - ax * 4); ctx.closePath(); ctx.fill();
    }
    ctx.font = F(600, 10.5);
    ctx.fillText(ws < 0.3 ? 'Wind: calm' : `Wind ${ws.toFixed(1)} m/s · ${Math.abs(wr).toFixed(1)} from the ${wr > 0 ? 'left' : 'right'}`, wx, wy + 26 * uiK);
  }

  // ennemis repérés : chevron au-dessus d'eux, ou flèche au bord de l'écran s'ils sont hors champ
  function drawEnemyMarkers() {
    const f = camFocus();
    if (!W3D || !cam3.vp || !f) return;
    // marges : bandeau du haut, panneau du bas
    const mx0 = 26 * uiK, my0 = 64 * uiK, my1 = ui.panel ? ui.panel.top * uiK - 10 : H - 120 * uiK, cx = W / 2, cy = (my0 + my1) / 2;
    const mmx = ui.mm ? ui.mm.x0 * uiK - 20 : W, mmy = ui.mm ? ui.mm.bottom * uiK + 22 : 0;
    ctx.textAlign = 'center'; ctx.font = F(700, 11);
    for (const t of tanks) {
      if (t.dead || t.team === 0 || !visibleToPlayer(t)) continue;
      const d = Math.round(Math.hypot(t.x - f.x, t.y - f.y) * RK);
      const p = worldToScreen(t.x, t.y, t.T.I.totalH + 2.6);
      const inside = !p.behind && p.x > mx0 && p.y > my0 && p.x < W - mx0 && p.y < my1;
      ctx.fillStyle = teamCol(1); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      if (inside) {
        const b = 2 * Math.sin(gameTime * 5);
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - 18 + b); ctx.lineTo(p.x + 7, p.y - 18 + b); ctx.lineTo(p.x, p.y - 9 + b); ctx.closePath();
        ctx.stroke(); ctx.fill();
        // cible désignée aux alliés : cercle jaune qui pulse
        if (orders.kind === 'attack' && orders.target === t) { ctx.save(); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 14 + b, 13 + 2 * Math.sin(gameTime * 8), 0, TAU); ctx.stroke(); ctx.restore(); }
        continue;
      }
      // direction vers l'ennemi à l'écran (inversée s'il est derrière la caméra)
      let dx = p.x - cx, dy = p.y - cy;
      if (p.behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), k = Math.min((W / 2 - mx0) / Math.abs(Math.cos(a) || 1e-6), ((my1 - my0) / 2) / Math.abs(Math.sin(a) || 1e-6));
      const ex = cx + Math.cos(a) * k, ey = Math.max(cy + Math.sin(a) * k, ex > mmx ? mmy : 0); // jamais sous la mini-carte
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath();
      ctx.stroke(); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(d + ' m', ex - Math.cos(a) * 20 + 1, ey - Math.sin(a) * 20 + 5);
      ctx.fillStyle = '#ffb0a8'; ctx.fillText(d + ' m', ex - Math.cos(a) * 20, ey - Math.sin(a) * 20 + 4);
    }
    // repère fantôme : dernière position où l'ennemi a été vu, qui s'efface en 6 s
    ctx.strokeStyle = '#ff8a7d'; ctx.lineWidth = 1.5;
    for (const [e, g] of seenAt) {
      const age = gameTime - g.t;
      if (e.dead || age > 6 || visibleToPlayer(e)) continue;
      const p = worldToScreen(g.x, g.y, e.T.I.totalH + 2.6);
      if (p.behind || p.x < mx0 || p.y < my0 || p.x > W - mx0 || p.y > my1) continue;
      ctx.globalAlpha = 0.75 * (1 - age / 6);
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - 18); ctx.lineTo(p.x + 7, p.y - 18); ctx.lineTo(p.x, p.y - 9); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawWorldLabels() {
    drawEnemyMarkers();
    OBJ.labels(ctx);
    ctx.textAlign = 'center';
    for (const t of tanks) {
      if (t.dead || !visibleToPlayer(t)) continue;
      if (sight.on && t === player) continue;
      const p = W3D ? worldToScreen(t.x, t.y, t.T.I.totalH + 1.4) : worldToScreen(t.x, t.y - t.T.len * 0.8);
      if (p.behind) continue;
      if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
      const w = 38, f = crewFrac(t);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
      const cb = Meta.P.opts.cb;
      ctx.fillStyle = t.team === 0 ? (t === player ? (cb ? '#ffffff' : '#7ad06a') : '#5aa8ff') : cb ? '#ff9a1a' : '#ff5040';
      ctx.fillRect(p.x - w / 2, p.y, w * f, 4);
      // palette pour daltoniens : un rond au-dessus des alliés (les ennemis ont leur chevron)
      if (cb && t.team === 0 && t !== player) { ctx.strokeStyle = '#5aa8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 20 * uiK, 5 * uiK, 0, TAU); ctx.stroke(); }
      if (t.fires.length) { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(p.x + w / 2 + 3, p.y - 1, 5, 6); }
      if (t !== player) {
        ctx.font = F(600, 10);
        ctx.fillStyle = t.team === 0 ? '#a8d0ff' : '#ffb0a8';
        ctx.fillText(t.T.name + (t.team === 0 ? ' · ' + t.name.replace('Ally ', 'A') : ''), p.x, p.y - 4);
      }
    }
    for (const tx of texts) {
      const p = worldToScreen(tx.x, tx.y, 2.6 + (1 - tx.life / tx.max) * 1.5);
      if (p.behind) continue;
      const a = Math.min(1, tx.life / tx.max * 2);
      ctx.font = F(700, Math.round(13 * tx.scale));
      ctx.fillStyle = 'rgba(0,0,0,' + a * 0.7 + ')';
      ctx.fillText(tx.text, p.x + 1, p.y + 1);
      ctx.globalAlpha = a; ctx.fillStyle = tx.color; ctx.fillText(tx.text, p.x, p.y); ctx.globalAlpha = 1;
    }
    if (player && !player.dead) {
      for (const s of shells) {
        if (!s.warned || s.by === player) continue;
        const p = worldToScreen(s.x, s.y);
        if (p.x > 0 && p.y > 0 && p.x < W && p.y < H) continue;
        const pp = worldToScreen(player.x, player.y);
        const a = Math.atan2(p.y - pp.y, p.x - pp.x);
        const ex = clamp(p.x, 24, W - 24), ey = clamp(p.y, 24, H - 24);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
        ctx.fillStyle = '#ff4030';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  const CREW_ABBR = { driver: 'Dr', radio: 'Rd', gunner: 'Gn', commander: 'Cm', loader: 'Ld' };
  // ===================== Interface de bataille =====================
  // Dessin dans le repère virtuel de l'interface (W/uiK × H/uiK) : W et H prennent ces valeurs le temps
  // du dessin, si bien que les projections du monde (worldToScreen) y tombent juste
  function inUI(fn) {
    const w = W, h = H;
    W = w / uiK; H = h / uiK;
    ctx.save(); ctx.scale(uiK, uiK);
    try { fn(); } finally { ctx.restore(); W = w; H = h; }
  }
  // police réduite pour qu'un texte tienne dans une largeur
  function fitFont(text, max, px, wt = 700, min = 8) {
    ctx.font = `${wt} ${px}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    if (w > max) ctx.font = `${wt} ${Math.max(min, px * max / w).toFixed(1)}px system-ui, sans-serif`;
  }
  const F = (wt, px) => `${wt} ${(px * uiK).toFixed(1)}px system-ui, sans-serif`; // police à l'échelle, hors du repère virtuel
  const hudTitle = () => {
    const lv = L();
    return mode === 'survie' ? `Survival · ${lv.name} · Wave ${survWave}${nextWaveT > 0 ? ` · next in ${Math.ceil(nextWaveT)} s` : ''}`
      : mode === 'duel' ? `Duel · ${lv.name} · Round ${duelScore[0] + duelScore[1] + 1} · ${duelScore[0]} – ${duelScore[1]}`
      : `Sector ${levelIdx + 1} · ${lv.name} · Wave ${waveIdx + 1}/${WAVES}`;
  };
  // Mise en page de l'image (repère virtuel) : mini-carte en haut à droite, bandeau du score entre les
  // boutons tactiles et la mini-carte, panneau du char en bas (réduit à la lunette, resserré et décalé
  // entre le manche et les boutons de tir en tactile), journal à gauche ou au-dessus du panneau,
  // colonne centrale (messages, bandeaux) et caméra d'impact en incrustation
  const ui = { mm: null, bar: null, panel: null, logY: 0, pip: null, half: 300, feedW: 300, feedY: 0 };
  function layoutUI() {
    const tch = touch.on && inBattle(), k = uiK, [, , sb, sl] = touch.safe;
    const mw = Math.min(230, W * 0.22), mh = WH * mw / WW;
    const mm = ui.mm = { x0: W - mw - 12, y0: 12, w: mw, h: mh, bottom: 15 + mh };
    ctx.font = '600 14px system-ui, sans-serif';
    const title = hudTitle(), tw = Math.max(250, ctx.measureText(title).width + 30);
    let lt = 10;
    if (tch) for (const q of touch.btns) if (q.b.row === 1) lt = Math.max(lt, (q.x + q.w) / k + 8);
    const rt = mm.x0 - 10, bw = Math.min(tw, rt - lt), bc = clamp(W / 2, lt + bw / 2, rt - bw / 2);
    ui.bar = { x0: bc - bw / 2, x1: bc + bw / 2, cx: bc, title };
    ui.oy = OBJ.hudH(); // ligne de l'objectif sous le bandeau
    // panneau : 560 de large, 380 au moins quand les boutons tactiles le serrent
    const compact = sight.on, top = compact ? 48 : 120;
    let pl = 10, pr = W - 10;
    if (tch) {
      pl = (sl + 166) / k;
      for (const q of touch.btns) if (q.r && q.cy + q.r > (H - top) * k) pr = Math.min(pr, (q.cx - q.r - 10) / k);
    }
    const pw = clamp(pr - pl, 380, 560);
    if (pr - pl < pw) pl = Math.max(10, pr - pw);
    const pcx = clamp(W / 2, pl + pw / 2, Math.max(pl + pw / 2, pr - pw / 2));
    ui.panel = player ? { x0: pcx - pw / 2, x1: pcx + pw / 2, w: pw, top: H - top, by: compact ? H - 46 : H - 98, compact } : null;
    // incrustation de la caméra d'impact : sous la mini-carte sur grand écran ; ailleurs à sa place,
    // au-dessus des boutons de tir en tactile
    ui.pip = null;
    if (HitCam.active()) {
      // à la lunette, l'incrustation ne mord pas sur l'oculaire
      const sr = sight.on ? (W * k / 2 + Math.max(60, Math.min(W * k / 2, H * k / 2 - 60 * k))) / k + 10 : 0;
      const big = W >= 1150 && !tch && W - 14 - sr >= 240;
      let cw, ch, x0, y0;
      if (big) { cw = Math.min(420, W * 0.3, W - 14 - sr); y0 = mm.bottom + 14; ch = Math.min(cw * 0.66, (ui.panel ? ui.panel.top : H) - 12 - y0); x0 = W - cw - 14; }
      else {
        cw = Math.min(300, W - 24 - ui.bar.x1); ch = cw * 0.66; y0 = 12;
        if (tch) { let tb = H; for (const q of touch.btns) if (q.r) tb = Math.min(tb, (q.cy - q.r) / k); if (ch > tb - 8 - y0) { ch = Math.max(90, tb - 8 - y0); cw = ch / 0.66; } }
        x0 = W - 12 - cw;
      }
      ui.pip = { x0, y0, w: cw, h: ch, big };
    }
    // colonne centrale (demi-largeur) et fil des destructions à sa gauche
    ui.half = clamp(Math.min(mm.x0, ui.pip ? ui.pip.x0 : W) - 16 - W / 2, 160, 300);
    ui.feedW = Math.max(150, Math.min(W / 2 - ui.half, tch ? W : ui.bar.x0) - 20);
    ui.feedY = (tch ? touch.top / k : 0) + 24;
    // journal : en bas à gauche, au-dessus du manche tactile, ou au-dessus du panneau s'il le toucherait
    ctx.font = '600 12px system-ui, sans-serif';
    const lw = logs.reduce((m, l) => Math.max(m, ctx.measureText(l.text).width), 0) + 24;
    let ly = tch ? (H * k - sb - 176) / k : H - 20;
    if (ui.panel && lw + 10 > ui.panel.x0 && ly > ui.panel.top - 34) ly = ui.panel.top - 34;
    ui.logY = ly;
    // à la lunette, le journal tient à gauche de l'oculaire
    ui.logMax = sight.on ? (W * k / 2 - Math.max(60, Math.min(W * k / 2, H * k / 2 - 60 * k))) / k - 30 : 1e4;
  }

  function drawHUD() {
    inUI(() => { layoutUI(); drawHudBase(); });
    drawAim();
    inUI(drawHudOver);
  }
  // Bandeau du score, fil des destructions, mini-carte, journal et panneau du char
  function drawHudBase() {
    const b = ui.bar;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x0, 8, b.x1 - b.x0, 46);
    fitFont(b.title, b.x1 - b.x0 - 16, 14, 600);
    ctx.fillStyle = '#e9d9a6'; ctx.fillText(b.title, b.cx, 26);
    for (let team = 0; team < 2; team++) {
      const list = tanks.filter(t => t.team === team), st = Math.min(18, ((b.x1 - b.x0) / 2 - 30) / Math.max(5, list.length));
      list.forEach((t, i) => {
        const x = team === 0 ? b.cx - 22 - (list.length - 1 - i) * st - 14 : b.cx + 22 + i * st, w = Math.min(14, st - 3);
        ctx.fillStyle = t.dead ? '#333' : teamCol(team);
        ctx.fillRect(x, 34, w, 12);
        if (t === player) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1, 33, w + 2, 14); }
        if (t.dead) { ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + w, 46); ctx.moveTo(x + w, 34); ctx.lineTo(x, 46); ctx.stroke(); }
      });
    }
    ctx.fillStyle = '#ccc'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('VS', b.cx, 45);
    OBJ.hud(ctx, b);
    // fil des destructions (en haut à gauche)
    ctx.textAlign = 'left';
    feed.forEach((f, i) => {
      const y = ui.feedY + i * 20;
      ctx.globalAlpha = Math.min(1, f.life);
      const mid = f.ff ? ' ✖ FRIENDLY FIRE ✖ ' : f.det ? ' 💥 ' : ' ⟶ ', how = f.how ? ` · ${HOW[f.how]}` : '';
      fitFont(f.a + mid + f.v + how, ui.feedW - 16, 12, 600);
      const wA = ctx.measureText(f.a).width, wM = ctx.measureText(mid).width, wV = ctx.measureText(f.v).width, wH = ctx.measureText(how).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, y - 13, wA + wM + wV + wH + 16, 18);
      ctx.fillStyle = '#b8b2a0'; ctx.fillText(how, 18 + wA + wM + wV, y);
      ctx.fillStyle = f.at === 0 ? '#8cc4ff' : f.at === 1 ? '#ff8c80' : '#aaa'; ctx.fillText(f.a, 18, y);
      ctx.fillStyle = f.ff ? '#ffaa44' : '#ddd'; ctx.fillText(mid, 18 + wA, y);
      ctx.fillStyle = f.vt === 0 ? '#8cc4ff' : '#ff8c80'; ctx.fillText(f.v, 18 + wA + wM, y);
      ctx.globalAlpha = 1;
    });
    if (!(ui.pip && !ui.pip.big)) drawMinimap();
    if (DEV) { // ?debug : cadence et résolution dynamique du rendu 3D
      ctx.textAlign = 'right'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#9fd0ff';
      ctx.fillText(`${Math.round(1000 / dyn.ema)} fps · 3D ${Math.round(dyn.k * 100)}% · DPR ${DPR} · UI ×${uiK.toFixed(2)}`, W - 6, H - 4);
    }
    // journal des dégâts subis
    ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif';
    const n = state === 'intro' && cardOn() ? 0 : Math.max(1, Math.floor((ui.logY - ui.feedY - feed.length * 20) / 18));
    logs.slice(0, n).forEach((l, i) => {
      const y = ui.logY - i * 18;
      ctx.globalAlpha = Math.min(1, l.life);
      let tx = l.text;
      fitFont(tx, ui.logMax, 12, 600, 10);
      while (tx.length > 8 && ctx.measureText(tx).width > ui.logMax) tx = tx.slice(0, -2).trimEnd() + '…';
      const w = ctx.measureText(tx).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(10, y - 13, w + 14, 17);
      ctx.fillStyle = l.color; ctx.fillText(tx, 17, y);
      ctx.globalAlpha = 1;
    });
    if (player && ui.panel) { drawTankPanel(ui.panel); drawRadioRow(); }
  }
  // Réticules (à l'échelle de l'écran : ils suivent le monde)
  function drawAim() {
    drawDmgDirs();
    if (sight.on) { drawSightReticle(); return; }
    if (!(player && !player.dead && (state === 'play' || state === 'intro' || state === 'ending'))) {
      if (state !== 'menu') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 3, 0, TAU); ctx.fill(); }
      return;
    }
    const m = player.aim3 && W3D ? player.aim3 : screenToWorld(mouse.x, mouse.y), pv = pivot(player);
    const d = Math.hypot(m.x - pv.x, m.y - pv.y), ta = player.angle + player.turret;
    const gp = worldToScreen(pv.x + Math.cos(ta) * d, pv.y + Math.sin(ta) * d, m.z != null ? m.z : 1.6);
    const rr = Math.max(4, d * Math.tan(player.disp) * 2 * S);
    // char visé : plaque, blindage effectif et verdict (préréglage assisté), qui colorent aussi le réticule
    let vr = null, pr = null;
    if (W3D && m.tank && !m.tank.dead && assisted()) {
      player.probeT = (player.probeT || 0) - 1 / 60;
      if (player.probeT <= 0 || !player.probe) {
        player.probeT = 0.1;
        const z0 = player.gz + player.T.S.gun.z;
        player.probe = sightProbe(Math.atan2(m.y - pv.y, m.x - pv.x), z0, (m.z - z0) / Math.max(1, d));
      }
      pr = player.probe;
      if (pr && pr.kind === 'tank' && pr.tank === m.tank && pr.plate) vr = verdictOf(pr); else pr = null;
    }
    ctx.strokeStyle = vr ? vr.col : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(gp.x, gp.y, rr, 0, TAU); ctx.stroke();
    const rf = player.reloadT > 0 ? 1 - player.reloadT / player.reloadMax : 1;
    ctx.strokeStyle = vr ? vr.col : rf >= 1 ? '#ffe27a' : 'rgba(255,200,90,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(gp.x, gp.y, rr + 5, -Math.PI / 2, -Math.PI / 2 + TAU * rf); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mouse.x - 10, mouse.y); ctx.lineTo(mouse.x - 3, mouse.y); ctx.moveTo(mouse.x + 3, mouse.y); ctx.lineTo(mouse.x + 10, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 10); ctx.lineTo(mouse.x, mouse.y - 3); ctx.moveTo(mouse.x, mouse.y + 3); ctx.lineTo(mouse.x, mouse.y + 10);
    ctx.stroke();
    // pénétration estimée à cette distance ; la lecture passe au-dessus du curseur près du panneau
    // du char, et à sa gauche près du bord droit
    const rdUp = mouse.y + 40 * uiK > (ui.panel ? ui.panel.top * uiK : H), rdL = mouse.x > W - 230 * uiK;
    const rdX = rdL ? mouse.x - 14 : mouse.x + 14, rdY = rdUp ? mouse.y - 32 * uiK : mouse.y + 18 * uiK;
    ctx.font = F(600, 11); ctx.textAlign = rdL ? 'right' : 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    if (assisted()) ctx.fillText(`${Math.round(d * RK)} m · ${Math.round(penAt(player.T, player.shell, d))} mm`, rdX, rdY);
    if (vr) {
      ctx.font = F(700, 11); ctx.fillStyle = vr.col;
      ctx.fillText(`${pr.plate} · ${Math.round(pr.eff)} mm eff. · ${vr.verdict}`, rdX, rdY + 14 * uiK);
    }
    if (hitMk) drawHitMark(mouse.x, mouse.y, !rdUp);
  }
  // Caméra d'impact, messages et bandeaux du centre, carte d'introduction
  function drawHudOver() {
    const pp = ui.pip;
    if (pp) {
      HitCam.draw(ctx, pp.x0, pp.y0, pp.w, pp.h, DPR * uiK, { compact: !pp.big, hint: device() === 'pad' ? 'View: skip' : touch.on ? 'Tap to skip' : `${keyName('xray')}: skip` });
      const hev = HitCam.ev(), my = pp.y0 + pp.h + 10, mh = Math.min(pp.w * 0.62, (ui.panel ? ui.panel.top : H) - 12 - my);
      if (hev && hev.metal && pp.big && mh >= 150) drawMetalPanel(ctx, hev.metal, pp.x0, my, pp.w, mh, clamp((HitCam.time() - HitCam.T_HIT) / HitCam.T_IN, 0, 1), Math.min(1, HitCam.time() / 0.15, (HitCam.DUR - HitCam.time()) / 0.4));
    }
    // messages (deux lignes au plus), puis bandeaux des coups et des médailles
    ctx.textAlign = 'center';
    msgs.forEach((m, i) => {
      const y = 82 + ui.oy + i * 26;
      ctx.globalAlpha = Math.min(1, m.life * 2);
      fitFont(m.text, ui.half * 2, 20, 800);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(m.text, W / 2 + 2, y + 2);
      ctx.fillStyle = m.color; ctx.fillText(m.text, W / 2, y);
    });
    ctx.globalAlpha = 1;
    // colonne centrale : consigne du tutoriel ou fiche « détruit par », puis les bandeaux
    let cy = 140 + ui.oy;
    const ts = tutCur();
    if (ts) { drawTut(ts, cy); cy += 44; }
    else if (killCard && player && player.dead) { drawKillCard(cy - 18); cy += 60; }
    drawHints();
    for (const r of ribbons) {
      const y = cy + (r.y || 0), tx = r.gold ? `${r.t}${r.sub ? '  ·  ' + r.sub : ''}` : `${r.ic}  ${r.t}`;
      fitFont(tx, ui.half * 2 - 44, r.gold ? 14 : 13, r.gold ? 800 : 700);
      const w = ctx.measureText(tx).width + 44;
      ctx.globalAlpha = Math.min(1, r.life * 2, (r.max - r.life) / 0.2);
      if (r.gold) {
        const g = ctx.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
        g.addColorStop(0, '#9a7428'); g.addColorStop(0.5, '#ffe39a'); g.addColorStop(1, '#9a7428');
        ctx.fillStyle = g; ctx.fillRect(W / 2 - w / 2, y - 15, w, 21);
        ctx.fillStyle = '#2a1d05';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(W / 2 - w / 2, y - 15, w, 21);
        ctx.fillStyle = r.c; ctx.fillRect(W / 2 - w / 2, y - 15, 3, 21);
      }
      ctx.fillText(tx, W / 2, y);
      ctx.globalAlpha = 1;
    }
    if (helpT > 0 && state !== 'intro') drawControls(H / 2 - 90);
    if (state === 'intro') {
      const lv = L(), card = cardOn();
      ctx.save();
      if (card) ctx.translate(0, -70); // la fiche des commandes prend place sous le titre, dans une boîte centrée
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (card) ctx.fillRect(W / 2 - 260, H / 2 - 90, 520, 290); else ctx.fillRect(0, H / 2 - 90, W, 150);
      // carte historique : lieu et date de la bataille
      ctx.fillStyle = '#a39d88'; ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(lv.when.toUpperCase(), W / 2, H / 2 - 74);
      ctx.fillStyle = '#e9d9a6'; fitFont(lv.name.toUpperCase(), card ? 500 : W - 40, 34, 800);
      ctx.fillText(lv.name.toUpperCase(), W / 2, H / 2 - 45);
      ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = '#bdb7a2';
      ctx.fillText(mode === 'survie' ? `${lv.sub} · Survival · alone against all`
        : mode === 'duel' ? `${lv.sub} · Duel · round ${duelScore[0] + duelScore[1] + 1}`
        : `${lv.sub} · Wave ${waveIdx + 1}/${WAVES} · ${OBJ.introTxt() || '5 vs 5'}`, W / 2, H / 2 - 18);
      ctx.font = '800 48px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      if (card) { const yb = drawControls(H / 2); ctx.textAlign = 'center'; ctx.font = '700 15px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`Starting in ${Math.max(1, Math.ceil(introT))}`, W / 2, yb + 22); }
      else ctx.fillText(String(Math.max(1, Math.ceil(introT))), W / 2, H / 2 + 38);
      ctx.restore();
    }
  }

  // Coupe de la plaque simulée : lecture des images enregistrées, progression du calcul, bilan
  function drawMetalPanel(c, sim, X, Y, w, h, p, alpha = 1, big = false) {
    const fs = big ? 1.15 : 1;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = '#000'; c.fillRect(X - 3, Y - 3, w + 6, h + 6);
    const tH = Math.round(32 * fs), fH = Math.round(34 * fs);
    const total = sim.st.done ? sim.frames.length : Math.max(sim.frames.length, sim.expected);
    let fi = Math.round(p * (total - 1));
    const waiting = !sim.st.done && fi > sim.frames.length - 1;
    fi = Math.min(fi, sim.frames.length - 1);
    MetalSim.draw(c, sim, fi, X, Y + tH, w, h - tH - fH);
    c.strokeStyle = '#d9a441'; c.lineWidth = 2; c.strokeRect(X - 1, Y - 1, w + 2, h + 2);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(X, Y, w, tH); c.fillRect(X, Y + h - fH, w, fH);
    const inf = sim.info, f = (v, k = 0) => v.toFixed(k);
    c.textAlign = 'left';
    c.font = `700 ${12 * fs}px system-ui, sans-serif`; c.fillStyle = '#f0d27a';
    c.fillText(`PLATE CROSS-SECTION · peridynamic simulation`, X + 8, Y + 13 * fs);
    c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#cfc8b0';
    c.fillText(`${inf.mm} mm of steel at ${inf.angle}° · ${sim.N.toLocaleString('en-US')} particles · ${sim.bonds.toLocaleString('en-US')} bonds · step ${f(sim.dt * 1e9, 0)} ns`, X + 8, Y + 26 * fs);
    c.font = `700 ${11 * fs}px system-ui, sans-serif`;
    const st = sim.st;
    if (!st.done) {
      c.fillStyle = '#8cc8ff';
      c.fillText(`${waiting ? 'Computing' : 'Computed'}: ${Math.min(99, Math.round(st.t / sim.tMax * 100))}% · ${st.step.toLocaleString('en-US')} steps · ${st.broken.toLocaleString('en-US')} broken bonds`, X + 8, Y + h - fH + 14 * fs);
    } else {
      const res = inf.sb.heat ? (st.perforated ? 'jet passes through' : 'jet stopped') : inf.sb.he ? (st.ejected > 3 ? 'plate torn' : 'plate bulged') : (st.perforated ? 'penetrated' : 'not penetrated');
      c.fillStyle = st.perforated || (inf.sb.he && st.ejected > 3) ? '#a6f08a' : '#ff9a7a';
      c.fillText(`Plate ${res} · ${st.broken.toLocaleString('en-US')} broken bonds · T max ${Math.round(st.maxTemp)} K`, X + 8, Y + h - fH + 14 * fs);
      c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#cfc8b0';
      c.fillText(`${st.fragments} fragment${st.fragments > 1 ? 's' : ''} torn off (${f(st.ejectedKg, 2)} kg) · bulge ${f(st.bulge * 1000, 0)} mm · projectile ${Math.round(st.projDamage * 100)}% broken`, X + 8, Y + h - fH + 27 * fs);
    }
    c.textAlign = 'right'; c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#9fc4e6';
    if (big || !st.done || p < 1) c.fillText(`slow-motion ×${Math.round(3 / sim.tMax).toLocaleString('en-US')}`, X + w - 8, Y + 13 * fs);
    c.restore();
  }

  // Panneau du char : équipage, modules, obus. Réduit autour du bas de l'écran sur les petites
  // fenêtres (iframe 640×360 du portail), où il couvrirait sinon toute la largeur.
  // Panneau du char (repère virtuel) : 560 de large, resserré jusqu'à 380 entre les commandes tactiles
  // (icônes d'équipage et de modules plus petites, colonne de droite dans la ligne du nom) ; à la
  // lunette, seule la rangée des obus reste, sous l'oculaire
  const MODS = [['engine', 'Engine', 'Eng'], ['trans', 'Transm.', 'Trans'], ['breech', 'Breech', 'Brch'], ['fuel', 'Fuel', 'Fuel'], ['ammo', 'Ammo', 'Ammo']];
  function drawTankPanel(P) {
    const T = player.T, { x0: bx, by, w: pw, compact } = P, wide = pw >= 540, g = player.mg;
    const tag = k => SHELLS[k].tag || k, kb = device() === 'kb';
    const rf = player.reloadT > 0 ? 1 - player.reloadT / player.reloadMax : 1;
    const rw = wide ? 96 : 0, step = Math.floor((pw - 16 - rw) / 7), sw = step - 2, sy = compact ? by + 5 : by + 52;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, pw, compact ? 40 : 90);
    if (!compact) {
      ctx.textAlign = 'left'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#f0e6c8';
      const name = wide ? `${T.name} · ${T.cls}` : T.name;
      ctx.fillText(name, bx + 10, by + 17);
      const mx = wide ? bx + 175 : bx + 18 + ctx.measureText(name).width;
      ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = g.jam > 0 ? '#ff9a5c' : '#c9c4b2';
      const mgn = g.type === 'SmKH' ? g.ammoH : g.ammo;
      ctx.fillText(g.jam > 0 ? `MG: barrel change ${Math.ceil(g.jam)} s` : wide ? `MG${kb ? ` (${keyName('mg')}/${keyName('belt')})` : ''} ${MG_AMMO[g.type].name} : ${mgn}` : `MG ${mgn}`, mx, by + 17);
      if (!(g.jam > 0) && wide) { ctx.fillStyle = '#2c3024'; ctx.fillRect(bx + 335, by + 9, 50, 6); ctx.fillStyle = g.heat > 180 ? '#ff6a3a' : '#c98a3a'; ctx.fillRect(bx + 335, by + 9, 50 * Math.min(1, g.heat / 250), 6); }
      if (!wide) { ctx.textAlign = 'right'; ctx.fillStyle = player.ready > 0 ? '#c9c4b2' : '#ffb070'; ctx.fillText(`Ready ${player.ready}/${T.ready + player.up.ready}`, bx + pw - 98, by + 17); }
      // équipage : efficacité du poste (blessure, remplaçant) ; une croix rouge sur un blessé qui saigne
      const cw = wide ? 30 : 24, ch = wide ? 20 : 18;
      let x = bx + 10;
      for (const role of T.S.crew) {
        const m = player.mods.find(q => q.kind === 'crew' && q.role === role);
        const r = m.hp / m.max0, vacant = !roleOk(player, role) && m.hp > 0;
        ctx.fillStyle = r <= 0 ? '#5a1510' : r < 1 ? '#c07a20' : '#3f7a4a';
        ctx.fillRect(x, by + 24, cw, ch);
        if (vacant || (player.roles[role] !== m.i && player.roles[role] >= 0)) { ctx.strokeStyle = '#8cc8ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, by + 24.5, cw - 1, ch - 1); }
        ctx.fillStyle = '#fff'; ctx.font = `700 ${wide ? 11 : 10}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(CREW_ABBR[role], x + cw / 2, by + 24 + ch * 0.7);
        if (r <= 0) { ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, by + 27); ctx.lineTo(x + cw - 4, by + 21 + ch); ctx.stroke(); }
        ctx.fillStyle = '#8cc8ff'; ctx.fillRect(x, by + 25 + ch, cw * eff(player, role), 2);
        if (m.hp > 0 && m.hp < 30 && !m.band) { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(x + cw - 6, by + 26, 4, 1.5); ctx.fillRect(x + cw - 4.75, by + 24.75, 1.5, 4); }
        x += cw + 4;
      }
      // modules
      const mw = wide ? 50 : 40;
      x = wide ? bx + 200 : x + 6;
      ctx.textAlign = 'center'; ctx.font = `600 ${wide ? 10 : 9}px system-ui, sans-serif`;
      for (const [kind, label, short] of MODS) {
        const ms = player.mods.filter(m => m.kind === kind), dead = ms.some(m => m.hp <= 0), hurt = ms.some(m => m.hp < m.max0), rep = player.rep[kind];
        const l = wide ? label : short;
        ctx.fillStyle = dead ? '#5a1510' : hurt ? '#8a5a18' : '#2c3a2c';
        ctx.fillRect(x, by + 24, mw, 20);
        ctx.fillStyle = '#eee'; ctx.fillText(rep != null ? `${l} ${Math.ceil(rep)}s` : l, x + mw / 2, by + 37);
        x += mw + 3;
      }
      // bandeau d'état au-dessus du panneau : vitesse, avaries, feu, équipage
      ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif';
      const st = [];
      const gr = player.shiftT > 0 ? '·' : player.gear > 0 ? String(player.gear) : player.gear < 0 ? 'R' + -player.gear : 'N';
      st.push([`${Math.round(Math.abs(player.speed) / PX * 3.6)} km/h · ${gr} · ${Math.round(player.rpmA / 50) * 50} rpm`, '#d8d4c6']);
      if (player.swap) st.push([`${CREW_ABBR[player.swap.from]} → ${CREW_ABBR[player.swap.role]} ${player.swap.t.toFixed(0)} s`, '#8cc8ff']);
      else if (player.aid) st.push([`First aid ${player.aid.t.toFixed(0)} s`, '#8cc8ff']);
      const K = a => kb ? keyName(a) : '';
      if (player.trackT > 0) st.push([player.dismount ? `Repairing track ${Math.ceil(player.trackT)} s` : kb ? `Track broken · ${K('repair')}: repair` : 'Track broken', '#ffb070']);
      if (player.gunT > 0) st.push([`Gun barrel damaged ${Math.ceil(player.gunT)} s`, '#ff8a6a']);
      if (player.ringT > 0) st.push(['Turret ring jammed', '#ffb070']);
      if (player.elevJamT > 0) st.push(['Elevation jammed', '#ffb070']);
      if (player.stunT > 0) st.push(['Crew stunned', '#ffcf7a']);
      if (Object.keys(player.rep).length && !player.repOk) st.push(['Repairs: stop the tank', '#ffcf7a']);
      if ((player.wheelK || 1) < 1) st.push([`Wheels −${Math.round((1 - player.wheelK) * 100)}%`, '#ffb070']);
      if (player.bentT > 0) st.push(['Barrel bent', '#ffb070']);
      if (player.fires.length) st.push([`${FIRE_NAMES[player.fires[0].src].toUpperCase()}${player.extT > 0 ? ' · extinguishing' : player.extN > 0 && player.fires.some(f => f.src !== 'propellant') && kb ? ` · ${K('ext')}: extinguisher ×${player.extN}` : ''}`, '#ff6a3a']);
      if (player.cookT > 0) st.push([`AMMO COOKING OFF ${Math.ceil(player.cookT)} s${kb ? ` · ${K('bail')}: bail out` : ''}`, '#ff4a2a']);
      else if (player.fires.length && kb) st.push([`${K('bail')}: bail out`, '#ffb070']);
      if (player.noFuel) st.push(['Out of fuel', '#ff6a5a']); else if (player.fuelOutT != null) st.push(['Fuel leak', '#ffb070']);
      if (player.grind) st.push(['Gear stuck', '#ffb070']);
      if (!radioOk(player)) st.push(['Radio out', '#ffb070']);
      if (!roleOk(player, 'commander')) st.push(['No commander: reduced awareness', '#ffb070']);
      if (!player.dead && player.revealT <= 0 && inBush(player)) st.push(['Concealed', '#a6f08a']);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by - 22, pw, 20);
      let sx2 = bx + 10;
      for (const [s, c] of st) {
        const w = ctx.measureText(s).width;
        if (sx2 + w > bx + pw - 6) break;
        ctx.fillStyle = c; ctx.fillText(s, sx2, by - 8); sx2 += w + 12;
      }
    }
    // colonne de droite : obus chargé, râtelier, trappe
    ctx.textAlign = 'left'; ctx.font = '600 11px system-ui, sans-serif';
    if (wide) {
      const rx = bx + pw - rw + 4;
      ctx.fillStyle = '#e9d9a6';
      ctx.fillText(player.nextShell ? `${tag(player.shell)} → ${tag(player.nextShell)}` : `Loaded ${tag(player.shell)}`, rx, compact ? sy + 12 : sy - 3);
      ctx.fillStyle = player.ready > 0 ? '#c9c4b2' : '#ffb070';
      ctx.fillText(`Ready rack ${player.ready}/${T.ready + player.up.ready}`, rx, compact ? sy + 26 : sy + 12);
      if (!compact) { ctx.fillStyle = player.hatch ? '#ffcf7a' : '#8f8a77'; ctx.fillText((player.hatch ? 'Commander out' : 'Buttoned up') + (kb ? ` (${keyName('hatch')})` : ''), rx, sy + 27); }
    }
    // obus (emplacements touchables en mode tactile, dans le repère de l'écran)
    let x = bx + 8;
    touch.slots.length = 0;
    SHELL_KEYS.forEach((k, i) => {
      if (touch.on) touch.slots.push({ key: k, x: x * uiK, y: sy * uiK, w: sw * uiK, h: 30 * uiK });
      const sh = SHELLS[k], sel = player.shell === k, n = player.ammo[k];
      ctx.fillStyle = sel ? '#4a3f1a' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, sy, sw, 30);
      if (sel) { ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, sy + 0.5, sw - 1, 29); }
      if (player.nextShell === k) { ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 0.5, sy + 0.5, sw - 1, 29); ctx.setLineDash([]); }
      ctx.fillStyle = n ? (sel ? '#ffe27a' : '#ddd') : '#666'; ctx.font = '700 10px system-ui, sans-serif';
      ctx.fillText(kb ? `[${i + 1}] ${sh.tag || k}` : sh.tag || k, x + 4, sy + 13);
      ctx.font = '600 9.5px system-ui, sans-serif'; ctx.fillStyle = n ? '#aaa' : '#555';
      ctx.fillText(sh.tag || !assisted() ? `${n} rds` : `${n} · ${Math.round(penAt(player.T, k, 200))}`, x + 4, sy + 25);
      x += step;
    });
    // rechargement
    if (compact) { ctx.fillStyle = rf >= 1 ? '#ffe27a' : '#9a8a5a'; ctx.fillRect(bx, by, pw * rf, 3); }
    else {
      const rl = wide ? 110 : 80;
      ctx.fillStyle = '#2a2a24'; ctx.fillRect(bx + pw - rl - 10, by + 8, rl, 8);
      ctx.fillStyle = rf >= 1 ? '#ffe27a' : '#9a8a5a'; ctx.fillRect(bx + pw - rl - 10, by + 8, rl * rf, 8);
    }
  }

  function drawMinimap() {
    const { w: mw, h: mh, x0, y0 } = ui.mm, k = mw / WW;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    ctx.fillStyle = L().ground[0]; ctx.globalAlpha = 0.6; ctx.fillRect(x0, y0, mw, mh); ctx.globalAlpha = 1;
    for (const o of obstacles) {
      if (o.dead) continue;
      ctx.fillStyle = o.type === 'tree' ? 'rgba(20,50,20,0.7)' : 'rgba(40,36,30,0.85)';
      ctx.fillRect(x0 + o.x * k, y0 + o.y * k, Math.max(1, o.w * k), Math.max(1, o.h * k));
    }
    for (const t of tanks) {
      if (!t.dead && !visibleToPlayer(t)) continue;
      ctx.fillStyle = t.dead ? '#444' : t === player ? '#fff' : teamCol(t.team);
      const s = t === player ? 4 : 3;
      ctx.fillRect(x0 + t.x * k - s / 2, y0 + t.y * k - s / 2, s, s);
    }
    // fantômes (dernière position vue, 6 s) et signalements de l'artillerie (4 s)
    ctx.strokeStyle = 'rgba(255,130,110,0.85)'; ctx.lineWidth = 1;
    for (const [e, g] of seenAt) if (!e.dead && !visibleToPlayer(e) && gameTime - g.t < 6) ctx.strokeRect(x0 + g.x * k - 2, y0 + g.y * k - 2, 4, 4);
    for (const m of artyMarks) { ctx.globalAlpha = Math.min(1, m.life); ctx.beginPath(); ctx.arc(x0 + m.x * k, y0 + m.y * k, Math.max(3, 80 * k), 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (mode === 'campagne' && orders.kind !== 'free') {
      const o = orders.kind === 'move' ? orders.pos : orders.kind === 'attack' && visibleToPlayer(orders.target) ? orders.target : null;
      ctx.strokeStyle = '#ffe27a';
      if (o) { ctx.beginPath(); ctx.arc(x0 + o.x * k, y0 + o.y * k, 4, 0, TAU); ctx.stroke(); }
      ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'left';
      const txt = 'Orders: ' + ORDER_TXT[orders.kind], w = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, y0 + mh - 14, w + 8, 14);
      ctx.fillStyle = '#ffe27a'; ctx.fillText(txt, x0 + 4, y0 + mh - 4);
    }
    OBJ.minimap(ctx, x0, y0, k);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    if (W3D && cam3.vp) {
      // champ de la caméra : coins de l'écran ramenés au sol, à 900 px au plus de la caméra (un coin
      // au-dessus de l'horizon part à l'infini), découpé au cadre de la carte
      const ex = cam3.eye[0] * PX, ey = -cam3.eye[1] * PX;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, mw, mh); ctx.clip(); ctx.beginPath();
      [[0, 0], [W, 0], [W, H], [0, H]].forEach((c, i) => {
        const q = screenToWorld(c[0], c[1]), d = Math.hypot(q.x - ex, q.y - ey), f = d > 900 ? 900 / d : 1;
        const x = x0 + (ex + (q.x - ex) * f) * k, y = y0 + (ey + (q.y - ey) * f) * k;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.stroke(); ctx.restore();
    } else ctx.strokeRect(x0 + (camX - W / 2 / S) * k, y0 + (camY - H / 2 / S) * k, W / S * k, H / S * k);
  }

  // ===================== Vitrine 3D du menu =====================
  const viewer = { ang: 0.8, elev: 0.33, drag: null, xray: false, dist: 1, labels: false };
  // La vitrine affiche directement le canevas WebGL de R3 (aucune recopie par image, donc aucune
  // relecture du GPU) ; #viewer, transparent par-dessus, reçoit les gestes et les étiquettes.
  if (R3) { R3.canvas.id = 'viewer3d'; document.getElementById('showcase').prepend(R3.canvas); }
  const groundMesh = R3 ? (() => { const g = new G3.Builder(); g.ground(16, 64); return R3.upload(g); })() : null;
  function drawTank3D(id, w, h, ang, elev, xray, turretAng, clear, sk, hero, armorLv) {
    const camo = sk ? sk.camo : TEAM[0].camo, pat = sk ? sk.pat : 0;
    const M4 = G3.M4, I = TYPES[id].I, Sd = I.S;
    R3.begin(w, h, clear);
    // vitrine plein écran : plus de recul (même taille apparente pour tous les chars), char à droite
    const d = (6.2 + Sd.L * 0.75) * (xray ? 0.72 : 1) * (hero ? 1.5 * Math.max(1, (h / w) * 1.6) * viewer.dist : 1);
    const eye = [Math.cos(ang) * Math.cos(elev) * d, Math.sin(ang) * Math.cos(elev) * d, Math.sin(elev) * d + 1.0];
    let tgt = [0, 0, Sd.ht * 0.6];
    if (hero && w > h) { const k = d * 0.17; tgt = [tgt[0] + Math.sin(ang) * k, tgt[1] - Math.cos(ang) * k, tgt[2] + d * 0.03]; }
    R3.camera(M4.lookAt(eye, tgt, [0, 0, 1]), M4.persp(0.6, w / h, 0.1, 200), eye, [-0.55, 0.35, 0.75]);
    R3.draw(groundMesh, M4.ident(), { ground: xray ? [0.05, 0.09, 0.13] : [0.24, 0.22, 0.18], shadow: [Sd.L / 2, Sd.W / 2, 0.45, -0.3] });
    const tm = M4.trs(I.pivotX, I.pivotY, 0, turretAng);
    if (xray) {
      TankModels.makeModules(id).forEach((m, i) => {
        const frame = m.frame === 'turret' ? tm : M4.ident();
        R3.draw(MODMESH[id][i], M4.mul(frame, M4.trs(m.c[0], m.c[1], m.c[2], 0)), {});
      });
      R3.draw(MESH[id].hull, M4.ident(), { xray: true, alpha: 0.95, additive: true });
      R3.draw(MESH[id].turret, tm, { xray: true, alpha: 0.95, additive: true });
    } else {
      R3.draw(MESH[id].hull, M4.ident(), { camo, pat });
      R3.draw(MESH[id].turret, tm, { camo, pat });
      const ad = armorLv ? addonR3(id, armorLv) : null;
      if (ad) { R3.draw(ad.hull, M4.ident(), { camo, pat }); R3.draw(ad.turret, tm, { camo, pat }); }
    }
  }
  function renderViewer(dt) {
    const vc = $('viewer');
    if (!vc || !vc.clientWidth) return;
    const vd = Math.min(DPR, 1.25), w = Math.round(vc.clientWidth * vd), h = Math.round(vc.clientHeight * vd);
    if (!viewer.drag) viewer.ang += dt * 0.22;
    const ta = Math.sin(viewerT * 0.4) * 0.35;
    drawTank3D(chosenType, w, h, viewer.ang, viewer.elev, viewer.xray, ta, [0.05, 0.055, 0.045, 1], skinPreview ? Meta.SKINS.find(k => k.id === skinPreview) : Meta.skinOf(chosenType), true, Meta.partLv(chosenType, 'armor'));
    const c2 = vc.getContext('2d');
    if (!viewer.xray) { if (viewer.labels) { c2.clearRect(0, 0, vc.width, vc.height); viewer.labels = false; } return; }
    if (vc.width !== w || vc.height !== h) { vc.width = w; vc.height = h; }
    c2.clearRect(0, 0, w, h); viewer.labels = true;
    // noms des modules, reliés à leur position
    const I = TYPES[chosenType].I, tm = G3.M4.trs(I.pivotX, I.pivotY, 0, ta);
    const seen = new Set(), labels = [];
    c2.font = `600 ${Math.round(11 * DPR)}px system-ui, sans-serif`;
    c2.textAlign = 'center';
    for (const m of TankModels.makeModules(chosenType)) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      const top = [m.c[0], m.c[1], m.c[2] + m.s[2] / 2];
      const q = R3.project(m.frame === 'turret' ? G3.M4.apply(tm, top) : top, w, h);
      labels.push({ m, q, tw: c2.measureText(m.name).width + 10 * DPR });
    }
    // répartition sur plusieurs lignes pour éviter les chevauchements
    labels.sort((a, b) => a.q.y - b.q.y);
    const rows = [];
    for (const L of labels) {
      let r = 0;
      while ((rows[r] || []).some(o => Math.abs(o.q.x - L.q.x) < (o.tw + L.tw) / 2 + 4 * DPR)) r++;
      (rows[r] = rows[r] || []).push(L);
      L.row = r;
    }
    for (const L of labels) {
      const ly = (18 + L.row * 18) * DPR;
      c2.strokeStyle = 'rgba(255,255,255,0.4)'; c2.lineWidth = DPR;
      c2.beginPath(); c2.moveTo(L.q.x, L.q.y); c2.lineTo(L.q.x, ly + 4 * DPR); c2.stroke();
      c2.fillStyle = 'rgba(0,0,0,0.65)'; c2.fillRect(L.q.x - L.tw / 2, ly - 12 * DPR, L.tw, 16 * DPR);
      const k = L.m.kind;
      c2.fillStyle = k === 'crew' ? '#9fe0a8' : k === 'ammo' ? '#f0d27a' : k === 'fuel' ? '#ffb45a' : '#cfd6e0';
      c2.fillText(L.m.name, L.q.x, ly);
    }
  }

  // ===================== Écrans =====================
  const $ = id => document.getElementById(id);
  function specsHTML(T) {
    const Sd = T.S, A = Sd.armor;
    const eff = a => Math.round(a[0] / Math.cos(a[1] * D2R));
    const row = (l, a) => `<tr><td>${l}</td><td>${a[0]} mm at ${a[1]}°</td><td>≈ ${eff(a)} mm</td></tr>`;
    let h = `<div class="specTitle">${T.name} <small>${T.cls}</small></div><div class="specSub">${Sd.inspired} · ${Sd.real}</div>`;
    h += `<div class="specLine">Gun ${Sd.gun.name} · AP shell ${String(Ballistics.shell(T.id, 'APHE').m)} kg at ${Ballistics.shell(T.id, 'APHE').v0} m/s · reload ${T.reload.toFixed(1)} s · ${T.kmh} km/h</div>`;
    const Dd = T.D, trav = Vehicle.traverse(Dd, Dd.gov, true) / D2R;
    h += `<div class="specLine">${Dd.gears.length}+${Dd.rev.length} ${Dd.box.name} gearbox · reverse ${Math.round(Dd.revTop * 3.6)} km/h · ${Dd.steer.kind === 'regen' ? 'regenerative steering, neutral turn' : 'clutch-and-brake steering'} · ${T.arc ? `gun traverse ±${Math.round(T.arc / D2R)}° by hand` : `turret 360° in ${Math.round(360 / trav)} s (${Dd.trav.kind === 'hyd' ? 'hydraulic, engine-driven' : Dd.trav.kind === 'elec' ? 'electric' : 'hand-cranked'})`} · elevation ${Dd.elev[0]}° to +${Dd.elev[1]}° · climbs ${Dd.climb}° · fords ${Dd.ford} m${T.mass > HEAVY_T ? ' · too heavy for ice and wooden bridges' : ''}</div>`;
    h += `<div class="specLine">Crew: ${Sd.crew.map(r => TankModels.NAMES[r]).join(', ')}</div>`;
    h += '<table class="spec"><tr><th>Armor</th><th>Thickness</th><th>Effective</th></tr>';
    h += row('Upper front hull', A.hull.up) + row('Lower front hull', A.hull.low) + row('Hull sides', A.hull.side) + row('Lower sides (behind wheels)', A.hull.lowSide) + row('Rear hull', A.hull.rear);
    if (A.turret) h += row('Front turret', A.turret.front) + row('Gun mantlet', A.turret.mantlet) + row('Turret sides', A.turret.side) + row('Rear turret', A.turret.rear);
    h += `<tr><td>Roof</td><td>${A.hull.roof} mm</td><td></td></tr></table>`;
    h += '<table class="spec"><tr><th>Shell</th><th>100 m</th><th>500 m</th><th>Rounds</th></tr>';
    for (const k of SHELL_KEYS) h += SHELLS[k].tag ? `<tr><td>${Ballistics.shell(T.id, k).name}</td><td>—</td><td>—</td><td>${T.ammo[k]}</td></tr>` : `<tr><td>${Ballistics.shell(T.id, k).name}</td><td>${Math.round(penAt(T, k, 100 / RK))} mm</td><td>${Math.round(penAt(T, k, 500 / RK))} mm</td><td>${T.ammo[k]}</td></tr>`;
    return h + '</table>';
  }
  // ===================== Menu =====================
  const lin2hex = c => '#' + c.map(v => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const thumbCache = {};
  function toast(text) {
    const d = document.createElement('div');
    d.className = 'toast'; d.innerHTML = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }
  function tankThumb(id) {
    const sk = Meta.skinOf(id), key = id + ':' + sk.id;
    if (!thumbCache[key] && R3 && !R3.lost) {
      drawTank3D(id, 480, 260, 0.75, 0.3, false, 0.25, [0.07, 0.08, 0.07, 1], sk);
      const c = document.createElement('canvas'); c.width = 480; c.height = 260;
      c.getContext('2d').drawImage(R3.canvas, 0, 0);
      thumbCache[key] = c.toDataURL('image/jpeg', 0.85);
    }
    return thumbCache[key] || '';
  }
  // Nouveautés du garage : chars à débloquer et pièces abordables encore jamais vus (pastille de l'onglet ;
  // ruban « NEW » sur les cartes de char tant qu'on reste dans le garage)
  let garageNew = new Set();
  function garageReady() {
    const P = Meta.P, l = [];
    for (const id in TYPES) {
      if (!P.tanks.includes(id)) { if (Meta.canBuyTank(id)) l.push('t:' + id); continue; }
      for (const d of Meta.PARTS) { const lv = Meta.partLv(id, d.id), c = Meta.partCost(id, d.id, lv); if (c && P.credits >= c) l.push(`p:${id}:${d.id}:${lv}`); }
    }
    return l;
  }
  function markGarage() {
    const P = Meta.P, l = garageReady().filter(k => !P.seen.includes(k));
    garageNew = new Set(l.filter(k => k[0] === 't').map(k => k.slice(2)));
    if (l.length) { P.seen.push(...l); P.seen = P.seen.slice(-300); Meta.save(); }
  }
  // mission réclamée : son, toast, et la promotion qu'elle apporte peut-être
  function claimMission(id) {
    const lv = Meta.P.level, c = Meta.claim(id);
    if (!c) return 0;
    toast(`Mission complete: +✪ ${fmt(c)}`); Sfx.notify(); celebrateGot('Weekly order reward');
    if (Meta.P.level > lv) celebratePromo(lv);
    return c;
  }
  function celebratePromo(lv0) {
    const P = Meta.P, now = Object.keys(Meta.TANKS).filter(id => Meta.TANKS[id].lvl > lv0 && Meta.TANKS[id].lvl <= P.level && !P.tanks.includes(id));
    celebrate({ kind: 'Promotion', name: Meta.rankName(), rar: P.level >= 10 ? 'legendary' : P.level >= 6 ? 'epic' : 'rare', icon: '🎖',
      flav: now.length ? `Now available: ${now.map(id => `${TYPES[id].name} (✪ ${fmt(Meta.TANKS[id].price)})`).join(', ')}` : `Rank ${P.level} reached` });
  }
  function updateTopbar() {
    const P = Meta.P, need = Meta.xpFor(P.level);
    $('dotGarage').classList.toggle('on', garageReady().some(k => !P.seen.includes(k)));
    $('credN').textContent = fmt(wheelHold ? wheelHold.credits : P.credits);
    $('kitsN').textContent = wheelHold ? wheelHold.kits : P.kits;
    $('rkLv').querySelector('span').textContent = P.level;
    $('rkLv').style.setProperty('--p', Math.round(P.xp / need * 100) + '%');
    $('rkName').textContent = Meta.rankName();
    $('rkXp').textContent = `${fmt(P.xp)} / ${fmt(need)} XP`;
    $('dotWheel').classList.toggle('on', Meta.canSpinFree() || !Meta.crateLeft());
    $('dotMissions').classList.toggle('on', Meta.claimable().length > 0 || Meta.bondReady() > 0 || Meta.achReady() > 0 || Meta.canRestore());
    const owned = P.tanks.includes(chosenType), T = TYPES[chosenType];
    $('sumTank').textContent = T.name;
    const cw = contWave();
    $('sumInfo').textContent = owned ? `${MODES[mode].name} · ${L().name} · ${Meta.diff().name}${P.x2 ? ` · ×2 rewards (${P.x2} left)` : ''}` : `Locked tank: buy it in the Garage`;
    $('startBtn').disabled = !owned;
    // tout premier lancement : un seul mot, et la bataille d'entraînement guidée derrière
    $('startBtn').textContent = cw ? `▶ Continue · wave ${cw + 1}/${WAVES}` : !P.stats.battles && !P.tut.done ? '▶ Play' : '⚔ Deploy';
    $('restartLnk').hidden = !cw;
    $('x2Pill').hidden = !P.x2; $('x2N').textContent = P.x2;
  }
  const MODE_EM = { campagne: '🎖', survie: '☠', duel: '⚔' };
  // vague de reprise du secteur choisi (dernière bataille de campagne interrompue), 0 sinon
  const contWave = () => { const l = Meta.P.last; return l && mode === 'campagne' && l.mode === 'campagne' && l.level === levelIdx && l.wave > 0 && l.wave < WAVES ? l.wave : 0; };
  $('restartLnk').onclick = () => { const l = Meta.P.last; if (l) Meta.setLast(Object.assign({}, l, { wave: 0 })); updateTopbar(); };
  // vitrine : sans contexte WebGL, elle s'efface (et ses commandes avec) jusqu'à son retour
  if (R3) {
    R3.onLost = () => $('showcase').classList.add('no3d');
    R3.onRestored = () => { $('showcase').classList.remove('no3d'); if (state === 'menu') buildMenu(); };
  }
  function buildMenu() {
    const P = Meta.P;
    document.body.classList.toggle('touch', touch.on);
    const tc = $('tankCards'); tc.innerHTML = '';
    for (const T of Object.values(TYPES)) {
      const d = document.createElement('div'), own = P.tanks.includes(T.id), inf = Meta.TANKS[T.id];
      const rar = TANK_RAR[T.id] || 'common';
      const ms = Meta.mastery(T.id);
      d.className = `card tcard rar-${rar}` + (T.id === chosenType ? ' sel' : '') + (own ? '' : ' locked') + (ms >= Meta.MASTERY.length ? ' ace' : '');
      const lock = own ? '<span class="tag own">✓ Owned</span>' : P.level < inf.lvl
        ? `<div class="lockov"><span class="lk">🔒</span><span>Requires level ${inf.lvl}</span><b>✪ ${fmt(inf.price)}</b></div>`
        : `<div class="lockov"><span class="lk">🔓</span><span>Ready to unlock</span><b>✪ ${fmt(inf.price)}</b></div>`;
      d.innerHTML = `${lock}${garageNew.has(T.id) ? '<span class="newb">NEW</span>' : ''}<img class="thumb" alt="" src="${tankThumb(T.id)}"><b>${T.name}</b><small>${T.cls}${T.arc ? ' · turretless' : ''}</small><span class="rib">${Meta.RARITY[rar]}</span>${ms ? `<span class="mast" title="Mastery: ${Meta.MASTERY_N[ms - 1]}">${['III', 'II', 'I', '★'][ms - 1]}</span>` : ''}`;
      d.onclick = () => { chosenType = T.id; skinPreview = null; buildMenu(); };
      tc.appendChild(d);
    }
    // achat du char sélectionné
    const tb = $('tankBuy'); tb.innerHTML = '';
    if (!P.tanks.includes(chosenType)) {
      const inf = Meta.TANKS[chosenType], b = document.createElement('button');
      b.className = 'btn buy';
      b.textContent = P.level < inf.lvl ? `🔒 Rank required: ${Meta.rankName(inf.lvl)} (lvl ${inf.lvl})` : `Unlock ${TYPES[chosenType].name} · ✪ ${fmt(inf.price)}`;
      b.disabled = !Meta.canBuyTank(chosenType);
      b.onclick = () => {
        const id = chosenType;
        if (Meta.buyTank(id)) { buildMenu(); celebrate({ kind: 'New tank unlocked', name: TYPES[id].name, rar: TANK_RAR[id], flav: `${TYPES[id].cls} joins your squadron.`, img: tankThumb(id) }); }
      };
      tb.appendChild(b);
    }
    buildParts(); buildCrew();
    // camouflages : aperçu au clic, achat en crédits, ou déblocage par publicités
    const sc = $('skinCards'); sc.innerHTML = '';
    const cur = Meta.skinOf(chosenType), feat = Meta.featured();
    for (const sk of Meta.SKINS) {
      const d = document.createElement('div'), own = P.skins.includes(sk.id);
      d.className = `skin rar-${sk.rar}` + (sk.id === cur.id ? ' sel' : '') + (sk.id === skinPreview ? ' prev' : '');
      const price = Meta.skinPrice(sk), left = sk.ads ? Meta.adsLeft('skin:' + sk.id, sk.ads) : 0;
      const status = sk.id === cur.id ? 'Equipped' : own ? '✓ Owned' : sk.id === skinPreview ? 'Previewing' : '';
      d.innerHTML = `${sk.id === feat && !own ? '<span class="deal">DEAL −50%</span>' : ''}<div class="sw"></div><span class="rib">${Meta.RARITY[sk.rar]}</span><b>${sk.name}</b><span class="fl">${sk.flav}</span>${status ? `<span class="st">${status}</span>` : ''}`;
      d.querySelector('.sw').appendChild(skinSwatch(sk));
      d.onclick = () => {
        if (own) { Meta.selectSkin(chosenType, sk.id); skinPreview = null; }
        else skinPreview = skinPreview === sk.id ? null : sk.id;
        buildMenu();
      };
      if (!own && sk.bond) d.insertAdjacentHTML('beforeend', '<span class="st">War Bond reward</span>');
      else if (!own) {
        const act = document.createElement('div'); act.className = 'act';
        if (!sk.adOnly) {
          const b = document.createElement('button'); b.className = 'btn buy';
          b.innerHTML = price < sk.price ? `<span class="strike">${fmt(sk.price)}</span>✪ ${fmt(price)}` : `✪ ${fmt(price)}`;
          b.disabled = P.credits < price;
          b.onclick = e => { e.stopPropagation(); if (Meta.buySkin(sk.id)) { Meta.selectSkin(chosenType, sk.id); skinPreview = null; buildMenu(); celebrateSkin(sk); } };
          act.appendChild(b);
        }
        if (sk.ads) {
          const b = document.createElement('button'); b.className = 'btn ad';
          b.innerHTML = `${sk.adOnly ? 'Ad only' : 'Watch ad'}${adPips(sk.ads - left, sk.ads)}`;
          b.title = `Unlock by watching ${sk.ads} ad${sk.ads > 1 ? 's' : ''}`;
          b.onclick = e => {
            e.stopPropagation();
            Meta.rewarded(() => {
              if (Meta.skinAd(sk.id)) { Meta.selectSkin(chosenType, sk.id); skinPreview = null; buildMenu(); celebrateSkin(sk); return; }
              else toast(`${Meta.adsLeft('skin:' + sk.id, sk.ads)} more ad(s) for “${sk.name}”`);
              buildMenu();
            }, () => toast('Ad unavailable right now'));
          };
          act.appendChild(b);
        }
        d.appendChild(act);
      }
      sc.appendChild(d);
    }
    $('skinHint').textContent = skinPreview ? `Previewing “${Meta.SKINS.find(k => k.id === skinPreview).name}”. Click again to go back to yours.` : 'Click a camo to try it on the showcase.';
    $('specs').innerHTML = specsHTML(TYPES[chosenType]) + partsLine(chosenType);
    $('showcase').classList.toggle('no3d', !R3 || R3.lost);
    const mc = $('modeCards'); mc.innerHTML = '';
    for (const [id, M] of Object.entries(MODES)) {
      const d = document.createElement('div');
      d.className = 'card mode' + (id === mode ? ' sel' : '');
      d.innerHTML = `<div class="em">${MODE_EM[id]}</div><div><b>${M.name}</b><small>${M.sub}${id === 'survie' && P.survBest ? ` · best: wave ${P.survBest}` : ''}</small></div>`;
      // retour en campagne : un secteur verrouillé choisi dans un autre mode n'y reste pas sélectionné
      d.onclick = () => { mode = id; if (id === 'campagne') levelIdx = Math.min(levelIdx, unlockedIdx()); buildMenu(); };
      mc.appendChild(d);
    }
    const lc = $('levelCards'); lc.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const d = document.createElement('div');
      const locked = mode === 'campagne' && i > unlockedIdx();
      d.className = 'card' + (i === levelIdx ? ' sel' : '') + (locked ? ' locked' : '');
      const st = Meta.starsOf(Meta.diffId(), i), best = Meta.P.rec.surv[i] || 0;
      const extra = mode === 'campagne' ? `<span class="lvstars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>` : mode === 'survie' && best ? `<span class="lvbest">best: ${best} wave${best > 1 ? 's' : ''}</span>` : '';
      d.innerHTML = `<b>${i + 1}. ${lv.name}</b>${extra}<small>${locked ? '🔒 Conquer the previous sector' : lv.sub}</small>`;
      d.onclick = () => { if (!locked) { levelIdx = i; buildMenu(); } };
      lc.appendChild(d);
    });
    buildDiff(); buildMissions(); buildCrate();
    drawWheel(wheelRot);
    $('spinFree').disabled = !Meta.canSpinFree() || wheelSpin;
    $('spinAd').hidden = !Meta.canSpinAd() && !wheelSpin;
    $('spinAd').disabled = wheelSpin || !Meta.canSpinAd();
    $('spinAd').textContent = `Bonus spin (${Meta.adSpinsLeft()} left today)`;
    updateTopbar();
  }
  // Rareté affichée des chars (selon leur rang dans l'arbre) et des niveaux de pièces
  const TANK_RAR = { light: 'common', pz4: 'common', stug: 'rare', medium: 'rare', destroyer: 'epic', heavy: 'epic', kingtiger: 'legendary' };
  const PART_RAR = ['rare', 'epic', 'legendary'];
  const RAR_N = { common: 1, rare: 1, epic: 2, legendary: 3 };
  const adPips = (n, need) => need > 3 ? `<span class="adp n">${n}/${need}</span>` : `<span class="adp">${Array.from({ length: need }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  // Célébration plein écran d'un déblocage : rayons, confettis, aperçu, fanfare
  // une célébration à la fois : les suivantes attendent la fermeture de la précédente
  const celebQ = [];
  function celebrate(o) {
    const el = $('unlock'), rc = `var(--c-${o.rar})`;
    if (el.classList.contains('on')) { celebQ.push(o); return; }
    el.style.setProperty('--rc', rc);
    $('uKind').textContent = o.kind;
    $('uName').textContent = o.name;
    $('uRar').textContent = Meta.RARITY[o.rar];
    $('uRar').className = 'rib rar-' + o.rar;
    $('uFlav').textContent = o.flav || '';
    const im = $('uImg'); im.className = 'ui' + (o.icon ? ' icon' : ''); im.innerHTML = '';
    if (o.icon) im.textContent = o.icon; else if (o.img) { const i = document.createElement('img'); i.src = o.img; i.alt = ''; im.appendChild(i); }
    el.querySelectorAll('.confetti').forEach(c => c.remove());
    const cols = ['#ffc23d', '#fff4c4', '#4fb0ff', '#b57bff', '#8fd46a', '#ff6a50'], n = QL().lite ? 30 : 70;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${2.2 + Math.random() * 2.4}s;animation-delay:${Math.random() * 0.8}s;--dx:${(Math.random() - 0.5) * 300}px;--rot:${(Math.random() - 0.5) * 1440}deg`;
      el.appendChild(c);
    }
    el.classList.add('on');
    Sfx.init(); Sfx.unlock(RAR_N[o.rar] || 1); Meta.sdk.happytime();
  }
  // camouflage débloqué : aperçu du char du garage avec ce camouflage
  function celebrateSkin(sk, kind) {
    let img = '';
    if (R3 && !R3.lost) {
      drawTank3D(chosenType, 480, 260, 0.75, 0.3, false, 0.25, [0.07, 0.08, 0.07, 1], sk);
      const c = document.createElement('canvas'); c.width = 480; c.height = 260;
      c.getContext('2d').drawImage(R3.canvas, 0, 0); img = c.toDataURL('image/jpeg', 0.85);
    } else img = swatchURL(sk);
    celebrate({ kind: kind || 'New camo unlocked', name: sk.name, rar: sk.rar, flav: sk.flav, img });
  }
  // camouflage obtenu par une récompense (Meta.give) : célébré avec le char du garage
  function celebrateGot(kind) { const sk = Meta.takeSkin(); if (sk) celebrateSkin(sk, kind); }
  function closeUnlock() { $('unlock').classList.remove('on'); if (celebQ.length) setTimeout(() => celebrate(celebQ.shift()), 250); }
  $('uOk').onclick = closeUnlock;
  $('unlock').onclick = e => { if (e.target === e.currentTarget) closeUnlock(); };
  // Échantillon de camouflage dessiné en 2D selon son motif
  let skinPreview = null;
  const swatchCache = {};
  function skinSwatch(sk) {
    const im = document.createElement('img'); im.src = swatchURL(sk); im.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover';
    return im;
  }
  function swatchURL(sk) {
    if (!swatchCache[sk.id]) {
      const c = document.createElement('canvas'); c.width = 160; c.height = 70;
      const g = c.getContext('2d'), col = sk.camo.map(lin2hex), R = mulberry32(sk.id.length * 977 + sk.id.charCodeAt(0));
      g.fillStyle = sk.pat === 4 ? col[1] : col[0]; g.fillRect(0, 0, 160, 70);
      const blob = (x, y, r, cc) => { g.fillStyle = cc; g.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * TAU, rr = r * (0.7 + R() * 0.5); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); } g.fill(); };
      if (sk.pat === 0 || sk.pat === 3) for (let i = 0; i < 9; i++) blob(R() * 160, R() * 70, 14 + R() * 16, col[1 + (i % 2)]);
      if (sk.pat === 3) for (let i = 0; i < 40; i++) { g.fillStyle = col[0]; g.beginPath(); g.arc(R() * 160, R() * 70, 2.2, 0, TAU); g.fill(); }
      if (sk.pat === 2) for (let i = 0; i < 7; i++) { g.strokeStyle = col[1 + (i % 2)]; g.lineWidth = 7 + R() * 5; g.beginPath(); const x0 = i * 26 - 20; g.moveTo(x0, 0); g.bezierCurveTo(x0 + 18, 20, x0 - 6, 45, x0 + 22, 70); g.stroke(); }
      if (sk.pat === 4) { for (let i = 0; i < 26; i++) { g.fillStyle = col[0]; g.globalAlpha = 0.85; g.fillRect(R() * 160, R() * 70, 18 + R() * 30, 3 + R() * 8); } g.globalAlpha = 1; }
      const sh = g.createLinearGradient(0, 0, 0, 70); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = sh; g.fillRect(0, 0, 160, 70);
      swatchCache[sk.id] = c.toDataURL();
    }
    return swatchCache[sk.id];
  }
  // Pièces du char choisi : niveau, achat en crédits (prix selon le palier du char) ou en publicités
  // (une par tranche de 1 000 ✪)
  function buildParts() {
    const P = Meta.P, pl = $('partList'); pl.innerHTML = '';
    const own = P.tanks.includes(chosenType);
    for (const pd of Meta.PARTS) {
      const lv = Meta.partLv(chosenType, pd.id), d = document.createElement('div');
      d.className = 'part l' + lv;
      d.innerHTML = `<div class="pi">${pd.ic}</div><div class="pt"><b>${pd.name}<span class="mk">${Meta.MK[lv]}</span></b><small>${pd.desc}</small><div class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : i === lv ? 'nx' : ''}"></i>`).join('')}</div></div><div class="pb"></div>`;
      const pb = d.querySelector('.pb');
      if (lv >= 3) pb.innerHTML = '<span class="maxed">★ MAX</span>';
      else {
        const installed = () => { buildMenu(); celebrate({ kind: 'Upgrade installed', name: `${pd.name} ${Meta.MK[lv + 1]}`, rar: PART_RAR[lv], flav: pd.desc, icon: pd.ic }); };
        const b = document.createElement('button'); b.className = 'btn buy';
        const cost = Meta.partCost(chosenType, pd.id, lv);
        b.textContent = `${Meta.MK[lv + 1]} · ✪ ${fmt(cost)}`;
        b.disabled = !own || P.credits < cost;
        b.onclick = () => { if (Meta.buyPart(chosenType, pd.id)) installed(); };
        const a = document.createElement('button'); a.className = 'btn ad';
        const need = Meta.partAds(chosenType, pd.id), left = Meta.adsLeft(`part:${chosenType}:${pd.id}`, need);
        a.innerHTML = `Watch ad${adPips(need - left, need)}`;
        a.title = `Install by watching ${need} ad${need > 1 ? 's' : ''}`;
        a.disabled = !own;
        a.onclick = () => Meta.rewarded(() => {
          if (Meta.partAd(chosenType, pd.id)) { installed(); return; }
          toast(`${pd.name}: ${Meta.adsLeft(`part:${chosenType}:${pd.id}`, need)} more ad(s)`);
          buildMenu();
        }, () => toast('Ad unavailable right now'));
        pb.appendChild(b); pb.appendChild(a);
      }
      pl.appendChild(d);
    }
    if (!own) { const n = document.createElement('div'); n.className = 'psub'; n.textContent = 'Buy this tank to upgrade it.'; pl.prepend(n); }
  }
  function buildMissions() {
    const P = Meta.P, ml = $('missionList'), wl = $('weeklyList'); ml.innerHTML = ''; wl.innerHTML = '';
    for (const m of P.missions) if (Meta.mDef(m.id)) ml.appendChild(missionRow(m, true));
    for (const m of P.weekly) if (Meta.mDef(m.id)) wl.appendChild(missionRow(m, false));
    buildBond();
    // série : semaine du cycle en cours, 7e jour = caisse ; bouclier le jour d'une série perdue
    const st = $('streak'); st.innerHTML = '';
    const cur = Math.max(1, P.streak), w0 = Math.floor((cur - 1) / 7) * 7;
    for (let i = 0; i < 7; i++) {
      const n = w0 + i + 1, r = Meta.streakReward(n), d = document.createElement('div');
      d.className = 'day' + (n < P.streak ? ' done' : n === P.streak ? ' today' : '');
      d.innerHTML = `Day ${n}<b>${i === 6 ? '📦' : '✪ ' + fmt(r.c)}</b>`;
      if (i === 6) d.title = 'Supply Crate: ✪ 2,000, a repair kit and a chance of a camo';
      st.appendChild(d);
    }
    const fx = $('streakFix'); fx.innerHTML = '';
    if (Meta.canRestore()) {
      const b = document.createElement('button'); b.className = 'btn ad small'; b.textContent = `Restore your ${P.streakLost}-day streak`;
      b.onclick = () => Meta.rewarded(() => { const n = Meta.restoreStreak(); if (n) { toast(`Streak restored: day ${n}`); buildMenu(); } }, () => toast('Ad unavailable right now'));
      fx.appendChild(b);
    }
    buildAch(); buildRecords();
    $('career').innerHTML = `<div>Battles: <b>${P.stats.battles}</b> · victories: <b>${P.stats.wins}</b> · tanks destroyed: <b>${P.stats.kills}</b> · sector stars: <b>${Meta.starTotal()}</b></div><div>Rank: <b>${Meta.rankName()}</b> (level ${P.level}) · ×2 boosters in reserve: <b>${P.x2}</b> (used on victories worth ✪ 300 or more)</div>`;
  }
  // ----- difficulté, équipage, ravitaillement, bon de guerre, succès, records -----
  const DIFF_TIP = { recruit: 'Slower, less accurate enemies. Rewards ×0.75.', regular: 'The intended experience.', veteran: 'Sharper enemies with Mk I upgrades. Rewards ×1.35.', ace: 'Elite enemies with Mk II upgrades, no field repair. Rewards ×1.8.' };
  function buildDiff() {
    const el = $('diffChips'); el.innerHTML = '';
    for (const [id, d] of Object.entries(Meta.DIFF)) {
      const ok = Meta.diffOk(id), b = document.createElement('button');
      const lock = id === 'veteran' ? 'Reach the last campaign sector to unlock Veteran' : 'Conquer the campaign on Veteran to unlock Ace';
      b.className = 'chip' + (Meta.diffId() === id ? ' sel' : '') + (ok ? '' : ' locked');
      b.innerHTML = `${ok ? '' : '🔒 '}${d.name}<small>×${d.mul}</small>`;
      b.title = ok ? DIFF_TIP[id] : lock;
      b.onclick = () => { if (Meta.setDiff(id)) buildMenu(); else toast(lock); };
      el.appendChild(b);
    }
    $('diffHint').textContent = DIFF_TIP[Meta.diffId()];
    // même réglage dans les options
    $('oDiff').innerHTML = Object.entries(Meta.DIFF).map(([id, d]) => `<option value="${id}"${Meta.diffOk(id) ? '' : ' disabled'}>${d.name}${Meta.diffOk(id) ? ` (rewards ×${d.mul})` : ' (locked)'}</option>`).join('');
    $('oDiff').value = Meta.diffId();
  }
  $('oDiff').onchange = e => { if (!Meta.setDiff(e.target.value)) toast('This difficulty is still locked'); buildMenu(); };
  // Équipage du char choisi : niveau (XP gagnée avec ce char), maîtrise, compétences par rôle
  function buildCrew() {
    const id = chosenType, el = $('crewList'), own = Meta.P.tanks.includes(id);
    const lv = Meta.crewLevel(id), pts = Meta.perkPoints(id), ms = Meta.mastery(id), xp = Meta.tankXp(id), nx = Meta.MASTERY[ms];
    el.innerHTML = `<div class="psub" style="margin:0 0 8px">Crew level <b>${lv}/10</b>${lv < 10 ? ` (next at ${fmt(250 * (lv + 1) * (lv + 1))} tank XP)` : ''} · <b>${pts}</b> skill point${pts !== 1 ? 's' : ''} · tank XP ${fmt(xp)} · ${ms ? `mastery <b>${Meta.MASTERY_N[ms - 1]}</b>` : 'no mastery yet'}${nx ? ` · next badge at ${fmt(nx)}` : ''}</div>`;
    for (const k of Meta.PERKS) {
      const r = Meta.perkRank(id, k.id), d = document.createElement('div');
      d.className = 'part l' + r;
      d.innerHTML = `<div class="pi">${k.ic}</div><div class="pt"><b>${k.role}: ${k.name}<span class="mk">Rank ${r}</span></b><small>${k.d}</small><div class="pips">${[0, 1, 2].map(i => `<i class="${i < r ? 'on' : i === r ? 'nx' : ''}"></i>`).join('')}</div></div><div class="pb"></div>`;
      if (r < 3) {
        const b = document.createElement('button'); b.className = 'btn buy'; b.textContent = '+1 rank';
        b.disabled = !own || pts <= 0;
        b.onclick = () => { if (Meta.buyPerk(id, k.id)) { Sfx.notify(); buildMenu(); } };
        d.querySelector('.pb').appendChild(b);
      } else d.querySelector('.pb').innerHTML = '<span class="maxed">★ MAX</span>';
      el.appendChild(d);
    }
    if (Meta.PERKS.some(k => Meta.perkRank(id, k.id))) {
      const b = document.createElement('button'); b.className = 'btn alt small'; b.textContent = 'Retrain crew · ✪ 500';
      b.disabled = Meta.P.credits < 500;
      b.onclick = () => { if (Meta.resetPerks(id)) { toast('Crew retrained: skill points refunded'); buildMenu(); } };
      el.appendChild(b);
    }
    if (!own) el.insertAdjacentHTML('afterbegin', '<div class="psub">Buy this tank to train its crew.</div>');
  }
  // Caisse de campagne gratuite toutes les 4 heures (ou tout de suite par une publicité)
  function buildCrate() {
    const el = $('crate'), left = Meta.crateLeft();
    if (!el) return;
    const h = Math.floor(left / 3600e3), m = Math.ceil((left % 3600e3) / 60e3);
    el.innerHTML = `<div class="pi">📦</div><div class="pt"><b>Field Supply Crate</b><small>${left ? `Next free crate in ${h ? h + ' h ' : ''}${m} min` : 'A free crate is waiting: 150 to 400 ✪'}</small></div><div class="pb"></div>`;
    const b = document.createElement('button');
    if (!left) { b.className = 'btn buy'; b.textContent = 'Open'; b.onclick = () => { const c = Meta.openCrate(false); if (c) { toast(`📦 Field Supply: +✪ ${fmt(c)}`); Sfx.notify(); buildMenu(); } }; }
    else { b.className = 'btn ad'; b.textContent = 'Open now'; b.onclick = () => Meta.rewarded(() => { const c = Meta.openCrate(true); toast(`📦 Field Supply: +✪ ${fmt(c)}`); Sfx.notify(); buildMenu(); }, () => toast('Ad unavailable right now')); }
    el.querySelector('.pb').appendChild(b);
  }
  setInterval(() => { if (state === 'menu') { buildCrate(); $('dotWheel').classList.toggle('on', Meta.canSpinFree() || !Meta.crateLeft()); } }, 30000);
  // texte court d'une récompense de palier
  const rwShort = r => r.skin ? `🎨 ${Meta.SKINS.find(k => k.id === r.skin).name}` : [r.c ? `✪ ${fmt(r.c)}` : '', r.kit ? '✚ kit' : '', r.x2 ? `${r.x2} ×2 boosts` : ''].filter(Boolean).join(' + ');
  // Bon de guerre : 30 paliers du mois, ligne gratuite (réclamer) et commission de terrain (+50 % par publicité)
  function buildBond() {
    const bd = Meta.bond(), P = Meta.P, el = $('bondTrack');
    el.innerHTML = `<div class="goal bond"><div class="gl"><b>Operation ${bd.name} · tier ${bd.tier}/${bd.n}</b><span>${bd.max ? 'track complete' : `${fmt(bd.xp)} / ${fmt(bd.need)} XP`}</span></div><div class="bar"><i style="width:${bd.max ? 100 : Math.round(bd.xp / bd.need * 100)}%"></i></div></div><div class="psub" style="margin:6px 0 8px">Battle XP and completed missions fill the War Bond. A new operation starts every month; unclaimed tiers are paid automatically.</div>`;
    const g = document.createElement('div'); g.className = 'bondGrid';
    for (let i = 1; i <= bd.n; i++) {
      const r = Meta.bondReward(i), got = P.op.claimed.includes(i), ready = !got && i <= bd.tier, c = document.createElement('div');
      const sk = r.skin && Meta.SKINS.find(k => k.id === r.skin);
      c.className = 'bt' + (got ? ' got' : ready ? ' ready' : '') + (sk ? ` rar-${sk.rar} big` : '');
      c.innerHTML = `<small>${i}</small><b>${rwShort(r)}</b>`;
      c.title = `Tier ${i}: ${rwShort(r)}`;
      if (ready) c.onclick = () => { const t = Meta.bondClaim(i); if (t) { toast(`War Bond tier ${i}: ${t}`); Sfx.notify(); celebrateGot('War Bond reward'); buildMenu(); } };
      if (got && !P.op.bonus.includes(i)) {
        const a = document.createElement('button'); a.className = 'btn ad tiny'; a.textContent = `+✪ ${fmt(Meta.bondBonusOf(i).c)}`;
        a.title = 'Field Commission: watch an ad for a bonus on this tier';
        a.onclick = e => { e.stopPropagation(); Meta.rewarded(() => { const t = Meta.bondBonus(i); if (t) { toast(`Field Commission: ${t}`); buildMenu(); } }, () => toast('Ad unavailable right now')); };
        c.appendChild(a);
      }
      g.appendChild(c);
    }
    el.appendChild(g);
  }
  // Ordres du jour et de la semaine : progression, réclamation, nouvelle mission (gratuite une fois par jour)
  function missionRow(m, daily) {
    const def = Meta.mDef(m.id), done = m.prog >= def.goal, d = document.createElement('div');
    d.className = 'mission';
    const tag = def.m ? `<span class="mtag">${MODES[def.m].name}</span>` : '';
    d.innerHTML = `<div class="mi"><b>${def.t}</b>${tag}<div class="stat"><span>${fmt(Math.min(m.prog, def.goal))} / ${fmt(def.goal)}</span><div class="bar"><i style="width:${Math.min(100, m.prog / def.goal * 100)}%"></i></div></div></div><span class="mrw">✪ ${fmt(def.reward)}${def.skin ? ' + camo' : ''}</span>`;
    if (daily && !done && !m.claimed) {
      const free = Meta.canReroll(m.id), r = document.createElement('button');
      r.className = 'btn small ' + (free ? 'alt' : 'ad'); r.textContent = free ? '↻' : '↻ New'; r.title = free ? 'Swap for another mission (free once a day)' : 'Swap for another mission by watching an ad';
      r.onclick = () => { const go = () => { if (Meta.reroll(m.id, !free)) buildMenu(); }; if (free) go(); else Meta.rewarded(go, () => toast('Ad unavailable right now')); };
      d.appendChild(r);
    }
    const b = document.createElement('button');
    b.className = 'btn small' + (done && !m.claimed ? '' : ' alt');
    b.textContent = m.claimed ? 'Claimed' : done ? 'Claim' : 'In progress';
    b.disabled = !done || m.claimed;
    b.onclick = () => { if (claimMission(m.id)) buildMenu(); };
    d.appendChild(b);
    return d;
  }
  // Médailles (compteurs et rang de collection) et succès à réclamer
  function buildAch() {
    const P = Meta.P, all = Meta.achList(), mg = $('medalGrid'); mg.innerHTML = '';
    for (const m of Meta.MEDALS) {
      const n = P.medals[m.id] || 0, t = n >= 50 ? 'gold' : n >= 10 ? 'silver' : n >= 1 ? 'bronze' : '';
      mg.insertAdjacentHTML('beforeend', `<div class="medal ${t}" title="${m.name}: ${m.d} (+✪ ${m.c} in battle)"><span>${m.ic}</span><b>${m.name}</b><small>×${n}</small></div>`);
    }
    const el = $('achList'); el.innerHTML = '';
    const got = all.filter(a => a.claimed).length;
    // à réclamer d'abord, puis le prochain rang de chaque famille
    const fam = new Set(), list = all.filter(a => a.done && !a.claimed);
    for (const a of all) { const f = a.id.split(':')[0]; if (!a.done && !fam.has(f)) { fam.add(f); list.push(a); } }
    el.insertAdjacentHTML('beforeend', `<div class="psub" style="margin:8px 0">${got} / ${all.length} achievements earned</div>`);
    for (const a of list.slice(0, 14)) {
      const d = document.createElement('div'); d.className = 'mission';
      d.innerHTML = `<div class="mi"><b>${a.ic} ${a.name}</b><small style="display:block;color:var(--mute)">${a.d}</small><div class="stat"><span>${fmt(Math.min(a.prog, a.goal))} / ${fmt(a.goal)}</span><div class="bar"><i style="width:${Math.min(100, a.prog / a.goal * 100)}%"></i></div></div></div><span class="mrw">✪ ${fmt(a.reward)}</span>`;
      if (a.done) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Claim'; b.onclick = () => { const c = Meta.claimAch(a.id); if (c) { toast(`Achievement: ${a.name} · +✪ ${fmt(c)}`); Sfx.unlock(1); buildMenu(); } }; d.appendChild(b); }
      el.appendChild(d);
    }
  }
  // Records personnels par mode et par champ de bataille, tableau d'honneur de survie du secteur choisi
  function buildRecords() {
    const R = Meta.P.rec, rows = LEVELS.map((lv, i) => `<div>${lv.name}: survival best <b>${R.surv[i] || 0}</b> wave${R.surv[i] === 1 ? '' : 's'} · sector best score <b>${fmt(R.sector[i] || 0)}</b></div>`).join('');
    const hof = Meta.hallOfFame(levelIdx), me = hof.findIndex(e => e.me);
    $('records').innerHTML = rows + `<div>Duel win streak: <b>${R.duelStreak}</b> (best ${R.duelBest}) · most kills in one battle: <b>${R.maxKills}</b> · longest kill: <b>${R.longest} m</b> · deepest penetration: <b>${R.maxPen} mm</b></div>` +
      `<div class="hof"><b>Survival Hall of Fame · ${L().name}</b>${hof.slice(0, Math.max(5, me + 1)).map((e, i) => `<span class="${e.me ? 'me' : ''}">#${i + 1} ${e.name} · ${e.v} waves</span>`).join('')}</div>`;
  }
  function partsLine(id) {
    const m = Meta.mods(id), pc = v => (v >= 1 ? '+' : '−') + Math.round(Math.abs(v - 1) * 100) + '%';
    if (!Meta.PARTS.some(p => Meta.partLv(id, p.id))) return '';
    return `<div class="specLine" style="margin-top:8px;color:var(--gold)">Upgrades: power ${pc(m.hp)} · penetration ${pc(m.pen)} · armor ${pc(m.armor)} · grip ${pc(m.grip)} · vision ${pc(m.optic)} · reload ${pc(m.reload)}${m.ready ? ` · ready rack +${m.ready}` : ''}</div>`;
  }
  // ----- roue -----
  let wheelRot = 0, wheelSpin = false, wheelHold = null;
  function drawWheel(rot) {
    const c = $('wheel'); if (!c) return;
    const g = c.getContext('2d'), W2 = c.width, R = W2 / 2 - 18, cx = W2 / 2, cy = W2 / 2, segs = Meta.WHEEL, n = segs.length;
    g.clearRect(0, 0, W2, W2);
    g.save(); g.translate(cx, cy);
    // jante extérieure et ampoules
    g.beginPath(); g.arc(0, 0, R + 14, 0, TAU); g.fillStyle = '#2a2414'; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#c99a32'; g.stroke();
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.arc(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7), 4.5, 0, TAU); g.fillStyle = (i + Math.floor(performance.now() / 300)) % 2 ? '#ffe9a8' : '#7a5a1c'; g.fill(); }
    g.rotate(rot);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU - Math.PI / 2 - Math.PI / n, a1 = a0 + TAU / n;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath();
      const gr = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      gr.addColorStop(0, '#1a1a14'); gr.addColorStop(1, segs[i].col);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(233,196,106,0.55)'; g.lineWidth = 2; g.stroke();
      // libellé le long du rayon, toujours lisible (retourné sur la moitié gauche)
      const am = (a0 + a1) / 2 + rot, left = Math.cos(am) < 0;
      g.save(); g.rotate((a0 + a1) / 2 + (left ? Math.PI : 0)); g.textAlign = left ? 'left' : 'right'; g.fillStyle = '#f6eed6';
      g.font = `600 ${Math.round(W2 * 0.034)}px Oswald, system-ui, sans-serif`;
      g.fillText(segs[i].t, left ? -(R - 22) : R - 22, 9); g.restore();
    }
    g.beginPath(); g.arc(0, 0, R * 0.17, 0, TAU);
    const hub = g.createRadialGradient(-10, -10, 4, 0, 0, R * 0.17); hub.addColorStop(0, '#fff1b8'); hub.addColorStop(1, '#8a6420');
    g.fillStyle = hub; g.fill();
    g.restore();
  }
  function spinWheel(free) {
    if (wheelSpin) return;
    const idx = Meta.spinResult(free), n = Meta.WHEEL.length;
    // le segment gagnant s'arrête sous l'aiguille (en haut), après 6 tours et un peu de hasard
    const target = -idx / n * TAU + (Math.random() - 0.5) * (TAU / n) * 0.7;
    const start = wheelRot, end = start - ((start - target) % TAU + TAU) % TAU + TAU * 6, t0 = performance.now(), dur = 5200;
    // le lot est acquis et sauvegardé dès le lancer : recharger la page ne relance pas le tirage du
    // jour, et fermer l'onglet pendant un tirage payé d'une publicité ne le perd pas. L'animation ne
    // fait que le révéler (crédits et kits affichés figés jusque-là).
    wheelHold = { credits: Meta.P.credits, kits: Meta.P.kits };
    const had = Meta.P.skins.slice(), txt = Meta.applyPrize(idx, free);
    const won = Meta.SKINS.find(k => !had.includes(k.id) && Meta.P.skins.includes(k.id));
    wheelSpin = true; $('wheelPrize').textContent = ''; buildMenu();
    const anim = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      wheelRot = start + (end - start) * e;
      drawWheel(wheelRot);
      if (k < 1) requestAnimationFrame(anim);
      else {
        wheelSpin = false; wheelHold = null;
        $('wheelPrize').textContent = `You won: ${txt}!`;
        buildMenu();
        if (state !== 'menu') return; // parti au combat pendant le tirage : pas de fête par-dessus la bataille
        if (won) celebrateSkin(won, 'Wheel prize');
        else { toast(`🎁 ${txt}`); Sfx.notify(); if (Meta.WHEEL[idx].c >= 2500) Meta.sdk.happytime(); }
      }
    };
    requestAnimationFrame(anim);
  }
  // ----- onglets, options -----
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    rebinding = null;
    if (b.dataset.tab === 'garage') { markGarage(); buildMenu(); } else if (garageNew.size) { garageNew.clear(); buildMenu(); }
    document.querySelectorAll('.panel').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
    Sfx.init(); playMusic(); newDay();
  });
  $('spinFree').onclick = () => { if (Meta.canSpinFree()) spinWheel(true); };
  $('spinAd').onclick = () => { if (Meta.canSpinAd()) Meta.rewarded(() => spinWheel(false), () => toast('Ad unavailable right now')); };
  // Musique synthétisée de audio.js (thème du menu, couches de bataille). Ces deux crochets décident seuls
  // quand elle joue : volume non nul, son non coupé, onglet visible, et pas pendant la publicité de sortie
  function playMusic() {
    if (!Sfx.playMusic) return;
    const m = state === 'menu' ? 'menu' : state === 'leaving' ? '' : 'battle';
    if (m && Meta.P.opts.music > 0 && !Sfx.silenced && !document.hidden) Sfx.playMusic(Meta.P.opts.music, m);
    else stopMusic();
  }
  function stopMusic() { if (Sfx.stopMusic) Sfx.stopMusic(); }
  function applyOptions() {
    const o = Meta.P.opts;
    Sfx.setVolume(o.sfx); Sfx.setUserMute(o.mute); Sfx.setPortalMute(Meta.platformMute); hitcamOn = o.hitcam !== 'off';
    const q = QL();
    QDPR = q.dpr; PCAP = q.pcap;
    if (W3D0 && W3D0.q !== q) { const leaf = W3D0.q && W3D0.q.leaf !== q.leaf; W3D0.q = q; W3D0.setQuality(q.r3); if (leaf && scene3On) build3DScene(); }
    resize();
    TOF = o.ballistics === 'arcade' ? 0.6 : 1;
    $('oSfx').value = o.sfx; $('oMusic').value = o.music; $('oQuality').value = o.quality; $('oHitcam').value = o.hitcam; $('oBallistics').value = o.ballistics || 'real';
    $('oAssist').value = o.assist; $('oSens').value = o.sens; $('oSensSight').value = o.sensSight; $('oInvert').checked = o.invertY; $('oShake').value = o.shake;
    $('oSlowmo').checked = o.slowmo; $('oCalm').checked = o.calm; $('oCb').checked = o.cb; $('oHud').value = o.hud;
    buildBinds();
  }
  // réglages simples : curseurs (nombres), cases (booléens) et listes
  for (const [id, k, kind] of [['oAssist', 'assist'], ['oSens', 'sens', 1], ['oSensSight', 'sensSight', 1], ['oInvert', 'invertY', 2], ['oShake', 'shake', 1], ['oSlowmo', 'slowmo', 2], ['oCalm', 'calm', 2], ['oCb', 'cb', 2], ['oHud', 'hud', 1]]) {
    $(id)[kind === 1 ? 'oninput' : 'onchange'] = e => { Meta.P.opts[k] = kind === 2 ? e.target.checked : kind === 1 ? +e.target.value : e.target.value; Meta.save(); applyOptions(); };
  }
  $('oTut').onclick = () => { Meta.P.tut = { step: 0, done: false }; Meta.save(); toast('The tutorial will guide your next battle'); };
  $('oBindReset').onclick = () => { Meta.P.opts.binds = {}; Meta.save(); buildBinds(); };
  $('oSfx').oninput = e => { Meta.P.opts.sfx = +e.target.value; Meta.save(); applyOptions(); };
  $('oMusic').oninput = e => { Meta.P.opts.music = +e.target.value; Meta.save(); applyOptions(); playMusic(); };
  $('oQuality').onchange = e => { Meta.P.opts.quality = e.target.value; Meta.save(); dynReset(true); applyOptions(); };
  $('oHitcam').onchange = e => { Meta.P.opts.hitcam = e.target.value; Meta.save(); applyOptions(); };
  $('oBallistics').onchange = e => { Meta.P.opts.ballistics = e.target.value; Meta.save(); applyOptions(); };
  // Réassignation d'une commande : la touche déjà prise passe à l'action libérée (échange)
  function setBind(a, code) {
    rebinding = null;
    const b = Meta.P.opts.binds = Meta.P.opts.binds || {};
    if (code) {
      const old = bind(a), other = Object.keys(BIND_DEF).find(k => k !== a && bind(k) === code);
      if (other) b[other] = old;
      b[a] = code;
      for (const k in b) if (b[k] === BIND_DEF[k]) delete b[k];
      Meta.save();
    }
    buildBinds();
  }
  const BIND_LABELS = { fwd: 'Forward', back: 'Reverse', left: 'Turn left', right: 'Turn right', brake: 'Brakes', fire: 'Fire', mg: 'Machine gun', belt: 'MG belt type', sight: 'Gunner\'s sight',
    zoom: 'Sight magnification', rangeUp: 'Range + (realistic)', rangeDown: 'Range − (realistic)', smoke: 'Smoke launcher', cam: 'Camera', hatch: 'Commander hatch', ext: 'Extinguisher',
    repair: 'Repair track', bail: 'Bail out', flare: 'Flare (night)', xray: 'Impact camera / skip', mute: 'Sound on / off', help: 'Controls card', attack: 'Order: attack', follow: 'Order: follow me', hold: 'Order: hold', move: 'Order: move there', arty: 'Call artillery' };
  function buildBinds() {
    const el = $('bindList');
    el.innerHTML = Object.keys(BIND_LABELS).map(a => `<button data-a="${a}" class="${rebinding === a ? 'wait' : ''}"><span>${BIND_LABELS[a]}</span><kbd>${rebinding === a ? 'press a key…' : codeName(bind(a))}</kbd></button>`).join('');
    el.querySelectorAll('button').forEach(b => { b.onclick = () => { rebinding = rebinding === b.dataset.a ? null : b.dataset.a; buildBinds(); }; });
  }
  // Fenêtre de confirmation du jeu (les fenêtres natives sont bloquées dans l'iframe du portail
  // et font sortir du plein écran)
  function askConfirm(title, text, okLabel, onOk) {
    $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfOk').textContent = okLabel;
    const close = ok => { hide('confirm'); removeEventListener('keydown', key, true); if (ok) onOk(); };
    const key = e => { if (e.code === 'Escape') { e.stopPropagation(); close(false); } };
    $('cfOk').onclick = () => close(true);
    $('cfNo').onclick = () => close(false);
    addEventListener('keydown', key, true);
    show('confirm');
  }
  $('oReset').onclick = () => askConfirm('Erase everything?', 'Credits, tanks, camos, upgrades, campaign progress and records will be lost for good. Settings are kept.', 'Erase', () => {
    Meta.reset();
    levelIdx = 0; mode = 'campagne'; chosenType = 'pz4'; skinPreview = null;
    applyOptions(); buildMenu();
    toast('Progress erased');
    setTimeout(newDay, 600);
  });
  Meta.hooks.change = () => { if (state === 'menu') updateTopbar(); };
  Meta.hooks.adStart = () => { Sfx.setMuted(true); stopMusic(); releaseInput(); Meta.sdk.gameplayStop(); };
  // fin de publicité : seule la coupure de la publicité est levée (touche M, onglet et portail restent)
  Meta.hooks.adEnd = () => { Sfx.setMuted(false); playMusic(); };
  Meta.hooks.mute = m => { Sfx.setPortalMute(m); if (m) stopMusic(); else playMusic(); };

  // Air du champ de bataille : température, densité et vent (direction tirée à chaque bataille) ;
  // le menu et son banc d'essai restent dans l'atmosphère type (15 °C, 1,225 kg/m³, sans vent)
  function setAir(a) {
    Ballistics.setAtmosphere(a ? a.T : 15, a ? a.rho : 1.225);
    const w = a ? a.wind * rnd(0.7, 1.15) : 0, wa = rnd(0, TAU);
    WIND.x = Math.cos(wa) * w; WIND.y = Math.sin(wa) * w;
  }
  function startLevel() { setAir(L().atm); genMap(); setup3D(); dynReset(false); spawnWave(); }
  // ===================== Réparation (publicité récompensée ou kit) =====================
  // Le compte à rebours de 8 s est figé pendant la publicité de réparation (15 à 30 s sur CrazyGames)
  // et quand l'onglet est masqué ; la réparation n'est appliquée que si l'écran est encore ouvert.
  let reviveT = 0, reviveUsed = false, reviveIt = null, reviveAd = false, reviveLeft = 0;
  const REVIVE_S = 8;
  const revivePending = () => reviveT > 0 || state === 'revive' || reviveAd;
  function openRevive() {
    if (!player || !player.dead || state !== 'play') return;
    state = 'revive'; freePointer(); setSight(false);
    $('revWho').textContent = killCard ? `Destroyed by ${killCard.l1} · ${killCard.l2}` : '';
    Meta.sdk.gameplayStop();
    show('revive');
    reviveAd = false; reviveButtons(true);
    reviveCountdown(REVIVE_S);
  }
  function reviveButtons(on) {
    $('revKit').textContent = `Repair kit (${Meta.P.kits})`;
    $('revKit').disabled = !on || Meta.P.kits <= 0;
    $('revAd').disabled = !on; $('revNo').disabled = !on;
  }
  function reviveCountdown(sec) {
    clearInterval(reviveIt);
    reviveLeft = sec;
    let prev = performance.now();
    const draw = () => {
      $('revRing').style.setProperty('--p', clamp(reviveLeft / REVIVE_S * 100, 0, 100) + '%');
      $('revN').textContent = Math.max(0, Math.ceil(reviveLeft));
    };
    draw();
    reviveIt = setInterval(() => {
      const now = performance.now(), d = Math.min(0.5, (now - prev) / 1000);
      prev = now;
      if (reviveAd || Meta.adActive() || document.hidden) return;
      reviveLeft -= d; draw();
      if (reviveLeft <= 0) closeRevive(false);
    }, 100);
  }
  function closeRevive(ok) {
    if (reviveAd) return;
    clearInterval(reviveIt); reviveIt = null;
    hide('revive');
    reviveUsed = true;
    if (state !== 'revive') return;
    state = 'play'; last = performance.now(); Meta.sdk.gameplayStart();
    if (ok) revivePlayer();
  }
  // Le char est remis en état sur place : équipage soigné, modules réparés, tourelle remontée,
  // un peu de munitions, 3 s d'invulnérabilité pour se remettre à couvert
  function revivePlayer() {
    const t = player;
    if (!t || !t.dead || state !== 'play') return;
    t.dead = false; t.deadT = 0; t.turretGone = false; t.wreck = null; t.burnT = 0; t.wFireT = 0; t.trackT = 0; t.wheelK = 1; t.speed = 0; t.noFuel = false; t.fuelOutT = null; t.fuelFireT = 0; t.bentT = 0; t.vx = t.vy = t.vl = t.turnRate = 0; t.gear = 0;
    for (const m of t.mods) m.hp = m.max0;
    resetCrew(t);
    for (const k of SHELL_KEYS) t.ammo[k] = Math.min(t.T.ammo[k], t.ammo[k] + Math.ceil(t.T.ammo[k] * 0.3));
    stowAmmo(t);
    t.smoke = Math.max(t.smoke, 2); t.invulnT = 3; t.reloadT = 0;
    if (t.ammo[t.shell] <= 0) t.shell = nextShell(t);
    for (let i = 0; i < 20; i++) P3({ x: t.x + rnd(-12, 12), y: t.y + rnd(-12, 12), z: rnd(0.2, 2), vz: rnd(0.5, 2), size: 0.08, glow: true, life: rnd(0.4, 0.9), c: [0.6, 0.85, 1, 2] });
    showMsg('TANK REPAIRED!', '#8fd46a', 2.2, 3); waveStats.revived = true;
    addLog('Field repair: crew and modules restored', '#8fd46a');
    Sfx.notify();
  }
  $('revAd').onclick = () => {
    if (reviveAd || state !== 'revive') return;
    reviveAd = true; reviveButtons(false);
    Meta.rewarded(() => { reviveAd = false; closeRevive(true); }, () => {
      // publicité indisponible : on rend la main avec au moins 3 s pour choisir
      reviveAd = false; reviveButtons(true);
      reviveLeft = clamp(reviveLeft + 2, 3, REVIVE_S);
      toast('Ad unavailable right now');
    });
  };
  $('revKit').onclick = () => { if (!reviveAd && state === 'revive' && Meta.P.kits > 0) { Meta.P.kits--; Meta.save(); closeRevive(true); } };
  $('revNo').onclick = () => { if (!reviveAd) closeRevive(false); };


  function showResult() {
    freePointer(); hideDeadBar();
    if (mode !== 'campagne') { showModeResult(); return; }
    state = 'result';
    const win = waveResult === 'win';
    const ws = waveStats;
    const pts = Math.round(ws.kills * 200 + ws.crew * 40 + ws.mods * 15 + ws.pens * 20 + ws.crits * 10 + ws.fires * 25 + ws.saved * 30 - ws.ffCrew * 80 - ws.tk * 400 + (win ? 500 : 0));
    if (win) { campaignScore += pts; sectorScore += pts; }
    sectorTk += ws.tk;
    const lastWave = waveIdx >= WAVES - 1;
    const lastLevel = levelIdx >= LEVELS.length - 1;
    if (win) { if (!ws.pened) medal('untouched', true); if (ws.kills >= 3) medal('ace', true); }
    $('resTitle').className = win ? 'win' : 'lose';
    $('resTitle').textContent = !win ? 'WAVE LOST' : lastWave ? (lastLevel ? 'TOTAL VICTORY' : 'SECTOR CONQUERED') : 'WAVE WON';
    $('resSub').textContent = `${L().name} · wave ${waveIdx + 1}/${WAVES} · ${Meta.diff().name}` + (win ? '' : nearMiss());
    const acc = ws.shots ? Math.round(ws.hits / ws.shots * 100) : 0;
    $('resTable').innerHTML = OBJ.resultRow() +
      `<tr><td>Enemy tanks destroyed</td><td>${ws.kills}</td></tr>` +
      `<tr><td>Penetrations</td><td>${ws.pens}</td></tr>` +
      `<tr><td>Enemy crew knocked out</td><td>${ws.crew}</td></tr>` +
      `<tr><td>Enemy modules destroyed</td><td>${ws.mods}</td></tr>` +
      `<tr><td>Accuracy</td><td>${acc}% (${ws.hits}/${ws.shots})</td></tr>` +
      `<tr><td>Ricochets</td><td>${ws.ric}</td></tr>` +
      `<tr><td>Shells dodged</td><td>${ws.dodged}</td></tr>` + critRows(ws) +
      `<tr><td>Allied crew killed by your fire</td><td class="${ws.ffCrew ? 'bad' : ''}">${ws.ffCrew}</td></tr>` +
      `<tr><td>Allies destroyed by your fire</td><td class="${ws.tk ? 'bad' : ''}">${ws.tk}</td></tr>` +
      `<tr><td>Wave score</td><td>${win ? pts : 0}</td></tr>` +
      `<tr><td>Campaign score</td><td>${campaignScore}</td></tr>`;
    // fin de secteur : étoiles, prime de première conquête, record du secteur
    const notes = [];
    let sc = null;
    if (win && lastWave) {
      sc = Meta.sectorClear(levelIdx, sectorScore, sectorTk);
      notes.push(`<div class="stars">${[1, 2, 3].map(i => `<i class="${i <= sc.stars ? 'on' : ''}">★</i>`).join('')}</div>`);
      if (sc.bonus) notes.push(`<div class="note gold">First conquest on ${Meta.diff().name}: +✪ ${fmt(sc.bonus)}</div>`);
      if (sc.text) notes.push(`<div class="note gold">Total victory on Ace: ${sc.text}</div>`);
      if (sc.stars < 3) notes.push(`<div class="note">Next star: sector score ${fmt(Meta.STARS[sc.stars - 1])}${sc.stars === 2 ? ' with no ally destroyed by your fire' : ''} (this run: ${fmt(sectorScore)})</div>`);
      const rc = Meta.record('sector', sectorScore, levelIdx);
      if (rc.beat) notes.push(`<div class="note rec">NEW RECORD · best sector score ${fmt(sectorScore)} (was ${fmt(rc.old)})</div>`);
      celebrateGot('Total victory');
    }
    const btns = resultButtons({ win, kills: ws.kills, pens: ws.pens, crew: ws.crew, objCr: OBJ.credits() }, notes);
    const add = btns.add;
    if (!win) {
      const k = `${levelIdx}:${waveIdx}`, rev = !retried.has(k);
      Meta.setLast({ tank: chosenType, mode, level: levelIdx, wave: waveIdx });
      add(rev ? 'Retry wave · revenge +50%' : 'Retry wave', () => { if (rev) { retried.add(k); revengeNext = true; } spawnWave(); });
    } else if (!lastWave) {
      Meta.setLast({ tank: chosenType, mode, level: levelIdx, wave: waveIdx + 1 });
      add('Next wave', () => { waveIdx++; spawnWave(); });
    } else {
      if (levelIdx + 1 > Meta.P.unlocked && !lastLevel) { Meta.P.unlocked = levelIdx + 1; Meta.save(); }
      Meta.setLast({ tank: chosenType, mode, level: lastLevel ? levelIdx : levelIdx + 1, wave: 0 });
      if (!lastLevel) add('Next sector', () => { levelIdx++; waveIdx = 0; startLevel(); });
    }
    add('Main menu', toMenu, true);
    show('result'); Meta.banner('bannerRes');
  }
  // Défaite : ennemis restants et état de leur équipage (« si près du but »)
  function nearMiss() {
    const left = tanks.filter(t => t.team === 1 && !t.dead);
    if (!left.length && !reinf.length) return ' · your team was wiped out';
    const n = left.length + reinf.length, t = left.sort((a, b) => crewAlive(a) - crewAlive(b))[0];
    const crewN = t ? t.mods.filter(m => m.kind === 'crew').length : 0;
    return ` · ${n <= 1 ? 'So close! ' : ''}${n} enem${n > 1 ? 'ies' : 'y'} left` + (t ? ` (${t.T.name}${n > 1 ? ' and others' : ''}, ${crewAlive(t)}/${crewN} crew)` : '');
  }
  function medalRows(ws) {
    return ws.medals.map(id => { const m = Meta.MEDALS.find(k => k.id === id); return `<tr class="medal"><td>${m.ic} Medal: ${m.name}</td><td>+✪ ${m.c}</td></tr>`; }).join('');
  }

  // Gains de la bataille (crédits, expérience, grade), bouton « doubler » par publicité, objectifs
  // suivants, et boutons de suite précédés d'une publicité de mi-partie plafonnée
  function resultButtons(r, notes = []) {
    Meta.sdk.gameplayStop();
    const ws = waveStats, T = TYPES[chosenType];
    // records de la bataille (avant battleEnd, qui garde le plus de destructions)
    for (const [k, v, lab] of [['maxKills', ws.kills, `${ws.kills} tanks destroyed in one battle`], ['longest', ws.longest, `longest kill ${Math.round(ws.longest)} m`], ['maxPen', ws.maxPen, `deepest penetration ${Math.round(ws.maxPen)} mm`]]) {
      const rc = Meta.record(k, v);
      if (rc.beat) notes.push(`<div class="note rec">NEW RECORD · ${lab}</div>`);
    }
    const g = Meta.battleEnd(Object.assign({ mode, ffCrew: ws.ffCrew, tk: ws.tk, time: waveTime, medals: ws.medals, streakCr: ws.streakCr, revenge: ws.revenge, level: levelIdx, tank: chosenType, td: !!T.arc, untouched: !ws.pened, real: !assisted() }, r));
    const btns = $('resBtns'), nm = ws.medals.length;
    btns.innerHTML = '';
    // rapport de bataille replié sur les petits écrans : gains et boutons restent visibles
    $('resDet').open = innerHeight >= 620;
    $('resSum').textContent = 'Battle report' + (nm ? ` · ${nm} medal${nm > 1 ? 's' : ''}` : '');
    $('result').querySelector('.box').scrollTop = 0;
    $('resTable').insertAdjacentHTML('beforeend', medalRows(ws) + (ws.streakCr ? `<tr><td>Kill streak bonus</td><td>+✪ ${fmt(ws.streakCr)}</td></tr>` : '') +
      (ws.revenge && r.win ? '<tr><td>Revenge bonus</td><td>×1.5</td></tr>' : '') + (Meta.diff().mul !== 1 ? `<tr><td>${Meta.diff().name} difficulty</td><td>×${Meta.diff().mul}</td></tr>` : '') + (!assisted() ? '<tr><td>Realistic aiming</td><td>×1.1</td></tr>' : '') +
      (g.penalty ? `<tr><td>Friendly fire penalty</td><td class="bad">−✪ ${fmt(g.penalty)}</td></tr>` : ''));
    const t0 = performance.now(), count = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      $('rwCred').textContent = '+' + fmt(g.credits * k) + (g.boosted ? ' ×2' : '');
      $('rwXp').textContent = '+' + fmt(g.xp * k);
      if (k < 1) requestAnimationFrame(count);
    };
    count();
    const up = [g.up > 0 ? `PROMOTED: ${Meta.rankName().toUpperCase()} · +✪ ${fmt(g.upCr)}` : '', ...g.promo, g.mast ? `Tank mastery · ${g.mast}` : '', g.x2kept ? '×2 booster kept for your next victory' : ''].filter(Boolean);
    $('lvUp').classList.toggle('on', up.length > 0);
    $('lvUp').innerHTML = up.map(x => `<div>${x}</div>`).join('');
    if (g.up > 0 || g.mast) celebrateGot('Promotion reward');
    if (g.up > 0) setTimeout(() => { if (state === 'result') celebratePromo(g.before.level); }, 1000); // après le décompte des gains
    renderGoals(g, notes);
    // doubler n'est proposé que s'il rapporte assez ; sur une défaite, une prime de terrain fixe
    if (g.credits >= 300 || !r.win) {
      const dbl = document.createElement('button'), add = g.credits >= 300 ? g.credits : 300;
      dbl.className = 'btn ad'; dbl.textContent = g.credits >= 300 ? `Double rewards (+✪ ${fmt(add)})` : `Field bonus: +✪ ${fmt(add)}`;
      dbl.onclick = () => Meta.rewarded(() => { Meta.P.credits += add; Meta.save(); dbl.disabled = true; dbl.textContent = 'Bonus received!'; $('rwCred').textContent = '+' + fmt(g.credits + add); toast(`+✪ ${fmt(add)}`); }, () => toast('Ad unavailable right now'));
      btns.appendChild(dbl);
    }
    return {
      add(label, fn, alt) {
        const b = document.createElement('button');
        b.className = 'btn' + (alt ? ' alt' : ''); b.textContent = label;
        b.onclick = () => leaveResult(fn);
        btns.appendChild(b);
      },
    };
  }
  function leaveResult(fn) { if (state !== 'result') return; Sfx.init(); hide('result'); state = 'leaving'; Meta.midgame(fn); }
  // Objectifs suivants : barre de grade animée, bon de guerre, char, pièce, maîtrise ou mission la plus
  // proche (« dans N batailles »), missions terminées à réclamer sur place
  function renderGoals(g, notes) {
    const P = Meta.P, el = $('resGoals'), b = g.before, bd = Meta.bond();
    const bar = (cls, title, right, p0, p1) => `<div class="goal ${cls}"><div class="gl"><b>${title}</b><span>${right}</span></div><div class="bar"><i style="width:${Math.round(p0 * 100)}%" data-to="${Math.round(Math.min(1, p1) * 100)}"></i></div></div>`;
    let h = notes.join('');
    h += bar('rankg', `Rank ${P.level} · ${Meta.rankName()}`, `${fmt(P.xp)} / ${fmt(Meta.xpFor(P.level))} XP`, g.up ? 0 : b.xp / b.need, P.xp / Meta.xpFor(P.level));
    h += bar('bond', `War Bond · Operation ${bd.name} · tier ${bd.tier}/${bd.n}`, bd.max ? 'complete' : `${fmt(bd.xp)} / ${fmt(bd.need)}`, g.tier > (b.tier || 0) ? 0 : (b.opXp % bd.need) / bd.need, bd.max ? 1 : bd.xp / bd.need);
    for (const o of Meta.nextGoals(chosenType)) {
      const name = o.kind === 'tank' ? TYPES[o.id].name : o.name, now = o.battles <= 0 && (o.kind === 'tank' || o.kind === 'part');
      const right = now ? 'ready now!' : `${o.battles} battle${o.battles > 1 ? 's' : ''} away${o.text ? ' · ' + o.text : ''}`;
      h += `<div class="goal${now ? ' now' : ''}" data-k="${o.kind}" data-id="${o.id}"><div class="gl"><b>${o.kind === 'tank' ? '🔓 ' : o.kind === 'part' ? '⚙ ' : o.kind === 'mastery' ? '🎖 ' : '📋 '}${name}</b><span>${right}</span></div><div class="bar"><i style="width:${Math.round(o.p * 100)}%"></i></div>${now ? `<button class="btn small buy">${o.kind === 'tank' ? 'Unlock now' : 'Install'}</button>` : ''}</div>`;
    }
    for (const m of Meta.claimable()) { const d = Meta.mDef(m.id); h += `<div class="goal done" data-m="${m.id}"><div class="gl"><b>✓ ${d.t}</b><span>✪ ${fmt(d.reward)}</span></div><button class="btn small">Claim</button></div>`; }
    el.innerHTML = h;
    el.querySelectorAll('.goal.now .btn').forEach(x => { const d = x.parentNode; x.onclick = () => goGarage(d.dataset.k === 'tank' ? d.dataset.id : chosenType); });
    el.querySelectorAll('.goal.done .btn').forEach(x => {
      x.onclick = () => { if (claimMission(x.parentNode.dataset.m)) { x.disabled = true; x.textContent = 'Claimed'; } };
    });
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.bar i[data-to]').forEach(i => { i.style.width = i.dataset.to + '%'; })));
  }
  // « Débloquer » depuis les résultats : garage ouvert sur le char visé
  function goGarage(id) { leaveResult(() => { toMenu(); if (id && TYPES[id]) chosenType = id; buildMenu(); openTab('garage'); }); }
  function statRows(ws) {
    const acc = ws.shots ? Math.round(ws.hits / ws.shots * 100) : 0;
    return `<tr><td>Enemy tanks destroyed</td><td>${ws.kills}</td></tr>` +
      `<tr><td>Penetrations</td><td>${ws.pens}</td></tr>` +
      `<tr><td>Enemy crew knocked out</td><td>${ws.crew}</td></tr>` +
      `<tr><td>Enemy modules destroyed</td><td>${ws.mods}</td></tr>` +
      `<tr><td>Accuracy</td><td>${acc}% (${ws.hits}/${ws.shots})</td></tr>` +
      `<tr><td>Ricochets</td><td>${ws.ric}</td></tr>` +
      `<tr><td>Shells dodged</td><td>${ws.dodged}</td></tr>` + critRows(ws);
  }
  function critRows(ws) {
    return `<tr><td>Critical hits</td><td>${ws.crits}</td></tr>` +
      `<tr><td>Enemy tanks set on fire</td><td>${ws.fires}</td></tr>` +
      `<tr><td>Enemy crews bailed out</td><td>${ws.bailed}</td></tr>` +
      (ws.saved ? `<tr><td>Your crew saved by bailing out</td><td>${ws.saved}</td></tr>` : '');
  }
  function showModeResult() {
    state = 'result';
    const win = waveResult === 'win', ws = waveStats, notes = [];
    if (mode === 'survie') Meta.track('wave', survWave);
    if (win && !ws.pened) medal('untouched', true);
    let add;
    if (mode === 'survie') {
      // records par champ de bataille, tableau d'honneur et « si près du record »
      const held = survWave - 1, rc = Meta.record('surv', held, levelIdx), best = Meta.P.rec.surv[levelIdx] || 0;
      if (held > Meta.P.survBest) { Meta.P.survBest = held; Meta.save(); }
      const hof = Meta.hallOfFame(levelIdx), me = hof.findIndex(e => e.me), above = hof[me - 1];
      notes.push(`<div class="note${rc.beat ? ' rec' : ''}">${rc.beat ? `NEW RECORD · ${held} waves (was ${rc.old}) · ` : ''}Hall of Fame #${me + 1}${above ? ` · beat ${above.name}'s ${above.v} waves` : ' · top of the board!'}</div>`);
      $('resTitle').className = held > 0 ? 'win' : 'lose';
      $('resTitle').textContent = rc.beat ? 'NEW RECORD' : 'SURVIVAL OVER';
      $('resSub').textContent = `${L().name} · ${held} wave${held !== 1 ? 's' : ''} repelled · best here: ${best}` + (!rc.beat && best > held && best - held <= 3 ? ` · ${best - held} short of your best!` : '');
      $('resTable').innerHTML = `<tr><td>Wave reached</td><td>${survWave}</td></tr>` + statRows(ws);
      add = resultButtons({ win: survWave > 3, kills: ws.kills, pens: ws.pens, crew: ws.crew, waves: held }, notes).add;
      Meta.setLast({ tank: chosenType, mode, level: levelIdx, wave: 0 });
      add('Play again', () => startLevel());
    } else {
      duelScore[win ? 0 : 1]++;
      const over = duelScore[0] >= 2 || duelScore[1] >= 2, won = duelScore[0] >= 2;
      if (over) { const rc = Meta.duelOver(won); if (rc.beat) notes.push(`<div class="note rec">NEW RECORD · ${Meta.P.rec.duelBest} duels won in a row</div>`); else if (won && Meta.P.rec.duelStreak > 1) notes.push(`<div class="note">Duel win streak: ${Meta.P.rec.duelStreak}</div>`); }
      $('resTable').innerHTML = statRows(ws);
      add = resultButtons({ win, kills: ws.kills, pens: ws.pens, crew: ws.crew, over, matchWon: over && won }, notes).add;
      $('resTitle').className = win ? 'win' : 'lose';
      $('resTitle').textContent = over ? (won ? 'DUEL WON' : 'DUEL LOST') : (win ? 'ROUND WON' : 'ROUND LOST');
      $('resSub').textContent = `${L().name} · ${TYPES[chosenType].name} vs ${TYPES[chosenType].name} · score ${duelScore[0]} – ${duelScore[1]}`;
      Meta.setLast({ tank: chosenType, mode, level: levelIdx, wave: 0 });
      if (over) add('New duel', () => { duelScore = [0, 0]; startLevel(); });
      else add('Next round', () => spawnWave());
    }
    add('Main menu', toMenu, true);
    show('result'); Meta.banner('bannerRes');
  }

  function show(id) { $(id).classList.add('on'); }
  function hide(id) { $(id).classList.remove('on'); }
  function toMenu() {
    freePointer();
    hide('pause'); hide('result'); hide('revive'); hideDeadBar();
    state = 'menu'; campaignScore = 0;
    HitCam.stop(); setSight(false); setAir(null);
    Meta.sdk.gameplayStop();
    freeBattle();
    buildMenu(); show('menu'); playMusic(); newDay();
    Meta.banner('bannerMenu');
  }
  // nouveau jour pendant la session : missions renouvelées et prime de présence annoncée
  function newDay() { const r = Meta.dailyRoll(); if (r) { buildMenu(); dailyNote(r); } }
  // Annonces du nouveau jour : missions non réclamées payées d'office, saison du bon de guerre, série
  // perdue (rattrapable aujourd'hui), et calendrier de la prime de présence (caisse au 7e jour)
  function dailyNote(r) {
    if (!r) return;
    if (r.paid) toast(`Unclaimed orders paid: +✪ ${fmt(r.paid)}`);
    if (r.season) toast(`🎖 ${r.season}`);
    if (r.lost) toast(`Your ${r.lost}-day streak was broken: restore it in Missions today`);
    // tout premier jour : simple annonce, rien ne s'interpose avant la première bataille
    if (r.day && !Meta.P.stats.battles) toast(`Daily login · day ${r.day}: +${r.text} · tomorrow ✪ ${fmt(r.tomorrow)}`);
    else if (r.day) {
      const crate = (r.day - 1) % 7 === 6;
      celebrate({ kind: `Daily login · day ${r.day}`, name: r.text, rar: crate ? 'epic' : 'rare', icon: crate ? '📦' : '✪', flav: `Tomorrow: ✪ ${fmt(r.tomorrow)}. Day 7 of every week brings a Supply Crate.` });
      celebrateGot('Supply Crate');
    }
  }
  // Retour au menu : interface effacée, décor 3D et texture du sol libérés (des dizaines de Mo de
  // tampons dans les Ardennes) ; la prochaine bataille les reconstruit (genMap, setup3D)
  function freeBattle() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (W3D0) {
      for (const t of tanks) if (t.scar3) { W3D0.free(t.scar3.hull); W3D0.free(t.scar3.turret); t.scar3 = null; }
      clearFalls3(); W3D0.clearCells(); scene3On = false; dirty3.clear();
    }
    groundCv = gctx = null; dirtyTiles.clear();
  }
  let pausedFrom = 'play';
  // Curseur verrouillé en 3D. Les deux appels renvoient une promesse qui peut être rejetée (par
  // exemple si l'on reverrouille moins d'une seconde après Échap) : l'erreur est absorbée.
  let lockedBefore = false, intentionalUnlock = false, pausedAt = -1e9;
  function lockPointer() {
    if (!W3D || touch.on || !cv.requestPointerLock || document.pointerLockElement === cv) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* verrouillage refusé */ }
  }
  function freePointer() { if (document.pointerLockElement === cv) { intentionalUnlock = true; document.exitPointerLock(); } }
  function togglePause() {
    freePointer(); rebinding = null;
    if (state === 'pause') { state = pausedFrom; hide('pause'); optHome(); last = performance.now(); Meta.sdk.gameplayStart(); }
    else if (inBattle()) { pausedFrom = state; state = 'pause'; pausedAt = performance.now(); syncPause(); show('pause'); Meta.sdk.gameplayStop(); }
  }
  // Options depuis la pause : le panneau du menu vient dans la boîte de pause, puis retourne à sa place
  function optHome() {
    const o = $('tab-options');
    if (o.parentNode === $('pauseOpts')) { $('bannerMenu').before(o); o.classList.toggle('on', !!document.querySelector('.tab.on[data-tab="options"]')); }
  }
  function syncPause() { optHome(); $('pauseHelp').hidden = true; $('tutSkip').hidden = !tutOn(); }
  $('pOptBtn').onclick = () => {
    const o = $('tab-options');
    if (o.parentNode === $('pauseOpts')) { optHome(); return; }
    $('pauseHelp').hidden = true; $('pauseOpts').appendChild(o); o.classList.add('on'); applyOptions();
  };
  $('pHelpBtn').onclick = () => {
    optHome();
    const h = $('pauseHelp');
    h.hidden = !h.hidden;
    h.innerHTML = helpRows().map(([k, d]) => `<div><kbd>${k}</kbd>${d}</div>`).join('');
  };
  $('tutSkip').onclick = skipTut;
  // Pause automatique (onglet masqué, fenêtre quittée, curseur libéré par le navigateur), sauf en
  // partie automatique de test où personne ne joue
  function autoPause() { if (inBattle() && !AUTO) togglePause(); }
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === cv;
    // Échap libère le curseur sans toujours transmettre la touche à la page : on met en pause
    if (!locked && lockedBefore && !intentionalUnlock) autoPause();
    lockedBefore = locked; intentionalUnlock = false;
  });
  document.addEventListener('pointerlockerror', () => { lockedBefore = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { autoPause(); releaseInput(); Sfx.setBgMute(true); stopMusic(); }
    else { Sfx.setBgMute(false); last = performance.now(); playMusic(); }
  });

  // Banc d'essai : un tir sur une plaque, prédiction empirique et simulation du métal
  const bench = { sim: null, t0: 0, pred: null };
  function initBench() {
    const g = $('bGun'), sS = $('bShell');
    g.innerHTML = Object.values(TYPES).map(T => `<option value="${T.id}">${Ballistics.GUNS[T.id].gun} (${T.name})</option>`).join('');
    const fillShells = () => { sS.innerHTML = SHELL_KEYS.filter(k => k !== 'SMOKE' && k !== 'CAN').map(k => `<option value="${k}">${Ballistics.shell(g.value, k).name}</option>`).join(''); sS.value = 'APHE'; };
    fillShells();
    g.onchange = () => { fillShells(); labels(); };
    const labels = () => { $('bTv').textContent = $('bT').value + ' mm'; $('bAv').textContent = $('bA').value + '°'; $('bDv').textContent = $('bD').value + ' m'; };
    for (const id of ['bT', 'bA', 'bD']) $(id).oninput = labels;
    labels();
    $('bFire').onclick = benchFire;
  }
  function benchFire() {
    const id = $('bGun').value, key = $('bShell').value, T = Number($('bT').value), ang = Number($('bA').value), x = Number($('bD').value);
    const sb = Ballistics.shell(id, key), V = Ballistics.velAt(sb, x), pen = Ballistics.penVel(sb, V);
    const ef = Ballistics.effective(sb, T, ang), ric = sb.he ? 0 : Ballistics.ricochetChance(sb, T, ang);
    const shat = sb.he || sb.heat ? 0 : Ballistics.shatterChance(sb, T, ang, V);
    const perforate = pen >= ef.eff && ric < 0.5;
    bench.sim = metalFor(sb, T, ang, pen, ef.eff, perforate);
    bench.t0 = performance.now();
    bench.pred = { sb, V, pen, eff: ef.eff, angN: ef.angN, ric, shat, perforate, T, ang, x };
    Sfx.init(); Sfx.fire(100, sb.cal > 80);
  }
  function renderBench() {
    const c = $('bench');
    if (!c || !c.clientWidth) return;
    const w = Math.round(c.clientWidth * DPR), h = Math.round(c.clientHeight * DPR);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    const cw = c.clientWidth, ch = c.clientHeight;
    if (!bench.sim) {
      x.fillStyle = '#07090c'; x.fillRect(0, 0, cw, ch);
      x.fillStyle = '#8f8a77'; x.font = '600 14px system-ui, sans-serif'; x.textAlign = 'center';
      x.fillText('Pick a gun, a shell and a plate, then fire.', cw / 2, ch / 2);
      return;
    }
    // lecture en boucle sur 4 s, une fois le calcul terminé
    const el = (performance.now() - bench.t0) / 1000, sim = bench.sim;
    const p = sim.st.done ? ((el % 5) / 4) : Math.min(1, sim.frames.length / Math.max(1, sim.expected));
    drawMetalPanel(x, sim, 0, 0, cw, ch, Math.min(1, p), 1, true);
    const P = bench.pred, f = (v, k = 0) => v.toFixed(k);
    $('benchInfo').innerHTML =
      `<b>${P.sb.name}</b> · ${f(P.sb.m, 2)} kg · velocity at ${P.x} m: <b>${Math.round(P.V)} m/s</b> (muzzle ${P.sb.v0}) · energy ${f(0.5 * P.sb.m * P.V * P.V / 1e6, 2)} MJ<br>` +
      `Plate ${P.T} mm at ${P.ang}°${!P.sb.heat && !P.sb.he ? ` (normalized ${Math.round(P.angN)}°)` : ''} → effective armor <b>${Math.round(P.eff)} mm</b> · penetration <b>${Math.round(P.pen)} mm</b> · ricochet risk ${Math.round(P.ric * 100)}%${P.shat >= 0.01 ? ` · shatter risk ${Math.round(P.shat * 100)}%` : ''}<br>` +
      `Ballistic prediction: <b>${P.perforate ? 'penetration' : P.ric >= 0.5 ? 'ricochet' : 'no penetration'}</b> · the metal simulation is calibrated to the same ballistic limit`;
  }

  $('startBtn').onclick = () => {
    if (!Meta.P.tanks.includes(chosenType)) return;
    Sfx.init(); hide('menu'); waveIdx = contWave(); campaignScore = 0; sectorScore = 0; sectorTk = 0; duelScore = [0, 0];
    if (mode === 'campagne') levelIdx = Math.min(levelIdx, unlockedIdx());
    Meta.setLast({ tank: chosenType, mode, level: levelIdx, wave: waveIdx });
    startLevel();
  };
  // reprendre reverrouille le curseur dans le geste du clic (sinon la vue tourne seule en 3D)
  $('resumeBtn').onclick = () => { if (state !== 'pause') return; togglePause(); if (state === 'play' || state === 'intro') lockPointer(); };
  // Repli : la bataille s'arrête sur une défaite (une victoire déjà acquise reste une victoire), et les
  // gains déjà obtenus sont versés par l'écran de résultats
  $('quitBtn').onclick = () => {
    if (state !== 'pause') return;
    hide('pause'); setSight(false); HitCam.stop();
    if (pausedFrom !== 'ending') { waveResult = 'lose'; if (mode === 'duel') duelScore[1] = Math.max(duelScore[1], 1); }
    showResult();
  };
  // Joueur détruit en campagne : il prend le commandement de l'allié suivi après 10 s de liaison radio
  // (Tab ou bouton ; le char garde ses réglages d'origine, sans pièces ni équipage du joueur), ou fait
  // avancer la bataille trois fois plus vite
  let ffK = 1, cmdT = 0, cmdTo = null, deadBarOn = false, cmdLab = '';
  function takeCommand() {
    if (!deadBarOn || cmdT > 0) return;
    const a = camFocus();
    if (!a || a === player || a.dead) return;
    cmdT = 10; cmdTo = a;
    showMsg(`Radio: taking command of ${a.name} (${a.T.name}) in 10 s`, '#bcd8ff', 3);
  }
  function commandSwitch() {
    const a = cmdTo; cmdTo = null;
    if (!a || a.dead || !player || !player.dead) return;
    a.name = 'You'; if (!AUTO) a.ai = null;
    player = a; specIdx = 0; ffK = 1; reviveUsed = true;
    Sfx.setTank(a.T.id, a.T.D.rated, a.T.D.trav.kind);
    showMsg(`You now command the ${a.T.name}`, '#8fd46a', 2.5); addLog('Platoon leader changed tanks', '#bcd8ff');
  }
  function deadBarTick() {
    const on = state === 'play' && mode === 'campagne' && !!player && player.dead && !revivePending() && tanks.some(t => t.team === 0 && !t.dead);
    if (on !== deadBarOn) { deadBarOn = on; $('deadBar').classList.toggle('on', on); if (!on) { ffK = 1; cmdT = 0; cmdTo = null; } }
    if (!on) return;
    const lab = cmdT > 0 ? `Radio link… ${Math.ceil(cmdT)} s` : touch.on ? 'Take command' : 'Take command (Tab)';
    if (lab !== cmdLab) { cmdLab = lab; $('cmdBtn').textContent = lab; $('cmdBtn').disabled = cmdT > 0; }
    $('ffBtn').classList.toggle('on', ffK > 1);
  }
  function hideDeadBar() { ffK = 1; cmdT = 0; cmdTo = null; deadBarOn = false; cmdLab = ''; $('deadBar').classList.remove('on'); }
  $('cmdBtn').onclick = () => takeCommand();
  $('ffBtn').onclick = () => { if (deadBarOn) ffK = ffK > 1 ? 1 : 3; };
  function openTab(name) { const b = document.querySelector(`.tab[data-tab="${name}"]`); if (b) b.click(); }
  $('xrayBtn').onclick = () => { viewer.xray = !viewer.xray; $('xrayBtn').classList.toggle('on', viewer.xray); };
  const vc = $('viewer');
  vc.addEventListener('pointerdown', e => { if (adOn()) return; viewer.drag = { x: e.clientX, y: e.clientY, a: viewer.ang, e: viewer.elev }; vc.setPointerCapture(e.pointerId); });
  vc.addEventListener('pointermove', e => {
    if (!viewer.drag) return;
    viewer.ang = viewer.drag.a - (e.clientX - viewer.drag.x) * 0.01;
    viewer.elev = clamp(viewer.drag.e + (e.clientY - viewer.drag.y) * 0.006, 0.05, 1.3);
  });
  vc.addEventListener('pointerup', () => { viewer.drag = null; });
  // molette sur la vitrine : rapproche ou éloigne la caméra du char
  vc.addEventListener('wheel', e => { e.preventDefault(); if (!adOn()) viewer.dist = clamp(viewer.dist * Math.exp(e.deltaY * 0.001), 0.62, 1.5); }, { passive: false });
  // ailleurs, la molette ne fait jamais défiler la page du portail : seuls les panneaux du menu et les
  // écrans centrés défilent (sans entraîner la page quand ils arrivent au bout, voir overscroll-behavior)
  addEventListener('wheel', e => { if (!(e.target && e.target.closest && e.target.closest('.side, .center'))) e.preventDefault(); }, { passive: false });

  // ===================== Entrées =====================
  // Pendant une publicité, le SDK l'affiche dans la page du jeu : nos gestionnaires de clavier et de
  // souris l'ignorent (sans bloquer l'interface de la publicité elle-même)
  const adOn = () => Meta.adActive();
  function releaseInput() { for (const k in keys) keys[k] = false; mouse.down = false; mouse.right = false; cam3.drag = null; }
  const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'PageUp', 'PageDown', 'Home', 'End'];
  // Commandes du clavier, par codes physiques (AZERTY compris) : réglages par défaut, réassignables dans
  // les options (opts.binds) ; flèches, Shift droit, V, Échap, P, Tab et les chiffres restent des doublons fixes
  const BIND_DEF = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', brake: 'KeyX', fire: 'Space', mg: 'KeyF', belt: 'KeyG', sight: 'ShiftLeft', zoom: 'KeyZ',
    smoke: 'KeyE', cam: 'KeyC', hatch: 'KeyU', ext: 'KeyT', repair: 'KeyR', bail: 'KeyB', flare: 'KeyL', xray: 'KeyH', mute: 'KeyM', help: 'Slash',
    rangeUp: 'PageUp', rangeDown: 'PageDown', attack: 'Digit8', follow: 'Digit9', hold: 'Digit0', move: 'KeyN', arty: 'KeyK' };
  const BIND_ALT = { fwd: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const FIXED = { ShiftRight: 'sight', KeyV: 'sight', Escape: 'pause', KeyP: 'pause', Backquote: 'pause', IntlBackslash: 'pause', Tab: 'command', Numpad8: 'attack', Numpad9: 'follow', Numpad0: 'hold' };
  for (let i = 1; i <= 7; i++) FIXED['Digit' + i] = FIXED['Numpad' + i] = 'shell' + i;
  const bind = a => (Meta.P.opts.binds || {})[a] || BIND_DEF[a];
  const held = a => !!(keys[bind(a)] || keys[BIND_ALT[a]]);
  function actionOf(code) {
    for (const a in BIND_DEF) if (bind(a) === code) return a;
    return FIXED[code] || null;
  }
  // nom d'une touche sur le clavier du joueur (disposition donnée par le navigateur quand il le peut)
  let kbMap = null;
  try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { kbMap = m; }, () => {}); } catch (e) { /* API absente */ }
  const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R.Shift', ControlLeft: 'Ctrl', ControlRight: 'R.Ctrl', AltLeft: 'Alt', AltRight: 'AltGr', Enter: 'Enter',
    Backspace: '⌫', CapsLock: 'Caps', PageUp: 'PgUp', PageDown: 'PgDn', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Slash: '?' };
  function codeName(c) {
    if (!c) return '—';
    const m = kbMap && !KEY_NAMES[c] && kbMap.get(c);
    if (m && m.trim()) return m.toUpperCase();
    return KEY_NAMES[c] || c.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
  }
  const keyName = a => codeName(bind(a));
  let rebinding = null; // action en attente d'une nouvelle touche (options)
  addEventListener('keydown', e => {
    // ces touches ne doivent jamais faire défiler la page du portail
    if (SCROLL_KEYS.includes(e.code) && !(e.target && e.target.closest && e.target.closest('input, select'))) e.preventDefault();
    if (adOn()) return;
    if (rebinding) { e.preventDefault(); setBind(rebinding, e.code === 'Escape' ? null : e.code); return; }
    if (e.repeat && keys[e.code]) return;
    keys[e.code] = true;
    keyAction(e.code);
    if (e.key === '?' && actionOf(e.code) !== 'help') doAction('help');
  });
  // Touche → action ; la même pression d'Échap peut libérer le curseur (pause automatique) puis arriver ici
  function keyAction(code) { doAction(actionOf(code)); }
  // Action d'une commande, partagée par le clavier, les boutons tactiles et la manette.
  // Les claviers d'iPad n'ont souvent pas d'Échap : ` (ou §) et P mettent aussi en pause.
  function doAction(a) {
    if (!a) return;
    if (a === 'pause') { if (!(state === 'pause' && performance.now() - pausedAt < 400)) togglePause(); return; }
    if (a === 'mute') {
      Meta.P.opts.mute = Sfx.toggle(); Meta.save();
      if (Meta.P.opts.mute) stopMusic(); else playMusic();
      if (state !== 'menu') showMsg(Meta.P.opts.mute ? 'Sound off' : 'Sound on', '#bcd8ff', 1);
    }
    if (a === 'command') takeCommand();
    if (a === 'xray' && state !== 'menu') xrayKey();
    if (a === 'help' && inBattle()) helpT = helpT > 0 ? 0 : 8;
    if (a === 'sight' && state !== 'menu') setSight(!sight.on);
    if (a === 'flare' && state === 'play' && player && !player.dead && L().night && gameTime - (player.flareAt || -99) > 8) {
      player.flareAt = gameTime;
      const m = screenToWorld(mouse.x, mouse.y);
      launchFlare(player, m.x, m.y);
    }
    if (a === 'cam' && W3D && state !== 'menu') {
      setSight(false);
      cam3.mode = (cam3.mode + 1) % CAM_MODES.length;
      cam3.dist = CAM_MODES[cam3.mode].dist; cam3.off = 0;
      showMsg(CAM_MODES[cam3.mode].name, '#bcd8ff', 1.2);
    }
    if (!player || player.dead || player.ai || !inBattle()) return;
    const dm = a.match(/^shell([1-7])$/);
    if (dm) {
      const key = SHELL_KEYS[Number(dm[1]) - 1];
      if (player.ammo[key] <= 0) showMsg(`Out of ${SHELLS[key].name.toLowerCase()} rounds`, '#ff9a7a', 1.2);
      else {
        const r = selectShell(player, key);
        if (r === 'queued') showMsg(`Next round: ${SHELLS[key].name.toLowerCase()} · press again to unload the gun`, '#e9d9a6', 1.6);
        else if (r === 'unloaded') showMsg(`Unloading the gun: ${SHELLS[key].name.toLowerCase()} in ${player.reloadT.toFixed(1)} s`, '#ffcf7a', 1.6);
        else if (r === 'switched') showMsg(SHELLS[key].full, '#e9d9a6', 1.2);
        else if (r === 'cancelled') showMsg(`Keeping ${SHELLS[key].name.toLowerCase()}`, '#e9d9a6', 1.2);
        if (r) tutDone('shell');
      }
    }
    if (a === 'attack' || a === 'follow' || a === 'hold' || a === 'move') giveOrder(a);
    if (a === 'arty') OBJ.callArty();
    if (a === 'zoom' && sight.on) sight.mag = (sight.mag + 1) % MAGS.length;
    if ((a === 'rangeUp' || a === 'rangeDown') && sight.on) setRange(a === 'rangeUp' ? 1 : -1);
    if (a === 'smoke' && state === 'play') deploySmoke(player);
    // extincteur à main : 3 s pendant lesquelles le tireur ne tire pas ; inutile sur un feu de charges
    if (a === 'ext' && state === 'play' && player.fires.length && !(player.extT > 0)) {
      if (player.extN <= 0) showMsg('No extinguisher left', '#ff9a7a', 1.2);
      else { player.extN--; player.extT = 3; showMsg(`Extinguisher (${player.extN} left)`, '#bcd8ff', 1.4); }
    }
    // chenille : l'équipage descend la réparer (char arrêté), ou remonte
    if (a === 'repair' && state === 'play' && player.trackT > 0) {
      if (!player.dismount && Math.abs(player.speed) > 0.5 * PX) showMsg('Stop the tank to repair the track', '#ffcf7a', 1.4);
      else { player.dismount = !player.dismount; showMsg(player.dismount ? 'Crew out: repairing the track' : 'Crew back inside', '#bcd8ff', 1.4); }
    }
    // abandon du char : l'équipage est sauvé, le char perdu
    if (a === 'bail' && state === 'play' && (player.fires.length || player.cookT > 0)) bail(player);
    if (a === 'belt') {
      const g = player.mg;
      if (g.type === 'SmK' && g.ammoH <= 0) showMsg('No S.m.K.H. belts left', '#ff9a7a', 1.2);
      else { g.type = g.type === 'SmK' ? 'SmKH' : 'SmK'; showMsg(`Machine gun: ${MG_AMMO[g.type].full}`, '#e9d9a6', 1.4); }
    }
    if (a === 'hatch' && roleOk(player, 'commander')) {
      player.hatch = !player.hatch;
      showMsg(player.hatch ? 'Commander out: better vision, but exposed to bullets' : 'Buttoned up', '#bcd8ff', 1.6);
    }
  }
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { releaseInput(); autoPause(); });
  // position de la souris dans le repère du canvas (décalage et mise à l'échelle éventuels de la page)
  function trackMouse(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || synthMouse()) return; // doigt : voir les commandes tactiles
    const r = cv.getBoundingClientRect();
    touch.rel = false;
    if (document.pointerLockElement === cv) {
      const o = Meta.P.opts;
      mouse.x = clamp(mouse.x + (e.movementX || 0) * (W / (r.width || W)) * o.sens, 0, W);
      mouse.y = clamp(mouse.y + (e.movementY || 0) * (H / (r.height || H)) * o.sens * (o.invertY ? -1 : 1), 0, H);
      return;
    }
    mouse.x = (e.clientX - r.left) * (W / (r.width || W));
    mouse.y = (e.clientY - r.top) * (H / (r.height || H));
  }
  addEventListener('mousemove', trackMouse);
  // à la lunette, la souris oriente la visée (déplacement relatif, curseur verrouillé si possible)
  addEventListener('mousemove', e => {
    if (!sight.on) return;
    if (document.pointerLockElement !== cv) return; // position absolue lue dans sightCam
    const o = Meta.P.opts;
    sight.cx += (e.movementX || 0) * o.sensSight; sight.cy += (e.movementY || 0) * o.sensSight * (o.invertY ? -1 : 1);
  });
  addEventListener('pointerdown', trackMouse);
  // clic (curseur libre) ou toucher sur l'incrustation de la caméra d'impact : elle s'efface
  const pipHit = (x, y) => { const p = ui.pip; return !!p && HitCam.active() && x >= p.x0 * uiK && x <= (p.x0 + p.w) * uiK && y >= p.y0 * uiK && y <= (p.y0 + p.h) * uiK; };
  cv.addEventListener('mousedown', e => {
    if (adOn() || synthMouse()) return;
    Sfx.init();
    if (e.button === 0 && document.pointerLockElement !== cv && pipHit(mouse.x, mouse.y)) { HitCam.stop(); return; }
    if (e.button === 0) {
      mouse.down = true;
      if (state === 'play' || state === 'intro') lockPointer();
      if (player && player.dead) specIdx++;
    }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; });
  cv.addEventListener('mousedown', e => { if (e.button === 2 && !adOn()) mouse.right = true; });
  // clic du milieu : aller au point visé
  cv.addEventListener('mousedown', e => { if (e.button === 1 && !adOn() && player && !player.dead && !player.ai) { e.preventDefault(); giveOrder('move'); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!W3D || adOn()) return;
    if (sight.on) { if (assisted()) sight.mag = clamp(sight.mag + (e.deltaY < 0 ? 1 : -1), 0, MAGS.length - 1); else setRange(e.deltaY < 0 ? 1 : -1); return; }
    cam3.dist = clamp(cam3.dist * Math.exp(e.deltaY * 0.0012), 14, 160); }, { passive: false });
  cv.addEventListener('mousedown', e => { if (e.button === 2 && !adOn()) cam3.drag = { x: e.clientX, off: cam3.off }; });
  addEventListener('mousemove', e => { if (cam3.drag) cam3.off = cam3.drag.off - (e.clientX - cam3.drag.x) * 0.006; });
  addEventListener('mouseup', e => { if (e.button === 2) cam3.drag = null; });
  cv.addEventListener('dblclick', () => { if (!adOn()) cam3.off = 0; });

  // ===================== Manette =====================
  // Manette standard (API Gamepad) : manche gauche = conduite, manche droit = visée, RT tir, LT
  // mitrailleuse, LB / RB obus précédent / suivant, A lunette, B fumigène, X trappe, Y caméra, Start
  // pause, View caméra d'impact, L3 freins, R3 grossissement, croix ↑↓ grossissement (hausse en visée
  // réaliste), ← réparer ou éteindre, → ordre d'attaque. Tout passe par ctl et doAction, comme le toucher ;
  // hors bataille, A et B pressent les boutons des écrans (pause, réparation, résultats, menu).
  const pad = { prev: [], gp: null };
  const PAD_TAP = { 0: 'sight', 1: 'smoke', 2: 'hatch', 3: 'cam', 8: 'xray', 9: 'pause', 11: 'zoom' };
  function padRumble(k, ms) {
    const g = pad.gp;
    try { if (padOn && g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: k * 0.6 }); } catch (e) { /* vibreur absent */ }
  }
  function padRelease() { padOn = false; ctl.thr = ctl.turn = 0; ctl.fire = ctl.mg = ctl.brake = false; }
  function padScreen(i) {
    // bouton principal (A) ou de renoncement (B) de l'écran affiché
    const pick = { pause: i === 0 ? '#resumeBtn' : null, revive: i === 0 ? '#revKit:not([disabled]), #revAd' : '#revNo', result: i === 0 ? '#resBtns .btn:not(.ad):not(.alt)' : '#resBtns .btn.alt', menu: i === 0 ? '#startBtn' : null }[state];
    const el = pick && document.querySelector(pick);
    if (el && !el.disabled) el.click();
  }
  function pollPad(dt) {
    let gp = null;
    try { for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.connected && g.mapping === 'standard') { gp = g; break; } } catch (e) { /* API absente */ }
    pad.gp = gp;
    if (!gp) { if (padOn) padRelease(); return; }
    const bt = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85; };
    const now = gp.buttons.map((x, i) => bt(i)), was = pad.prev, tap = i => now[i] && !was[i];
    if (!padOn && (now.some(Boolean) || [0, 1, 2, 3].some(i => ax(i)))) { padOn = true; setTouchMode(false); }
    pad.prev = now;
    if (!padOn) return;
    const fight = inBattle() && player && !player.dead && !player.ai;
    if (!inBattle()) { if (tap(0) || tap(1)) padScreen(tap(0) ? 0 : 1); if (tap(9)) doAction('pause'); ctl.fire = ctl.mg = false; return; }
    for (const i in PAD_TAP) if (tap(i)) doAction(PAD_TAP[i]);
    if (player && player.dead) { if (tap(0)) specIdx++; if (tap(2)) takeCommand(); }
    if (!fight) { ctl.thr = ctl.turn = 0; ctl.fire = ctl.mg = false; return; }
    ctl.thr = -ax(1); ctl.turn = ax(0); ctl.fire = bt(7); ctl.mg = bt(6); ctl.brake = bt(10);
    if (tap(4) || tap(5)) cycleShell(tap(4) ? -1 : 1);
    if (tap(12) || tap(13)) { const d = tap(12) ? 1 : -1; if (sight.on && !assisted()) setRange(d); else if (sight.on) sight.mag = clamp(sight.mag + d, 0, MAGS.length - 1); else cam3.dist = clamp(cam3.dist * (d > 0 ? 0.8 : 1.25), 14, 160); }
    if (tap(14)) doAction(player.trackT > 0 ? 'repair' : player.fires.length ? 'ext' : 'bail');
    if (tap(15)) doAction('attack');
    // visée au manche droit, en déplacement relatif (comme un curseur verrouillé)
    const o = Meta.P.opts, iy = o.invertY ? -1 : 1, rx = ax(2), ry = ax(3);
    if (rx || ry) {
      touch.rel = true;
      if (sight.on) { sight.cx += rx * 600 * dt * o.sensSight; sight.cy += ry * 450 * dt * o.sensSight * iy; }
      else { mouse.x = clamp(mouse.x + rx * 900 * dt * o.sens, 0, W); mouse.y = clamp(mouse.y + ry * 500 * dt * o.sens * iy, H * 0.25, H * 0.7); }
    }
  }
  addEventListener('keydown', () => { if (padOn) padRelease(); });
  addEventListener('mousemove', e => { if (padOn && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 3) padRelease(); });

  // ===================== Commandes tactiles =====================
  // Téléphones, tablettes et iPad avec clavier : manche flottant à gauche (gaz et direction), glisser
  // ailleurs pour viser (comme un curseur verrouillé), boutons dessinés sur le canevas 2D. Le calque
  // paraît au premier toucher et s'efface à la première touche du clavier, sauf en usage mixte (doigt
  // posé ou toucher récent) : clavier et toucher s'ajoutent alors dans ctl.
  const touch = { on: false, rel: false, t: -1e9, ptrs: new Map(), stick: null, pinch: null, menu: false, btns: [], slots: [], top: 0, safe: [0, 0, 0, 0] };
  const STICK_R = 56, STICK_DZ = 0.15;
  const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const relAim = () => document.pointerLockElement === cv || touch.rel;
  const synthMouse = () => performance.now() - touch.t < 800; // souris émulée juste après un toucher
  function setTouchMode(on) {
    if (touch.on === on) return;
    touch.on = on; touch.menu = false;
    if (!on) { touch.rel = false; ctl.thr = ctl.turn = 0; ctl.fire = ctl.mg = false; }
    document.body.classList.toggle('touch', on);
    if (on) freePointer();
  }
  // marges de sécurité (encoche, barre d'accueil) : variables CSS de index.html
  function readSafe() {
    const cs = getComputedStyle(document.documentElement);
    touch.safe = ['--sat', '--sar', '--sab', '--sal'].map(v => parseFloat(cs.getPropertyValue(v)) || 0);
    // écran tactile tenu en portrait : voile « tournez l'appareil » (CSS) et pause
    if (mq('(orientation: portrait) and (pointer: coarse)') && inBattle()) autoPause();
  }
  addEventListener('resize', readSafe);
  readSafe();
  setTouchMode(mq('(pointer: coarse)'));
  addEventListener('keydown', () => { if (touch.on && !touch.ptrs.size && performance.now() - touch.t > 3000) setTouchMode(false); }, true);

  const alive = () => player && !player.dead && !player.ai && inBattle();
  const ownedShells = () => SHELL_KEYS.filter(k => player.ammo[k] > 0);
  const shellAct = k => 'shell' + (SHELL_KEYS.indexOf(k) + 1);
  function cycleShell(dir = 1) {
    const l = ownedShells(), cur = player.nextShell || player.shell;
    const nx = l[(l.indexOf(cur) + dir + l.length) % l.length];
    if (nx && nx !== cur) doAction(shellAct(nx));
  }
  // Boutons : grappe de droite (at : décalage depuis le coin inférieur droit, r : rayon ≥ 24 px) et
  // rangées en haut à gauche (row). key : même action que la touche ; hold : commande maintenue.
  const TBTN = [
    { at: [-84, -96], r: 44, label: 'FIRE', hold: v => { ctl.fire = v; if (v) ctl.tap = true; } },
    { at: [-186, -62], r: 28, label: 'MG', hold: v => { ctl.mg = v; } },
    { at: [-176, -164], r: 28, label: () => sight.on ? 'OUT' : 'SIGHT', key: 'sight' },
    { at: [-84, -206], r: 28, label: () => SHELLS[player.nextShell || player.shell].tag || (player.nextShell || player.shell), sub: 'AMMO', tap: () => cycleShell() },
    { at: [-262, -150], r: 26, label: () => `×${MAGS[sight.mag]}`, sub: 'ZOOM', show: () => sight.on, tap: () => { sight.mag = (sight.mag + 1) % MAGS.length; } },
    { at: [-262, -212], r: 24, label: 'R+', sub: 'RANGE', show: () => sight.on && !assisted(), key: 'rangeUp' },
    { at: [-262, -88], r: 24, label: 'R−', sub: 'RANGE', show: () => sight.on && !assisted(), key: 'rangeDown' },
    { row: 1, label: '❚❚', key: 'pause', any: true },
    { row: 1, label: 'CAM', key: 'cam', show: () => W3D && !sight.on },
    { row: 1, label: 'SMOKE', key: 'smoke' },
    { row: 1, label: () => player.hatch ? 'HATCH ▲' : 'HATCH', key: 'hatch' },
    { row: 1, label: 'FLARE', key: 'flare', show: () => L().night },
    { row: 1, label: () => OBJ.artyLabel(), key: 'arty', show: () => OBJ.artyShow() },
    { row: 1, label: 'REPAIR', key: 'repair', warn: true, show: () => player.trackT > 0 },
    { row: 1, label: 'EXTINGUISH', key: 'ext', warn: true, show: () => player.fires.length > 0 },
    { row: 1, label: 'BAIL OUT', key: 'bail', warn: true, show: () => player.fires.length > 0 || player.cookT > 0 },
    { row: 1, label: 'ORDERS', show: () => mode === 'campagne', tap: () => { touch.menu = !touch.menu; } },
    ...[['ATTACK', 'attack'], ['FOLLOW', 'follow'], ['HOLD', 'hold'], ['MOVE', 'move']].map(([label, key]) =>
      ({ row: 2, label, key, show: () => touch.menu && mode === 'campagne', after: () => { touch.menu = false; } })),
  ];
  const txt = v => typeof v === 'function' ? v() : v;
  // position et taille des boutons visibles pour cette image (dessin et détection des touchers)
  function layoutTouch() {
    const [st, sr, sb, sl] = touch.safe, k = clamp(Math.min(W, H) / 390, 0.9, 1.25);
    const list = [], rx = [0, sl + 10, sl + 10];
    ctx.font = '700 11px system-ui, sans-serif';
    for (const b of TBTN) {
      if (!(b.any ? inBattle() : alive()) || (b.show && !b.show())) continue;
      const label = txt(b.label);
      if (b.row) {
        const w = Math.max(52, ctx.measureText(label).width + 20), h = 48, y = st + 10 + (b.row - 1) * (h + 8);
        list.push({ b, label, x: rx[b.row], y, w, h }); rx[b.row] += w + 8;
      } else list.push({ b, label, cx: W - sr + b.at[0] * k, cy: H - sb + b.at[1] * k, r: b.r * k });
    }
    touch.top = st + 10 + (touch.menu ? 112 : 56);
    return touch.btns = list;
  }
  function hitTouch(x, y) {
    for (const q of touch.btns) {
      if (q.r ? Math.hypot(x - q.cx, y - q.cy) <= q.r + 6 : x >= q.x - 4 && x <= q.x + q.w + 4 && y >= q.y - 4 && y <= q.y + q.h + 4) return q.b;
    }
    for (const s of touch.slots) if (alive() && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { key: shellAct(s.key) };
    return null;
  }
  function pressTouch(b, down) {
    if (b.hold) { b.hold(down); return; }
    if (!down) return;
    if (b.tap) b.tap(); else if (b.key) doAction(b.key);
    if (b.after) b.after();
  }
  function tPos(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / (r.width || W)), (e.clientY - r.top) * (H / (r.height || H))];
  }
  function stickAxes() {
    const s = touch.stick, dz = v => Math.abs(v) < STICK_DZ ? 0 : clamp((v - Math.sign(v) * STICK_DZ) / (1 - STICK_DZ), -1, 1);
    ctl.thr = s ? dz(-s.dy / STICK_R) : 0; ctl.turn = s ? dz(s.dx / STICK_R) : 0;
  }
  const aimPtrs = () => [...touch.ptrs.values()].filter(p => p.kind === 'aim');
  cv.addEventListener('pointerdown', e => {
    // souris ou pavé tactile (iPad compris) : commandes de bureau, le calque tactile s'efface
    if (e.pointerType === 'mouse') { if (touch.on && !touch.ptrs.size && !synthMouse()) setTouchMode(false); return; }
    e.preventDefault(); // pas de clic de souris émulé (tir, verrouillage du curseur)
    if (adOn()) return;
    touch.t = performance.now(); setTouchMode(true); Sfx.init();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture refusée */ }
    const [x, y] = tPos(e);
    if (pipHit(x, y)) { HitCam.stop(); return; }
    if (player && player.dead && inBattle()) { specIdx++; return; }
    layoutTouch();
    const b = hitTouch(x, y), kind = b ? 'btn' : x < W * 0.4 && !touch.stick ? 'stick' : 'aim';
    touch.ptrs.set(e.pointerId, { kind, b, x, y });
    if (b) pressTouch(b, true);
    else if (kind === 'stick') { touch.stick = { id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0 }; stickAxes(); }
    else {
      const a = aimPtrs();
      if (a.length === 2) touch.pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mag: sight.mag, dist: cam3.dist };
    }
  }, { passive: false });
  cv.addEventListener('pointermove', e => {
    const p = touch.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault(); touch.t = performance.now();
    const [x, y] = tPos(e), dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (p.kind === 'stick') {
      const s = touch.stick;
      s.dx = x - s.ox; s.dy = y - s.oy;
      // le manche suit le doigt qui dépasse sa course
      const l = Math.hypot(s.dx, s.dy);
      if (l > STICK_R) { s.ox += s.dx * (1 - STICK_R / l); s.oy += s.dy * (1 - STICK_R / l); s.dx *= STICK_R / l; s.dy *= STICK_R / l; }
      stickAxes();
    } else if (p.kind === 'aim') {
      const a = aimPtrs();
      if (a.length >= 2 && touch.pinch) { // pincement : grossissement à la lunette, recul de la caméra dehors
        const f = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / touch.pinch.d;
        if (sight.on) sight.mag = clamp(Math.round(touch.pinch.mag + Math.log2(f) * 2), 0, MAGS.length - 1);
        else cam3.dist = clamp(touch.pinch.dist / f, 14, 160);
        return;
      }
      touch.rel = true;
      const o = Meta.P.opts, iy = o.invertY ? -1 : 1;
      if (sight.on) { sight.cx += dx * 0.8 * o.sensSight; sight.cy += dy * 0.8 * o.sensSight * iy; }
      else { mouse.x = clamp(mouse.x + dx * 1.4 * o.sens, 0, W); mouse.y = clamp(mouse.y + dy * o.sens * iy, H * 0.25, H * 0.7); }
    }
  }, { passive: false });
  function touchEnd(e) {
    const p = touch.ptrs.get(e.pointerId);
    if (!p) return;
    touch.ptrs.delete(e.pointerId); touch.t = performance.now();
    if (p.kind === 'btn') pressTouch(p.b, false);
    else if (p.kind === 'stick') { touch.stick = null; stickAxes(); }
    if (aimPtrs().length < 2) touch.pinch = null;
  }
  cv.addEventListener('pointerup', touchEnd);
  cv.addEventListener('pointercancel', touchEnd);
  // contexte audio d'iOS : il ne démarre que dans un geste (fin de toucher) ou à une touche du clavier
  addEventListener('touchend', () => Sfx.init(), { passive: true });
  addEventListener('keydown', () => { if (state === 'menu') { Sfx.init(); playMusic(); } });

  function drawTouchUI() {
    if (!touch.on || !inBattle()) { touch.btns = []; return; }
    const list = layoutTouch(), [, , sb, sl] = touch.safe;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2;
    // manche : sous le doigt, ou un repère discret là où le pouce se pose d'habitude
    const s = touch.stick;
    if (alive()) {
      const ox = s ? s.ox : sl + 100, oy = s ? s.oy : H - sb - 110;
      ctx.globalAlpha = s ? 0.9 : 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.strokeStyle = 'rgba(233,217,166,0.6)';
      ctx.beginPath(); ctx.arc(ox, oy, STICK_R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(233,217,166,0.55)';
      ctx.beginPath(); ctx.arc(ox + (s ? s.dx : 0), oy + (s ? s.dy : 0), 22, 0, TAU); ctx.fill();
      if (!s) { ctx.fillStyle = '#e9d9a6'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText('DRIVE', ox, oy + STICK_R + 12); }
      ctx.globalAlpha = 1;
    }
    for (const q of list) {
      const b = q.b, held = [...touch.ptrs.values()].some(p => p.b === b);
      ctx.fillStyle = held ? 'rgba(233,196,106,0.45)' : b.warn ? 'rgba(120,40,20,0.6)' : 'rgba(0,0,0,0.45)';
      ctx.strokeStyle = b.warn ? '#ffb070' : 'rgba(233,217,166,0.7)';
      ctx.beginPath();
      if (q.r) ctx.arc(q.cx, q.cy, q.r, 0, TAU); else ctx.roundRect ? ctx.roundRect(q.x, q.y, q.w, q.h, 10) : ctx.rect(q.x, q.y, q.w, q.h);
      ctx.fill(); ctx.stroke();
      const cx = q.r ? q.cx : q.x + q.w / 2, cy = q.r ? q.cy : q.y + q.h / 2;
      ctx.fillStyle = '#f0e6c8'; ctx.font = `700 ${q.r > 40 ? 15 : 11}px system-ui, sans-serif`;
      ctx.fillText(q.label, cx, b.sub ? cy - 5 : cy);
      if (b.sub) { ctx.font = '600 9px system-ui, sans-serif'; ctx.fillStyle = '#a39d88'; ctx.fillText(b.sub, cx, cy + 9); }
      // anneau de rechargement autour du bouton de tir
      if (q.r > 40) {
        const rf = player.reloadT > 0 ? 1 - player.reloadT / player.reloadMax : 1;
        ctx.strokeStyle = rf >= 1 ? '#ffe27a' : 'rgba(255,200,90,0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(q.cx, q.cy, q.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * rf); ctx.stroke(); ctx.lineWidth = 2;
      }
    }
    ctx.restore();
  }

  // ===================== Objectifs, canons antichars et artillerie (objectives.js) =====================
  // camp d'entraînement (même règle que spawnWave) : ni objectif, ni canons, ni artillerie
  const bootCamp = () => mode === 'campagne' && levelIdx === 0 && waveIdx === 0 && (DEV_RUN ? dq('tut') : Meta.P.stats.battles === 0);
  const OBJ = Objectives.create({
    PX, RK, WW, WH, L, Fx, P3, Sfx, Meta, segAABB, losClear, hAt, explode, boom, fragP, heW, mgPen, aimSlope, shellPxK, radioOk, makeTank, bushNear, teamCol, F,
    addLog, showMsg, chatter, floatText, ribbon, missionToast, worldToScreen, keyName, listenerDist, boot: bootCamp,
    free: (x, y) => !blocked(cellOf(x, y)) && !(terra.depth(x, y) > 0.3),
    eSkill: () => aiSkill(Math.min(0.95, 0.3 + levelIdx * 0.14 + waveIdx * 0.04)),
    nextId: () => ++shellId, feed: f => { feed.unshift(f); if (feed.length > 6) feed.pop(); },
    // point visé : sous le réticule, ou au bout de la ligne de visée à la lunette (comme les ordres)
    aimedAt() { const pv = pivot(player); return sight.on && sight.probe ? { x: pv.x + Math.cos(sight.aimYaw) * sight.probe.dist, y: pv.y + Math.sin(sight.aimYaw) * sight.probe.dist } : player.aim3 || player; },
    get tanks() { return tanks; }, get player() { return player; }, get state() { return state; }, get mode() { return mode; }, get level() { return levelIdx; }, get wave() { return waveIdx; },
    get waveTime() { return waveTime; }, get obstacles() { return obstacles; }, get bushes() { return bushes; }, get roads() { return roads; }, get terra() { return terra; },
    get shells() { return shells; }, get parts() { return parts; }, get veils() { return veils; }, get runners() { return runners; }, get reinf() { return reinf; },
    get stats() { return waveStats; }, get W3D() { return W3D; }, get TOF() { return TOF; }, get cmdr3() { return CMDR3; }, get survWave() { return survWave; }, get W() { return W; }, get H() { return H; },
  });

  // Démarrage direct en développement (?debug seulement)
  if (dq('level')) levelIdx = clamp(Number(Q.get('level')) - 1, 0, LEVELS.length - 1);
  if (dq('type') && TYPES[Q.get('type')]) chosenType = Q.get('type');
  if (DEV && MODES[Q.get('mode')]) mode = Q.get('mode');
  if (DEV_START) waveIdx = clamp(Number(Q.get('wave') || 1) - 1, 0, WAVES - 1);
  buildMenu();
  initBench();
  // profil et prime de présence ; puis le menu remplace l'écran de chargement. Une erreur ou une
  // attente trop longue n'empêche jamais le menu d'apparaître.
  let booted = false;
  function boot(bonus) {
    if (booted) { if (state === 'menu') { applyOptions(); buildMenu(); } return; }
    booted = true;
    try {
      if (DEV_RUN && !Meta.dev) Meta.devProfile();
      applyOptions();
      const ls = Meta.P.last;
      if (ls && !DEV_RUN && Meta.P.tanks.includes(ls.tank)) { chosenType = ls.tank; mode = ls.mode; levelIdx = clamp(mode === 'campagne' ? Math.min(ls.level, unlockedIdx()) : ls.level, 0, LEVELS.length - 1); }
      if (!Meta.P.tanks.includes(chosenType)) chosenType = Meta.P.tanks.includes('pz4') ? 'pz4' : Meta.P.tanks[0];
      buildMenu();
    } catch (e) { console.error(e); }
    hide('loading');
    Meta.sdk.loadingStop();
    document.body.classList.toggle('cg', Meta.sdk.banners);
    if (DEV_START) startLevel(); else { show('menu'); Meta.banner('bannerMenu'); }
    if (DEV_RUN) setTimeout(() => toast('Debug run: progress is not saved'), 300);
    else if (bonus) setTimeout(() => dailyNote(bonus), 600);
  }
  const bootT = setTimeout(() => { console.warn('Profile loading timed out'); boot(0); }, 12000);
  Meta.init({ dev: DEV_RUN }).then(b => { clearTimeout(bootT); boot(b); }, e => { console.error(e); clearTimeout(bootT); boot(0); });
  // premier geste dans le menu : le contexte audio naît (règle des navigateurs) et le thème démarre
  addEventListener('pointerdown', () => { if (state === 'menu') { Sfx.init(); playMusic(); } }, { once: false });
  if (Q.has('debug')) {
    window.__fa = {
      get tanks() { return tanks; }, get state() { return state; }, get stats() { return waveStats; }, get shells() { return shells; },
      get time() { return gameTime; }, get player() { return player; }, get bushes() { return bushes; }, get w3d() { return W3D; }, get terra() { return terra; }, get falls3() { return falls3; }, damageObstacle, knockTree, get debris3() { return debris3; }, launchFlare, get flares() { return flares; }, get obstacles() { return obstacles; }, barrelHit, cam3, sight, setSight, sightProbe, get mode() { return mode; }, meta: Meta, medal, takeCommand, get survWave() { return survWave; }, dyn, hitcam: HitCam, TYPES, SHELLS, bench, benchFire,
      // test : tir forcé du joueur sur la cible la plus proche
      fireAt(i, key) {
        const e = tanks.filter(t => t.team === 1 && !t.dead)[i || 0];
        if (!e) return false;
        player.shell = key || player.shell; player.ammo[player.shell] = 9;
        const pv = pivot(player);
        player.turret = angNorm(Math.atan2(e.y - pv.y, e.x - pv.x) - player.angle);
        player.aim3 = { x: e.x, y: e.y, z: e.T.S.ht - 0.3 };
        { const sb = Ballistics.shell(player.T.id, player.shell); player.elev = Math.atan(aimSlope(sb, Math.hypot(e.x - pv.x, e.y - pv.y), player.gz + player.T.S.gun.z, e.gz + e.T.S.ht - 0.3) * PX * RK); }
        player.disp = 0; player.reloadT = 0; fireShell(player);
        return true;
      },
      killPlayer() { destroyTank(player, null, false); },
      // essais des dégâts : incendie, explosion des munitions, abandon, souffle
      dmg: { startFire, cookOff, destroyTank, bail, modDamage, explode, revivePlayer, get runners() { return runners; } },
      // essais de balistique : simulation figée et avancée pas à pas, obus lancé à la main
      freeze(on) { dbgFreeze = on !== false; },
      run(n) { for (let i = 0; i < n; i++) step(STEP); },
      shoot(o) {
        const by = o.by || player, key = o.key || 'APHE', sb = Ballistics.shell(by.T.id, key), V = o.V || sb.v0, pxk = shellPxK();
        const s = { id: ++shellId, x: o.x, y: o.y, vx: 0, vy: 0, sp: V * pxk, pxk, V, team: by.team, owner: by, by, key, sb, v0: sb.v0, dist: o.dist || 0, z: o.z, slope: o.slope || 0, trail: [], ric: 0, yaw: !!o.yaw, whiz: true, warned: false };
        shellAim(s, Math.cos(o.ang), Math.sin(o.ang));
        shells.push(s);
        return s;
      },
      giveOrder, obj: OBJ, get ctl() { return ctl; }, get orders() { return orders; }, get aiSkillK() { return aiSkillK; }, set aiSkillK(k) { aiSkillK = k; }, get form() { return waveForm; }, losClear,
      place(t, x, y, angle, turret) { t.x = x; t.y = y; t.angle = angle; if (turret != null) t.turret = turret; t.vx = t.vy = t.speed = 0; },
      get meta() { return Meta.P; },
      kill(i, det) { const e = tanks.filter(t => t.team === 1 && !t.dead)[i || 0]; if (e) destroyTank(e, player, !!det); return !!e; },
      get bullets() { return bullets; }, get parts() { return parts; },
      w2s: (x, y, z) => worldToScreen(x, y, z), hatchPos, viewer, pick(id) { chosenType = id; buildMenu(); },
      // autotest : des profils anciens ou abîmés doivent toujours donner un menu (profil jetable)
      profileSelfTest() {
        Meta.devProfile();
        const cases = {
          v1: JSON.stringify({ v: 1, credits: 5000, tanks: ['light', 'pz4', 'kingtiger'], skins: ['std', 'tigre'], skinSel: { pz4: 'tigre' }, opts: { sfx: 0.5 } }),
          corrupt: '{"credits":',
          nulls: JSON.stringify({ tanks: null, skins: 7, missions: 'x', opts: null, stats: null, parts: { pz4: null, ghost: { engine: 9 } }, skinSel: { pz4: 'nope' } }),
          unknown: JSON.stringify({ v: 2, tanks: ['tiger3', 'kingtiger'], feat: 'nope', level: 'abc', credits: -50, unlocked: 1e9 }),
          array: '[1,2,3]', nul: 'null',
        };
        const out = {}, ct = chosenType;
        for (const [k, raw] of Object.entries(cases)) {
          try { const p = Meta.parse(raw); Meta.devUse(p); chosenType = 'kingtiger'; buildMenu(); chosenType = 'pz4'; buildMenu(); out[k] = p.tanks.includes('pz4') && Number.isFinite(p.credits) ? 'ok' : 'bad'; } catch (e) { out[k] = String(e); }
        }
        chosenType = ct; Meta.devUse(Meta.parse('')); buildMenu();
        return out;
      },
    };
  }
  requestAnimationFrame(frame);
}).catch(e => {
  // démarrage impossible : message lisible plutôt qu'un écran de chargement sans fin
  console.error(e);
  const t = document.querySelector('#loading .loadtip');
  if (t) t.textContent = 'Something went wrong while loading. Please reload the page.';
  Meta.sdk.loadingStop();
});
