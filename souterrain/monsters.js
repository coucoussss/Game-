'use strict';
// ============================================================
//  monsters.js : bestiaire (monstres ordinaires et mini-boss)
//  Textes originaux en français ; mécaniques AGIR / ÉPARGNER inspirées du jeu.
// ============================================================
// ---------- Bibliothèque d'attaques ----------
const AT = {
  // Mouches qui foncent vers l'âme en zigzaguant (Froggit)
  flies(A, n = 6, v = 110) {
    A.box(150, 140); A.dur = 5;
    A.every(0.3, 4.2, 4 / n, () => {
      const k = A.k, side = rint(0, 3);
      const x = side === 0 ? k.l + rand(0, k.w) : side === 1 ? k.r + 10 : side === 2 ? k.l + rand(0, k.w) : k.l - 10;
      const y = side === 0 ? k.t - 10 : side === 2 ? k.b + 10 : k.t + rand(0, k.h);
      A.add(bul({ x, y, img: 'fly', r: 4, life: 7, upd: (b, dt) => { const a = Math.atan2(B.soul.y - b.y, B.soul.x - b.x) + Math.sin(b.t * 9) * 0.6; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; } }));
    });
  },
  // Grenouilles qui sautent d'un bord à l'autre
  hop(A, n = 3, img = 'pellet') {
    A.box(220, 130); A.dur = 5;
    A.every(0.4, 4, 3.6 / n, i => {
      const k = A.k, left = i % 2 === 0;
      A.add(bul({ x: left ? k.l - 10 : k.r + 10, y: k.b - 10, vx: left ? 110 : -110, vy: -rand(220, 300), ay: 420, img, sc: 1.4, r: 6, life: 4,
        upd: b => { if (b.y > k.b - 8 && b.vy > 0) { b.y = k.b - 8; b.vy = -rand(220, 300); } } }));
    });
  },
  // Papillons de nuit qui ondulent (Whimsun)
  moths(A, n = 8) {
    A.box(150, 140); A.dur = 5;
    A.every(0.2, 4, 3.8 / n, i => {
      const k = A.k, left = i % 2 === 0, y0 = k.t + rand(20, k.h - 20);
      A.add(bul({ x: left ? k.l - 12 : k.r + 12, y: y0, vx: left ? 70 : -70, img: 'moth', r: 5, life: 6, upd: b => { b.y = y0 + Math.sin(b.t * 4) * 22; } }));
    });
  },
  // Cercle de projectiles qui tourne autour de l'âme (Whimsun)
  circle(A, n = 8, img = 'moth') {
    A.box(150, 140); A.dur = 5;
    A.at(0.3, () => {
      const cx = B.soul.x, cy = B.soul.y;
      for (let i = 0; i < n; i++) A.add(bul({ img, r: 5, life: 5, a: i * TAU / n, upd: b => { const R = Math.max(10, 80 - b.t * 14); b.x = cx + Math.cos(b.a + b.t * 1.6) * R; b.y = cy + Math.sin(b.a + b.t * 1.6) * R; } }));
    });
  },
  // Pluie verticale d'un projectile
  rain(A, img = 'drop', n = 14, v = 160, o = {}) {
    A.box(o.w || 170, o.h || 140); A.dur = o.dur || 5;
    A.every(0.2, (o.dur || 5) - 1, ((o.dur || 5) - 1.2) / n, () => {
      const k = A.k; A.add(bul({ x: rand(k.l + 6, k.r - 6), y: k.t - 10, vy: v * rand(0.8, 1.2), img, r: 4, life: 5, vr: o.spin ? rand(-4, 4) : 0, color: o.blueChance && Math.random() < o.blueChance ? 'blue' : 'white', ...(o.b || {}) }));
    });
  },
  // Tirs visés depuis le monstre
  aimed(A, img = 'pellet', n = 6, v = 170, o = {}) {
    A.box(o.w || 160, o.h || 140); A.dur = o.dur || 5;
    A.every(0.4, (o.dur || 5) - 0.8, ((o.dur || 5) - 1.2) / n, () => {
      const k = A.k, x = k.l + rand(0, k.w), y = k.t - 12;
      for (let j = 0; j < (o.spread || 1); j++) A.shot(x, y, A.aim(x, y) + (j - ((o.spread || 1) - 1) / 2) * 0.35, v, { img, r: 4, life: 5, clip: true });
    });
  },
  // Projectiles convergents en anneau
  rings(A, img = 'pellet', waves = 3, n = 8, v = 90) {
    A.box(160, 150); A.dur = 1 + waves * 1.3;
    for (let w = 0; w < waves; w++) A.at(0.3 + w * 1.3, () => A.ringIn(n, 100, v, { img, r: 4, life: 3, clip: false }));
  },
  // Rebonds dans la boîte
  bouncers(A, img = 'pellet', n = 4, v = 140) {
    A.box(170, 140); A.dur = 5;
    A.every(0.3, 2.3, 2 / n, () => {
      const k = A.k, a = rand(0, TAU);
      A.add(bul({ x: k.cx + rand(-50, 50), y: k.t + 10, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v, img, r: 5, life: 4.6,
        upd: b => { const k2 = boxOf(B.box); if (b.x < k2.l + 4 || b.x > k2.r - 4) b.vx *= -1; if (b.y < k2.t + 4 || b.y > k2.b - 4) b.vy *= -1; b.x = clamp(b.x, k2.l + 4, k2.r - 4); b.y = clamp(b.y, k2.t + 4, k2.b - 4); } }));
    });
  },
  // Rangées horizontales avec un trou
  rows(A, img = 'pellet', n = 5, v = 130) {
    A.box(180, 140); A.dur = 1 + n * 0.9;
    A.every(0.3, 0.3 + n * 0.9, 0.9, i => {
      const k = A.k, left = i % 2 === 0, gap = rint(0, 4), count = 6;
      for (let j = 0; j < count; j++) { if (j === gap || j === gap + 1) continue; A.fromSide(k.t + 12 + j * (k.h - 24) / (count - 1), v, left, { img, r: 5, life: 4 }); }
    });
  },
  // Colonnes verticales avec trou
  cols(A, img = 'pellet', n = 5, v = 120) {
    A.box(180, 140); A.dur = 1 + n * 0.95;
    A.every(0.3, 0.3 + n * 0.95, 0.95, () => {
      const k = A.k, gap = rint(0, 5), count = 7;
      for (let j = 0; j < count; j++) { if (j === gap || j === gap + 1) continue; A.fromTop(k.l + 12 + j * (k.w - 24) / (count - 1), v, { img, r: 5, life: 4 }); }
    });
  },
  // Spirale depuis le centre de la boîte
  spiral(A, img = 'pellet', arms = 3, v = 90, dur = 5) {
    A.box(170, 150); A.dur = dur;
    A.every(0.3, dur - 0.8, 0.12, i => { const k = A.k; for (let a = 0; a < arms; a++) A.shot(k.cx, k.t + 12, i * 0.35 + a * TAU / arms, v, { img, r: 4, life: 3 }); });
  },
};

// ---------- Définition simplifiée ----------
function M(id, d) { MON[id] = { spr: id, voice: 'monster', ...d }; }

// ============================================================
//  RUINES
// ============================================================
M('dummy', {
  name: 'Mannequin', hp: 15, atk: 0, df: -5, exp: 0, gold: 0, h: 58, flee: true,
  check: '* Un mannequin d\'entraînement en coton.\n* Il ne bouge pas d\'un poil.',
  intro: '* Vous rencontrez le Mannequin.',
  flavor: ['* Le Mannequin reste immobile.', '* Le Mannequin semble attendre quelque chose.'],
  acts: [{ n: 'Parler', t: '* Vous discutez avec le Mannequin.\n* ...\n* Il a l\'air content.', spare: true }],
  talk: null, attacks: [],
});
M('froggit', {
  name: 'Froggit', hp: 30, atk: 4, df: 4, exp: 3, gold: 2, h: 44,
  check: '* La vie est difficile pour cet ennemi.',
  intro: '* Froggit saute à votre rencontre !',
  flavor: ['* Froggit ne semble pas savoir pourquoi il est là.', '* Froggit saute d\'avant en arrière.', '* Vous entendez des coassements.'],
  flavorSpare: '* Froggit semble réticent à se battre.',
  talk: ['Croâ, croâ.', 'Croâ ?', 'Coâ...', 'Croooâ.'],
  acts: [
    { n: 'Compliment', t: '* Froggit ne comprend pas ce que vous dites, mais il rougit quand même.', spare: true, talk: '(Rougit.)' },
    { n: 'Menacer', t: '* Froggit ne comprend pas vos menaces, mais il a peur quand même.', spare: true, talk: '(Tremble.)' },
  ],
  attacks: [A => AT.flies(A, 6, 110), A => AT.hop(A, 3, 'pellet')],
});
M('whimsun', {
  name: 'Whimsun', hp: 10, atk: 5, df: 0, exp: 2, gold: 2, h: 40, spareStart: true,
  check: '* Ce monstre est trop sensible pour se battre...',
  intro: '* Whimsun approche timidement.',
  flavor: ['* Whimsun continue de marmonner des excuses.', '* Whimsun bat des ailes en tremblant.', '* Ça sent le pollen.'],
  talk: ['Je suis désolé...', 'Je n\'ai pas le choix...', '*renifle*', 'Pardon... pardon...'],
  acts: [
    { n: 'Consoler', t: '* Vous ravalez votre envie de chasser le Whimsun.\n* Il fond en larmes et s\'envole...', run: function* (E) { E.spared = true; E.gone = true; E.fadeT = 0.001; G.spares++; Snd.spare(); } },
    { n: 'Terroriser', t: '* Vous hurlez et agitez les bras.\n* Whimsun s\'enfuit en pleurant.', run: function* (E) { E.spared = true; E.gone = true; E.fadeT = 0.001; Snd.spare(); } },
  ],
  attacks: [A => AT.moths(A, 8), A => AT.circle(A, 8, 'moth')],
});
M('moldsmal', {
  name: 'Moldsmal', hp: 50, atk: 1, df: 0, exp: 3, gold: 3, h: 30,
  check: '* Stéréotype : fait de la gelée et ne réfléchit pas.',
  intro: '* Moldsmal ondule vers vous.',
  flavor: ['* Moldsmal frétille sensuellement.', '* Moldsmal fait des bruits de gélatine.', '* Ça sent la grenadine.'],
  flavorSpare: '* Moldsmal a cessé de bouger.',
  talk: ['Blorb...', 'Squorch.', 'Flaaap ?', '*ondule*'],
  acts: [
    { n: 'Imiter', t: '* Vous vous couchez et ondulez.\n* Moldsmal a l\'impression d\'avoir trouvé un ami.', spare: true },
    { n: 'Flirter', t: '* Vous ondulez de façon suggestive.\n* Moldsmal ondule en retour.\n* Quel moment intense.', spare: true },
    { n: 'Ignorer', t: '* Vous ignorez Moldsmal.\n* Il n\'a pas l\'air de le remarquer.' },
  ],
  attacks: [A => AT.bouncers(A, 'pellet', 3, 120), A => AT.rain(A, 'drop', 10, 130)],
});
M('migosp', {
  name: 'Migosp', hp: 40, atk: 7, df: 5, exp: 5, gold: 3, h: 52,
  check: '* Il paraît méchant en groupe, mais seul, il ne pense qu\'à danser.',
  intro: '* Migosp se faufile jusqu\'à vous.',
  flavor: ['* Migosp marmonne des choses louches.', '* Migosp se gratte l\'antenne.'],
  flavorSpare: '* Migosp danse tout seul.',
  talk: E => alive().length > 1 ? pick(['On va t\'avoir !', 'Hé hé hé...']) : pick(['La la la ~', 'Danse avec moi !', 'Liberté !']),
  init: E => { E.d.tick = E2 => { if (alive().length === 1 && alive()[0] === E2) E2.spare = true; }; },
  acts: [{ n: 'Parler', t: E => alive().length > 1 ? '* Migosp fait semblant de ne pas vous entendre.' : '* Migosp n\'a d\'yeux que pour sa danse.', spare: false }],
  attacks: [A => AT.cols(A, 'fly', 4, 120), A => AT.aimed(A, 'fly', 6, 150)],
});
M('vegetoid', {
  name: 'Vegetoid', hp: 72, atk: 6, df: 6, exp: 6, gold: 4, h: 64,
  check: '* Sert un repas équilibré, de gré ou de force.',
  intro: '* Vegetoid sort de terre.',
  flavor: ['* Vegetoid danse joyeusement.', '* Vegetoid sent les légumes frais.', '* Vegetoid veut que vous mangiez vos légumes.'],
  flavorSpare: '* Vegetoid est rassasié de bonheur.',
  talk: ['Mange tes légumes !', 'Pousse, pousse !', 'Plantes-toi bien !', 'Bon appétit !'],
  acts: [
    { n: 'Parler', t: '* Vous dites à Vegetoid que vous n\'aimez pas les légumes.\n* Il n\'a pas l\'air d\'écouter.' },
    { n: 'Dévorer', t: '* Vous mordez Vegetoid.\n* Vous récupérez 5 PV !', run: E => { G.hp = Math.min(maxHP(), G.hp + 5); Snd.heal(); E.spare = true; } },
    { n: 'Dîner', t: '* Vous tapotez votre ventre.\n* Vegetoid vous offre des légumes sains.\n* (Les carottes vertes soignent.)', run: E => { E.flags.dinner = true; E.nextAttack = A => vegCarrots(A, true); } },
  ],
  attacks: [A => vegCarrots(A, false), A => AT.rain(A, 'carrot', 10, 130)],
  afterHit: E => { if (E.flags.dinner) E.spare = true; },
});
function vegCarrots(A, dinner) {
  A.box(160, 140); A.dur = 5;
  A.every(0.3, 4, 0.36, i => {
    const k = A.k, green = dinner ? i % 2 === 0 : i % 4 === 0;
    A.fromTop(rand(k.l + 8, k.r - 8), 120, { img: 'carrot', r: 5, color: green ? 'green' : 'white', heal: 1, upd: green && dinner ? (b => { if (b.used) A.E.spare = true; }) : null });
  });
}
M('loox', {
  name: 'Loox', hp: 50, atk: 6, df: 4, exp: 7, gold: 5, h: 46,
  check: '* Ne le regardez pas fixement dans l\'œil.',
  intro: '* Loox vous dévisage.',
  flavor: ['* Loox vous fixe.', '* Loox jongle avec ses paupières.', '* Ça sent le collyre.'],
  flavorSpare: '* Loox ne semble plus vous en vouloir.',
  talk: ['Arrête de me regarder !', 'Tu me fixes ?', 'Je ne t\'ai pas quitté des yeux.', 'Œil pour œil !'],
  acts: [
    { n: 'Ne pas taquiner', t: '* Vous ne vous moquez pas de Loox.\n* Il s\'apaise.', spare: true, talk: 'Enfin quelqu\'un de gentil...' },
    { n: 'Taquiner', t: '* Vous vous moquez de Loox.\n* Ses attaques deviennent plus fortes.', run: E => { E.atk += 2; }, talk: 'Tu vas le regretter !' },
  ],
  attacks: [A => AT.rings(A, 'eye', 3, 8, 90), A => AT.aimed(A, 'eye', 5, 160)],
});

// ============================================================
//  SNOWDIN
// ============================================================
M('snowdrake', {
  name: 'Snowdrake', hp: 74, atk: 6, df: 2, exp: 10, gold: 7, h: 64,
  check: '* Cet ado veut devenir humoriste... ses parents ne rient pas.',
  intro: '* Snowdrake se pose devant vous, l\'air glacial.',
  flavor: ['* Snowdrake répète une blague dans sa tête.', '* Snowdrake vérifie que son public est là.', '* Ça sent la neige fraîche.'],
  flavorSpare: '* Snowdrake rayonne de fierté.',
  talk: ['Gel tout ce que tu fais ? Ha... ha ?', 'Je suis un humoriste... de glace !', 'C\'est flocon de génie, hein ?', 'Neige pas ma blague !'],
  acts: [
    { n: 'Rire', t: '* Vous riez à la blague de Snowdrake.\n* Il est aux anges !', spare: true, talk: 'Enfin quelqu\'un qui me comprend !' },
    { n: 'Huer', t: '* Vous dites à Snowdrake que ses blagues sont nulles.\n* Il s\'énerve.', run: E => { E.atk += 2; }, talk: 'Tu n\'as aucun goût !' },
    { n: 'Blague', t: '* Vous faites une blague sur la glace.\n* Snowdrake ne rit pas.\n* Il est jaloux.' },
  ],
  attacks: [A => snowSpiral(A), A => AT.rain(A, 'snow', 12, 120, { spin: true })],
});
function snowSpiral(A) {
  A.box(160, 140); A.dur = 5;
  A.every(0.3, 4.2, 0.45, i => { const k = A.k, x = k.cx + Math.cos(i) * 50; A.add(bul({ x, y: k.t - 10, vy: 110, img: 'snow', r: 5, vr: 3, life: 4, upd: b => { b.x = x + Math.sin(b.t * 3) * 30; } })); });
}
M('icecap', {
  name: 'Ice Cap', hp: 48, atk: 6, df: 0, exp: 3, gold: 4, h: 70,
  check: '* Ce monstre est très fier de son chapeau.',
  intro: '* Ice Cap remet son chapeau en place.',
  flavor: ['* Ice Cap se recoiffe nerveusement.', '* Ice Cap vous regarde de haut.'],
  flavorSpare: '* Ice Cap ne pense plus qu\'à son chapeau.',
  talk: ['Regarde mon chapeau !', 'Ne fixe pas mon chapeau !', 'Il est beau, hein ?', 'Pas touche !'],
  acts: [
    { n: 'Ignorer', t: E => E.acted['Ignorer'] >= 3 ? '* Vous ignorez son chapeau une fois de plus.\n* Ice Cap perd confiance en lui.' : '* Vous ignorez le chapeau d\'Ice Cap.', run: E => { if (E.acted['Ignorer'] >= 3) E.spare = true; } },
    { n: 'Compliment', t: '* Vous dites à Ice Cap que son chapeau est magnifique.\n* Il est ravi.', spare: true },
    { n: 'Voler', t: '* Vous essayez de lui prendre son chapeau.\n* Il est furieux !', run: E => { E.atk += 3; } },
  ],
  attacks: [A => AT.bouncers(A, 'ice', 4, 150), A => AT.rain(A, 'ice', 12, 140)],
});
M('gyftrot', {
  name: 'Gyftrot', hp: 114, atk: 6, df: 8, exp: 7, gold: 15, h: 76,
  check: '* Les ados du coin l\'ont décoré de force.',
  intro: '* Gyftrot vous bloque le chemin.',
  flavor: ['* Gyftrot tente de secouer ses décorations.', '* Gyftrot soupire.'],
  flavorSpare: '* Gyftrot se sent léger.',
  talk: ['...', 'Laissez-moi tranquille !', 'Encore un gamin.', 'Grmmf.'],
  acts: [
    { n: 'Dédécorer', t: E => E.acted['Dédécorer'] >= 2 ? '* Vous retirez la dernière décoration.\n* Gyftrot est soulagé.' : '* Vous retirez une décoration des bois de Gyftrot.', run: E => { if (E.acted['Dédécorer'] >= 2) E.spare = true; } },
    { n: 'Cadeau', t: '* Vous offrez un cadeau à Gyftrot.\n* Il est touché par votre geste.', spare: true },
  ],
  attacks: [A => AT.rain(A, 'gift', 9, 110), A => AT.cols(A, 'gift', 4, 110)],
});
M('jerry', {
  name: 'Jerry', hp: 80, atk: 3, df: 0, exp: 1, gold: 0, h: 42, spareStart: true,
  check: '* Tout le monde déteste Jerry.',
  intro: '* Jerry s\'incruste.',
  flavor: ['* Jerry vous raconte son week-end. Encore.', '* Jerry mâchouille bruyamment.', '* Jerry vous a envoyé un SMS. Vous êtes à côté de lui.'],
  talk: ['Ce combat est nul.', 'T\'as des chips ?', 'Je m\'ennuie.', 'Quoi ?'],
  acts: [
    { n: 'Semer', t: '* Vous laissez tomber Jerry.\n* Personne ne le remarque.', run: function* (E) { E.gone = true; E.spared = true; E.fadeT = 0.001; Snd.flee(); } },
    { n: 'Critiquer', t: '* Vous critiquez Jerry.\n* Il ne vous écoute pas.' },
  ],
  attacks: [A => AT.aimed(A, 'pellet', 4, 110)],
});
M('doggo', {
  name: 'Doggo', hp: 70, atk: 6, df: 1, exp: 30, gold: 30, h: 72, mini: true,
  check: '* Il ne voit que ce qui bouge.',
  intro: '* Doggo vous flaire... mais ne vous voit pas.',
  flavor: ['* Doggo plisse les yeux.', '* Doggo agite ses couteaux.', '* Doggo renifle l\'air.'],
  flavorSpare: '* Doggo a été caressé. Il est perdu.',
  talk: ['Quelque chose a bougé ?!', 'Si ça bouge, je le découpe !', 'Hm ?', 'Je vais... te trouver.'],
  init: E => { E.st.search = true; },
  acts: [
    { n: 'Caresser', t: E => E.flags.moved ? '* Vous caressez Doggo.\n* Il est perplexe : il a été caressé par une chose invisible !' : '* Doggo ne vous voit pas.\n* Il faut d\'abord qu\'il ait l\'impression que vous avez bougé.', run: E => { if (E.flags.moved) E.spare = true; } },
    { n: 'Jouer', t: '* Vous lancez un bâton.\n* Doggo ne le voit pas.' },
  ],
  attacks: [(A, E) => doggoBlades(A, E)],
});
function doggoBlades(A, E) {
  A.box(200, 130); A.dur = 5; E.flags.moved = true;
  A.every(0.4, 4.3, 0.75, i => { const k = A.k, left = i % 2 === 0; A.add(bul({ x: left ? k.l - 10 : k.r + 10, y: k.cy, w: 10, h: k.h, vx: left ? 170 : -170, color: i % 3 === 2 ? 'orange' : 'blue', life: 3, fill: '#fff' })); });
}
M('lesserdog', {
  name: 'Chien Mineur', hp: 60, atk: 5, df: 1, exp: 18, gold: 20, h: 96, mini: true, mercyNeed: 2,
  check: '* Il est très excité. Brandit une épée.',
  intro: '* Le Chien Mineur bloque le passage !',
  flavor: ['* Le Chien Mineur remue la queue.', '* Le Chien Mineur halète.', '* Ça sent le chien mouillé.'],
  flavorSpare: '* Le cou du Chien Mineur a atteint un état de béatitude.',
  talk: ['Ouaf !', 'Wouf ?', '(Halète.)', 'Ouaf ouaf !'],
  acts: [
    { n: 'Caresser', t: E => ['* Vous caressez le Chien Mineur.\n* Son cou s\'allonge.', '* Le Chien Mineur est aux anges.\n* Son cou s\'allonge encore.', '* Le cou du Chien Mineur dépasse les nuages.'][Math.min(2, E.acted['Caresser'] - 1)], mercy: 1, run: E => { E.st.neck = (E.st.neck || 0) + 30; } },
    { n: 'Appeler', t: '* Vous appelez le Chien Mineur.\n* Il approche, plein d\'espoir.' },
    { n: 'Jouer', t: '* Vous fabriquez une boule de neige et la lancez.\n* Le Chien Mineur la rapporte, couverte de bave.', mercy: 1 },
  ],
  attacks: [A => dogsRun(A)],
});
function dogsRun(A) {
  A.box(200, 130); A.dur = 5;
  A.every(0.3, 4.2, 0.6, i => { const k = A.k; A.add(bul({ x: k.r + 16, y: k.b - 14 - (i % 2) * 40, vx: -170, img: 'dog', r: 9, life: 3, color: i % 4 === 3 ? 'blue' : 'white' })); });
}
M('dogamy', {
  name: 'Dogamy', hp: 98, atk: 14, df: 2, exp: 40, gold: 50, h: 76, mini: true,
  check: '* Mari de Dogaressa. Ne voit que ce qu\'il sent.',
  flavor: ['* Le couple de chiens vous renifle.', '* Les chiens se murmurent des mots doux.', '* Ça sent la hache.'],
  flavorSpare: '* Les chiens ont l\'air ravis.',
  talk: E => E.flags.smelled ? pick(['Le... le petit chiot sent bon !', 'Une caresse ?!']) : pick(['Ça sent... bizarre.', 'Montre-toi, étrange odeur !', 'Une humaine ? Un humain ?']),
  acts: [
    { n: 'Rouler', t: '* Vous vous roulez dans la neige.\n* Vous sentez le chiot maintenant.', run: () => { for (const E of alive()) E.flags.smelled = true; } },
    { n: 'Caresser', t: E => E.flags.smelled ? '* Vous caressez Dogamy.\n* Il est stupéfait : un chiot l\'a caressé !' : '* Dogamy se méfie de votre odeur étrange.\n* Il recule.', run: E => { if (E.flags.smelled) E.spare = true; } },
    { n: 'Renifler', t: '* Vous reniflez les chiens.\n* Ils reniflent en retour. Rien n\'est réglé.' },
  ],
  attacks: [A => dogAxes(A)],
  onDeath: function* (E) { const o = alive().find(x => x !== E); if (o) { o.atk += 6; o.talkNext = 'MON MARI !! Tu vas le payer !'; } },
});
M('dogaressa', {
  name: 'Dogaressa', hp: 98, atk: 14, df: 4, exp: 40, gold: 50, h: 76, mini: true,
  check: '* Femme de Dogamy. Ne voit que ce qu\'elle sent.',
  flavor: ['* Les chiens se tiennent la patte.', '* Dogaressa ajuste sa capuche.'],
  flavorSpare: '* Les chiens ont l\'air ravis.',
  talk: E => E.flags.smelled ? pick(['C\'est un petit chiot, chéri !', 'Il sent si bon...']) : pick(['Chéri, ça sent l\'humain.', 'Ne bouge pas...', 'Découpons-le !']),
  acts: [
    { n: 'Rouler', t: '* Vous vous roulez dans la neige.\n* Vous sentez le chiot maintenant.', run: () => { for (const E of alive()) E.flags.smelled = true; } },
    { n: 'Caresser', t: E => E.flags.smelled ? '* Vous caressez Dogaressa.\n* Elle frétille de joie !' : '* Dogaressa grogne. Votre odeur l\'inquiète.', run: E => { if (E.flags.smelled) E.spare = true; } },
    { n: 'Renifler', t: '* Vous reniflez les chiens.\n* Ils reniflent en retour.' },
  ],
  attacks: [A => dogAxes(A)],
  onDeath: function* (E) { const o = alive().find(x => x !== E); if (o) { o.atk += 6; o.talkNext = 'MA FEMME !! Comment as-tu osé !'; } },
});
function dogAxes(A) {
  A.box(190, 130); A.dur = 5.4;
  A.every(0.3, 4.6, 0.55, i => {
    const k = A.k, left = i % 2 === 0, col = Math.random() < 0.5 ? 'blue' : 'orange';
    A.add(bul({ x: left ? k.l - 14 : k.r + 14, y: rand(k.t + 16, k.b - 16), vx: left ? 150 : -150, img: 'cross', sc: 1.6, r: 7, vr: 8, color: col, life: 3 }));
  });
}
M('greaterdog', {
  name: 'Grand Chien', hp: 105, atk: 15, df: 8, exp: 80, gold: 40, h: 76, mini: true, mercyNeed: 3,
  check: '* Il porte une grosse armure. Il veut surtout de l\'attention.',
  intro: '* Le Grand Chien saute de son armure !',
  flavor: ['* Le Grand Chien se gratte derrière l\'oreille.', '* Le Grand Chien vous fait les yeux doux.', '* Le Grand Chien attend une caresse.'],
  flavorSpare: '* Le Grand Chien est épuisé de bonheur.',
  talk: ['WOUF !', '(Remue la queue.)', '(Halète joyeusement.)', 'WOUF WOUF !'],
  acts: [
    { n: 'Appeler', t: '* Vous appelez le Grand Chien.\n* Il saute de son armure et vous écrase de câlins !', mercy: 1, run: E => { E.st.hidden = false; } },
    { n: 'Caresser', t: E => E.mercy >= 1 ? '* Vous caressez le Grand Chien.\n* Il est absolument ravi.' : '* Le Grand Chien est trop loin.', run: E => { if (E.mercy >= 1) E.mercy++; if (E.mercy >= 3) E.spare = true; } },
    { n: 'Jouer', t: E => E.mercy >= 2 ? '* Vous jouez avec le Grand Chien.\n* Il est épuisé et heureux.' : '* Le Grand Chien n\'est pas encore prêt à jouer.', run: E => { if (E.mercy >= 2) { E.mercy++; E.spare = true; } } },
    { n: 'Ignorer', t: '* Vous ignorez le Grand Chien.\n* Il retourne tristement dans son armure.', run: E => { E.mercy = 0; } },
  ],
  attacks: [A => dogsRun(A), A => greatSpears(A)],
});
function greatSpears(A) {
  A.box(200, 130); A.dur = 5;
  A.every(0.3, 4.3, 0.7, i => { const k = A.k, x = rand(k.l + 20, k.r - 20); A.add(bul({ x, y: k.t - 30, w: 6, h: 40, vy: 220, color: i % 2 ? 'blue' : 'white', life: 3 })); });
}

// ============================================================
//  WATERFALL
// ============================================================
M('aaron', {
  name: 'Aaron', hp: 98, atk: 10, df: 6, exp: 34, gold: 20, h: 66,
  check: '* Ce cheval de mer bombe le torse en permanence.',
  intro: '* Aaron fait rouler ses muscles.',
  flavor: ['* Aaron contracte ses biceps.', '* Ça sent l\'huile de massage.', '* Aaron vous fait un clin d\'œil musclé.'],
  flavorSpare: '* Aaron est essoufflé à force de poser.',
  talk: ['Tu veux voir mes muscles ?', 'Regarde ce biceps !', 'Pas mal, hein ?', '*clin d\'œil*'],
  acts: [
    { n: 'Bomber', t: E => E.acted['Bomber'] >= 2 ? '* Vous bombez le torse encore plus fort.\n* Aaron est battu à son propre jeu. Il s\'en va en sueur.' : '* Vous bombez le torse.\n* Aaron bombe le torse encore plus fort !', run: E => { E.st.flex = true; if (E.acted['Bomber'] >= 2) E.spare = true; } },
    { n: 'Chasser', t: '* Vous chassez Aaron.\n* Il ne bouge pas d\'un poil.' },
  ],
  attacks: [A => AT.aimed(A, 'drop', 8, 180, { spread: 3 }), A => AT.rows(A, 'drop', 4, 140)],
});
M('woshua', {
  name: 'Woshua', hp: 70, atk: 10, df: 1, exp: 6, gold: 4, h: 56,
  check: '* Ce monstre veut tout nettoyer. Absolument tout.',
  intro: '* Woshua vous trouve sale.',
  flavor: ['* Woshua frotte frénétiquement.', '* Ça sent le savon.', '* Woshua chantonne un air de nettoyage.'],
  flavorSpare: '* Woshua est satisfait de votre propreté.',
  talk: ['Sale ! Sale !', 'Frotte, frotte !', 'Germe détecté !', 'Propre !'],
  acts: [
    { n: 'Nettoyer', t: '* Vous vous lavez les mains.\n* Woshua est enchanté par votre propreté !', spare: true },
    { n: 'Toucher', t: '* Vous touchez Woshua.\n* Il frissonne de dégoût.', run: E => { E.atk += 1; } },
    { n: 'Blague', t: '* Vous faites une blague crasseuse.\n* Woshua n\'apprécie pas.' },
  ],
  attacks: [A => soapBubbles(A)],
});
function soapBubbles(A) {
  A.box(170, 140); A.dur = 5;
  A.every(0.3, 4.2, 0.35, i => { const k = A.k, x = rand(k.l + 10, k.r - 10); A.add(bul({ x, y: k.b + 10, vy: -90, img: 'orb', r: 6, life: 4, color: i % 5 === 0 ? 'green' : 'white', heal: 2, upd: b => { b.x = x + Math.sin(b.t * 3 + i) * 18; } })); });
}
M('moldbygg', {
  name: 'Moldbygg', hp: 87, atk: 9, df: 5, exp: 30, gold: 8, h: 76,
  check: '* Une version géante de Moldsmal, aussi profonde qu\'une flaque.',
  intro: '* Moldbygg s\'étale de tout son long.',
  flavor: ['* Moldbygg ondule majestueusement.', '* Ça sent le bonbon à la fraise.'],
  flavorSpare: '* Moldbygg est d\'accord avec vous.',
  talk: ['Blooorb.', 'Gloooop.', '*ondule fort*'],
  acts: [
    { n: 'Imiter', t: '* Vous ondulez à votre tour.\n* Moldbygg vous trouve très convaincant.', spare: true },
    { n: 'Flirter', t: '* Vous ondulez de façon séduisante.\n* Moldbygg rougit... gélatineusement.', spare: true },
  ],
  attacks: [A => AT.bouncers(A, 'orb', 5, 150), A => AT.cols(A, 'drop', 5, 120)],
});
M('temmie', {
  name: 'Temmie', hp: 5, atk: 1, df: 1, exp: 1, gold: 2, h: 44,
  check: '* hOI !! c\'est TEMMIE !!',
  intro: '* Temmie vibre intensément.',
  flavor: ['* Temmie vibre.', '* Temmie a fait des études... presque.', '* Ça sent les flocons Tem.'],
  flavorSpare: '* Temmie est trop excitée pour se battre.',
  voice: 'temmie',
  talk: ['hOI !!!', 'tEm aDoRe hUmAIn !!', 'aW,,, mErCi !!', 'tEm vA à lA fAc !!'],
  acts: [
    { n: 'Parler', t: '* Vous parlez à Temmie.\n* « hOI !! tEm suI tEmMiE !! »', spare: true },
    { n: 'Caresser', t: '* Vous caressez Temmie.\n* Elle vibre encore plus fort.', spare: true },
    { n: 'Nourrir', t: '* Vous lui offrez des Flocons Tem imaginaires.\n* Temmie les mange avec passion.', spare: true },
    { n: 'Câliner', t: '* Vous serrez Temmie dans vos bras.\n* Elle explose de joie.', spare: true },
  ],
  attacks: [A => AT.bouncers(A, 'heartb', 3, 160), A => AT.hop(A, 4, 'heartb')],
});
M('shyren', {
  name: 'Shyren', hp: 70, atk: 10, df: 0, exp: 30, gold: 10, h: 56, mercyNeed: 3,
  check: '* Une sirène trop timide pour chanter seule.',
  intro: '* Shyren se cache derrière un rocher... mais elle dépasse.',
  flavor: ['* Shyren fredonne un air timide.', '* Shyren rougit.', '* Une douce mélodie flotte dans l\'air.'],
  flavorSpare: '* Shyren chante à pleine voix, comblée.',
  talk: ['La... la...', '...', 'Mmh mmh...', '(Chante doucement.)'],
  acts: [
    { n: 'Fredonner', t: '* Vous fredonnez un air.\n* Shyren vous suit timidement.', mercy: 1, run: E => { E.st.hide = false; } },
    { n: 'Chanter', t: E => E.mercy >= 2 ? '* Vous chantez en duo.\n* Shyren a trouvé sa voix !' : '* Vous chantez.\n* Shyren chante un peu plus fort.', mercy: 1 },
    { n: 'Huer', t: '* Vous huez Shyren.\n* Elle se cache, honteuse.', run: E => { E.mercy = 0; E.st.hide = true; } },
  ],
  attacks: [A => notesWave(A), A => AT.spiral(A, 'note', 2, 80)],
});
function notesWave(A) {
  A.box(190, 140); A.dur = 5;
  A.every(0.3, 4.2, 0.28, i => { const k = A.k, y0 = k.cy + Math.sin(i * 0.6) * 40; A.fromSide(y0, 130, false, { img: 'note', r: 5, life: 3, upd: b => { b.y = y0 + Math.sin(b.t * 5) * 14; } }); });
}
M('glyde', {
  name: 'Glyde', hp: 220, atk: 9, df: 20, exp: 0, gold: 100, h: 44, mercyNeed: 3,
  check: '* Un monstre secret. Personne ne sait vraiment d\'où il vient.',
  intro: '* Glyde surgit dans un nuage de paillettes !',
  flavor: ['* Glyde parade.', '* Glyde fait la roue.', '* Ça sent le parfum bon marché.'],
  flavorSpare: '* Glyde est satisfait de lui-même.',
  talk: ['Admire-moi.', 'Tu as de la chance de me voir.', 'Je suis unique.'],
  acts: [
    { n: 'Admirer', t: '* Vous admirez Glyde.\n* Il bombe le... diamant.', mercy: 1 },
    { n: 'Ignorer', t: '* Vous ignorez Glyde.\n* Il fait encore plus de manières.', mercy: 1 },
    { n: 'Applaudir', t: '* Vous applaudissez.\n* Glyde salue la foule imaginaire.', mercy: 1 },
  ],
  attacks: [A => AT.aimed(A, 'diamond', 7, 170), A => AT.rings(A, 'diamond', 3, 7, 100)],
});

// ============================================================
//  HOTLAND
// ============================================================
M('vulkin', {
  name: 'Vulkin', hp: 85, atk: 7, df: 0, exp: 30, gold: 15, h: 44,
  check: '* Un petit volcan qui veut juste aider. Ses attaques soignent... parfois.',
  intro: '* Vulkin vous sourit chaleureusement.',
  flavor: ['* Vulkin crache un peu de fumée.', '* Vulkin veut que tout le monde soit heureux.', '* Ça sent le soufre.'],
  flavorSpare: '* Vulkin est fier de vous.',
  talk: ['Je vais t\'aider !', 'Tu as froid ? Je chauffe !', 'Je suis utile ?', 'Lave pour toi !'],
  acts: [
    { n: 'Encourager', t: '* Vous encouragez Vulkin.\n* Il est si heureux qu\'il vous offre une attaque... qui soigne !', run: E => { E.nextAttack = A => vulkinLava(A, true); } },
    { n: 'Câliner', t: '* Vous câlinez Vulkin.\n* C\'est chaud ! Vulkin est ému.', spare: true },
  ],
  attacks: [A => vulkinLava(A, false)],
});
function vulkinLava(A, heal) {
  A.box(160, 140); A.dur = 5;
  A.every(0.3, 4.2, 0.3, i => { const k = A.k; A.fromTop(rand(k.l + 8, k.r - 8), 140, { img: 'fire', r: 5, color: heal || i % 4 === 0 ? 'green' : 'white', heal: 1, upd: heal ? (b => { if (b.used) A.E.spare = true; }) : null }); });
}
M('tsunderplane', {
  name: 'Tsunderplane', hp: 80, atk: 10, df: 4, exp: 30, gold: 20, h: 42, mercyNeed: 2,
  check: '* Ce n\'est pas comme s\'il voulait être vérifié...',
  intro: '* Tsunderplane vous coupe la route. P-pas exprès !',
  flavor: ['* Tsunderplane fait semblant de ne pas vous voir.', '* Tsunderplane rougit, mais nie tout.', '* Ça sent le kérosène.'],
  flavorSpare: '* Tsunderplane... vous apprécie. Un peu.',
  talk: ['C-ce n\'est pas pour toi !', 'Idiot !', 'Ne te fais pas d\'idées !', 'Hmpf !'],
  acts: [
    { n: 'Approcher', t: E => E.mercy >= 1 ? '* Vous vous approchez encore.\n* Tsunderplane rougit jusqu\'aux ailes.' : '* Vous vous approchez de Tsunderplane.\n* « Q-quoi ?! »', mercy: 1 },
    { n: 'Ignorer', t: '* Vous ignorez Tsunderplane.\n* « Hé ! Ne m\'ignore pas ! »' },
  ],
  attacks: [A => planes(A)],
});
function planes(A) {
  A.box(200, 140); A.dur = 5;
  A.every(0.3, 4.2, 0.5, i => { const k = A.k, y = rand(k.t + 14, k.b - 14), left = i % 2 === 0; A.fromSide(y, 190, left, { img: 'diamond', rot: Math.PI / 2, r: 6, life: 3 }); });
}
M('pyrope', {
  name: 'Pyrope', hp: 110, atk: 10, df: 0, exp: 30, gold: 15, h: 70, mercyNeed: 3,
  check: '* Une corde enflammée qui adore le rap.',
  intro: '* Pyrope débarque en rappant !',
  flavor: ['* Pyrope cherche une rime.', '* Pyrope s\'échauffe.', '* Ça sent le brûlé.'],
  flavorSpare: '* Pyrope est au maximum de sa chaleur.',
  talk: ['Yo, yo, le feu !', 'Je suis trop chaud !', 'Écoute mon flow !', 'Brûle, brûle !'],
  acts: [
    { n: 'Chauffer', t: E => E.mercy >= 2 ? '* Vous chauffez Pyrope au maximum.\n* Il est rouge de bonheur !' : '* Vous soufflez sur Pyrope.\n* Il chauffe un peu plus.', mercy: 1 },
    { n: 'Refroidir', t: '* Vous soufflez du froid.\n* Pyrope se calme... et s\'ennuie.', run: E => { E.mercy = Math.max(0, E.mercy - 1); } },
  ],
  attacks: [A => AT.spiral(A, 'fire', 3, 100), A => AT.rain(A, 'fire', 14, 150)],
});
M('rg01', {
  name: 'GR 01', hp: 150, atk: 12, df: 8, exp: 100, gold: 50, h: 80, mini: true,
  check: '* Garde royal. Il a peut-être des sentiments pour son coéquipier.',
  flavor: ['* Les gardes royaux prennent la pose.', '* GR 01 jette un regard en coin à GR 02.', '* Ça sent l\'armure chaude.'],
  flavorSpare: '* Les gardes royaux ont mieux à faire.',
  talk: E => E.flags.clean ? pick(['Euh... GR 02 ?', 'Tu... tu veux en parler ?']) : pick(['Humain ! Rends-toi !', 'Pour le roi !', 'Bro, on gère.']),
  acts: [
    { n: 'Nettoyer', t: '* Vous nettoyez l\'armure de GR 01.\n* Elle brille. GR 02 rougit en le regardant.', run: E => { E.flags.clean = true; for (const o of alive()) o.flags.clean = true; } },
    { n: 'Chuchoter', t: E => E.flags.clean ? '* Vous chuchotez à GR 01 que GR 02 l\'apprécie.\n* Ils décident de partir en parler.' : '* Vous chuchotez.\n* GR 01 n\'entend rien sous son casque.', run: E => { if (E.flags.clean) for (const o of alive()) o.spare = true; } },
  ],
  attacks: [A => AT.cols(A, 'cross', 4, 140), A => guardsFire(A)],
});
M('rg02', {
  name: 'GR 02', hp: 150, atk: 12, df: 8, exp: 100, gold: 50, h: 80, mini: true,
  check: '* Garde royal. Il fait trop chaud dans cette armure.',
  flavor: ['* Les gardes royaux font des pompes.', '* GR 02 transpire.'],
  flavorSpare: '* Les gardes royaux ont mieux à faire.',
  talk: E => E.flags.clean ? pick(['J-je... GR 01...', 'Il est si brillant...']) : pick(['On va t\'arrêter !', 'Pas de quartier !', 'Bro !']),
  acts: [
    { n: 'Nettoyer', t: '* Vous nettoyez l\'armure de GR 02.\n* Il respire mieux.', run: E => { E.flags.clean = true; } },
    { n: 'Chuchoter', t: E => E.flags.clean ? '* Vous chuchotez à GR 02 de dire ce qu\'il ressent.\n* Il prend son courage à deux mains.' : '* GR 02 ne vous entend pas.', run: E => { if (E.flags.clean) for (const o of alive()) o.spare = true; } },
  ],
  attacks: [A => AT.rows(A, 'fire', 4, 150)],
});
function guardsFire(A) { AT.rain(A, 'fire', 16, 170); }

// ============================================================
//  CORE
// ============================================================
M('finalfroggit', {
  name: 'Froggit Final', hp: 100, atk: 10, df: 4, exp: 120, gold: 30, h: 46,
  check: '* Il a enfin compris la vie. Il est d\'une sagesse inquiétante.',
  intro: '* Froggit Final vous fixe avec sagesse.',
  flavor: ['* Froggit Final médite.', '* Froggit Final saute avec gravité.', '* Ça sent l\'encens.'],
  flavorSpare: '* Froggit Final ne veut plus se battre.',
  talk: ['Croâ. (Le sens de la vie.)', 'Croâ croâ. (Tout est cycle.)', 'Croâ ? (Pourquoi te bats-tu ?)'],
  acts: [
    { n: 'Compliment', t: '* Froggit Final comprend parfaitement.\n* Il rougit avec sagesse.', spare: true },
    { n: 'Menacer', t: '* Froggit Final comprend votre menace.\n* Il est terrifié avec philosophie.', spare: true },
    { n: 'Mystifier', t: '* Vous faites un geste mystérieux.\n* Froggit Final est impressionné.', spare: true },
  ],
  attacks: [A => AT.flies(A, 9, 140), A => AT.hop(A, 5, 'pellet')],
});
M('whimsalot', {
  name: 'Whimsalot', hp: 95, atk: 9, df: 4, exp: 80, gold: 25, h: 56,
  check: '* Whimsun a grandi. Il porte une armure, mais son cœur tremble toujours.',
  intro: '* Whimsalot dégaine son épée en tremblant.',
  flavor: ['* Whimsalot se tient droit... presque.', '* Whimsalot bat des ailes avec courage.'],
  flavorSpare: '* Whimsalot n\'a plus le cœur à se battre.',
  talk: ['Je dois être brave...', 'Pour le roi... ?', 'Je n\'ai plus peur !', 'Si... si tu le dis...'],
  acts: [
    { n: 'Consoler', t: '* Vous dites à Whimsalot qu\'il peut poser son épée.\n* Il hésite... puis s\'apaise.', spare: true },
    { n: 'Terroriser', t: '* Vous criez sur Whimsalot.\n* Il tremble mais reste en place.', run: E => { E.atk += 2; } },
  ],
  attacks: [A => AT.moths(A, 12), A => AT.circle(A, 10, 'moth')],
});
M('astigmatism', {
  name: 'Astigmatism', hp: 120, atk: 10, df: 6, exp: 120, gold: 30, h: 54,
  check: '* Il impose ses règles. Ne le provoquez pas... ou si ?',
  intro: '* Astigmatism vous fixe intensément.',
  flavor: ['* Astigmatism ajuste sa monture.', '* Astigmatism ne cligne jamais des yeux.'],
  flavorSpare: '* Astigmatism vous respecte maintenant.',
  init: E => { E.st.look = true; },
  talk: ['Bleu : ne bouge pas.', 'Orange : bouge.', 'Respecte les règles.', 'Tu me défies ?'],
  acts: [
    { n: 'Défier', t: '* Vous défiez Astigmatism du regard.\n* Il apprécie votre audace.', mercy: 1, run: E => { if (E.mercy >= 2) E.spare = true; } },
    { n: 'Ne pas taquiner', t: '* Vous ne taquinez pas Astigmatism.\n* Il se détend un peu.', mercy: 1, run: E => { if (E.mercy >= 2) E.spare = true; } },
    { n: 'Taquiner', t: '* Vous taquinez Astigmatism.\n* Il devient furieux !', run: E => { E.atk += 3; } },
  ],
  attacks: [A => eyeOrbs(A)],
});
function eyeOrbs(A) {
  A.box(170, 150); A.dur = 5.2;
  A.every(0.3, 4.4, 0.9, i => {
    const col = i % 2 ? 'blue' : 'orange', k = A.k;
    A.at(A.t, () => {});
    for (let j = 0; j < 6; j++) { const a = j * TAU / 6 + i; A.add(bul({ x: k.cx + Math.cos(a) * 110, y: k.cy + Math.sin(a) * 110, img: 'eye', r: 6, color: col, life: 2.4, clip: false, upd: b => { const r = 110 * (1 - b.t / 1.6); b.x = k.cx + Math.cos(a + b.t) * r; b.y = k.cy + Math.sin(a + b.t) * r; if (b.t > 1.6) b.dead = true; } })); }
  });
}
M('knightknight', {
  name: 'Knight Knight', hp: 230, atk: 8, df: 6, exp: 150, gold: 40, h: 96,
  check: '* Une chevalière qui se bat toute la nuit. Elle a sommeil.',
  intro: '* Knight Knight fait tournoyer son fléau.',
  flavor: ['* Knight Knight bâille dans son casque.', '* Knight Knight cligne lentement des yeux.', '* Ça sent la nuit.'],
  flavorSpare: '* Knight Knight dort profondément.',
  talk: ['...', 'La nuit est longue...', 'Je ne dormirai pas...', '*bâille*'],
  acts: [
    { n: 'Berceuse', t: E => E.acted['Berceuse'] >= 2 ? '* Vous chantez une berceuse.\n* Knight Knight s\'endort !' : '* Vous chantez une berceuse.\n* Knight Knight dodeline de la tête.', run: E => { if (E.acted['Berceuse'] >= 2) E.spare = true; } },
    { n: 'Souhaiter', t: '* Vous souhaitez bonne nuit à Knight Knight.\n* Elle semble apaisée.', run: E => { E.acted['Berceuse'] = (E.acted['Berceuse'] || 0) + 1; } },
  ],
  attacks: [A => knightStars(A), A => AT.rain(A, 'star', 16, 170)],
});
function knightStars(A) {
  A.box(180, 150); A.dur = 5;
  A.every(0.3, 4.2, 0.9, () => { const k = A.k, x = rand(k.l + 20, k.r - 20), y = k.t + 20; for (let j = 0; j < 8; j++) A.shot(x, y, j * TAU / 8, 110, { img: 'star', r: 5, life: 3 }); });
}
M('madjick', {
  name: 'Madjick', hp: 190, atk: 9, df: 6, exp: 150, gold: 40, h: 64,
  check: '* Un sorcier mystérieux. Ses orbes ont leur propre volonté.',
  intro: '* Madjick fait apparaître ses orbes.',
  flavor: ['* Madjick murmure une incantation.', '* Les orbes de Madjick vous suivent.'],
  flavorSpare: '* Madjick est à court de magie.',
  talk: ['Abracadabra.', 'Ensorcelé !', 'Chaos !', 'Mes orbes te voient.'],
  acts: [
    { n: 'Fixer', t: E => E.acted['Fixer'] >= 2 ? '* Vous fixez les orbes.\n* Madjick perd sa concentration. Sa magie s\'évapore.' : '* Vous fixez les orbes de Madjick.\n* Ils tremblent.', run: E => { if (E.acted['Fixer'] >= 2) E.spare = true; } },
    { n: 'Méditer', t: '* Vous méditez.\n* Madjick est déconcerté.' },
  ],
  attacks: [A => chaseOrbs(A), A => AT.spiral(A, 'cross', 4, 90)],
});
function chaseOrbs(A) {
  A.box(170, 150); A.dur = 5;
  A.at(0.3, () => { const k = A.k; for (const x of [k.l + 15, k.r - 15]) A.add(bul({ x, y: k.t + 15, img: 'orb', r: 6, life: 4.6, upd: (b, dt) => { const a = Math.atan2(B.soul.y - b.y, B.soul.x - b.x); b.vx += Math.cos(a) * 260 * dt; b.vy += Math.sin(a) * 260 * dt; const sp = Math.hypot(b.vx, b.vy); if (sp > 130) { b.vx *= 130 / sp; b.vy *= 130 / sp; } } })); });
  A.every(1, 4.4, 0.8, () => { const k = A.k; A.fromTop(rand(k.l + 10, k.r - 10), 150, { img: 'cross', r: 5, vr: 6 }); });
}

// ============================================================
//  LABORATOIRE SECRET (Amalgamates)
// ============================================================
M('memoryhead', {
  name: 'Memoryhead', hp: 140, atk: 12, df: 4, exp: 0, gold: 0, h: 60, area: 'lab', mercyNeed: 2,
  check: '* Ils ne se souviennent plus de qui ils étaient.',
  intro: '* Memoryhead suinte vers vous.',
  flavor: ['* Memoryhead murmure des noms oubliés.', '* L\'air devient lourd.', '* Ça sent la poussière... et la mémoire.'],
  flavorSpare: '* Memoryhead se souvient d\'un moment heureux.',
  voice: 'gaster', talk: ['rejoins-nous.', 'tu étais là...', 'r e j o i n s', '...'],
  acts: [
    { n: 'Rejoindre', t: '* Vous tendez la main.\n* Memoryhead vous inonde de souvenirs... ce n\'était pas une bonne idée.', run: () => { G.hp = Math.max(1, G.hp - 6); Snd.hurt(); } },
    { n: 'Refuser', t: '* Vous refusez fermement.\n* Memoryhead hésite.', mercy: 1 },
    { n: 'Fixer', t: '* Vous fixez Memoryhead.\n* Il semble se souvenir de quelque chose.', mercy: 1 },
  ],
  attacks: [A => AT.spiral(A, 'pellet', 4, 80), A => AT.rings(A, 'pellet', 3, 10, 80)],
});
M('endogeny', {
  name: 'Endogeny', hp: 130, atk: 12, df: 4, exp: 0, gold: 0, h: 56, area: 'lab', mercyNeed: 2,
  check: '* Une masse de chiens fusionnés. Ils ont besoin d\'amour.',
  intro: '* Endogeny se précipite vers vous.',
  flavor: ['* Endogeny remue toutes ses queues.', '* Endogeny halète en chœur.'],
  flavorSpare: '* Endogeny est comblé.',
  talk: ['(Aboiements lointains.)', '(Halètement.)', '(Grognement doux.)'],
  acts: [
    { n: 'Caresser', t: '* Vous caressez Endogeny.\n* Tous les chiens frétillent.', mercy: 1 },
    { n: 'Jouer', t: '* Vous lancez un bâton.\n* Endogeny le rapporte... en plusieurs morceaux.', mercy: 1 },
  ],
  attacks: [A => dogsRun(A), A => AT.bouncers(A, 'dog', 3, 140)],
});
M('lemonbread', {
  name: 'Lemon Bread', hp: 120, atk: 12, df: 4, exp: 0, gold: 0, h: 60, area: 'lab', mercyNeed: 2,
  check: '* Ses dents sont nombreuses. Son sourire, sincère.',
  intro: '* Lemon Bread se dresse.',
  flavor: ['* Lemon Bread fredonne.', '* Lemon Bread ouvre la bouche. Trop grand.'],
  flavorSpare: '* Lemon Bread est apaisé.',
  talk: ['b o n j o u r', 'on est content de te voir.', '...'],
  acts: [
    { n: 'Fredonner', t: '* Vous fredonnez.\n* Lemon Bread fredonne avec vous.', mercy: 1 },
    { n: 'Saluer', t: '* Vous faites coucou.\n* Lemon Bread vous fait coucou avec trop de mains.', mercy: 1 },
  ],
  attacks: [A => AT.cols(A, 'pellet', 5, 130), A => AT.aimed(A, 'pellet', 8, 170, { spread: 3 })],
});
M('reaperbird', {
  name: 'Reaper Bird', hp: 150, atk: 12, df: 4, exp: 0, gold: 0, h: 70, area: 'lab', mercyNeed: 2,
  check: '* Il ne veut pas vous faire de mal. Il ne sait juste plus comment faire.',
  intro: '* Reaper Bird déploie ses ailes.',
  flavor: ['* Reaper Bird gazouille faiblement.', '* Des plumes tombent sans bruit.'],
  flavorSpare: '* Reaper Bird gazouille de bonheur.',
  talk: ['cui... cui...', '(Battement d\'ailes.)', '...'],
  acts: [
    { n: 'Caresser', t: '* Vous caressez Reaper Bird.\n* Il pousse un petit cri heureux.', mercy: 1 },
    { n: 'Siffler', t: '* Vous sifflez un air.\n* Reaper Bird vous répond.', mercy: 1 },
  ],
  attacks: [A => AT.rows(A, 'leaf', 5, 140), A => AT.rain(A, 'leaf', 16, 150, { spin: true })],
});
M('snowdrakemom', {
  name: 'Mère de Snowdrake', hp: 140, atk: 12, df: 4, exp: 0, gold: 0, h: 74, area: 'lab', mercyNeed: 2,
  check: '* Elle n\'arrive plus à rire.',
  intro: '* La Mère de Snowdrake vous fixe, le regard vide.',
  flavor: ['* Une odeur de glace fondue flotte.', '* Elle cherche quelqu\'un du regard.'],
  flavorSpare: '* Elle sourit enfin.',
  talk: ['Mon petit... ?', 'Fais-moi rire...', '...'],
  acts: [
    { n: 'Blague', t: E => E.mercy >= 1 ? '* Vous racontez une blague sur la neige.\n* Elle éclate de rire !' : '* Vous racontez une blague.\n* Elle ne rit pas... mais elle écoute.', mercy: 1 },
    { n: 'Rire', t: '* Vous riez doucement.\n* Elle essaie de sourire.', mercy: 1 },
  ],
  attacks: [A => snowSpiral(A), A => AT.rain(A, 'ice', 14, 150)],
});
