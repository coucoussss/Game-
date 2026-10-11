'use strict';
// ============================================================
//  SOUTERRAIN — fan game non officiel inspiré d'UNDERTALE (Toby Fox)
//  core.js : écran, entrées, texte, pixel art, sauvegarde, scènes
// ============================================================
const W = 640, H = 480, TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const COL = { yellow: '#ffff00', orange: '#ff8c1a', blue: '#14a9ff', red: '#ff0000', green: '#00e000', purple: '#d535d9', kr: '#ff00ff', grey: '#808080' };

// ---------- Écran ----------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
const touchEl = document.getElementById('touch');
let isTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
function fit() {
  const app = document.getElementById('app') || document.body;
  let aw = app.clientWidth || innerWidth, ah = app.clientHeight || innerHeight;
  if (isTouch && touchEl && !touchEl.hidden && innerHeight > innerWidth) ah -= touchEl.offsetHeight + 8;
  const s = Math.max(0.1, Math.min(aw / W, ah / H));
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit);

// ---------- Entrées ----------
const keysDown = new Set(), keysHit = new Set(), typed = [];
const down = k => keysDown.has(k);
function hit(k) { if (keysHit.has(k)) { keysHit.delete(k); return true; } return false; }
function peekHit(k) { return keysHit.has(k); }
function keyName(e) {
  switch (e.key) {
    case 'ArrowUp': return 'up'; case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left'; case 'ArrowRight': return 'right';
    case 'Enter': return 'z'; case 'Shift': return 'x'; case 'Control': return 'c';
    case 'Escape': return 'esc';
  }
  const k = (e.key || '').toLowerCase();
  if (k === 'z' || k === 'w') return 'z';
  if (k === 'x') return 'x';
  if (k === 'c') return 'c';
  if (k === 'm') return 'mute';
  if (k === 'p') return 'esc';
  if (k === 'f') return 'full';
  return null;
}
function press(k) { if (!keysDown.has(k)) keysHit.add(k); keysDown.add(k); Snd.init(); }
function release(k) { keysDown.delete(k); }
let captureTyping = false;
addEventListener('keydown', e => {
  Snd.init();
  if (captureTyping) {
    if (e.key === 'Backspace') typed.push('\b');
    else if (e.key.length === 1) typed.push(e.key);
  }
  const k = keyName(e);
  if (!k) return;
  if (captureTyping && e.key.length === 1 && !['z', 'x'].includes(k)) return;
  e.preventDefault();
  if (!e.repeat || ['up', 'down', 'left', 'right'].includes(k)) press(k);
});
addEventListener('keyup', e => { const k = keyName(e); if (k) release(k); });
addEventListener('blur', () => keysDown.clear());

function setupTouch() {
  if (!touchEl) return;
  addEventListener('touchstart', () => { if (!isTouch) { isTouch = true; touchEl.hidden = false; fit(); } }, { passive: true });
  touchEl.hidden = !isTouch;
  const dp = document.getElementById('dpad');
  const ptrs = new Map();
  let held = new Set();
  const sync = () => {
    const r = dp.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dead = r.width * 0.12;
    const nd = new Set();
    for (const p of ptrs.values()) {
      const dx = p.x - cx, dy = p.y - cy;
      if (Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.45) nd.add(dx > 0 ? 'right' : 'left');
      if (Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.45) nd.add(dy > 0 ? 'down' : 'up');
    }
    for (const k of ['up', 'down', 'left', 'right']) {
      if (nd.has(k) && !held.has(k)) press(k);
      if (!nd.has(k) && held.has(k)) release(k);
      dp.classList.toggle('on-' + k, nd.has(k));
    }
    held = nd;
  };
  dp.addEventListener('pointerdown', e => { e.preventDefault(); dp.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); sync(); });
  dp.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); sync(); } });
  const end = e => { ptrs.delete(e.pointerId); sync(); };
  dp.addEventListener('pointerup', end); dp.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('.tbtn')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('active'); press(k); });
    const up = () => { b.classList.remove('active'); release(k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
}

// ---------- Police pixel (Press Start 2P, 8 px) ----------
const glyphs = new Map();
const AC = { acute: [[4, 0], [3, 1]], grave: [[2, 0], [3, 1]], circ: [[3, 0], [2, 1], [4, 1]], trema: [[2, 1], [5, 1]] };
const ACCENTS = { 'É': ['E', AC.acute], 'È': ['E', AC.grave], 'Ê': ['E', AC.circ], 'À': ['A', AC.grave], 'Â': ['A', AC.circ], 'Î': ['I', AC.circ], 'Ô': ['O', AC.circ], 'Û': ['U', AC.circ], 'Ù': ['U', AC.grave], 'Ë': ['E', AC.trema], 'Ï': ['I', AC.trema], 'Ç': ['C', [[3, 11]]] };
function glyph(ch, color) {
  if (color.length === 4) color = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  const key = ch + color;
  let g = glyphs.get(key);
  if (g) return g;
  g = document.createElement('canvas'); g.width = 8; g.height = 12;
  const c = g.getContext('2d');
  c.font = '8px PixelFont, monospace'; c.textBaseline = 'top'; c.fillStyle = '#fff';
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
// Polices « personnages » (texte vectoriel) pour Sans et Papyrus, comme dans le jeu d'origine.
const VFONT = {
  sans: "bold 15px 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive",
  papyrus: "bold 15px Papyrus, 'Luminari', fantasy",
};
// text : (x, y) = coin haut-gauche ; sx/sy = échelle des pixels de la police
function text(str, x, y, o = {}) {
  const sx = o.sx || 2, sy = o.sy || 3, col = o.color || '#ffffff';
  if (o.font && VFONT[o.font]) {
    ctx.font = VFONT[o.font]; ctx.fillStyle = col; ctx.textBaseline = 'top';
    ctx.textAlign = o.center ? 'center' : o.right ? 'right' : 'left';
    ctx.fillText(o.font === 'papyrus' ? str.toUpperCase() : str.toLowerCase(), x, y);
    ctx.textAlign = 'left';
    return;
  }
  if (o.center) x -= str.length * 8 * sx / 2;
  if (o.right) x -= str.length * 8 * sx;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === ' ') continue;
    let dx = 0, dy = 0;
    if (o.shake) { dx = rint(-o.shake, o.shake); dy = rint(-o.shake, o.shake); }
    if (o.wave) dy += Math.round(Math.sin(time * 8 + i * 0.7) * o.wave);
    ctx.drawImage(glyph(ch, col), Math.round(x + i * 8 * sx + dx), Math.round(y - 2 * sy + dy), 8 * sx, 12 * sy);
  }
}
function wrap(str, max) {
  const out = [];
  for (const para of str.split('\n')) {
    const star = para.startsWith('* ');
    let line = '';
    const words = [];
    for (const w of para.split(' ')) { if (/^[!?:;»]+$/.test(w) && words.length) words[words.length - 1] += ' ' + w; else words.push(w); }
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (cand.length > max && line) { out.push(line); line = (star ? '  ' : '') + w; } else line = cand;
    }
    out.push(line);
  }
  return out;
}
// Dactylo : affiche le texte lettre par lettre avec une voix
class Typer {
  constructor(str, o = {}) {
    this.lines = Array.isArray(str) ? str : wrap(str, o.max || 32);
    this.total = this.lines.reduce((a, l) => a + l.length, 0);
    this.n = 0; this.acc = 0; this.k = 0;
    this.voice = o.voice === undefined ? 'text' : o.voice; this.speed = o.speed || 32;
    this.o = o;
  }
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
      if (c !== ' ' && c !== '*' && this.voice && this.k++ % 2 === 0) Snd.voice(this.voice);
      const nx = this.charAt(this.n);
      if ((c === ',' || c === '.' || c === '!' || c === '?') && (nx === ' ' || nx === '')) this.acc -= per * (c === ',' ? 3 : 5);
    }
  }
  draw(x, y, lh, o) {
    let left = this.n;
    this.lines.forEach((l, i) => { if (left <= 0) return; text(l.slice(0, left), x, y + i * lh, o); left -= l.length; });
  }
}

// ---------- Pixel art ----------
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.d[y * this.w + x]); }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + (sy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    return this;
  }
  ring(cx, cy, rx, ry, c, th = 1) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
        const o = (dx / rx) ** 2 + (dy / ry) ** 2, i = (dx / Math.max(0.5, rx - th)) ** 2 + (dy / Math.max(0.5, ry - th)) ** 2;
        if (o <= 1 && i > 1) this.set(x, y, c);
      }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  path(pts, c) { for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c); return this; }
  map(rows, ox = 0, oy = 0, legend) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && ch !== ' ') this.set(ox + i, oy + j, legend ? legend[ch] || ch : ch); } });
    return this;
  }
  outline(c, diag = false) {
    const add = [];
    this.each((x, y, v) => {
      if (v !== null) return;
      let hit = this.get(x - 1, y) !== null || this.get(x + 1, y) !== null || this.get(x, y - 1) !== null || this.get(x, y + 1) !== null;
      if (!hit && diag) hit = this.get(x - 1, y - 1) !== null || this.get(x + 1, y - 1) !== null || this.get(x - 1, y + 1) !== null || this.get(x + 1, y + 1) !== null;
      if (hit) add.push(x, y);
    });
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
    return this;
  }
  edge(c, only) {
    const add = [];
    this.each((x, y, v) => {
      if (v === null || (only && v !== only)) return;
      if (this.get(x - 1, y) === null || this.get(x + 1, y) === null || this.get(x, y - 1) === null || this.get(x, y + 1) === null) add.push(x, y);
    });
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
    return this;
  }
  bevel(base, lit, shade = [], lx = 1, ly = -1) {
    const out = this.d.slice();
    this.each((x, y, v) => {
      if (v !== base) return;
      let col = null;
      for (let k = 1; k <= lit.length; k++) if (this.get(x + lx * k, y + ly * k) === null) { col = lit[k - 1]; break; }
      if (!col) for (let k = 1; k <= shade.length; k++) if (this.get(x - lx * k, y - ly * k) === null) { col = shade[k - 1]; break; }
      if (col) { if (Array.isArray(col)) col = (x + y) & 1 ? col[0] : col[1]; out[y * this.w + x] = col; }
    });
    this.d = out;
    return this;
  }
  over(o, dx = 0, dy = 0) {
    o.each((x, y, v) => { if (v !== null) this.set(x + dx, y + dy, v); });
    return this;
  }
  mirrorX() { // copie la moitié gauche sur la moitié droite
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w / 2; x++) { const v = this.d[y * this.w + x]; if (v !== null) this.d[y * this.w + this.w - 1 - x] = v; }
    return this;
  }
  flip() { const p = new Pix(this.w, this.h); this.each((x, y, v) => { if (v !== null) p.set(this.w - 1 - x, y, v); }); return p; }
  canvas(pal = PAL) {
    const k = document.createElement('canvas'); k.width = this.w; k.height = this.h;
    const g = k.getContext('2d'), im = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i]; if (c === null) continue;
      const hex = pal[c] || (typeof c === 'string' && c[0] === '#' ? c : '#ff00ff'), v = parseInt(hex.slice(1), 16);
      im.data[i * 4] = v >> 16; im.data[i * 4 + 1] = (v >> 8) & 255; im.data[i * 4 + 2] = v & 255; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return k;
  }
}
// Palette commune des sprites (les sprites de combat d'origine sont surtout blanc sur noir)
const PAL = {
  K: '#000000', W: '#ffffff', G: '#c3c3c3', g: '#7f7f7f', s: '#3f3f3f',
  R: '#ff2b3c', r: '#a8102a', q: '#5e0616', O: '#ff8c1a', o: '#a85000', Y: '#ffe23c', y: '#b89a00',
  B: '#3fb4ff', b: '#1d64b8', n: '#0b2c5c', C: '#5fe9ff', c: '#1a8fb0', V: '#c060ff', v: '#6a2aa8', P: '#ff7fd0', p: '#a03070',
  E: '#36d040', e: '#147a20', N: '#a66a3a', h: '#5a3518', T: '#f2d2a6', t: '#c28e5c', L: '#ffd6f0', M: '#7a3fc2',
  1: '#15151c', 2: '#26262f', 3: '#3d3d48', 4: '#62626e', 5: '#9a9aa8',
};
function pmap(rows, color) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d'); g.fillStyle = color;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') g.fillRect(x, y, 1, 1); });
  return c;
}
function dImg(img, x, y, sc = 2, o = {}) {
  if (!img) return;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.flip) { ctx.translate(Math.round(x) + img.width * sc, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width * sc, img.height * sc); }
  else ctx.drawImage(img, Math.round(x), Math.round(y), img.width * sc, img.height * sc);
  ctx.restore();
}
// Teinte une image (silhouette d'une couleur) — pour flash blanc ou fantôme
const tintCache = new WeakMap();
function tinted(img, color) {
  let m = tintCache.get(img); if (!m) { m = {}; tintCache.set(img, m); }
  if (m[color]) return m[color];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return (m[color] = c);
}

// Cœur (âme)
const HEART_ROWS = ['..XXXX....XXXX..', '.XXXXXX..XXXXXX.', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..', '...XXXXXXXXXX...', '....XXXXXXXX....', '.....XXXXXX.....', '......XXXX......', '.......XX.......'];
const SPLIT = [8, 7, 6, 7, 8, 9, 8, 7, 6, 7, 8, 8, 8];
const SOULC = { red: '#ff0000', blue: '#0055ff', green: '#00e000', yellow: '#ffff00', purple: '#d535d9', cyan: '#42fcff', orange: '#fca600', white: '#ffffff', grey: '#808080' };
const HEART = {};
for (const k in SOULC) HEART[k] = pmap(HEART_ROWS, SOULC[k]);
HEART.upside = pmap(HEART_ROWS.slice().reverse(), SOULC.yellow);
const HEART_L = pmap(HEART_ROWS.map((r, y) => r.split('').map((c, x) => x < SPLIT[y] ? c : '.').join('')), '#ff0000');
const HEART_R = pmap(HEART_ROWS.map((r, y) => r.split('').map((c, x) => x > SPLIT[y] ? c : '.').join('')), '#ff0000');
const SHARD = pmap(['.XX.', 'XXXX', '.XX.', '..X.'], '#ff0000');
function drawHeart(x, y, color = 'red', o = {}) { dImg(o.img || HEART[color] || HEART.red, x - 8, y - 6, 1, o); }

// ---------- Sauvegarde ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('souterrain_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('souterrain_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem('souterrain_' + k); } catch (e) { /* rien */ } },
};

// ---------- Temps, coroutines, fondus ----------
// Les scripts (dialogues, combats, cinématiques) sont des générateurs exécutés
// une fois par image : « yield » attend une image, « yield 0.5 » attend 0,5 s,
// « yield () => cond » attend qu'une condition soit vraie, « yield* f() » appelle un sous-script.
let time = 0, shake = 0, fadeA = 0, flashA = 0, flashCol = '#ffffff', fadeCol = '#000000';
const coroutines = [];
function spawn(gen, tag) { const c = { gen, wait: 0, until: null, done: false, tag }; coroutines.push(c); return c; }
function killTag(tag) { for (const c of coroutines) if (c.tag === tag) c.done = true; }
function stepCoroutines(dt) {
  for (const c of coroutines.slice()) {
    if (c.done) continue;
    if (c.wait > 0) { c.wait -= dt; if (c.wait > 0) continue; }
    if (c.until && !c.until()) continue;
    c.until = null;
    let r;
    try { r = c.gen.next(); } catch (e) { console.error(e); c.done = true; continue; }
    if (r.done) { c.done = true; c.value = r.value; continue; }
    const v = r.value;
    if (typeof v === 'number') c.wait = v; else if (typeof v === 'function') c.until = v;
  }
  for (let i = coroutines.length - 1; i >= 0; i--) if (coroutines[i].done) coroutines.splice(i, 1);
}
function* waitT(sec) { yield sec; }
function* waitKey(k = 'z') { while (!hit(k)) yield; }
function* fadeOut(d = 0.4, col = '#000000') { fadeCol = col; const t0 = time; while (fadeA < 1) { fadeA = Math.min(1, (time - t0) / d); yield; } }
function* fadeIn(d = 0.4) { const t0 = time, a0 = fadeA; while (fadeA > 0) { fadeA = Math.max(0, a0 * (1 - (time - t0) / d)); yield; } }
function flash(a = 1, col = '#ffffff') { flashA = a; flashCol = col; }

// ---------- Scènes ----------
let scene = null, paused = false;
function setScene(s) { scene = s; if (s.enter) s.enter(); }
