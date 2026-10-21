'use strict';
// Tests de fumée du jeu dans Chromium (Playwright) : menu, boutique, batailles automatiques des trois modes.
// Usage : NODE_PATH=/opt/node-tools/node_modules node tools/smoke.js [--quick] [--3d] [--dir=chemin/vers/chars]
// Code de sortie 1 si une erreur JavaScript, une valeur NaN ou un blocage est détecté.
const { chromium } = require('playwright');
const path = require('path');
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const DIR = path.resolve(arg('dir') || path.join(__dirname, '..'));
const QUICK = process.argv.includes('--quick'), WITH3D = process.argv.includes('--3d');
const URL0 = 'file://' + path.join(DIR, 'index.html');
const OUT = arg('out') || null;
let failed = false;
const report = [];

async function page(b, qs, vp) {
  const p = await b.newPage({ viewport: vp || { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_FILE_NOT_FOUND|ERR_NAME_NOT_RESOLVED|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.route('**/crazygames-sdk-v3.js', r => r.abort());
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(URL0 + qs);
  return { p, errs };
}
function check(name, ok, info) {
  report.push({ name, ok, ...info });
  if (!ok) failed = true;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + ' ' + JSON.stringify(info));
}
const probe = () => {
  const bad = __fa.tanks.filter(t => ![t.x, t.y, t.angle, t.speed || 0].every(Number.isFinite)).length;
  return { st: __fa.state, t: Math.round(__fa.time), tt: __fa.time, alive: __fa.tanks.filter(t => !t.dead).map(t => t.team).join(''), bad, res: document.getElementById('result').classList.contains('on') ? document.getElementById('resTitle').textContent : '' };
};

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  // 1. menu, onglets, garage
  {
    const { p, errs } = await page(b, '?debug');
    await p.waitForFunction(() => window.__fa && document.getElementById('menu').classList.contains('on'), null, { timeout: 60000 }).catch(() => {});
    const menuOn = await p.evaluate(() => document.getElementById('menu').classList.contains('on'));
    for (const t of await p.$$eval('.tab', ts => ts.map(x => x.dataset.tab))) { await p.click(`.tab[data-tab="${t}"]`, { timeout: 90000 }); await p.waitForTimeout(400); }
    if (OUT) await p.screenshot({ path: path.join(OUT, 'smoke-menu.png') });
    check('menu', menuOn && !errs.length, { errs: errs.slice(0, 5) });
    // profils anciens ou abîmés : le menu doit toujours se construire
    const self = await p.evaluate(() => __fa.profileSelfTest()).catch(e => ({ err: String(e) }));
    check('profile', Object.values(self).every(v => v === 'ok'), self);
    await p.close();
  }
  // 2. batailles automatiques (rendu 2D pour la vitesse)
  const runs = [['campagne', 1], ['campagne', 3], ['survie', 2], ['duel', 1]];
  if (!QUICK) runs.push(['campagne', 2], ['campagne', 4], ['campagne', 5]);
  for (const [mode, level] of runs) {
    const { p, errs } = await page(b, `?2d&debug&auto&speed=8&level=${level}&mode=${mode}`, { width: 1000, height: 600 });
    const t0 = Date.now(); let info = null, last = -1, stall = 0;
    while (Date.now() - t0 < (QUICK ? 35000 : 60000)) {
      await p.waitForTimeout(3000);
      info = await p.evaluate(probe).catch(e => ({ err: String(e) }));
      if (info.err || info.res || info.bad) break;
      // blocage : le temps simulé n'avance plus du tout (une machine chargée ralentit sans bloquer)
      if (info.tt === last) stall++; else stall = 0;
      last = info.tt;
      if (stall >= 4) break;
    }
    check(`${mode}:${level}`, !!info && !info.err && !info.bad && stall < 4 && !errs.length, { info, stall, errs: errs.slice(0, 5) });
    await p.close();
  }
  // 3. rendu 3D (optionnel, lent sous swiftshader)
  if (WITH3D) {
    const { p, errs } = await page(b, '?debug&auto&speed=4&level=2');
    await p.waitForTimeout(25000);
    const info = await p.evaluate(probe).catch(e => ({ err: String(e) }));
    if (OUT) await p.screenshot({ path: path.join(OUT, 'smoke-3d.png') });
    check('3d', !info.err && !info.bad && !errs.length, { info, errs: errs.slice(0, 5) });
    await p.close();
  }
  await b.close();
  console.log(failed ? 'SMOKE FAILED' : 'SMOKE PASSED');
  process.exit(failed ? 1 : 0);
})();
