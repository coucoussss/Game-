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
  const fierce = expr === 'fierce' || expr === 'angry' || expr === 'menace';
  const shock = expr === 'shock';
  // Forme en amande ; le regard combatif abaisse la paupière côté nez
  const topIn = fierce ? -h * 0.18 : shock ? -h * 0.55 : -h * 0.42;
  const topOut = fierce ? -h * 0.44 : shock ? -h * 0.55 : -h * 0.4;
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
  const ir = shock ? 0.55 : 1; // stupeur : iris rétréci au milieu du blanc de l'œil
  const grd = g.createLinearGradient(0, iy - h * 0.38, 0, iy + h * 0.38);
  grd.addColorStop(0, shade(iris, 0.25));
  grd.addColorStop(0.45, iris);
  grd.addColorStop(1, shade(iris, 1.3));
  g.beginPath();
  g.ellipse(ix, iy, w * 0.29 * ir, h * 0.4 * ir, 0, 0, Math.PI * 2);
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = lw(4);
  g.strokeStyle = shade(iris, 0.3);
  g.stroke();
  g.beginPath();
  g.ellipse(ix, iy + h * 0.02, w * 0.12 * ir, h * 0.2 * ir, 0, 0, Math.PI * 2);
  g.fillStyle = shade(iris, 0.18);
  g.fill();
  // Ombre de la paupière sur le haut de l'œil
  if (!shock) {
    g.fillStyle = 'rgba(40,20,60,0.35)';
    g.fillRect(-w, -h, w * 2, h * 0.62 + (fierce ? h * 0.15 : 0));
  }
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

/** Œil masculin d'anime : étroit et acéré, iris en partie caché par la paupière, trait épais sans cils recourbés. */
function eyeMale(g, o, look, expr) {
  if (!['neutral', 'fierce', 'angry', 'menace'].includes(expr)) { eye(g, o, look, expr, false); return; }
  const ink = '#15101c';
  const lw = (px) => px / SX;
  const iris = look.eyes || '#3a3a5a';
  const fierce = expr !== 'neutral';
  const w = 0.094;
  const h = fierce ? 0.046 : 0.056;
  const inX = -o * w * 0.5;
  const outX = o * w * 0.52;
  // Paupière supérieure presque droite, qui remonte vers un coin extérieur pointu
  const topIn = fierce ? -h * 0.05 : -h * 0.35;
  const top = () => {
    g.moveTo(inX, h * 0.2);
    g.bezierCurveTo(inX + o * w * 0.15, topIn, outX - o * w * 0.35, -h * 0.75, outX, -h * 0.38);
  };
  const almond = () => {
    g.beginPath();
    top();
    g.bezierCurveTo(outX - o * w * 0.12, h * 0.55, inX + o * w * 0.3, h * 0.7, inX, h * 0.2);
    g.closePath();
  };
  almond();
  g.fillStyle = '#e6e4ee';
  g.fill();
  g.save();
  almond();
  g.clip();
  const ix = -o * w * 0.03;
  const iy = h * 0.22;
  const grd = g.createLinearGradient(0, iy - h * 0.7, 0, iy + h * 0.7);
  grd.addColorStop(0, shade(iris, 0.2));
  grd.addColorStop(0.55, shade(iris, 0.85));
  grd.addColorStop(1, shade(iris, 1.18));
  g.beginPath();
  g.ellipse(ix, iy, w * 0.21, h * 0.78, 0, 0, Math.PI * 2);
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = lw(3);
  g.strokeStyle = shade(iris, 0.25);
  g.stroke();
  g.beginPath();
  g.ellipse(ix, iy + h * 0.05, w * 0.075, h * 0.42, 0, 0, Math.PI * 2);
  g.fillStyle = shade(iris, 0.12);
  g.fill();
  // Ombre de la paupière, plus marquée chez l'homme
  g.fillStyle = 'rgba(30,15,40,0.45)';
  g.fillRect(-w, -h * 2, w * 2, h * 1.95 + (fierce ? h * 0.2 : 0));
  g.fillStyle = '#efeff6';
  g.beginPath();
  g.ellipse(ix - o * w * 0.07, iy - h * 0.18, w * 0.05, h * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Trait supérieur épais, petit crochet au coin extérieur (pas d'aile)
  g.beginPath();
  top();
  g.lineTo(outX + o * w * 0.06, -h * 0.2);
  g.strokeStyle = ink;
  g.lineWidth = lw(10);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
  // Trait inférieur court, sous la moitié extérieure
  g.beginPath();
  g.moveTo(o * w * 0.02, h * 0.62);
  g.quadraticCurveTo(o * w * 0.32, h * 0.55, outX - o * w * 0.04, -h * 0.1);
  g.lineWidth = lw(3.5);
  g.strokeStyle = ink;
  g.stroke();
  // Pli de paupière
  g.beginPath();
  g.moveTo(inX + o * w * 0.3, topIn - h * 0.55);
  g.quadraticCurveTo(o * w * 0.1, -h * 1.15, outX - o * w * 0.08, -h * 0.9);
  g.lineWidth = lw(2.5);
  g.strokeStyle = 'rgba(21,16,28,0.55)';
  g.stroke();
}

/** Sourcil masculin : épais, presque droit, proche de l'œil. */
function browMale(g, o, look, expr) {
  const hair = shade(look.hair || '#222', 0.55);
  const tilt = expr === 'fierce' ? 0.016 : expr === 'hurt' ? -0.01 : 0.004;
  g.beginPath();
  g.moveTo(-o * 0.04, tilt);
  g.lineTo(o * 0.048, -0.008);
  g.lineTo(o * 0.05, -0.001);
  g.lineTo(-o * 0.038, tilt + 0.014);
  g.closePath();
  g.fillStyle = hair;
  g.fill();
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
  if (expr === 'angry') {
    // Dents serrées, lèvres retroussées
    const w = 0.03;
    const hh = 0.014;
    g.beginPath();
    g.moveTo(-w, -hh * 0.4);
    g.quadraticCurveTo(0, -hh * 0.9, w, -hh * 0.4);
    g.lineTo(w * 0.9, hh * 0.7);
    g.quadraticCurveTo(0, hh * 1.1, -w * 0.9, hh * 0.7);
    g.closePath();
    g.fillStyle = '#f6f4f8';
    g.fill();
    g.lineWidth = 3.5 / SX;
    g.strokeStyle = ink;
    g.stroke();
    g.beginPath();
    g.moveTo(-w * 0.95, hh * 0.15); g.lineTo(w * 0.95, hh * 0.15);
    for (let i = -2; i <= 2; i++) { g.moveTo(i * w * 0.36, -hh * 0.6); g.lineTo(i * w * 0.36, hh * 0.85); }
    g.lineWidth = 2 / SX;
    g.stroke();
    return;
  }
  if (expr === 'shock') {
    g.beginPath();
    g.ellipse(0, 0.004, 0.011, 0.014, 0, 0, Math.PI * 2);
    g.fillStyle = '#5a1420';
    g.fill();
    g.lineWidth = 3 / SX;
    g.strokeStyle = ink;
    g.stroke();
    return;
  }
  if (expr === 'menace') {
    // Rictus : un coin de la bouche relevé
    g.beginPath();
    g.moveTo(-0.022, 0.002);
    g.quadraticCurveTo(0.004, 0.006, 0.024, -0.01);
    g.lineWidth = 4 / SX;
    g.strokeStyle = ink;
    g.stroke();
    return;
  }
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
  } else if (fem) {
    g.moveTo(-0.014, 0);
    g.quadraticCurveTo(0, 0.006, 0.014, 0);
  } else {
    // Bouche masculine : trait plus large, coins légèrement tombants
    g.moveTo(-0.022, 0.003);
    g.quadraticCurveTo(0, -0.002, 0.022, 0.003);
  }
  g.lineWidth = 4 / SX;
  g.strokeStyle = ink;
  g.stroke();
}

/**
 * Signes du manga dessinés sur le visage : veine de colère sur le front, goutte de sueur sur la
 * tempe, ombre sur les yeux (regard menaçant) avec des pupilles qui luisent.
 */
function mangaMarks(g, look, expr) {
  if (expr === 'angry') {
    // Veine de colère « ╬ » : quatre arcs qui se tournent le dos
    at(g, 0.125, 0.062, () => {
      g.strokeStyle = '#d8203a';
      g.lineWidth = 6 / SX;
      g.lineCap = 'round';
      const r = 0.012;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath();
        g.arc(sx * r * 1.5, sy * r * 1.5, r, sx > 0 ? (sy > 0 ? Math.PI : Math.PI * 1.5) : (sy > 0 ? Math.PI * 1.5 : 0), sx > 0 ? (sy > 0 ? Math.PI * 1.5 : Math.PI * 2) : (sy > 0 ? Math.PI * 2 : Math.PI * 0.5));
        g.stroke();
      }
    });
  }
  if (expr === 'shock' || expr === 'hurt') {
    // Goutte de sueur sur la tempe
    at(g, -0.135, 0.0, () => {
      g.beginPath();
      g.moveTo(0, -0.03);
      g.quadraticCurveTo(0.018, 0.0, 0.012, 0.012);
      g.arc(0, 0.012, 0.012, 0, Math.PI);
      g.quadraticCurveTo(-0.018, 0.0, 0, -0.03);
      g.fillStyle = 'rgba(170,220,255,0.9)';
      g.fill();
      g.strokeStyle = '#2a5a8a';
      g.lineWidth = 3 / SX;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(-0.004, 0.008, 0.003, 0.006, 0.3, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (expr === 'menace') {
    // Ombre portée sur le haut du visage, d'où ne ressortent que deux pupilles lumineuses
    at(g, 0, 0.02, () => {
      const grd = g.createLinearGradient(0, -0.09, 0, 0.05);
      grd.addColorStop(0, 'rgba(20,6,30,0.85)');
      grd.addColorStop(0.65, 'rgba(20,6,30,0.75)');
      grd.addColorStop(1, 'rgba(20,6,30,0)');
      g.fillStyle = grd;
      g.fillRect(-0.2, -0.09, 0.4, 0.14);
    });
    for (const o of [-1, 1]) {
      at(g, o * 0.075, -0.004, () => {
        g.save();
        g.shadowColor = look.eyes || '#ffffff';
        g.shadowBlur = 25;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(0, 0, 0.012, 0.009, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });
    }
  }
}

/** Texture du visage pour un personnage et une expression (mise en cache). */
export function faceTexture(def, expr = 'neutral') {
  const key = `${def.id}|${expr}`;
  if (cache.has(key)) return cache.get(key);
  const look = def.look;
  if (look.face === 'demon') {
    const map = { angry: 'fierce', menace: 'fierce', shock: 'hurt' };
    return demonFace(look, map[expr] || expr, key);
  }
  const fem = look.body === 'f';
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  // Joues (blush) : ellipse rose et petits traits obliques, typiques du manga
  if (fem) {
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
    if (fem) {
      at(g, o * 0.074, -0.012, () => eye(g, o, look, expr, fem));
      at(g, o * 0.072, 0.058, () => brow(g, o, look, expr));
    } else {
      at(g, o * 0.076, -0.006, () => eyeMale(g, o, look, expr));
      at(g, o * 0.074, 0.042, () => browMale(g, o, look, expr));
    }
  }
  if (!fem) {
    // Arête du nez (ombre d'un côté) et narine
    at(g, 0, -0.045, () => {
      g.beginPath();
      g.moveTo(-0.004, -0.03);
      g.quadraticCurveTo(-0.007, 0.0, 0.002, 0.026);
      g.lineTo(0.009, 0.022);
      g.strokeStyle = shade(look.skin, 0.55);
      g.lineWidth = 3 / SX;
      g.lineCap = 'round';
      g.stroke();
    });
  } else at(g, 0, -0.058, () => {
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
  mangaMarks(g, look, expr);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/**
 * Visage de démon ou de fléau : yeux en fente qui luisent (sans blanc ni pupille ronde),
 * sourcils en pointe, marques sur les joues et gueule garnie de crocs.
 */
function demonFace(look, expr, key) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const ink = '#0c0610';
  const glow = look.eyes || '#ff2a3a';
  const lw = (px) => px / SX;
  const closed = expr === 'blink' || expr === 'ko';
  // Marques rituelles sur les joues
  for (const o of [-1, 1]) {
    at(g, o * 0.105, -0.06, () => {
      g.strokeStyle = look.marks || shade(glow, 0.55);
      g.lineWidth = lw(5);
      g.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(-o * 0.012, -0.01 + i * 0.016);
        g.lineTo(o * 0.02, 0.0 + i * 0.016);
        g.stroke();
      }
    });
  }
  for (const o of [-1, 1]) {
    at(g, o * 0.074, -0.008, () => {
      const w = 0.1;
      const h = expr === 'fierce' ? 0.034 : expr === 'hurt' ? 0.028 : 0.042;
      if (closed) {
        g.beginPath();
        if (expr === 'ko') {
          g.moveTo(-w * 0.3, -h * 0.6); g.lineTo(w * 0.3, h * 0.6);
          g.moveTo(w * 0.3, -h * 0.6); g.lineTo(-w * 0.3, h * 0.6);
        } else {
          g.moveTo(-o * w * 0.45, 0); g.quadraticCurveTo(0, h * 0.5, o * w * 0.5, -h * 0.4);
        }
        g.strokeStyle = ink;
        g.lineWidth = lw(8);
        g.lineCap = 'round';
        g.stroke();
        return;
      }
      // Fente inclinée vers le haut à l'extérieur
      const shape = () => {
        g.beginPath();
        g.moveTo(-o * w * 0.5, h * 0.35);
        g.quadraticCurveTo(-o * w * 0.05, -h * 1.1, o * w * 0.55, -h * 0.9);
        g.quadraticCurveTo(o * w * 0.1, h * 0.9, -o * w * 0.5, h * 0.35);
        g.closePath();
      };
      // Halo lumineux
      g.save();
      g.shadowColor = glow;
      g.shadowBlur = 40;
      shape();
      g.fillStyle = glow;
      g.fill();
      g.restore();
      g.save();
      shape();
      g.clip();
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.6);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.25, shade(glow, 1.5));
      grd.addColorStop(1, glow);
      g.fillStyle = grd;
      g.fillRect(-w, -h * 2, w * 2, h * 4);
      // Pupille fendue verticale
      g.beginPath();
      g.ellipse(o * w * 0.04, 0, w * 0.035, h * 0.95, 0, 0, Math.PI * 2);
      g.fillStyle = ink;
      g.fill();
      g.restore();
      shape();
      g.strokeStyle = ink;
      g.lineWidth = lw(7);
      g.lineJoin = 'round';
      g.stroke();
    });
    // Sourcil en pointe, très incliné
    at(g, o * 0.072, 0.05, () => {
      const tilt = expr === 'fierce' ? 0.024 : expr === 'hurt' ? -0.006 : 0.014;
      g.beginPath();
      g.moveTo(-o * 0.045, tilt);
      g.lineTo(o * 0.06, -0.02);
      g.lineTo(-o * 0.04, tilt + 0.016);
      g.closePath();
      g.fillStyle = ink;
      g.fill();
    });
  }
  // Gueule : sourire carnassier, crocs blancs
  at(g, 0, -0.112, () => {
    const open = expr === 'fierce' || expr === 'hurt' ? 1 : expr === 'smile' ? 0.8 : 0.45;
    const w = 0.075;
    const hh = 0.03 * open;
    g.beginPath();
    g.moveTo(-w, -0.012);
    g.quadraticCurveTo(0, hh * 2.2, w, -0.012);
    g.quadraticCurveTo(0, hh * 0.4, -w, -0.012);
    g.closePath();
    g.fillStyle = '#3a0612';
    g.fill();
    g.fillStyle = '#f4f0e8';
    for (let i = -3; i <= 3; i++) {
      const x = (i / 3.4) * w;
      const top = -0.008 + Math.abs(i / 3.4) * 0.002;
      const len = (Math.abs(i) === 2 ? 0.024 : 0.012) * (0.6 + open * 0.4);
      g.beginPath();
      g.moveTo(x - 0.007, top);
      g.lineTo(x + 0.007, top);
      g.lineTo(x, top + len);
      g.closePath();
      g.fill();
    }
    g.beginPath();
    g.moveTo(-w, -0.012);
    g.quadraticCurveTo(0, hh * 2.2, w, -0.012);
    g.strokeStyle = ink;
    g.lineWidth = lw(5);
    g.stroke();
  });
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
