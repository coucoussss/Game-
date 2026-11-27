const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto('http://localhost:4173/?debug');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const g = window.__heist;
    const t0 = performance.now();
    document.querySelector('[data-action=new]').click();
    g.world.clock.seconds = 86400 + 12 * 3600; g.world.lastResetDay = 2; g.world.settleEveryone();
    g.frame(0.016);
    const t1 = performance.now();
    g.frame(0.016);
    const t2 = performance.now();
    let skinned = 0, tris = 0;
    g.scene.traverse((o) => { if (o.isSkinnedMesh) { skinned++; tris += o.geometry.index.count / 3; } });
    return { firstFrameMs: Math.round(t1 - t0), nextFrameMs: Math.round(t2 - t1), bodies: g.actors.bodies.size, skinned, trisK: Math.round(tris / 1000), calls: g.renderer.info.render.calls, heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6) };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
