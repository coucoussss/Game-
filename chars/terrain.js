'use strict';
// Relief et eau d'une carte, sans rendu ni état de partie (positions en px de jeu, hauteurs en m).
// - grille de hauteurs au pas de C px (4 m de conduite), débordant de M px autour de la carte et
//   ramenée à 0 sur son pourtour (raccord avec les dalles plates du lointain)
// - relief : bruit de valeur en octaves (crêtes de dunes), escarpement, ravins (balkas), buttes de
//   gravats ; adouci près des bases de départ et le long des routes, aplani sous les maisons
// - eau : un niveau par carte ; rivière ou ruisseau creusés sous ce niveau, gués, mares gelées ou non
// - ponts : tablier au-dessus de l'eau, avec une charge limite ; glace : mailles intactes ou brisées
// Lectures : bed (lit), ground (appui d'un char : tablier, glace ou lit), surf (sol ou surface de
// l'eau : obus, vue, effets), depth (eau au-dessus de l'appui), grad (pente du lit, m par px).
const Terrain = (() => {
  const C = 28, M = 280;
  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  function rng(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // bruit de valeur lissé (256 × 256 nœuds, périodique)
  function noise(R) {
    const p = new Float32Array(65536);
    for (let i = 0; i < p.length; i++) p[i] = R() * 2 - 1;
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
      const a = xi & 255, b = (xi + 1) & 255, c = (yi & 255) << 8, d = ((yi + 1) & 255) << 8;
      return (p[c + a] + (p[c + b] - p[c + a]) * fx) * (1 - fy) + (p[d + a] + (p[d + b] - p[d + a]) * fx) * fy;
    };
  }
  // distance d'un point à une polyligne [[x, y], …], et position le long de celle-ci (0..1)
  function near(pts, x, y) {
    let d = Infinity, u = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)), e = Math.hypot(x - x0 - dx * k, y - y0 - dy * k);
      if (e < d) { d = e; u = (i + k) / (pts.length - 1); }
    }
    return { d, u };
  }
  // premier croisement de deux polylignes : point et direction de la seconde
  function cross(a, b) {
    for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) {
      const [x0, y0] = a[i], [x1, y1] = a[i + 1], [x2, y2] = b[j], [x3, y3] = b[j + 1];
      const d = (x1 - x0) * (y3 - y2) - (y1 - y0) * (x3 - x2);
      if (Math.abs(d) < 1e-9) continue;
      const s = ((x2 - x0) * (y3 - y2) - (y2 - y0) * (x3 - x2)) / d, t = ((x2 - x0) * (y1 - y0) - (y2 - y0) * (x1 - x0)) / d;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) { const l = Math.hypot(x3 - x2, y3 - y2) || 1; return { x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s, ux: (x3 - x2) / l, uy: (y3 - y2) / l }; }
    }
    return null;
  }
  // tracé sinueux d'un cours d'eau du nord au sud, autour de x0 (px)
  function course(R, x0, W, H) {
    const pts = [];
    let x = x0;
    for (let y = -M; y <= H + M + 90; y += 90) { x = Math.max(x0 - 170, Math.min(x0 + 170, x + (R() - 0.5) * 90)); pts.push([x, y]); }
    return pts;
  }

  // spec (LEVELS[i].relief) : oct [[longueur d'onde px, amplitude m, crêtes?]], st (étirement nord-sud),
  // escarp { x, h, w }, balkas { n, depth, hw }, mounds { n, h: [a, b], r: [a, b] },
  // water { wl, river: { x, hw, depth, bank, fords, bridge (t) }, ponds: { n, r: [a, b], depth }, ice }
  // roads : polylignes des routes (px), de demi-largeur rhw ; ordre : la première porte le pont
  function make(spec, W, H, seed, roads, rhw) {
    const R = rng(seed), n1 = noise(R), n2 = noise(R);
    const nx = Math.ceil((W + 2 * M) / C) + 1, ny = Math.ceil((H + 2 * M) / C) + 1, h = new Float32Array(nx * ny);
    const X = i => -M + i * C, Y = j => -M + j * C, st = spec.st || 1;
    // relief de fond : adouci (30 %) sur les bases de départ, à l'ouest et à l'est
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = X(i), y = Y(j);
      let v = 0;
      (spec.oct || []).forEach(([l, a, ridge], k) => {
        const q = n1(x / l + 31 * k, y / (l * st) + 17 * k);
        v += ridge ? a * (2 * (1 - Math.abs(q)) ** 2 - 0.9) : a * q;
      });
      v *= 0.3 + 0.7 * sm((x - 240) / 320) * sm((W - 240 - x) / 320);
      const e = spec.escarp;
      if (e) v += e.h * sm((x - W * e.x - 150 * n2(5, y / 700)) / e.w + 0.5);
      h[j * nx + i] = v;
    }
    const each = (x0, y0, x1, y1, f) => {
      const i0 = Math.max(0, Math.floor((x0 + M) / C)), i1 = Math.min(nx - 1, Math.ceil((x1 + M) / C));
      const j0 = Math.max(0, Math.floor((y0 + M) / C)), j1 = Math.min(ny - 1, Math.ceil((y1 + M) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * nx + i, X(i), Y(j));
    };
    const rr = (a, b) => a + R() * (b - a);
    // ravins : longues dépressions en U, effilées aux deux bouts
    const B = spec.balkas;
    if (B) for (let k = 0; k < B.n; k++) {
      let x = rr(W * 0.3, W * 0.7), y = rr(-60, H * 0.35), a = Math.PI / 2 + rr(-0.6, 0.6);
      const pts = [[x, y]], len = rr(600, 1100);
      for (let s = 0; s < len; s += 80) { a += rr(-0.35, 0.35); x += Math.cos(a) * 80; y += Math.sin(a) * 80; pts.push([x, y]); }
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      each(Math.min(...xs) - B.hw, Math.min(...ys) - B.hw, Math.max(...xs) + B.hw, Math.max(...ys) + B.hw, (q, x, y) => {
        const r = near(pts, x, y);
        if (r.d < B.hw) h[q] -= B.depth * (1 - sm(r.d / B.hw)) * Math.sqrt(Math.sin(Math.PI * r.u));
      });
    }
    // buttes de gravats ou de terre
    const Mo = spec.mounds;
    if (Mo) for (let k = 0; k < Mo.n; k++) {
      const cx = rr(W * 0.2, W * 0.8), cy = rr(80, H - 80), r = rr(Mo.r[0], Mo.r[1]), hm = rr(Mo.h[0], Mo.h[1]);
      each(cx - r, cy - r, cx + r, cy + r, (q, x, y) => { const d = Math.hypot(x - cx, y - cy); if (d < r) h[q] += hm * (1 - sm(d / r)); });
    }
    // routes : le relief s'adoucit vers sa moyenne locale (flou de 4 mailles) sur la chaussée et ses abords
    if (roads.length) {
      const b = h.slice(), t = new Float32Array(h.length), K = 4;
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0, c = 0; for (let k = -K; k <= K; k++) { const ii = i + k; if (ii >= 0 && ii < nx) { s += b[j * nx + ii]; c++; } } t[j * nx + i] = s / c; }
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0, c = 0; for (let k = -K; k <= K; k++) { const jj = j + k; if (jj >= 0 && jj < ny) { s += t[jj * nx + i]; c++; } } b[j * nx + i] = s / c; }
      }
      for (let q = 0; q < h.length; q++) {
        const x = X(q % nx), y = Y((q / nx) | 0);
        let d = Infinity;
        for (const r of roads) d = Math.min(d, near(r, x, y).d);
        const k = 1 - sm((d - rhw) / 70);
        if (k > 0) h[q] += (b[q] - h[q]) * k;
      }
    }
    // eau : la terre reste au-dessus du niveau (raccord doux), puis lits et mares creusés dessous
    const wa = spec.water, wl = wa ? wa.wl : -Infinity, fords = [], bridges = [], ponds = [];
    let river = null;
    if (wa) {
      for (let q = 0; q < h.length; q++) { const a = h[q], b = wl + 0.35; h[q] = 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + 0.04)); }
      const rv = wa.river;
      if (rv) {
        river = course(R, W * rv.x, W, H);
        const cs = roads.map(r => cross(river, r)).filter(Boolean);
        if (rv.bridge && cs[0]) bridges.push({ x: cs[0].x, y: cs[0].y, ux: cs[0].ux, uy: cs[0].uy, cap: rv.bridge, dead: false });
        const fc = cs.slice(rv.bridge ? 1 : 0);
        for (let k = 0; k < (rv.fords || 0); k++) {
          if (fc[k]) { fords.push({ x: fc[k].x, y: fc[k].y }); continue; }
          // gué sans route : loin des autres passages
          for (let tr = 0; tr < 30; tr++) {
            const y = rr(250, H - 250);
            if ([...cs, ...fords].every(p => Math.abs(p.y - y) > 260)) { const k = (y + M) / 90, i = Math.floor(k); fords.push({ x: river[i][0] + (river[i + 1][0] - river[i][0]) * (k - i), y }); break; }
          }
        }
        const ext = rv.hw + 90;
        each(Math.min(...river.map(p => p[0])) - ext, -M, Math.max(...river.map(p => p[0])) + ext, H + M, (q, x, y) => {
          const d = near(river, x, y).d;
          if (d > ext) return;
          let f = 0;
          for (const g of fords) f = Math.max(f, 1 - sm((Math.hypot(x - g.x, y - g.y) - 40) / 50));
          const dep = rv.depth + (0.5 - rv.depth) * f, bk = rv.bank + (0.03 - rv.bank) * f;
          h[q] = Math.min(h[q], d < rv.hw ? wl - dep * (1 - sm((d / rv.hw - 0.25) / 0.75)) : wl + (d - rv.hw) * bk);
        });
      }
      const P = wa.ponds;
      if (P) for (let k = 0, tr = 0; k < P.n && tr < 200; tr++) {
        const r = rr(P.r[0], P.r[1]), cx = rr(W * 0.22, W * 0.78), cy = rr(r + 60, H - r - 60);
        if (roads.some(rd => near(rd, cx, cy).d < r + rhw + 50) || ponds.some(p => Math.hypot(p.x - cx, p.y - cy) < p.r + r + 120) || (river && near(river, cx, cy).d < r + 150)) continue;
        ponds.push({ x: cx, y: cy, r }); k++;
        each(cx - r - 40, cy - r - 40, cx + r + 40, cy + r + 40, (q, x, y) => {
          const d = Math.hypot(x - cx, y - cy) * (1 + 0.12 * n2(x / 60, y / 60));
          h[q] = Math.min(h[q], d < r ? wl - P.depth * (1 - (d / r) ** 2) : wl + (d - r) * 0.035);
        });
      }
    }
    // pourtour de la marge ramené à 0
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = X(i), y = Y(j), out = Math.max(0, -x, x - W, -y, y - H);
      if (out > 0) h[j * nx + i] *= sm(1 - out / (M - C));
    }
    const T = { C, M, nx, ny, h, wl, W, H, river, fords, bridges, ponds, ice: null, spec };
    const bed = (x, y) => {
      let gx = (x + M) / C, gy = (y + M) / C;
      gx = gx < 0 ? 0 : gx > nx - 1.001 ? nx - 1.001 : gx; gy = gy < 0 ? 0 : gy > ny - 1.001 ? ny - 1.001 : gy;
      const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, q = j * nx + i;
      return (h[q] + (h[q + 1] - h[q]) * fx) * (1 - fy) + (h[q + nx] + (h[q + nx + 1] - h[q + nx]) * fx) * fy;
    };
    // tablier des ponts : longueur jusqu'aux berges, à la hauteur de la route de part et d'autre
    for (const b of bridges) {
      const far = wa.river.hw + 90;
      b.z = Math.max(bed(b.x + b.ux * far, b.y + b.uy * far), bed(b.x - b.ux * far, b.y - b.uy * far)) + 0.1;
      b.hl = wa.river.hw + Math.max(0, b.z - wl) / wa.river.bank + 18; b.hw = 16;
    }
    const cellOf = (x, y) => Math.min(ny - 2, Math.max(0, Math.floor((y + M) / C))) * (nx - 1) + Math.min(nx - 2, Math.max(0, Math.floor((x + M) / C)));
    if (wa && wa.ice) {
      T.ice = new Uint8Array((nx - 1) * (ny - 1));
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) if (bed(X(i) + C / 2, Y(j) + C / 2) < wl + 0.1) T.ice[j * (nx - 1) + i] = 1;
    }
    const bridgeAt = (x, y) => {
      for (const b of bridges) {
        if (b.dead) continue;
        const dx = x - b.x, dy = y - b.y;
        if (Math.abs(dx * b.ux + dy * b.uy) <= b.hl && Math.abs(dy * b.ux - dx * b.uy) <= b.hw) return b;
      }
      return null;
    };
    const ground = (x, y) => {
      const g = bed(x, y);
      if (g >= wl) return g;
      if (bridges.length) { const b = bridgeAt(x, y); if (b) return Math.max(g, b.z); }
      return T.ice && T.ice[cellOf(x, y)] === 1 ? wl : g;
    };
    Object.assign(T, {
      bed, ground, bridgeAt, cellOf,
      surf: (x, y) => { const g = ground(x, y); return g < wl ? wl : g; },
      depth: (x, y) => { const g = ground(x, y); return g < wl ? wl - g : 0; },
      iceAt: (x, y) => !!T.ice && T.ice[cellOf(x, y)] === 1 && bed(x, y) < wl,
      grad(x, y, e = C / 2) { return [(bed(x + e, y) - bed(x - e, y)) / (2 * e), (bed(x, y + e) - bed(x, y - e)) / (2 * e)]; },
      // brise la glace dans un rayon r (px) ; renvoie le nombre de mailles brisées
      breakIce(x, y, r) {
        if (!T.ice) return 0;
        let n = 0;
        for (let j = Math.max(0, Math.floor((y - r + M) / C)); j <= Math.min(ny - 2, Math.floor((y + r + M) / C)); j++)
          for (let i = Math.max(0, Math.floor((x - r + M) / C)); i <= Math.min(nx - 2, Math.floor((x + r + M) / C)); i++) {
            const q = j * (nx - 1) + i;
            if (T.ice[q] === 1 && Math.hypot(X(i) + C / 2 - x, Y(j) + C / 2 - y) < r + C / 2) { T.ice[q] = 2; n++; }
          }
        return n;
      },
      // premier point du segment (x0, y0, z0) → (x1, y1, z1) sous la surface (fraction 0..1), ou -1 ;
      // pas d'échantillonnage ≤ 14 px, puis interpolation linéaire entre les deux derniers points
      cut(x0, y0, z0, x1, y1, z1) {
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14));
        let pd = z0 - T.surf(x0, y0);
        if (pd < 0) return 0;
        for (let k = 1; k <= n; k++) {
          const u = k / n, d = z0 + (z1 - z0) * u - T.surf(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
          if (d < 0) return (k - 1 + pd / (pd - d)) / n;
          pd = d;
        }
        return -1;
      },
    });
    // surfaces de la carte entière (pour le placement et l'itinéraire) : mailles mouillées
    T.wetAt = (x, y) => bed(x, y) < wl + 0.05;
    // aplanit un rectangle (maison, muret) à sa hauteur moyenne, raccordé sur 2 mailles
    T.flatten = (x0, y0, x1, y1) => {
      let s = 0, c = 0;
      each(x0, y0, x1, y1, q => { s += h[q]; c++; });
      if (!c) return;
      const m = s / c, mg = 2 * C;
      each(x0 - mg, y0 - mg, x1 + mg, y1 + mg, (q, x, y) => {
        const o = Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
        h[q] += (m - h[q]) * (1 - sm(o / mg));
      });
    };
    return T;
  }
  // terrain plat (cartes sans relief, essais)
  const flat = (W, H) => make({}, W, H, 1, [], 0);
  return { C, M, make, flat, near };
})();
