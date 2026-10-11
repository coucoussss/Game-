// Visages d'anime dessinés par code : un calque (texture de canvas) posé sur l'avant de la tête.
// Grands yeux en amande, iris en dégradé avec deux reflets, cils épais en aile, pli de paupière,
// sourcils, petit nez, bouche, et plusieurs expressions (neutre, combatif, cligne, douleur, K.O.,
// sourire) qui changent selon ce que fait le personnage.
import * as THREE from 'three';
import { faceUV } from './anatomy.js';

const SIZE = 512;
const R = 0.2;
// Pixels par mètre au centre du visage (la projection sur la sphère étire différemment x et y)
const SX = SIZE / (R * 2.4);
const SY = SIZE / (R * 1.35);

const cache = new Map();

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  if (k < 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color('#ffffff'), k - 1);
  return `#${c.getHexString()}`;
};

/** Dessine dans un repère local en mètres centré sur (x, y) du visage (y vers le bas). */
function at(g, x, y, fn) {
  const [cx, cy] = faceUV(x, y, R, SIZE);
  g.save();
  g.translate(cx, cy);
  g.scale(SX, SY);
  fn();
  g.restore();
}

function eye(g, o, look, expr, fem) {
  const w = fem ? 0.092 : 0.086;
  const h = fem ? 0.105 : 0.09;
  const ink = '#15101c';
  const lw = (px) => px / SX; // épaisseur de trait en pixels, convertie
  const iris = look.eyes || '#3a3a5a';
  if (expr === 'blink' || expr === 'smile') {
    // Paupières closes : arc épais (vers le bas pour cligner, « ^ » pour sourire)
    g.beginPath();
    g.moveTo(-o * w * 0.45, 0.004);
    g.quadraticCurveTo(0, expr === 'smile' ? -h * 0.42 : h * 0.18, o * w * 0.5, expr === 'smile' ? 0.004 : -0.004);
    g.strokeStyle = ink;
    g.lineWidth = lw(9);
    g.lineCap = 'round';
    g.stroke();
    return;
  }
  if (expr === 'hurt') {
    // Yeux plissés « > < »
    g.beginPath();
    g.moveTo(-o * w * 0.42, -h * 0.25);
    g.lineTo(o * w * 0.3, 0);
    g.lineTo(-o * w * 0.42, h * 0.25);
    g.strokeStyle = ink;
    g.lineWidth = lw(10);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
    return;
  }
  if (expr === 'ko') {
    g.strokeStyle = ink;
    g.lineWidth = lw(9);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-w * 0.32, -h * 0.28); g.lineTo(w * 0.32, h * 0.28);
    g.moveTo(w * 0.32, -h * 0.28); g.lineTo(-w * 0.32, h * 0.28);
    g.stroke();
    return;
  }
  const fierce = expr === 'fierce';
  // Forme en amande ; le regard combatif abaisse la paupière côté nez
  const topIn = fierce ? -h * 0.18 : -h * 0.42;
  const topOut = fierce ? -h * 0.44 : -h * 0.4;
  const inX = -o * w * 0.48;
  const outX = o * w * 0.52;
  const almond = () => {
    g.beginPath();
    g.moveTo(inX, h * 0.05);
    g.bezierCurveTo(inX + o * w * 0.1, topIn, outX - o * w * 0.25, topOut - h * 0.08, outX, -h * 0.12);
    g.bezierCurveTo(outX - o * w * 0.05, h * 0.3, inX + o * w * 0.3, h * 0.48, inX, h * 0.05);
    g.closePath();
  };
  almond();
  g.fillStyle = '#eceaf3';
  g.fill();
  // Iris en dégradé (sombre en haut, clair en bas), pupille, reflets — découpés par l'amande
  g.save();
  almond();
  g.clip();
  const ix = -o * w * 0.04;
  const iy = h * 0.06;
  const grd = g.createLinearGradient(0, iy - h * 0.38, 0, iy + h * 0.38);
  grd.addColorStop(0, shade(iris, 0.25));
  grd.addColorStop(0.45, iris);
  grd.addColorStop(1, shade(iris, 1.3));
  g.beginPath();
  g.ellipse(ix, iy, w * 0.29, h * 0.4, 0, 0, Math.PI * 2);
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = lw(4);
  g.strokeStyle = shade(iris, 0.3);
  g.stroke();
  g.beginPath();
  g.ellipse(ix, iy + h * 0.02, w * 0.12, h * 0.2, 0, 0, Math.PI * 2);
  g.fillStyle = shade(iris, 0.18);
  g.fill();
  // Ombre de la paupière sur le haut de l'œil
  g.fillStyle = 'rgba(40,20,60,0.35)';
  g.fillRect(-w, -h, w * 2, h * 0.62 + (fierce ? h * 0.15 : 0));
  // Reflets (juste sous le seuil du halo lumineux)
  g.fillStyle = '#efeff6';
  g.beginPath();
  g.ellipse(ix - o * w * 0.1, iy - h * 0.15, w * 0.1, h * 0.11, -0.4 * o, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(ix + o * w * 0.1, iy + h * 0.2, w * 0.045, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Cils supérieurs épais, avec une aile au coin extérieur
  g.beginPath();
  g.moveTo(inX, h * 0.05);
  g.bezierCurveTo(inX + o * w * 0.1, topIn, outX - o * w * 0.25, topOut - h * 0.08, outX, -h * 0.12);
  g.lineTo(outX + o * w * 0.16, -h * 0.3);
  g.strokeStyle = ink;
  g.lineWidth = lw(fem ? 11 : 9);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
  if (fem) {
    for (const k of [0.62, 0.82]) {
      g.beginPath();
      const lx = inX + (outX - inX) * k;
      g.moveTo(lx, topOut * 0.95);
      g.lineTo(lx + o * w * 0.12, topOut - h * 0.2);
      g.lineWidth = lw(5);
      g.stroke();
    }
  }
  // Pli de la paupière et trait du bas
  g.beginPath();
  g.moveTo(inX + o * w * 0.25, topIn - h * 0.16);
  g.quadraticCurveTo(o * w * 0.15, topOut - h * 0.26, outX - o * w * 0.05, -h * 0.3);
  g.lineWidth = lw(3);
  g.strokeStyle = 'rgba(21,16,28,0.6)';
  g.stroke();
  g.beginPath();
  g.moveTo(o * w * 0.05, h * 0.36);
  g.quadraticCurveTo(o * w * 0.35, h * 0.3, outX, -h * 0.05);
  g.lineWidth = lw(4);
  g.strokeStyle = ink;
  g.stroke();
}

function brow(g, o, look, expr) {
  const hair = shade(look.hair || '#222', 0.7);
  const inner = expr === 'fierce' ? 0.012 : expr === 'hurt' ? -0.012 : 0;
  g.beginPath();
  g.moveTo(-o * 0.035, inner);
  g.quadraticCurveTo(o * 0.005, -0.014 + inner * 0.3, o * 0.045, -0.002);
  g.lineTo(o * 0.04, 0.004);
  g.quadraticCurveTo(o * 0.002, -0.006 + inner * 0.3, -o * 0.035, inner + 0.008);
  g.closePath();
  g.fillStyle = hair;
  g.fill();
}

function mouth(g, expr, fem) {
  const ink = '#2a1018';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (expr === 'fierce' || expr === 'ko') {
    // Bouche ouverte (cri de combat), dents du haut
    g.beginPath();
    const w = expr === 'ko' ? 0.016 : 0.026;
    g.moveTo(-w, -0.006);
    g.lineTo(w, -0.006);
    g.quadraticCurveTo(w * 0.7, 0.026, 0, 0.028);
    g.quadraticCurveTo(-w * 0.7, 0.026, -w, -0.006);
    g.fillStyle = '#5a1420';
    g.fill();
    g.lineWidth = 3 / SX;
    g.strokeStyle = ink;
    g.stroke();
    if (expr === 'fierce') {
      g.fillStyle = '#f4f2f6';
      g.fillRect(-w * 0.85, -0.006, w * 1.7, 0.007);
      g.fillStyle = '#e0607a';
      g.beginPath();
      g.ellipse(0, 0.02, w * 0.45, 0.006, 0, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  g.beginPath();
  if (expr === 'hurt') {
    g.moveTo(-0.018, 0.004);
    for (let i = 1; i <= 4; i++) g.lineTo(-0.018 + i * 0.009, i % 2 ? -0.004 : 0.004);
  } else if (expr === 'smile') {
    g.moveTo(-0.018, -0.004);
    g.quadraticCurveTo(0, 0.016, 0.018, -0.004);
  } else {
    g.moveTo(-0.014, 0);
    g.quadraticCurveTo(0, fem ? 0.006 : 0.003, 0.014, 0);
  }
  g.lineWidth = 4 / SX;
  g.strokeStyle = ink;
  g.stroke();
}

/** Texture du visage pour un personnage et une expression (mise en cache). */
export function faceTexture(def, expr = 'neutral') {
  const key = `${def.id}|${expr}`;
  if (cache.has(key)) return cache.get(key);
  const look = def.look;
  const fem = look.body === 'f';
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  // Joues (blush) : ellipse rose et petits traits obliques, typiques du manga
  if (fem || expr === 'hurt' || expr === 'smile') {
    for (const o of [-1, 1]) {
      at(g, o * 0.1, -0.075, () => {
        g.fillStyle = 'rgba(255,120,140,0.35)';
        g.beginPath();
        g.ellipse(0, 0, 0.028, 0.012, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(220,80,110,0.55)';
        g.lineWidth = 2.5 / SX;
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(i * 0.012 - 0.004, 0.006);
          g.lineTo(i * 0.012 + 0.004, -0.006);
          g.stroke();
        }
      });
    }
  }
  for (const o of [-1, 1]) {
    at(g, o * 0.074, -0.012, () => eye(g, o, look, expr, fem));
    at(g, o * 0.072, 0.058, () => brow(g, o, look, expr));
  }
  // Nez : petite ombre
  at(g, 0, -0.058, () => {
    g.beginPath();
    g.moveTo(0.002, -0.012);
    g.lineTo(-0.004, 0.006);
    g.lineTo(0.004, 0.008);
    g.strokeStyle = shade(look.skin, 0.62);
    g.lineWidth = 3 / SX;
    g.lineCap = 'round';
    g.stroke();
  });
  at(g, 0, -0.112, () => mouth(g, expr, fem));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Emblème brodé (kanji dans un cercle), pour le dos et la poitrine des tenues. */
const emblemCache = new Map();
export function emblemTexture(char, color) {
  const key = `${char}|${color}`;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.beginPath();
  g.arc(0, 0, 112, 0, Math.PI * 2);
  g.fillStyle = '#f4f0e6';
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  g.font = '900 150px "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(char, 0, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  emblemCache.set(key, tex);
  return tex;
}
