import * as THREE from 'three';
import { normalFromHeight } from '../textures';

/**
 * Matériaux des personnages, peints par code : peau (pores, rougeurs, barbe naissante, rides), cheveux
 * (mèches, reflet anisotrope), tissus (coton, jean, laine, maille, costume, cuir, nylon), yeux (iris strié).
 */

type Painter = (g: CanvasRenderingContext2D, h: CanvasRenderingContext2D, w: number, hgt: number, rnd: () => number) => void;

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(key: string): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h;
}

/** Couleur CSS d'une `THREE.Color` (stockée en linéaire : on repasse en sRGB pour le canvas). */
function rgba(c: THREE.Color, mul = 1, a = 1): string {
  const s = c.clone().convertLinearToSRGB();
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * mul)));
  return `rgba(${f(s.r)},${f(s.g)},${f(s.b)},${a})`;
}

const cache = new Map<string, THREE.Material>();

/** Peint une texture couleur + relief et en tire une carte de normales. */
function paint(key: string, w: number, h: number, painter: Painter, bump: number, repeat = true): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  const hc = document.createElement('canvas');
  c.width = hc.width = w;
  c.height = hc.height = h;
  const g = c.getContext('2d');
  const hg = hc.getContext('2d', { willReadFrequently: true });
  if (g && hg) {
    hg.fillStyle = 'rgb(128,128,128)';
    hg.fillRect(0, 0, w, h);
    painter(g, hg, w, h, rng(hash(key)));
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  // `normalFromHeight` travaille sur un carré : on étire la hauteur si besoin.
  let heightCanvas = hc;
  if (w !== h) {
    heightCanvas = document.createElement('canvas');
    heightCanvas.width = heightCanvas.height = w;
    heightCanvas.getContext('2d')?.drawImage(hc, 0, 0, w, w);
  }
  const normalMap = new THREE.CanvasTexture(normalFromHeight(heightCanvas, bump));
  for (const t of [map, normalMap]) {
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return { map, normalMap };
}

function pores(g: CanvasRenderingContext2D, h: CanvasRenderingContext2D, w: number, hgt: number, rnd: () => number, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * hgt;
    const v = rnd();
    g.fillStyle = v > 0.5 ? `rgba(255,220,210,${0.05 * v})` : `rgba(90,30,20,${0.06 * (1 - v)})`;
    g.fillRect(x, y, 1.5, 1.5);
    h.fillStyle = `rgba(0,0,0,${0.35 * v})`;
    h.fillRect(x, y, 1, 1);
  }
}

export interface FaceLook {
  readonly tone: string;
  readonly age: number;
  readonly stubble: number;
  readonly blush: number;
  readonly freckles: boolean;
  readonly makeup: boolean;
}

/**
 * Peau du visage : la texture épouse la sphère sculptée de la tête (face avant à u = 0,25).
 * Rougeurs aux pommettes, ombre de barbe, rides selon l'âge, taches de rousseur, maquillage léger.
 */
export function faceSkin(f: FaceLook): THREE.MeshPhysicalMaterial {
  const key = `face|${f.tone}|${f.age}|${f.stubble}|${f.blush}|${f.freckles}|${f.makeup}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const tone = new THREE.Color(f.tone);
  const W = 512;
  const H = 256;
  const maps = paint(key, W, H, (g, h, w, hgt, rnd) => {
    g.fillStyle = rgba(tone);
    g.fillRect(0, 0, w, hgt);
    // Légères variations de teint.
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w;
      const y = rnd() * hgt;
      const r = 20 + rnd() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rnd() > 0.5 ? rgba(tone, 1.06, 0.25) : rgba(tone, 0.93, 0.25));
      gr.addColorStop(1, rgba(tone, 1, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const fx = w * 0.25;
    const yOf = (thetaPi: number) => thetaPi * hgt;
    // Pommettes et nez rosés.
    for (const side of [-1, 1]) {
      const x = fx + side * w * 0.085;
      const y = yOf(0.56);
      const gr = g.createRadialGradient(x, y, 0, x, y, 30);
      gr.addColorStop(0, `rgba(200,90,80,${0.1 * f.blush + (f.makeup ? 0.08 : 0)})`);
      gr.addColorStop(1, 'rgba(200,70,60,0)');
      g.fillStyle = gr;
      g.fillRect(x - 30, y - 30, 60, 60);
    }
    // Ombre des orbites.
    for (const side of [-1, 1]) {
      const x = fx + side * w * 0.055;
      const y = yOf(0.47);
      const gr = g.createRadialGradient(x, y, 0, x, y, 16);
      gr.addColorStop(0, f.makeup ? 'rgba(70,40,60,0.35)' : 'rgba(60,30,25,0.22)');
      gr.addColorStop(1, 'rgba(60,30,25,0)');
      g.fillStyle = gr;
      g.fillRect(x - 16, y - 16, 32, 32);
    }
    // Barbe naissante : points sombres sur la mâchoire, les joues basses et au-dessus de la lèvre.
    if (f.stubble > 0) {
      for (let i = 0; i < 9000 * f.stubble; i++) {
        const a = (rnd() - 0.5) * 0.42;
        const t = 0.6 + rnd() * 0.2;
        const x = fx + a * w;
        const y = yOf(t);
        // On épargne le menton haut et les pommettes.
        if (t < 0.64 && Math.abs(a) > 0.06 && Math.abs(a) < 0.15) continue;
        g.fillStyle = `rgba(25,18,14,${0.18 + rnd() * 0.25})`;
        g.fillRect(x, y, 1.2, 1.2);
        h.fillStyle = 'rgba(255,255,255,0.4)';
        h.fillRect(x, y, 1, 1);
      }
    }
    // Rides : front, pattes-d'oie, sillons nasogéniens.
    if (f.age > 0.3) {
      const a = (f.age - 0.3) / 0.7;
      g.strokeStyle = `rgba(90,45,35,${0.25 * a})`;
      h.strokeStyle = `rgba(0,0,0,${0.8 * a})`;
      for (const c of [g, h]) {
        c.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(fx - 42, yOf(0.3 + i * 0.025));
          c.quadraticCurveTo(fx, yOf(0.29 + i * 0.025), fx + 42, yOf(0.3 + i * 0.025));
          c.stroke();
        }
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.moveTo(fx + side * 50, yOf(0.47));
            c.lineTo(fx + side * (62 + i * 2), yOf(0.44 + i * 0.03));
            c.stroke();
          }
          c.beginPath();
          c.moveTo(fx + side * 16, yOf(0.54));
          c.quadraticCurveTo(fx + side * 28, yOf(0.6), fx + side * 24, yOf(0.66));
          c.stroke();
        }
      }
    }
    if (f.freckles) {
      for (let i = 0; i < 220; i++) {
        const x = fx + (rnd() - 0.5) * 120;
        const y = yOf(0.48 + rnd() * 0.12);
        g.fillStyle = `rgba(140,70,40,${0.2 + rnd() * 0.3})`;
        g.beginPath();
        g.arc(x, y, 0.8 + rnd(), 0, Math.PI * 2);
        g.fill();
      }
    }
    pores(g, h, w, hgt, rnd, 9000);
  }, 1.2, false);
  maps.map.wrapS = THREE.RepeatWrapping;
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.6,
    sheen: 0.12,
    sheenColor: new THREE.Color('#ffc8b8'),
    sheenRoughness: 0.7,
  });
  cache.set(key, m);
  return m;
}

/** Peau du corps (mains, bras, cou) : pores fins, sans les détails du visage. */
export function bodySkin(tone: string): THREE.MeshPhysicalMaterial {
  const key = `skin|${tone}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const c = new THREE.Color(tone);
  const maps = paint(key, 128, 128, (g, h, w, hgt, rnd) => {
    g.fillStyle = rgba(c);
    g.fillRect(0, 0, w, hgt);
    pores(g, h, w, hgt, rnd, 2600);
  }, 1);
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.62,
    sheen: 0.1,
    sheenColor: new THREE.Color('#ffc8b8'),
    sheenRoughness: 0.7,
  });
  cache.set(key, m);
  return m;
}

/** Lèvres : un peu plus sombres et rosées que la peau, plus brillantes. */
export function lipMaterial(tone: string, makeup: boolean): THREE.MeshPhysicalMaterial {
  const key = `lip|${tone}|${makeup}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const c = new THREE.Color(tone).lerp(new THREE.Color(makeup ? '#a0283a' : '#8a3a3a'), makeup ? 0.7 : 0.5).multiplyScalar(0.9);
  const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: makeup ? 0.25 : 0.4, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  cache.set(key, m);
  return m;
}

/** Cheveux : mèches peintes, reflet anisotrope le long des mèches. */
export function hairMaterial(color: string, curly = false): THREE.MeshPhysicalMaterial {
  const key = `hair|${color}|${curly}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const c = new THREE.Color(color);
  const maps = paint(key, 256, 256, (g, h, w, hgt, rnd) => {
    g.fillStyle = rgba(c);
    g.fillRect(0, 0, w, hgt);
    h.fillStyle = 'rgb(110,110,110)';
    h.fillRect(0, 0, w, hgt);
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * w;
      const v = rnd();
      const tone = 0.8 + v * 0.35;
      g.strokeStyle = rgba(c, tone, 0.45);
      h.strokeStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.35)`;
      for (const ctx of [g, h]) {
        ctx.lineWidth = 0.6 + rnd() * 1.1;
        ctx.beginPath();
        if (curly) {
          const y = rnd() * hgt;
          ctx.arc(x, y, 2 + rnd() * 4, rnd() * 6, rnd() * 6 + 3);
        } else {
          ctx.moveTo(x, -10);
          ctx.bezierCurveTo(x + (rnd() - 0.5) * 12, hgt * 0.35, x + (rnd() - 0.5) * 12, hgt * 0.65, x + (rnd() - 0.5) * 8, hgt + 10);
        }
        ctx.stroke();
      }
    }
  }, 2.5);
  maps.map.repeat.set(3, 1);
  maps.normalMap.repeat.set(3, 1);
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughness: 0.6,
    anisotropy: 0.4,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.2,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.25),
    sheenRoughness: 0.5,
  });
  cache.set(key, m);
  return m;
}

export type FabricKind = 'cotton' | 'denim' | 'wool' | 'knit' | 'suit' | 'leather' | 'nylon' | 'canvas';

const FABRIC_LOOK: Record<FabricKind, { rough: number; sheen: number; bump: number; repeat: number }> = {
  cotton: { rough: 0.9, sheen: 0.4, bump: 1.4, repeat: 4 },
  denim: { rough: 0.95, sheen: 0.3, bump: 2.2, repeat: 4 },
  wool: { rough: 1, sheen: 0.7, bump: 1.8, repeat: 3 },
  knit: { rough: 1, sheen: 0.6, bump: 3, repeat: 5 },
  suit: { rough: 0.7, sheen: 0.5, bump: 0.9, repeat: 6 },
  leather: { rough: 0.45, sheen: 0, bump: 1.6, repeat: 2 },
  nylon: { rough: 0.4, sheen: 0.2, bump: 1.2, repeat: 3 },
  canvas: { rough: 0.95, sheen: 0.2, bump: 2.4, repeat: 3 },
};

/** Tissu : trame propre à chaque matière (sergé du jean, mailles côtelées, chevrons du costume…). */
export function fabric(color: string, kind: FabricKind = 'cotton'): THREE.MeshPhysicalMaterial {
  const key = `fab|${color}|${kind}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const c = new THREE.Color(color);
  const look = FABRIC_LOOK[kind];
  const maps = paint(key, 128, 128, (g, h, w, hgt, rnd) => {
    g.fillStyle = rgba(c);
    g.fillRect(0, 0, w, hgt);
    switch (kind) {
      case 'denim':
        // Sergé : diagonales claires et sombres.
        for (let i = -hgt; i < w; i += 3) {
          for (const [ctx, col] of [[g, rgba(c, 1.25, 0.35)], [h, 'rgba(255,255,255,0.5)']] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + hgt, hgt);
            ctx.stroke();
          }
        }
        for (let i = 0; i < 400; i++) {
          g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
          g.fillRect(rnd() * w, rnd() * hgt, 4 + rnd() * 8, 1);
        }
        break;
      case 'knit':
        // Mailles en V, côtes verticales.
        for (let x = 0; x < w; x += 6) {
          for (let y = 0; y < hgt; y += 5) {
            for (const [ctx, col] of [[g, rgba(c, 1.15, 0.5)], [h, 'rgba(255,255,255,0.7)']] as const) {
              ctx.strokeStyle = col;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + 3, y + 4);
              ctx.lineTo(x + 6, y);
              ctx.stroke();
            }
          }
        }
        break;
      case 'suit':
        // Chevrons fins.
        for (let y = 0; y < hgt; y += 2) {
          for (let x = 0; x < w; x += 8) {
            const dir = Math.floor(x / 8) % 2 ? 1 : -1;
            g.strokeStyle = rgba(c, 1.2, 0.18);
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + 8, y + dir * 2);
            g.stroke();
          }
        }
        for (let i = 0; i < 2000; i++) {
          h.fillStyle = `rgba(255,255,255,${rnd() * 0.3})`;
          h.fillRect(rnd() * w, rnd() * hgt, 1, 1);
        }
        break;
      case 'leather':
        for (let i = 0; i < 2500; i++) {
          const x = rnd() * w;
          const y = rnd() * hgt;
          g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
          g.beginPath();
          g.arc(x, y, 1 + rnd() * 2, 0, Math.PI * 2);
          g.fill();
          h.fillStyle = `rgba(0,0,0,${rnd() * 0.5})`;
          h.fillRect(x, y, 1.5, 1.5);
        }
        break;
      default: {
        // Toile : trame et chaîne croisées, peluches.
        const step = kind === 'wool' ? 4 : kind === 'canvas' ? 3 : 2;
        for (let i = 0; i < w; i += step) {
          g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.05})`;
          g.fillRect(i, 0, 1, hgt);
          g.fillRect(0, i, w, 1);
          h.fillStyle = 'rgba(0,0,0,0.35)';
          h.fillRect(i, 0, 1, hgt);
          h.fillRect(0, i, w, 1);
        }
        for (let i = 0; i < (kind === 'wool' ? 1500 : 500); i++) {
          g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
          g.fillRect(rnd() * w, rnd() * hgt, 1 + rnd() * 2, 1);
        }
      }
    }
  }, look.bump);
  maps.map.repeat.set(look.repeat, look.repeat);
  maps.normalMap.repeat.set(look.repeat, look.repeat);
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughness: look.rough,
    sheen: look.sheen,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.3),
    sheenRoughness: 0.8,
  });
  cache.set(key, m);
  return m;
}

/** Blanc de l'œil (légèrement veiné) et iris strié avec pupille, sous une cornée brillante. */
export function eyeMaterials(iris: string): { sclera: THREE.MeshPhysicalMaterial; iris: THREE.MeshPhysicalMaterial } {
  const key = `eye|${iris}`;
  const hit = cache.get(key);
  if (hit) return hit as unknown as { sclera: THREE.MeshPhysicalMaterial; iris: THREE.MeshPhysicalMaterial };
  const scleraTex = paint(`${key}|s`, 64, 64, (g, _h, w, hgt, rnd) => {
    g.fillStyle = '#f2ede6';
    g.fillRect(0, 0, w, hgt);
    g.strokeStyle = 'rgba(190,60,60,0.25)';
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = rnd() * w;
      let y = rnd() * hgt;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 10;
        y += (rnd() - 0.5) * 10;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 0.5);
  const c = new THREE.Color(iris);
  const irisCanvas = document.createElement('canvas');
  irisCanvas.width = irisCanvas.height = 128;
  const g = irisCanvas.getContext('2d');
  if (g) {
    const r = rng(hash(key));
    g.fillStyle = '#0c0a09';
    g.fillRect(0, 0, 128, 128);
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 62);
    grad.addColorStop(0, rgba(c, 0.55));
    grad.addColorStop(0.35, rgba(c, 1.2));
    grad.addColorStop(0.85, rgba(c, 0.9));
    grad.addColorStop(1, rgba(c, 0.25));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    // Stries radiales et collerette.
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      g.strokeStyle = r() > 0.5 ? rgba(c, 1.6, 0.35) : 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18);
      g.lineTo(64 + Math.cos(a) * (40 + r() * 20), 64 + Math.sin(a) * (40 + r() * 20));
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 64, 61, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#050404';
    g.beginPath();
    g.arc(64, 64, 17, 0, Math.PI * 2);
    g.fill();
  }
  const irisTex = new THREE.CanvasTexture(irisCanvas);
  irisTex.colorSpace = THREE.SRGBColorSpace;
  const out = {
    sclera: new THREE.MeshPhysicalMaterial({ map: scleraTex.map, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2 }),
    iris: new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.32 }),
  };
  cache.set(key, out as unknown as THREE.Material);
  return out;
}
