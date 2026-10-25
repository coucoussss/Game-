'use strict';
// Vérifications numériques de ballistics.js (sans navigateur) : lois d'obliquité, balistique
// extérieure, perforation. Usage : node tools/check-ballistics.js ; code de sortie 1 en cas d'échec.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ballistics.js'), 'utf8') + '\nthis.Ballistics = Ballistics;', ctx);
const B = ctx.Ballistics;
let failed = 0;
function check(name, ok, info) {
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  if (!ok) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r2 = v => Math.round(v * 100) / 100;

// ---------- Obliquité ----------
{
  let mono = true;
  for (const key of ['APHE', 'AP', 'APCR']) {
    for (const td of [0.25, 0.4, 0.5, 0.8, 1.0, 1.2, 1.5]) {
      let prev = 0;
      for (let a = 0; a <= 85; a += 2.5) { const m = B.obliquity(key, td, a); if (m < prev - 1e-9) mono = false; prev = m; }
    }
    for (let a = 0; a <= 85; a += 5) {
      let prev = 0;
      for (const td of [0.25, 0.4, 0.5, 0.8, 1.0, 1.2, 1.5]) { const m = B.obliquity(key, td, a); if (m < prev - 1e-9) mono = false; prev = m; }
    }
  }
  check('obliquity grows with angle and T/d', mono);
  check('APCBC T/d 1.0 at 55° ≈ 2.1', near(B.obliquity('APHE', 1.0, 55), 2.1, 0.02), r2(B.obliquity('APHE', 1.0, 55)));
  check('at 60°: APCR > uncapped AP > APCBC', B.obliquity('APCR', 1, 60) > B.obliquity('AP', 1, 60) && B.obliquity('AP', 1, 60) > B.obliquity('APHE', 1, 60));
  const pz4 = B.shell('pz4', 'APHE');
  const gl = B.effective(pz4, 80, 55).eff;
  check('Panther glacis 80@55 vs 75 mm APCBC ≈ 171 mm', near(gl, 171, 3), Math.round(gl));
  const kt = B.effective(B.shell('kingtiger', 'APHE'), 150, 50).eff;
  check('King Tiger glacis 150@50 vs 88 mm APCBC ≈ 297 mm', near(kt, 297, 4), Math.round(kt));
  const old = (T, ang, s) => T / Math.pow(Math.cos(Math.max(0, ang - s.norm) * Math.PI / 180), Math.min(1.45, 1 + 0.3 * Math.min(1.5, T / s.cal)));
  check('vertical plates unchanged', near(B.effective(pz4, 80, 0).eff, 80, 0.01) && Math.abs(B.effective(pz4, 80, 5).eff / old(80, 5, pz4) - 1) < 0.03);
}

// ---------- Balistique extérieure : tables de tir et calculateur de pointage ----------
{
  const G = 9.81;
  // trajectoire telle que la simule le jeu (updateShells) : pas fixe de 1/60 s, hauteur au trapèze,
  // pesanteur évaluée à la vitesse de mi-pas
  function fly(s, slope0, z0, X, dt = 1 / 60) {
    let x = 0, z = z0, sl = slope0;
    for (let i = 0; i < 100000; i++) {
      const v0 = B.velAt(s, x), dX = v0 * dt, v = v0 * Math.exp(-0.5 * B.kDrag(s, v0) * dX), gk = G / (v * v);
      if (x + dX >= X) { const d = X - x; return z + sl * d - 0.5 * gk * d * d; }
      z += sl * dX - 0.5 * gk * dX * dX; sl -= gk * dX; x += dX;
    }
    return NaN;
  }
  const aim = (s, X, z0, zt) => (zt - z0) / X + B.drop(s, X) / X;
  let worst1 = 0, worst2 = 0;
  for (const id of Object.keys(B.GUNS)) for (const key of ['AP', 'APHE', 'APCR', 'HEAT', 'HE', 'SMOKE'].filter(k => B.has(id, k))) {
    const s = B.shell(id, key);
    worst1 = Math.max(worst1, Math.abs(fly(s, aim(s, 1000, 2, 1.7), 2, 1000) - 1.7));
    worst2 = Math.max(worst2, Math.abs(fly(s, aim(s, 2000, 2, 1.7), 2, 2000) - 1.7));
  }
  check('gun-laying error ≤ 0.07 m at 1000 m', worst1 <= 0.07, r2(worst1));
  check('gun-laying error ≤ 0.36 m at 2000 m', worst2 <= 0.36, r2(worst2));
  let smk = 0;
  for (const id of Object.keys(B.GUNS).filter(i => B.has(i, 'SMOKE'))) for (const X of [300, 500, 800]) { const s = B.shell(id, 'SMOKE'); smk = Math.max(smk, Math.abs(fly(s, aim(s, X, 2, 0), 2, X))); }
  check('smoke rounds land within ±0.3 m at 300-800 m', smk <= 0.3, r2(smk));
  // table de tir contre les formules exactes du modèle exponentiel (Cd constant au-delà de Mach 2,5)
  const s = B.shell('kingtiger', 'APHE'), k = B.kDrag(s, s.v0), X = 600;
  check('table drop matches the exponential law above Mach 2.5', B.velAt(s, X) > 2.5 * 340 && near(B.drop(s, X), B.dropExp(s.v0, k, X), 0.005) && near(B.tof(s, X), B.tofExp(s.v0, k, X), 1e-4) && near(B.descent(s, X), B.descentExp(s.v0, k, X), 1e-5), [B.drop(s, X), B.dropExp(s.v0, k, X)]);
}

// ---------- Atmosphère, Mach, vent ----------
{
  const s = B.shell('medium', 'APHE'), h = B.shell('pz4', 'HEAT');
  const drift = (sh, X, W) => W * (B.tof(sh, X) - X / B.muzzle(sh));
  check('crosswind 5 m/s: KwK 42 APCBC drifts ≈ 0.35 m at 1000 m', near(drift(s, 1000, 5), 0.35, 0.05), r2(drift(s, 1000, 5)));
  check('crosswind 5 m/s: L/48 HEAT drifts 1.3-1.8 m at 1000 m (Mach drag)', near(drift(h, 1000, 5), 1.55, 0.25), r2(drift(h, 1000, 5)));
  check('Cd peaks just above Mach 1', B.cdMach(1.2) > B.cdMach(2) && B.cdMach(2) > B.cdMach(3) && B.cdMach(0.8) < B.cdMach(1.5));
  const p15 = B.penAt('heavy', 'APHE', 500);
  B.setAtmosphere(-10, 1.34);
  const pCold = B.penAt('heavy', 'APHE', 500), v0Cold = B.velAt(s, 0);
  B.setAtmosphere(15, 1.225);
  check('Bastogne (−10 °C): −2.5 % muzzle velocity, ≈ −3.5 % penetration', near(v0Cold / s.v0, 0.975, 0.001) && near(pCold / p15, 0.965, 0.01), [r2(v0Cold / s.v0), r2(pCold / p15)]);
}

// ---------- Calage des APCR sur les tables allemandes à 30° ----------
{
  const hist = {
    kingtiger: [[100, 237], [500, 217], [1000, 193], [1500, 170], [2000, 153]],
    destroyer: [[100, 237], [500, 217], [1000, 193], [1500, 170], [2000, 153]],
    heavy: [[100, 171], [500, 156], [1000, 138], [1500, 123], [2000, 110]],
    medium: [[100, 194], [500, 174], [1000, 149], [1500, 127], [2000, 106]],
    pz4: [[100, 126], [500, 108], [1000, 87], [1500, 69]],
    light: [[100, 130], [500, 72], [1000, 38]],
  };
  // épaisseur d'une plaque à 30° tout juste perforée
  const plate30 = (s, x) => { const p = B.penVel(s, B.velAt(s, x)); let lo = 1, hi = 600; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (m * B.obliquity('APCR', m / s.cal, 30) > p) hi = m; else lo = m; } return lo; };
  let worst = 0;
  for (const [id, rows] of Object.entries(hist)) for (const [x, T] of rows) worst = Math.max(worst, Math.abs(plate30(B.shell(id, 'APCR'), x) / T - 1));
  check('APCR within 4 % of the German 30° tables', worst < 0.04, r2(worst * 100) + ' %');
  check('KwK 42 trial HEAT derated by spin (80 mm)', near(B.penVel(B.shell('medium', 'HEAT'), 450), 80, 1));
}

// ---------- Bris des obus ----------
{
  const ap = B.shell('medium', 'AP'), cr = B.shell('pz4', 'APCR'), aphe = B.shell('heavy', 'APHE');
  check('uncapped AP: no shatter below 780 m/s', B.shatterChance(ap, 80, 30, 770) === 0);
  check('uncapped AP shatters on thick plates at high velocity (capped at 70 %)', B.shatterChance(ap, 100, 45, 1100) === 0.7 && B.shatterChance(ap, 30, 45, 1100) === 0);
  check('APCR shatters on sloped plates (T-34 glacis 45@60)', B.shatterChance(cr, 45, 60, 900) >= 0.9 && B.shatterChance(cr, 45, 20, 900) === 0);
  check('APCBC rarely shatters', B.shatterChance(aphe, 100, 60, 800) === 0.03);
  // simulation derrière la plaque : un AP brisé n'a pas de noyau intact
  const inner = { x0: -2, x1: 2, y0: -1.5, y1: 1.5, z0: 0.4, z1: 2.2 };
  const ctx = { mods: [], piv: [0, 0], tAng: 0, inner, wall: () => ({ T: 30, n: [1, 0, 0] }), E: [2, 0, 1.2], d: [-1, 0, 0], n: [1, 0, 0], s: ap, V: 900, T: 40, eff: 45, mode: 'pen', shatter: true };
  const sim = B.simulate(ctx);
  check('shattered AP: fragments but no core path', sim.coreStop === 'shattered' && sim.core.length === 0 && sim.frags.length > 10 && !sim.plug);
}

// ---------- Limite balistique, fusée et explosif ----------
{
  const inner = { x0: -2, x1: 2, y0: -1.5, y1: 1.5, z0: 0.4, z1: 2.2 };
  const base = s => ({ mods: [], piv: [0, 0], tAng: 0, inner, wall: () => ({ T: 30, n: [1, 0, 0] }), E: [2, 0, 1.2], d: [-1, 0, 0], n: [1, 0, 0], s, V: 700, mode: 'pen' });
  const aphe = B.shell('pz4', 'APHE'), raw = B.penVel(aphe, 700);
  // perforation obtenue grâce à l'aléa et aux améliorations (pén. brute = 0,9 × épaisseur effective)
  const sim = B.simulate(Object.assign(base(aphe), { T: raw * 0.6, eff: raw / 0.9, f: 1.15 }));
  check('boosted penetration keeps a residual velocity (limit uses pen / de Marre)', sim.Vbl < 700 && sim.Vr >= 70, [Math.round(sim.Vbl), Math.round(sim.Vr)]);
  let blasts = 0, duds = 0, raws = new Set(), delays = [];
  for (let i = 0; i < 400; i++) {
    const r = B.simulate(Object.assign(base(aphe), { T: 10, los: 10 / Math.cos(70 * Math.PI / 180), eff: 20, f: 1 }));
    if (r.blast) { blasts++; raws.add(r.blast.W / r.blast.raw); delays.push(r.blast.t); }
    if (r.notes.some(n => /Fuze failed/.test(n))) duds++;
  }
  check('fuze arms on line-of-sight thickness (10 mm at 70°)', blasts > 300, blasts);
  check('about 6 % of APHE fuzes fail', duds > 8 && duds < 45, duds);
  check('APHE filler counted at RE 1.5 (no extra ×1.3)', raws.size === 1 && near([...raws][0], 1.5, 1e-9));
  const v = B.simulate(Object.assign(base(aphe), { T: 12, los: 12, eff: 20, f: 1 }));
  check('vertical 12 mm plate does not arm the fuze', !v.blast && v.notes.some(n => /not armed/.test(n)));
  const he = B.shell('heavy', 'HE'), rh = B.simulate(Object.assign(base(he), { T: 10, eff: 10 }));
  check('HE filler counted at RE 1.0', rh.blast && near(rh.blast.W, he.filler, 1e-9));
}

// ---------- Charge creuse ----------
{
  check('standoff: Pz IV skirt (0.6 m = 8 calibres) leaves 65 % of a 75 mm jet', near(B.standoffK(0.6, 75), 0.65, 0.005) && B.standoffK(0.1, 75) === 1 && B.standoffK(3, 75) === 0.45);
  // le jet dépense son reste de perforation dans les modules : moteur (45 mm) puis transmission (38 mm)
  const mods = [
    { kind: 'engine', frame: 'hull', min: [-1, -0.5, 0.6], max: [0, 0.5, 1.6], name: 'Engine' },
    { kind: 'trans', frame: 'hull', min: [-2, -0.5, 0.6], max: [-1.2, 0.5, 1.6], name: 'Transmission' },
  ];
  const inner = { x0: -2.5, x1: 2, y0: -1.5, y1: 1.5, z0: 0.4, z1: 2.2 };
  const heat = B.shell('pz4', 'HEAT');
  const run = pen => B.simulate({ mods, piv: [0, 0], tAng: 0, inner, wall: () => ({ T: 30, n: [1, 0, 0] }), E: [0.4, 0, 1.1], d: [-1, 0, 0], n: [1, 0, 0], s: heat, V: 400, T: 30, eff: 30, pen, mode: 'pen' });
  const weak = run(50), strong = run(130);
  const dmg = (r, m) => (r.hits.get(m) || { dmg: 0 }).dmg;
  check('a weak jet stops in the engine block', dmg(weak, mods[0]) > 0 && dmg(weak, mods[1]) === 0 && weak.jet.b[0] > -1, [Math.round(dmg(weak, mods[0])), weak.jet.b[0]]);
  check('a strong jet reaches the transmission', dmg(strong, mods[1]) > 0);
}

console.log(failed ? `CHECK FAILED (${failed})` : 'CHECK PASSED');
process.exit(failed ? 1 : 0);
