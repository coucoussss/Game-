// Formes anatomiques générées par révolution (LatheGeometry) : membres galbés (biceps, mollets),
// torse en V, tête d'anime au menton fin, mains et chaussures. Toutes les mesures sont en mètres.
import * as THREE from 'three';

const V2 = (r, y) => new THREE.Vector2(Math.max(0.0005, r), y);

/** Révolution d'un profil [[rayon, hauteur], …] listé du bas vers le haut. */
export function lathe(profile, seg = 14) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => V2(r, y)), seg);
}

/**
 * Membre qui pend sous son articulation : de y = 0 (haut, rayon r0) à y = −len (bas, rayon r1),
 * avec un renflement musculaire `bulge` centré à la fraction `at` de la longueur, et des bouts arrondis.
 */
export function limbGeo(r0, r1, len, { bulge = 0, at = 0.35, seg = 12, steps = 9 } = {}) {
  const pts = [];
  // calotte du bas
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push([Math.sin(a) * r1, -len - Math.cos(a) * r1 * 0.55]);
  }
  for (let i = 1; i < steps; i++) {
    const k = i / steps; // 0 en bas, 1 en haut
    const t = 1 - k; // fraction depuis le haut
    let r = r1 + (r0 - r1) * k;
    r += bulge * Math.exp(-(((t - at) / 0.22) ** 2));
    pts.push([r, -len + len * k]);
  }
  // calotte du haut
  for (let i = 0; i <= 3; i++) {
    const a = Math.PI / 2 - (i / 3) * (Math.PI / 2);
    pts.push([Math.sin(a) * r0, Math.cos(a) * r0 * 0.55]);
  }
  return lathe(pts, seg);
}

/** Manche évasée ou jambe de hakama : tube ouvert qui s'élargit vers le bas. */
export function flareGeo(r0, r1, len, seg = 14) {
  const g = lathe([[r1, -len], [r1 * 0.97, -len * 0.7], [(r0 + r1) / 2, -len * 0.35], [r0, 0]], seg);
  return g;
}

/** Torse (bassin → épaules → cou) ; `kind` : 'm', 'f' ou 'big'. */
export function torsoGeo(kind, b = 1) {
  const P = {
    m: [[0.13, 0], [0.15, 0.06], [0.142, 0.15], [0.172, 0.28], [0.2, 0.4], [0.198, 0.47], [0.15, 0.53], [0.075, 0.58], [0.06, 0.6]],
    f: [[0.14, 0], [0.148, 0.05], [0.118, 0.16], [0.142, 0.28], [0.158, 0.38], [0.152, 0.46], [0.115, 0.52], [0.062, 0.57], [0.05, 0.59]],
    big: [[0.15, 0], [0.17, 0.06], [0.165, 0.15], [0.2, 0.27], [0.235, 0.39], [0.235, 0.46], [0.18, 0.53], [0.09, 0.58], [0.07, 0.6]],
  }[kind] || [];
  return lathe(P.map(([r, y]) => [r * b, y]), 16);
}

/** Déformation « tête d'anime » : menton affiné et légèrement avancé, arrière du crâne arrondi. */
export function deformHead(x, y, z, r) {
  x *= 0.92;
  if (y < 0) {
    const k = Math.min(1, -y / r);
    x *= 1 - 0.42 * k ** 1.4;
    z = z * (1 - 0.18 * k) + (z > 0 ? 0.03 * k : 0);
    y *= 1 + 0.16 * k;
  }
  if (z < 0) z *= 0.96;
  return [x, y, z];
}

/** Tête d'anime. */
export function headGeo(r = 0.2) {
  const g = new THREE.SphereGeometry(r, 24, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = deformHead(p.getX(i), p.getY(i), p.getZ(i), r);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Zone du visage couverte par la texture dessinée (yeux, sourcils, bouche). */
export const FACE = { phiStart: Math.PI / 2 - 1.2, phiLength: 2.4, thetaStart: 0.95, thetaLength: 1.35 };

/** Calque du visage : portion de sphère épousant exactement la tête déformée, juste au-dessus. */
export function faceGeo(r = 0.2) {
  const g = new THREE.SphereGeometry(r * 1.012, 32, 24, FACE.phiStart, FACE.phiLength, FACE.thetaStart, FACE.thetaLength);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = deformHead(p.getX(i), p.getY(i), p.getZ(i), r);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Position (en pixels, sur une texture de `size`) d'un point du visage repéré en (x, y) avant déformation. */
export function faceUV(x, y, r = 0.2, size = 512) {
  const theta = Math.acos(Math.max(-1, Math.min(1, y / r)));
  const zz = Math.sqrt(Math.max(1e-6, r * r - y * y - x * x));
  const phi = Math.atan2(zz, -x); // x = -r cos(phi) sin(theta), z = r sin(phi) sin(theta)
  const u = (phi - FACE.phiStart) / FACE.phiLength;
  const v = (theta - FACE.thetaStart) / FACE.thetaLength;
  return [u * size, v * size];
}

/**
 * Mèche de cheveux d'anime : un ruban épais et effilé qui pousse le long de +Y en s'incurvant vers
 * −Z (`bend`) et éventuellement sur le côté (`twist`). Couleurs de sommet : racine sombre → pointe claire.
 */
export function lockGeo(len, width, { bend = 0.35, twist = 0, flat = 0.5, seg = 8, radial = 6 } = {}) {
  const pos = [];
  const col = [];
  const idx = [];
  const P = (t) => [twist * len * t * t, len * t, -bend * len * t * t];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const [cx, cy, cz] = P(t);
    // tangente
    const [nx, ny, nz] = P(Math.min(1, t + 0.01));
    let tx = nx - cx; let ty = ny - cy; let tz = nz - cz;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // repère : côté (x) et épaisseur (perpendiculaire)
    let sx = 1; let sy = 0; let sz = 0;
    const d = sx * tx + sy * ty + sz * tz;
    sx -= d * tx; sy -= d * ty; sz -= d * tz;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const bx = ty * sz - tz * sy; const by = tz * sx - tx * sz; const bz = tx * sy - ty * sx;
    const r = width * (1 - t) ** 0.85 + 0.002;
    const shade = 0.72 + 0.45 * t;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r * flat;
      pos.push(cx + sx * ca + bx * sa, cy + sy * ca + by * sa, cz + sz * ca + bz * sa);
      col.push(shade, shade, shade);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const e = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Profondeur (z) de la surface de la tête en (x, y), pour y poser le visage. */
export function faceZ(r, x, y) {
  const xx = x / 0.92;
  return Math.sqrt(Math.max(0, r * r - xx * xx - y * y));
}

/** Chaussure : forme ovale allongée avec une semelle. */
export function shoeGeo() {
  const g = new THREE.SphereGeometry(1, 12, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.065;
    let y = p.getY(i) * 0.055;
    let z = p.getZ(i) * 0.14 + 0.045;
    if (y < -0.02) y = -0.02 + (y + 0.02) * 0.3; // dessous aplati
    if (z > 0.1) y *= 0.8; // bout plus fin
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
