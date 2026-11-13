import * as THREE from 'three';
import { ball, box, capsule, chrome, cyl, extrude, flat, glass, group, mesh, metalDark, put, rbox, rubber, steel, surface, tbox, tube } from '../build';
import { signTexture } from '../textures';
import { makeBag, makeCashStack } from './items';

/**
 * Mobilier et objets de décor. Chaque modèle est centré sur l'origine, posé au sol, largeur le long de x,
 * profondeur le long de z, face avant tournée vers +z. Les dimensions suivent `props.json`.
 */

const wood = () => surface('wood', '#6b4a2e');
const darkWood = () => surface('wood', '#3d2a1c');
const paint = (c: string) => flat(c, { rough: 0.55, metal: 0.15 });

const GOODS = ['#c94f4f', '#e0b14a', '#4f8ac9', '#6fb35a', '#d9d4c7', '#9b59b6', '#e67e22', '#2c3e50', '#f1c40f', '#16a085'];

/** Rangée de produits variés (boîtes, bouteilles, conserves) sur une étagère. */
function goods(w: number, y: number, z: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let x = -w / 2 + 0.08;
  let k = seed;
  while (x < w / 2 - 0.08) {
    k = (k * 1103515245 + 12345) & 0x7fffffff;
    const kind = k % 4;
    const color = GOODS[k % GOODS.length] ?? '#ccc';
    const m = flat(color, { rough: 0.5 });
    if (kind === 0) {
      const h = 0.18 + (k % 7) * 0.02;
      g.add(put(box(0.09, h, 0.16, m), x + 0.045, y + h / 2, z));
      g.add(put(box(0.092, 0.035, 0.162, flat('#f3efe4', { rough: 0.6 })), x + 0.045, y + h * 0.55, z));
      x += 0.11;
    } else if (kind === 1) {
      for (let i = 0; i < 2; i++) {
        g.add(put(cyl(0.032, 0.032, 0.2, flat(color, { rough: 0.15, opacity: 0.85 }), 10), x + 0.035, y + 0.1, z - 0.04 + i * 0.08));
        g.add(put(cyl(0.012, 0.03, 0.05, flat(color, { rough: 0.15, opacity: 0.85 }), 8), x + 0.035, y + 0.225, z - 0.04 + i * 0.08));
        g.add(put(cyl(0.013, 0.013, 0.015, flat('#eeeeee'), 8), x + 0.035, y + 0.257, z - 0.04 + i * 0.08));
      }
      x += 0.08;
    } else if (kind === 2) {
      for (let i = 0; i < 3; i++) {
        g.add(put(cyl(0.035, 0.035, 0.09, steel(), 10), x + 0.04, y + 0.045 + (i === 2 ? 0.09 : 0), z - 0.04 + (i % 2) * 0.08));
        g.add(put(cyl(0.0355, 0.0355, 0.06, m, 10), x + 0.04, y + 0.045 + (i === 2 ? 0.09 : 0), z - 0.04 + (i % 2) * 0.08));
      }
      x += 0.09;
    } else {
      g.add(put(rbox(0.16, 0.24, 0.07, 0.02, m), x + 0.08, y + 0.12, z));
      x += 0.18;
    }
  }
  return g;
}

function shelf(variant: number): THREE.Group {
  const g = new THREE.Group();
  const frame = paint('#d7d9dc');
  for (const x of [-1.47, 1.47]) g.add(put(box(0.04, 1.7, 0.5, frame), x, 0.85, 0));
  g.add(put(box(2.9, 1.6, 0.02, paint('#c6c8cb')), 0, 0.85, 0));
  for (const [i, y] of [0.1, 0.5, 0.9, 1.3, 1.66].entries()) {
    g.add(put(box(2.94, 0.03, 0.5, frame), 0, y, 0));
    g.add(put(box(2.94, 0.05, 0.01, paint('#f2c94c')), 0, y - 0.01, 0.25));
    if (i < 4) for (const side of [-1, 1]) g.add(goods(2.8, y + 0.015, side * 0.13, variant * 31 + i * 7 + side));
  }
  return g;
}

function counter(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(6, 0.95, 0.8, surface('wood', '#5a3d27'), 1), 0, 0.475, 0));
  g.add(put(box(6.06, 0.05, 0.86, flat('#2a2a2e', { rough: 0.25, metal: 0.1 })), 0, 0.975, 0));
  g.add(put(box(6.02, 0.1, 0.02, steel()), 0, 0.08, 0.41));
  // Présentoirs à bonbons, tapis de caisse, terminal de carte, rayonnage de cigarettes au dos.
  for (let i = 0; i < 4; i++) {
    g.add(put(box(0.3, 0.6, 0.18, paint('#c0392b')), -2.6 + i * 0.35, 0.3, 0.5));
    g.add(goods(0.28, 0.08, 0.5, i * 13).translateX(-2.6 + i * 0.35));
  }
  g.add(put(box(1.2, 0.012, 0.5, rubber()), 1.4, 1.006, 0.05));
  g.add(put(rbox(0.08, 0.13, 0.04, 0.01, flat('#202226', { rough: 0.4 })), 0.5, 1.07, 0.2, -0.5, 0, 0));
  g.add(put(box(0.06, 0.05, 0.002, flat('#9fd0ff', { emissive: '#4a8cc9', glow: 0.6 })), 0.5, 1.085, 0.222, -0.5, 0, 0));
  // Caisse enregistreuse (sa position correspond à l'interactif).
  const reg = new THREE.Group();
  reg.add(put(rbox(0.42, 0.11, 0.4, 0.02, flat('#2b2d31', { rough: 0.5 })), 0, 0.055, 0));
  reg.add(put(rbox(0.38, 0.08, 0.36, 0.015, flat('#3a3d42', { rough: 0.5 })), 0, 0.15, -0.01));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) reg.add(put(box(0.035, 0.012, 0.03, flat(c === 3 ? '#c94f4f' : '#d8d8d8', { rough: 0.6 })), -0.1 + c * 0.045, 0.196, 0.1 - r * 0.04));
  reg.add(put(box(0.04, 0.2, 0.04, flat('#2b2d31')), 0.12, 0.28, -0.12));
  reg.add(put(rbox(0.22, 0.13, 0.02, 0.01, flat('#2b2d31')), 0.12, 0.43, -0.12, 0, Math.PI, 0));
  reg.add(put(box(0.18, 0.09, 0.002, flat('#57e389', { emissive: '#2ea85a', glow: 0.9 })), 0.12, 0.43, -0.131, 0, Math.PI, 0));
  g.add(put(reg, -1, 1.0, 0));
  return g;
}

function fridge(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(2.4, 2.0, 0.7, paint('#e4e6e8')), 0, 1.0, -0.02));
  g.add(put(box(2.36, 0.25, 0.02, flat('#1f6b3c', { emissive: '#1f6b3c', glow: 0.3 })), 0, 1.86, 0.34));
  for (let i = 0; i < 3; i++) {
    const x = -0.8 + i * 0.8;
    g.add(put(box(0.76, 1.55, 0.02, glass('#cfe9f2', 0.22)), x, 0.95, 0.335));
    g.add(put(box(0.025, 0.5, 0.03, chrome()), x + 0.32, 1.0, 0.36));
    for (let s = 0; s < 4; s++) {
      g.add(put(box(0.72, 0.015, 0.55, flat('#bfc4c8', { rough: 0.3, metal: 0.6 })), x, 0.25 + s * 0.38, 0));
      g.add(goods(0.7, 0.26 + s * 0.38, 0.0, i * 11 + s * 5).translateX(x));
    }
  }
  g.add(put(box(2.38, 0.05, 0.05, flat('#f2fbff', { emissive: '#e9f6ff', glow: 1.2 })), 0, 1.72, 0.3));
  return g;
}

/** Coffre-fort : caisse, porte sur gonds (animable), cadran, poignée. */
export function makeSafe(variant: number): { root: THREE.Group; door: THREE.Group } {
  const root = new THREE.Group();
  const body = flat(variant === 1 ? '#2c3a2f' : '#33373d', { rough: 0.45, metal: 0.6 });
  root.add(put(rbox(0.9, 1.1, 0.8, 0.04, body), 0, 0.55, -0.02));
  root.add(put(box(0.72, 0.9, 0.02, flat('#0e0f11', { rough: 0.9 })), 0, 0.56, 0.385));
  for (const y of [0.35, 0.75]) root.add(put(box(0.68, 0.02, 0.6, flat('#22252a', { metal: 0.6 })), 0, y, 0.05));
  const door = new THREE.Group();
  door.add(put(rbox(0.74, 0.92, 0.06, 0.02, body), 0.37, 0, 0));
  door.add(put(cyl(0.09, 0.09, 0.04, chrome(), 24), 0.42, 0.12, 0.04, Math.PI / 2, 0, 0));
  for (let i = 0; i < 12; i++) door.add(put(box(0.004, 0.018, 0.005, flat('#111')), 0.42 + Math.cos((i / 12) * Math.PI * 2) * 0.075, 0.12 + Math.sin((i / 12) * Math.PI * 2) * 0.075, 0.062));
  door.add(put(cyl(0.012, 0.012, 0.18, chrome(), 8), 0.42, -0.11, 0.05, 0, 0, Math.PI / 2));
  door.add(put(box(0.5, 0.04, 0.002, flat('#d8b24a', { rough: 0.3, metal: 1 })), 0.37, 0.42, 0.032));
  for (const y of [-0.3, 0.3]) door.add(put(cyl(0.02, 0.02, 0.12, steel(), 8), 0.0, y, 0.0));
  root.add(put(door, -0.37, 0.56, 0.41));
  return { root, door };
}

function safe(variant: number): THREE.Group {
  return makeSafe(variant).root;
}

function bed(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(2.0, 0.18, 1.1, wood()), 0, 0.09, 0));
  g.add(put(rbox(1.96, 0.2, 1.06, 0.06, surface('fabric', '#6b6f78')), 0, 0.28, 0));
  g.add(put(rbox(1.3, 0.08, 1.1, 0.04, surface('fabric', '#4b3d4f')), 0.3, 0.42, 0, 0, 0, 0.02));
  g.add(put(rbox(0.45, 0.12, 0.7, 0.05, surface('fabric', '#d6d0c2')), -0.7, 0.44, 0));
  // Bouteilles et cendrier au pied du lit.
  g.add(put(cyl(0.035, 0.035, 0.24, flat('#2f5a2a', { rough: 0.1, opacity: 0.8 }), 10), 1.1, 0.12, 0.45));
  g.add(put(cyl(0.06, 0.05, 0.03, flat('#555', { metal: 0.5 }), 12), 1.15, 0.015, 0.3));
  return g;
}

function table(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(1.6, 0.05, 1.1, wood(), 1), 0, 0.78, 0));
  for (const x of [-0.72, 0.72]) for (const z of [-0.47, 0.47]) g.add(put(box(0.06, 0.76, 0.06, wood()), x, 0.38, z));
  // Le plan de la ville, punaisé, une lampe, des photos de repérage.
  const plan = new THREE.MeshStandardMaterial({ map: signTexture(['PLAN DU QUARTIER', 'Supérette · Bijouterie · Banque'], '#d8d2bd', '#2a4a8a', 512, 320), roughness: 0.9 });
  g.add(put(mesh(new THREE.PlaneGeometry(1.2, 0.75), plan), 0, 0.806, 0, -Math.PI / 2, 0, 0.04));
  for (let i = 0; i < 4; i++) g.add(put(box(0.1, 0.002, 0.07, flat(['#bbb', '#ddd', '#999', '#ccc'][i] ?? '#bbb')), -0.5 + i * 0.12, 0.81, 0.4, 0, (i - 1.5) * 0.2, 0));
  g.add(put(cyl(0.07, 0.08, 0.02, metalDark(), 12), 0.62, 0.815, -0.35));
  g.add(tube([[0.62, 0.82, -0.35], [0.6, 1.1, -0.3], [0.45, 1.2, -0.15]], 0.01, metalDark()));
  g.add(put(cyl(0.03, 0.08, 0.1, flat('#2c3e50', { rough: 0.5, metal: 0.5 }), 12), 0.42, 1.15, -0.12, 0.6, 0, 0));
  g.add(put(cyl(0.02, 0.02, 0.1, flat('#7a4a2a', { rough: 0.6 }), 8), -0.6, 0.86, -0.3));
  for (const z of [-0.8, 0.8]) {
    const chair = group(put(box(0.45, 0.04, 0.45, wood()), 0, 0.46, 0), put(box(0.45, 0.5, 0.04, wood()), 0, 0.72, z > 0 ? 0.21 : -0.21));
    for (const x of [-0.2, 0.2]) for (const zz of [-0.2, 0.2]) chair.add(put(box(0.035, 0.46, 0.035, wood()), x, 0.23, zz));
    g.add(put(chair, z * 0.3, 0, z));
  }
  return g;
}

function locker(): THREE.Group {
  const g = new THREE.Group();
  const m = paint('#556270');
  for (let i = 0; i < 3; i++) {
    const x = -0.4 + i * 0.4;
    g.add(put(box(0.39, 1.9, 0.5, m), x, 0.95, 0));
    for (let k = 0; k < 4; k++) g.add(put(box(0.24, 0.012, 0.005, flat('#2a2f36')), x, 1.65 + k * 0.03, 0.252));
    g.add(put(box(0.02, 0.12, 0.03, chrome()), x + 0.14, 1.0, 0.26));
  }
  g.add(put(makeBag(), 0, 1.9, 0, 0, 0.3, 0));
  return g;
}

function workbench(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(2.2, 0.06, 0.7, darkWood(), 1), 0, 0.87, 0));
  for (const x of [-1.02, 1.02]) for (const z of [-0.3, 0.3]) g.add(put(box(0.06, 0.84, 0.06, metalDark()), x, 0.42, z));
  g.add(put(box(2.1, 0.03, 0.6, darkWood()), 0, 0.2, 0));
  g.add(put(box(2.2, 1.0, 0.03, surface('wood', '#8a6a44')), 0, 1.4, -0.34));
  // Outils accrochés au panneau.
  for (let i = 0; i < 7; i++) {
    const x = -0.9 + i * 0.3;
    g.add(put(box(0.03, 0.22 + (i % 3) * 0.05, 0.02, i % 2 ? paint('#c0392b') : steel()), x, 1.4, -0.31, 0, 0, (i - 3) * 0.08));
  }
  g.add(put(box(0.3, 0.12, 0.2, paint('#2c4a7a')), -0.6, 0.96, 0.05));
  g.add(put(cyl(0.1, 0.1, 0.12, steel(), 14), 0.6, 0.96, 0.05));
  return g;
}

function dumpster(variant: number): THREE.Group {
  const g = new THREE.Group();
  const m = flat(variant ? '#3b4f6b' : '#2f4a35', { rough: 0.6, metal: 0.5 });
  const shape = extrude([[-0.6, 0], [0.6, 0], [0.62, 1.15], [-0.62, 1.15]], 2.4, m);
  shape.rotation.y = Math.PI / 2;
  g.add(shape);
  for (const x of [-1.15, 1.15]) g.add(put(box(0.05, 1.2, 1.3, m), x, 0.6, 0));
  for (const x of [-0.9, 0.9]) for (const z of [-0.5, 0.5]) {
    g.add(put(cyl(0.08, 0.08, 0.06, rubber(), 12), x, 0.08, z, Math.PI / 2, 0, 0));
  }
  // Couvercles entrouverts, ordures qui dépassent.
  g.add(put(box(1.2, 0.04, 1.3, flat('#1d1f22', { rough: 0.7 })), -0.6, 1.2, -0.05, -0.08, 0, 0));
  g.add(put(box(1.2, 0.04, 1.3, flat('#1d1f22', { rough: 0.7 })), 0.6, 1.32, -0.3, -0.45, 0, 0));
  for (let i = 0; i < 5; i++) g.add(put(ball(0.18, flat(i % 2 ? '#1a1a1a' : '#3a3a40', { rough: 0.4 }), 8), 0.3 + i * 0.15, 1.1, -0.2 + (i % 3) * 0.15));
  for (const z of [-0.62, 0.62]) g.add(put(box(2.3, 0.08, 0.02, m), 0, 0.9, z));
  return g;
}

function stall(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(2.0, 0.06, 0.7, darkWood()), 0, 0.82, 0));
  for (const x of [-0.9, 0.9]) g.add(put(box(0.08, 0.8, 0.6, darkWood()), x, 0.4, 0));
  g.add(put(box(2.0, 0.02, 0.72, surface('fabric', '#3b2a2a')), 0, 0.86, 0));
  // Marchandise : cartons, montres, téléphones, une lampe-tempête.
  g.add(put(rbox(0.3, 0.2, 0.25, 0.01, flat('#8a6a44', { rough: 0.9 })), -0.75, 0.97, -0.15));
  g.add(put(rbox(0.25, 0.15, 0.2, 0.01, flat('#7a5a3a', { rough: 0.9 })), -0.75, 1.15, -0.15, 0, 0.3, 0));
  for (let i = 0; i < 5; i++) g.add(put(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 14), chrome()), -0.4 + i * 0.07, 0.875, 0.2, Math.PI / 2, 0, 0));
  for (let i = 0; i < 3; i++) g.add(put(rbox(0.07, 0.012, 0.14, 0.008, flat('#16181c', { rough: 0.2 })), 0.0 + i * 0.1, 0.875, 0.2, 0, 0.1 * i, 0));
  const lantern = group(
    put(cyl(0.06, 0.07, 0.02, metalDark(), 10), 0, 0.01, 0),
    put(cyl(0.05, 0.05, 0.13, glass('#ffd890', 0.45), 10), 0, 0.085, 0),
    put(ball(0.025, flat('#ffcf6a', { emissive: '#ffb030', glow: 3 }), 8), 0, 0.08, 0),
    put(cyl(0.035, 0.06, 0.03, metalDark(), 10), 0, 0.165, 0),
    tube([[-0.05, 0.18, 0], [0, 0.25, 0], [0.05, 0.18, 0]], 0.004, metalDark()),
  );
  g.add(put(lantern, 0.85, 0.85, -0.2));
  return g;
}

function crate(): THREE.Group {
  const g = new THREE.Group();
  const w = surface('wood', '#8a6a44');
  g.add(put(tbox(0.78, 0.68, 0.78, w, 1), 0, 0.34, 0));
  for (const y of [0.04, 0.64]) for (const z of [-0.395, 0.395]) g.add(put(box(0.8, 0.06, 0.02, darkWood()), 0, y, z));
  for (const z of [-0.395, 0.395]) g.add(put(box(0.06, 0.62, 0.02, darkWood()), 0, 0.34, z, 0, 0, 0.75));
  g.add(put(box(0.3, 0.12, 0.002, new THREE.MeshStandardMaterial({ map: signTexture(['FRAGILE'], '#8a6a44', '#3a1a10', 256, 96) })), 0.15, 0.45, 0.397));
  return g;
}

/** Vitrine de bijouterie : meuble, bijoux (masquables) et cloche de verre (brisable). */
export function makeDisplayCase(): { root: THREE.Group; jewels: THREE.Group; glass: THREE.Group } {
  const root = new THREE.Group();
  root.add(put(tbox(1.4, 0.82, 0.7, surface('wood', '#2a1d14'), 1), 0, 0.41, 0));
  root.add(put(box(1.42, 0.03, 0.72, chrome()), 0, 0.83, 0));
  root.add(put(box(1.36, 0.008, 0.66, flat('#2a1424', { rough: 0.95 })), 0, 0.85, 0));
  const jewels = new THREE.Group();
  const gold = flat('#e8c060', { rough: 0.2, metal: 1 });
  const silver = chrome();
  const gem = (c: string) => flat(c, { rough: 0.05, metal: 0.1, emissive: c, glow: 0.35 });
  for (let i = 0; i < 6; i++) {
    const x = -0.55 + i * 0.22;
    jewels.add(put(mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), i % 2 ? gold : silver), x, 0.875, -0.15, 0.3, 0, 0));
    jewels.add(put(mesh(new THREE.OctahedronGeometry(0.009), gem(['#e8f6ff', '#c0392b', '#2e86de', '#27ae60'][i % 4] ?? '#fff')), x, 0.895, -0.14));
    jewels.add(put(mesh(new THREE.TorusGeometry(0.06, 0.003, 5, 24, Math.PI), i % 2 ? silver : gold), x, 0.86, 0.1, -Math.PI / 2, 0, 0));
    jewels.add(put(mesh(new THREE.OctahedronGeometry(0.012), gem('#e8f6ff')), x, 0.865, 0.04));
  }
  for (let i = 0; i < 3; i++) {
    const watch = group(put(cyl(0.022, 0.022, 0.01, i === 1 ? gold : silver, 16), 0, 0, 0), put(cyl(0.018, 0.018, 0.011, flat('#f5f2ea', { rough: 0.2 }), 16), 0, 0.001, 0));
    jewels.add(put(watch, -0.4 + i * 0.4, 0.865, 0.24));
  }
  // Petit spot de vitrine.
  jewels.add(put(box(1.3, 0.01, 0.02, flat('#fff6e0', { emissive: '#fff0d0', glow: 1.5 })), 0, 1.19, -0.3));
  root.add(jewels);
  const glassGroup = new THREE.Group();
  glassGroup.add(put(box(1.36, 0.36, 0.66, glass('#e4f2f6', 0.18)), 0, 1.03, 0));
  for (const x of [-0.68, 0.68]) for (const z of [-0.33, 0.33]) glassGroup.add(put(box(0.02, 0.36, 0.02, chrome()), x, 1.03, z));
  glassGroup.add(put(box(1.38, 0.015, 0.68, chrome()), 0, 1.215, 0));
  root.add(glassGroup);
  return { root, jewels, glass: glassGroup };
}

function displayCase(): THREE.Group {
  return makeDisplayCase().root;
}

function jewelCounter(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(9, 0.95, 0.5, surface('marble', '#e8e2d6'), 1), 0, 0.475, 0));
  g.add(put(box(9.04, 0.04, 0.54, flat('#c8a050', { rough: 0.25, metal: 1 })), 0, 0.97, 0));
  g.add(put(box(9.0, 0.08, 0.02, flat('#c8a050', { rough: 0.25, metal: 1 })), 0, 0.06, 0.255));
  // Coussin à bagues, miroir, sonnette, écrin ouvert.
  g.add(put(rbox(0.3, 0.05, 0.2, 0.02, surface('fabric', '#3a1a2a')), -1.2, 1.015, 0));
  g.add(put(cyl(0.04, 0.05, 0.03, chrome(), 16), 0.6, 1.005, 0.1));
  g.add(put(ball(0.03, chrome(), 10), 0.6, 1.035, 0.1));
  g.add(put(rbox(0.25, 0.35, 0.02, 0.01, chrome()), 3.5, 1.17, -0.15, -0.2, 0, 0));
  g.add(put(rbox(0.12, 0.06, 0.1, 0.01, flat('#1a1a2a', { rough: 0.5 })), -2.6, 1.02, 0.05));
  return g;
}

function desk(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(1.8, 0.05, 0.8, darkWood(), 1), 0, 0.775, 0));
  for (const x of [-0.8, 0.8]) g.add(put(box(0.16, 0.75, 0.76, darkWood()), x, 0.375, 0));
  g.add(put(box(1.5, 0.5, 0.02, darkWood()), 0, 0.5, -0.38));
  // Écran, clavier, lampe de bureau, dossiers.
  g.add(put(rbox(0.5, 0.32, 0.03, 0.01, flat('#16181c', { rough: 0.4 })), 0, 1.05, -0.2));
  g.add(put(box(0.46, 0.27, 0.002, flat('#3a6ea5', { emissive: '#2a5a95', glow: 0.7 })), 0, 1.05, -0.184));
  g.add(put(box(0.04, 0.12, 0.04, flat('#16181c')), 0, 0.86, -0.22));
  g.add(put(rbox(0.42, 0.02, 0.14, 0.008, flat('#202226')), 0, 0.81, 0.08));
  g.add(put(box(0.3, 0.06, 0.22, flat('#c8b88a', { rough: 0.9 })), 0.6, 0.83, 0.1, 0, 0.2, 0));
  g.add(put(box(0.3, 0.04, 0.22, flat('#8aa8c8', { rough: 0.9 })), 0.62, 0.88, 0.1, 0, 0.1, 0));
  // Chaise de bureau.
  const chair = group(
    put(rbox(0.5, 0.08, 0.5, 0.03, flat('#1c1c20', { rough: 0.8 })), 0, 0.48, 0),
    put(rbox(0.48, 0.55, 0.07, 0.03, flat('#1c1c20', { rough: 0.8 })), 0, 0.82, -0.24, -0.1, 0, 0),
    put(cyl(0.025, 0.025, 0.38, chrome(), 8), 0, 0.26, 0),
  );
  for (let i = 0; i < 5; i++) chair.add(put(box(0.3, 0.025, 0.04, chrome()), Math.cos((i / 5) * Math.PI * 2) * 0.15, 0.06, Math.sin((i / 5) * Math.PI * 2) * 0.15, 0, -(i / 5) * Math.PI * 2, 0));
  g.add(put(chair, 0, 0, 0.75, 0, Math.PI, 0));
  return g;
}

function tellerDesk(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(1.6, 0.8, 0.6, surface('wood', '#4a3020'), 1), 0, 0.4, 0));
  g.add(put(box(1.64, 0.04, 0.64, surface('marble', '#d8d2c6')), 0, 0.82, 0));
  g.add(put(rbox(0.42, 0.28, 0.03, 0.01, flat('#16181c')), -0.3, 1.05, -0.15));
  g.add(put(box(0.38, 0.23, 0.002, flat('#6fa8dc', { emissive: '#3a78b5', glow: 0.6 })), -0.3, 1.05, -0.134));
  g.add(put(rbox(0.3, 0.1, 0.25, 0.02, flat('#2b2d31')), 0.4, 0.9, -0.05));
  // Tiroir-caisse entrouvert, liasses visibles.
  for (let i = 0; i < 3; i++) {
    const stack = put(makeCashStack(), 0.3 + i * 0.07, 0.96, -0.05, 0, Math.PI / 2, 0);
    stack.scale.setScalar(0.6);
    g.add(stack);
  }
  g.add(put(box(0.24, 0.04, 0.12, flat('#e8e4d8', { rough: 0.8 })), 0.0, 0.85, 0.15));
  return g;
}

function depositBoxes(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(2.4, 2.0, 0.4, steel()), 0, 1.0, 0));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 6; c++) {
      const x = -1.0 + c * 0.4;
      const y = 0.15 + r * 0.24;
      g.add(put(box(0.37, 0.21, 0.02, flat('#b8bec6', { rough: 0.25, metal: 1 })), x, y + 0.1, 0.205));
      g.add(put(cyl(0.012, 0.012, 0.02, flat('#d8b24a', { rough: 0.2, metal: 1 }), 8), x + 0.12, y + 0.1, 0.22, Math.PI / 2, 0, 0));
      g.add(put(box(0.06, 0.02, 0.003, flat('#222')), x - 0.1, y + 0.17, 0.217));
    }
  }
  return g;
}

export function cashPallet(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(1.2, 0.12, 0.9, surface('wood', '#9a7a54')), 0, 0.06, 0));
  // Briques de billets sous film plastique.
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 6; x++) {
      for (let z = 0; z < 5; z++) {
        g.add(put(box(0.18, 0.17, 0.16, flat(z % 2 ? '#7fa77a' : '#86ad80', { rough: 0.85 })), -0.5 + x * 0.2, 0.21 + y * 0.18, -0.36 + z * 0.18));
      }
    }
  }
  g.add(put(box(1.22, 0.74, 0.92, flat('#e8f0f2', { rough: 0.1, opacity: 0.18 })), 0, 0.49, 0));
  for (let i = 0; i < 3; i++) g.add(put(box(1.23, 0.02, 0.925, flat('#c0392b', { rough: 0.5 })), 0, 0.25 + i * 0.22, 0));
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(put(box(1.8, 0.035, 0.1, wood()), 0, 0.45, -0.17 + i * 0.115));
  for (let i = 0; i < 3; i++) g.add(put(box(1.8, 0.1, 0.035, wood()), 0, 0.6 + i * 0.12, -0.24, -0.15, 0, 0));
  for (const x of [-0.75, 0.75]) {
    g.add(put(box(0.05, 0.45, 0.45, metalDark()), x, 0.225, 0));
    g.add(put(box(0.05, 0.4, 0.05, metalDark()), x, 0.7, -0.24, -0.15, 0, 0));
  }
  return g;
}

function planter(variant: number): THREE.Group {
  const g = new THREE.Group();
  g.add(put(tbox(1, 0.6, 1, surface(variant ? 'stone' : 'concrete', variant ? '#b9b2a2' : '#8a8a86'), 1), 0, 0.3, 0));
  g.add(put(box(0.9, 0.04, 0.9, surface('gravel', '#3b2a1c')), 0, 0.59, 0));
  // Arbuste en boule, feuillage en grappes.
  const leaf = flat(variant ? '#2f5a2a' : '#3e6b2e', { rough: 0.9 });
  g.add(put(cyl(0.03, 0.04, 0.5, flat('#4a3524'), 6), 0, 0.85, 0));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(put(ball(0.22 + (i % 3) * 0.04, leaf, 8), Math.cos(a) * 0.18, 1.1 + (i % 2) * 0.15, Math.sin(a) * 0.18));
  }
  g.add(put(ball(0.26, leaf, 8), 0, 1.3, 0));
  return g;
}

function trashCan(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(cyl(0.24, 0.22, 0.85, flat('#2d4a3a', { rough: 0.6, metal: 0.4 }), 16), 0, 0.425, 0));
  for (const y of [0.2, 0.6]) g.add(put(mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 20), flat('#1f3528', { metal: 0.6 })), 0, y, 0, Math.PI / 2, 0, 0));
  g.add(put(cyl(0.26, 0.26, 0.05, flat('#1f3528', { metal: 0.6 }), 16), 0, 0.87, 0));
  g.add(put(ball(0.14, flat('#151515', { rough: 0.3 }), 8), 0.05, 0.92, 0));
  return g;
}

function hydrant(): THREE.Group {
  const g = new THREE.Group();
  const red = flat('#b3261e', { rough: 0.45, metal: 0.3 });
  g.add(put(cyl(0.15, 0.17, 0.06, red, 14), 0, 0.03, 0));
  g.add(put(cyl(0.12, 0.13, 0.5, red, 14), 0, 0.3, 0));
  g.add(put(cyl(0.14, 0.14, 0.04, red, 14), 0, 0.55, 0));
  g.add(put(ball(0.12, red, 12), 0, 0.6, 0));
  g.add(put(cyl(0.03, 0.03, 0.05, red, 6), 0, 0.72, 0));
  for (const s of [-1, 1]) g.add(put(cyl(0.055, 0.055, 0.1, red, 10), s * 0.15, 0.4, 0, 0, 0, Math.PI / 2));
  g.add(put(cyl(0.07, 0.07, 0.09, red, 10), 0, 0.4, 0.14, Math.PI / 2, 0, 0));
  return g;
}

function acUnit(): THREE.Group {
  const g = new THREE.Group();
  g.add(put(box(0.9, 0.7, 0.5, flat('#c8ccd0', { rough: 0.5, metal: 0.4 })), 0, 0.35, 0));
  g.add(put(cyl(0.28, 0.28, 0.02, flat('#2a2c30', { metal: 0.5 }), 20), -0.1, 0.35, 0.255, Math.PI / 2, 0, 0));
  for (let i = 0; i < 6; i++) g.add(put(box(0.56, 0.01, 0.01, steel()), -0.1, 0.12 + i * 0.09, 0.265));
  g.add(tube([[0.35, 0.6, 0], [0.35, 0.9, 0], [0.35, 1.4, -0.2]], 0.025, flat('#e8e8e8', { rough: 0.6 })));
  return g;
}

function ropePost(): THREE.Group {
  return group(
    put(cyl(0.12, 0.14, 0.03, chrome(), 16), 0, 0.015, 0),
    put(cyl(0.025, 0.025, 0.95, chrome(), 10), 0, 0.49, 0),
    put(ball(0.045, chrome(), 10), 0, 0.98, 0),
  );
}

function column(): THREE.Group {
  const g = new THREE.Group();
  const marble = surface('marble', '#e4dfd4');
  g.add(put(box(0.6, 0.12, 0.6, marble), 0, 0.06, 0));
  g.add(put(cyl(0.24, 0.26, 0.15, marble, 20), 0, 0.19, 0));
  g.add(put(cyl(0.22, 0.24, 3.5, marble, 20), 0, 2.0, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(put(box(0.02, 3.4, 0.03, flat('#cfc8ba', { rough: 0.3 })), Math.cos(a) * 0.225, 2.0, Math.sin(a) * 0.225, 0, -a, 0));
  }
  g.add(put(cyl(0.3, 0.24, 0.18, marble, 20), 0, 3.82, 0));
  g.add(put(box(0.62, 0.08, 0.62, marble), 0, 3.95, 0));
  return g;
}

function barrier(): THREE.Group {
  // Barrière de chantier qui ferme la rue à chaque bout.
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const z = -4 + i * 2;
    const unit = group(
      put(box(0.05, 1.0, 0.05, metalDark()), 0, 0.5, -0.8),
      put(box(0.05, 1.0, 0.05, metalDark()), 0, 0.5, 0.8),
      put(box(0.4, 0.04, 0.25, metalDark()), 0, 0.02, -0.8),
      put(box(0.4, 0.04, 0.25, metalDark()), 0, 0.02, 0.8),
    );
    for (let s = 0; s < 4; s++) unit.add(put(box(0.04, 0.22, 0.38, flat(s % 2 ? '#f2f2f2' : '#d23a2a', { rough: 0.5 })), 0, 0.85, -0.6 + s * 0.4));
    unit.add(put(ball(0.05, flat('#ff8a1a', { emissive: '#ff6a00', glow: 2 }), 8), 0, 1.06, 0.8));
    g.add(put(unit, 0, 0, z));
  }
  return g;
}

/** Construit le modèle d'un meuble ou d'un véhicule garé. */
export function makeProp(type: string, variant = 0): THREE.Object3D {
  switch (type) {
    case 'counter': return counter();
    case 'shelf': return shelf(variant);
    case 'fridge': return fridge();
    case 'safe': return safe(variant);
    case 'bed': return bed();
    case 'table': return table();
    case 'locker': return locker();
    case 'workbench': return workbench();
    case 'dumpster': return dumpster(variant);
    case 'stall': return stall();
    case 'crate': return crate();
    case 'display-case': return displayCase();
    case 'jewel-counter': return jewelCounter();
    case 'desk': return desk();
    case 'teller-desk': return tellerDesk();
    case 'deposit-boxes': return depositBoxes();
    case 'cash-pallet': return cashPallet();
    case 'bench': return bench();
    case 'planter': return planter(variant);
    case 'trash-can': return trashCan();
    case 'hydrant': return hydrant();
    case 'ac-unit': return acUnit();
    case 'rope-post': return ropePost();
    case 'column': return column();
    case 'barrier': return barrier();
    case 'car': return makeCar(CAR_COLORS[variant % CAR_COLORS.length] ?? '#8a1c1c', variant);
    case 'van': return makeVan();
    default:
      return box(0.5, 0.5, 0.5, flat('#ff00ff'));
  }
}

const CAR_COLORS = ['#8a1c1c', '#1c3f8a', '#d8d8d4', '#232528', '#4a6b3a', '#b88a2a'];

/**
 * Berline : profil extrudé (capot, pare-brise, pavillon, coffre), vitres, roues à jantes, phares, rétroviseurs.
 * Longueur le long de x (avant vers +x), largeur le long de z.
 */
export function makeCar(color: string, variant = 0): THREE.Group {
  const g = new THREE.Group();
  const paintMat = flat(color, { rough: 0.25, metal: 0.6 });
  const trim = flat('#121316', { rough: 0.5 });
  const L = 4.4;
  const W = 1.82;
  // Bas de caisse et ailes.
  const lower: [number, number][] = [
    [-2.2, 0.32], [-2.22, 0.62], [-2.05, 0.8], [-1.0, 0.84], [-0.55, 0.86], [0.75, 0.86], [1.55, 0.8], [2.18, 0.7], [2.22, 0.42], [2.12, 0.3],
    [1.72, 0.3], [1.68, 0.48], [1.5, 0.62], [1.12, 0.62], [0.95, 0.48], [0.9, 0.3], [-0.95, 0.3], [-1.0, 0.48], [-1.18, 0.62], [-1.56, 0.62], [-1.74, 0.48], [-1.78, 0.32],
  ];
  g.add(extrude(lower, W, paintMat, 0.05));
  // Habitacle.
  const cabin: [number, number][] = [[-1.55, 0.84], [-1.2, 1.32], [-0.75, 1.42], [0.45, 1.42], [1.0, 0.86]];
  g.add(extrude(cabin, W - 0.16, paintMat, 0.04));
  // Vitres (légèrement en retrait) et montants.
  const win = flat('#1a2028', { rough: 0.05, metal: 0.8 });
  g.add(put(extrude([[-1.45, 0.88], [-1.15, 1.3], [-0.77, 1.38], [0.42, 1.38], [0.9, 0.88]], W - 0.14, win), 0, 0, 0));
  for (const z of [-1, 1]) {
    g.add(put(box(0.06, 0.5, 0.02, trim), -0.15, 1.13, z * (W / 2 - 0.07)));
    // Poignées et rétroviseurs.
    g.add(put(box(0.14, 0.03, 0.03, chrome()), 0.25, 0.8, z * (W / 2 + 0.01)));
    g.add(put(box(0.14, 0.03, 0.03, chrome()), -0.75, 0.8, z * (W / 2 + 0.01)));
    g.add(put(rbox(0.12, 0.08, 0.16, 0.02, paintMat), 0.85, 0.98, z * (W / 2 + 0.06)));
  }
  // Roues : pneu, jante à rayons, enjoliveur.
  for (const x of [-1.37, 1.32]) {
    for (const z of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.add(cyl(0.33, 0.33, 0.22, rubber(), 20));
      wheel.add(put(cyl(0.21, 0.21, 0.225, flat('#9a9ea4', { rough: 0.25, metal: 1 }), 16), 0, 0, 0));
      for (let i = 0; i < 5; i++) wheel.add(put(box(0.05, 0.228, 0.18, flat('#6a6e74', { metal: 1, rough: 0.3 })), Math.cos((i / 5) * Math.PI * 2) * 0.1, 0, Math.sin((i / 5) * Math.PI * 2) * 0.1, 0, (i / 5) * Math.PI * 2, 0));
      wheel.add(put(cyl(0.05, 0.05, 0.235, chrome(), 10), 0, 0, 0));
      g.add(put(wheel, x, 0.33, z * (W / 2 - 0.08), Math.PI / 2, 0, 0));
    }
  }
  // Calandre, phares, feux, plaques, pare-chocs.
  g.add(put(box(0.04, 0.16, 0.9, trim), 2.21, 0.55, 0));
  for (let i = 0; i < 4; i++) g.add(put(box(0.045, 0.012, 0.86, chrome()), 2.215, 0.49 + i * 0.04, 0));
  for (const z of [-1, 1]) {
    g.add(put(rbox(0.06, 0.12, 0.34, 0.02, flat('#fff8e0', { emissive: '#fff2c0', glow: 0.25 })), 2.18, 0.64, z * 0.66));
    g.add(put(rbox(0.06, 0.12, 0.3, 0.02, flat('#7a0a0a', { emissive: '#5a0000', glow: 0.5 })), -2.2, 0.66, z * 0.66));
  }
  for (const x of [-2.25, 2.25]) {
    g.add(put(box(0.02, 0.11, 0.42, flat('#f0f0ea', { rough: 0.4 })), x, 0.45, 0));
    g.add(put(rbox(0.12, 0.12, W + 0.02, 0.04, trim), x * 0.985, 0.36, 0));
  }
  if (variant % 3 === 1) {
    // Barres de toit.
    for (const z of [-0.65, 0.65]) g.add(put(box(1.4, 0.04, 0.05, metalDark()), -0.15, 1.46, z));
  }
  g.scale.set(L / 4.4, 1, 1);
  return g;
}

/** Fourgon utilitaire, porte latérale, échelle sur le toit. */
export function makeVan(): THREE.Group {
  const g = new THREE.Group();
  const body = flat('#d8d8d4', { rough: 0.35, metal: 0.4 });
  const profile: [number, number][] = [
    [-2.5, 0.38], [-2.5, 2.15], [1.3, 2.15], [1.75, 1.45], [2.45, 1.1], [2.5, 0.42], [2.25, 0.36], [2.0, 0.6], [1.45, 0.6], [1.2, 0.36], [-1.2, 0.36], [-1.45, 0.6], [-2.0, 0.6], [-2.25, 0.38],
  ];
  g.add(extrude(profile, 1.98, body, 0.05));
  const win = flat('#1a2028', { rough: 0.05, metal: 0.8 });
  g.add(extrude([[1.32, 2.05], [1.7, 1.48], [2.3, 1.15], [1.3, 1.15]], 1.9, win));
  for (const z of [-1, 1]) {
    g.add(put(box(0.6, 0.5, 0.02, win), 0.95, 1.6, z * 1.0));
    g.add(put(box(1.4, 1.6, 0.012, flat('#c8c8c4', { rough: 0.4, metal: 0.4 })), -0.3, 1.2, z * 1.0));
    g.add(put(box(0.02, 1.5, 0.02, flat('#555')), 0.42, 1.2, z * 1.005));
  }
  const logo = new THREE.MeshStandardMaterial({ map: signTexture(['PLOMBERIE MARTEL', '24 h / 24'], '#d8d8d4', '#2a4a8a', 512, 160), roughness: 0.4 });
  g.add(put(mesh(new THREE.PlaneGeometry(2.4, 0.75), logo), -0.9, 1.35, 1.0));
  g.add(put(mesh(new THREE.PlaneGeometry(2.4, 0.75), logo), -0.9, 1.35, -1.0, 0, Math.PI, 0));
  for (const x of [-1.72, 1.72]) for (const z of [-0.88, 0.88]) {
    const wheel = group(cyl(0.36, 0.36, 0.24, rubber(), 20), cyl(0.2, 0.2, 0.245, flat('#7a7e84', { metal: 1, rough: 0.3 }), 14));
    g.add(put(wheel, x, 0.36, z, Math.PI / 2, 0, 0));
  }
  for (const z of [-0.7, 0.7]) {
    g.add(put(rbox(0.05, 0.14, 0.3, 0.02, flat('#fff8e0', { emissive: '#fff2c0', glow: 0.25 })), 2.48, 0.85, z));
    g.add(put(rbox(0.05, 0.25, 0.14, 0.02, flat('#7a0a0a', { emissive: '#5a0000', glow: 0.4 })), -2.52, 1.0, z * 1.15));
  }
  // Échelle de toit.
  for (const z of [-0.25, 0.25]) g.add(put(box(3.4, 0.04, 0.04, steel()), -0.6, 2.25, z));
  for (let i = 0; i < 10; i++) g.add(put(box(0.03, 0.03, 0.5, steel()), -2.2 + i * 0.36, 2.25, 0));
  for (const x of [-2.3, 1.1]) for (const z of [-0.25, 0.25]) g.add(put(box(0.04, 0.12, 0.04, steel()), x, 2.19, z));
  return g;
}

/** Voiture de police : berline, livrée, rampe de gyrophares, pare-buffle. Les feux sont animés par `ActorView`. */
export function makePoliceCar(): { root: THREE.Group; red: THREE.Mesh; blue: THREE.Mesh } {
  const root = makeCar('#e8eaee', 0);
  const livery = flat('#1d3f9a', { rough: 0.3, metal: 0.4 });
  for (const z of [-1, 1]) {
    root.add(put(box(4.1, 0.16, 0.02, livery), 0, 0.62, z * 0.925));
    const label = new THREE.MeshStandardMaterial({ map: signTexture(['POLICE'], '#1d3f9a', '#ffffff', 512, 96), roughness: 0.4 });
    root.add(put(mesh(new THREE.PlaneGeometry(1.4, 0.26), label), -0.3, 0.62, z * 0.937, 0, z > 0 ? 0 : Math.PI, 0));
  }
  root.add(put(box(1.2, 0.02, 1.6, livery), 1.6, 0.86, 0));
  const base = put(rbox(0.3, 0.08, 1.3, 0.03, flat('#1a1a1c', { rough: 0.5 })), -0.15, 1.47, 0);
  root.add(base);
  const red = put(rbox(0.26, 0.1, 0.55, 0.04, flat('#ff2a2a', { emissive: '#ff1a1a', glow: 0.2 })), -0.15, 1.55, -0.33);
  const blue = put(rbox(0.26, 0.1, 0.55, 0.04, flat('#2a5cff', { emissive: '#1a40ff', glow: 0.2 })), -0.15, 1.55, 0.33);
  // Les gyrophares ont leur propre matériau, animé indépendamment.
  red.material = (red.material as THREE.MeshStandardMaterial).clone();
  blue.material = (blue.material as THREE.MeshStandardMaterial).clone();
  root.add(red, blue);
  root.add(put(box(0.1, 0.4, 1.3, metalDark()), 2.32, 0.5, 0));
  for (const z of [-0.5, 0, 0.5]) root.add(put(box(0.06, 0.06, 0.3, metalDark()), 2.36, 0.6, z, 0, 0, 0));
  root.add(put(cyl(0.012, 0.004, 0.7, flat('#111'), 4), -1.9, 1.15, -0.6));
  return { root, red, blue };
}

/** Caméra de surveillance : support mural, boîtier, pare-soleil, objectif, diode. */
export function makeCamera(): { root: THREE.Group; head: THREE.Group; led: THREE.Mesh } {
  const root = new THREE.Group();
  const white = flat('#e4e4de', { rough: 0.45 });
  root.add(put(box(0.12, 0.12, 0.03, white), 0, 0, 0));
  root.add(put(cyl(0.02, 0.02, 0.18, white, 8), 0, -0.02, 0.1, Math.PI / 2, 0, 0));
  const head = new THREE.Group();
  head.add(put(rbox(0.13, 0.12, 0.3, 0.03, white), 0, 0, 0.08));
  head.add(put(box(0.16, 0.012, 0.34, white), 0, 0.072, 0.1));
  head.add(put(cyl(0.045, 0.05, 0.03, flat('#111', { rough: 0.2 }), 16), 0, 0, 0.24, Math.PI / 2, 0, 0));
  head.add(put(cyl(0.03, 0.03, 0.005, flat('#203050', { rough: 0.02, metal: 0.8 }), 16), 0, 0, 0.257, Math.PI / 2, 0, 0));
  const led = put(ball(0.008, new THREE.MeshBasicMaterial({ color: '#ff2020' }), 6), 0.045, 0.035, 0.235);
  head.add(led);
  root.add(put(head, 0, -0.03, 0.18));
  return { root, head, led };
}

/** Boîtier électrique mural : armoire, cadenas, câbles qui montent. */
export function makeFuseBox(): { root: THREE.Group; door: THREE.Group; padlock: THREE.Group; cables: THREE.Group; cut: THREE.Group } {
  const root = new THREE.Group();
  const grey = flat('#7d8389', { rough: 0.5, metal: 0.6 });
  root.add(put(box(0.55, 0.7, 0.18, grey), 0, 0, 0));
  const door = new THREE.Group();
  door.add(put(box(0.53, 0.68, 0.02, grey), 0.265, 0, 0));
  door.add(put(box(0.16, 0.16, 0.002, new THREE.MeshStandardMaterial({ map: signTexture(['⚡'], '#f2c94c', '#111', 128, 128) })), 0.265, 0.15, 0.012));
  root.add(put(door, -0.265, 0, 0.1));
  const padlock = group(
    put(rbox(0.05, 0.06, 0.02, 0.008, flat('#c8a050', { rough: 0.3, metal: 1 })), 0, 0, 0),
    put(mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI), chrome()), 0, 0.03, 0),
  );
  root.add(put(padlock, 0.24, -0.05, 0.125));
  const cables = new THREE.Group();
  for (const x of [-0.12, 0, 0.12]) cables.add(tube([[x, 0.35, 0.04], [x, 0.8, 0.05], [x, 1.6, 0.05]], 0.018, flat('#151515', { rough: 0.8 })));
  root.add(cables);
  const cut = new THREE.Group();
  for (const x of [-0.12, 0, 0.12]) {
    cut.add(tube([[x, 0.35, 0.04], [x + 0.05, 0.25, 0.12], [x + 0.08, 0.1, 0.2]], 0.018, flat('#151515', { rough: 0.8 })));
    cut.add(tube([[x, 1.6, 0.05], [x, 0.85, 0.05], [x - 0.05, 0.62, 0.13]], 0.018, flat('#151515', { rough: 0.8 })));
    cut.add(put(cyl(0.01, 0.01, 0.02, flat('#c87533', { metal: 1, rough: 0.3 }), 6), x + 0.08, 0.08, 0.21));
  }
  cut.visible = false;
  root.add(cut);
  // Intérieur : disjoncteurs.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) root.add(put(box(0.05, 0.1, 0.03, flat(c === 0 ? '#c0392b' : '#e8e8e8', { rough: 0.6 })), -0.18 + c * 0.072, 0.18 - r * 0.16, 0.08));
  return { root, door, padlock, cables, cut };
}

/** Porte ronde de chambre forte, sur gonds, avec volant et pênes. */
export function makeVaultDoor(width: number): { root: THREE.Group; door: THREE.Group } {
  const root = new THREE.Group();
  const steelMat = flat('#8d939a', { rough: 0.3, metal: 0.95 });
  const dark = metalDark();
  // Encadrement massif.
  root.add(put(box(width + 0.5, 0.25, 0.5, dark), 0, 2.3, 0));
  for (const s of [-1, 1]) root.add(put(box(0.25, 2.3, 0.5, dark), s * (width / 2 + 0.125), 1.15, 0));
  const door = new THREE.Group();
  const r = Math.min(width / 2, 1.05);
  door.add(put(cyl(r, r, 0.4, steelMat, 40), width / 2, 1.15, 0, Math.PI / 2, 0, 0));
  door.add(put(cyl(r * 0.85, r * 0.85, 0.42, flat('#a8aeb4', { rough: 0.25, metal: 1 }), 40), width / 2, 1.15, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    door.add(put(cyl(0.045, 0.045, 0.15, chrome(), 10), width / 2 + Math.cos(a) * r, 1.15 + Math.sin(a) * r, 0, 0, 0, a + Math.PI / 2));
  }
  // Volant à trois branches.
  const wheel = new THREE.Group();
  wheel.add(mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 28), chrome()));
  for (let i = 0; i < 3; i++) wheel.add(put(box(0.56, 0.03, 0.03, chrome()), 0, 0, 0, 0, 0, (i / 3) * Math.PI));
  wheel.add(put(cyl(0.07, 0.07, 0.08, chrome(), 16), 0, 0, 0, Math.PI / 2, 0, 0));
  door.add(put(wheel, width / 2, 1.15, 0.26));
  door.add(put(cyl(0.06, 0.06, 0.03, flat('#111'), 16), width / 2 + 0.45, 1.5, 0.22, Math.PI / 2, 0, 0));
  // Gonds massifs.
  for (const y of [0.55, 1.75]) door.add(put(cyl(0.08, 0.08, 0.3, dark, 12), 0, y, 0.15));
  root.add(put(door, -width / 2, 0, 0));
  return { root, door };
}

/** Lampadaire : mât, crosse, tête et vasque lumineuse. Renvoie la position de l'ampoule. */
export function makeStreetLamp(): { root: THREE.Group; bulb: THREE.Vector3; glass: THREE.Mesh } {
  const root = new THREE.Group();
  const iron = flat('#22262a', { rough: 0.5, metal: 0.7 });
  root.add(put(cyl(0.16, 0.2, 0.5, iron, 12), 0, 0.25, 0));
  root.add(put(cyl(0.065, 0.09, 5.2, iron, 12), 0, 2.85, 0));
  for (const y of [0.55, 1.2]) root.add(put(mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), iron), 0, y, 0, Math.PI / 2, 0, 0));
  root.add(tube([[0, 5.3, 0], [0, 5.6, 0.1], [0, 5.7, 0.5], [0, 5.62, 1.05]], 0.05, iron));
  root.add(put(rbox(0.32, 0.12, 0.6, 0.04, iron), 0, 5.6, 1.15));
  const lens = put(box(0.26, 0.03, 0.5, flat('#fff3d0', { emissive: '#ffd890', glow: 2.5 })), 0, 5.53, 1.15);
  root.add(lens);
  return { root, bulb: new THREE.Vector3(0, 5.45, 1.15), glass: lens };
}

/** Applique murale grillagée (ruelle). */
export function makeWallLamp(): { root: THREE.Group; glass: THREE.Mesh } {
  const root = new THREE.Group();
  const iron = flat('#22262a', { rough: 0.5, metal: 0.7 });
  root.add(put(box(0.18, 0.25, 0.06, iron), 0, 0, 0));
  root.add(put(box(0.04, 0.04, 0.3, iron), 0, 0.05, 0.15));
  const lens = put(capsule(0.08, 0.26, flat('#fff0c0', { emissive: '#ffcf80', glow: 2.5 }), 10), 0, -0.05, 0.3, 0, 0, Math.PI / 2);
  root.add(lens);
  for (let i = 0; i < 4; i++) root.add(put(mesh(new THREE.TorusGeometry(0.09, 0.006, 4, 12), iron), -0.1 + i * 0.065, -0.05, 0.3, 0, Math.PI / 2, 0));
  return { root, glass: lens };
}

