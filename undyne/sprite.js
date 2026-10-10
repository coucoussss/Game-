'use strict';
// ============================================================
//  Sprite d'Undyne l'Immortelle, dessiné pixel par pixel.
//  (Fan art original : formes rastérisées sans anticrénelage,
//  puis affichées en x2 comme les sprites de combat d'Undertale.)
// ============================================================
const UndyneSprite = (() => {
  const SW = 150, SH = 128, OY = 8; // OY : marge au-dessus de y=0 (cheveux, pointe de la lance)
  const TH = SH + OY;
  const PAL = {
    K: '#000000', W: '#ffffff', G: '#a0a0a0', g: '#555555', s: '#2a2a2a',
    C: '#4ab8f0', c: '#2373b8', d: '#123c6e',
    R: '#ff2b3c', r: '#b3122a', q: '#5e0616',
    Y: '#fff43c', y: '#d79a00', O: '#ff9a2b',
    B: '#6ef2ff', b: '#1ea4ea', n: '#0b5c9c',
    P: '#3a0010', T: '#ffffff',
  };

  // ---------- Petit moteur de pixel art ----------
  class Pix {
    constructor(w = SW, h = SH + OY, oy = OY) { this.w = w; this.h = h; this.oy = oy; this.d = new Array(w * h).fill(null); }
    set(x, y, c) { x = Math.floor(x); y = Math.floor(y) + this.oy; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    get(x, y) { y += this.oy; return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]; }
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
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
      }
      return this;
    }
    ellipse(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(x, y, c);
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
    map(rows, ox, oy) {
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') this.set(ox + i, oy + j, row[i]); });
      return this;
    }
    // Ajoute un contour d'une couleur autour de la silhouette (à l'extérieur).
    outline(c, diag = false) {
      const add = [];
      for (let y = -this.oy; y < this.h - this.oy; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        let hit = this.get(x - 1, y) !== null || this.get(x + 1, y) !== null || this.get(x, y - 1) !== null || this.get(x, y + 1) !== null;
        if (!hit && diag) hit = this.get(x - 1, y - 1) !== null || this.get(x + 1, y - 1) !== null || this.get(x - 1, y + 1) !== null || this.get(x + 1, y + 1) !== null;
        if (hit) add.push(x, y);
      }
      for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
      return this;
    }
    // Contour intérieur : les pixels de bord de la forme prennent la couleur c.
    edge(c) {
      const add = [];
      for (let y = -this.oy; y < this.h - this.oy; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) === null) continue;
        if (this.get(x - 1, y) === null || this.get(x + 1, y) === null || this.get(x, y - 1) === null || this.get(x, y + 1) === null) add.push(x, y);
      }
      for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
      return this;
    }
    over(o) { for (let i = 0; i < this.d.length; i++) if (o.d[i] !== null) this.d[i] = o.d[i]; return this; }
    canvas() {
      const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
      const cx = cv.getContext('2d'), img = cx.createImageData(this.w, this.h);
      for (let i = 0; i < this.d.length; i++) {
        const c = this.d[i]; if (c === null) continue;
        const hex = PAL[c] || c, v = parseInt(hex.slice(1), 16);
        img.data[i * 4] = v >> 16; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      return cv;
    }
  }
  // Une pièce d'armure : forme noire, contour blanc, puis détails.
  function plate(layer, draw, detail) {
    const p = new Pix(); draw(p); p.outline('W');
    if (detail) detail(p);
    layer.over(p);
  }
  const mirror = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]);

  // ---------- Construction des calques ----------
  const CX = 100;
  function buildHair() {
    const L = new Pix();
    // Queue de cheval : une longue crinière en flammèches qui flotte vers la gauche.
    const mane = [
      [104, 1], [100, -4], [92, -7], [82, -7], [72, -5], [62, -2], [52, 1], [42, 5], [32, 10], [22, 16], [12, 22], [2, 28],
      [10, 29], [3, 36], [15, 33], [10, 42], [23, 36], [20, 47], [32, 39], [32, 50], [43, 41], [45, 50],
      [54, 39], [58, 46], [64, 35], [71, 38], [76, 28], [86, 22], [90, 12],
    ];
    L.poly(mane, 'R');
    // Mèches sombres le long de la crinière
    const strands = [
      [[96, -2], [80, -2], [64, 2], [48, 7], [34, 13], [20, 21], [8, 28]],
      [[92, 8], [78, 11], [62, 16], [48, 22], [34, 29], [22, 36]],
      [[88, 16], [76, 21], [64, 27], [52, 33], [42, 41]],
      [[94, 3], [70, 6], [56, 11], [42, 16], [28, 22], [16, 29]],
    ];
    for (const s of strands) L.path(s, 'r');
    // Reflets clairs
    L.path([[94, -5], [80, -5], [66, -2], [54, 2]], 'T');
    L.path([[72, 1], [60, 4], [48, 8]], '#ff8090');
    L.outline('q');
    return L;
  }

  function buildLegs() {
    const L = new Pix();
    // Jambes et bottes
    plate(L, p => p.poly([[90, 94], [98, 94], [97, 115], [91, 115]], 'K'), p => { p.line(94, 99, 94, 112, 's'); });
    plate(L, p => p.poly(mirror([[90, 94], [98, 94], [97, 115], [91, 115]], CX), 'K'), p => { p.line(106, 99, 106, 112, 's'); });
    plate(L, p => p.poly([[88, 114], [98, 114], [99, 122], [99, 125], [83, 125], [84, 121]], 'K'), p => { p.line(86, 121, 97, 121, 'g'); });
    plate(L, p => p.poly(mirror([[88, 114], [98, 114], [99, 122], [99, 125], [83, 125], [84, 121]], CX), 'K'), p => { p.line(103, 121, 114, 121, 'g'); });
    // Genouillères pointues
    plate(L, p => p.poly([[94, 101], [97, 104], [94, 109], [91, 104]], 'K'), p => p.set(94, 104, 'G'));
    plate(L, p => p.poly(mirror([[94, 101], [97, 104], [94, 109], [91, 104]], CX), 'K'), p => p.set(106, 104, 'G'));
    // Jupe d'armure en lames, bord inférieur déchiqueté
    plate(L, p => p.poly([[84, 76], [93, 76], [92, 92], [88, 98], [85, 93], [80, 96], [81, 88]], 'K'), p => { p.line(85, 80, 87, 92, 's'); });
    plate(L, p => p.poly(mirror([[84, 76], [93, 76], [92, 92], [88, 98], [85, 93], [80, 96], [81, 88]], CX), 'K'), p => { p.line(115, 80, 113, 92, 's'); });
    plate(L, p => p.poly([[93, 76], [107, 76], [108, 93], [104, 97], [100, 101], [96, 97], [92, 93]], 'K'), p => {
      p.line(100, 79, 100, 97, 'g'); p.line(95, 80, 96, 93, 's'); p.line(105, 80, 104, 93, 's');
    });
    return L;
  }

  function buildTorso() {
    const L = new Pix();
    // Gorgerin
    plate(L, p => p.poly([[89, 37], [111, 37], [113, 42], [87, 42]], 'K'), p => { p.line(90, 40, 110, 40, 'g'); });
    // Plastron
    plate(L, p => p.poly([[86, 41], [114, 41], [117, 52], [113, 64], [109, 73], [91, 73], [87, 64], [83, 52]], 'K'), p => {
      p.path([[88, 64], [100, 67], [112, 64]], 'g');
      p.path([[90, 69], [100, 71], [110, 69]], 'g');
      p.line(100, 67, 100, 72, 's');
      p.path([[86, 46], [89, 58]], 's'); p.path([[114, 46], [111, 58]], 's');
    });
    // Cœur sur le plastron (l'âme qui refuse de céder)
    const heart = new Pix();
    heart.map([
      '.WWW...WWW.',
      'WKKKW.WKKKW',
      'WKRRKWKRRKW',
      'WKRRRKRRRKW',
      'WKRRRRRRRKW',
      '.WKRRRRRKW.',
      '..WKRRRKW..',
      '...WKRKW...',
      '....WKW....',
      '.....W.....',
    ], 95, 48);
    L.over(heart);
    // Ceinture
    plate(L, p => p.rect(89, 73, 22, 4, 'K'), p => { p.rect(97, 73, 6, 4, 'G'); p.rect(98, 74, 4, 2, 'K'); });
    return L;
  }

  function buildPauldron(side) {
    const L = new Pix();
    const m = pts => side < 0 ? pts : mirror(pts, CX);
    // Pointes
    plate(L, p => { p.poly(m([[69, 42], [74, 39], [62, 27]]), 'K'); p.poly(m([[77, 38], [82, 38], [76, 23]]), 'K'); });
    // Épaulière arrondie en trois lames
    plate(L, p => p.ellipse(side < 0 ? 79 : 121, 47, 13.5, 10.5, 'K'), p => {
      const cx = side < 0 ? 79 : 121;
      for (const [dy, c] of [[-2, 'g'], [3, 'g'], [7, 's']]) {
        const pts = [];
        for (let a = -1.2; a <= 1.21; a += 0.2) pts.push([cx + Math.sin(a) * 12.5, 47 + dy + (1 - Math.cos(a)) * 4]);
        p.path(pts, c);
      }
      p.set(cx - 5 * side * -1, 43, 'G'); p.set(cx - 6 * side * -1, 43, 'W');
    });
    return L;
  }

  function buildArmLeft() { // bras droit d'Undyne (à gauche de l'écran), poing serré
    const L = new Pix();
    plate(L, p => p.poly([[70, 54], [80, 55], [80, 67], [71, 67]], 'K'), p => p.line(75, 57, 75, 65, 's'));
    plate(L, p => p.poly([[68, 66], [81, 66], [80, 80], [70, 80]], 'K'), p => { p.line(69, 70, 80, 70, 'g'); p.line(70, 74, 79, 74, 's'); });
    plate(L, p => p.poly([[69, 80], [81, 80], [82, 86], [79, 89], [71, 89], [68, 86]], 'K'), p => {
      p.line(71, 84, 79, 84, 'g'); p.set(73, 86, 'g'); p.set(76, 86, 'g');
    });
    return L;
  }

  function buildArmRight() { // bras gauche d'Undyne, qui tient la lance
    const L = new Pix();
    plate(L, p => p.poly([[120, 55], [130, 54], [131, 66], [121, 67]], 'K'), p => p.line(125, 57, 126, 65, 's'));
    plate(L, p => p.poly([[121, 66], [132, 64], [137, 75], [127, 79]], 'K'), p => { p.line(124, 70, 133, 67, 'g'); });
    return L;
  }

  function buildSpear() {
    const L = new Pix();
    const top = [129.5, 20], bot = [139.5, 126];
    const shaft = new Pix();
    for (let k = 0; k <= 1; k += 0.004) {
      const x = top[0] + (bot[0] - top[0]) * k, y = top[1] + (bot[1] - top[1]) * k;
      shaft.set(x - 1, y, 'b'); shaft.set(x, y, 'B'); shaft.set(x + 1, y, 'n');
    }
    L.over(shaft);
    // Fer de lance
    const head = new Pix();
    head.poly([[128.5, 0], [133.5, 12], [131, 22], [128, 22], [124, 12]], 'b');
    head.path([[128.5, 1], [129, 20]], 'B');
    head.path([[128, 3], [126, 11]], 'W');
    head.edge('n');
    head.set(128, 0, 'B'); head.set(129, 1, 'W');
    L.over(head);
    // Garde
    L.rect(126, 21, 8, 2, 'n').rect(127, 21, 6, 1, 'B');
    // Poing autour de la hampe
    plate(L, p => p.poly([[129, 72], [139, 71], [141, 80], [131, 82]], 'K'), p => { p.line(131, 75, 139, 74, 'g'); p.line(131, 78, 139, 77, 'g'); });
    return L;
  }

  function buildHead() {
    const L = new Pix();
    const hx = 85, hy = 2; // coin haut-gauche de la tête (30 x 34)
    const H = (pts) => pts.map(([x, y]) => [hx + x, hy + y]);
    // Nageoires d'oreille, larges et épineuses
    const fin = [[3, 16], [-4, 5], [-3, 11], [-9, 8], [-6, 14], [-12, 15], [-6, 19], [-10, 24], [-3, 23], [2, 28]];
    for (const left of [true, false]) {
      const f = new Pix(), pts = H(left ? fin : fin.map(([x, y]) => [29 - x, y]));
      f.poly(pts, 'C'); f.edge('c');
      const sp = [[[-4, 6], [3, 19]], [[-9, 9], [3, 20]], [[-12, 15], [3, 21]], [[-10, 23], [3, 23]]];
      for (const [u, v] of sp) {
        const X = q => hx + (left ? q[0] : 29 - q[0]);
        f.line(X(u), hy + u[1], X(v), hy + v[1], 'd');
      }
      f.outline('K');
      L.over(f);
    }
    // Visage
    const face = new Pix();
    face.poly(H([[3, 6], [27, 6], [29.5, 13], [29, 24], [26, 30], [20, 34], [10, 34], [4, 30], [1, 24], [0.5, 13]]), 'C');
    // Ombre sur le côté gauche et sous la mâchoire
    for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) {
      if (face.get(hx + x, hy + y) !== 'C') continue;
      if (x < 4 + Math.max(0, y - 26) * 0.6 || y > 31 || (x > 26 && y > 20)) face.set(hx + x, hy + y, 'c');
    }
    face.edge('K');
    L.over(face);
    // Cache-œil et sangle
    L.poly(H([[2, 13], [13, 12], [13.5, 18], [11, 21], [5, 21.5], [1.5, 18]]), 'K');
    L.line(hx + 12, hy + 13, hx + 24, hy + 6, 'K').line(hx + 13, hy + 13, hx + 25, hy + 6, 'K');
    L.line(hx + 1, hy + 14, hx + 2, hy + 13, 'K');
    L.set(hx + 4, hy + 15, 's'); L.set(hx + 5, hy + 14, 's');
    // Œil : sclère jaune, pupille fendue, paupière furieuse
    L.map([
      '.......KKKK',
      '....KKKKKKK',
      'KKKKKYYYYKK',
      '.KYYYYKKYYK',
      '.KYYYYKKYYK',
      '..KYYYKKYK.',
      '...KKKKKK..',
    ], hx + 16, hy + 12);
    L.set(hx + 21, hy + 15, 'W');
    // Sourire carnassier : deux rangées de crocs
    const m0 = hx + 5, m1 = hx + 25, my = hy + 23;
    L.rect(m0, my, m1 - m0 + 1, 7, 'K');
    L.rect(m0 + 1, my + 1, m1 - m0 - 1, 5, 'P');
    for (let x = m0 + 1, k = 0; x < m1; x++, k++) {
      const q = k % 4;
      L.set(x, my + 1, 'W'); L.set(x, my + 5, 'W');
      if (q <= 2) L.set(x, my + 2, 'W');
      if (q === 1) L.set(x, my + 3, 'W');
      if (q !== 1) L.set(x, my + 4, 'W');
      if (q === 3) L.set(x, my + 3, 'W');
    }
    L.set(m0, my, 'K'); L.set(m1, my + 6, 'K');
    // Commissures relevées
    L.set(m0 - 1, my - 1, 'K'); L.set(m1 + 1, my - 1, 'K');
    // Cheveux sur le crâne : frange en pointes
    const top = new Pix();
    top.poly(H([[1, 13], [0, 6], [4, 1], [10, -2], [18, -2], [25, 0], [29, 5], [30, 13], [27, 9], [26, 12], [23, 7], [21, 11], [18, 6], [14, 10], [12, 6], [9, 12], [7, 7], [4, 12]]), 'R');
    top.path(H([[6, 2], [11, 0], [16, 0]]), 'T');
    top.path(H([[5, 4], [9, 2]]), '#ff8090');
    top.path(H([[20, 1], [25, 4], [27, 8]]), 'r');
    top.path(H([[13, 3], [12, 6]]), 'r');
    top.path(H([[21, 4], [21, 9]]), 'r');
    top.path(H([[3, 6], [4, 11]]), 'r');
    top.outline('q');
    L.over(top);
    return L;
  }

  // ---------- Assemblage ----------
  let parts = null;
  function build() {
    const hair = buildHair(), legs = buildLegs(), torso = buildTorso();
    const pl = buildPauldron(-1), pr = buildPauldron(1);
    const armL = buildArmLeft(), armR = buildArmRight(), spear = buildSpear(), head = buildHead();
    const neck = new Pix().rect(96, 34, 8, 5, 'C').rect(96, 34, 2, 5, 'c');
    parts = {
      hair: hair.canvas(), legs: legs.canvas(), torso: torso.canvas(), neck: neck.canvas(),
      pl: pl.canvas(), pr: pr.canvas(), armL: armL.canvas(), armR: armR.canvas(), spear: spear.canvas(), head: head.canvas(),
    };
    return parts;
  }

  // Dessine Undyne. o = { t, x, y (coin haut-gauche à l'écran), s (échelle), shake, melt, hurt }
  function draw(ctx, o) {
    if (!parts) build();
    const s = o.s || 2, t = o.t || 0;
    const X = Math.round(o.x + (o.shake || 0)), Y = Math.round(o.y);
    const bob = Math.round(Math.sin(t * 2.6) * 1.2 + 0.2);          // respiration
    const hb = Math.round(Math.sin(t * 2.6 - 0.6) * 1.2 + 0.2);      // tête légèrement décalée
    const jit = o.jitter ? (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1)) : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Cheveux : chaque colonne ondule comme un drapeau
    const hair = parts.hair, wind = o.wind || 1;
    for (let x = 0; x < 100; x++) {
      const k = Math.pow(Math.max(0, (100 - x) / 100), 1.2);
      const dy = Math.round(Math.sin(t * 6 * wind + x * 0.13) * 4.5 * k + Math.sin(t * 3.1 + x * 0.05) * 1.5 * k) + hb;
      ctx.drawImage(hair, x, 0, 1, TH, X + x * s, Y + dy * s, s, TH * s);
    }
    if (o.melt > 0) drawMelting(ctx, o, X, Y, s, bob, hb);
    else {
      const L = (img, dx, dy) => ctx.drawImage(img, 0, 0, SW, TH, X + dx * s, Y + dy * s, SW * s, TH * s);
      L(parts.legs, 0, 0);
      L(parts.neck, 0, hb);
      L(parts.torso, jit, bob);
      L(parts.armL, jit, bob + Math.round(Math.sin(t * 2.6 + 1) * 0.6));
      L(parts.spear, 0, bob);
      L(parts.armR, 0, bob);
      L(parts.pl, jit, bob);
      L(parts.pr, jit, bob);
      L(parts.head, jit, hb);
      // Éclat de l'œil
      const ph = (t % 2.2) / 2.2;
      if (ph < 0.25) {
        const ex = X + (106 + jit) * s, ey = Y + (OY + 16 + hb) * s, a = 1 - ph / 0.25, len = (6 + 22 * (ph / 0.25)) * s / 2;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff43c';
        ctx.fillRect(ex - len, ey, len * 2, s);
        ctx.fillRect(ex, ey - len * 0.6, s, len * 1.2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex - s, ey - s, s * 3, s * 3);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // Version « fondue » : chaque colonne coule vers le bas.
  let comp = null;
  function composite(t) {
    if (!parts) build();
    if (!comp) { comp = document.createElement('canvas'); comp.width = SW; comp.height = TH; }
    const c = comp.getContext('2d');
    c.clearRect(0, 0, SW, TH);
    for (const k of ['legs', 'neck', 'torso', 'armL', 'spear', 'armR', 'pl', 'pr', 'head']) c.drawImage(parts[k], 0, 0);
    return comp;
  }
  function drawMelting(ctx, o, X, Y, s, bob) {
    const img = composite(o.t), m = o.melt;
    for (let x = 0; x < SW; x++) {
      const sm = 0.5 + 0.5 * Math.sin(x * 0.21 + 1.3) * Math.cos(x * 0.07 - 0.4);
      const n = Math.abs((Math.sin(x * 12.9898) * 43758.5453) % 1);
      const drip = Math.round(m * (4 + 16 * sm + (n > 0.8 ? 26 * n : 0)) + Math.sin(o.t * 2 + x * 0.3) * m * 1.5);
      ctx.drawImage(img, x, 0, 1, TH, X + x * s, Y + Math.round(bob + drip * 0.45) * s, s, (TH + drip) * s);
    }
  }

  // Pixels actuels (pour l'effet de poussière lors de la disparition)
  function pixels() {
    const img = composite(0);
    const data = img.getContext('2d').getImageData(0, 0, SW, TH).data;
    const out = [];
    for (let y = 0; y < TH; y++) for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4;
      if (data[i + 3] > 0) out.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return out;
  }

  return { draw, build, pixels, composite, SW, SH: TH, PAL, Pix };
})();
