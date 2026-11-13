import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceMaps, type SurfaceKind } from './textures';

/** Outils de modélisation par code : matériaux en cache, primitives placées, fusion des maillages statiques. */

const materials = new Map<string, THREE.MeshStandardMaterial>();

const SURFACE_LOOK: Record<SurfaceKind, { rough: number; metal: number }> = {
  brick: { rough: 0.92, metal: 0 },
  concrete: { rough: 0.9, metal: 0 },
  plaster: { rough: 0.95, metal: 0 },
  stone: { rough: 0.8, metal: 0 },
  metal: { rough: 0.55, metal: 0.7 },
  asphalt: { rough: 0.95, metal: 0 },
  pavers: { rough: 0.9, metal: 0 },
  tile: { rough: 0.35, metal: 0 },
  wood: { rough: 0.6, metal: 0 },
  marble: { rough: 0.18, metal: 0 },
  fabric: { rough: 1, metal: 0 },
  roof: { rough: 1, metal: 0 },
  gravel: { rough: 1, metal: 0 },
};

/** Matière texturée (couleur + relief). À utiliser avec des géométries aux UV en mètres (`tbox`). */
export function surface(kind: SurfaceKind, color: string): THREE.MeshStandardMaterial {
  const key = `s|${kind}|${color}`;
  let m = materials.get(key);
  if (!m) {
    const maps = surfaceMaps(kind, color);
    const look = SURFACE_LOOK[kind];
    m = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughness: look.rough,
      metalness: look.metal,
    });
    materials.set(key, m);
  }
  return m;
}

export interface FlatOptions {
  readonly rough?: number;
  readonly metal?: number;
  readonly emissive?: string;
  readonly glow?: number;
  readonly opacity?: number;
  readonly double?: boolean;
}

/** Matière unie, sans texture : peinture, plastique, métal, verre. */
export function flat(color: string, o: FlatOptions = {}): THREE.MeshStandardMaterial {
  const key = `f|${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.glow ?? 0}|${o.opacity ?? 1}|${o.double ? 1 : 0}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.7,
      metalness: o.metal ?? 0,
      emissive: o.emissive ?? '#000000',
      emissiveIntensity: o.glow ?? (o.emissive ? 1 : 0),
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    if ((o.opacity ?? 1) < 1) {
      m.depthWrite = false;
      m.userData.noShadow = true;
    }
    if (o.emissive) m.userData.noShadow = true;
    materials.set(key, m);
  }
  return m;
}

export const metalDark = (): THREE.MeshStandardMaterial => flat('#2a2c30', { rough: 0.45, metal: 0.85 });
export const steel = (): THREE.MeshStandardMaterial => flat('#9aa0a6', { rough: 0.3, metal: 0.95 });
export const chrome = (): THREE.MeshStandardMaterial => flat('#d9dde2', { rough: 0.12, metal: 1 });
export const rubber = (): THREE.MeshStandardMaterial => flat('#141414', { rough: 0.95 });
export const glass = (tint = '#a9c6cc', opacity = 0.28): THREE.MeshStandardMaterial => flat(tint, { rough: 0.05, metal: 0.2, opacity, double: true });

/** Place un objet (position, puis rotation d'Euler) et le renvoie, pour chaîner. */
export function put<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, mat);
}

/** Boîte dont les UV sont en mètres : la texture garde la même échelle quelle que soit la taille du mur. */
export function tbox(w: number, h: number, d: number, mat: THREE.Material, tile = 2): THREE.Mesh {
  return new THREE.Mesh(shared(`tbox${k(w, h, d, tile)}`, () => tiledBox(w, h, d, tile)), mat);
}

function tiledBox(w: number, h: number, d: number, tile: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Faces dans l'ordre +x, −x, +y, −y, +z, −z, quatre sommets chacune.
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f] as [number, number];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  return geo;
}

/**
 * Les primitives sont partagées : deux boîtes de mêmes dimensions utilisent la même géométrie. Les
 * personnages, construits pièce par pièce, ne coûtent ainsi presque rien en mémoire graphique.
 */
const geometries = new Map<string, THREE.BufferGeometry>();
function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}
const k = (...n: number[]): string => n.map((v) => v.toFixed(4)).join(',');

export function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(shared(`box${k(w, h, d)}`, () => new THREE.BoxGeometry(w, h, d)), mat);
}

/** Boîte aux arêtes arrondies. */
export function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, seg = 3): THREE.Mesh {
  const rr = Math.min(r, w / 2, h / 2, d / 2);
  return new THREE.Mesh(shared(`rbox${k(w, h, d, rr, seg)}`, () => new RoundedBoxGeometry(w, h, d, seg, rr)), mat);
}

export function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 16): THREE.Mesh {
  return new THREE.Mesh(shared(`cyl${k(rTop, rBottom, h, seg)}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg)), mat);
}

export function ball(r: number, mat: THREE.Material, seg = 14): THREE.Mesh {
  return new THREE.Mesh(shared(`ball${k(r, seg)}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg * 0.7)))), mat);
}

/** Capsule verticale de longueur totale `len` (bouts arrondis compris). */
export function capsule(r: number, len: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  return new THREE.Mesh(shared(`cap${k(r, len, seg)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, seg)), mat);
}

/** Tube le long d'une suite de points (câbles, tuyaux, arceaux). */
export function tube(points: readonly (readonly [number, number, number])[], r: number, mat: THREE.Material, seg = 8): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), r, seg, false), mat);
}

/** Profil 2D extrudé (carrosseries, corniches). Le profil est dans le plan XY, l'épaisseur le long de Z, centrée. */
export function extrude(profile: readonly (readonly [number, number])[], depth: number, mat: THREE.Material, bevel = 0): THREE.Mesh {
  const shape = new THREE.Shape(profile.map((p) => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  return new THREE.Mesh(geo, mat);
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/**
 * Fusionne tous les maillages d'un groupe par matériau et par tranche de terrain : des milliers de pièces
 * deviennent quelques appels de dessin, que la caméra peut encore écarter quand ils sont hors champ.
 */
export function bake(root: THREE.Object3D, chunk = 24): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const center = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const src = o.geometry as THREE.BufferGeometry;
    let geo = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('uv')) {
      const count = geo.getAttribute('position').count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    geo = geo.applyMatrix4(o.matrixWorld);
    // Une échelle négative retourne les faces : on les remet à l'endroit.
    if (o.matrixWorld.determinant() < 0) {
      const pos = geo.getAttribute('position');
      const nor = geo.getAttribute('normal');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i += 3) {
        for (const a of [pos, nor, uv]) {
          const n = a.itemSize;
          for (let k = 0; k < n; k++) {
            const t = a.getComponent(i + 1, k);
            a.setComponent(i + 1, k, a.getComponent(i + 2, k));
            a.setComponent(i + 2, k, t);
          }
        }
      }
    }
    geo.computeBoundingBox();
    geo.boundingBox?.getCenter(center);
    const key = `${o.material.uuid}|${Math.floor(center.x / chunk)}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat: o.material, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(geo);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    const noShadow = b.mat.userData.noShadow === true;
    m.castShadow = !noShadow;
    m.receiveShadow = !noShadow;
    out.add(m);
    for (const g of b.geos) g.dispose();
  }
  return out;
}

/** Active les ombres sur tout un objet animé (non fusionné). */
export function shadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const noShadow = o.material.userData.noShadow === true;
    o.castShadow = !noShadow;
    o.receiveShadow = !noShadow;
  });
}
