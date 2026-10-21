'use strict';
// Front d'Acier : combat de chars 5 contre 5, vue de dessus.
(() => {
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
  // Renvoie l'instant d'entrée t ∈ [0,1] et la normale de la face touchée.
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
      return { t: 0, nx: -dx / l, ny: -dy / l, inside: true };
    }
    return { t: tmin, nx, ny };
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
  const PX = 7;    // pixels de jeu par mètre (taille des chars)
  const RK = 0.5;  // mètres de balistique par pixel (distances de tir)
  const TYPES = {
    light: {
      id: 'light', name: 'Lynx', cls: 'Char léger', kmh: 60, speed: 150, rev: 70, accel: 230, turn: 2.3, tturn: 2.6,
      reload: 3.2, shell: 640, disp: 0.016, view: 760, range: 470,
      caliber: 50, obs: 60,
      ammo: { AP: 20, APHE: 30, APCR: 10, HEAT: 6, HE: 20 },
    },
    medium: {
      id: 'medium', name: 'Panthère', cls: 'Char moyen', kmh: 46, speed: 112, rev: 52, accel: 170, turn: 1.6, tturn: 1.4,
      reload: 5.5, shell: 720, disp: 0.011, view: 680, range: 420,
      caliber: 75, obs: 110,
      ammo: { AP: 15, APHE: 35, APCR: 10, HEAT: 5, HE: 15 },
    },
    heavy: {
      id: 'heavy', name: 'Tigre', cls: 'Char lourd', kmh: 38, speed: 80, rev: 38, accel: 115, turn: 1.1, tturn: 1.0,
      reload: 7.0, shell: 680, disp: 0.010, view: 620, range: 330,
      caliber: 88, obs: 150,
      ammo: { AP: 12, APHE: 40, APCR: 8, HEAT: 10, HE: 22 },
    },
    destroyer: {
      id: 'destroyer', name: 'Jagd', cls: 'Chasseur de chars', kmh: 46, speed: 95, rev: 45, accel: 145, turn: 1.4, tturn: 0.9,
      reload: 7.5, shell: 780, disp: 0.007, view: 720, range: 600, arc: 0.21,
      caliber: 88, obs: 160,
      ammo: { AP: 12, APHE: 25, APCR: 10, HEAT: 5, HE: 5 },
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
  }

  const SHELLS = {
    AP: { key: 'AP', n: 1, name: 'Perforant', full: 'Perforant (AP)', pen: 1.0, vel: 1.0, drop: 0.15, ric: 70 },
    APHE: { key: 'APHE', n: 2, name: 'Perf. explosif', full: 'Perforant explosif (APHE)', pen: 0.92, vel: 0.98, drop: 0.15, ric: 70, fuse: 1.2, sens: 15 },
    APCR: { key: 'APCR', n: 3, name: 'Sous-calibré', full: 'Sous-calibré (APCR)', pen: 1.32, vel: 1.25, drop: 0.45, ric: 62 },
    HEAT: { key: 'HEAT', n: 4, name: 'Charge creuse', full: 'Charge creuse (HEAT)', vel: 0.72, drop: 0, ric: 80 },
    HE: { key: 'HE', n: 5, name: 'Explosif', full: 'Explosif (HE)', vel: 0.82, drop: 0, ric: 90 },
  };
  const SHELL_KEYS = ['AP', 'APHE', 'APCR', 'HEAT', 'HE'];
  // Pénétration à une distance donnée (pixels de jeu), selon la balistique réelle
  const penAt = (T, key, dpx) => Ballistics.penAt(T.id, key, dpx * RK);


  const TEAM = [
    { accent: '#4aa3ff', label: 'Allié', camo: [[0.33, 0.36, 0.22], [0.20, 0.25, 0.15], [0.36, 0.27, 0.17]], hull: '#56663a', top: '#66794a', dark: '#3d4a28' },
    { accent: '#ff4a3d', label: 'Ennemi', camo: [[0.62, 0.55, 0.36], [0.40, 0.22, 0.15], [0.25, 0.30, 0.18]], hull: '#8a7d55', top: '#9a8d62', dark: '#5a4f35' },
  ];

  const W_ = (a, b, c, d, e) => [a, b, c, d, e];
  const LEVELS = [
    {
      name: 'Plaine de Koursk', sub: 'Steppe d’été, grands espaces',
      ground: ['#7b8446', '#6c763b', '#8a9352'], road: '#8d7d58', dust: '#a59a6a', track: 'rgba(40,35,20,0.16)',
      trees: 45, treeCl: 6, bushes: 34, buildings: 6, walls: 9, rocks: 8,
      tree: ['#36521f', '#4a6a2b'], bush: '#4c6b2a', wall: '#a59a86', roof: ['#8a4f3a', '#73402f'],
      waves: [W_('light', 'light', 'medium', 'light', 'medium'), W_('medium', 'light', 'medium', 'medium', 'light'), W_('medium', 'medium', 'heavy', 'light', 'medium')],
    },
    {
      name: 'Forêt des Ardennes', sub: 'Sous-bois denses, combats rapprochés',
      ground: ['#4c5c30', '#425228', '#58693a'], road: '#6d5d3f', dust: '#6b6a48', track: 'rgba(25,25,10,0.2)',
      trees: 150, treeCl: 14, bushes: 70, buildings: 3, walls: 4, rocks: 10,
      tree: ['#24401a', '#335726'], bush: '#3a5a22', wall: '#8f8a7a', roof: ['#5a4a3a', '#4a3c30'],
      waves: [W_('medium', 'light', 'medium', 'light', 'medium'), W_('medium', 'medium', 'heavy', 'light', 'destroyer'), W_('heavy', 'medium', 'medium', 'destroyer', 'light')],
    },
    {
      name: 'Ruines de Stalingrad', sub: 'Rues en ruines, bâtiments destructibles', city: true,
      ground: ['#6d665c', '#615a51', '#79726a'], road: '#55504a', dust: '#8a8378', track: 'rgba(20,18,15,0.18)',
      trees: 8, treeCl: 2, bushes: 10, buildings: 0, walls: 12, rocks: 4,
      tree: ['#3c4a2a', '#4a5a34'], bush: '#4a5530', wall: '#8f877b', roof: ['#7a7268', '#686057'],
      waves: [W_('medium', 'heavy', 'medium', 'light', 'medium'), W_('heavy', 'medium', 'destroyer', 'medium', 'heavy'), W_('heavy', 'heavy', 'destroyer', 'medium', 'medium')],
    },
    {
      name: "Désert d'El Alamein", sub: 'Terrain ouvert, tirs à longue portée',
      ground: ['#cdb27a', '#c1a46b', '#d9c08c'], road: '#b39463', dust: '#dcc391', track: 'rgba(90,60,30,0.16)',
      trees: 0, treeCl: 1, bushes: 16, buildings: 5, walls: 5, rocks: 36,
      tree: ['#5a6a2a', '#6a7a3a'], bush: '#8c8a4a', wall: '#d8c7a0', roof: ['#e0d2ad', '#cdbd96'],
      waves: [W_('destroyer', 'medium', 'light', 'destroyer', 'medium'), W_('heavy', 'destroyer', 'medium', 'destroyer', 'light'), W_('heavy', 'heavy', 'destroyer', 'destroyer', 'medium')],
    },
    {
      name: 'Nuit de Bastogne', sub: 'Neige et obscurité, vision réduite', night: true,
      ground: ['#dfe4e8', '#cfd6dc', '#eaeef1'], road: '#b9b3a8', dust: '#ffffff', track: 'rgba(60,60,70,0.22)',
      trees: 95, treeCl: 10, bushes: 34, buildings: 8, walls: 6, rocks: 6,
      tree: ['#203828', '#2c4a36'], bush: '#3c5a46', wall: '#9a958c', roof: ['#eef3f6', '#d8e0e6'], snow: true,
      waves: [W_('medium', 'heavy', 'medium', 'light', 'heavy'), W_('heavy', 'heavy', 'destroyer', 'medium', 'medium'), W_('heavy', 'heavy', 'heavy', 'destroyer', 'destroyer')],
    },
  ];
  const WAVES = 3;
  const WW = 2600, WH = 1700, CELL = 20, STEP = 1 / 60;

  // Réglages de développement : ?auto ?god ?speed=4 ?level=2 ?wave=1 ?type=heavy
  const Q = new URLSearchParams(location.search);
  const AUTO = Q.has('auto'), GOD = Q.has('god');
  const timeScale = Number(Q.get('speed')) || 1;

  // ===================== État =====================
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');
  let W = 0, H = 0, DPR = 1, S = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    dark.width = cv.width; dark.height = cv.height;
    S = clamp(Math.min(W / 1200, H / 740), 0.5, 1.6);
  }
  addEventListener('resize', resize);
  resize();

  let state = 'menu'; // menu, intro, play, ending, result, pause
  let levelIdx = 0, waveIdx = 0, chosenType = 'medium';
  let tanks = [], shells = [], parts = [], texts = [], feed = [], smokes = [], logs = [];
  let obstacles = [], bushes = [];
  let player = null, specIdx = 0;
  let camX = WW / 2, camY = WH / 2, shake = 0;
  const spotted = [new Set(), new Set()];
  let spotTimer = 0, waveTime = 0, introT = 0, endT = 0, waveResult = null, gameTime = 0;
  let groundCv = null, gctx = null;
  let waveStats = null, campaignScore = 0, msg = null, ffMsgT = 0;
  let tankId = 0, shellId = 0, hitcamOn = true;
  const mouse = { x: W / 2, y: H / 2, down: false };
  const keys = {};

  let unlocked = 0;
  try { unlocked = Number(localStorage.getItem('frontdacier.unlocked')) || 0; } catch (e) { /* stockage indisponible */ }
  function saveUnlocked() { try { localStorage.setItem('frontdacier.unlocked', String(unlocked)); } catch (e) { /* ignoré */ } }

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
    } catch (e) { console.warn('Rendu 3D désactivé', e); R3 = null; }
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
    const spawnA = { x: 0, y: WH / 2 - 420, w: 460, h: 840 };
    const spawnB = { x: WW - 460, y: WH / 2 - 420, w: 460, h: 840 };
    const free = (r, m) => {
      if (r.x < 20 || r.y < 20 || r.x + r.w > WW - 20 || r.y + r.h > WH - 20) return false;
      if (rectOverlap(r, spawnA, 0) || rectOverlap(r, spawnB, 0)) return false;
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
      for (let k = 0; k < n; k++) bushes.push({ x: cx + rr(-30, 30), y: cy + rr(-20, 20), r: rr(22, 38) });
    }
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
    gctx.strokeStyle = lv.road; gctx.lineCap = 'round';
    if (lv.city) {
      gctx.globalAlpha = 0.7;
      gctx.lineWidth = 80;
      for (let x = 480 - 50; x < WW; x += 330) { gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, WH); gctx.stroke(); }
      for (let y = 60 - 50; y < WH; y += 330) { gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(WW, y); gctx.stroke(); }
      gctx.globalAlpha = 1;
    } else {
      gctx.globalAlpha = 0.55; gctx.lineWidth = 46;
      for (let k = 0; k < 2; k++) {
        gctx.beginPath();
        let y = WH * (0.3 + k * 0.4) + (R() - 0.5) * 200;
        gctx.moveTo(-20, y);
        for (let x = 0; x <= WW + 200; x += 200) { y += (R() - 0.5) * 160; y = clamp(y, 120, WH - 120); gctx.lineTo(x, y); }
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
    if (lv.name.startsWith('Désert')) {
      gctx.strokeStyle = 'rgba(150,110,60,0.15)'; gctx.lineWidth = 3;
      for (let i = 0; i < 160; i++) {
        const x = R() * WW, y = R() * WH;
        gctx.beginPath(); gctx.moveTo(x, y); gctx.quadraticCurveTo(x + 60, y - 18, x + 130, y + 4); gctx.stroke();
      }
    }
    for (const o of obstacles) {
      if (o.type === 'tree' || W3D) continue;
      gctx.fillStyle = 'rgba(0,0,0,0.22)';
      gctx.fillRect(o.x + 6, o.y + 7, o.w, o.h);
    }
  }

  // ===================== Grille de navigation =====================
  let grid = null, GC = 0, GR = 0;
  function buildGrid() {
    GC = Math.ceil(WW / CELL); GR = Math.ceil(WH / CELL);
    grid = new Uint8Array(GC * GR);
    for (const o of obstacles) markGrid(o);
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
    if (grid[i] !== 1) return i;
    const c = i % GC, r = (i / GC) | 0;
    for (let d = 1; d < 20; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        const cc = c + dx, rr = r + dy;
        if (cc < 0 || rr < 0 || cc >= GC || rr >= GR) continue;
        const j = rr * GC + cc;
        if (grid[j] !== 1) return j;
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
        if (grid[ni] === 1 || closedId[ni] === searchId) continue;
        if (dx && dy && (grid[r * GC + nc] === 1 || grid[nr * GC + c] === 1)) continue;
        const cost = (dx && dy ? 1.414 : 1) * (grid[ni] === 2 ? 2.5 : 1);
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
      if (grid[cellOf(x, y)] === 1) return false;
    }
    return true;
  }

  // ===================== Chars et équipage =====================
  function makeAI(skill) {
    return {
      skill, aimStd: 0.05 * (1 - skill) + 0.006, lead: 0.3 + 0.7 * skill, dodge: 0.12 + skill * 0.68,
      react: 1.1 - 0.75 * skill, careless: Math.random() < (1 - skill) * 0.35,
      target: null, los: false, lastKnown: null, dest: null, path: null, pi: 0, pathT: 0, pathDest: null,
      thinkT: Math.random() * 0.3, reactT: 0, aimErr: gauss() * 0.04, dodgeT: 0, dodgeDir: 0, seen: new Set(),
      stuckT: 0, unstickT: 0, unstickDir: -1, unstickTurn: 1, wiggleT: 0, wig: 1, laneY: WH / 2,
      angleOff: (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.45), retreatT: 0, waitT: 0, noContactT: 0, pushT: 0,
    };
  }
  function makeTank(typeId, team, x, y, angle, isPlayer, name, skill) {
    const T = TYPES[typeId];
    const mods = TankModels.makeModules(typeId);
    const roles = {};
    mods.forEach((m, i) => { if (m.kind === 'crew') roles[m.role] = i; });
    return {
      id: ++tankId, T, team, x, y, angle, turret: 0, speed: 0, turnRate: 0, turretRate: 0, vx: 0, vy: 0,
      dead: false, deadT: 0, isPlayer, name, r: (T.len + T.wid) / 4,
      mods, roles, swap: null, rep: {}, ammo: Object.assign({}, T.ammo), shell: 'APHE',
      reloadT: rnd(0.8, 1.6), disp: T.disp * 3, smoke: 2, trackT: 0, fireT: 0, fireBy: null,
      revealT: 0, recoil: 0, flash: 0, trackAcc: 0, treadPhase: 0, hitFlash: 0, turretGone: false,
      in: { throttle: 0, turn: 0, aim: angle, fire: false },
      ai: (isPlayer && !AUTO) ? null : makeAI(skill),
    };
  }
  function pivot(t) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    return { x: t.x + c * t.T.pivX - s * t.T.pivY, y: t.y + s * t.T.pivX + c * t.T.pivY };
  }
  function crewAlive(t) { let n = 0; for (const m of t.mods) if (m.kind === 'crew' && m.hp > 0) n++; return n; }
  const crewFrac = t => crewAlive(t) / t.T.crewN;
  function roleOk(t, r) { const i = t.roles[r]; return i != null && i >= 0 && t.mods[i].hp > 0; }
  function modOk(t, kind) { for (const m of t.mods) if (m.kind === kind && m.hp <= 0) return false; return true; }
  const modOf = (t, kind) => t.mods.find(m => m.kind === kind);
  function ammoFrac(t) {
    let a = 0, b = 0;
    for (const k of SHELL_KEYS) { a += t.ammo[k]; b += t.T.ammo[k]; }
    return b ? a / b : 0;
  }
  const canFire = t => roleOk(t, 'gunner') && modOk(t, 'breech') && t.ammo[t.shell] > 0;
  function reloadMul(t) {
    if (t.T.S.crew.includes('loader')) return roleOk(t, 'loader') ? 1 : 2.2;
    return roleOk(t, 'commander') ? 1 : 1.6;
  }
  function nextShell(t, pref) {
    for (const k of [pref, 'APHE', 'AP', 'APCR', 'HEAT', 'HE']) if (k && t.ammo[k] > 0) return k;
    return t.shell;
  }

  function spawnWave() {
    tanks = []; shells = []; smokes = []; texts = []; feed = []; parts = []; logs = [];
    spotted[0].clear(); spotted[1].clear();
    HitCam.stop();
    const lv = L();
    const allyTypes = levelIdx < 2 ? ['medium', 'light', 'medium', 'heavy'] : ['medium', 'heavy', 'destroyer', 'light'];
    const enemyTypes = lv.waves[waveIdx];
    const eSkill = Math.min(0.95, 0.3 + levelIdx * 0.14 + waveIdx * 0.04);
    const aSkill = Math.min(0.7, 0.5 + levelIdx * 0.05);
    const slots = [-300, -150, 0, 150, 300];
    const aT = [allyTypes[0], allyTypes[1], chosenType, allyTypes[2], allyTypes[3]];
    let n = 1;
    for (let i = 0; i < 5; i++) {
      const isP = i === 2;
      const t = makeTank(aT[i], 0, 200 + (i % 2) * 60, WH / 2 + slots[i], 0, isP, isP ? 'Vous' : 'Allié ' + (n++), aSkill);
      if (t.ai) t.ai.laneY = clamp(t.y + rnd(-150, 150), 150, WH - 150);
      tanks.push(t);
      if (isP) player = t;
    }
    for (let i = 0; i < 5; i++) {
      const t = makeTank(enemyTypes[i], 1, WW - 200 - (i % 2) * 60, WH / 2 + slots[i], Math.PI, false, 'Ennemi ' + (i + 1), eSkill);
      t.ai.laneY = clamp(t.y + rnd(-200, 200), 150, WH - 150);
      tanks.push(t);
    }
    camX = player.x + 300; camY = player.y;
    specIdx = 0;
    waveStats = { kills: 0, pens: 0, crew: 0, mods: 0, ffCrew: 0, tk: 0, hits: 0, shots: 0, ric: 0, dodged: 0 };
    state = 'intro'; introT = 3.2; waveTime = 0;
    msg = null;
  }

  // ===================== Visibilité =====================
  function inBush(t) {
    for (const b of bushes) if (Math.hypot(t.x - b.x, t.y - b.y) < b.r * 0.85) return true;
    return false;
  }
  function losClear(x0, y0, x1, y1, vision) {
    const dx = x1 - x0, dy = y1 - y0;
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    for (const o of obstacles) {
      if (o.dead) continue;
      if (o.x > maxx || o.x + o.w < minx || o.y > maxy || o.y + o.h < miny) continue;
      const h = segAABB(x0, y0, dx, dy, o.x, o.y, o.x + o.w, o.y + o.h);
      if (h && h.t < 1) return false;
    }
    if (vision) {
      for (const s of smokes) {
        const l2 = dx * dx + dy * dy || 1;
        const k = clamp(((s.x - x0) * dx + (s.y - y0) * dy) / l2, 0, 1);
        if (Math.hypot(x0 + dx * k - s.x, y0 + dy * k - s.y) < s.r * 0.8) return false;
      }
    }
    return true;
  }
  function updateSpotting() {
    const night = !!L().night;
    for (let team = 0; team < 2; team++) {
      const set = spotted[team];
      set.clear();
      for (const e of tanks) {
        if (e.dead || e.team === team) continue;
        const bush = e.revealT <= 0 && inBush(e);
        for (const a of tanks) {
          if (a.dead || a.team !== team) continue;
          const d = dist(a, e);
          if (d < 90 || waveTime > 120) { set.add(e); break; } // après 2 min, l'artillerie trahit les positions
          let range = a.T.view * (night ? 0.6 : 1) * (roleOk(a, 'commander') ? 1 : 0.75);
          if (bush) range = Math.min(range, 210);
          if (e.revealT > 0) range *= 1.3;
          if (d < range && losClear(a.x, a.y, e.x, e.y, true)) { set.add(e); break; }
        }
      }
    }
  }

  // ===================== IA =====================
  function wreckClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    for (const w of tanks) {
      if (!w.dead) continue;
      const k = clamp(((w.x - a.x) * dx + (w.y - a.y) * dy) / l2, 0, 1);
      if (k <= 0 || k >= 1) continue;
      if (Math.hypot(a.x + dx * k - w.x, a.y + dy * k - w.y) < w.r * 0.9) return false;
    }
    return true;
  }
  function friendlyClear(t, aim, d) {
    const pv = pivot(t), ux = Math.cos(aim), uy = Math.sin(aim);
    for (const a of tanks) {
      if (a === t || a.dead || a.team !== t.team) continue;
      const rx = a.x - pv.x, ry = a.y - pv.y;
      const along = rx * ux + ry * uy;
      if (along < 0 || along > d + 30) continue;
      if (Math.abs(rx * -uy + ry * ux) < a.r + 14) return false;
    }
    return true;
  }
  // Choix de l'obus selon le blindage frontal de la cible
  function aiShell(t, e, d) {
    const up = e.T.S.armor.hull.up;
    const need = k => Ballistics.effective(Ballistics.shell(t.T.id, k), up[0], Math.min(80, up[1] + 10)).eff;
    if (t.ammo[t.shell] > 0 && penAt(t.T, t.shell, d) >= need(t.shell)) return t.shell;
    for (const k of ['APHE', 'AP', 'APCR', 'HEAT']) if (t.ammo[k] > 0 && penAt(t.T, k, d) >= need(k)) return k;
    let best = t.shell, bp = -1;
    for (const k of ['APCR', 'AP', 'APHE', 'HEAT']) { const p = penAt(t.T, k, d) / need(k); if (t.ammo[k] > 0 && p > bp) { bp = p; best = k; } }
    return best;
  }


  function aiThink(t, dt) {
    const ai = t.ai, T = t.T;
    ai.thinkT -= dt; ai.reactT -= dt; ai.dodgeT -= dt; ai.unstickT -= dt; ai.retreatT -= dt; ai.pathT -= dt; ai.pushT -= dt;
    if (ai.waitT > 5) { ai.waitT = 0; ai.pushT = 3; } // impossible de tirer d'ici : on se rapproche
    const seen = spotted[t.team];
    if (ai.thinkT <= 0) {
      ai.thinkT = rnd(0.25, 0.45);
      let best = null, bs = 1e9, bestLos = false;
      for (const e of seen) {
        if (e.dead) continue;
        const d = dist(t, e);
        const los = losClear(t.x, t.y, e.x, e.y, false) && wreckClear(t, e);
        const sc = d * (los ? 1 : 1.7) * (crewFrac(e) < 0.5 ? 0.8 : 1);
        if (sc < bs) { bs = sc; best = e; bestLos = los; }
      }
      if (best && best !== ai.target) {
        ai.reactT = ai.react * rnd(0.6, 1.3);
        const k = aiShell(t, best, dist(t, best));
        if (k !== t.shell) { t.shell = k; t.reloadT = Math.max(t.reloadT, T.reload * 0.6); }
      }
      ai.target = best; ai.los = bestLos;
      if (best) { ai.lastKnown = { x: best.x, y: best.y }; ai.noContactT = 0; }
      else {
        ai.noContactT += 0.35;
        if (ai.noContactT > 20) {
          ai.noContactT = 0;
          const foes = tanks.filter(e => !e.dead && e.team !== t.team);
          if (foes.length) {
            const e = foes[Math.floor(Math.random() * foes.length)];
            ai.lastKnown = { x: clamp(e.x + rnd(-150, 150), 60, WW - 60), y: clamp(e.y + rnd(-150, 150), 60, WH - 60) };
          }
        }
      }

      let dest = null;
      const range = T.range * (crewFrac(t) < 0.6 ? 1.3 : 1);
      if (ai.retreatT > 0) dest = { x: t.team === 0 ? 160 : WW - 160, y: t.y };
      else if (best && ai.pushT > 0) dest = { x: best.x, y: best.y };
      else if (best) {
        const d = dist(t, best);
        if (ai.los && d < range * 1.25 && d > range * 0.5) dest = null;
        else if (ai.los && d <= range * 0.5) {
          const a = Math.atan2(t.y - best.y, t.x - best.x);
          dest = { x: clamp(t.x + Math.cos(a) * 160, 60, WW - 60), y: clamp(t.y + Math.sin(a) * 160, 60, WH - 60) };
        } else dest = { x: best.x, y: best.y };
      } else if (ai.lastKnown) {
        dest = ai.lastKnown;
        if (dist(t, dest) < 90) ai.lastKnown = null;
      } else {
        dest = { x: t.team === 0 ? WW - 260 : 260, y: ai.laneY };
        if (Math.abs(t.x - dest.x) < 200) ai.laneY = rnd(150, WH - 150);
      }
      ai.dest = dest;
      if (dest) {
        if (!ai.path || ai.pathT <= 0 || !ai.pathDest || Math.hypot(ai.pathDest.x - dest.x, ai.pathDest.y - dest.y) > 60) {
          ai.path = findPath(t.x, t.y, dest.x, dest.y); ai.pi = 0; ai.pathDest = { x: dest.x, y: dest.y }; ai.pathT = 2.5;
        }
      } else ai.path = null;

      if (t.smoke > 0 && best && ai.los && crewFrac(t) < 0.6 && Math.random() < 0.4) { deploySmoke(t); ai.retreatT = 5; }
    }

    // Esquive des obus qui arrivent
    if (ai.dodgeT <= 0) {
      for (const s of shells) {
        if (s.owner === t || ai.seen.has(s.id)) continue;
        const rx = t.x - s.x, ry = t.y - s.y, ux = s.vx / s.sp, uy = s.vy / s.sp;
        const along = rx * ux + ry * uy;
        if (along < 0) continue;
        const tt = along / s.sp;
        if (tt > 1.1) continue;
        const perp = rx * -uy + ry * ux;
        if (Math.abs(perp) > T.len * 0.5 + 8) continue;
        ai.seen.add(s.id);
        if (tt < 0.12 || Math.random() > ai.dodge) continue;
        const sg = perp >= 0 ? 1 : -1;
        const nx = -uy * sg, ny = ux * sg;
        const f = Math.cos(t.angle) * nx + Math.sin(t.angle) * ny;
        if (Math.abs(f) < 0.35) continue; // obus de face : on compte sur le blindage
        ai.dodgeT = rnd(0.5, 0.8); ai.dodgeDir = f > 0 ? 1 : -1;
        break;
      }
      if (ai.seen.size > 80) ai.seen.clear();
    }

    let thr = 0, turn = 0;
    if (ai.dodgeT > 0) thr = ai.dodgeDir;
    else if (ai.unstickT > 0) { thr = ai.unstickDir; turn = ai.unstickTurn; }
    else if (ai.path && ai.pi < ai.path.length) {
      let wp = ai.path[ai.pi];
      if (Math.hypot(wp.x - t.x, wp.y - t.y) < 28) { ai.pi++; wp = ai.path[ai.pi]; }
      if (wp) {
        const des = Math.atan2(wp.y - t.y, wp.x - t.x);
        let df = angNorm(des - t.angle);
        if (Math.abs(df) > 2.4 && Math.hypot(wp.x - t.x, wp.y - t.y) < 160) {
          df = angNorm(des + Math.PI - t.angle);
          turn = clamp(df * 3, -1, 1); thr = Math.abs(df) < 0.8 ? -1 : -0.2;
        } else {
          turn = clamp(df * 3, -1, 1);
          thr = Math.abs(df) < 0.7 ? 1 : Math.abs(df) < 1.4 ? 0.4 : 0;
        }
      }
    } else if (ai.target && !ai.target.dead) {
      const off = T.arc || T.id === 'light' ? 0 : ai.angleOff;
      const des = Math.atan2(ai.target.y - t.y, ai.target.x - t.x) + off;
      const df = angNorm(des - t.angle);
      turn = Math.abs(df) > 0.04 ? clamp(df * 3, -1, 1) : 0;
      if (T.id === 'light' || T.id === 'medium' && ai.skill > 0.6) {
        ai.wiggleT -= dt;
        if (ai.wiggleT <= 0) { ai.wiggleT = rnd(0.8, 2); ai.wig = -ai.wig; }
        thr = ai.wig * (T.id === 'light' ? 0.8 : 0.5);
      }
    }
    if (Math.abs(thr) > 0.3 && Math.hypot(t.vx, t.vy) < 6 && ai.unstickT <= 0 && t.trackT <= 0 && roleOk(t, 'driver') && modOk(t, 'engine') && modOk(t, 'trans')) {
      ai.stuckT += dt;
      if (ai.stuckT > 0.8) {
        ai.stuckT = 0; ai.unstickT = 0.9; ai.unstickDir = thr > 0 ? -1 : 1;
        ai.unstickTurn = Math.random() < 0.5 ? -1 : 1; ai.pathT = 0;
      }
    } else ai.stuckT = Math.max(0, ai.stuckT - dt);

    // Visée avec anticipation et erreur
    let aim = t.angle + t.turret, fire = false;
    const tg = ai.target;
    if (tg && !tg.dead) {
      const pv = pivot(t);
      const d = Math.hypot(tg.x - pv.x, tg.y - pv.y);
      const tt = d / (T.shell * SHELLS[t.shell].vel);
      const px = tg.x + tg.vx * tt * ai.lead, py = tg.y + tg.vy * tt * ai.lead;
      aim = Math.atan2(py - pv.y, px - pv.x) + ai.aimErr;
      if (ai.los && ai.reactT <= 0 && t.reloadT <= 0 && seen.has(tg) && canFire(t)) {
        ai.waitT += dt;
        const err = Math.abs(angNorm(t.angle + t.turret - aim));
        const steady = t.disp < T.disp * (2.6 - ai.skill) || d < 300 || ai.waitT > 2;
        if (err < Math.max(0.012, 9 / d) && steady && (ai.careless || friendlyClear(t, aim, d))) {
          fire = true; ai.waitT = 0;
          ai.aimErr = gauss() * ai.aimStd * (0.6 + d / 700);
        }
      }
    } else if (ai.path) aim = t.angle;
    t.in.throttle = thr; t.in.turn = turn; t.in.aim = aim; t.in.fire = fire;
  }

  // ===================== Simulation des chars =====================
  function collideObstacles(t) {
    for (const o of obstacles) {
      if (o.dead) continue;
      if (t.x + t.r < o.x || t.x - t.r > o.x + o.w || t.y + t.r < o.y || t.y - t.r > o.y + o.h) continue;
      const cx = clamp(t.x, o.x, o.x + o.w), cy = clamp(t.y, o.y, o.y + o.h);
      const dx = t.x - cx, dy = t.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= t.r * t.r) continue;
      if (o.type === 'tree' && Math.abs(t.speed) > 22) { knockTree(o, t.angle); t.speed *= 0.7; continue; }
      if (d2 < 1e-6) {
        const l = t.x - o.x, r = o.x + o.w - t.x, u = t.y - o.y, b = o.y + o.h - t.y;
        const m = Math.min(l, r, u, b);
        if (m === l) t.x = o.x - t.r; else if (m === r) t.x = o.x + o.w + t.r;
        else if (m === u) t.y = o.y - t.r; else t.y = o.y + o.h + t.r;
      } else {
        const d = Math.sqrt(d2), p = t.r - d;
        t.x += dx / d * p; t.y += dy / d * p;
      }
    }
  }
  function tankCollisions() {
    for (let i = 0; i < tanks.length; i++) {
      const a = tanks[i];
      for (let j = i + 1; j < tanks.length; j++) {
        const b = tanks[j];
        if (a.dead && b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d >= m || d < 1e-6) continue;
        const p = m - d, nx = dx / d, ny = dy / d;
        const ma = a.T.S.L * a.T.S.W, mb = b.T.S.L * b.T.S.W;
        let wa = mb / (ma + mb), wb = 1 - wa;
        if (a.dead) { wa = 0; wb = 1; } else if (b.dead) { wa = 1; wb = 0; }
        a.x -= nx * p * wa; a.y -= ny * p * wa;
        b.x += nx * p * wb; b.y += ny * p * wb;
      }
    }
  }

  // Remplacements d'équipage, réparations, incendie
  function crewLogic(t, dt) {
    for (const role of ['driver', 'gunner']) {
      if (roleOk(t, role) || t.swap) continue;
      const cand = ['radio', 'loader', 'commander'].find(r => r !== role && roleOk(t, r));
      if (cand) t.swap = { role, from: cand, t: 5 };
    }
    if (t.swap) {
      t.swap.t -= dt;
      if (t.swap.t <= 0) {
        const s = t.swap; t.swap = null;
        if (roleOk(t, s.from) && !roleOk(t, s.role)) {
          t.roles[s.role] = t.roles[s.from]; t.roles[s.from] = -1;
          if (t === player) addLog(`${TankModels.NAMES[s.from]} prend le poste de ${TankModels.NAMES[s.role].toLowerCase()}`, '#bcd8ff');
        }
      }
    }
    const REP = { engine: 22, trans: 18, breech: 14 };
    for (const kind of ['engine', 'trans', 'breech']) {
      const m = modOf(t, kind);
      if (!m || m.hp > 0) continue;
      if (t.rep[kind] == null) t.rep[kind] = REP[kind];
      t.rep[kind] -= dt * (crewAlive(t) >= 3 ? 1 : 0.6);
      if (t.rep[kind] <= 0) {
        m.hp = m.max0 * 0.5; delete t.rep[kind];
        if (t === player) addLog(`${m.name} réparé`, '#a6f08a');
      }
    }
    if (t.fireT > 0) {
      t.fireT -= dt;
      const crew = t.mods.filter(m => m.kind === 'crew' && m.hp > 0);
      if (crew.length) modDamage(t, crew[Math.floor(Math.random() * crew.length)], 11 * dt, t.fireBy);
      const eng = modOf(t, 'engine');
      if (eng.hp > 0) modDamage(t, eng, 5 * dt, t.fireBy);
      if (Math.random() < 30 * dt) addFire(t.x + rnd(-10, 10), t.y + rnd(-8, 8));
      if (Math.random() < dt * 0.012) { if (t === player) addLog('Les munitions explosent dans l’incendie !', '#ff6a5a'); destroyTank(t, t.fireBy, true); return; }
      if (t.fireT <= 0 && t === player) addLog('Incendie éteint', '#bcd8ff');
      checkKnock(t, t.fireBy);
    }
  }

  function updateTank(t, dt) {
    if (t.dead) {
      t.deadT += dt;
      if (t.deadT < 30 && Math.random() < dt * (t.deadT < 8 ? 12 : 4)) addSmoke(t.x + rnd(-8, 8), t.y + rnd(-8, 8), rnd(8, 14), 'rgba(30,28,26,', 3.5);
      if (t.deadT < 7 && Math.random() < dt * 22) addFire(t.x + rnd(-10, 10), t.y + rnd(-8, 8));
      return;
    }
    crewLogic(t, dt);
    if (t.dead) return;
    const T = t.T, inp = t.in;
    let thr = clamp(inp.throttle, -1, 1), turn = clamp(inp.turn, -1, 1);
    if (t.trackT > 0) t.trackT -= dt;
    const canDrive = roleOk(t, 'driver') && modOk(t, 'engine') && modOk(t, 'trans') && t.trackT <= 0;
    if (!canDrive) { thr = 0; turn = 0; }
    const eng = modOf(t, 'engine'), engK = eng.hp < eng.max0 * 0.5 ? 0.6 : 1;
    const target = thr >= 0 ? thr * T.speed * engK : thr * T.rev * engK;
    const braking = target === 0 || (t.speed !== 0 && Math.sign(target) !== Math.sign(t.speed));
    const maxd = T.accel * (braking ? 2.2 : 1) * dt;
    t.speed += clamp(target - t.speed, -maxd, maxd);
    const tr = turn * T.turn * engK * (1 - 0.3 * Math.abs(t.speed) / T.speed);
    t.turnRate = tr;
    t.angle = angNorm(t.angle + tr * dt);
    const ox = t.x, oy = t.y;
    t.x += Math.cos(t.angle) * t.speed * dt;
    t.y += Math.sin(t.angle) * t.speed * dt;
    collideObstacles(t);
    t.x = clamp(t.x, t.r, WW - t.r); t.y = clamp(t.y, t.r, WH - t.r);
    const moved = Math.hypot(t.x - ox, t.y - oy);
    t.vx = (t.x - ox) / dt; t.vy = (t.y - oy) / dt;
    t.treadPhase += t.speed * dt;
    t.trackAcc += moved + Math.abs(tr) * 40 * dt;
    if (t.trackAcc > 9) { t.trackAcc = 0; stampTracks(t); }
    if (moved > 0.6 && Math.random() < dt * Math.abs(t.speed) / 14) {
      const c = Math.cos(t.angle), s = Math.sin(t.angle), side = Math.random() < 0.5 ? -1 : 1;
      addDust(t.x - c * T.len * 0.5 - s * side * T.wid * 0.4, t.y - s * T.len * 0.5 + c * side * T.wid * 0.4);
    }

    // Tourelle : vitesse de rotation limitée ; le chasseur n'a qu'un petit secteur de tir
    const desiredRel = angNorm(inp.aim - t.angle);
    let d;
    if (T.arc) d = clamp(desiredRel, -T.arc, T.arc) - t.turret;
    else d = angNorm(desiredRel - t.turret);
    const ts = T.tturn * (roleOk(t, 'gunner') ? 1 : 0) * (t.turretGone ? 0 : 1);
    const rot = clamp(d, -ts * dt, ts * dt);
    t.turret = T.arc ? clamp(t.turret + rot, -T.arc, T.arc) : angNorm(t.turret + rot);
    t.turretRate = rot / dt;

    // Dispersion : elle augmente en mouvement et se resserre à l'arrêt
    const goal = T.disp * (1 + 2.6 * Math.abs(t.speed) / T.speed + 1.6 * Math.abs(tr) / T.turn + 1.1 * Math.abs(t.turretRate) / T.tturn);
    t.disp += (goal - t.disp) * Math.min(1, dt * (goal > t.disp ? 6 : 1.3));

    if (t.reloadT > 0) { t.reloadT -= dt / reloadMul(t); if (t.reloadT <= 0 && t === player) Sfx.reload(); }
    t.recoil = Math.max(0, t.recoil - dt * 3);
    t.flash = Math.max(0, t.flash - dt);
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    t.revealT -= dt;
    if (inp.fire && t.reloadT <= 0 && state === 'play' && canFire(t)) fireShell(t);
  }

  function fireShell(t) {
    const T = t.T, key = t.shell, sh = SHELLS[key];
    const ta = t.angle + t.turret;
    const ang = ta + gauss() * t.disp;
    const pv = pivot(t);
    const mx = pv.x + Math.cos(ta) * T.gunEnd, my = pv.y + Math.sin(ta) * T.gunEnd;
    const sp = T.shell * sh.vel;
    t.ammo[key]--;
    const sb = Ballistics.shell(T.id, key);
    shells.push({
      id: ++shellId, x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, team: t.team, owner: t, by: t,
      key, base: sp, v0: sb.v0, dist: 0, zErr: gauss() * 0.32 * Math.sqrt(t.disp / T.disp), range: 1600, trail: [], ric: 0, whiz: false, warned: false,
    });
    t.reloadT = T.reload;
    t.disp += T.disp * 3;
    t.recoil = 1; t.flash = 0.09; t.revealT = 3;
    t.speed -= 14 * Math.sign(Math.cos(t.turret)) * (T.caliber / 75);
    if (t.ammo[key] <= 0) {
      t.shell = nextShell(t);
      if (t === player) showMsg(`Plus d'obus ${sh.name.toLowerCase()} : ${SHELLS[t.shell].name.toLowerCase()} chargé`, '#e9d9a6', 1.6);
    }
    if (t === player) { waveStats.shots++; shake = Math.max(shake, 5); }
    for (let i = 0; i < 6; i++) addSmoke(mx + Math.cos(ta) * rnd(0, 18), my + Math.sin(ta) * rnd(0, 18), rnd(5, 10), 'rgba(170,165,150,', 1.2, Math.cos(ta) * rnd(20, 60), Math.sin(ta) * rnd(20, 60));
    parts.push({ k: 'flash', x: mx, y: my, life: 0.08, max: 0.08, size: 20 + T.caliber / 4 });
    for (let i = 0; i < 4; i++) addDust(mx + rnd(-10, 10), my + rnd(-10, 10));
    Sfx.fire(listenerDist(mx, my), T.caliber >= 85);
  }

  function deploySmoke(t) {
    if (t.smoke <= 0) return;
    t.smoke--;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
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
      for (const t of tanks) {
        if (t === s.owner || t.x > maxx + 30 || t.x < minx - 30 || t.y > maxy + 30 || t.y < miny - 30) continue;
        const c = Math.cos(t.angle), sn = Math.sin(t.angle);
        const lx = (s.x - t.x) * c + (s.y - t.y) * sn, ly = -(s.x - t.x) * sn + (s.y - t.y) * c;
        const ldx = dx * c + dy * sn, ldy = -dx * sn + dy * c;
        const hl = t.T.len / 2, hw = t.T.wid / 2;
        const hh = segAABB(lx, ly, ldx, ldy, -hl, -hw, hl, hw);
        if (!hh) continue;
        let cand = null;
        if (t.dead) cand = { t: hh.t, part: 'hull', nx: hh.nx, ny: hh.ny, z: 1 };
        else {
          // Hauteur d'impact : le tireur vise le haut de caisse, la dispersion fait le reste
          const Sd = t.T.S, z = clamp(Sd.ht - 0.2 + s.zErr, 0.15, 9);
          if (z <= Sd.ht) cand = { t: hh.t, part: 'hull', nx: hh.nx, ny: hh.ny, z };
          else if (t.T.tb && !t.turretGone && z <= t.T.I.totalH) {
            const tc = Math.cos(t.turret), ts = Math.sin(t.turret);
            const qx = lx - t.T.pivX, qy = ly - t.T.pivY;
            const tx = qx * tc + qy * ts, ty = -qx * ts + qy * tc, tdx = ldx * tc + ldy * ts, tdy = -ldx * ts + ldy * tc;
            const B = t.T.tb, th = segAABB(tx, ty, tdx, tdy, B.x0, B.y0, B.x1, B.y1);
            if (th) cand = { t: th.t, part: 'turret', nx: th.nx, ny: th.ny, z, tx: tx + tdx * th.t, ty: ty + tdy * th.t };
          }
        }
        if (cand && (!best || cand.t < best.t)) {
          best = Object.assign(cand, { tank: t, c, sn, lx: lx + ldx * cand.t, ly: ly + ldy * cand.t, ldx, ldy });
        }
      }
      if (player && !player.dead && s.by !== player && !s.whiz) {
        const rx = player.x - s.x, ry = player.y - s.y, l2 = dx * dx + dy * dy || 1;
        const k = clamp((rx * dx + ry * dy) / l2, 0, 1);
        if (Math.hypot(s.x + dx * k - player.x, s.y + dy * k - player.y) < 75) { s.whiz = true; Sfx.whiz(); }
      }
      s.trail.push(s.x, s.y);
      if (s.trail.length > 16) s.trail.splice(0, 2);
      let remove = false;
      if (best) {
        const hx = s.x + dx * best.t, hy = s.y + dy * best.t;
        s.dist += s.sp * dt * best.t;
        s.x = hx; s.y = hy;
        const res = best.tank ? hitTank(s, best.tank, best, hx, hy) : hitObstacle(s, best.o, best, hx, hy);
        if (res === 'stop') remove = true;
      } else {
        s.x += dx; s.y += dy;
        s.dist += s.sp * dt;
        // la traînée ralentit l'obus : vitesse affichée proportionnelle à la vitesse réelle
        const k = s.base * Ballistics.velAt(Ballistics.shell(s.by.T.id, s.key), s.dist * RK) / s.v0 / s.sp;
        s.vx *= k; s.vy *= k; s.sp *= k;
        s.skipObs = null;
      }
      s.range -= s.sp * dt;
      if (!remove && (s.range <= 0 || s.x < -50 || s.y < -50 || s.x > WW + 50 || s.y > WH + 50)) {
        remove = true;
        if (s.range <= 0) {
          if (s.key === 'HE') explode(s.x, s.y, s, null);
          else { for (let k = 0; k < 5; k++) addDust(s.x + rnd(-6, 6), s.y + rnd(-6, 6)); stampCrater(s.x, s.y, 6); }
        }
      }
      if (remove) {
        if (player && !player.dead && s.by !== player && s.warned && !s.hitPlayer) waveStats.dodged++;
        shells.splice(i, 1);
      }
    }
  }

  function visibleToPlayer(t) { return t.team === 0 || spotted[0].has(t) || t.dead; }

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
    catch (e) { console.warn('Simulation du métal impossible', e); return null; }
  }

  // Normale extérieure d'une plaque (repère de la caisse ou de la tourelle)
  function plateNormal(face, slopeDeg, sideSign, low) {
    const s = slopeDeg * D2R, c = Math.cos(s), n = Math.sin(s);
    if (face === 'front') return [c, 0, low ? -n : n];
    if (face === 'rear') return [-c, 0, n];
    return [0, sideSign * c, n];
  }

  function hitTank(s, t, h, hx, hy) {
    if (t === player) s.hitPlayer = true;
    if (t.dead) {
      sparks(hx, hy, 6);
      if (s.key === 'HE') explode(hx, hy, s, null);
      Sfx.clang(listenerDist(hx, hy));
      return 'stop';
    }
    const T = t.T, Sd = T.S, A = Sd.armor, by = s.by;
    const sb = Ballistics.shell(by.T.id, s.key);
    const show = visibleToPlayer(t) || by === player;
    if (t.ai && by && by.team !== t.team && !t.ai.target) t.ai.lastKnown = { x: by.x, y: by.y };
    if (by === player) waveStats.hits++;

    // Géométrie 3D de l'impact (repère du modèle : y vers la gauche)
    const ll = Math.hypot(h.ldx, h.ldy) || 1;
    const d = norm3([h.ldx / ll, -h.ldy / ll, -0.02]);
    const E = [h.lx / PX, -h.ly / PX, h.z];
    const tAng = -t.turret;
    const face = h.nx > 0.5 ? 'front' : h.nx < -0.5 ? 'rear' : 'side';
    const sideSign = h.ny > 0 ? -1 : 1;
    let plate, mm, slope, dd = d, low = false, extra = 0, heatK = 1, trackHit = false;
    if (h.part === 'hull') {
      if (face === 'front') {
        low = h.z < Sd.zn;
        [mm, slope] = low ? A.hull.low : A.hull.up;
        plate = low ? 'Caisse avant (bas)' : 'Caisse avant (haut)';
      } else if (face === 'rear') { [mm, slope] = A.hull.rear; plate = 'Arrière de caisse'; }
      else {
        [mm, slope] = A.hull.side; plate = 'Flanc de caisse';
        if (h.z < Sd.tt) {
          if (Sd.skirts && h.z > Sd.tt - 0.5) { plate = 'Jupe + flanc'; if (s.key === 'HEAT') heatK = 0.5; else extra = 5; }
          else { plate = 'Chenille + flanc'; extra = 20; trackHit = true; }
        }
      }
    } else {
      dd = rotZ(d, -tAng);
      const ty = -h.ty / PX;
      if (face === 'front') {
        const M = Sd.turret.mantlet, mw = M.w || 0.3, mh = M.h || M.r;
        if (Math.abs(ty) < mw + 0.05 && Math.abs(h.z - Sd.gun.z) < mh + 0.05) { mm = A.turret.mantlet[0]; slope = Math.round(rnd(0, 30)); plate = 'Masque de canon'; }
        else { [mm, slope] = A.turret.front; plate = 'Tourelle avant'; }
      } else if (face === 'rear') { [mm, slope] = A.turret.rear; plate = 'Arrière de tourelle'; }
      else { [mm, slope] = A.turret.side; plate = 'Flanc de tourelle'; }
    }
    const n = plateNormal(face, slope, sideSign, low);
    const nHull = h.part === 'turret' ? rotZ(n, tAng) : n;
    const cosI = Math.max(0.03, -dot3(dd, n));
    const angle = Math.acos(Math.min(1, cosI)) / D2R;
    // Balistique : vitesse à cette distance, épaisseur effective, perforation
    const xm = s.dist * RK;
    const V = Ballistics.velAt(sb, xm);
    const ef = Ballistics.effective(sb, mm, angle);
    const eff = ef.eff + extra;
    const pen = Ballistics.penVel(sb, V) * rnd(0.95, 1.05) * heatK;
    const ricP = s.ric < 1 ? Ballistics.ricochetChance(sb, mm, angle) : 0;
    const ric = s.key !== 'HE' && Math.random() < ricP;
    const Ek = 0.5 * sb.m * V * V;
    const ev = by === player && hitcamOn && R3 ? {
      typeId: T.id, turretAng: tAng, dir: d, entry: E, n: nHull, cosI: Math.max(0.05, -dot3(d, nHull)), V, cal: sb.cal,
      shellKey: s.key, shellLen: sb.len, spin: Ballistics.spin(sb, V),
      target: `${T.name} ${t.team === 0 ? '(allié)' : '(ennemi)'} · ${Math.round(xm)} m`,
      friendly: t.team === by.team, mods: t.mods.map(m => ({ kind: m.kind, frame: m.frame, c: m.c, s: m.s })),
      before: t.mods.map(m => m.hp / m.max0), after: null, touch: [], sim: null, sparks: [], chunks: [],
      results: [], data: [], detT: null, ricDir: null, outcome: null,
    } : null;
    if (ev) {
      for (let k = 0; k < 18; k++) ev.sparks.push({ d: norm3([nHull[0] + gauss() * 0.6, nHull[1] + gauss() * 0.6, nHull[2] + gauss() * 0.6 + 0.15]), v: rnd(150, 700), life: rnd(1.5e-3, 4e-3) });
      const f = (v, k = 0) => v.toFixed(k).replace('.', ',');
      ev.data.push({ t: `${sb.name} · ${f(sb.m, 2)} kg · ${sb.cal} mm`, c: '#e9d9a6' });
      ev.data.push({ t: `Vitesse d'impact ${Math.round(V)} m/s (bouche : ${sb.v0}) · énergie ${f(Ek / 1e6, 2)} MJ · ${Math.round(Ballistics.spin(sb, V))} tr/s`, c: '#d8d4c6' });
      ev.data.push({ t: `${plate} : ${mm} mm à ${slope}° · incidence ${Math.round(angle)}°${!sb.heat && !sb.he ? ` → normalisée ${Math.round(ef.angN)}°` : ''}`, c: '#d8d4c6' });
      ev.data.push({ t: `Blindage effectif ${Math.round(eff)} mm${extra ? ` (dont ${extra} mm ${trackHit ? 'de chenille' : 'de jupe'})` : ''} · pénétration ${Math.round(pen)} mm${heatK < 1 ? ' (jet perturbé par la jupe)' : ''}`, c: '#d8d4c6' });
    }
    t.hitFlash = 0.15;
    if (trackHit && pen >= 20) {
      t.trackT = Math.max(t.trackT, 8);
      if (show) floatText(hx, hy + 8, 'Chenille cassée', '#ffb070');
      if (t === player) addLog('Chenille cassée : réparation 8 s', '#ffb070');
    }

    // Ricochet : probabilité croissante avec l'incidence, nulle en cas de surcalibrage
    if (ric) {
      const ra = h.part === 'turret' ? t.angle + t.turret : t.angle;
      const c = Math.cos(ra), sn = Math.sin(ra);
      const nx = h.nx * c - h.ny * sn, ny = h.nx * sn + h.ny * c;
      const vd = s.vx * nx + s.vy * ny;
      s.vx = (s.vx - 2 * vd * nx) * 0.72; s.vy = (s.vy - 2 * vd * ny) * 0.72;
      s.sp = Math.hypot(s.vx, s.vy); s.base *= 0.72; s.ric++;
      s.x += nx * 2; s.y += ny * 2;
      s.owner = t; // l'obus dévié peut toucher n'importe qui d'autre
      sparks(hx, hy, 10);
      Sfx.ricochet(listenerDist(hx, hy));
      if (show) floatText(hx, hy - 10, 'Ricochet', '#cfe3ff');
      if (by === player) waveStats.ric++;
      if (t === player) addLog(`Ricochet sur ${plate.toLowerCase()}`, '#cfe3ff');
      if (ev) {
        const dn = dot3(d, nHull);
        ev.ricDir = norm3([d[0] - 2 * dn * nHull[0], d[1] - 2 * dn * nHull[1], d[2] - 2 * dn * nHull[2] + 0.1]);
        ev.outcome = 'ricochet'; ev.after = ev.before.slice();
        ev.metal = metalFor(sb, mm, angle, pen, eff, false);
        ev.data.push({ t: `RICOCHET : incidence ${Math.round(angle)}° > angle critique (probabilité ${Math.round(ricP * 100)} %)`, c: '#9fd0ff' });
        ev.results.push({ t: 'Aucun dégât', c: '#9fd0ff', time: 0 });
        startHitCam(ev);
      }
      return 'continue';
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
    const ctxSim = { mods: t.mods, piv: [I.pivotX, I.pivotY], tAng, inner, wall, E, d, n: nHull, s: sb, V, T: mm, eff };
    let sim = null;
    const penetrated = pen >= eff;
    if (penetrated) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'pen' }));
    else if (!sb.heat && !sb.he && pen >= eff * 0.85) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'spall' }));
    else if (sb.he && pen * 1.4 >= mm) sim = Ballistics.simulate(Object.assign(ctxSim, { mode: 'heout' }));

    let out = null;
    if (sim) out = applySim(t, sim, by, ev);
    if (penetrated) {
      if (by === player) waveStats.pens++;
      if (show) {
        const col = t === player ? '#ff5a4a' : t.team === 0 ? '#ffaa44' : '#ffe27a';
        floatText(hx, hy - 12, out.knocked ? 'DÉTRUIT' : out.crewKilled ? `Perforé · ${out.crewKilled} tué${out.crewKilled > 1 ? 's' : ''}` : 'Perforé', col, 1.15);
        if (out.fire) floatText(hx, hy + 6, 'Incendie !', '#ffb070');
      }
      if (t === player) {
        addLog(`Perforé : ${plate.toLowerCase()} (${Math.round(pen)} mm contre ${Math.round(eff)} mm)`, '#ff8a6a');
        for (const l of out.lines) addLog(l.t, l.c);
      }
      sparks(hx, hy, 14);
      Sfx.penetrate(listenerDist(hx, hy));
      if (t === player) shake = Math.max(shake, 12);
    } else {
      if (s.key === 'HE') heExternal(t, s, by, face, h.z, 1);
      if (show) floatText(hx, hy - 12, out && out.crewHurt ? 'Écaillage !' : 'Non perforé', '#c8c8c8');
      if (t === player) {
        addLog(`Non perforé : ${plate.toLowerCase()} (${Math.round(pen)} mm contre ${Math.round(eff)} mm)`, '#c8c8c8');
        if (out) for (const l of out.lines) addLog(l.t, l.c);
      }
      sparks(hx, hy, 8);
      Sfx.clang(listenerDist(hx, hy));
      if (t === player) shake = Math.max(shake, 6);
      checkKnock(t, by);
    }
    if (ev) {
      const f = (v, k = 0) => v.toFixed(k).replace('.', ',');
      if (penetrated) {
        if (sim.jet) ev.data.push({ t: `PERFORÉ · jet de cuivre à 6 500 m/s, ${f((sim.jet.b[0] - sim.jet.a[0]) ** 2 + (sim.jet.b[1] - sim.jet.a[1]) ** 2 > 0 ? Math.hypot(sim.jet.b[0] - sim.jet.a[0], sim.jet.b[1] - sim.jet.a[1], sim.jet.b[2] - sim.jet.a[2]) : 0, 2)} m de jet résiduel`, c: '#a6f08a' });
        else if (sb.he) ev.data.push({ t: `PERFORÉ · détonation de ${Math.round(sb.filler * 1000)} g d'explosif derrière la plaque`, c: '#a6f08a' });
        else ev.data.push({ t: `PERFORÉ · vitesse limite ${Math.round(sim.Vbl)} m/s → résiduelle ${Math.round(sim.Vr)} m/s${sim.plug ? ` · bouchon de ${f(sim.plug.m, 2)} kg arraché` : ''}`, c: '#a6f08a' });
        if (sim.blast) {
          const kpa = Ballistics.blastKPa(sim.blast.W, 0.5, 2);
          ev.data.push({ t: `Charge : ${Math.round(sim.blast.W / 1.3 * 1000)} g à +${f(sim.blast.t * 1000, 2)} ms · ${f(sim.blast.W * 1000, 0)} g éq. TNT · souffle ${f(kpa / 1000, 1)} MPa à 0,5 m`, c: '#ffcf7a' });
        }
        const nf = sim.frags.length, mt = sim.frags.reduce((a, q) => a + q.m, 0);
        ev.data.push({ t: `${nf} éclats · ${f(mt, 2)} kg${sim.coreStop ? ` · noyau : ${sim.coreStop === 'sorti' ? 'ressort de l’autre côté' : 'arrêté (' + sim.coreStop + ')'}` : ''}`, c: '#ffcf7a' });
      } else {
        ev.data.push({ t: `NON PERFORÉ : ${Math.round(pen)} mm < ${Math.round(eff)} mm${sim ? ' · écaillage de la face interne' : ''}`, c: '#ff8a6a' });
      }
      for (const nt of sim ? sim.notes : []) ev.data.push({ t: nt, c: '#bcd8ff' });
      if (sb.he) {
        // détonation contre la plaque : boule de feu, onde de choc, éclats d'enveloppe (vitesse de Gurney)
        const We = sb.filler * 1.3, gv = Ballistics.gurney(We, sb.m - sb.filler);
        ev.extBlast = { p: [E[0] + nHull[0] * 0.05, E[1] + nHull[1] * 0.05, E[2] + nHull[2] * 0.05], t: 0.03e-3, E: We * 4.184e6 };
        for (let k = 0; k < 40; k++) {
          const u = norm3([gauss(), gauss(), gauss()]);
          const dd2 = dot3(u, nHull) < 0 ? norm3([u[0] - 2 * dot3(u, nHull) * nHull[0], u[1] - 2 * dot3(u, nHull) * nHull[1], u[2] - 2 * dot3(u, nHull) * nHull[2]]) : u;
          ev.chunks.push({ d: dd2, v: gv * rnd(0.6, 1.2), r: 0.012 });
        }
        ev.data.push({ t: `Détonation extérieure : ${Math.round(sb.filler * 1000)} g · éclats à ${Math.round(gv)} m/s · souffle ${(Ballistics.blastKPa(We, 1, 1) / 1000).toFixed(1).replace('.', ',')} MPa à 1 m`, c: '#ffcf7a' });
      }
      if (sim) ev.sim = sim;
      else {
        ev.after = t.mods.map(m => Math.max(0, m.hp) / m.max0);
        if (!sb.he) for (let k = 0; k < 6; k++) ev.chunks.push({ d: norm3([nHull[0] + gauss() * 0.5, nHull[1] + gauss() * 0.5, nHull[2] + gauss() * 0.5]), v: rnd(60, 250), r: sb.cal / 6000 });
        t.mods.forEach((m, i) => {
          if (ev.after[i] >= ev.before[i]) return;
          ev.touch[i] = 0.3e-3;
          ev.results.push({ t: `${m.name} : ${ev.after[i] <= 0 ? (m.kind === 'crew' ? 'neutralisé' : 'détruit') : (m.kind === 'crew' ? 'blessé (onde de choc)' : 'endommagé')}`, c: ev.after[i] <= 0 ? '#ff6a5a' : '#ffb070', time: 0.3e-3 });
        });
        if (trackHit && pen >= 20 || t.trackT > 7.9) ev.results.push({ t: 'Chenille cassée', c: '#ffb070', time: 0.1e-3 });
        if (!ev.results.length) ev.results.push({ t: 'Aucun dégât interne', c: '#c8c8c8', time: 0.2e-3 });
      }
      if (t.dead && !ev.results.some(r => /DÉTRUIT/.test(r.t))) ev.results.push({ t: 'CHAR DÉTRUIT', c: '#ff4a2a', time: ev.tEnd || 0 });
      ev.outcome = penetrated ? 'pen' : 'nopen';
      ev.metal = metalFor(sb, mm, angle, pen, eff, penetrated);
      startHitCam(ev);
    }
    if (s.key === 'HE') explode(hx, hy, s, t);
    return 'stop';
  }

  // Applique les dégâts de la simulation, en déduit les conséquences
  function applySim(t, sim, by, ev) {
    const before = new Map(t.mods.map(m => [m, m.hp]));
    for (const [m, h] of sim.hits) modDamage(t, m, h.dmg, by, true);
    let detonate = false, fire = false, crewKilled = 0, crewHurt = false, detT = null;
    const lines = [];
    const timeOf = m => { const h = sim.hits.get(m); return h ? h.time : 0; };
    for (const m of t.mods) {
      const b = before.get(m);
      if (m.hp === b || m.kind !== 'crew') continue;
      crewHurt = true;
      if (m.hp <= 0) { crewKilled++; lines.push({ t: `${m.name} : neutralisé`, c: '#ff6a5a', time: timeOf(m) }); }
      else lines.push({ t: `${m.name} : blessé`, c: '#ffb070', time: timeOf(m) });
    }
    for (const m of t.mods) {
      const b = before.get(m);
      if (m.hp === b || m.kind === 'crew') continue;
      if (m.hp <= 0) {
        lines.push({ t: `${m.name} : détruit`, c: '#ff6a5a', time: timeOf(m) });
        if (m.kind === 'fuel' && Math.random() < 0.3) fire = true;
        if (m.kind === 'engine' && Math.random() < 0.2) fire = true;
      } else lines.push({ t: `${m.name} : endommagé`, c: '#ffb070', time: timeOf(m) });
    }
    // charges propulsives enflammées : explosion des munitions (plus probable si les soutes sont pleines)
    if (sim.ignite.length) {
      const ig = sim.ignite.reduce((a, b) => (a.t < b.t ? a : b));
      if (Math.random() < 0.45 + 0.4 * ammoFrac(t)) { detonate = true; detT = ig.t + rnd(1.5e-3, 4e-3); }
      else { fire = true; lines.push({ t: 'Charges propulsives enflammées', c: '#ff9a3a', time: ig.t }); }
    }
    if (sim.fuel != null) { fire = true; lines.push({ t: 'Carburant enflammé', c: '#ff9a3a', time: sim.fuel }); }
    if (!lines.length) lines.push({ t: 'Aucun module touché', c: '#c8c8c8', time: 0 });
    if (!detonate && fire && !(t.fireT > 0)) { t.fireT = 8; t.fireBy = by; lines.push({ t: 'Incendie', c: '#ff9a3a', time: sim.tEnd * 0.8 }); }
    else if (detonate) fire = false;
    if (detonate) { sim.tEnd = Math.max(sim.tEnd, detT + 6e-3); lines.push({ t: 'SOUTE À MUNITIONS : DÉTONATION', c: '#ff4a2a', time: detT }); }
    const knocked = detonate || crewAlive(t) < 2;
    if (knocked) lines.push({ t: 'CHAR DÉTRUIT', c: '#ff4a2a', time: detonate ? detT : sim.tEnd * 0.9 });
    lines.sort((a, b) => a.time - b.time);
    if (ev) {
      ev.after = t.mods.map(m => Math.max(0, m.hp) / m.max0);
      t.mods.forEach((m, i) => { const h = sim.hits.get(m); if (h) ev.touch[i] = h.time; });
      ev.detT = detT; ev.results = lines.slice();
      ev.sim = sim;
    }
    if (knocked) destroyTank(t, by, detonate);
    return { detonate, fire, knocked, crewKilled, crewHurt, lines };
  }

  // Dégâts à un module ; statistiques et tirs alliés
  function modDamage(t, m, amount, by, silent) {
    if (t.dead || m.hp <= 0 || amount <= 0) return;
    if (GOD && t === player) return;
    m.hp = Math.max(0, m.hp - amount);
    if (m.hp > 0 || !by || by === t) return;
    if (m.kind === 'crew') {
      if (by.team === t.team) {
        if (by === player) {
          waveStats.ffCrew++;
          if (gameTime - ffMsgT > 1.2) { ffMsgT = gameTime; showMsg('⚠ TIR ALLIÉ : un équipier allié tué !', '#ffaa44'); Sfx.alarm(); }
        }
      } else if (by === player) waveStats.crew++;
    } else if (by === player && by.team !== t.team) waveStats.mods++;
    if (!silent && t === player) addLog(`${m.name} ${m.kind === 'crew' ? 'neutralisé' : 'détruit'}`, '#ff6a5a');
  }
  function checkKnock(t, by) { if (!t.dead && crewAlive(t) < 2) destroyTank(t, by, false); }

  // Explosif qui ne perfore pas, ou souffle d'une explosion proche
  function heExternal(t, s, by, face, z, k) {
    const Sd = t.T.S;
    if ((face === 'side' || z < Sd.tt) && Math.random() < 0.6 * k) {
      t.trackT = Math.max(t.trackT, 8);
      if (visibleToPlayer(t)) floatText(t.x, t.y + 10, 'Chenille cassée', '#ffb070');
      if (t === player) addLog('Chenille cassée par une explosion', '#ffb070');
    }
    // onde de choc : les toits minces laissent passer des éclats
    const over = Ballistics.penAt(by.T.id, 'HE', 0) * 1.6 * k;
    if (over > Sd.armor.hull.roof) {
      const crew = t.mods.filter(m => m.kind === 'crew' && m.hp > 0);
      if (crew.length) {
        const m = crew[Math.floor(Math.random() * crew.length)];
        modDamage(t, m, rnd(35, 75) * k, by);
        if (t === player) addLog(`Onde de choc : ${m.name.toLowerCase()} ${m.hp <= 0 ? 'neutralisé' : 'blessé'}`, '#ffb070');
      }
    }
    checkKnock(t, by);
  }

  function hitObstacle(s, o, h, hx, hy) {
    if (o.type === 'tree') {
      knockTree(o, Math.atan2(s.vy, s.vx));
      if (s.key === 'HE') { explode(hx, hy, s, null); return 'stop'; }
      s.skipObs = o;
      return 'continue';
    }
    if (s.key === 'HE') { explode(hx, hy, s, null); return 'stop'; }
    sparks(hx, hy, o.type === 'rock' ? 10 : 5);
    for (let k = 0; k < 5; k++) addDust(hx + rnd(-8, 8), hy + rnd(-8, 8), o.type === 'rock' ? '#8a8780' : L().wall);
    if (o.hp !== Infinity) damageObstacle(o, s.by.T.obs * 0.5);
    Sfx.impact(listenerDist(hx, hy));
    return 'stop';
  }

  function explode(x, y, s, direct) {
    const R = 75 * Math.sqrt(s.by.T.caliber / 75);
    for (const t of tanks) {
      if (t.dead || t === direct) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d > R + t.r) continue;
      if (!losClear(x, y, t.x, t.y, false)) continue;
      heExternal(t, s, s.by, 'side', 0.5, 1 - d / (R + t.r));
    }
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
    if (Math.floor((1 - Math.max(0, o.hp) / o.maxHp) * 6) !== before) scene3Dirty = true;
    if (o.hp <= 0 && !o.dead) {
      o.dead = true;
      scene3Dirty = true; markDirty(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h));
      const R = mulberry32(o.x * 13 + o.y * 7);
      gctx.fillStyle = 'rgba(0,0,0,0.3)';
      gctx.fillRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8);
      for (let i = 0; i < (o.w * o.h) / 60; i++) {
        const sz = 3 + R() * 9;
        gctx.fillStyle = R() < 0.5 ? L().wall : R() < 0.5 ? L().roof[0] : '#4a4540';
        gctx.fillRect(o.x - 8 + R() * (o.w + 16), o.y - 8 + R() * (o.h + 16), sz, sz * (0.5 + R()));
      }
      for (let i = 0; i < 20; i++) addSmoke(o.x + R() * o.w, o.y + R() * o.h, rnd(14, 26), 'rgba(150,140,125,', 3);
      Sfx.explosion(listenerDist(o.x + o.w / 2, o.y + o.h / 2), false);
      buildGrid();
    }
  }

  function knockTree(o, ang) {
    if (o.dead) return;
    o.dead = true; o.fall = ang;
    scene3Dirty = true; markDirty(o.x + 8, o.y + 8, 40);
    const cx = o.x + 8, cy = o.y + 8, len = 34 * o.size;
    gctx.save();
    gctx.translate(cx, cy); gctx.rotate(ang);
    gctx.fillStyle = '#4a3622'; gctx.fillRect(0, -3, len, 6);
    gctx.fillStyle = L().tree[0];
    gctx.globalAlpha = 0.9;
    gctx.beginPath(); gctx.arc(len, 0, 11 * o.size, 0, TAU); gctx.fill();
    gctx.restore();
    gctx.fillStyle = '#5a4630';
    gctx.beginPath(); gctx.arc(cx, cy, 4, 0, TAU); gctx.fill();
    for (let i = 0; i < 6; i++) parts.push({ k: 'leaf', x: cx + rnd(-10, 10), y: cy + rnd(-10, 10), vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(0.6, 1.2), max: 1.2, color: L().tree[1] });
    Sfx.tree(listenerDist(cx, cy));
    const c0 = Math.floor(o.x / CELL), r0 = Math.floor(o.y / CELL);
    for (let r = r0 - 1; r <= r0 + 2; r++) for (let c = c0 - 1; c <= c0 + 2; c++) if (r >= 0 && c >= 0 && r < GR && c < GC && grid[r * GC + c] === 2) grid[r * GC + c] = 0;
  }

  function destroyTank(t, by, detonation) {
    if (t.dead) return;
    t.dead = true; t.deadT = 0; t.fireT = 0; t.speed = 0; t.trackT = 0;
    boom(t.x, t.y, detonation ? 2.2 : 1.4);
    stampCrater(t.x, t.y, detonation ? 40 : 28);
    if (detonation && t.T.tb) {
      // la tourelle est arrachée par l'explosion des munitions
      t.turretGone = true;
      const a = Math.random() * TAU, v = rnd(40, 110);
      parts.push({ k: 'turret', x: pivot(t).x, y: pivot(t).y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: t.angle + t.turret, vr: rnd(-6, 6), life: 1.1, max: 1.1, tank: t });
    }
    const ff = by && by !== t && by.team === t.team;
    feed.unshift({ a: by ? by.name : '—', at: by ? by.team : -1, v: t.name, vt: t.team, ff, det: detonation, life: 7 });
    if (feed.length > 6) feed.pop();
    if (by === player) {
      if (ff) { waveStats.tk++; showMsg('Allié détruit par vos tirs !', '#ff7a4a'); }
      else if (by !== t) { waveStats.kills++; showMsg(detonation ? 'Char ennemi détruit : munitions détonées !' : 'Char ennemi détruit', '#ffe27a'); }
    }
    if (t === player) {
      addLog(detonation ? 'Vos munitions ont explosé.' : "Votre équipage est hors de combat.", '#ff6a5a');
      showMsg('Votre char est détruit. Vous observez un allié (clic pour changer)', '#ff7a5c', 4);
    }
  }

  // ===================== Effets =====================
  function listenerDist(x, y) { return Math.hypot(x - camX, y - camY) * 0.8; }
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
  function boom(x, y, k) {
    parts.push({ k: 'flash', x, y, life: 0.25 * k, max: 0.25 * k, size: 70 * k });
    for (let i = 0; i < 18 * k; i++) addFire(x + rnd(-14, 14) * k, y + rnd(-14, 14) * k);
    for (let i = 0; i < 16 * k; i++) {
      const a = Math.random() * TAU, v = rnd(10, 70) * k;
      addSmoke(x, y, rnd(10, 22) * k, 'rgba(45,40,36,', rnd(1.5, 3.5), Math.cos(a) * v, Math.sin(a) * v);
    }
    for (let i = 0; i < 10 * k; i++) {
      const a = Math.random() * TAU, v = rnd(60, 220);
      parts.push({ k: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.9), max: 0.9 });
    }
    sparks(x, y, 12 * k);
    const d = player ? Math.hypot(player.x - x, player.y - y) : 9999;
    shake = Math.max(shake, clamp(22 * k * (1 - d / 900), 0, 22));
    Sfx.explosion(listenerDist(x, y), k > 1);
  }
  function stampTracks(t) {
    markDirty(t.x, t.y, t.T.len);
    const c = Math.cos(t.angle), s = Math.sin(t.angle), T = t.T;
    const tw = T.S.tw * PX;
    gctx.fillStyle = L().track;
    for (const side of [-1, 1]) {
      const off = T.wid / 2 - tw / 2;
      const ox = -s * side * off, oy = c * side * off;
      for (const f of [-0.4, 0.4]) {
        gctx.save();
        gctx.translate(t.x + ox + c * T.len * f, t.y + oy + s * T.len * f);
        gctx.rotate(t.angle);
        gctx.fillRect(-4, -tw / 2, 8, tw);
        gctx.restore();
      }
    }
  }
  function stampCrater(x, y, r) {
    markDirty(x, y, r);
    const g = gctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,16,12,0.55)'); g.addColorStop(0.7, 'rgba(30,24,18,0.3)'); g.addColorStop(1, 'rgba(30,24,18,0)');
    gctx.fillStyle = g;
    gctx.beginPath(); gctx.arc(x, y, r, 0, TAU); gctx.fill();
  }
  function floatText(x, y, text, color, scale = 1) { texts.push({ x, y, text, color, life: 1.4, max: 1.4, scale }); }
  function showMsg(text, color, life = 2) { msg = { text, color, life, max: life }; }
  function addLog(text, color) { logs.unshift({ text, color, life: 6 }); if (logs.length > 6) logs.pop(); }

  function startHitCam(ev) {
    if (!ev.after) ev.after = ev.before.slice();
    HitCam.play(ev);
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.k === 'smoke' || p.k === 'dust') { p.vx *= 0.96; p.vy *= 0.96; p.size += p.grow * dt; }
      else if (p.k === 'spark' || p.k === 'debris' || p.k === 'leaf') { p.vx *= 0.92; p.vy *= 0.92; }
      else if (p.k === 'turret') { p.rot += p.vr * dt; p.vr *= 0.98; if (p.life <= dt * 1.5) { stampCrater(p.x, p.y, 14); addDust(p.x, p.y); } }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.life -= dt; s.r = Math.min(s.maxR, s.r + 70 * dt);
      if (s.life <= 0) smokes.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) texts.splice(i, 1); }
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].life -= dt; if (feed[i].life <= 0) feed.splice(i, 1); }
    for (let i = logs.length - 1; i >= 0; i--) { logs[i].life -= dt; if (logs[i].life <= 0) logs.splice(i, 1); }
    if (msg) { msg.life -= dt; if (msg.life <= 0) msg = null; }
  }

  // ===================== Boucle =====================
  function screenToWorld(x, y) { if (W3D && cam3.vp) return ray3(x, y, 1.6); return { x: camX + (x - W / 2) / S, y: camY + (y - H / 2) / S }; }
  function worldToScreen(x, y, z = 1.6) { if (W3D && cam3.vp) return project3(x, y, z); return { x: (x - camX) * S + W / 2, y: (y - camY) * S + H / 2 }; }

  function playerInput() {
    const k = keys;
    let thr = 0, turn = 0;
    if (k.KeyW || k.ArrowUp) thr += 1;
    if (k.KeyS || k.ArrowDown) thr -= 1;
    if (k.KeyA || k.ArrowLeft) turn -= 1;
    if (k.KeyD || k.ArrowRight) turn += 1;
    const m = screenToWorld(mouse.x, mouse.y), pv = pivot(player);
    player.in.throttle = thr; player.in.turn = turn;
    player.in.aim = Math.atan2(m.y - pv.y, m.x - pv.x);
    player.in.fire = mouse.down || !!k.Space;
  }

  function step(dt) {
    gameTime += dt;
    if (state === 'play') waveTime += dt;
    if (state === 'intro') { introT -= dt; if (introT <= 0) { state = 'play'; showMsg('EN AVANT !', '#ffe27a', 1.2); } }
    if (player && !player.dead && !player.ai) playerInput();
    spotTimer -= dt;
    if (spotTimer <= 0) { spotTimer = 0.2; updateSpotting(); }
    for (const t of tanks) if (!t.dead && t.ai) aiThink(t, dt);
    if (state === 'intro') for (const t of tanks) { t.in.throttle = 0; t.in.turn = 0; t.in.fire = false; }
    for (const t of tanks) updateTank(t, dt);
    tankCollisions();
    updateShells(dt);
    updateParts(dt);
    if (state === 'play') {
      const a = tanks.some(t => t.team === 0 && !t.dead), e = tanks.some(t => t.team === 1 && !t.dead);
      if (!a || !e) { state = 'ending'; endT = 3.5; waveResult = a ? 'win' : 'lose'; showMsg(a ? 'VAGUE REMPORTÉE' : 'VAGUE PERDUE', a ? '#b8e07a' : '#ff7a5c', 3); }
    } else if (state === 'ending') {
      endT -= dt;
      if (endT <= 0 && !HitCam.active()) showResult();
    }
  }

  let last = performance.now(), acc = 0, viewerT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state === 'intro' || state === 'play' || state === 'ending') {
      // ralenti pendant la caméra d'impact
      const slow = HitCam.active() && HitCam.time() < HitCam.phys ? 0.1 : 1;
      acc += dt * timeScale * slow;
      let n = 0;
      while (acc >= STEP && n++ < 40) { step(STEP); acc -= STEP; }
      if (n >= 40) acc = 0;
      HitCam.update(dt);
      const hev = HitCam.ev();
      if (hev && hev.metal && !hev.metal.st.done) hev.metal.run(9);
    }
    if (state === 'menu' && bench.sim && !bench.sim.st.done) bench.sim.run(14);
    if (state === 'menu' && R3) { viewerT += dt; renderViewer(dt); }
    if (state === 'menu') renderBench();
    if (groundCv) render(dt);
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0f0c'; ctx.fillRect(0, 0, cv.width, cv.height); }
    const v = player && !player.dead && state !== 'menu' && state !== 'result' && state !== 'pause' ? Math.abs(player.speed) / player.T.speed : -1;
    Sfx.engine(v);
    requestAnimationFrame(frame);
  }

  // ===================== Rendu =====================
  function camFocus() {
    if (player && !player.dead) return player;
    const allies = tanks.filter(t => t.team === 0 && !t.dead);
    if (!allies.length) return player;
    return allies[specIdx % allies.length];
  }

  // ===================== Rendu 3D =====================
  const ENV = [
    { az: 135, el: 36, sunCol: [1.9, 1.75, 1.5], skyCol: [0.2, 0.25, 0.34], bounce: [0.13, 0.12, 0.08], horizon: [0.5, 0.58, 0.68], zenith: [0.12, 0.24, 0.5], fogD: 0.0042 },
    { az: 120, el: 28, sunCol: [1.5, 1.42, 1.2], skyCol: [0.18, 0.23, 0.27], bounce: [0.09, 0.12, 0.06], horizon: [0.4, 0.47, 0.47], zenith: [0.14, 0.22, 0.33], fogD: 0.0075 },
    { az: 150, el: 40, sunCol: [1.05, 1.0, 0.96], skyCol: [0.27, 0.28, 0.3], bounce: [0.12, 0.11, 0.1], horizon: [0.4, 0.4, 0.41], zenith: [0.24, 0.26, 0.3], fogD: 0.0065 },
    { az: 160, el: 55, sunCol: [2.3, 2.0, 1.6], skyCol: [0.24, 0.26, 0.32], bounce: [0.26, 0.2, 0.12], horizon: [0.72, 0.64, 0.5], zenith: [0.17, 0.32, 0.58], fogD: 0.0038 },
    { az: 210, el: 34, sunCol: [0.28, 0.33, 0.5], skyCol: [0.03, 0.045, 0.08], bounce: [0.04, 0.05, 0.07], horizon: [0.02, 0.03, 0.06], zenith: [0.004, 0.006, 0.016], fogD: 0.011, snow: 1 },
  ];

  let W3D = null, MESH3 = {}, bush3 = null, scene3 = null, scene3Dirty = false, scene3T = 0;
  const cam3 = { yaw: 0, pitch: 0.56, dist: 34, off: 0, eye: [0, 0, 40], target: [0, 0, 0], view: null, vp: null, init: false, drag: null };
  const dirtyTiles = new Set();
  try {
    const c3 = document.getElementById('game3d');
    if (c3 && typeof World3D !== 'undefined' && !Q.has('2d')) {
      W3D = World3D.create(c3);
      if (W3D) for (const id of Object.keys(TYPES)) { const b = TankModels.build(id); MESH3[id] = { hull: W3D.upload(b.hull), turret: W3D.upload(b.turret) }; }
    }
  } catch (e) { console.warn('Rendu 3D indisponible, passage en 2D', e); W3D = null; }
  if (!W3D) { const c3 = document.getElementById('game3d'); if (c3) c3.style.display = 'none'; }
  const to3 = (x, y, z = 0) => [x / PX, -y / PX, z];
  function markDirty(x, y, r) {
    const T = 256;
    for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y + r) / T); ty++) for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
      if (tx >= 0 && ty >= 0 && tx * T < WW && ty * T < WH) dirtyTiles.add(ty * 64 + tx);
    }
  }
  function setup3D() {
    if (!W3D) return;
    const e = ENV[levelIdx], az = e.az * D2R, el = e.el * D2R;
    W3D.setEnv({ sun: [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)], sunCol: e.sunCol, skyCol: e.skyCol, bounce: e.bounce, fogCol: e.horizon, fogD: e.fogD, horizon: e.horizon, zenith: e.zenith, snow: e.snow || 0 });
    W3D.setGround(groundCv, WW / PX, WH / PX);
    dirtyTiles.clear();
    if (bush3) W3D.free(bush3);
    bush3 = W3D.upload(World3D.buildBushes(L(), bushes, PX, 4242 + levelIdx * 131));
    rebuildScene3();
    cam3.init = false;
  }
  function rebuildScene3() {
    if (scene3) W3D.free(scene3);
    scene3 = W3D.upload(World3D.buildScene(L(), obstacles, bushes, PX, WW / PX, WH / PX, 1000 + levelIdx * 7919));
    scene3Dirty = false; scene3T = 0;
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
  function project3(x, y, z) {
    const q = G3.M4.apply(cam3.vp, to3(x, y, z));
    return { x: (q[0] * 0.5 + 0.5) * W, y: (1 - (q[1] * 0.5 + 0.5)) * H, behind: q[3] < 0 };
  }
  function updateCam3(dt) {
    const f = camFocus();
    if (!f) return;
    const T = to3(f.x, f.y, 0);
    const heading = -f.angle;
    if (!cam3.init) { cam3.yaw = heading; cam3.tx = T[0]; cam3.ty = T[1]; cam3.init = true; }
    // la caméra suit la caisse avec un léger retard ; le clic droit glissé la décale
    cam3.yaw += angNorm(heading + cam3.off - cam3.yaw) * (1 - Math.pow(0.12, dt));
    const kk = 1 - Math.pow(0.0008, dt);
    cam3.tx += (T[0] - cam3.tx) * kk; cam3.ty += (T[1] - cam3.ty) * kk;
    const ahead = cam3.dist * 0.18;
    const tgt = [cam3.tx + Math.cos(cam3.yaw) * ahead, cam3.ty + Math.sin(cam3.yaw) * ahead, 1.2];
    const cp = Math.cos(cam3.pitch), sp = Math.sin(cam3.pitch);
    let eye = [tgt[0] - Math.cos(cam3.yaw) * cp * cam3.dist, tgt[1] - Math.sin(cam3.yaw) * cp * cam3.dist, tgt[2] + sp * cam3.dist];
    const sh = shake * 0.025;
    if (sh > 0.01) eye = [eye[0] + (Math.random() - 0.5) * sh, eye[1] + (Math.random() - 0.5) * sh, eye[2] + (Math.random() - 0.5) * sh];
    shake *= Math.pow(0.004, dt);
    cam3.fov = 0.82;
    cam3.eye = eye; cam3.target = tgt;
    cam3.view = G3.M4.lookAt(eye, tgt, [0, 0, 1]);
    cam3.vp = G3.M4.mul(G3.M4.persp(cam3.fov, W / H, 0.8, 2400), cam3.view);
    camX = cam3.tx * PX; camY = -cam3.ty * PX;
  }
  function render3D(dt) {
    updateCam3(dt);
    if (!cam3.vp) return;
    // gravats et arbres abattus : reconstruction du décor (au plus 3 fois par seconde)
    scene3T += dt;
    if (scene3Dirty && scene3T > 0.33) rebuildScene3();
    // traces et cratères : envoi des tuiles modifiées de la texture du sol
    let n = 0;
    for (const k of dirtyTiles) {
      if (n++ >= 6) break;
      dirtyTiles.delete(k);
      const tx = (k % 64) * 256, ty = Math.floor(k / 64) * 256, w = Math.min(256, WW - tx), h = Math.min(256, WH - ty);
      W3D.updateGround(gctx.getImageData(tx, ty, w, h), tx, ty);
    }
    const M4 = G3.M4, items = [{ mesh: scene3, model: M4.ident() }, { mesh: bush3, model: M4.ident() }];
    for (const t of tanks) {
      if (!t.dead && !visibleToPlayer(t)) continue;
      const p = to3(t.x, t.y), hm = M4.trs(p[0], p[1], 0, -t.angle);
      const o = { camo: TEAM[t.team].camo, seed: t.team * 3.7 + t.id * 0.37, burnt: t.dead ? 1 : 0, tread: -t.treadPhase / PX, tint: t.hitFlash > 0 ? [1, 0.9, 0.7, t.hitFlash * 2.5] : null };
      const MS = MESH3[t.T.id];
      items.push({ mesh: MS.hull, model: hm, o });
      if (!t.turretGone) {
        const I = t.T.I;
        const tmm = M4.mul(hm, M4.mul(M4.trs(I.pivotX, I.pivotY, 0, -t.turret), M4.trs(-t.recoil * 0.3, 0, 0, 0)));
        items.push({ mesh: MS.turret, model: tmm, o });
      }
    }
    // particules et lumières
    const soft = [], glow = [], lights = [];
    const night = !!L().night;
    for (const p of parts) {
      const a = p.life / p.max, age = 1 - a;
      const P = to3(p.x, p.y);
      switch (p.k) {
        case 'smoke': {
          const dark = p.color.indexOf('30,28') > 0 || p.color.indexOf('45,40') > 0;
          const c = dark ? [0.09, 0.085, 0.08] : [0.55, 0.53, 0.5];
          const sz = p.size / PX * 1.25;
          soft.push({ p: [P[0], P[1], Math.max(sz * 0.7, 1.2 + age * (dark ? 7 : 3))], s: sz, c: [c[0], c[1], c[2], a * 0.5], rot: p.x * 0.1 });
          break;
        }
        case 'dust': { const sz = p.size / PX * 1.3; soft.push({ p: [P[0], P[1], Math.max(sz * 0.65, 0.4 + age * 1.2)], s: sz, c: [0.5, 0.45, 0.36, a * 0.3], rot: p.y * 0.1 }); break; }
        case 'fire': glow.push({ p: [P[0], P[1], 0.8 + age * 2.2], s: p.size / PX * 1.6, c: [1.0, 0.45 + a * 0.35, 0.12, a * 1.4] }); break;
        case 'spark': glow.push({ p: [P[0], P[1], 1.4], a2: [P[0] - p.vx / PX * 0.03, P[1] + p.vy / PX * 0.03, 1.4], s: 0.05, c: [1, 0.8, 0.4, a * 1.5] }); break;
        case 'debris': soft.push({ p: [P[0], P[1], 0.3 + Math.sin(age * Math.PI) * 3], s: 0.18, c: [0.05, 0.05, 0.05, a] }); break;
        case 'leaf': soft.push({ p: [P[0], P[1], 2 + age * 1.5], s: 0.12, c: [0.2, 0.3, 0.1, a] }); break;
        case 'flash': {
          glow.push({ p: [P[0], P[1], 1.8], s: p.size / PX * 1.6, c: [1, 0.75, 0.4, a * 2.2] });
          lights.push({ p: [P[0], P[1], 2.2], r: p.size / PX * 7, c: [6 * a, 3.8 * a, 1.6 * a] });
          break;
        }
        case 'turret': {
          const up = Math.sin(age * Math.PI) * 9, I = p.tank.T.I;
          const m = M4.mul(M4.trs(P[0], P[1], up, -p.rot), M4.trs(-I.pivotX * 0, 0, 0, 0));
          items.push({ mesh: MESH3[p.tank.T.id].turret, model: m, o: { burnt: 1 } });
          break;
        }
      }
    }
    for (const s of shells) {
      const head = to3(s.x, s.y, 1.9), tail = s.trail.length >= 2 ? to3(s.trail[0], s.trail[1], 1.9) : head;
      const hot = s.key === 'HE' || s.key === 'HEAT';
      glow.push({ p: tail, a2: head, s: 0.09, c: hot ? [1, 0.45, 0.2, 1.6] : s.key === 'APCR' ? [0.7, 0.85, 1, 1.6] : [1, 0.85, 0.55, 1.6] });
      glow.push({ p: head, s: 0.55, c: [1, 0.8, 0.5, 1.2] });
      lights.push({ p: head, r: 7, c: [1.6, 1.1, 0.6] });
    }
    for (const sm of smokes) {
      const a = Math.min(1, sm.life / 2) * 0.8, P = to3(sm.x, sm.y), r = sm.r / PX;
      for (let k = 0; k < 14; k++) { const ang = k / 14 * TAU * 2.3 + gameTime * 0.05, d = r * (0.2 + 0.5 * ((k * 0.618) % 1)), sz = r * 0.42; soft.push({ p: [P[0] + Math.cos(ang) * d, P[1] + Math.sin(ang) * d, sz * 0.7 + (k % 4) * 1.3], s: sz, c: [0.62, 0.62, 0.6, a * 0.45], rot: k }); }
    }
    for (const t of tanks) {
      const P = to3(t.x, t.y);
      if (t.dead ? t.deadT < 12 : t.fireT > 0) lights.push({ p: [P[0], P[1], 2], r: 11, c: [3.2 * (0.8 + 0.4 * Math.random()), 1.4, 0.35] });
      if (night && !t.dead && t.team === 0) { const c = Math.cos(t.angle), sn = Math.sin(t.angle); lights.push({ p: [P[0] + c * 6, P[1] - sn * 6, 1.6], r: 20, c: [0.9, 0.85, 0.7], head: true }); }
    }
    const tg = cam3.target;
    lights.sort((a, b) => Math.hypot(a.p[0] - tg[0], a.p[1] - tg[1]) / a.r - Math.hypot(b.p[0] - tg[0], b.p[1] - tg[1]) / b.r);
    W3D.render({ cam: { eye: cam3.eye, target: cam3.target, vp: cam3.vp, view: cam3.view, time: gameTime, lights }, items, parts: { soft, glow }, shadowExt: Math.max(60, cam3.dist * 1.6) }, Math.round(W * DPR), Math.round(H * DPR));
    // interface par-dessus
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // vignettage léger, comme à travers une optique
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    drawThreats3D();
    drawWorldLabels();
    if (state !== 'menu') drawHUD();
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
      const p0 = project3(s.x, s.y, 1.9), p1 = project3(ix, iy, 1.6);
      if (p0.behind || p1.behind) continue;
      ctx.strokeStyle = `rgba(255,60,40,${a * 0.85})`; ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
      const rr = (1.6 + 0.6 * Math.sin(gameTime * 20)) * PX;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const q = project3(ix + Math.cos(k / 24 * TAU) * rr, iy + Math.sin(k / 24 * TAU) * rr, 0.05); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
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
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    shake *= Math.pow(0.004, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0f0c'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * (W / 2 - camX * S + sx), DPR * (H / 2 - camY * S + sy));
    ctx.drawImage(groundCv, 0, 0);
    const vx0 = camX - hw - 80, vx1 = camX + hw + 80, vy0 = camY - hh - 80, vy1 = camY + hh + 80;
    const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    for (const t of tanks) if (t.dead && inView(t.x, t.y)) drawTank(t);
    for (const t of tanks) if (!t.dead && inView(t.x, t.y) && visibleToPlayer(t)) drawTank(t);

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
    if (state !== 'menu') drawHUD();
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
      ctx.drawImage(t.dead ? sp.hullB : sp.hull[t.team], -hxp, -hyp, hxp * 2, hyp * 2);
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
        ctx.drawImage(t.dead ? sp.turB : sp.tur[t.team], -rtp + rec, -rtp, rtp * 2, rtp * 2);
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
      } else if (spotted[0].has(t)) hole(t.x, t.y, 70, 0.5);
    }
    for (const s of shells) hole(s.x, s.y, 50, 0.8);
    for (const p of parts) if (p.k === 'flash') hole(p.x, p.y, p.size * 3, p.life / p.max);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
  }

  function drawWorldLabels() {
    ctx.textAlign = 'center';
    for (const t of tanks) {
      if (t.dead || !visibleToPlayer(t)) continue;
      const p = W3D ? worldToScreen(t.x, t.y, t.T.I.totalH + 1.4) : worldToScreen(t.x, t.y - t.T.len * 0.8);
      if (p.behind) continue;
      if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
      const w = 38, f = crewFrac(t);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
      ctx.fillStyle = t.team === 0 ? (t === player ? '#7ad06a' : '#5aa8ff') : '#ff5040';
      ctx.fillRect(p.x - w / 2, p.y, w * f, 4);
      if (t.fireT > 0) { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(p.x + w / 2 + 3, p.y - 1, 5, 6); }
      if (t !== player) {
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = t.team === 0 ? '#a8d0ff' : '#ffb0a8';
        ctx.fillText(t.T.name + (t.team === 0 ? ' · ' + t.name.replace('Allié ', 'A') : ''), p.x, p.y - 4);
      }
    }
    for (const tx of texts) {
      const p = worldToScreen(tx.x, tx.y, 2.6 + (1 - tx.life / tx.max) * 1.5);
      if (p.behind) continue;
      const a = Math.min(1, tx.life / tx.max * 2);
      ctx.font = `700 ${Math.round(13 * tx.scale)}px system-ui, sans-serif`;
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

  const CREW_ABBR = { driver: 'Pi', radio: 'Ra', gunner: 'Ti', commander: 'Ch', loader: 'Cg' };
  function drawHUD() {
    const lv = L();
    ctx.textAlign = 'center';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 190, 8, 380, 46);
    ctx.fillStyle = '#e9d9a6';
    ctx.fillText(`Niveau ${levelIdx + 1} · ${lv.name} · Vague ${waveIdx + 1}/${WAVES}`, W / 2, 26);
    for (let team = 0; team < 2; team++) {
      const list = tanks.filter(t => t.team === team);
      list.forEach((t, i) => {
        const x = team === 0 ? W / 2 - 22 - (4 - i) * 18 - 14 : W / 2 + 22 + i * 18;
        ctx.fillStyle = t.dead ? '#333' : TEAM[team].accent;
        ctx.fillRect(x, 34, 14, 12);
        if (t === player) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1, 33, 16, 14); }
        if (t.dead) { ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 14, 46); ctx.moveTo(x + 14, 34); ctx.lineTo(x, 46); ctx.stroke(); }
      });
    }
    ctx.fillStyle = '#ccc'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('VS', W / 2, 45);

    // fil des destructions (en haut à gauche)
    ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif';
    feed.forEach((f, i) => {
      const y = 24 + i * 20;
      ctx.globalAlpha = Math.min(1, f.life);
      const mid = f.ff ? ' ✖ TIR ALLIÉ ✖ ' : f.det ? ' 💥 ' : ' ⟶ ';
      const wA = ctx.measureText(f.a).width, wM = ctx.measureText(mid).width, wV = ctx.measureText(f.v).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, y - 13, wA + wM + wV + 16, 18);
      ctx.fillStyle = f.at === 0 ? '#8cc4ff' : f.at === 1 ? '#ff8c80' : '#aaa'; ctx.fillText(f.a, 18, y);
      ctx.fillStyle = f.ff ? '#ffaa44' : '#ddd'; ctx.fillText(mid, 18 + wA, y);
      ctx.fillStyle = f.vt === 0 ? '#8cc4ff' : '#ff8c80'; ctx.fillText(f.v, 18 + wA + wM, y);
      ctx.globalAlpha = 1;
    });

    const mm = drawMinimap();

    // journal des dégâts subis (en bas à gauche)
    ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif';
    logs.forEach((l, i) => {
      const y = H - 20 - i * 18;
      ctx.globalAlpha = Math.min(1, l.life);
      const w = ctx.measureText(l.text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(10, y - 13, w + 14, 17);
      ctx.fillStyle = l.color; ctx.fillText(l.text, 17, y);
      ctx.globalAlpha = 1;
    });

    if (player) drawTankPanel();

    // réticule
    if (player && !player.dead && (state === 'play' || state === 'intro' || state === 'ending')) {
      const m = screenToWorld(mouse.x, mouse.y), pv = pivot(player);
      const d = Math.hypot(m.x - pv.x, m.y - pv.y), ta = player.angle + player.turret;
      const gp = worldToScreen(pv.x + Math.cos(ta) * d, pv.y + Math.sin(ta) * d);
      const rr = Math.max(4, d * Math.tan(player.disp) * 2 * S);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, rr, 0, TAU); ctx.stroke();
      const rf = player.reloadT > 0 ? 1 - player.reloadT / player.T.reload : 1;
      ctx.strokeStyle = rf >= 1 ? '#ffe27a' : 'rgba(255,200,90,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, rr + 5, -Math.PI / 2, -Math.PI / 2 + TAU * rf); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mouse.x - 10, mouse.y); ctx.lineTo(mouse.x - 3, mouse.y); ctx.moveTo(mouse.x + 3, mouse.y); ctx.lineTo(mouse.x + 10, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 10); ctx.lineTo(mouse.x, mouse.y - 3); ctx.moveTo(mouse.x, mouse.y + 3); ctx.lineTo(mouse.x, mouse.y + 10);
      ctx.stroke();
      // pénétration estimée à cette distance
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`${Math.round(d * RK)} m · ${Math.round(penAt(player.T, player.shell, d))} mm`, mouse.x + 14, mouse.y + 18);
    } else if (state !== 'menu') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 3, 0, TAU); ctx.fill();
    }

    // caméra d'impact (à droite, sous la mini-carte)
    if (HitCam.active()) {
      const hev = HitCam.ev();
      const cw = Math.min(hev && hev.metal ? 600 : 660, W * (hev && hev.metal ? 0.4 : 0.47)), ch = Math.round(cw * 0.66);
      const cx = W - cw - 14, cy = Math.min(mm.bottom + 14, H - ch - 90);
      HitCam.draw(ctx, cx, cy, cw, ch, DPR);
      if (hev && hev.metal) {
        let iw = Math.min(cw * 0.85, cx - 24), ih = ch, ix = cx - iw - 10, iy = cy;
        if (iw < 260) { iw = cw * 0.55; ih = ch * 0.6; ix = cx + cw - iw; iy = cy + ch - ih; }
        drawMetalPanel(ctx, hev.metal, ix, iy, iw, ih, clamp((HitCam.time() - HitCam.T_HIT) / HitCam.T_IN, 0, 1), Math.min(1, HitCam.time() / 0.15, (HitCam.DUR - HitCam.time()) / 0.4));
      }
    }

    ctx.textAlign = 'center';
    if (state === 'intro') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H / 2 - 90, W, 150);
      ctx.fillStyle = '#e9d9a6'; ctx.font = '800 34px system-ui, sans-serif';
      ctx.fillText(`${lv.name.toUpperCase()}`, W / 2, H / 2 - 45);
      ctx.font = '600 16px system-ui, sans-serif'; ctx.fillStyle = '#bdb7a2';
      ctx.fillText(`${lv.sub} · Vague ${waveIdx + 1}/${WAVES} · 5 contre 5`, W / 2, H / 2 - 18);
      ctx.font = '800 48px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(String(Math.max(1, Math.ceil(introT))), W / 2, H / 2 + 38);
    }
    if (msg) {
      const a = Math.min(1, msg.life * 2);
      ctx.globalAlpha = a;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(msg.text, W / 2 + 2, 92);
      ctx.fillStyle = msg.color; ctx.fillText(msg.text, W / 2, 90);
      ctx.globalAlpha = 1;
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
    const inf = sim.info, f = (v, k = 0) => v.toFixed(k).replace('.', ',');
    c.textAlign = 'left';
    c.font = `700 ${12 * fs}px system-ui, sans-serif`; c.fillStyle = '#f0d27a';
    c.fillText(`COUPE DE LA PLAQUE · simulation péridynamique`, X + 8, Y + 13 * fs);
    c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#cfc8b0';
    c.fillText(`${inf.mm} mm d'acier à ${inf.angle}° · ${sim.N.toLocaleString('fr-FR')} particules · ${sim.bonds.toLocaleString('fr-FR')} liaisons · pas ${f(sim.dt * 1e9, 0)} ns`, X + 8, Y + 26 * fs);
    c.font = `700 ${11 * fs}px system-ui, sans-serif`;
    const st = sim.st;
    if (!st.done) {
      c.fillStyle = '#8cc8ff';
      c.fillText(`${waiting ? 'Calcul en cours' : 'Calcul'} : ${Math.min(99, Math.round(st.t / sim.tMax * 100))} % · ${st.step.toLocaleString('fr-FR')} pas · ${st.broken.toLocaleString('fr-FR')} liaisons rompues`, X + 8, Y + h - fH + 14 * fs);
    } else {
      const res = inf.sb.heat ? (st.perforated ? 'jet traversant' : 'jet arrêté') : inf.sb.he ? (st.ejected > 3 ? 'plaque déchirée' : 'plaque bombée') : (st.perforated ? 'perforée' : 'non perforée');
      c.fillStyle = st.perforated || (inf.sb.he && st.ejected > 3) ? '#a6f08a' : '#ff9a7a';
      c.fillText(`Plaque ${res} · ${st.broken.toLocaleString('fr-FR')} liaisons rompues · T max ${Math.round(st.maxTemp)} K`, X + 8, Y + h - fH + 14 * fs);
      c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#cfc8b0';
      c.fillText(`${st.fragments} fragment${st.fragments > 1 ? 's' : ''} arraché${st.fragments > 1 ? 's' : ''} (${f(st.ejectedKg, 2)} kg) · bombement ${f(st.bulge * 1000, 0)} mm · obus ${Math.round(st.projDamage * 100)} % rompu`, X + 8, Y + h - fH + 27 * fs);
    }
    c.textAlign = 'right'; c.font = `600 ${10 * fs}px system-ui, sans-serif`; c.fillStyle = '#9fc4e6';
    if (big || !st.done || p < 1) c.fillText(`ralenti ×${Math.round(3 / sim.tMax).toLocaleString('fr-FR')}`, X + w - 8, Y + 13 * fs);
    c.restore();
  }

  // Panneau du char : équipage, modules, obus
  function drawTankPanel() {
    const T = player.T, pw = 470, bx = W / 2 - pw / 2, by = H - 98;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, pw, 90);
    ctx.textAlign = 'left'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#f0e6c8';
    ctx.fillText(`${T.name} · ${T.cls}`, bx + 10, by + 17);
    // équipage
    let x = bx + 10;
    for (const role of T.S.crew) {
      const m = player.mods.find(q => q.kind === 'crew' && q.role === role);
      const r = m.hp / m.max0, vacant = !roleOk(player, role) && m.hp > 0;
      ctx.fillStyle = r <= 0 ? '#5a1510' : r < 1 ? '#c07a20' : '#3f7a4a';
      ctx.fillRect(x, by + 24, 30, 20);
      if (vacant || (player.roles[role] !== m.i && player.roles[role] >= 0)) { ctx.strokeStyle = '#8cc8ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, by + 24.5, 29, 19); }
      ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(CREW_ABBR[role], x + 15, by + 38);
      if (r <= 0) { ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, by + 27); ctx.lineTo(x + 26, by + 41); ctx.stroke(); }
      x += 34;
    }
    if (player.swap) { ctx.textAlign = 'left'; ctx.fillStyle = '#8cc8ff'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText(`remplacement ${player.swap.t.toFixed(0)} s`, x + 2, by + 38); }
    // modules
    const MODS = [['engine', 'Moteur'], ['trans', 'Transm.'], ['breech', 'Culasse'], ['fuel', 'Carbur.'], ['ammo', 'Munit.']];
    x = bx + 200;
    ctx.textAlign = 'center'; ctx.font = '600 10px system-ui, sans-serif';
    const chip = (label, state, sub) => {
      ctx.fillStyle = state === 2 ? '#5a1510' : state === 1 ? '#8a5a18' : '#2c3a2c';
      ctx.fillRect(x, by + 24, 50, 20);
      ctx.fillStyle = '#eee'; ctx.fillText(sub || label, x + 25, by + 37);
      x += 53;
    };
    for (const [kind, label] of MODS) {
      const ms = player.mods.filter(m => m.kind === kind);
      const dead = ms.some(m => m.hp <= 0), hurt = ms.some(m => m.hp < m.max0);
      const rep = player.rep[kind];
      chip(label, dead ? 2 : hurt ? 1 : 0, rep != null ? `${label} ${Math.ceil(rep)}s` : null);
    }
    // chenilles et feu
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif';
    const st = [];
    if (player.trackT > 0) st.push(['Chenille ' + Math.ceil(player.trackT) + ' s', '#ffb070']);
    if (player.fireT > 0) st.push(['EN FEU', '#ff6a3a']);
    if (!player.dead && player.revealT <= 0 && inBush(player)) st.push(['Camouflé', '#a6f08a']);
    let sx2 = bx + 230;
    for (const [s, c] of st) { ctx.fillStyle = c; ctx.fillText(s, sx2, by + 15); sx2 += ctx.measureText(s).width + 12; }
    // obus
    x = bx + 10;
    for (const k of SHELL_KEYS) {
      const sh = SHELLS[k], sel = player.shell === k, n = player.ammo[k];
      ctx.fillStyle = sel ? '#4a3f1a' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, by + 52, 86, 30);
      if (sel) { ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, by + 52.5, 85, 29); }
      ctx.fillStyle = n ? (sel ? '#ffe27a' : '#ddd') : '#666'; ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillText(`[${sh.n}] ${k}`, x + 5, by + 65);
      ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = n ? '#aaa' : '#555';
      ctx.fillText(`${n} · ${Math.round(penAt(player.T, k, 200))} mm`, x + 5, by + 77);
      x += 89;
    }
    // rechargement
    const rf = player.reloadT > 0 ? 1 - player.reloadT / T.reload : 1;
    ctx.fillStyle = '#2a2a24'; ctx.fillRect(bx + pw - 120, by + 8, 110, 8);
    ctx.fillStyle = rf >= 1 ? '#ffe27a' : '#9a8a5a'; ctx.fillRect(bx + pw - 120, by + 8, 110 * rf, 8);
  }

  function drawMinimap() {
    const mw = Math.min(230, W * 0.22), k = mw / WW, mh = WH * k, x0 = W - mw - 12, y0 = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
    ctx.fillStyle = L().ground[0]; ctx.globalAlpha = 0.6; ctx.fillRect(x0, y0, mw, mh); ctx.globalAlpha = 1;
    for (const o of obstacles) {
      if (o.dead) continue;
      ctx.fillStyle = o.type === 'tree' ? 'rgba(20,50,20,0.7)' : 'rgba(40,36,30,0.85)';
      ctx.fillRect(x0 + o.x * k, y0 + o.y * k, Math.max(1, o.w * k), Math.max(1, o.h * k));
    }
    for (const t of tanks) {
      if (!t.dead && !visibleToPlayer(t)) continue;
      ctx.fillStyle = t.dead ? '#444' : t === player ? '#fff' : TEAM[t.team].accent;
      const s = t === player ? 4 : 3;
      ctx.fillRect(x0 + t.x * k - s / 2, y0 + t.y * k - s / 2, s, s);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    if (W3D && cam3.vp) {
      ctx.beginPath();
      [[0, 0], [W, 0], [W, H], [0, H]].forEach((c, i) => { const q = screenToWorld(c[0], c[1]); const x = x0 + clamp(q.x, -200, WW + 200) * k, y = y0 + clamp(q.y, -200, WH + 200) * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, mw, mh); ctx.clip(); ctx.restore();
      ctx.stroke();
    } else ctx.strokeRect(x0 + (camX - W / 2 / S) * k, y0 + (camY - H / 2 / S) * k, W / S * k, H / S * k);
    return { bottom: y0 + mh + 3 };
  }

  // ===================== Vitrine 3D du menu =====================
  const viewer = { ang: 0.8, elev: 0.33, drag: null, xray: false, dist: 1 };
  const groundMesh = R3 ? (() => { const g = new G3.Builder(); g.ground(16, 64); return R3.upload(g); })() : null;
  function drawTank3D(id, w, h, ang, elev, xray, turretAng, clear) {
    const M4 = G3.M4, I = TYPES[id].I, Sd = I.S;
    R3.begin(w, h, clear);
    const d = (6.2 + Sd.L * 0.75) * (xray ? 0.72 : 1);
    const eye = [Math.cos(ang) * Math.cos(elev) * d, Math.sin(ang) * Math.cos(elev) * d, Math.sin(elev) * d + 1.0];
    R3.camera(M4.lookAt(eye, [0, 0, Sd.ht * 0.6], [0, 0, 1]), M4.persp(0.6, w / h, 0.1, 200), eye, [-0.55, 0.35, 0.75]);
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
      R3.draw(MESH[id].hull, M4.ident(), { camo: TEAM[0].camo });
      R3.draw(MESH[id].turret, tm, { camo: TEAM[0].camo });
    }
  }
  function renderViewer(dt) {
    const vc = $('viewer');
    if (!vc || !vc.clientWidth) return;
    const w = Math.round(vc.clientWidth * DPR), h = Math.round(vc.clientHeight * DPR);
    if (vc.width !== w || vc.height !== h) { vc.width = w; vc.height = h; }
    if (!viewer.drag) viewer.ang += dt * 0.22;
    const ta = Math.sin(viewerT * 0.4) * 0.35;
    drawTank3D(chosenType, w, h, viewer.ang, viewer.elev, viewer.xray, ta, [0.07, 0.08, 0.07, 1]);
    const c2 = vc.getContext('2d');
    c2.drawImage(R3.canvas, 0, 0);
    if (viewer.xray) {
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
  }

  // ===================== Écrans =====================
  const $ = id => document.getElementById(id);
  function specsHTML(T) {
    const Sd = T.S, A = Sd.armor;
    const eff = a => Math.round(a[0] / Math.cos(a[1] * D2R));
    const row = (l, a) => `<tr><td>${l}</td><td>${a[0]} mm à ${a[1]}°</td><td>≈ ${eff(a)} mm</td></tr>`;
    let h = `<div class="specTitle">${T.name} <small>${T.cls}</small></div><div class="specSub">${Sd.inspired} · ${Sd.real}</div>`;
    h += `<div class="specLine">Canon ${Sd.gun.name} · obus perforant ${String(Ballistics.shell(T.id, 'APHE').m).replace('.', ',')} kg à ${Ballistics.shell(T.id, 'APHE').v0} m/s · rechargement ${T.reload.toFixed(1)} s · ${T.kmh} km/h</div>`;
    h += `<div class="specLine">Équipage : ${Sd.crew.map(r => TankModels.NAMES[r]).join(', ')}</div>`;
    h += '<table class="spec"><tr><th>Blindage</th><th>Épaisseur</th><th>Effectif</th></tr>';
    h += row('Caisse avant (haut)', A.hull.up) + row('Caisse avant (bas)', A.hull.low) + row('Flancs de caisse', A.hull.side) + row('Arrière de caisse', A.hull.rear);
    if (A.turret) h += row('Tourelle avant', A.turret.front) + row('Masque de canon', A.turret.mantlet) + row('Flancs de tourelle', A.turret.side) + row('Arrière de tourelle', A.turret.rear);
    h += `<tr><td>Toit</td><td>${A.hull.roof} mm</td><td></td></tr></table>`;
    h += '<table class="spec"><tr><th>Obus</th><th>100 m</th><th>500 m</th><th>Coups</th></tr>';
    for (const k of SHELL_KEYS) h += `<tr><td>${Ballistics.shell(T.id, k).name}</td><td>${Math.round(penAt(T, k, 100 / RK))} mm</td><td>${Math.round(penAt(T, k, 500 / RK))} mm</td><td>${T.ammo[k]}</td></tr>`;
    return h + '</table>';
  }
  function buildMenu() {
    const tc = $('tankCards'); tc.innerHTML = '';
    for (const T of Object.values(TYPES)) {
      const d = document.createElement('div');
      d.className = 'card tcard' + (T.id === chosenType ? ' sel' : '');
      d.innerHTML = `<canvas class="thumb" width="240" height="130"></canvas><b>${T.name}</b><small>${T.cls}${T.arc ? ' · sans tourelle' : ''}</small>`;
      d.onclick = () => { chosenType = T.id; buildMenu(); };
      tc.appendChild(d);
      if (R3) {
        const c = d.querySelector('canvas');
        drawTank3D(T.id, 480, 260, 0.75, 0.3, false, 0.25, [0.09, 0.1, 0.09, 1]);
        c.width = 480; c.height = 260;
        c.getContext('2d').drawImage(R3.canvas, 0, 0);
      }
    }
    $('specs').innerHTML = specsHTML(TYPES[chosenType]);
    $('showcase').classList.toggle('no3d', !R3);
    const lc = $('levelCards'); lc.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const d = document.createElement('div');
      const locked = i > unlocked;
      d.className = 'card' + (i === levelIdx ? ' sel' : '') + (locked ? ' locked' : '');
      d.innerHTML = `<b>${i + 1}. ${lv.name}</b><small>${locked ? '🔒 Verrouillé' : lv.sub}</small>`;
      d.onclick = () => { if (!locked) { levelIdx = i; buildMenu(); } };
      lc.appendChild(d);
    });
  }

  function startLevel() { genMap(); setup3D(); spawnWave(); }

  function showResult() {
    state = 'result';
    const win = waveResult === 'win';
    const ws = waveStats;
    const pts = Math.round(ws.kills * 200 + ws.crew * 40 + ws.mods * 15 + ws.pens * 20 - ws.ffCrew * 80 - ws.tk * 400 + (win ? 500 : 0));
    if (win) campaignScore += pts;
    const lastWave = waveIdx >= WAVES - 1;
    const lastLevel = levelIdx >= LEVELS.length - 1;
    $('resTitle').className = win ? 'win' : 'lose';
    $('resTitle').textContent = !win ? 'VAGUE PERDUE' : lastWave ? (lastLevel ? 'VICTOIRE TOTALE' : 'SECTEUR CONQUIS') : 'VAGUE REMPORTÉE';
    $('resSub').textContent = `${L().name} · vague ${waveIdx + 1}/${WAVES}` + (win ? '' : ' · ton équipe a été anéantie');
    const acc = ws.shots ? Math.round(ws.hits / ws.shots * 100) : 0;
    $('resTable').innerHTML =
      `<tr><td>Chars ennemis détruits</td><td>${ws.kills}</td></tr>` +
      `<tr><td>Perforations</td><td>${ws.pens}</td></tr>` +
      `<tr><td>Équipiers ennemis neutralisés</td><td>${ws.crew}</td></tr>` +
      `<tr><td>Modules ennemis détruits</td><td>${ws.mods}</td></tr>` +
      `<tr><td>Précision</td><td>${acc} % (${ws.hits}/${ws.shots})</td></tr>` +
      `<tr><td>Ricochets</td><td>${ws.ric}</td></tr>` +
      `<tr><td>Obus esquivés</td><td>${ws.dodged}</td></tr>` +
      `<tr><td>Équipiers alliés tués par vos tirs</td><td class="${ws.ffCrew ? 'bad' : ''}">${ws.ffCrew}</td></tr>` +
      `<tr><td>Alliés détruits par vos tirs</td><td class="${ws.tk ? 'bad' : ''}">${ws.tk}</td></tr>` +
      `<tr><td>Points de la vague</td><td>${win ? pts : 0}</td></tr>` +
      `<tr><td>Score de campagne</td><td>${campaignScore}</td></tr>`;
    const btns = $('resBtns'); btns.innerHTML = '';
    const add = (label, fn, alt) => { const b = document.createElement('button'); b.textContent = label; if (alt) b.className = 'alt'; b.onclick = () => { Sfx.init(); hide('result'); fn(); }; btns.appendChild(b); };
    if (!win) add('Réessayer la vague', () => spawnWave());
    else if (!lastWave) add('Vague suivante', () => { waveIdx++; spawnWave(); });
    else {
      if (levelIdx + 1 > unlocked && !lastLevel) { unlocked = levelIdx + 1; saveUnlocked(); }
      if (!lastLevel) add('Niveau suivant', () => { levelIdx++; waveIdx = 0; startLevel(); });
    }
    add('Menu principal', toMenu, true);
    show('result');
  }

  function show(id) { $(id).classList.add('on'); }
  function hide(id) { $(id).classList.remove('on'); }
  function toMenu() {
    hide('pause'); hide('result');
    state = 'menu'; campaignScore = 0;
    HitCam.stop();
    buildMenu(); show('menu');
  }
  let pausedFrom = 'play';
  function togglePause() {
    if (state === 'pause') { state = pausedFrom; hide('pause'); last = performance.now(); }
    else if (state === 'play' || state === 'intro' || state === 'ending') { pausedFrom = state; state = 'pause'; show('pause'); }
  }

  // Banc d'essai : un tir sur une plaque, prédiction empirique et simulation du métal
  const bench = { sim: null, t0: 0, pred: null };
  function initBench() {
    const g = $('bGun'), sS = $('bShell');
    g.innerHTML = Object.values(TYPES).map(T => `<option value="${T.id}">${Ballistics.GUNS[T.id].gun} (${T.name})</option>`).join('');
    const fillShells = () => { sS.innerHTML = SHELL_KEYS.map(k => `<option value="${k}">${Ballistics.shell(g.value, k).name}</option>`).join(''); sS.value = 'APHE'; };
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
    const perforate = pen >= ef.eff && ric < 0.5;
    bench.sim = metalFor(sb, T, ang, pen, ef.eff, perforate);
    bench.t0 = performance.now();
    bench.pred = { sb, V, pen, eff: ef.eff, angN: ef.angN, ric, perforate, T, ang, x };
    Sfx.init(); Sfx.fire(200, sb.cal > 80);
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
      x.fillText('Choisis un canon, un obus et une plaque, puis tire.', cw / 2, ch / 2);
      return;
    }
    // lecture en boucle sur 4 s, une fois le calcul terminé
    const el = (performance.now() - bench.t0) / 1000, sim = bench.sim;
    const p = sim.st.done ? ((el % 5) / 4) : Math.min(1, sim.frames.length / Math.max(1, sim.expected));
    drawMetalPanel(x, sim, 0, 0, cw, ch, Math.min(1, p), 1, true);
    const P = bench.pred, f = (v, k = 0) => v.toFixed(k).replace('.', ',');
    $('benchInfo').innerHTML =
      `<b>${P.sb.name}</b> · ${f(P.sb.m, 2)} kg · vitesse à ${P.x} m : <b>${Math.round(P.V)} m/s</b> (bouche ${P.sb.v0}) · énergie ${f(0.5 * P.sb.m * P.V * P.V / 1e6, 2)} MJ<br>` +
      `Plaque ${P.T} mm à ${P.ang}°${!P.sb.heat && !P.sb.he ? ` (normalisée ${Math.round(P.angN)}°)` : ''} → blindage effectif <b>${Math.round(P.eff)} mm</b> · pénétration <b>${Math.round(P.pen)} mm</b> · risque de ricochet ${Math.round(P.ric * 100)} %<br>` +
      `Prédiction balistique : <b>${P.perforate ? 'perforation' : P.ric >= 0.5 ? 'ricochet' : 'non perforé'}</b> · la simulation du métal est calée sur la même vitesse limite`;
  }

  $('startBtn').onclick = () => { Sfx.init(); hide('menu'); waveIdx = 0; campaignScore = 0; startLevel(); };
  $('resumeBtn').onclick = togglePause;
  $('quitBtn').onclick = toMenu;
  $('xrayBtn').onclick = () => { viewer.xray = !viewer.xray; $('xrayBtn').classList.toggle('on', viewer.xray); };
  const vc = $('viewer');
  vc.addEventListener('pointerdown', e => { viewer.drag = { x: e.clientX, y: e.clientY, a: viewer.ang, e: viewer.elev }; vc.setPointerCapture(e.pointerId); });
  vc.addEventListener('pointermove', e => {
    if (!viewer.drag) return;
    viewer.ang = viewer.drag.a - (e.clientX - viewer.drag.x) * 0.01;
    viewer.elev = clamp(viewer.drag.e + (e.clientY - viewer.drag.y) * 0.006, 0.05, 1.3);
  });
  vc.addEventListener('pointerup', () => { viewer.drag = null; });

  // ===================== Entrées =====================
  addEventListener('keydown', e => {
    if (e.repeat && keys[e.code]) return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') Sfx.toggle();
    if (e.code === 'KeyH' && state !== 'menu') { hitcamOn = !hitcamOn; if (!hitcamOn) HitCam.stop(); showMsg(hitcamOn ? "Caméra d'impact activée" : "Caméra d'impact désactivée", '#bcd8ff', 1.4); }
    if (!player || player.dead || player.ai || state === 'menu' || state === 'pause' || state === 'result') return;
    const dm = e.code.match(/^(?:Digit|Numpad)([1-5])$/);
    if (dm) {
      const key = SHELL_KEYS[Number(dm[1]) - 1];
      if (player.ammo[key] <= 0) showMsg(`Plus d'obus ${SHELLS[key].name.toLowerCase()}`, '#ff9a7a', 1.2);
      else if (key !== player.shell) {
        player.shell = key;
        player.reloadT = player.T.reload; // changer d'obus impose de recharger
        showMsg(SHELLS[key].full, '#e9d9a6', 1.2);
      }
    }
    if (e.code === 'KeyE' && state === 'play') deploySmoke(player);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
  // position de la souris dans le repère du canvas (décalage et mise à l'échelle éventuels de la page)
  function trackMouse(e) {
    const r = cv.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (W / (r.width || W));
    mouse.y = (e.clientY - r.top) * (H / (r.height || H));
  }
  addEventListener('mousemove', trackMouse);
  addEventListener('pointerdown', trackMouse);
  cv.addEventListener('mousedown', e => {
    Sfx.init();
    if (e.button === 0) {
      mouse.down = true;
      if (player && player.dead) specIdx++;
    }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { if (!W3D) return; e.preventDefault(); cam3.dist = clamp(cam3.dist * Math.exp(e.deltaY * 0.0012), 14, 120); }, { passive: false });
  cv.addEventListener('mousedown', e => { if (e.button === 2) cam3.drag = { x: e.clientX, off: cam3.off }; });
  addEventListener('mousemove', e => { if (cam3.drag) cam3.off = cam3.drag.off - (e.clientX - cam3.drag.x) * 0.006; });
  addEventListener('mouseup', e => { if (e.button === 2) cam3.drag = null; });
  cv.addEventListener('dblclick', () => { cam3.off = 0; });

  // Démarrage direct en développement
  if (Q.has('level')) levelIdx = clamp(Number(Q.get('level')) - 1, 0, LEVELS.length - 1);
  if (Q.has('type') && TYPES[Q.get('type')]) chosenType = Q.get('type');
  buildMenu();
  initBench();
  if (Q.has('level') || AUTO) {
    waveIdx = clamp(Number(Q.get('wave') || 1) - 1, 0, WAVES - 1);
    hide('menu'); startLevel();
  }
  if (Q.has('debug')) {
    window.__fa = {
      get tanks() { return tanks; }, get state() { return state; }, get stats() { return waveStats; }, get shells() { return shells; },
      get time() { return gameTime; }, get player() { return player; }, get bushes() { return bushes; }, cam3, hitcam: HitCam, TYPES, SHELLS, bench, benchFire,
      // test : tir forcé du joueur sur la cible la plus proche
      fireAt(i, key) {
        const e = tanks.filter(t => t.team === 1 && !t.dead)[i || 0];
        if (!e) return false;
        player.shell = key || player.shell; player.ammo[player.shell] = 9;
        const pv = pivot(player);
        player.turret = angNorm(Math.atan2(e.y - pv.y, e.x - pv.x) - player.angle);
        player.disp = 0; player.reloadT = 0; fireShell(player);
        return true;
      },
    };
  }
  requestAnimationFrame(frame);
})();
