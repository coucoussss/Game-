'use strict';
(() => {
// ============================================================
//  NUIT DES MORTS — jeu de combat 2D contre des zombies
// ============================================================
const W = 960, H = 540, GROUND = 468, WORLD_W = 3600, GRAV = 1900, TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const chance = p => Math.random() < p;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const light = document.createElement('canvas');
const lctx = light.getContext('2d');
let scale = 1;
function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 1920 / (W * s));
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
  canvas.width = Math.floor(W * s * dpr);
  canvas.height = Math.floor(H * s * dpr);
  scale = canvas.width / W;
  light.width = Math.ceil(canvas.width / 2);
  light.height = Math.ceil(canvas.height / 2);
}
addEventListener('resize', resize);
resize();

// Calque persistant pour le sang au sol
const DECAL_Y = GROUND - 24, DECAL_H = H - DECAL_Y;
const decal = document.createElement('canvas');
decal.width = WORLD_W; decal.height = DECAL_H;
const dctx = decal.getContext('2d');
function stamp(x, y, r, alpha = 0.8, col) {
  dctx.fillStyle = col || `rgba(${rint(70, 125)},${rint(0, 6)},${rint(0, 6)},${alpha})`;
  dctx.beginPath(); dctx.ellipse(x, y - DECAL_Y, r, r * 0.35, 0, 0, TAU); dctx.fill();
}

// ---------- Entrées ----------
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  if (state !== 'play') Sound.init();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; if (state === 'play') state = 'paused'; });
const mouse = { x: W / 2, y: H / 2, l: false, r: false, lp: false, rp: false };
function updateMouse(e) {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * W;
  mouse.y = (e.clientY - r.top) / r.height * H;
}
canvas.addEventListener('mousemove', updateMouse);
canvas.addEventListener('mousedown', e => {
  updateMouse(e);
  Sound.init();
  if (e.button === 0) { mouse.l = true; mouse.lp = true; }
  if (e.button === 2) { mouse.r = true; mouse.rp = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (state === 'play' && !player.dead) switchWeapon((player.wi + Math.sign(e.deltaY) + WEAPONS.length) % WEAPONS.length);
}, { passive: false });

// ---------- Armes ----------
const WEAPONS = [
  { id: 'pistol', name: 'PISTOLET 9MM', dmg: 36, rate: 0.16, mag: 12, reserve: 72, reload: 1.3, spread: 0.012, pellets: 1, auto: false, recoil: 0.35, shake: 3, len: 16, knock: 70 },
  { id: 'shotgun', name: 'FUSIL À POMPE', dmg: 19, rate: 0.85, mag: 6, reserve: 30, reload: 2.2, spread: 0.11, pellets: 9, auto: false, recoil: 1, shake: 10, len: 30, knock: 55 },
  { id: 'rifle', name: 'FUSIL D\'ASSAUT', dmg: 27, rate: 0.095, mag: 30, reserve: 120, reload: 1.9, spread: 0.028, pellets: 1, auto: true, recoil: 0.22, shake: 3.5, len: 32, knock: 55 },
];

// ---------- État global ----------
let state = 'menu';
let time = 0;
let player, zombies, corpses, gibs, particles, pickups, tracers, popups, flashes, trail, eyes;
let game;
const cam = { x: WORLD_W / 2 - W / 2, shake: 0, ox: 0, oy: 0 };
let best = 0;
try { best = +localStorage.getItem('ndm_best') || 0; } catch (e) { /* stockage indisponible */ }

// ---------- Décor (généré avec une graine fixe) ----------
const envr = { far: [], mid: [], lamps: [], cars: [], barrels: [], trees: [], fences: [], walls: [], crates: [], clouds: [], fog: [] };
(function genEnv() {
  const r = mulberry32(1337);
  let x = -50;
  while (x < WORLD_W * 0.2 + W + 100) {
    const w = 40 + r() * 90, h = 90 + r() * 210, win = [];
    for (let wy = 12; wy < h - 10; wy += 14) for (let wx = 6; wx < w - 8; wx += 12) if (r() < 0.05) win.push([wx, wy, r() < 0.3]);
    envr.far.push({ x, w, h, win, ant: r() < 0.2 });
    x += w + r() * 8;
  }
  x = -100;
  while (x < WORLD_W * 0.55 + W + 200) {
    const w = 90 + r() * 170, h = 100 + r() * 170, pts = [];
    const n = 4 + Math.floor(r() * 5);
    for (let i = 0; i <= n; i++) pts.push([w * i / n, h - (r() < 0.5 ? r() * 60 : 0)]);
    const holes = [];
    for (let i = 0; i < 6; i++) holes.push([10 + r() * (w - 30), 30 + r() * (h - 60), 8 + r() * 10, 10 + r() * 14]);
    envr.mid.push({ x, w, h, pts, holes });
    x += w + 30 + r() * 140;
  }
  for (let lx = 200; lx < WORLD_W - 100; lx += 420 + r() * 260) envr.lamps.push({ x: lx, on: r() > 0.2, flick: r() < 0.4, ph: r() * 100, lvl: 1 });
  for (let cx = 500; cx < WORLD_W - 200; cx += 600 + r() * 700) envr.cars.push({ x: cx, flip: r() < 0.5 ? -1 : 1, col: ['#2a2420', '#1d2226', '#2b1d1a', '#232323'][Math.floor(r() * 4)], tilt: (r() - 0.5) * 0.06 });
  for (let bx = 350; bx < WORLD_W - 150; bx += 500 + r() * 600) envr.barrels.push({ x: bx, fire: r() < 0.75 });
  for (let tx = 120; tx < WORLD_W; tx += 700 + r() * 600) {
    const segs = [];
    (function br(x0, y0, a, len, w, d) {
      const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
      segs.push([x0, y0, x1, y1, w]);
      if (d > 0) { br(x1, y1, a - 0.3 - r() * 0.5, len * (0.6 + r() * 0.2), w * 0.65, d - 1); br(x1, y1, a + 0.3 + r() * 0.5, len * (0.6 + r() * 0.2), w * 0.65, d - 1); }
    })(0, 0, (r() - 0.5) * 0.2, 60 + r() * 30, 9, 4);
    envr.trees.push({ x: tx, segs });
  }
  for (let fx = 50; fx < WORLD_W; fx += 900 + r() * 500) envr.fences.push({ x: fx, w: 150 + r() * 150 });
  const tags = ['ILS ARRIVENT', 'PAS DE SURVIVANTS', 'VISEZ LA TÊTE', 'AIDEZ-NOUS', 'ZONE INFECTÉE'];
  for (let wx = 300; wx < WORLD_W - 200; wx += 800 + r() * 500) envr.walls.push({ x: wx, w: 160 + r() * 140, h: 110 + r() * 70, tag: tags[Math.floor(r() * tags.length)], br: r() });
  for (let cx = 700; cx < WORLD_W; cx += 650 + r() * 700) envr.crates.push({ x: cx, n: 1 + Math.floor(r() * 3) });
  for (let i = 0; i < 9; i++) envr.clouds.push({ x: r() * (W + 900), y: 30 + r() * 150, s: 0.6 + r() * 1.2, sp: 4 + r() * 8 });
  for (let i = 0; i < 40; i++) envr.fog.push({ x: r() * WORLD_W, y: GROUND - 20 + r() * 50, r: 80 + r() * 140, sp: 5 + r() * 12, a: 0.04 + r() * 0.05 });
})();

// Météo
const rain = [];
for (let i = 0; i < 280; i++) rain.push({ x: rand(0, W + 100), y: rand(-H, H), len: rand(10, 22), sp: rand(700, 1000), a: rand(0.1, 0.35) });
const splashes = [];
const weather = { flash: 0, next: rand(6, 14), bolt: null };

// ---------- Initialisation d'une partie ----------
function newPlayer() {
  return {
    x: WORLD_W / 2, y: GROUND, vx: 0, vy: 0, f: 1, onGround: true, hp: 100, st: 100, wi: 0,
    mag: WEAPONS.map(w => w.mag), res: WEAPONS.map(w => w.reserve),
    cd: 0, reload: 0, reloadMax: 1, melee: 0, meleeHit: false, kick: 0, kickHit: false,
    inv: 0, phase: 0, recoil: 0, lean: 0.05, aim: 0, hurt: 0, dead: false, deadT: 0, rot: 0, rv: 0, rotDir: 1,
    lastStep: 0, heartT: 0, sprint: false, swapT: 0,
    col: { skin: '#c99a78', skinD: '#a37a5c', shirt: '#4b3b29', sleeve: '#4b3b29', sleeveD: '#382c1f', pants: '#2b3140', pantsD: '#20252f', shoe: '#151515', shoeD: '#0d0d0d', hair: '#2a1d14' },
  };
}
function resetGame() {
  player = newPlayer();
  zombies = []; corpses = []; gibs = []; particles = []; pickups = []; tracers = []; popups = []; flashes = []; trail = [];
  game = { wave: 0, toSpawn: 0, spawnT: 0, breakT: 2.5, score: 0, kills: 0, heads: 0, combo: 0, comboT: 0, msg: '', msgSub: '', msgT: 0, hitstop: 0, over: false, overT: 0, shots: 0, hits: 0 };
  dctx.clearRect(0, 0, decal.width, decal.height);
  cam.x = player.x - W / 2;
}
function startGame() {
  resetGame();
  state = 'play';
  announce('PRÉPAREZ-VOUS', 'Ils sentent votre odeur...');
}
function announce(msg, sub = '', t = 3) { game.msg = msg; game.msgSub = sub; game.msgT = t; }

// Le menu affiche quelques zombies qui errent
function menuInit() {
  resetGame();
  player.dead = true; player.hidden = true;
  for (let i = 0; i < 5; i++) spawnZombie('walker', cam.x + rand(80, W - 80), false);
}

// ---------- Particules ----------
const MAX_PARTS = 1800;
function part(o) { if (particles.length < MAX_PARTS) particles.push(o); return o; }
function bloodBurst(x, y, dx, dy, n, force = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dy, dx) + rand(-0.6, 0.6), sp = rand(80, 420) * force;
    part({ type: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(20, 150), size: rand(1.2, 3.4), life: 3, t: 0, gy: GROUND + rand(-4, 18), col: `rgb(${rint(110, 170)},${rint(0, 10)},${rint(0, 10)})` });
  }
  // sortie de plaie (projection arrière plus fine)
  for (let i = 0; i < n * 0.4; i++) {
    const a = Math.atan2(-dy, -dx) + rand(-0.5, 0.5), sp = rand(40, 160);
    part({ type: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, size: rand(1, 2.2), life: 3, t: 0, gy: GROUND + rand(-4, 18), col: '#8a0606' });
  }
  for (let i = 0; i < Math.min(6, n / 3); i++) part({ type: 'mist', x, y, vx: dx * rand(20, 70), vy: dy * rand(20, 70) - 10, size: rand(5, 10), grow: rand(25, 50), life: rand(0.4, 0.8), t: 0, col: '150,0,0' });
}
function dust(x, y, n, col = '120,110,100') {
  for (let i = 0; i < n; i++) part({ type: 'smoke', x: x + rand(-8, 8), y: y + rand(-3, 3), vx: rand(-60, 60), vy: rand(-50, -5), size: rand(3, 7), grow: rand(15, 30), life: rand(0.5, 1), t: 0, col, a: 0.35 });
}
function sparks(x, y, n, dirX = 0) {
  for (let i = 0; i < n; i++) part({ type: 'spark', x, y, vx: rand(-200, 200) + dirX * 150, vy: rand(-280, -40), size: rand(1, 2), life: rand(0.15, 0.4), t: 0, glow: true });
}

// ---------- Zombies ----------
const SKINS = ['#7d8b6a', '#8a9478', '#6f7d5c', '#949680', '#7a7262', '#6c7a6e', '#8c8a70'];
const SHIRTS = ['#3b3f4a', '#4a3a32', '#2f3d36', '#5a4a3a', '#5e5e5e', '#3a2a2a', '#6a5f4b', '#2d3550', '#704040'];
const PANTS = ['#2a2d36', '#3a3326', '#24282c', '#3d3d45', '#2f2a22'];
const TYPES = {
  walker: { hp: 90, speed: [26, 44], dmg: 11, s: [0.95, 1.05], mass: 1, reach: 34, windup: 0.5, atk: 1.1, stag: 30, score: 100 },
  runner: { hp: 60, speed: [125, 160], dmg: 8, s: [0.9, 0.98], mass: 0.85, reach: 32, windup: 0.3, atk: 0.8, stag: 22, score: 150 },
  brute: { hp: 420, speed: [30, 38], dmg: 28, s: [1.32, 1.42], mass: 3.5, reach: 46, windup: 0.7, atk: 1.6, stag: 90, score: 400 },
};
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0, g = clamp(((n >> 8) & 255) * k, 0, 255) | 0, b = clamp((n & 255) * k, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
function spawnZombie(type, x, rise) {
  const T = TYPES[type];
  const skin = pick(SKINS), shirt = type === 'brute' ? '#3a3a2e' : pick(SHIRTS), pants = pick(PANTS);
  const stains = [];
  for (let i = 0; i < rint(2, 5); i++) stains.push({ t: rand(0.1, 1), dx: rand(-6, 6), dy: rand(-3, 3), r: rand(1.5, 4), c: `rgba(${rint(60, 110)},5,5,${rand(0.6, 0.95)})` });
  const z = {
    type, x, y: GROUND, vx: 0, f: 1, s: rand(T.s[0], T.s[1]), hp: T.hp * (1 + game.wave * 0.04), maxHp: 0,
    speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(game.wave, 12) * 0.02), dmg: T.dmg, mass: T.mass, reach: T.reach, windup: T.windup, atkRate: T.atk, stag: T.stag,
    state: rise ? 'rise' : 'walk', t: 0, riseT: 0, phase: rand(0, TAU), attackCd: rand(0.3, 1), head: true, arms: [true, true],
    hitFlash: 0, groanT: rand(0.5, 5), tilt: rand(-0.25, 0.25), jaw: rand(1.5, 3), armStyle: rint(0, 2), alive: true, lean: 0.25,
    eye: type === 'runner' ? '255,60,20' : type === 'brute' ? '255,140,20' : '230,220,90', wander: x, lastDir: 1,
    col: {
      skin, skinD: shade(skin, 0.72), shirt, sleeve: shirt, sleeveD: shade(shirt, 0.7), pants, pantsD: shade(pants, 0.7),
      shoe: '#1a1612', shoeD: '#110e0b', hair: chance(0.5) ? '#2a2620' : '#4a4a40',
    }, stains,
  };
  if (type === 'brute') { z.col.sleeve = z.col.skin; z.col.sleeveD = z.col.skinD; }
  if (chance(0.25)) z.arms[rint(0, 1)] = false;
  z.maxHp = z.hp;
  zombies.push(z);
  if (rise) dust(x, GROUND, 10, '70,55,40');
  return z;
}
function zombieHitbox(z) {
  const s = z.s, sl = Math.sin(z.lean), cl = Math.cos(z.lean);
  const sink = z.state === 'rise' ? (1 - easeOut(Math.min(1, z.riseT / 1.4))) * 85 * s : 0;
  const bx = z.x + z.f * sl * 12 * s;
  return {
    hx: z.x + z.f * sl * 37 * s, hy: z.y + sink + (-38 - cl * 37) * s, hr: 8.5 * s,
    bx0: bx - 10 * s, bx1: bx + 10 * s, by0: z.y + sink - (38 + cl * 29) * s, by1: Math.min(GROUND, z.y + sink),
  };
}
const easeOut = t => 1 - (1 - t) * (1 - t);

// Pan stéréo + volume selon la position à l'écran
function spatial(x) {
  const sx = x - cam.x;
  const pan = clamp((sx - W / 2) / (W / 2), -1, 1) * 0.8;
  const d = Math.abs(x - (player && !player.hidden ? player.x : cam.x + W / 2));
  return { pan, vol: clamp(1 - d / 1100, 0, 1) };
}

function damageZombie(z, dmg, part, dx, dy, hx, hy, src, knock = 60) {
  if (!z.alive) return;
  z.hp -= dmg; z.hitFlash = 0.08;
  z.lastDir = dx >= 0 ? 1 : -1;
  z.vx += dx * knock / z.mass;
  const sp = spatial(z.x);
  bloodBurst(hx, hy, dx, dy, Math.min(26, 6 + dmg * 0.3), src === 'melee' ? 1.2 : 1);
  stamp(z.x + rand(-10, 10), GROUND + rand(0, 12), rand(3, 7), 0.5);
  if (src !== 'melee') Sound.flesh(sp.pan, dmg > 40);
  if (z.hp <= 0) { killZombie(z, part, src); return; }
  if (dmg >= z.stag && z.state !== 'rise') { z.state = 'stagger'; z.t = 0.35; }
  // démembrement : tirs puissants ou coups de machette
  if ((src === 'melee' && chance(0.3)) || (part === 'body' && dmg >= 18 && chance(0.06))) severArm(z, chance(0.5) ? 1 : 0, dx);
}
function severArm(z, i, dx) {
  if (!z.arms[i]) return;
  z.arms[i] = false;
  const hb = zombieHitbox(z);
  gibs.push({ kind: 'arm', x: hb.bx0 + 10 * z.s, y: hb.by0 + 6, vx: dx * rand(100, 220), vy: rand(-380, -200), rot: 0, vr: rand(-14, 14), col: z.col, s: z.s, life: 25, t: 0, gy: GROUND + rand(-2, 14) });
  bloodBurst(hb.bx0 + 10 * z.s, hb.by0 + 6, dx, -0.5, 18, 1.2);
  Sound.crunch(spatial(z.x).pan);
}
function killZombie(z, hitPart, src) {
  z.alive = false;
  const T = TYPES[z.type], hb = zombieHitbox(z), sp = spatial(z.x);
  let pts = T.score, label = '';
  let decap = false;
  if (hitPart === 'head' && z.head) decap = true;
  if (src === 'melee' && z.head && chance(0.4)) decap = true;
  if (decap) {
    z.head = false;
    game.heads++;
    pts += 75; label = src === 'melee' ? 'DÉCAPITÉ !' : 'TIR À LA TÊTE !';
    Sound.crunch(sp.pan);
    if (src !== 'melee' && chance(0.55)) {
      // la tête éclate en morceaux
      for (let i = 0; i < 7; i++) gibs.push({ kind: 'chunk', x: hb.hx, y: hb.hy, vx: z.lastDir * rand(50, 350), vy: rand(-450, -100), rot: rand(0, TAU), vr: rand(-20, 20), r: rand(2, 4.5), life: 20, t: 0, col: z.col, gy: GROUND + rand(-2, 16) });
      for (let i = 0; i < 6; i++) part({ type: 'mist', x: hb.hx, y: hb.hy, vx: z.lastDir * rand(20, 120), vy: rand(-80, 20), size: rand(6, 12), grow: rand(40, 80), life: rand(0.5, 1), t: 0, col: '140,0,0' });
    } else {
      gibs.push({ kind: 'head', x: hb.hx, y: hb.hy, vx: z.lastDir * rand(120, 260), vy: rand(-500, -300), rot: 0, vr: z.lastDir * rand(8, 16), col: z.col, s: z.s, jaw: z.jaw, life: 30, t: 0, gy: GROUND + rand(-2, 14) });
    }
    bloodBurst(hb.hx, hb.hy, z.lastDir, -1, 34, 1.3);
  } else {
    Sound.zombieDie(sp.pan, 0.5 * sp.vol + 0.15);
  }
  if (src === 'melee') { pts += 50; if (!label) label = 'CORPS-À-CORPS'; }
  if (src === 'kick' && !label) label = 'K.O.';
  // combo
  game.combo = game.comboT > 0 ? game.combo + 1 : 1;
  game.comboT = 2.5;
  const mult = Math.min(game.combo, 6);
  pts *= mult;
  if (state === 'play') {
    game.score += pts; game.kills++;
    popups.push({ x: z.x, y: hb.hy - 20, text: `+${pts}` + (mult > 1 ? ` x${mult}` : ''), sub: label, t: 0, life: 1.4 });
  }
  corpses.push({ ...z, rot: 0, rv: 0, rotDir: z.lastDir, t: 0, fade: 1, spurt: decap ? 1.8 : 0, pool: 0, landed: false });
  if (corpses.length > 40) corpses[0].fadeOut = true;
  // butin
  if (state === 'play') {
    const r = Math.random();
    if (r < 0.08 || (z.type === 'brute' && r < 0.6)) pickups.push(makePickup(r < 0.04 || z.type === 'brute' ? 'med' : 'ammo', z.x, hb.by0));
    else if (r < 0.24) pickups.push(makePickup('ammo', z.x, hb.by0));
  }
}
function makePickup(kind, x, y) { return { kind, x, y, vy: -250, t: 0, life: 25 }; }

// ---------- Tir ----------
function shoulder(p) {
  const sl = Math.sin(p.lean), cl = Math.cos(p.lean);
  return { x: p.x + p.f * sl * 24, y: p.y - 38 - cl * 24 };
}
function rayCircle(x, y, dx, dy, cx, cy, r) {
  const fx = x - cx, fy = y - cy, b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (c < 0 ? 0 : null);
}
function rayBox(x, y, dx, dy, x0, y0, x1, y1) {
  let tmin = 0, tmax = 1e9;
  if (Math.abs(dx) < 1e-9) { if (x < x0 || x > x1) return null; } else {
    let t1 = (x0 - x) / dx, t2 = (x1 - x) / dx; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-9) { if (y < y0 || y > y1) return null; } else {
    let t1 = (y0 - y) / dy, t2 = (y1 - y) / dy; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  return tmax >= tmin ? tmin : null;
}
function fire() {
  const p = player, w = WEAPONS[p.wi];
  p.mag[p.wi]--; p.cd = w.rate; p.recoil = Math.min(1.3, p.recoil + w.recoil);
  game.shots++;
  const sh = shoulder(p), a0 = p.aim;
  const mx = sh.x + Math.cos(a0) * (30 + w.len), my = sh.y + Math.sin(a0) * (30 + w.len);
  const extra = (Math.abs(p.vx) > 200 ? 0.035 : 0) + (p.onGround ? 0 : 0.03) + p.recoil * 0.03 * (w.auto ? 1 : 0.3);
  let anyHit = false;
  for (let i = 0; i < w.pellets; i++) {
    const a = a0 + (Math.random() - 0.5) * 2 * (w.spread + extra);
    if (shootRay(mx, my, a, w)) anyHit = true;
  }
  if (anyHit) game.hits++;
  Sound.gun(w.id, 0);
  addShake(w.shake);
  flashes.push({ x: mx, y: my, a: a0, t: 0, life: 0.06, big: w.id === 'shotgun' });
  for (let i = 0; i < 3; i++) part({ type: 'smoke', x: mx, y: my, vx: Math.cos(a0) * rand(20, 60) + rand(-10, 10), vy: Math.sin(a0) * 30 - rand(10, 30), size: rand(1.5, 3), grow: rand(10, 20), life: rand(0.4, 0.8), t: 0, col: '150,150,155', a: 0.1 });
  const ejX = sh.x + Math.cos(a0) * 34, ejY = sh.y + Math.sin(a0) * 34 - 3;
  if (w.id !== 'shotgun') part({ type: 'shell', x: ejX, y: ejY, vx: -p.f * rand(60, 150), vy: -rand(180, 280), rot: 0, vr: rand(-30, 30), size: 1, life: 6, t: 0, gy: GROUND + rand(0, 12), bounced: 0 });
  else setTimeout(() => { if (player === p && state === 'play') part({ type: 'shell', x: ejX, y: ejY, vx: -p.f * rand(60, 120), vy: -rand(150, 250), rot: 0, vr: rand(-20, 20), size: 1.6, life: 6, t: 0, gy: GROUND + rand(0, 12), bounced: 0, red: true }); }, 380);
}
function shootRay(x, y, a, w) {
  const dx = Math.cos(a), dy = Math.sin(a), range = 1100;
  let best = range, hitZ = null, part0 = null;
  if (dy > 0) { const tg = (GROUND + 8 - y) / dy; if (tg > 0 && tg < best) { best = tg; part0 = 'ground'; } }
  for (const z of zombies) {
    if (!z.alive || (z.state === 'rise' && z.riseT < 0.6)) continue;
    const hb = zombieHitbox(z);
    if (z.head) { const t = rayCircle(x, y, dx, dy, hb.hx, hb.hy, hb.hr); if (t !== null && t < best) { best = t; hitZ = z; part0 = 'head'; } }
    const t2 = rayBox(x, y, dx, dy, hb.bx0, hb.by0, hb.bx1, hb.by1);
    if (t2 !== null && t2 < best) { best = t2; hitZ = z; part0 = 'body'; }
  }
  const ex = x + dx * best, ey = y + dy * best;
  tracers.push({ x1: x, y1: y, x2: ex, y2: ey, t: 0, life: w.id === 'shotgun' ? 0.05 : 0.07 });
  if (hitZ) {
    let dmg = w.dmg * (part0 === 'head' ? 2.6 : 1);
    if (w.id === 'shotgun') dmg *= clamp(1.35 - best / 450, 0.25, 1.35);
    damageZombie(hitZ, dmg, part0, dx, dy, ex, ey, 'bullet', w.knock);
    return true;
  }
  if (part0 === 'ground') {
    sparks(ex, ey, 4, dx); dust(ex, ey, 2, '90,85,80');
    Sound.impact(spatial(ex).pan);
  }
  return false;
}
function startReload() {
  const p = player, w = WEAPONS[p.wi];
  if (p.reload > 0 || p.mag[p.wi] >= w.mag || p.res[p.wi] <= 0) return;
  p.reload = p.reloadMax = w.reload;
  Sound.reload(w.id, w.reload);
}
function finishReload() {
  const p = player, w = WEAPONS[p.wi];
  const need = w.mag - p.mag[p.wi], take = Math.min(need, p.res[p.wi]);
  p.mag[p.wi] += take; p.res[p.wi] -= take; p.reload = 0;
}
function switchWeapon(i) {
  const p = player;
  if (i === p.wi || i < 0 || i >= WEAPONS.length) return;
  p.wi = i; p.reload = 0; p.cd = 0.3; p.swapT = 0.3;
  Sound.swap();
}

// ---------- Corps-à-corps ----------
function doMelee() {
  const p = player;
  let hit = 0;
  const targets = zombies.filter(z => z.alive && z.state !== 'rise' && Math.abs(p.y - z.y) < 80)
    .map(z => ({ z, d: (z.x - p.x) * p.f })).filter(o => o.d > -12 && o.d < 78 + o.z.s * 8).sort((a, b) => a.d - b.d);
  for (const { z } of targets.slice(0, 3)) {
    const hb = zombieHitbox(z);
    damageZombie(z, 62, 'body', p.f, -0.15, z.x - p.f * 6 * z.s, hb.by0 + 14 * z.s, 'melee', 160);
    hit++;
  }
  if (hit) {
    Sound.slash(0); addShake(5); game.hitstop = 0.06;
  }
}
function doKick() {
  const p = player;
  let hit = false;
  for (const z of zombies) {
    if (!z.alive || z.state === 'rise') continue;
    const d = (z.x - p.x) * p.f;
    if (d > -6 && d < 58 + z.s * 6 && Math.abs(p.y - z.y) < 70) {
      const hb = zombieHitbox(z);
      damageZombie(z, 14, 'body', p.f, 0, z.x - p.f * 8, hb.by0 + 25 * z.s, 'kick', 0);
      if (z.alive) { z.vx = p.f * 460 / z.mass; z.state = 'stagger'; z.t = z.type === 'brute' ? 0.35 : 1; }
      hit = true;
    }
  }
  if (hit) { Sound.kick(0); addShake(4); game.hitstop = 0.04; } else Sound.swoosh(0.6);
}

// ---------- Joueur ----------
function hurtPlayer(dmg, src) {
  const p = player;
  if (p.dead || p.inv > 0) return;
  p.hp -= dmg; p.inv = 0.35; p.hurt = 1;
  addShake(8);
  const dir = Math.sign(p.x - src.x) || 1;
  p.vx += dir * 240;
  Sound.hurt();
  bloodBurst(p.x, p.y - 55, dir, -0.3, 14, 0.8);
  game.combo = 0; game.comboT = 0;
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.deadT = 0; p.rotDir = dir; p.reload = 0;
    Sound.playerDeath();
  }
}
function updatePlayer(dt) {
  const p = player;
  p.inv -= dt; p.hurt = Math.max(0, p.hurt - dt * 2); p.swapT -= dt;
  if (p.dead) {
    p.deadT += dt;
    p.rv += 9 * dt; p.rot = Math.min(Math.PI / 2 * 0.96, p.rot + p.rv * dt);
    p.vx = lerp(p.vx, 0, dt * 4); p.x += p.vx * dt;
    p.vy += GRAV * dt; p.y = Math.min(GROUND, p.y + p.vy * dt);
    if (p.deadT > 0.5 && p.deadT < 3) { if (chance(dt * 6)) stamp(p.x + p.rotDir * rand(15, 45), GROUND + rand(0, 8), rand(4, 10), 0.4); }
    if (p.deadT > 2.8 && state === 'play') gameOver();
    return;
  }
  const mw = { x: mouse.x + cam.x, y: mouse.y };
  p.f = mw.x >= p.x ? 1 : -1;
  const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  const mv = (right ? 1 : 0) - (left ? 1 : 0);
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && mv !== 0 && p.melee <= 0;
  p.sprint = wantSprint && p.st > 1;
  let target = mv * (p.sprint ? 290 : 165);
  if (mv !== 0 && mv !== p.f) target *= 0.72;
  if (p.kick > 0) target *= 0.25;
  if (p.melee > 0) target *= 0.6;
  p.vx = lerp(p.vx, target, clamp(dt * (p.onGround ? 12 : 3), 0, 1));
  if (p.sprint) p.st = Math.max(0, p.st - 26 * dt); else p.st = Math.min(100, p.st + (mv ? 14 : 22) * dt);
  if ((pressed.Space || pressed.KeyW || pressed.ArrowUp) && p.onGround && p.kick <= 0) { p.vy = -620; p.onGround = false; Sound.jump(); }
  p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.y >= GROUND) {
    if (!p.onGround) { Sound.land(); dust(p.x, GROUND, 4); }
    p.y = GROUND; p.vy = 0; p.onGround = true;
  }
  p.x = clamp(p.x, 40, WORLD_W - 40);
  // animation de marche
  const spd = Math.abs(p.vx);
  if (p.onGround && spd > 15) {
    const dir = Math.sign(p.vx) === p.f ? 1 : -1;
    p.phase += dt * spd * 0.052 * dir;
    const s = Math.sin(p.phase);
    if (Math.sign(s) !== Math.sign(p.lastStep) && Math.abs(s) > 0.01) { Sound.step(p.sprint ? 0.22 : 0.13); if (chance(0.5)) dust(p.x, GROUND, 1, '100,105,115'); }
    p.lastStep = s;
  }
  const targetLean = 0.05 + (p.sprint ? 0.2 : 0) + (p.melee > 0 ? 0.12 : 0) + (p.reload > 0 ? 0.08 : 0);
  p.lean = lerp(p.lean, targetLean, clamp(dt * 8, 0, 1));
  const sh = shoulder(p);
  p.aim = Math.atan2(mw.y - sh.y, mw.x - sh.x);

  // armes
  const w = WEAPONS[p.wi];
  p.cd -= dt; p.recoil = Math.max(0, p.recoil - dt * 4.5);
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) finishReload(); }
  for (let i = 0; i < WEAPONS.length; i++) if (pressed['Digit' + (i + 1)] || pressed['Numpad' + (i + 1)]) switchWeapon(i);
  if (pressed.Tab) switchWeapon((p.wi + 1) % WEAPONS.length);
  if (pressed.KeyR) startReload();
  const wantFire = w.auto ? mouse.l : mouse.lp;
  if (wantFire && p.melee <= 0 && p.kick <= 0 && p.swapT <= 0 && p.reload <= 0 && p.cd <= 0) {
    if (p.mag[p.wi] > 0) fire();
    else { Sound.empty(); p.cd = 0.3; if (p.res[p.wi] > 0) startReload(); else popups.push({ x: p.x, y: p.y - 100, text: 'PLUS DE MUNITIONS', sub: '', t: 0, life: 1, small: true }); }
  }
  if (p.reload <= 0 && p.mag[p.wi] === 0 && p.res[p.wi] > 0 && p.cd <= 0 && !mouse.l) startReload();
  // machette
  if ((mouse.rp || pressed.KeyF) && p.melee <= 0 && p.kick <= 0) {
    if (p.st >= 8) { p.melee = 0.42; p.meleeHit = false; p.st -= 12; p.reload = 0; Sound.swoosh(); trail = []; }
  }
  if (p.melee > 0) { p.melee -= dt; if (!p.meleeHit && p.melee < 0.27) { p.meleeHit = true; doMelee(); } }
  // coup de pied
  if (pressed.KeyE && p.kick <= 0 && p.melee <= 0 && p.st >= 12) { p.kick = 0.4; p.kickHit = false; p.st -= 15; }
  if (p.kick > 0) { p.kick -= dt; if (!p.kickHit && p.kick < 0.26) { p.kickHit = true; doKick(); } }
  // battements de cœur à faible santé
  if (p.hp < 35) { p.heartT -= dt; if (p.heartT <= 0) { Sound.heartbeat(); p.heartT = 0.55 + p.hp / 50; } }
  // ramassage
  for (const k of pickups) {
    if (k.dead || Math.abs(k.x - p.x) > 26 || Math.abs(k.y - (p.y - 10)) > 60) continue;
    if (k.kind === 'med') {
      if (p.hp >= 100) continue;
      p.hp = Math.min(100, p.hp + 40);
      popups.push({ x: p.x, y: p.y - 100, text: '+40 SANTÉ', sub: '', t: 0, life: 1.2, small: true, col: '#6f6' });
    } else {
      p.res[0] += 24; p.res[1] += 8; p.res[2] += 40;
      popups.push({ x: p.x, y: p.y - 100, text: 'MUNITIONS', sub: '', t: 0, life: 1.2, small: true, col: '#fd6' });
    }
    k.dead = true; Sound.pickup();
  }
}

// ---------- IA des zombies ----------
function updateZombie(z, dt) {
  z.t -= dt; z.hitFlash -= dt; z.attackCd -= dt;
  const sp = spatial(z.x);
  z.groanT -= dt;
  if (z.groanT <= 0) {
    z.groanT = rand(3, 9);
    if (sp.vol > 0.05) {
      if (z.type === 'runner' && chance(0.6)) Sound.scream(sp.pan, 0.35 * sp.vol);
      else Sound.groan(sp.pan, 0.45 * sp.vol, z.type);
    }
  }
  if (z.state === 'rise') {
    z.riseT += dt;
    if (chance(dt * 12)) dust(z.x, GROUND, 1, '70,55,40');
    if (z.riseT >= 1.4) z.state = 'walk';
    return;
  }
  const hunting = state === 'play' && !player.dead;
  const present = !player.hidden;
  const tx = present ? player.x : z.wander;
  const dx = tx - z.x, dist = Math.abs(dx);
  let targetLean = z.type === 'runner' ? 0.45 : z.type === 'brute' ? 0.3 : 0.24;
  if (z.state === 'walk') {
    if (dist > 4) z.f = dx >= 0 ? 1 : -1;
    if (hunting && dist < z.reach * z.s + 6 && Math.abs(player.y - z.y) < 60 && z.attackCd <= 0) {
      z.state = 'windup'; z.t = z.windup;
      Sound.groan(sp.pan, 0.6 * sp.vol, z.type, true);
    } else {
      let desired = z.f * z.speed * (0.7 + 0.3 * Math.max(0, Math.sin(z.phase)));
      if (!present) { desired *= 0.5; if (dist < 10) { z.wander = clamp(z.x + rand(-300, 300), cam.x + 40, cam.x + W - 40); } }
      if (present && dist < z.reach * z.s * (hunting ? 0.75 : 1.1)) desired = 0;
      z.vx = lerp(z.vx, desired, clamp(dt * 3, 0, 1));
    }
  } else if (z.state === 'windup') {
    z.vx = lerp(z.vx, 0, clamp(dt * 8, 0, 1));
    targetLean += 0.15;
    if (z.t <= 0) {
      if (hunting && Math.abs(player.x - z.x) < z.reach * z.s + 18 && Math.abs(player.y - z.y) < 60) hurtPlayer(z.dmg * (z.arms[0] || z.arms[1] ? 1 : 0.7), z);
      else Sound.swoosh(0.7);
      z.vx += z.f * 60;
      z.state = 'recover'; z.t = 0.35; z.attackCd = z.atkRate;
    }
  } else if (z.state === 'recover' || z.state === 'stagger') {
    z.vx = lerp(z.vx, 0, clamp(dt * 4, 0, 1));
    if (z.state === 'stagger') targetLean = -0.15;
    if (z.t <= 0) z.state = 'walk';
  }
  z.lean = lerp(z.lean, targetLean, clamp(dt * 6, 0, 1));
  z.x += z.vx * dt;
  z.x = clamp(z.x, 20, WORLD_W - 20);
  z.phase += dt * (Math.abs(z.vx) * (z.type === 'runner' ? 0.06 : 0.075) + 0.4);
}
function separateZombies() {
  const live = zombies.filter(z => z.alive && z.state !== 'rise').sort((a, b) => a.x - b.x);
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1], b = live[i], min = 13 * (a.s + b.s) / 2;
    const d = b.x - a.x;
    if (d < min) { const push = (min - d) * 0.25; a.x -= push * b.mass / (a.mass + b.mass); b.x += push * a.mass / (a.mass + b.mass); }
  }
}

// ---------- Vagues ----------
function updateWaves(dt) {
  const alive = zombies.filter(z => z.alive).length;
  if (game.breakT > 0) {
    game.breakT -= dt;
    if (game.breakT <= 0) {
      game.wave++;
      game.toSpawn = 5 + game.wave * 4;
      game.spawnT = 1;
      Sound.waveStart();
      announce(`VAGUE ${game.wave}`, game.wave === 1 ? 'Survivez.' : game.wave % 4 === 0 ? 'Quelque chose de gros approche...' : `${game.toSpawn} infectés en approche`);
    }
    return;
  }
  const maxAlive = 6 + game.wave * 2;
  if (game.toSpawn > 0 && alive < maxAlive) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      game.spawnT = Math.max(0.35, 2.2 - game.wave * 0.15) * rand(0.5, 1.3);
      const r = Math.random();
      let type = 'walker';
      if (game.wave >= 4 && r < 0.05 + game.wave * 0.01) type = 'brute';
      else if (game.wave >= 2 && r < 0.3 + game.wave * 0.02) type = 'runner';
      if (chance(0.25) && type !== 'brute') {
        const side = chance(0.5) ? 1 : -1;
        let x = player.x + side * rand(260, 420);
        if (x < 60 || x > WORLD_W - 60) x = player.x - side * rand(260, 420);
        spawnZombie(type, clamp(x, 60, WORLD_W - 60), true);
      } else {
        let side = chance(0.5) ? -1 : 1;
        let x = side < 0 ? cam.x - rand(40, 140) : cam.x + W + rand(40, 140);
        if (x < 20) x = cam.x + W + rand(40, 140);
        if (x > WORLD_W - 20) x = cam.x - rand(40, 140);
        spawnZombie(type, clamp(x, 20, WORLD_W - 20), false);
      }
      game.toSpawn--;
    }
  }
  if (game.toSpawn === 0 && alive === 0) {
    game.breakT = 7;
    game.score += game.wave * 250;
    Sound.waveEnd();
    announce(`VAGUE ${game.wave} TERMINÉE`, `Bonus +${game.wave * 250} — Ravitaillement largué`, 4);
    pickups.push(makePickup('ammo', clamp(player.x + 60, 60, WORLD_W - 60), -40));
    pickups.push(makePickup(player.hp < 75 ? 'med' : 'ammo', clamp(player.x - 60, 60, WORLD_W - 60), -80));
  }
}

function gameOver() {
  state = 'over';
  game.overT = 0;
  if (game.score > best) { best = game.score; try { localStorage.setItem('ndm_best', best); } catch (e) { /* ignoré */ } }
}

function addShake(v) { cam.shake = Math.min(18, cam.shake + v); }

// ---------- Mise à jour générale ----------
function update(dt) {
  time += dt;
  if (pressed.KeyM) Sound.toggleMute();
  if ((pressed.Escape || pressed.KeyP) && (state === 'play' || state === 'paused')) state = state === 'play' ? 'paused' : 'play';
  if (state === 'menu' && (mouse.lp || pressed.Enter || pressed.Space)) { Sound.init(); startGame(); return; }
  if (state === 'over' && game.overT > 1.2 && (mouse.lp || pressed.Enter)) { startGame(); return; }
  if (state === 'paused') { if (mouse.lp) state = 'play'; return; }

  if (game.hitstop > 0) { game.hitstop -= dt; dt *= 0.12; }
  updateWeather(dt);
  if (state === 'play') {
    updatePlayer(dt);
    updateWaves(dt);
    game.comboT -= dt;
    if (game.msgT < 50) game.msgT -= dt;
  } else if (state === 'over') {
    game.overT += dt;
    updatePlayer(dt);
  } else if (state === 'menu') {
    cam.x = WORLD_W / 2 - W / 2 + Math.sin(time * 0.05) * 300;
    if (zombies.length < 5) spawnZombie('walker', cam.x + (chance(0.5) ? -60 : W + 60), false).wander = cam.x + rand(100, W - 100);
  }
  for (const z of zombies) updateZombie(z, dt);
  separateZombies();
  zombies = zombies.filter(z => z.alive && (state === 'play' || Math.abs(z.x - cam.x - W / 2) < W + 200));
  updateCorpses(dt);
  updateGibs(dt);
  updateParticles(dt);
  for (const k of pickups) {
    k.t += dt; k.vy += GRAV * 0.6 * dt; k.y += k.vy * dt;
    if (k.y >= GROUND - 6) { k.y = GROUND - 6; k.vy = 0; }
    if (k.t > k.life) k.dead = true;
  }
  pickups = pickups.filter(k => !k.dead);
  for (const t of tracers) t.t += dt;
  tracers = tracers.filter(t => t.t < t.life);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter(f => f.t < f.life);
  for (const pp of popups) pp.t += dt;
  popups = popups.filter(pp => pp.t < pp.life);
  // lampadaires qui grésillent
  for (const l of envr.lamps) {
    if (!l.on) { l.lvl = 0; continue; }
    if (l.flick) { if (chance(dt * 3)) l.lvl = chance(0.5) ? 0.15 : 1; } else l.lvl = 1;
  }
  // feux de tonneaux
  for (const b of envr.barrels) {
    if (!b.fire || Math.abs(b.x - cam.x - W / 2) > W) continue;
    if (chance(dt * 60)) part({ type: 'fire', x: b.x + rand(-9, 9), y: GROUND - 36, vx: rand(-10, 10), vy: rand(-90, -50), size: rand(4, 8), life: rand(0.4, 0.8), t: 0, glow: true });
    if (chance(dt * 8)) part({ type: 'smoke', x: b.x + rand(-6, 6), y: GROUND - 60, vx: rand(-5, 15), vy: rand(-40, -20), size: rand(5, 9), grow: 30, life: rand(1.5, 2.5), t: 0, col: '40,40,45', a: 0.3 });
    if (chance(dt * 4)) part({ type: 'ember', x: b.x + rand(-6, 6), y: GROUND - 40, vx: rand(-20, 20), vy: rand(-120, -60), size: 1.2, life: rand(1, 2), t: 0, glow: true });
  }
  // caméra
  if (state === 'play' || state === 'over') {
    const tx = clamp(player.x - W / 2 + player.f * 90, 0, WORLD_W - W);
    cam.x = lerp(cam.x, tx, clamp(dt * 4, 0, 1));
  }
  cam.x = clamp(cam.x, 0, WORLD_W - W);
  cam.shake *= Math.exp(-dt * 9);
  cam.ox = rand(-1, 1) * cam.shake; cam.oy = rand(-1, 1) * cam.shake;
  // intensité de la musique selon le danger
  if (state === 'play') {
    const near = zombies.filter(z => z.alive && Math.abs(z.x - player.x) < 500).length;
    Sound.setIntensity(player.dead ? 0 : Math.min(1, near / 6 + (game.breakT > 0 ? 0 : 0.2)));
  } else Sound.setIntensity(0);
}

function updateWeather(dt) {
  for (const d of rain) {
    d.y += d.sp * dt; d.x -= d.sp * 0.18 * dt;
    if (d.y > GROUND + 30 + (d.a * 40)) {
      if (chance(0.5)) splashes.push({ x: d.x, y: d.y, t: 0 });
      d.y = rand(-60, -10); d.x = rand(0, W + 120);
    }
  }
  for (const s of splashes) s.t += dt;
  for (let i = splashes.length - 1; i >= 0; i--) if (splashes[i].t > 0.25) splashes.splice(i, 1);
  weather.flash = Math.max(0, weather.flash - dt * 2.5);
  if (weather.bolt) { weather.bolt.t -= dt; if (weather.bolt.t <= 0) weather.bolt = null; }
  weather.next -= dt;
  if (weather.next <= 0) {
    weather.next = rand(10, 28);
    weather.flash = 1;
    const close = Math.random();
    const bx = rand(80, W - 80), pts = [[bx, 0]];
    let y = 0, x = bx;
    while (y < 260 + close * 120) { y += rand(15, 35); x += rand(-30, 30); pts.push([x, y]); }
    weather.bolt = { pts, t: 0.18 };
    Sound.thunder(0.2 + (1 - close) * 1.5, close);
  }
  for (const c of envr.clouds) { c.x -= c.sp * dt; if (c.x < -300) c.x = W + 500; }
  for (const f of envr.fog) { f.x += f.sp * dt; if (f.x > WORLD_W + 200) f.x = -200; }
}

function updateCorpses(dt) {
  for (const c of corpses) {
    c.t += dt;
    if (!c.landed) {
      c.rv += 11 * dt;
      c.rot += c.rv * dt;
      c.x += c.vx * dt; c.vx = lerp(c.vx, 0, clamp(dt * 3, 0, 1));
      if (c.rot >= Math.PI / 2 * 0.94) {
        c.rot = Math.PI / 2 * 0.94; c.landed = true;
        const sp = spatial(c.x);
        Sound.bodyFall(sp.pan, 0.6 * sp.vol + 0.1);
        dust(c.x + c.rotDir * 40 * c.s, GROUND, 6, '80,80,85');
        bloodBurst(c.x + c.rotDir * 30 * c.s, GROUND - 4, c.rotDir, -1, 8, 0.4);
      }
    }
    // flaque de sang qui s'étend
    if (c.landed && c.pool < 3) {
      c.pool += dt;
      if (chance(dt * 5)) stamp(c.x + c.rotDir * rand(20, 50) * c.s, GROUND + rand(2, 10), 4 + c.pool * 5, 0.25);
    }
    // jet de sang du cou
    if (c.spurt > 0) {
      c.spurt -= dt;
      const a = c.rot * c.rotDir;
      const nx = c.x + Math.sin(a) * 66 * c.s, ny = c.y - Math.cos(a) * 66 * c.s;
      if (chance(dt * 40)) part({ type: 'blood', x: nx, y: ny, vx: Math.sin(a) * rand(80, 220) * (c.spurt) + rand(-30, 30), vy: -Math.cos(a) * rand(80, 220) * c.spurt - rand(40, 120), size: rand(1.5, 3), life: 3, t: 0, gy: GROUND + rand(-2, 14), col: '#9a0505' });
    }
    if (c.t > 45 || c.fadeOut) c.fade -= dt * 0.5;
  }
  corpses = corpses.filter(c => c.fade > 0);
}
function updateGibs(dt) {
  for (const gb of gibs) {
    gb.t += dt;
    if (!gb.rest) {
      gb.vy += GRAV * dt; gb.x += gb.vx * dt; gb.y += gb.vy * dt; gb.rot += gb.vr * dt;
      if (chance(dt * 30)) part({ type: 'blood', x: gb.x, y: gb.y, vx: rand(-20, 20), vy: rand(-20, 20), size: rand(1, 2), life: 2, t: 0, gy: GROUND + rand(-2, 14), col: '#880404' });
      if (gb.y >= gb.gy) {
        gb.y = gb.gy;
        stamp(gb.x, gb.gy, rand(3, 7), 0.6);
        if (Math.abs(gb.vy) > 150) { gb.vy *= -0.3; gb.vx *= 0.5; gb.vr *= 0.5; if (gb.kind === 'head') Sound.bodyFall(spatial(gb.x).pan, 0.25); }
        else { gb.rest = true; gb.vr = 0; if (gb.kind === 'head') gb.rot = Math.round(gb.rot / Math.PI) * Math.PI + 0.3; }
      }
    }
  }
  gibs = gibs.filter(gb => gb.t < gb.life);
  if (gibs.length > 80) gibs.splice(0, gibs.length - 80);
}
function updateParticles(dt) {
  for (const p of particles) {
    p.t += dt;
    switch (p.type) {
      case 'blood':
        p.vy += GRAV * 0.75 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 0.5;
        if (p.y >= p.gy && p.vy > 0) { stamp(p.x, p.gy, p.size * rand(1, 2.2), rand(0.5, 0.9)); p.t = p.life; }
        break;
      case 'mist': case 'smoke':
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 1.5; p.size += p.grow * dt;
        break;
      case 'spark':
        p.vy += GRAV * 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        break;
      case 'fire': case 'ember':
        p.x += p.vx * dt + Math.sin(time * 9 + p.y * 0.1) * 12 * dt; p.y += p.vy * dt;
        if (p.type === 'fire') p.size *= 1 - dt * 1.5;
        break;
      case 'shell':
        if (p.bounced < 2) {
          p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          if (p.y >= p.gy) { p.y = p.gy; p.vy *= -0.35; p.vx *= 0.5; p.vr *= 0.5; p.bounced++; if (p.bounced === 1 && p.red) Sound.tink(0); }
        }
        break;
    }
  }
  particles = particles.filter(p => p.t < p.life);
}

// ============================================================
//  RENDU
// ============================================================
function seg(c, x1, y1, x2, y2, w, col) {
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
// angles mesurés depuis la verticale descendante, positifs vers l'avant
function limb(c, x, y, a1, a2, l1, l2, w1, w2, c1, c2) {
  const mx = x + Math.sin(a1) * l1, my = y + Math.cos(a1) * l1;
  const ex = mx + Math.sin(a2) * l2, ey = my + Math.cos(a2) * l2;
  seg(c, x, y, mx, my, w1, c1);
  seg(c, mx, my, ex, ey, w2, c2);
  return { x: ex, y: ey, mx, my };
}
function drawLeg(c, x, y, lg, pants, shoe) {
  const e = limb(c, x, y, lg[0], lg[1], 20, 19, 8.5, 7, pants, pants);
  const fx = Math.cos(lg[1]), fy = -Math.sin(lg[1]);
  c.lineWidth = 4.5; c.strokeStyle = shoe;
  c.beginPath(); c.moveTo(e.x - fx * 1.5, e.y - fy * 1.5 + 1); c.lineTo(e.x + fx * 6, e.y + fy * 6 + 1); c.stroke();
}
function drawHuman(c, b) {
  c.save();
  c.translate(b.x, b.y);
  if (b.rot) c.rotate(b.rot);
  c.scale(b.f * b.s, b.s);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (b.alpha !== undefined) c.globalAlpha = b.alpha;
  const C = b.col, L = b.lean, sl = Math.sin(L), cl = Math.cos(L);
  const hipX = 0, hipY = -38;
  const shX = hipX + sl * 24, shY = hipY - cl * 24;
  const nkX = hipX + sl * 29, nkY = hipY - cl * 29;
  const hdX = hipX + sl * 37, hdY = hipY - cl * 37;
  // bras arrière
  if (b.arms[0]) limb(c, shX, shY, b.armA[0][0], b.armA[0][1], 15, 15, 6.5, 5.5, C.sleeveD, b.zombie ? C.skinD : C.sleeveD);
  if (b.armA[0] && b.arms[0] && !b.zombie) { const h = armEnd(shX, shY, b.armA[0]); c.fillStyle = C.skinD; c.beginPath(); c.arc(h.x, h.y, 2.8, 0, TAU); c.fill(); }
  // jambe arrière
  drawLeg(c, hipX, hipY, b.legs[0], C.pantsD, C.shoeD);
  // sac à dos
  if (b.pack) { c.save(); c.translate(hipX + sl * 15, hipY - cl * 15); c.rotate(L); c.fillStyle = '#2b2a20'; c.fillRect(-15, -11, 8, 20); c.fillStyle = '#1e1d16'; c.fillRect(-15, -2, 8, 2); c.restore(); }
  // torse
  seg(c, hipX, hipY, shX, shY + 1, b.zombie ? 14 : 15, C.shirt);
  seg(c, hipX - cl * 4, hipY - sl * 4 * 0, shX - cl * 4, shY + 1, 4, 'rgba(0,0,0,0.18)');
  if (b.stains) for (const s of b.stains) { c.fillStyle = s.c; c.beginPath(); c.arc(hipX + sl * s.t * 24 + s.dx, hipY - cl * s.t * 24 + s.dy, s.r, 0, TAU); c.fill(); }
  if (!b.zombie) { seg(c, hipX - 7, hipY + 1, hipX + 7, hipY + 1, 3, '#1a1510'); }
  // jambe avant
  drawLeg(c, hipX, hipY, b.legs[1], C.pants, C.shoe);
  // tête
  if (b.head) {
    seg(c, nkX - sl * 3, nkY + cl * 3, hdX, hdY, 5, C.skinD);
    drawHead(c, hdX, hdY, b);
  } else {
    c.fillStyle = '#5a0606'; c.beginPath(); c.ellipse(nkX, nkY, 5, 3, L, 0, TAU); c.fill();
    c.fillStyle = '#a01010'; c.beginPath(); c.ellipse(nkX, nkY - 1, 3.5, 1.8, L, 0, TAU); c.fill();
    c.fillStyle = '#d8d0b8'; c.beginPath(); c.arc(nkX, nkY - 1, 1.2, 0, TAU); c.fill();
  }
  // moignons
  for (let i = 0; i < 2; i++) if (!b.arms[i]) { c.fillStyle = '#7a0808'; c.beginPath(); c.arc(shX + (i ? 2 : -2), shY + 2, 3.2, 0, TAU); c.fill(); }
  // bras avant
  if (b.arms[1]) {
    const e = limb(c, shX, shY, b.armA[1][0], b.armA[1][1], 15, 15, 6.5, 5.5, C.sleeve, b.zombie ? C.skin : C.sleeve);
    c.fillStyle = C.skin; c.beginPath(); c.arc(e.x, e.y, 3, 0, TAU); c.fill();
    if (b.onHand) b.onHand(c, e, b.armA[1][1]);
  }
  c.restore();
}
function armEnd(x, y, a) {
  return { x: x + Math.sin(a[0]) * 15 + Math.sin(a[1]) * 15, y: y + Math.cos(a[0]) * 15 + Math.cos(a[1]) * 15 };
}
function drawHead(c, x, y, b) {
  const C = b.col;
  c.save(); c.translate(x, y); c.rotate(b.tilt || 0);
  c.fillStyle = C.skin; c.beginPath(); c.arc(0, 0, 8.5, 0, TAU); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.arc(0, 0, 8.5, Math.PI * 0.5, Math.PI * 1.5); c.fill();
  if (b.zombie) {
    c.strokeStyle = C.hair; c.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) { const a = Math.PI * (1.1 + i * 0.17); c.beginPath(); c.moveTo(Math.cos(a) * 7, Math.sin(a) * 7); c.lineTo(Math.cos(a) * 10, Math.sin(a) * 10 + 1); c.stroke(); }
    c.fillStyle = '#140d0a'; c.beginPath(); c.arc(3.8, -1.5, 2.5, 0, TAU); c.fill();
    c.fillStyle = '#2a0606'; c.beginPath(); c.ellipse(5, 4.2, 2.8, b.jaw || 2, 0, 0, TAU); c.fill();
    c.fillStyle = '#b8ad86'; c.fillRect(3.4, 2.4, 3.2, 1);
    c.fillStyle = 'rgba(115,10,10,0.9)'; c.beginPath(); c.arc(-3, -4, 2.3, 0, TAU); c.fill();
    c.fillStyle = 'rgba(115,10,10,0.7)'; c.beginPath(); c.arc(4, 7, 1.8, 0, TAU); c.fill();
    if (b.eye && eyes) {
      const m = c.getTransform(), pt = m.transformPoint(new DOMPoint(4, -1.6));
      eyes.push({ x: pt.x / scale, y: pt.y / scale, col: b.eye, s: b.s });
    }
  } else {
    c.fillStyle = C.hair;
    c.beginPath(); c.arc(-0.5, -1, 9, Math.PI * 0.92, Math.PI * 1.9); c.fill();
    c.beginPath(); c.arc(-3, 0, 6.5, Math.PI * 0.5, Math.PI * 1.5); c.fill();
    c.fillStyle = C.skinD; c.beginPath(); c.arc(-0.5, 1, 2, 0, TAU); c.fill();
    c.fillStyle = '#1a120c'; c.beginPath(); c.arc(4.4, -1, 1.1, 0, TAU); c.fill();
    c.fillStyle = 'rgba(40,28,18,0.35)'; c.beginPath(); c.arc(2, 3, 6, 0, Math.PI * 0.9); c.fill();
  }
  c.restore();
}
function drawGun(c, id) {
  if (id === 'pistol') {
    c.fillStyle = '#26272b'; c.fillRect(-2, -4, 18, 5);
    c.fillStyle = '#3a3b40'; c.fillRect(-2, -4, 18, 1.5);
    c.fillStyle = '#1a1a1c'; c.save(); c.rotate(0.25); c.fillRect(-2, 0, 5, 8); c.restore();
  } else if (id === 'shotgun') {
    c.fillStyle = '#4a2f1c'; c.beginPath(); c.moveTo(-6, -3); c.lineTo(-20, -1); c.lineTo(-21, 6); c.lineTo(-6, 2); c.fill();
    c.fillStyle = '#222326'; c.fillRect(-6, -4, 14, 6);
    c.fillStyle = '#2e2f33'; c.fillRect(6, -4, 26, 3);
    c.fillStyle = '#1a1b1d'; c.fillRect(6, -1, 24, 2.5);
    c.fillStyle = '#5a3a22'; c.fillRect(13, -1.5, 9, 4);
  } else {
    c.fillStyle = '#1f2022'; c.fillRect(-14, -2, 10, 5); c.fillRect(-16, -2, 3, 8);
    c.fillStyle = '#2a2c2f'; c.fillRect(-5, -4, 24, 7);
    c.fillStyle = '#222'; c.fillRect(18, -2.5, 15, 2.5);
    c.fillStyle = '#18191b'; c.save(); c.translate(4, 3); c.rotate(0.2); c.fillRect(0, 0, 5, 9); c.restore();
    c.fillStyle = '#111'; c.fillRect(0, -6, 8, 2);
  }
}
function drawMachete(c) {
  c.fillStyle = '#2a1a10'; c.fillRect(-3, -2, 9, 4);
  c.fillStyle = '#9ea4ab'; c.beginPath(); c.moveTo(6, -2); c.lineTo(34, -3.5); c.quadraticCurveTo(38, -1, 34, 2.5); c.lineTo(6, 2); c.fill();
  c.fillStyle = '#d5dade'; c.fillRect(7, -2, 26, 1);
  c.fillStyle = 'rgba(120,0,0,0.7)'; c.fillRect(24, -1, 8, 3);
}

// Postures
function legWalk(ph, amp = 0.55) {
  const th = Math.sin(ph) * amp;
  return [th, th - (0.12 + Math.max(0, Math.cos(ph)) * 0.95 * amp / 0.55)];
}
function playerPose(p) {
  let legs;
  const spd = Math.abs(p.vx);
  if (!p.onGround) legs = [[0.55, -0.25], [-0.25, -0.75]];
  else if (spd > 15) {
    const amp = p.sprint ? 0.75 : 0.5;
    legs = [legWalk(p.phase + Math.PI, amp), legWalk(p.phase, amp)];
  } else legs = [[-0.12, -0.17], [0.12, 0.05]];
  if (p.kick > 0) {
    const k = 1 - p.kick / 0.4, ext = Math.sin(clamp(k * 1.25, 0, 1) * Math.PI);
    legs = [[-0.2, -0.3], [lerp(0.2, 1.55, ext), lerp(-0.3, 1.5, ext)]];
  }
  const sh = shoulder(p);
  const mw = { x: mouse.x + cam.x, y: mouse.y };
  let a = Math.atan2((mw.x - sh.x) * p.f, mw.y - sh.y);
  a = clamp(a + p.recoil * 0.22, 0.1, Math.PI - 0.05);
  let arms, onHand;
  const w = WEAPONS[p.wi];
  if (p.melee > 0) {
    const m = 1 - p.melee / 0.42;
    let sw;
    if (m < 0.3) sw = lerp(1.6, 3.4, m / 0.3);
    else if (m < 0.55) sw = lerp(3.4, 0.35, (m - 0.3) / 0.25);
    else sw = lerp(0.35, 0.9, (m - 0.55) / 0.45);
    arms = [[0.2, 0.6], [sw, sw - 0.25]];
    onHand = (c, e, la) => {
      c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(Math.cos(la), Math.sin(la)));
      drawMachete(c);
      if (m > 0.25 && m < 0.6) { const pt = c.getTransform().transformPoint(new DOMPoint(34, 0)); trail.push({ x: pt.x / scale, y: pt.y / scale, t: time }); }
      c.restore();
    };
  } else if (p.reload > 0 || p.swapT > 0) {
    const k = p.reload > 0 ? 1 - p.reload / p.reloadMax : 0.5;
    const down = 0.9 + Math.sin(k * Math.PI) * 0.15;
    arms = [[0.5 + Math.sin(k * Math.PI * 3) * 0.3, 1.3], [down - 0.2, down + 0.5]];
    onHand = (c, e, la) => { c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(Math.cos(la), Math.sin(la)) - 0.3); drawGun(c, w.id); c.restore(); };
  } else {
    arms = w.id === 'pistol' ? [[a + 0.12, a - 0.05], [a, a]] : [[a + 0.45, a - 0.45], [a, a]];
    onHand = (c, e) => { c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(Math.cos(a), Math.sin(a))); drawGun(c, w.id); c.restore(); };
  }
  return { legs, arms, onHand };
}
function zombiePose(z, dead) {
  const ph = z.phase;
  let legs, arms;
  if (dead) {
    legs = [[0.25, 0.05], [-0.1, -0.35]];
    arms = [[2.2, 2.6], [1.4, 1.1]];
    return { legs, arms };
  }
  if (z.type === 'runner') {
    legs = [legWalk(ph + Math.PI, 0.8), legWalk(ph, 0.8)];
    arms = [[-Math.sin(ph) * 0.9 + 0.4, -Math.sin(ph) * 0.9 + 1.5], [Math.sin(ph) * 0.9 + 0.4, Math.sin(ph) * 0.9 + 1.5]];
  } else if (z.type === 'brute') {
    legs = [legWalk(ph + Math.PI, 0.35), legWalk(ph, 0.35)];
    arms = [[0.25 + Math.sin(ph) * 0.2, 0.5], [0.3 - Math.sin(ph) * 0.2, 0.6]];
  } else {
    const l0 = legWalk(ph + Math.PI, 0.38), l1 = legWalk(ph, 0.28);
    l1[1] = l1[0] - 0.05; // jambe raide qui traîne
    legs = [l0, l1];
    const r = Math.sin(ph * 0.7) * 0.12;
    arms = z.armStyle === 0 ? [[1.15 + r, 1.45], [1.3 - r, 1.55]] : z.armStyle === 1 ? [[0.15 + r * 0.5, 0.2], [1.25 - r, 1.5]] : [[0.1 + r, 0.15], [0.2 - r, 0.3]];
  }
  if (Math.abs(z.vx) < 5 && z.state === 'walk') legs = [[-0.1, -0.15], [0.12, 0.05]];
  if (z.state === 'windup') {
    const k = 1 - clamp(z.t / z.windup, 0, 1);
    arms = [[lerp(arms[0][0], 2.5, k), lerp(arms[0][1], 2.3, k)], [lerp(arms[1][0], 2.7, k), lerp(arms[1][1], 2.5, k)]];
  } else if (z.state === 'recover') arms = [[1.6, 1.3], [1.7, 1.4]];
  else if (z.state === 'stagger') { arms = [[2.4, 2.8], [-0.4, 0.2]]; legs = [[0.35, 0.15], [-0.05, -0.2]]; }
  return { legs, arms };
}
function drawZombie(z) {
  const pose = zombiePose(z, false);
  const flash = z.hitFlash > 0;
  const col = flash ? { ...z.col, skin: '#e0b0a0', shirt: '#a07070' } : z.col;
  let y = z.y, clip = false;
  if (z.state === 'rise') {
    y = z.y + (1 - easeOut(Math.min(1, z.riseT / 1.4))) * 85 * z.s;
    pose.arms = [[2.6 + Math.sin(time * 6 + z.phase) * 0.2, 2.8], [2.8 - Math.sin(time * 6) * 0.2, 3]];
    clip = true;
    ctx.save(); ctx.beginPath(); ctx.rect(z.x - 80, 0, 160, GROUND + 6); ctx.clip();
  }
  drawHuman(ctx, { x: z.x, y, f: z.f, s: z.s, lean: z.lean, legs: pose.legs, armA: pose.arms, arms: z.arms, head: z.head, col, zombie: true, stains: z.stains, tilt: z.tilt + Math.sin(time * 2 + z.phase) * 0.08, jaw: z.jaw + Math.sin(time * 5 + z.phase) * 0.6, eye: z.eye, s2: z.s });
  if (clip) ctx.restore();
}
function drawCorpse(c) {
  const pose = zombiePose(c, true);
  const fallK = c.landed ? 1 : c.rot / (Math.PI / 2);
  drawHuman(ctx, { x: c.x, y: c.y - 3 * fallK, rot: c.rot * c.rotDir, f: c.f, s: c.s, lean: c.lean * (1 - fallK), legs: pose.legs, armA: pose.arms, arms: c.arms, head: c.head, col: c.col, zombie: true, stains: c.stains, tilt: 0.4, jaw: 3, alpha: c.fade });
}
function drawPlayer() {
  const p = player;
  if (p.hidden) return;
  if (p.dead) {
    drawHuman(ctx, { x: p.x, y: p.y - 3, rot: p.rot * p.rotDir, f: p.f, s: 1, lean: 0, legs: [[0.3, 0.1], [-0.1, -0.3]], armA: [[2.3, 2.6], [1.3, 1.0]], arms: [true, true], head: true, col: p.col, pack: true, tilt: 0.3 });
    return;
  }
  const pose = playerPose(p);
  const blink = p.inv > 0 && Math.floor(time * 30) % 2 === 0;
  const col = blink ? { ...p.col, shirt: '#8a4a3a' } : p.col;
  drawHuman(ctx, { x: p.x, y: p.y + (p.onGround && Math.abs(p.vx) < 15 ? Math.sin(time * 2) * 0.6 : 0), f: p.f, s: 1, lean: p.lean, legs: pose.legs, armA: pose.arms, arms: [true, true], head: true, col, pack: true, onHand: pose.onHand });
}

function drawGib(gb) {
  ctx.save(); ctx.translate(gb.x, gb.y); ctx.rotate(gb.rot);
  const fade = clamp((gb.life - gb.t) / 3, 0, 1);
  ctx.globalAlpha = fade;
  if (gb.kind === 'head') {
    ctx.scale(gb.s, gb.s);
    drawHead(ctx, 0, 0, { col: gb.col, zombie: true, jaw: gb.jaw });
    ctx.fillStyle = '#8a0808'; ctx.beginPath(); ctx.ellipse(0, 8, 4, 2, 0, 0, TAU); ctx.fill();
  } else if (gb.kind === 'arm') {
    ctx.scale(gb.s, gb.s); ctx.lineCap = 'round';
    seg(ctx, 0, -12, 0, 2, 6.5, gb.col.sleeve);
    seg(ctx, 0, 2, 4, 15, 5.5, gb.col.skin);
    ctx.fillStyle = '#8a0808'; ctx.beginPath(); ctx.arc(0, -13, 3.2, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = chance(0.5) ? '#6a0a0a' : '#7a1010';
    ctx.beginPath(); ctx.moveTo(-gb.r, 0); ctx.lineTo(0, -gb.r * 0.8); ctx.lineTo(gb.r, -gb.r * 0.2); ctx.lineTo(gb.r * 0.4, gb.r); ctx.fill();
    ctx.fillStyle = gb.col.skin; ctx.fillRect(-gb.r * 0.6, -gb.r * 0.5, gb.r * 0.7, gb.r * 0.5);
  }
  ctx.restore();
}

// ---------- Décor ----------
function drawSky() {
  const gr = ctx.createLinearGradient(0, 0, 0, GROUND);
  gr.addColorStop(0, '#070a12'); gr.addColorStop(0.6, '#121827'); gr.addColorStop(1, '#1d2232');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, GROUND);
  // lune
  const mx = 780 - cam.x * 0.02, my = 95;
  const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
  mg.addColorStop(0, 'rgba(200,210,230,0.25)'); mg.addColorStop(1, 'rgba(200,210,230,0)');
  ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
  ctx.fillStyle = '#d9dcd0'; ctx.beginPath(); ctx.arc(mx, my, 32, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(150,150,140,0.5)';
  for (const [x, y, r] of [[-10, -8, 7], [8, 5, 5], [-4, 12, 4], [12, -12, 3]]) { ctx.beginPath(); ctx.arc(mx + x, my + y, r, 0, TAU); ctx.fill(); }
  // éclair
  if (weather.bolt) {
    ctx.strokeStyle = `rgba(220,230,255,${weather.bolt.t / 0.18})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); weather.bolt.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  // nuages
  for (const c of envr.clouds) {
    ctx.fillStyle = `rgba(${30 + weather.flash * 120},${34 + weather.flash * 120},${46 + weather.flash * 120},0.55)`;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(c.x + i * 40 * c.s, c.y + Math.sin(i * 1.7) * 10, 60 * c.s, 22 * c.s, 0, 0, TAU); ctx.fill(); }
  }
}
function drawFar() {
  const off = -cam.x * 0.2;
  ctx.fillStyle = '#0c1019';
  for (const b of envr.far) {
    const x = b.x + off;
    if (x > W || x + b.w < 0) continue;
    ctx.fillRect(x, GROUND - 40 - b.h, b.w, b.h + 40);
    if (b.ant) { ctx.fillRect(x + b.w / 2, GROUND - 40 - b.h - 30, 2, 30); if (Math.floor(time * 1.5) % 2) { ctx.fillStyle = '#a01010'; ctx.fillRect(x + b.w / 2 - 1, GROUND - 40 - b.h - 32, 4, 3); ctx.fillStyle = '#0c1019'; } }
  }
  for (const b of envr.far) {
    const x = b.x + off;
    if (x > W || x + b.w < 0) continue;
    for (const [wx, wy, warm] of b.win) { ctx.fillStyle = warm ? 'rgba(200,150,60,0.5)' : 'rgba(120,140,170,0.3)'; ctx.fillRect(x + wx, GROUND - 40 - b.h + wy, 4, 5); }
  }
}
function drawMid() {
  const off = -cam.x * 0.5;
  for (const b of envr.mid) {
    const x = b.x + off;
    if (x > W + 20 || x + b.w < -20) continue;
    ctx.fillStyle = '#121822';
    ctx.beginPath(); ctx.moveTo(x, GROUND);
    for (const [px, ph] of b.pts) ctx.lineTo(x + px, GROUND - ph);
    ctx.lineTo(x + b.w, GROUND); ctx.fill();
    ctx.fillStyle = '#0a0d13';
    for (const [hx, hy, hw, hh] of b.holes) if (hy < b.h - 30) ctx.fillRect(x + hx, GROUND - b.h + hy, hw, hh);
  }
}
function drawNear() {
  const x0 = cam.x - 200, x1 = cam.x + W + 200;
  // murs tagués
  for (const w of envr.walls) {
    if (w.x + w.w < x0 || w.x > x1) continue;
    ctx.fillStyle = '#2a2524';
    ctx.beginPath(); ctx.moveTo(w.x, GROUND - 4); ctx.lineTo(w.x, GROUND - w.h); ctx.lineTo(w.x + w.w * 0.3, GROUND - w.h + 10);
    ctx.lineTo(w.x + w.w * (0.5 + w.br * 0.2), GROUND - w.h * 0.6); ctx.lineTo(w.x + w.w * 0.75, GROUND - w.h + 20); ctx.lineTo(w.x + w.w, GROUND - w.h + 5); ctx.lineTo(w.x + w.w, GROUND - 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let by = GROUND - 14; by > GROUND - w.h; by -= 10) { ctx.beginPath(); ctx.moveTo(w.x, by); ctx.lineTo(w.x + w.w, by); ctx.stroke(); }
    ctx.save(); ctx.font = 'bold 20px "Creepster", Impact, sans-serif'; ctx.fillStyle = 'rgba(150,20,20,0.75)'; ctx.textAlign = 'center';
    ctx.translate(w.x + w.w / 2, GROUND - w.h * 0.35); ctx.rotate(-0.04); ctx.fillText(w.tag, 0, 0, w.w - 10); ctx.restore();
  }
  // grillages
  for (const f of envr.fences) {
    if (f.x + f.w < x0 || f.x > x1) continue;
    ctx.strokeStyle = 'rgba(90,95,100,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= f.w; i += 8) { ctx.moveTo(f.x + i, GROUND - 4); ctx.lineTo(f.x + i + 40, GROUND - 74); ctx.moveTo(f.x + i + 40, GROUND - 4); ctx.lineTo(f.x + i, GROUND - 74); }
    ctx.stroke();
    ctx.fillStyle = '#2c2f33';
    for (let i = 0; i <= f.w + 40; i += 50) ctx.fillRect(f.x + i, GROUND - 78, 3, 74);
  }
  // arbres morts
  ctx.lineCap = 'round';
  for (const t of envr.trees) {
    if (t.x + 120 < x0 || t.x - 120 > x1) continue;
    for (const [ax, ay, bx, by, w] of t.segs) seg(ctx, t.x + ax, GROUND - 4 + ay, t.x + bx, GROUND - 4 + by, w, '#16130f');
  }
  // lampadaires
  for (const l of envr.lamps) {
    if (l.x < x0 || l.x > x1) continue;
    ctx.fillStyle = '#1b1d21'; ctx.fillRect(l.x - 3, GROUND - 160, 6, 156);
    ctx.fillRect(l.x - 2, GROUND - 162, 32, 4);
    ctx.fillStyle = '#26282d'; ctx.beginPath(); ctx.moveTo(l.x + 18, GROUND - 160); ctx.lineTo(l.x + 38, GROUND - 160); ctx.lineTo(l.x + 34, GROUND - 152); ctx.lineTo(l.x + 22, GROUND - 152); ctx.fill();
    ctx.fillStyle = l.lvl > 0.5 ? '#ffe9b0' : '#555'; ctx.fillRect(l.x + 23, GROUND - 153, 10, 2);
  }
  // voitures calcinées
  for (const c of envr.cars) {
    if (c.x + 90 < x0 || c.x - 90 > x1) continue;
    ctx.save(); ctx.translate(c.x, GROUND - 2); ctx.rotate(c.tilt); ctx.scale(c.flip, 1);
    ctx.fillStyle = c.col;
    ctx.beginPath(); ctx.moveTo(-72, -12); ctx.lineTo(-72, -30); ctx.lineTo(-42, -35); ctx.lineTo(-24, -54); ctx.lineTo(26, -54); ctx.lineTo(44, -35); ctx.lineTo(72, -30); ctx.lineTo(74, -12); ctx.fill();
    ctx.fillStyle = '#07080a';
    ctx.beginPath(); ctx.moveTo(-36, -36); ctx.lineTo(-21, -50); ctx.lineTo(-3, -50); ctx.lineTo(-3, -36); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, -36); ctx.lineTo(2, -50); ctx.lineTo(23, -50); ctx.lineTo(30, -42); ctx.lineTo(24, -44); ctx.lineTo(36, -36); ctx.fill();
    ctx.fillStyle = 'rgba(110,50,20,0.35)'; ctx.fillRect(-60, -28, 30, 10); ctx.fillRect(20, -25, 40, 8);
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(-46, -12, 12, 0, TAU); ctx.arc(46, -12, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-46, -12, 5, 0, TAU); ctx.arc(46, -12, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // caisses
  for (const k of envr.crates) {
    if (k.x + 60 < x0 || k.x > x1) continue;
    for (let i = 0; i < k.n; i++) {
      const cx = k.x + (i === 2 ? 14 : i * 30), cy = GROUND - 4 - (i === 2 ? 56 : 28);
      ctx.fillStyle = '#3b2c1c'; ctx.fillRect(cx, cy, 28, 28);
      ctx.strokeStyle = '#24190f'; ctx.lineWidth = 2; ctx.strokeRect(cx + 1, cy + 1, 26, 26);
      ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.lineTo(cx + 26, cy + 26); ctx.stroke();
    }
  }
  // tonneaux
  for (const b of envr.barrels) {
    if (b.x < x0 || b.x > x1) continue;
    ctx.fillStyle = '#3a271b'; ctx.fillRect(b.x - 12, GROUND - 38, 24, 36);
    ctx.fillStyle = '#2a1b12'; ctx.fillRect(b.x - 12, GROUND - 30, 24, 3); ctx.fillRect(b.x - 12, GROUND - 14, 24, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x + 4, GROUND - 38, 8, 36);
  }
  // barricades aux extrémités
  for (const bx of [0, WORLD_W - 60]) {
    if (bx + 60 < x0 || bx > x1) continue;
    ctx.fillStyle = '#2b2a26';
    for (let i = 0; i < 6; i++) ctx.fillRect(bx + (i % 2) * 8, GROUND - 20 - i * 18, 52, 18);
    ctx.fillStyle = '#5a1a12'; ctx.fillRect(bx + 5, GROUND - 90, 44, 6);
  }
}
function drawGround() {
  const gr = ctx.createLinearGradient(0, GROUND, 0, H);
  gr.addColorStop(0, '#1d1f24'); gr.addColorStop(1, '#0c0d10');
  ctx.fillStyle = gr; ctx.fillRect(0, GROUND - 4, W, H - GROUND + 4);
  ctx.fillStyle = '#2b2d32'; ctx.fillRect(0, GROUND - 4, W, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, GROUND + 18, W, 2);
  // marquages routiers
  ctx.fillStyle = 'rgba(160,140,70,0.25)';
  const off = -(cam.x % 120);
  for (let x = off; x < W; x += 120) ctx.fillRect(x, GROUND + 46, 60, 3);
  // flaques qui reflètent
  ctx.fillStyle = 'rgba(120,140,170,0.07)';
  for (let i = 0; i < 12; i++) {
    const wx = i * 311 + 90, x = ((wx - cam.x) % 3600 + 3600) % 3600;
    if (x < W + 100) { ctx.beginPath(); ctx.ellipse(x - 50, GROUND + 30 + (i % 3) * 14, 40 + (i % 4) * 10, 4, 0, 0, TAU); ctx.fill(); }
  }
  // sang (calque persistant)
  ctx.drawImage(decal, cam.x, 0, W, DECAL_H, 0, DECAL_Y, W, DECAL_H);
}
function drawFog() {
  for (const f of envr.fog) {
    const x = f.x - cam.x;
    if (x < -f.r || x > W + f.r) continue;
    ctx.globalAlpha = f.a; ctx.drawImage(fogSprite, x - f.r, f.y - f.r, f.r * 2, f.r * 2);
  }
  ctx.globalAlpha = 1;
}

const fogSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(140,150,170,1)'); g.addColorStop(1, 'rgba(140,150,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c;
})();
// ---------- Éclairage dynamique ----------
function lightHole(c, x, y, r, a = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
function renderLighting() {
  const c = lctx;
  c.setTransform(scale / 2, 0, 0, scale / 2, 0, 0);
  c.globalCompositeOperation = 'source-over';
  const dark = 0.78 - weather.flash * 0.55;
  c.fillStyle = `rgba(3,5,12,${dark})`;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'destination-out';
  c.translate(-cam.x + cam.ox, cam.oy);
  // lune : légère lueur sur le haut
  for (const l of envr.lamps) {
    if (l.lvl <= 0 || Math.abs(l.x - cam.x - W / 2) > W) continue;
    const lx = l.x + 28, ly = GROUND - 152;
    c.save();
    c.beginPath(); c.moveTo(lx - 8, ly); c.lineTo(lx + 8, ly); c.lineTo(lx + 120, GROUND + 30); c.lineTo(lx - 120, GROUND + 30); c.closePath(); c.clip();
    lightHole(c, lx, ly, 230, 0.85 * l.lvl);
    c.restore();
    lightHole(c, lx, ly, 40, 0.8 * l.lvl);
  }
  for (const b of envr.barrels) {
    if (!b.fire || Math.abs(b.x - cam.x - W / 2) > W) continue;
    lightHole(c, b.x, GROUND - 45, 150 + Math.sin(time * 13 + b.x) * 10 + Math.sin(time * 31) * 6, 0.9);
  }
  if (player && !player.hidden) {
    const p = player;
    lightHole(c, p.x, p.y - 45, 120, 0.55);
    if (!p.dead) {
      // lampe torche
      const sh = shoulder(p), a = p.aim, L = 480, sp = 0.3;
      c.save();
      c.beginPath(); c.moveTo(sh.x, sh.y);
      c.lineTo(sh.x + Math.cos(a - sp) * L, sh.y + Math.sin(a - sp) * L);
      c.lineTo(sh.x + Math.cos(a + sp) * L, sh.y + Math.sin(a + sp) * L);
      c.closePath(); c.clip();
      lightHole(c, sh.x, sh.y, L, 0.9);
      c.restore();
    }
  }
  for (const f of flashes) lightHole(c, f.x, f.y, f.big ? 380 : 280, 1 - f.t / f.life);
  for (const pk of pickups) lightHole(c, pk.x, pk.y, 40, 0.5);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(light, 0, 0, W, H);
}
// Éléments lumineux dessinés par-dessus l'obscurité
function renderGlow() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of envr.lamps) {
    if (l.lvl <= 0 || Math.abs(l.x - cam.x - W / 2) > W) continue;
    const g = ctx.createRadialGradient(l.x + 28, GROUND - 152, 0, l.x + 28, GROUND - 152, 50);
    g.addColorStop(0, `rgba(255,220,150,${0.5 * l.lvl})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - 22, GROUND - 202, 100, 100);
  }
  for (const b of envr.barrels) {
    if (!b.fire || Math.abs(b.x - cam.x - W / 2) > W) continue;
    const g = ctx.createRadialGradient(b.x, GROUND - 40, 0, b.x, GROUND - 40, 70);
    g.addColorStop(0, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.fillRect(b.x - 70, GROUND - 110, 140, 140);
  }
  for (const p of particles) {
    if (!p.glow) continue;
    const k = 1 - p.t / p.life;
    if (p.type === 'spark') { ctx.strokeStyle = `rgba(255,${200 + 55 * k | 0},120,${k})`; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke(); }
    else if (p.type === 'fire') { ctx.fillStyle = `rgba(255,${50 + 130 * k * k | 0},${10 + 20 * k | 0},${0.45 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.6 + 0.4 * k)), 0, TAU); ctx.fill(); }
    else if (p.type === 'ember') { ctx.fillStyle = `rgba(255,150,50,${k})`; ctx.fillRect(p.x, p.y, 1.6, 1.6); }
  }
  for (const t of tracers) {
    const k = 1 - t.t / t.life;
    const g = ctx.createLinearGradient(t.x1, t.y1, t.x2, t.y2);
    g.addColorStop(0, `rgba(255,230,160,${0.1 * k})`); g.addColorStop(1, `rgba(255,240,190,${0.8 * k})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const f of flashes) {
    const k = 1 - f.t / f.life, r = (f.big ? 34 : 22) * (0.7 + Math.random() * 0.5);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,250,220,${k})`); g.addColorStop(0.4, `rgba(255,190,80,${0.7 * k})`); g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
    ctx.fillStyle = `rgba(255,230,150,${k})`;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(r * 1.3, 0); ctx.lineTo(0, 4); ctx.fill();
    ctx.restore();
  }
  for (const pk of pickups) {
    const a = 0.25 + Math.sin(time * 5) * 0.15;
    const g = ctx.createRadialGradient(pk.x, pk.y - 6, 0, pk.x, pk.y - 6, 26);
    g.addColorStop(0, pk.kind === 'med' ? `rgba(255,80,80,${a})` : `rgba(255,220,90,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(pk.x - 26, pk.y - 32, 52, 52);
  }
  ctx.restore();
}

// ---------- HUD ----------
function bar(x, y, w, h, v, col, back = 'rgba(0,0,0,0.6)') {
  ctx.fillStyle = back; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(v, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w * clamp(v, 0, 1), h / 2);
}
function text(t, x, y, size, col = '#ddd', align = 'left', font = '"Oswald", Impact, sans-serif') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(t, x + 2, y + 2);
  ctx.fillStyle = col; ctx.fillText(t, x, y);
}
function drawHUD() {
  const p = player, w = WEAPONS[p.wi];
  // dégâts / santé faible
  if (p.hurt > 0 || p.hp < 35) {
    const a = Math.max(p.hurt * 0.6, p.hp < 35 ? (0.25 + Math.sin(time * 6) * 0.1) * (1 - p.hp / 35) : 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  text('SANTÉ', 24, 32, 14, '#bbb');
  bar(80, 20, 200, 14, p.hp / 100, p.hp > 50 ? '#b3261e' : p.hp > 25 ? '#d0541c' : '#ff2a2a');
  text(Math.ceil(p.hp), 290, 33, 14, '#fff');
  text('ENDURANCE', 24, 54, 11, '#999');
  bar(100, 45, 180, 7, p.st / 100, '#c9a227');
  // vague, score
  text(game.wave ? `VAGUE ${game.wave}` : 'PRÉPARATION', W / 2, 34, 24, '#c33', 'center', '"Creepster", Impact, sans-serif');
  const left = zombies.filter(z => z.alive).length + game.toSpawn;
  if (game.wave && game.breakT <= 0) text(`${left} restants`, W / 2, 54, 13, '#aaa', 'center');
  else if (game.breakT > 0 && game.wave) text(`Prochaine vague dans ${Math.ceil(game.breakT)}`, W / 2, 54, 13, '#aaa', 'center');
  text(`SCORE ${game.score}`, W - 24, 34, 20, '#eee', 'right');
  text(`${game.kills} éliminés · ${game.heads} têtes`, W - 24, 54, 12, '#aaa', 'right');
  if (game.comboT > 0 && game.combo > 1) text(`COMBO x${Math.min(6, game.combo)}`, W - 24, 78, 18, '#fc4', 'right');
  // armes
  for (let i = 0; i < WEAPONS.length; i++) {
    const x = 24 + i * 62, y = H - 58, sel = i === p.wi;
    ctx.fillStyle = sel ? 'rgba(180,40,30,0.55)' : 'rgba(0,0,0,0.45)'; ctx.fillRect(x, y, 56, 36);
    ctx.strokeStyle = sel ? '#e55' : '#444'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 55, 35);
    ctx.save(); ctx.translate(x + 26, y + 20); ctx.scale(0.9, 0.9); drawGun(ctx, WEAPONS[i].id); ctx.restore();
    text(String(i + 1), x + 4, y + 12, 10, '#aaa');
  }
  text(w.name, W - 24, H - 52, 15, '#bbb', 'right');
  const mag = p.mag[p.wi];
  text(`${mag}`, W - 80, H - 18, 34, mag === 0 ? '#f44' : mag <= w.mag * 0.25 ? '#fa4' : '#fff', 'right');
  text(`/ ${p.res[p.wi]}`, W - 24, H - 20, 18, '#999', 'right');
  if (p.reload > 0) {
    text('RECHARGEMENT', W / 2, H - 70, 14, '#fd6', 'center');
    bar(W / 2 - 60, H - 62, 120, 5, 1 - p.reload / p.reloadMax, '#fd6');
  } else if (mag === 0 && p.res[p.wi] === 0) text('À COURT — MACHETTE [F / CLIC DROIT]', W / 2, H - 66, 14, '#f66', 'center');
  // popups
  for (const pp of popups) {
    const k = pp.t / pp.life, x = pp.x - cam.x, y = pp.y - k * 40;
    ctx.globalAlpha = 1 - k * k;
    text(pp.text, x, y, pp.small ? 14 : 18, pp.col || '#fd6', 'center');
    if (pp.sub) text(pp.sub, x, y + 16, 12, '#f55', 'center');
    ctx.globalAlpha = 1;
  }
  // messages
  if (game.msgT > 0) {
    const a = clamp(game.msgT, 0, 1) * clamp((3.2 - game.msgT) * 3 + 1, 0, 1);
    ctx.globalAlpha = clamp(a, 0, 1);
    text(game.msg, W / 2, H / 2 - 70, 56, '#b11', 'center', '"Creepster", Impact, sans-serif');
    if (game.msgSub) text(game.msgSub, W / 2, H / 2 - 38, 18, '#ccc', 'center');
    ctx.globalAlpha = 1;
  }
  if (Sound.isMuted()) text('SON COUPÉ [M]', W - 24, 100, 12, '#888', 'right');
  // réticule
  if (!p.dead) {
    const gap = 6 + (w.spread + p.recoil * 0.03 + (Math.abs(p.vx) > 200 ? 0.035 : 0)) * 220;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mouse.x - gap - 7, mouse.y); ctx.lineTo(mouse.x - gap, mouse.y);
    ctx.moveTo(mouse.x + gap, mouse.y); ctx.lineTo(mouse.x + gap + 7, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - gap - 7); ctx.lineTo(mouse.x, mouse.y - gap);
    ctx.moveTo(mouse.x, mouse.y + gap); ctx.lineTo(mouse.x, mouse.y + gap + 7);
    ctx.stroke();
    ctx.fillStyle = '#f33'; ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
  }
}
function drawPickup(k) {
  ctx.save(); ctx.translate(k.x, k.y + Math.sin(time * 4 + k.x) * 1.5);
  if (k.t > k.life - 5 && Math.floor(time * 8) % 2) ctx.globalAlpha = 0.4;
  if (k.kind === 'med') {
    ctx.fillStyle = '#ddd'; ctx.fillRect(-11, -14, 22, 16);
    ctx.fillStyle = '#c11'; ctx.fillRect(-2.5, -12, 5, 12); ctx.fillRect(-8, -8.5, 16, 5);
  } else {
    ctx.fillStyle = '#3e4a2a'; ctx.fillRect(-12, -14, 24, 16);
    ctx.fillStyle = '#c9a227'; ctx.fillRect(-12, -9, 24, 3);
    ctx.fillStyle = '#b08a3a'; for (let i = 0; i < 4; i++) ctx.fillRect(-8 + i * 5, -19, 3, 6);
  }
  ctx.restore();
}

function drawMenu() {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  const pulse = 1 + Math.sin(time * 2) * 0.02;
  ctx.save(); ctx.translate(W / 2, 150); ctx.scale(pulse, pulse);
  text('NUIT DES MORTS', 0, 0, 86, '#a80f0f', 'center', '"Creepster", Impact, sans-serif');
  ctx.restore();
  text('Survivez aussi longtemps que possible aux hordes de zombies', W / 2, 190, 18, '#bbb', 'center');
  const lines = [
    ['Q / D  ou  A / D', 'Se déplacer'],
    ['Z / W / Espace', 'Sauter'],
    ['Maj', 'Sprinter'],
    ['Souris + Clic gauche', 'Viser et tirer'],
    ['Clic droit / F', 'Coup de machette'],
    ['E', 'Coup de pied (repousse)'],
    ['R', 'Recharger'],
    ['1 2 3 / Molette / Tab', 'Changer d\'arme'],
    ['M · Échap', 'Son · Pause'],
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 230, 212, 460, lines.length * 22 + 16);
  lines.forEach(([k, v], i) => { text(k, W / 2 - 15, 236 + i * 22, 15, '#e8c56a', 'right'); text(v, W / 2 + 15, 236 + i * 22, 15, '#ccc', 'left'); });
  if (Math.floor(time * 2) % 2 === 0) text('CLIQUEZ POUR COMMENCER', W / 2, 470, 26, '#fff', 'center');
  text('Visez la tête. 🎧 Jouez avec le son.', W / 2, 500, 13, '#888', 'center');
  if (best) text(`Meilleur score : ${best}`, W / 2, 522, 13, '#c9a227', 'center');
}
function drawOver() {
  const k = clamp(game.overT / 1.2, 0, 1);
  ctx.fillStyle = `rgba(40,0,0,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k;
  text('VOUS ÊTES MORT', W / 2, 170, 80, '#b10f0f', 'center', '"Creepster", Impact, sans-serif');
  const acc = game.shots ? Math.round(game.hits / game.shots * 100) : 0;
  const rows = [['Vague atteinte', game.wave], ['Zombies éliminés', game.kills], ['Tirs à la tête / décapitations', game.heads], ['Précision', acc + ' %'], ['Score', game.score], ['Meilleur score', best]];
  rows.forEach(([a, b], i) => { text(a, W / 2 - 10, 240 + i * 28, 18, '#bbb', 'right'); text(String(b), W / 2 + 10, 240 + i * 28, 18, '#fff', 'left'); });
  if (game.overT > 1.2 && Math.floor(time * 2) % 2 === 0) text('CLIQUEZ POUR REJOUER', W / 2, 450, 24, '#fff', 'center');
  ctx.globalAlpha = 1;
}

function render() {
  eyes = [];
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  ctx.translate(cam.ox * 0.3, cam.oy * 0.3);
  drawSky();
  drawFar();
  drawMid();
  ctx.restore();
  ctx.save();
  ctx.translate(cam.ox, cam.oy);
  drawGround();
  ctx.translate(-cam.x, 0);
  drawNear();
  for (const c of corpses) drawCorpse(c);
  for (const gb of gibs) drawGib(gb);
  for (const k of pickups) drawPickup(k);
  for (const p of particles) {
    if (p.glow) continue;
    const k = 1 - p.t / p.life;
    if (p.type === 'blood') { ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    else if (p.type === 'shell') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.red ? '#a3261c' : '#c9a24a'; ctx.fillRect(-2 * p.size, -1 * p.size, 4 * p.size, 2 * p.size); ctx.restore(); }
  }
  const zs = zombies.slice().sort((a, b) => a.s - b.s);
  for (const z of zs) drawZombie(z);
  drawPlayer();
  for (const p of particles) {
    if (p.glow || (p.type !== 'mist' && p.type !== 'smoke')) continue;
    const k = 1 - p.t / p.life;
    ctx.fillStyle = `rgba(${p.col},${(p.a || 0.45) * k})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.translate(cam.x, 0);
  drawFog();
  ctx.restore();

  // obscurité + lumières
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderLighting();
  ctx.save();
  ctx.translate(-cam.x + cam.ox, cam.oy);
  renderGlow();
  ctx.restore();
  // yeux luisants des zombies
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const e of eyes) {
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 6 * e.s);
    g.addColorStop(0, `rgba(${e.col},0.95)`); g.addColorStop(0.3, `rgba(${e.col},0.4)`); g.addColorStop(1, `rgba(${e.col},0)`);
    ctx.fillStyle = g; ctx.fillRect(e.x - 6 * e.s, e.y - 6 * e.s, 12 * e.s, 12 * e.s);
  }
  // traînée de la machette
  trail = trail.filter(t => time - t.t < 0.12);
  if (trail.length > 1) {
    ctx.strokeStyle = 'rgba(220,230,240,0.35)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); trail.forEach((t, i) => i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y)); ctx.stroke();
  }
  ctx.restore();
  // éclair global
  if (weather.flash > 0) { ctx.fillStyle = `rgba(200,210,255,${weather.flash * 0.18})`; ctx.fillRect(0, 0, W, H); }
  // pluie
  ctx.strokeStyle = 'rgba(160,175,200,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of rain) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.18, d.y - d.len); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(170,185,210,0.35)';
  for (const s of splashes) { const r = 1 + s.t * 16; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.3, 0, Math.PI, TAU); ctx.stroke(); }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (state === 'menu') drawMenu();
  else {
    drawHUD();
    if (state === 'over') drawOver();
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      text('PAUSE', W / 2, H / 2, 64, '#ddd', 'center', '"Creepster", Impact, sans-serif');
      text('Cliquez ou appuyez sur Échap pour reprendre', W / 2, H / 2 + 36, 16, '#aaa', 'center');
    }
  }
}

// ---------- Boucle principale ----------
menuInit();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  for (const k in pressed) delete pressed[k];
  mouse.lp = mouse.rp = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = { get state() { return state; }, get player() { return player; }, get zombies() { return zombies; }, get game() { return game; } };
})();
