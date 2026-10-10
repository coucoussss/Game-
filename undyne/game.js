'use strict';
(() => {
// ============================================================
//  UNDYNE L'IMMORTELLE — fan game inspiré d'Undertale
// ============================================================
const W = 640, H = 480, TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit); fit();

// ---------- Police pixel ----------
const glyphs = new Map();
const AC = { acute: [[4, 0], [3, 1]], grave: [[2, 0], [3, 1]], circ: [[3, 0], [2, 1], [4, 1]], trema: [[2, 1], [5, 1]] };
const ACCENTS = { 'É': ['E', AC.acute], 'È': ['E', AC.grave], 'Ê': ['E', AC.circ], 'À': ['A', AC.grave], 'Â': ['A', AC.circ], 'Î': ['I', AC.circ], 'Ô': ['O', AC.circ], 'Û': ['U', AC.circ], 'Ù': ['U', AC.grave], 'Ë': ['E', AC.trema], 'Ï': ['I', AC.trema] };
function glyph(ch, color) {
  const key = ch + color;
  let g = glyphs.get(key);
  if (g) return g;
  g = document.createElement('canvas'); g.width = 8; g.height = 12;
  const c = g.getContext('2d');
  c.font = '8px PixelFont, monospace'; c.textBaseline = 'top'; c.fillStyle = '#fff';
  // Majuscules accentuées : lettre de base + accent dessiné au-dessus (la police les écrase)
  const acc = ACCENTS[ch];
  c.fillText(acc ? acc[0] : ch, 0, 2);
  if (acc) for (const [x, y] of acc[1]) c.fillRect(x, y, 1, 1);
  const img = c.getImageData(0, 0, 8, 12), v = parseInt(color.slice(1), 16);
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] > 110;
    img.data[i] = v >> 16; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255; img.data[i + 3] = on ? 255 : 0;
  }
  c.putImageData(img, 0, 0);
  glyphs.set(key, g);
  return g;
}
// Texte : (x, y) = coin haut-gauche ; sx/sy = échelle des pixels de la police (8 px de base)
function text(str, x, y, o = {}) {
  const sx = o.sx || 2, sy = o.sy || 3, col = o.color || '#ffffff';
  if (o.center) x -= str.length * 8 * sx / 2;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    let dx = 0, dy = 0;
    if (o.shake) { dx = rint(-o.shake, o.shake); dy = rint(-o.shake, o.shake); }
    ctx.drawImage(glyph(ch, col), Math.round(x + i * 8 * sx + dx), Math.round(y - 2 * sy + dy), 8 * sx, 12 * sy);
  }
}
function wrap(str, max) {
  const out = [];
  for (const para of str.split('\n')) {
    const star = para.startsWith('* ');
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (cand.length > max && line) { out.push(line); line = (star ? '  ' : '') + w; } else line = cand;
    }
    out.push(line);
  }
  return out;
}

// ---------- Pixel maps ----------
function pmap(rows, color) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d'); g.fillStyle = color;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') g.fillRect(x, y, 1, 1); });
  return c;
}
const HEART_ROWS = [
  '..XXXX....XXXX..',
  '.XXXXXX..XXXXXX.',
  'XXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXX',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '.....XXXXXX.....',
  '......XXXX......',
  '.......XX.......',
];
const SPLIT = [8, 7, 6, 7, 8, 9, 8, 7, 6, 7, 8, 8, 8];
const HEART = { red: pmap(HEART_ROWS, '#ff0000'), green: pmap(HEART_ROWS, '#00e000'), white: pmap(HEART_ROWS, '#ffffff') };
const HEART_L = pmap(HEART_ROWS.map((r, y) => r.split('').map((c, x) => x < SPLIT[y] ? c : '.').join('')), '#ff0000');
const HEART_R = pmap(HEART_ROWS.map((r, y) => r.split('').map((c, x) => x > SPLIT[y] ? c : '.').join('')), '#ff0000');
const SHARD = pmap(['.XX.', 'XXXX', '.XX.', '..X.'], '#ff0000');
const ICONS = {
  fight: ['..............XX', '.............XXX', '............XXX.', '...........XXX..', '..........XXX...', '.........XXX....', '..XX....XXX.....', '..XXX..XXX......', '...XXXXXX.......', '....XXXX........', '....XXXXX.......', '...XXX.XXX......', '..XXX...XX......', '.XXX............', '.XX.............', '................'],
  act: ['................', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XX..........XX.', '.XX.XX.XX.XX.XX.', '.XX..........XX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '....XXX.........', '....XX..........', '....X...........', '................', '................', '................', '................', '................'],
  item: ['................', '.....XXXXXX.....', '....XX....XX....', '....XX....XX....', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XX..........XX.', '.XX..XXXXXX..XX.', '.XX..........XX.', '.XX..........XX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '................', '................', '................', '................'],
  mercy: ['.XX..........XX.', '.XXX........XXX.', '..XXX......XXX..', '...XXX....XXX...', '....XXX..XXX....', '.....XXXXXX.....', '......XXXX......', '......XXXX......', '.....XXXXXX.....', '....XXX..XXX....', '...XXX....XXX...', '..XXX......XXX..', '.XXX........XXX.', '.XX..........XX.', '................', '................'],
};
const ORANGE = '#ff8c1a', YELLOW = '#ffff00';
const ICON = {};
for (const k in ICONS) ICON[k] = { o: pmap(ICONS[k], ORANGE), y: pmap(ICONS[k], YELLOW) };

// Lance magique (pointe à droite) et flèche (pointe à droite)
function spearImg(main, dark, light) {
  const c = document.createElement('canvas'); c.width = 54; c.height = 13;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 3; x < 38; x++) { px(x, 5, dark); px(x, 6, main); px(x, 7, main); px(x, 8, dark); }
  for (let x = 6; x < 36; x++) if (x % 9 === 0) { px(x, 6, light); }
  for (let k = 0; k < 4; k++) { px(k, 4 - (k >> 1), main); px(k, 9 + (k >> 1), main); px(k, 6, main); px(k, 7, main); }
  const hw = [2, 3, 4, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0];
  for (let i = 0; i < hw.length; i++) {
    const x = 38 + i;
    for (let dy = -hw[i]; dy <= hw[i] + 1; dy++) px(x, 6 + dy, dy === -hw[i] || dy === hw[i] + 1 ? dark : main);
    if (i < 13) px(x, 6, light);
  }
  return c;
}
const SPEAR = spearImg('#5fe9ff', '#1180d0', '#ffffff');
const SPEAR_HOT = spearImg('#ffffff', '#ffffff', '#ffffff');
function arrowImg(main, dark) {
  const c = document.createElement('canvas'); c.width = 38; c.height = 15;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 0; x < 24; x++) { px(x, 6, dark); px(x, 7, main); px(x, 8, dark); }
  for (let i = 0; i <= 13; i++) {
    const h = Math.round((13 - i) * 0.5);
    for (let dy = -h; dy <= h; dy++) px(24 + i, 7 + dy, Math.abs(dy) === h ? dark : main);
  }
  px(37, 7, '#ffffff'); px(36, 7, '#ffffff'); px(35, 7, '#ffffff');
  for (let k = 0; k < 6; k++) { px(k, 5 - (k >> 1), main); px(k, 9 + (k >> 1), main); }
  return c;
}
const ARROW = { b: arrowImg('#40d0ff', '#0a6ac0'), y: arrowImg('#ffff30', '#c08000') };
// Bouclier (arc bleu orienté vers le haut, centré sur l'âme)
const SHIELD = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.hypot(dx, dy), a = Math.atan2(dx, -dy);
    if (Math.abs(a) > 0.95) continue;
    if (r >= 21 && r < 25) { g.fillStyle = r < 22 ? '#a8c8ff' : r >= 24 ? '#1030c0' : '#3366ff'; g.fillRect(x, y, 1, 1); }
  }
  return c;
})();

// Cible de l'attaque (œil en lentilles concentriques)
const TARGET = (() => {
  const w = 565, h = 130;
  const P = new UndyneSprite.Pix(w, h, 0);
  const lens = (hw, hh, col) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI; pts.push([w / 2 - Math.cos(t) * hw, h / 2 - Math.sin(t) * hh]); }
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI; pts.push([w / 2 + Math.cos(t) * hw, h / 2 + Math.sin(t) * hh]); }
    P.poly(pts, col);
  };
  const rings = [[278, 62, '#ffffff'], [274, 59, '#000000'], [240, 56, '#2b8a3e'], [236, 53, '#000000'], [190, 50, '#ffffff'], [186, 47, '#000000'], [140, 44, '#2b8a3e'], [136, 41, '#000000'], [90, 38, '#ffffff'], [86, 35, '#000000'], [42, 30, '#2b8a3e'], [38, 27, '#000000']];
  for (const [hw, hh, c] of rings) lens(hw, hh, c);
  P.rect(w / 2 - 2, 8, 4, h - 16, '#ffffff');
  P.rect(w / 2 - 1, 10, 2, h - 20, '#000000');
  return P.canvas();
})();

// ---------- Entrées ----------
const held = {}, press = {};
function keyName(k) {
  if (k === 'z' || k === 'Z' || k === 'Enter') return 'ok';
  if (k === 'x' || k === 'X' || k === 'Shift') return 'back';
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') return k.slice(5).toLowerCase();
  return null;
}
addEventListener('keydown', e => {
  Audio8.init();
  if (scene === 'name') { nameKey(e); return; }
  const k = keyName(e.key);
  if (k) { if (!held[k]) press[k] = true; held[k] = true; e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') Audio8.toggleMute();
  if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else cv.requestFullscreen && cv.requestFullscreen(); }
});
addEventListener('keyup', e => { const k = keyName(e.key); if (k) held[k] = false; });
addEventListener('blur', () => { for (const k in held) held[k] = false; });

// ---------- Contenu ----------
const MAX_UNDYNE = 15000;
const INTRO = [
  { t: '...', melt: 0.55 },
  { t: "Tu croyais vraiment que j'allais tomber comme ça ?" },
  { t: 'Ce gamin... Tu allais le tuer sous mes yeux.' },
  { t: 'Papyrus. Toute la ville de Snowdin. Tout le monde...' },
  { t: '...réduits en poussière. Et toi, tu souris.' },
  { t: 'Mon corps tremble. Il voudrait se disperser au vent.' },
  { t: 'Mais quelque chose en moi refuse.', ev: 'reform' },
  { t: 'Asgore. Alphys. Le gamin. Tout le souterrain compte sur moi.' },
  { t: 'Alors écoute-moi bien.' },
  { t: 'Je ne vais PAS mourir.', ev: 'shake' },
  { t: 'Pour tous ceux qui croient encore en demain...' },
  { t: "JE VAIS T'ARRÊTER !!!", ev: 'start' },
];
const RETRY_INTRO = [
  { t: 'Encore toi ?' },
  { t: "Reviens autant de fois que tu veux. Je serai là. TOUJOURS !", ev: 'start' },
];
const TURN_LINES = [
  'NGAAAH ! Montre-moi ce que tu vaux !',
  'Tu esquives ? Pas pour longtemps !',
  'Chaque lance porte le nom de quelqu\'un que tu as effacé.',
  'Tu sens ça ? C\'est la colère de tout un peuple !',
  'Plus vite ! PLUS VITE !',
  'Ha... ha... Ce n\'est rien. Juste une égratignure.',
  'Papyrus croyait que tu pouvais changer. Il avait tort.',
  'Je ne recule devant RIEN !',
  'Mes jambes... Tais-toi, corps ! On n\'a pas fini !',
  'Alphys... j\'espère que tu as mis tout le monde à l\'abri.',
  'Tu ne passeras pas. PAS TANT QUE JE RESPIRE !',
  'Encore. ENCORE !',
  'Je vois à travers toi. Il n\'y a rien. Rien du tout.',
  'Ce monde ne t\'appartient pas !',
  'Je ne... tomberai... PAS !!',
  '...Encore une. Juste une de plus.',
  'HAAAAAAAAAA !!!',
];
const LATE_LINES = ['Toujours debout !', 'Tu crois que je vais lâcher ?!', 'Encore ! ENCORE !', 'Ngh... Pas encore !'];
const ENDING = [
  { t: 'Ngh... Non... Pas maintenant...', melt: 0.25 },
  { t: 'Je dois... tenir...', melt: 0.4 },
  { t: 'Alphys... Asgore... Pardon...', melt: 0.55 },
  { t: 'Non... NON !', melt: 0.6, ev: 'shake' },
  { t: 'Écoute-moi bien, toi...', melt: 0.7 },
  { t: 'Même si je disparais... ce n\'est pas fini.', melt: 0.8 },
  { t: 'Asgore t\'attend. Et derrière lui, il y a tout un monde...', melt: 0.9 },
  { t: '...qui ne te laissera JAMAIS gagner.', melt: 1 },
  { t: 'Ha... ha... ha...', melt: 1.15 },
];
const ITEMS0 = [
  { name: 'Tarte Caramel', heal: 999, txt: '* Vous mangez la Tarte Caramel-\n  Cannelle.' },
  { name: 'Héros Légend.', heal: 40, atk: 4, txt: '* Vous mangez le Héros Légend.' },
  { name: 'Steak Facial', heal: 60, txt: '* Vous mangez le Steak Facial.' },
  { name: 'Héros Légend.', heal: 40, atk: 4, txt: '* Vous mangez le Héros Légend.' },
  { name: 'Morceau Neige', heal: 45, txt: '* Vous mangez le Morceau de\n  Bonhomme de Neige.' },
  { name: 'Thé de la Mer', heal: 10, spd: 1, txt: '* Vous buvez le Thé de la Mer.' },
  { name: 'Morceau Neige', heal: 45, txt: '* Vous mangez le Morceau de\n  Bonhomme de Neige.' },
  { name: 'Pomme-Crabe', heal: 18, txt: '* Vous croquez la Pomme-Crabe.' },
];
function flavorText() {
  const f = U.hp / MAX_UNDYNE;
  if (G.turn === 0) return '* Undyne l\'Immortelle vous barre\n  le chemin.';
  if (f < 0.25) return pick(['* Le corps d\'Undyne commence à\n  fondre.', '* Undyne tient debout par pure\n  détermination.', '* Undyne tremble... mais elle\n  sourit.']);
  if (f < 0.55) return pick(['* Des gouttes tombent du corps\n  d\'Undyne.', '* Undyne respire de plus en plus\n  fort.', '* Undyne refuse de tomber.']);
  return pick(['* Undyne serre sa lance à s\'en\n  briser les doigts.', '* L\'air vibre autour d\'Undyne.', '* L\'œil d\'Undyne brille d\'une\n  lueur farouche.', '* Undyne fait tournoyer sa lance.\n* Le sol tremble.']);
}

// ---------- État global ----------
let scene = 'loading', sceneT = 0, time = 0;
let G, U;
function newGame(keepName) {
  const name = keepName && G ? G.name : 'CHARA';
  const mode = G ? G.mode : 'normal';
  G = { name, mode, lv: 15, hp: 76, maxhp: 76, atk: 0, speed: 150, items: ITEMS0.map(i => ({ ...i })), turn: 0, retry: G ? G.retry : 0,
    stats: { time: 0, hits: 0, items: 0, hitsDealt: 0 } };
  U = { hp: MAX_UNDYNE, shake: 0, melt: 0, meltTo: 0, flash: 0, visible: true, jitter: false, x: 120, y: -14 };
}

// ---------- Boîte de combat ----------
const BOX0 = { x: 32, y: 250, w: 575, h: 140 };
const box = { ...BOX0 }, boxTo = { ...BOX0 };
function setBox(w, h, cx = 320, cy = 320) { boxTo.w = w; boxTo.h = h; boxTo.x = Math.round(cx - w / 2); boxTo.y = Math.round(cy - h / 2); }
function boxReady() { return box.x === boxTo.x && box.y === boxTo.y && box.w === boxTo.w && box.h === boxTo.h; }
function updBox(dt) {
  const sp = 1400 * dt;
  for (const k of ['x', 'y', 'w', 'h']) {
    const d = boxTo[k] - box[k];
    box[k] = Math.abs(d) <= sp ? boxTo[k] : box[k] + Math.sign(d) * sp;
  }
}
function drawBox() {
  const x = Math.round(box.x), y = Math.round(box.y), w = Math.round(box.w), h = Math.round(box.h);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#000'; ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
}

// ---------- Âme ----------
const soul = { x: 320, y: 320, mode: 'red', inv: 0, shield: 0, ang: 0, visible: true, flash: 0 };
function drawSoul() {
  if (!soul.visible) return;
  if (soul.inv > 0 && Math.floor(soul.inv * 15) % 2 === 0) return;
  const img = soul.flash > 0 ? HEART.white : soul.mode === 'green' ? HEART.green : HEART.red;
  if (soul.mode === 'green' && (bs === 'attack' || bs === 'enemyTalk')) {
    ctx.save(); ctx.translate(Math.round(soul.x), Math.round(soul.y)); ctx.rotate(soul.ang);
    ctx.drawImage(SHIELD, -32, -32);
    if (soul.blockFlash > 0) { ctx.globalAlpha = soul.blockFlash * 3; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SHIELD, -32, -32); ctx.drawImage(SHIELD, -32, -32); }
    ctx.restore();
  }
  ctx.drawImage(img, Math.round(soul.x - 8), Math.round(soul.y - 6));
}
function hurt(dmg) {
  if (soul.inv > 0 || scene !== 'battle') return;
  if (G.mode === 'clement') dmg = Math.ceil(dmg / 2);
  G.hp = Math.max(0, G.hp - dmg);
  G.stats.hits++;
  soul.inv = G.mode === 'clement' ? 1.1 : 0.75;
  Audio8.sfx.hurt();
  shakeScreen = 5;
  if (G.hp <= 0) gameOver();
}

// ---------- Projectiles ----------
let arrows = [], spears = [], effects = [], warnings = [];
const ARROW_DIST = 300, SHIELD_R = 24, FLIP_DUR = 0.24, FLIP_AT = 96;
const DIRA = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]; // position de la flèche par rapport à l'âme : 0 = en haut
function spawnArrow(a) {
  arrows.push({ dir: a.kind === 'y' ? (a.dir + 2) % 4 : a.dir, arrive: a.dir, d: ARROW_DIST, v: a.v, kind: a.kind, flip: -1 });
}
function arrowPos(r) {
  let ang = DIRA[r.dir];
  if (r.flip >= 0) ang += Math.PI * (r.flip / FLIP_DUR);
  return { x: soul.x + Math.cos(ang) * r.d, y: soul.y + Math.sin(ang) * r.d, ang: ang + Math.PI };
}
function updArrows(dt) {
  for (const r of arrows) {
    if (r.flip >= 0) { r.flip += dt; if (r.flip >= FLIP_DUR) { r.flip = -2; r.dir = r.arrive; } continue; }
    r.d -= r.v * dt;
    if (r.kind === 'y' && r.flip === -1 && r.d <= FLIP_AT) { r.d = FLIP_AT; r.flip = 0; continue; }
    if (r.d <= SHIELD_R + 3 && soul.shield === r.dir) {
      r.dead = true; Audio8.sfx.block(); soul.blockFlash = 0.15;
      const p = arrowPos(r);
      for (let i = 0; i < 5; i++) effects.push({ kind: 'spark', x: p.x, y: p.y, vx: rand(-90, 90), vy: rand(-90, 90), t: 0, life: 0.25 });
    } else if (r.d <= 8) { r.dead = true; hurt(6); }
  }
  arrows = arrows.filter(r => !r.dead);
}
function drawArrows() {
  for (const r of arrows) {
    const p = arrowPos(r);
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(p.ang);
    ctx.drawImage(ARROW[r.kind], -37, -7);
    ctx.restore();
  }
}
// Distance point-segment
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
function spearHits(s) { // s : pointe (x, y) + angle
  const tx = s.x - Math.cos(s.ang) * 48, ty = s.y - Math.sin(s.ang) * 48;
  return segDist(soul.x, soul.y, s.x - Math.cos(s.ang) * 2, s.y - Math.sin(s.ang) * 2, tx, ty) < 7;
}
function drawSpear(x, y, ang, alpha = 1, img = SPEAR) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang);
  ctx.drawImage(img, -53, -6); ctx.restore();
}
function updSpears(dt) {
  for (const s of spears) {
    s.t += dt;
    s.update(s, dt);
    if (s.harm && soul.inv <= 0 && s.hit(s)) hurt(7);
  }
  spears = spears.filter(s => !s.dead);
  for (const w of warnings) w.t += dt;
  warnings = warnings.filter(w => w.t < w.life);
}
function drawSpears() {
  for (const s of spears) s.draw(s);
  for (const w of warnings) {
    if (Math.floor(w.t * 16) % 2) continue;
    if (w.kind === 'col') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(w.x - 6, w.y, 12, w.h); }
    else text('!', w.x - 8, w.y, { sx: 2, sy: 3, color: '#ff3030' });
  }
}

// --- Fabriques de projectiles (mode rouge) ---
const bx0 = () => box.x + 5, bx1 = () => box.x + box.w - 5, by0 = () => box.y + 5, by1 = () => box.y + box.h - 5;
// Lances qui surgissent du sol de la boîte
function pillar(x, warn = 0.5, hold = 0.3) {
  warnings.push({ kind: 'col', x, y: by0(), h: by1() - by0(), t: 0, life: warn });
  Audio8.sfx.warn();
  spears.push({ t: 0, x, len: 0, harm: false, sounded: false,
    update(s) {
      const full = by1() - by0();
      if (s.t < warn) s.len = 8;
      else if (s.t < warn + 0.08) { s.len = 8 + (full - 8) * ((s.t - warn) / 0.08); if (!s.sounded) { s.sounded = true; Audio8.sfx.thrust(); } }
      else if (s.t < warn + 0.08 + hold) s.len = full;
      else if (s.t < warn + 0.24 + hold) s.len = full * (1 - (s.t - warn - 0.08 - hold) / 0.16);
      else s.dead = true;
      s.harm = s.t >= warn && s.len > 10;
    },
    hit(s) { return Math.abs(soul.x - s.x) < 9 && soul.y + 4 > by1() - s.len; },
    draw(s) {
      ctx.save(); ctx.beginPath(); ctx.rect(bx0(), by0(), bx1() - bx0(), by1() - by0()); ctx.clip();
      const tip = by1() - s.len;
      drawSpear(s.x, tip, -Math.PI / 2);
      ctx.fillStyle = '#1180d0'; ctx.fillRect(Math.round(s.x) - 2, tip + 50, 4, Math.max(0, s.len - 50));
      ctx.fillStyle = '#5fe9ff'; ctx.fillRect(Math.round(s.x) - 1, tip + 50, 2, Math.max(0, s.len - 50));
      ctx.restore();
    } });
}
// Lance qui apparaît autour de l'âme, la vise, puis fonce
function homing(cx, cy, a, r = 115, wind = 0.6, v = 520) {
  const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
  Audio8.sfx.spear();
  spears.push({ t: 0, x, y, ang: a + Math.PI, harm: false, fly: false, spin: rand(4, 7) * (Math.random() < 0.5 ? -1 : 1),
    update(s, dt) {
      if (!s.fly) {
        const aim = Math.atan2(soul.y - s.y, soul.x - s.x);
        s.ang = aim + Math.max(0, 1 - s.t / 0.3) * s.spin;
        // place la pointe pour que la lance vise l'âme
        if (s.t >= wind) { s.fly = true; s.harm = true; s.vx = Math.cos(aim) * v; s.vy = Math.sin(aim) * v; s.ang = aim; }
      } else {
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) s.dead = true;
      }
    },
    hit: spearHits,
    draw(s) { drawSpear(s.x, s.y, s.ang, Math.min(1, s.t / 0.15), !s.fly && s.t > wind - 0.12 ? SPEAR_HOT : SPEAR); } });
}
// Lance droite qui traverse la boîte
function straight(x, y, ang, v, delay = 0) {
  spears.push({ t: -delay, x, y, ang, harm: true, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
    update(s, dt) {
      if (s.t < 0) return;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < -120 || s.x > W + 120 || s.y < -120 || s.y > H + 120) s.dead = true;
    },
    hit(s) { return s.t >= 0 && spearHits(s); },
    draw(s) { if (s.t >= 0) drawSpear(s.x, s.y, s.ang); } });
}

// ---------- Attaques ----------
function greenSeq(o) {
  const out = [];
  let t = o.start ?? 0.9, last = rint(0, 3), k = 0;
  const pats = o.pats || ['rand'];
  let pat = pick(pats), left = rint(3, 5), spinDir = Math.random() < 0.5 ? 1 : 3;
  for (let i = 0; i < o.n; i++) {
    if (--left <= 0) { pat = pick(pats); left = rint(3, 6); spinDir = Math.random() < 0.5 ? 1 : 3; }
    let dir;
    if (pat === 'rand') dir = Math.random() < 0.3 ? last : rint(0, 3);
    else if (pat === 'alt') dir = k % 2 ? (last + 2) % 4 : (last + 2) % 4;
    else if (pat === 'spin') dir = (last + spinDir) % 4;
    else if (pat === 'burst') dir = left % 3 === 0 ? rint(0, 3) : last;
    else dir = rint(0, 3);
    const kind = Math.random() < (o.yellow || 0) ? 'y' : 'b';
    const gap = dir === last && kind === 'b' ? o.gap * 0.62 : o.gap;
    if (i > 0) t += gap * rand(0.95, 1.15);
    out.push({ at: t, dir, kind, v: o.v });
    last = dir; k++;
  }
  return out;
}
function phGreen(seq) {
  return {
    mode: 'green', w: 76, h: 76, cx: 320, cy: 310,
    init(ph) {
      ph.list = seq.map(a => ({ ...a, spawn: a.at - ARROW_DIST / a.v - (a.kind === 'y' ? FLIP_DUR : 0) })).sort((a, b) => a.spawn - b.spawn);
      ph.i = 0; ph.end = Math.max(...seq.map(a => a.at)) + 0.6;
    },
    update(ph, t) {
      while (ph.i < ph.list.length && ph.list[ph.i].spawn <= t) spawnArrow(ph.list[ph.i++]);
      return t > ph.end && arrows.length === 0 && ph.i >= ph.list.length;
    },
  };
}
// Phase rouge générique : events = [[temps, fonction], ...]
function phRed(w, h, events, extra = 0.5) {
  return {
    mode: 'red', w, h, cx: 320, cy: 318,
    init(ph) { ph.ev = events.slice().sort((a, b) => a[0] - b[0]); ph.i = 0; ph.end = (ph.ev.length ? ph.ev[ph.ev.length - 1][0] : 0) + extra; },
    update(ph, t) {
      while (ph.i < ph.ev.length && ph.ev[ph.i][0] <= t) ph.ev[ph.i++][1]();
      return t > ph.end && spears.length === 0;
    },
  };
}
const evPillars = (start, waves, interval, warn = 0.62) => {
  const ev = [];
  for (let k = 0; k < waves; k++) ev.push([start + k * interval, () => {
    const x0 = bx0() + 10, x1 = bx1() - 10, n = Math.floor((x1 - x0) / 16) + 1;
    const type = rint(0, 2), off = rint(0, 1), cs = Math.round((soul.x - x0) / 16);
    const gapAt = clamp(cs + rint(-5, 3), 1, n - 4), wide = type === 2 ? 3 : 2;
    for (let c = 0; c < n; c++) {
      const x = x0 + c * 16;
      let on;
      if (type === 0) on = Math.floor(c / 2) % 2 === off;
      else on = c < gapAt || c > gapAt + wide;
      if (on) pillar(x, warn);
    }
  }]);
  return ev;
};
const evRing = (start, waves, interval, count, o = {}) => {
  const ev = [];
  for (let k = 0; k < waves; k++) ev.push([start + k * interval, () => {
    const a0 = rand(0, TAU), cx = soul.x, cy = soul.y;
    for (let i = 0; i < count; i++) {
      const a = a0 + i * TAU / count;
      if (o.chain) ev2.push([o.chain * i, () => homing(cx, cy, a, o.r, o.wind, o.v)]);
      else homing(cx, cy, a, o.r, o.wind, o.v);
    }
  }]);
  return ev;
};
let ev2 = []; // événements différés (chaînes de lances)
const evWalls = (start, waves, interval, v) => {
  const ev = [];
  for (let k = 0; k < waves; k++) ev.push([start + k * interval, () => {
    const fromLeft = k % 2 === 0, lanes = Math.floor((by1() - by0()) / 22), gap = rint(0, lanes - 1);
    for (let l = 0; l < lanes; l++) {
      if (l === gap || (lanes > 5 && l === (gap + 1) % lanes)) continue;
      const y = by0() + 11 + l * 22;
      if (fromLeft) straight(-10, y, 0, v); else straight(W + 10, y, Math.PI, v);
    }
    Audio8.sfx.spear();
  }]);
  return ev;
};
const evRain = (start, count, interval, v = 540) => {
  const ev = [];
  for (let k = 0; k < count; k++) ev.push([start + k * interval, () => {
    const x = Math.random() < 0.4 ? clamp(soul.x + rand(-10, 10), bx0() + 8, bx1() - 8) : rand(bx0() + 8, bx1() - 8);
    warnings.push({ kind: 'mark', x, y: by0() + 6, t: 0, life: 0.42 });
    Audio8.sfx.warn();
    straight(x, by0() - 60, Math.PI / 2, v, 0.42);
  }]);
  return ev;
};
const evSides = (start, count, interval, v = 480) => {
  const ev = [];
  for (let k = 0; k < count; k++) ev.push([start + k * interval, () => {
    const y = Math.random() < 0.5 ? clamp(soul.y, by0() + 6, by1() - 6) : rand(by0() + 6, by1() - 6), left = Math.random() < 0.5;
    warnings.push({ kind: 'mark', x: left ? bx0() + 12 : bx1() - 12, y: y - 12, t: 0, life: 0.38 });
    Audio8.sfx.warn();
    if (left) straight(bx0() - 50, y, 0, v, 0.38); else straight(bx1() + 50, y, Math.PI, v, 0.38);
  }]);
  return ev;
};

function buildAttack(turn) {
  const late = Math.max(0, turn - 16), sp = 1 + Math.min(late, 6) * 0.04;
  const L = Math.min(turn, 16);
  const v = (330 + L * 9) * sp, gap = Math.max(0.16, 0.34 - L * 0.011) / sp;
  const g = (n, o = {}) => phGreen(greenSeq({ n, gap, v, ...o }));
  const T = turn > 16 ? 12 + (late % 5) : turn;
  switch (T) {
    case 0: return [g(10, { pats: ['rand'], gap: 0.4, v: 300 })];
    case 1: return [phRed(150, 130, evRing(0.4, 4, 1.0, 4, { wind: 0.7, v: 460 }))];
    case 2: return [g(14, { pats: ['rand', 'spin'], yellow: 0.18 })];
    case 3: return [phRed(240, 130, evPillars(0.3, 6, 0.85))];
    case 4: return [g(18, { pats: ['spin', 'alt', 'rand'], yellow: 0.12 })];
    case 5: return [g(10, { yellow: 0.2 }), phRed(150, 130, evRing(0.3, 3, 0.95, 5, { wind: 0.6 }))];
    case 6: return [phRed(240, 130, [...evWalls(0.3, 5, 0.9, 250), ...evRain(0.8, 8, 0.5)])];
    case 7: return [g(22, { pats: ['spin', 'burst', 'rand'], yellow: 0.28 })];
    case 8: return [phRed(240, 130, [...evPillars(0.3, 5, 1.0), ...evRing(0.8, 4, 1.0, 3, { wind: 0.7 })])];
    case 9: return [g(14, { pats: ['burst', 'rand'], yellow: 0.15 }), phRed(170, 130, evRing(0.3, 4, 0.8, 6, { chain: 0.07, wind: 0.55 }))];
    case 10: return [phRed(240, 130, evRain(0.3, 14, 0.32)), g(12, { yellow: 0.3 }), phRed(150, 130, evRing(0.3, 3, 0.9, 6, { wind: 0.55 }))];
    case 11: return [g(26, { pats: ['spin', 'alt', 'burst', 'rand'], yellow: 0.38 })];
    case 12: return [phRed(170, 130, evRing(0.3, 5, 0.85, 8, { chain: 0.06, wind: 0.5, v: 560 }))];
    case 13: return [g(16, { yellow: 0.3 }), phRed(240, 130, [...evSides(0.3, 10, 0.4), ...evPillars(0.6, 4, 1.0)]), g(12, { yellow: 0.4 })];
    case 14: return [g(30, { pats: ['spin', 'burst', 'rand', 'alt'], yellow: 0.42 })];
    case 15: return [phRed(240, 130, [...evRain(0.3, 12, 0.35), ...evWalls(0.6, 4, 1.1, 280), ...evRing(1.2, 3, 1.3, 5, { wind: 0.6 })])];
    default: return [
      g(20, { yellow: 0.35, gap: gap * 0.92 }),
      phRed(170, 130, evRing(0.3, 4, 0.75, 8, { chain: 0.05, wind: 0.5, v: 580 })),
      g(20, { yellow: 0.45, gap: gap * 0.9 }),
      phRed(240, 130, [...evRain(0.3, 16, 0.26), ...evPillars(0.5, 4, 1.05)]),
    ];
  }
}

// ---------- Combat ----------
let bs = 'none', bsT = 0, btn = 0, sub = 0, page = 0;
let flavor = null, typer = null, msgDone = null, bubble = null;
let atk = null, fightBar = null, shakeScreen = 0, flashA = 0, dust = null;

class Typer {
  constructor(lines, voice, speed = 32) { this.lines = lines; this.total = lines.reduce((a, l) => a + l.length, 0); this.n = 0; this.acc = 0; this.voice = voice; this.speed = speed; this.k = 0; }
  get done() { return this.n >= this.total; }
  skip() { this.n = this.total; }
  charAt(i) { for (const l of this.lines) { if (i < l.length) return l[i]; i -= l.length; } return ''; }
  update(dt) {
    if (this.done) return;
    this.acc += dt;
    const per = 1 / this.speed;
    while (this.acc >= per && !this.done) {
      this.acc -= per;
      const c = this.charAt(this.n++);
      if (c !== ' ' && c !== '*' && this.voice) { if (this.voice === 'voice' ? this.k++ % 2 === 0 : true) Audio8.sfx[this.voice](); }
      const nx = this.charAt(this.n);
      if ((c === ',' || c === '.' || c === '!' || c === '?') && (nx === ' ' || nx === '')) this.acc -= per * (c === ',' ? 3 : 5);
    }
  }
  draw(x, y, lh, o) {
    let left = this.n;
    this.lines.forEach((l, i) => { if (left <= 0) return; text(l.slice(0, left), x, y + i * lh, o); left -= l.length; });
  }
}
function boxText(str, done) {
  typer = new Typer(wrap(str, 32), 'text');
  msgDone = done;
  bs = 'message';
}
function say(lines, done) { // bulles d'Undyne
  bubble = { lines, i: -1, done };
  nextBubble();
}
function nextBubble() {
  const b = bubble;
  b.i++;
  if (b.i >= b.lines.length) { bubble = null; b.done && b.done(); return; }
  const L = b.lines[b.i];
  b.typer = new Typer(wrap(L.t, 20), 'voice', 26);
  if (L.melt !== undefined) U.meltTo = L.melt;
  if (L.ev === 'reform') { flashA = 1; U.meltTo = 0; U.melt = 0; U.shake = 10; Audio8.sfx.flash(); }
  if (L.ev === 'shake') { U.shake = 10; shakeScreen = 4; Audio8.sfx.slam(); }
  if (L.ev === 'start') { U.shake = 14; shakeScreen = 8; flashA = 0.8; Audio8.sfx.slam(); }
  b.shake = L.ev === 'start' || L.t === L.t.toUpperCase() && /[A-Z]{3}/.test(L.t);
}
function updBubble(dt) {
  if (!bubble) return;
  bubble.typer.update(dt);
  if (press.back) bubble.typer.skip();
  if (press.ok && bubble.typer.done) {
    const L = bubble.lines[bubble.i];
    if (L.ev === 'start' && scene === 'battle' && bs === 'intro') Audio8.playBattle();
    nextBubble();
  }
}
function drawBubble() {
  if (!bubble || !bubble.typer) return;
  const lines = bubble.typer.lines, x = 432, y = 36, w = 190, h = 22 + lines.length * 18;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y, w - 8, h); ctx.fillRect(x, y + 4, w, h - 8); ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  // pointe vers Undyne
  for (let i = 0; i < 12; i++) ctx.fillRect(x - 12 + i, y + 22 - Math.floor(i / 2), 1, 2 + i);
  bubble.typer.draw(x + 12, y + 12, 18, { sx: 1, sy: 2, color: '#000000', shake: bubble.shake ? 1 : 0 });
}

function startBattle(retry) {
  scene = 'battle'; sceneT = 0;
  arrows = []; spears = []; effects = []; warnings = []; ev2 = [];
  Object.assign(box, BOX0); Object.assign(boxTo, BOX0);
  soul.mode = 'red'; soul.inv = 0; soul.visible = true; soul.shield = 0; soul.ang = 0;
  btn = 0; sub = 0; atk = null; dust = null; flavor = null; typer = null;
  bs = 'intro';
  U.melt = retry ? 0 : 0.55; U.meltTo = U.melt;
  Audio8.playDrone();
  say(retry ? RETRY_INTRO : INTRO, toMenu);
}
function toMenu() {
  bs = 'menu'; bsT = 0;
  setBox(BOX0.w, BOX0.h, BOX0.x + BOX0.w / 2, BOX0.y + BOX0.h / 2);
  soul.mode = 'red';
  flavor = new Typer(wrap(flavorText(), 32), 'text');
}
const BTNS = [{ x: 32, label: 'COMBAT', icon: 'fight' }, { x: 185, label: 'AGIR', icon: 'act' }, { x: 345, label: 'OBJET', icon: 'item' }, { x: 500, label: 'PITIÉ', icon: 'mercy' }];

function updBattle(dt) {
  bsT += dt;
  updBox(dt);
  if (U.shake > 0) U.shake = Math.max(0, U.shake - dt * 30);
  U.melt += (U.meltTo - U.melt) * Math.min(1, dt * 2);
  soul.inv = Math.max(0, soul.inv - dt);
  soul.flash = Math.max(0, soul.flash - dt);
  soul.blockFlash = Math.max(0, (soul.blockFlash || 0) - dt);
  if (bs !== 'intro' && bs !== 'ending' && bs !== 'dust' && bs !== 'won') G.stats.time += dt;

  switch (bs) {
    case 'intro': updBubble(dt); soul.visible = true; menuSoulTo(0); break;
    case 'menu': {
      flavor.update(dt);
      if (press.left) { btn = (btn + 3) % 4; Audio8.sfx.move(); }
      if (press.right) { btn = (btn + 1) % 4; Audio8.sfx.move(); }
      menuSoulTo(btn);
      if (press.ok) {
        Audio8.sfx.select(); sub = 0; page = 0;
        bs = ['fightTarget', 'actTarget', 'item', 'mercy'][btn];
        if (bs === 'item' && !G.items.length) bs = 'menu';
      }
      break;
    }
    case 'fightTarget': case 'actTarget':
      soul.x = 72; soul.y = 286;
      if (press.back) { bs = 'menu'; Audio8.sfx.move(); }
      else if (press.ok) {
        Audio8.sfx.select();
        if (bs === 'fightTarget') { bs = 'fightBar'; fightBar = { x: box.x + 5, t: 0, hit: false }; soul.visible = false; }
        else { bs = 'act'; sub = 0; }
      }
      break;
    case 'act':
      soul.x = 72; soul.y = 286;
      if (press.back) { bs = 'actTarget'; Audio8.sfx.move(); }
      else if (press.ok) {
        Audio8.sfx.select(); soul.visible = false;
        boxText('* UNDYNE L\'IMMORTELLE\n  ATQ 50 DÉF 20\n* Rien ne peut l\'arrêter.', enemyTurn);
      }
      break;
    case 'item': {
      const n = G.items.length, pages = Math.ceil(n / 4);
      const col = sub % 2, row = Math.floor(sub / 2);
      if (press.up || press.down) { const s2 = sub ^ 2; if (page * 4 + s2 < n) { sub = s2; Audio8.sfx.move(); } }
      if (press.right) { if (col === 0 && page * 4 + sub + 1 < n) sub++; else if (page + 1 < pages) { page++; sub = row * 2; while (page * 4 + sub >= n) sub--; } Audio8.sfx.move(); }
      if (press.left) { if (col === 1) sub--; else if (page > 0) { page--; sub = row * 2 + 1; } Audio8.sfx.move(); }
      soul.x = col ? 324 : 52; soul.y = 286 + row * 32;
      if (press.back) { bs = 'menu'; Audio8.sfx.move(); }
      else if (press.ok) useItem(page * 4 + sub);
      break;
    }
    case 'mercy':
      soul.x = 72; soul.y = 286;
      if (press.back) { bs = 'menu'; Audio8.sfx.move(); }
      else if (press.ok) { Audio8.sfx.select(); soul.visible = false; boxText('* Vous épargnez Undyne.\n* Elle ne vous rendra pas la\n  pareille.', enemyTurn); }
      break;
    case 'fightBar': {
      const fb = fightBar;
      fb.t += dt;
      if (!fb.hit) {
        fb.x += 560 * dt;
        if (press.ok) { fb.hit = true; fb.ht = 0; attackResult(Math.abs(fb.x + 7 - 320)); }
        else if (fb.x > box.x + box.w - 20) { fb.hit = true; fb.ht = 0; attackResult(-1); }
      } else fb.ht += dt;
      break;
    }
    case 'fightAnim': break;
    case 'message':
      typer.update(dt);
      if (press.back) typer.skip();
      if (press.ok && typer.done) { const d = msgDone; msgDone = null; d && d(); }
      break;
    case 'enemyTalk': updBubble(dt); placeSoulForPhase(); break;
    case 'attack': updAttack(dt); break;
    case 'ending': updBubble(dt); U.jitter = true; break;
    case 'dust': updDust(dt); break;
    case 'won':
      typer.update(dt);
      if (press.back) typer.skip();
      if (press.ok && typer.done) { scene = 'credits'; sceneT = 0; }
      break;
  }
  // Effets
  for (const e of effects) { e.t += dt; if (e.vx !== undefined) { e.x += e.vx * dt; e.y += e.vy * dt; } if (e.kind === 'dmg') { e.vy += 700 * dt; if (e.y > e.y0) { e.y = e.y0; e.vy = 0; } e.hpShow += (e.hpTo - e.hpShow) * Math.min(1, dt * 6); } }
  effects = effects.filter(e => e.t < e.life);
}
function menuSoulTo(i) { soul.visible = true; soul.mode = 'red'; soul.x = BTNS[i].x + 16; soul.y = 432 + 21; }

function useItem(i) {
  const it = G.items.splice(i, 1)[0];
  G.stats.items++;
  soul.visible = false;
  const before = G.hp;
  G.hp = Math.min(G.maxhp, G.hp + it.heal);
  Audio8.sfx.heal();
  let t = it.txt + '\n' + (G.hp >= G.maxhp ? '* Vos PV sont au maximum.' : '* Vous récupérez ' + (G.hp - before) + ' PV !');
  if (it.atk) { G.atk += it.atk; t += '\n* L\'ATQ augmente de ' + it.atk + ' !'; }
  if (it.spd) { G.speed = 190; t += '\n* Votre vitesse augmente !'; }
  boxText(t, enemyTurn);
}

function attackResult(dist) {
  bs = 'fightAnim';
  const miss = dist < 0;
  let dmg = 0;
  if (!miss) {
    const mult = dist < 12 ? 2.2 : Math.max(0.25, 2 * (1 - dist / 282));
    dmg = Math.round((560 + G.atk * 40 + rand(0, 80)) * mult / 1.15);
  }
  setTimeout(() => {
    if (miss) {
      effects.push({ kind: 'miss', t: 0, life: 1.1 });
      setTimeout(enemyTurn, 1100);
      return;
    }
    effects.push({ kind: 'slash', t: 0, life: 0.6 });
    Audio8.sfx.slash();
    setTimeout(() => {
      const from = U.hp;
      U.hp = Math.max(0, U.hp - dmg);
      G.stats.hitsDealt++;
      U.shake = 16;
      Audio8.sfx.damage();
      effects.push({ kind: 'dmg', t: 0, life: 1.3, val: dmg, x: 320, y: 104, y0: 104, vx: 0, vy: -300, hpShow: from, hpTo: U.hp });
      setTimeout(() => { if (U.hp <= 0) startEnding(); else enemyTurn(); }, 1300);
    }, 550);
  }, 380);
}

function enemyTurn() {
  if (scene !== 'battle') return;
  bs = 'enemyTalk';
  soul.visible = true;
  atk = { phases: buildAttack(G.turn), i: -1, t: 0, ph: null };
  const first = atk.phases[0];
  setBox(first.w, first.h, first.cx, first.cy);
  soul.mode = first.mode; soul.x = first.cx; soul.y = first.cy; soul.shield = 0; soul.ang = 0;
  if (first.mode === 'green') { soul.flash = 0.3; Audio8.sfx.soul(); }
  const line = G.turn < TURN_LINES.length ? TURN_LINES[G.turn] : pick(LATE_LINES);
  say([{ t: line }], () => { bs = 'attack'; nextPhase(); });
}
function placeSoulForPhase() {
  const p = atk.phases[0];
  soul.x = p.cx; soul.y = p.cy;
}
function nextPhase() {
  atk.i++;
  if (atk.i >= atk.phases.length) { endAttack(); return; }
  const ph = atk.phases[atk.i];
  atk.ph = ph; atk.t = 0; atk.wait = 0;
  if (ph.mode !== soul.mode || atk.i === 0) {
    if (ph.mode !== soul.mode) { soul.flash = 0.3; Audio8.sfx.soul(); flashA = 0.15; }
    soul.mode = ph.mode;
  }
  setBox(ph.w, ph.h, ph.cx, ph.cy);
  if (ph.mode === 'green') { soul.x = ph.cx; soul.y = ph.cy; }
  else { soul.x = clamp(soul.x, ph.cx - ph.w / 2 + 14, ph.cx + ph.w / 2 - 14); soul.y = clamp(soul.y, ph.cy - ph.h / 2 + 14, ph.cy + ph.h / 2 - 14); }
  atk.started = false;
}
function updAttack(dt) {
  const ph = atk.ph;
  if (!ph) return;
  // contrôle de l'âme
  if (soul.mode === 'green') {
    if (press.up) soul.shield = 0; else if (press.right) soul.shield = 1; else if (press.down) soul.shield = 2; else if (press.left) soul.shield = 3;
    const target = [0, Math.PI / 2, Math.PI, -Math.PI / 2][soul.shield];
    let d = target - soul.ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    soul.ang += d * Math.min(1, dt * 28);
    soul.x = ph.cx; soul.y = ph.cy;
  } else {
    const s = G.speed * dt;
    if (held.left) soul.x -= s; if (held.right) soul.x += s;
    if (held.up) soul.y -= s; if (held.down) soul.y += s;
    soul.x = clamp(soul.x, box.x + 13, box.x + box.w - 13);
    soul.y = clamp(soul.y, box.y + 12, box.y + box.h - 12);
  }
  if (!boxReady()) return; // on attend que la boîte ait fini de changer de taille
  if (!atk.started) { atk.started = true; ph.init(ph); }
  atk.t += dt;
  for (const e of ev2) e[0] -= dt;
  while (ev2.length && ev2[0][0] <= 0) ev2.shift()[1]();
  ev2.sort((a, b) => a[0] - b[0]);
  updArrows(dt);
  updSpears(dt);
  if (scene !== 'battle') return;
  if (ph.update(ph, atk.t) && !ev2.length) { warnings = []; nextPhase(); }
}
function endAttack() {
  arrows = []; spears = []; warnings = [];
  G.turn++;
  toMenu();
}

// ---------- Fin du combat ----------
function startEnding() {
  bs = 'ending';
  Audio8.stopMusic(1.5);
  soul.visible = false;
  say(ENDING, startDust);
}
function startDust() {
  bs = 'dust';
  // Capture de l'image fondue actuelle
  const snap = document.createElement('canvas'); snap.width = UndyneSprite.SW; snap.height = UndyneSprite.SH + 70;
  const sc = snap.getContext('2d'); sc.imageSmoothingEnabled = false;
  UndyneSprite.draw(sc, { t: time, x: 0, y: 0, s: 1, melt: U.melt });
  const data = sc.getImageData(0, 0, snap.width, snap.height).data;
  const rows = [];
  for (let y = 0; y < snap.height; y++) {
    const r = [];
    for (let x = 0; x < snap.width; x++) if (data[(y * snap.width + x) * 4 + 3] > 0) r.push(x);
    rows.push(r);
  }
  dust = { snap, rows, cut: 0, parts: [], t: 0 };
  U.visible = false;
  Audio8.sfx.dust();
}
function updDust(dt) {
  const d = dust;
  d.t += dt;
  const newCut = Math.min(d.snap.height, d.t / 1.8 * d.snap.height);
  for (let y = Math.floor(d.cut); y < Math.floor(newCut); y++)
    for (const x of d.rows[y]) if (Math.random() < 0.55) d.parts.push({ x: U.x + x * 2, y: U.y + y * 2, vx: rand(10, 60), vy: rand(-70, -20), life: rand(0.8, 1.6), t: 0 });
  d.cut = newCut;
  for (const p of d.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 10 * dt; }
  d.parts = d.parts.filter(p => p.t < p.life);
  if (d.t > 3.6 && !d.parts.length) {
    bs = 'won';
    Audio8.sfx.levelup();
    G.lv = 16;
    typer = new Typer(wrap('* VOUS AVEZ GAGNÉ !\n* Vous gagnez 1500 EXP et 0 OR.\n* Votre LV augmente.', 32), 'text');
  }
}
function drawDust() {
  const d = dust;
  if (!d) return;
  if (d.cut < d.snap.height) ctx.drawImage(d.snap, 0, d.cut, d.snap.width, d.snap.height - d.cut, U.x, U.y + d.cut * 2, d.snap.width * 2, (d.snap.height - d.cut) * 2);
  for (const p of d.parts) {
    const a = 1 - p.t / p.life;
    ctx.fillStyle = a > 0.5 ? '#ffffff' : '#9a9a9a';
    ctx.globalAlpha = Math.min(1, a * 1.5);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
  }
  ctx.globalAlpha = 1;
}

// ---------- Game over ----------
let over = null;
function gameOver() {
  scene = 'gameover'; sceneT = 0;
  Audio8.stopMusic();
  over = { x: soul.x, y: soul.y, stage: 0, shards: [], typer: null, li: 0 };
  arrows = []; spears = []; warnings = []; ev2 = [];
}
const OVER_LINES = () => [['Tu ne peux pas abandonner', 'maintenant...'], [G.name + ' !', 'Reste déterminé(e)...']];
function updOver(dt) {
  const o = over;
  if (o.stage === 0 && sceneT > 0.8) { o.stage = 1; Audio8.sfx.crack(); }
  if (o.stage === 1 && sceneT > 2.0) {
    o.stage = 2; Audio8.sfx.shatter();
    for (let i = 0; i < 6; i++) o.shards.push({ x: o.x + rand(-6, 6), y: o.y + rand(-4, 4), vx: rand(-160, 160), vy: rand(-260, -60) });
  }
  if (o.stage === 2) for (const s of o.shards) { s.vy += 600 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
  if (o.stage === 2 && sceneT > 3.4) { o.stage = 3; Audio8.playGameOver(); }
  if (o.stage === 3 && sceneT > 5.2) { o.stage = 4; o.typer = new Typer(OVER_LINES()[0], 'text', 18); }
  if (o.stage === 4) {
    o.typer.update(dt);
    if (press.back) o.typer.skip();
    if (press.ok && o.typer.done) {
      o.li++;
      if (o.li < OVER_LINES().length) o.typer = new Typer(OVER_LINES()[o.li], 'text', 18);
      else { o.stage = 5; o.fade = 0; }
    }
  }
  if (o.stage === 5) {
    o.fade += dt;
    if (o.fade > 1) { Audio8.stopMusic(0.5); G.retry++; newGame(true); startBattle(true); }
  }
}
function drawOver() {
  const o = over;
  if (o.stage === 0) ctx.drawImage(HEART.red, Math.round(o.x - 8), Math.round(o.y - 6));
  else if (o.stage === 1) { ctx.drawImage(HEART_L, Math.round(o.x - 10), Math.round(o.y - 6)); ctx.drawImage(HEART_R, Math.round(o.x - 6), Math.round(o.y - 6)); }
  else if (o.stage === 2) for (const s of o.shards) ctx.drawImage(SHARD, Math.round(s.x), Math.round(s.y), 8, 8);
  if (o.stage >= 3) {
    const a = Math.min(1, (sceneT - 3.4) / 1.5) * (o.stage === 5 ? 1 - Math.min(1, o.fade) : 1);
    ctx.globalAlpha = a;
    text('GAME', 320, 70, { sx: 8, sy: 8, center: true });
    text('OVER', 320, 150, { sx: 8, sy: 8, center: true });
    ctx.globalAlpha = 1;
  }
  if (o.stage === 4) o.typer.draw(130, 330, 36, { sx: 2, sy: 3 });
}

// ---------- Écran titre & nom ----------
let titleSel = 0, titleSpears = [];
function updTitle(dt) {
  if (press.up || press.down) { titleSel = 1 - titleSel; Audio8.sfx.move(); }
  if (press.left || press.right) { if (titleSel === 1) { G.mode = G.mode === 'normal' ? 'clement' : 'normal'; Audio8.sfx.move(); } }
  if (press.ok) {
    Audio8.sfx.select();
    if (titleSel === 0) { scene = 'name'; sceneT = 0; nameBuf = ''; }
    else G.mode = G.mode === 'normal' ? 'clement' : 'normal';
  }
  if (Math.random() < dt * 3) titleSpears.push({ x: rand(0, W), y: -50, v: rand(60, 140) });
  for (const s of titleSpears) s.y += s.v * dt;
  titleSpears = titleSpears.filter(s => s.y < H + 60);
}
function drawTitle() {
  for (const s of titleSpears) drawSpear(s.x, s.y, Math.PI / 2, 0.35);
  const sh = Math.sin(time * 3) * 2;
  text('UNDYNE', 320 + 4, 64 + 4, { sx: 7, sy: 8, color: '#5e0616', center: true });
  text('UNDYNE', 320, 64 + sh * 0, { sx: 7, sy: 8, color: '#ff2b3c', center: true });
  text("L'IMMORTELLE", 320, 150, { sx: 3, sy: 4, center: true });
  ctx.drawImage(HEART.red, 312, 206 + Math.round(sh));
  const items = ['COMMENCER', 'MODE : ' + (G.mode === 'normal' ? 'NORMAL' : 'CLÉMENT')];
  items.forEach((s, i) => text(s, 320, 260 + i * 40, { sx: 2, sy: 3, center: true, color: titleSel === i ? YELLOW : '#ffffff' }));
  text(G.mode === 'normal' ? 'Fidèle au combat original' : 'Dégâts reçus divisés par deux', 320, 340, { sx: 1, sy: 2, center: true, color: '#9a9a9a' });
  text('Flèches : se déplacer / orienter le bouclier', 320, 384, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  text('Z ou Entrée : valider    X ou Maj : annuler', 320, 404, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  text('M : couper le son    F : plein écran', 320, 424, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  text("Fan game non officiel inspiré d'UNDERTALE (Toby Fox)", 320, 460, { sx: 1, sy: 1, center: true, color: '#707070' });
}
let nameBuf = '';
function nameKey(e) {
  e.preventDefault();
  if (e.key === 'Enter') {
    G.name = (nameBuf || 'CHARA').toUpperCase();
    Audio8.sfx.select();
    scene = 'encounter'; sceneT = 0; newGame(true);
    return;
  }
  if (e.key === 'Escape') { scene = 'title'; return; }
  if (e.key === 'Backspace') { nameBuf = nameBuf.slice(0, -1); Audio8.sfx.move(); return; }
  if (e.key.length === 1 && /[a-zA-ZÀ-ÿ]/.test(e.key) && nameBuf.length < 6) { nameBuf += e.key.toUpperCase(); Audio8.sfx.move(); }
}
function drawName() {
  text("Nommez l'humain tombé.", 320, 90, { sx: 2, sy: 3, center: true });
  const n = (nameBuf || '') + (Math.floor(time * 2) % 2 ? '_' : ' ');
  text(n, 320 - 3 * 32, 190, { sx: 4, sy: 5, color: '#ffffff' });
  text('Tapez un nom (6 lettres max)', 320, 320, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  text('Entrée : valider (vide = CHARA)   Échap : retour', 320, 344, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
}

// ---------- Rencontre (transition d'entrée en combat) ----------
function updEncounter() {
  if (sceneT < 0.62) { const k = Math.floor(sceneT / 0.1); if (k !== updEncounter.k) { updEncounter.k = k; if (k % 2 === 0) Audio8.sfx.warn(); } }
  if (sceneT > 1.15) startBattle(false);
}
function drawEncounter() {
  let x = 320, y = 240;
  if (sceneT < 0.62) { if (Math.floor(sceneT / 0.1) % 2) return; }
  else { const k = Math.min(1, (sceneT - 0.62) / 0.45); x = 320 + (48 - 320) * k; y = 240 + (453 - 240) * k; }
  ctx.drawImage(HEART.red, Math.round(x - 8), Math.round(y - 6));
}

// ---------- Crédits ----------
function updCredits() { if (press.ok && sceneT > 1.5) { newGame(true); G.retry = 0; scene = 'title'; sceneT = 0; } }
function drawCredits() {
  const a = Math.min(1, sceneT / 1.5);
  ctx.globalAlpha = a;
  text('...', 320, 60, { sx: 2, sy: 3, center: true });
  text("Undyne l'Immortelle n'est plus.", 320, 110, { sx: 2, sy: 3, center: true });
  const t = Math.floor(G.stats.time), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  const lines = [
    ['Temps de combat', mm + ':' + ss],
    ['Coups encaissés', String(G.stats.hits)],
    ['Objets utilisés', String(G.stats.items)],
    ['Tentatives', String(G.retry + 1)],
    ['Mode', G.mode === 'normal' ? 'Normal' : 'Clément'],
  ];
  lines.forEach(([k, v], i) => { text(k, 120, 180 + i * 32, { sx: 2, sy: 2 }); text(v, 520 - v.length * 16, 180 + i * 32, { sx: 2, sy: 2, color: YELLOW }); });
  text('Merci d\'avoir joué !', 320, 370, { sx: 2, sy: 3, center: true, color: '#ff2b3c' });
  if (sceneT > 1.5 && Math.floor(time * 2) % 2) text('[Z] Retour au titre', 320, 420, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  text("Fan game non officiel inspiré d'UNDERTALE (Toby Fox)", 320, 460, { sx: 1, sy: 1, center: true, color: '#707070' });
  ctx.globalAlpha = 1;
}

// ---------- Rendu du combat ----------
function drawHUD() {
  const y = 400;
  text(G.name, 30, y, { sx: 2, sy: 2 });
  const lvx = 30 + G.name.length * 16 + 26;
  text('LV ' + G.lv, lvx, y, { sx: 2, sy: 2 });
  text('PV', 248, y + 3, { sx: 1.5, sy: 2 });
  const bw = Math.round(G.maxhp * 1.25);
  ctx.fillStyle = '#ff0000'; ctx.fillRect(276, y, bw, 21);
  ctx.fillStyle = YELLOW; ctx.fillRect(276, y, Math.round(bw * G.hp / G.maxhp), 21);
  text(String(G.hp).padStart(2, ' ') + ' / ' + G.maxhp, 276 + bw + 14, y, { sx: 2, sy: 2 });
  BTNS.forEach((b, i) => {
    const sel = (bs === 'menu' || bs === 'intro') && btn === i || (['fightTarget', 'fightBar', 'fightAnim'].includes(bs) && i === 0) || (['actTarget', 'act'].includes(bs) && i === 1) || (bs === 'item' && i === 2) || (bs === 'mercy' && i === 3);
    const col = sel ? YELLOW : ORANGE;
    ctx.fillStyle = col; ctx.fillRect(b.x, 432, 110, 42);
    ctx.fillStyle = '#000'; ctx.fillRect(b.x + 3, 435, 104, 36);
    if (!(sel && soul.visible && bs === 'menu')) ctx.drawImage(ICON[b.icon][sel ? 'y' : 'o'], b.x + 8, 445);
    text(b.label, b.x + 30 + (b.label.length < 6 ? (6 - b.label.length) * 6 : 0), 445, { sx: 1.5, sy: 2, color: col });
  });
}
function drawBoxContent() {
  const tx = 52, ty = 272, lh = 32, O = { sx: 2, sy: 3 };
  switch (bs) {
    case 'menu': flavor.draw(tx, ty, lh, O); break;
    case 'message': case 'won': typer.draw(tx, ty, lh, O); break;
    case 'fightTarget': case 'actTarget': {
      text('* Undyne', 100, ty, O);
      if (bs === 'fightTarget') {
        ctx.fillStyle = '#ff0000'; ctx.fillRect(260, ty + 2, 100, 18);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(260, ty + 2, Math.ceil(100 * U.hp / MAX_UNDYNE), 18);
      }
      break;
    }
    case 'act': text('* Vérifier', 100, ty, O); break;
    case 'mercy': text('* Épargner', 100, ty, O); break;
    case 'item': {
      for (let i = 0; i < 4; i++) {
        const it = G.items[page * 4 + i]; if (!it) continue;
        text('* ' + it.name, i % 2 ? 340 : 68, ty + Math.floor(i / 2) * lh, O);
      }
      text('PAGE ' + (page + 1), 388, ty + 2 * lh, O);
      break;
    }
    case 'fightBar': case 'fightAnim': {
      const fb = fightBar;
      let a = 1;
      if (fb.hit && fb.ht > 0.6) a = Math.max(0, 1 - (fb.ht - 0.6) / 0.4);
      ctx.globalAlpha = a;
      ctx.drawImage(TARGET, box.x + 5, box.y + 5, box.w - 10, box.h - 10);
      const white = !fb.hit || Math.floor(fb.ht * 12) % 2 === 0;
      ctx.fillStyle = white ? '#fff' : '#000'; ctx.fillRect(Math.round(fb.x), box.y + 5, 14, box.h - 10);
      ctx.fillStyle = white ? '#000' : '#fff'; ctx.fillRect(Math.round(fb.x) + 4, box.y + 9, 6, box.h - 18);
      ctx.globalAlpha = 1;
      break;
    }
  }
}
function drawEffects() {
  for (const e of effects) {
    if (e.kind === 'slash') {
      const k = Math.min(1, e.t / 0.3), a = e.t > 0.4 ? 1 - (e.t - 0.4) / 0.2 : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#ff1010';
      for (let i = 0; i < 26 * k; i++) {
        const x = 372 - i * 4, y = 50 + i * 6, w = 6 - Math.abs(i - 13) / 4;
        ctx.fillRect(Math.round(x - w), Math.round(y), Math.round(w * 2), 6);
      }
      ctx.globalAlpha = 1;
    } else if (e.kind === 'dmg') {
      const s = String(e.val);
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) text(s, 320 + ox, Math.round(e.y) + oy, { sx: 3, sy: 4, color: '#000000', center: true });
      text(s, 320, Math.round(e.y), { sx: 3, sy: 4, color: '#ff2020', center: true });
      ctx.fillStyle = '#404040'; ctx.fillRect(220, 146, 200, 14);
      ctx.fillStyle = '#00ff00'; ctx.fillRect(220, 146, Math.round(200 * e.hpShow / MAX_UNDYNE), 14);
    } else if (e.kind === 'miss') {
      text('MISS', 320, 110 - Math.min(20, e.t * 60), { sx: 3, sy: 4, color: '#c0c0c0', center: true });
    } else if (e.kind === 'spark') {
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1 - e.t / e.life;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2); ctx.globalAlpha = 1;
    }
  }
}
function drawBattle() {
  if (U.visible) {
    const shake = U.shake > 0 ? Math.sin(U.shake * 2.2) * U.shake * 0.6 : 0;
    UndyneSprite.draw(ctx, { t: time, x: U.x, y: U.y, s: 2, shake, melt: U.melt > 0.02 ? U.melt : 0, jitter: U.jitter || U.hp < MAX_UNDYNE * 0.3, wind: 1 + (1 - U.hp / MAX_UNDYNE) * 0.4 });
  }
  drawDust();
  drawBubble();
  drawBox();
  drawBoxContent();
  if (bs === 'attack' || bs === 'enemyTalk') { drawSpears(); drawArrows(); }
  drawHUD();
  if (bs === 'attack' || bs === 'enemyTalk' || ['menu', 'intro', 'fightTarget', 'actTarget', 'act', 'item', 'mercy'].includes(bs)) drawSoul();
  drawEffects();
}

// ---------- Boucle principale ----------
let last = performance.now();
function frame(nowT) {
  const dt = Math.min(1 / 30, (nowT - last) / 1000);
  last = nowT;
  time += dt; sceneT += dt;
  update(dt);
  render();
  for (const k in press) press[k] = false;
  requestAnimationFrame(frame);
}
function update(dt) {
  if (shakeScreen > 0) shakeScreen = Math.max(0, shakeScreen - dt * 20);
  if (flashA > 0) flashA = Math.max(0, flashA - dt * 1.5);
  switch (scene) {
    case 'title': updTitle(dt); break;
    case 'encounter': updEncounter(); break;
    case 'battle': updBattle(dt); break;
    case 'gameover': updOver(dt); break;
    case 'credits': updCredits(); break;
  }
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (shakeScreen > 0) ctx.translate(Math.round(rand(-shakeScreen, shakeScreen)), Math.round(rand(-shakeScreen, shakeScreen)));
  switch (scene) {
    case 'loading': text('Chargement...', 320, 230, { sx: 2, sy: 3, center: true }); break;
    case 'title': drawTitle(); break;
    case 'name': drawName(); break;
    case 'encounter': drawEncounter(); break;
    case 'battle': drawBattle(); break;
    case 'gameover': drawOver(); break;
    case 'credits': drawCredits(); break;
  }
  if (flashA > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(255,255,255,' + flashA + ')'; ctx.fillRect(0, 0, W, H); }
  if (scene === 'battle' && Audio8.isMuted()) text('MUET', 600, 8, { sx: 1, sy: 1, color: '#606060' });
}

// ---------- Démarrage ----------
newGame(false);
UndyneSprite.build();
const face = new FontFace('PixelFont', 'url(' + PIXEL_FONT_DATA + ')');
face.load().then(f => { document.fonts.add(f); }).catch(() => {}).finally(() => {
  glyphs.clear();
  scene = 'title'; sceneT = 0;
  // Accès direct pour les tests : index.html#combat
  if (location.hash === '#combat') { scene = 'encounter'; }
});
requestAnimationFrame(frame);
window.__undyne = { get scene() { return scene; }, get bs() { return bs; }, G: () => G, U: () => U, soul, box, startBattle, enemyTurn, setTurn: t => { G.turn = t; }, press, held, toMenu, gameOver, startEnding,
  skipIntro() { newGame(true); startBattle(true); bubble = null; Audio8.playBattle(); toMenu(); }, get arrows() { return arrows; }, get spears() { return spears; } };
})();
