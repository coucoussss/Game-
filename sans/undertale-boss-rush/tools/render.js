// Rendu d'images à partir du moteur réel : exécute scr_game.gml sous Node (comme harness.js),
// enregistre les appels de dessin d'une image, puis les rejoue dans un canvas Chromium (Playwright).
// usage : node render.js <scr_game.gml> <dossier datafiles> <dossier de sortie>
// Ce n'est pas GameMaker : seules les fonctions de dessin utilisées par le jeu sont reproduites.
const fs = require('fs'), path = require('path');
const outDir = process.argv[4] || '/tmp/render-out';
fs.mkdirSync(outDir, { recursive: true });
const dataDir = path.resolve(process.argv[3] || 'datafiles');
// le banc lit ses arguments dans process.argv : on les laisse tels quels
const H = require('./harness.js');
const { R, frame, K, G } = H;

// ---------- état de dessin suivi pour chaque appel ----------
const S = { c: 0xffffff, a: 1, bm: 0, m: [1, 0, 0, 1, 0, 0], t: 0, ha: 0, va: 0, fs: 12, fog: false, fogc: 0xffffff };
let rec = null, surfId = 0;
const ident = () => [1, 0, 0, 1, 0, 0];
// matrice affine 2D [a b c d e f] : x' = a x + c y + e ; y' = b x + d y + f
function mul(A, B) { // appliquer A puis B
  return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
    A[4] * B[0] + A[5] * B[2] + B[4], A[4] * B[1] + A[5] * B[3] + B[5]];
}
G.matrix_build = (x, y, z, rx, ry, rz, sx, sy) => {
  const r = -(rz || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { m: mul([sx, 0, 0, sy, 0, 0], mul([c, s, -s, c, 0, 0], [1, 0, 0, 1, x, y])) };
};
G.matrix_build_identity = () => ({ m: ident() });
G.matrix_multiply = (A, B) => ({ m: mul(A.m, B.m) });
G.matrix_set = (w, M) => { S.m = M.m.slice(); };
G.matrix_get = () => ({ m: S.m.slice() });
G.gpu_set_blendmode = b => { S.bm = b; };
G.gpu_set_fog = (on, c) => { S.fog = !!on; S.fogc = c; };
G.draw_set_colour = G.draw_set_color = c => { S.c = c; };
G.draw_set_alpha = a => { S.a = a; };
G.draw_set_halign = v => { S.ha = v; };
G.draw_set_valign = v => { S.va = v; };
G.draw_set_font = f => { if (f && f.size) S.fs = f.size; };
G.font_add = (f, size) => ({ font: 1, size });
G.surface_create = () => ({ surf: ++surfId });
G.surface_set_target = s => { S.t = s.surf; };
G.surface_reset_target = () => { S.t = 0; };
function pngSize(f) { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
G.sprite_add = f => { if (!fs.existsSync(f)) throw new Error('sprite absent ' + f); const d = pngSize(f); return { spr: path.relative(dataDir, f), w: d.w, h: d.h, ox: 0, oy: 0 }; };
G.sprite_get_width = s => s.w; G.sprite_get_height = s => s.h;
G.sprite_set_offset = (s, x, y) => { s.ox = x; s.oy = y; };

const OPS = ['draw_rectangle', 'draw_rectangle_colour', 'draw_circle', 'draw_ellipse', 'draw_line', 'draw_line_width', 'draw_triangle',
  'draw_text', 'draw_text_ext', 'draw_sprite_ext', 'draw_sprite_part', 'draw_surface_part', 'draw_clear', 'draw_clear_alpha'];
for (const n of OPS) {
  const orig = G[n];
  G[n] = (...a) => {
    if (orig) orig(...a);
    if (!rec) return;
    const args = a.map(v => (v && typeof v === 'object') ? (v.spr !== undefined ? { spr: v.spr, w: v.w, h: v.h, ox: v.ox, oy: v.oy } : { surf: v.surf }) : v);
    rec.push({ n, a: args, c: S.c, al: S.a, bm: S.bm, m: S.m.slice(), t: S.t, ha: S.ha, va: S.va, fs: S.fs, fog: S.fog, fogc: S.fogc });
  };
}

// ---------- pilotage du jeu ----------
const captures = [];
function snap(name, fn) { rec = []; S.m = ident(); S.bm = 0; S.t = 0; fn(); captures.push({ name, ops: rec }); rec = null; }
const dirs = [K.up, K.down, K.left, K.right];
let dir = [];
function play(n, opts = {}) {
  for (let i = 0; i < n; i++) {
    if (i % 14 === 0) dir = H.rand() < .25 ? [] : [dirs[Math.floor(H.rand() * 4)]];
    const pr = [];
    if (i % 3 === 0) pr.push(K.ok);
    if (R('scene == "fight" && fight.state == "menu"') && i % 3 === 0) R('fight.menuSel = 0');
    R('if (scene == "fight") { P.hp = P.max; P.kr = 0; }');
    frame(pr, dir);
    if (opts.until && R(opts.until)) return i;
  }
  return n;
}
function grab(name) { snap(name, () => frame([], [])); }

R('game_create()'); frame();
grab('01-titre');
frame([K.ok]); for (let i = 0; i < 20; i++) frame();
grab('02-selection-des-boss');

// Combat : après le démarrage, avance jusqu'à l'attaque et capture plusieurs moments
function fightShots(i, ph, label, shots, step) {
  R(`rushStart(${i}, ${ph})`);
  let found = 0, spent = 0;
  while (found < shots && spent < 60000) {
    const k = play(step || 220);
    spent += k;
    if (R('scene') !== 'fight') break;
    if (R('fight.state') === 'enemy') { grab(`${label}-${String(++found).padStart(2, '0')}`); }
  }
  while (R('scene') !== 'select' && R('scene') !== 'title') { for (let k = 0; k < 600 && R('scene') === 'fight'; k++) { R('P.hp = P.max'); frame(k % 3 === 0 ? [K.ok] : []); } frame([K.back]); frame([K.ok]); if (++spent > 90000) break; }
}
const want = (process.env.FIGHTS || 'INK:0,INK:1,DUSTTRUST:2,DUST:0,LAST BREATH:0').split(',');
for (const w of want) {
  const [nm, ph] = w.split(':'); const idx = R(`(function(){ for (var i=0;i<array_length(bosses);i++) if (bosses[i].short == "${nm}") return i; return -1; })()`);
  if (idx < 0) { console.log('boss inconnu', nm); continue; }
  fightShots(idx, Number(ph), `${nm.toLowerCase().replace(/ /g, '-')}-phase${Number(ph) + 1}`, Number(process.env.SHOTS || 5), Number(process.env.STEP || 260));
}
fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(captures));
console.log('captures enregistrées:', captures.length);
