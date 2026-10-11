'use strict';
// ============================================================
//  sprites.js : projectiles et sprites de combat des monstres
//  (dessinés pixel par pixel dans le style blanc-sur-noir d'origine)
// ============================================================
function art(w, h, fn) { const p = new Pix(w, h); fn(p); return p.canvas(); }
// Forme remplie de noir, cernée de blanc (style des sprites de combat)
function ink(w, h, fill, detail, o = {}) {
  const p = new Pix(w, h); fill(p);
  p.edge(o.line || 'W');
  if (detail) detail(p);
  return o.pix ? p : p.canvas();
}
function blank(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// Sprite animé : build() renvoie une fonction (g, t, E) qui dessine les parties
const SPRM = {};
function defSprite(id, w, h, build) {
  let draw = null; const buf = blank(w, h), g = buf.getContext('2d');
  SPRM[id] = (t, E) => {
    if (!draw) draw = build();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
    draw(g, t, E || { st: {} });
    return buf;
  };
}
const bob = (t, sp = 2.5, a = 1) => Math.round(Math.sin(t * sp) * a);
function put(g, img, x, y) { g.drawImage(img, Math.round(x), Math.round(y)); }

// ---------- Projectiles ----------
const SHAPES = {};
const SHAPE_DEF = {
  pellet: () => art(8, 8, p => p.map(['...WW...', '..WWWW..', '.WWWWWW.', 'WWWWWWWW', 'WWWWWWWW', '.WWWWWW.', '..WWWW..', '...WW...'])),
  seed: () => art(6, 10, p => p.map(['..WW..', '.WWWW.', '.WWWW.', 'WWWWWW', 'WWWWWW', 'WWWWWW', '.WWWW.', '.WWWW.', '..WW..', '..WW..'])),
  fly: () => art(9, 7, p => p.map(['W.W...W.W', '.WWW.WWW.', '..WWWWW..', '...WWW...', '..WWWWW..', '...W.W...', '.........'])),
  moth: () => art(11, 9, p => p.map(['WW.......WW', 'WWW.....WWW', 'WWWW.W.WWWW', '.WWWWWWWWW.', '...WWWWW...', '.WWWWWWWWW.', 'WWWW.W.WWWW', 'WWW.....WWW', 'WW.......WW'])),
  star: () => art(9, 9, p => p.map(['....W....', '....W....', '...WWW...', 'WWWWWWWWW', '.WWWWWWW.', '..WWWWW..', '.WWW.WWW.', '.WW...WW.', 'W.......W'])),
  drop: () => art(7, 10, p => p.map(['...W...', '...W...', '..WWW..', '..WWW..', '.WWWWW.', 'WWWWWWW', 'WWWWWWW', 'WWWWWWW', '.WWWWW.', '..WWW..'])),
  snow: () => art(9, 9, p => p.map(['....W....', '.W..W..W.', '..W.W.W..', '...WWW...', 'WWWWWWWWW', '...WWW...', '..W.W.W..', '.W..W..W.', '....W....'])),
  note: () => art(8, 11, p => p.map(['...WWWW.', '...WWWWW', '...W...W', '...W....', '...W....', '...W....', '.WWW....', 'WWWW....', 'WWWW....', '.WW.....', '........'])),
  carrot: () => art(8, 14, p => p.map(['.W..W...', '..WW.W..', '...WW...', '.WWWWW..', 'WWWWWWW.', 'WWW.WWW.', '.WWWWW..', '.WW.WW..', '..WWW...', '..WWW...', '..WW....', '...W....', '...W....', '........'])),
  eye: () => art(12, 10, p => { p.ell(6, 5, 5.5, 4.5, 'W'); p.ell(6, 5, 2.5, 2.5, 'K'); p.ell(6, 5, 1, 1, 'W'); }),
  fire: () => art(10, 12, p => p.map(['....W.....', '...WW.....', '...WWW..W.', '..WWWW.WW.', '.WWWWWWWW.', '.WWWWWWWWW', 'WWWWYYWWWW', 'WWWYYYYWWW', 'WWYYYYYYWW', 'WWYYYYYYWW', '.WWYYYYWW.', '..WWWWWW..'], 0, 0, { Y: '#ffd040' })),
  web: () => art(11, 11, p => { for (let i = 0; i < 11; i++) { p.set(i, 5, 'W'); p.set(5, i, 'W'); p.set(i, i, 'W'); p.set(10 - i, i, 'W'); } p.ring(5.5, 5.5, 3, 3, 'W'); }),
  spider: () => art(13, 9, p => p.map(['W...........W', '.W..WWWWW..W.', '..WWWWWWWWW..', 'WWWW.WWW.WWWW', '...WWWWWWW...', 'WWWWWWWWWWWWW', '..W.WWWWW.W..', '.W...WWW...W.', 'W...........W'], 0, 0)),
  bomb: () => art(12, 13, p => { p.ell(6, 7.5, 5.5, 5.5, 'W'); p.ell(6, 7.5, 4.5, 4.5, 'K'); p.rect(5, 0, 2, 3, 'Y'); p.set(4, 1, 'O'); p.set(3, 4, 'W'); p.set(4, 4, 'W'); }),
  box: () => art(14, 14, p => { p.rect(0, 0, 14, 14, 'W'); p.rect(1, 1, 12, 12, 'K'); p.rect(3, 3, 8, 8, 'W'); p.rect(4, 4, 6, 6, 'K'); }),
  leg: () => art(8, 30, p => { p.rect(2, 0, 4, 26, 'W'); p.rect(0, 25, 8, 5, 'W'); p.rect(3, 1, 2, 24, 'P'); }),
  heartb: () => pmap(HEART_ROWS, '#ffffff'),
  knife: () => art(6, 20, p => p.map(['..WW..', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '.WWWW.', '..WW..', 'WWWWWW', '..GG..', '..GG..', '..GG..', '..GG..', '..GG..', '..GG..', '..GG..'])),
  leaf: () => art(10, 8, p => p.map(['......WWW.', '...WWWWWWW', '.WWWWWWWW.', 'WWWWWWWW..', 'WW.WWWW...', 'W.WW......', '.W........', 'W.........'])),
  ice: () => art(10, 10, p => p.map(['....WW....', '...WWWW...', '..WWBBWW..', '.WWBBBBWW.', 'WWBBBBBBWW', 'WWBBBBBBWW', '.WWBBBBWW.', '..WWBBWW..', '...WWWW...', '....WW....'], 0, 0, { B: '#c0f0ff' })),
  dog: () => art(16, 12, p => p.map(['..WW......WW....', '.WWWW....WWWW...', '.WWWWWWWWWWWW...', 'WWWKWWWWWWKWWW..', 'WWWWWWWWWWWWWW..', 'WWWWWWKKWWWWWWWW', '.WWWWWWWWWWWWW.W', '..WWWWWWWWWWW...', '..WW.WW..WW.WW..', '..WW.WW..WW.WW..', '................', '................'])),
  cloud: () => art(16, 10, p => { p.ell(5, 6, 4.5, 3.5, 'W'); p.ell(10, 4.5, 5, 4, 'W'); p.ell(12, 6.5, 3.5, 3, 'W'); }),
  diamond: () => art(10, 14, p => p.poly([[5, 0], [10, 7], [5, 14], [0, 7]], 'W')),
  cross: () => art(10, 10, p => { p.rect(4, 0, 2, 10, 'W'); p.rect(0, 4, 10, 2, 'W'); }),
  bolt: () => art(8, 14, p => p.map(['...WWWW.', '..WWWW..', '..WWW...', '.WWW....', '.WWWWWW.', '...WWW..', '..WWW...', '..WW....', '.WW.....', '.W......', 'W.......', '........', '........', '........'])),
  orb: () => art(12, 12, p => { p.ell(6, 6, 6, 6, 'W'); p.ell(6, 6, 4.5, 4.5, 'K'); p.ell(6, 6, 3, 3, 'W'); p.set(4, 4, 'K'); }),
  bigpellet: () => art(14, 14, p => p.ell(7, 7, 7, 7, 'W')),
  gift: () => art(12, 12, p => { p.rect(0, 3, 12, 9, 'W'); p.rect(1, 4, 10, 7, 'K'); p.rect(5, 3, 2, 9, 'W'); p.rect(0, 6, 12, 2, 'W'); p.map(['..WW..WW....', '...WWWW.....', '....WW......'], 1, 0); }),
  tear: () => art(6, 9, p => p.map(['..W...', '..W...', '.WWW..', '.WWW..', 'WWWWW.', 'WWWWW.', 'WWWWW.', '.WWW..', '......'])),
  trident: () => art(9, 30, p => { p.rect(4, 6, 1, 24, 'W'); p.rect(0, 6, 9, 1, 'W'); for (const x of [0, 4, 8]) p.rect(x, 0, 1, 7, 'W'); p.set(4, 0, 'W'); }),
  vine: () => art(8, 8, p => p.map(['..WWWW..', '.WW..WW.', 'WW....WW', 'W..WW..W', 'W..WW..W', 'WW....WW', '.WW..WW.', '..WWWW..'])),
  blTop: () => art(40, 34, p => {
    p.poly([[2, 0], [11, 6], [7, 14]], 'W'); p.poly([[38, 0], [29, 6], [33, 14]], 'W'); p.ell(20, 13, 14, 12, 'W'); p.poly([[9, 15], [31, 15], [28, 34], [12, 34]], 'W');
    p.ell(13.5, 12, 4.5, 4, 'K'); p.ell(26.5, 12, 4.5, 4, 'K'); p.rect(17, 25, 2, 3, 'K'); p.rect(21, 25, 2, 3, 'K'); p.line(10, 19, 12, 30, 'K'); p.line(30, 19, 28, 30, 'K'); p.rect(12, 33, 16, 1, 'K');
    for (let x = 14; x <= 26; x += 4) p.rect(x, 31, 1, 2, 'K');
  }),
  blTopOpen: () => art(40, 34, p => {
    p.poly([[2, 0], [11, 6], [7, 14]], 'W'); p.poly([[38, 0], [29, 6], [33, 14]], 'W'); p.ell(20, 13, 14, 12, 'W'); p.poly([[9, 15], [31, 15], [28, 34], [12, 34]], 'W');
    p.ell(13.5, 12, 4.5, 4, 'K'); p.ell(26.5, 12, 4.5, 4, 'K'); p.rect(12, 11, 3, 3, 'W'); p.rect(25, 11, 3, 3, 'W'); p.rect(17, 25, 2, 3, 'K'); p.rect(21, 25, 2, 3, 'K');
    p.line(10, 19, 12, 30, 'K'); p.line(30, 19, 28, 30, 'K'); p.rect(12, 33, 16, 1, 'K'); for (let x = 14; x <= 26; x += 4) p.rect(x, 31, 1, 2, 'K');
  }),
  blJaw: () => art(40, 10, p => { p.poly([[12, 0], [28, 0], [26, 9], [14, 9]], 'W'); for (let x = 15; x <= 25; x += 4) p.rect(x, 0, 1, 2, 'K'); }),
};
function shape(name) { return SHAPES[name] || (SHAPES[name] = SHAPE_DEF[name] ? SHAPE_DEF[name]() : SHAPE_DEF.pellet()); }

// ============================================================
//  RUINES
// ============================================================
defSprite('dummy', 40, 58, () => {
  const body = ink(40, 58, p => {
    p.ell(20, 9, 8, 8, 'K'); p.rect(17, 16, 6, 4, 'K');
    p.poly([[10, 20], [30, 20], [33, 44], [7, 44]], 'K'); p.rect(2, 24, 36, 6, 'K');
    p.rect(18, 44, 4, 12, 'K'); p.rect(10, 54, 20, 4, 'K');
  }, p => {
    p.path([[13, 26], [27, 26]], 'W'); p.path([[12, 34], [28, 34]], 'W');
    for (let x = 14; x < 27; x += 3) { p.set(x, 25, 'W'); p.set(x, 27, 'W'); }
    p.set(16, 8, 'W'); p.set(24, 8, 'W'); p.path([[17, 12], [23, 12]], 'W');
    p.path([[20, 36], [20, 42]], 'W');
  });
  return (g, t, E) => { const s = E.st.angry ? rint(-1, 1) : 0; put(g, body, s, 0); };
});
defSprite('froggit', 50, 44, () => {
  const body = ink(50, 44, p => {
    p.ell(25, 30, 17, 11, 'K'); p.ell(9, 38, 8, 5, 'K'); p.ell(41, 38, 8, 5, 'K'); p.rect(14, 38, 22, 6, 'K');
  }, p => { p.path([[18, 34], [22, 38]], 'W'); p.path([[32, 34], [28, 38]], 'W'); p.path([[4, 41], [9, 39], [14, 41]], 'W'); p.path([[36, 41], [41, 39], [46, 41]], 'W'); });
  const head = ink(50, 44, p => {
    p.ell(25, 14, 15, 10, 'K'); p.ell(15, 7, 6, 6, 'K'); p.ell(35, 7, 6, 6, 'K');
  }, p => {
    p.ell(15, 7, 2.5, 3, 'W'); p.ell(35, 7, 2.5, 3, 'W'); p.set(15, 7, 'K'); p.set(35, 7, 'K');
    p.path([[16, 17], [20, 19], [25, 18], [30, 19], [34, 17]], 'W'); p.set(13, 14, 'W'); p.set(37, 14, 'W');
  });
  return (g, t) => { put(g, body, 0, 0); put(g, head, 0, Math.round(Math.sin(t * 3) * 1.5) - 1); };
});
defSprite('whimsun', 48, 40, () => {
  const wingsA = ink(48, 40, p => { p.ell(11, 14, 10, 12, 'K'); p.ell(37, 14, 10, 12, 'K'); p.ell(13, 30, 7, 7, 'K'); p.ell(35, 30, 7, 7, 'K'); }, p => { p.ell(11, 14, 4, 5, 'W'); p.ell(37, 14, 4, 5, 'W'); p.ell(11, 14, 3, 4, 'K'); p.ell(37, 14, 3, 4, 'K'); });
  const wingsB = ink(48, 40, p => { p.ell(11, 18, 10, 8, 'K'); p.ell(37, 18, 10, 8, 'K'); p.ell(13, 31, 7, 5, 'K'); p.ell(35, 31, 7, 5, 'K'); }, p => { p.ell(11, 18, 4, 3, 'W'); p.ell(37, 18, 4, 3, 'W'); });
  const body = ink(48, 40, p => { p.ell(24, 17, 8, 8, 'K'); p.ell(24, 30, 5, 8, 'K'); }, p => {
    p.set(21, 16, 'W'); p.set(27, 16, 'W'); p.path([[21, 21], [24, 20], [27, 21]], 'W'); p.path([[21, 9], [17, 2]], 'W'); p.path([[27, 9], [31, 2]], 'W'); p.set(20, 18, 'W'); p.set(28, 18, 'W');
  });
  return (g, t) => { const f = Math.floor(t * 6) % 2; put(g, f ? wingsA : wingsB, 0, bob(t, 3)); put(g, body, 0, bob(t, 3)); };
});
defSprite('moldsmal', 50, 30, () => {
  const b = ink(50, 30, p => { p.ell(25, 18, 22, 11, 'K'); p.rect(3, 18, 44, 11, 'K'); }, p => {
    p.path([[8, 14], [14, 10]], 'W'); for (const [x, y] of [[18, 18], [30, 16], [24, 23], [36, 22], [12, 23]]) p.set(x, y, 'W');
  });
  return (g, t) => { const s = Math.sin(t * 4); g.drawImage(b, Math.round(-s * 2), Math.round(s * 2), 50 + Math.round(s * 4), 30 - Math.round(s * 2)); };
});
defSprite('migosp', 34, 52, () => {
  const a = ink(34, 52, p => {
    p.ell(17, 12, 9, 10, 'K'); p.poly([[11, 20], [23, 20], [26, 38], [8, 38]], 'K'); p.rect(10, 38, 5, 12, 'K'); p.rect(19, 38, 5, 12, 'K');
    p.poly([[9, 24], [2, 16], [4, 14], [11, 21]], 'K'); p.poly([[25, 24], [32, 32], [30, 34], [23, 27]], 'K');
  }, p => { p.ell(13, 11, 2, 3, 'W'); p.ell(21, 11, 2, 3, 'W'); p.path([[12, 2], [9, -2]], 'W'); p.path([[22, 2], [25, -2]], 'W'); p.path([[13, 17], [21, 17]], 'W'); p.path([[12, 28], [22, 28]], 'W'); });
  return (g, t) => { const f = Math.floor(t * 4) % 2; g.save(); if (f) { g.translate(34, 0); g.scale(-1, 1); } put(g, a, 0, bob(t, 8)); g.restore(); };
});
defSprite('vegetoid', 44, 64, () => {
  const leaves = ink(44, 64, p => { p.poly([[22, 16], [12, 0], [18, 2], [22, 10], [26, 2], [32, 0]], 'K'); p.poly([[20, 16], [6, 8], [10, 6], [21, 12]], 'K'); p.poly([[24, 16], [38, 8], [34, 6], [23, 12]], 'K'); }, p => { p.path([[22, 15], [22, 4]], 'W'); });
  const body = ink(44, 64, p => { p.poly([[8, 16], [36, 16], [32, 40], [26, 58], [22, 63], [18, 58], [12, 40]], 'K'); }, p => {
    p.ell(16, 26, 2.5, 3, 'W'); p.ell(28, 26, 2.5, 3, 'W'); p.path([[14, 33], [18, 37], [26, 37], [30, 33]], 'W');
    for (const [x, y] of [[12, 44], [30, 46], [20, 50], [24, 42]]) p.path([[x, y], [x + 3, y]], 'W');
  });
  return (g, t) => { put(g, body, 0, 0); g.save(); g.translate(22, 16); g.rotate(Math.sin(t * 3) * 0.08); g.drawImage(leaves, -22, -16); g.restore(); };
});
defSprite('loox', 52, 46, () => {
  const b = ink(52, 46, p => {
    p.ell(26, 25, 20, 18, 'K'); p.poly([[10, 14], [4, 0], [16, 10]], 'K'); p.poly([[42, 14], [48, 0], [36, 10]], 'K');
    p.ell(14, 42, 6, 4, 'K'); p.ell(38, 42, 6, 4, 'K');
  }, p => { p.path([[18, 36], [22, 39], [26, 37], [30, 39], [34, 36]], 'W'); for (let x = 20; x < 34; x += 4) p.set(x, 38, 'W'); });
  const eye = ink(52, 46, p => p.ell(26, 20, 10, 9, 'K'), p => { p.ell(26, 20, 4, 4, 'W'); p.ell(26, 20, 2.5, 2.5, 'K'); });
  return (g, t) => { put(g, b, 0, 0); put(g, eye, Math.round(Math.sin(t * 1.3) * 2), 0); };
});
defSprite('napstablook', 46, 54, () => {
  const b = ink(46, 54, p => { p.ell(23, 22, 19, 20, 'K'); p.poly([[4, 24], [42, 24], [44, 50], [36, 46], [28, 52], [20, 46], [12, 52], [2, 48]], 'K'); }, p => {
    p.path([[12, 18], [18, 20]], 'W'); p.path([[34, 18], [28, 20]], 'W'); p.path([[13, 21], [17, 22]], 'W'); p.path([[33, 21], [29, 22]], 'W');
    p.path([[19, 32], [23, 31], [27, 32]], 'W');
  });
  return (g, t, E) => {
    put(g, b, 0, bob(t, 1.6, 2));
    if (E.st.cry) { g.fillStyle = '#fff'; for (const x of [15, 31]) { const d = (t * 40 + x) % 24; g.fillRect(x, 24 + d + bob(t, 1.6, 2), 1, 3); } }
  };
});

// ============================================================
//  SNOWDIN
// ============================================================
defSprite('snowdrake', 54, 64, () => {
  const body = ink(54, 64, p => { p.poly([[17, 30], [37, 30], [40, 50], [33, 62], [21, 62], [14, 50]], 'K'); p.poly([[14, 36], [2, 44], [15, 46]], 'K'); p.poly([[40, 36], [52, 44], [39, 46]], 'K'); }, p => { p.path([[20, 40], [34, 40]], 'W'); p.path([[22, 46], [32, 46]], 'W'); p.rect(20, 61, 3, 3, 'W'); p.rect(31, 61, 3, 3, 'W'); });
  const head = ink(54, 64, p => {
    p.ell(27, 18, 12, 11, 'K'); p.poly([[34, 18], [50, 22], [34, 26]], 'K');
    p.poly([[16, 10], [12, 0], [20, 6], [24, 0], [28, 6], [32, 0], [36, 6], [42, 0], [38, 10]], 'K');
  }, p => { p.ell(27, 16, 2, 2.5, 'W'); p.path([[35, 22], [48, 22]], 'W'); p.path([[20, 22], [24, 24]], 'W'); });
  return (g, t) => { put(g, body, 0, 0); g.save(); g.translate(27, 28); g.rotate(Math.sin(t * 2) * 0.1); g.drawImage(head, -27, -28 + bob(t, 4)); g.restore(); };
});
defSprite('icecap', 44, 70, () => {
  const hat = ink(44, 70, p => p.poly([[22, 0], [40, 40], [4, 40]], 'K'), p => { p.path([[14, 30], [30, 30]], 'W'); p.path([[18, 18], [26, 18]], 'W'); p.path([[11, 36], [33, 36]], 'W'); });
  const body = ink(44, 70, p => { p.ell(22, 50, 13, 11, 'K'); p.rect(14, 58, 5, 11, 'K'); p.rect(25, 58, 5, 11, 'K'); }, p => { p.path([[16, 46], [20, 47]], 'W'); p.path([[28, 46], [24, 47]], 'W'); p.path([[18, 53], [26, 53]], 'W'); });
  return (g, t) => { put(g, body, 0, 0); put(g, hat, 0, bob(t, 3, 1.5)); };
});
defSprite('gyftrot', 64, 76, () => {
  const b = ink(64, 76, p => {
    p.ell(32, 30, 11, 12, 'K'); p.poly([[24, 40], [40, 40], [44, 66], [20, 66]], 'K'); p.rect(22, 64, 6, 11, 'K'); p.rect(36, 64, 6, 11, 'K');
    p.path([[24, 20], [12, 6], [6, 10]], 'K'); p.path([[40, 20], [52, 6], [58, 10]], 'K');
  }, p => {
    p.ell(27, 28, 2, 2.5, 'W'); p.ell(37, 28, 2, 2.5, 'W'); p.path([[29, 36], [35, 36]], 'W');
    p.path([[24, 20], [12, 6], [6, 10]], 'W'); p.path([[12, 6], [10, 0]], 'W'); p.path([[40, 20], [52, 6], [58, 10]], 'W'); p.path([[52, 6], [54, 0]], 'W');
  });
  return (g, t) => { put(g, b, 0, 0); g.drawImage(shape('gift'), 4, 8 + bob(t, 2)); g.drawImage(shape('gift'), 48, 8 + bob(t, 2.3)); };
});
defSprite('jerry', 48, 42, () => {
  const b = ink(48, 42, p => { p.ell(24, 24, 18, 15, 'K'); p.poly([[8, 22], [0, 16], [2, 28]], 'K'); p.poly([[40, 22], [48, 16], [46, 28]], 'K'); p.ell(16, 40, 6, 3, 'K'); p.ell(32, 40, 6, 3, 'K'); }, p => {
    p.ell(18, 20, 3, 2, 'W'); p.ell(30, 21, 2, 3, 'W'); p.set(18, 20, 'K'); p.path([[16, 29], [20, 32], [26, 30], [32, 32]], 'W'); for (const [x, y] of [[10, 14], [38, 30], [28, 12]]) p.set(x, y, 'W');
  });
  return (g, t) => put(g, b, bob(t, 2, 1), 0);
});
defSprite('doggo', 52, 72, () => {
  const body = ink(52, 72, p => { p.poly([[14, 32], [38, 32], [42, 60], [10, 60]], 'K'); p.rect(14, 58, 8, 13, 'K'); p.rect(30, 58, 8, 13, 'K'); }, p => { p.path([[18, 40], [34, 40]], 'W'); p.path([[16, 50], [36, 50]], 'W'); });
  const head = ink(52, 72, p => { p.ell(26, 18, 14, 13, 'K'); p.poly([[12, 12], [6, 26], [14, 20]], 'K'); p.poly([[40, 12], [46, 26], [38, 20]], 'K'); p.ell(26, 25, 6, 5, 'K'); }, p => { p.path([[18, 15], [22, 15]], 'W'); p.path([[30, 15], [34, 15]], 'W'); p.ell(26, 22, 2, 1.5, 'W'); p.path([[23, 27], [26, 28], [29, 27]], 'W'); });
  const knifeL = art(10, 20, p => { p.rect(4, 0, 2, 13, 'W'); p.rect(3, 1, 4, 11, 'W'); p.rect(2, 13, 6, 2, 'W'); p.rect(4, 15, 2, 5, 'G'); });
  return (g, t, E) => { put(g, body, 0, 0); const look = E.st.search ? Math.round(Math.sin(t * 6) * 4) : 0; put(g, head, look, bob(t, 2)); put(g, knifeL, 0, 34); put(g, knifeL, 42, 34); };
});
defSprite('lesserdog', 50, 96, () => {
  const body = ink(50, 96, p => { p.poly([[10, 60], [40, 60], [44, 90], [6, 90]], 'K'); p.rect(4, 88, 42, 8, 'K'); }, p => { p.path([[12, 70], [38, 70]], 'W'); p.path([[10, 80], [40, 80]], 'W'); p.rect(20, 62, 10, 6, 'W'); });
  const head = ink(50, 96, p => { p.ell(25, 12, 12, 11, 'K'); p.poly([[14, 6], [8, 22], [16, 18]], 'K'); p.poly([[36, 6], [42, 22], [34, 18]], 'K'); }, p => { p.set(20, 11, 'W'); p.set(30, 11, 'W'); p.path([[22, 18], [25, 19], [28, 18]], 'W'); p.ell(25, 15, 2, 1, 'W'); });
  const sword = art(8, 40, p => { p.rect(3, 0, 2, 30, 'W'); p.rect(0, 30, 8, 2, 'W'); p.rect(3, 32, 2, 8, 'G'); });
  return (g, t, E) => {
    const neck = Math.min(60, (E.st.neck || 0));
    const hy = 50 - neck * 0.6;
    g.fillStyle = '#fff'; g.fillRect(19, Math.round(hy), 12, 60 - Math.round(hy) + 2); g.fillStyle = '#000'; g.fillRect(20, Math.round(hy), 10, 60 - Math.round(hy) + 2);
    put(g, body, 0, 0); put(g, head, 0, Math.round(hy) - 2 + bob(t, 3)); put(g, sword, 42, 52);
  };
});
defSprite('dogamy', 50, 76, () => dogHood(false));
defSprite('dogaressa', 50, 76, () => dogHood(true));
function dogHood(f) {
  const b = ink(50, 76, p => {
    p.poly([[25, 2], [42, 20], [44, 56], [6, 56], [8, 20]], 'K'); p.rect(12, 54, 9, 20, 'K'); p.rect(29, 54, 9, 20, 'K');
  }, p => {
    p.ell(25, 26, 10, 9, 'W'); p.ell(25, 26, 9, 8, 'K');
    p.set(21, 24, 'W'); p.set(29, 24, 'W'); p.ell(25, 29, 2, 1.5, 'W'); p.path([[22, 32], [25, 33], [28, 32]], 'W');
    if (f) { p.set(19, 22, 'W'); p.set(31, 22, 'W'); p.path([[20, 21], [22, 22]], 'W'); p.path([[30, 21], [28, 22]], 'W'); }
    p.path([[12, 42], [38, 42]], 'W');
  });
  const axe = art(20, 44, p => { p.rect(9, 0, 2, 44, 'G'); p.poly([[11, 2], [20, 0], [20, 14], [11, 12]], 'W'); });
  return (g, t) => { put(g, b, 0, bob(t, 2.2)); g.save(); if (f) { g.translate(50, 0); g.scale(-1, 1); } put(g, axe, -4, 20); g.restore(); };
}
defSprite('greaterdog', 76, 76, () => {
  const armor = ink(76, 76, p => { p.poly([[14, 20], [62, 20], [70, 60], [6, 60]], 'K'); p.rect(10, 58, 14, 17, 'K'); p.rect(52, 58, 14, 17, 'K'); p.ell(38, 16, 16, 10, 'K'); }, p => {
    p.path([[18, 32], [58, 32]], 'W'); p.path([[14, 46], [62, 46]], 'W'); p.ring(38, 16, 9, 6, 'W'); p.rect(30, 34, 16, 10, 'W'); p.rect(31, 35, 14, 8, 'K');
  });
  const pup = ink(76, 76, p => { p.ell(38, 13, 7, 6, 'K'); p.poly([[31, 9], [28, 16], [33, 13]], 'K'); p.poly([[45, 9], [48, 16], [43, 13]], 'K'); }, p => { p.set(35, 12, 'W'); p.set(41, 12, 'W'); p.ell(38, 15, 1.5, 1, 'W'); });
  const spear = art(10, 70, p => { p.rect(4, 8, 2, 62, 'G'); p.poly([[5, 0], [9, 9], [1, 9]], 'W'); });
  return (g, t, E) => { put(g, spear, 64, 2); put(g, armor, 0, 0); if (!E.st.hidden) put(g, pup, 0, bob(t, 4, 1.5)); };
});

// ============================================================
//  WATERFALL
// ============================================================
defSprite('aaron', 56, 66, () => {
  const b = ink(56, 66, p => {
    p.ell(30, 14, 10, 10, 'K'); p.poly([[36, 14], [52, 16], [38, 20]], 'K');
    p.poly([[18, 26], [42, 24], [46, 44], [30, 52], [14, 44]], 'K'); p.ell(10, 32, 9, 7, 'K'); p.ell(50, 30, 6, 8, 'K');
    p.poly([[24, 50], [34, 50], [30, 64], [20, 62], [24, 58]], 'K');
  }, p => { p.ell(30, 12, 2, 2, 'W'); p.path([[20, 34], [28, 36]], 'W'); p.path([[32, 36], [40, 34]], 'W'); p.path([[24, 42], [36, 42]], 'W'); p.path([[6, 30], [12, 28]], 'W'); });
  return (g, t, E) => { const flex = E.st.flex ? Math.round(Math.sin(t * 12) * 1.5) : 0; put(g, b, 0, bob(t, 2) + flex); };
});
defSprite('woshua', 56, 56, () => {
  const tub = ink(56, 56, p => { p.poly([[6, 26], [50, 26], [44, 48], [12, 48]], 'K'); p.rect(14, 46, 5, 9, 'K'); p.rect(37, 46, 5, 9, 'K'); }, p => { p.path([[10, 32], [46, 32]], 'W'); for (let x = 12; x < 46; x += 6) p.set(x, 38, 'W'); });
  const bird = ink(56, 56, p => { p.ell(30, 16, 8, 8, 'K'); p.poly([[36, 14], [48, 12], [38, 19]], 'K'); p.rect(28, 22, 4, 6, 'K'); }, p => { p.set(32, 13, 'W'); p.path([[29, 2], [31, 6]], 'W'); });
  return (g, t) => { put(g, tub, 0, 0); put(g, bird, 0, bob(t, 3)); g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const y = (t * 30 + i * 8) % 26; g.fillRect(8 + i * 12, 26 - y, 2, 2); } };
});
defSprite('moldbygg', 44, 76, () => {
  const b = ink(44, 76, p => { p.ell(22, 18, 14, 14, 'K'); p.ell(22, 42, 18, 14, 'K'); p.ell(22, 64, 21, 12, 'K'); }, p => { for (const [x, y] of [[16, 14], [26, 18], [14, 40], [30, 44], [22, 60], [10, 66], [34, 64]]) p.set(x, y, 'W'); p.path([[18, 22], [26, 22]], 'W'); });
  return (g, t) => { const s = Math.sin(t * 3); g.drawImage(b, Math.round(s * 2), 0); };
});
defSprite('temmie', 44, 44, () => {
  const b = ink(44, 44, p => {
    p.ell(22, 22, 15, 13, 'K'); p.poly([[8, 16], [2, 2], [14, 10]], 'K'); p.poly([[36, 16], [42, 2], [30, 10]], 'K'); p.ell(4, 22, 4, 9, 'K'); p.ell(40, 22, 4, 9, 'K');
    p.rect(12, 32, 20, 10, 'K'); p.rect(12, 40, 5, 4, 'K'); p.rect(27, 40, 5, 4, 'K');
  }, p => {
    p.ell(15, 20, 2.5, 2.5, 'W'); p.ell(29, 20, 2.5, 2.5, 'W'); p.set(15, 20, 'K'); p.set(29, 20, 'K');
    p.path([[18, 27], [20, 29], [22, 27], [24, 29], [26, 27]], 'W'); p.set(11, 24, 'W'); p.set(33, 24, 'W'); p.path([[20, 9], [24, 11]], 'W');
  });
  return (g, t) => put(g, b, rint(-1, 1), rint(-1, 1));
});
defSprite('shyren', 48, 56, () => {
  const b = ink(48, 56, p => {
    p.ell(24, 22, 15, 14, 'K'); p.poly([[10, 26], [2, 16], [8, 32]], 'K'); p.poly([[24, 34], [34, 54], [14, 54]], 'K'); p.ell(24, 8, 10, 6, 'K');
  }, p => { p.path([[16, 20], [20, 22]], 'W'); p.path([[28, 20], [32, 22]], 'W'); p.ell(24, 28, 3, 2.5, 'W'); p.path([[18, 46], [30, 46]], 'W'); p.path([[16, 6], [32, 6]], 'W'); });
  return (g, t, E) => { put(g, b, E.st.hide ? 6 : 0, bob(t, 1.5, 2)); };
});
defSprite('maddummy', 44, 60, () => {
  const body = ink(44, 60, p => {
    p.ell(22, 10, 9, 9, 'K'); p.rect(19, 18, 6, 4, 'K'); p.poly([[11, 22], [33, 22], [36, 46], [8, 46]], 'K'); p.rect(2, 26, 40, 6, 'K');
  }, p => { p.path([[15, 28], [29, 28]], 'W'); for (let x = 16; x < 29; x += 3) { p.set(x, 27, 'W'); p.set(x, 29, 'W'); } p.path([[16, 5], [20, 8]], 'W'); p.path([[28, 5], [24, 8]], 'W'); p.set(18, 9, 'W'); p.set(26, 9, 'W'); p.path([[17, 14], [22, 13], [27, 14]], 'W'); });
  return (g, t, E) => { const s = E.st.angry !== false ? rint(-1, 1) : 0; put(g, body, s, bob(t, 3, 3) + 6); };
});
defSprite('glyde', 76, 44, () => {
  const b = ink(76, 44, p => { p.poly([[38, 4], [50, 22], [38, 40], [26, 22]], 'K'); p.poly([[28, 18], [0, 4], [6, 26]], 'K'); p.poly([[48, 18], [76, 4], [70, 26]], 'K'); }, p => { p.path([[34, 20], [36, 22]], 'W'); p.path([[42, 20], [40, 22]], 'W'); p.path([[34, 28], [38, 30], [42, 28]], 'W'); p.path([[8, 10], [24, 18]], 'W'); p.path([[68, 10], [52, 18]], 'W'); });
  return (g, t) => put(g, b, 0, bob(t, 3, 3) + 3);
});

// ============================================================
//  HOTLAND
// ============================================================
defSprite('vulkin', 50, 44, () => {
  const b = ink(50, 44, p => { p.poly([[16, 4], [34, 4], [48, 40], [2, 40]], 'K'); p.rect(10, 38, 8, 6, 'K'); p.rect(32, 38, 8, 6, 'K'); }, p => {
    p.path([[16, 4], [20, 8], [25, 5], [30, 8], [34, 4]], 'W'); p.ell(18, 22, 3, 3.5, 'W'); p.ell(32, 22, 3, 3.5, 'W'); p.set(18, 21, 'K'); p.set(32, 21, 'K'); p.path([[21, 30], [25, 32], [29, 30]], 'W');
    p.set(13, 27, 'W'); p.set(37, 27, 'W');
  });
  return (g, t) => { put(g, b, 0, bob(t, 2)); g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const y = (t * 14 + i * 5) % 14; g.fillRect(21 + i * 4, 3 - Math.round(y * 0.2), 2, 2); } };
});
defSprite('tsunderplane', 66, 42, () => {
  const b = ink(66, 42, p => { p.ell(30, 22, 24, 10, 'K'); p.poly([[54, 22], [66, 18], [60, 26]], 'K'); p.poly([[22, 18], [30, 0], [36, 4], [34, 18]], 'K'); p.poly([[22, 26], [32, 42], [38, 38], [34, 26]], 'K'); p.poly([[6, 18], [2, 8], [10, 16]], 'K'); }, p => {
    p.ell(46, 20, 2, 2, 'W'); p.path([[40, 26], [46, 27]], 'W'); for (let x = 12; x < 40; x += 6) p.set(x, 22, 'W');
  });
  return (g, t) => { put(g, b, 0, bob(t, 2.5, 2)); g.fillStyle = '#ff7fd0'; g.fillRect(38, 23 + bob(t, 2.5, 2), 4, 2); };
});
defSprite('pyrope', 44, 70, () => {
  const b = ink(44, 70, p => { p.ell(22, 18, 11, 13, 'K'); p.poly([[17, 30], [27, 30], [24, 50], [30, 68], [22, 68], [20, 52]], 'K'); p.poly([[12, 34], [2, 46], [6, 48], [14, 38]], 'K'); p.poly([[32, 34], [42, 46], [38, 48], [30, 38]], 'K'); }, p => {
    p.path([[16, 16], [20, 18]], 'W'); p.path([[28, 16], [24, 18]], 'W'); p.path([[18, 24], [22, 26], [26, 24]], 'W'); for (let y = 34; y < 66; y += 5) p.path([[19, y], [25, y + 2]], 'W');
  });
  return (g, t) => { put(g, b, 0, 0); g.drawImage(shape('fire'), 17, Math.round(-4 + bob(t, 8, 1))); };
});
defSprite('rg01', 52, 80, () => guard(false));
defSprite('rg02', 52, 80, () => guard(true));
function guard(dragon) {
  const b = ink(52, 80, p => {
    p.poly([[12, 30], [40, 30], [44, 62], [8, 62]], 'K'); p.rect(12, 60, 10, 19, 'K'); p.rect(30, 60, 10, 19, 'K');
    p.ell(26, 18, 13, 13, 'K'); if (dragon) { p.poly([[14, 10], [10, 0], [18, 6]], 'K'); p.poly([[38, 10], [42, 0], [34, 6]], 'K'); } else { p.ell(18, 2, 4, 9, 'K'); p.ell(34, 2, 4, 9, 'K'); }
    p.ell(6, 40, 6, 9, 'K'); p.ell(46, 40, 6, 9, 'K');
  }, p => {
    p.rect(16, 16, 20, 4, 'W'); p.rect(17, 17, 18, 2, 'K'); p.path([[16, 40], [36, 40]], 'W'); p.path([[14, 50], [38, 50]], 'W'); p.ell(26, 44, 3, 3, 'W');
  });
  return (g, t) => put(g, b, 0, bob(t, 2, 1));
}
defSprite('mettaton', 54, 78, () => {
  const b = ink(54, 78, p => { p.rect(6, 4, 42, 52, 'K'); p.rect(20, 56, 14, 14, 'K'); p.ell(27, 72, 10, 5, 'K'); p.rect(0, 20, 6, 14, 'K'); p.rect(48, 20, 6, 14, 'K'); }, p => {
    p.rect(12, 10, 30, 14, 'W'); p.rect(13, 11, 28, 12, 'K');
    for (let i = 0; i < 5; i++) p.ell(14 + i * 6.5, 33, 2, 2, 'W');
    p.ring(18, 46, 5, 5, 'W'); p.ring(36, 46, 5, 5, 'W'); p.line(18, 46, 21, 43, 'W'); p.line(36, 46, 33, 49, 'W');
    p.rect(22, 58, 10, 2, 'W'); p.rect(22, 63, 10, 2, 'W');
  });
  return (g, t) => {
    put(g, b, 0, bob(t, 2, 1));
    const cols = ['#ff3030', '#ffe23c', '#3fb4ff', '#36d040', '#ff7fd0'];
    for (let i = 0; i < 5; i++) if (Math.floor(t * 4 + i) % 2) { g.fillStyle = cols[i]; g.fillRect(13 + i * 6.5, 32 + bob(t, 2, 1), 3, 3); }
  };
});
defSprite('mettatonex', 70, 116, () => {
  const legs = ink(70, 116, p => { p.poly([[28, 66], [34, 66], [30, 112], [26, 112]], 'K'); p.poly([[36, 66], [42, 66], [44, 112], [40, 112]], 'K'); p.rect(22, 110, 10, 6, 'K'); p.rect(38, 110, 10, 6, 'K'); }, p => { p.path([[29, 90], [31, 90]], 'W'); });
  const body = ink(70, 116, p => {
    p.poly([[22, 30], [48, 30], [46, 54], [40, 66], [30, 66], [24, 54]], 'K'); p.ell(35, 18, 10, 12, 'K'); p.poly([[24, 10], [46, 4], [48, 16], [28, 26]], 'K');
    p.poly([[22, 32], [6, 52], [10, 56], [24, 40]], 'K'); p.poly([[48, 32], [64, 18], [68, 22], [48, 40]], 'K');
  }, p => {
    p.set(36, 18, 'W'); p.set(38, 18, 'W'); p.path([[33, 24], [38, 24]], 'W'); p.rect(30, 38, 10, 10, 'W'); p.rect(31, 39, 8, 8, 'P'); p.path([[28, 54], [42, 54]], 'W');
    p.path([[26, 12], [44, 7]], 'W');
  });
  return (g, t) => { put(g, legs, 0, 0); put(g, body, 0, bob(t, 3, 1)); };
});

// ============================================================
//  CORE
// ============================================================
defSprite('finalfroggit', 54, 46, () => {
  const body = ink(54, 46, p => { p.ell(27, 31, 19, 12, 'K'); p.ell(9, 40, 9, 5, 'K'); p.ell(45, 40, 9, 5, 'K'); }, p => { p.path([[18, 32], [36, 32]], 'W'); p.path([[22, 38], [32, 38]], 'W'); p.path([[3, 43], [15, 43]], 'W'); p.path([[39, 43], [51, 43]], 'W'); });
  const head = ink(54, 46, p => { p.ell(27, 14, 17, 11, 'K'); p.ell(15, 6, 7, 6, 'K'); p.ell(39, 6, 7, 6, 'K'); }, p => { p.ell(15, 6, 3, 3, 'W'); p.ell(39, 6, 3, 3, 'W'); p.rect(14, 5, 2, 2, 'K'); p.rect(38, 5, 2, 2, 'K'); p.path([[16, 17], [27, 20], [38, 17]], 'W'); p.path([[24, 9], [30, 9]], 'W'); p.path([[22, 11], [32, 11]], 'W'); });
  return (g, t) => { put(g, body, 0, 0); put(g, head, 0, bob(t, 2.5, 1.5) - 1); };
});
defSprite('whimsalot', 56, 56, () => {
  const wings = ink(56, 56, p => { p.ell(12, 18, 11, 14, 'K'); p.ell(44, 18, 11, 14, 'K'); }, p => { p.ell(12, 18, 5, 7, 'W'); p.ell(12, 18, 4, 6, 'K'); p.ell(44, 18, 5, 7, 'W'); p.ell(44, 18, 4, 6, 'K'); });
  const body = ink(56, 56, p => { p.ell(28, 16, 10, 10, 'K'); p.poly([[20, 24], [36, 24], [38, 46], [18, 46]], 'K'); p.rect(20, 44, 6, 12, 'K'); p.rect(30, 44, 6, 12, 'K'); p.rect(40, 14, 3, 36, 'K'); }, p => { p.rect(22, 13, 12, 3, 'W'); p.rect(23, 14, 10, 1, 'K'); p.path([[22, 32], [34, 32]], 'W'); p.rect(40, 10, 3, 8, 'W'); });
  return (g, t) => { const f = Math.floor(t * 5) % 2; put(g, wings, 0, f + bob(t, 2)); put(g, body, 0, bob(t, 2)); };
});
defSprite('astigmatism', 66, 54, () => {
  const b = ink(66, 54, p => { p.ell(33, 30, 24, 20, 'K'); p.poly([[14, 16], [2, 0], [20, 12]], 'K'); p.poly([[52, 16], [64, 0], [46, 12]], 'K'); p.ell(18, 50, 7, 4, 'K'); p.ell(48, 50, 7, 4, 'K'); }, p => { p.path([[20, 44], [46, 44]], 'W'); for (let x = 22; x < 46; x += 4) p.path([[x, 44], [x + 2, 47]], 'W'); });
  const eye = ink(66, 54, p => p.ell(33, 26, 13, 11, 'K'), p => { p.ell(33, 26, 6, 6, 'W'); p.ell(33, 26, 4, 4, 'K'); p.ell(31, 24, 1, 1, 'W'); });
  return (g, t, E) => { put(g, b, 0, 0); put(g, eye, E.st.look ? Math.round(Math.sin(t * 3) * 4) : 0, 0); };
});
defSprite('knightknight', 64, 96, () => {
  const b = ink(64, 96, p => {
    p.poly([[18, 22], [46, 22], [54, 74], [10, 74]], 'K'); p.ell(32, 14, 14, 13, 'K'); p.rect(14, 72, 12, 23, 'K'); p.rect(38, 72, 12, 23, 'K'); p.poly([[28, 1], [32, -2], [36, 1], [32, 6]], 'K');
  }, p => { p.rect(22, 12, 20, 3, 'W'); p.rect(23, 13, 18, 1, 'K'); p.path([[16, 40], [48, 40]], 'W'); p.path([[14, 56], [50, 56]], 'W'); p.ell(32, 48, 4, 4, 'W'); p.path([[28, 30], [36, 30]], 'W'); });
  const mace = art(16, 50, p => { p.rect(7, 12, 2, 38, 'G'); p.ell(8, 7, 7, 7, 'W'); p.ell(8, 7, 5, 5, 'K'); for (const [x, y] of [[8, -1], [0, 7], [15, 7], [2, 1], [14, 1]]) p.set(x, y + 1, 'W'); });
  return (g, t) => { put(g, b, 0, bob(t, 1.5, 1)); g.save(); g.translate(56, 54); g.rotate(Math.sin(t * 2) * 0.15); g.drawImage(mace, -8, -50); g.restore(); };
});
defSprite('madjick', 54, 64, () => {
  const b = ink(54, 64, p => { p.poly([[27, 0], [38, 22], [16, 22]], 'K'); p.ell(27, 26, 16, 5, 'K'); p.poly([[18, 30], [36, 30], [42, 60], [12, 60]], 'K'); }, p => { p.path([[20, 18], [34, 18]], 'W'); p.set(22, 34, 'W'); p.set(32, 34, 'W'); p.path([[24, 40], [30, 40]], 'W'); p.path([[16, 52], [38, 52]], 'W'); p.set(27, 6, 'W'); });
  return (g, t) => { put(g, b, 0, bob(t, 2)); for (const s of [-1, 1]) { const a = t * 2 * s; g.drawImage(shape('orb'), Math.round(21 + Math.cos(a) * 22), Math.round(36 + Math.sin(a) * 8)); } };
});

// ============================================================
//  LABORATOIRE (Amalgamates)
// ============================================================
function melty(w, h, fill, detail) {
  return ink(w, h, fill, p => { detail(p); for (let x = 4; x < w - 4; x += 7) p.path([[x, h - 10], [x + 1, h - 2]], 'W'); });
}
defSprite('memoryhead', 60, 60, () => {
  const b = melty(60, 60, p => { p.ell(30, 26, 22, 20, 'K'); p.rect(10, 26, 40, 30, 'K'); }, p => { p.ell(22, 22, 4, 4, 'W'); p.ell(38, 22, 4, 4, 'W'); p.ell(22, 22, 2, 2, 'K'); p.ell(38, 22, 2, 2, 'K'); p.path([[20, 36], [30, 32], [40, 36]], 'W'); for (const x of [24, 28, 32, 36]) p.path([[x, 34], [x, 38]], 'W'); });
  return (g, t) => { g.drawImage(b, Math.round(Math.sin(t * 5) * 2), 0); };
});
defSprite('endogeny', 70, 56, () => {
  const b = melty(70, 56, p => { p.ell(30, 26, 22, 16, 'K'); p.ell(50, 18, 10, 10, 'K'); for (const x of [14, 26, 38, 50]) p.rect(x, 36, 7, 18, 'K'); }, p => { p.ell(52, 16, 2, 2, 'W'); p.path([[44, 22], [58, 24]], 'W'); p.path([[12, 20], [20, 16]], 'W'); });
  return (g, t) => g.drawImage(b, 0, Math.round(Math.sin(t * 3) * 2));
});
defSprite('lemonbread', 62, 60, () => {
  const b = melty(62, 60, p => { p.ell(31, 30, 26, 22, 'K'); p.rect(5, 30, 52, 26, 'K'); }, p => { p.path([[14, 22], [48, 22]], 'W'); for (let x = 16; x < 48; x += 4) p.path([[x, 22], [x + 2, 28]], 'W'); p.ell(20, 14, 3, 3, 'W'); p.ell(42, 14, 3, 3, 'W'); });
  return (g, t) => g.drawImage(b, 0, Math.round(Math.sin(t * 2) * 2));
});
defSprite('reaperbird', 70, 70, () => {
  const b = melty(70, 70, p => { p.ell(35, 26, 14, 14, 'K'); p.poly([[20, 30], [2, 10], [8, 46]], 'K'); p.poly([[50, 30], [68, 10], [62, 46]], 'K'); p.poly([[24, 36], [46, 36], [50, 66], [20, 66]], 'K'); }, p => { p.ell(30, 24, 2, 3, 'W'); p.ell(40, 24, 2, 3, 'W'); p.poly([[32, 30], [38, 30], [35, 36]], 'W'); for (let y = 16; y < 44; y += 6) { p.path([[6, y], [16, y + 4]], 'W'); p.path([[64, y], [54, y + 4]], 'W'); } });
  return (g, t) => g.drawImage(b, 0, Math.round(Math.sin(t * 2.5) * 3));
});
defSprite('snowdrakemom', 56, 74, () => {
  const b = melty(56, 74, p => { p.ell(28, 20, 14, 13, 'K'); p.poly([[38, 20], [54, 24], [38, 28]], 'K'); p.poly([[14, 32], [42, 32], [46, 70], [10, 70]], 'K'); p.poly([[16, 10], [12, 0], [22, 6], [28, 0], [34, 6], [42, 0], [40, 10]], 'K'); }, p => { p.ell(26, 18, 2, 3, 'W'); p.path([[39, 24], [52, 24]], 'W'); p.path([[18, 44], [38, 44]], 'W'); p.ell(28, 56, 6, 5, 'W'); p.ell(28, 56, 5, 4, 'K'); });
  return (g, t) => g.drawImage(b, Math.round(Math.sin(t * 1.5) * 2), 0);
});
