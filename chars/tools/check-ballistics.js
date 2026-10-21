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

console.log(failed ? `CHECK FAILED (${failed})` : 'CHECK PASSED');
process.exit(failed ? 1 : 0);
