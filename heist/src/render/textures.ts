import * as THREE from 'three';

/**
 * Textures générées par code : une couleur et un relief par matière, d'où l'on tire une carte de normales.
 * Tout est déterministe (générateur à graine) : le décor est identique d'une partie à l'autre.
 */

export type SurfaceKind =
  | 'brick'
  | 'concrete'
  | 'plaster'
  | 'stone'
  | 'metal'
  | 'asphalt'
  | 'pavers'
  | 'tile'
  | 'wood'
  | 'marble'
  | 'fabric'
  | 'roof'
  | 'gravel';

type Ctx = CanvasRenderingContext2D;
type Painter = (g: Ctx, h: Ctx, size: number, color: THREE.Color, rnd: () => number) => void;

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

/** Couleur CSS d'une `THREE.Color` (stockée en linéaire : on repasse en sRGB pour le canvas). */
function css(c: THREE.Color, mul = 1, alpha = 1): string {
  const s = c.clone().convertLinearToSRGB();
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * mul)));
  return `rgba(${f(s.r)},${f(s.g)},${f(s.b)},${alpha})`;
}

function gray(v: number, alpha = 1): string {
  const x = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgba(${x},${x},${x},${alpha})`;
}

/** Grain fin : petites taches claires et sombres, sur la couleur et (plus discrètement) sur le relief. */
function speckle(g: Ctx, h: Ctx, size: number, rnd: () => number, count: number, strength: number, dot = 2): void {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const v = rnd();
    const s = dot * (0.5 + rnd());
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${strength * (v - 0.5)})` : `rgba(0,0,0,${strength * (0.5 - v) * 1.4})`;
    g.fillRect(x, y, s, s);
    h.fillStyle = gray(v, strength * 0.9);
    h.fillRect(x, y, s, s);
  }
}

/** Grandes taches diffuses (salissures, coulures). */
function stains(g: Ctx, size: number, rnd: () => number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = size * (0.08 + rnd() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.35;
    grad.addColorStop(0, dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    // Répété sur les bords pour que la texture se raccorde.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
}

function crack(g: Ctx, h: Ctx, size: number, rnd: () => number): void {
  let x = rnd() * size;
  let y = rnd() * size;
  let a = rnd() * Math.PI * 2;
  for (const c of [g, h]) {
    c.strokeStyle = c === g ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.45)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(x, y);
  }
  for (let i = 0; i < 14; i++) {
    a += (rnd() - 0.5) * 1.1;
    x += Math.cos(a) * size * 0.012;
    y += Math.sin(a) * size * 0.012;
    g.lineTo(x, y);
    h.lineTo(x, y);
  }
  g.stroke();
  h.stroke();
}

const painters: Record<SurfaceKind, Painter> = {
  brick(g, h, size, color, rnd) {
    g.fillStyle = '#6f6a62';
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.25);
    h.fillRect(0, 0, size, size);
    const rows = 8;
    const bh = size / rows;
    const bw = size / 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : bw / 2;
      for (let c = -1; c < 5; c++) {
        const tone = 0.78 + rnd() * 0.4;
        const x = c * bw + off + 1.5;
        const y = r * bh + 1.5;
        g.fillStyle = css(color, tone);
        g.fillRect(x, y, bw - 3, bh - 3);
        // Arête éclairée en haut, ombrée en bas.
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(x, y, bw - 3, 2);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x, y + bh - 5, bw - 3, 2);
        h.fillStyle = gray(0.7 + rnd() * 0.2);
        h.fillRect(x, y, bw - 3, bh - 3);
      }
    }
    speckle(g, h, size, rnd, 2600, 0.22, 1.5);
    stains(g, size, rnd, 6, 0.16);
  },
  concrete(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.5);
    h.fillRect(0, 0, size, size);
    speckle(g, h, size, rnd, 5200, 0.2, 1.6);
    stains(g, size, rnd, 9, 0.14);
    // Joints de coffrage.
    for (const c of [g, h]) {
      c.fillStyle = c === g ? 'rgba(0,0,0,0.22)' : gray(0.2);
      c.fillRect(0, 0, size, 2);
      c.fillRect(0, 0, 2, size);
    }
    // Trous de banche.
    for (let i = 0; i < 4; i++) {
      const x = size * (0.25 + (i % 2) * 0.5);
      const y = size * (0.25 + Math.floor(i / 2) * 0.5);
      for (const c of [g, h]) {
        c.fillStyle = c === g ? 'rgba(0,0,0,0.35)' : gray(0.1);
        c.beginPath();
        c.arc(x, y, size * 0.012, 0, Math.PI * 2);
        c.fill();
      }
    }
    crack(g, h, size, rnd);
  },
  plaster(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.5);
    h.fillRect(0, 0, size, size);
    speckle(g, h, size, rnd, 7000, 0.1, 1.2);
    stains(g, size, rnd, 5, 0.06);
    crack(g, h, size, rnd);
  },
  stone(g, h, size, color, rnd) {
    g.fillStyle = css(color, 0.55);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.2);
    h.fillRect(0, 0, size, size);
    const rows = 4;
    const bh = size / rows;
    const bw = size / 2;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : bw / 2;
      for (let c = -1; c < 3; c++) {
        const tone = 0.9 + rnd() * 0.2;
        const x = c * bw + off + 2;
        const y = r * bh + 2;
        g.fillStyle = css(color, tone);
        g.fillRect(x, y, bw - 4, bh - 4);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x, y, bw - 4, 3);
        g.fillStyle = 'rgba(0,0,0,0.14)';
        g.fillRect(x, y + bh - 7, bw - 4, 3);
        h.fillStyle = gray(0.75 + rnd() * 0.1);
        h.fillRect(x, y, bw - 4, bh - 4);
      }
    }
    speckle(g, h, size, rnd, 3000, 0.14, 1.5);
    stains(g, size, rnd, 5, 0.1);
  },
  metal(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    const ridges = 16;
    const w = size / ridges;
    for (let i = 0; i < ridges; i++) {
      const grad = h.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      grad.addColorStop(0, gray(0.2));
      grad.addColorStop(0.5, gray(0.9));
      grad.addColorStop(1, gray(0.2));
      h.fillStyle = grad;
      h.fillRect(i * w, 0, w, size);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(i * w + w * 0.35, 0, w * 0.3, size);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(i * w, 0, w * 0.12, size);
    }
    // Rouille et coulures.
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      g.fillStyle = `rgba(120,60,25,${0.08 + rnd() * 0.12})`;
      g.fillRect(x, y, 2 + rnd() * 4, 10 + rnd() * 50);
    }
    speckle(g, h, size, rnd, 1200, 0.12, 1.5);
  },
  asphalt(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.5);
    h.fillRect(0, 0, size, size);
    speckle(g, h, size, rnd, 9000, 0.3, 1.4);
    stains(g, size, rnd, 8, 0.2);
    for (let i = 0; i < 3; i++) crack(g, h, size, rnd);
  },
  pavers(g, h, size, color, rnd) {
    g.fillStyle = css(color, 0.5);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.15);
    h.fillRect(0, 0, size, size);
    const n = 4;
    const s = size / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        g.fillStyle = css(color, 0.88 + rnd() * 0.22);
        g.fillRect(c * s + 1.5, r * s + 1.5, s - 3, s - 3);
        h.fillStyle = gray(0.7 + rnd() * 0.15);
        h.fillRect(c * s + 1.5, r * s + 1.5, s - 3, s - 3);
      }
    }
    speckle(g, h, size, rnd, 4200, 0.2, 1.5);
    stains(g, size, rnd, 6, 0.14);
    // Chewing-gums écrasés.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(20,20,20,0.35)';
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, 2 + rnd() * 2, 0, Math.PI * 2);
      g.fill();
    }
  },
  tile(g, h, size, color, rnd) {
    g.fillStyle = '#5c5a55';
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.2);
    h.fillRect(0, 0, size, size);
    const n = 4;
    const s = size / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const alt = (r + c) % 2 === 0 ? 1 : 0.86;
        g.fillStyle = css(color, alt * (0.96 + rnd() * 0.08));
        g.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
        h.fillStyle = gray(0.8);
        h.fillRect(c * s + 1, r * s + 1, s - 2, s - 2);
      }
    }
    speckle(g, h, size, rnd, 1500, 0.08, 1.2);
    stains(g, size, rnd, 4, 0.08);
  },
  wood(g, h, size, color, rnd) {
    const planks = 6;
    const pw = size / planks;
    for (let i = 0; i < planks; i++) {
      const tone = 0.82 + rnd() * 0.36;
      g.fillStyle = css(color, tone);
      g.fillRect(i * pw, 0, pw, size);
      h.fillStyle = gray(0.6 + rnd() * 0.15);
      h.fillRect(i * pw, 0, pw, size);
      // Veines.
      for (let k = 0; k < 14; k++) {
        const x = i * pw + rnd() * pw;
        g.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`;
        g.lineWidth = 0.6 + rnd();
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (rnd() - 0.5) * 6, size * 0.3, x + (rnd() - 0.5) * 6, size * 0.7, x, size);
        g.stroke();
      }
      // Joints entre lames, et abouts décalés.
      for (const c of [g, h]) {
        c.fillStyle = c === g ? 'rgba(0,0,0,0.4)' : gray(0.1);
        c.fillRect(i * pw, 0, 1.5, size);
        c.fillRect(i * pw, ((i * 0.37) % 1) * size, pw, 1.5);
      }
      if (rnd() > 0.5) {
        const kx = i * pw + pw * (0.3 + rnd() * 0.4);
        const ky = rnd() * size;
        g.fillStyle = 'rgba(40,22,10,0.5)';
        g.beginPath();
        g.ellipse(kx, ky, 2.5, 4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
  marble(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.6);
    h.fillRect(0, 0, size, size);
    stains(g, size, rnd, 10, 0.1);
    for (let i = 0; i < 9; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      let a = rnd() * Math.PI * 2;
      g.strokeStyle = `rgba(70,70,80,${0.12 + rnd() * 0.2})`;
      g.lineWidth = 0.5 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 20; k++) {
        a += (rnd() - 0.5) * 0.8;
        x += Math.cos(a) * size * 0.05;
        y += Math.sin(a) * size * 0.05;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Dalles.
    for (const c of [g, h]) {
      c.fillStyle = c === g ? 'rgba(0,0,0,0.3)' : gray(0.2);
      c.fillRect(0, 0, size, 1.5);
      c.fillRect(0, 0, 1.5, size);
      c.fillRect(size / 2, 0, 1.5, size);
      c.fillRect(0, size / 2, size, 1.5);
    }
  },
  fabric(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.5);
    h.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 3) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.05})`;
      g.fillRect(i, 0, 1, size);
      g.fillRect(0, i, size, 1);
      h.fillStyle = gray(0.25, 0.6);
      h.fillRect(i, 0, 1, size);
      h.fillRect(0, i, size, 1);
    }
    speckle(g, h, size, rnd, 1500, 0.08, 1);
  },
  roof(g, h, size, color, rnd) {
    g.fillStyle = css(color);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.5);
    h.fillRect(0, 0, size, size);
    speckle(g, h, size, rnd, 8000, 0.25, 2);
    stains(g, size, rnd, 8, 0.2);
    for (const c of [g, h]) {
      c.fillStyle = c === g ? 'rgba(0,0,0,0.3)' : gray(0.3);
      c.fillRect(0, size / 2, size, 2);
    }
  },
  gravel(g, h, size, color, rnd) {
    g.fillStyle = css(color, 0.7);
    g.fillRect(0, 0, size, size);
    h.fillStyle = gray(0.3);
    h.fillRect(0, 0, size, size);
    for (let i = 0; i < 2200; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1 + rnd() * 2.6;
      const tone = 0.7 + rnd() * 0.7;
      g.fillStyle = css(color, tone);
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      g.fill();
      h.fillStyle = gray(0.4 + rnd() * 0.6);
      h.beginPath();
      h.arc(x, y, r, 0, Math.PI * 2);
      h.fill();
    }
    stains(g, size, rnd, 6, 0.2);
  },
};

/** Carte de normales tirée d'une carte de relief (filtre de Sobel, bords raccordés). */
export function normalFromHeight(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')?.getImageData(0, 0, size, size).data;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');
  if (!src || !ctx) return out;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number): number => (src[(((y + size) % size) * size + ((x + size) % size)) * 4] ?? 0) / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len) * 127 + 128;
      img.data[i + 1] = (dy / len) * 127 + 128;
      img.data[i + 2] = (1 / len) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export interface SurfaceMaps {
  readonly map: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
}

const cache = new Map<string, SurfaceMaps>();
const BUMP: Record<SurfaceKind, number> = {
  brick: 3.5, concrete: 1.6, plaster: 1.2, stone: 3, metal: 3, asphalt: 2.4, pavers: 2.6,
  tile: 2, wood: 1.6, marble: 0.6, fabric: 1.8, roof: 2, gravel: 3.2,
};

/** Cartes de couleur et de normales d'une matière teintée. */
export function surfaceMaps(kind: SurfaceKind, color: string, size = 256): SurfaceMaps {
  const key = `${kind}|${color}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const height = document.createElement('canvas');
  canvas.width = canvas.height = height.width = height.height = size;
  const g = canvas.getContext('2d');
  const h = height.getContext('2d', { willReadFrequently: true });
  if (g && h) {
    let seed = 7;
    for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    painters[kind](g, h, size, new THREE.Color(color), rng(seed));
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalFromHeight(height, BUMP[kind]));
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  const maps = { map, normalMap };
  cache.set(key, maps);
  return maps;
}

/** Panneau peint : lignes de texte centrées sur un fond uni, avec un liseré. */
export function signTexture(lines: readonly string[], bg: string, fg: string, w = 512, h = 128, font = 'bold'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(2, h * 0.03);
    g.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
    g.globalAlpha = 1;
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const first = Math.floor(h / (lines.length + 0.9));
    lines.forEach((line, i) => {
      const size = i === 0 ? first : Math.floor(first * 0.62);
      g.font = `${font} ${size}px Georgia, 'Times New Roman', serif`;
      let width = g.measureText(line).width;
      let s = size;
      while (width > w * 0.86 && s > 8) {
        s -= 2;
        g.font = `${font} ${s}px Georgia, 'Times New Roman', serif`;
        width = g.measureText(line).width;
      }
      g.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1) + (i === 0 ? -h * 0.02 : h * 0.04));
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Halo doux (disque dégradé), pour les lueurs de lampes et les flaques de lumière au sol. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
