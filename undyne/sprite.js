'use strict';
// ============================================================
//  Sprite d'Undyne l'Immortelle, dessiné pixel par pixel.
//  Fan art original : formes rastérisées sans anticrénelage, ombrage
//  biseauté, puis affichage en x2 comme les sprites de combat d'Undertale.
//  Forme « Immortelle » : plus de cache-œil (l'orbite vide jette un éclat
//  en forme de lance), œil à sclère noire et pupille blanche, queue de
//  cheval qui se termine en trident, nageoires plus pointues, armure
//  sombre à grandes épaulières hérissées, cœurs sur le plastron et les
//  gants blancs à pointes, bottes à bouts pointus.
// ============================================================
const UndyneSprite = (() => {
  const SW = 150, SH = 128, OY = 8, TH = SH + OY, BH = TH + 64;
  const PAL = {
    K: '#000000', W: '#ffffff',
    // armure (du plus sombre au plus clair)
    1: '#15151c', 2: '#26262f', 3: '#3d3d48', 4: '#62626e', 5: '#9a9aa8',
    // gants blancs
    G: '#c9c9d6', g: '#8c8c9c',
    // peau
    L: '#a6e4ff', C: '#4ab8f0', c: '#2a7cc0', d: '#14467e', e: '#0a2448',
    // cheveux
    H: '#ffa0aa', R: '#ff2b3c', m: '#d4122c', r: '#8c0a1e', q: '#3a020c',
    // bouche, cœurs
    P: '#2a000a', h: '#ff1f3d', j: '#7a0014', k: '#ff8096',
  };

  // ---------- Petit moteur de pixel art ----------
  class Pix {
    constructor(w = SW, h = SH + OY, oy = OY) { this.w = w; this.h = h; this.oy = oy; this.d = new Array(w * h).fill(null); }
    set(x, y, c) { x = Math.floor(x); y = Math.floor(y) + this.oy; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    get(x, y) { y += this.oy; return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]; }
    each(fn) { for (let y = -this.oy; y < this.h - this.oy; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.get(x, y)); }
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
    // Contour extérieur
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
    // Bord intérieur
    edge(c, only) {
      const add = [];
      this.each((x, y, v) => {
        if (v === null || (only && v !== only)) return;
        if (this.get(x - 1, y) === null || this.get(x + 1, y) === null || this.get(x, y - 1) === null || this.get(x, y + 1) === null) add.push(x, y);
      });
      for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
      return this;
    }
    // Ombrage biseauté : lumière venant de (lx, ly). lit/shade = couleurs par distance au bord
    // (une entrée peut être une paire [a, b] pour un tramage en damier).
    bevel(base, lit, shade = [], lx = 1, ly = -1) {
      const out = this.d.slice();
      this.each((x, y, v) => {
        if (v !== base) return;
        let col = null;
        for (let k = 1; k <= lit.length; k++) if (this.get(x + lx * k, y + ly * k) === null) { col = lit[k - 1]; break; }
        if (!col) for (let k = 1; k <= shade.length; k++) if (this.get(x - lx * k, y - ly * k) === null) { col = shade[k - 1]; break; }
        if (col) { if (Array.isArray(col)) col = (x + y) & 1 ? col[0] : col[1]; out[(y + this.oy) * this.w + x] = col; }
      });
      this.d = out;
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
  const CX = 100;
  const HS = 1.15, HX = CX - 15 * HS, HY = 36 - 34 * HS; // placement de la tête
  const mirror = (pts, cx = CX) => pts.map(([x, y]) => [2 * cx - x, y]);
  const ARMOR_LIT = ['4', ['3', '2'], '2', ['2', '1']], ARMOR_SH = ['1'];
  // Pièce d'armure : forme noire ombrée, contour blanc, puis détails
  function plate(layer, draw, detail, o = {}) {
    const p = new Pix(); draw(p);
    p.bevel('K', o.lit || ARMOR_LIT, o.shade || ARMOR_SH, o.lx ?? 1, o.ly ?? -1);
    if (detail) detail(p);
    p.outline(o.outline || 'W');
    layer.over(p);
    return p;
  }
  function heart(p, cx, cy, big) { // cœur blanc à âme rouge
    const rows = big ? [
      '.WWWW...WWWW.',
      'WWjjWW.WWjjWW',
      'WjhhjWWWjhhjW',
      'WjhkhhjjhhhjW',
      'WjhkhhhhhhhjW',
      'WjhhhhhhhhhjW',
      '.WjhhhhhhhjW.',
      '..WjhhhhhjW..',
      '...WjhhhjW...',
      '....WjhjW....',
      '.....WjW.....',
      '......W......',
    ] : [
      '.WW.WW.',
      'WhhWhhW',
      'WhkhhhW',
      '.WhhhW.',
      '..WhW..',
      '...W...',
    ];
    p.map(rows, cx - Math.floor(rows[0].length / 2), cy - Math.floor(rows.length / 2));
  }

  // ---------- Cheveux : longue queue de cheval qui se termine en trident ----------
  function buildHair() {
    const L = new Pix();
    const mane = [
      [101, 2], [98, -5], [91, -8], [81, -8], [71, -6], [61, -3], [51, 1], [41, 5], [32, 8], [23, 8],
      [14, 2], [5, -6], [12, 5], [18, 10],
      [8, 9], [0, 11], [10, 14], [18, 15],
      [11, 19], [6, 23], [16, 21], [24, 20],
      [30, 22], [36, 25], [44, 23], [50, 28], [57, 26], [63, 31], [71, 28], [77, 32], [84, 25], [90, 20], [96, 12],
    ];
    L.poly(mane, 'R');
    L.bevel('R', ['H', ['H', 'R']], ['m', ['m', 'r']], 0, -1);
    // mèches qui suivent le mouvement
    const strands = [
      [[96, -3], [82, -3], [68, 0], [54, 5], [40, 10], [28, 13], [16, 12], [8, 3]],
      [[94, 6], [80, 8], [66, 12], [52, 17], [40, 20], [28, 18], [16, 15], [4, 11]],
      [[92, 14], [80, 18], [68, 22], [56, 23], [44, 22], [32, 21], [20, 20], [10, 21]],
      [[88, 19], [78, 25], [70, 27], [62, 28]],
      [[90, 1], [76, 3], [62, 7], [50, 11], [38, 15], [26, 15]],
    ];
    strands.forEach((s, i) => L.path(s, i % 2 ? 'r' : 'm'));
    L.path([[92, -6], [80, -6], [68, -3], [58, 0], [48, 4]], 'W');
    L.path([[76, -4], [64, -1], [52, 3], [42, 7]], 'H');
    L.path([[20, 6], [12, 0], [8, -3]], 'H');
    L.outline('q');
    return L;
  }

  // ---------- Tête ----------
  function buildHead() {
    const L = new Pix();
    const S = HS, hx = HX, hy = HY; // tête 30 x 34 agrandie (S)
    const H = pts => pts.map(([x, y]) => [hx + x * S, hy + y * S]);
    const R = v => Math.round(v);
    // Nageoires d'oreille : membrane + rayons rigides qui dépassent en pointes
    const fin = [[3, 16], [-3, 6], [-3, 11], [-8, 8], [-6, 14], [-11, 15], [-6, 19], [-9, 24], [-3, 23], [2, 28]];
    const rays = [[[-5, 3], [3, 19]], [[-10, 6], [3, 20]], [[-13, 15], [3, 21]], [[-11, 26], [3, 23]]];
    for (const left of [true, false]) {
      const f = new Pix(), X = x => hx + (left ? x : 29 - x) * S;
      f.poly(fin.map(([x, y]) => [X(x), hy + y * S]), 'C');
      f.bevel('C', ['L'], ['c', ['c', 'C']], left ? -1 : 1, -1);
      for (const [u, v] of rays) { f.line(X(u[0]), hy + u[1] * S, X(v[0]), hy + v[1] * S, 'd'); f.set(X(u[0]), hy + u[1] * S, 'L'); }
      f.outline('e');
      L.over(f);
    }
    // Visage
    const face = new Pix();
    face.poly(H([[4, 5], [26, 5], [29, 11], [29.5, 19], [28.5, 25], [24.5, 30.5], [18.5, 34], [11.5, 34], [5.5, 30.5], [1.5, 25], [0.5, 19], [1, 11]]), 'C');
    face.bevel('C', ['L', ['L', 'C']], ['c', 'c', ['c', 'C']], 1, -1);
    face.each((x, y, v) => { if (v && y > hy + 30 * S) face.set(x, y, 'd'); });
    face.edge('e');
    L.over(face);
    // Pommettes / joues
    L.path(H([[3, 21], [5, 24], [5, 27]]), 'c');
    L.path(H([[27, 21], [25, 24]]), 'c');
    // Orbite vide (côté gauche de l'écran) : plus de cache-œil
    L.poly(H([[3, 13.5], [12, 12], [13.5, 15], [12, 18.5], [6.5, 19.5], [3, 17.5]]), 'e');
    L.poly(H([[4.5, 14.5], [11, 13.5], [12, 15.5], [10.5, 17.5], [6.5, 18], [4.5, 16.5]]), 'K');
    L.path(H([[3, 12.5], [12, 11.5]]), 'e');
    L.path(H([[4, 20], [10, 19.5]]), 'd');
    // Sourcil furieux et œil : sclère noire, pupille blanche fendue
    L.path(H([[15, 12], [20, 10], [26, 8]]), 'e'); L.path(H([[15, 11], [20, 9], [26, 7]]), 'd');
    L.map([
      '......eeeee',
      '...eeeKKKKe',
      'eeeKKKKKKKKe',
      '.eKKKKKWWKKe',
      '.eKKKKKWWKKe',
      '..eKKKKWWKe.',
      '...eKKKKKe..',
      '....eeeee...',
    ], R(hx + 15 * S), R(hy + 11 * S));
    L.set(R(hx + 15 * S) + 8, R(hy + 11 * S) + 2, 'W');
    L.path(H([[18, 20], [24, 19]]), 'c');
    // Sourire carnassier : deux rangées de crocs
    const m0 = R(hx + 5 * S), m1 = R(hx + 25 * S), my = R(hy + 23 * S);
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
    for (let x = m0 + 2; x < m1; x += 4) L.set(x, my + 1, 'G');
    L.set(m0 - 1, my - 1, 'K'); L.set(m1 + 1, my - 1, 'K'); L.set(m0 - 2, my - 2, 'e'); L.set(m1 + 2, my - 2, 'e');
    // Cheveux sur le crâne : frange en pointes
    const top = new Pix();
    top.poly(H([[0, 12], [0, 5], [4, 0], [10, -2], [18, -2], [25, 0], [29, 4], [30, 10], [27, 7], [25, 9], [22, 6], [18, 8], [15, 6], [11, 13], [10, 7], [6, 9], [3, 7]]), 'R');
    top.bevel('R', ['H', ['H', 'R']], ['m', 'r'], 0, -1);
    top.path(H([[6, 2], [11, 0], [16, 0]]), 'W');
    top.path(H([[13, 3], [11, 10]]), 'r'); top.path(H([[21, 2], [22, 5]]), 'r'); top.path(H([[3, 4], [1, 9]]), 'r'); top.path(H([[26, 3], [28, 7]]), 'm');
    top.outline('q');
    L.over(top);
    return L;
  }

  // ---------- Corps ----------
  function buildLegs() {
    const L = new Pix();
    const thigh = [[89, 92], [98, 92], [97, 104], [91, 104]];
    const greave = [[90, 103], [98, 103], [97, 112], [91, 112]];
    const boot = [[89, 111], [98, 111], [99, 116], [100, 120], [86, 120], [78, 119], [86, 116]]; // bout pointu vers l'extérieur
    for (const s of [1, -1]) {
      const M = pts => s > 0 ? pts : mirror(pts);
      plate(L, p => p.poly(M(thigh), 'K'));
      plate(L, p => p.poly(M(greave), 'K'), p => p.line(s > 0 ? 94 : 106, 105, s > 0 ? 94 : 106, 110, '3'));
      plate(L, p => p.poly(M(boot), 'K'), p => { p.path(M([[87, 117], [98, 117]]), '3'); });
      // genouillère en pointe
      plate(L, p => p.poly(M([[93.5, 99], [98, 102], [94, 108], [90, 102]]), 'K'), p => p.set(s > 0 ? 94 : 105, 102, '5'));
    }
    // Jupe d'armure en lames pointues
    const side = [[83, 75], [93, 75], [93, 90], [89, 99], [86, 92], [80, 98], [80, 88]];
    for (const s of [1, -1]) plate(L, p => p.poly(s > 0 ? side : mirror(side), 'K'), p => p.path(s > 0 ? [[86, 79], [87, 92]] : [[114, 79], [113, 92]], '2'));
    plate(L, p => p.poly([[93, 75], [107, 75], [108, 92], [104, 96], [100, 103], [96, 96], [92, 92]], 'K'), p => {
      p.line(100, 78, 100, 99, '3'); p.path([[95, 79], [96, 92]], '2'); p.path([[105, 79], [104, 92]], '2');
    });
    return L;
  }
  // Lambeaux de tissu sombre sous la jupe (animés séparément)
  function buildCloth() {
    const L = new Pix();
    const strips = [[84, 88, 11], [89, 92, 14], [96, 95, 12], [104, 95, 13], [110, 92, 14], [115, 88, 10]];
    for (const [x, y, len] of strips) {
      const p = new Pix();
      p.poly([[x - 2.5, y], [x + 2.5, y], [x + 1.5, y + len - 3], [x, y + len], [x - 1.5, y + len - 2]], '2');
      p.bevel('2', ['3'], ['1'], 1, 0);
      p.outline('K');
      L.over(p);
    }
    return L;
  }
  function buildTorso() {
    const L = new Pix();
    // Haut col d'armure
    plate(L, p => { p.poly([[88, 34], [92, 31], [93, 41], [87, 42]], 'K'); p.poly(mirror([[88, 34], [92, 31], [93, 41], [87, 42]]), 'K'); });
    plate(L, p => p.poly([[89, 37], [111, 37], [113, 43], [87, 43]], 'K'), p => p.line(90, 40, 110, 40, '3'));
    // Plastron ajusté
    plate(L, p => p.poly([[86, 41], [114, 41], [118, 50], [115, 62], [110, 74], [90, 74], [85, 62], [82, 50]], 'K'), p => {
      p.path([[87, 63], [100, 66], [113, 63]], '3');
      p.path([[89, 68], [100, 70], [111, 68]], '3');
      p.path([[91, 72], [100, 73], [109, 72]], '2');
      p.line(100, 66, 100, 73, '2');
      p.path([[86, 45], [89, 58]], '2'); p.path([[114, 45], [111, 58]], '2');
      heart(p, 100, 53, true);
    });
    // Ceinture
    plate(L, p => p.rect(89, 73, 22, 4, 'K'), p => { p.rect(97, 73, 6, 4, '5'); p.rect(98, 74, 4, 2, 'K'); });
    return L;
  }
  // Épaulières : dôme + deux lames superposées, pointes recourbées vers le haut
  function buildPauldron(side) {
    const L = new Pix();
    const m = pts => side < 0 ? pts : mirror(pts);
    plate(L, p => p.poly(m([[62, 54], [68, 57], [78, 57], [85, 55], [83, 61], [76, 64], [67, 63], [62, 59]]), 'K'), p => p.path(m([[66, 60], [79, 59]]), '3'));
    plate(L, p => p.poly(m([[61, 49], [69, 53], [80, 53], [87, 51], [86, 56], [78, 59], [68, 59], [61, 55]]), 'K'), p => p.path(m([[65, 55], [81, 55]]), '3'));
    plate(L, p => {
      p.poly(m([[69, 38], [75, 36], [64, 15], [67, 28]]), 'K');   // grande pointe
      p.poly(m([[62, 44], [65, 39], [50, 30], [56, 39]]), 'K');   // pointe extérieure
      p.poly(m([[80, 36], [85, 38], [83, 24]]), 'K');             // petite pointe
    }, p => { p.path(m([[70, 35], [66, 22]]), '4'); p.path(m([[62, 40], [55, 35]]), '4'); });
    plate(L, p => p.poly(m([[89, 41], [85, 37], [77, 34.5], [69, 36], [63, 40], [60, 46], [62, 51], [70, 54], [80, 54], [88, 50]]), 'K'), p => {
      p.path(m([[67, 40], [75, 37], [83, 38]]), '5');
      p.path(m([[64, 47], [72, 50], [82, 49]]), '2');
    }, { lit: ['4', '3', ['3', '2'], '2', ['2', '1']] });
    return L;
  }
  // Bras : brassard à lame tranchante + gant blanc à pointes (et cœur)
  function buildArm(side, raised) {
    const L = new Pix();
    const m = pts => side < 0 ? pts : mirror(pts);
    if (!raised) {
      plate(L, p => p.poly(m([[67, 52], [78, 54], [77, 67], [68, 67]]), 'K'), p => p.path(m([[72, 56], [72, 65]]), '2'));
      plate(L, p => p.poly(m([[66, 66], [79, 66], [78, 80], [68, 80], [60, 70]]), 'K'), p => { p.path(m([[64, 70], [77, 70]]), '3'); p.path(m([[68, 75], [77, 75]]), '2'); });
      glove(L, m, side, 0);
    } else {
      // bras levé, poing au-dessus de l'épaule (pose d'invocation)
      plate(L, p => p.poly(m([[72, 56], [81, 49], [69, 30], [60, 35]]), 'K'), p => p.path(m([[72, 50], [65, 36]]), '2'));
      plate(L, p => p.poly(m([[59, 37], [70, 32], [69, 14], [59, 14], [52, 23]]), 'K'), p => { p.path(m([[56, 24], [69, 22]]), '3'); p.path(m([[60, 30], [69, 28]]), '2'); });
      glove(L, m, side, -82, -8);
    }
    return L;
  }
  function glove(L, m, side, dy, dx = 0) {
    const T = pts => m(pts.map(([x, y]) => [x + dx, y + dy]));
    const g = new Pix();
    g.poly(T([[66, 80], [79, 80], [81, 86], [80, 92], [77, 95], [69, 95], [66, 91], [65, 86]]), 'W');
    g.bevel('W', [], ['G', ['G', 'W']], 1, -1);
    // doigts griffus
    for (const fx of [68, 72, 76]) {
      const claw = new Pix();
      claw.poly(T([[fx - 1, 93], [fx + 2, 93], [fx + 1, 97], [fx - 0.5, 100]]), 'W');
      claw.bevel('W', [], ['G'], 1, -1);
      g.over(claw);
      g.path(T([[fx + 2, 89], [fx + 2, 93]]), 'g');
    }
    g.path(T([[67, 84], [79, 84]]), 'g');
    g.outline('K');
    // pointes sur le dos du gant
    const sp = new Pix();
    for (const tri of [[[66, 81], [69, 81], [60, 76]], [[65, 86], [66, 89], [58, 87]], [[78, 80], [80, 82], [83, 74]]]) sp.poly(T(tri), 'W');
    sp.bevel('W', [], ['G'], 1, -1);
    sp.outline('K');
    L.over(sp); L.over(g);
    const [[hx, hy]] = T([[72.5, 88]]);
    heart(L, Math.round(hx), hy, false);
  }

  // ---------- Assemblage ----------
  let parts = null;
  function build() {
    const neck = new Pix().rect(96, 33, 8, 6, 'C').rect(96, 33, 2, 6, 'c').rect(102, 33, 2, 6, 'L');
    parts = {
      hair: buildHair().canvas(), legs: buildLegs().canvas(), cloth: buildCloth().canvas(), torso: buildTorso().canvas(), neck: neck.canvas(),
      pl: buildPauldron(-1).canvas(), pr: buildPauldron(1).canvas(),
      armL: buildArm(-1, false).canvas(), armR: buildArm(1, false).canvas(), armRup: buildArm(1, true).canvas(),
      head: buildHead().canvas(),
    };
    return parts;
  }

  // Tampons de rendu à l'échelle 1
  const buf = document.createElement('canvas'); buf.width = SW; buf.height = BH;
  const bctx = buf.getContext('2d');
  const buf2 = document.createElement('canvas'); buf2.width = SW; buf2.height = BH;
  const b2 = buf2.getContext('2d');

  // Compose une image à l'échelle 1 dans buf. o = { t, melt, jitter, wind, raise }
  function compose(o) {
    if (!parts) build();
    const t = o.t || 0, c = bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SW, BH);
    c.imageSmoothingEnabled = false;
    const bob = Math.round(Math.sin(t * 2.6) * 1.2 + 0.2);
    const hb = Math.round(Math.sin(t * 2.6 - 0.7) * 1.2 + 0.2);
    const pb = Math.round(Math.sin(t * 2.6 - 0.35) * 1.4 + 0.2);
    const jit = o.jitter ? (Math.random() < 0.6 ? 0 : (Math.random() < 0.5 ? -1 : 1)) : 0;
    const wind = o.wind || 1;
    // cheveux : ondulation de drapeau, plus forte vers le trident
    for (let x = 0; x < 102; x++) {
      const k = Math.pow(Math.max(0, (102 - x) / 102), 1.15);
      const dy = Math.round(Math.sin(t * 6 * wind + x * 0.13) * 4.5 * k + Math.sin(t * 3.1 + x * 0.05) * 1.6 * k) + hb;
      c.drawImage(parts.hair, x, 0, 1, TH, x, dy, 1, TH);
    }
    c.drawImage(parts.legs, 0, 0);
    // lambeaux : chaque colonne flotte un peu
    for (let x = 78; x < 122; x++) {
      const dx = Math.round(Math.sin(t * 4.2 + x * 0.4) * 0.8);
      c.drawImage(parts.cloth, x, 0, 1, TH, x + dx, Math.round(Math.sin(t * 3 + x * 0.3) * 0.6), 1, TH);
    }
    c.drawImage(parts.neck, 0, hb);
    c.drawImage(parts.torso, jit, bob);
    const raise = o.raise || 0;
    c.drawImage(parts.armL, jit, bob + Math.round(Math.sin(t * 2.6 + 1) * 0.8));
    if (raise <= 0.5) c.drawImage(parts.armR, jit, bob + Math.round(Math.sin(t * 2.6 + 2) * 0.8) - Math.round(raise * 4));
    c.drawImage(parts.pl, jit, pb);
    c.drawImage(parts.pr, jit, pb);
    c.drawImage(parts.head, jit, hb);
    if (raise > 0.5) c.drawImage(parts.armRup, jit, pb);
    // Lueur de l'œil
    return { bob, hb, jit };
  }
  // Éclat en forme de lance qui jaillit de l'orbite vide
  function flare(c, o, info, s) {
    const t = o.t || 0, P = 2.4, ph = (t % P) / P;
    const x = o.x + Math.round(HX + 8 * HS + info.jit) * s, y = o.y + Math.round(OY + HY + 16 * HS + info.hb) * s;
    // petite lueur permanente au fond de l'orbite
    c.save();
    c.fillStyle = '#bff8ff'; c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 7);
    c.fillRect(x - s, y - s, s * 2, s * 2);
    if (ph < 0.2) {
      const k = ph / 0.2, a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const len = Math.round(5 + 15 * Math.min(1, k * 2.5));
      c.globalAlpha = Math.max(0, a);
      for (let i = -len; i <= len; i++) { // lance de lumière verticale
        const f = 1 - Math.abs(i) / len, w = Math.round(f * f * 3);
        c.fillStyle = f > 0.55 ? '#ffffff' : '#7fefff';
        c.fillRect(x - w * s - s / 2, y + i * s, (w * 2 + 1) * s, s);
      }
      c.fillStyle = '#ffffff';
      c.fillRect(x - Math.round(len * 0.7) * s, y - s / 2, Math.round(len * 1.4 + 1) * s, s);
    }
    c.restore();
  }

  // Dessine Undyne. o = { t, x, y (coin haut-gauche), s (échelle), shake, melt, jitter, wind, raise, white }
  function draw(ctx, o) {
    const s = o.s || 2;
    const info = compose(o);
    let src = buf;
    if (o.melt > 0) { melt(o); src = buf2; }
    if (o.white > 0) {
      const sc = src === buf ? b2 : bctx, dst = src === buf ? buf2 : buf;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      if (src === buf) { sc.clearRect(0, 0, SW, BH); sc.drawImage(buf, 0, 0); }
      else { sc.clearRect(0, 0, SW, BH); sc.drawImage(buf2, 0, 0); }
      sc.globalCompositeOperation = 'source-atop';
      sc.globalAlpha = Math.min(1, o.white);
      sc.fillStyle = '#ffffff'; sc.fillRect(0, 0, SW, BH);
      sc.globalCompositeOperation = 'source-over'; sc.globalAlpha = 1;
      src = dst;
    }
    const X = Math.round(o.x + (o.shake || 0)), Y = Math.round(o.y);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, SW, BH, X, Y, SW * s, BH * s);
    if (!(o.melt > 0.3)) flare(ctx, { ...o, x: X, y: Y }, info, s);
    ctx.restore();
  }
  // Fonte : chaque colonne coule et s'étire vers le bas
  function melt(o) {
    const m = o.melt;
    b2.setTransform(1, 0, 0, 1, 0, 0);
    b2.clearRect(0, 0, SW, BH);
    for (let x = 0; x < SW; x++) {
      const sm = 0.5 + 0.5 * Math.sin(x * 0.21 + 1.3) * Math.cos(x * 0.07 - 0.4);
      const n = Math.abs((Math.sin(x * 12.9898) * 43758.5453) % 1);
      const drip = Math.round(m * (4 + 16 * sm + (n > 0.8 ? 26 * n : 0)) + Math.sin((o.t || 0) * 2 + x * 0.3) * m * 1.5);
      b2.drawImage(buf, x, 0, 1, TH, x, Math.round(drip * 0.45), 1, TH + drip);
    }
  }
  // Image figée à l'échelle 1 (pour la désintégration en poussière)
  function snapshot(o) {
    compose(o);
    let src = buf;
    if (o.melt > 0) { melt(o); src = buf2; }
    const c = document.createElement('canvas'); c.width = SW; c.height = BH;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  return { draw, build, snapshot, SW, SH: BH, PAL, Pix };
})();
