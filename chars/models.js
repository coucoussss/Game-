'use strict';
// Modèles 3D des chars, blindage et modules internes.
// Repère en mètres : x vers l'avant, y vers la gauche, z vers le haut, origine au centre au sol.
// Les modules « turret » sont exprimés dans le repère de la tourelle (x, y relatifs au pivot).
const TankModels = (() => {
  const D2R = Math.PI / 180;

  const SPECS = {
    light: {
      inspired: 'Inspiré du Pz.Kpfw. II Luchs', real: '4,6 × 2,5 × 2,1 m · 12 t · 4 hommes',
      L: 4.6, W: 2.5, tw: 0.38, gc: 0.42, tt: 0.86, ht: 1.45, zn: 0.95, xn: 2.25,
      sUp: 22, sLow: 45, sRear: 12, sideSlope: 0, rearX: -2.2,
      wheels: { n: 5, r: 0.3, x0: 1.5, x1: -1.55, inter: false }, rollers: [0.75, -0.6], rollerR: 0.08,
      spr: { x: 1.95, z: 0.5, r: 0.27 }, idl: { x: -1.98, z: 0.45, r: 0.24 },
      turret: {
        x: 0.2, h: 0.62, ts: 0.84,
        poly: [[0.78, 0.42], [0.55, 0.72], [-0.7, 0.72], [-0.88, 0.45], [-0.88, -0.45], [-0.7, -0.72], [0.55, -0.72], [0.78, -0.42]],
        mantlet: { type: 'box', d: 0.16, w: 0.26, h: 0.17 }, cupola: [-0.4, 0.3, 0.26, 0.18],
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
      inspired: 'Inspiré du Pz.Kpfw. V Panther', real: '6,9 × 3,4 × 2,9 m · 45 t · 5 hommes',
      L: 6.9, W: 3.42, tw: 0.66, gc: 0.56, tt: 1.12, ht: 1.95, zn: 1.08, xn: 3.38,
      sUp: 55, sLow: 55, sRear: 30, sideSlope: 40, rearX: -3.3,
      wheels: { n: 8, r: 0.43, x0: 2.45, x1: -2.35, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 3.0, z: 0.68, r: 0.36 }, idl: { x: -3.0, z: 0.62, r: 0.32 },
      turret: {
        x: 0.25, h: 0.88, ts: 0.8,
        poly: [[1.05, 0.55], [0.8, 0.95], [-1.05, 1.0], [-1.3, 0.7], [-1.3, -0.7], [-1.05, -1.0], [0.8, -0.95], [1.05, -0.55]],
        mantlet: { type: 'cyl', r: 0.3, w: 0.36 }, cupola: [-0.55, 0.42, 0.33, 0.24], bin: true,
      },
      gun: { z: 2.37, fx: 1.2, len: 5.25, r: 0.045, sleeve: [0.085, 0.9], brake: { r: 0.085, len: 0.36 }, name: '7,5 cm KwK 42 L/70' },
      exhaust: [[-3.22, 0.42], [-3.22, -0.42]], skirts: true, mg: true,
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
      inspired: 'Inspiré du Pz.Kpfw. VI Tiger I', real: '6,3 × 3,6 × 3,0 m · 57 t · 5 hommes',
      L: 6.32, W: 3.56, tw: 0.72, gc: 0.47, tt: 1.08, ht: 1.86, zn: 1.2, xn: 3.12,
      sUp: 10, sLow: 45, sRear: 9, sideSlope: 0, rearX: -3.08,
      wheels: { n: 8, r: 0.4, x0: 2.2, x1: -2.25, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 2.75, z: 0.62, r: 0.36 }, idl: { x: -2.8, z: 0.6, r: 0.3 },
      turret: {
        x: -0.15, h: 0.82, ts: 0.97, poly: null,
        mantlet: { type: 'box', d: 0.3, w: 0.72, h: 0.33 }, cupola: [-0.45, 0.55, 0.34, 0.28], smoke: true, spare: true,
      },
      gun: { z: 2.26, fx: 1.25, len: 4.9, r: 0.055, sleeve: [0.095, 0.6], brake: { r: 0.13, len: 0.42 }, name: '8,8 cm KwK 36 L/56' },
      exhaust: [[-3.0, 0.55], [-3.0, -0.55]], tallExhaust: true, mg: true,
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
      inspired: 'Inspiré du Jagdpanther', real: '6,9 × 3,4 × 2,7 m · 46 t · 5 hommes',
      L: 6.9, W: 3.42, tw: 0.66, gc: 0.56, tt: 1.12, ht: 2.32, zn: 1.08, xn: 3.38,
      sUp: 55, sLow: 55, sRear: 35, sideSlope: 30, rearX: -3.3,
      wheels: { n: 8, r: 0.43, x0: 2.45, x1: -2.35, inter: true }, rollers: [], rollerR: 0,
      spr: { x: 3.0, z: 0.68, r: 0.36 }, idl: { x: -3.0, z: 0.62, r: 0.32 },
      turret: null, mount: { x: 2.27, y: -0.1 },
      gun: { z: 1.86, fx: 0.35, len: 6.3, r: 0.055, sleeve: null, brake: { r: 0.12, len: 0.45 }, name: '8,8 cm PaK 43 L/71' },
      exhaust: [[-3.22, 0.42], [-3.22, -0.42]], skirts: true,
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
  };

  // Tourelle en fer à cheval du Tiger : avant plat, arrière arrondi
  (() => {
    const p = [[0.95, -0.92], [0.95, 0.92]];
    for (let a = 70; a <= 290; a += 15) p.push([-0.1 + 1.15 * Math.cos(a * D2R), 1.0 * Math.sin(a * D2R)]);
    SPECS.heavy.turret.poly = p;
  })();

  const NAMES = {
    driver: 'Pilote', radio: 'Radio-mitrailleur', gunner: 'Tireur', commander: 'Chef de char', loader: 'Chargeur',
    engine: 'Moteur', trans: 'Transmission', fuel: 'Réservoir', ammo: 'Soute à munitions', breech: 'Culasse',
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
  function build(id) {
    const S = SPECS[id], I = info(id);
    const hb = new G3.Builder(), tb = new G3.Builder();
    const { L, W, tw, gc, tt, ht, zn, xn } = S;
    const tanU = Math.tan(S.sUp * D2R), tanL = Math.tan(S.sLow * D2R), tanR = Math.tan(S.sRear * D2R), tanS = Math.tan(S.sideSlope * D2R);
    const xUp = z => xn - (z - zn) * tanU, xLow = z => xn - (zn - z) * tanL;
    const rearAt = z => S.rearX + (ht - z) * tanR;
    const hwIn = W / 2 - tw - 0.03;
    const hwAt = z => W / 2 - Math.max(0, z - tt) * tanS;

    // Caisse inférieure entre les chenilles
    hb.loftXZ([[xLow(gc), gc], [xn, zn], [xUp(ht), ht], [S.rearX, ht], [rearAt(gc), gc]], () => hwIn, CAMO, 1);
    // Superstructure au-dessus des chenilles (flancs éventuellement inclinés)
    const sp = [];
    if (tt < zn) sp.push([xLow(tt), tt], [xn, zn]); else sp.push([xUp(tt), tt]);
    sp.push([xUp(ht), ht], [S.rearX, ht], [rearAt(tt), tt]);
    hb.loftXZ(sp, hwAt, CAMO, 1);

    // Train de roulement et chenilles
    const th = id === 'light' ? 0.06 : 0.075;
    const ws = [];
    for (let k = 0; k < S.wheels.n; k++) ws.push(S.wheels.x0 + (S.wheels.x1 - S.wheels.x0) * k / (S.wheels.n - 1));
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
        hb.cyl([x, yc - w / 2, z], [x, yc + w / 2, z], r, r, 20, RUBBER, 4);
        hb.cyl([x, yc - w / 2 - 0.012, z], [x, yc + w / 2 + 0.012, z], r * 0.8, r * 0.8, 20, CAMO, 1);
        hb.cyl([x, yc - w / 2 - 0.03, z], [x, yc + w / 2 + 0.03, z], r * 0.2, r * 0.2, 10, STEEL, 3);
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
        const n = 5, x0 = S.idl.x + 0.1, x1 = S.spr.x - 0.15, pw = (x1 - x0) / n;
        for (let k = 0; k < n; k++) {
          if (side === -1 && k === 3) continue;
          hb.box(x0 + pw * (k + 0.5), side * (W / 2 + 0.02), tt - 0.27, pw - 0.03, 0.02, 0.5, CAMO, 1);
        }
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
    }
    if (S.jerry) for (const sy of [0.35, -0.35]) hb.box(S.rearX - 0.07, sy, ht - 0.2, 0.14, 0.3, 0.42, '#3e4a2c', 0);
    if (id === 'heavy') for (let k = 0; k < 6; k++) hb.box(xUp(1.5) + 0.04, -0.95 + k * 0.38, 1.5, 0.06, 0.34, 0.1, '#3c3a36', 2);

    // Tourelle (repère du pivot)
    const T = S.turret, g = S.gun;
    if (T) {
      const z1 = ht + T.h;
      tb.prism(T.poly, ht, z1, T.ts, CAMO, 1);
      tb.cyl([0, 0, ht - 0.05], [0, 0, ht + 0.02], 0.95 * Math.min(1, W / 3.4), 0.95 * Math.min(1, W / 3.4), 24, CAMO, 1);
      const fx = Math.max(...T.poly.map(p => p[0]));
      const m = T.mantlet;
      if (m.type === 'box') tb.box(fx + m.d / 2 - 0.05, 0, g.z, m.d, m.w * 2, m.h * 2, CAMO, 1);
      else tb.cyl([fx - 0.05, -m.w, g.z], [fx - 0.05, m.w, g.z], m.r, m.r, 18, CAMO, 1);
      const c = T.cupola;
      tb.cyl([c[0], c[1], z1 - 0.05], [c[0], c[1], z1 + c[3]], c[2], c[2] * 0.95, 18, CAMO, 1);
      tb.cyl([c[0], c[1], z1 + c[3]], [c[0], c[1], z1 + c[3] + 0.04], c[2] * 0.8, c[2] * 0.75, 18, CAMO, 1);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2;
        tb.box(c[0] + Math.cos(a) * c[2] * 0.98, c[1] + Math.sin(a) * c[2] * 0.98, z1 + c[3] * 0.6, 0.06, 0.06, 0.06, GLASS, 5);
      }
      tb.box(-0.2, -0.45, z1 + 0.02, 0.45, 0.4, 0.04, CAMO, 1); // trappe du chargeur
      tb.box(fx - 0.35, 0.42, z1 + 0.03, 0.1, 0.1, 0.07, GLASS, 5); // viseur
      if (T.bin) { const bx = Math.min(...T.poly.map(p => p[0])); tb.box(bx - 0.22, 0, ht + 0.42, 0.45, 1.25, 0.45, CAMO, 1); }
      if (T.smoke) for (const sy of [1, -1]) for (let k = 0; k < 3; k++) {
        const x = 0.55 - k * 0.18, y = sy * 1.0;
        tb.cyl([x, y, ht + 0.45], [x + 0.08, y + sy * 0.04, ht + 0.62], 0.04, 0.04, 8, DARK, 3);
      }
      if (T.spare) for (const sy of [1, -1]) for (let k = 0; k < 4; k++) tb.box(-0.3 + k * 0.3, sy * 1.0, ht + 0.42, 0.27, 0.05, 0.2, '#3c3a36', 2);
      tb.cyl([-0.9, -0.55, z1], [-0.9, -0.55, z1 + 1.6], 0.008, 0.005, 4, DARK, 3); // antenne
    } else {
      // Masque en « tête de cochon » du chasseur
      tb.cyl([-0.15, 0, g.z], [g.fx + 0.05, 0, g.z], 0.34, 0.16, 18, CAMO, 1);
      // périscopes et trappes de casemate
      hb.box(0.4, 0.55, ht + 0.06, 0.12, 0.2, 0.12, GLASS, 5);
      hb.box(0.0, -0.5, ht + 0.06, 0.12, 0.2, 0.12, GLASS, 5);
      hb.box(-0.6, 0.0, ht + 0.02, 0.6, 0.6, 0.04, CAMO, 1);
      hb.cyl([-0.3, -0.5, ht], [-0.3, -0.5, ht + 0.35], 0.03, 0.03, 6, DARK, 3);
    }
    // Canon
    if (g.sleeve) tb.cyl([g.fx - 0.05, 0, g.z], [g.fx + g.sleeve[1], 0, g.z], g.sleeve[0], g.sleeve[0] * 0.92, 16, CAMO, 1);
    tb.cyl([g.fx, 0, g.z], [g.fx + g.len, 0, g.z], g.r * 1.15, g.r * 0.9, 16, CAMO, 1);
    if (g.brake) {
      const bx = g.fx + g.len;
      tb.cyl([bx - 0.02, 0, g.z], [bx + g.brake.len * 0.45, 0, g.z], g.brake.r, g.brake.r, 16, DARK, 3);
      tb.cyl([bx + g.brake.len * 0.55, 0, g.z], [bx + g.brake.len, 0, g.z], g.brake.r, g.brake.r, 16, DARK, 3);
      tb.cyl([bx, 0, g.z], [bx + g.brake.len, 0, g.z], g.r * 0.9, g.r * 0.9, 10, DARK, 3);
    } else tb.cyl([g.fx + g.len - 0.08, 0, g.z], [g.fx + g.len, 0, g.z], g.r * 1.2, g.r * 1.2, 12, DARK, 3);

    return { S, I, hull: hb, turret: tb };
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

  return { SPECS, NAMES, info, build, makeModules, moduleMeshes };
})();
