const { chromium } = require('playwright');
const views = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(180000);
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:4173/?debug' + (process.argv[3] || ''));
  await page.waitForTimeout(3000);
  // On coupe la boucle : chaque image sera rendue à la demande.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(2500);
  const frame = (n, dt) => page.evaluate(([n, dt]) => { const g = window.__heist; for (let i = 0; i < n; i++) g.frame(dt); const gl = g.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }, [n, dt]);
  await frame(1, 0.016);
  await page.screenshot({ path: 'shots/00-title.png' });
  await page.evaluate(() => document.querySelector('[data-action=new]').click());
  for (const v of views) {
    await page.evaluate((v) => {
      const g = window.__heist; const w = g.world;
      if (v.hour !== undefined) {
        w.clock.seconds = Math.floor(w.clock.seconds / 86400) * 86400 + 86400 + v.hour * 3600;
        w.lastResetDay = w.clock.day; w.settleEveryone(); w.refreshDoors();
      }
      if (v.give) for (const id of v.give) w.inventory.add(id);
      if (v.held !== undefined) w.inventory.held = v.held;
      w.player.pos = { x: v.x, z: v.z };
      g.input.facing = v.f; g.input.pitch = v.p ?? 0;
      if (v.eval) (new Function('g', 'w', v.eval))(g, w);
      if (g.hud.overlay) g.hud.show(null);
    }, v);
    await frame(v.frames ?? 3, v.dt ?? 0.05);
    if (v.overlay) await page.evaluate((o) => window.__heist.hud.show(o), v.overlay);
    if (v.after) await page.evaluate((code) => (new Function('g', 'w', code))(window.__heist, window.__heist.world), v.after);
    await frame(1, 0.016);
    const dbg = await page.evaluate(() => { const g = window.__heist; const c = g.actors.car.root; const v = new (c.position.constructor)(); c.getWorldPosition(v); return { car: v.toArray(), cam: g.camera.position.toArray(), rot: g.camera.rotation.toArray().slice(0,3), visible: c.visible, parent: !!c.parent, inScene: (() => { let p = c; while (p.parent) p = p.parent; return p === g.scene; })() }; });
    console.log(JSON.stringify(dbg));
    await page.screenshot({ path: `shots/${v.name}.png` });
    console.log('ok', v.name, new Date().toISOString().slice(11,19));
  }
  console.log(logs.slice(0, 15).join('\n'));
  await browser.close();
})();
