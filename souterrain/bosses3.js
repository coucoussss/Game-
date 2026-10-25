'use strict';
// ============================================================
//  bosses3.js : Asgore, Flowey Oméga, Asriel, Sans
// ============================================================
// ============================================================
//  ASGORE
// ============================================================
M('asgore', {
  name: 'Asgore', hp: 3500, atk: 8, df: 10, exp: 1500, gold: 0, h: 124, boss: true, voice: 'asgore', bubbleDX: 120, bubbleY: 20, bubbleW: 180,
  checkName: 'ASGORE', showAtk: 80, showDef: 80, check: '* Le roi du Souterrain.',
  acts: [{ n: 'Parler', t: E => E.acted.Parler >= 3 ? '* Vous dites à Asgore que vous ne voulez pas vous battre.\n* Il serre son trident... mais ses mains tremblent.' : '* Vous essayez de parler à Asgore.\n* Il ne vous répond pas.', run: E => { if (E.acted.Parler >= 2) { E.atk = Math.max(4, E.atk - 1); E.df = Math.max(0, E.df - 3); } } }],
  hurt(E, dmg) { if (isGenocide()) return E.hp; return dmg; },
  noDie: true,
  afterHit: function* (E) {
    if (E.hp > E.max * 0.2 || E.kneel) return;
    E.kneel = true; E.st.kneel = true; E.st.noTrident = true; Snd.stopMusic(1);
    prepSoul(); menuBox();
    yield* talk(E, ['...', 'Ah... je vois.', 'C\'est donc ainsi que cela finit.', 'Je... je ne mérite pas ta pitié.', 'Pourtant... je n\'ai plus la force de me battre.']);
    B.mercyBroken = false; B.flavorNext = '* Asgore est à genoux.'; E.spare = true; E.hp = Math.max(1, E.hp);
  },
  onDeath: function* (E) { yield* talk(E, ['...', 'Alors... tu as choisi.', 'Prends mon âme... et quitte cet endroit.', 'Pardon... pour tout.']); },
});
function asgoreAttack(A, E, n) {
  const k = () => A.k, kind = n % 4;
  A.box(200, 150); A.dur = 6;
  if (kind === 0) A.every(0.3, 5, 1.1, () => { const cx = B.soul.x, cy = B.soul.y; for (let j = 0; j < 10; j++) A.add(bul({ img: 'fire', r: 5, life: 2, clip: false, a: j * TAU / 10, upd: b => { const R = 110 - b.t * 70; b.x = cx + Math.cos(b.a + b.t * 1.5) * R; b.y = cy + Math.sin(b.a + b.t * 1.5) * R; if (R < 5) b.dead = true; } })); });
  else if (kind === 1) {
    A.every(0.4, 5.2, 1.2, i => {
      const col = Math.random() < 0.5 ? 'blue' : 'orange'; E.st.eye = col; Snd.ding();
      A.at(A.t + 0.5, () => { const kk = k(); A.add(bul({ x: kk.cx, y: kk.t - 10, w: kk.w + 20, h: 14, vy: 340, color: col, life: 1.2, clip: true })); Snd.whoosh(); });
      void i;
    });
  } else if (kind === 2) A.every(0.3, 5, 0.25, i => { const kk = k(), left = i % 2 === 0; A.fromSide(kk.cy + Math.sin(i * 0.7) * 50, 200, left, { img: 'fire', r: 5 }); });
  else A.every(0.3, 5, 0.14, () => { const kk = k(); A.add(bul({ x: rand(kk.l, kk.r), y: kk.t - 10, vy: 150, img: 'fire', r: 5, life: 3, upd: b => { b.x += Math.sin(b.t * 6) * 1.5; } })); });
}
const ASGORE_LINES = ['...', '...', 'Pardonne-moi.', '...', 'Ne fais pas cette tête.', 'Ce sera bientôt fini.', '...', 'Je suis désolé.'];
const ASGORE_BATTLE = {
  foes: ['asgore'], music: 'asgore', boss: true, bg: 'none', area: 'newhome',
  flavor() { return pick(['* Asgore se dresse devant vous.', '* Asgore fait tournoyer son trident.', '* Le vent fait voler la cape d\'Asgore.', '* Vous sentez de la détermination.']); },
  *start(B) {
    const E = B.foes[0];
    menuBox();
    yield* bossTalk(E, ['Humain...', 'Ce fut un plaisir de te connaître.', 'Adieu.']);
    // Asgore brise le bouton PITIÉ
    B.phase = 'post';
    Snd.whoosh(); yield 0.3; Snd.crack(); shake = 8; flash(0.5);
    B.mercyBroken = true;
    for (let i = 0; i < 14; i++) B.fx.push({ kind: 'shard', x: 555, y: 453, vx: rand(-120, 120), vy: rand(-260, -60), t: 0, life: 1.4, draw: f => { f.vy += 600 / 60; ctx.fillStyle = ORANGE; ctx.fillRect(Math.round(f.x), Math.round(f.y), 6, 6); } });
    yield 1;
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (E.kneel) { yield* bossTalk(E, ['...']); return; }
    yield* runAttack(E, A => asgoreAttack(A, E, E.turn), { lines: [ASGORE_LINES[E.turn % ASGORE_LINES.length]] });
    E.turn++;
  },
};

// ============================================================
//  FLOWEY OMÉGA (fin neutre)
// ============================================================
M('omega', { name: 'Flowey', hp: 6000, atk: 6, df: 0, exp: 0, gold: 0, h: 0, boss: true, voice: 'evil', bubbleDX: 150, bubbleY: 20, draw: () => {}, frame: () => floweyImg('evil'), checkName: 'FLOWEY', check: '* Il a pris les six ÂMES humaines.' });
const SOULS6 = [['Patience', 'cyan'], ['Bravoure', 'orange'], ['Intégrité', 'blue'], ['Persévérance', 'purple'], ['Bonté', 'green'], ['Justice', 'yellow']];
function omegaAttack(A, n) {
  const k = () => A.k, kind = n % 6;
  A.box(200, 140, 320, 318); A.dur = 6;
  if (kind === 0) A.every(0.3, 5, 0.75, () => { const kk = k(); for (let c = 0; c < 4; c++) { const x = kk.l + 20 + rint(0, 8) * 20; UND.pillar(A, x, 0.6, 0.3); } });
  else if (kind === 1) A.every(0.3, 5.2, 0.06, i => { const kk = k(), y = kk.cy + Math.sin(i * 0.12) * 50; A.fromSide(y, 260, true, { img: 'fire', r: 6, life: 2 }); });
  else if (kind === 2) A.every(0.3, 5, 1.2, () => A.ringIn(14, 110, 80, { img: 'seed', r: 4, life: 3, clip: false }));
  else if (kind === 3) A.every(0.3, 5, 0.35, i => { const x = i % 2 ? 60 : 580, y = 120; A.shot(x, y, A.aim(x, y) + rand(-0.15, 0.15), 230, { img: 'pellet', r: 4, clip: false, life: 4 }); });
  else if (kind === 4) A.every(0.3, 5, 0.9, () => { const kk = k(), x = rand(kk.l + 20, kk.r - 20), y = rand(kk.t + 20, kk.b - 20); A.add(bul({ x, y, img: 'cross', sc: 1.5, r: 0, harmless: true, life: 0.6, upd: b => { if (b.t > 0.55) { for (const d of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) A.shot(b.x, b.y, Math.atan2(d[1], d[0]), 260, { img: 'pellet', r: 4, life: 1.5 }); Snd.slam(); b.dead = true; } } })); });
  else { A.every(0.3, 5, 1.3, () => { const kk = k(), gy = rand(kk.t + 30, kk.b - 30); A.add(bul({ x: kk.cx, y: kk.t - 40, w: kk.w, h: 40, life: 1.2, upd: b => { b.y = lerp(kk.t - 40, gy - 34, Math.min(1, b.t / 0.6)); } })); A.add(bul({ x: kk.cx, y: kk.b + 40, w: kk.w, h: 40, life: 1.2, upd: b => { b.y = lerp(kk.b + 40, gy + 34, Math.min(1, b.t / 0.6)); } })); }); }
}
const OMEGA_BATTLE = {
  foes: ['omega'], music: 'omega', boss: true, bg: 'omega', area: 'newhome', noReward: true,
  drawBg(B) {
    const t = time;
    ctx.fillStyle = '#0c140c'; ctx.fillRect(0, 0, W, 250);
    // masse organique
    for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? '#3a4a2a' : '#2a3420'; const x = i * 48 - 10; ctx.fillRect(x, 140 + Math.sin(t * 2 + i) * 8, 40, 120); }
    for (const s of [-1, 1]) { ctx.fillStyle = '#5a5a5a'; for (let j = 0; j < 6; j++) ctx.fillRect(320 + s * (120 + j * 26) - 10, 40 + j * 22 + Math.sin(t * 3 + j) * 4, 24, 14); ctx.fillStyle = '#2f8a2f'; ctx.beginPath(); ctx.ellipse(320 + s * 250, 160, 46, 30 + Math.sin(t * 4) * 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; for (let x = -36; x <= 36; x += 12) { ctx.beginPath(); ctx.moveTo(320 + s * 250 + x - 4, 160); ctx.lineTo(320 + s * 250 + x + 4, 160); ctx.lineTo(320 + s * 250 + x, 172); ctx.fill(); } }
    // écran de télévision avec le visage de Flowey
    ctx.fillStyle = '#6a6a6a'; ctx.fillRect(220, 10, 200, 150); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(232, 20, 176, 128);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(0,0,0,' + rand(0.05, 0.2) + ')'; ctx.fillRect(232, 20 + rint(0, 127), 176, 1); }
    const g = B.foes[0] && B.foes[0].hp < 1000;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(285, 70, 22, g ? 8 : 18, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(355, 70, 22, g ? 8 : 18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(282, 66, 6, 6); ctx.fillRect(352, 66, 6, 6);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(320, 118 + Math.sin(t * 6) * 3, 60, 18 + Math.sin(t * 6) * 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; for (let x = -52; x <= 52; x += 10) { ctx.beginPath(); ctx.moveTo(320 + x - 4, 104); ctx.lineTo(320 + x + 4, 104); ctx.lineTo(320 + x, 114); ctx.fill(); ctx.beginPath(); ctx.moveTo(320 + x - 4, 134); ctx.lineTo(320 + x + 4, 134); ctx.lineTo(320 + x, 124); ctx.fill(); }
    // âmes libérées
    (B.saved || []).forEach((c, i) => drawHeart(40 + i * 24, 230, c));
  },
  *start(B) {
    const E = B.foes[0]; B.saved = [];
    yield* bossTalk(E, ['Howdy !', 'Tu croyais vraiment que c\'était fini ?', 'Les six ÂMES humaines sont à MOI maintenant.', 'Et avec elles... je suis un DIEU !', 'Je vais te détruire...', '...encore et encore et ENCORE !'], { voice: 'evil' });
  },
  onDeath(B) { G.hp = maxHP(); B.endAttack = true; B.reload = (B.reload || 0) + 1; },
  playerTurn: function* (B) {
    const E = B.foes[0];
    if (B.saved.length >= 6 && !B.finalMenu) { B.finalMenu = true; B.flavorNext = '* Flowey est sans défense.'; }
    if (B.finalMenu) { yield* playerTurn(); return; }
    if (B.reload) { B.reload = 0; prepSoul(); yield* talk(E, ['Ha ha ha !', 'Je viens de RECHARGER ma sauvegarde !', 'Tu ne peux pas gagner, imbécile !'], { voice: 'evil' }); }
    yield;
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (B.finalMenu) { if (!E.gone) yield* bossTalk(E, pick([['...'], ['Vas-y... Fais-le.'], ['Pourquoi tu hésites ?']]), { voice: 'evil' }); return; }
    const n = E.turn;
    yield* runAttack(E, A => omegaAttack(A, n), { lines: n % 2 ? null : [pick(['Ha ha ha !', 'Tu vas souffrir !', 'Je suis ton pire cauchemar !', 'Meurs ! MEURS !'])], talkOpts: { voice: 'evil' } });
    E.turn++;
    if (B.reload) return;
    if (E.turn % 2 === 0 && B.saved.length < 6) {
      // Une âme humaine résiste : touchez le bouton AGIR pour l'appeler à l'aide
      const [nm, col] = SOULS6[B.saved.length];
      menuBox();
      yield* boxText('* Vous appelez à l\'aide...');
      setBox(200, 140, 320, 318); prepSoul(); yield () => boxReady();
      const A = new Runner(E); A.dur = 99;
      let got = false;
      const btn = A.add(bul({ x: 320 + rand(-60, 60), y: 300, w: 40, h: 18, harmless: false, life: 99, hit: (b, s) => overlap(b.x - 20, b.y - 9, 40, 18, s.x - HB, s.y - HB, HB * 2, HB * 2),
        onHit: () => { got = true; }, dmg: 0, draw: b => { ctx.fillStyle = ORANGE; ctx.fillRect(b.x - 20, b.y - 9, 40, 18); ctx.fillStyle = '#000'; ctx.fillRect(b.x - 18, b.y - 7, 36, 14); text('AGIR', b.x - 16, b.y - 4, { sx: 1, sy: 1, color: ORANGE }); } }));
      btn.color = 'white';
      B.phase = 'attack'; B.runners = [A]; A.started = true; B.atkT = 0;
      const hp0 = G.hp; yield () => got || B.atkT > 8; G.hp = hp0;
      B.bullets = []; B.runners = []; B.phase = 'post';
      flash(0.7, SOULC[col]); Snd.soul();
      B.saved.push(col);
      G.hp = maxHP();
      const dmg = 1000;
      E.hp = Math.max(0, E.hp - dmg); E.white = 1; Snd.damage(); shake = 6;
      B.fx.push({ kind: 'dmg', x: 320, y: 60, y0: 60, vy: -200, val: dmg, from: E.hp + dmg, to: E.hp, max: E.max, t: 0, life: 1.2 });
      menuBox(); yield* boxText('* L\'ÂME de la ' + nm + ' vous vient en aide !\n* Vos PV sont restaurés.\n* Flowey est blessé !');
    }
  },
  *end(B, result) {
    if (result === 'spared') { G.flags.floweySpared = true; }
  },
};

// ============================================================
//  ASRIEL DREEMURR (fin pacifiste)
// ============================================================
M('asriel', {
  name: 'Asriel', hp: 99999, atk: 5, df: 99, exp: 0, gold: 0, h: 120, boss: true, voice: 'asriel', bubbleDX: 110, bubbleY: 20,
  checkName: 'ASRIEL DREEMURR', showAtk: '∞', showDef: '∞', check: '* Le dieu de l\'Hypermort.',
  acts: [
    { n: 'Lutter', t: '* Vous luttez de toutes vos forces.\n* Rien ne se passe.' },
    { n: 'Espérer', t: '* Vous espérez.\n* Vous vous sentez un peu mieux.', run: () => { G.hp = Math.min(maxHP(), G.hp + 15); Snd.heal(); } },
    { n: 'Rêver', t: '* Vous rêvez d\'un monde meilleur.\n* Vos PV sont restaurés.', run: () => { G.hp = maxHP(); Snd.heal(); } },
  ],
  *onFight(E) { yield* boxText('* Votre attaque ne lui fait rien.'); return 'handled'; },
});
function asrielAttack(A, n) {
  const k = () => A.k, kind = n % 5;
  A.box(220, 150); A.dur = 6;
  if (kind === 0) A.every(0.3, 5, 0.5, () => { const kk = k(), x = rand(kk.l + 20, kk.r - 20); A.add(bul({ x, y: kk.t - 10, vy: 180, img: 'star', sc: 1.6, r: 7, life: 3, upd: b => { if (b.y > kk.cy && !b.boom) { b.boom = true; b.dead = true; for (let j = 0; j < 6; j++) A.shot(b.x, b.y, j * TAU / 6, 140, { img: 'star', r: 4, life: 2, tint: '#ffe23c' }); } } })); });
  else if (kind === 1) A.every(0.3, 5, 1.1, i => { const kk = k(), left = i % 2 === 0; A.add(bul({ x: left ? kk.l - 60 : kk.r + 60, y: kk.cy, w: 140, h: 14, vx: left ? 320 : -320, vr: 0, life: 1.4, fill: '#ff60ff', upd: b => { b.y = kk.cy + Math.sin(b.t * 8) * 40; } })); });
  else if (kind === 2) A.every(0.3, 5, 0.12, i => { const x = 320 + Math.cos(i * 0.5) * 140, y = 120; A.shot(x, y, A.aim(x, y) + rand(-0.2, 0.2), 220, { img: 'pellet', r: 4, clip: false, life: 3, tint: 'hsl(' + (i * 30 % 360) + ',100%,70%)' }); });
  else if (kind === 3) A.every(0.3, 5, 0.6, i => A.laser({ vert: true, x: rand(k().l + 16, k().r - 16), warn: 0.5, on: 0.3, thick: 18, color: i % 3 === 2 ? 'blue' : 'white' }));
  else { // Hyper Goner : l'âme est aspirée vers le centre
    A.box(260, 160); A.dur = 6.5;
    A.at(0.2, () => A.add(bul({ kind: 'goner', harmless: true, x: 320, y: 120, life: 7, clip: false, upd: (b, dt) => { const s = B.soul; s.x += (b.x - s.x) * 0.25 * dt; s.y += (b.y - s.y) * 0.25 * dt; }, draw: b => { ctx.save(); ctx.globalAlpha = 0.9; dImg(shape('blTopOpen'), b.x - 80, b.y - 68, 4); ctx.restore(); } })));
    A.every(0.5, 6, 0.08, i => { const a = i * 0.7, R = 200; A.add(bul({ x: 320 + Math.cos(a) * R, y: 300 + Math.sin(a) * R, img: 'pellet', r: 4, clip: false, life: 3, upd: (b, dt) => { const dx = 320 - b.x, dy = 120 - b.y, d = Math.hypot(dx, dy) || 1; b.vx = dx / d * 160 + Math.cos(a + Math.PI / 2) * 60; b.vy = dy / d * 160 + Math.sin(a + Math.PI / 2) * 60; if (d < 20) b.dead = true; } })); });
  }
}
const LOST = [
  { who: 'Undyne et Alphys', lines: ['Je... me battrai pour lui.', 'Il ne faut pas que tu gagnes...'], act: '* Vous rappelez à Undyne son courage, et à Alphys sa gentillesse.\n* Elles se souviennent de vous.' },
  { who: 'Papyrus et Sans', lines: ['JE... DOIS TE CAPTURER ?', 'heh... t\'es qui, déjà ?'], act: '* Vous racontez une blague nulle et parlez de spaghettis.\n* Ils se souviennent de vous.' },
  { who: 'Toriel et Asgore', lines: ['Mon enfant... reste avec nous.', 'Ne pars pas...'], act: '* Vous les serrez dans vos bras.\n* Ils se souviennent de vous.' },
];
const ASRIEL_BATTLE = {
  foes: ['asriel'], music: 'asriel', boss: true, bg: 'rainbow', area: 'newhome', noReward: true,
  drawBg(B) { for (let y = 0; y < 250; y += 10) { ctx.fillStyle = 'hsla(' + ((time * 40 + y) % 360) + ',80%,40%,0.25)'; ctx.fillRect(0, y, W, 10); } },
  onDeath(B) { if (!B.refused) { B.refused = true; } G.hp = 1; B.endAttack = true; B.refuse = true; },
  *start(B) { const E = B.foes[0]; B.savedN = 0; yield* bossTalk(E, ['Enfin...', 'Me voici sous ma vraie forme.', 'Avec toutes les ÂMES du Souterrain, je peux tout réécrire.', 'Alors... JOUONS !']); },
  playerTurn: function* (B) {
    const E = B.foes[0];
    if (B.refuse) { B.refuse = false; G.hp = maxHP(); menuBox(); yield* boxText('* Mais vous refusez d\'abandonner.'); }
    if (E.turn < 5) { yield* playerTurn(); return; }
    // Phase « SAUVER »
    const opts = LOST.map((l, i) => ({ t: '* ' + l.who, col: B['lost' + i] ? '#808080' : '#fff', i })).concat([{ t: '* Asriel', col: B.savedN >= 3 ? YELLOW : '#808080', i: 3 }]);
    B.phase = 'menu'; menuBox(); B.flavor = new Typer(wrap('* Il vous reste encore quelqu\'un à SAUVER.', 32));
    for (;;) {
      yield;
      B.flavor.update(1 / 60);
      if (hit('z')) {
        Snd.select(); B.sub = 3;
        const r = yield* listMenu(opts, { cols: 1, per: 4 }); if (r < 0) continue;
        const o = opts[r];
        if (o.i < 3) {
          if (B['lost' + o.i]) { yield* boxText('* Vous les avez déjà sauvés.'); return; }
          yield* bossTalk(E, LOST[o.i].lines, { voice: 'monster' });
          yield* runAttack(E, A => asrielAttack(A, o.i));
          menuBox(); yield* boxText(LOST[o.i].act);
          B['lost' + o.i] = true; B.savedN++; Snd.soul(); flash(0.5);
          return;
        }
        if (B.savedN < 3) { yield* boxText('* Pas encore...'); return; }
        B.saveAsriel = (B.saveAsriel || 0) + 1;
        yield* boxText(['* Vous tendez la main vers Asriel.', '* Vous lui dites que tout ira bien.', '* Vous refusez de vous battre.'][Math.min(2, B.saveAsriel - 1)]);
        return;
      }
    }
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (B.saveAsriel >= 3) {
      Snd.stopMusic(2); prepSoul(); menuBox();
      yield* talk(E, ['Pourquoi...', 'Pourquoi tu ne te bats pas ?', 'Je... je voulais juste...', '...que tu restes avec moi.', 'Je suis désolé.', 'J\'avais si peur que tu partes.', 'Merci... de m\'avoir sauvé, moi aussi.'], { speed: 20 });
      E.spared = true; E.gone = true; E.fadeT = 0.001; Snd.spare(); flash(1);
      B.forceEnd = true; B.result = 'saved'; return;
    }
    if (B.saveAsriel) { yield* runAttack(E, A => asrielAttack(A, 2 + B.saveAsriel), { lines: [['Arrête !', 'Pourquoi tu fais ça ?!', 'ARRÊÊÊTE !!!'][Math.min(2, B.saveAsriel - 1)]] }); return; }
    const L = ['Shooting Star Blazing !', 'Chaos Saber !', 'Chaos Buster !', 'Shocker Breaker !', 'HYPER GONER !'];
    yield* runAttack(E, A => asrielAttack(A, E.turn), { lines: E.turn < 5 ? [L[E.turn]] : null });
    E.turn++;
  },
};

// ============================================================
//  SANS (route génocide) — portage du fan game « Jugement Final »
// ============================================================
M('sans', {
  name: 'Sans', hp: 1, atk: 1, df: 1, exp: 50000, gold: 0, h: 74, boss: true, voice: 'sans', font: 'sans', bubbleDX: 64, bubbleY: 62, bubbleW: 202,
  checkName: 'SANS', check: '* L\'ennemi le plus facile.\n* Ne peut infliger que 1 dégât.',
  dodge: () => !B.sansFinal,
  draw(E) {
    const s = E.st, flick = Math.floor(time * 12) % 2 ? 'yellow' : 'blue';
    let eyes = s.sleep ? 'closed' : (s.eyeT > 0 || s.glow) ? flick : s.eyes || 'normal';
    if (eyes === 'blue') eyes = flick;
    const o = { eyes, sweat: s.sweat, arm: s.arm, armT: s.armT, hurt: s.hurt, still: s.sleep || s.hurt, alpha: E.alpha, headDY: s.sleep ? 2 + Math.round(Math.sin(time * 1.5)) : 0, talking: B.bubbles.length && !B.bubbles[0].ty.done };
    if (E.dodgeT >= 0 && E.dodgeT < 1.05) for (const kk of [0.66, 0.33]) drawSans(320 + (E.dx || 0) * kk, 236, 2, { ...o, alpha: 0.22 * E.alpha });
    drawSans(320 + (E.dx || 0), 236, 2, o);
    if (s.sleep && !s.hurt) for (let i = 0; i < 3; i++) { const ph = (time * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; text('Z', 360 + ph * 30, 90 - ph * 40, { sx: 1 + ph, sy: 1 + ph }); ctx.globalAlpha = 1; }
  },
  frame: () => { const c = blank(80, 120); return c; },
  tick: (E, dt) => { const s = E.st; if (s.eyeT > 0) s.eyeT -= dt; if (s.armT > 0) { s.armT -= dt; if (s.armT <= 0) s.arm = null; } },
});
const SANS_O = { voice: 'sans', font: 'sans' };
// Lanceur dédié : mêmes primitives que le jeu d'origine (boîte ancrée en bas à y = 385)
class SRunner extends Runner {
  get k() { return boxOf(B.boxT); }
  boxTo(w, h) { setBox(w, h, 320, 385 - h / 2); }
  setSoul(m, g = 'down') { setSoul(m, { grav: g }); if (m === 'blue') this.E.st.eyeT = 0.6; }
  slam(d) { slamSoul(d); const s = this.E.st; s.arm = d; s.armT = 0.45; s.eyeT = 0.4; }
  placeSoul(x, y, p) { const s = B.soul; s.x = x; s.y = y; s.plat = p || null; s.grounded = !!p; s.gv = 0; }
  aimed(R = 175, o) { return this.aimedBlaster(R, o); }
  rain() { const k = this.k; this.add(mkBone({ x: k.l + Math.random() * (k.w - 10), y: k.t - 40, w: 10, h: 30, vy: 200 + Math.random() * 90 })); }
  spikes(h = 16, speed = 70) {
    const b = bul({ kind: 'spikes', clip: true, off: 0, kr: 1, life: 99 });
    b.upd = (bb, dt) => { bb.vx = 0; bb.vy = 0; bb.off = (bb.off + speed * dt) % 13; };
    b.hit = (bb, s) => overlap(B.box.l, B.box.b - h + 3, B.box.r - B.box.l, h, s.x - HB, s.y - HB, HB * 2, HB * 2);
    b.draw = bb => { for (let x = B.box.l - 13 + (13 - bb.off); x < B.box.r + 13; x += 13) drawBone(x, B.box.b - h, 9, h + 10, 'white'); };
    return this.add(b);
  }
  stab(side, depth, warn, hold) {
    const k = boxOf(B.boxT);
    const region = e => side === 'down' ? [k.l, k.b - e, k.w, e] : side === 'up' ? [k.l, k.t, k.w, e] : side === 'left' ? [k.l, k.t, e, k.h] : [k.r - e, k.t, e, k.h];
    Snd.warn();
    const b = bul({ kind: 'stab', clip: true, ext: 0, kr: 1, life: 99 });
    b.upd = bb => {
      bb.vx = 0; bb.vy = 0; const t = bb.t - warn;
      if (t < 0) bb.ext = 0; else { if (!bb.snd) { bb.snd = 1; Snd.stab(); } if (t < 0.07) bb.ext = depth * t / 0.07; else if (t < 0.07 + hold) bb.ext = depth; else if (t < 0.22 + hold) bb.ext = depth * (1 - (t - 0.07 - hold) / 0.15); else bb.dead = true; }
    };
    b.hit = (bb, s) => bb.ext > 3 && overlap(...region(bb.ext - 2), s.x - HB, s.y - HB, HB * 2, HB * 2);
    b.draw = bb => {
      if (bb.t < warn) { if (Math.floor(bb.t * 14) % 2 === 0) { ctx.strokeStyle = COL.red; ctx.lineWidth = 2; const [x, y, w, h] = region(depth); ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); text('!', x + w / 2 - 8, y + h / 2 - 12, { sx: 2, sy: 3, color: '#ff0000' }); } return; }
      const e = bb.ext;
      if (side === 'down' || side === 'up') for (let x = k.l + 3; x < k.r - 4; x += 13) drawBone(x, side === 'down' ? k.b - e : k.t - 12, 9, e + 12, 'white');
      else for (let y = k.t + 3; y < k.b - 4; y += 13) drawBone(side === 'left' ? k.l - 12 : k.r - e, y, e + 12, 9, 'white');
    };
    return this.add(b);
  }
  gaps(seq, t0, dt, speed, flipAt = 7) {
    seq.forEach((s, i) => this.at(t0 + i * dt, k => {
      const right = i < flipAt, vx = right ? -speed : speed, x = right ? k.r + 4 : k.l - 14;
      if (s === 'lo') this.floorBone(x, 24, vx); else if (s === 'tall') this.floorBone(x, 46, vx); else if (s === 'ceil') this.ceilBone(x, k.h - 32, vx); else if (s === 'blue') this.wall(x, vx, 'blue');
    }));
  }
}
const SDIRS = ['down', 'left', 'up', 'right'];
function slamSeq(A, n, t0, gaps, stabUntil = n, blasterEvery = 0) {
  let prev = B.soul.grav, t = t0;
  for (let i = 0; i < n; i++) {
    let d; do d = SDIRS[(Math.random() * 4) | 0]; while (d === prev);
    prev = d; const tt = t;
    A.at(tt, () => A.slam(d));
    if (i < stabUntil) A.at(tt + 0.2, () => A.stab(d, 25, 0.33, 0.24));
    if (blasterEvery && i % blasterEvery === blasterEvery - 1) A.at(tt + 0.45, () => A.aimed(170));
    t += typeof gaps === 'function' ? gaps(i) : gaps;
  }
  return t;
}
const SATK = {
  opening: { box: [280, 135], soul: 'blue', start: 'center', dur: 7.2, run(A) {
    A.at(0, () => A.slam('down')); A.at(0.4, () => A.stab('down', 30, 0.45, 0.4));
    A.at(1.75, k => { A.blaster(k.l - 70, k.t + 26, 0); A.blaster(k.r + 70, k.t + 26, Math.PI); });
    A.at(2.6, k => { A.blaster(k.l + 36, k.t - 80, Math.PI / 2); A.blaster(k.r - 36, k.t - 80, Math.PI / 2); });
    A.at(3.5, () => A.setSoul('red'));
    A.at(3.6, k => A.blaster(k.cx, k.t - 95, Math.PI / 2, { size: 2.4 }));
    A.at(4.4, k => A.blaster(k.l - 95, k.cy, 0, { size: 2.4 }));
    A.at(5.2, k => { for (const [x, y] of [[k.l - 60, k.t - 60], [k.r + 60, k.t - 60], [k.l - 60, k.b + 60], [k.r + 60, k.b + 60]]) A.blaster(x, y, Math.atan2(k.cy - y, k.cx - x)); });
  } },
  boneGaps: { box: [300, 140], soul: 'blue', dur: 8.6, run(A) { A.gaps(['lo', 'lo', 'tall', 'ceil', 'lo', 'blue', 'lo', 'tall', 'ceil', 'blue', 'lo', 'lo', 'tall'], 0.5, 0.55, 230); } },
  blasterCircle: { box: [150, 145], soul: 'red', dur: 6.8, run(A) {
    for (let i = 0; i < 9; i++) A.at(0.35 + i * 0.45, () => A.aimed(175));
    A.at(4.7, k => { for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + Math.PI / 4, x = k.cx + Math.cos(a) * 190, y = k.cy + Math.sin(a) * 190; A.blaster(x, y, A.aim(x, y), { delay: 0.7 }); } });
  } },
  blueWall: { box: [300, 140], soul: 'red', dur: 8.4, run(A) { for (let i = 0; i < 10; i++) A.at(0.4 + i * 0.7, k => { const right = i < 5, vx = right ? -210 : 210, x = right ? k.r + 4 : k.l - 14; if (i % 2 === 0) A.gapPair(x, k.t + 30 + Math.random() * (k.h - 60), 44, vx); else A.wall(x, vx, 'blue'); }); } },
  boneRain: { box: [220, 140], soul: 'red', dur: 7, run(A) { A.every(0.3, 5.6, 0.12, () => A.rain()); A.every(2.8, 5.6, 0.45, i => { const k = A.k, l = i % 2 === 0; A.add(mkBone({ x: l ? k.l - 40 : k.r + 10, y: k.t + 10 + Math.random() * (k.h - 30), w: 30, h: 10, vx: l ? 230 : -230 })); }); } },
  platforms: { box: [420, 140], soul: 'blue', start: 'none', dur: 9.6, run(A) {
    A.at(0, k => { A.spikes(); const p = A.platform(k.cx - 70, k.b - 42, 140, -38); A.placeSoul(k.cx, p.y - 8, p); });
    A.every(0.5, 8.6, 1.1, i => { const k = A.k; A.platform(k.r + 2, k.b - (i % 2 ? 44 : 76), 80, -100); });
    A.at(4.2, k => A.blaster(k.r + 80, k.t + 22, Math.PI)); A.at(7.2, k => A.blaster(k.l - 80, k.t + 22, 0));
  } },
  slamCombo: { box: [180, 150], soul: 'blue', dur: 7.6, run(A) { ['left', 'up', 'right', 'down', 'left', 'up'].forEach((d, i) => { const t = 0.3 + i * 1.15; A.at(t, () => A.slam(d)); A.at(t + 0.22, () => A.stab(d, 26, 0.36, 0.28)); }); } },
  boneTunnel: { box: [300, 140], soul: 'red', dur: 7.8, run(A) { A.every(0.3, 6.4, 0.14, i => { const k = A.k; A.gapPair(k.r + 4, k.cy + Math.sin(i * 0.26) * 38, 50, -240); }); } },
  blasterBurst: { box: [240, 140], soul: 'red', dur: 7.2, run(A) {
    A.at(0.3, k => shuffle([k.t + 24, k.cy, k.b - 24]).forEach((y, j) => A.at(A.t + j * 0.3, () => A.blaster(j % 2 ? A.k.r + 80 : A.k.l - 80, y, j % 2 ? Math.PI : 0))));
    A.at(1.6, k => shuffle([k.l + 30, k.cx, k.r - 30]).forEach((x, j) => A.at(A.t + j * 0.3, () => A.blaster(x, A.k.t - 90, Math.PI / 2))));
    A.every(3.0, 5.2, 0.4, () => A.aimed(180));
    A.at(5.5, k => A.blaster(k.cx, k.t - 110, A.aim(k.cx, k.t - 110), { size: 3.2, delay: 0.8 }));
  } },
  combo1: { box: [300, 140], soul: 'blue', dur: 9, run(A) { A.gaps(['lo', 'tall', 'lo', 'ceil', 'lo', 'lo', 'tall', 'blue', 'lo', 'ceil', 'lo', 'tall', 'lo', 'lo'], 0.4, 0.48, 270); A.every(1.2, 7.6, 1.6, () => { const k = A.k; A.blaster(clamp(B.soul.x, k.l + 20, k.r - 20), k.t - 100, Math.PI / 2); }); } },
  platforms2: { box: [420, 140], soul: 'blue', start: 'none', dur: 10, run(A) {
    A.at(0, k => { A.spikes(); const p = A.platform(k.cx - 70, k.b - 42, 140, -50); A.placeSoul(k.cx, p.y - 8, p); });
    A.every(0.4, 9, 0.95, i => { const k = A.k; A.platform(k.r + 2, k.b - (i % 2 ? 44 : 78), 70, -120); });
    A.every(2.2, 9, 2.2, i => { const k = A.k; A.blaster(k.r + 80, i % 2 === 0 ? k.b - 60 : k.t + 20, Math.PI, { delay: 0.75 }); });
  } },
  crossSweep: { box: [240, 140], soul: 'red', dur: 8.6, run(A) {
    A.every(0.3, 3.9, 0.85, () => { const k = A.k, gx = k.l + 30 + Math.random() * (k.w - 60), gap = 48; A.add(mkBone({ x: k.l - 4, y: k.t - 12, w: gx - gap / 2 - k.l + 4, h: 10, vy: 150 })); A.add(mkBone({ x: gx + gap / 2, y: k.t - 12, w: k.r - gx - gap / 2 + 4, h: 10, vy: 150 })); });
    A.every(4.2, 7.6, 0.8, () => { const k = A.k, gy = k.t + 25 + Math.random() * (k.h - 50), gap = 44; A.add(mkBone({ x: k.l - 12, y: k.t - 4, w: 10, h: gy - gap / 2 - k.t + 4, vx: 190 })); A.add(mkBone({ x: k.l - 12, y: gy + gap / 2, w: 10, h: k.b - gy - gap / 2 + 4, vx: 190 })); });
  } },
  slamCombo2: { box: [180, 150], soul: 'blue', dur: 9.4, run(A) { slamSeq(A, 8, 0.3, 0.95, 8, 2); } },
  blasterStorm: { box: [200, 145], soul: 'red', dur: 9, run(A) {
    let t = 0.3, gap = 0.6;
    while (t < 6.2) { A.at(t, () => A.aimed(180, { delay: 0.5 })); t += gap; gap = Math.max(0.26, gap * 0.9); }
    A.at(6.6, k => { for (const x of [k.l - 70, k.r + 70]) A.blaster(x, k.t - 70, Math.atan2(k.cy - k.t + 70, k.cx - x)); });
    A.at(7.3, k => { A.blaster(k.cx, k.t - 90, Math.PI / 2); A.blaster(k.l - 90, k.cy, 0); });
  } },
  final: { box: [180, 150], soul: 'blue', dur: 31, run(A) {
    A.at(0, () => { A.E.st.glow = true; });
    slamSeq(A, 12, 0.4, 0.85, 12, 3);
    A.at(11, () => { A.setSoul('red'); A.boxTo(220, 140); });
    A.every(11.4, 18.8, 0.13, () => A.rain());
    A.every(11.8, 18.8, 0.75, () => A.aimed(180));
    A.at(19.2, () => { A.boxTo(180, 150); A.setSoul('blue', 'down'); A.E.st.glow = false; });
    const gaps = [1.0, 1.15, 1.35, 1.6, 1.9, 2.3];
    A.at(19.6, () => slamSeq(A, 6, A.t + 0.1, i => gaps[i], 4));
    A.every(19.7, 30, 1.2, i => { A.E.st.sweat = Math.min(3, 1 + i * 0.4); });
  } },
};
const SANS_TURNS = [
  { atk: 'boneGaps', lines: ['quoi ? tu croyais que j\'allais rester planté là à encaisser ?'] },
  { atk: 'blasterCircle', lines: ['tu sais, les lignes du temps font n\'importe quoi depuis un moment.', 'ça avance... ça recule... ça s\'arrête net...', 'puis ça recommence.', '[dark]et je parie que c\'est toi qui tiens la télécommande.'] },
  { atk: 'blueWall', lines: ['j\'arrive même plus à me rappeler la dernière fois où j\'ai fait un effort.', 'faut croire que t\'es une exception.'] },
  { atk: 'boneRain', lines: ['tu veux que je te dise un secret ?', 'je suis pas du genre bagarreur.', 'mais tu m\'as pas vraiment laissé le choix.'] },
  { atk: 'platforms', lines: ['t\'as remarqué ? tu te bats contre un squelette.', 'c\'est quand même un peu os-é.', '[wink]heh.'] },
  { atk: 'slamCombo', lines: ['mon frère disait que n\'importe qui peut devenir quelqu\'un de bien.', 'qu\'il suffit d\'essayer.', '[closed]...il disait plein de trucs, papyrus.'] },
  { atk: 'boneTunnel', lines: ['une question, gamin.', 'pourquoi tu continues ?', 'y a plus rien à gagner ici. plus personne à sauver.'] },
  { atk: 'blasterBurst', lines: ['tu sais ce qui est drôle ?', 'dans une autre timeline, on aurait pu être potes.', '[closed]...on l\'a peut-être même été.'] },
  { spare: true, lines: ['[closed]...', 't\'as l\'air crevé, gamin.', 'écoute. je crois qu\'il reste un peu de bon en toi.', 'quelque part, tout au fond.', 'alors faisons une pause, d\'accord ?', 'si on est vraiment amis...', '...tu vas m\'épargner.'] },
  { atk: 'combo1', lines: ['[dark]bon.', 'visiblement, la gentillesse c\'est pas ton truc.', '[dark]alors passons aux choses sérieuses.'] },
  { atk: 'platforms2', lines: ['tu sais, je fais jamais de promesses.', 'mais j\'en ai fait une, un jour.', 'à une dame, derrière une porte.', '[dark]sans elle, tu serais déjà poussière à l\'endroit où tu te tiens.'] },
  { atk: 'crossSweep', lines: ['c\'est épuisant, tu sais ?', 'les resets. tout qui repart à zéro.', 'un jour, j\'ai arrêté d\'essayer.', 'et franchement ? je me sentais mieux.'] },
  { atk: 'slamCombo2', lines: ['mais toi...', 'toi, tu reviens toujours.', 'encore et encore et encore.', 'qu\'est-ce que tu cherches ? la fin ? le score ?'] },
  { atk: 'blasterStorm', lines: ['...', 'heh. pas de réponse.', '[closed]évidemment.'] },
  { atk: 'final', final: true, lines: ['ok.', 'on dirait que t\'as compris le principe.', 'alors on y va.', '[blue]survis à ÇA, et je te montrerai mon attaque spéciale !'] },
];
const SANS_FLAVOR = ['* Tu sens que tu vas passer un sale moment.', '* Sans t\'observe, les mains dans les poches.', '* Le hall baigne dans une lumière dorée.', '* Tu entends un oiseau chanter, très loin.', '* Sans se gratte le crâne.\n* Il a l\'air de s\'ennuyer.',
  '* Ça sent le ketchup.', '* Sans sourit. Il sourit toujours.', '* Tes péchés pèsent lourd sur tes épaules.', '* Sans hésite.', '* Sans t\'offre sa clémence.', '* Sans commence à transpirer.', '* Sans a l\'air fatigué.', '* Sans halète.', '* Le silence est assourdissant.', '* Sans prépare son attaque spéciale.'];
function* sansTalk(E, lines) {
  for (const l of [].concat(lines)) { const m = /^\[(\w+)\]/.exec(l); E.st.eyes = m ? m[1] : 'normal'; yield* talk(E, m ? l.slice(m[0].length) : l, SANS_O); }
  E.st.eyes = 'normal';
}
function* sansAttack(E, name) {
  const def = SATK[name], A = new SRunner(E);
  A.boxTo(...def.box); A.dur = def.dur;
  B.bullets = [];
  setSoul(def.soul, { silent: def.start === 'center' });
  if (def.soul === 'blue') E.st.eyeT = 0.6;
  const k = boxOf(B.boxT);
  if (def.soul === 'blue' && !def.start) { B.soul.x = 320; B.soul.y = k.b - 8; }
  if (def.start === 'center') { B.soul.x = 320; B.soul.y = k.cy; }
  B.soul.visible = true;
  yield () => boxReady();
  def.run(A);
  B.phase = 'attack'; B.runners = [A]; A.started = true; B.atkT = 0;
  yield () => B.dead || B.atkT >= A.dur;
  B.phase = 'post'; B.runners = []; B.bullets = []; E.st.arm = null; E.st.glow = false;
  setSoul('red', { silent: true });
}
function sansIntro() {
  const d = store.get('sansDeaths', 0);
  if (d === 0) return ['il paraît que dehors, le ciel est d\'un bleu parfait.', 'les oiseaux chantent. le vent joue dans les fleurs.', 'par une journée pareille...', '[dark]les gamins comme toi devraient brûler en enfer.'];
  if (store.get('sansDunked', false)) return ['...', '[dark]si on était vraiment amis...', '[dark]tu serais pas revenu.'];
  if (d === 1) return ['t\'as une drôle de tête.', 'comme si tu venais de vivre un truc horrible.', '[wink]...non ? bon. on y va.'];
  if (d === 2) return ['laisse-moi deviner.', 'c\'est pas ta première fois ici, hein ?', '[dark]moi non plus.'];
  if (d < 10) return ['on en est à ' + d + ' tentatives, gamin.', '[wink]je commence à m\'attacher.'];
  return [d + ' tentatives.', 'à ce stade, c\'est plus de la détermination.', '[wink]c\'est de l\'entêtement.'];
}
const SANS_BATTLE = {
  foes: ['sans'], music: 'sans', boss: true, bg: 'none', area: 'newhome', kr: true, noReward: true,
  goLines: [['Ce n\'est pas encore fini...', '{N} !', 'Garde ta détermination...']],
  flavor(B) { return B.sansFinal ? '* Sans dort.' : SANS_FLAVOR[Math.min(B.foes[0].turn, SANS_FLAVOR.length - 1)]; },
  *start(B) {
    const E = B.foes[0];
    store.set('sansDunked', false);
    B.def.goLinesHook = true;
    setBox(280, 135, 320, 385 - 67.5); prepSoul();
    yield* sansTalk(E, sansIntro());
    yield* sansAttack(E, 'opening');
  },
  *onMercy(B) {
    const E = B.foes[0];
    if (!B.spareOffer) { yield* boxText('* Vous épargnez Sans.'); return 'handled'; }
    // Le piège de la clémence
    B.spareOffer = false; setBox(120, 120, 320, 325); prepSoul(); yield () => boxReady();
    yield* sansTalk(E, ['heh heh heh...', '[wink]j\'savais que t\'avais ça en toi.', 'allez. viens là, mon pote.']);
    const A = new SRunner(E); for (const d of SDIRS) A.stab(d, 64, 0.02, 3);
    B.phase = 'attack'; B.runners = [A]; A.started = true; B.atkT = 0;
    store.set('sansDunked', true);
    yield* sansTalk(E, ['[dark]et HOP, au panier !!!']);
    for (;;) { G.hp -= 1; Snd.hurt(); if (G.hp <= 0) { die(); return 'handled'; } yield 0.02; }
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (B.sansFinal) return;
    const T = SANS_TURNS[Math.min(E.turn, SANS_TURNS.length - 1)];
    if (T.atk) { setBox(...SATK[T.atk].box, 320, 385 - SATK[T.atk].box[1] / 2); }
    prepSoul();
    yield* sansTalk(E, T.lines);
    if (T.spare) { E.turn++; B.spareOffer = true; return; }
    B.spareOffer = false;
    yield* sansAttack(E, T.atk);
    E.turn++;
    if (T.final) {
      // L'« attaque spéciale » : Sans ne finit jamais son tour
      Snd.stopMusic(1.2); E.st.sweat = 3; setBox(200, 140, 320, 315); prepSoul(); yield () => boxReady();
      yield* sansTalk(E, ['[closed]...', 'bon... ça y est.', 'tu vois ça ?', 'voilà mon attaque spéciale.', 'ouais. ça ressemble à rien.', 'parce que c\'est rien.', 'je vais juste... rester là.', 'si je finis jamais mon tour, tu pourras jamais jouer le tien.', 'alors on va attendre ici. ensemble.', '[closed]pour toujours.']);
      B.phase = 'attack'; B.runners = []; B.atkT = 0;
      yield 7; E.st.sleep = true; yield 3.5;
      // Pousser la boîte vers la gauche pour atteindre les boutons
      for (;;) {
        yield;
        const bt = B.boxT, so = B.soul;
        let mv = 18 / 60;
        if (down('left') && so.x <= B.box.l + 8.5) mv = -105 / 60;
        if (bt.r + mv > 630) mv = 630 - bt.r;
        bt.l += mv; bt.r += mv; B.box.l = bt.l; B.box.r = bt.r;
        if (bt.l <= 42) break;
      }
      B.sansFinal = true; B.phase = 'post'; Snd.select();
    }
  },
};
MON.sans.onFight = function* (E, dmg, res) {
  if (!B.sansFinal || res !== 'hit') return;
  B.fx.push({ kind: 'slash', x: E.x, y: 150, t: 0, life: 0.55 }); Snd.slash();
  yield 0.5; Snd.bigHit(); shake = 10; E.st.hurt = true;
  B.fx.push({ kind: 'dmg', x: 320, y: 30, y0: 30, vy: -120, val: 9999999, from: 1, to: 0, max: 1, t: 0, life: 2.2 });
  yield 2.4;
  menuBox();
  yield* sansTalk(E, ['[closed]...', 'bon.', 'on dirait que...', 'c\'est la fin.', '[closed]...', 'pas grave.', 'j\'ai fait ce que j\'ai pu.', 'je crois que je vais aller faire un tour chez grillby.', '[closed]papyrus...', '[closed]...tu veux quelque chose ?']);
  for (let i = 0; i < 120; i++) { E.alpha = Math.max(0, 1 - i / 100); if (i % 2) B.fx.push({ kind: 'dust', x: 320 + rand(-40, 40), y: rand(90, 230), vx: rand(10, 50), vy: rand(-50, -10), t: 0, life: 1.6, draw: f => { ctx.fillStyle = 'rgba(255,255,255,' + (1 - f.t / f.life) + ')'; ctx.fillRect(f.x, f.y, 3, 3); } }); yield; }
  E.dead = true; E.gone = true; G.kills++; G.flags.killed_sans = true;
  addExp(50000);
  Snd.music('ending');
  yield* boxText('* VOUS AVEZ GAGNÉ !\n* Vous gagnez 50 000 EXP et 0 OR.\n* Votre LV augmente.');
  B.forceEnd = true; B.result = 'killed';
  return 'handled';
};
