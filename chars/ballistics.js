'use strict';
// Balistique extérieure et terminale.
// - vitesse le long de la trajectoire : traînée aérodynamique dv/dx = −ρ·Cd(Mach)·A·v / 2m, intégrée en
//   table de tir pour chaque obus ; air et charge propulsive suivent la température du champ de bataille
// - perforation : formule de de Marre, P ∝ v^1,43 · m^0,71 / d^1,07
// - obliquité : tables d'essais de tir par type d'obus (coiffé, non coiffé, sous-calibré), selon T/d
// - vitesse résiduelle : Lambert-Jonas, Vr = √(V² − Vlim²), puis quantité de mouvement du bouchon
// - éclats : masses selon la loi de Mott, énergie ½mv², ricochets sur les parois
// - charge explosive : surpression de Kinney-Graham, rayon de Sedov-Taylor, éclats à la vitesse de Gurney
const Ballistics = (() => {
  const G = 9.81, STEEL = 7850, C_DM = 0.02436, TNT = 4.184e6, D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
  const reflect = (d, n) => sub(d, mul(n, 2 * dot(d, n)));

  // Munitions réelles (valeurs historiques arrondies). La charge (filler) est la masse réelle d'explosif ;
  // re est son équivalent TNT : PETN flegmatisée des APHE 1,5, TNT ou amatol des explosifs 1,0.
  // Les APCR (noyau de carbure) sont calés par moindres carrés sur les tables allemandes de perforation
  // à 30° (100 à 2000 m), avec la loi d'obliquité et la traînée selon Mach ci-dessous. Le KwK 42 n'a
  // jamais reçu de charge creuse : la sienne est un obus d'essai, pénalisé par la rotation (jet dispersé).
  const GUNS = {
    light: {
      gun: '5 cm KwK 39 L/60', cal: 50, twist: 25,
      shells: {
        AP: { name: '5 cm PzGr. (AP)', m: 2.06, v0: 823, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '5 cm PzGr. 39 (APCBC-HE)', m: 2.06, v0: 835, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.017, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '5 cm PzGr. 40 (APCR)', m: 0.925, v0: 1180, cd: 0.73, k: 2.02, norm: -3, ric: [58, 68], core: 0.32, len: 3.4 },
        HEAT: { name: '5 cm Gr. 38 HL (HEAT)', m: 1.6, v0: 450, cd: 0.35, pen: 60, ric: [80, 86], len: 4.2 },
        HE: { name: '5 cm Sprgr. 38 (HE)', m: 1.82, v0: 550, cd: 0.33, filler: 0.165, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    medium: {
      gun: '7.5 cm KwK 42 L/70', cal: 75, twist: 25,
      shells: {
        AP: { name: '7.5 cm PzGr. (AP)', m: 6.8, v0: 935, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '7.5 cm PzGr. 39/42 (APCBC-HE)', m: 6.8, v0: 925, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.018, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '7.5 cm PzGr. 40/42 (APCR)', m: 4.75, v0: 1120, cd: 0.39, k: 1.45, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '7.5 cm Gr. 38 HL/C (HEAT, L/70 trial)', m: 4.4, v0: 450, cd: 0.35, pen: 100, spinPen: true, ric: [80, 86], len: 4.2 },
        HE: { name: '7.5 cm Sprgr. 42 (HE)', m: 5.74, v0: 700, cd: 0.33, filler: 0.65, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    heavy: {
      gun: '8.8 cm KwK 36 L/56', cal: 88, twist: 30,
      shells: {
        AP: { name: '8.8 cm PzGr. (AP)', m: 10.2, v0: 773, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '8.8 cm PzGr. 39 (APCBC-HE)', m: 10.2, v0: 773, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.059, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '8.8 cm PzGr. 40 (APCR)', m: 7.3, v0: 930, cd: 0.33, k: 1.43, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '8.8 cm Gr. 39 HL (HEAT)', m: 7.65, v0: 600, cd: 0.35, pen: 110, ric: [80, 86], len: 4.2 },
        HE: { name: '8.8 cm Sprgr. (HE)', m: 9.0, v0: 820, cd: 0.33, filler: 0.9, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    pz4: {
      gun: '7.5 cm KwK 40 L/48', cal: 75, twist: 25,
      shells: {
        AP: { name: '7.5 cm PzGr. (AP)', m: 6.8, v0: 790, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '7.5 cm PzGr. 39 (APCBC-HE)', m: 6.8, v0: 790, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.018, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '7.5 cm PzGr. 40 (APCR)', m: 4.1, v0: 990, cd: 0.49, k: 1.26, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '7.5 cm Gr. 38 HL/C (HEAT)', m: 4.4, v0: 450, cd: 0.35, pen: 100, ric: [80, 86], len: 4.2 },
        HE: { name: '7.5 cm Sprgr. 34 (HE)', m: 5.74, v0: 550, cd: 0.33, filler: 0.68, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    stug: {
      gun: '7.5 cm StuK 40 L/48', cal: 75, twist: 25,
      shells: {
        AP: { name: '7.5 cm PzGr. (AP)', m: 6.8, v0: 790, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '7.5 cm PzGr. 39 (APCBC-HE)', m: 6.8, v0: 790, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.018, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '7.5 cm PzGr. 40 (APCR)', m: 4.1, v0: 990, cd: 0.49, k: 1.26, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '7.5 cm Gr. 38 HL/C (HEAT)', m: 4.4, v0: 450, cd: 0.35, pen: 100, ric: [80, 86], len: 4.2 },
        HE: { name: '7.5 cm Sprgr. 34 (HE)', m: 5.74, v0: 550, cd: 0.33, filler: 0.68, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    kingtiger: {
      gun: '8.8 cm KwK 43 L/71', cal: 88, twist: 30,
      shells: {
        AP: { name: '8.8 cm PzGr. (AP)', m: 10.16, v0: 1000, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '8.8 cm PzGr. 39/43 (APCBC-HE)', m: 10.16, v0: 1000, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.05, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '8.8 cm PzGr. 40/43 (APCR)', m: 7.3, v0: 1130, cd: 0.32, k: 1.5, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '8.8 cm Gr. 39/43 HL (HEAT)', m: 7.65, v0: 600, cd: 0.35, pen: 110, ric: [80, 86], len: 4.2 },
        HE: { name: '8.8 cm Sprgr. 43 (HE)', m: 9.4, v0: 750, cd: 0.33, filler: 1.0, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    destroyer: {
      gun: '8.8 cm PaK 43 L/71', cal: 88, twist: 30,
      shells: {
        AP: { name: '8.8 cm PzGr. (AP)', m: 10.16, v0: 1000, cd: 0.33, k: 1.0, norm: 2, ric: [64, 74], len: 4.0 },
        APHE: { name: '8.8 cm PzGr. 39/43 (APCBC-HE)', m: 10.16, v0: 1000, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.05, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '8.8 cm PzGr. 40/43 (APCR)', m: 7.3, v0: 1130, cd: 0.32, k: 1.5, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HEAT: { name: '8.8 cm Gr. 39/43 HL (HEAT)', m: 7.65, v0: 600, cd: 0.35, pen: 110, ric: [80, 86], len: 4.2 },
        HE: { name: '8.8 cm Sprgr. 43 (HE)', m: 9.4, v0: 750, cd: 0.33, filler: 1.0, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
  };
  // Munitions spéciales communes : obus fumigène (Nebelgranate) et boîte à mitraille (Kartätsche)
  for (const g of Object.values(GUNS)) {
    const c = g.cal === 50 ? '5 cm' : g.cal === 75 ? '7.5 cm' : '8.8 cm', k = Math.pow(g.cal / 75, 3);
    g.shells.SMOKE = { name: `${c} Nb.Gr. (smoke)`, m: +(6.2 * k).toFixed(2), v0: 540, cd: 0.33, filler: 0.05 * k, re: 1, ric: [85, 89], len: 4.6 };
    g.shells.CAN = { name: `${c} Kart. (canister)`, m: +(6.0 * k).toFixed(2), v0: 450, cd: 0.45, ric: [85, 89], len: 2.6, balls: Math.round(110 * k), ballM: 0.024 };
  }
  for (const g of Object.values(GUNS)) for (const [key, s] of Object.entries(g.shells)) {
    s.key = key; s.cal = g.cal; s.twist = g.twist;
    s.heat = key === 'HEAT'; s.he = key === 'HE'; s.smoke = key === 'SMOKE'; s.can = key === 'CAN';
  }
  const shell = (id, key) => GUNS[id].shells[key];

  // ===================== Balistique extérieure et perforation =====================
  const area = s => Math.PI * Math.pow(s.cal / 1000, 2) / 4;
  // Atmosphère du champ de bataille : température (°C) et masse volumique de l'air (kg/m³) ;
  // la changer invalide les tables de tir
  const ATM = { T: 15, rho: 1.225 };
  function setAtmosphere(T, rho) {
    if (ATM.T === T && ATM.rho === rho) return;
    ATM.T = T; ATM.rho = rho;
    for (const g of Object.values(GUNS)) for (const s of Object.values(g.shells)) s.tab = null;
  }
  const sound = () => 20.05 * Math.sqrt(273.15 + ATM.T);
  // vitesse initiale : la poudre brûle plus vite à chaud, environ +0,1 % par °C au-dessus de 15 °C
  const muzzle = s => s.v0 * (1 + 0.001 * (ATM.T - 15));
  // Cd selon le nombre de Mach, rapporté à sa valeur au-delà de Mach 2,5 : la traînée culmine
  // juste au-dessus de la vitesse du son (onde de choc détachée) puis chute en subsonique
  const MACH = [[0.9, 0.80], [1.0, 1.30], [1.2, 1.35], [1.5, 1.20], [2.0, 1.06], [2.5, 1.00]];
  function cdMach(M) {
    if (M <= MACH[0][0]) return MACH[0][1];
    if (M >= 2.5) return 1;
    let i = 0;
    while (MACH[i + 1][0] < M) i++;
    const a = MACH[i], b = MACH[i + 1];
    return a[1] + (b[1] - a[1]) * (M - a[0]) / (b[0] - a[0]);
  }
  // coefficient de traînée (1/m) à la vitesse v : dv/dx = −k·v
  const kDrag = (s, v) => ATM.rho * s.cd * cdMach(v / sound()) * area(s) / (2 * s.m);
  // Table de tir de chaque obus, intégrée une seule fois (pas de 1 m, relevé tous les 10 m) en tir
  // tendu : vitesse, durée de trajet, chute sous la ligne de départ et pente de descente
  const TAB_DX = 10, TAB_N = 400;
  function table(s) {
    if (s.tab) return s.tab;
    const v = new Float64Array(TAB_N + 1), t = new Float64Array(TAB_N + 1), z = new Float64Array(TAB_N + 1), q = new Float64Array(TAB_N + 1);
    let V = muzzle(s), tt = 0, zz = 0, sl = 0;
    v[0] = V;
    for (let i = 1; i <= TAB_N; i++) {
      for (let j = 0; j < TAB_DX; j++) {
        // pas de 1 m évalué à mi-chemin : la pente perd g / v² par mètre, la hauteur suit la pente
        const k = kDrag(s, V), Vm = V * Math.exp(-0.5 * k), g = G / (Vm * Vm);
        tt += 1 / Vm; zz += sl - 0.5 * g; sl -= g;
        V *= Math.exp(-k);
      }
      v[i] = V; t[i] = tt; z[i] = -zz; q[i] = -sl;
    }
    return (s.tab = { v, t, z, q });
  }
  const look = (a, x) => { const f = clamp(x / TAB_DX, 0, TAB_N), i = Math.min(TAB_N - 1, Math.floor(f)); return a[i] + (a[i + 1] - a[i]) * (f - i); };
  const XMAX = TAB_DX * TAB_N;
  const velAt = (s, x) => { const v = table(s).v; return x <= XMAX ? look(v, x) : v[TAB_N] * Math.exp(-kDrag(s, v[TAB_N]) * (x - XMAX)); };
  // durée de trajet (s), chute sous la ligne de départ (m) et pente de descente (m/m) à la distance x
  const tof = (s, x) => look(table(s).t, x);
  const drop = (s, x) => look(table(s).z, x);
  const descent = (s, x) => look(table(s).q, x);
  // mêmes grandeurs sous forme exacte quand k est constant (vitesse exponentielle)
  const dropExp = (v0, k, X) => G / (2 * k * v0 * v0) * ((Math.exp(2 * k * X) - 1) / (2 * k) - X);
  const tofExp = (v0, k, X) => (Math.exp(k * X) - 1) / (k * v0);
  const descentExp = (v0, k, X) => G / (2 * k * v0 * v0) * (Math.exp(2 * k * X) - 1);
  const heContact = s => 14.5 * Math.pow(s.filler, 0.38); // perforation par contact d'une charge explosive (mm)
  const deMarreK = s => C_DM * s.k * Math.pow(s.m, 0.71) / Math.pow(s.cal / 10, 1.07);
  function penVel(s, v) {
    if (s.smoke || s.can) return 4;
    if (s.heat) return s.pen * (s.spinPen ? 1 - 0.25 * Math.min(1, spin(s, s.v0) / 300) : 1);
    if (s.he) return heContact(s);
    return deMarreK(s) * Math.pow(v, 1.43);
  }
  const vLimit = (s, mm) => Math.pow(mm / deMarreK(s), 1 / 1.43);
  const penAt = (id, key, x) => { const s = shell(id, key); return penVel(s, velAt(s, x)); };
  // Lois d'obliquité tirées des essais de tir contre de l'acier laminé (Bird & Livingston, essais
  // britanniques et américains) : multiplicateur de l'épaisseur selon T/d (calibre plein) et l'incidence.
  // Une coiffe (APCBC) mord mieux sur une plaque inclinée ; le noyau de carbure (APCR) glisse et
  // perd vite pied ; en surcalibrage (T/d faible), la loi passe sous le cosinus.
  const OBL_A = [0, 10, 20, 30, 40, 45, 50, 55, 60, 65, 70], OBL_R = [0.25, 0.5, 1.0, 1.5];
  const OBL = {
    APHE: [
      [1, 1, 1.03, 1.08, 1.17, 1.24, 1.32, 1.43, 1.58, 1.80, 2.10],
      [1, 1.01, 1.05, 1.12, 1.25, 1.35, 1.48, 1.65, 1.90, 2.30, 2.90],
      [1, 1.02, 1.08, 1.20, 1.40, 1.55, 1.78, 2.10, 2.55, 3.20, 4.20],
      [1, 1.03, 1.10, 1.26, 1.52, 1.70, 1.98, 2.38, 2.95, 3.80, 5.00],
    ],
    AP: [
      [1, 1, 1.03, 1.09, 1.19, 1.27, 1.36, 1.48, 1.66, 1.92, 2.30],
      [1, 1.01, 1.05, 1.13, 1.28, 1.40, 1.55, 1.75, 2.05, 2.50, 3.20],
      [1, 1.02, 1.08, 1.22, 1.45, 1.65, 1.95, 2.40, 3.10, 4.20, 6.00],
      [1, 1.03, 1.11, 1.28, 1.58, 1.82, 2.18, 2.70, 3.50, 4.80, 7.00],
    ],
    APCR: [
      [1, 1.01, 1.05, 1.13, 1.27, 1.38, 1.52, 1.72, 2.00, 2.45, 3.10],
      [1, 1.02, 1.08, 1.20, 1.42, 1.60, 1.85, 2.20, 2.70, 3.40, 4.60],
      [1, 1.03, 1.12, 1.32, 1.70, 2.00, 2.45, 3.10, 4.10, 5.60, 8.00],
      [1, 1.04, 1.15, 1.40, 1.88, 2.25, 2.80, 3.60, 4.90, 6.80, 10],
    ],
  };
  // interpolation linéaire dans une ligne de la table ; au-delà de 70°, prolongement en 1/cos^n
  // (exposant tiré du dernier intervalle) jusque dans la bande de ricochet
  function oblRow(row, a) {
    if (a >= 70) {
      const n = Math.log(row[10] / row[9]) / Math.log(Math.cos(65 * D2R) / Math.cos(70 * D2R));
      return row[10] * Math.pow(Math.cos(70 * D2R) / Math.cos(Math.min(a, 86) * D2R), n);
    }
    let i = 0;
    while (OBL_A[i + 1] < a) i++;
    const k = (a - OBL_A[i]) / (OBL_A[i + 1] - OBL_A[i]);
    return row[i] + (row[i + 1] - row[i]) * k;
  }
  // multiplicateur d'obliquité : bilinéaire en T/d (borné à 0,25..1,5) et en incidence
  function obliquity(key, Td, ang) {
    const tab = OBL[key] || OBL.APHE, r = clamp(Td, 0.25, 1.5), a = clamp(ang, 0, 86);
    let j = 0;
    while (OBL_R[j + 1] < r) j++;
    const k = (r - OBL_R[j]) / (OBL_R[j + 1] - OBL_R[j]);
    const m0 = oblRow(tab[j], a), m1 = oblRow(tab[j + 1], a);
    return m0 + (m1 - m0) * k;
  }
  // Épaisseur effective selon la loi d'obliquité du type d'obus ; l'angle « normalisé » (incidence
  // moins la normalisation de la coiffe) ne sert plus qu'à l'affichage et au trajet après perforation
  function effective(s, T, ang) {
    if (s.heat) return { eff: T / Math.cos(Math.min(ang, 86) * D2R), angN: ang };
    if (s.he) return { eff: T / Math.pow(Math.cos(Math.min(ang, 86) * D2R), 0.3), angN: ang };
    return { eff: T * obliquity(s.key, T / s.cal, ang), angN: clamp(ang - (s.norm || 0), 0, 86) };
  }
  // Probabilité de ricochet ; un calibre très supérieur au blindage ne ricoche pas (surcalibrage).
  // off abaisse les angles critiques (obus déjà déformé, en travers)
  function ricochetChance(s, T, ang, off = 0) {
    const ratio = s.cal / T;
    if (ratio > 3) return 0;
    let lo = s.ric[0] - off, hi = s.ric[1] - off;
    if (ratio > 2) { lo += 6; hi += 6; }
    return clamp((ang - lo) / (hi - lo), 0, 1);
  }
  // Probabilité que l'obus se brise à l'impact (V en m/s, T en mm, incidence en degrés) :
  // - perforant non coiffé : au-delà d'environ 800 m/s contre une plaque épaisse (T/d ≥ 0,8), c'est le
  //   « shatter gap » des 6-pdr et 76 mm alliés contre Tiger et Panther, et la raison d'être de la coiffe ;
  // - noyau de carbure de tungstène (APCR) : cassant, il éclate sur une plaque inclinée au-delà de 30° ;
  // - coiffé (APCBC) : rarement.
  function shatterChance(s, T, ang, V) {
    if (s.key === 'AP') return Math.min(0.7, clamp((V - 780) / 250, 0, 1) * clamp((T / s.cal - 0.6) / 0.6, 0, 1) * (0.6 + 0.4 * clamp(ang / 45, 0, 1)));
    if (s.key === 'APCR') return Math.min(0.95, clamp((ang - 25) / 30, 0, 0.9) + (T / (0.4 * s.cal) > 2.5 ? 0.2 : 0));
    if (s.key === 'APHE') return 0.03;
    return 0;
  }
  // perforation restante d'un obus brisé
  const SHATTER_PEN = { AP: 0.7, APHE: 0.7, APCR: 0.55 };
  // Charge creuse contre une jupe : le jet se forme trop tôt et s'étire sur la distance S (m) jusqu'au
  // blindage ; facteur de perforation selon S en calibres
  const STANDOFF = [[2, 1], [4, 0.88], [6, 0.75], [8, 0.65], [12, 0.55], [20, 0.45]];
  function standoffK(S, cal) {
    const r = S / (cal / 1000);
    if (r <= 2) return 1;
    if (r >= 20) return 0.45;
    let i = 0;
    while (STANDOFF[i + 1][0] < r) i++;
    const a = STANDOFF[i], b = STANDOFF[i + 1];
    return a[1] + (b[1] - a[1]) * (r - a[0]) / (b[0] - a[0]);
  }
  // Surpression incidente (kPa), formule de Kinney-Graham, avec un facteur de confinement
  function blastKPa(W, r, conf) {
    const Z = Math.max(0.05, r) / Math.cbrt(W);
    const p = 808 * (1 + Math.pow(Z / 4.5, 2)) / Math.sqrt((1 + Math.pow(Z / 0.048, 2)) * (1 + Math.pow(Z / 0.32, 2)) * (1 + Math.pow(Z / 1.35, 2)));
    return p * 101.3 * conf;
  }
  const sedov = (E, t) => 1.033 * Math.pow(E * t * t / ATM.rho, 0.2);
  const gurney = (C, M) => 2440 * Math.sqrt((C / M) / (1 + 0.5 * C / M));
  const mott = mu => { const l = -Math.log(Math.random() || 1e-9); return mu * l * l; };
  // Vitesse de rotation imprimée par les rayures (tours par seconde)
  const spin = (s, v) => v / (s.twist * s.cal / 1000);

  function cone(axis, half) {
    const ref = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(axis, ref)), w = cross(axis, u);
    const a = half * Math.sqrt(Math.random()), p = Math.random() * Math.PI * 2;
    return norm(add(mul(axis, Math.cos(a)), mul(add(mul(u, Math.cos(p)), mul(w, Math.sin(p))), Math.sin(a))));
  }
  const sphere = () => { const z = rnd(-1, 1), p = rnd(0, Math.PI * 2), r = Math.sqrt(1 - z * z); return [r * Math.cos(p), r * Math.sin(p), z]; };

  // ===================== Effets dans le char =====================
  // Épaisseur d'acier équivalente des modules traversés par le noyau (mm)
  const EQ = { crew: 4, fuel: 6, ammo: 14, engine: 45, trans: 38, breech: 70, radio: 5, wall: 10 };
  const ABSORB = { crew: 0.7, fuel: 0.85, ammo: 1, engine: 1, trans: 1, breech: 1, radio: 0.6, wall: 0.75 };

  // ctx : { mods, piv:[x,y], tAng, inner, wall(face) → {T, slope, n}, E, d, n (normale extérieure), s, V, T, eff, mode }
  // mode : 'pen' (perforation), 'spall' (écaillage sans perforation), 'heout' (explosif contre la plaque)
  function simulate(ctx) {
    const s = ctx.s, out = { core: [], frags: [], hits: new Map(), ignite: [], fuel: null, blast: null, jet: null, exit: null, plug: null, Vr: 0, Vbl: 0, tEnd: 0, coreStop: null, notes: [] };
    const hit = (m, dmg, t) => {
      if (dmg <= 0) return;
      const h = out.hits.get(m);
      if (h) { h.dmg += dmg; h.time = Math.min(h.time, t); } else out.hits.set(m, { dmg, time: t });
    };
    const inner = ctx.inner, mn = [inner.x0, inner.y0, inner.z0], mx = [inner.x1, inner.y1, inner.z1];
    const piv = [ctx.piv[0], ctx.piv[1], 0];
    // modules traversés par un rayon : [entrée, sortie], chacun dans son repère
    function rayMods(o, d, maxL) {
      const res = [];
      const ot = rotZ(sub(o, piv), -ctx.tAng), dt = rotZ(d, -ctx.tAng);
      for (const m of ctx.mods) {
        const oo = m.frame === 'turret' ? ot : o, dd = m.frame === 'turret' ? dt : d;
        let t0 = -1e9, t1 = 1e9, ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < m.min[k] || oo[k] > m.max[k]) ok = false; continue; }
          let a = (m.min[k] - oo[k]) / dd[k], b = (m.max[k] - oo[k]) / dd[k];
          if (a > b) { const q = a; a = b; b = q; }
          if (a > t0) t0 = a; if (b < t1) t1 = b;
          if (t0 > t1) ok = false;
        }
        if (ok && t1 > 1e-4 && t0 < maxL) res.push({ m, t0: Math.max(0, t0), t1 });
      }
      return res.sort((a, b) => a.t0 - b.t0);
    }
    // paroi intérieure atteinte en premier
    function wallHit(o, d) {
      let best = 9, face = 'roof', axis = 2, sign = 1;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) continue;
        const lim = d[k] > 0 ? mx[k] : mn[k], t = (lim - o[k]) / d[k];
        if (t > 1e-4 && t < best) { best = t; axis = k; sign = d[k] > 0 ? 1 : -1; }
      }
      if (axis === 0) face = sign > 0 ? 'front' : 'rear';
      else if (axis === 1) face = 'side';
      else face = sign > 0 ? 'roof' : 'floor';
      const w = ctx.wall(face, sign);
      return { t: Math.max(0, best), face, w };
    }
    // Éclat : trajet rectiligne, dégâts selon son énergie, ricochets rasants sur les parois
    function frag(p0, d0, v0, m, t0, hot) {
      let p = p0, d = d0, V = v0, t = t0, E = 0.5 * m * V * V, it = 0;
      const pts = [{ p, t }], seen = new Set();
      while (V > 50 && it++ < 14) {
        const w = wallHit(p, d);
        const hs = rayMods(p, d, w.t).filter(h => !seen.has(h.m));
        if (hs.length) {
          const h = hs[0];
          p = add(p, mul(d, h.t0)); t += h.t0 / V; pts.push({ p, t });
          seen.add(h.m);
          const k = h.m.kind;
          hit(h.m, k === 'crew' ? Math.min(260, E / 4) : E / 40, t);
          if (k === 'ammo' && Math.random() < clamp(E / 4000, 0.02, 0.45) * (hot ? 1.5 : 1)) out.ignite.push({ m: h.m, t });
          if (k === 'fuel' && Math.random() < (hot ? 0.35 : 0.12)) out.fuel = Math.min(out.fuel == null ? 1e9 : out.fuel, t);
          E *= 1 - ABSORB[k];
          if (E < 15) { V = 0; break; }
          V = Math.sqrt(2 * E / m);
          const L = h.t1 - h.t0;
          p = add(p, mul(d, L)); t += L / V; pts.push({ p, t });
          continue;
        }
        p = add(p, mul(d, w.t)); t += w.t / V; pts.push({ p, t });
        const c = dot(d, w.w.n);
        if (c < 0.42 && V > 140) { d = norm(add(reflect(d, w.w.n), mul(sphere(), 0.12))); V *= 0.45; E = 0.5 * m * V * V; continue; }
        break;
      }
      out.frags.push({ pts, hot, m, v: v0 });
      return pts[pts.length - 1].t;
    }
    function spray(o, axis, count, half, vMin, vMax, mu, hot, t0) {
      for (let i = 0; i < count; i++) frag(o, cone(axis, half * D2R), rnd(vMin, vMax), clamp(Math.max(0.0004, mott(mu)), 0.0004, 0.12), t0, hot);
    }
    // Charge explosive : souffle confiné dans le char et éclats de l'enveloppe
    function explode(F, t, dir, V, W, Mcase, conf, nFrag) {
      const We = W * (s.re || 1); // masse réelle × équivalent TNT de l'explosif
      out.blast = { p: F, t, W: We, raw: W, E: We * TNT };
      for (const m of ctx.mods) {
        const q = m.frame === 'turret' ? rotZ(sub(F, piv), -ctx.tAng) : F;
        const c = [clamp(q[0], m.min[0], m.max[0]), clamp(q[1], m.min[1], m.max[1]), clamp(q[2], m.min[2], m.max[2])];
        const r = len(sub(q, c)), P = blastKPa(We, r, conf), ta = t + r / 1200;
        if (m.kind === 'crew') hit(m, clamp((P - 150) / 3, 0, 260), ta);
        else hit(m, clamp((P - 400) / 8, 0, 200), ta);
      }
      const gv = gurney(We, Mcase);
      for (let i = 0; i < nFrag; i++) {
        const vel = add(mul(dir, V * 0.9), mul(sphere(), gv * rnd(0.7, 1.3)));
        const sp = len(vel);
        frag(F, norm(vel), Math.max(120, sp), clamp(mott(Mcase / (nFrag * 2.5)), 0.001, 0.25), t, true);
      }
    }

    const E0 = ctx.E, T = ctx.T, V = ctx.V;
    if (ctx.mode === 'spall') {
      // écaillage de la face arrière sans perforation (onde de choc dans le blindage)
      const n = Math.round(rnd(3, 8));
      spray(add(E0, mul(ctx.d, 0.02)), norm(sub(ctx.d, mul(ctx.n, 0.3))), n, 45, 60, 220, 0.003, false, 0);
      out.notes.push('Spalling off the inner face');
    } else if (ctx.mode === 'heout') {
      const n = Math.round(4 + T / 12);
      spray(add(E0, mul(ctx.d, 0.02)), ctx.d, n, 55, 90, 320, 0.004, false, 0.05e-3);
      out.notes.push('Shock-wave spalling (Hopkinson)');
    } else if (s.heat) {
      // Jet de charge creuse : environ 6 500 m/s. Il garde la perforation qui lui reste après la plaque
      // (mm) et la dépense dans chaque module traversé (acier équivalent) ; ses dégâts faiblissent sous
      // 20 mm de reste, il s'éteint à zéro
      let res = Math.max(0, (ctx.pen || s.pen) - ctx.eff);
      const w = wallHit(E0, ctx.d), tipV = 6500, res0 = res;
      let L = w.t;
      for (const h of rayMods(E0, ctx.d, w.t)) {
        if (res <= 0) { L = Math.min(L, h.t0); break; }
        const tt = h.t0 / tipV, k = Math.min(1, res / 20);
        hit(h.m, (h.m.kind === 'crew' ? 230 : 170) * k, tt);
        if (h.m.kind === 'ammo' && Math.random() < 0.8 * k) out.ignite.push({ m: h.m, t: tt });
        if (h.m.kind === 'fuel' && Math.random() < 0.6 * k) out.fuel = Math.min(out.fuel == null ? 1e9 : out.fuel, tt);
        const eq = EQ[h.m.kind];
        if (res <= eq) L = Math.min(L, h.t0 + (h.t1 - h.t0) * res / eq);
        res -= eq;
      }
      L = Math.max(0.05, L);
      out.jet = { a: E0, b: add(E0, mul(ctx.d, L)), t0: 0, t1: L / tipV, res: res0 };
      out.Vr = tipV;
      spray(add(E0, mul(ctx.d, 0.02)), ctx.d, clamp(Math.round(6 + res0 / 4), 6, 18), 9, 1200, 2400, 0.0015, true, 0.02e-3);
    } else if (s.he) {
      // Explosif ayant percé : détonation juste derrière la plaque
      const F = add(E0, mul(ctx.d, 0.12));
      out.Vr = 0;
      explode(F, 0.15e-3, ctx.d, 0, s.filler, s.m - s.filler, 2.2, 55);
      spray(add(E0, mul(ctx.d, 0.02)), ctx.d, 10, 50, 150, 500, 0.004, true, 0.05e-3);
    } else {
      // Obus perforant : vitesse résiduelle, bouchon, écaillage, trajet du noyau, fusée retardée.
      // Un obus brisé à l'impact (ctx.shatter) perd la moitié de sa vitesse résiduelle, ne découpe pas de
      // bouchon et arrive en morceaux : beaucoup d'écailles, quelques gros fragments, pas de noyau intact
      // ctx.f : rapport de la perforation retenue à la loi de de Marre (aléa ±5 %, améliorations, obus en
      // travers ou brisé) ; la limite balistique en tient compte, et un obus qui perce garde au moins 10 %
      // de sa vitesse
      const shat = !!ctx.shatter, f = ctx.f || 1;
      const Vbl = vLimit(s, ctx.eff / f);
      let Vr = Math.max(ctx.mode === 'pen' ? 0.1 * V : 0, Math.sqrt(Math.max(0, V * V - Vbl * Vbl))) * (shat ? 0.5 : 1);
      out.Vbl = Vbl;
      const coreM = s.core ? s.m * s.core : s.m;
      const coreS = s.core ? Object.assign({}, s, { m: coreM, cal: s.cal * 0.45, k: s.k * 1.15 }) : s;
      if (T < s.cal * 1.3 && !s.core && !shat) {
        // découpe d'un bouchon de blindage : conservation de la quantité de mouvement
        const mp = STEEL * Math.PI * Math.pow(s.cal / 2000, 2) * (T / 1000) * 0.8;
        Vr = Vr * s.m / (s.m + mp);
        out.plug = { m: mp };
        frag(add(E0, mul(ctx.d, 0.03)), cone(ctx.d, 4 * D2R), Vr * 1.02, mp, 0, true);
      }
      out.Vr = Vr;
      const ratio = Vbl / Math.max(1, V);
      let nS = clamp(Math.round((8 + 0.3 * T) * Math.pow(s.cal / 75, 0.7) * (0.5 + ratio)), 6, 55);
      let half = 16 + 38 * ratio * ratio;
      if (s.core) { nS = Math.round(nS * 0.45); half *= 0.7; }
      if (shat) nS = Math.round(nS * 1.5);
      spray(add(E0, mul(ctx.d, 0.02)), ctx.d, nS, half, Math.max(120, Vr * 0.35), Math.max(200, Vr * 0.95), 0.002 + T * 0.00006, true, 0.01e-3);
      if (shat) {
        // l'obus non coiffé éclate en 3 à 5 gros morceaux ; le noyau de carbure, lui, part en poussière
        const n = s.core ? 0 : Math.round(rnd(3, 5));
        for (let i = 0; i < n; i++) frag(add(E0, mul(ctx.d, 0.03)), cone(ctx.d, 14 * D2R), Vr * rnd(0.6, 1), coreM * rnd(0.6, 1.2) / n, 0, true);
        out.Vr = Vr; out.coreStop = 'shattered';
        out.notes.push(s.core ? 'The tungsten carbide core shatters: no core follow-through' : `The shot shatters: ${n} large fragments, no intact core`);
      } else {
        // trajet du noyau, légèrement redressé vers la normale de la plaque
        let dir = norm(sub(ctx.d, mul(ctx.n, s.core ? -0.05 : 0.12))), p = add(E0, mul(dir, 0.02)), Vc = Vr, t = 0.02 / Math.max(50, Vr);
        out.core.push({ p: E0, t: 0, v: V }, { p, t, v: Vc });
        // la fusée de culot s'arme sur l'épaisseur réellement traversée (T / cos θ) ; environ 6 % de ratés :
        // l'obus agit alors en simple perforant ; délai de 1,1 à 1,5 ms
        const los = ctx.los || T, armed = !!s.filler && los >= s.sens, dud = armed && Math.random() < 0.06;
        const fuseT = armed && !dud ? rnd(1.1e-3, 1.5e-3) : null;
        if (dud) out.notes.push('Fuze failed: the round acts as solid shot');
        let exploded = false;
        const passed = new Set();
        const boom = (P, tt, d, v) => { exploded = true; explode(P, tt, d, v, s.filler, s.m - s.filler, 2.0, Math.round(20 + s.cal * 0.35)); };
        for (let it = 0; it < 12 && Vc > 30; it++) {
          const w = wallHit(p, dir);
          const hs = rayMods(p, dir, w.t).filter(h => !passed.has(h.m));
          const next = hs[0];
          const seg = next ? next.t0 : w.t;
          if (fuseT != null && t + seg / Vc >= fuseT) {
            const dl = (fuseT - t) * Vc;
            p = add(p, mul(dir, dl)); t = fuseT; out.core.push({ p, t, v: Vc });
            boom(p, t, dir, Vc);
            break;
          }
          if (next) {
            p = add(p, mul(dir, next.t0)); t += next.t0 / Vc; out.core.push({ p, t, v: Vc });
            passed.add(next.m);
            const k = next.m.kind, Ek = 0.5 * coreM * Vc * Vc / 1000;
            hit(next.m, k === 'crew' ? 400 : Math.min(420, 40 + Ek * 0.4), t);
            if (k === 'ammo' && Math.random() < 0.6) out.ignite.push({ m: next.m, t });
            if (k === 'fuel' && Math.random() < 0.3) out.fuel = Math.min(out.fuel == null ? 1e9 : out.fuel, t);
            const vl = vLimit(coreS, EQ[k]);
            if (Vc <= vl) { Vc = 0; out.coreStop = next.m.name; break; }
            Vc = Math.sqrt(Vc * Vc - vl * vl);
            const L = next.t1 - next.t0;
            p = add(p, mul(dir, L)); t += L / Vc; out.core.push({ p, t, v: Vc });
            continue;
          }
          // paroi opposée : ressort, ricoche ou s'y loge
          p = add(p, mul(dir, w.t)); t += w.t / Vc; out.core.push({ p, t, v: Vc });
          const c = clamp(dot(dir, w.w.n), 0.03, 1), ang = Math.acos(c) / D2R;
          const ef = effective(coreS, w.w.T, ang).eff;
          if (penVel(coreS, Vc) > ef) {
            const vl = vLimit(coreS, ef);
            Vc = Math.sqrt(Math.max(0, Vc * Vc - vl * vl));
            out.exit = { p, face: w.face, t, n: w.w.n };
            const q = add(p, mul(dir, 1.2)); out.core.push({ p: q, t: t + 1.2 / Math.max(50, Vc), v: Vc });
            out.coreStop = 'sorti';
            break;
          }
          if (ang > 58) { dir = norm(reflect(dir, w.w.n)); Vc *= 0.5; out.notes.push('Core ricochets off the wall'); continue; }
          Vc = 0; out.coreStop = 'paroi'; break;
        }
        // la fusée fonctionne aussi à l'arrêt brutal de l'obus
        if (fuseT != null && !exploded && out.coreStop !== 'sorti') boom(p, Math.min(fuseT, t + 0.2e-3), dir, Vc);
        if (s.filler && !armed) out.notes.push(`Fuze not armed (${Math.round(los)} mm line of sight < ${s.sens} mm)`);
      }
    }
    let tEnd = 0;
    for (const f of out.frags) tEnd = Math.max(tEnd, f.pts[f.pts.length - 1].t);
    for (const c of out.core) tEnd = Math.max(tEnd, c.t);
    if (out.blast) tEnd = Math.max(tEnd, out.blast.t + 3e-3);
    for (const h of out.hits.values()) tEnd = Math.max(tEnd, h.time);
    out.tEnd = clamp(tEnd + 1e-3, 2e-3, 25e-3);
    return out;
  }

  return { GUNS, shell, ATM, setAtmosphere, muzzle, cdMach, kDrag, velAt, tof, drop, descent, dropExp, tofExp, descentExp, penVel, penAt, vLimit, obliquity, effective, ricochetChance, shatterChance, SHATTER_PEN, standoffK, blastKPa, sedov, gurney, spin, simulate };
})();
