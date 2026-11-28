import * as THREE from 'three';
import { propRect } from '../data';
import { WALL_THICKNESS } from '../data';
import type { BuildingDef, DoorDef, LevelDef, OpeningDef, PropKind, Rect } from '../data/types';
import { bake, box, chrome, cyl, flat, glass, mesh, metalDark, put, rbox, steel, surface, tbox, tube } from './build';
import { makeProp, makeStreetLamp, makeWallLamp } from './models/props';
import { signTexture, type SurfaceKind } from './textures';

/** Meubles animés par `LevelView` : ils ne font pas partie du décor figé. */
export const DYNAMIC_PROPS = new Set(['safe', 'cash-pallet', 'display-case']);

/** Hauteur des baies vitrées (allège, imposte). */
const SILL = 0.65;
const GLASS_TOP = 2.6;

export interface LightSource {
  readonly pos: THREE.Vector3;
  readonly color: THREE.Color;
  /** Portée en mètres. */
  readonly range: number;
  /** Intensité de base ; multipliée par `level` à chaque image. */
  readonly power: number;
  level: number;
  /** Groupe d'appartenance : site, `street`, `alley`, `hideout`, `fence`. */
  readonly tag: string;
}

/** Ce que `LevelView` doit pouvoir faire varier dans le décor. */
export interface CityHandles {
  readonly lights: LightSource[];
  /** Matériaux qui s'allument la nuit (fenêtres, enseignes de rue, lampadaires). */
  readonly nightGlow: THREE.MeshStandardMaterial[];
  /** Matériaux d'éclairage et d'enseigne propres à chaque site (éteints quand on coupe le courant). */
  readonly sitePower: Map<string, THREE.MeshStandardMaterial[]>;
  readonly skyline: THREE.MeshStandardMaterial;
}

const STYLE_SURFACE: Record<BuildingDef['style'], SurfaceKind> = {
  brick: 'brick',
  concrete: 'concrete',
  plaster: 'plaster',
  stone: 'stone',
  metal: 'metal',
};

const INTERIOR: Record<string, { wall: string; kind: SurfaceKind; ceiling: string; wainscot?: string }> = {
  hideout: { wall: '#7a7268', kind: 'concrete', ceiling: '#5a5550' },
  store: { wall: '#d9d2c0', kind: 'plaster', ceiling: '#e8e6e0' },
  jewelry: { wall: '#e6dccb', kind: 'plaster', ceiling: '#f2ece0', wainscot: '#3d2a1c' },
  bank: { wall: '#e2dccf', kind: 'plaster', ceiling: '#f0ece4', wainscot: '#d8d2c6' },
};

const SITE_SIGNS: Record<string, { lines: string[]; bg: string; fg: string }> = {
  store: { lines: ['SUPÉRETTE LUMIÈRE', 'ouvert de 8 h à 22 h'], bg: '#1d3b2a', fg: '#e8f5c8' },
  jewelry: { lines: ['BIJOUTERIE AURORE', 'Joaillier · de 10 h à 19 h'], bg: '#16110c', fg: '#e3c46a' },
  bank: { lines: ['BANQUE CENTRALE DU CRÉDIT', 'Guichets ouverts de 9 h à 17 h'], bg: '#c9c4b6', fg: '#2a2620' },
};

const SHOPS = ['PRESSING', 'TABAC · PRESSE', 'BOULANGERIE', 'PHARMACIE', 'LAVERIE', 'BAR LE ZINC', 'COIFFURE', 'PIZZERIA', 'CORDONNERIE', 'FLEURISTE', 'QUINCAILLERIE', 'ÉPICERIE FINE'];

function rnd(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pavé plein défini par un rectangle au sol, entre deux hauteurs. */
function slab(r: Rect, y0: number, y1: number, mat: THREE.Material, tile = 2): THREE.Mesh {
  const w = r.max[0] - r.min[0];
  const d = r.max[1] - r.min[1];
  return put(tbox(w, y1 - y0, d, mat, tile), (r.min[0] + r.max[0]) / 2, (y0 + y1) / 2, (r.min[1] + r.max[1]) / 2);
}

function rect(x0: number, z0: number, x1: number, z1: number): Rect {
  return { min: [Math.min(x0, x1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(z0, z1)] };
}

/** Texture de fenêtres pour l'horizon : une grille de carreaux, certains allumés. */
function skylineTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    const r = rnd(99);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = r();
        g.fillStyle = v > 0.72 ? `rgb(${230 + r() * 25},${170 + r() * 50},${90 + r() * 60})` : v > 0.66 ? '#8fb0d0' : '#0b0d10';
        g.fillRect(x * 16 + 4, y * 16 + 4, 8, 9);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class CityView {
  readonly handles: CityHandles;
  private readonly root = new THREE.Group();
  private readonly windowLit = flat('#ffd89a', { rough: 0.3, emissive: '#ffb860', glow: 0 });
  private readonly windowWarm = flat('#9fc4e0', { rough: 0.3, emissive: '#8ab8ff', glow: 0 });
  private readonly windowDark = flat('#1b2430', { rough: 0.06, metal: 0.7 });
  private readonly lampGlass = flat('#fff3d0', { emissive: '#ffd890', glow: 0 });

  constructor(
    scene: THREE.Scene,
    private readonly level: LevelDef,
    propKinds: ReadonlyMap<string, PropKind>,
  ) {
    const skylineMap = skylineTexture();
    const skyline = new THREE.MeshStandardMaterial({ color: '#2a2e36', map: skylineMap, emissiveMap: skylineMap, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.9 });
    this.handles = {
      lights: [],
      nightGlow: [this.windowLit, this.windowWarm, this.lampGlass],
      sitePower: new Map(),
      skyline,
    };

    this.buildGround();
    for (const b of level.buildings) {
      if (b.style === 'metal') this.buildFence(b);
      else if (b.solid) this.buildBlock(b);
      else this.buildShell(b);
    }
    for (const p of level.props) {
      if (DYNAMIC_PROPS.has(p.type)) continue;
      const kind = propKinds.get(p.type);
      if (!kind) continue;
      const r = propRect(p.pos, kind, p.rot);
      const m = makeProp(p.type, p.variant ?? 0);
      // Les véhicules sont modelés le long de x ; les meubles, face à +z.
      const rot = p.type === 'car' || p.type === 'van' ? (p.rot ?? 0) : -(p.rot ?? 0);
      put(m, (r.min[0] + r.max[0]) / 2, 0, (r.min[1] + r.max[1]) / 2, 0, (rot * Math.PI) / 2, 0);
      this.root.add(m);
    }
    this.buildLamps();
    this.buildDecor();
    this.buildHorizon();

    const baked = bake(this.root, 20);
    baked.name = 'city';
    scene.add(baked);
  }

  // --- Sol ---------------------------------------------------------------------------------------

  private buildGround(): void {
    const b = this.level.bounds;
    const r = this.root;
    const asphalt = surface('asphalt', '#2e3034');
    const pave = surface('pavers', '#8a857b');
    const curb = surface('concrete', '#9a978f');
    const alley = surface('asphalt', '#3a3833');
    // Chaussée prolongée au-delà des barrières, vers l'horizon.
    r.add(slab(rect(-170, -2.4, 170, 4.2), -0.05, 0, asphalt, 4));
    r.add(slab(rect(b.min[0], b.min[1], b.max[0], -4), -0.05, 0, alley, 4));
    for (const [z0, z1] of [[-4, -2.4], [4.2, 6]] as const) {
      r.add(slab(rect(-170, z0, 170, z1), -0.05, 0.1, pave, 1.2));
      const edge = z0 === -4 ? -2.4 : 4.2;
      r.add(slab(rect(-170, edge - 0.12, 170, edge + 0.12), -0.05, 0.12, curb, 1));
    }
    // Marquage : ligne médiane, places de stationnement, passages piétons devant chaque cible.
    const paint = flat('#d8d4c4', { rough: 0.85 });
    for (let x = -168; x < 168; x += 6) r.add(slab(rect(x, 0.83, x + 3, 0.97), 0, 0.005, paint));
    for (let x = -68; x < 68; x += 7) r.add(slab(rect(x, 2.35, x + 0.12, 4.1), 0, 0.005, paint));
    r.add(slab(rect(-170, 2.3, 170, 2.4), 0, 0.005, paint));
    for (const cx of [-14, 16, 50]) {
      for (let z = -2.2; z < 4.1; z += 0.9) r.add(slab(rect(cx - 1.8, z, cx + 1.8, z + 0.5), 0, 0.006, paint));
    }
    // Plaques d'égout, avaloirs, flaques.
    const iron = flat('#2b2a28', { rough: 0.6, metal: 0.8 });
    for (const x of [-55, -24, 5, 28, 58]) {
      r.add(put(cyl(0.35, 0.35, 0.012, iron, 20), x, 0.006, 1.6));
      for (let i = -2; i <= 2; i++) r.add(put(box(0.6, 0.004, 0.03, flat('#1a1918', { metal: 0.8 })), x, 0.014, 1.6 + i * 0.1));
    }
    for (const x of [-40, -10, 20, 44, 64]) {
      r.add(put(box(0.8, 0.02, 0.3, iron), x, 0.002, -2.2));
      for (let i = 0; i < 6; i++) r.add(put(box(0.03, 0.025, 0.28, flat('#0a0a0a')), x - 0.3 + i * 0.12, 0.003, -2.2));
    }
    const puddle = flat('#0d1116', { rough: 0.04, metal: 0.95, opacity: 0.7 });
    const rr = rnd(5);
    for (let i = 0; i < 14; i++) {
      const p = put(mesh(new THREE.CircleGeometry(0.6 + rr() * 1.4, 18), puddle), -65 + rr() * 130, 0.008, rr() > 0.5 ? -1.4 + rr() * 5 : -18 + rr() * 3.5, -Math.PI / 2, 0, 0);
      p.scale.set(1, 0.4 + rr() * 0.6, 1);
      r.add(p);
    }
    // Papiers et feuilles mortes.
    for (let i = 0; i < 70; i++) {
      const z = rr() > 0.5 ? -3.8 + rr() * 1.3 : -18.8 + rr() * 4.5;
      const c = ['#d8d4c8', '#8a5a2a', '#a8742a', '#6b4a2a'][i % 4] ?? '#888';
      r.add(put(box(0.12 + rr() * 0.1, 0.004, 0.08 + rr() * 0.06, flat(c, { rough: 1 })), -68 + rr() * 136, 0.11 + (z < -14 ? -0.1 : 0), z, 0, rr() * 3, 0));
    }
  }

  // --- Bâtiments ---------------------------------------------------------------------------------

  /** Fenêtre d'étage : encadrement, carreaux (allumés ou non), appui. */
  private window(x: number, y: number, z: number, out: number, w: number, h: number, lit: number): void {
    const r = this.root;
    const frame = flat('#d8d4c8', { rough: 0.6 });
    const pane = lit > 0.8 ? this.windowLit : lit > 0.72 ? this.windowWarm : this.windowDark;
    r.add(put(box(w + 0.16, h + 0.16, 0.08, frame), x, y, z + out * 0.02));
    r.add(put(box(w, h, 0.02, pane), x, y, z + out * 0.07));
    r.add(put(box(0.05, h, 0.03, frame), x, y, z + out * 0.08));
    r.add(put(box(w, 0.05, 0.03, frame), x, y + h * 0.15, z + out * 0.08));
    r.add(put(box(w + 0.3, 0.06, 0.2, flat('#bab4a6', { rough: 0.8 })), x, y - h / 2 - 0.1, z + out * 0.1));
    if (lit > 0.5 && lit < 0.6) {
      // Volets entrouverts.
      for (const s of [-1, 1]) r.add(put(box(w / 2, h, 0.03, flat('#4a6a5a', { rough: 0.7 })), x + s * (w * 0.75), y, z + out * 0.06, 0, s * out * 0.4, 0));
    }
  }

  /** Bloc plein : façade texturée, étages fenêtrés, rez-de-chaussée commerçant, corniche, toit. */
  private buildBlock(b: BuildingDef): void {
    const r = this.root;
    const [x0, z0] = b.rect.min;
    const [x1, z1] = b.rect.max;
    const facade = surface(STYLE_SURFACE[b.style], b.color);
    r.add(slab(b.rect, 0, b.height, facade, 2));
    const seed = rnd(b.id.length * 977 + Math.round(x0 * 13));
    // Façades sur rue et sur ruelle.
    const faces: { z: number; out: number; shop: boolean }[] = [];
    if (z1 <= -3.9) faces.push({ z: z1, out: 1, shop: true }, { z: z0, out: -1, shop: false });
    else if (z0 >= 5.9) faces.push({ z: z0, out: -1, shop: true });
    const cornice = flat('#cfc8b8', { rough: 0.8 });
    for (const f of faces) {
      const width = x1 - x0;
      const cols = Math.max(1, Math.floor((width - 1) / 2.4));
      const step = width / cols;
      for (let floor = 0; 3.6 + floor * 3 < b.height - 1; floor++) {
        for (let c = 0; c < cols; c++) {
          this.window(x0 + step * (c + 0.5), 4.6 + floor * 3, f.z, f.out, 1.1, 1.6, seed());
        }
        // Bandeau entre étages.
        r.add(put(box(width, 0.12, 0.12, cornice), (x0 + x1) / 2, 3.35 + floor * 3, f.z + f.out * 0.06));
      }
      // Corniche et acrotère.
      r.add(put(box(width + 0.3, 0.3, 0.45, cornice), (x0 + x1) / 2, b.height - 0.1, f.z + f.out * 0.12));
      r.add(put(box(width + 0.3, 0.1, 0.55, cornice), (x0 + x1) / 2, b.height + 0.05, f.z + f.out * 0.15));
      if (f.shop && width > 4) this.shopfront(x0, x1, f.z, f.out, seed);
      if (!f.shop) {
        // Côté ruelle : descente d'eau, porte de service, parfois un escalier de secours.
        r.add(put(cyl(0.06, 0.06, b.height, flat('#3a3d42', { metal: 0.6, rough: 0.5 }), 8), x0 + 0.4, b.height / 2, f.z + f.out * 0.12));
        r.add(put(box(1.0, 2.1, 0.06, flat('#4a4f56', { metal: 0.5, rough: 0.5 })), (x0 + x1) / 2 + 1.5, 1.05, f.z + f.out * 0.03));
        if (b.height > 7 && seed() > 0.3) this.fireEscape(x0 + width * 0.3, f.z, f.out, b.height);
      }
    }
    // Toit : membrane, acrotère, édicules.
    const roof = surface('roof', '#3a3836');
    r.add(slab(rect(x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15), b.height, b.height + 0.02, roof, 3));
    if (x1 - x0 > 6) {
      r.add(put(tbox(1.6, 1.2, 1.6, surface('metal', '#8a8e92'), 1), x0 + 2, b.height + 0.6, (z0 + z1) / 2));
      const tank = cyl(0.8, 0.8, 1.8, surface('wood', '#5a4030'), 14);
      r.add(put(tank, x1 - 2.2, b.height + 1.6, (z0 + z1) / 2));
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) r.add(put(box(0.08, 0.8, 0.08, metalDark()), x1 - 2.2 + dx, b.height + 0.4, (z0 + z1) / 2 + dz));
      r.add(put(mesh(new THREE.ConeGeometry(0.85, 0.5, 14), flat('#3a3d42', { metal: 0.5 })), x1 - 2.2, b.height + 2.75, (z0 + z1) / 2));
    }
    // Antennes.
    if (seed() > 0.5) r.add(tube([[x0 + 1, b.height, z0 + 1], [x0 + 1, b.height + 2.4, z0 + 1]], 0.02, metalDark()));
  }

  /** Rez-de-chaussée d'un bloc : rideau de fer, vitrine, porte, enseigne lumineuse. */
  private shopfront(x0: number, x1: number, z: number, out: number, seed: () => number): void {
    const r = this.root;
    const name = SHOPS[Math.floor(seed() * SHOPS.length)] ?? 'COMMERCE';
    const cx = (x0 + x1) / 2;
    const w = Math.min(x1 - x0 - 1, 9);
    const colors = ['#7d1f25', '#1d3f6a', '#2f5a2a', '#5a2a5a', '#1a1a1a', '#8a5a1a'];
    const color = colors[Math.floor(seed() * colors.length)] ?? '#1a1a1a';
    r.add(put(box(w + 0.3, 3.0, 0.08, flat(color, { rough: 0.6 })), cx, 1.5, z + out * 0.03));
    const closed = seed() > 0.45;
    if (closed) {
      // Rideau métallique tagué.
      r.add(put(tbox(w - 0.4, 2.4, 0.04, surface('metal', '#8f949a'), 1), cx, 1.25, z + out * 0.08));
      const tag = new THREE.MeshStandardMaterial({ map: signTexture([['NO FUTURE', 'K-ZOO', 'RIP 2024', 'SANS FILET'][Math.floor(seed() * 4)] ?? ''], '#8f949a', ['#c0392b', '#2e86de', '#27ae60'][Math.floor(seed() * 3)] ?? '#000', 512, 160, 'italic bold'), transparent: true, opacity: 0.85 });
      r.add(put(mesh(new THREE.PlaneGeometry(2.4, 0.75), tag), cx - 0.5, 1.0, z + out * 0.105, 0, out > 0 ? 0 : Math.PI, 0));
    } else {
      r.add(put(box(w - 0.4, 2.0, 0.03, this.windowWarm), cx - 0.6, 1.4, z + out * 0.07));
      r.add(put(box(1.0, 2.2, 0.05, flat('#2a2c30', { metal: 0.4 })), cx + w / 2 - 0.9, 1.1, z + out * 0.08));
      for (let i = 0; i < 4; i++) r.add(put(box(0.04, 2.0, 0.05, flat(color)), cx - w / 2 + 0.2 + i * ((w - 1.6) / 3), 1.4, z + out * 0.09));
    }
    const sign = new THREE.MeshStandardMaterial({ map: signTexture([name], color, '#f4ecd8', 512, 96), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6 });
    sign.emissiveMap = sign.map;
    this.handles.nightGlow.push(sign);
    r.add(put(mesh(new THREE.PlaneGeometry(Math.min(w, 5), 0.6), sign), cx, 2.75, z + out * 0.1, 0, out > 0 ? 0 : Math.PI, 0));
  }

  private fireEscape(x: number, z: number, out: number, height: number): void {
    const r = this.root;
    const iron = flat('#1f2124', { rough: 0.6, metal: 0.7 });
    for (let y = 3.3; y < height - 1; y += 3) {
      r.add(put(box(2.4, 0.05, 1.0, iron), x, y, z + out * 0.55));
      r.add(put(box(2.4, 0.04, 0.04, iron), x, y + 0.95, z + out * 1.05));
      for (let i = 0; i <= 8; i++) r.add(put(box(0.025, 0.95, 0.025, iron), x - 1.2 + i * 0.3, y + 0.47, z + out * 1.05));
      // Volée d'escalier vers le palier supérieur.
      if (y + 3 < height - 1) {
        const stair = put(box(0.7, 0.04, 3.4, iron), x + 0.7, y + 1.5, z + out * 0.55, -Math.atan2(3, 2.2) * out * 0, 0, 0);
        stair.rotation.set(0, Math.PI / 2, Math.atan2(3, 2.2));
        r.add(stair);
      }
    }
  }

  /** Clôture de tôle ondulée (fond de ruelle, bouts de rue). */
  private buildFence(b: BuildingDef): void {
    const r = this.root;
    r.add(slab(b.rect, 0, b.height, surface('metal', b.color), 2));
    const [x0, z0] = b.rect.min;
    const [x1, z1] = b.rect.max;
    const long = x1 - x0 > z1 - z0;
    const len = long ? x1 - x0 : z1 - z0;
    for (let t = 0; t <= len; t += 3) {
      const px = long ? x0 + t : (x0 + x1) / 2;
      const pz = long ? (z0 + z1) / 2 : z0 + t;
      r.add(put(cyl(0.05, 0.05, b.height + 0.2, metalDark(), 8), px, (b.height + 0.2) / 2, pz));
    }
    // Barbelés au sommet.
    const wire = flat('#5a5a5a', { metal: 0.8, rough: 0.4 });
    for (let t = 0; t < len; t += 0.22) {
      const px = long ? x0 + t : (x0 + x1) / 2;
      const pz = long ? (z0 + z1) / 2 : z0 + t;
      r.add(put(mesh(new THREE.TorusGeometry(0.1, 0.004, 4, 10), wire), px, b.height + 0.14, pz, 0, long ? 0 : Math.PI / 2, 0));
    }
  }

  /** Bâtiment visitable : murs en deux couches (façade dehors, enduit dedans), vitrines, linteaux, sol, plafond, toit. */
  private buildShell(b: BuildingDef): void {
    const r = this.root;
    const [x0, z0] = b.rect.min;
    const [x1, z1] = b.rect.max;
    const inside = INTERIOR[b.site ?? b.id] ?? INTERIOR.hideout;
    if (!inside) return;
    const facade = surface(STYLE_SURFACE[b.style], b.color);
    const interior = surface(inside.kind, inside.wall);
    const walls = this.level.walls.filter((w) => w.owner === b.id);
    const doors = this.level.doors.filter((d) => {
      const c = { x: (d.rect.min[0] + d.rect.max[0]) / 2, z: (d.rect.min[1] + d.rect.max[1]) / 2 };
      return c.x >= x0 - 0.01 && c.x <= x1 + 0.01 && c.z >= z0 - 0.01 && c.z <= z1 + 0.01;
    });

    for (const w of walls) this.wallPiece(b, w.rect, 0, b.height, facade, interior, w.glass ? 'glass' : 'solid', inside.wainscot);
    // Linteaux au-dessus des simples passages (sans porte).
    const t = WALL_THICKNESS;
    const plain = (alongX: boolean, lo: number, hi: number, list: readonly OpeningDef[] | undefined): void => {
      for (const o of list ?? []) {
        if (o.door || o.window) continue;
        this.wallPiece(b, alongX ? rect(o.from, lo, o.to, hi) : rect(lo, o.from, hi, o.to), 2.3, b.height, facade, interior, 'solid');
      }
    };
    plain(true, z1 - t, z1, b.openings?.s);
    plain(true, z0, z0 + t, b.openings?.n);
    plain(false, x0, x0 + t, b.openings?.w);
    plain(false, x1 - t, x1, b.openings?.e);
    for (const p of b.partitions ?? []) plain(p.axis === 'x', p.at - t / 2, p.at + t / 2, p.openings);
    for (const d of doors) {
      const top = d.role === 'vault' ? 2.42 : d.role === 'front' ? 2.5 : 2.2;
      this.wallPiece(b, d.rect, top, b.height, facade, interior, 'solid');
      this.doorFrame(d, top);
    }

    // Sol, plafond, toit.
    const floorKind: SurfaceKind = b.floor ?? 'concrete';
    const floorColor = { tile: '#c8c4b6', concrete: '#6a6660', wood: '#7a5634', marble: '#e8e4dc' }[floorKind as 'tile'] ?? '#888';
    r.add(slab(rect(x0, z0, x1, z1), 0, 0.02, surface(floorKind, floorColor), floorKind === 'wood' ? 1.4 : 1.6));
    r.add(slab(rect(x0, z0, x1, z1), b.height - 0.06, b.height, flat(inside.ceiling, { rough: 0.95 })));
    r.add(slab(rect(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1), b.height, b.height + 0.18, surface('roof', '#3a3836'), 3));
    const cap = flat('#8a857b', { rough: 0.8 });
    r.add(slab(rect(x0 - 0.15, z1 - 0.05, x1 + 0.15, z1 + 0.25), b.height, b.height + 0.55, cap));
    r.add(slab(rect(x0 - 0.15, z0 - 0.25, x1 + 0.15, z0 + 0.05), b.height, b.height + 0.45, cap));
    r.add(put(tbox(1.2, 0.8, 1.0, surface('metal', '#9aa0a6'), 1), x0 + 2, b.height + 0.58, (z0 + z1) / 2));

    // Luminaires de plafond.
    const site = b.site ?? b.id;
    const fixture = new THREE.MeshStandardMaterial({ color: '#f4f8ff', emissive: '#eef6ff', emissiveIntensity: 1.6, roughness: 0.4 });
    fixture.userData.noShadow = true;
    const power = this.handles.sitePower.get(site) ?? [];
    power.push(fixture);
    this.handles.sitePower.set(site, power);
    const spacing = site === 'bank' ? 4 : 3.2;
    for (let x = x0 + spacing / 2; x < x1 - 0.5; x += spacing) {
      for (let z = z0 + 1.6; z < z1 - 0.6; z += 3.2) {
        if (site === 'hideout') continue;
        r.add(put(box(1.2, 0.06, 0.3, flat('#d8dade', { metal: 0.4, rough: 0.4 })), x, b.height - 0.09, z));
        r.add(put(box(1.1, 0.02, 0.22, fixture), x, b.height - 0.125, z));
      }
    }
    // Sources de lumière (deux à quatre par pièce, gérées par la réserve de lumières).
    if (site === 'hideout') {
      this.handles.lights.push({ pos: new THREE.Vector3((x0 + x1) / 2, b.height - 0.5, (z0 + z1) / 2), color: new THREE.Color('#ffb36b'), range: 13, power: 60, level: 1, tag: 'hideout' });
      r.add(tube([[(x0 + x1) / 2, b.height - 0.06, (z0 + z1) / 2], [(x0 + x1) / 2, b.height - 0.45, (z0 + z1) / 2]], 0.006, flat('#111')));
      const bulb = flat('#ffd08a', { emissive: '#ffb050', glow: 3 });
      r.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulb), (x0 + x1) / 2, b.height - 0.5, (z0 + z1) / 2));
    } else {
      const xs = (x1 - x0) > 14 ? [x0 + (x1 - x0) * 0.2, x0 + (x1 - x0) * 0.5, x0 + (x1 - x0) * 0.8] : [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7];
      for (const x of xs) this.handles.lights.push({ pos: new THREE.Vector3(x, b.height - 0.4, z1 - 3), color: new THREE.Color('#eef4ff'), range: 13, power: 34, level: 1, tag: site });
      this.handles.lights.push({ pos: new THREE.Vector3((x0 + x1) / 2, b.height - 0.4, z0 + 1.6), color: new THREE.Color('#eef4ff'), range: 12, power: 26, level: 1, tag: site });
    }

    if (b.site) this.siteFacade(b, site);
  }

  /**
   * Un tronçon de mur, de `y0` à `y1` : deux couches si c'est un mur extérieur (façade dehors, enduit dedans),
   * une seule pour une cloison. `glass` : allège, vitrage et imposte.
   */
  private wallPiece(
    b: BuildingDef,
    rr: Rect,
    y0: number,
    y1: number,
    facade: THREE.Material,
    interior: THREE.Material,
    kind: 'solid' | 'glass',
    wainscot?: string,
  ): void {
    const r = this.root;
    const alongX = rr.max[1] - rr.min[1] <= rr.max[0] - rr.min[0];
    // Côté extérieur : −1 / +1 sur l'axe mince, 0 pour une cloison.
    let out = 0;
    if (alongX) {
      if (Math.abs(rr.max[1] - b.rect.max[1]) < 0.01) out = 1;
      else if (Math.abs(rr.min[1] - b.rect.min[1]) < 0.01) out = -1;
    } else if (Math.abs(rr.max[0] - b.rect.max[0]) < 0.01) out = 1;
    else if (Math.abs(rr.min[0] - b.rect.min[0]) < 0.01) out = -1;

    const piece = (a: number, c: number, mat: THREE.Material): void => {
      if (c - a < 0.005) return;
      if (out === 0) {
        r.add(slab(rr, a, c, mat === facade ? interior : mat));
        return;
      }
      // Coupe le mur en deux dans son épaisseur.
      const [lo, hi] = alongX ? [rr.min[1], rr.max[1]] : [rr.min[0], rr.max[0]];
      const mid = (lo + hi) / 2;
      const outer: [number, number] = out > 0 ? [mid, hi] : [lo, mid];
      const inner: [number, number] = out > 0 ? [lo, mid] : [mid, hi];
      const mk = (span: [number, number]): Rect =>
        alongX ? rect(rr.min[0], span[0], rr.max[0], span[1]) : rect(span[0], rr.min[1], span[1], rr.max[1]);
      r.add(slab(mk(outer), a, c, mat));
      r.add(slab(mk(inner), a, c, mat === facade ? interior : mat));
    };

    if (kind === 'solid') {
      piece(y0, y1, facade);
      if (y0 === 0) this.baseboard(rr, alongX, out, wainscot);
      return;
    }
    // Vitrine (extérieur) ou vitre de guichet (cloison).
    const sill = out === 0 ? 1.05 : SILL;
    const top = out === 0 ? 2.45 : GLASS_TOP;
    piece(0, sill, out === 0 ? surface('wood', '#4a3020') : facade);
    piece(top, y1, facade);
    const len = alongX ? rr.max[0] - rr.min[0] : rr.max[1] - rr.min[1];
    const cx = (rr.min[0] + rr.max[0]) / 2;
    const cz = (rr.min[1] + rr.max[1]) / 2;
    const pane = glass(out === 0 ? '#dfeff2' : '#a9c6cc', out === 0 ? 0.16 : 0.24);
    r.add(put(box(alongX ? len : 0.03, top - sill, alongX ? 0.03 : len, pane), cx, (sill + top) / 2, cz));
    const frameMat = out === 0 ? chrome() : flat('#1d1f22', { rough: 0.4, metal: 0.6 });
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len / n) * i;
      r.add(put(box(alongX ? 0.06 : 0.12, top - sill, alongX ? 0.12 : 0.06, frameMat), cx + (alongX ? t : 0), (sill + top) / 2, cz + (alongX ? 0 : t)));
    }
    r.add(put(box(alongX ? len : 0.16, 0.06, alongX ? 0.16 : len, frameMat), cx, sill, cz));
    r.add(put(box(alongX ? len : 0.14, 0.06, alongX ? 0.14 : len, frameMat), cx, top, cz));
    if (out === 0) {
      // Tablette de guichet et hygiaphones.
      r.add(put(box(alongX ? len : 0.5, 0.04, alongX ? 0.5 : len, surface('marble', '#d8d2c6')), cx, sill + 0.02, cz));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len / n) * (i + 0.5);
        r.add(put(cyl(0.12, 0.12, 0.01, flat('#3a3d42', { metal: 0.7 }), 16), cx + (alongX ? t : 0), sill + 0.55, cz, Math.PI / 2, 0, 0));
      }
    }
  }

  private baseboard(rr: Rect, alongX: boolean, out: number, wainscot?: string): void {
    const r = this.root;
    const sides = out === 0 ? [-1, 1] : [-out];
    for (const s of sides) {
      const [lo, hi] = alongX ? [rr.min[1], rr.max[1]] : [rr.min[0], rr.max[0]];
      const face = s > 0 ? hi : lo;
      const strip = (h: number, mat: THREE.Material, depth: number): void => {
        const a = s > 0 ? face : face - depth;
        const c = s > 0 ? face + depth : face;
        r.add(slab(alongX ? rect(rr.min[0], a, rr.max[0], c) : rect(a, rr.min[1], c, rr.max[1]), 0.02, h, mat));
      };
      if (wainscot) {
        strip(1.0, surface(wainscot === '#3d2a1c' ? 'wood' : 'marble', wainscot), 0.02);
        strip(1.04, flat('#c8a050', { rough: 0.3, metal: 0.8 }), 0.03);
      }
      strip(0.12, flat('#2a2622', { rough: 0.6 }), 0.025);
    }
  }

  /** Huisserie d'une porte : montants et traverse. */
  private doorFrame(d: DoorDef, top: number): void {
    const r = this.root;
    const mat = d.role === 'front' ? chrome() : d.role === 'vault' ? metalDark() : flat('#4a4f56', { metal: 0.5, rough: 0.5 });
    const t = 0.26;
    if (d.alongX) {
      const cz = (d.rect.min[1] + d.rect.max[1]) / 2;
      for (const x of [d.rect.min[0], d.rect.max[0]]) r.add(put(box(0.07, top, t, mat), x, top / 2, cz));
      r.add(put(box(d.rect.max[0] - d.rect.min[0] + 0.07, 0.07, t, mat), (d.rect.min[0] + d.rect.max[0]) / 2, top, cz));
      // Seuil.
      r.add(put(box(d.rect.max[0] - d.rect.min[0], 0.02, t + 0.1, steel()), (d.rect.min[0] + d.rect.max[0]) / 2, 0.01, cz));
    } else {
      const cx = (d.rect.min[0] + d.rect.max[0]) / 2;
      for (const z of [d.rect.min[1], d.rect.max[1]]) r.add(put(box(t, top, 0.07, mat), cx, top / 2, z));
      r.add(put(box(t, 0.07, d.rect.max[1] - d.rect.min[1] + 0.07, mat), cx, top, (d.rect.min[1] + d.rect.max[1]) / 2));
    }
  }

  /** Enseigne, auvent et détails de façade propres à chaque cible. */
  private siteFacade(b: BuildingDef, site: string): void {
    const r = this.root;
    const [x0] = b.rect.min;
    const [x1, z1] = b.rect.max;
    const cx = (x0 + x1) / 2;
    const def = SITE_SIGNS[site];
    if (def) {
      const tex = signTexture(def.lines, def.bg, def.fg, 1024, 220);
      const sign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.5 });
      this.handles.sitePower.get(site)?.push(sign);
      const width = site === 'bank' ? 7 : 4.6;
      const y = b.height - 0.45;
      r.add(put(box(width + 0.2, 0.84, 0.12, flat(site === 'jewelry' ? '#c8a050' : '#2a2c30', { metal: 0.6, rough: 0.3 })), cx, y, z1 + 0.06));
      r.add(put(mesh(new THREE.PlaneGeometry(width, 0.72), sign), cx, y, z1 + 0.125));
    }
    if (site === 'store' || site === 'jewelry') {
      // Auvent rayé au-dessus des vitrines.
      const stripes = document.createElement('canvas');
      stripes.width = 256;
      stripes.height = 16;
      const g = stripes.getContext('2d');
      if (g) {
        for (let i = 0; i < 16; i++) {
          g.fillStyle = i % 2 ? '#f0ece0' : site === 'store' ? '#1f6b3c' : '#2a1a2a';
          g.fillRect(i * 16, 0, 16, 16);
        }
      }
      const tex = new THREE.CanvasTexture(stripes);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set((x1 - x0) / 3, 1);
      const cloth = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
      const awning = mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, 1.3), cloth);
      r.add(put(awning, cx, b.height - 1.25, z1 + 0.55, -Math.PI / 2 + 0.5, 0, 0));
      const valance = mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, 0.22), cloth);
      r.add(put(valance, cx, b.height - 1.62, z1 + 1.12));
      for (const x of [x0 + 0.3, x1 - 0.3]) r.add(tube([[x, b.height - 0.95, z1 + 0.02], [x, b.height - 1.5, z1 + 1.1]], 0.015, metalDark()));
    }
    if (site === 'bank') {
      // Mâts et drapeaux, plaque de cuivre, distributeur de billets.
      for (const x of [x0 + 1.2, x1 - 1.2]) {
        r.add(tube([[x, 3.2, z1 + 0.05], [x, 3.6, z1 + 0.9]], 0.03, chrome()));
        r.add(put(box(0.02, 0.7, 1.0, flat(x < cx ? '#1d3f9a' : '#c8a050', { rough: 0.9, double: true })), x, 3.25, z1 + 1.2, 0.2, 0, 0));
      }
      r.add(put(box(0.6, 0.4, 0.02, flat('#b87333', { rough: 0.3, metal: 1 })), 48.2, 1.6, z1 + 0.02));
      const atm = new THREE.Group();
      atm.add(put(box(0.8, 1.6, 0.12, steel()), 0, 0.8, 0));
      atm.add(put(box(0.45, 0.32, 0.02, flat('#2a6fb0', { emissive: '#1a5a9a', glow: 0.8 })), 0, 1.25, 0.07));
      atm.add(put(box(0.36, 0.14, 0.04, flat('#222')), 0, 0.95, 0.08, -0.4, 0, 0));
      atm.add(put(box(0.3, 0.02, 0.03, flat('#111')), 0, 0.72, 0.075));
      r.add(put(atm, 56.5, 0, z1 + 0.07));
    }
    if (site === 'store') {
      // Affiches de promotion sur la vitrine, présentoir à journaux dehors.
      for (const [i, txt] of ['PROMO -30 %', 'OUVERT 7/7', 'CAFÉ 1 €'].entries()) {
        const poster = new THREE.MeshStandardMaterial({ map: signTexture([txt], ['#e8c040', '#c0392b', '#ffffff'][i] ?? '#fff', '#1a1a1a', 256, 160), roughness: 0.8 });
        r.add(put(mesh(new THREE.PlaneGeometry(0.7, 0.45), poster), -18.6 + i * 0.95, 1.4, z1 + 0.05));
      }
      const rack = new THREE.Group();
      rack.add(put(box(0.6, 1.0, 0.4, flat('#1f6b3c', { metal: 0.4 })), 0, 0.5, 0));
      for (let i = 0; i < 3; i++) rack.add(put(box(0.5, 0.3, 0.02, flat(['#e8e4d8', '#d8c8a8', '#c8d8e8'][i] ?? '#fff', { rough: 0.9 })), 0, 0.55 + i * 0.12, 0.21, -0.3, 0, 0));
      r.add(put(rack, -12.2, 0.1, z1 + 0.6));
    }
  }

  // --- Lampadaires ---------------------------------------------------------------------------------

  private buildLamps(): void {
    for (const l of this.level.lamps) {
      if (l[1] > -10) {
        const lamp = makeStreetLamp();
        lamp.glass.material = this.lampGlass;
        put(lamp.root, l[0], 0.1, l[1]);
        this.root.add(lamp.root);
        const bulb = lamp.bulb.clone().add(lamp.root.position);
        this.handles.lights.push({ pos: bulb, color: new THREE.Color('#ffcf8a'), range: 22, power: 95, level: 0, tag: 'street' });
      } else {
        const lamp = makeWallLamp();
        lamp.glass.material = this.lampGlass;
        put(lamp.root, l[0], 2.4, l[1] - 0.35);
        this.root.add(lamp.root);
        this.handles.lights.push({ pos: new THREE.Vector3(l[0], 2.3, l[1] + 0.1), color: new THREE.Color('#ffc27a'), range: 13, power: 34, level: 0, tag: 'alley' });
      }
    }
  }

  // --- Détails -------------------------------------------------------------------------------------

  private buildDecor(): void {
    const r = this.root;
    // Banque : moquette, cordons de file d'attente, horloge, tableaux.
    const carpet = surface('fabric', '#6a1a22');
    r.add(slab(rect(46.5, -8.4, 53.5, -4.4), 0.02, 0.03, carpet, 1));
    for (let i = 0; i < 5; i++) r.add(put(makeProp('rope-post'), 46.8 + i * 1.6, 0, -6.2));
    for (let i = 0; i < 4; i++) {
      const x = 46.8 + i * 1.6;
      r.add(tube([[x, 0.92, -6.2], [x + 0.8, 0.72, -6.2], [x + 1.6, 0.92, -6.2]], 0.02, flat('#7d1f25', { rough: 0.8 })));
    }
    const clock = new THREE.Group();
    clock.add(put(cyl(0.35, 0.35, 0.06, flat('#f4f1ea', { rough: 0.4 }), 32), 0, 0, 0, Math.PI / 2, 0, 0));
    clock.add(put(mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 32), flat('#c8a050', { metal: 1, rough: 0.3 })), 0, 0, 0));
    for (let i = 0; i < 12; i++) clock.add(put(box(0.02, 0.06, 0.01, flat('#1a1a1a')), Math.cos((i / 12) * Math.PI * 2) * 0.28, Math.sin((i / 12) * Math.PI * 2) * 0.28, 0.035, 0, 0, (i / 12) * Math.PI * 2 + Math.PI / 2));
    clock.add(put(box(0.02, 0.2, 0.01, flat('#111')), 0, 0.09, 0.04));
    clock.add(put(box(0.015, 0.26, 0.01, flat('#111')), 0.1, 0.0, 0.045, 0, 0, -1.2));
    r.add(put(clock, 50, 3.2, -8.85));
    for (const [x, c] of [[40.5, '#3a5a7a'], [59.5, '#7a5a3a']] as const) {
      r.add(put(box(1.4, 1.0, 0.05, flat('#c8a050', { metal: 0.9, rough: 0.3 })), x, 2.4, -8.88));
      r.add(put(box(1.25, 0.85, 0.02, flat(c, { rough: 0.9 })), x, 2.4, -8.85));
    }
    // Bijouterie : lustre, miroirs, portraits de joyaux.
    const chandelier = new THREE.Group();
    chandelier.add(put(cyl(0.01, 0.01, 0.6, chrome(), 6), 0, 0.3, 0));
    chandelier.add(put(mesh(new THREE.TorusGeometry(0.45, 0.02, 8, 24), flat('#c8a050', { metal: 1, rough: 0.25 })), 0, 0, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      chandelier.add(put(mesh(new THREE.OctahedronGeometry(0.04), glass('#f4fbff', 0.6)), Math.cos(a) * 0.45, -0.1, Math.sin(a) * 0.45));
      chandelier.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flat('#fff4d8', { emissive: '#ffe8b0', glow: 2 })), Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45));
    }
    r.add(put(chandelier, 16, 2.9, -6.5));
    for (const x of [10, 22]) {
      r.add(put(box(1.6, 2.0, 0.04, flat('#c8a050', { metal: 1, rough: 0.3 })), x, 1.7, -10.36));
      r.add(put(box(1.45, 1.85, 0.02, flat('#c8d4dc', { metal: 1, rough: 0.04 })), x, 1.7, -10.33));
    }
    // Supérette : affiches au mur, distributeur de boissons, panneau « interdit de fumer ».
    for (const [i, txt] of ['FRAIS DU JOUR', 'INTERDIT DE FUMER', 'NE PAS DÉPASSER'].entries()) {
      const poster = new THREE.MeshStandardMaterial({ map: signTexture([txt], ['#f2c94c', '#ffffff', '#c0392b'][i] ?? '#fff', '#111', 512, 128), roughness: 0.8 });
      r.add(put(mesh(new THREE.PlaneGeometry(1.2, 0.3), poster), -18 + i * 3.4, 2.3, -10.88));
    }
    // Planque : photos de repérage, carte, graffitis.
    for (let i = 0; i < 9; i++) {
      r.add(put(box(0.22, 0.16, 0.005, flat(['#bfb8a8', '#a8a090', '#d0c8b8'][i % 3] ?? '#ccc', { rough: 0.9 })), -41.5 + (i % 3) * 0.3, 1.5 + Math.floor(i / 3) * 0.24, -13.78, 0, 0, (i % 2 ? 1 : -1) * 0.05));
    }
    r.add(tube([[-41.8, 1.6, -13.77], [-41.2, 1.75, -13.77], [-40.9, 1.5, -13.77]], 0.004, flat('#c0392b')));
    const graffiti = new THREE.MeshStandardMaterial({ map: signTexture(['DETTE : 15 000 $'], '#7a7268', '#b33a2a', 512, 128, 'italic bold'), roughness: 0.9 });
    r.add(put(mesh(new THREE.PlaneGeometry(2.4, 0.6), graffiti), -46, 2.0, -13.78));
    // Ruelle : poubelles, sacs, palettes, matelas abandonné, tags.
    const rr = rnd(42);
    for (const x of [-60, -36, -12, 8, 24, 44, 66]) {
      for (let i = 0; i < 3; i++) r.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), flat('#121214', { rough: 0.35 })), x + rr() * 1.2, 0.22, -14.35 - rr() * 0.4));
    }
    for (const x of [-56, 34]) {
      for (let i = 0; i < 3; i++) r.add(put(box(1.2, 0.12, 1.0, surface('wood', '#8a6a44')), x, 0.06 + i * 0.13, -18.4, 0, 0.1 * i, 0));
    }
    for (const [x, txt] of [[-48, 'SANS FILET'], [10, 'NO JUSTICE'], [40, 'RIP KILLA']] as const) {
      const tag = new THREE.MeshStandardMaterial({ map: signTexture([txt], '#3a3f3c', ['#d23a2a', '#2ab3d2', '#e8c040'][Math.floor(rr() * 3)] ?? '#fff', 512, 128, 'italic bold'), roughness: 0.9 });
      r.add(put(mesh(new THREE.PlaneGeometry(3, 0.75), tag), x, 1.3, -18.89));
    }
    // Panneaux de rue et feux tricolores.
    for (const x of [-30, 34]) {
      r.add(put(cyl(0.04, 0.04, 2.6, metalDark(), 8), x, 1.3, -2.7));
      const tex = signTexture(['RUE DES ORFÈVRES'], '#1d3f9a', '#ffffff', 512, 96);
      r.add(put(box(1.3, 0.24, 0.03, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })), x, 2.55, -2.7));
    }
    for (const x of [-14, 16, 50]) {
      const light = new THREE.Group();
      light.add(put(cyl(0.05, 0.05, 3, metalDark(), 8), 0, 1.5, 0));
      light.add(put(rbox(0.28, 0.75, 0.22, 0.04, flat('#1a1c1e', { metal: 0.5 })), 0, 3.2, 0.1));
      for (const [i, c] of ['#5a0a0a', '#5a4a0a', '#0a5a1a'].entries()) light.add(put(cyl(0.08, 0.08, 0.04, flat(c, { emissive: c, glow: 1.2 }), 12), 0, 3.42 - i * 0.22, 0.22, Math.PI / 2, 0, 0));
      r.add(put(light, x + 2.3, 0.1, -2.6));
    }
  }

  // --- Horizon -------------------------------------------------------------------------------------

  /** Immeubles hors d'atteinte, au-delà des limites, pour que la ville ait de la profondeur. */
  private buildHorizon(): void {
    const r = this.root;
    const mat = this.handles.skyline;
    const rr = rnd(7);
    const block = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
      const m = slab(rect(x0, z0, x1, z1), 0, h, mat, 1);
      // Carreaux à l'échelle du bâtiment : un carreau ≈ 1,5 m.
      // Géométrie propre à ce bloc : on ne touche pas aux UV d'une géométrie partagée.
      const geo = (m.geometry as THREE.BufferGeometry).clone();
      m.geometry = geo;
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.07, uv.getY(i) * 0.07);
      r.add(m);
      r.add(slab(rect(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2), h, h + 0.4, flat('#24272c', { rough: 0.9 })));
    };
    // Derrière la ruelle et derrière la rangée sud.
    for (let x = -170; x < 170; ) {
      const w = 8 + rr() * 14;
      block(x, -60 - rr() * 10, x + w - 1, -32 - rr() * 6, 12 + rr() * 26);
      block(x + 3, 16 + rr() * 6, x + w + 2, 40 + rr() * 10, 10 + rr() * 30);
      x += w;
    }
    // Prolongement de la rue au-delà des barrières.
    for (const side of [-1, 1]) {
      for (let x = 72; x < 170; ) {
        const w = 10 + rr() * 12;
        const x0 = side > 0 ? x : -x - w;
        block(x0, -18, x0 + w - 1.5, -4.5, 8 + rr() * 16);
        block(x0, 6.5, x0 + w - 1.5, 18, 8 + rr() * 16);
        x += w;
      }
    }
    // Deux tours au loin, avec leur balise rouge.
    for (const [x, z, h] of [[-95, -80, 75], [60, 70, 90]] as const) {
      block(x, z, x + 14, z + 14, h);
      r.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), flat('#ff2a2a', { emissive: '#ff0000', glow: 3 })), x + 7, h + 2, z + 7));
    }
  }
}

/** Ciel : dégradé, soleil, lune et étoiles, selon l'heure. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    top: { value: new THREE.Color('#1a2f5a') },
    horizon: { value: new THREE.Color('#8fb2d9') },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    night: { value: 0 },
    sunColor: { value: new THREE.Color('#fff2d0') },
  };

  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 moonDir; uniform float night; uniform vec3 sunColor;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
          col = mix(col, horizon * 0.6, smoothstep(0.0, -0.2, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35) * (1.0 - night);
          float m = max(dot(d, normalize(moonDir)), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.3 + pow(m, 60.0) * 0.12) * night;
          vec3 cell = floor(d * 280.0);
          float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.3, h);
          float twinkle = 0.6 + 0.4 * hash(cell + 7.0);
          col += vec3(star * twinkle) * night;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }
}

