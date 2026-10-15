'use strict';
// JUGEMENT FINAL — fan game non officiel inspiré du combat contre Sans (UNDERTALE, Toby Fox).
// Sprites dessinés au pixel près en code, textes et musiques originaux.
(() => {
const W = 640, H = 480;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const touchEl = document.getElementById('touch');
let isTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

const F_TEXT = "'DotGothic16', 'Courier New', monospace";
const F_SANS = "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive";
const F_UI = "'Silkscreen', 'DotGothic16', monospace";
const F = (size, fam) => `${size}px ${fam}`;
const FONT_NARR = F(26, F_TEXT);
const FONT_BUBBLE = 'bold ' + F(16, F_SANS);
const COL = { yellow: '#ffff00', orange: '#ff7f27', blue: '#14a9ff', red: '#ff0000', kr: '#ff00ff', hpBack: '#c00000', grey: '#808080' };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

// ---------- Sauvegarde locale ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('jf_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('jf_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};
const save = { name: store.get('name', ''), deaths: store.get('deaths', 0), dunked: store.get('dunked', false), easy: store.get('easy', false), wins: store.get('wins', 0) };
function persist() { for (const k in save) store.set(k, save[k]); }

// ---------- Écran ----------
let scale = 1;
function resize() {
  const app = document.getElementById('app');
  const aw = app.clientWidth;
  let ah = app.clientHeight;
  if (isTouch && window.innerHeight > window.innerWidth) ah -= touchEl.offsetHeight + 8;
  const s = Math.max(0.1, Math.min(aw / W, ah / H));
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  scale = cv.width / W;
}
addEventListener('resize', resize);

// ---------- Entrées ----------
const keysDown = new Set(), keysHit = new Set();
const down = k => keysDown.has(k);
function hit(k) { if (keysHit.has(k)) { keysHit.delete(k); return true; } return false; }
function keyName(e) {
  switch (e.key) {
    case 'ArrowUp': return 'up'; case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left'; case 'ArrowRight': return 'right';
    case 'Enter': return 'z'; case 'Shift': case 'Backspace': return 'x';
    case 'Escape': return 'esc';
  }
  const k = (e.key || '').toLowerCase();
  if (k === 'z') return 'z';
  if (k === 'x') return 'x';
  if (k === 'm') return 'mute';
  if (k === 'p') return 'esc';
  if (k === 'f') return 'full';
  return null;
}
function press(k) { if (!keysDown.has(k)) keysHit.add(k); keysDown.add(k); Snd.init(); }
function release(k) { keysDown.delete(k); }
addEventListener('keydown', e => { const k = keyName(e); if (!k) return; e.preventDefault(); press(k); });
addEventListener('keyup', e => { const k = keyName(e); if (k) release(k); });
addEventListener('blur', () => keysDown.clear());
cv.addEventListener('pointerdown', () => { Snd.init(); if (S.scene === 'boot') press('z'), release('z'); });

function setupTouch() {
  // Les contrôles tactiles apparaissent sur écran tactile, ou dès le premier toucher.
  addEventListener('touchstart', () => { if (!isTouch) { isTouch = true; touchEl.hidden = false; resize(); } }, { passive: true });
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

// ---------- Pixel art ----------
class PG {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  ell(cx, cy, rx, ry, c) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(i, j, c);
    }
    return this;
  }
  poly(p, c) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = i + 0.5, y = j + 0.5; let ins = false;
      for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        const [xa, ya] = p[a], [xb, yb] = p[b];
        if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) ins = !ins;
      }
      if (ins) this.set(i, j, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) { const t = n ? k / n : 0; this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c); }
    return this;
  }
  // Contour intérieur : les pixels pleins qui touchent le vide prennent la couleur c.
  outline(c = 2) {
    const add = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const v = this.d[j * this.w + i];
      if (!v || v === c) continue;
      const empty = (x, y) => x < 0 || y < 0 || x >= this.w || y >= this.h || !this.d[y * this.w + x];
      if (empty(i - 1, j) || empty(i + 1, j) || empty(i, j - 1) || empty(i, j + 1)) add.push(j * this.w + i);
    }
    for (const k of add) this.d[k] = c;
    return this;
  }
  paste(o) { for (let k = 0; k < o.d.length; k++) if (o.d[k]) this.d[k] = o.d[k]; return this; }
  mirror() { for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w / 2; i++) { const a = j * this.w + i, b = j * this.w + this.w - 1 - i; if (this.d[a]) this.d[b] = this.d[a]; } return this; }
  img(pal = PAL) {
    const k = document.createElement('canvas'); k.width = this.w; k.height = this.h;
    const g = k.getContext('2d'), im = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const col = pal[this.d[i]]; if (!col) continue;
      im.data[i * 4] = col[0]; im.data[i * 4 + 1] = col[1]; im.data[i * 4 + 2] = col[2]; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return k;
  }
}
const PAL = { 1: [255, 255, 255], 2: [0, 0, 0], 3: [20, 169, 255], 4: [255, 255, 0], 5: [255, 0, 0], 6: [255, 127, 39] };
const PAL_SIL = { 1: [28, 19, 6], 2: [255, 255, 255] };

// Sans en combat : chaque partie est remplie puis cernée de noir, puis superposée.
const part = (w, h, draw, c = 2) => { const p = new PG(w, h); draw(p); return p.outline(c); };
function gHead(e) {
  const g = part(34, 31, p => {
    p.ell(17, 13.5, 16.5, 13.6, 1);
    p.poly([[2.5, 14], [31.5, 14], [31, 22], [28.5, 28], [25, 30.5], [9, 30.5], [5.5, 28], [3, 22]], 1);
  });
  // orbites
  if (e === 'closed') {
    g.rect(6, 14, 9, 1, 2); g.rect(19, 14, 9, 1, 2); g.set(5, 13, 2); g.set(28, 13, 2); g.set(15, 13, 2); g.set(18, 13, 2);
  } else {
    g.ell(10.5, 13.5, 4.8, 4.4, 2);
    if (e === 'wink') { g.rect(19, 14, 9, 1, 2); g.set(18, 13, 2); g.set(28, 13, 2); }
    else g.ell(23.5, 13.5, 4.8, 4.4, 2);
    if (e === 'normal' || e === 'wink') g.rect(10, 13, 2, 2, 1);
    if (e === 'normal') g.rect(22, 13, 2, 2, 1);
    if (e === 'blue' || e === 'yellow') { g.ell(10.5, 13.5, 3, 3, e === 'blue' ? 3 : 4); g.rect(10, 13, 2, 2, 1); }
    if (e === 'tired') { g.rect(10, 14, 2, 1, 1); g.rect(22, 14, 2, 1, 1); g.rect(6, 10, 9, 1, 2); g.rect(19, 10, 9, 1, 2); }
  }
  if (e === 'p2b' || e === 'p2y') {
    g.ell(10.5, 13.5, 4.8, 4.4, 2); g.ell(23.5, 13.5, 4.8, 4.4, 2);
    g.ell(10.5, 13.5, 3.2, 3.2, e === 'p2b' ? 3 : 4); g.rect(10, 13, 2, 2, 1);
    g.rect(22, 12, 3, 3, 5); g.set(23, 13, 1);
    for (const [x, y] of [[16, 0], [16, 1], [15, 2], [15, 3], [14, 4], [14, 5], [15, 6], [14, 7], [13, 8], [12, 1], [13, 3], [19, 4], [20, 5], [21, 6], [20, 7]]) g.set(x, y, 2);
    g.rect(5, 9, 10, 1, 2); g.rect(19, 9, 10, 1, 2); g.set(14, 10, 2); g.set(19, 10, 2);
  }
  // nez
  g.rect(15, 19, 4, 1, 2); g.rect(16, 20, 2, 1, 2);
  // grand sourire, fossettes et dents
  for (let x = 6; x <= 27; x++) { const d = Math.abs(x + 0.5 - 17); g.set(x, 23 - (d > 8.5 ? 1 : 0) - (d > 10 ? 1 : 0), 2); }
  g.rect(4, 19, 1, 3, 2); g.rect(29, 19, 1, 3, 2); g.set(5, 22, 2); g.set(28, 22, 2);
  for (let x = 8; x <= 25; x++) { const d = Math.abs(x + 0.5 - 17); g.set(x, 26 - (d > 7 ? 1 : 0), 2); }
  for (let x = 9; x <= 25; x += 3) g.rect(x, 24, 1, 2, 2);
  // pommettes
  g.set(6, 18, 2); g.set(7, 18, 2); g.set(26, 18, 2); g.set(27, 18, 2);
  return g;
}
function gTorso(hurt) {
  const W = 52, H = 32;
  const g = part(W, H, p => { p.ell(26, 7, 18.5, 6.5, 1); });                            // capuche fourrée
  for (const [x, y] of [[11, 5], [14, 3], [18, 2], [22, 1], [26, 1], [30, 1], [34, 2], [38, 3], [41, 5], [13, 8], [39, 8], [9, 8], [43, 8]]) g.set(x, y, 2);
  g.paste(part(W, H, p => p.poly([[7, 9], [45, 9], [50.5, 16], [50, 32], [2, 32], [1.5, 16]], 1)));   // veste
  g.paste(part(W, H, p => p.poly([[19.5, 10], [32.5, 10], [32, 32], [20, 32]], 1)));          // t-shirt
  for (let x = 22; x <= 30; x++) g.set(x, 11 + (Math.abs(x - 26) < 3 ? 1 : 0), 2);           // encolure
  g.paste(part(W, H, p => p.poly([[1.5, 15], [12, 12], [15.5, 27], [3, 29]], 1)));           // manche gauche
  g.paste(part(W, H, p => p.poly([[50.5, 15], [40, 12], [36.5, 27], [49, 29]], 1)));         // manche droite
  g.rect(4, 26, 11, 1, 2); g.rect(37, 26, 11, 1, 2);                                         // poignets
  for (const x of [18, 34]) { g.rect(x, 10, 1, 9, 2); g.rect(x - 1, 19, 3, 3, 2); g.set(x, 20, 1); }   // cordons
  g.rect(16, 25, 4, 1, 2); g.rect(32, 25, 4, 1, 2);                                          // poches
  g.rect(2, 29, 18, 1, 2); g.rect(32, 29, 18, 1, 2);                                         // ourlet
  if (hurt === 'p2') {
    for (let x = 1; x < W; x++) {
      const d = [0, 2, 3, 1, 3, 2, 0, 1][x % 8];
      for (let y = 32 - d; y < 32; y++) g.set(x, y, 0);
      if (g.d[(31 - d) * W + x]) g.set(x, 31 - d, 2);
    }
    for (const [x, y] of [[42, 18], [43, 19], [44, 18], [6, 21], [7, 22]]) g.set(x, y, 2);
    for (let k = -2; k < 4; k++) g.line(6 + k, 30, 44 + k, 6, 5);
    g.line(8, 29, 45, 6, 2);
    for (const [x, l] of [[14, 4], [22, 6], [30, 3], [37, 5]]) g.rect(x, 26 - (x - 6) * 0.63 + 3, 1, l, 5);
  } else if (hurt) for (let k = 0; k < 3; k++) g.line(9 + k, 25, 41 + k, 10, 5);
  return g;
}
function gLegs() {
  const W = 34, H = 23;
  const g = part(W, H, p => p.poly([[4, 0], [30, 0], [31, 10.5], [19.5, 10.5], [17, 7], [14.5, 10.5], [3, 10.5]], 2), 1);   // short
  g.rect(7, 1, 1, 9, 1); g.rect(26, 1, 1, 9, 1);
  g.paste(part(W, H, p => { p.rect(10, 10, 4, 8, 1); p.rect(20, 10, 4, 8, 1); }));          // tibias
  g.paste(part(W, H, p => { p.ell(10, 19.5, 7.5, 3.3, 1); p.ell(24, 19.5, 7.5, 3.3, 1); })); // chaussons
  g.rect(9, 18, 3, 1, 2); g.rect(22, 18, 3, 1, 2);
  return g;
}
function gArm() {
  const g = part(30, 14, p => p.poly([[0, 1], [17, 0.5], [19, 13], [0, 13]], 1));
  g.rect(15, 2, 1, 10, 2);
  g.paste(part(30, 14, p => { p.ell(22, 7, 3.6, 4, 1); p.rect(23, 3, 6, 2, 1); p.rect(23, 6, 7, 2, 1); p.rect(23, 9, 6, 2, 1); }));
  return g;
}
function gBlTop(open) {
  const g = new PG(40, 34);
  g.poly([[2, 0], [11, 6], [7, 14]], 1); g.poly([[38, 0], [29, 6], [33, 14]], 1);
  g.ell(20, 13, 14, 12, 1);
  g.poly([[9, 15], [31, 15], [28, 34], [12, 34]], 1);
  g.ell(13.5, 12, 4.5, 4, 2); g.ell(26.5, 12, 4.5, 4, 2);
  if (open) { g.rect(12, 11, 3, 3, 1); g.rect(25, 11, 3, 3, 1); }
  g.rect(17, 25, 2, 3, 2); g.rect(21, 25, 2, 3, 2);
  g.line(10, 19, 12, 30, 2); g.line(30, 19, 28, 30, 2);
  g.rect(12, 33, 16, 1, 2);
  for (let x = 14; x <= 26; x += 4) g.rect(x, 31, 1, 2, 2);
  return g;
}
function gBlJaw() {
  const g = new PG(40, 10);
  g.poly([[12, 0], [28, 0], [26, 9], [14, 9]], 1);
  for (let x = 15; x <= 25; x += 4) g.rect(x, 0, 1, 2, 2);
  return g;
}
const HEART_ROWS = ['..XXXX....XXXX..', '.XXXXXX..XXXXXX.', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..', '...XXXXXXXXXX...', '....XXXXXXXX....', '.....XXXXXX.....', '......XXXX......', '.......XX.......'];
function gHeart(c, part = 0) {
  const g = new PG(16, 12), crack = [8, 7, 8, 7, 8, 9, 8, 7, 8, 8, 7, 8];
  HEART_ROWS.forEach((r, y) => {
    for (let x = 0; x < 16; x++) if (r[x] === 'X') {
      if (part === 1 && x >= crack[y]) continue;
      if (part === 2 && x <= crack[y]) continue;
      g.set(x, y, c);
    }
  });
  return g;
}
function gFrisk(f) {
  const g = new PG(20, 30);
  g.ell(10, 7, 7, 6.6, 1); g.rect(3, 6, 14, 6, 1);
  g.rect(4, 13, 12, 10, 1); g.rect(2, 14, 2, 8, 1); g.rect(16, 14, 2, 8, 1);
  if (f === 0) { g.rect(5, 23, 4, 6, 1); g.rect(11, 23, 4, 6, 1); }
  else if (f === 1) { g.rect(3, 23, 4, 5, 1); g.rect(12, 23, 4, 6, 1); g.rect(2, 27, 4, 2, 1); }
  else { g.rect(5, 23, 4, 6, 1); g.rect(12, 23, 4, 5, 1); g.rect(14, 27, 4, 2, 1); }
  return g;
}
function gSansOW(eyes) {
  const g = new PG(30, 34);
  g.ell(15, 8, 9.5, 8, 1); g.rect(8, 10, 14, 5, 1);
  g.poly([[5, 14], [25, 14], [28, 19], [27, 27], [3, 27], [2, 19]], 1);
  g.rect(7, 26, 16, 4, 1); g.rect(9, 30, 3, 2, 1); g.rect(18, 30, 3, 2, 1);
  g.ell(9, 32.5, 5, 1.6, 1); g.ell(21, 32.5, 5, 1.6, 1);
  if (eyes) { g.set(11, 8, 2); g.set(19, 8, 2); }
  return g;
}
const PIXFONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01111100001000010000100001000001111',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01111100001000010011100011000101111', H: '10001100011000111111100011000110001', I: '11111001000010000100001000010011111',
  J: '00111000100001000010000101001001100', L: '10000100001000010000100001000011111', M: '10001110111010110101100011000110001',
  N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', ' ': '00000000000000000000000000000000000',
};
function pixText(str, x, y, px, color, align = 'center') {
  const w = str.length * 6 * px - px;
  let cx = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = color;
  for (const ch of str) {
    const bits = PIXFONT[ch] || PIXFONT[' '];
    for (let i = 0; i < 35; i++) if (bits[i] === '1') ctx.fillRect(Math.round(cx + (i % 5) * px), Math.round(y + Math.floor(i / 5) * px), px, px);
    cx += 6 * px;
  }
}

const SPR = {};
function buildSprites() {
  for (const e of ['normal', 'dark', 'blue', 'yellow', 'wink', 'closed', 'tired']) SPR['head_' + e] = gHead(e).img();
  SPR.arm = gArm().img();
  SPR.torsoP2 = gTorso('p2').img();
  const AURA = { 1: [255, 40, 60], 2: [255, 40, 60], 3: [255, 40, 60], 4: [255, 40, 60], 5: [255, 40, 60] };
  SPR.head_p2b = gHead('p2b').img(); SPR.head_p2y = gHead('p2y').img();
  const CYAN = { 1: [40, 220, 255], 2: [40, 220, 255], 3: [40, 220, 255], 4: [40, 220, 255], 5: [40, 220, 255] };
  SPR.legsC = gLegs().img(CYAN); SPR.torsoC = gTorso(false).img(CYAN); SPR.headC = gHead('normal').img(CYAN);
  SPR.legsA = gLegs().img(AURA); SPR.torsoA = gTorso(false).img(AURA); SPR.headA = gHead('normal').img(AURA);
  SPR.torso = gTorso(false).img(); SPR.torsoHurt = gTorso(true).img(); SPR.legs = gLegs().img();
  SPR.blTop = gBlTop(false).img(); SPR.blTopOpen = gBlTop(true).img(); SPR.blJaw = gBlJaw().img();
  SPR.heart = gHeart(5).img(); SPR.heartBlue = gHeart(3).img();
  SPR.heartL = gHeart(5, 1).img(); SPR.heartR = gHeart(5, 2).img();
  SPR.frisk = [0, 1, 2].map(f => gFrisk(f).img(PAL_SIL));
  SPR.sansOW = gSansOW(true).img(PAL_SIL); SPR.sansOWdark = gSansOW(false).img(PAL_SIL);
}
function dImg(img, x, y, sc = 2, flip = false) {
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + img.width * sc, Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, img.width * sc, img.height * sc); ctx.restore();
  } else ctx.drawImage(img, Math.round(x), Math.round(y), img.width * sc, img.height * sc);
}

// ---------- Texte ----------
const wrapCache = new Map();
function wrapText(str, font, maxW) {
  const key = font + '|' + maxW + '|' + str;
  if (wrapCache.has(key)) return wrapCache.get(key);
  ctx.save(); ctx.font = font;
  const ind = ctx.measureText('* ').width;
  const out = [];
  for (const para of str.split('\n')) {
    const star = para.startsWith('* ');
    let line = '', cont = false, res = '';
    for (const w of para.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW - (cont && star ? ind : 0)) { res += line + '\r'; line = w; cont = true; }
      else line = test;
    }
    out.push(res + line);
  }
  ctx.restore();
  const r = out.join('\n');
  wrapCache.set(key, r);
  return r;
}
function drawTyped(str, n, x, y, lh, font, color) {
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const ind = ctx.measureText('* ').width;
  let line = '', cont = false, star = false, row = 0;
  const flush = () => { ctx.fillText(line, x + (cont && star ? ind : 0), y + row * lh); row++; line = ''; };
  const vis = str.slice(0, n);
  for (const ch of vis) {
    if (ch === '\n') { flush(); cont = false; star = false; }
    else if (ch === '\r') { flush(); cont = true; }
    else { if (!cont && line === '' && ch === '*') star = true; line += ch; }
  }
  if (line) flush();
}
function txt(s, x, y, o = {}) {
  ctx.font = o.font || FONT_NARR; ctx.fillStyle = o.color || '#fff';
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'top';
  if (o.maxW) ctx.fillText(s, x, y, o.maxW); else ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

class Typer {
  constructor() { this.pages = []; this.meta = []; this.i = 0; this.n = 0; this.finished = true; }
  set(pages, o = {}) {
    this.pages = []; this.meta = [];
    for (const p of pages) {
      const m = /^\[(\w+)\]/.exec(p);
      this.meta.push(m ? m[1] : null);
      this.pages.push(m ? p.slice(m[0].length) : p);
    }
    this.i = 0; this.n = 0; this.acc = 0; this.finished = false; this.blips = 0;
    this.voice = o.voice || 'narr'; this.speed = o.speed || 32; this.font = o.font || FONT_NARR; this.maxW = o.maxW || 500;
    return this;
  }
  get text() { return wrapText(this.pages[this.i] || '', this.font, this.maxW); }
  get eyes() { return this.meta[this.i]; }
  get pageDone() { return this.n >= (this.pages[this.i] || '').length; }
  update(dt) {
    if (this.finished || this.pageDone) return;
    const p = this.pages[this.i];
    this.acc += dt * this.speed;
    while (this.acc >= 1 && this.n < p.length) {
      const ch = p[this.n++]; this.acc -= 1;
      const nx = p[this.n];
      if (/[,;:]/.test(ch)) this.acc -= 3;
      else if (/[.!?…]/.test(ch) && (nx === ' ' || nx === '\n' || nx === undefined)) this.acc -= 6;
      if (/[^\s*.]/.test(ch) && this.blips++ % 2 === 0) Snd.blip(this.voice);
    }
  }
  input() {
    if (this.finished) return true;
    if (!this.pageDone) { if (hit('x') || hit('z')) this.n = this.pages[this.i].length; return false; }
    if (hit('z')) {
      this.i++; this.n = 0; this.acc = 0;
      if (this.i >= this.pages.length) { this.finished = true; this.i = this.pages.length - 1; this.n = 1e9; return true; }
    }
    return false;
  }
}

// ---------- Dialogues (textes originaux) ----------
const HALL_LINES = [
  'eh bien, eh bien.',
  'regarde qui a fini par arriver jusqu\'ici.',
  'tu sais où on est, gamin ?\nc\'est le hall du jugement.',
  'c\'est ici qu\'on pèse tout ce que tu as fait en chemin.',
  'tes EXP. ton LV.\ntout ce que tu as accumulé.',
  'et vu tes chiffres...',
  'disons que t\'as été très, très occupé.',
  '...bon. je vais pas tourner autour du pot.',
  'encore un pas...',
  '[dark]et tu vas passer un sale moment.',
];
const INTRO_FIRST = [
  'il paraît que dehors, le ciel est d\'un bleu parfait.',
  'les oiseaux chantent. le vent joue dans les fleurs.',
  'par une journée pareille...',
  '[dark]les gamins comme toi devraient brûler en enfer.',
];
function introLines() {
  const d = save.deaths;
  if (d === 0) return INTRO_FIRST;
  if (save.dunked) return ['...', '[dark]si on était vraiment amis...', '[dark]tu serais pas revenu.'];
  if (d === 1) return ['t\'as une drôle de tête.', 'comme si tu venais de vivre un truc horrible.', '[wink]...non ? bon. on y va.'];
  if (d === 2) return ['laisse-moi deviner.', 'c\'est pas ta première fois ici, hein ?', '[dark]moi non plus.'];
  if (d === 3) return ['encore toi ?', 't\'as pas un autre endroit où mourir ?'];
  if (d < 10) return [`on en est à ${d} tentatives, gamin.`, '[wink]je commence à m\'attacher.'];
  return [`${d} tentatives.`, 'à ce stade, c\'est plus de la détermination.', '[wink]c\'est de l\'entêtement.'];
}
const TURNS = [
  { atk: 'boneGaps', lines: ['quoi ? tu croyais que j\'allais rester planté là à encaisser ?'] },
  { atk: 'blasterCircle', lines: ['tu sais, les lignes du temps font n\'importe quoi depuis un moment.', 'ça avance... ça recule... ça s\'arrête net...', 'puis ça recommence.', '[dark]et je parie que c\'est toi qui tiens la télécommande.'] },
  { atk: 'blueWall', lines: ['j\'arrive même plus à me rappeler la dernière fois où j\'ai fait un effort.', 'faut croire que t\'es une exception.'] },
  { atk: 'boneRain', lines: ['tu veux que je te dise un secret ?', 'je suis pas du genre bagarreur.', 'mais tu m\'as pas vraiment laissé le choix.'] },
  { atk: 'platforms', lines: ['t\'as remarqué ? tu te bats contre un squelette.', 'c\'est quand même un peu os-é.', '[wink]heh.'] },
  { atk: 'slamCombo', lines: ['mon frère disait que n\'importe qui peut devenir quelqu\'un de bien.', 'qu\'il suffit d\'essayer.', '[closed]...il disait plein de trucs, papyrus.'] },
  { atk: 'boneTunnel', lines: ['une question, gamin.', 'pourquoi tu continues ?', 'y a plus rien à gagner ici. plus personne à sauver.'] },
  { atk: 'blasterBurst', lines: ['tu sais ce qui est drôle ?', 'dans une autre timeline, on aurait pu être potes.', '[closed]...on l\'a peut-être même été.'] },
  { spare: true, lines: ['[closed]...', 't\'as l\'air crevé, gamin.', 'écoute. je crois qu\'il reste un peu de bon en toi.', 'quelque part, tout au fond.', 'alors faisons une pause, d\'accord ?', 'si on est vraiment amis...', '...tu vas m\'épargner.'] },
  { atk: 'combo1', lines: ['[dark]bon.', 'visiblement, la gentillesse c\'est pas ton truc.', '[dark]alors passons aux choses sérieuses.'] },
  { atk: 'platforms2', lines: ['tu sais, je fais jamais de promesses.', 'mais j\'en ai fait une, un jour.', 'à une dame, derrière une porte.', '[dark]sans elle, tu serais déjà poussière à l\'endroit où tu te tiens.'] },
  { atk: 'crossSweep', lines: ['c\'est épuisant, tu sais ?', 'les resets. tout qui repart à zéro.', 'un jour, j\'ai arrêté d\'essayer.', 'et franchement ? je me sentais mieux.'] },
  { atk: 'slamCombo2', lines: ['mais toi...', 'toi, tu reviens toujours.', 'encore et encore et encore.', 'qu\'est-ce que tu cherches ? la fin ? le score ?'] },
  { atk: 'blasterStorm', lines: ['...', 'heh. pas de réponse.', '[closed]évidemment.'] },
  { atk: 'final', final: true, lines: ['ok.', 'on dirait que t\'as compris le principe.', 'alors on y va.', '[blue]survis à ÇA, et je te montrerai mon attaque spéciale !'] },
];
const FLAVOR = [
  '* Tu sens que tu vas passer un sale moment.',
  '* Sans t\'observe, les mains dans les poches.',
  '* Le hall baigne dans une lumière dorée.',
  '* Tu entends un oiseau chanter, très loin.',
  '* Sans se gratte le crâne.\n* Il a l\'air de s\'ennuyer.',
  '* Ça sent le ketchup.',
  '* Sans sourit. Il sourit toujours.',
  '* Tes péchés pèsent lourd sur tes épaules.',
  '* Sans hésite.',
  '* Sans t\'offre sa clémence.',
  '* Sans commence à transpirer.',
  '* Sans a l\'air fatigué.',
  '* Sans halète.',
  '* Le silence est assourdissant.',
  '* Sans prépare son attaque spéciale.',
];
const FINAL_TALK = [
  '[closed]...', 'bon... ça y est.', 'tu vois ça ?', 'voilà mon attaque spéciale.',
  'ouais. ça ressemble à rien.', 'parce que c\'est rien.', 'je vais juste... rester là.',
  'si je finis jamais mon tour, tu pourras jamais jouer le tien.', 'alors on va attendre ici. ensemble.', '[closed]pour toujours.',
];
const ENDING_TALK = [
  '[closed]...', 'bon.', 'on dirait que...', 'c\'est la fin.', '[closed]...', 'pas grave.', 'j\'ai fait ce que j\'ai pu.',
  'je crois que je vais aller faire un tour chez grillby.', '[closed]papyrus...', '[closed]...tu veux quelque chose ?',
];
const RISE_TALK = ['[closed]...', '[closed]heh...', 'tu croyais vraiment...', '[dark]...que j\'allais te laisser passer ?'];
const P2_TURNS = [
  { atk: 'blasterStorm', lines: ['papyrus... les autres...', 'tout le monde comptait sur moi.', '[blue]alors je tomberai pas. pas maintenant.'] },
  { atk: 'slamCombo2', lines: ['ça fait mal, tu sais.', '[blue]mais c\'est rien à côté de ce que tu leur as fait.'] },
  { atk: 'combo1', lines: ['ma détermination ?', '[blue]je l\'ai trouvée en te regardant les tuer.'] },
  { atk: 'final', lines: ['[blue]un dernier effort...', '[blue]tiens bon, sans. tiens bon.'] },
];
const P2_POOL = ['blasterStorm', 'slamCombo2', 'combo1', 'crossSweep', 'platforms2', 'boneTunnel', 'blasterBurst', 'slamCombo', 'boneRain'];
const P2_TAUNT = [['[blue]c\'est tout ?'], ['heh. ça chatouille.'], ['[blue]frappe plus fort, gamin.'], ['[dark]je sens rien.'], ['[blue]encore.'], ['tu fatigues ?', '[blue]moi non.']];
const P2_MAX = 2500000;
const P2_FLAVOR = ['* Sans s\'est relevé. Son aura brûle.', '* Sans encaisse sans sourciller.', '* La plaie de Sans saigne, mais il sourit.', '* Sa volonté de te tuer le tient debout.', '* Sans ne recule pas d\'un pas.'];
const CHECK = ['* SANS - ATQ 1 DÉF 1\n* L\'ennemi le plus facile.\n* Ne peut infliger que 1 dégât.'];
const ITEMS0 = [
  { name: 'Tarte', heal: 999, eat: '* Tu manges la Tarte au caramel.' },
  { name: 'Nouilles', heal: 4, eat: '* Tu les fais cuire, comme il faut...\n* Elles sont meilleures crues.' },
  { name: 'Steak V.', heal: 60, eat: '* Tu manges le Steak Visage.' },
  { name: 'Héros L.', heal: 40, eat: '* Tu manges le Héros légendaire.\n* Ton ATQ augmente de 4 !' },
  { name: 'Héros L.', heal: 40, eat: '* Tu manges le Héros légendaire.\n* Ton ATQ augmente de 4 !' },
  { name: 'Bonhomme', heal: 45, eat: '* Tu manges le Morceau de bonhomme de neige.' },
  { name: 'Bisicle', heal: 11, eat: '* Tu manges un bout du Bisicle.', next: 'Unisicle' },
  { name: 'Héros L.', heal: 40, eat: '* Tu manges le Héros légendaire.\n* Ton ATQ augmente de 4 !' },
];
const GO_LINES = [
  ['Ce n\'est pas encore fini...', '{N} !\nGarde ta détermination...'],
  ['Notre destin repose sur toi...', '{N} !\nReste déterminé...'],
  ['Ne perds pas espoir...', '{N} !\nGarde ta détermination...'],
];
const ATK_LIST = [['opening', 'Ouverture'], ['boneGaps', 'Os sauteurs'], ['blasterCircle', 'Cercle de blasters'], ['blueWall', 'Murs bleus'],
  ['boneRain', 'Pluie d\'os'], ['platforms', 'Plateformes'], ['slamCombo', 'Projections'], ['boneTunnel', 'Tunnel d\'os'],
  ['blasterBurst', 'Rafale'], ['combo1', 'Combo'], ['platforms2', 'Plateformes II'], ['crossSweep', 'Balayage'],
  ['slamCombo2', 'Projections II'], ['blasterStorm', 'Tempête'], ['final', 'Attaque finale']];

// ---------- État global ----------
const S = { scene: 'boot', t: 0, shake: 0, paused: false, toast: null, fade: 0 };
let B = null;          // combat
const P = { hp: 92, max: 92, kr: 0 };
const MENU_BOX = boxRect(566, 130);
const BTN = [{ x: 32, label: 'COMBAT', icon: 'fight' }, { x: 185, label: 'AGIR', icon: 'act' }, { x: 345, label: 'OBJET', icon: 'item' }, { x: 500, label: 'PITIÉ', icon: 'mercy' }];
const SPEED = 140, GRAV = 820, JUMP = 330, CUT = 60, HB = 4;
const GDIR = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const JUMPKEY = { down: 'up', up: 'down', left: 'right', right: 'left' };
const SANS_X = 320, SANS_BASE = 236;

function boxRect(w, h) { return { l: 320 - w / 2, r: 320 + w / 2, t: 385 - h, b: 385, w, h, cx: 320, cy: 385 - h / 2 }; }

// ---------- Projectiles ----------
function drawBone(x, y, w, h, color) {
  ctx.fillStyle = color === 'blue' ? COL.blue : color === 'orange' ? COL.orange : '#fff';
  if (h >= w) {
    const r = w * 0.31;
    ctx.fillRect(x + w * 0.2, y + r, w * 0.6, Math.max(0, h - 2 * r));
    for (const yy of [y + r, y + h - r]) { circ(x + r, yy, r); circ(x + w - r, yy, r); }
  } else {
    const r = h * 0.31;
    ctx.fillRect(x + r, y + h * 0.2, Math.max(0, w - 2 * r), h * 0.6);
    for (const xx of [x + r, x + w - r]) { circ(xx, y + r, r); circ(xx, y + h - r, r); }
  }
}
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

function mkBone(o) {
  const b = { kind: 'bone', x: 0, y: 0, w: 10, h: 40, vx: 0, vy: 0, color: 'white', clip: true, kr: 1, life: 20, ...o };
  b.update = dt => {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x > W + 300 || b.x + b.w < -300 || b.y > H + 300 || b.y + b.h < -300) b.dead = true;
  };
  b.hits = s => overlap(b.x + 1, b.y + 1, b.w - 2, b.h - 2, s.x - HB, s.y - HB, HB * 2, HB * 2);
  b.draw = () => drawBone(b.x, b.y, b.w, b.h, b.color);
  return b;
}
function mkStab(side, depth, warn, hold) {
  const k = { ...B.boxT };
  const b = { kind: 'stab', clip: true, t: 0, ext: 0, kr: 1 };
  const region = e => side === 'down' ? [k.l, k.b - e, k.w, e] : side === 'up' ? [k.l, k.t, k.w, e] : side === 'left' ? [k.l, k.t, e, k.h] : [k.r - e, k.t, e, k.h];
  Snd.warn();
  b.update = dt => {
    b.t += dt; const t = b.t - warn;
    if (t < 0) b.ext = 0;
    else {
      if (!b.snd) { b.snd = 1; Snd.stab(); }
      if (t < 0.07) b.ext = depth * t / 0.07;
      else if (t < 0.07 + hold) b.ext = depth;
      else if (t < 0.22 + hold) b.ext = depth * (1 - (t - 0.07 - hold) / 0.15);
      else b.dead = true;
    }
  };
  b.hits = s => b.ext > 3 && overlap(...region(b.ext - 2), s.x - HB, s.y - HB, HB * 2, HB * 2);
  b.draw = () => {
    if (b.t < warn) {
      if (Math.floor(b.t * 14) % 2 === 0) {
        ctx.strokeStyle = COL.red; ctx.lineWidth = 2;
        const [x, y, w, h] = region(depth); ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        txt('!', x + w / 2, y + h / 2, { font: F(20, F_UI), color: COL.red, align: 'center', base: 'middle' });
      }
      return;
    }
    const e = b.ext;
    if (side === 'down' || side === 'up') {
      for (let x = k.l + 3; x < k.r - 4; x += 13) drawBone(x, side === 'down' ? k.b - e : k.t - 12, 9, e + 12, 'white');
    } else {
      for (let y = k.t + 3; y < k.b - 4; y += 13) drawBone(side === 'left' ? k.l - 12 : k.r - e, y, e + 12, 9, 'white');
    }
  };
  return b;
}
function mkBlaster(tx, ty, ang, o = {}) {
  const size = o.size || 2, delay = o.delay ?? 0.62, fire = o.fire ?? 0.32, full = 18 * size;
  const a0 = ang + (Math.random() < 0.5 ? 1 : -1) * 0.7;
  const sx = tx - Math.cos(a0) * 260, sy = ty - Math.sin(a0) * 260;
  const b = { kind: 'blaster', clip: false, t: 0, x: sx, y: sy, rot: ang + Math.PI, bw: 0, kr: 2, v: 0, open: 0 };
  Snd.blCharge();
  b.mouth = () => ({ x: b.x + Math.cos(ang) * (17 + b.open * 3) * size, y: b.y + Math.sin(ang) * (17 + b.open * 3) * size });
  b.update = dt => {
    b.t += dt;
    if (b.t < 0.32) { const p = ease(b.t / 0.32); b.x = lerp(sx, tx, p); b.y = lerp(sy, ty, p); b.rot = lerp(ang + Math.PI, ang, p); }
    else { b.rot = ang; }
    b.open = b.t < delay - 0.15 ? 0 : b.t < delay ? (b.t - delay + 0.15) / 0.15 : 1;
    if (b.t >= delay) {
      if (!b.fired) { b.fired = true; Snd.blFire(); S.shake = Math.max(S.shake, 0.08); }
      const ft = b.t - delay;
      if (ft < 0.06) b.bw = full * ft / 0.06;
      else if (ft < fire) b.bw = full * (1 + 0.1 * Math.sin(ft * 70));
      else if (ft < fire + 0.3) b.bw = full * (1 - (ft - fire) / 0.3);
      else b.dead = true;
      if (ft > 0.04) { b.v += 1100 * dt; b.x -= Math.cos(ang) * b.v * dt; b.y -= Math.sin(ang) * b.v * dt; }
    }
  };
  b.hits = s => {
    if (b.bw < full * 0.4) return false;
    const m = b.mouth(), dx = s.x - m.x, dy = s.y - m.y;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    return along > -6 && perp < b.bw / 2 - 2 + HB * 0.5;
  };
  b.draw = () => {
    if (b.bw > 0.5) {
      const m = b.mouth();
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(160,220,255,0.35)'; ctx.fillRect(0, -b.bw * 0.7, 1500, b.bw * 1.4);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, -b.bw / 2, 1500, b.bw);
      circ(2, 0, b.bw / 2);
      ctx.restore();
    }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot - Math.PI / 2);
    const s = size * (b.t < 0.32 ? 0.6 + 0.4 * ease(b.t / 0.32) : 1) * (1 + (b.open > 0 && !b.fired ? Math.sin(b.t * 80) * 0.02 : 0));
    ctx.drawImage(SPR.blJaw, -20 * s, (15 + b.open * 7) * s, 40 * s, 10 * s);
    ctx.drawImage(b.open > 0.5 ? SPR.blTopOpen : SPR.blTop, -20 * s, -17 * s, 40 * s, 34 * s);
    ctx.restore();
  };
  return b;
}
function mkPlat(x, y, w, vx) {
  const b = { kind: 'plat', clip: true, harmless: true, x, y, w, h: 8, vx };
  b.update = dt => { b.x += b.vx * dt; if (b.x > W + 200 || b.x + b.w < -200) b.dead = true; };
  b.draw = () => {
    ctx.fillStyle = '#000'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#2aff2a'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x + 1, b.y, b.w - 2, 2);
  };
  return b;
}
function mkSpikes(h = 16, speed = 70) {
  const b = { kind: 'spikes', clip: true, off: 0, kr: 1 };
  b.update = dt => { b.off = (b.off + speed * dt) % 13; };
  b.hits = s => overlap(B.box.l, B.box.b - h + 3, B.box.r - B.box.l, h, s.x - HB, s.y - HB, HB * 2, HB * 2);
  b.draw = () => { for (let x = B.box.l - 13 + (13 - b.off); x < B.box.r + 13; x += 13) drawBone(x, B.box.b - h, 9, h + 10, 'white'); };
  return b;
}

// ---------- Attaques ----------
class Runner {
  constructor(def) { this.def = def; this.t = 0; this.ev = []; this.dur = def.dur; }
  get k() { return B.boxT; }
  at(t, fn) { let i = this.ev.length; while (i > 0 && this.ev[i - 1].t > t) i--; this.ev.splice(i, 0, { t, fn }); }
  every(t0, t1, dt, fn) { let i = 0; for (let t = t0; t < t1 - 1e-9; t += dt) { const j = i++; this.at(t, () => fn(j)); } }
  update(dt) { this.t += dt; while (this.ev.length && this.ev[0].t <= this.t) this.ev.shift().fn(this.k); }
  add(b) { B.bullets.push(b); return b; }
  floorBone(x, h, vx, color = 'white') { const k = this.k; return this.add(mkBone({ x, y: k.b - h, w: 10, h: h + 16, vx, color })); }
  ceilBone(x, h, vx, color = 'white') { const k = this.k; return this.add(mkBone({ x, y: k.t - 16, w: 10, h: h + 16, vx, color })); }
  wall(x, vx, color = 'blue') { const k = this.k; return this.add(mkBone({ x, y: k.t - 8, w: 10, h: k.h + 16, vx, color })); }
  gapPair(x, gy, gap, vx) { const k = this.k; this.ceilBone(x, gy - gap / 2 - k.t, vx); this.floorBone(x, k.b - gy - gap / 2, vx); }
  blaster(x, y, ang, o) { return this.add(mkBlaster(x, y, ang, o)); }
  aim(x, y) { return Math.atan2(B.soul.y - y, B.soul.x - x); }
  aimed(R = 175, o) { const k = this.k, a = Math.random() * Math.PI * 2, x = k.cx + Math.cos(a) * R, y = k.cy + Math.sin(a) * R; return this.blaster(x, y, this.aim(x, y), o); }
  stab(side, depth, warn, hold) { return this.add(mkStab(side, depth, warn, hold)); }
  platform(x, y, w, vx) { return this.add(mkPlat(x, y, w, vx)); }
  spikes() { return this.add(mkSpikes()); }
  rain() { const k = this.k; this.add(mkBone({ x: k.l + Math.random() * (k.w - 10), y: k.t - 40, w: 10, h: 30, vy: 200 + Math.random() * 90 })); }
  slam(d) { slamSoul(d); }
  setSoul(m, g) { setSoulMode(m, g); }
  boxTo(w, h) { B.boxT = boxRect(w, h); }
  placeSoul(x, y, p) { const s = B.soul; s.x = x; s.y = y; s.plat = p || null; s.grounded = !!p; s.gv = 0; }
  gaps(seq, t0, dt, speed, flipAt = 7) {
    seq.forEach((s, i) => this.at(t0 + i * dt, k => {
      const right = i < flipAt, vx = right ? -speed : speed, x = right ? k.r + 4 : k.l - 14;
      if (s === 'lo') this.floorBone(x, 24, vx);
      else if (s === 'tall') this.floorBone(x, 46, vx);
      else if (s === 'ceil') this.ceilBone(x, k.h - 32, vx);
      else if (s === 'blue') this.wall(x, vx, 'blue');
    }));
  }
}
const DIRS = ['down', 'left', 'up', 'right'];
function slamSeq(A, n, t0, gaps, stabUntil = n, blasterEvery = 0) {
  let prev = B.soul.grav, t = t0;
  for (let i = 0; i < n; i++) {
    let d; do d = DIRS[(Math.random() * 4) | 0]; while (d === prev);
    prev = d;
    const tt = t;
    A.at(tt, () => A.slam(d));
    if (i < stabUntil) A.at(tt + 0.2, () => A.stab(d, 25, 0.33, 0.24));
    if (blasterEvery && i % blasterEvery === blasterEvery - 1) A.at(tt + 0.45, () => A.aimed(170));
    t += typeof gaps === 'function' ? gaps(i) : gaps;
  }
  return t;
}
const ATK = {
  opening: { box: [280, 135], soul: 'blue', start: 'center', dur: 7.2, run(A) {
    A.at(0, () => A.slam('down'));
    A.at(0.4, () => A.stab('down', 30, 0.45, 0.4));
    A.at(1.75, k => { A.blaster(k.l - 70, k.t + 26, 0); A.blaster(k.r + 70, k.t + 26, Math.PI); });
    A.at(2.6, k => { A.blaster(k.l + 36, k.t - 80, Math.PI / 2); A.blaster(k.r - 36, k.t - 80, Math.PI / 2); });
    A.at(3.5, () => A.setSoul('red'));
    A.at(3.6, k => A.blaster(k.cx, k.t - 95, Math.PI / 2, { size: 2.4 }));
    A.at(4.4, k => A.blaster(k.l - 95, k.cy, 0, { size: 2.4 }));
    A.at(5.2, k => {
      for (const [x, y] of [[k.l - 60, k.t - 60], [k.r + 60, k.t - 60], [k.l - 60, k.b + 60], [k.r + 60, k.b + 60]]) A.blaster(x, y, Math.atan2(k.cy - y, k.cx - x));
    });
  } },
  boneGaps: { box: [300, 140], soul: 'blue', dur: 8.6, run(A) {
    A.gaps(['lo', 'lo', 'tall', 'ceil', 'lo', 'blue', 'lo', 'tall', 'ceil', 'blue', 'lo', 'lo', 'tall'], 0.5, 0.55, 230);
  } },
  blasterCircle: { box: [150, 145], soul: 'red', dur: 6.8, run(A) {
    for (let i = 0; i < 9; i++) A.at(0.35 + i * 0.45, () => A.aimed(175));
    A.at(4.7, k => { for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + Math.PI / 4, x = k.cx + Math.cos(a) * 190, y = k.cy + Math.sin(a) * 190; A.blaster(x, y, A.aim(x, y), { delay: 0.7 }); } });
  } },
  blueWall: { box: [300, 140], soul: 'red', dur: 8.4, run(A) {
    for (let i = 0; i < 10; i++) A.at(0.4 + i * 0.7, k => {
      const right = i < 5, vx = right ? -210 : 210, x = right ? k.r + 4 : k.l - 14;
      if (i % 2 === 0) A.gapPair(x, k.t + 30 + Math.random() * (k.h - 60), 44, vx);
      else A.wall(x, vx, 'blue');
    });
  } },
  boneRain: { box: [220, 140], soul: 'red', dur: 7, run(A) {
    A.every(0.3, 5.6, 0.12, () => A.rain());
    A.every(2.8, 5.6, 0.45, i => { const k = A.k, l = i % 2 === 0; A.add(mkBone({ x: l ? k.l - 40 : k.r + 10, y: k.t + 10 + Math.random() * (k.h - 30), w: 30, h: 10, vx: l ? 230 : -230 })); });
  } },
  platforms: { box: [420, 140], soul: 'blue', start: 'none', dur: 9.6, run(A) {
    A.at(0, k => { A.spikes(); const p = A.platform(k.cx - 70, k.b - 42, 140, -38); A.placeSoul(k.cx, p.y - 8, p); });
    A.every(0.5, 8.6, 1.1, i => { const k = A.k; A.platform(k.r + 2, k.b - (i % 2 ? 44 : 76), 80, -100); });
    A.at(4.2, k => A.blaster(k.r + 80, k.t + 22, Math.PI));
    A.at(7.2, k => A.blaster(k.l - 80, k.t + 22, 0));
  } },
  slamCombo: { box: [180, 150], soul: 'blue', dur: 7.6, run(A) {
    ['left', 'up', 'right', 'down', 'left', 'up'].forEach((d, i) => {
      const t = 0.3 + i * 1.15;
      A.at(t, () => A.slam(d)); A.at(t + 0.22, () => A.stab(d, 26, 0.36, 0.28));
    });
  } },
  boneTunnel: { box: [300, 140], soul: 'red', dur: 7.8, run(A) {
    A.every(0.3, 6.4, 0.14, i => { const k = A.k; A.gapPair(k.r + 4, k.cy + Math.sin(i * 0.26) * 38, 50, -240); });
  } },
  blasterBurst: { box: [240, 140], soul: 'red', dur: 7.2, run(A) {
    A.at(0.3, k => shuffle([k.t + 24, k.cy, k.b - 24]).forEach((y, j) => A.at(A.t + j * 0.3, () => A.blaster(j % 2 ? A.k.r + 80 : A.k.l - 80, y, j % 2 ? Math.PI : 0))));
    A.at(1.6, k => shuffle([k.l + 30, k.cx, k.r - 30]).forEach((x, j) => A.at(A.t + j * 0.3, () => A.blaster(x, A.k.t - 90, Math.PI / 2))));
    A.every(3.0, 5.2, 0.4, () => A.aimed(180));
    A.at(5.5, k => A.blaster(k.cx, k.t - 110, A.aim(k.cx, k.t - 110), { size: 3.2, delay: 0.8 }));
  } },
  combo1: { box: [300, 140], soul: 'blue', dur: 9, run(A) {
    A.gaps(['lo', 'tall', 'lo', 'ceil', 'lo', 'lo', 'tall', 'blue', 'lo', 'ceil', 'lo', 'tall', 'lo', 'lo'], 0.4, 0.48, 270);
    A.every(1.2, 7.6, 1.6, () => { const k = A.k; A.blaster(clamp(B.soul.x, k.l + 20, k.r - 20), k.t - 100, Math.PI / 2); });
  } },
  platforms2: { box: [420, 140], soul: 'blue', start: 'none', dur: 10, run(A) {
    A.at(0, k => { A.spikes(); const p = A.platform(k.cx - 70, k.b - 42, 140, -50); A.placeSoul(k.cx, p.y - 8, p); });
    A.every(0.4, 9, 0.95, i => { const k = A.k; A.platform(k.r + 2, k.b - (i % 2 ? 44 : 78), 70, -120); });
    A.every(2.2, 9, 2.2, i => { const k = A.k; A.blaster(k.r + 80, i % 2 === 0 ? k.b - 60 : k.t + 20, Math.PI, { delay: 0.75 }); });
  } },
  crossSweep: { box: [240, 140], soul: 'red', dur: 8.6, run(A) {
    A.every(0.3, 3.9, 0.85, () => {
      const k = A.k, gx = k.l + 30 + Math.random() * (k.w - 60), gap = 48;
      A.add(mkBone({ x: k.l - 4, y: k.t - 12, w: gx - gap / 2 - k.l + 4, h: 10, vy: 150 }));
      A.add(mkBone({ x: gx + gap / 2, y: k.t - 12, w: k.r - gx - gap / 2 + 4, h: 10, vy: 150 }));
    });
    A.every(4.2, 7.6, 0.8, () => {
      const k = A.k, gy = k.t + 25 + Math.random() * (k.h - 50), gap = 44;
      A.add(mkBone({ x: k.l - 12, y: k.t - 4, w: 10, h: gy - gap / 2 - k.t + 4, vx: 190 }));
      A.add(mkBone({ x: k.l - 12, y: gy + gap / 2, w: 10, h: k.b - gy - gap / 2 + 4, vx: 190 }));
    });
  } },
  slamCombo2: { box: [180, 150], soul: 'blue', dur: 9.4, run(A) { slamSeq(A, 8, 0.3, 0.95, 8, 2); } },
  blasterStorm: { box: [200, 145], soul: 'red', dur: 9, run(A) {
    let t = 0.3, gap = 0.6;
    while (t < 6.2) { A.at(t, () => A.aimed(180, { delay: 0.5 })); t += gap; gap = Math.max(0.26, gap * 0.9); }
    A.at(6.6, k => { for (const x of [k.l - 70, k.r + 70]) A.blaster(x, k.t - 70, Math.atan2(k.cy - k.t + 70, k.cx - x)); });
    A.at(7.3, k => { A.blaster(k.cx, k.t - 90, Math.PI / 2); A.blaster(k.l - 90, k.cy, 0); });
  } },
  final: { box: [180, 150], soul: 'blue', dur: 31, run(A) {
    A.at(0, () => { B.sans.glow = true; });
    slamSeq(A, 12, 0.4, 0.85, 12, 3);
    A.at(11, () => { A.setSoul('red'); A.boxTo(220, 140); });
    A.every(11.4, 18.8, 0.13, () => A.rain());
    A.every(11.8, 18.8, 0.75, () => A.aimed(180));
    A.at(19.2, () => { A.boxTo(180, 150); A.setSoul('blue', 'down'); B.sans.glow = false; });
    const gaps = [1.0, 1.15, 1.35, 1.6, 1.9, 2.3];
    A.at(19.6, () => slamSeq(A, 6, A.t + 0.1, i => gaps[i], 4));
    A.every(19.7, 30, 1.2, i => { B.sans.sweat = Math.min(3, 1 + i * 0.4); });
  } },
};

// ---------- Âme ----------
function setSoulMode(mode, grav = 'down', silent = false) {
  const s = B.soul;
  if (mode === 'blue' && (s.mode !== 'blue' || s.grav !== grav) && !silent) { Snd.ding(); B.sans.eyeT = 0.6; }
  if (mode === 'blue' && s.mode !== 'blue' && silent) B.sans.eyeT = 0.5;
  s.mode = mode; s.grav = grav; s.gv = 0; s.thrown = false; s.plat = null; s.grounded = false;
}
function slamSoul(d) {
  const s = B.soul;
  setSoulMode('blue', d, true);
  s.thrown = true; s.gv = 1100;
  B.sans.arm = d; B.sans.armT = 0.45; B.sans.eyeT = 0.4;
  Snd.whoosh();
}
function updateSoul(dt) {
  const s = B.soul, b = B.box, px = s.x, py = s.y;
  const L = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), U = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
  if (s.mode === 'red') {
    s.x += L * SPEED * dt; s.y += U * SPEED * dt;
  } else {
    const [gx, gy] = GDIR[s.grav], vert = gy !== 0, jk = JUMPKEY[s.grav];
    if (vert) s.x += L * SPEED * dt; else s.y += U * SPEED * dt;
    if (s.thrown) s.gv = 1100;
    else {
      if (s.grounded && down(jk)) { s.gv = -JUMP; s.grounded = false; s.plat = null; }
      if (!s.grounded) { if (s.gv < -CUT && !down(jk)) s.gv = -CUT; s.gv = Math.min(s.gv + GRAV * dt, 520); }
    }
    if (s.plat) {
      const p = s.plat;
      if (p.dead || s.x + 6 < p.x || s.x - 6 > p.x + p.w) { s.plat = null; s.grounded = false; }
      else { s.x += p.vx * dt; s.y = p.y - 8; s.gv = 0; }
    }
    if (!s.grounded) { s.x += gx * s.gv * dt; s.y += gy * s.gv * dt; }
    if (s.grav === 'down' && !s.grounded && s.gv >= 0) {
      for (const p of B.bullets) {
        if (p.kind !== 'plat') continue;
        if (py + 8 <= p.y + 1 && s.y + 8 >= p.y && s.x + 6 > p.x && s.x - 6 < p.x + p.w) { s.y = p.y - 8; s.gv = 0; s.grounded = true; s.plat = p; s.thrown = false; break; }
      }
    }
  }
  s.x = clamp(s.x, b.l + 8, b.r - 8); s.y = clamp(s.y, b.t + 8, b.b - 8);
  if (s.mode === 'blue') {
    const g = s.grav;
    const onWall = g === 'down' ? s.y >= b.b - 8.01 : g === 'up' ? s.y <= b.t + 8.01 : g === 'left' ? s.x <= b.l + 8.01 : s.x >= b.r - 8.01;
    const onCeil = g === 'down' ? s.y <= b.t + 8.01 : g === 'up' ? s.y >= b.b - 8.01 : g === 'left' ? s.x >= b.r - 8.01 : s.x <= b.l + 8.01;
    if (onWall && s.gv >= 0) {
      if (s.thrown) { s.thrown = false; Snd.slam(); S.shake = Math.max(S.shake, 0.18); }
      s.gv = 0; s.grounded = true; s.plat = null;
    } else if (!s.plat && !onWall) s.grounded = false;
    if (onCeil && s.gv < 0) s.gv = 0;
  }
  s.moved = Math.abs(s.x - px) + Math.abs(s.y - py) > 0.05;
}
function drawSoul(x, y, mode = 'red') { dImg(mode === 'blue' ? SPR.heartBlue : SPR.heart, x - 8, y - 6, 1); }

// ---------- Dégâts & KARMA ----------
function hurt(kr) {
  if (B.hurtCD > 0) return;
  B.hurtCD = save.easy ? 1 / 12 : 1 / 30;
  P.hp -= 1;
  P.kr = Math.min(40, P.kr + (save.easy ? kr * 0.5 : kr));
  P.kr = Math.min(P.kr, Math.max(0, P.hp - 1));
  B.hits++;
  Snd.hurt();
  if (P.hp <= 0) die(false);
}
function krTick(dt) {
  if (P.kr <= 0) { P.kr = 0; return; }
  B.krT += dt;
  const kr = P.kr, iv = kr >= 40 ? 1 / 30 : kr >= 30 ? 2 / 30 : kr >= 20 ? 5 / 30 : kr >= 10 ? 15 / 30 : 1;
  if (B.krT >= iv) {
    B.krT = 0;
    if (P.hp > 1) { P.hp--; P.kr = Math.max(0, P.kr - 1); } else P.kr = 0;
  }
}

// ---------- Combat : flux ----------
function newBattle(practice) {
  P.hp = P.max; P.kr = 0;
  B = {
    phase: 'none', turn: 0, practice, box: { ...MENU_BOX }, boxT: { ...MENU_BOX },
    soul: { x: 320, y: MENU_BOX.cy, mode: 'red', grav: 'down', gv: 0, grounded: false, thrown: false, plat: null, moved: false },
    bullets: [], fx: [], typer: new Typer(), bubble: new Typer(), btn: 0, sub: 0, items: ITEMS0.map(i => ({ ...i })),
    sans: { dx: 0, eyeT: 0, arm: null, armT: 0, sweat: 0, hurt: false, sleep: false, alpha: 1, glow: false, dodgeT: -1, hp: 1 },
    hurtCD: 0, krT: 0, hits: 0, time: 0, spareOffer: false, timer: 0, A: null,
  };
}
function startBattle(practice = null) {
  newBattle(practice);
  S.scene = 'battle'; S.fade = 1;
  Snd.music('battle');
  if (practice) { startAttack(practice, () => practiceDone(true)); return; }
  const def = ATK.opening;
  B.boxT = boxRect(...def.box); B.box = { ...B.boxT };
  B.soul.x = 320; B.soul.y = B.boxT.cy;
  talk(introLines(), () => startAttack('opening', toMenu));
}
function talk(lines, done) { B.phase = 'talk'; B.bubble.set(lines, { voice: 'sans', font: FONT_BUBBLE, maxW: 176, speed: 26 }); B.onTalk = done; }
function narr(pages, done) { B.phase = 'narr'; B.boxT = { ...MENU_BOX }; B.typer.set(pages); B.onNarr = done; }
function toMenu() {
  B.phase = 'menu'; B.boxT = { ...MENU_BOX }; B.bullets = [];
  setSoulMode('red', 'down', true);
  B.typer.set([B.p2 ? (B.p2hp < P2_MAX * 0.25 ? '* Sans tient à peine debout.\n* Son aura brûle plus fort que jamais.' : P2_FLAVOR[B.p2i % P2_FLAVOR.length]) : FLAVOR[Math.min(B.turn, FLAVOR.length - 1)]]);
}
function startAttack(name, done) {
  const def = ATK[name];
  B.boxT = boxRect(...def.box);
  B.bullets = []; B.phase = 'attack';
  setSoulMode(def.soul, 'down', def.start === 'center');
  if (def.soul === 'blue' && !def.start) { B.soul.x = 320; B.soul.y = B.boxT.b - 8; }
  if (def.start === 'center') { B.soul.x = 320; B.soul.y = B.boxT.cy; }
  B.soul.x = clamp(B.soul.x, B.boxT.l + 8, B.boxT.r - 8); B.soul.y = clamp(B.soul.y, B.boxT.t + 8, B.boxT.b - 8);
  B.A = new Runner(def); B.onAtk = done;
  def.run(B.A);
}
function enemyTurn() {
  const T = !B.p2 ? TURNS[B.turn] : B.p2i < P2_TURNS.length - 1 ? P2_TURNS[B.p2i]
    : { atk: P2_POOL[B.p2i % P2_POOL.length], lines: B.p2hp < P2_MAX * 0.25 ? ['[blue]...pas encore.', '[blue]je. tomberai. pas.'] : P2_TAUNT[B.p2i % P2_TAUNT.length] };
  if (T.atk) { B.boxT = boxRect(...ATK[T.atk].box); B.soul.x = 320; B.soul.y = B.boxT.cy; }
  else B.boxT = { ...MENU_BOX };
  talk(T.lines, () => {
    if (T.spare) { B.turn++; toMenu(); B.spareOffer = true; return; }
    startAttack(T.atk, () => {
      if (B.p2) { B.p2i++; toMenu(); return; }
      B.turn++; if (T.final) finalSequence(); else toMenu();
    });
  });
}
function p2End() {
  const s = B.sans;
  Snd.stopMusic(1.2); s.glow = false; s.p2 = false; s.hurt = true; s.sweat = 3; B.boxT = { ...MENU_BOX };
  talk(ENDING_TALK, () => { B.phase = 'dust'; B.timer = 0; Snd.dust(); });
}
function afterPlayer() { B.spareOffer = false; enemyTurn(); }
function finalSequence() {
  Snd.stopMusic(1.2);
  B.sans.glow = false; B.sans.sweat = 3; B.boxT = boxRect(200, 140);
  setSoulMode('red', 'down', true);
  talk(FINAL_TALK, () => { B.phase = 'special'; B.timer = 0; });
}
function spareTrap() {
  B.spareOffer = false; B.boxT = boxRect(120, 120); B.soul.x = 320; B.soul.y = B.boxT.cy;
  talk(['heh heh heh...', '[wink]j\'savais que t\'avais ça en toi.', 'allez. viens là, mon pote.'], () => {
    B.phase = 'trap'; B.timer = 0; B.bullets = [];
    for (const d of DIRS) B.bullets.push(mkStab(d, 64, 0.02, 3));
    B.bubble.set(['[dark]et HOP, au panier !!!'], { voice: 'sans', font: FONT_BUBBLE, maxW: 176, speed: 40 });
  });
}
function die(dunked) {
  if (B.practice) { practiceDone(false); return; }
  save.deaths++; save.dunked = dunked; persist();
  Snd.stopMusic(0);
  S.scene = 'gameover';
  const set = GO_LINES[(Math.random() * GO_LINES.length) | 0].map(l => l.replace('{N}', save.name || 'FRISK'));
  S.go = { t: 0, x: B.soul.x, y: B.soul.y, shards: [], typer: new Typer(), lines: set, step: 0 };
}
function practiceDone(ok) {
  const hits = B.hits;
  S.scene = 'practice'; S.pr = S.pr || { sel: 0 }; S.pr.msg = ok ? `Réussi ! Coups encaissés : ${hits}` : 'Touché... Réessaie !';
  S.pr.msgOk = ok;
  Snd.music('title');
}

// ---------- Combat : mise à jour ----------
function updateBox(dt) {
  const b = B.box, t = B.boxT, sp = 900 * dt;
  for (const e of ['l', 'r', 't', 'b']) b[e] += clamp(t[e] - b[e], -sp, sp);
}
function updateSans(dt) {
  const s = B.sans;
  if (s.eyeT > 0) s.eyeT -= dt;
  if (s.armT > 0) { s.armT -= dt; if (s.armT <= 0) s.arm = null; }
  if (s.dodgeT >= 0) {
    s.dodgeT += dt; const t = s.dodgeT;
    s.dx = t < 0.15 ? -62 * ease(t / 0.15) : t < 0.85 ? -62 : t < 1.05 ? -62 * (1 - ease((t - 0.85) / 0.2)) : 0;
    if (t > 1.05) s.dodgeT = -1;
  }
}
function sansEyes() {
  const s = B.sans, flick = Math.floor(S.t * 12) % 2 ? 'yellow' : 'blue';
  if (s.sleep) return 'closed';
  if (s.p2) return flick;
  if (s.eyeT > 0 || s.glow) return flick;
  if (B.phase === 'talk' || B.phase === 'trap') { const e = B.bubble.eyes; if (e === 'blue') return flick; if (e) return e; }
  if (B.phase === 'trap' && B.timer > 0) return 'dark';
  return 'normal';
}
function updateBullets(dt) {
  for (const b of B.bullets) b.update(dt);
  B.bullets = B.bullets.filter(b => !b.dead);
}
function collide() {
  const s = B.soul;
  for (const b of B.bullets) {
    if (b.harmless || !b.hits || !b.hits(s)) continue;
    const c = b.color || 'white';
    if (c === 'blue' && !s.moved) continue;
    if (c === 'orange' && s.moved) continue;
    hurt(b.kr || 1);
    if (S.scene !== 'battle') return;
  }
}
function updateFx(dt) {
  for (const f of B.fx) { f.t += dt; if (f.vy) { f.y += f.vy * dt; f.vy += (f.g || 0) * dt; } if (f.vx) f.x += f.vx * dt; }
  B.fx = B.fx.filter(f => f.t < f.life);
}
function gridNav(n, cols, idx) {
  if (hit('left') && idx % cols > 0) { idx--; Snd.move(); }
  if (hit('right') && idx % cols < cols - 1 && idx + 1 < n) { idx++; Snd.move(); }
  if (hit('up') && idx - cols >= 0) { idx -= cols; Snd.move(); }
  if (hit('down') && idx + cols < n) { idx += cols; Snd.move(); }
  return idx;
}
function useItem(i) {
  const it = B.items[i];
  const before = P.hp;
  P.hp = Math.min(P.max, P.hp + it.heal); P.kr = Math.min(P.kr, Math.max(0, P.hp - 1));
  Snd.heal();
  if (it.next) { it.name = it.next; it.next = null; } else B.items.splice(i, 1);
  const res = P.hp >= P.max ? '* Tes PV sont au maximum !' : `* Tu récupères ${P.hp - before} PV.`;
  narr([it.eat + '\n' + res], afterPlayer);
}
function startFightBar(final) {
  B.phase = 'fightBar';
  B.fb = { x: MENU_BOX.l + 2, v: 420, stop: false, t: 0, final, hitDone: false };
}
function slashFx() { B.fx.push({ kind: 'slash', t: 0, life: 0.5 }); Snd.slash(); }

function updateBattle(dt) {
  B.time += dt;
  if (S.fade > 0) S.fade = Math.max(0, S.fade - dt * 2);
  updateBox(dt); updateSans(dt); updateFx(dt);
  if (B.flash > 0) B.flash -= dt;
  if (B.hpBar) { B.hpBar.t += dt; if (B.hpBar.t > 1.8) B.hpBar = null; }
  if (B.hurtCD > 0) B.hurtCD -= dt;
  krTick(dt);
  const s = B.sans;
  switch (B.phase) {
    case 'talk':
      B.bubble.update(dt);
      updateSoul(dt);
      if (B.bubble.input()) B.onTalk();
      break;
    case 'menu':
      B.typer.update(dt);
      if (hit('left')) { B.btn = (B.btn + 3) % 4; Snd.move(); }
      if (hit('right')) { B.btn = (B.btn + 1) % 4; Snd.move(); }
      if (hit('z')) {
        if (B.btn === 2 && !B.items.length) break;
        Snd.select(); B.sub = 0;
        B.phase = ['fightSel', 'actSel', 'itemSel', 'mercySel'][B.btn];
      }
      break;
    case 'fightSel': case 'actSel':
      if (hit('x')) { B.phase = 'menu'; break; }
      if (hit('z')) { Snd.select(); if (B.phase === 'fightSel') startFightBar(false); else { B.phase = 'actOpt'; B.sub = 0; } }
      break;
    case 'actOpt':
      if (hit('x')) { B.phase = 'actSel'; break; }
      if (hit('z')) { Snd.select(); narr(B.p2 ? ['* SANS - ATQ ??? DÉF ???\n* Il refuse de mourir.\n* Il n\'a jamais été aussi dangereux.'] : CHECK, afterPlayer); }
      break;
    case 'itemSel':
      B.sub = gridNav(B.items.length, 2, B.sub);
      if (hit('x')) { B.phase = 'menu'; break; }
      if (hit('z')) useItem(B.sub);
      break;
    case 'mercySel':
      if (hit('x')) { B.phase = 'menu'; break; }
      if (hit('z')) { Snd.select(); if (B.spareOffer) spareTrap(); else afterPlayer(); }
      break;
    case 'narr':
      B.typer.update(dt);
      if (B.typer.input()) B.onNarr();
      break;
    case 'fightBar': {
      const fb = B.fb;
      if (!fb.stop) {
        fb.x += fb.v * dt;
        const pressed = hit('z');
        if (pressed || fb.x > MENU_BOX.r - 8) {
          fb.stop = true; fb.t = 0; fb.hit = pressed || fb.final;
          if (fb.hit) slashFx();
          if (B.p2 && fb.hit) {
            const off = Math.abs(fb.x - 320) / 283, crit = off < 0.05;
            fb.dmg = Math.round(((1 - off) * 80000 + 60000 + Math.random() * 9999) * (crit ? 1.6 : 1));
            fb.crit = crit;
          } else if (!fb.final) { s.dodgeT = 0; Snd.dodge(); B.fx.push({ kind: 'miss', t: 0, life: 1.0, x: SANS_X, y: 40 }); }
        }
      } else {
        fb.t += dt;
        if (fb.final) {
          if (fb.t > 0.5 && !fb.hitDone) {
            fb.hitDone = true; Snd.bigHit(); S.shake = 0.35; s.hurt = true;
            B.fx.push({ kind: 'dmg', t: 0, life: 2.2, x: SANS_X, y: 22, vy: -120, g: 500, val: 9999999 });
          }
          if (s.hp > 0 && fb.hitDone) s.hp = Math.max(0, s.hp - dt * 0.8);
          if (fb.t > 2.4) { B.boxT = { ...MENU_BOX }; talk(RISE_TALK, () => { B.phase = 'rise'; B.timer = 0; B.fb = null; }); }
        } else if (fb.dmg) {
          if (fb.t > 0.45 && !fb.applied) {
            fb.applied = true; B.hpBar = { t: 0, from: B.p2hp, to: Math.max(0, B.p2hp - fb.dmg) };
            B.p2hp = B.hpBar.to; Snd.bigHit(); B.flash = 0.12;
            B.fx.push({ kind: 'dmg', t: 0, life: 1.6, x: SANS_X, y: 30, vy: -160, g: 600, val: fb.dmg.toLocaleString('fr-FR'), crit: fb.crit });
          }
          if (fb.t > 1.7) { if (B.p2hp <= 0) p2End(); else afterPlayer(); }
        } else if (fb.t > 1.15) afterPlayer();
      }
      break;
    }
    case 'attack': {
      const A = B.A, k = B.p2 ? 1.15 : 1;
      A.update(dt * k);
      updateBullets(dt * k);
      updateSoul(dt);
      collide();
      if (S.scene !== 'battle') return;
      if (B.practice && hit('x')) { practiceDone(false); S.pr.msg = 'Entraînement interrompu.'; return; }
      if (A.t >= A.dur) {
        B.bullets = []; B.A = null; s.arm = null; s.glow = false;
        setSoulMode('red', 'down', true);
        const f = B.onAtk; B.onAtk = null; f();
      }
      break;
    }
    case 'rise':
      // Sans se relève, porté par sa volonté de te tuer.
      B.timer += dt; S.shake = Math.max(S.shake, 0.05);
      if (B.timer > 1.2 && !s.p2) { s.p2 = true; s.hurt = false; s.sleep = false; s.sweat = 0; Snd.bigHit(); S.shake = 0.5; }
      if (B.timer > 3.2) { B.p2 = true; B.p2i = 0; B.p2hp = P2_MAX; B.p2ghost = P2_MAX; Snd.music('battle'); enemyTurn(); }
      break;
    case 'trap':
      B.timer += dt;
      B.bubble.update(dt);
      updateBullets(dt);
      if (B.timer > 0.15) { P.hp -= 70 * dt; P.kr = 0; if (Math.random() < 0.5) Snd.hurt(); }
      if (P.hp <= 0) { P.hp = 0; die(true); }
      break;
    case 'special':
      B.timer += dt; updateSoul(dt);
      if (B.timer > 7) { s.sleep = true; B.phase = 'sleep'; B.timer = 0; }
      break;
    case 'sleep':
      B.timer += dt; updateSoul(dt);
      if (B.timer > 3.5) { B.phase = 'push'; B.timer = 0; }
      break;
    case 'push': {
      B.timer += dt;
      const bt = B.boxT, so = B.soul;
      let mv = 18 * dt;
      if (down('left') && so.x <= B.box.l + 8.5) { mv = -SPEED * 0.75 * dt; Snd.scrape(); }
      if (bt.r + mv > 630) mv = 630 - bt.r;
      bt.l += mv; bt.r += mv; bt.cx += mv;
      B.box = { ...bt };
      updateSoul(dt);
      if (bt.l <= 42) { B.phase = 'finalMenu'; B.boxT = { ...MENU_BOX }; B.btn = 0; B.typer.set(['* Sans dort.']); Snd.select(); }
      break;
    }
    case 'finalMenu':
      B.typer.update(dt);
      if (hit('z')) { Snd.select(); startFightBar(true); }
      break;
    case 'dust':
      B.timer += dt;
      s.alpha = Math.max(0, 1 - B.timer / 2.2);
      if (Math.random() < 0.8) B.fx.push({ kind: 'dust', t: 0, life: 1.6, x: SANS_X + rand(-40, 40), y: rand(90, 230), vx: rand(10, 50), vy: rand(-50, -10) });
      if (B.timer > 3) {
        B.phase = 'win';
        Snd.music('ending');
        narr(['* TU AS GAGNÉ !\n* Tu obtiens 50 000 EXP et 0 G.\n* Ton LV augmente.'], () => {
          save.wins++; const deaths = save.deaths; save.deaths = 0; save.dunked = false; persist();
          S.scene = 'credits'; S.cr = { t: 0, deaths, hits: B.hits, time: B.time };
        });
      }
      break;
  }
}

// ---------- Combat : rendu ----------
const ARM_ANG = { right: -0.15, down: Math.PI / 4, left: Math.PI + 0.15, up: -Math.PI / 3 };
function drawSans(cx, baseY, sc, o = {}) {
  const t = S.t, still = o.still, tired = (o.sweat || 0) >= 2, spd = tired ? 0.55 : 1;
  const px = v => Math.round(v) * sc;
  // Le torse se balance et respire ; la tête suit avec un petit retard.
  const sway = still ? 0 : Math.sin(t * 2.2 * spd) * 1.3;
  const hsway = still ? 0 : Math.sin((t - 0.14) * 2.2 * spd) * 1.7;
  const breath = still ? 0 : (Math.sin(t * 4.4 * spd) > 0.25 ? 1 : 0);
  const hbob = still ? 0 : Math.round(Math.sin(t * 4.4 * spd + 0.9));
  const talk = o.talking ? Math.floor(t * 10) % 2 : 0;
  let lx = 0, lyy = 0;
  if (o.arm) { const d = GDIR[o.arm]; lx = d[0] * 2; lyy = d[1] * 1.5; }
  const ly = baseY - 23 * sc;
  const aura = (img, x, y) => {
    if (!o.aura) return;
    const a0 = ctx.globalAlpha, f = 2 + Math.round(Math.sin(t * 9));
    ctx.globalAlpha = a0 * (0.45 + 0.2 * Math.sin(t * 13));
    for (const [dx, dy] of [[-f, 0], [f, 0], [0, -f - 1], [0, f]]) dImg(img, x + dx * sc, y + dy * sc, sc);
    ctx.globalAlpha = a0;
  };
  if (o.aura) for (let i = 0; i < 10; i++) {
    const ph = (t * 0.9 + i / 10) % 1, sz = Math.max(1, Math.round((1 - ph) * 3)) * sc;
    ctx.globalAlpha = (o.alpha ?? 1) * (1 - ph) * 0.8;
    ctx.fillStyle = i % 4 ? '#ff2840' : COL.blue;
    ctx.fillRect(Math.round(cx + Math.sin(i * 2.4) * 28 * sc), Math.round(baseY - ph * 85 * sc), sz, sz);
    ctx.globalAlpha = o.alpha ?? 1;
  }
  const orbit = front => {
    for (let i = 0; i < 6; i++) {
      const a = t * 1.6 + i * Math.PI / 3, z = Math.sin(a);
      if ((z > 0) !== front) continue;
      ctx.save(); ctx.translate(cx + Math.cos(a) * 46 * sc, baseY - 50 * sc + z * 10 * sc); ctx.rotate(t * 4 + i);
      ctx.globalAlpha = (o.alpha ?? 1) * (front ? 1 : 0.55); drawBone(-11, -4, 22, 8, i % 2 ? 'white' : 'blue');
      ctx.restore();
    }
    ctx.globalAlpha = o.alpha ?? 1;
  };
  if (o.p2) {
    // ondes de choc au sol
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.8 + i / 2) % 1;
      ctx.strokeStyle = `rgba(255,40,70,${(1 - ph) * 0.6})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, baseY - 2, 20 + ph * 90, 4 + ph * 14, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // flammes de l'aura
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? 'rgba(255,90,60,0.35)' : 'rgba(200,0,40,0.4)';
      for (let i = 0; i < 9; i++) {
        const fx = cx + (i - 4) * 9 * sc * (layer ? 0.7 : 1), hh = (layer ? 48 : 70) * sc * (0.75 + 0.25 * Math.sin(t * 7 + i * 1.9 + layer));
        const sw = Math.sin(t * 5 + i) * 6 * sc, bw = 9 * sc;
        ctx.beginPath(); ctx.moveTo(fx - bw, baseY);
        ctx.quadraticCurveTo(fx - bw * 0.6 + sw * 0.5, baseY - hh * 0.5, fx + sw, baseY - hh);
        ctx.quadraticCurveTo(fx + bw * 0.6 + sw * 0.5, baseY - hh * 0.5, fx + bw, baseY);
        ctx.fill();
      }
    }
    orbit(false);
    // glitch rouge / cyan
    if ((t % 1.7) < 0.09) {
      const a0 = ctx.globalAlpha; ctx.globalAlpha = 0.6;
      dImg(SPR.legsA, cx - 17 * sc - 4 * sc, ly, sc); dImg(SPR.torsoA, cx - 26 * sc - 4 * sc, ly - 28 * sc, sc); dImg(SPR.headA, cx - 17 * sc - 4 * sc, ly - 51 * sc, sc);
      dImg(SPR.legsC, cx - 17 * sc + 4 * sc, ly, sc); dImg(SPR.torsoC, cx - 26 * sc + 4 * sc, ly - 28 * sc, sc); dImg(SPR.headC, cx - 17 * sc + 4 * sc, ly - 51 * sc, sc);
      ctx.globalAlpha = a0;
    }
  }
  aura(SPR.legsA, cx - 17 * sc, ly);
  dImg(SPR.legs, cx - 17 * sc, ly, sc);
  const tx = cx - 26 * sc + px(sway + lx), ty = ly - 28 * sc + px(breath + lyy);
  aura(SPR.torsoA, tx, ty);
  dImg(o.p2 ? SPR.torsoP2 : o.hurt ? SPR.torsoHurt : SPR.torso, tx, ty, sc);
  if (o.arm) {
    const left = o.arm === 'left';
    const sx = tx + (left ? 8 : 44) * sc, sy = ty + 13 * sc, a = ARM_ANG[o.arm];
    if (o.armT > 0.25) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.8, (o.armT - 0.25) * 4)})`; ctx.lineWidth = 2 * sc;
      ctx.beginPath(); left ? ctx.arc(sx, sy, 32 * sc, a + 0.15, a + 1.0) : ctx.arc(sx, sy, 32 * sc, a - 1.0, a - 0.15); ctx.stroke();
    }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    if (left) ctx.scale(1, -1);
    ctx.drawImage(SPR.arm, -2 * sc, -7 * sc, 30 * sc, 14 * sc);
    ctx.restore();
  }
  const hx = cx - 17 * sc + px(hsway + lx * 1.4);
  const hy = ty - 23 * sc + px(hbob - talk + (o.headDY || 0) + (tired ? 1 : 0) + lyy * 0.5);
  const eyes = o.eyes || 'normal';
  aura(SPR.headA, hx, hy);
  const hk = o.p2 ? (eyes === 'yellow' ? 'p2y' : 'p2b') : tired && eyes === 'normal' ? 'tired' : eyes;
  dImg(SPR['head_' + hk] || SPR.head_normal, hx, hy, sc);
  if (o.p2) {
    const rx = hx + 23.5 * sc, ry = hy + 13.5 * sc;
    const rg = ctx.createRadialGradient(rx, ry, 0, rx, ry, 8 * sc);
    rg.addColorStop(0, 'rgba(255,30,50,0.7)'); rg.addColorStop(1, 'rgba(255,30,50,0)');
    ctx.fillStyle = rg; ctx.fillRect(rx - 8 * sc, ry - 8 * sc, 16 * sc, 16 * sc);
  }
  if (eyes === 'blue' || eyes === 'yellow') {
    // Œil gauche qui flambe : halo et traînée de flammes bleues et jaunes.
    const ex = hx + 10.5 * sc, ey = hy + 13.5 * sc;
    const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9 * sc);
    gr.addColorStop(0, 'rgba(80,200,255,0.55)'); gr.addColorStop(1, 'rgba(80,200,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(ex - 9 * sc, ey - 9 * sc, 18 * sc, 18 * sc);
    for (let i = 0; i < (o.p2 ? 14 : 7); i++) {
      const ph = (t * 2.6 + i / (o.p2 ? 14 : 7)) % 1, sz = Math.max(1, Math.round((1 - ph) * 4)) * sc;
      ctx.globalAlpha = (o.alpha ?? 1) * (1 - ph);
      ctx.fillStyle = i % 3 === 0 ? COL.yellow : COL.blue;
      ctx.fillRect(Math.round(ex - ph * 14 * sc - sz / 2 + Math.sin(ph * 9 + i) * sc), Math.round(ey - ph * 16 * sc - sz / 2), sz, sz);
    }
    ctx.globalAlpha = o.alpha ?? 1;
  }
  if (o.p2) orbit(true);
  if (o.sweat) {
    ctx.fillStyle = '#6fd3ff';
    for (let i = 0; i < Math.ceil(o.sweat); i++) {
      const ph = (t * 0.7 + i * 0.33) % 1, side = i % 2 ? 1 : -1;
      ctx.globalAlpha = (o.alpha ?? 1) * (1 - ph);
      ctx.fillRect(Math.round(cx + side * 16 * sc + px(hsway)), Math.round(hy + 6 * sc + ph * 12 * sc), sc * 1.5, sc * 2.5);
    }
    ctx.globalAlpha = o.alpha ?? 1;
  }
  return { hx, hy };
}
function drawBubble(ty, x, y) {
  const str = ty.text, lines = (str.match(/[\n\r]/g) || []).length + 1;
  const w = 202, h = Math.max(50, 22 + lines * 20);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 1, y + 16); ctx.lineTo(x - 16, y + 24); ctx.lineTo(x + 1, y + 32); ctx.fill();
  drawTyped(str, ty.n, x + 13, y + 11, 20, FONT_BUBBLE, '#000');
}
function drawButtonIcon(kind, x, y, c) {
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'square';
  ctx.beginPath();
  if (kind === 'fight') { ctx.moveTo(x - 7, y + 7); ctx.lineTo(x + 7, y - 7); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x - 1, y + 7); }
  else if (kind === 'act') { ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x - 3, y); ctx.moveTo(x + 3, y - 2); ctx.lineTo(x + 3, y); }
  else if (kind === 'item') { ctx.rect(x - 7, y - 4, 14, 11); ctx.moveTo(x - 3, y - 4); ctx.lineTo(x - 3, y - 8); ctx.lineTo(x + 3, y - 8); ctx.lineTo(x + 3, y - 4); }
  else { ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); }
  ctx.stroke();
}
function drawButtons(active, sel) {
  for (let i = 0; i < 4; i++) {
    const bt = BTN[i], on = active && i === sel, c = on ? COL.yellow : COL.orange;
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.strokeRect(bt.x + 1.5, 433.5, 107, 39);
    if (on && ['menu', 'finalMenu'].includes(B.phase)) drawSoul(bt.x + 20, 453);
    else drawButtonIcon(bt.icon, bt.x + 20, 453, c);
    txt(bt.label, bt.x + 70, 454, { font: F(19, F_UI), color: c, align: 'center', base: 'middle', maxW: 70 });
  }
}
function drawHUD() {
  const y = 402;
  txt((save.name || 'FRISK').toUpperCase(), 30, y, { font: F(18, F_UI), maxW: 96 });
  txt('LV 19', 138, y, { font: F(18, F_UI) });
  txt('HP', 236, y + 4, { font: F(11, F_UI) });
  const bx = 262, bw = P.max * 1.2;
  ctx.fillStyle = COL.hpBack; ctx.fillRect(bx, y, bw, 20);
  const good = Math.max(0, P.hp - P.kr);
  ctx.fillStyle = COL.yellow; ctx.fillRect(bx, y, good * 1.2, 20);
  ctx.fillStyle = COL.kr; ctx.fillRect(bx + good * 1.2, y, Math.max(0, P.hp - good) * 1.2, 20);
  txt('KR', bx + bw + 10, y + 4, { font: F(11, F_UI) });
  txt(`${Math.max(0, Math.ceil(P.hp))} / ${P.max}`, bx + bw + 38, y, { font: F(18, F_UI), color: P.kr > 0 ? COL.kr : '#fff' });
}
function drawFightTarget(fb) {
  const b = B.box, cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2, rx = (b.r - b.l) / 2 - 12, ry = (b.b - b.t) / 2 - 10;
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = i === 3 ? '#00c000' : '#fff';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * (1 - i * 0.24), ry * (1 - i * 0.24), 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#00c000'; ctx.fillRect(cx - 2, b.t + 8, 4, b.b - b.t - 16);
  if (!fb) return;
  const blink = fb.stop && fb.hit && Math.floor(fb.t * 16) % 2 === 0;
  if (fb.stop && !fb.hit) return;
  ctx.fillStyle = blink ? '#000' : '#fff'; ctx.fillRect(fb.x - 7, b.t + 4, 14, b.b - b.t - 8);
  ctx.fillStyle = blink ? '#fff' : '#000'; ctx.fillRect(fb.x - 3, b.t + 9, 6, b.b - b.t - 18);
}
function drawFx() {
  for (const f of B.fx) {
    if (f.kind === 'miss') txt('MISS', f.x, f.y - f.t * 10, { font: F(30, F_UI), color: '#c0c0c0', align: 'center' });
    else if (f.kind === 'dmg') {
      const y = Math.min(f.y, B.p2 ? 30 : 22);
      ctx.font = F(f.crit ? 40 : 34, F_UI); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(String(f.val), f.x, y);
      ctx.fillStyle = f.crit ? COL.yellow : COL.red; ctx.fillText(String(f.val), f.x, y);
      if (f.crit) txt('CRITIQUE !', f.x, y + 44, { font: F(16, F_UI), color: COL.yellow, align: 'center' });
      ctx.textAlign = 'left';
    } else if (f.kind === 'slash') {
      const p = clamp(f.t / 0.3, 0, 1);
      ctx.strokeStyle = COL.red; ctx.lineWidth = 8 * (1 - clamp((f.t - 0.3) / 0.2, 0, 1)) + 1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(SANS_X + 40, 80); ctx.lineTo(SANS_X + 40 - 80 * p, 80 + 110 * p); ctx.stroke();
    } else if (f.kind === 'dust') {
      ctx.fillStyle = `rgba(255,255,255,${1 - f.t / f.life})`; ctx.fillRect(f.x, f.y, 3, 3);
    }
  }
}
function drawEnemyBar() {
  const hb = B.hpBar; if (!hb) return;
  const v = lerp(hb.from, hb.to, ease(hb.t / 0.9)) / P2_MAX, x = SANS_X - 60, y = 74;
  ctx.fillStyle = '#404040'; ctx.fillRect(x, y, 120, 13);
  ctx.fillStyle = '#00ff00'; ctx.fillRect(x, y, 120 * v, 13);
}
// Deux Gaster Blasters géants qui flottent de chaque côté de Sans en phase 2.
function drawGuardians(alpha) {
  const t = S.t, sz = 3.2;
  for (const side of [-1, 1]) {
    const x = SANS_X + side * 175, y = 120 + Math.sin(t * 1.8 + side) * 9;
    const open = 0.35 + 0.3 * Math.sin(t * 2.6 + side);
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 110);
    g.addColorStop(0, 'rgba(255,30,60,0.35)'); g.addColorStop(1, 'rgba(255,30,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 110, y - 110, 220, 220);
    ctx.translate(x, y); ctx.rotate(-side * (0.32 + Math.sin(t * 1.3) * 0.05));
    ctx.drawImage(SPR.blJaw, -20 * sz, (15 + open * 7) * sz, 40 * sz, 10 * sz);
    ctx.drawImage(SPR.blTopOpen, -20 * sz, -17 * sz, 40 * sz, 34 * sz);
    for (const [ex, col] of [[-6.5, side < 0 ? '80,200,255' : '255,40,60'], [6.5, side < 0 ? '255,40,60' : '80,200,255']]) {
      const eg = ctx.createRadialGradient(ex * sz, -4.5 * sz, 0, ex * sz, -4.5 * sz, 7 * sz);
      eg.addColorStop(0, `rgba(${col},0.95)`); eg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = eg; ctx.fillRect((ex - 7) * sz, -11.5 * sz, 14 * sz, 14 * sz);
    }
    // énergie aspirée dans la gueule
    const my = (17 + open * 4) * sz;
    for (let i = 0; i < 8; i++) {
      const ph = (t * 1.5 + i / 8) % 1, a = i * 0.8 + t;
      ctx.fillStyle = i % 2 ? '#fff' : '#ff4060'; ctx.globalAlpha = alpha * ph;
      ctx.fillRect(Math.cos(a) * 40 * (1 - ph), my + 12 + Math.sin(a) * 30 * (1 - ph), 3, 3);
    }
    ctx.restore();
  }
}
function renderBattle() {
  const b = B.box, s = B.sans, ph = B.phase;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (s.p2) {
    const gr = ctx.createRadialGradient(SANS_X, 160, 10, SANS_X, 160, 260);
    gr.addColorStop(0, `rgba(170,0,30,${0.35 + 0.1 * Math.sin(S.t * 3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 250);
  }
  if (s.p2) drawGuardians(ph === 'rise' ? clamp((B.timer - 1.2) / 1.5, 0, 1) : s.alpha);
  if (s.alpha > 0) {
    ctx.globalAlpha = s.alpha;
    const so = { eyes: sansEyes(), sweat: s.sweat, arm: s.arm, armT: s.armT, hurt: s.hurt, p2: s.p2, aura: s.p2 || (ph === 'rise' && B.timer > 0.8), still: s.sleep || s.hurt, alpha: s.alpha,
      headDY: s.sleep ? 2 + Math.round(Math.sin(S.t * 1.5)) : 0, talking: ph === 'talk' && !B.bubble.pageDone };
    if (s.dodgeT >= 0 && s.dodgeT < 1.05) for (const k of [0.66, 0.33]) {
      ctx.globalAlpha = 0.22 * s.alpha; drawSans(SANS_X + s.dx * k, SANS_BASE, 2, { ...so, alpha: 0.22 }); ctx.globalAlpha = s.alpha;
    }
    drawSans(SANS_X + s.dx, SANS_BASE, 2, so);
    ctx.globalAlpha = 1;
    if (s.sleep && !s.hurt) for (let i = 0; i < 3; i++) {
      const ph2 = (S.t * 0.5 + i / 3) % 1;
      ctx.globalAlpha = 1 - ph2;
      txt('Z', SANS_X + 40 + ph2 * 30, 90 - ph2 * 40, { font: F(14 + ph2 * 10, F_UI) });
      ctx.globalAlpha = 1;
    }
  }
  if (B.fb && B.fb.final && B.fb.hitDone) {
    ctx.fillStyle = '#404040'; ctx.fillRect(SANS_X - 50, 62, 100, 12);
    ctx.fillStyle = '#00ff00'; ctx.fillRect(SANS_X - 50, 62, 100 * s.hp, 12);
  }
  if (s.p2) drawEnemyBar();
  drawFx();
  // boîte
  ctx.fillStyle = '#000'; ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
  ctx.save(); ctx.beginPath(); ctx.rect(b.l, b.t, b.r - b.l, b.b - b.t); ctx.clip();
  for (const bl of B.bullets) if (bl.clip) bl.draw();
  const inBox = ['talk', 'attack', 'special', 'sleep', 'push', 'trap'].includes(ph);
  if (inBox && !(ph === 'trap' && P.hp <= 0)) drawSoul(B.soul.x, B.soul.y, B.soul.mode);
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(b.l - 2.5, b.t - 2.5, b.r - b.l + 5, b.b - b.t + 5);
  for (const bl of B.bullets) if (!bl.clip) bl.draw();
  // contenu de la boîte en phase de menu
  const L = MENU_BOX.l, T = MENU_BOX.t;
  const settled = Math.abs(b.l - MENU_BOX.l) < 2 && Math.abs(b.t - MENU_BOX.t) < 2 && Math.abs(b.r - MENU_BOX.r) < 2;
  if (settled) {
    if (ph === 'menu' || ph === 'narr' || ph === 'finalMenu') drawTyped(B.typer.text, B.typer.n, L + 25, T + 18, 34, FONT_NARR, '#fff');
    const nameCol = B.spareOffer ? COL.yellow : '#fff';
    const opt = (i, label, col = '#fff') => {
      const x = L + 60 + (i % 2) * 245, y = T + 18 + Math.floor(i / 2) * 34;
      txt('* ' + label, x, y, { color: col });
      if (i === B.sub) drawSoul(x - 24, y + 14);
    };
    if (ph === 'fightSel' || ph === 'actSel') opt(0, 'Sans', nameCol);
    if (ph === 'actOpt') opt(0, 'Vérifier');
    if (ph === 'mercySel') opt(0, 'Épargner', nameCol);
    if (ph === 'itemSel') {
      const page = Math.floor(B.sub / 4);
      for (let i = page * 4; i < Math.min(B.items.length, page * 4 + 4); i++) {
        const j = i - page * 4, x = L + 60 + (j % 2) * 245, y = T + 18 + Math.floor(j / 2) * 34;
        txt('* ' + B.items[i].name, x, y);
        if (i === B.sub) drawSoul(x - 24, y + 14);
      }
      txt(`PAGE ${page + 1}`, L + 305, T + 88, { font: F(22, F_TEXT) });
    }
    if (ph === 'fightBar') drawFightTarget(B.fb);
  }
  if (ph === 'talk' || (ph === 'trap')) drawBubble(B.bubble, SANS_X + 64 + s.dx, 62);
  drawHUD();
  drawButtons(['menu', 'fightSel', 'actSel', 'actOpt', 'itemSel', 'mercySel', 'finalMenu'].includes(ph), B.btn);
  if (B.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${B.flash * 3})`; ctx.fillRect(0, 0, W, H); }
  if (B.practice) txt('ENTRAÎNEMENT · X pour quitter', 320, 8, { font: F(14, F_UI), color: COL.grey, align: 'center' });
}

// ---------- Hall du jugement ----------
const HALL = { len: 1700, sansX: 1340 };
function startHall() {
  S.scene = 'hall'; S.fade = 1.2;
  S.hall = { px: 120, walkT: 0, moving: false, talk: false, typer: new Typer(), cam: 0, idle: 0 };
  Snd.stopMusic(0.8);
}
function updateHall(dt) {
  const h = S.hall;
  if (S.fade > 0) S.fade = Math.max(0, S.fade - dt);
  if (!h.talk) {
    const L = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    h.moving = L !== 0;
    h.px = clamp(h.px + L * 125 * dt, 60, HALL.len - 60);
    if (h.moving) { h.walkT += dt; h.idle = 0; } else h.idle += dt;
    if (h.px >= HALL.sansX - 170) {
      h.talk = true; h.moving = false;
      h.typer.set(HALL_LINES, { voice: 'sans', font: F(24, F_SANS), maxW: 500, speed: 24 });
    }
  } else {
    h.typer.update(dt);
    if (h.typer.input()) { startEncounter(h.px - h.cam, 395); return; }
  }
  const target = h.talk ? (h.px + HALL.sansX) / 2 - 320 : h.px - 260;
  h.cam = clamp(lerp(h.cam, target, 1 - Math.pow(0.02, dt)), 0, HALL.len - W);
}
function drawWindow(x) {
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x, 95); ctx.arc(x + 38, 95, 38, Math.PI, 0); ctx.lineTo(x + 76, 300); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e4ac3c'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x + 38, 57); ctx.lineTo(x + 38, 300); ctx.moveTo(x, 170); ctx.lineTo(x + 76, 170); ctx.moveTo(x, 235); ctx.lineTo(x + 76, 235); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 38, 100, 14, 0, Math.PI * 2); ctx.stroke();
}
function renderHall() {
  const h = S.hall, cam = h.cam;
  const gr = ctx.createLinearGradient(0, 0, 0, 340); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(1, '#e9b443');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 340);
  for (let i = 0; i < 10; i++) {
    const wx = 60 + i * 230 - cam * 0.9;
    if (wx > -120 && wx < W + 40) drawWindow(wx);
    const px = wx + 140;
    if (px > -60 && px < W + 20) {
      ctx.fillStyle = '#d49b30'; ctx.fillRect(px, 0, 44, 342);
      ctx.fillStyle = '#b8811f'; ctx.fillRect(px + 36, 0, 8, 342); ctx.fillStyle = '#f2c560'; ctx.fillRect(px, 0, 5, 342);
    }
  }
  ctx.fillStyle = '#c8962f'; ctx.fillRect(0, 340, W, 140);
  for (let row = 0; row < 5; row++) {
    const y = 340 + row * 28;
    for (let c = Math.floor(cam / 40) - 1; c < Math.floor((cam + W) / 40) + 2; c++) {
      ctx.fillStyle = (c + row) % 2 ? '#d9aa42' : '#c08e2b'; ctx.fillRect(c * 40 - cam, y, 40, 28);
    }
  }
  ctx.fillStyle = 'rgba(255,250,220,0.16)';
  for (let i = 0; i < 10; i++) {
    const wx = 60 + i * 230 - cam * 0.9;
    if (wx < -260 || wx > W + 40) continue;
    ctx.beginPath(); ctx.moveTo(wx, 120); ctx.lineTo(wx + 76, 120); ctx.lineTo(wx + 210, 480); ctx.lineTo(wx + 120, 480); ctx.fill();
  }
  const sansEyes = !(h.talk && h.typer.eyes === 'dark');
  dImg(sansEyes ? SPR.sansOW : SPR.sansOWdark, HALL.sansX - cam - 30, 352, 2, true);
  const fr = h.moving ? 1 + (Math.floor(h.walkT * 6) % 2) : 0;
  dImg(SPR.frisk[fr], h.px - cam - 20, 360, 2);
  for (let i = 0; i < 6; i++) {
    const fx = 380 + i * 560 - cam * 1.45;
    if (fx < -100 || fx > W + 10) continue;
    ctx.fillStyle = '#3d2806'; ctx.fillRect(fx, 0, 86, H);
    ctx.fillStyle = '#5a3c0c'; ctx.fillRect(fx + 6, 0, 10, H);
  }
  if (h.talk) {
    ctx.fillStyle = '#000'; ctx.fillRect(32, 14, 576, 150);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(34.5, 16.5, 571, 145);
    drawTyped(h.typer.text, h.typer.n, 60, 40, 34, F(24, F_SANS), '#fff');
  } else if (h.idle > 4 && h.px < 400) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.t * 4);
    txt('→', 600, 440, { font: F(28, F_UI), color: '#3d2806' }); ctx.globalAlpha = 1;
  }
}

// ---------- Transition de rencontre ----------
function startEncounter(x, y) { S.scene = 'enc'; S.enc = { t: 0, x, y, beeps: 0 }; Snd.stopMusic(0); }
function updateEnc(dt) {
  const e = S.enc; e.t += dt;
  const n = Math.min(3, Math.floor(e.t / 0.16) + 1);
  while (e.beeps < n && e.t < 0.5) { e.beeps++; Snd.beep(); }
  if (e.t >= 0.55 && !e.whoosh) { e.whoosh = true; Snd.whoosh(); }
  if (e.t > 1.05) startBattle();
}
function renderEnc() {
  const e = S.enc;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (e.t < 0.55) {
    dImg(SPR.frisk[0], e.x - 20, 360, 2);
    if (Math.floor(e.t / 0.08) % 2 === 0) drawSoul(e.x, e.y);
  } else {
    const p = ease((e.t - 0.55) / 0.45);
    drawSoul(lerp(e.x, 320, p), lerp(e.y, boxRect(280, 135).cy, p));
  }
}

// ---------- Game over ----------
function updateGO(dt) {
  const g = S.go; g.t += dt;
  if (g.t > 0.75 && g.step === 0) { g.step = 1; Snd.crack(); }
  if (g.t > 1.9 && g.step === 1) {
    g.step = 2; Snd.shatter();
    for (let i = 0; i < 6; i++) g.shards.push({ x: g.x, y: g.y, vx: rand(-140, 140), vy: rand(-260, -60), r: rand(0, 6) });
  }
  for (const s of g.shards) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 520 * dt; s.r += dt * 10; }
  if (g.t > 3.2 && g.step === 2) { g.step = 3; Snd.music('gameover'); }
  if (g.t > 4.9 && g.step === 3) { g.step = 4; g.typer.set(g.lines, { voice: 'deep', speed: 14, font: FONT_NARR, maxW: 440 }); }
  if (g.step === 4) { g.typer.update(dt); if (g.typer.input()) { g.step = 5; g.out = 0; } }
  if (g.step === 5) { g.out += dt; if (g.out > 1.0) startBattle(); }
}
function renderGO() {
  const g = S.go;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (g.step === 0) drawSoul(g.x, g.y);
  else if (g.step === 1) { dImg(SPR.heartL, g.x - 11, g.y - 6, 1); dImg(SPR.heartR, g.x - 5, g.y - 6, 1); }
  else {
    ctx.fillStyle = COL.red;
    for (const s of g.shards) { const f = Math.floor(s.r) % 2; ctx.fillRect(s.x, s.y, f ? 4 : 2, f ? 2 : 4); ctx.fillRect(s.x + 1, s.y + 1, 2, 2); }
  }
  if (g.step >= 3) {
    const a = clamp((g.t - 3.2) / 1.5, 0, 1) * (g.step === 5 ? 1 - clamp(g.out, 0, 1) : 1);
    ctx.globalAlpha = a;
    pixText('GAME', 320, 50, 13, '#fff'); pixText('OVER', 320, 160, 13, '#fff');
    if (g.step >= 4) drawTyped(g.typer.text, g.typer.n, 120, 320, 38, FONT_NARR, '#fff');
    ctx.globalAlpha = 1;
  }
}

// ---------- Écran titre, nom, entraînement, crédits ----------
function titleItems() {
  return [save.deaths > 0 ? 'Continuer' : 'Commencer', 'Entraînement', 'Difficulté : ' + (save.easy ? 'Facile' : 'Normale'), save.name ? 'Changer de nom' : 'Choisir un nom'];
}
function startTitle() { S.scene = 'title'; S.ti = S.ti || { sel: 0 }; S.fade = 0.8; Snd.music('title'); }
function updateTitle(dt) {
  const ti = S.ti, n = 4;
  if (S.fade > 0) S.fade = Math.max(0, S.fade - dt);
  if (hit('up')) { ti.sel = (ti.sel + n - 1) % n; Snd.move(); }
  if (hit('down')) { ti.sel = (ti.sel + 1) % n; Snd.move(); }
  if (hit('z')) {
    Snd.select();
    if (ti.sel === 0) { if (!save.name) startName('play'); else if (save.deaths > 0) startBattle(); else startHall(); }
    else if (ti.sel === 1) { S.scene = 'practice'; S.pr = S.pr || { sel: 0, msg: '' }; S.pr.msg = ''; }
    else if (ti.sel === 2) { save.easy = !save.easy; persist(); }
    else startName('title');
  }
}
function renderTitle() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  pixText('JUGEMENT', 320, 26, 6, '#fff');
  pixText('FINAL', 320, 76, 4, '#fff');
  txt('fan game non officiel inspiré d\'UNDERTALE', 320, 112, { font: F(16, F_TEXT), color: COL.grey, align: 'center' });
  drawSans(320, 292, 1.1, { eyes: Math.floor(S.t) % 7 === 6 ? 'wink' : 'normal' });
  const items = titleItems();
  items.forEach((it, i) => {
    const y = 314 + i * 32, on = i === S.ti.sel;
    txt(it, 320, y, { font: F(24, F_TEXT), color: on ? COL.yellow : '#fff', align: 'center' });
    if (on) { ctx.font = F(24, F_TEXT); drawSoul(320 - ctx.measureText(it).width / 2 - 22, y + 14); }
  });
  const hint = isTouch ? 'Croix : bouger · Z : valider · X : retour' : '↑↓← → bouger · Z / Entrée valider · X / Maj retour · M son · Échap pause';
  txt(hint, 320, 450, { font: F(13, F_TEXT), color: COL.grey, align: 'center', maxW: 600 });
}

const NAME_SPECIAL = {
  sans: { msg: 'non.', block: true }, papyru: { msg: 'JE L\'AUTORISE !!!' }, frisk: { msg: 'ATTENTION : ce nom va\nrendre ta vie infernale.' },
  chara: { msg: 'Le vrai nom.' }, toriel: { msg: 'Je pense que tu devrais\nchoisir ton propre nom, mon enfant.', block: true },
  asgore: { msg: 'Tu ne peux pas.', block: true }, flowey: { msg: 'J\'ai déjà CE nom.', block: true },
  undyne: { msg: 'Trouve-toi TON nom !', block: true }, alphys: { msg: 'N-ne fais pas ça.', block: true },
  grillb: { msg: '...' }, temmie: { msg: 'hOI !' }, napsta: { msg: '.......\n(il est trop timide pour refuser.)' },
};
function nameItems() {
  const it = [];
  const up = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lo = up.toLowerCase();
  [...up].forEach((c, i) => it.push({ c, x: 120 + (i % 7) * 64, y: 128 + Math.floor(i / 7) * 34 }));
  [...lo].forEach((c, i) => it.push({ c, x: 120 + (i % 7) * 64, y: 278 + Math.floor(i / 7) * 34 }));
  it.push({ act: 'quit', label: 'Quitter', x: 120, y: 430 }, { act: 'del', label: 'Effacer', x: 270, y: 430 }, { act: 'done', label: 'Terminé', x: 430, y: 430 });
  return it;
}
const NAME_ITEMS = nameItems();
function startName(next) { S.scene = 'name'; S.nm = { sel: 0, name: save.name || '', phase: 'pick', next, t: 0, csel: 1 }; }
function spatialNav(items, idx) {
  const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  for (const k in dirs) {
    if (!hit(k)) continue;
    const [dx, dy] = dirs[k], a = items[idx];
    let best = -1, bd = 1e9;
    items.forEach((b, i) => {
      const vx = b.x - a.x, vy = b.y - a.y, along = vx * dx + vy * dy;
      if (along <= 4) return;
      const d = along + Math.abs(vx * dy + vy * dx) * 2.5;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { idx = best; Snd.move(); }
  }
  return idx;
}
function updateName(dt) {
  const nm = S.nm; nm.t += dt;
  if (nm.phase === 'pick') {
    nm.sel = spatialNav(NAME_ITEMS, nm.sel);
    if (hit('x')) { nm.name = nm.name.slice(0, -1); Snd.move(); }
    if (hit('z')) {
      const it = NAME_ITEMS[nm.sel];
      if (it.c) { if (nm.name.length < 6) { nm.name += it.c; Snd.select(); } }
      else if (it.act === 'del') { nm.name = nm.name.slice(0, -1); Snd.move(); }
      else if (it.act === 'quit') { startTitle(); }
      else if (nm.name.length) { nm.phase = 'confirm'; nm.t = 0; nm.csel = 1; nm.sp = NAME_SPECIAL[nm.name.toLowerCase()]; Snd.select(); }
    }
  } else if (nm.phase === 'confirm') {
    const block = nm.sp && nm.sp.block;
    if (!block) { if (hit('left')) { nm.csel = 0; Snd.move(); } if (hit('right')) { nm.csel = 1; Snd.move(); } }
    if (hit('x')) { nm.phase = 'pick'; return; }
    if (hit('z')) {
      if (block || nm.csel === 0) { nm.phase = 'pick'; Snd.move(); return; }
      save.name = nm.name; persist();
      nm.phase = 'flash'; nm.t = 0; Snd.cymbal();
    }
  } else if (nm.phase === 'flash') {
    if (nm.t > 2.6) { if (nm.next === 'play') startHall(); else startTitle(); }
  }
}
function renderName() {
  const nm = S.nm;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (nm.phase === 'pick') {
    txt('Nomme l\'humain tombé.', 320, 40, { font: F(28, F_TEXT), align: 'center' });
    txt(nm.name, 250, 82, { font: F(28, F_TEXT) });
    NAME_ITEMS.forEach((it, i) => {
      const on = i === nm.sel, col = on ? COL.yellow : '#fff';
      if (it.c) txt(it.c, it.x + rand(-0.8, 0.8), it.y + rand(-0.8, 0.8), { font: F(26, F_TEXT), color: col });
      else txt(it.label, it.x, it.y, { font: F(26, F_TEXT), color: col });
    });
  } else {
    const p = clamp(nm.t / 3, 0, 1), size = Math.round(28 + 52 * p);
    const msg = nm.sp ? nm.sp.msg : 'Ce nom est-il correct ?';
    msg.split('\n').forEach((l, i) => txt(l, 320, 40 + i * 34, { font: F(28, F_TEXT), align: 'center' }));
    txt(nm.name, 320 + rand(-0.6, 0.6), 160 + p * 70, { font: F(size, F_TEXT), align: 'center' });
    if (nm.phase === 'confirm') {
      if (nm.sp && nm.sp.block) txt('Retour', 320, 420, { font: F(28, F_TEXT), color: COL.yellow, align: 'center' });
      else { txt('Non', 150, 420, { font: F(28, F_TEXT), color: nm.csel === 0 ? COL.yellow : '#fff' }); txt('Oui', 450, 420, { font: F(28, F_TEXT), color: nm.csel === 1 ? COL.yellow : '#fff' }); }
    }
    if (nm.phase === 'flash') { ctx.fillStyle = `rgba(255,255,255,${clamp(nm.t / 1.6, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
  }
}
function updatePractice() {
  const pr = S.pr, n = ATK_LIST.length;
  pr.sel = gridNav(n, 2, pr.sel);
  if (hit('x')) { startTitle(); return; }
  if (hit('z')) { Snd.select(); startBattle(ATK_LIST[pr.sel][0]); }
}
function renderPractice() {
  const pr = S.pr;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  txt('ENTRAÎNEMENT', 320, 30, { font: F(28, F_UI), align: 'center' });
  txt('Choisis une attaque. Tes PV sont restaurés à chaque essai.', 320, 72, { font: F(16, F_TEXT), color: COL.grey, align: 'center' });
  ATK_LIST.forEach(([, label], i) => {
    const x = 90 + (i % 2) * 260, y = 110 + Math.floor(i / 2) * 36, on = i === pr.sel;
    txt(label, x, y, { font: F(24, F_TEXT), color: on ? COL.yellow : '#fff' });
    if (on) drawSoul(x - 22, y + 14);
  });
  if (pr.msg) txt(pr.msg, 320, 410, { font: F(20, F_TEXT), color: pr.msgOk ? COL.yellow : COL.red, align: 'center' });
  txt('Z : lancer · X : retour', 320, 450, { font: F(14, F_TEXT), color: COL.grey, align: 'center' });
}
function updateCredits(dt) {
  S.cr.t += dt;
  if (S.cr.t > 2 && hit('z')) { S.ti = { sel: 0 }; startTitle(); }
}
function renderCredits() {
  const c = S.cr, a = clamp(c.t / 2, 0, 1);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  pixText('FIN', 320, 50, 10, '#fff');
  const m = Math.floor(c.time / 60), s = Math.floor(c.time % 60);
  const lines = [
    `Morts avant la victoire : ${c.deaths}`,
    `Coups encaissés pendant ce combat : ${c.hits}`,
    `Durée du combat : ${m} min ${String(s).padStart(2, '0')} s`,
  ];
  lines.forEach((l, i) => txt(l, 320, 170 + i * 36, { font: F(22, F_TEXT), align: 'center' }));
  txt('JUGEMENT FINAL — fan game non officiel', 320, 320, { font: F(18, F_TEXT), color: COL.yellow, align: 'center' });
  txt('Hommage au combat contre Sans d\'UNDERTALE (Toby Fox).', 320, 348, { font: F(16, F_TEXT), color: COL.grey, align: 'center' });
  txt('Sprites, musiques et dialogues recréés de zéro.', 320, 372, { font: F(16, F_TEXT), color: COL.grey, align: 'center' });
  if (c.t > 2) txt('[Z] retour au titre', 320, 430, { font: F(18, F_TEXT), align: 'center' });
  ctx.globalAlpha = 1;
}

// ---------- Boucle ----------
function update(dt) {
  S.t += dt;
  if (hit('mute')) { Snd.toggleMute(); S.toast = { text: Snd.muted ? 'Son coupé' : 'Son activé', t: 1.4 }; }
  if (hit('full')) { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* plein écran indisponible */ } }
  if (hit('esc') && (S.scene === 'battle' || S.scene === 'hall')) { S.paused = !S.paused; if (S.paused) Snd.suspend(); else Snd.resume(); }
  if (S.toast) { S.toast.t -= dt; if (S.toast.t <= 0) S.toast = null; }
  if (S.paused) { if (hit('z')) { S.paused = false; Snd.resume(); } return; }
  if (S.shake > 0) S.shake -= dt;
  switch (S.scene) {
    case 'boot': if (hit('z') || hit('x')) { Snd.init(); startTitle(); } break;
    case 'title': updateTitle(dt); break;
    case 'name': updateName(dt); break;
    case 'hall': updateHall(dt); break;
    case 'enc': updateEnc(dt); break;
    case 'battle': updateBattle(dt); break;
    case 'gameover': updateGO(dt); break;
    case 'practice': updatePractice(dt); break;
    case 'credits': updateCredits(dt); break;
  }
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const sh = S.shake > 0 ? 4 : 0;
  ctx.setTransform(scale, 0, 0, scale, rand(-sh, sh) * scale, rand(-sh, sh) * scale);
  ctx.imageSmoothingEnabled = false;
  switch (S.scene) {
    case 'boot':
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(S.t * 3);
      txt(isTouch ? '[ Touche l\'écran pour commencer ]' : '[ Appuie sur Z ou Entrée ]', 320, 230, { font: F(22, F_TEXT), align: 'center' });
      ctx.globalAlpha = 1;
      txt('Mets le son 🎧', 320, 270, { font: F(16, F_TEXT), color: COL.grey, align: 'center' });
      break;
    case 'title': renderTitle(); break;
    case 'name': renderName(); break;
    case 'hall': renderHall(); break;
    case 'enc': renderEnc(); break;
    case 'battle': renderBattle(); break;
    case 'gameover': renderGO(); break;
    case 'practice': renderPractice(); break;
    case 'credits': renderCredits(); break;
  }
  if (S.fade > 0 && S.scene !== 'name') { ctx.fillStyle = `rgba(0,0,0,${clamp(S.fade, 0, 1)})`; ctx.fillRect(-10, -10, W + 20, H + 20); }
  if (S.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
    txt('PAUSE', 320, 200, { font: F(36, F_UI), align: 'center' });
    txt('Échap ou Z pour reprendre', 320, 250, { font: F(18, F_TEXT), color: COL.grey, align: 'center' });
  }
  if (S.toast) txt(S.toast.text, 630, 8, { font: F(14, F_TEXT), color: COL.grey, align: 'right' });
}
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= DT) { update(DT); keysHit.clear(); acc -= DT; }
  render();
  requestAnimationFrame(frame);
}
// Accès de débogage (console) : window.__jf
window.__jf = { S, P, save, get B() { return B; }, startBattle, startHall, startAttack: (n, f) => startAttack(n, f || toMenu), enemyTurn, finalSequence, die };
function boot() {
  buildSprites(); setupTouch(); resize();
  requestAnimationFrame(t => { last = t; frame(t); });
}
const fontsReady = document.fonts && document.fonts.load
  ? Promise.race([Promise.all([document.fonts.load(F(20, 'DotGothic16')), document.fonts.load(F(20, 'Silkscreen')), document.fonts.load('bold 16px "Comic Neue"')]), new Promise(r => setTimeout(r, 2500))])
  : Promise.resolve();
fontsReady.catch(() => {}).then(boot);
})();
