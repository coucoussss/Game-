const { chromium } = require('playwright');
const shots = JSON.parse(process.argv[2]);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.setDefaultTimeout(240000);
  const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
  await page.goto('http://localhost:4173/?portrait');
  await page.waitForTimeout(4000);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(2500);
  for (const s of shots) {
    await page.evaluate((s) => { const p = window.__portrait; p.view = s.view; p.focus = s.focus ?? 0; p.pose = s.pose ?? 'idle';
      for (let i = 0; i < (s.frames ?? 12); i++) p.frame(s.dt ?? 0.08);
      const gl = p.renderer.getContext(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4)); }, s);
    await page.screenshot({ path: `shots/${s.name}.png` });
    console.log('ok', s.name);
  }
  console.log(logs.join('\n'));
  await browser.close();
})();
