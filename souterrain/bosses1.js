'use strict';
// ============================================================
//  bosses1.js : Flowey (rencontre), Toriel, Napstablook, Papyrus, Mannequin furieux
//  Dialogues originaux en français.
// ============================================================
function prepSoul() { const k = boxOf(B.boxT); B.soul.x = k.cx; B.soul.y = k.cy; B.soul.visible = true; B.phase = 'enemyTalk'; }
function* bossTalk(E, lines, o) { prepSoul(); yield* talk(E, lines, o); }

// ============================================================
//  FLOWEY — première rencontre (« pastilles d'amitié »)
// ============================================================
M('flowey', { name: 'Flowey', hp: 1, atk: 0, df: 0, exp: 0, gold: 0, h: 44, voice: 'flowey', bubbleDX: 50, boss: true, check: '' });
const FLOWEY_INTRO = {
  foes: ['flowey'], music: 'flowey', bg: 'none', noReward: true, boss: true,
  *start(B) {
    const E = B.foes[0];
    setBox(160, 140); prepSoul();
    E.st.face = 'smile';
    yield* talk(E, ['Salut ! Je suis FLOWEY.', 'FLOWEY la FLEUR !', 'Hmm...', 'Tu es nouveau dans le Souterrain, hein ?', 'Pauvre petit... tu dois être perdu !', 'Quelqu\'un doit bien t\'apprendre comment ça marche ici !', 'Ce sera moi, alors !', 'Prêt ? C\'est parti !']);
    B.phase = 'enemyTalk';
    flash(0.4); Snd.ding();
    yield* talk(E, ['Tu vois ce cœur ? C\'est ton ÂME, le cœur de ton être tout entier !', 'Ton ÂME commence faible, mais elle grandit si tu gagnes plein de LV.', 'Qu\'est-ce que le LV ? Mais l\'AMOUR, bien sûr !', 'Tu veux un peu d\'AMOUR, pas vrai ?', 'T\'inquiète, je vais t\'en donner !', 'Ici, l\'AMOUR se partage avec...', 'des petites « pastilles d\'amitié » blanches !', 'Allez, attrape-en le plus possible !']);
    E.st.face = 'wink';
    const A = new Runner(E); A.box(160, 140); A.dur = 99;
    let hits = 0;
    const throwPellets = () => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35, x = 320 + Math.cos(a) * 60, y = 120 + Math.sin(a) * 30; A.add(bul({ x, y, img: 'seed', r: 4, clip: false, life: 6, delay: 0.6, vr: 6, upd: b => { if (b.t < 0.65) return; if (!b.aim) { b.aim = Math.atan2(B.soul.y - b.y, B.soul.x - b.x); b.vx = Math.cos(b.aim) * 110; b.vy = Math.sin(b.aim) * 110; } }, dmg: 0, onHit: () => { hits++; } })); } };
    B.phase = 'attack'; B.runners = [A]; A.started = true; throwPellets();
    const t0 = time;
    yield () => hits > 0 || time - t0 > 4;
    B.bullets = [];
    if (hits > 0) {
      G.hp = 1; E.st.face = 'evil'; Snd.laugh();
      B.phase = 'enemyTalk';
      yield* talk(E, ['Imbécile.', 'Dans ce monde, c\'est TUER ou ÊTRE TUÉ.', 'Pourquoi quelqu\'un laisserait-il filer une occasion pareille ?'], { voice: 'evil' });
    } else {
      E.st.face = 'grin'; B.phase = 'enemyTalk';
      yield* talk(E, ['Tu sais déjà comment ça marche, hein ?', 'Tu voulais juste me voir souffrir.'], { voice: 'evil' });
    }
    // Cercle de pastilles qui se referme
    E.st.face = 'evil'; B.phase = 'attack';
    const cx = B.soul.x, cy = B.soul.y, n = 22;
    for (let i = 0; i < n; i++) { const a = i * TAU / n; A.add(bul({ x: cx + Math.cos(a) * 110, y: cy + Math.sin(a) * 110, img: 'seed', r: 4, clip: false, life: 30, a, dmg: 99, upd: b => { const R = Math.max(18, 110 - b.t * 9); b.x = cx + Math.cos(b.a) * R; b.y = cy + Math.sin(b.a) * R; b.rot = b.a + Math.PI / 2; } })); }
    B.phase = 'enemyTalk';
    yield* talk(E, ['MEURS.'], { voice: 'evil', shake: true });
    B.phase = 'attack'; B.noDeath = true;
    Snd.laugh();
    yield 7;
    // Une boule de feu chasse Flowey
    B.bullets = []; Snd.fire();
    B.fx.push({ kind: 'fireball', x: 700, y: E.y - 40, t: 0, life: 1.2, draw: f => { const x = lerp(700, E.x, Math.min(1, f.t / 0.35)); dImg(shape('fire'), x - 20, f.y, 4); } });
    yield 0.35;
    E.st.face = 'sad'; Snd.slam(); shake = 6;
    for (let i = 0; i < 30; i++) { E.dx = (E.dx || 0) - 30; E.dy = (E.dy || 0) - 4; yield; }
    E.gone = true; B.noDeath = false; G.hp = maxHP();
    B.phase = 'post';
    yield 1;
    B.forceEnd = true; B.result = 'special';
  },
  playerTurn: function* () { yield; },
};

// ============================================================
//  TORIEL
// ============================================================
const TORIEL_SPARE = ['...', '...', 'Que fais-tu donc ?', 'Défends-toi... ou va-t\'en.', 'Pourquoi me regardes-tu ainsi ?', 'Bats-toi, ou fuis !', 'Cesse ce petit jeu.', 'Je ne reculerai pas.', '...', '......',
  'Je comprends que tu veuilles partir...', 'Mais ici, tu serais à l\'abri.', 'Je veillerais sur toi, chaque jour.', 'Nous n\'aurions pas grand-chose...', '...mais nous serions bien, tous les deux.',
  'Pourquoi tout rendre si difficile ?', 'Je t\'en prie... retourne à la maison.', '...', 'Hm. Hm hm...', 'Regarde-moi. Incapable de garder un seul enfant en sécurité.'];
M('toriel', {
  name: 'Toriel', hp: 440, atk: 6, df: 1, exp: 150, gold: 25, h: 106, voice: 'toriel', boss: true, bubbleDX: 90, bubbleY: 30,
  checkName: 'TORIEL', showAtk: 80, showDef: 80, check: '* Elle sait ce qui est le mieux pour vous.',
  acts: [{ n: 'Parler', t: E => pick(['* Vous essayez de trouver quelque chose à dire...\n* Mais rien ne vient.', '* Vous ouvrez la bouche...\n* Toriel détourne le regard.']) }],
  init: E => { E.spareN = 0; },
  hurt(E, dmg) { if (isGenocide()) return E.hp; if (E.hp < E.max * 0.35) return E.hp; return dmg; },
  onDeath: function* (E) {
    E.st.hurt = true; Snd.stopMusic(0.5);
    if (isGenocide()) yield* talk(E, ['Tu... Tu me détestes à ce point ?', 'Ha... ha...', 'Ce n\'était pas toi que je protégeais, enfant...', '...c\'étaient eux.'], { speed: 14 });
    else yield* talk(E, ['Ngh...', 'Tu es... encore plus fort que je ne le pensais...', 'Écoute-moi bien, enfant.', 'Quand tu sortiras d\'ici... ne laisse pas Asgore prendre ton ÂME.', 'Son plan... ne doit pas s\'accomplir...', '...'], { speed: 16 });
  },
  flavorLow: '* Toriel respire avec difficulté.',
});
function torielFire(A, E, kind) {
  const low = G.hp <= 4; // elle épargne l'âme quand vous êtes à bout
  const avoid = b => { if (low && Math.hypot(b.x - B.soul.x, b.y - B.soul.y) < 26) { b.x += Math.sign(b.x - B.soul.x || 1) * 3; } };
  A.box(170, 140); A.dur = 5.4;
  if (kind === 0) A.every(0.3, 4.6, 0.32, i => { const k = A.k, left = i % 2 === 0; A.add(bul({ x: left ? k.l - 10 : k.r + 10, y: k.t + rand(10, k.h - 10), vx: left ? 140 : -140, vy: rand(-20, 20), img: 'fire', r: 5, life: 3, upd: avoid })); });
  else if (kind === 1) A.every(0.3, 4.6, 0.18, () => { const k = A.k; A.add(bul({ x: rand(k.l + 6, k.r - 6), y: k.t - 10, vy: rand(110, 150), img: 'fire', r: 5, life: 3, upd: avoid })); });
  else A.every(0.3, 4.6, 0.7, () => { const k = A.k, cx = rand(k.l + 30, k.r - 30); for (let j = 0; j < 8; j++) A.add(bul({ x: cx, y: k.t + 8, img: 'fire', r: 5, life: 3, a: j * TAU / 8, upd: b => { const R = b.t * 70; b.x = cx + Math.cos(b.a + b.t) * R; b.y = k.t + 8 + b.t * 50 + Math.sin(b.a + b.t) * R * 0.6; avoid(b); } })); });
}
const TORIEL_BATTLE = {
  foes: ['toriel'], music: 'toriel', boss: true, bg: 'none', area: 'ruins',
  flavor(B) { const E = B.foes[0]; if (E.spareN >= 12) return '* Toriel regarde à travers vous.'; if (E.hp < E.max * 0.4) return '* Toriel respire difficilement.'; return pick(['* Toriel se prépare à une attaque magique.', '* Toriel fait mine de ne pas vous voir.', '* Toriel vous regarde, l\'air triste.', '* Ça sent le feu de bois.']); },
  intro: '* Toriel vous barre le chemin !',
  *onMercy(B) {
    const E = B.foes[0];
    yield* boxText('* Vous épargnez Toriel.');
    E.talkNext = TORIEL_SPARE[Math.min(E.spareN, TORIEL_SPARE.length - 1)];
    E.spareN++;
    if (E.spareN >= TORIEL_SPARE.length) {
      // Elle abandonne
      Snd.stopMusic(1);
      yield* bossTalk(E, TORIEL_SPARE[TORIEL_SPARE.length - 1]);
      yield* bossTalk(E, ['Non... Je comprends.', 'Tu te sentirais à l\'étroit, ici.', 'Les Ruines sont bien trop petites pour toi.', 'Mon cœur espérait autre chose... mais je ne te retiendrai plus.', 'Si tu passes cette porte...', '...je t\'en prie, ne reviens pas.', 'Tu comprends ?']);
      E.st.look = true; Snd.heal();
      menuBox(); yield* boxText('* Toriel vous serre fort dans ses bras.');
      E.spared = true; E.gone = true; E.fadeT = 0.001; G.flags.torielSpared = true; G.spares++;
      B.forceEnd = true; B.result = 'spared';
    }
    return 'handled';
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (B.forceEnd || E.gone) return;
    if (E.turn === 0) E.talkNext = E.talkNext || null;
    const line = E.talkNext; E.talkNext = null;
    const kind = E.turn % 3;
    yield* runAttack(E, (A, e) => torielFire(A, e, kind), { lines: line ? [line] : null });
    E.turn++;
  },
};

// ============================================================
//  NAPSTABLOOK
// ============================================================
M('napstablook', {
  name: 'Napstablook', hp: 88, atk: 5, df: 10, exp: 0, gold: 0, h: 54, voice: 'napsta', boss: true, mercyNeed: 3,
  checkName: 'NAPSTABLOOK', showAtk: 10, showDef: 255, check: '* Ce fantôme se fait toujours tout petit.',
  intro: '* Voici Napstablook.',
  flavor: ['* Napstablook semble être ailleurs.', '* Napstablook pleure en silence.', '* Napstablook fait comme s\'il n\'était pas là.'],
  flavorSpare: '* Napstablook a l\'air presque heureux.',
  init: E => { E.st.cry = true; },
  talk: ['oh... salut.', 'je... je vais juste rester là...', 'pardon...', 'désolé de prendre de la place...'],
  acts: [
    { n: 'Encourager', t: E => ['* Vous faites une petite blague.\n* Napstablook sourit un peu.', '* Vous encouragez Napstablook.\n* Il ne pleure presque plus.', '* Vous dites à Napstablook qu\'il est génial.\n* Il vous montre quelque chose.'][Math.min(2, (E.acted.Encourager || 1) - 1)], mercy: 1,
      talk: E => ['heh...', 'je peux te montrer un truc ?', 'regarde... je l\'appelle « blook chic »...'][Math.min(2, (E.acted.Encourager || 1) - 1)], run: E => { if (E.acted.Encourager >= 3) E.st.cry = false; } },
    { n: 'Flirter', t: '* Vous essayez de flirter avec Napstablook.', talk: 'oh... je... je te ferais juste perdre ton temps...' },
    { n: 'Menacer', t: '* Vous menacez Napstablook.', run: E => { E.mercy = Math.max(0, E.mercy - 1); }, talk: 'oh... d\'accord... je m\'y attendais...' },
  ],
  attacks: [A => blookTears(A), A => AT.circle(A, 10, 'tear')],
  noDie: true,
  afterHit: function* (E) { if (E.hp <= 0) { yield* talk(E, ['je suis un fantôme...', 'je ne peux pas vraiment... mourir...', 'je disais ça pour être poli...', 'bon... je vais y aller.']); E.gone = true; E.fadeT = 0.001; Snd.flee(); } },
  spareGold: 0,
});
function blookTears(A) {
  A.box(160, 140); A.dur = 5;
  A.every(0.2, 4.2, 0.15, () => { const k = A.k; A.fromTop(rand(k.l + 4, k.r - 4), rand(90, 130), { img: 'tear', r: 3 }); });
}

// ============================================================
//  PAPYRUS
// ============================================================
const PAP = { font: 'papyrus', voice: 'papyrus' };
M('papyrus', {
  name: 'Papyrus', hp: 680, atk: 8, df: 2, exp: 200, gold: 0, h: 120, boss: true, ...PAP, bubbleDX: 70, bubbleY: 24, bubbleW: 210,
  checkName: 'PAPYRUS', check: '* Il aime les casse-têtes et les spaghettis.',
  acts: [
    { n: 'Flirter', run: E => { E.st.blush = true; E.flags.flirt = (E.flags.flirt || 0) + 1; }, t: '* Vous flirtez avec Papyrus.', talk: E => E.flags.flirt > 1 ? ['ENCORE ?!', 'JE... JE DOIS RESTER CONCENTRÉ !!'] : ['QUOI ?! TU FLIRTES AVEC MOI ?!', 'ENFIN UN ADMIRATEUR !', 'NYEH... MAIS JE DOIS TE CAPTURER !'] },
    { n: 'Insulter', t: '* Vous insultez Papyrus.', talk: ['INSULTE-MOI SI TU VEUX !', 'LE GRAND PAPYRUS EST AU-DESSUS DE ÇA !'] },
  ],
  hurt(E, dmg) { if (isGenocide()) return E.hp; return dmg; },
  onDeath: function* (E) {
    Snd.stopMusic(0.3);
    E.st.shake = true;
    yield* talk(E, isGenocide() ? ['EH BIEN... CE N\'EST PAS CE QUE J\'AVAIS IMAGINÉ.', 'MAIS... JE CROIS QUAND MÊME EN TOI !', 'TU PEUX ENCORE FAIRE MIEUX !', 'JE LE SAIS !'] : ['WOWIE... TU ES VRAIMENT FORT.', 'JE NE T\'EN VEUX PAS.', 'JE CROIS ENCORE EN TOI, HUMAIN...'], { speed: 18 });
  },
});
const PAP_TURNS = [
  { l: ['TU NE M\'ÉCHAPPERAS PAS, HUMAIN !'], a: 'gaps' },
  { l: ['MAINTENANT...', 'ADMIRE MON ATTAQUE BLEUE !'], a: 'blue' },
  { l: ['TU ES BLEU MAINTENANT.', 'C\'EST MON ATTAQUE !', 'NYEH HEH HEH !'], a: 'blue2' },
  { l: ['HMM... TU ES PLUS COSTAUD QUE PRÉVU.'], a: 'walls' },
  { l: ['MES CASSE-TÊTES N\'ONT PAS SUFFI ?'], a: 'mix' },
  { l: ['JE VAIS DEVENIR UN GRAND GARDE ROYAL !', 'ET TOUT LE MONDE M\'AIMERA !'], a: 'gaps2' },
  { l: ['UNDYNE SERA FIÈRE DE MOI !'], a: 'blue2' },
  { l: ['OUF... LE GRAND PAPYRUS EST UN PEU ESSOUFFLÉ.'], a: 'walls' },
  { l: ['BON !', 'IL EST TEMPS DE TE MONTRER...', 'MON ATTAQUE SPÉCIALE !!!'], a: 'special' },
];
function papAttack(A, kind) {
  const k = () => A.k;
  if (kind === 'gaps') { A.box(240, 130); A.dur = 6; A.every(0.4, 5, 0.6, i => A.gapPair(k().r + 4, k().cy + Math.sin(i) * 25, 46, -170)); }
  else if (kind === 'gaps2') { A.box(240, 130); A.dur = 6; A.every(0.3, 5.2, 0.32, i => A.gapPair(k().r + 4, k().cy + Math.sin(i * 0.5) * 32, 44, -200)); }
  else if (kind === 'blue' || kind === 'blue2') {
    A.box(260, 130); A.soul('blue'); A.dur = 6.4;
    const n = kind === 'blue' ? 6 : 9;
    A.every(0.6, 5.6, 5 / n, i => { if (i % 3 === 2 && kind === 'blue2') A.ceilBone(k().r + 4, k().h - 40, -190); else A.floorBone(k().r + 4, i % 2 ? 22 : 34, -190); });
  } else if (kind === 'walls') { A.box(240, 130); A.dur = 6; A.every(0.4, 5.2, 0.8, i => { if (i % 2) A.wall(k().l - 14, 190, 'blue'); else A.gapPair(k().l - 14, k().cy + rand(-30, 30), 48, 190); }); }
  else if (kind === 'mix') { A.box(260, 130); A.soul('blue'); A.dur = 6.4; A.every(0.5, 5.6, 0.55, i => { if (i % 4 === 3) A.wall(k().r + 4, -200, 'blue'); else A.floorBone(k().r + 4, 26 + (i % 3) * 8, -200); }); }
  else if (kind === 'special') {
    A.box(300, 130); A.soul('blue'); A.dur = 12;
    A.every(0.5, 7, 0.38, i => A.floorBone(k().r + 4, 20 + (i % 3) * 10, -230));
    A.every(7.2, 9.6, 0.6, i => A.floorBone(k().r + 4, i === 3 ? 6 : 14, -120));
    A.at(10.2, () => { const kk = k(); A.add(bul({ x: kk.r + 20, y: kk.b - 14, vx: -60, img: 'dog', r: 7, life: 6, harmless: true, sc: 1 })); });
  }
}
const PAPYRUS_BATTLE = {
  foes: ['papyrus'], music: 'papyrus', boss: true, bg: 'none', area: 'snowdin',
  goLines: null,
  flavor(B) { const E = B.foes[0]; return pick(['* Papyrus prépare une attaque d\'os.', '* Papyrus remet son écharpe en place.', '* Papyrus pense à des spaghettis.', '* Ça sent... les spaghettis.']).replace('^', E.name); },
  *start(B) {
    const E = B.foes[0];
    if (isGenocide()) { setBox(575, 140); yield* bossTalk(E, ['HUMAIN...', 'JE SAIS QUE TU PEUX FAIRE MIEUX.', 'JE CROIS EN TOI !', 'JE VAIS T\'ÉPARGNER, D\'ACCORD ?']); E.spare = true; B.papGeno = true; menuBox(); return; }
    setBox(240, 130);
    yield* bossTalk(E, ['HUMAIN !', 'MOI, LE GRAND PAPYRUS, JE VAIS TE CAPTURER !', 'ET ENFIN, JE SERAI ACCEPTÉ DANS LA GARDE ROYALE !', 'PRÉPARE-TOI !!']);
  },
  onDeath(B) { // Papyrus vous capture au lieu de vous tuer
    if (B.captured) return; B.captured = true; G.hp = maxHP(); B.forceEnd = true; B.result = 'captured'; B.endAttack = true;
  },
  *onMercy(B) {
    const E = B.foes[0];
    if (B.papGeno) { yield* boxText('* Vous épargnez Papyrus.'); E.spared = true; E.gone = true; E.fadeT = 0.001; B.forceEnd = true; B.result = 'spared'; return 'handled'; }
    if (E.spare) return;
    yield* boxText('* Vous épargnez Papyrus.');
    E.talkNext = E.turn < 3 ? ['ÉPARGNER ?', 'C\'EST MOI QUI DEVRAIS DIRE ÇA !'] : ['TU M\'ÉPARGNES ENCORE ?', 'NYEH... ÇA ME PERTURBE.'];
    return 'handled';
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (B.papGeno) { yield* bossTalk(E, pick([['...'], ['ALLEZ, HUMAIN.', 'ÉPARGNE-MOI AUSSI.']])); return; }
    if (E.spare) { yield* bossTalk(E, ['ALLEZ, ÉPARGNE-MOI !', 'ON SERA AMIS !']); return; }
    const T = PAP_TURNS[Math.min(E.turn, PAP_TURNS.length - 1)];
    const lines = E.talkNext ? [].concat(E.talkNext) : T.l; E.talkNext = null;
    yield* runAttack(E, A => papAttack(A, T.a), { lines });
    if (B.forceEnd) return;
    if (T.a === 'special') {
      prepSoul(); menuBox();
      yield* bossTalk(E, ['...BON.', 'TU AS TOUT ESQUIVÉ, MÊME MA PLUS GRANDE ATTAQUE.', 'C\'EST CLAIR, JE N\'ARRIVE PAS À TE BATTRE.', 'ALORS VOILÀ CE QUE JE PROPOSE :', 'JE T\'ÉPARGNE !', 'ET... SI TU VEUX...', 'ON POURRAIT ÊTRE AMIS ?']);
      E.spare = true; E.st.blush = true;
    }
    E.turn++;
  },
  *end(B, result) {
    if (result === 'captured') {
      Snd.stopMusic(0.3);
      yield* talk(B.foes[0], ['NYEH HEH HEH !', 'JE T\'AI CAPTURÉ, HUMAIN !', 'DIRECTION LA REMISE !'], PAP);
    }
  },
};

// ============================================================
//  MANNEQUIN FURIEUX (Mad Dummy)
// ============================================================
M('maddummy', {
  name: 'Mannequin furieux', hp: 180, atk: 7, df: 0, exp: 0, gold: 0, h: 66, boss: true, voice: 'monster', bubbleDX: 60,
  checkName: 'MANNEQUIN FURIEUX', showAtk: 30, showDef: 255, check: '* Un fantôme possédant un mannequin.\n* Les attaques physiques ne lui font rien !',
  acts: [{ n: 'Parler', t: '* Vous essayez de lui parler.\n* Il ne vous écoute absolument pas.' }],
  *onFight(E) { yield* boxText('* Votre attaque traverse le mannequin.\n* C\'est un fantôme !'); return 'handled'; },
  flavor: ['* Le Mannequin furieux est furieux.', '* Le Mannequin furieux écume de rage.', '* Ça sent la ouate brûlée.'],
});
function maddummyMissiles(A, E, n) {
  A.box(180, 140); A.dur = 6;
  A.every(0.3, 4.4, 4 / n, i => {
    const k = A.k, left = i % 2 === 0;
    A.add(bul({ x: left ? k.l - 10 : k.r + 10, y: k.t + rand(20, k.h - 20), img: 'cross', r: 5, clip: false, life: 6, vr: 6,
      upd: (b, dt) => {
        if (b.t < 2.2) { const a = Math.atan2(B.soul.y - b.y, B.soul.x - b.x); b.vx += Math.cos(a) * 400 * dt; b.vy += Math.sin(a) * 400 * dt; const sp = Math.hypot(b.vx, b.vy); if (sp > 120) { b.vx *= 120 / sp; b.vy *= 120 / sp; } }
        else { b.vx *= 0.9; b.vy = -260; if (b.y < A.k.t - 40) { b.dead = true; E.hp = Math.max(0, E.hp - 15); E.white = 1; E.shake = 8; Snd.damage(); B.fx.push({ kind: 'dmg', x: E.x, y: 60, y0: 60, vy: -150, val: 15, from: E.hp + 15, to: E.hp, max: E.max, t: 0, life: 0.8 }); } }
      } }));
  });
}
const MADDUMMY_BATTLE = {
  foes: ['maddummy'], music: 'dummy', boss: true, bg: 'none', area: 'waterfall',
  intro: '* Le Mannequin furieux vous bloque le passage !',
  *start(B) { const E = B.foes[0]; E.st.angry = true; setBox(180, 140); yield* bossTalk(E, ['TOI !!!', 'Tu as fait du mal à mon cousin dans les Ruines !', 'Enfin... tu lui as PARLÉ. C\'est PIRE !', 'Mes mannequins ! À L\'ATTAQUE !']); },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (E.hp <= 0) return;
    const lines = [['Ha ! Mes mannequins sont imparables !'], ['Bande d\'incapables !', 'Visez l\'humain, pas MOI !'], ['Encore ?! Vous êtes nuls !'], ['ASSEZ ! Je vais faire ça moi-même !']][Math.min(3, E.turn)];
    yield* runAttack(E, A => maddummyMissiles(A, E, 4 + E.turn * 2), { lines });
    E.turn++;
    if (E.hp <= 0) {
      prepSoul();
      yield* talk(E, ['Grr... GRRR !!', 'Vous savez quoi ? J\'en ai ASSEZ.', 'Je vais...']);
      // Napstablook arrive et pleure sur le mannequin
      B.fx.push({ kind: 'blook', t: 0, life: 99, draw: f => { const img = SPRM.napstablook(time, { st: { cry: true } }); dImg(img, 440, 150 + Math.sin(time * 1.5) * 4, 2, { alpha: Math.min(1, f.t) }); } });
      yield 1;
      yield* talk(E, ['...Quoi ? Qu\'est-ce que tu fais là, toi ?', 'Arrête de pleurer sur moi ! C\'est dégoûtant !', 'Beurk ! Je m\'en vais !'], {});
      E.gone = true; E.fadeT = 0.001; Snd.flee();
      B.fx = B.fx.filter(f => f.kind !== 'blook');
      menuBox(); yield* boxText('* Napstablook vous fait un petit signe, puis disparaît.');
      B.forceEnd = true; B.result = 'spared';
    }
  },
};
