// Rejoue frames.json (produit par render.js) dans un canvas Chromium et enregistre des PNG.
// usage : node render-page.js <dossier de sortie> <dossier datafiles>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const outDir = process.argv[2], dataDir = path.resolve(process.argv[3]);
const frames = JSON.parse(fs.readFileSync(path.join(outDir, 'frames.json'), 'utf8'));
const fontB64 = fs.readFileSync(path.join(dataDir, 'font.ttf')).toString('base64');
const sprites = {};
for (const f of frames) for (const o of f.ops) for (const v of o.a) if (v && v.spr && !sprites[v.spr]) sprites[v.spr] = 'data:image/png;base64,' + fs.readFileSync(path.join(dataDir, v.spr)).toString('base64');

const PAGE = `
const W = 640, H = 480;
const hex = c => '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map(v => v.toString(16).padStart(2, '0')).join('');
const imgs = {};
const tintCache = {};
function tinted(spr, col, fog) {
  const k = spr + '|' + col + '|' + fog;
  if (tintCache[k]) return tintCache[k];
  const im = imgs[spr], c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  if (fog) { x.globalCompositeOperation = 'source-in'; x.fillStyle = hex(col); x.fillRect(0, 0, c.width, c.height); }
  else if (col !== 0xffffff) { x.globalCompositeOperation = 'multiply'; x.fillStyle = hex(col); x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0); }
  tintCache[k] = c; return c;
}
function wrap(ctx, s, sep, w) {
  const out = []; for (const para of s.split('\\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (w > 0 && ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } out.push(line); } return out;
}
function render(ops) {
  const main = document.createElement('canvas'); main.width = W; main.height = H;
  const surfs = {}; const get = id => { if (!id) return main; if (!surfs[id]) { surfs[id] = document.createElement('canvas'); surfs[id].width = W; surfs[id].height = H; } return surfs[id]; };
  for (const o of ops) {
    const cv = get(o.t), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.setTransform(...o.m); ctx.globalAlpha = Math.max(0, Math.min(1, o.al)); ctx.globalCompositeOperation = o.bm === 1 ? 'lighter' : 'source-over';
    const a = o.a, col = hex(o.c); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1;
    switch (o.n) {
      case 'draw_clear': ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = hex(a[0]); ctx.fillRect(0, 0, W, H); break;
      case 'draw_clear_alpha': ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); if (a[1] > 0) { ctx.globalAlpha = a[1]; ctx.fillStyle = hex(a[0]); ctx.fillRect(0, 0, W, H); } break;
      case 'draw_rectangle': a[4] ? ctx.strokeRect(Math.min(a[0], a[2]) + .5, Math.min(a[1], a[3]) + .5, Math.abs(a[2] - a[0]), Math.abs(a[3] - a[1])) : ctx.fillRect(Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.abs(a[2] - a[0]) + 1, Math.abs(a[3] - a[1]) + 1); break;
      case 'draw_rectangle_colour': { const g = ctx.createLinearGradient(0, a[1], 0, a[3]); g.addColorStop(0, hex(a[4])); g.addColorStop(1, hex(a[6])); ctx.fillStyle = g; ctx.strokeStyle = g; a[8] ? ctx.strokeRect(a[0] + .5, a[1] + .5, a[2] - a[0], a[3] - a[1]) : ctx.fillRect(a[0], a[1], a[2] - a[0] + 1, a[3] - a[1] + 1); break; }
      case 'draw_circle': ctx.beginPath(); ctx.arc(a[0], a[1], Math.max(0, a[2]), 0, 7); a[3] ? ctx.stroke() : ctx.fill(); break;
      case 'draw_ellipse': ctx.beginPath(); ctx.ellipse((a[0] + a[2]) / 2, (a[1] + a[3]) / 2, Math.abs(a[2] - a[0]) / 2, Math.abs(a[3] - a[1]) / 2, 0, 0, 7); a[4] ? ctx.stroke() : ctx.fill(); break;
      case 'draw_line': ctx.beginPath(); ctx.moveTo(a[0] + .5, a[1] + .5); ctx.lineTo(a[2] + .5, a[3] + .5); ctx.stroke(); break;
      case 'draw_line_width': ctx.lineWidth = Math.max(1, a[4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke(); break;
      case 'draw_triangle': ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.lineTo(a[4], a[5]); ctx.closePath(); a[6] ? ctx.stroke() : ctx.fill(); break;
      case 'draw_sprite_ext': { const sp = a[0], x = a[2], y = a[3], xs = a[4], ys = a[5], rot = a[6], c = a[7], al = a[8];
        const im = tinted(sp.spr, o.fog ? o.fogc : c, o.fog); ctx.globalAlpha = Math.max(0, Math.min(1, al)); ctx.translate(x, y); ctx.rotate(-rot * Math.PI / 180); ctx.scale(xs, ys); ctx.drawImage(im, -sp.ox, -sp.oy); break; }
      case 'draw_sprite_part': { const sp = a[0]; ctx.drawImage(tinted(sp.spr, 0xffffff, false), a[2], a[3], a[4], a[5], a[6], a[7], a[4], a[5]); break; }
      case 'draw_surface_part': ctx.drawImage(get(a[0].surf), a[1], a[2], a[3], a[4], a[5], a[6], a[3], a[4]); break;
      case 'draw_text': case 'draw_text_ext': {
        const s = String(a[2]); ctx.font = (o.fs * 1.333).toFixed(1) + 'px GMfont'; ctx.textBaseline = 'top';
        const sep = o.n === 'draw_text_ext' ? a[3] : o.fs * 1.5, wid = o.n === 'draw_text_ext' ? a[4] : 0;
        const lines = wrap(ctx, s, sep, wid), total = lines.length * sep;
        let y = a[1] - (o.va === 1 ? total / 2 : o.va === 2 ? total : 0);
        for (const ln of lines) { const w = ctx.measureText(ln).width; const x = a[0] - (o.ha === 1 ? w / 2 : o.ha === 2 ? w : 0); ctx.fillText(ln, x, y); y += sep; }
        break; }
    }
  }
  const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2; const x = out.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(main, 0, 0, W * 2, H * 2);
  return out.toDataURL('image/png');
}
window.loadAll = async (fontB64, spr) => {
  const ff = new FontFace('GMfont', 'url(data:font/ttf;base64,' + fontB64 + ')'); await ff.load(); document.fonts.add(ff);
  await Promise.all(Object.keys(spr).map(k => new Promise(res => { const i = new Image(); i.onload = res; i.onerror = res; i.src = spr[k]; imgs[k] = i; })));
};
window.renderOps = render;
`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<html><body style="margin:0;background:#000"></body></html>');
  await p.addScriptTag({ content: PAGE });
  await p.evaluate(([f, s]) => window.loadAll(f, s), [fontB64, sprites]);
  let n = 0;
  for (const f of frames) {
    const url = await p.evaluate(o => window.renderOps(o), f.ops);
    fs.writeFileSync(path.join(outDir, f.name + '.png'), Buffer.from(url.split(',')[1], 'base64')); n++;
  }
  console.log('images:', n, 'erreurs page:', errs.length ? errs : 'aucune');
  await b.close();
})();
