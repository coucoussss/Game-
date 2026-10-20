'use strict';
// ============================================================
//  spr_boss.js : sprites des boss (fan art original)
// ============================================================
// ---------- Flowey ----------
function floweyFace(p, cx, cy, face) {
  p.ell(cx, cy, 8, 7, 'W');
  if (face === 'grin' || face === 'evil') {
    p.poly([[cx - 6, cy - 3], [cx - 2, cy - 1], [cx - 5, cy + 1]], 'K'); p.poly([[cx + 6, cy - 3], [cx + 2, cy - 1], [cx + 5, cy + 1]], 'K');
    p.poly([[cx - 6, cy + 2], [cx + 6, cy + 2], [cx + 3, cy + 6], [cx - 3, cy + 6]], 'K');
    for (let x = cx - 5; x <= cx + 5; x += 2) { p.set(x, cy + 3, 'W'); p.set(x + 1, cy + 5, 'W'); }
  } else if (face === 'wink') {
    p.rect(cx - 5, cy - 2, 3, 1, 'K'); p.rect(cx + 2, cy - 3, 2, 3, 'K'); p.path([[cx - 3, cy + 3], [cx, cy + 4], [cx + 3, cy + 3]], 'K');
  } else if (face === 'sad') {
    p.rect(cx - 4, cy - 2, 2, 2, 'K'); p.rect(cx + 2, cy - 2, 2, 2, 'K'); p.path([[cx - 3, cy + 4], [cx, cy + 3], [cx + 3, cy + 4]], 'K');
  } else {
    p.rect(cx - 4, cy - 3, 2, 3, 'K'); p.rect(cx + 2, cy - 3, 2, 3, 'K'); p.path([[cx - 4, cy + 2], [cx - 2, cy + 4], [cx + 2, cy + 4], [cx + 4, cy + 2]], 'K');
  }
}
function floweyArt(face) {
  return art(40, 44, p => {
    p.rect(19, 24, 3, 18, 'E'); p.ell(12, 36, 6, 3, 'E'); p.ell(28, 34, 6, 3, 'E'); p.path([[8, 36], [16, 36]], 'e'); p.path([[24, 34], [32, 34]], 'e');
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; p.ell(20 + Math.cos(a) * 9, 16 + Math.sin(a) * 8, 6, 5.5, 'Y'); }
    p.edge('y', 'Y');
    floweyFace(p, 20, 16, face);
  });
}
const FLOWEY = {};
for (const f of ['smile', 'grin', 'wink', 'sad', 'evil']) FLOWEY[f] = null;
function floweyImg(face) { return FLOWEY[face] || (FLOWEY[face] = floweyArt(face)); }
defSprite('flowey', 40, 44, () => (g, t, E) => { const f = (E && E.st.face) || 'smile'; g.save(); g.translate(20, 42); g.rotate(Math.sin(t * 2) * 0.05); g.drawImage(floweyImg(f), -20, -42); g.restore(); });

// ---------- Toriel ----------
defSprite('toriel', 84, 106, () => {
  const body = ink(84, 106, p => {
    p.poly([[26, 40], [58, 40], [66, 70], [74, 104], [10, 104], [18, 70]], 'K');
    p.poly([[26, 42], [13, 60], [9, 80], [22, 82], [29, 62]], 'K'); p.poly([[58, 42], [71, 60], [75, 80], [62, 82], [55, 62]], 'K');
    p.ell(15, 84, 6, 5, 'K'); p.ell(69, 84, 6, 5, 'K');
  }, p => {
    p.ring(42, 56, 6, 5, 'W'); p.path([[34, 54], [28, 50]], 'W'); p.path([[50, 54], [56, 50]], 'W'); p.path([[34, 57], [29, 56]], 'W'); p.path([[50, 57], [55, 56]], 'W');
    for (const dx of [-6, 0, 6]) p.poly([[42 + dx - 3, 69], [42 + dx + 3, 69], [42 + dx, 64]], 'W');
    p.path([[22, 80], [20, 92]], 'W'); p.path([[62, 80], [64, 92]], 'W'); p.path([[30, 98], [54, 98]], 'W');
    p.path([[12, 86], [18, 86]], 'W'); p.path([[66, 86], [72, 86]], 'W');
  });
  const head = ink(84, 106, p => {
    p.poly([[29, 14], [20, 16], [13, 38], [18, 46], [25, 36], [31, 22]], 'K'); p.poly([[55, 14], [64, 16], [71, 38], [66, 46], [59, 36], [53, 22]], 'K');
    p.ell(42, 22, 14, 14, 'K'); p.ell(42, 31, 8, 7, 'K'); p.rect(35, 34, 14, 8, 'K');
    p.poly([[33, 10], [29, 2], [36, 8]], 'K'); p.poly([[51, 10], [55, 2], [48, 8]], 'K');
  }, p => {
    p.ell(36, 22, 2, 2, 'W'); p.ell(48, 22, 2, 2, 'W'); p.path([[33, 19], [38, 18]], 'W'); p.path([[46, 18], [51, 19]], 'W');
    p.ell(42, 30, 2.5, 1.5, 'W'); p.path([[39, 34], [42, 35], [45, 34]], 'W'); p.path([[20, 26], [18, 38]], 'W'); p.path([[64, 26], [66, 38]], 'W');
  });
  return (g, t, E) => {
    const b = E.st.hurt ? 0 : bob(t, 1.6, 1);
    put(g, body, 0, 0); put(g, head, E.st.look ? -2 : 0, b);
    if (E.st.fire) { const f = shape('fire'); g.drawImage(f, 8 + bob(t, 9), 66); g.drawImage(f, 64 - bob(t, 9), 66); }
  };
});

// ---------- Papyrus ----------
defSprite('papyrus', 70, 120, () => {
  const legs = ink(70, 120, p => { p.rect(25, 62, 5, 42, 'K'); p.rect(40, 62, 5, 42, 'K'); p.poly([[18, 103], [31, 103], [32, 118], [14, 118]], 'K'); p.poly([[39, 103], [52, 103], [56, 118], [38, 118]], 'K'); }, p => { p.path([[17, 112], [31, 112]], 'W'); p.path([[39, 112], [55, 112]], 'W'); });
  const body = ink(70, 120, p => {
    p.poly([[20, 30], [50, 30], [54, 54], [16, 54]], 'K'); p.ell(15, 33, 9, 7, 'K'); p.ell(55, 33, 9, 7, 'K'); p.rect(19, 52, 32, 11, 'K');
    p.poly([[8, 38], [2, 52], [12, 58], [16, 48]], 'K'); p.poly([[62, 38], [68, 52], [58, 58], [54, 48]], 'K');
    p.ell(8, 58, 5, 5, 'K'); p.ell(62, 58, 5, 5, 'K');
  }, p => {
    p.path([[22, 40], [48, 40]], 'W'); p.path([[24, 46], [46, 46]], 'W'); p.ring(35, 36, 4, 3, 'W'); p.path([[19, 56], [51, 56]], 'W'); p.path([[35, 56], [35, 62]], 'W');
    p.path([[10, 31], [20, 31]], 'W'); p.path([[50, 31], [60, 31]], 'W');
  });
  const head = ink(70, 120, p => { p.ell(35, 13, 13, 12, 'K'); p.rect(26, 16, 18, 10, 'K'); }, p => {
    p.ell(30, 12, 3, 3.5, 'W'); p.ell(41, 12, 3, 3.5, 'W'); p.ell(30, 12, 2, 2.5, 'K'); p.ell(41, 12, 2, 2.5, 'K');
    p.poly([[34, 17], [37, 17], [35.5, 20]], 'W'); p.path([[27, 22], [43, 22]], 'W'); for (let x = 29; x < 43; x += 3) p.path([[x, 21], [x, 24]], 'W'); p.path([[27, 25], [43, 25]], 'W');
  });
  const scarf = art(70, 120, p => { p.rect(23, 26, 24, 5, 'R'); p.edge('r'); });
  return (g, t, E) => {
    put(g, legs, 0, 0); put(g, body, 0, bob(t, 3, 1));
    // écharpe qui flotte au vent
    g.drawImage(scarf, 0, bob(t, 3, 1));
    g.fillStyle = PAL.R;
    for (let i = 0; i < 18; i++) { const x = 46 + i, y = 29 + Math.round(Math.sin(t * 7 - i * 0.5) * 2 + i * 0.3) + bob(t, 3, 1); g.fillRect(x, y, 1, 3); }
    put(g, head, E.st.shake ? rint(-1, 1) : 0, bob(t, 3, 1) + (E.st.nod ? bob(t, 10, 1) : 0));
    if (E.st.blush) { g.fillStyle = '#ff7fd0'; g.fillRect(27, 18 + bob(t, 3, 1), 3, 1); g.fillRect(41, 18 + bob(t, 3, 1), 3, 1); }
  };
});

// ---------- Muffet ----------
defSprite('muffet', 100, 96, () => {
  const L = { V: '#c48ce8', v: '#7a3fb8', D: '#2a0a40', P: '#ff7fd0', p: '#a03070', K: '#000000', W: '#ffffff', R: '#ff3060' };
  const hair = art(100, 96, p => { p.ell(24, 22, 14, 16, 'D'); p.ell(76, 22, 14, 16, 'D'); p.ell(50, 14, 18, 12, 'D'); p.ell(36, 8, 6, 4, 'R'); p.ell(64, 8, 6, 4, 'R'); p.edge('v', 'D'); });
  const body = art(100, 96, p => {
    p.poly([[36, 46], [64, 46], [72, 66], [86, 92], [14, 92], [28, 66]], 'D'); p.edge('v', 'D');
    for (let x = 16; x < 86; x += 8) p.ell(x + 4, 92, 4, 3, 'P');
    p.ell(36, 46, 7, 6, 'P'); p.ell(64, 46, 7, 6, 'P');
    for (const [y, s] of [[50, 1], [60, 1], [70, 1]]) { void s; p.path([[30, y], [12, y - 8], [6, y - 4]], 'V'); p.path([[70, y], [88, y - 8], [94, y - 4]], 'V'); }
    p.path([[44, 60], [56, 60]], 'P'); p.path([[46, 66], [54, 66]], 'P');
  });
  const head = art(100, 96, p => {
    p.ell(50, 30, 15, 15, 'V'); p.edge('v', 'V');
    p.ell(42, 26, 4, 4, 'K'); p.ell(58, 26, 4, 4, 'K'); p.set(41, 25, 'W'); p.set(57, 25, 'W');
    for (const [x, y] of [[50, 20], [45, 34], [55, 34]]) { p.ell(x, y, 2, 2, 'K'); p.set(x, y - 1, 'W'); }
    p.path([[44, 39], [50, 41], [56, 39]], 'K'); p.set(46, 40, 'W'); p.set(54, 40, 'W');
  });
  const cups = art(100, 96, p => { for (const [x, y] of [[6, 38], [92, 38], [8, 48], [90, 48]]) { p.rect(x - 3, y, 6, 4, 'W'); p.set(x + 3, y + 1, 'W'); } });
  return (g, t, E) => {
    g.save(); const lean = Math.sin(t * 2.4) * 2;
    put(g, hair, lean, bob(t, 2.4, 1)); put(g, body, 0, 0); put(g, head, lean, bob(t, 2.4, 1)); put(g, cups, 0, bob(t, 4.8, 1));
    g.restore();
    void L;
  };
});
// couleurs de Muffet ajoutées à la palette globale
Object.assign(PAL, { D: '#2a0a40', V: '#c48ce8', v: '#7a3fb8' });

// ---------- Asgore ----------
defSprite('asgore', 124, 124, () => {
  const cape = art(124, 124, p => { p.poly([[40, 34], [84, 34], [118, 122], [6, 122]], 'M'); p.edge('v', 'M'); for (let x = 16; x < 110; x += 14) p.line(x + 4, 120, 62 + (x - 62) * 0.3, 46, 'v'); });
  const body = art(124, 124, p => {
    p.poly([[42, 40], [82, 40], [88, 92], [36, 92]], '2'); p.edge('W', '2');
    p.ell(36, 46, 12, 9, '3'); p.ell(88, 46, 12, 9, '3'); p.edge('Y', '3');
    p.rect(44, 92, 14, 28, '2'); p.rect(66, 92, 14, 28, '2'); p.edge('W', '2');
    p.rect(40, 70, 44, 6, 'y'); p.ell(62, 58, 7, 7, 'Y'); p.ell(62, 58, 4, 4, '2');
  });
  const head = art(124, 124, p => {
    p.poly([[46, 18], [30, 2], [36, 14]], 'W'); p.poly([[78, 18], [94, 2], [88, 14]], 'W');
    p.ell(48, 26, 7, 4, 'W'); p.ell(76, 26, 7, 4, 'W');
    p.ell(62, 26, 13, 13, 'W'); p.ell(62, 36, 15, 10, 'Y'); p.ell(62, 31, 7, 5, 'W'); p.edge('y', 'Y');
    p.rect(56, 22, 3, 2, 'K'); p.rect(65, 22, 3, 2, 'K'); p.path([[54, 20], [58, 21]], 'K'); p.path([[66, 21], [70, 20]], 'K');
    p.ell(62, 30, 2, 1.5, 'K');
    p.poly([[52, 12], [72, 12], [74, 6], [68, 9], [62, 4], [56, 9], [50, 6]], 'Y'); p.edge('y', 'Y');
  });
  const trident = art(124, 124, p => { p.line(104, 120, 112, 20, 'R'); p.line(105, 120, 113, 20, 'R'); p.poly([[106, 26], [120, 24], [119, 28], [107, 30]], 'R'); for (const x of [106, 113, 120]) p.poly([[x - 2, 26], [x + 2, 26], [x + 1, 12]], 'R'); });
  return (g, t, E) => {
    put(g, cape, 0, 0);
    const b = bob(t, 1.4, 1);
    put(g, body, 0, b); if (!E.st.noTrident) put(g, trident, 0, b); put(g, head, 0, b + (E.st.kneel ? 6 : 0));
  };
});

// ---------- Asriel Dreemurr (dieu de l'Hypermort) ----------
defSprite('asriel', 120, 120, () => {
  const robe = art(120, 120, p => {
    p.poly([[44, 42], [76, 42], [92, 118], [28, 118]], 'K'); p.edge('W', 'K');
    p.poly([[44, 44], [24, 70], [30, 74], [48, 54]], 'K'); p.poly([[76, 44], [96, 70], [90, 74], [72, 54]], 'K'); p.edge('W', 'K');
    p.map(HEART_ROWS.map(r => r.replace(/X/g, 'W')), 52, 62);
    p.ring(60, 80, 10, 4, 'W');
  });
  const head = art(120, 120, p => {
    p.path([[48, 20], [38, 10], [30, -2]], 'W'); p.path([[47, 22], [36, 12], [27, 2]], 'W'); p.path([[72, 20], [82, 10], [90, -2]], 'W'); p.path([[73, 22], [84, 12], [93, 2]], 'W');
    p.ell(48, 26, 7, 3, 'W'); p.ell(72, 26, 7, 3, 'W');
    p.ell(60, 26, 12, 13, 'W'); p.ell(60, 34, 7, 6, 'W');
    p.rect(53, 22, 3, 3, 'K'); p.rect(64, 22, 3, 3, 'K'); p.path([[52, 20], [57, 22]], 'K'); p.path([[68, 22], [63, 20]], 'K');
    p.ell(60, 32, 2, 1.5, 'K'); p.path([[57, 36], [60, 38], [63, 36]], 'K');
    p.path([[53, 26], [53, 30]], 'G'); p.path([[67, 26], [67, 30]], 'G');
  });
  return (g, t) => {
    // ailes arc-en-ciel
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'hsl(' + ((t * 120 + i * 50) % 360) + ',100%,60%)';
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
        const a = (s < 0 ? Math.PI : 0) + s * (-0.6 + i * 0.22) + Math.sin(t * 2) * 0.05 * s, r = 30 + k * 6;
        g.fillRect(Math.round(60 + Math.cos(a) * r), Math.round(56 + Math.sin(a) * r * 0.8), 3, 3);
      }
    }
    put(g, robe, 0, bob(t, 2, 1)); put(g, head, 0, bob(t, 2, 1));
  };
});

// ---------- Sans (portage du fan game « Jugement Final ») ----------
const SANS = {};
(function buildSans() {
  const part = (w, h, draw) => { const p = new Pix(w, h); draw(p); return p.edge('K'); };
  function gHead(e) {
    const g = part(34, 31, p => { p.ell(17, 13.5, 16.5, 13.6, 'W'); p.poly([[2.5, 14], [31.5, 14], [31, 22], [28.5, 28], [25, 30.5], [9, 30.5], [5.5, 28], [3, 22]], 'W'); });
    if (e === 'closed') { g.rect(6, 14, 9, 1, 'K'); g.rect(19, 14, 9, 1, 'K'); g.set(5, 13, 'K'); g.set(28, 13, 'K'); g.set(15, 13, 'K'); g.set(18, 13, 'K'); }
    else {
      g.ell(10.5, 13.5, 4.8, 4.4, 'K');
      if (e === 'wink') { g.rect(19, 14, 9, 1, 'K'); g.set(18, 13, 'K'); g.set(28, 13, 'K'); } else g.ell(23.5, 13.5, 4.8, 4.4, 'K');
      if (e === 'normal' || e === 'wink') g.rect(10, 13, 2, 2, 'W');
      if (e === 'normal') g.rect(22, 13, 2, 2, 'W');
      if (e === 'blue' || e === 'yellow') { g.ell(10.5, 13.5, 3, 3, e === 'blue' ? 'B' : 'Y'); g.rect(10, 13, 2, 2, 'W'); }
      if (e === 'tired') { g.rect(10, 14, 2, 1, 'W'); g.rect(22, 14, 2, 1, 'W'); g.rect(6, 10, 9, 1, 'K'); g.rect(19, 10, 9, 1, 'K'); }
    }
    g.rect(15, 19, 4, 1, 'K'); g.rect(16, 20, 2, 1, 'K');
    for (let x = 6; x <= 27; x++) { const d = Math.abs(x + 0.5 - 17); g.set(x, 23 - (d > 8.5 ? 1 : 0) - (d > 10 ? 1 : 0), 'K'); }
    g.rect(4, 19, 1, 3, 'K'); g.rect(29, 19, 1, 3, 'K'); g.set(5, 22, 'K'); g.set(28, 22, 'K');
    for (let x = 8; x <= 25; x++) { const d = Math.abs(x + 0.5 - 17); g.set(x, 26 - (d > 7 ? 1 : 0), 'K'); }
    for (let x = 9; x <= 25; x += 3) g.rect(x, 24, 1, 2, 'K');
    g.set(6, 18, 'K'); g.set(7, 18, 'K'); g.set(26, 18, 'K'); g.set(27, 18, 'K');
    return g;
  }
  function gTorso(hurt) {
    const W2 = 52, H2 = 32, g = part(W2, H2, p => p.ell(26, 7, 18.5, 6.5, 'W'));
    for (const [x, y] of [[11, 5], [14, 3], [18, 2], [22, 1], [26, 1], [30, 1], [34, 2], [38, 3], [41, 5], [13, 8], [39, 8], [9, 8], [43, 8]]) g.set(x, y, 'K');
    g.over(part(W2, H2, p => p.poly([[7, 9], [45, 9], [50.5, 16], [50, 32], [2, 32], [1.5, 16]], 'W')));
    g.over(part(W2, H2, p => p.poly([[19.5, 10], [32.5, 10], [32, 32], [20, 32]], 'W')));
    for (let x = 22; x <= 30; x++) g.set(x, 11 + (Math.abs(x - 26) < 3 ? 1 : 0), 'K');
    g.over(part(W2, H2, p => p.poly([[1.5, 15], [12, 12], [15.5, 27], [3, 29]], 'W')));
    g.over(part(W2, H2, p => p.poly([[50.5, 15], [40, 12], [36.5, 27], [49, 29]], 'W')));
    g.rect(4, 26, 11, 1, 'K'); g.rect(37, 26, 11, 1, 'K');
    for (const x of [18, 34]) { g.rect(x, 10, 1, 9, 'K'); g.rect(x - 1, 19, 3, 3, 'K'); g.set(x, 20, 'W'); }
    g.rect(16, 25, 4, 1, 'K'); g.rect(32, 25, 4, 1, 'K'); g.rect(2, 29, 18, 1, 'K'); g.rect(32, 29, 18, 1, 'K');
    if (hurt) for (let k = 0; k < 3; k++) g.line(9 + k, 25, 41 + k, 10, 'R');
    return g;
  }
  function gLegs() {
    const g = new Pix(34, 23); g.poly([[4, 0], [30, 0], [31, 10.5], [19.5, 10.5], [17, 7], [14.5, 10.5], [3, 10.5]], 'K'); g.edge('W');
    g.rect(7, 1, 1, 9, 'W'); g.rect(26, 1, 1, 9, 'W');
    g.over(part(34, 23, p => { p.rect(10, 10, 4, 8, 'W'); p.rect(20, 10, 4, 8, 'W'); }));
    g.over(part(34, 23, p => { p.ell(10, 19.5, 7.5, 3.3, 'W'); p.ell(24, 19.5, 7.5, 3.3, 'W'); }));
    g.rect(9, 18, 3, 1, 'K'); g.rect(22, 18, 3, 1, 'K');
    return g;
  }
  function gArm() {
    const g = part(30, 14, p => p.poly([[0, 1], [17, 0.5], [19, 13], [0, 13]], 'W'));
    g.rect(15, 2, 1, 10, 'K');
    g.over(part(30, 14, p => { p.ell(22, 7, 3.6, 4, 'W'); p.rect(23, 3, 6, 2, 'W'); p.rect(23, 6, 7, 2, 'W'); p.rect(23, 9, 6, 2, 'W'); }));
    return g;
  }
  for (const e of ['normal', 'dark', 'blue', 'yellow', 'wink', 'closed', 'tired']) SANS['head_' + e] = gHead(e).canvas();
  SANS.arm = gArm().canvas(); SANS.torso = gTorso(false).canvas(); SANS.torsoHurt = gTorso(true).canvas(); SANS.legs = gLegs().canvas();
})();
const SANS_ARM = { right: -0.15, down: Math.PI / 4, left: Math.PI + 0.15, up: -Math.PI / 3 };
function drawSans(cx, baseY, sc, o = {}) {
  const t = time, still = o.still, tired = (o.sweat || 0) >= 2, spd = tired ? 0.55 : 1, px = v => Math.round(v) * sc;
  const sway = still ? 0 : Math.sin(t * 2.2 * spd) * 1.3, hsway = still ? 0 : Math.sin((t - 0.14) * 2.2 * spd) * 1.7;
  const breath = still ? 0 : (Math.sin(t * 4.4 * spd) > 0.25 ? 1 : 0), hbob = still ? 0 : Math.round(Math.sin(t * 4.4 * spd + 0.9));
  const talking = o.talking ? Math.floor(t * 10) % 2 : 0;
  let lx = 0, lyy = 0;
  if (o.arm) { const d = GDIR[o.arm]; lx = d[0] * 2; lyy = d[1] * 1.5; }
  const ly = baseY - 23 * sc;
  ctx.globalAlpha = o.alpha ?? 1;
  dImg(SANS.legs, cx - 17 * sc, ly, sc);
  const tx = cx - 26 * sc + px(sway + lx), ty = ly - 28 * sc + px(breath + lyy);
  dImg(o.hurt ? SANS.torsoHurt : SANS.torso, tx, ty, sc);
  if (o.arm) {
    const left = o.arm === 'left', sx = tx + (left ? 8 : 44) * sc, sy = ty + 13 * sc, a = SANS_ARM[o.arm];
    if (o.armT > 0.25) { ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.8, (o.armT - 0.25) * 4) + ')'; ctx.lineWidth = 2 * sc; ctx.beginPath(); left ? ctx.arc(sx, sy, 32 * sc, a + 0.15, a + 1.0) : ctx.arc(sx, sy, 32 * sc, a - 1.0, a - 0.15); ctx.stroke(); }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); if (left) ctx.scale(1, -1); ctx.drawImage(SANS.arm, -2 * sc, -7 * sc, 30 * sc, 14 * sc); ctx.restore();
  }
  const hx = cx - 17 * sc + px(hsway + lx * 1.4), hy = ty - 23 * sc + px(hbob - talking + (o.headDY || 0) + (tired ? 1 : 0) + lyy * 0.5);
  const eyes = o.eyes || 'normal';
  dImg(SANS['head_' + (tired && eyes === 'normal' ? 'tired' : eyes)] || SANS.head_normal, hx, hy, sc);
  if (eyes === 'blue' || eyes === 'yellow') {
    const ex = hx + 10.5 * sc, ey = hy + 13.5 * sc;
    for (let i = 0; i < 7; i++) {
      const ph = (t * 2.6 + i / 7) % 1, sz = Math.max(1, Math.round((1 - ph) * 4)) * sc;
      ctx.globalAlpha = (o.alpha ?? 1) * (1 - ph); ctx.fillStyle = i % 3 === 0 ? COL.yellow : COL.blue;
      ctx.fillRect(Math.round(ex - ph * 14 * sc - sz / 2 + Math.sin(ph * 9 + i) * sc), Math.round(ey - ph * 16 * sc - sz / 2), sz, sz);
    }
  }
  if (o.sweat) {
    ctx.fillStyle = '#6fd3ff';
    for (let i = 0; i < Math.ceil(o.sweat); i++) { const ph = (t * 0.7 + i * 0.33) % 1, side = i % 2 ? 1 : -1; ctx.globalAlpha = (o.alpha ?? 1) * (1 - ph); ctx.fillRect(Math.round(cx + side * 16 * sc + px(hsway)), Math.round(hy + 6 * sc + ph * 12 * sc), sc * 1.5, sc * 2.5); }
  }
  ctx.globalAlpha = 1;
  return { hx, hy };
}
