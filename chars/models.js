'use strict';
// Modèles 3D des chars, blindage et modules internes.
// Repère en mètres : x vers l'avant, y vers la gauche, z vers le haut, origine au centre au sol.
// Les modules « turret » sont exprimés dans le repère de la tourelle (x, y relatifs au pivot).
const TankModels = (() => {
  const D2R = Math.PI / 180;

  const SPECS = {
    light: {
      inspired: 'Based on the Pz.Kpfw. II Luchs', real: '4.6 × 2.5 × 2.1 m · 12 t · 4 crew',
      L: 4.6, W: 2.5, tw: 0.38, gc: 0.42, tt: 0.86, ht: 1.45, zn: 0.95, xn: 2.25,
      sUp: 22, sLow: 45, sRear: 12, sideSlope: 0, rearX: -2.2,
      wheels: { n: 5, r: 0.37, x0: 1.45, x1: -1.55, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 1.95, z: 0.5, r: 0.27 }, idl: { x: -1.98, z: 0.45, r: 0.24 },
      turret: {
        x: 0.2, h: 0.62, ts: 0.84,
        poly: [[0.78, 0.42], [0.55, 0.72], [-0.7, 0.72], [-0.88, 0.45], [-0.88, -0.45], [-0.7, -0.72], [0.55, -0.72], [0.78, -0.42]],
        mantlet: { type: 'box', d: 0.16, w: 0.26, h: 0.17 }, cupola: [-0.4, 0.3, 0.24, 0.08, 2], smoke: true,
      },
      gun: { z: 1.75, fx: 0.78, len: 2.9, r: 0.035, sleeve: [0.065, 0.5], brake: null, name: '5 cm KwK 39 L/60' },
      exhaust: [[-2.12, 0.45], [-2.12, -0.45]], jerry: true,
      armor: {
        hull: { up: [30, 22], low: [30, 45], side: [20, 0], rear: [15, 12], roof: 10 },
        turret: { front: [30, 10], side: [20, 20], rear: [20, 15], mantlet: [40, 0] },
      },
      crew: ['driver', 'radio', 'gunner', 'commander'],
      modules: [
        ['crew', 'driver', 'hull', 1.25, 0.42, 0.88, 0.5, 0.48, 0.82],
        ['crew', 'radio', 'hull', 1.25, -0.42, 0.88, 0.5, 0.48, 0.82],
        ['trans', null, 'hull', 1.75, 0, 0.7, 0.42, 0.7, 0.48],
        ['crew', 'gunner', 'turret', 0.05, 0.38, 1.38, 0.42, 0.4, 0.85],
        ['crew', 'commander', 'turret', -0.5, -0.3, 1.5, 0.42, 0.42, 0.85],
        ['breech', null, 'turret', -0.15, 0, 1.75, 0.75, 0.22, 0.24],
        ['ammo', null, 'hull', 0.1, 1.02, 1.15, 1.1, 0.3, 0.42],
        ['ammo', null, 'hull', 0.1, -1.02, 1.15, 1.1, 0.3, 0.42],
        ['engine', null, 'hull', -1.35, 0, 0.92, 1.15, 1.0, 0.8],
        ['fuel', null, 'hull', -1.35, 0.68, 0.85, 1.0, 0.3, 0.6],
        ['fuel', null, 'hull', -1.35, -0.68, 0.85, 1.0, 0.3, 0.6],
      ],
    },
    medium: {
      inspired: 'Based on the Pz.Kpfw. V Panther', real: '6.9 × 3.4 × 2.9 m · 45 t · 5 crew',
      L: 6.9, W: 3.42, tw: 0.66, gc: 0.56, tt: 1.12, ht: 1.95, zn: 1.08, xn: 3.38,
      sUp: 55, sLow: 55, sRear: 30, sideSlope: 40, rearX: -3.3,
      wheels: { n: 8, r: 0.43, x0: 2.45, x1: -2.35, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 3.0, z: 0.68, r: 0.36 }, idl: { x: -3.0, z: 0.62, r: 0.32 },
      turret: {
        x: 0.25, h: 0.88, ts: 0.8,
        poly: [[1.05, 0.55], [0.8, 0.95], [-1.05, 1.0], [-1.3, 0.7], [-1.3, -0.7], [-1.05, -1.0], [0.8, -0.95], [1.05, -0.55]],
        mantlet: { type: 'cyl', r: 0.3, w: 0.36 }, cupola: [-0.55, 0.42, 0.33, 0.24, 7], rearHatch: true, ports: true, pilze: true,
      },
      gun: { z: 2.37, fx: 1.2, len: 5.25, r: 0.045, sleeve: [0.085, 0.9], brake: { r: 0.085, len: 0.36 }, name: '7.5 cm KwK 42 L/70' },
      exhaust: [[-3.22, 0.42], [-3.22, -0.42]], skirts: true, mg: true, zim: true, fans: true, rearBins: true, dampers: true,
      armor: {
        hull: { up: [80, 55], low: [60, 55], side: [40, 40], rear: [40, 30], roof: 16 },
        turret: { front: [100, 11], side: [45, 25], rear: [45, 25], mantlet: [110, 0] },
      },
      crew: ['driver', 'radio', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 2.0, 0.55, 1.05, 0.55, 0.5, 0.9],
        ['crew', 'radio', 'hull', 2.0, -0.55, 1.05, 0.55, 0.5, 0.9],
        ['trans', null, 'hull', 2.35, 0, 0.82, 0.55, 0.55, 0.5],
        ['crew', 'gunner', 'turret', 0.25, 0.45, 1.75, 0.45, 0.42, 0.9],
        ['crew', 'commander', 'turret', -0.6, 0.35, 1.95, 0.45, 0.42, 0.9],
        ['crew', 'loader', 'turret', -0.1, -0.5, 1.65, 0.45, 0.42, 0.9],
        ['breech', null, 'turret', 0.1, 0, 2.37, 1.0, 0.3, 0.32],
        ['ammo', null, 'hull', 0.1, 1.25, 1.35, 2.2, 0.3, 0.4],
        ['ammo', null, 'hull', 0.1, -1.25, 1.35, 2.2, 0.3, 0.4],
        ['engine', null, 'hull', -1.95, 0, 1.38, 1.3, 1.1, 0.95],
        ['fuel', null, 'hull', -2.0, 0.82, 1.1, 1.1, 0.35, 0.7],
        ['fuel', null, 'hull', -2.0, -0.82, 1.1, 1.1, 0.35, 0.7],
      ],
    },
    heavy: {
      inspired: 'Based on the Pz.Kpfw. VI Tiger I', real: '6.3 × 3.6 × 3.0 m · 57 t · 5 crew',
      L: 6.32, W: 3.56, tw: 0.72, gc: 0.47, tt: 1.08, ht: 1.86, zn: 1.2, xn: 3.12,
      sUp: 10, sLow: 45, sRear: 9, sideSlope: 0, rearX: -3.08,
      wheels: { n: 8, r: 0.4, x0: 2.2, x1: -2.25, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 2.75, z: 0.62, r: 0.36 }, idl: { x: -2.8, z: 0.6, r: 0.3 },
      turret: {
        x: -0.15, h: 0.82, ts: 0.97, poly: null,
        mantlet: { type: 'box', d: 0.3, w: 0.72, h: 0.33 }, cupola: [-0.45, 0.55, 0.34, 0.28, 7], smoke: true, spare: true, bin: true, ports: true,
      },
      gun: { z: 2.26, fx: 1.25, len: 4.9, r: 0.055, sleeve: [0.095, 0.6], brake: { r: 0.13, len: 0.42 }, name: '8.8 cm KwK 36 L/56' },
      exhaust: [[-3.0, 0.55], [-3.0, -0.55]], tallExhaust: true, mg: true, zim: true, smines: true, grilles: true,
      armor: {
        hull: { up: [100, 10], low: [100, 45], side: [80, 0], rear: [80, 9], roof: 25 },
        turret: { front: [100, 0], side: [80, 0], rear: [80, 0], mantlet: [150, 0] },
      },
      crew: ['driver', 'radio', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 2.2, 0.55, 0.95, 0.55, 0.5, 0.9],
        ['crew', 'radio', 'hull', 2.2, -0.55, 0.95, 0.55, 0.5, 0.9],
        ['trans', null, 'hull', 2.45, 0, 0.75, 0.5, 0.55, 0.5],
        ['crew', 'gunner', 'turret', 0.2, 0.45, 1.65, 0.45, 0.42, 0.9],
        ['crew', 'commander', 'turret', -0.75, 0.4, 1.9, 0.45, 0.42, 0.9],
        ['crew', 'loader', 'turret', -0.1, -0.55, 1.6, 0.45, 0.42, 0.9],
        ['breech', null, 'turret', 0.0, 0, 2.26, 1.1, 0.32, 0.34],
        ['ammo', null, 'hull', 0.4, 1.35, 1.45, 2.2, 0.4, 0.5],
        ['ammo', null, 'hull', 0.4, -1.35, 1.45, 2.2, 0.4, 0.5],
        ['ammo', null, 'hull', -0.2, 0.62, 0.65, 1.0, 0.35, 0.3],
        ['engine', null, 'hull', -2.15, 0, 1.15, 1.4, 1.1, 1.1],
        ['fuel', null, 'hull', -2.05, 0.85, 1.0, 1.2, 0.3, 0.7],
        ['fuel', null, 'hull', -2.05, -0.85, 1.0, 1.2, 0.3, 0.7],
      ],
    },
    destroyer: {
      inspired: 'Based on the Jagdpanther', real: '6.9 × 3.4 × 2.7 m · 46 t · 5 crew',
      L: 6.9, W: 3.42, tw: 0.66, gc: 0.56, tt: 1.12, ht: 2.32, zn: 1.08, xn: 3.38,
      sUp: 55, sLow: 55, sRear: 35, sideSlope: 30, rearX: -3.3,
      wheels: { n: 8, r: 0.43, x0: 2.45, x1: -2.35, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 3.0, z: 0.68, r: 0.36 }, idl: { x: -3.0, z: 0.62, r: 0.32 },
      turret: null, mount: { x: 2.27, y: -0.1 },
      gun: { z: 1.86, fx: 0.35, len: 6.3, r: 0.055, sleeve: null, brake: { r: 0.12, len: 0.45 }, name: '8.8 cm PaK 43 L/71' },
      exhaust: [[-3.22, 0.42], [-3.22, -0.42]], skirts: true, zim: true, fans: true, dampers: true, rearBins: true,
      armor: {
        hull: { up: [80, 55], low: [60, 55], side: [50, 30], rear: [40, 35], roof: 25 },
        turret: null,
      },
      crew: ['driver', 'radio', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 1.9, 0.55, 1.05, 0.55, 0.5, 0.9],
        ['crew', 'radio', 'hull', 1.9, -0.6, 1.05, 0.55, 0.5, 0.9],
        ['trans', null, 'hull', 2.35, 0, 0.82, 0.55, 0.55, 0.5],
        ['crew', 'gunner', 'hull', 0.95, 0.4, 1.75, 0.45, 0.42, 0.9],
        ['crew', 'loader', 'hull', 0.6, -0.6, 1.7, 0.45, 0.42, 0.9],
        ['crew', 'commander', 'hull', 0.1, -0.35, 1.95, 0.45, 0.42, 0.9],
        ['breech', null, 'hull', 1.6, -0.1, 1.86, 1.2, 0.32, 0.34],
        ['ammo', null, 'hull', 0.0, 1.25, 1.35, 2.0, 0.3, 0.4],
        ['ammo', null, 'hull', 0.0, -1.25, 1.35, 2.0, 0.3, 0.4],
        ['engine', null, 'hull', -1.95, 0, 1.38, 1.3, 1.1, 0.95],
        ['fuel', null, 'hull', -2.0, 0.82, 1.1, 1.1, 0.35, 0.7],
        ['fuel', null, 'hull', -2.0, -0.82, 1.1, 1.1, 0.35, 0.7],
      ],
    },
    pz4: {
      inspired: 'Based on the Pz.Kpfw. IV Ausf. H', real: '5.9 × 2.9 × 2.7 m · 25 t · 5 crew',
      L: 5.89, W: 2.88, tw: 0.4, gc: 0.4, tt: 0.9, ht: 1.65, zn: 1.0, xn: 2.92,
      sUp: 10, sLow: 14, sRear: 10, sideSlope: 0, rearX: -2.9,
      wheels: { n: 8, r: 0.235, x0: 1.95, x1: -2.05, inter: false, xs: [1.95, 1.45, 0.9, 0.4, -0.25, -0.75, -1.3, -1.8], bogies: true }, rollers: [1.4, 0.45, -0.45, -1.35], rollerR: 0.11,
      spr: { x: 2.55, z: 0.6, r: 0.3 }, idl: { x: -2.65, z: 0.55, r: 0.27 },
      turret: {
        x: -0.15, h: 0.78, ts: 0.82,
        poly: [[0.95, 0.55], [0.75, 0.85], [-0.95, 0.92], [-1.1, 0.65], [-1.1, -0.65], [-0.95, -0.92], [0.75, -0.85], [0.95, -0.55]],
        mantlet: { type: 'box', d: 0.2, w: 0.32, h: 0.22 }, cupola: [-0.75, 0.0, 0.3, 0.25, 5], bin: true, tskirt: true, sideDoors: true,
      },
      gun: { z: 2.1, fx: 0.98, len: 3.6, r: 0.045, sleeve: [0.075, 0.55], brake: { r: 0.09, len: 0.32 }, name: '7.5 cm KwK 40 L/48' },
      exhaust: [[-2.88, 0.45]], skirts: { off: 0.2, z0: 0.38, z1: 1.18 }, mg: true, zim: true, muffler: true, links: 'front',
      armor: {
        hull: { up: [80, 10], low: [80, 12], side: [30, 0], rear: [20, 10], roof: 12 },
        turret: { front: [50, 10], side: [30, 25], rear: [30, 25], mantlet: [50, 0] },
      },
      crew: ['driver', 'radio', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 1.95, 0.5, 0.9, 0.5, 0.45, 0.82],
        ['crew', 'radio', 'hull', 1.95, -0.5, 0.9, 0.5, 0.45, 0.82],
        ['trans', null, 'hull', 2.35, 0, 0.72, 0.45, 0.55, 0.45],
        ['crew', 'gunner', 'turret', 0.15, 0.42, 1.55, 0.42, 0.4, 0.85],
        ['crew', 'commander', 'turret', -0.7, 0.0, 1.75, 0.42, 0.42, 0.85],
        ['crew', 'loader', 'turret', -0.1, -0.45, 1.5, 0.42, 0.4, 0.85],
        ['breech', null, 'turret', 0.05, 0, 2.1, 0.9, 0.28, 0.3],
        ['ammo', null, 'hull', 0.2, 1.0, 1.05, 1.6, 0.3, 0.4],
        ['ammo', null, 'hull', 0.2, -1.0, 1.05, 1.6, 0.3, 0.4],
        ['engine', null, 'hull', -1.9, 0, 1.05, 1.2, 1.0, 0.85],
        ['fuel', null, 'hull', -0.7, 0.6, 0.6, 0.9, 0.5, 0.35],
        ['fuel', null, 'hull', -0.7, -0.6, 0.6, 0.9, 0.5, 0.35],
      ],
    },
    kingtiger: {
      inspired: 'Based on the Pz.Kpfw. VI Ausf. B Tiger II', real: '7.4 × 3.8 × 3.1 m · 68 t · 5 crew',
      L: 7.38, W: 3.755, tw: 0.8, gc: 0.5, tt: 1.2, ht: 2.05, zn: 1.2, xn: 3.65,
      sUp: 50, sLow: 50, sRear: 30, sideSlope: 25, rearX: -3.6,
      wheels: { n: 9, r: 0.4, x0: 2.65, x1: -2.65, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 3.25, z: 0.7, r: 0.38 }, idl: { x: -3.3, z: 0.65, r: 0.33 },
      turret: {
        x: 0.15, h: 0.95, ts: 0.8,
        poly: [[1.1, 0.55], [0.95, 0.95], [-1.7, 1.05], [-1.85, 0.8], [-1.85, -0.8], [-1.7, -1.05], [0.95, -0.95], [1.1, -0.55]],
        mantlet: { type: 'bell', r: 0.36, len: 0.5 }, cupola: [-0.75, 0.5, 0.34, 0.25, 7], spare: true, rearHatch: true, ports: true, pilze: true,
      },
      gun: { z: 2.55, fx: 1.25, len: 6.3, r: 0.055, sleeve: [0.1, 0.8], brake: { r: 0.12, len: 0.45 }, name: '8.8 cm KwK 43 L/71' },
      exhaust: [[-3.5, 0.4], [-3.5, -0.4]], tallExhaust: true, mg: true, zim: true, fans: true, dampers: true,
      armor: {
        hull: { up: [150, 50], low: [100, 50], side: [80, 25], rear: [80, 30], roof: 40 },
        turret: { front: [180, 9], side: [80, 21], rear: [80, 21], mantlet: [150, 0] },
      },
      crew: ['driver', 'radio', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 2.4, 0.6, 1.1, 0.55, 0.5, 0.9],
        ['crew', 'radio', 'hull', 2.4, -0.6, 1.1, 0.55, 0.5, 0.9],
        ['trans', null, 'hull', 2.85, 0, 0.85, 0.5, 0.6, 0.5],
        ['crew', 'gunner', 'turret', 0.3, 0.45, 1.95, 0.45, 0.42, 0.9],
        ['crew', 'commander', 'turret', -0.75, 0.45, 2.15, 0.45, 0.42, 0.9],
        ['crew', 'loader', 'turret', -0.2, -0.5, 1.85, 0.45, 0.42, 0.9],
        ['breech', null, 'turret', 0.05, 0, 2.55, 1.2, 0.34, 0.36],
        ['ammo', null, 'turret', -1.45, 0, 2.4, 0.7, 1.4, 0.4],
        ['ammo', null, 'hull', 0.2, 1.4, 1.45, 2.4, 0.4, 0.5],
        ['ammo', null, 'hull', 0.2, -1.4, 1.45, 2.4, 0.4, 0.5],
        ['engine', null, 'hull', -2.4, 0, 1.4, 1.4, 1.2, 1.0],
        ['fuel', null, 'hull', -2.4, 0.95, 1.1, 1.2, 0.35, 0.7],
        ['fuel', null, 'hull', -2.4, -0.95, 1.1, 1.2, 0.35, 0.7],
      ],
    },
    stug: {
      inspired: 'Based on the Sturmgeschütz III Ausf. G', real: '5.4 × 3.0 × 2.2 m · 24 t · 4 crew',
      L: 5.38, W: 2.95, tw: 0.38, gc: 0.4, tt: 0.9, ht: 1.95, zn: 0.95, xn: 2.65,
      sUp: 10, sLow: 21, sRear: 10, sideSlope: 11, rearX: -2.65,
      wheels: { n: 6, r: 0.26, x0: 1.7, x1: -1.8, inter: false }, rollers: [1.2, 0, -1.2], rollerR: 0.1,
      spr: { x: 2.25, z: 0.58, r: 0.28 }, idl: { x: -2.35, z: 0.55, r: 0.25 },
      turret: null, mount: { x: 1.25, y: -0.12 },
      gun: { z: 1.62, fx: 0.35, len: 3.6, r: 0.045, sleeve: null, brake: { r: 0.09, len: 0.32 }, name: '7.5 cm StuK 40 L/48' },
      exhaust: [[-2.6, 0.45]], skirts: { off: 0.2, z0: 0.38, z1: 1.15 }, zim: true, muffler: true, hullCupola: [0.0, 0.55, 0.28, 0.18, 7], mgShield: true, links: 'front',
      armor: {
        hull: { up: [80, 10], low: [80, 21], side: [30, 11], rear: [30, 10], roof: 17 },
        turret: null,
      },
      crew: ['driver', 'gunner', 'commander', 'loader'],
      modules: [
        ['crew', 'driver', 'hull', 1.6, 0.55, 0.85, 0.5, 0.45, 0.82],
        ['trans', null, 'hull', 2.1, 0, 0.7, 0.45, 0.55, 0.45],
        ['crew', 'gunner', 'hull', 0.6, 0.5, 1.35, 0.42, 0.4, 0.85],
        ['crew', 'commander', 'hull', 0.0, 0.55, 1.5, 0.42, 0.42, 0.85],
        ['crew', 'loader', 'hull', 0.5, -0.6, 1.35, 0.42, 0.4, 0.85],
        ['breech', null, 'hull', 0.75, -0.12, 1.62, 1.0, 0.3, 0.3],
        ['ammo', null, 'hull', 0.2, 1.0, 1.05, 1.4, 0.3, 0.4],
        ['ammo', null, 'hull', 0.2, -1.0, 1.05, 1.4, 0.3, 0.4],
        ['engine', null, 'hull', -1.75, 0, 1.0, 1.2, 1.0, 0.85],
        ['fuel', null, 'hull', -1.6, 0.75, 0.85, 0.9, 0.3, 0.6],
        ['fuel', null, 'hull', -1.6, -0.75, 0.85, 0.9, 0.3, 0.6],
      ],
    },
  };

  // Tourelle en fer à cheval du Tiger : avant plat, arrière arrondi
  (() => {
    const p = [[0.95, -0.92], [0.95, 0.92]];
    for (let a = 70; a <= 290; a += 15) p.push([-0.1 + 1.15 * Math.cos(a * D2R), 1.0 * Math.sin(a * D2R)]);
    SPECS.heavy.turret.poly = p;
  })();

  const NAMES = {
    driver: 'Driver', radio: 'Radio operator', gunner: 'Gunner', commander: 'Commander', loader: 'Loader',
    engine: 'Engine', trans: 'Transmission', fuel: 'Fuel tank', ammo: 'Ammo rack', breech: 'Breech',
  };
  const HP = { crew: 100, engine: 140, trans: 120, fuel: 90, ammo: 70, breech: 160 };

  function convexHull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  // Géométrie utile au jeu (sans WebGL)
  function info(id) {
    const S = SPECS[id];
    const tanU = Math.tan(S.sUp * D2R);
    const T = S.turret;
    let tb = null, pivotX, pivotY = 0;
    if (T) {
      pivotX = T.x;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of T.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const k = (1 + T.ts) / 2; // empreinte moyenne (flancs inclinés)
      tb = { x0: x0 * k, x1: x1 * k, y0: y0 * k, y1: y1 * k };
    } else { pivotX = S.mount.x; pivotY = S.mount.y; }
    const totalH = T ? S.ht + T.h + (T.cupola ? T.cupola[3] : 0) : S.ht + 0.1;
    return {
      S, pivotX, pivotY, turretBox: tb, hasTurret: !!T, totalH,
      gunZ: S.gun.z, gunEnd: S.gun.fx + S.gun.len + (S.gun.brake ? S.gun.brake.len * 0.5 : 0),
      xUp: z => S.xn - (z - S.zn) * tanU,
      inner: { x0: S.rearX + 0.05, x1: S.xn - 0.05, y0: -S.W / 2 + 0.05, y1: S.W / 2 - 0.05, z0: S.gc + 0.02, z1: totalH },
    };
  }

  function makeModules(id) {
    return SPECS[id].modules.map((m, i) => ({
      i, kind: m[0], role: m[1], frame: m[2],
      c: [m[3], m[4], m[5]], s: [m[6], m[7], m[8]],
      min: [m[3] - m[6] / 2, m[4] - m[7] / 2, m[5] - m[8] / 2], max: [m[3] + m[6] / 2, m[4] + m[7] / 2, m[5] + m[8] / 2],
      name: m[0] === 'crew' ? NAMES[m[1]] : NAMES[m[0]], hp: HP[m[0]], max0: HP[m[0]],
    }));
  }

  // ===================== Construction 3D =====================
  const CAMO = '#808080', DARK = '#2f2e2a', STEEL = '#4b4a46', RUBBER = '#1d1c1a', RUST = '#5c3d2a', GLASS = '#1a2228';
  // sepWheels : roues porteuses à part (le jeu les fait tourner et débattre une à une)
  function build(id, sepWheels) {
    const S = SPECS[id], I = info(id), wheels = [];
    const hb = new G3.Builder(), tb = new G3.Builder();
    const { L, W, tw, gc, tt, ht, zn, xn } = S;
    const tanU = Math.tan(S.sUp * D2R), tanL = Math.tan(S.sLow * D2R), tanR = Math.tan(S.sRear * D2R), tanS = Math.tan(S.sideSlope * D2R);
    const xUp = z => xn - (z - zn) * tanU, xLow = z => xn - (zn - z) * tanL;
    const rearAt = z => S.rearX + (ht - z) * tanR;
    const hwIn = W / 2 - tw - 0.03;
    const hwAt = z => W / 2 - Math.max(0, z - tt) * tanS;
    // Zimmerit (pâte antimagnétique striée, 1943-1944) : matériau 1.25, relief dans le shader
    const ZM = S.zim ? 1.25 : 1;

    // Caisse inférieure entre les chenilles
    hb.loftXZ([[xLow(gc), gc], [xn, zn], [xUp(ht), ht], [S.rearX, ht], [rearAt(gc), gc]], () => hwIn, CAMO, ZM);
    // Superstructure au-dessus des chenilles (flancs éventuellement inclinés)
    const sp = [];
    if (tt < zn) sp.push([xLow(tt), tt], [xn, zn]); else sp.push([xUp(tt), tt]);
    sp.push([xUp(ht), ht], [S.rearX, ht], [rearAt(tt), tt]);
    hb.loftXZ(sp, hwAt, CAMO, ZM);

    // Train de roulement et chenilles
    const th = id === 'light' ? 0.06 : 0.075;
    const ws = [];
    if (S.wheels.xs) ws.push(...S.wheels.xs);
    else for (let k = 0; k < S.wheels.n; k++) ws.push(S.wheels.x0 + (S.wheels.x1 - S.wheels.x0) * k / (S.wheels.n - 1));
    const rw = S.wheels.r;
    const circ = (x, z, r, out) => { for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } };
    const pts = [];
    circ(S.spr.x, S.spr.z, S.spr.r + th, pts); circ(S.idl.x, S.idl.z, S.idl.r + th, pts);
    for (const x of ws) circ(x, rw + th, rw + th, pts);
    const rz = tt - 0.03 - th - S.rollerR;
    for (const x of S.rollers) circ(x, rz, S.rollerR + th, pts);
    const loop = convexHull(pts);
    for (const side of [1, -1]) {
      const yOut = side * W / 2, yIn = side * (W / 2 - tw);
      hb.band(loop, th, Math.min(yOut, yIn), Math.max(yOut, yIn), '#3c3a36', 2);
      const wheelAt = (x, yc, w, r) => {
        const z = rw + th;
        if (sepWheels) { wheels.push({ x, y: yc, z, r, w, side }); return; }
        hb.cyl([x, yc - w / 2, z], [x, yc + w / 2, z], r, r, 20, RUBBER, 4);
        hb.cyl([x, yc - w / 2 - 0.012, z], [x, yc + w / 2 + 0.012, z], r * 0.8, r * 0.8, 20, CAMO, 1);
        hb.cyl([x, yc - w / 2 - 0.03, z], [x, yc + w / 2 + 0.03, z], r * 0.2, r * 0.2, 10, STEEL, 3);
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; hb.box(x + Math.cos(a) * r * 0.48, yc, z + Math.sin(a) * r * 0.48, r * 0.09, w + 0.035, r * 0.09, DARK, 3); }
      };
      ws.forEach((x, k) => {
        if (S.wheels.inter) {
          const outer = k % 2 === 0;
          wheelAt(x, side * (W / 2 - tw * (outer ? 0.27 : 0.73)), tw * 0.42, rw);
        } else wheelAt(x, side * (W / 2 - tw / 2), tw * 0.78, rw);
      });
      for (const x of S.rollers) hb.cyl([x, yIn, rz], [x, yIn + side * tw * 0.7, rz], S.rollerR, S.rollerR, 12, STEEL, 3);
      const yc = side * (W / 2 - tw / 2);
      hb.cyl([S.spr.x, yc - tw * 0.4, S.spr.z], [S.spr.x, yc + tw * 0.4, S.spr.z], S.spr.r, S.spr.r, 12, STEEL, 3);
      hb.cyl([S.spr.x, yc - tw * 0.45, S.spr.z], [S.spr.x, yc + tw * 0.45, S.spr.z], S.spr.r * 0.55, S.spr.r * 0.55, 10, CAMO, 1);
      hb.cyl([S.idl.x, yc - tw * 0.4, S.idl.z], [S.idl.x, yc + tw * 0.4, S.idl.z], S.idl.r, S.idl.r, 16, CAMO, 1);
      // garde-boue avant et arrière
      const ff = sp[0][0];
      if (S.spr.x + S.spr.r * 0.9 > ff) hb.box((ff + S.spr.x + S.spr.r * 0.9) / 2, yc, tt + 0.01, S.spr.x + S.spr.r * 0.9 - ff, tw + 0.04, 0.03, CAMO, 1);
      const rr = rearAt(tt);
      if (rr > S.idl.x - S.idl.r * 0.9) hb.box((rr + S.idl.x - S.idl.r * 0.9) / 2, yc, tt + 0.01, rr - (S.idl.x - S.idl.r * 0.9), tw + 0.04, 0.03, CAMO, 1);
      // jupes latérales (Schürzen), un panneau manque d'un côté
      if (S.skirts) {
        const sk = typeof S.skirts === 'object' ? S.skirts : { off: 0.02, z0: tt - 0.52, z1: tt - 0.02 };
        const n = 5, x0 = S.idl.x + 0.1, x1 = S.spr.x - 0.15, pw = (x1 - x0) / n, ys = side * (W / 2 + sk.off);
        for (let k = 0; k < n; k++) {
          if (side === -1 && k === 3) continue;
          hb.box(x0 + pw * (k + 0.5), ys, (sk.z0 + sk.z1) / 2, pw - 0.03, 0.02, sk.z1 - sk.z0, CAMO, 1);
        }
        if (sk.off > 0.05) {
          // rail de suspension et ses supports
          hb.box((x0 + x1) / 2, side * (W / 2 + sk.off * 0.5), sk.z1 - 0.03, x1 - x0, sk.off, 0.03, DARK, 3);
          for (let k = 0; k <= n; k++) hb.box(x0 + pw * k, side * (W / 2 + sk.off * 0.5), sk.z1 - 0.1, 0.03, sk.off, 0.12, DARK, 3);
        }
      }
      // bogies à ressorts à lames du Panzer IV : un boîtier et un ressort par paire de roues
      if (S.wheels.bogies) for (let k = 0; k + 1 < ws.length; k += 2) {
        const xm = (ws[k] + ws[k + 1]) / 2, yb = side * (W / 2 - tw - 0.06), zb = rw + th;
        hb.box(xm, yb, zb, 0.32, 0.12, 0.22, CAMO, 1);
        hb.box(xm, yb, zb + 0.16, Math.abs(ws[k] - ws[k + 1]) * 0.9, 0.1, 0.05, DARK, 3);
        hb.cyl([xm, yb, zb], [xm, side * (W / 2 - tw * 0.2), zb], 0.05, 0.05, 8, STEEL, 3);
      }
      // outils et câble de remorquage sur les flancs
      hb.cyl([-1.2, side * (hwAt(ht) - 0.12), ht + 0.03], [1.0, side * (hwAt(ht) - 0.12), ht + 0.03], 0.025, 0.025, 6, DARK, 3);
      hb.box(-0.1, side * (hwAt(ht) - 0.25), ht + 0.025, 1.1, 0.07, 0.04, '#4a3a2a', 6);
    }

    // Détails de caisse
    const zv = ht - 0.22;
    if (S.sUp > 30) hb.box(xUp(zv) - 0.02, hwIn * 0.45, zv, 0.06, 0.22, 0.06, GLASS, 5);
    else hb.box(xUp(zv) + 0.01, hwIn * 0.45, zv, 0.04, 0.25, 0.07, GLASS, 5);
    if (S.mg) {
      const zm = ht - 0.32, xm = xUp(zm);
      hb.cyl([xm - 0.05, -hwIn * 0.45, zm], [xm + 0.07, -hwIn * 0.45, zm], 0.11, 0.1, 12, CAMO, 1);
      hb.cyl([xm, -hwIn * 0.45, zm], [xm + 0.42, -hwIn * 0.45, zm], 0.022, 0.022, 6, DARK, 3);
    }
    hb.cyl([xUp(ht) - 0.15, 0.75, ht], [xUp(ht) - 0.15, 0.75, ht + 0.08], 0.07, 0.07, 10, DARK, 3);
    for (const sy of [1, -1]) hb.cyl([xUp(ht) - 0.45, sy * hwIn * 0.45, ht], [xUp(ht) - 0.45, sy * hwIn * 0.45, ht + 0.04], 0.24, 0.24, 14, CAMO, 1);
    // grilles du compartiment moteur
    for (const sy of [1, -1]) hb.box(S.rearX + 0.75, sy * 0.48, ht + 0.012, 0.75, 0.5, 0.025, '#22211e', 3);
    hb.box(S.rearX + 0.75, 0, ht + 0.02, 0.6, 0.35, 0.04, CAMO, 1);
    for (const e of S.exhaust) {
      const zt = S.tallExhaust ? ht + 0.55 : ht + 0.35;
      hb.cyl([e[0], e[1], ht - 0.55], [e[0], e[1], zt], 0.085, 0.075, 12, RUST, 0);
      if (S.tallExhaust) hb.cyl([e[0] + 0.02, e[1], ht - 0.2], [e[0] + 0.02, e[1], ht + 0.25], 0.13, 0.13, 12, CAMO, 1);
      if (S.dampers) hb.cyl([e[0] - 0.02, e[1], zt - 0.25], [e[0] - 0.02, e[1], zt + 0.05], 0.11, 0.11, 12, RUST, 0);
    }
    if (S.jerry) for (const sy of [0.35, -0.35]) hb.box(S.rearX - 0.07, sy, ht - 0.2, 0.14, 0.3, 0.42, '#3e4a2c', 0);
    if (id === 'heavy') for (let k = 0; k < 6; k++) hb.box(xUp(1.5) + 0.04, -0.95 + k * 0.38, 1.5, 0.06, 0.34, 0.1, '#3c3a36', 2);
    {
      const xf = sp[0][0], yf = W / 2 - tw / 2;
      // phare Bosch sur le garde-boue avant gauche, feu de convoi Notek à droite
      hb.cyl([xf + 0.05, yf, tt + 0.14], [xf + 0.2, yf, tt + 0.14], 0.07, 0.08, 12, DARK, 3);
      hb.cyl([xf + 0.2, yf, tt + 0.14], [xf + 0.21, yf, tt + 0.14], 0.065, 0.065, 12, GLASS, 5);
      hb.cyl([xf + 0.12, yf, tt + 0.01], [xf + 0.12, yf, tt + 0.08], 0.015, 0.015, 6, DARK, 3);
      hb.box(xf + 0.12, -yf, tt + 0.07, 0.08, 0.1, 0.07, DARK, 3);
      // crochets de remorquage avant et arrière
      for (const sy of [1, -1]) {
        hb.box(xLow(gc + 0.15) + 0.05, sy * hwIn * 0.75, gc + 0.15, 0.12, 0.06, 0.16, DARK, 3);
        hb.box(rearAt(gc + 0.2) - 0.05, sy * hwIn * 0.75, gc + 0.2, 0.12, 0.06, 0.16, DARK, 3);
      }
      // pelle et hache sur la plage avant, extincteur, cric à l'arrière
      hb.cyl([xUp(ht) - 0.9, -hwIn * 0.8, ht + 0.03], [xUp(ht) - 0.1, -hwIn * 0.8, ht + 0.03], 0.018, 0.018, 6, '#5a4630', 6);
      hb.box(xUp(ht) - 0.05, -hwIn * 0.8, ht + 0.03, 0.2, 0.17, 0.02, DARK, 3);
      hb.cyl([-0.6, yf, tt + 0.02], [-0.6, yf, tt + 0.36], 0.06, 0.06, 10, '#7a2a20', 0);
      hb.cyl([rearAt(ht - 0.35) - 0.08, -0.5, ht - 0.35], [rearAt(ht - 0.35) - 0.08, 0.1, ht - 0.35], 0.07, 0.07, 10, DARK, 3);
    }
    // maillons de chenille de rechange sur le glacis (Panzer IV, StuG)
    if (S.links === 'front') for (let k = 0; k < 7; k++) {
      const z = zn + 0.08, x = xLow(z) + 0.02 + (z - zn) * 0;
      hb.box(xn + 0.03, -0.9 + k * 0.3, zn - 0.05, 0.05, 0.27, 0.12, '#3c3a36', 2);
    }
    // silencieux transversal sous la plaque arrière (Panzer IV, StuG)
    if (S.muffler) hb.cyl([rearAt(gc + 0.45) - 0.16, -W * 0.3, gc + 0.45], [rearAt(gc + 0.45) - 0.16, W * 0.3, gc + 0.45], 0.13, 0.13, 14, RUST, 0);
    // deux ventilateurs ronds sur le compartiment moteur (Panthère, Jagdpanther, Tigre royal)
    if (S.fans) for (const sy of [1, -1]) {
      hb.cyl([S.rearX + 0.75, sy * 0.6, ht], [S.rearX + 0.75, sy * 0.6, ht + 0.06], 0.34, 0.32, 20, CAMO, 1);
      hb.cyl([S.rearX + 0.75, sy * 0.6, ht + 0.06], [S.rearX + 0.75, sy * 0.6, ht + 0.065], 0.27, 0.27, 20, '#1c1b18', 7);
      for (let k = 0; k < 4; k++) hb.box(S.rearX + 0.75, sy * 0.6, ht + 0.07, 0.52, 0.025, 0.012, '#34332e', 7); // grille de protection
    }
    // grilles d'admission d'air (Tigre)
    if (S.grilles) for (const sy of [1, -1]) hb.box(S.rearX + 1.4, sy * 1.05, ht + 0.02, 0.9, 0.55, 0.04, '#22211e', 3);
    // lance-mines S aux coins du toit (Tigre)
    if (S.smines) for (const [x, y] of [[xUp(ht) - 0.3, 1.3], [xUp(ht) - 0.3, -1.3], [0.2, 1.4], [0.2, -1.4], [S.rearX + 0.3, 0]]) hb.cyl([x, y, ht], [x, y, ht + 0.16], 0.05, 0.05, 8, DARK, 3);
    // coffres de paquetage sur la plaque arrière
    if (S.rearBins) for (const sy of [1, -1]) hb.box(rearAt(ht - 0.25) - 0.15, sy * (hwIn - 0.25), ht - 0.25, 0.28, 0.45, 0.35, CAMO, 1);

    // Tourelle (repère du pivot)
    const T = S.turret, g = S.gun;
    if (T) {
      const z1 = ht + T.h;
      tb.prism(T.poly, ht, z1, T.ts, CAMO, ZM);
      tb.cyl([0, 0, ht - 0.05], [0, 0, ht + 0.02], 0.95 * Math.min(1, W / 3.4), 0.95 * Math.min(1, W / 3.4), 24, CAMO, 1);
      const fx = Math.max(...T.poly.map(p => p[0]));
      const m = T.mantlet;
      if (m.type === 'box') {
        tb.box(fx + m.d / 2 - 0.05, 0, g.z, m.d, m.w * 2, m.h * 2, CAMO, ZM);
        // embrasures de la mitrailleuse coaxiale et du viseur
        tb.box(fx + m.d - 0.04, -0.2, g.z + 0.02, 0.03, 0.06, 0.05, DARK, 3);
        tb.box(fx + m.d - 0.04, 0.2, g.z + 0.05, 0.03, 0.05, 0.05, DARK, 3);
      } else if (m.type === 'bell') {
        // « Saukopf » : masque coulé en cloche autour du canon
        tb.cyl([fx - 0.08, 0, g.z], [fx + m.len, 0, g.z], m.r, m.r * 0.42, 20, CAMO, ZM);
        tb.box(fx + 0.02, -0.3, g.z + 0.03, 0.08, 0.06, 0.06, DARK, 3);
        tb.box(fx + 0.02, 0.3, g.z + 0.08, 0.08, 0.05, 0.05, DARK, 3);
      } else {
        tb.cyl([fx - 0.05, -m.w, g.z], [fx - 0.05, m.w, g.z], m.r, m.r, 18, CAMO, ZM);
        tb.box(fx + m.r - 0.08, -0.22, g.z + 0.02, 0.05, 0.06, 0.05, DARK, 3);
        tb.box(fx + m.r - 0.1, 0.22, g.z + 0.06, 0.05, 0.05, 0.05, DARK, 3);
      }
      const c = T.cupola;
      tb.cyl([c[0], c[1], z1 - 0.05], [c[0], c[1], z1 + c[3]], c[2], c[2] * 0.95, 18, CAMO, 1);
      tb.cyl([c[0], c[1], z1 + c[3]], [c[0], c[1], z1 + c[3] + 0.04], c[2] * 0.8, c[2] * 0.75, 18, CAMO, 1);
      const np = c[4] || 6;
      for (let k = 0; k < np; k++) {
        const a = k / np * Math.PI * 2;
        tb.box(c[0] + Math.cos(a) * c[2] * 0.98, c[1] + Math.sin(a) * c[2] * 0.98, z1 + Math.max(0.03, c[3] * 0.6), 0.07, 0.07, 0.05, GLASS, 5);
      }
      // trappe de la coupole, ouverte (le chef se tient debout)
      tb.cyl([c[0], c[1] + c[2] * 0.95, z1 + c[3] + c[2] * 0.8], [c[0], c[1] + c[2] * 0.95 + 0.035, z1 + c[3] + c[2] * 0.8], c[2] * 0.78, c[2] * 0.78, 16, CAMO, 1);
      tb.box(-0.2, -0.45, z1 + 0.02, 0.45, 0.4, 0.04, CAMO, 1); // trappe du chargeur
      tb.box(fx - 0.35, 0.42, z1 + 0.03, 0.1, 0.1, 0.07, GLASS, 5); // viseur
      if (T.bin) { const bx = Math.min(...T.poly.map(p => p[0])); tb.box(bx - 0.22, 0, ht + 0.42, 0.45, 1.25, 0.45, CAMO, 1); }
      if (T.smoke) for (const sy of [1, -1]) for (let k = 0; k < 3; k++) {
        const x = 0.55 - k * 0.18, y = sy * 1.0;
        tb.cyl([x, y, ht + 0.45], [x + 0.08, y + sy * 0.04, ht + 0.62], 0.04, 0.04, 8, DARK, 3);
      }
      if (T.spare) for (const sy of [1, -1]) for (let k = 0; k < 4; k++) tb.box(-0.3 + k * 0.3, sy * 1.0, ht + 0.42, 0.27, 0.05, 0.2, '#3c3a36', 2);
      tb.cyl([-0.9, -0.55, z1], [-0.9, -0.55, z1 + 1.6], 0.008, 0.005, 4, DARK, 3); // antenne
      // largeur de la tourelle à une abscisse donnée (pour poser les détails sur ses flancs)
      const ySide = x => { let y = 0; for (let i = 0; i < T.poly.length; i++) { const a = T.poly[i], b = T.poly[(i + 1) % T.poly.length]; if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const k = (x - a[0]) / (b[0] - a[0]); y = Math.max(y, Math.abs(a[1] + (b[1] - a[1]) * k)); } } return y; };
      const bx0 = Math.min(...T.poly.map(p => p[0])), zm = ht + T.h * 0.5, kMid = (1 + T.ts) / 2;
      // bouchons des meurtrières de pistolet sur les flancs et l'arrière
      if (T.ports) for (const sy of [1, -1]) { const y = ySide(-0.3) * kMid; tb.cyl([-0.3, sy * (y - 0.02), zm], [-0.3, sy * (y + 0.05), zm], 0.07, 0.06, 10, CAMO, 1); }
      // trappe d'évacuation ronde à l'arrière (Panthère, Tigre royal)
      if (T.rearHatch) tb.cyl([bx0 * kMid + 0.02, 0, zm], [bx0 * kMid - 0.04, 0, zm], 0.27, 0.26, 18, CAMO, 1);
      // portes latérales en deux battants (Panzer IV)
      if (T.sideDoors) for (const sy of [1, -1]) { const y = ySide(0.05) * kMid; tb.box(0.05, sy * (y + 0.02), zm, 0.5, 0.03, T.h * 0.75, CAMO, 1); tb.box(0.05, sy * (y + 0.04), zm, 0.02, 0.02, T.h * 0.7, DARK, 3); }
      // « Pilze » : douilles de la grue de levage sur le toit
      if (T.pilze) for (const [x, y] of [[0.4, 0.5], [0.4, -0.5], [-0.8, -0.1]]) tb.cyl([x, y, z1], [x, y, z1 + 0.07], 0.05, 0.04, 8, DARK, 3);
      // ventilateur de tourelle
      tb.cyl([0.1, -0.15, z1], [0.1, -0.15, z1 + 0.06], 0.1, 0.08, 10, CAMO, 1);
      // jupes de tourelle du Panzer IV : plaques espacées tout autour, ouvertes à l'avant
      if (T.tskirt) {
        const off = 0.14, z0 = ht + 0.1, zt = z1 + 0.02, n = T.poly.length;
        for (let i = 0; i < n; i++) {
          const a = T.poly[i], b = T.poly[(i + 1) % n];
          if (a[0] > 0.6 && b[0] > 0.6) continue;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (mx > 0.6 || l < 0.05) continue;
          const nx = (b[1] - a[1]) / l, ny = -(b[0] - a[0]) / l, sg = nx * mx + ny * my > 0 ? 1 : -1;
          const cx = mx * kMid + nx * sg * off, cy = my * kMid + ny * sg * off;
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const ux = Math.cos(ang), uy = Math.sin(ang), hl = l * kMid / 2 + 0.06, hw = 0.012;
          const P = (s, t, z) => [cx + ux * s - uy * t, cy + uy * s + ux * t, z];
          tb.hexa([P(-hl, -hw, z0), P(hl, -hw, z0), P(hl, hw, z0), P(-hl, hw, z0)], [P(-hl, -hw, zt), P(hl, -hw, zt), P(hl, hw, zt), P(-hl, hw, zt)], CAMO, 1);
        }
      }
    } else {
      // Masque en « tête de cochon » du chasseur
      tb.cyl([-0.15, 0, g.z], [g.fx + 0.05, 0, g.z], 0.34, 0.16, 18, CAMO, ZM);
      const hc = S.hullCupola;
      if (hc) {
        hb.cyl([hc[0], hc[1], ht - 0.02], [hc[0], hc[1], ht + hc[3]], hc[2], hc[2] * 0.95, 16, CAMO, 1);
        for (let k = 0; k < hc[4]; k++) { const a = k / hc[4] * Math.PI * 2; hb.box(hc[0] + Math.cos(a) * hc[2], hc[1] + Math.sin(a) * hc[2], ht + hc[3] * 0.6, 0.06, 0.06, 0.05, GLASS, 5); }
        // périscope en ciseaux du chef, déployé
        hb.cyl([hc[0], hc[1] + 0.05, ht + hc[3]], [hc[0], hc[1] + 0.05, ht + hc[3] + 0.35], 0.025, 0.025, 6, DARK, 3);
      }
      if (S.mgShield) {
        // bouclier rabattable du chargeur et sa MG 34
        hb.box(0.55, -0.6, ht + 0.25, 0.03, 0.62, 0.42, CAMO, 1);
        hb.box(0.4, -0.6, ht + 0.06, 0.3, 0.62, 0.03, CAMO, 1);
        hb.cyl([0.45, -0.6, ht + 0.36], [1.15, -0.6, ht + 0.36], 0.015, 0.015, 6, DARK, 3);
      }
      // périscopes et trappes de casemate
      hb.box(0.4, 0.55, ht + 0.06, 0.12, 0.2, 0.12, GLASS, 5);
      hb.box(0.0, -0.5, ht + 0.06, 0.12, 0.2, 0.12, GLASS, 5);
      hb.box(-0.6, 0.0, ht + 0.02, 0.6, 0.6, 0.04, CAMO, 1);
      hb.cyl([-0.3, -0.5, ht], [-0.3, -0.5, ht + 0.35], 0.03, 0.03, 6, DARK, 3);
    }
    // Canon : construit deux fois, dans la tourelle (vitrine, rayons X) et à part, autour de ses
    // tourillons, pour que le jeu le pointe en hauteur et le fasse reculer
    const gunPivot = [g.fx - 0.25, 0, g.z];
    const addGun = (b, ox, oz) => {
      const P = (x, z) => [x - ox, 0, z - oz];
      if (g.sleeve) b.cyl(P(g.fx - 0.05, g.z), P(g.fx + g.sleeve[1], g.z), g.sleeve[0], g.sleeve[0] * 0.92, 16, CAMO, 1);
      b.cyl(P(g.fx, g.z), P(g.fx + g.len, g.z), g.r * 1.15, g.r * 0.9, 16, CAMO, 1);
      if (g.brake) {
        const bx = g.fx + g.len;
        b.cyl(P(bx - 0.02, g.z), P(bx + g.brake.len * 0.45, g.z), g.brake.r, g.brake.r, 16, DARK, 3);
        b.cyl(P(bx + g.brake.len * 0.55, g.z), P(bx + g.brake.len, g.z), g.brake.r, g.brake.r, 16, DARK, 3);
        b.cyl(P(bx, g.z), P(bx + g.brake.len, g.z), g.r * 0.9, g.r * 0.9, 10, DARK, 3);
      } else b.cyl(P(g.fx + g.len - 0.08, g.z), P(g.fx + g.len, g.z), g.r * 1.2, g.r * 1.2, 12, DARK, 3);
    };
    const body = new G3.Builder(); body.v = tb.v.slice();
    addGun(tb, 0, 0);
    const gb = new G3.Builder(); addGun(gb, gunPivot[0], gunPivot[2]);

    // roue unitaire (rayon 1, largeur 1, axe y) : bandage, flasque, moyeu, boulons pour voir la rotation
    const wb = new G3.Builder();
    if (sepWheels) {
      wb.cyl([0, -0.5, 0], [0, 0.5, 0], 1, 1, 20, RUBBER, 4);
      wb.cyl([0, -0.512, 0], [0, 0.512, 0], 0.8, 0.8, 20, CAMO, 1);
      wb.cyl([0, -0.56, 0], [0, 0.56, 0], 0.2, 0.2, 10, STEEL, 3);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; wb.box(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48, 0.09, 1.07, 0.09, DARK, 3); }
    }
    return { S, I, hull: hb, turret: tb, turretBody: body, gun: gb, gunPivot, wheels, wheel: wb };
  }


  // ===================== Blindage additionnel (pièce du garage) =====================
  // Maillons de chenille de rechange accrochés par l'équipage, comme sur le front : niveau 1 sur le
  // glacis, niveau 2 aussi sur les flancs avant, niveau 3 aussi sur la tourelle (ou la casemate).
  // Renvoie deux maillages : caisse et tourelle.
  function addonArmor(id, lv) {
    const S = SPECS[id], hb = new G3.Builder(), tb = new G3.Builder();
    const { W, tw, ht, zn, xn, tt } = S, tanU = Math.tan(S.sUp * D2R), tanS = Math.tan(S.sideSlope * D2R);
    const xUp = z => xn - (z - zn) * tanU, hwAt = z => W / 2 - Math.max(0, z - tt) * tanS;
    const LINK = '#3a3833';
    // maillon posé sur un plan incliné : centre, normale extérieure, largeur (y), hauteur le long de la pente
    const link = (b, c, n, w, h) => {
      const up = [0, 0, 1], u = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
      const ul = Math.hypot(...u) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]], t = 0.055;
      const P = (a, bb, cc) => [c[0] + u[0] * a + v[0] * bb + n[0] * cc, c[1] + u[1] * a + v[1] * bb + n[1] * cc, c[2] + u[2] * a + v[2] * bb + n[2] * cc];
      b.hexa([P(-w / 2, -h / 2, 0), P(w / 2, -h / 2, 0), P(w / 2, h / 2, 0), P(-w / 2, h / 2, 0)], [P(-w / 2, -h / 2, t), P(w / 2, -h / 2, t), P(w / 2, h / 2, t), P(-w / 2, h / 2, t)], LINK, 2);
      // dents de guidage
      b.hexa([P(-0.03, -0.02, t), P(0.03, -0.02, t), P(0.03, 0.02, t), P(-0.03, 0.02, t)], [P(-0.03, -0.02, t + 0.05), P(0.03, -0.02, t + 0.05), P(0.03, 0.02, t + 0.05), P(-0.03, 0.02, t + 0.05)], LINK, 3);
    };
    const sU = S.sUp * D2R, nG = [Math.cos(sU), 0, Math.sin(sU)];
    const hw = W / 2 - tw - 0.1, nw = Math.max(3, Math.floor(hw * 2 / 0.32));
    if (lv >= 1) for (const zf of [0.35, 0.68]) {
      const z = zn + (ht - zn) * zf, x = xUp(z) + 0.015;
      for (let k = 0; k < nw; k++) link(hb, [x, -hw + (k + 0.5) * (hw * 2 / nw), z], nG, 0.29, 0.16);
    }
    if (lv >= 2) for (const sd of [1, -1]) {
      const sl = S.sideSlope * D2R, nS = [0, sd * Math.cos(sl), Math.sin(sl)];
      for (let k = 0; k < 4; k++) { const z = tt + 0.22, x = xUp(ht) - 0.4 - k * 0.32; link(hb, [x, sd * (hwAt(z) + 0.01), z], nS, 0.29, 0.16); }
    }
    if (lv >= 3) {
      const T = S.turret;
      if (T) {
        const fx = Math.max(...T.poly.map(p => p[0])), kM = (1 + T.ts) / 2, z = ht + T.h * 0.5;
        for (const sd of [1, -1]) for (let k = 0; k < 2; k++) link(tb, [fx * kM + 0.02, sd * (0.42 + k * 0.3), z], [1, 0, 0], 0.27, 0.16);
      } else for (let k = 0; k < nw; k++) link(hb, [xUp(ht - 0.12) + 0.015, -hw + (k + 0.5) * (hw * 2 / nw), ht - 0.12], nG, 0.29, 0.16);
    }
    return { hull: hb, turret: tb };
  }

  // ===================== Modules internes détaillés (vue rayons X) =====================
  // Chaque maillage est construit dans le repère du module (centre de sa boîte), à la vraie taille.
  const UNI = '#4d5550', SKIN = '#d8a983', BOOT = '#2a1e16', CAP = '#1b1c1e', STEELM = '#6d7075', DARKM = '#34363a', BRASS = '#c9a24a';
  // boîte inclinée autour de l'axe x (bancs de cylindres en V)
  function tiltBox(b, cx, cy, cz, sx, sy, sz, a, col, mat) {
    const c = Math.cos(a), s = Math.sin(a);
    const pt = (x, y, z) => [cx + x, cy + y * c - z * s, cz + y * s + z * c];
    const x0 = -sx / 2, x1 = sx / 2, y0 = -sy / 2, y1 = sy / 2, z0 = -sz / 2, z1 = sz / 2;
    b.hexa([pt(x0, y0, z0), pt(x1, y0, z0), pt(x1, y1, z0), pt(x0, y1, z0)], [pt(x0, y0, z1), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z1)], col, mat);
  }
  // Membre d'équipage assis, tourné vers l'avant (+x), selon son poste
  function crewMesh(b, sz, role) {
    const k = sz / 1.05, z0 = -sz / 2;
    const P = (x, y, z) => [x * k, y * k, z0 + z * k];
    const cyl = (a, c, r0, r1, col) => b.cyl(P(...a), P(...c), r0 * k, (r1 == null ? r0 : r1) * k, 12, col, 7);
    const sph = (c, rx, ry, rz, col) => b.sphere(P(...c), rx * k, (ry == null ? rx : ry) * k, (rz == null ? rx : rz) * k, 10, col, 7);
    const box = (c, sx, sy, sz2, col) => { const q = P(...c); b.box(q[0], q[1], q[2], sx * k, sy * k, sz2 * k, col, 7); };
    const lift = role === 'commander' ? 0.06 : 0;
    // siège et dossier
    box([-0.12, 0, 0.3 + lift], 0.38, 0.4, 0.05, '#3b3129');
    box([-0.33, 0, 0.55 + lift], 0.05, 0.36, 0.42, '#3b3129');
    cyl([-0.12, 0, 0.0], [-0.12, 0, 0.28 + lift], 0.025, null, DARKM);
    // bassin, cuisses, jambes, bottes
    box([-0.1, 0, 0.4 + lift], 0.28, 0.34, 0.15, UNI);
    for (const sy of [1, -1]) {
      cyl([-0.06, sy * 0.1, 0.4 + lift], [0.28, sy * 0.1, 0.43 + lift * 0.5], 0.078, 0.07, UNI);
      sph([0.28, sy * 0.1, 0.43 + lift * 0.5], 0.07, null, null, UNI);
      cyl([0.28, sy * 0.1, 0.43 + lift * 0.5], [0.34, sy * 0.1, 0.08], 0.062, 0.052, UNI);
      box([0.39, sy * 0.1, 0.045], 0.22, 0.1, 0.09, BOOT);
    }
    // buste (tunique noire de tankiste, ceinturon)
    const zt = 0.46 + lift;
    b.hexa(
      [P(-0.21, -0.17, zt), P(0.03, -0.17, zt), P(0.03, 0.17, zt), P(-0.21, 0.17, zt)],
      [P(-0.19, -0.205, zt + 0.4), P(0.05, -0.205, zt + 0.4), P(0.05, 0.205, zt + 0.4), P(-0.19, 0.205, zt + 0.4)], UNI, 7);
    box([-0.09, 0, zt + 0.02], 0.25, 0.35, 0.05, '#4a3626');
    box([0.055, 0, zt + 0.3], 0.01, 0.12, 0.08, '#c8c4b0'); // insigne de col
    // bras selon le poste
    let hands;
    if (role === 'commander') hands = [[0.08, 0.07, zt + 0.52], [0.08, -0.07, zt + 0.52]];
    else if (role === 'loader') hands = [[0.27, 0.13, zt + 0.12], [0.27, -0.13, zt + 0.12]];
    else if (role === 'driver') hands = [[0.34, 0.19, zt + 0.08], [0.34, -0.19, zt + 0.08]];
    else hands = [[0.34, 0.16, zt + 0.18], [0.34, -0.16, zt + 0.18]];
    for (let i = 0; i < 2; i++) {
      const sy = i === 0 ? 1 : -1, sh = [-0.08, sy * 0.21, zt + 0.37];
      const el = [Math.min(0.1, hands[i][0] - 0.12), sy * 0.25, (sh[2] + hands[i][2]) / 2 - 0.07];
      sph(sh, 0.065, null, null, UNI);
      cyl(sh, el, 0.052, 0.046, UNI);
      cyl(el, hands[i], 0.046, 0.04, UNI);
      sph(hands[i], 0.045, null, null, SKIN);
    }
    // cou, tête, calot et casque radio
    const hz = zt + 0.56 + (role === 'commander' ? 0.04 : 0), hx = role === 'gunner' ? 0.0 : -0.05;
    cyl([-0.07, 0, zt + 0.4], [hx - 0.01, 0, hz - 0.08], 0.048, null, SKIN);
    sph([hx, 0, hz], 0.1, 0.085, 0.115, SKIN);
    sph([hx + 0.095, 0, hz - 0.005], 0.022, 0.018, 0.03, SKIN); // nez
    sph([hx - 0.01, 0, hz + 0.055], 0.108, 0.093, 0.065, CAP);   // calot
    box([hx + 0.06, 0, hz + 0.06], 0.07, 0.15, 0.02, CAP);       // visière
    for (const sy of [1, -1]) b.cyl(P(hx, sy * 0.082, hz), P(hx, sy * 0.115, hz), 0.042 * k, 0.042 * k, 12, '#111214', 7);
    b.cyl(P(hx, 0.1, hz + 0.02), P(hx, -0.1, hz + 0.02), 0.008 * k, 0.008 * k, 6, '#111214', 7);
    // accessoires du poste
    if (role === 'commander') { box([0.13, 0, zt + 0.52], 0.1, 0.17, 0.06, '#222'); }
    if (role === 'loader') { // obus dans les bras
      b.cyl(P(0.3, 0.32, zt + 0.12), P(0.3, -0.22, zt + 0.12), 0.042 * k, 0.04 * k, 12, BRASS, 3);
      b.cyl(P(0.3, -0.22, zt + 0.12), P(0.3, -0.42, zt + 0.12), 0.037 * k, 0.008 * k, 12, '#2a2a2a', 3);
    }
    if (role === 'driver') for (const sy of [1, -1]) cyl([0.36, sy * 0.19, 0.02], [0.34, sy * 0.19, zt + 0.1], 0.016, null, DARKM);
    if (role === 'gunner') for (const sy of [1, -1]) b.cyl(P(0.36, sy * 0.16, zt + 0.18), P(0.4, sy * 0.16, zt + 0.18), 0.08 * k, 0.08 * k, 14, DARKM, 3);
    if (role === 'radio') { box([0.35, 0, zt + 0.2], 0.1, 0.12, 0.08, '#222'); cyl([0.35, 0, zt + 0.2], [0.65, 0, zt + 0.22], 0.015, null, '#222'); }
  }
  function engineMesh(b, s) {
    const [sx, sy, sz] = s;
    b.box(0, 0, -sz * 0.22, sx * 0.92, sy * 0.5, sz * 0.48, '#55595f', 3);                 // carter
    b.box(0, 0, -sz * 0.47, sx * 0.85, sy * 0.42, sz * 0.06, '#3a3c40', 3);                // carter d'huile
    for (const sg of [1, -1]) {
      const a = sg * 0.52;
      tiltBox(b, 0, sg * sy * 0.17, sz * 0.12, sx * 0.88, sy * 0.24, sz * 0.32, a, '#62666c', 3);        // banc de cylindres
      tiltBox(b, 0, sg * sy * 0.26, sz * 0.3, sx * 0.86, sy * 0.2, sz * 0.07, a, '#2f3134', 3);          // couvre-culasse
      for (let i = 0; i < 6; i++) { // bougies et faisceaux
        const x = -sx * 0.37 + i * sx * 0.148;
        b.cyl([x, sg * sy * 0.3, sz * 0.34], [x, sg * sy * 0.34, sz * 0.4], 0.012, 0.012, 6, '#d8d0b0', 7);
      }
      b.cyl([-sx * 0.46, sg * sy * 0.42, sz * 0.05], [sx * 0.46, sg * sy * 0.42, sz * 0.05], 0.045, 0.045, 10, '#7a4a2e', 7); // collecteur
      for (let i = 0; i < 6; i++) b.cyl([-sx * 0.37 + i * sx * 0.148, sg * sy * 0.33, sz * 0.1], [-sx * 0.37 + i * sx * 0.148, sg * sy * 0.42, sz * 0.05], 0.022, 0.022, 6, '#7a4a2e', 7);
    }
    b.cyl([sx * 0.44, 0, -sz * 0.12], [sx * 0.5, 0, -sz * 0.12], sz * 0.3, sz * 0.3, 22, '#3e4146', 3);      // volant moteur
    for (const sg of [1, -1]) b.cyl([-sx * 0.12, sg * sy * 0.05, sz * 0.28], [-sx * 0.12, sg * sy * 0.05, sz * 0.48], 0.07, 0.07, 14, '#5a6040', 7); // filtres à air
    b.cyl([-sx * 0.5, 0, sz * 0.05], [-sx * 0.44, 0, sz * 0.05], sz * 0.18, sz * 0.18, 16, '#4b4f55', 3);   // poulie
  }
  function transMesh(b, s) {
    const [sx, sy, sz] = s;
    b.box(0, 0, 0, sx * 0.75, sy * 0.62, sz * 0.75, '#5b5e66', 3);
    for (let i = 0; i < 4; i++) b.box(-sx * 0.28 + i * sx * 0.19, 0, sz * 0.38, 0.025, sy * 0.6, 0.03, '#46494f', 3); // nervures
    b.cyl([0, -sy * 1.4, -sz * 0.05], [0, sy * 1.4, -sz * 0.05], 0.05, 0.05, 12, '#3a3c40', 3);        // arbres de sortie
    for (const sg of [1, -1]) b.cyl([0, sg * sy * 0.62, -sz * 0.05], [0, sg * sy * 0.9, -sz * 0.05], sz * 0.32, sz * 0.32, 18, '#4a4d53', 3); // freins de direction
    b.cyl([-sx * 0.1, 0, sz * 0.37], [-sx * 0.2, 0, sz * 0.75], 0.015, 0.015, 6, '#222', 3);            // levier
    b.sphere([-sx * 0.2, 0, sz * 0.77], 0.03, 0.03, 0.03, 8, '#222', 7);
    b.cyl([sx * 0.5, 0, -sz * 0.05], [sx * 0.37, 0, -sz * 0.05], 0.06, 0.06, 12, '#3a3c40', 3);         // arbre de transmission
  }
  function fuelMesh(b, s) {
    const [sx, sy, sz] = s;
    b.box(0, 0, 0, sx * 0.9, sy * 0.86, sz * 0.86, '#6e6c3e', 7);
    for (const f of [-0.28, 0, 0.28]) b.box(f * sx, 0, 0, 0.03, sy * 0.9, sz * 0.9, '#3d3b22', 7);   // sangles
    b.cyl([sx * 0.3, 0, sz * 0.43], [sx * 0.3, 0, sz * 0.5], 0.05, 0.05, 12, '#55534a', 3);          // goulot
    b.cyl([sx * 0.3, 0, sz * 0.5], [sx * 0.3, 0, sz * 0.53], 0.065, 0.065, 12, '#2a2a28', 3);        // bouchon
  }
  // Soute : obus rangés un par un (douille en laiton, projectile)
  function ammoMesh(b, s, cal) {
    const [sx, sy, sz] = s, d = cal / 1000;
    const Lr = Math.min(sx * 0.95, d * 11.8), caseR = d * 0.72, pr = d / 2;
    const nx = Math.max(1, Math.floor(sx / (Lr + 0.04))), ny = Math.max(1, Math.floor(sy / (caseR * 2.2))), nz = Math.max(1, Math.floor(sz / (caseR * 2.2)));
    const sx0 = -(nx * (Lr + 0.04)) / 2;
    let n = 0;
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      if (n++ > 42) break;
      const x0 = sx0 + ix * (Lr + 0.04) + 0.02, y = -sy / 2 + caseR * 1.1 + iy * caseR * 2.2, z = -sz / 2 + caseR * 1.1 + iz * caseR * 2.2;
      const he = (iy + iz) % 3 === 2;
      const dir = (ix + iy) % 2 ? 1 : -1;
      const a = dir > 0 ? x0 : x0 + Lr, f = v => a + dir * v;
      b.cyl([f(0), y, z], [f(Lr * 0.55), y, z], caseR, caseR * 0.95, 12, BRASS, 3);                       // douille
      b.cyl([f(Lr * 0.55), y, z], [f(Lr * 0.62), y, z], caseR * 0.95, pr * 1.05, 12, BRASS, 3);           // épaulement
      b.cyl([f(Lr * 0.62), y, z], [f(Lr * 0.86), y, z], pr, pr, 12, he ? '#5c6438' : '#1f1f20', 3);      // projectile
      b.cyl([f(Lr * 0.86), y, z], [f(Lr), y, z], pr, pr * 0.15, 12, he ? '#c9b240' : '#2b2b2c', 3);      // ogive
      b.cyl([f(Lr * 0.64), y, z], [f(Lr * 0.68), y, z], pr * 1.04, pr * 1.04, 12, '#b0703a', 3);         // ceinture
    }
    for (const sg of [1, -1]) b.box(sg * sx * 0.49, 0, 0, 0.015, sy, sz, '#2f3134', 3);                // flasques du râtelier
    for (const sg of [1, -1]) b.cyl([-sx / 2, 0, sg * sz * 0.48], [sx / 2, 0, sg * sz * 0.48], 0.012, 0.012, 6, '#2f3134', 3);
  }
  function breechMesh(b, s, cal) {
    const [sx, sy, sz] = s, d = cal / 1000;
    b.box(-sx * 0.2, 0, 0, sx * 0.36, sy * 0.9, sz * 0.9, '#6c6f73', 3);                           // bloc de culasse
    b.box(-sx * 0.2, sy * 0.5, 0, sx * 0.18, sy * 0.15, sz * 0.4, '#4b4e52', 3);                   // levier d'ouverture
    b.cyl([-sx * 0.02, 0, 0], [sx * 0.5, 0, 0], d * 1.25, d * 1.1, 16, '#5e6166', 3);              // tube
    b.cyl([-sx * 0.1, 0, sz * 0.42], [sx * 0.45, 0, sz * 0.42], d * 0.55, d * 0.55, 12, '#7a7d82', 3);  // frein de recul
    b.cyl([-sx * 0.1, 0, -sz * 0.42], [sx * 0.45, 0, -sz * 0.42], d * 0.55, d * 0.55, 12, '#7a7d82', 3); // récupérateur
    b.box(sx * 0.15, 0, -sz * 0.05, sx * 0.25, sy * 1.0, sz * 0.25, '#4b4e52', 3);                 // berceau
    for (const sg of [1, -1]) b.box(-sx * 0.42, sg * sy * 0.45, 0, sx * 0.16, 0.02, sz * 0.9, '#3b3d40', 3); // garde de recul
    b.box(-sx * 0.5, 0, 0, 0.02, sy * 0.9, sz * 0.9, '#3b3d40', 3);
    b.cyl([sx * 0.1, sy * 0.62, -sz * 0.2], [sx * 0.1, sy * 0.68, -sz * 0.2], sz * 0.3, sz * 0.3, 16, DARKM, 3); // volant de pointage
  }
  function moduleMesh(m, cal) {
    const b = new G3.Builder();
    switch (m.kind) {
      case 'crew': crewMesh(b, m.s[2], m.role); break;
      case 'engine': engineMesh(b, m.s); break;
      case 'trans': transMesh(b, m.s); break;
      case 'fuel': fuelMesh(b, m.s); break;
      case 'ammo': ammoMesh(b, m.s, cal); break;
      default: breechMesh(b, m.s, cal);
    }
    return b;
  }

  // Maillages unitaires pour les modules internes de la vue rayons X
  function moduleMeshes() {
    const box = new G3.Builder();
    box.box(0, 0, 0, 1, 1, 1, '#ffffff', 0);
    const crew = new G3.Builder();
    crew.cyl([0, 0, -0.5], [0, 0, 0.2], 0.42, 0.38, 14, '#ffffff', 0);   // buste
    crew.cyl([0, 0, 0.22], [0, 0, 0.5], 0.22, 0.2, 12, '#ffffff', 0);     // tête
    return { box, crew };
  }

  return { addonArmor, SPECS, NAMES, info, build, makeModules, moduleMeshes, moduleMesh };
})();
