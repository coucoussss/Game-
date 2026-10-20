'use strict';
// Front d'Acier : combat de chars 5 contre 5, vue de dessus.
(() => {
  // ===================== Outils =====================
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const angNorm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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

  // ===================== Données =====================
  const TYPES = {
    light: {
      id: 'light', name: 'Lynx', cls: 'Char léger', len: 40, wid: 26, hp: 420, armor: [45, 30, 20],
      pen: 125, dmg: 115, reload: 2.3, speed: 150, rev: 70, accel: 230, turn: 2.3, tturn: 3.2,
      shell: 640, disp: 0.016, barrel: 22, bw: 4, tr: 9, piv: 0.05, view: 760, range: 470,
    },
    medium: {
      id: 'medium', name: 'Panthère', cls: 'Char moyen', len: 46, wid: 30, hp: 650, armor: [100, 55, 40],
      pen: 180, dmg: 190, reload: 3.3, speed: 112, rev: 52, accel: 170, turn: 1.6, tturn: 2.0,
      shell: 700, disp: 0.011, barrel: 30, bw: 5, tr: 11, piv: 0, view: 680, range: 420,
    },
    heavy: {
      id: 'heavy', name: 'Tigre', cls: 'Char lourd', len: 52, wid: 34, hp: 950, armor: [160, 95, 60],
      pen: 225, dmg: 280, reload: 4.6, speed: 80, rev: 38, accel: 115, turn: 1.1, tturn: 1.3,
      shell: 720, disp: 0.010, barrel: 34, bw: 6, tr: 13, piv: 0, view: 620, range: 320,
    },
    destroyer: {
      id: 'destroyer', name: 'Jagd', cls: 'Chasseur de chars', len: 50, wid: 32, hp: 720, armor: [140, 50, 35],
      pen: 270, dmg: 340, reload: 5.0, speed: 95, rev: 45, accel: 145, turn: 1.4, tturn: 1.1,
      shell: 780, disp: 0.007, barrel: 36, bw: 6, tr: 7, piv: 0.2, view: 720, range: 600, arc: 0.21,
    },
  };
  // Marge de points de vie pour des combats un peu plus longs
  for (const T of Object.values(TYPES)) T.hp = Math.round(T.hp * 1.3);
  const TEAM = [
    { hull: '#56663a', top: '#66794a', dark: '#3d4a28', accent: '#4aa3ff', label: 'Allié' },
    { hull: '#6a6964', top: '#7d7c76', dark: '#4a4945', accent: '#ff4a3d', label: 'Ennemi' },
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

  // Réglages de développement : ?auto ?god ?speed=4 ?level=2 ?wave=1
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
    S = clamp(Math.min(W / 1500, H / 900), 0.45, 1.3);
  }
  addEventListener('resize', resize);
  resize();

  let state = 'menu'; // menu, intro, play, ending, result, pause
  let levelIdx = 0, waveIdx = 0, chosenType = 'medium';
  let tanks = [], shells = [], parts = [], texts = [], feed = [], smokes = [];
  let obstacles = [], bushes = [];
  let player = null, specIdx = 0;
  let camX = WW / 2, camY = WH / 2, shake = 0;
  const spotted = [new Set(), new Set()];
  let spotTimer = 0, waveTime = 0, introT = 0, endT = 0, waveResult = null, gameTime = 0;
  let groundCv = null, gctx = null;
  let waveStats = null, campaignScore = 0, msg = null, ffMsgT = 0;
  let tankId = 0, shellId = 0;
  const mouse = { x: W / 2, y: H / 2, down: false };
  const keys = {};

  let unlocked = 0;
  try { unlocked = Number(localStorage.getItem('frontdacier.unlocked')) || 0; } catch (e) { /* stockage indisponible */ }
  function saveUnlocked() { try { localStorage.setItem('frontdacier.unlocked', String(unlocked)); } catch (e) { /* ignoré */ } }

  const L = () => LEVELS[levelIdx];

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
      const blobs = [];
      for (let k = 0; k < n; k++) blobs.push({ x: cx + rr(-30, 30), y: cy + rr(-20, 20), r: rr(22, 38) });
      for (const b of blobs) bushes.push(b);
    }
    buildGround(R);
    buildGrid();
  }

  function buildGround(R) {
    const lv = L();
    groundCv = document.createElement('canvas');
    groundCv.width = WW; groundCv.height = WH;
    gctx = groundCv.getContext('2d');
    gctx.fillStyle = lv.ground[0];
    gctx.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 2600; i++) {
      gctx.globalAlpha = 0.18 + R() * 0.2;
      gctx.fillStyle = lv.ground[1 + Math.floor(R() * 2)];
      const r = 10 + R() * 60;
      gctx.beginPath(); gctx.ellipse(R() * WW, R() * WH, r, r * (0.5 + R() * 0.5), R() * TAU, 0, TAU); gctx.fill();
    }
    gctx.globalAlpha = 1;
    // grain fin
    for (let i = 0; i < 26000; i++) {
      gctx.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      gctx.fillRect(R() * WW, R() * WH, 2, 2);
    }
    // routes
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
    // ombres portées fixes des bâtiments et rochers
    for (const o of obstacles) {
      if (o.type === 'tree') continue;
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
    let s = nearestFree(cellOf(sx, sy)), g = nearestFree(cellOf(gx, gy));
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
    // lissage : on saute les points intermédiaires visibles en ligne droite
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

  // ===================== Chars =====================
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
    return {
      id: ++tankId, T, team, x, y, angle, turret: 0, speed: 0, turnRate: 0, turretRate: 0, vx: 0, vy: 0,
      hp: T.hp, dead: false, deadT: 0, isPlayer, name, r: (T.len + T.wid) / 4,
      reloadT: rnd(0.8, 1.6), ammo: 'AP', disp: T.disp * 3, smoke: 2, trackT: 0, fireT: 0, fireBy: null,
      revealT: 0, recoil: 0, flash: 0, trackAcc: 0, treadPhase: 0, hitFlash: 0,
      in: { throttle: 0, turn: 0, aim: angle, fire: false },
      ai: (isPlayer && !AUTO) ? null : makeAI(skill),
    };
  }
  function pivot(t) {
    const o = t.T.len * t.T.piv;
    return { x: t.x + Math.cos(t.angle) * o, y: t.y + Math.sin(t.angle) * o };
  }

  function spawnWave() {
    tanks = []; shells = []; smokes = []; texts = []; feed = []; parts = [];
    spotted[0].clear(); spotted[1].clear();
    const lv = L();
    const allyTypes = levelIdx < 2 ? ['medium', 'light', 'medium', 'heavy'] : ['medium', 'heavy', 'destroyer', 'light'];
    const enemyTypes = lv.waves[waveIdx];
    const eSkill = Math.min(0.95, 0.3 + levelIdx * 0.14 + waveIdx * 0.04);
    const aSkill = Math.min(0.85, 0.5 + levelIdx * 0.07);
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
    waveStats = { kills: 0, dmg: 0, ff: 0, tk: 0, hits: 0, shots: 0, ric: 0, dodged: 0 };
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
          let range = a.T.view * (night ? 0.6 : 1);
          if (bush) range = Math.min(range, 210);
          if (e.revealT > 0) range *= 1.3;
          if (d < range && losClear(a.x, a.y, e.x, e.y, true)) { set.add(e); break; }
        }
      }
    }
  }

  // ===================== IA =====================
  // Les épaves arrêtent les obus : l'IA ne tire pas à travers
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
        const sc = d * (los ? 1 : 1.7) * (e.hp < e.T.hp * 0.3 ? 0.8 : 1);
        if (sc < bs) { bs = sc; best = e; bestLos = los; }
      }
      if (best && best !== ai.target) ai.reactT = ai.react * rnd(0.6, 1.3);
      ai.target = best; ai.los = bestLos;
      if (best) { ai.lastKnown = { x: best.x, y: best.y }; ai.noContactT = 0; }
      else {
        // Sans contact trop longtemps : l'état-major transmet une position approximative
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
      const range = T.range * (t.hp < T.hp * 0.3 ? 1.3 : 1);
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

      if (t.smoke > 0 && best && ai.los && t.hp < T.hp * 0.35 && Math.random() < 0.4) { deploySmoke(t); ai.retreatT = 5; }
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
      if (Math.hypot(wp.x - t.x, wp.y - t.y) < 28) {
        ai.pi++;
        wp = ai.path[ai.pi];
      }
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
    // Coincé contre un obstacle : on recule en braquant
    if (Math.abs(thr) > 0.3 && Math.hypot(t.vx, t.vy) < 6 && ai.unstickT <= 0 && t.trackT <= 0) {
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
      const tt = d / T.shell;
      const px = tg.x + tg.vx * tt * ai.lead, py = tg.y + tg.vy * tt * ai.lead;
      aim = Math.atan2(py - pv.y, px - pv.x) + ai.aimErr;
      if (ai.los && ai.reactT <= 0 && t.reloadT <= 0 && seen.has(tg)) {
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
        let wa = b.T.hp / (a.T.hp + b.T.hp), wb = 1 - wa;
        if (a.dead) { wa = 0; wb = 1; } else if (b.dead) { wa = 1; wb = 0; }
        a.x -= nx * p * wa; a.y -= ny * p * wa;
        b.x += nx * p * wb; b.y += ny * p * wb;
      }
    }
  }

  function updateTank(t, dt) {
    if (t.dead) {
      t.deadT += dt;
      if (t.deadT < 30 && Math.random() < dt * (t.deadT < 8 ? 12 : 4)) addSmoke(t.x + rnd(-8, 8), t.y + rnd(-8, 8), rnd(8, 14), 'rgba(30,28,26,', 3.5);
      if (t.deadT < 7 && Math.random() < dt * 22) addFire(t.x + rnd(-10, 10), t.y + rnd(-8, 8));
      return;
    }
    const T = t.T, inp = t.in;
    let thr = clamp(inp.throttle, -1, 1), turn = clamp(inp.turn, -1, 1);
    if (t.trackT > 0) { t.trackT -= dt; thr = 0; turn = 0; }
    const target = thr >= 0 ? thr * T.speed : thr * T.rev;
    const braking = target === 0 || (t.speed !== 0 && Math.sign(target) !== Math.sign(t.speed));
    const maxd = T.accel * (braking ? 2.2 : 1) * dt;
    t.speed += clamp(target - t.speed, -maxd, maxd);
    const tr = turn * T.turn * (1 - 0.3 * Math.abs(t.speed) / T.speed);
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
    t.trackAcc += moved + Math.abs(tr) * 4 * dt * 10;
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
    const rot = clamp(d, -T.tturn * dt, T.tturn * dt);
    t.turret = T.arc ? clamp(t.turret + rot, -T.arc, T.arc) : angNorm(t.turret + rot);
    t.turretRate = rot / dt;

    // Dispersion : elle augmente en mouvement et se resserre à l'arrêt
    const goal = T.disp * (1 + 2.6 * Math.abs(t.speed) / T.speed + 1.6 * Math.abs(tr) / T.turn + 1.1 * Math.abs(t.turretRate) / T.tturn);
    t.disp += (goal - t.disp) * Math.min(1, dt * (goal > t.disp ? 6 : 1.3));

    if (t.reloadT > 0) { t.reloadT -= dt; if (t.reloadT <= 0 && t === player) Sfx.reload(); }
    t.recoil = Math.max(0, t.recoil - dt * 3);
    t.flash = Math.max(0, t.flash - dt);
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    t.revealT -= dt;
    if (inp.fire && t.reloadT <= 0 && state === 'play') fireShell(t);

    if (t.fireT > 0) {
      t.fireT -= dt;
      damage(t, 16 * dt, t.fireBy, true);
      if (Math.random() < dt * 30) addFire(t.x + rnd(-10, 10), t.y + rnd(-8, 8));
    }
  }

  function fireShell(t) {
    const T = t.T;
    const ta = t.angle + t.turret;
    const ang = ta + gauss() * t.disp;
    const pv = pivot(t), ml = T.tr + T.barrel;
    const mx = pv.x + Math.cos(ta) * ml, my = pv.y + Math.sin(ta) * ml;
    const he = t.ammo === 'HE';
    const sp = T.shell * (he ? 0.82 : 1);
    shells.push({
      id: ++shellId, x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, team: t.team, owner: t, by: t,
      he, pen: he ? T.pen * 0.4 : T.pen, dmg: T.dmg, range: 1500, trail: [], ric: 0, whiz: false, warned: false,
    });
    t.reloadT = T.reload;
    t.disp += T.disp * 3;
    t.recoil = 1; t.flash = 0.09; t.revealT = 3;
    t.speed -= 14 * Math.sign(Math.cos(t.turret)) * (T.dmg / 200);
    if (t === player) { waveStats.shots++; shake = Math.max(shake, 5); }
    for (let i = 0; i < 6; i++) addSmoke(mx + Math.cos(ta) * rnd(0, 18), my + Math.sin(ta) * rnd(0, 18), rnd(5, 10), 'rgba(170,165,150,', 1.2, Math.cos(ta) * rnd(20, 60), Math.sin(ta) * rnd(20, 60));
    parts.push({ k: 'flash', x: mx, y: my, life: 0.08, max: 0.08, size: 26 + T.dmg / 12 });
    // souffle au sol
    for (let i = 0; i < 4; i++) addDust(mx + rnd(-10, 10), my + rnd(-10, 10));
    Sfx.fire(listenerDist(mx, my), T.id === 'heavy' || T.id === 'destroyer');
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
        const h = segAABB(lx, ly, ldx, ldy, -hl, -hw, hl, hw);
        if (h && (!best || h.t < best.t)) {
          const l = Math.hypot(ldx, ldy) || 1;
          best = { t: h.t, tank: t, lnx: h.nx, lny: h.ny, cosI: clamp(-(ldx * h.nx + ldy * h.ny) / l, 0, 1), c, sn };
        }
      }
      // Sifflement d'un obus qui frôle le joueur
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
        s.x = hx; s.y = hy;
        let res;
        if (best.tank) {
          res = hitTank(s, best.tank, best, hx, hy);
        } else res = hitObstacle(s, best.o, best, hx, hy);
        if (res === 'stop') remove = true;
      } else {
        s.x += dx; s.y += dy;
        s.skipObs = null;
      }
      s.range -= s.sp * dt;
      if (!remove && (s.range <= 0 || s.x < -50 || s.y < -50 || s.x > WW + 50 || s.y > WH + 50)) {
        remove = true;
        if (s.range <= 0) { // l'obus retombe et s'enfonce dans le sol
          if (s.he) explode(s.x, s.y, s, null);
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

  function hitTank(s, t, h, hx, hy) {
    if (t === player) s.hitPlayer = true;
    if (t.dead) {
      sparks(hx, hy, 6);
      if (s.he) explode(hx, hy, s, null);
      Sfx.clang(listenerDist(hx, hy));
      return 'stop';
    }
    const face = h.lnx > 0.5 ? 0 : h.lnx < -0.5 ? 2 : 1; // avant, flanc, arrière
    const armor = t.T.armor[face];
    const shooter = s.by;
    const show = visibleToPlayer(t) || shooter === player;
    if (t.ai && shooter && shooter.team !== t.team && !t.ai.target) t.ai.lastKnown = { x: shooter.x, y: shooter.y };
    if (shooter === player) waveStats.hits++;
    // Ricochet : impact trop rasant
    if (!s.he && h.cosI < 0.34 && s.ric < 1) {
      const nx = h.lnx * h.c - h.lny * h.sn, ny = h.lnx * h.sn + h.lny * h.c;
      const vd = s.vx * nx + s.vy * ny;
      s.vx = (s.vx - 2 * vd * nx) * 0.72; s.vy = (s.vy - 2 * vd * ny) * 0.72;
      s.sp = Math.hypot(s.vx, s.vy); s.pen *= 0.6; s.ric++;
      s.x += nx * 2; s.y += ny * 2;
      s.owner = t; // l'obus dévié peut toucher n'importe qui d'autre
      sparks(hx, hy, 10);
      Sfx.ricochet(listenerDist(hx, hy));
      if (show) floatText(hx, hy - 10, 'Ricochet', '#cfe3ff');
      if (shooter === player) waveStats.ric++;
      return 'continue';
    }
    const eff = armor / Math.max(0.08, h.cosI);
    const pen = s.pen * rnd(0.85, 1.15);
    t.hitFlash = 0.15;
    if (pen >= eff) {
      let dmg = s.dmg * rnd(0.8, 1.2) * (s.he ? 1.1 : 1);
      let note = null;
      if (face === 1 && Math.random() < 0.3) { t.trackT = 4; note = 'Chenille cassée'; }
      if (face === 2 && Math.random() < 0.35) { t.fireT = 6; t.fireBy = shooter; note = 'Incendie !'; }
      if (Math.random() < 0.03) { dmg = t.hp + 1; note = 'Soute à munitions !'; }
      if (show) {
        const col = t === player ? '#ff5a4a' : t.team === 0 ? '#ffaa44' : '#ffe27a';
        floatText(hx, hy - 12, '-' + Math.round(dmg), col, 1.2);
        if (note) floatText(hx, hy + 6, note, '#ffb070');
      }
      sparks(hx, hy, 14);
      Sfx.penetrate(listenerDist(hx, hy));
      if (t === player) shake = Math.max(shake, 12);
      damage(t, dmg, shooter);
    } else {
      if (s.he) {
        const dmg = s.dmg * rnd(0.18, 0.28);
        if (show) floatText(hx, hy - 12, '-' + Math.round(dmg), '#e0d0a0');
        damage(t, dmg, shooter);
      } else if (show) floatText(hx, hy - 12, 'Non pénétré', '#c8c8c8');
      sparks(hx, hy, 8);
      Sfx.clang(listenerDist(hx, hy));
      if (t === player) shake = Math.max(shake, 6);
    }
    if (s.he) explode(hx, hy, s, t);
    return 'stop';
  }

  function hitObstacle(s, o, h, hx, hy) {
    if (o.type === 'tree') {
      knockTree(o, Math.atan2(s.vy, s.vx));
      if (s.he) { explode(hx, hy, s, null); return 'stop'; }
      s.pen *= 0.8; s.skipObs = o;
      return 'continue';
    }
    if (s.he) { explode(hx, hy, s, null); return 'stop'; }
    sparks(hx, hy, o.type === 'rock' ? 10 : 5);
    for (let k = 0; k < 5; k++) addDust(hx + rnd(-8, 8), hy + rnd(-8, 8), o.type === 'rock' ? '#8a8780' : L().wall);
    if (o.hp !== Infinity) damageObstacle(o, s.dmg * 0.5);
    Sfx.impact(listenerDist(hx, hy));
    return 'stop';
  }

  function explode(x, y, s, direct) {
    const R = 75;
    for (const t of tanks) {
      if (t.dead || t === direct) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d > R + t.r) continue;
      if (!losClear(x, y, t.x, t.y, false)) continue;
      const dmg = s.dmg * 0.28 * (1 - d / (R + t.r)) * clamp(50 / t.T.armor[1], 0.3, 1.2);
      if (dmg > 2) {
        if (visibleToPlayer(t)) floatText(t.x, t.y - 20, '-' + Math.round(dmg), t.team === 0 && s.by.team === 0 ? '#ffaa44' : '#e0d0a0');
        damage(t, dmg, s.by);
      }
    }
    for (const o of obstacles) {
      if (o.dead || o.hp === Infinity) continue;
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      const d = Math.hypot(cx - x, cy - y);
      if (d > R) continue;
      if (o.type === 'tree') knockTree(o, Math.atan2(o.y - y, o.x - x));
      else damageObstacle(o, s.dmg * 1.4 * (1 - d / R));
    }
    boom(x, y, 0.8);
    stampCrater(x, y, 18);
  }

  function damageObstacle(o, amount) {
    o.hp -= amount;
    if (o.hp <= 0 && !o.dead) {
      o.dead = true;
      // gravats franchissables
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
    o.dead = true;
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

  function damage(t, amount, by, dot) {
    if (t.dead || amount <= 0) return;
    if (GOD && t === player) return;
    t.hp -= amount;
    if (by && by !== t) {
      if (by.team === t.team) {
        if (by === player) {
          waveStats.ff += amount;
          if (!dot && gameTime - ffMsgT > 1.2) { ffMsgT = gameTime; showMsg('⚠ TIR ALLIÉ !', '#ffaa44'); Sfx.alarm(); }
        }
      } else if (by === player) waveStats.dmg += amount;
    }
    if (t.hp <= 0) { t.hp = 0; destroyTank(t, by); }
  }

  function destroyTank(t, by) {
    t.dead = true; t.deadT = 0; t.fireT = 0; t.speed = 0; t.trackT = 0;
    boom(t.x, t.y, 1.6);
    stampCrater(t.x, t.y, 30);
    const ff = by && by !== t && by.team === t.team;
    feed.unshift({ a: by ? by.name : '—', at: by ? by.team : -1, v: t.name, vt: t.team, ff, life: 7 });
    if (feed.length > 6) feed.pop();
    if (by === player) {
      if (ff) { waveStats.tk++; showMsg('Allié détruit par vos tirs !', '#ff7a4a'); }
      else if (by !== t) { waveStats.kills++; showMsg('Char ennemi détruit', '#ffe27a'); }
    }
    if (t === player) showMsg('Votre char est détruit. Vous observez un allié (clic pour changer)', '#ff7a5c', 4);
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
      parts.push({ k: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.9), max: 0.9, rot: Math.random() * TAU });
    }
    sparks(x, y, 12 * k);
    const d = player ? Math.hypot(player.x - x, player.y - y) : 9999;
    shake = Math.max(shake, clamp(22 * k * (1 - d / 900), 0, 22));
    Sfx.explosion(listenerDist(x, y), k > 1);
  }
  function stampTracks(t) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle), T = t.T;
    gctx.fillStyle = L().track;
    for (const side of [-1, 1]) {
      const ox = -s * side * (T.wid / 2 - T.wid * 0.12), oy = c * side * (T.wid / 2 - T.wid * 0.12);
      for (const f of [-0.4, 0.4]) {
        gctx.save();
        gctx.translate(t.x + ox + c * T.len * f, t.y + oy + s * T.len * f);
        gctx.rotate(t.angle);
        gctx.fillRect(-4, -T.wid * 0.12, 8, T.wid * 0.24);
        gctx.restore();
      }
    }
  }
  function stampCrater(x, y, r) {
    const g = gctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,16,12,0.55)'); g.addColorStop(0.7, 'rgba(30,24,18,0.3)'); g.addColorStop(1, 'rgba(30,24,18,0)');
    gctx.fillStyle = g;
    gctx.beginPath(); gctx.arc(x, y, r, 0, TAU); gctx.fill();
  }
  function floatText(x, y, text, color, scale = 1) {
    texts.push({ x, y, text, color, life: 1.3, max: 1.3, scale });
  }
  function showMsg(text, color, life = 2) { msg = { text, color, life, max: life }; }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.k === 'smoke' || p.k === 'dust') { p.vx *= 0.96; p.vy *= 0.96; p.size += p.grow * dt; }
      else if (p.k === 'spark' || p.k === 'debris' || p.k === 'leaf') { p.vx *= 0.92; p.vy *= 0.92; }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.life -= dt; s.r = Math.min(s.maxR, s.r + 70 * dt);
      if (s.life <= 0) smokes.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) texts.splice(i, 1); }
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].life -= dt; if (feed[i].life <= 0) feed.splice(i, 1); }
    if (msg) { msg.life -= dt; if (msg.life <= 0) msg = null; }
  }

  // ===================== Boucle =====================
  function screenToWorld(x, y) { return { x: camX + (x - W / 2) / S, y: camY + (y - H / 2) / S }; }
  function worldToScreen(x, y) { return { x: (x - camX) * S + W / 2, y: (y - camY) * S + H / 2 }; }

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
      if (!a || !e) { state = 'ending'; endT = 2.6; waveResult = a ? 'win' : 'lose'; showMsg(a ? 'VAGUE REMPORTÉE' : 'VAGUE PERDUE', a ? '#b8e07a' : '#ff7a5c', 2.6); }
    } else if (state === 'ending') {
      endT -= dt;
      if (endT <= 0) showResult();
    }
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state === 'intro' || state === 'play' || state === 'ending') {
      acc += dt * timeScale;
      let n = 0;
      while (acc >= STEP && n++ < 40) { step(STEP); acc -= STEP; }
      if (n >= 40) acc = 0;
    }
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

  function render(dt) {
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

    // chars (épaves d'abord)
    for (const t of tanks) if (t.dead && inView(t.x, t.y)) drawTank(t);
    for (const t of tanks) if (!t.dead && inView(t.x, t.y) && visibleToPlayer(t)) drawTank(t);

    // obstacles
    for (const o of obstacles) {
      if (o.dead || o.x > vx1 || o.x + o.w < vx0 || o.y > vy1 || o.y + o.h < vy0) continue;
      drawObstacle(o);
    }
    // buissons (au-dessus des chars : ils les cachent)
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

    // fumigènes
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
    const T = t.T, team = TEAM[t.team], Ln = T.len, Wd = T.wid, tw = Wd * 0.25;
    const hull = t.dead ? '#2b2724' : team.hull, top = t.dead ? '#35302b' : team.top, dk = t.dead ? '#1d1a18' : team.dark;
    ctx.save();
    ctx.translate(t.x, t.y); ctx.rotate(t.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-Ln / 2 + 4, -Wd / 2 + 4, Ln, Wd);
    // chenilles
    ctx.fillStyle = '#1e1e1c';
    ctx.fillRect(-Ln / 2, -Wd / 2, Ln, tw); ctx.fillRect(-Ln / 2, Wd / 2 - tw, Ln, tw);
    if (!t.dead) {
      ctx.fillStyle = '#4a4a46';
      const ph = ((t.treadPhase % 5) + 5) % 5;
      for (let x = -Ln / 2 + ph; x < Ln / 2 - 1; x += 5) { ctx.fillRect(x, -Wd / 2, 1.6, tw); ctx.fillRect(x, Wd / 2 - tw, 1.6, tw); }
      if (t.trackT > 0) { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(-3, -Wd / 2 - 2, 6, 3); ctx.fillRect(-3, Wd / 2 - 1, 6, 3); }
    }
    // caisse
    ctx.fillStyle = hull;
    ctx.fillRect(-Ln / 2 + 2, -Wd / 2 + tw - 2, Ln - 4, Wd - 2 * tw + 4);
    ctx.fillStyle = shade(t.dead ? '#2b2724' : team.hull, 1.15);
    ctx.fillRect(Ln / 2 - 9, -Wd / 2 + tw - 2, 7, Wd - 2 * tw + 4); // glacis
    ctx.fillStyle = dk;
    for (let k = 0; k < 3; k++) ctx.fillRect(-Ln / 2 + 4 + k * 3.2, -Wd / 2 + tw + 1, 1.5, Wd - 2 * tw - 2); // grilles moteur
    if (!t.dead) { ctx.fillStyle = team.accent; ctx.fillRect(-Ln / 2 + 2, -2, 3, 4); }
    if (T.arc) { // casemate du chasseur
      ctx.fillStyle = top;
      ctx.fillRect(-Ln * 0.25, -Wd / 2 + tw - 1, Ln * 0.62, Wd - 2 * tw + 2);
      ctx.fillStyle = dk; ctx.fillRect(-Ln * 0.22, -3, 6, 6);
    }
    if (t.hitFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${t.hitFlash * 3})`; ctx.fillRect(-Ln / 2, -Wd / 2, Ln, Wd); }
    ctx.restore();

    // tourelle
    const pv = pivot(t), ta = t.angle + t.turret, rec = -t.recoil * 5;
    ctx.save();
    ctx.translate(pv.x, pv.y); ctx.rotate(ta);
    ctx.fillStyle = t.dead ? '#1a1816' : '#2c2e26';
    ctx.fillRect(T.tr - 3 + rec, -T.bw / 2, T.barrel + 3, T.bw);
    ctx.fillRect(T.tr + T.barrel - 4 + rec, -T.bw / 2 - 1.2, 5, T.bw + 2.4);
    if (!T.arc) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(2, 2, T.tr + 1, 0, TAU); ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(T.tr, -T.tr * 0.7); ctx.lineTo(T.tr, T.tr * 0.7); ctx.lineTo(-T.tr * 0.4, T.tr); ctx.lineTo(-T.tr * 1.1, T.tr * 0.6);
      ctx.lineTo(-T.tr * 1.1, -T.tr * 0.6); ctx.lineTo(-T.tr * 0.4, -T.tr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.arc(-T.tr * 0.35, -T.tr * 0.3, T.tr * 0.28, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = top; ctx.fillRect(-4, -5, 9, 10);
    }
    if (t.flash > 0) {
      ctx.fillStyle = `rgba(255,230,140,${t.flash * 10})`;
      ctx.beginPath(); ctx.arc(T.tr + T.barrel + 8, 0, 9, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (t.fireT > 0 && Math.random() < 0.5) addFire(t.x + rnd(-8, 8), t.y + rnd(-8, 8));
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
      ctx.fillStyle = shade(lv.wall.length === 7 ? lv.wall : '#999999', 0.85);
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      const horiz = o.w > o.h;
      for (let k = 10; k < (horiz ? o.w : o.h); k += 12) horiz ? ctx.fillRect(o.x + k, o.y, 1.5, o.h) : ctx.fillRect(o.x, o.y + k, o.w, 1.5);
    } else {
      // bâtiment à toit à deux pans
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
    // dégâts : trous sombres
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
      const tr = s.trail;
      if (tr.length >= 2) {
        const x0 = tr[0], y0 = tr[1];
        const g = ctx.createLinearGradient(x0, y0, s.x, s.y);
        g.addColorStop(0, 'rgba(255,160,60,0)');
        g.addColorStop(1, s.he ? 'rgba(255,110,50,0.9)' : 'rgba(255,220,140,0.9)');
        ctx.strokeStyle = g; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.fillStyle = s.he ? 'rgba(255,120,60,0.35)' : 'rgba(255,230,150,0.35)';
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
      if (!s.warned) s.warned = true;
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
        // phares
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
      const p = worldToScreen(t.x, t.y - t.T.len * 0.75);
      if (p.x < -50 || p.y < -50 || p.x > W + 50 || p.y > H + 50) continue;
      const w = 38, f = t.hp / t.T.hp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 6);
      ctx.fillStyle = t.team === 0 ? (t === player ? '#7ad06a' : '#5aa8ff') : '#ff5040';
      ctx.fillRect(p.x - w / 2, p.y, w * f, 4);
      if (t !== player) {
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = t.team === 0 ? '#a8d0ff' : '#ffb0a8';
        ctx.fillText(t.T.name + (t.team === 0 ? ' · ' + t.name.replace('Allié ', 'A') : ''), p.x, p.y - 4);
      }
    }
    for (const tx of texts) {
      const p = worldToScreen(tx.x, tx.y);
      const a = Math.min(1, tx.life / tx.max * 2);
      ctx.font = `700 ${Math.round(13 * tx.scale)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,' + a * 0.7 + ')';
      ctx.fillText(tx.text, p.x + 1, p.y + 1);
      ctx.globalAlpha = a; ctx.fillStyle = tx.color; ctx.fillText(tx.text, p.x, p.y); ctx.globalAlpha = 1;
    }
    // flèches au bord de l'écran pour les obus menaçants hors champ
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

  function drawHUD() {
    const lv = L();
    ctx.textAlign = 'center';
    // bandeau supérieur
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

    // fil des destructions
    ctx.textAlign = 'right'; ctx.font = '600 12px system-ui, sans-serif';
    feed.forEach((f, i) => {
      const y = 22 + i * 20;
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W - 300, y - 13, 290, 18);
      const right = `${f.v}`;
      ctx.fillStyle = f.vt === 0 ? '#8cc4ff' : '#ff8c80';
      ctx.fillText(right, W - 16, y);
      const rw = ctx.measureText(right).width;
      ctx.fillStyle = f.ff ? '#ffaa44' : '#ddd';
      const mid = f.ff ? ' ✖ TIR ALLIÉ ✖ ' : ' ⟶ ';
      ctx.fillText(mid, W - 16 - rw, y);
      const mw = ctx.measureText(mid).width;
      ctx.fillStyle = f.at === 0 ? '#8cc4ff' : f.at === 1 ? '#ff8c80' : '#aaa';
      ctx.fillText(f.a, W - 16 - rw - mw, y);
      ctx.globalAlpha = 1;
    });

    drawMinimap();

    // état du char du joueur
    if (player) {
      const T = player.T;
      const bx = W / 2 - 170, by = H - 70;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, 340, 60);
      ctx.textAlign = 'left'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#f0e6c8';
      ctx.fillText(`${T.name} · ${T.cls}`, bx + 10, by + 17);
      const f = player.hp / T.hp;
      ctx.fillStyle = '#2a2a24'; ctx.fillRect(bx + 10, by + 24, 220, 10);
      ctx.fillStyle = f > 0.5 ? '#7ad06a' : f > 0.25 ? '#e0c050' : '#ff5040';
      ctx.fillRect(bx + 10, by + 24, 220 * f, 10);
      ctx.fillStyle = '#fff'; ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(`${Math.ceil(player.hp)} / ${T.hp}`, bx + 14, by + 33);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = player.ammo === 'AP' ? '#ffe27a' : '#777';
      ctx.fillText('[1] Perforant', bx + 10, by + 51);
      ctx.fillStyle = player.ammo === 'HE' ? '#ff9a5a' : '#777';
      ctx.fillText('[2] Explosif', bx + 105, by + 51);
      ctx.fillStyle = player.smoke ? '#ddd' : '#666';
      ctx.fillText(`[E] Fumi ×${player.smoke}`, bx + 190, by + 51);
      // rechargement
      const rf = player.reloadT > 0 ? 1 - player.reloadT / T.reload : 1;
      ctx.fillStyle = '#2a2a24'; ctx.fillRect(bx + 240, by + 24, 90, 10);
      ctx.fillStyle = rf >= 1 ? '#ffe27a' : '#9a8a5a'; ctx.fillRect(bx + 240, by + 24, 90 * rf, 10);
      ctx.fillStyle = '#ddd'; ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(rf >= 1 ? 'PRÊT' : `${player.reloadT.toFixed(1)} s`, bx + 244, by + 17);
      const status = [];
      if (player.trackT > 0) status.push('Chenille cassée ' + player.trackT.toFixed(1) + ' s');
      if (player.fireT > 0) status.push('EN FEU');
      if (!player.dead && player.revealT <= 0 && inBush(player)) status.push('Camouflé');
      if (status.length) { ctx.fillStyle = '#ffb070'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(status.join(' · '), bx, by - 8); }
    }

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
    } else if (state !== 'menu') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 3, 0, TAU); ctx.fill();
    }

    // messages et compte à rebours
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
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(msg.text, W / 2 + 2, H * 0.24 + 2);
      ctx.fillStyle = msg.color; ctx.fillText(msg.text, W / 2, H * 0.24);
      ctx.globalAlpha = 1;
    }
  }

  function drawMinimap() {
    const mw = Math.min(230, W * 0.25), k = mw / WW, mh = WH * k, x0 = 12, y0 = H - mh - 12;
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
    ctx.strokeRect(x0 + (camX - W / 2 / S) * k, y0 + (camY - H / 2 / S) * k, W / S * k, H / S * k);
  }

  // ===================== Écrans =====================
  const $ = id => document.getElementById(id);
  function buildMenu() {
    const tc = $('tankCards'); tc.innerHTML = '';
    const maxOf = key => Math.max(...Object.values(TYPES).map(t => key === 'reload' ? 1 / t.reload : key === 'armor' ? t.armor[0] : t[key]));
    for (const T of Object.values(TYPES)) {
      const d = document.createElement('div');
      d.className = 'card' + (T.id === chosenType ? ' sel' : '');
      const bar = (label, v, m) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v / m * 100)}%"></i></div></div>`;
      d.innerHTML = `<b>${T.name}</b><small>${T.cls}${T.arc ? ' · sans tourelle' : ''}</small>` +
        bar('Blindage', T.armor[0], maxOf('armor')) + bar('Points vie', T.hp, maxOf('hp')) + bar('Pénétration', T.pen, maxOf('pen')) +
        bar('Dégâts', T.dmg, maxOf('dmg')) + bar('Cadence', 1 / T.reload, maxOf('reload')) + bar('Vitesse', T.speed, maxOf('speed'));
      d.onclick = () => { chosenType = T.id; buildMenu(); };
      tc.appendChild(d);
    }
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

  function startLevel() {
    genMap();
    spawnWave();
  }

  function showResult() {
    state = 'result';
    const win = waveResult === 'win';
    const ws = waveStats;
    const pts = Math.round(ws.kills * 150 + ws.dmg - ws.ff * 2 - ws.tk * 400 + (win ? 500 : 0));
    if (win) campaignScore += pts;
    const lastWave = waveIdx >= WAVES - 1;
    const lastLevel = levelIdx >= LEVELS.length - 1;
    $('resTitle').className = win ? 'win' : 'lose';
    $('resTitle').textContent = !win ? 'VAGUE PERDUE' : lastWave ? (lastLevel ? 'VICTOIRE TOTALE' : 'SECTEUR CONQUIS') : 'VAGUE REMPORTÉE';
    $('resSub').textContent = `${L().name} · vague ${waveIdx + 1}/${WAVES}` + (win ? '' : ' · ton équipe a été anéantie');
    const acc = ws.shots ? Math.round(ws.hits / ws.shots * 100) : 0;
    $('resTable').innerHTML =
      `<tr><td>Chars ennemis détruits</td><td>${ws.kills}</td></tr>` +
      `<tr><td>Dégâts infligés</td><td>${Math.round(ws.dmg)}</td></tr>` +
      `<tr><td>Précision</td><td>${acc} % (${ws.hits}/${ws.shots})</td></tr>` +
      `<tr><td>Ricochets provoqués</td><td>${ws.ric}</td></tr>` +
      `<tr><td>Obus esquivés</td><td>${ws.dodged}</td></tr>` +
      `<tr><td>Dégâts aux alliés</td><td class="${ws.ff ? 'bad' : ''}">${Math.round(ws.ff)}</td></tr>` +
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
    buildMenu(); show('menu');
  }
  function togglePause() {
    if (state === 'pause') { state = pausedFrom; hide('pause'); last = performance.now(); }
    else if (state === 'play' || state === 'intro' || state === 'ending') { pausedFrom = state; state = 'pause'; show('pause'); }
  }
  let pausedFrom = 'play';

  $('startBtn').onclick = () => { Sfx.init(); hide('menu'); waveIdx = 0; campaignScore = 0; startLevel(); };
  $('resumeBtn').onclick = togglePause;
  $('quitBtn').onclick = toMenu;

  // ===================== Entrées =====================
  addEventListener('keydown', e => {
    if (e.repeat && keys[e.code]) return;
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') Sfx.toggle();
    if (!player || player.dead || player.ai || state === 'menu' || state === 'pause' || state === 'result') return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Numpad1' || e.code === 'Numpad2') {
      const ammo = e.code.endsWith('1') ? 'AP' : 'HE';
      if (ammo !== player.ammo) {
        player.ammo = ammo;
        player.reloadT = player.T.reload; // changer d'obus impose de recharger
        showMsg(ammo === 'AP' ? 'Obus perforant' : 'Obus explosif', '#e9d9a6', 1);
      }
    }
    if (e.code === 'KeyE' && state === 'play') deploySmoke(player);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
  cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener('mousedown', e => {
    Sfx.init();
    if (e.button === 0) {
      mouse.down = true;
      if (player && player.dead) specIdx++;
    }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // Démarrage direct en développement
  if (Q.has('level')) levelIdx = clamp(Number(Q.get('level')) - 1, 0, LEVELS.length - 1);
  buildMenu();
  if (Q.has('level') || AUTO) {
    if (Q.has('type') && TYPES[Q.get('type')]) chosenType = Q.get('type');
    waveIdx = clamp(Number(Q.get('wave') || 1) - 1, 0, WAVES - 1);
    hide('menu'); startLevel();
  }
  if (Q.has('debug')) window.__fa = { get tanks() { return tanks; }, get state() { return state; }, get stats() { return waveStats; }, get shells() { return shells; }, get time() { return gameTime; } };
  requestAnimationFrame(frame);
})();
