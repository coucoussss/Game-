// Banc d'essai : exécute scr_game.gml sous Node (GML -> JS) avec des fonctions GameMaker simulées.
// usage : node harness.js <scr_game.gml> <dossier datafiles> <scenario>
const fs = require('fs'), path = require('path');
const [, , gmlPath, dataDir, scenario = 'all', seedArg] = process.argv;
let src = fs.readFileSync(gmlPath, 'utf8');
// --- traduction GML -> JS ---
const macros = [];
src = src.replace(/^#macro\s+(\w+)\s+(.*)$/gm, (m, n, v) => { macros.push(n); return `var ${n} = ${v};`; });
src = src.replace(/\bmod\b/g, '%').replace(/\[\$\s*/g, '[').replace(/\bdiv\b/g, '/');
// do { } until (c)  ->  do { } while (!(c))
src = src.replace(/\}\s*until\s*\(([^;]*)\);/g, '} while (!($1));');
// --- générateur aléatoire reproductible ---
let seed = Number(seedArg || 12345);
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
// --- structs stricts : lire un champ absent lève une erreur, comme en GML ---
function strict(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o) || o.__strict) return o;
  return new Proxy(o, { get(t, k) { if (k === '__strict') return true; if (typeof k === 'string' && !(k in t)) throw new Error('GML: variable <struct>.' + k + ' lue avant d\'être définie'); return t[k]; } });
}
function deepStrict(o) { if (Array.isArray(o)) return o.map(deepStrict); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = deepStrict(o[k]); return strict(o); } return o; }
const keys = { down: new Set(), pressed: new Set() };
const files = {}; // système de fichiers simulé (sauvegarde)
const drawCalls = { n: 0 };
const G = {
  __strict: o => strict(o),
  pi: Math.PI, c_white: 0xffffff, c_black: 0, c_red: 0x0000ff, c_yellow: 0x00ffff, c_gray: 0x808080, c_grey: 0x808080, c_aqua: 0xffff00, c_lime: 0x00ff00, c_orange: 0x40a0ff, c_blue: 0xff0000, c_green: 0x008000, c_fuchsia: 0xff00ff, c_purple: 0x800080, c_dkgray: 0x404040, c_ltgray: 0xc0c0c0, c_silver: 0xc0c0c0,
  vk_up: 38, vk_down: 40, vk_left: 37, vk_right: 39, vk_enter: 13, vk_space: 32, vk_escape: 27, vk_backspace: 8, vk_shift: 16, vk_f4: 115, vk_f1: 112, vk_tab: 9, vk_anykey: 1, vk_control: 17,
  fa_left: 0, fa_center: 1, fa_right: 2, fa_top: 0, fa_middle: 1, fa_bottom: 2, bm_add: 1, bm_normal: 0, bm_subtract: 2,
  gamespeed_fps: 0, matrix_world: 2, os_browser: -1, browser_not_a_browser: -1, working_directory: dataDir + '/', buffer_string: 11, buffer_text: 13, buffer_grow: 1, buffer_seek_start: 0,
  get current_time() { return G.__ct; }, __ct: 0, delta_time: 16666,
  abs: Math.abs, sin: Math.sin, cos: Math.cos, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, round: Math.round, sign: Math.sign, exp: Math.exp,
  min: Math.min, max: Math.max, power: Math.pow, arctan2: Math.atan2, sqr: x => x * x, frac: x => x - Math.trunc(x),
  lerp: (a, b, k) => a + (b - a) * k, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  point_distance: (a, b, c, d) => Math.hypot(c - a, d - b), point_direction: (a, b, c, d) => Math.atan2(b - d, c - a) * 180 / Math.PI,
  radtodeg: r => r * 180 / Math.PI, degtorad: d => d * Math.PI / 180, dsin: d => Math.sin(d * Math.PI / 180), dcos: d => Math.cos(d * Math.PI / 180),
  random: n => rand() * n, random_range: (a, b) => a + rand() * (b - a), irandom: n => Math.floor(rand() * (n + 1)), irandom_range: (a, b) => a + Math.floor(rand() * (b - a + 1)),
  choose: (...a) => a[Math.floor(rand() * a.length)], randomize: () => 0,
  is_struct: o => o !== null && typeof o === 'object' && !Array.isArray(o), is_array: Array.isArray, is_string: s => typeof s === 'string', is_undefined: v => v === undefined,
  is_bool: v => typeof v === 'boolean', is_real: v => typeof v === 'number', is_numeric: v => typeof v === 'number' || typeof v === 'boolean',
  variable_struct_exists: (o, k) => { if (o === null || typeof o !== 'object') throw new Error('variable_struct_exists sur non-struct'); return k in o && k !== '__strict'; },
  variable_struct_get_names: o => Object.keys(o), variable_struct_get: (o, k) => o[k], variable_struct_set: (o, k, v) => { o[k] = v; },
  variable_struct_remove: (o, k) => { delete o[k]; },
  array_length: a => { if (!Array.isArray(a)) throw new Error('array_length sur non-tableau: ' + typeof a); return a.length; },
  array_create: (n, v) => new Array(n).fill(v), array_push: (a, ...v) => { if (!Array.isArray(a)) throw new Error('array_push sur non-tableau'); for (const x of v) a.push((x && typeof x === 'object' && !Array.isArray(x)) ? strict(x) : x); },
  array_delete: (a, i, n) => { a.splice(i, n); }, array_copy: (d, di, s, si, n) => { for (let i = 0; i < n; i++) d[di + i] = s[si + i]; },
  string: v => { if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2); if (v === undefined) throw new Error('string(undefined)'); return String(v); },
  string_length: s => { if (typeof s !== 'string') throw new Error('string_length sur non-chaîne: ' + s); return [...s].length; },
  string_char_at: (s, i) => [...s][i - 1] || '', string_copy: (s, i, n) => [...s].slice(i - 1, i - 1 + n).join(''), string_delete: (s, i, n) => { const a = [...s]; a.splice(i - 1, n); return a.join(''); },
  string_lower: s => s.toLowerCase(), string_upper: s => s.toUpperCase(), string_pos: (sub, s) => s.indexOf(sub) + 1, string_repeat: (s, n) => s.repeat(n),
  string_format: (v, t, d) => v.toFixed(d).padStart(t + (d ? d + 1 : 0), ' '), string_replace_all: (s, a, b) => s.split(a).join(b), real: s => Number(s), ord: s => s.toUpperCase().charCodeAt(0), chr: n => String.fromCharCode(n),
  string_width: s => [...String(s)].length * 8, string_height: s => 16, string_width_ext: (s, sep, w) => Math.min(w, [...s].length * 8),
  make_color_rgb: (r, g, b) => (r | 0) | ((g | 0) << 8) | ((b | 0) << 16), make_colour_rgb: (r, g, b) => (r | 0) | ((g | 0) << 8) | ((b | 0) << 16), make_color_hsv: (h, s, v) => (h | 0) | ((s | 0) << 8) | ((v | 0) << 16),
  merge_colour: (a, b, k) => a, merge_color: (a, b, k) => a,
  json_parse: s => deepStrict(JSON.parse(s)), json_stringify: o => JSON.stringify(o),
  file_exists: f => (f in files) || fs.existsSync(f),
  buffer_load: f => { if (!fs.existsSync(f)) throw new Error('buffer_load: fichier absent ' + f); return { s: fs.readFileSync(f, 'utf8') }; }, buffer_read: (b, t) => b.s, buffer_delete: () => 0,
  file_text_open_append: f => ({ f, mode: 'a' }), file_text_open_write: f => { files[f] = ''; return { f, mode: 'w' }; }, file_text_open_read: f => { if (!(f in files)) throw new Error('lecture fichier absent ' + f); return { f, mode: 'r', pos: 0 }; },
  file_text_write_string: (h, s) => { files[h.f] = (files[h.f] || '') + s; }, file_text_read_string: h => { const s = files[h.f]; h.pos = s.length; return s; }, file_text_eof: h => h.pos >= files[h.f].length, file_text_readln: h => '', file_text_writeln: h => 0, file_text_close: () => 0, file_delete: f => { delete files[f]; },
  keyboard_check: k => keys.down.has(k), keyboard_check_pressed: k => keys.pressed.has(k), keyboard_clear: () => 0,
  parameter_count: () => 0, parameter_string: () => '', show_debug_message: () => 0, game_end: () => { G.__ended = true; },
  exception_unhandled_handler: () => 0, game_set_speed: () => 0, window_set_caption: () => 0, window_set_size: () => 0, window_get_fullscreen: () => !!G.__fs, window_set_fullscreen: v => { G.__fs = v; },
  audio_create_stream: f => ({ snd: f }), audio_play_sound: (s, p, l) => { if (!s || !s.snd) throw new Error('audio_play_sound: son invalide'); return { inst: s.snd }; }, audio_stop_sound: () => 0, audio_master_gain: () => 0, audio_sound_gain: (i, g, t) => { if (typeof g !== 'number' || isNaN(g)) throw new Error('audio_sound_gain NaN'); }, audio_is_playing: () => true, audio_pause_sound: () => 0, audio_resume_sound: () => 0, audio_sound_pitch: () => 0,
  sprite_add: f => { if (!fs.existsSync(f)) throw new Error('sprite_add: absent ' + f); return { spr: f, w: 100, h: 150 }; }, sprite_exists: s => !!(s && s.spr), sprite_get_width: s => { if (!s || !s.spr) throw new Error('sprite invalide'); return s.w; }, sprite_get_height: s => { if (!s || !s.spr) throw new Error('sprite invalide'); return s.h; }, sprite_set_offset: () => 0,
  font_add: f => { if (!fs.existsSync(f)) throw new Error('font absente'); return { font: 1 }; },
  surface_exists: s => !!s && s !== -1, surface_create: () => ({ surf: 1 }), surface_set_target: () => 0, surface_reset_target: () => 0, surface_free: () => 0,
  matrix_build: () => [1], matrix_build_identity: () => [1], matrix_multiply: () => [1], matrix_set: () => 0, matrix_get: () => [1],
  screen_save: () => 0, draw_set_circle_precision: () => 0, gpu_set_blendmode: () => 0, gpu_set_fog: () => 0, display_get_width: () => 1920, display_get_height: () => 1080,
};
// fonctions de dessin : vérifient que les arguments numériques sont des nombres finis
for (const n of ['draw_circle', 'draw_clear', 'draw_clear_alpha', 'draw_ellipse', 'draw_line', 'draw_line_width', 'draw_rectangle', 'draw_rectangle_colour', 'draw_set_alpha', 'draw_set_colour', 'draw_set_color', 'draw_set_font', 'draw_set_halign', 'draw_set_valign', 'draw_sprite_ext', 'draw_sprite_part', 'draw_sprite_part_ext', 'draw_surface_part', 'draw_surface', 'draw_text', 'draw_text_ext', 'draw_triangle', 'draw_text_transformed', 'draw_sprite', 'draw_line_colour', 'draw_triangle_colour', 'draw_roundrect', 'draw_circle_colour', 'draw_text_colour', 'draw_line_width_colour'])
  G[n] = (...a) => { drawCalls.n++; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === undefined || (typeof v === 'number' && !isFinite(v))) throw new Error(n + ': argument ' + i + ' invalide (' + v + ')'); if ((n === 'draw_text' || n === 'draw_text_ext') && i === 2 && typeof v !== 'string') throw new Error(n + ': texte non-chaîne (' + v + ')'); }
    if (n.startsWith('draw_text') ) { const s = a[2]; for (const ch of s) { const c = ch.codePointAt(0); if (c !== 10 && (c < 32 || c > 382)) throw new Error('caractère hors police: "' + ch + '" (' + c + ') dans "' + s + '"'); } }
    if (n.startsWith('draw_sprite')) { if (!a[0] || !a[0].spr) throw new Error(n + ': sprite invalide'); } };
// fonctions appelées mais inconnues -> erreur explicite
const srcNC = src.replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
const called = new Set([...srcNC.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]));
const defined = new Set([...src.matchAll(/\bfunction\s+(\w+)/g)].map(m => m[1]));
const jsKw = new Set(['if', 'for', 'while', 'switch', 'function', 'return', 'do', 'catch', 'typeof']);
const unknown = [...called].filter(n => !defined.has(n) && !(n in G) && !jsKw.has(n) && !macros.includes(n));
if (unknown.length) { console.log('FONCTIONS INCONNUES DU BANC (à vérifier dans GML):', unknown.join(', ')); process.exit(2); }
const vm = require('vm');
const ctx = vm.createContext(G);
try { vm.runInContext(src, ctx, { filename: 'scr_game.js' }); } catch (e) { console.log('ERREUR DE SYNTAXE/CHARGEMENT:', e.stack.split('\n').slice(0, 6).join('\n')); process.exit(1); }
const R = code => vm.runInContext(code, ctx);
function frame(pressed = [], down = []) {
  keys.pressed = new Set(pressed); keys.down = new Set([...down, ...pressed]); G.__ct += 16;
  R('game_step()'); R('game_draw()');
  R('for (var __n of ["fight","P","box","dlg","OPT","MR","banner"]) { if (typeof globalThis[__n] === "object" && globalThis[__n]) globalThis[__n] = __strict(globalThis[__n]); } if (typeof fight === "object" && fight) { if (fight.pat) fight.pat = __strict(fight.pat); if ("tr" in fight && fight.tr) fight.tr = __strict(fight.tr); }');
}
const K = { up: 38, down: 40, left: 37, right: 39, ok: 90, back: 88, esc: 27, p: 80 };
module.exports = { R, frame, K, G, files, rand, strict, drawCalls };
if (require.main === module) {
  const sc = require('./scenarios.js');
  sc.run(module.exports, scenario);
}
