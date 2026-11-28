import * as THREE from 'three';
import { ball, box, capsule, chrome, cyl, extrude, flat, group, mesh, metalDark, put, rbox, steel, surface, tube } from '../build';

/**
 * Armes et outils, modelés par code. Chaque objet est construit canon / pointe vers +z, poignée vers −y,
 * à l'échelle réelle (mètres), pour servir aussi bien en main qu'à la ceinture d'un vigile.
 */

/** Pistolet semi-automatique : glissière striée, canon, carcasse, pontet, détente, chien, organes de visée. */
export function makePistol(): THREE.Group {
  const g = new THREE.Group();
  const slideMat = flat('#26282c', { rough: 0.32, metal: 0.9 });
  const frameMat = flat('#17181b', { rough: 0.55, metal: 0.5 });
  const gripMat = flat('#2b2420', { rough: 0.95 });

  // Glissière, avec chanfreins et stries de préhension à l'arrière.
  g.add(put(rbox(0.027, 0.03, 0.185, 0.005, slideMat), 0, 0.032, 0.02));
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1]) g.add(put(box(0.002, 0.022, 0.003, frameMat), side * 0.0138, 0.032, -0.062 + i * 0.006));
  }
  // Fenêtre d'éjection et canon apparent.
  g.add(put(box(0.014, 0.004, 0.036, flat('#6e7379', { rough: 0.25, metal: 1 })), 0.004, 0.0465, 0.035));
  g.add(put(cyl(0.0058, 0.0058, 0.03, flat('#101113', { rough: 0.3, metal: 1 }), 12), 0, 0.03, 0.118, Math.PI / 2, 0, 0));
  g.add(put(cyl(0.0042, 0.0042, 0.031, flat('#000000'), 10), 0, 0.03, 0.119, Math.PI / 2, 0, 0));
  // Guidon, hausse.
  g.add(put(box(0.004, 0.006, 0.008, slideMat), 0, 0.05, 0.102));
  for (const side of [-1, 1]) g.add(put(box(0.006, 0.007, 0.008, slideMat), side * 0.008, 0.05, -0.064));
  for (const x of [-0.008, 0, 0.008]) g.add(put(ball(0.0012, flat('#d8ffd0', { emissive: '#a8ff90', glow: 1.5 }), 5), x, 0.0505, x === 0 ? 0.0975 : -0.0685));
  // Chien.
  g.add(put(rbox(0.008, 0.016, 0.012, 0.003, frameMat), 0, 0.03, -0.078, -0.4, 0, 0));

  // Carcasse et rail.
  g.add(put(rbox(0.026, 0.02, 0.165, 0.005, frameMat), 0, 0.008, 0.012));
  g.add(put(box(0.02, 0.006, 0.05, frameMat), 0, -0.005, 0.07));
  // Pontet (arceau) et détente.
  g.add(tube([[0, -0.002, 0.045], [0, -0.03, 0.04], [0, -0.036, 0.02], [0, -0.03, 0.0], [0, -0.004, -0.004]], 0.0028, frameMat, 6));
  g.add(put(rbox(0.005, 0.02, 0.006, 0.002, slideMat), 0, -0.014, 0.018, 0.25, 0, 0));
  // Poignée inclinée, plaquettes quadrillées, talon de chargeur.
  const grip = put(rbox(0.028, 0.108, 0.048, 0.008, frameMat), 0, -0.052, -0.04, 0.28, 0, 0);
  g.add(grip);
  for (const side of [-1, 1]) {
    g.add(put(rbox(0.004, 0.08, 0.036, 0.002, gripMat), side * 0.0145, -0.054, -0.041, 0.28, 0, 0));
    for (let i = 0; i < 6; i++) g.add(put(box(0.0015, 0.003, 0.03, frameMat), side * 0.0168, -0.022 - i * 0.012, -0.031 - i * 0.0034, 0.28, 0, 0));
  }
  g.add(put(rbox(0.026, 0.01, 0.046, 0.003, slideMat), 0, -0.108, -0.056, 0.28, 0, 0));
  // Arrêtoir de glissière et bouton de chargeur.
  g.add(put(box(0.003, 0.004, 0.022, slideMat), -0.0145, 0.014, 0.008));
  g.add(put(cyl(0.003, 0.003, 0.004, slideMat, 8), -0.0145, -0.012, -0.012, 0, 0, Math.PI / 2));
  return g;
}

/** Pied-de-biche : tige hexagonale, col de cygne fendu, extrémité aplatie. */
export function makeCrowbar(): THREE.Group {
  const g = new THREE.Group();
  const red = flat('#a8242a', { rough: 0.5, metal: 0.6 });
  const bare = steel();
  g.add(put(cyl(0.011, 0.011, 0.52, red, 6), 0, 0.02, 0));
  // Col de cygne.
  g.add(tube([[0, 0.28, 0], [0, 0.33, 0.004], [0, 0.365, 0.03], [0, 0.365, 0.07], [0, 0.34, 0.098]], 0.011, red, 6));
  for (const side of [-1, 1]) g.add(put(box(0.006, 0.006, 0.05, bare), side * 0.006, 0.322, 0.108, 0.75, 0, 0));
  // Bout plat, biseauté et usé.
  g.add(put(box(0.03, 0.07, 0.006, bare), 0, -0.262, 0.004, 0.12, 0, 0));
  g.add(put(box(0.022, 0.02, 0.009, red), 0, -0.228, 0));
  // Ruban de prise.
  g.add(put(cyl(0.0125, 0.0125, 0.13, flat('#161616', { rough: 1 }), 8), 0, -0.1, 0));
  return g;
}

/** Coupe-fil : deux branches gainées, axe, mâchoires affûtées. */
export function makeCutters(): THREE.Group {
  const g = new THREE.Group();
  const sleeve = flat('#d1421a', { rough: 0.8 });
  const jaw = steel();
  for (const side of [-1, 1]) {
    g.add(tube([[side * 0.006, 0.0, 0], [side * 0.014, -0.05, 0], [side * 0.022, -0.11, 0], [side * 0.018, -0.16, 0]], 0.0075, sleeve, 6));
    g.add(put(ball(0.0085, flat('#22201e', { rough: 0.9 }), 6), side * 0.018, -0.162, 0));
    // Mâchoire.
    g.add(put(extrude([[0, 0], [0.012, 0], [0.004, 0.05], [0, 0.055]], 0.008, jaw), side * 0.001, 0.005, 0, 0, side < 0 ? Math.PI : 0, 0));
  }
  g.add(put(cyl(0.008, 0.008, 0.012, chrome(), 10), 0, 0.006, 0, Math.PI / 2, 0, 0));
  g.add(put(cyl(0.004, 0.004, 0.014, metalDark(), 6), 0, 0.006, 0, Math.PI / 2, 0, 0));
  return g;
}

/** Trousse de crochetage : étui de cuir ouvert, crochets, entraîneur. */
export function makeLockpicks(): THREE.Group {
  const g = new THREE.Group();
  const leather = flat('#3a281c', { rough: 0.85 });
  g.add(put(rbox(0.075, 0.12, 0.006, 0.003, leather), 0, -0.02, 0));
  g.add(put(rbox(0.075, 0.035, 0.008, 0.003, flat('#2c1e15', { rough: 0.85 })), 0, -0.06, 0.004));
  const pick = steel();
  const tips: number[][] = [[0.004, 0.006], [0.006, -0.004], [-0.005, 0.005], [0, 0.008], [0.007, 0.002]];
  tips.forEach((tip, i) => {
    const x = (i - 2) * 0.012;
    g.add(put(box(0.003, 0.11, 0.0012, pick), x, 0.0, 0.005));
    g.add(put(box(0.003, 0.012, 0.0012, pick), x + (tip[0] ?? 0), 0.058 + (tip[1] ?? 0), 0.005, 0, 0, (i - 2) * 0.4));
  });
  // Entraîneur en L, tenu à part.
  g.add(put(box(0.004, 0.09, 0.0015, pick), 0.045, 0.01, 0.006));
  g.add(put(box(0.02, 0.004, 0.0015, pick), 0.037, 0.055, 0.006));
  return g;
}

/** Perceuse thermique : carter, poignées, batterie, mandrin, foret, lance à oxygène. */
export function makeDrill(): THREE.Group {
  const g = new THREE.Group();
  const body = flat('#d9a21b', { rough: 0.55, metal: 0.2 });
  const dark = flat('#1c1d20', { rough: 0.7 });
  g.add(put(rbox(0.09, 0.1, 0.24, 0.025, body), 0, 0.03, 0));
  g.add(put(rbox(0.094, 0.03, 0.12, 0.01, dark), 0, 0.085, -0.02));
  for (let i = 0; i < 6; i++) g.add(put(box(0.096, 0.004, 0.006, dark), 0, 0.045, -0.09 + i * 0.014));
  // Mandrin et foret.
  g.add(put(cyl(0.034, 0.04, 0.05, dark, 14), 0, 0.03, 0.145, Math.PI / 2, 0, 0));
  g.add(put(cyl(0.024, 0.03, 0.05, steel(), 14), 0, 0.03, 0.19, Math.PI / 2, 0, 0));
  g.add(put(cyl(0.009, 0.009, 0.2, steel(), 8), 0, 0.03, 0.31, Math.PI / 2, 0, 0));
  g.add(put(mesh(new THREE.ConeGeometry(0.011, 0.03, 8), flat('#e8c06a', { rough: 0.3, metal: 1 })), 0, 0.03, 0.425, Math.PI / 2, 0, 0));
  // Poignée pistolet, gâchette, batterie.
  g.add(put(rbox(0.05, 0.14, 0.06, 0.018, dark), 0, -0.08, -0.06, 0.18, 0, 0));
  g.add(put(rbox(0.014, 0.03, 0.012, 0.004, flat('#b3261e')), 0, -0.03, -0.018));
  g.add(put(rbox(0.085, 0.055, 0.12, 0.015, dark), 0, -0.17, -0.07));
  g.add(put(box(0.02, 0.006, 0.03, flat('#5dff7a', { emissive: '#35e85a', glow: 1.6 })), 0, -0.141, -0.03));
  // Poignée latérale et lance.
  g.add(put(cyl(0.016, 0.016, 0.13, dark, 10), -0.1, 0.03, 0.09, 0, 0, Math.PI / 2));
  g.add(tube([[0.03, 0.09, -0.1], [0.05, 0.13, 0.0], [0.04, 0.1, 0.16], [0.012, 0.04, 0.3]], 0.006, flat('#7a3a1a', { rough: 0.4, metal: 0.8 }), 6));
  return g;
}

/** Cagoule repliée, tenue à la main. */
export function makeMask(): THREE.Group {
  const g = new THREE.Group();
  const wool = surface('fabric', '#141416');
  const head = mesh(new THREE.SphereGeometry(0.1, 16, 12), wool);
  head.scale.set(0.95, 1.15, 0.5);
  g.add(head);
  g.add(put(cyl(0.085, 0.09, 0.08, wool, 16), 0, -0.13, 0).rotateX(0.0));
  // Ouverture des yeux.
  const hole = flat('#050506', { rough: 1 });
  g.add(put(rbox(0.11, 0.035, 0.012, 0.012, hole), 0, 0.02, 0.048));
  return g;
}

/** Sac de sport : corps, fermeture, poignées, bandoulière. */
export function makeBag(): THREE.Group {
  const g = new THREE.Group();
  const cloth = surface('fabric', '#23262b');
  const body = capsule(0.17, 0.72, cloth, 14);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1, 1, 0.9);
  g.add(put(body, 0, 0.17, 0));
  g.add(put(box(0.5, 0.008, 0.012, flat('#8a8d92', { rough: 0.3, metal: 1 })), 0, 0.342, 0));
  for (const side of [-1, 1]) {
    g.add(tube([[-0.12, 0.3, side * 0.09], [-0.08, 0.42, side * 0.05], [0.08, 0.42, side * 0.05], [0.12, 0.3, side * 0.09]], 0.009, flat('#101114', { rough: 0.9 }), 6));
    g.add(put(rbox(0.012, 0.2, 0.012, 0.004, flat('#101114')), side * 0.3, 0.2, 0));
  }
  return g;
}

/** Liasse de billets cerclée. */
export function makeCashStack(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(0.155, 0.03, 0.066, 0.004, flat('#7fa77a', { rough: 0.9 })));
  g.add(put(box(0.03, 0.032, 0.068, flat('#e9e3cf', { rough: 0.9 })), 0, 0, 0));
  return g;
}

export interface FpsArms {
  readonly root: THREE.Group;
  /** Poignet droit : on y accroche l'objet tenu. */
  readonly rightHand: THREE.Group;
  readonly left: THREE.Group;
  readonly right: THREE.Group;
}

/** Avant-bras et mains gantées, vus à la première personne. */
export function makeArms(sleeveColor = '#2f3136'): FpsArms {
  const sleeve = surface('fabric', sleeveColor);
  const glove = flat('#18181a', { rough: 0.85 });
  const seam = flat('#0c0c0d', { rough: 1 });

  const hand = (side: number): THREE.Group => {
    const h = new THREE.Group();
    h.add(put(rbox(0.08, 0.03, 0.095, 0.012, glove), 0, 0, 0.045));
    // Phalanges repliées autour d'une poignée.
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.019;
      h.add(put(capsule(0.0098, 0.05, glove, 6), x, -0.012, 0.105, Math.PI / 2 - 0.5, 0, 0));
      h.add(put(capsule(0.0092, 0.042, glove, 6), x, -0.042, 0.108, 0.25, 0, 0));
      h.add(put(capsule(0.0088, 0.034, glove, 6), x, -0.058, 0.085, -0.9, 0, 0));
      h.add(put(ball(0.0108, seam, 6), x, 0.004, 0.092));
    }
    h.add(put(capsule(0.012, 0.06, glove, 6), side * -0.044, -0.008, 0.06, Math.PI / 2 - 0.2, 0, side * 0.5));
    h.add(put(capsule(0.0105, 0.04, glove, 6), side * -0.045, -0.03, 0.096, 0.5, 0, side * 0.2));
    // Poignet du gant.
    h.add(put(cyl(0.041, 0.038, 0.035, seam, 12), 0, 0, -0.012, Math.PI / 2, 0, 0));
    return h;
  };

  const arm = (side: number): { arm: THREE.Group; wrist: THREE.Group } => {
    // L'avant-bras part du poignet et revient vers la caméra (+z) ; la main pointe vers l'avant (−z).
    const a = new THREE.Group();
    const fore = capsule(0.047, 0.46, sleeve, 12);
    fore.rotation.x = Math.PI / 2;
    fore.scale.set(1, 1, 0.92);
    a.add(put(fore, 0, -0.01, 0.24));
    a.add(put(cyl(0.05, 0.047, 0.03, sleeve, 12), 0, 0, 0.02, Math.PI / 2, 0, 0));
    const wrist = new THREE.Group();
    wrist.rotation.y = Math.PI;
    wrist.add(hand(side));
    a.add(wrist);
    return { arm: a, wrist };
  };

  const right = arm(1);
  const left = arm(-1);
  const root = group(right.arm, left.arm);
  return { root, rightHand: right.wrist, left: left.arm, right: right.arm };
}
