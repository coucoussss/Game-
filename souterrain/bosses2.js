'use strict';
// ============================================================
//  bosses2.js : Undyne (normale et Immortelle), Muffet, Mettaton (quiz, EX, NEO)
// ============================================================
// ---------- Lances d'Undyne (âme rouge) ----------
const UND = {
  // Lances qui jaillissent du sol de la boîte
  pillar(A, x, warn = 0.62, hold = 0.3) {
    Snd.warn();
    return A.add(bul({ kind: 'pillar', x, len: 0, life: 9, clip: true,
      upd: b => {
        const k = boxOf(B.box), full = k.h;
        if (b.t < warn) b.len = 8; else if (b.t < warn + 0.08) { b.len = 8 + (full - 8) * ((b.t - warn) / 0.08); if (!b.snd) { b.snd = 1; Snd.stab(); } }
        else if (b.t < warn + 0.08 + hold) b.len = full; else if (b.t < warn + 0.24 + hold) b.len = full * (1 - (b.t - warn - 0.08 - hold) / 0.16); else b.dead = true;
        b.vx = 0; b.vy = 0;
      },
      hit: (b, s) => b.t >= warn && b.len > 10 && Math.abs(s.x - b.x) < 9 && s.y + 4 > B.box.b - b.len,
      draw: b => {
        const k = boxOf(B.box);
        if (b.t < warn && Math.floor(b.t * 16) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(b.x - 6, k.t, 12, k.h); }
        const tip = k.b - b.len;
        drawSpear(b.x, tip, -Math.PI / 2, 1, SPEARS.white);
        ctx.fillStyle = '#6cc8f0'; ctx.fillRect(Math.round(b.x) - 2, tip + 50, 4, Math.max(0, b.len - 50));
      } }));
  },
  // Lance qui apparaît autour de l'âme, la vise puis fonce
  homing(A, cx, cy, a, r = 115, wind = 0.6, v = 520) {
    Snd.spear();
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, spin = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1);
    return A.add(mkSpear({ x, y, ang: a + Math.PI, harmless: true, life: 6, simg: SPEARS.white,
      upd: (b, dt) => {
        if (!b.fly) {
          b.vx = 0; b.vy = 0;
          const aim = Math.atan2(B.soul.y - b.y, B.soul.x - b.x);
          b.ang = aim + Math.max(0, 1 - b.t / 0.3) * spin; b.alpha = Math.min(1, b.t / 0.15);
          b.simg = b.t > wind - 0.12 ? SPEARS.hot : SPEARS.white;
          if (b.t >= wind) { b.fly = true; b.harmless = false; b.vx = Math.cos(aim) * v; b.vy = Math.sin(aim) * v; b.ang = aim; b.simg = SPEARS.white; }
        }
      } }));
  },
  straight(A, x, y, ang, v, delay = 0) { return A.add(mkSpear({ x, y, ang, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, delay, life: 6, simg: SPEARS.white })); },
  ring(A, count, o = {}) { const cx = B.soul.x, cy = B.soul.y, a0 = rand(0, TAU); for (let i = 0; i < count; i++) { const a = a0 + i * TAU / count; if (o.chain) A.at(A.t + o.chain * i, () => UND.homing(A, cx, cy, a, o.r, o.wind, o.v)); else UND.homing(A, cx, cy, a, o.r, o.wind, o.v); } },
  pillars(A) {
    const k = A.k, x0 = k.l + 10, n = Math.floor((k.w - 20) / 16) + 1, type = rint(0, 2), off = rint(0, 1), cs = Math.round((B.soul.x - x0) / 16);
    const gapAt = clamp(cs + rint(-5, 3), 1, n - 4), wide = type === 2 ? 3 : 2;
    for (let c = 0; c < n; c++) { const on = type === 0 ? Math.floor(c / 2) % 2 === off : c < gapAt || c > gapAt + wide; if (on) UND.pillar(A, x0 + c * 16); }
  },
  rain(A) { const k = A.k, x = Math.random() < 0.4 ? clamp(B.soul.x + rand(-10, 10), k.l + 8, k.r - 8) : rand(k.l + 8, k.r - 8); Snd.warn(); B.fx.push({ kind: 'mark', x, y: k.t + 6, t: 0, life: 0.42, draw: f => { if (Math.floor(f.t * 16) % 2 === 0) text('!', f.x - 8, f.y, { sx: 2, sy: 3, color: '#ff3030' }); } }); UND.straight(A, x, k.t - 60, Math.PI / 2, 540, 0.42); },
  wall(A, i, v) { const k = A.k, left = i % 2 === 0, lanes = Math.floor(k.h / 22), gap = rint(0, lanes - 1); for (let l = 0; l < lanes; l++) { if (l === gap) continue; const y = k.t + 11 + l * 22; if (left) UND.straight(A, -10, y, 0, v); else UND.straight(A, W + 10, y, Math.PI, v); } Snd.spear(); },
};
// Programme d'une attaque d'Undyne en plusieurs phases (verte / rouge)
function undyneScript(A, phases) {
  let t = 0;
  for (const ph of phases) {
    const t0 = t;
    if (ph.g) {
      A.at(t0, () => { A.box(76, 76, 320, 310); A.soul('green'); B.U && (B.U.raiseT = 0.6); });
      t += 0.5;
      let tt = t + 0.9, last = rint(0, 3);
      const o = ph.g;
      for (let i = 0; i < o.n; i++) {
        const r = Math.random(), kind = r < (o.yellow || 0) ? 'y' : r < (o.yellow || 0) + (o.fast || 0) ? 'f' : 'b';
        const dir = Math.random() < 0.3 ? last : rint(0, 3);
        if (i > 0) tt += (dir === last && kind === 'b' ? o.gap * 0.62 : o.gap) * rand(0.95, 1.15);
        const v = kind === 'f' ? o.v * 1.5 : o.v, spawn = tt - 300 / v - (kind === 'y' ? 0.24 : 0), d = dir;
        A.at(Math.max(t, spawn), () => A.arrow(d, kind, v));
        last = dir;
      }
      t = tt + 0.7;
    } else {
      A.at(t0, () => { A.box(ph.w || 200, ph.h || 130, 320, 318); A.soul('red'); B.U && (B.U.raiseT = 0.4); });
      t += 0.45;
      const base = t;
      for (const [et, fn] of ph.ev) A.at(base + et, () => { fn(); if (B.U) B.U.raiseT = Math.max(B.U.raiseT || 0, 0.3); });
      t += ph.dur;
    }
  }
  A.dur = t + 0.3;
}
const evEvery = (t0, n, dt, fn) => Array.from({ length: n }, (_, i) => [t0 + i * dt, () => fn(i)]);

// ---------- Undyne (normale) ----------
M('undyne', {
  name: 'Undyne', hp: 1500, atk: 6, df: 20, exp: 500, gold: 0, h: 120, boss: true, voice: 'undyne', bubbleDX: 110, bubbleY: 36,
  checkName: 'UNDYNE', showAtk: 50, showDef: 20, check: '* La héroïne qui ne recule jamais.',
  acts: [
    { n: 'Supplier', t: '* Vous dites à Undyne que vous ne voulez pas vous battre.\n* Ses attaques deviennent un peu moins violentes.', run: E => { E.atk = Math.max(3, E.atk - 1); }, talk: ['Pas question de t\'écouter !', 'Tu veux la paix ? Mérite-la !'] },
    { n: 'Défier', t: '* Vous dites à Undyne que ses attaques sont trop faibles.\n* Elle accélère !', run: E => { E.flags.fast = (E.flags.fast || 0) + 1; }, talk: ['Trop faibles ?!', 'Tu vas voir !'] },
  ],
  draw(E) { UndyneNormal.draw(ctx, { t: time, x: 120 + (E.shake ? Math.sin(E.shake * 2.2) * E.shake * 0.6 : 0), y: -14, s: 2, melt: E.melt || 0, jitter: E.hp < E.max * 0.3 }); },
  frame: E => UndyneNormal.composite(time), dustAt: () => ({ x: 120, y: -14 }),
  onDeath: function* (E) {
    Snd.stopMusic(0.5);
    for (const [l, m] of [['Ngh...', 0.2], ['Non... pas maintenant...', 0.35], ['Alphys... Asgore... Papyrus...', 0.55], ['Je dois... tenir...', 0.75], ['...', 1]]) { E.melt = m; yield* talk(E, l, { speed: 18 }); }
  },
});
const UNDYNE_LINES = ['NGAAAH ! En garde !', 'Tu esquives bien... mais pas assez vite !', 'Pour Asgore ! Pour tout le monde !', 'Tu as le cœur d\'un guerrier. Dommage.', 'Rends-toi, humain !', 'Pourquoi tu ne te bats pas ?!', 'Tu ne fais que fuir ?!', 'Arrête de m\'épargner !', 'Je vais te transformer en sushi !', 'Grr... Tu es coriace !'];
function undyneNormalTurn(n, fast) {
  const v = 260 + n * 10 + fast * 30, gap = Math.max(0.24, 0.42 - n * 0.015);
  const k = n % 5;
  if (k === 0) return [{ g: { n: 8 + n, gap, v } }];
  if (k === 1) return [{ w: 200, h: 130, dur: 5, ev: evEvery(0.3, 5, 0.85, () => UND.pillars(A_CUR)) }];
  if (k === 2) return [{ g: { n: 10 + n, gap, v, yellow: n > 4 ? 0.2 : 0.1 } }];
  if (k === 3) return [{ w: 150, h: 130, dur: 4.4, ev: evEvery(0.3, 4, 1.0, () => UND.ring(A_CUR, 4, { wind: 0.7, v: 440 })) }];
  return [{ g: { n: 8, gap, v } }, { w: 220, h: 130, dur: 4, ev: evEvery(0.3, 4, 0.9, i => UND.wall(A_CUR, i, 230)) }];
}
let A_CUR = null;
const UNDYNE_BATTLE = {
  foes: ['undyne'], music: 'undyne', boss: true, bg: 'none', area: 'waterfall', flee: true, fleeChance: 1,
  intro: '* Undyne attaque !',
  flavor() { return pick(['* Undyne fait tournoyer sa lance.', '* Undyne pointe sa lance vers vous.', '* Le vent fait voler les cheveux d\'Undyne.', '* Ça sent le poisson et la colère.']); },
  spareFail: '* Undyne n\'a aucune intention de vous laisser partir.',
  *start(B) { const E = B.foes[0]; setBox(76, 76, 320, 310); yield* bossTalk(E, ['Assez parlé !', 'Tu veux passer ? Il faudra me battre !', 'En garde, humain !']); },
  *enemyTurn(B) {
    const E = B.foes[0];
    const line = E.talkNext || UNDYNE_LINES[Math.min(E.turn, UNDYNE_LINES.length - 1)]; E.talkNext = null;
    yield* runAttack(E, A => { A_CUR = A; undyneScript(A, undyneNormalTurn(E.turn, E.flags.fast || 0)); }, { lines: [].concat(line) });
    E.turn++;
  },
};

// ---------- Undyne l'Immortelle (route génocide) ----------
const UNDYING_INTRO = [
  ['...', 0.55], ['Tu croyais vraiment que j\'allais tomber comme ça ?'], ['Ce gamin... Tu allais le tuer sous mes yeux.'], ['Papyrus. Toute la ville de Snowdin. Tout le monde...'],
  ['...réduits en poussière. Et toi, tu souris.'], ['Mon corps tremble. Il voudrait se disperser au vent.'], ['Mais quelque chose en moi refuse.', 0, 'reform'],
  ['Asgore. Alphys. Le gamin. Tout le souterrain compte sur moi.'], ['Alors écoute-moi bien.'], ['Je ne vais PAS mourir.', undefined, 'shake'],
  ['Pour tous ceux qui croient encore en demain...'], ['JE VAIS T\'ARRÊTER !!!', undefined, 'start'],
];
const UNDYING_LINES = ['NGAAAH ! Montre-moi ce que tu vaux !', 'Tu esquives ? Pas pour longtemps !', 'Chaque lance porte le nom de quelqu\'un que tu as effacé.', 'Tu sens ça ? C\'est la colère de tout un peuple !', 'Plus vite ! PLUS VITE !',
  'Ha... ha... Ce n\'est rien. Juste une égratignure.', 'Papyrus croyait que tu pouvais changer. Il avait tort.', 'Je ne recule devant RIEN !', 'Mes jambes... Tais-toi, corps ! On n\'a pas fini !',
  'Alphys... j\'espère que tu as mis tout le monde à l\'abri.', 'Tu ne passeras pas. PAS TANT QUE JE RESPIRE !', 'Encore. ENCORE !', 'Je vois à travers toi. Il n\'y a rien. Rien du tout.', 'Ce monde ne t\'appartient pas !',
  'Je ne... tomberai... PAS !!', '...Encore une. Juste une de plus.', 'HAAAAAAAAAA !!!'];
const UNDYING_END = [['Ngh... Non... Pas maintenant...', 0.25], ['Je dois... tenir...', 0.4], ['Alphys... Asgore... Pardon...', 0.55], ['Non... NON !', 0.6], ['Écoute-moi bien, toi...', 0.7],
  ['Même si je disparais... ce n\'est pas fini.', 0.8], ['Asgore t\'attend. Et derrière lui, il y a tout un monde...', 0.9], ['...qui ne te laissera JAMAIS gagner.', 1], ['Ha... ha... ha...', 1.15]];
M('undying', {
  name: 'Undyne', hp: 15000, atk: 6, df: 20, exp: 1500, gold: 0, h: 120, boss: true, voice: 'undyne', bubbleDX: 110, bubbleY: 36,
  checkName: 'UNDYNE L\'IMMORTELLE', showAtk: 50, showDef: 20, check: '* Sa volonté refuse de la laisser tomber.',
  acts: [],
  init: E => { E.melt = 0.55; E.meltTo = 0.55; E.raise = 0; E.raiseT = 0; },
  tick: (E, dt) => { E.melt += ((E.meltTo ?? 0) - E.melt) * Math.min(1, dt * 2); E.raiseT = Math.max(0, (E.raiseT || 0) - dt); E.raise += ((E.raiseT > 0 ? 1 : 0) - E.raise) * Math.min(1, dt * 14); },
  draw(E) {
    const sh = E.shake ? Math.sin(E.shake * 2.2) * E.shake * 0.6 : 0;
    UndyneUndying.draw(ctx, { t: time, x: 120 + sh, y: -6, s: 2, raise: E.raise, white: E.white, melt: E.melt > 0.02 ? E.melt : 0, jitter: E.hp < E.max * 0.3, wind: 1 + (1 - E.hp / E.max) * 0.4 });
  },
  frame: E => UndyneUndying.snapshot({ t: time, melt: E.melt }), dustAt: () => ({ x: 120, y: -6 }),
  noDie: true,
  afterHit: function* (E) {
    if (E.hp > 0) return;
    Snd.stopMusic(1.5);
    for (const [l, m] of UNDYING_END) { E.meltTo = m; yield* talk(E, l, { speed: 20 }); }
    yield* killEnemy(E);
  },
});
function undyingTurn(turn, phase2) {
  const late = Math.max(0, turn - 16), sp = (1 + Math.min(late, 6) * 0.04) * (phase2 ? 1.07 : 1), L = Math.min(turn, 16);
  const v = (330 + L * 9) * sp, gap = Math.max(0.16, 0.34 - L * 0.011) / sp;
  const g = o => ({ g: { n: 12, gap, v, ...o } });
  const T = turn > 16 ? 12 + (late % 5) : turn;
  const P = () => A_CUR;
  switch (T) {
    case 0: return [g({ n: 10, gap: 0.4, v: 300 })];
    case 1: return [{ w: 150, h: 130, dur: 4.4, ev: evEvery(0.1, 4, 1.0, () => UND.ring(P(), 4, { wind: 0.7, v: 460 })) }];
    case 2: return [g({ n: 14, yellow: 0.18 })];
    case 3: return [{ w: 240, h: 130, dur: 5.6, ev: evEvery(0.1, 6, 0.85, () => UND.pillars(P())) }];
    case 4: return [g({ n: 18, yellow: 0.12, fast: 0.1 })];
    case 5: return [g({ n: 10, yellow: 0.2 }), { w: 150, h: 130, dur: 3.6, ev: evEvery(0.1, 3, 0.95, () => UND.ring(P(), 5, { wind: 0.6 })) }];
    case 6: return [{ w: 240, h: 130, dur: 5.4, ev: [...evEvery(0.1, 5, 0.9, i => UND.wall(P(), i, 250)), ...evEvery(0.6, 8, 0.5, () => UND.rain(P()))] }];
    case 7: return [g({ n: 22, yellow: 0.28, fast: 0.1 })];
    case 8: return [{ w: 240, h: 130, dur: 5.6, ev: [...evEvery(0.1, 5, 1.0, () => UND.pillars(P())), ...evEvery(0.6, 4, 1.0, () => UND.ring(P(), 3, { wind: 0.7 }))] }];
    case 9: return [g({ n: 14, yellow: 0.15 }), { w: 170, h: 130, dur: 4, ev: evEvery(0.1, 4, 0.8, () => UND.ring(P(), 6, { chain: 0.07, wind: 0.55 })) }];
    case 10: return [{ w: 240, h: 130, dur: 5, ev: evEvery(0.1, 14, 0.32, () => UND.rain(P())) }, g({ n: 12, yellow: 0.3 }), { w: 150, h: 130, dur: 3.4, ev: evEvery(0.1, 3, 0.9, () => UND.ring(P(), 6, { wind: 0.55 })) }];
    case 11: return [g({ n: 26, yellow: 0.32, fast: 0.12 })];
    case 12: return [{ w: 170, h: 130, dur: 5, ev: evEvery(0.1, 5, 0.85, () => UND.ring(P(), 8, { chain: 0.06, wind: 0.5, v: 560 })) }];
    case 13: return [g({ n: 16, yellow: 0.3 }), { w: 240, h: 130, dur: 5, ev: [...evEvery(0.1, 10, 0.4, () => UND.rain(P())), ...evEvery(0.4, 4, 1.0, () => UND.pillars(P()))] }, g({ n: 12, yellow: 0.4 })];
    case 14: return [g({ n: 30, yellow: 0.4, fast: 0.15 })];
    case 15: return [{ w: 240, h: 130, dur: 6, ev: [...evEvery(0.1, 12, 0.35, () => UND.rain(P())), ...evEvery(0.5, 4, 1.1, i => UND.wall(P(), i, 280)), ...evEvery(1.2, 3, 1.3, () => UND.ring(P(), 5, { wind: 0.6 }))] }];
    default: return [g({ n: 20, yellow: 0.35, gap: gap * 0.92 }), { w: 170, h: 130, dur: 4, ev: evEvery(0.1, 4, 0.75, () => UND.ring(P(), 8, { chain: 0.05, wind: 0.5, v: 580 })) }, g({ n: 20, yellow: 0.45, gap: gap * 0.9 })];
  }
}
const UNDYING_BATTLE = {
  foes: ['undying'], music: null, boss: true, bg: 'none', area: 'waterfall',
  intro: '* Undyne l\'Immortelle vous barre le chemin.',
  flavor(B) { const E = B.foes[0], f = E.hp / E.max; if (f < 0.25) return pick(['* Le corps d\'Undyne commence à fondre.', '* Undyne tient debout par pure détermination.']); if (f < 0.55) return pick(['* Des gouttes tombent du corps d\'Undyne.', '* Undyne refuse de tomber.']); return pick(['* Undyne serre sa lance à s\'en briser les doigts.', '* L\'air vibre autour d\'Undyne.', '* L\'œil d\'Undyne brille d\'une lueur farouche.']); },
  spareFail: '* Undyne ne vous épargnera pas.',
  *start(B) {
    const E = B.foes[0]; B.U = E;
    for (const [l, m, ev] of UNDYING_INTRO) {
      if (m !== undefined) E.meltTo = m;
      if (ev === 'reform') { flash(1); E.meltTo = 0; E.melt = 0; E.shake = 10; Snd.cymbal(); }
      if (ev === 'shake') { E.shake = 10; shake = 4; Snd.slam(); }
      if (ev === 'start') { E.shake = 14; shake = 8; flash(0.8); Snd.slam(); }
      yield* talk(E, l, { speed: 26 });
    }
    Snd.music('undying');
  },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (E.gone) return;
    if (!E.phase2 && E.hp < E.max * 0.5) { E.phase2 = true; E.talkNext = 'Tu sens ça ? Mon cœur brûle... Je suis encore PLUS FORTE !'; flash(0.5); }
    let line = E.talkNext || (E.turn < UNDYING_LINES.length ? UNDYING_LINES[E.turn] : pick(['Toujours debout !', 'Encore ! ENCORE !', 'Ngh... Pas encore !'])); E.talkNext = null;
    E.raiseT = 0.6;
    yield* runAttack(E, A => { A_CUR = A; undyneScript(A, undyingTurn(E.turn, E.phase2)); }, { lines: [line] });
    E.turn++;
  },
};

// ============================================================
//  MUFFET
// ============================================================
M('muffet', {
  name: 'Muffet', hp: 1250, atk: 7, df: 0, exp: 300, gold: 0, h: 96, boss: true, voice: 'muffet', bubbleDX: 90,
  checkName: 'MUFFET', showAtk: 38, showDef: 22, check: '* Si elle vous invite à goûter, refusez.',
  acts: [
    { n: 'Lutter', t: '* Vous essayez de vous dégager de la toile.\n* Peine perdue.' },
    { n: 'Payer', t: E => G.gold >= 20 ? '* Vous donnez 20 OR à Muffet.\n* « Merci pour ta généreuse donation~ »' : '* Vous n\'avez pas assez d\'OR.', run: E => { if (G.gold >= 20) { G.gold -= 20; E.atk = Math.max(3, E.atk - 1); E.flags.paid = (E.flags.paid || 0) + 1; } } },
  ],
  flavor: ['* Muffet verse le thé avec ses six bras.', '* Muffet compte son argent.', '* Les araignées applaudissent.', '* Ça sent les beignets.'],
  flavorSpare: '* Muffet a l\'air désolée.',
});
const MUFFET_LINES = ['Ahuhuhu~ Tu pensais t\'échapper ?', 'Mes araignées adorent les pâtisseries~', 'Tu sais combien coûte un voyage pour les araignées des Ruines ?', 'Ton argent servira à une bonne cause~',
  'C\'est l\'heure du goûter de mon chouchou~ !', 'Ahuhuhu~ Il a faim, tu sais ?', 'Tu commences à me plaire, mon petit~', 'Encore une petite danse ?', 'C\'est l\'heure du dessert~ !'];
function muffetAttack(A, n) {
  A.box(220, 140); A.soul('purple'); A.dur = 6;
  const kind = n === 4 || n === 8 ? 'pet' : n % 3;
  const L = () => lanes();
  if (kind === 0) A.every(0.3, 5, 0.45, i => { const y = L()[rint(0, 2)], left = i % 3 === 0; A.add(bul({ x: left ? A.k.l - 10 : A.k.r + 10, y, vx: left ? 150 : -150, img: 'spider', r: 5, life: 3 })); });
  else if (kind === 1) A.every(0.3, 5, 0.5, i => { const k = A.k, y = L()[i % 3]; A.add(bul({ x: k.r + 10, y, vx: -260, ax: 260, img: 'web', r: 5, vr: 10, life: 4 })); });
  else if (kind === 2) A.every(0.3, 5, 0.6, () => { const k = A.k, lane = rint(0, 2); for (let j = 0; j < 3; j++) A.add(bul({ x: k.r + 10 + j * 26, y: L()[lane], vx: -160, img: 'spider', r: 5, life: 4 })); });
  else {
    // le chouchou de Muffet monte depuis le bas
    A.box(220, 180); A.dur = 8;
    A.at(0.2, () => { const pet = A.add(bul({ kind: 'pet', x: 320, y: 0, life: 9, clip: false, harmless: false, hit: (b, s) => s.y > b.y - 6, upd: b => { const k = boxOf(B.box); b.x = k.cx; b.y = k.b + 40 - Math.min(k.h * 0.45, b.t * 18) + Math.sin(b.t * 5) * 6; },
      draw: b => { ctx.fillStyle = '#b040d0'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 30, 110, 40, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff'; for (let x = -90; x <= 90; x += 18) { ctx.beginPath(); ctx.moveTo(b.x + x - 7, b.y + 4); ctx.lineTo(b.x + x + 7, b.y + 4); ctx.lineTo(b.x + x, b.y + 18); ctx.fill(); } ctx.fillStyle = '#ff3060'; ctx.fillRect(b.x - 30, b.y - 30, 12, 12); ctx.fillRect(b.x + 18, b.y - 30, 12, 12); } })); void pet; });
    A.every(0.5, 7.5, 0.55, () => { const y = lanes()[rint(0, 1)]; A.add(bul({ x: A.k.r + 10, y, vx: -150, img: 'spider', r: 5, life: 4 })); });
  }
}
const MUFFET_BATTLE = {
  foes: ['muffet'], music: 'muffet', boss: true, bg: 'none', area: 'hotland',
  intro: '* Muffet vous attrape dans sa toile !',
  *start(B) { const E = B.foes[0]; setBox(220, 140); yield* bossTalk(E, ['Ahuhuhu~ Bienvenue dans notre toile, mon petit~', 'On m\'a dit qu\'un humain passerait par ici...', '...un humain qui DÉTESTE les araignées~']); },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (E.spare) { yield* bossTalk(E, ['Ahuhuhu~ Tu peux partir, mon petit~']); return; }
    const call = E.turn >= 8 || (G.flags.spiderSale && E.turn >= 2);
    if (call) {
      prepSoul(); menuBox();
      yield* talk(E, ['Oh ? Un appel des araignées ?', '...Comment ? Cet humain a acheté nos pâtisseries ?', 'Oh là là, quel malentendu~', 'Je pensais que tu étais quelqu\'un d\'autre~', 'Pardon, mon petit~ Je te laisse partir~']);
      E.spare = true; return;
    }
    yield* runAttack(E, A => muffetAttack(A, E.turn), { lines: [MUFFET_LINES[Math.min(E.turn, MUFFET_LINES.length - 1)]] });
    E.turn++;
  },
};

// ============================================================
//  METTATON — le jeu télévisé
// ============================================================
M('mettaton', { name: 'Mettaton', hp: 9999, atk: 4, df: 99, exp: 0, gold: 0, h: 78, boss: true, voice: 'mettaton', bubbleDX: 70, checkName: 'METTATON', check: '* La star de la télévision du Souterrain.' });
const QUIZ = [
  { q: 'Quel est le plat préféré de Papyrus ?', a: ['Spaghettis', 'Soupe neige', 'Hot-chien', 'Croquettes'], c: 0 },
  { q: 'Que signifie « LV » ?', a: ['Volume', 'Vitamines', 'L\'AMOUR', 'Victoire'], c: 2 },
  { q: 'Que faire face à une attaque bleue ?', a: ['Bouger', 'Rester immobile', 'Crier', 'Danser'], c: 1 },
  { q: 'Qui est la plus grande star du Souterrain ?', a: ['Napstablook', 'METTATON', 'Le roi', 'Toi'], c: 1 },
  { q: 'Quel est le titre d\'Undyne ?', a: ['Reine', 'Capitaine garde', 'Scientifique', 'Cuisinière'], c: 1 },
  { q: 'Qui la docteure Alphys admire-t-elle en secret ?', a: ['Undyne', 'Undyne', 'Undyne', 'Undyne'], c: -1 },
];
const QUIZ_BATTLE = {
  foes: ['mettaton'], music: 'mettaton', boss: true, bg: 'none', area: 'hotland', noReward: true,
  *start(B) {
    const E = B.foes[0];
    setBox(575, 140);
    yield* bossTalk(E, ['OHHHH ! BIENVENUE, MESDAMES ET MESSIEURS...', '...DANS LE JEU TÉLÉVISÉ LE PLUS MORTEL DU SOUTERRAIN !', 'LES RÈGLES SONT SIMPLES : RÉPONDS CORRECTEMENT...', '...OU MEURS ! ET MAINTENANT, PREMIÈRE QUESTION !']);
    for (let i = 0; i < QUIZ.length; i++) {
      const Q = QUIZ[i];
      setBox(575, 140); B.phase = 'quiz'; B.quiz = { Q, t: 0, picked: -1, i };
      B.soul.x = 320; B.soul.y = 320; B.soul.visible = true; setSoul('red', { silent: true });
      // on laisse le joueur déplacer l'âme sur une réponse
      yield () => { B.quiz.t += 1 / 60; updateSoul(1 / 60); const k = boxOf(B.box); for (let j = 0; j < 4; j++) { const r = quizRect(k, j); if (B.soul.x > r.x && B.soul.x < r.x + r.w && B.soul.y > r.y && B.soul.y < r.y + r.h) { B.quiz.picked = j; return true; } } return B.quiz.t > 10; };
      const ok = Q.c === -1 || B.quiz.picked === Q.c;
      B.phase = 'enemyTalk';
      if (ok) { Snd.ding(); yield* talk(E, Q.c === -1 ? 'OHHH ! TU LE SAVAIS DONC ! QUEL SCANDALE !' : pick(['CORRECT !', 'BONNE RÉPONSE, CHÉRI(E) !', 'EXACT ! LE PUBLIC EST EN DÉLIRE !'])); }
      else { G.hp = Math.max(1, G.hp - 4); Snd.hurt(); shake = 5; flash(0.6, '#ffff60'); yield* talk(E, pick(['FAUX ! BZZZT !', 'OH NON, CE N\'EST PAS ÇA !'])); }
    }
    B.quiz = null; menuBox();
    yield* bossTalk(E, ['OOOH ! QUEL DOMMAGE, ON N\'A PLUS DE TEMPS !', 'MAIS ON SE REVERRA BIENTÔT, CHÉRI(E) !', 'RESTEZ BRANCHÉS !']);
    E.gone = true; E.fadeT = 0.001; Snd.whoosh();
    B.forceEnd = true; B.result = 'special';
  },
  drawTop(B) {
    if (!B.quiz) return;
    const k = boxOf(B.box), Q = B.quiz.Q;
    text(Q.q, 320, 196, { sx: 1, sy: 2, center: true, color: '#ffff60' });
    for (let j = 0; j < 4; j++) { const r = quizRect(k, j); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h); text(String.fromCharCode(65 + j) + ') ' + Q.a[j], r.x + 8, r.y + 12, { sx: 1, sy: 2 }); }
    text(String(Math.max(0, Math.ceil(10 - B.quiz.t))), 600, 200, { sx: 2, sy: 3, color: '#ff6060' });
    if (Q.c >= 0 && B.quiz.t > 3) text('Alphys pointe discrètement : ' + String.fromCharCode(65 + Q.c), 320, 226, { sx: 1, sy: 1, center: true, color: '#9a9aa8' });
  },
  playerTurn: function* () { yield; },
};
function quizRect(k, j) { const w = 220, h = 40; return { x: j % 2 ? k.r - w - 10 : k.l + 10, y: j < 2 ? k.t + 8 : k.b - h - 8, w, h }; }

// ============================================================
//  METTATON EX
// ============================================================
M('mettatonex', {
  name: 'Mettaton EX', hp: 900, atk: 6, df: 6, exp: 800, gold: 0, h: 116, boss: true, voice: 'mettaton', bubbleDX: 80, bubbleY: 20,
  checkName: 'METTATON EX', showAtk: 47, showDef: 47, check: '* Sa forme EX. Plus de jambes, plus de glamour.',
  acts: [
    { n: 'Poser', t: E => '* Vous prenez une pose dramatique.\n* Les audiences montent !', run: E => { B.ratings += 120 + E.turn * 40; } },
    { n: 'Se vanter', t: '* Vous vous vantez de ne jamais être touché.\n* Le public adore !', run: E => { B.ratings += 300; B.boast = true; } },
    { n: 'Volte-face', t: '* Vous jouez les méchants.\n* Le public hue... et adore ça !', run: E => { if (!E.flags.heel) { B.ratings += 450; E.flags.heel = true; } else B.ratings += 50; } },
    { n: 'Brûler', t: '* Vous brûlez de passion.\n* Mettaton est ébloui !', run: E => { B.ratings += 200; } },
  ],
  flavor: ['* Mettaton prend la pose.', '* Le public retient son souffle.', '* Les projecteurs vous aveuglent.', '* Ça sent la laque.'],
  onDeath: function* (E) { Snd.stopMusic(0.4); yield* talk(E, ['OH... CHÉRI(E)...', 'JE VOIS QUE LE SPECTACLE EST FINI...', 'MAIS LES AUDIENCES... ÉTAIENT... SUBLIMES...']); },
});
function mexAttack(A, n) {
  const k = () => A.k, kind = n % 5;
  A.box(200, 150); A.dur = 6;
  if (kind === 0) { A.every(0.3, 5.2, 0.5, i => A.add(bul({ x: rand(k().l + 10, k().r - 10), y: k().t - 30, vy: 200, img: 'leg', r: 6, w: 14, h: 56, life: 3, color: i % 4 === 3 ? 'blue' : 'white' }))); }
  else if (kind === 1) {
    A.soul('yellow');
    A.every(0.3, 5.4, 0.7, i => {
      const x = rand(k().l + 16, k().r - 16), bomb = i % 2 === 0;
      A.add(bul({ x, y: k().t - 12, vy: 60, img: bomb ? 'bomb' : 'box', r: 7, life: 5, shootable: true,
        onShot: b => { b.dead = true; Snd.slam(); if (bomb) { for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) A.add(bul({ x: b.x, y: b.y, vx: d[0] * 320, vy: d[1] * 320, w: d[0] ? 30 : 6, h: d[0] ? 6 : 30, life: 0.6 })); } else for (let j = 0; j < 6; j++) A.shot(b.x, b.y, j * TAU / 6, 160, { img: 'pellet', r: 3, life: 2 }); B.ratings += 15; } }));
    });
  } else if (kind === 2) { A.every(0.4, 5.2, 0.7, i => A.laser({ vert: i % 2 === 0, x: rand(k().l + 20, k().r - 20), y: rand(k().t + 20, k().b - 20), color: pick(['blue', 'orange', 'white']), warn: 0.55, on: 0.35 })); }
  else if (kind === 3) { A.at(0.3, () => { const cx = k().cx, cy = k().t + 30; for (let j = 0; j < 10; j++) A.add(bul({ x: cx, y: cy, img: 'heartb', r: 5, life: 5, a: j * TAU / 10, upd: b => { const R = 20 + b.t * 30; b.x = cx + Math.cos(b.a + b.t * 1.5) * R; b.y = cy + 20 + Math.sin(b.a + b.t * 1.5) * R * 0.8; } })); }); A.every(1, 5, 0.6, () => A.fromTop(rand(k().l + 10, k().r - 10), 160, { img: 'diamond', r: 5 })); }
  else { A.box(240, 140); A.every(0.3, 5.2, 0.4, i => { const left = i % 2 === 0; A.fromSide(rand(k().t + 12, k().b - 12), 210, left, { img: 'box', r: 7 }); }); }
}
const MEX_LINES = ['OH OUI ! LE SPECTACLE COMMENCE !', 'LE PUBLIC VEUT DU SANG, CHÉRI(E) !', 'REGARDE CES JAMBES !', 'TU AS UN TALENT FOU POUR ESQUIVER !', 'LES AUDIENCES GRIMPENT !', 'OOOH, QUEL SUSPENSE !', 'TU N\'ES PAS SI MAUVAIS(E)...', 'ON APPROCHE DU GRAND FINAL !', 'DERNIÈRE ATTAQUE ! FAISONS-LA BRILLER !'];
const METTATON_EX_BATTLE = {
  foes: ['mettatonex'], music: 'mettaton', boss: true, bg: 'stage', area: 'hotland',
  drawBg(B) {
    ctx.fillStyle = '#1a0010'; ctx.fillRect(0, 0, W, 246);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = 'hsla(' + ((time * 60 + i * 45) % 360) + ',100%,60%,0.12)'; ctx.beginPath(); ctx.moveTo(40 + i * 80, 0); ctx.lineTo(i * 80, 246); ctx.lineTo(80 + i * 80, 246); ctx.fill(); }
    text('AUDIENCE', 520, 12, { sx: 1, sy: 2, color: '#ff7fd0' }); text(String(Math.round(B.ratings)), 520, 32, { sx: 2, sy: 2, color: '#ffff60' });
  },
  *start(B) { B.ratings = 0; const E = B.foes[0]; setBox(200, 150); yield* bossTalk(E, ['OHHHH OUI !', 'MESDAMES ET MESSIEURS, VOICI... METTATON EX !', 'LE SPECTACLE DE TA VIE COMMENCE MAINTENANT, CHÉRI(E) !']); },
  tick(B) { if (B.hits !== B.lastHits) { B.ratings = Math.max(0, B.ratings - 30 * (B.hits - (B.lastHits || 0))); B.lastHits = B.hits; } if (B.phase === 'attack' && !B.boast) B.ratings += 0.6; },
  *enemyTurn(B) {
    const E = B.foes[0];
    if (E.turn >= 9 || B.ratings >= 10000) {
      prepSoul(); menuBox(); Snd.stopMusic(1);
      yield* talk(E, ['OH... ATTENDS.', 'LES AUDIENCES... ' + Math.round(B.ratings) + ' TÉLÉSPECTATEURS !', B.ratings > 5000 ? 'C\'EST UN RECORD ABSOLU !' : 'C\'EST... HONORABLE.', 'TU SAIS, CHÉRI(E)... MERCI.', 'J\'AI PU BRILLER UNE DERNIÈRE FOIS.', 'BONNE CHANCE POUR LA SUITE...']);
      E.spared = true; E.gone = true; E.fadeT = 0.001; G.flags.mettatonSpared = true;
      B.forceEnd = true; B.result = 'spared'; return;
    }
    yield* runAttack(E, A => mexAttack(A, E.turn), { lines: [MEX_LINES[Math.min(E.turn, MEX_LINES.length - 1)]] });
    E.turn++;
  },
};

// ---------- Mettaton NEO (route génocide) ----------
M('mettatonneo', {
  name: 'Mettaton NEO', hp: 30000, atk: 90, df: 9, exp: 1, gold: 0, h: 116, boss: true, voice: 'mettaton', spr: 'mettatonex',
  checkName: 'METTATON NEO', showAtk: 90, showDef: 9, check: '* Le rêve d\'un robot qui voulait protéger tout le monde.',
  hurt: E => E.hp,
  onDeath: function* (E) { Snd.stopMusic(0.3); yield* talk(E, ['...', 'JE VOIS.', 'ALORS C\'EST ÇA...', 'AU MOINS... PERSONNE D\'AUTRE NE PEUT TE VOIR...', 'MAINTENANT...']); },
});
const METTATON_NEO_BATTLE = {
  foes: ['mettatonneo'], music: 'mettaton', boss: true, bg: 'none', area: 'hotland',
  intro: '* Mettaton NEO vous barre le chemin.',
  *start(B) { const E = B.foes[0]; yield* bossTalk(E, ['TU NE PASSERAS PAS.', 'ALPHYS A ÉVACUÉ TOUT LE MONDE.', 'ET MOI, JE SUIS LÀ POUR TE RETENIR.', 'PRÉPARE-TOI POUR LE FINAL !']); },
  *enemyTurn(B) { const E = B.foes[0]; if (!E.gone) yield* bossTalk(E, ['...']); },
};
