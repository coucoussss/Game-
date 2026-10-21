'use strict';
// Mini moteur 3D WebGL : construction de maillages, éclairage, camouflage et usure procéduraux.
// Repère : x vers l'avant du char, y vers sa gauche, z vers le haut, en mètres.
const G3 = (() => {
  // ===================== Matrices (stockage par colonnes, comme WebGL) =====================
  const M4 = {
    ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    persp(fovy, asp, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    ortho(l, r, b, t, n, f) {
      const o = M4.ident();
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n);
      return o;
    },
    lookAt(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
      ]);
    },
    // translation + rotation autour de z + échelle (éventuellement par axe)
    trs(tx, ty, tz, rz, sx = 1, sy = sx, sz = sx) {
      const c = Math.cos(rz), s = Math.sin(rz);
      return new Float32Array([c * sx, s * sx, 0, 0, -s * sy, c * sy, 0, 0, 0, 0, sz, 0, tx, ty, tz, 1]);
    },
    apply(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
    },
  };

  // ===================== Construction de maillages =====================
  // Matériaux : 0 peint uni, 1 peint camouflé, 2 chenille, 3 acier nu, 4 caoutchouc, 5 verre, 6 bois, 9 sol
  const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  class Builder {
    constructor() { this.v = []; }
    tri(a, b, c, col, mat, ctr) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return;
      nx /= l; ny /= l; nz /= l;
      if (ctr) {
        const mx = (a[0] + b[0] + c[0]) / 3 - ctr[0], my = (a[1] + b[1] + c[1]) / 3 - ctr[1], mz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
        if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      const cc = typeof col === 'string' ? hex(col) : col;
      for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], nx, ny, nz, cc[0], cc[1], cc[2], mat);
    }
    triN(a, b, c, na, nb, nc, col, mat) {
      const cc = typeof col === 'string' ? hex(col) : col;
      const P = [a, b, c], N = [na, nb, nc];
      for (let i = 0; i < 3; i++) this.v.push(P[i][0], P[i][1], P[i][2], N[i][0], N[i][1], N[i][2], cc[0], cc[1], cc[2], mat);
    }
    quad(a, b, c, d, col, mat, ctr) { this.tri(a, b, c, col, mat, ctr); this.tri(a, c, d, col, mat, ctr); }
    poly(pts, col, mat, ctr) { for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], col, mat, ctr); }
    // Solide à 8 sommets : b0..b3 en bas, t0..t3 en haut, dans le même ordre
    hexa(b, t, col, mat) {
      const ctr = [0, 0, 0];
      for (const p of b.concat(t)) { ctr[0] += p[0] / 8; ctr[1] += p[1] / 8; ctr[2] += p[2] / 8; }
      this.poly(b, col, mat, ctr); this.poly(t, col, mat, ctr);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(b[i], b[j], t[j], t[i], col, mat, ctr); }
    }
    box(cx, cy, cz, sx, sy, sz, col, mat = 0) {
      const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
      this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col, mat);
    }
    // Prisme vertical (polygone convexe vu de dessus), sommet réduit vers le centre : tourelles inclinées
    prism(poly, z0, z1, ts, col, mat) {
      let cx = 0, cy = 0;
      for (const p of poly) { cx += p[0] / poly.length; cy += p[1] / poly.length; }
      const B = poly.map(p => [p[0], p[1], z0]);
      const T = poly.map(p => [cx + (p[0] - cx) * ts, cy + (p[1] - cy) * ts, z1]);
      const ctr = [cx, cy, (z0 + z1) / 2];
      this.poly(B, col, mat, ctr); this.poly(T, col, mat, ctr);
      for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; this.quad(B[i], B[j], T[j], T[i], col, mat, ctr); }
    }
    // Profil (x, z) extrudé le long de y, avec une demi-largeur qui peut dépendre de z (flancs inclinés)
    loftXZ(profile, hw, col, mat) {
      const L = profile.map(p => [p[0], hw(p[1]), p[1]]), R = profile.map(p => [p[0], -hw(p[1]), p[1]]);
      let cx = 0, cz = 0;
      for (const p of profile) { cx += p[0] / profile.length; cz += p[1] / profile.length; }
      const ctr = [cx, 0, cz];
      this.poly(L, col, mat, ctr); this.poly(R, col, mat, ctr);
      for (let i = 0; i < profile.length; i++) { const j = (i + 1) % profile.length; this.quad(L[i], L[j], R[j], R[i], col, mat, ctr); }
    }
    // Cylindre (ou tronc de cône) entre p0 et p1, normales lissées
    cyl(p0, p1, r0, r1, seg, col, mat, caps = true) {
      const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const al = Math.hypot(ax[0], ax[1], ax[2]);
      const a = ax.map(v => v / al);
      const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      let u = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
      const ul = Math.hypot(u[0], u[1], u[2]); u = u.map(v => v / ul);
      const w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
      const ring = (p, r, k) => { const t = k / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); return [p[0] + (u[0] * c + w[0] * s) * r, p[1] + (u[1] * c + w[1] * s) * r, p[2] + (u[2] * c + w[2] * s) * r]; };
      const nrm = k => { const t = k / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); return [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s]; };
      for (let k = 0; k < seg; k++) {
        const a0 = ring(p0, r0, k), a1 = ring(p0, r0, k + 1), b0 = ring(p1, r1, k), b1 = ring(p1, r1, k + 1);
        const n0 = nrm(k), n1 = nrm(k + 1);
        this.triN(a0, a1, b1, n0, n1, n1, col, mat); this.triN(a0, b1, b0, n0, n1, n0, col, mat);
        if (caps) {
          const na = a.map(v => -v);
          this.triN(p0, a1, a0, na, na, na, col, mat);
          this.triN(p1, b0, b1, a, a, a, col, mat);
        }
      }
    }
    // Ellipsoïde (sphère si rx = ry = rz), normales lissées
    sphere(c, rx, ry, rz, seg, col, mat) {
      const pt = (i, j) => {
        const th = i / seg * Math.PI, ph = j / seg * Math.PI * 2;
        const n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        const l = Math.hypot(n[0] / rx, n[1] / ry, n[2] / rz) || 1;
        return { p: [c[0] + n[0] * rx, c[1] + n[1] * ry, c[2] + n[2] * rz], n: [n[0] / rx / l, n[1] / ry / l, n[2] / rz / l] };
      };
      for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
        const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
        this.triN(a.p, b.p, cc.p, a.n, b.n, cc.n, col, mat);
        this.triN(a.p, cc.p, d.p, a.n, cc.n, d.n, col, mat);
      }
    }
    // Bande de chenille autour d'une boucle convexe (x, z), entre y0 et y1
    band(loop, th, y0, y1, col, mat) {
      let cx = 0, cz = 0;
      for (const p of loop) { cx += p[0] / loop.length; cz += p[1] / loop.length; }
      const n = loop.length;
      const inner = loop.map((p, i) => {
        const a = loop[(i - 1 + n) % n], b = loop[(i + 1) % n];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        let nx = tz, nz = -tx;
        if (nx * (p[0] - cx) + nz * (p[1] - cz) < 0) { nx = -nx; nz = -nz; }
        return [p[0] - nx * th, p[1] - nz * th];
      });
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const o0 = loop[i], o1 = loop[j], i0 = inner[i], i1 = inner[j];
        const mid = [(o0[0] + o1[0]) / 2, (y0 + y1) / 2, (o0[1] + o1[1]) / 2];
        const ctrOut = [cx, (y0 + y1) / 2, cz];
        this.quad([o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]], col, mat, ctrOut);
        // face intérieure : normale vers le centre de la boucle
        const ctrIn = [mid[0] + (mid[0] - cx) * 4, mid[1], mid[2] + (mid[2] - cz) * 4];
        this.quad([i0[0], y0, i0[1]], [i1[0], y0, i1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]], col, mat, ctrIn);
        this.quad([o0[0], y0, o0[1]], [o1[0], y0, o1[1]], [i1[0], y0, i1[1]], [i0[0], y0, i0[1]], col, mat, [mid[0], y1 + 1, mid[2]]);
        this.quad([o0[0], y1, o0[1]], [o1[0], y1, o1[1]], [i1[0], y1, i1[1]], [i0[0], y1, i0[1]], col, mat, [mid[0], y0 - 1, mid[2]]);
      }
    }
    // Disque de sol (pour la vitrine et la caméra d'impact)
    ground(r, seg) {
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        this.triN([0, 0, 0], [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [1, 1, 1], 9);
      }
    }
  }

  // ===================== Shaders =====================
  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aMat;
uniform mat4 uVP; uniform mat4 uModel;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec3 vNO;
void main(){
  vNO = aNor;
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vO = aPos; vN = mat3(uModel) * aNor; vC = aCol; vM = aMat;
  gl_Position = uVP * w;
}`;
  const FS = `
precision highp float;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec3 vNO;
uniform vec3 uLight; uniform vec3 uEye;
uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2; uniform float uPat;
uniform float uBurnt; uniform float uXray; uniform float uAlpha; uniform vec4 uColOv; uniform vec4 uTint;
uniform vec4 uShadow; uniform vec3 uGround; uniform float uSeed; uniform float uTop;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ return 0.5 * n3(p) + 0.25 * n3(p * 2.03) + 0.125 * n3(p * 4.01) + 0.0625 * n3(p * 8.07); }
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uEye - vW);
  if (uTop > 0.5) V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLight);
  if (vM > 8.5) {
    // sol : ombre portée douce du char (rectangle arrondi décalé vers l'opposé de la lumière)
    vec2 q = abs(vO.xy - uShadow.zw) - uShadow.xy;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float sh = 1.0 - smoothstep(-0.25, 0.9, d);
    float vig = 1.0 - smoothstep(2.0, 9.0, length(vO.xy));
    float grain = 0.9 + 0.2 * fbm(vO * 3.0);
    vec3 g = uGround * grain * (0.35 + 0.65 * vig) * (1.0 - 0.62 * sh);
    gl_FragColor = vec4(g, 1.0);
    return;
  }
  vec3 base = vC;
  vec3 P = vO + vec3(uSeed);
  float paint = 0.0;
  if (vM < 0.5) { paint = 1.0; }
  else if (vM < 1.5) {
    // camouflage trois tons à bords francs, légèrement estompés
    float a = fbm(P * 1.25 + 3.1), b = fbm(P * 1.3 + 17.3);
    // motifs : 0 taches (trois tons), 1 uni, 2 bandes ondulées, 3 embuscade (taches et pois clairs),
    // 4 lavis d'hiver (blanc passé à la brosse, usé, la teinte d'origine reparaît)
    if (uPat < 0.5 || (uPat > 2.5 && uPat < 3.5)) {
      base = uCamo0;
      base = mix(base, uCamo1, smoothstep(0.50, 0.535, a));
      base = mix(base, uCamo2, smoothstep(0.53, 0.565, b));
      if (uPat > 2.5) {
        vec3 q = vO * 7.0; float dd = length(fract(q) - 0.5);
        float dots = (1.0 - smoothstep(0.16, 0.2, dd)) * step(0.55, h3(floor(q)));
        base = mix(base, uCamo0 * 1.18, dots * step(0.5, max(smoothstep(0.50, 0.535, a), smoothstep(0.53, 0.565, b))));
      }
    } else if (uPat < 1.5) {
      base = uCamo0;
    } else if (uPat < 2.5) {
      float sw = sin((vO.x * 1.7 + vO.z * 0.6 + fbm(P * 0.9) * 2.2) * 3.4);
      base = mix(uCamo0, uCamo1, smoothstep(0.35, 0.42, sw));
      base = mix(base, uCamo2, smoothstep(0.35, 0.42, -sw) * step(0.48, b));
    } else {
      float w = smoothstep(0.38, 0.58, fbm(P * vec3(2.6, 2.6, 0.8) + 5.0) + 0.12 * fbm(P * 9.0));
      base = mix(uCamo1, uCamo0, w);
      base = mix(base, uCamo2, smoothstep(0.62, 0.66, b) * (1.0 - w));
    }
    // Zimmerit : pâte striée de cannelures verticales (pas d'environ 3 cm) posée en bandes de 11 cm,
    // seulement sur les faces verticales ou inclinées
    if (vM > 1.1) {
      vec3 no = normalize(vNO);
      if (abs(no.z) < 0.75) {
        float u = abs(no.x) > abs(no.y) ? vO.y : vO.x;
        float row = floor(vO.z * 9.0), fz = fract(vO.z * 9.0);
        float r = sin((u + row * 0.013 + h3(vec3(row, 1.0, 2.0)) * 0.02) * 140.0);
        // atténué avec la distance pour éviter le moiré quand les cannelures deviennent plus fines qu'un pixel
        float band = smoothstep(0.0, 0.1, fz) * smoothstep(1.0, 0.9, fz) * clamp(1.25 - length(uEye - vW) / 14.0, 0.0, 1.0);
        vec3 tg = normalize(cross(N, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        N = normalize(N + tg * r * 0.3 * band + vec3(0.0, 0.0, 1.0) * band * 0.06);
        base *= 0.96 + 0.07 * r * band;
      }
    }
    paint = 1.0;
  } else if (vM < 2.5) {
    float s = fract((vO.x + vO.z * 0.6) * 6.5);
    base = vC * (0.6 + 0.55 * smoothstep(0.15, 0.25, s) * (1.0 - smoothstep(0.75, 0.85, s)));
  } else if (vM < 3.5) { base = vC; }
  else if (vM < 4.5) { base = vC; }
  if (uColOv.w > 0.5) { base = uColOv.rgb; paint = 0.2; }
  if (uTint.w > 0.0) { base = mix(base, uTint.rgb, uTint.w); paint = 0.0; }
  // usure : salissures, boue sur le bas, éclats de peinture
  float grime = fbm(P * 5.0);
  base *= 0.82 + 0.32 * grime;
  if (paint > 0.5) {
    float mud = smoothstep(1.25, 0.15, vO.z) * (0.55 + 0.45 * fbm(P * 2.0 + 9.0));
    base = mix(base, vec3(0.30, 0.25, 0.18), mud * 0.55);
    float chip = smoothstep(0.78, 0.82, fbm(P * 14.0));
    base = mix(base, vec3(0.22, 0.21, 0.2), chip * 0.6);
    float streak = smoothstep(0.55, 0.9, n3(vec3(P.x * 9.0, P.y * 9.0, P.z * 0.8))) * (1.0 - abs(N.z));
    base *= 1.0 - streak * 0.18;
  }
  float burn = uBurnt;
  base = mix(base, vec3(0.075, 0.068, 0.062) + grime * vec3(0.07, 0.05, 0.04), burn);
  // éclairage : soleil chaud, ciel froid, rebond du sol, spéculaire
  float diff = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.z;
  vec3 amb = mix(vec3(0.13, 0.11, 0.09), vec3(0.30, 0.34, 0.40), hemi);
  float ao = 0.45 + 0.55 * smoothstep(-0.05, 1.1, vW.z);
  vec3 H = normalize(L + V);
  float shin = vM > 2.5 && vM < 3.5 ? 50.0 : (vM > 4.5 && vM < 5.5 ? 90.0 : 14.0);
  float ks = vM > 2.5 && vM < 3.5 ? 0.55 : (vM > 4.5 && vM < 5.5 ? 0.9 : (vM > 3.5 && vM < 4.5 ? 0.05 : 0.1));
  float spec = pow(max(dot(N, H), 0.0), shin) * ks * (1.0 - burn * 0.8);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = base * (amb * ao * 1.05 + vec3(1.0, 0.92, 0.78) * diff * 1.45) + spec * vec3(1.0, 0.95, 0.85) + rim * 0.05 * amb;
  if (uXray > 0.5) {
    vec3 x = vec3(0.35, 0.7, 1.0) * (0.25 + 1.6 * rim) + vec3(0.1, 0.2, 0.3) * diff;
    gl_FragColor = vec4(x, uAlpha * (0.025 + 0.32 * rim * rim));
    return;
  }
  col = vec3(1.0) - exp(-col * 1.35);
  gl_FragColor = vec4(col, uAlpha);
}`;

  // ===================== Rendu =====================
  function createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader : ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Programme : ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const A = {}, U = {};
    for (const n of ['aPos', 'aNor', 'aCol', 'aMat']) A[n] = gl.getAttribLocation(prog, n);
    for (const n of ['uVP', 'uModel', 'uLight', 'uEye', 'uCamo0', 'uCamo1', 'uCamo2', 'uPat', 'uBurnt', 'uXray', 'uAlpha', 'uColOv', 'uTint', 'uShadow', 'uGround', 'uSeed', 'uTop']) U[n] = gl.getUniformLocation(prog, n);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const R = {
      gl, canvas, view: null, proj: null, vp: null, eye: [0, 0, 10],
      upload(builder) {
        const data = new Float32Array(builder.v);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { buf, count: data.length / 10 };
      },
      begin(w, h, clear) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        const c = clear || [0, 0, 0, 0];
        gl.clearColor(c[0], c[1], c[2], c[3]);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.BLEND);
      },
      camera(view, proj, eye, light, top) {
        R.view = view; R.proj = proj; R.vp = M4.mul(proj, view); R.eye = eye;
        gl.uniformMatrix4fv(U.uVP, false, R.vp);
        gl.uniform3fv(U.uEye, eye);
        gl.uniform3fv(U.uLight, light || [-0.45, 0.5, 0.75]);
        gl.uniform1f(U.uTop, top ? 1 : 0);
      },
      draw(mesh, model, o = {}) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
        const st = 40;
        gl.enableVertexAttribArray(A.aPos); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, st, 0);
        gl.enableVertexAttribArray(A.aNor); gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, st, 12);
        gl.enableVertexAttribArray(A.aCol); gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, st, 24);
        gl.enableVertexAttribArray(A.aMat); gl.vertexAttribPointer(A.aMat, 1, gl.FLOAT, false, st, 36);
        gl.uniformMatrix4fv(U.uModel, false, model);
        const camo = o.camo || [[0.6, 0.55, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.2]];
        gl.uniform3fv(U.uCamo0, camo[0]); gl.uniform3fv(U.uCamo1, camo[1]); gl.uniform3fv(U.uCamo2, camo[2]); gl.uniform1f(U.uPat, o.pat || 0);
        gl.uniform1f(U.uBurnt, o.burnt || 0);
        gl.uniform1f(U.uXray, o.xray ? 1 : 0);
        gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha);
        gl.uniform4fv(U.uColOv, o.color ? [o.color[0], o.color[1], o.color[2], 1] : [0, 0, 0, 0]);
        gl.uniform4fv(U.uTint, o.tint || [0, 0, 0, 0]);
        gl.uniform4fv(U.uShadow, o.shadow || [1, 1, 0, 0]);
        gl.uniform3fv(U.uGround, o.ground || [0.3, 0.3, 0.3]);
        gl.uniform1f(U.uSeed, o.seed || 0);
        if (o.xray || (o.alpha != null && o.alpha < 1)) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, o.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
        } else { gl.disable(gl.BLEND); gl.depthMask(true); }
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        gl.depthMask(true);
      },
      // Projection d'un point du monde vers l'écran (pixels, origine en haut à gauche)
      project(p, w, h) {
        const q = M4.apply(R.vp, p);
        return { x: (q[0] * 0.5 + 0.5) * w, y: (1 - (q[1] * 0.5 + 0.5)) * h, z: q[2], behind: q[3] < 0 };
      },
    };
    return R;
  }

  return { M4, Builder, createRenderer, hex };
})();
