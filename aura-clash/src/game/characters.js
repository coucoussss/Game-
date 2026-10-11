// Les 6 combattants : statistiques, apparence et liste des coups.
//
// Un coup est une petite chronologie (en secondes) :
//   dur       durée totale
//   cancel    instant à partir duquel on peut enchaîner (chain) ou annuler vers un autre coup
//   chain     coup suivant de l'enchaînement (même bouton)
//   lunge     [[début, fin, vitesse], …] : déplacement vers l'avant pendant le coup
//   invuln    [début, fin] : invulnérabilité ; armor : encaisse sans être interrompu
//   cine      cinématique d'ultime (zoom, lignes de vitesse, nom du coup)
//   actions   liste d'actions déclenchées à l'instant t :
//     hit     coup au corps à corps (reach, radius, dmg, type, dur = fenêtre active, every = multi-coups)
//     proj    projectile(s)        beam  rayon         aoe  zone retardée (à la position de la cible)
//     ring    onde de choc         summon invocation   buff transformation
//     warp    téléportation        fx / sfx / shake    effets purement visuels ou sonores
import { HIT_TYPES } from './constants.js';

const hit = (t, dmg, type = 'light', o = {}) => ({
  t, a: 'hit', dmg, type, reach: 1.05, radius: 0.85, ...HIT_TYPES[type], ...o,
});
const proj = (t, p, o = {}) => ({ t, a: 'proj', p, ...o });
const fx = (t, name, o = {}) => ({ t, a: 'fx', fx: name, ...o });
const sfx = (t, name) => ({ t, a: 'sfx', name });

// Définitions de projectiles réutilisables
const P = {
  kiball: { kind: 'kiball', speed: 26, dmg: 22, hit: 'light', r: 0.35, life: 1.3 },
  bigki: { kind: 'bigki', speed: 15, dmg: 120, hit: 'kd', r: 0.9, life: 2, explode: { r: 2.6, dmg: 25 } },
  shuriken: { kind: 'shuriken', speed: 30, dmg: 19, hit: 'light', r: 0.3, life: 1 },
  crescent: { kind: 'crescent', speed: 21, dmg: 55, hit: 'heavy', r: 0.95, life: 0.95, pierce: true },
  fireball: { kind: 'fireball', speed: 19, dmg: 44, hit: 'heavy', r: 0.45, life: 1.4, explode: { r: 1.8, dmg: 14 } },
  iceshard: { kind: 'iceshard', speed: 30, dmg: 34, hit: 'light', r: 0.32, life: 1, slow: 1.6 },
  airfist: { kind: 'airfist', speed: 34, dmg: 46, hit: 'heavy', r: 0.75, life: 0.28 },
  spiritorb: { kind: 'spiritorb', speed: 12, dmg: 34, hit: 'heavy', r: 0.45, life: 2.6, homing: 3.5 },
  palmwave: { kind: 'palmwave', speed: 17, dmg: 68, hit: 'kd', r: 1.25, life: 0.36 },
};

export const CHARACTERS = [
  {
    id: 'kael',
    name: 'Kael Arashi',
    title: 'Guerrier à aura',
    blurb: 'Concentre son ki en sphères et en un rayon dévastateur. Se transforme pour décupler sa puissance.',
    hp: 1000, speed: 6.6, weight: 1,
    aura: '#6fc8ff', auraAlt: '#ffd23f',
    stance: 'fists', aiRange: 2.2, aiZoning: 0.35,
    look: {
      skin: '#f2c8a0', hair: '#1b1b2a', hairAlt: '#ffd84a', hairStyle: 'spiky', eyes: '#2a7bff',
      top: '#ff7a1a', topAlt: '#2a4cff', pants: '#ff7a1a', belt: '#1d2bb0', boots: '#1d2bb0',
      extras: ['wristbands', 'belt'],
    },
    moves: {
      light1: { name: 'Direct', anim: 'jab', dur: 0.3, cancel: 0.16, chain: 'light2', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.09, 30)] },
      light2: { name: 'Crochet', anim: 'cross', dur: 0.32, cancel: 0.17, chain: 'light3', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.1, 34)] },
      light3: { name: 'Pied tournoyant', anim: 'spinkick', dur: 0.5, cancel: 0.32, air: true, lunge: [[0, 0.15, 4]], actions: [hit(0.17, 52, 'heavy', { radius: 1.1 })] },
      heavy: {
        name: 'Uppercut de ki', anim: 'uppercut', dur: 0.62, cancel: 0.4, lunge: [[0.08, 0.22, 5]],
        actions: [fx(0.02, 'kiCharge'), hit(0.2, 72, 'launch', { radius: 1, hy: 1.3 })],
      },
      ranged: {
        name: 'Rafale de ki', anim: 'cast2', dur: 0.56, cancel: 0.44, air: true,
        actions: [proj(0.12, P.kiball), proj(0.24, P.kiball, { offset: 0.25 }), proj(0.36, P.kiball, { offset: -0.25 })],
      },
      special: {
        name: 'Transformation', cost: 50, anim: 'powerup', dur: 1.05, invuln: [0, 1.05], alt: 'special2',
        actions: [sfx(0.05, 'charge'), { t: 0.55, a: 'buff', buff: 'transform', dur: 16 }, { t: 0.55, a: 'ring', maxR: 4.5, speed: 22, dmg: 20, type: 'kd', fxColor: '#ffd23f' }],
      },
      special2: {
        name: 'Super sphère de ki', cost: 35, anim: 'beam', dur: 0.8, cancel: 0.62,
        actions: [fx(0.05, 'kiCharge'), proj(0.36, P.bigki)],
      },
      ultimate: {
        name: 'Rayon Dévastateur', cost: 100, anim: 'beam', dur: 2.3, hold: [0.35, 1.95], armor: 'full',
        cine: { text: 'RAYON DÉVASTATEUR', dur: 1.35 },
        actions: [fx(0.02, 'kiCharge'), { t: 0.4, a: 'beam', dur: 1.5, width: 0.95, tick: 0.08, dmg: 16, finalDmg: 60, impact: 'ドォン!!' }],
      },
    },
  },
  {
    id: 'kage',
    name: 'Shin Kagerō',
    title: 'Ninja de l’ombre',
    blurb: 'Insaisissable : son esquive est une téléportation. Lance des shurikens et invoque des clones d’ombre.',
    hp: 960, speed: 7.7, weight: 0.95,
    aura: '#9b5cff',
    stance: 'ninja', aiRange: 2.4, aiZoning: 0.3, teleportDodge: true,
    look: {
      skin: '#e8c09a', hair: '#e8ecf5', hairStyle: 'ninja', eyes: '#c0262f',
      top: '#1d2340', arms: '#1d2340', pants: '#1d2340', belt: '#5a2d8c', boots: '#11131f', accent: '#c0262f',
      extras: ['scarf', 'mask', 'headband', 'kunai'],
    },
    moves: {
      light1: { name: 'Taille de kunaï', anim: 'slash1', dur: 0.26, cancel: 0.14, chain: 'light2', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.08, 27)] },
      light2: { name: 'Revers', anim: 'slash2', dur: 0.28, cancel: 0.15, chain: 'light3', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.09, 29)] },
      light3: { name: 'Pied de l’ombre', anim: 'spinkick', dur: 0.46, cancel: 0.3, air: true, lunge: [[0, 0.14, 5]], actions: [hit(0.15, 48, 'heavy', { radius: 1.05 })] },
      heavy: {
        name: 'Glissade d’ombre', anim: 'kick', dur: 0.64, cancel: 0.46, lunge: [[0.1, 0.36, 13]],
        actions: [fx(0.08, 'vanishTrail'), hit(0.12, 68, 'kd', { dur: 0.22, radius: 0.95 })],
      },
      ranged: {
        name: 'Shurikens', anim: 'throw', dur: 0.46, cancel: 0.34, air: true,
        actions: [proj(0.13, P.shuriken, { spread: [-11, 0, 11] })],
      },
      special: {
        name: 'Clones de l’ombre', cost: 40, anim: 'summon', dur: 0.6, cancel: 0.5,
        actions: [{ t: 0.2, a: 'summon', kind: 'clone', count: 2 }],
      },
      ultimate: {
        name: 'Danse des Mille Ombres', cost: 100, anim: 'dash', dur: 1.9, armor: 'full',
        cine: { text: 'DANSE DES MILLE OMBRES', dur: 1.25 },
        actions: [
          { t: 0.08, a: 'warp', mode: 'around', angle: 90, dist: 1.2 }, hit(0.1, 42, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 0.33, a: 'warp', mode: 'around', angle: -90, dist: 1.2 }, hit(0.35, 42, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 0.58, a: 'warp', mode: 'around', angle: 180, dist: 1.2 }, hit(0.6, 42, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 0.83, a: 'warp', mode: 'around', angle: 45, dist: 1.2 }, hit(0.85, 42, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 1.25, a: 'warp', mode: 'around', angle: 0, dist: 1.3 }, hit(1.3, 115, 'kd', { chip: 0.3, impact: 'ザシュッ!!', radius: 1.2 }),
        ],
      },
    },
  },
  {
    id: 'ren',
    name: 'Ren Tsukishiro',
    title: 'Sabreur',
    blurb: 'Enchaînements de sabre ultra-rapides et trancheurs d’air. Sa Lame Céleste fend tout d’un seul trait.',
    hp: 950, speed: 7.1, weight: 1,
    aura: '#7ff0ff',
    stance: 'blade', aiRange: 2.3, aiZoning: 0.25,
    look: {
      skin: '#f0caa6', hair: '#3a3f7a', hairStyle: 'ponytail', eyes: '#3fd0ff',
      top: '#f2f2f5', arms: '#f2f2f5', pants: '#2b3050', belt: '#7a1f2b', boots: '#1a1a22', accent: '#3a6fd8',
      extras: ['haori', 'katana'],
    },
    moves: {
      light1: { name: 'Taille', anim: 'slash1', dur: 0.24, cancel: 0.13, chain: 'light2', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.07, 25, 'light', { reach: 1.3 })] },
      light2: { name: 'Revers', anim: 'slash2', dur: 0.24, cancel: 0.13, chain: 'light3', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.07, 25, 'light', { reach: 1.3 })] },
      light3: { name: 'Taille haute', anim: 'slash3', dur: 0.28, cancel: 0.15, chain: 'light4', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.09, 28, 'light', { reach: 1.3 })] },
      light4: { name: 'Estoc', anim: 'thrust', dur: 0.44, cancel: 0.3, lunge: [[0.04, 0.16, 9]], actions: [hit(0.13, 48, 'heavy', { reach: 1.5 })] },
      heavy: { name: 'Lune montante', anim: 'rising', dur: 0.6, cancel: 0.4, actions: [hit(0.17, 70, 'launch', { reach: 1.3, radius: 1.05, hy: 1.4 })] },
      ranged: { name: 'Trancheur d’air', anim: 'slash2', dur: 0.5, cancel: 0.38, air: true, actions: [proj(0.12, P.crescent)] },
      special: {
        name: 'Tempête de lames', cost: 40, anim: 'dash', dur: 0.75, cancel: 0.62, invuln: [0, 0.15], lunge: [[0.08, 0.42, 19]],
        actions: [fx(0.05, 'vanishTrail'), hit(0.08, 21, 'light', { dur: 0.36, every: 0.07, radius: 1.1, stun: 0.5, kb: 6 }), hit(0.48, 30, 'heavy', { radius: 1.3, around: true })],
      },
      ultimate: {
        name: 'Lame Céleste', cost: 100, anim: 'iai', dur: 1.75, armor: 'full', invuln: [0, 0.6],
        cine: { text: 'LAME CÉLESTE', dur: 1.25 },
        actions: [
          { t: 0.12, a: 'warp', mode: 'through', dist: 2.2, maxDist: 16 },
          fx(0.13, 'slashLine'),
          hit(0.95, 330, 'kd', { around: true, radius: 3.6, unblockable: true, impact: '斬!!', ult: true }),
        ],
      },
    },
  },
  {
    id: 'lyra',
    name: 'Lyra Vel',
    title: 'Mage de glace et de feu',
    blurb: 'Alterne boules de feu et éclats de glace, contrôle le terrain avec des zones. Fait tomber un météore.',
    hp: 900, speed: 6.3, weight: 0.9,
    aura: '#ff6a3d', auraAlt: '#6fdcff',
    stance: 'staff', aiRange: 7, aiZoning: 0.75,
    look: {
      skin: '#f6d2b5', hair: '#ff5a3a', hairAlt: '#bfefff', hairStyle: 'long', eyes: '#ff7a2a',
      top: '#3a2a6e', arms: '#3a2a6e', pants: '#22183f', belt: '#ffb43a', boots: '#2a1b3a', accent: '#56c8ff',
      extras: ['robe', 'staff'],
    },
    moves: {
      light1: { name: 'Coup de bâton', anim: 'staff1', dur: 0.28, cancel: 0.15, chain: 'light2', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.09, 27, 'light', { reach: 1.25 })] },
      light2: { name: 'Revers de bâton', anim: 'staff2', dur: 0.3, cancel: 0.16, chain: 'light3', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.1, 29, 'light', { reach: 1.25 })] },
      light3: { name: 'Éclosion de flammes', anim: 'cast', dur: 0.5, cancel: 0.34, actions: [fx(0.14, 'flameburst'), hit(0.15, 44, 'heavy', { around: true, radius: 2.2 })] },
      heavy: {
        name: 'Pic de glace', anim: 'cast', dur: 0.55, cancel: 0.4,
        actions: [{ t: 0.15, a: 'aoe', type: 'icepillar', delay: 0.42, r: 1.7, dmg: 66, hit: 'launch' }],
      },
      ranged: {
        name: 'Feu / Glace (alterné)', anim: 'cast2', dur: 0.46, cancel: 0.34, air: true,
        actions: [{ t: 0.14, a: 'proj', cycle: [P.fireball, P.iceshard] }],
      },
      special: {
        name: 'Tempête élémentaire', cost: 40, anim: 'summon', dur: 0.75, cancel: 0.6,
        actions: [
          { t: 0.15, a: 'aoe', type: 'icepillar', delay: 0.35, r: 1.6, dmg: 30, hit: 'heavy' },
          { t: 0.15, a: 'aoe', type: 'firepillar', delay: 0.55, r: 1.6, dmg: 30, hit: 'heavy', offset: [1.8, 0] },
          { t: 0.15, a: 'aoe', type: 'icepillar', delay: 0.75, r: 1.6, dmg: 30, hit: 'heavy', offset: [-1.8, 0] },
          { t: 0.15, a: 'aoe', type: 'firepillar', delay: 0.95, r: 1.6, dmg: 30, hit: 'heavy', offset: [0, 1.8] },
          { t: 0.15, a: 'aoe', type: 'icepillar', delay: 1.15, r: 1.6, dmg: 36, hit: 'launch', offset: [0, -1.8] },
        ],
      },
      ultimate: {
        name: 'Météore Primordial', cost: 100, anim: 'summon', dur: 1.5, armor: 'full',
        cine: { text: 'MÉTÉORE PRIMORDIAL', dur: 1.3 },
        actions: [
          { t: 0.2, a: 'aoe', type: 'meteor', delay: 1.25, r: 5, dmg: 290, hit: 'kd', chip: 0.3, impact: 'ドガァン!!', zone: { type: 'firezone', dur: 2.2, tick: 0.25, dmg: 9 } },
        ],
      },
    },
  },
  {
    id: 'goro',
    name: 'Goro Tetsuda',
    title: 'Pugiliste martial',
    blurb: 'Poings rapides, charge du taureau qui encaisse les coups, et onde de choc qui balaie le sol.',
    hp: 1150, speed: 5.9, weight: 1.2,
    aura: '#ff3a3a',
    stance: 'fists', aiRange: 1.9, aiZoning: 0.15,
    look: {
      skin: '#c98f62', hair: '#2a1a12', hairStyle: 'short', eyes: '#3a2210',
      top: null, pants: '#2f2f3a', belt: '#c0262f', boots: '#1d1d24', accent: '#f2f2f2',
      extras: ['gloves', 'bandages', 'sash'], build: 1.14,
    },
    moves: {
      light1: { name: 'Jab', anim: 'jab', dur: 0.22, cancel: 0.12, chain: 'light2', air: true, lunge: [[0, 0.08, 3]], actions: [hit(0.07, 24)] },
      light2: { name: 'Jab', anim: 'cross', dur: 0.22, cancel: 0.12, chain: 'light3', air: true, lunge: [[0, 0.08, 3]], actions: [hit(0.07, 24)] },
      light3: { name: 'Crochet', anim: 'hook', dur: 0.32, cancel: 0.18, chain: 'light4', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.11, 36)] },
      light4: { name: 'Coup de pied retourné', anim: 'kick', dur: 0.44, cancel: 0.3, lunge: [[0, 0.12, 4]], actions: [hit(0.15, 50, 'heavy', { radius: 1 })] },
      heavy: {
        name: 'Charge du taureau', anim: 'charge', dur: 0.72, cancel: 0.55, armor: 'light', lunge: [[0.1, 0.5, 16]],
        actions: [hit(0.1, 82, 'kd', { dur: 0.4, radius: 0.95, reach: 0.9 })],
      },
      ranged: { name: 'Poing d’air', anim: 'jab', dur: 0.45, cancel: 0.32, air: true, actions: [proj(0.12, P.airfist)] },
      special: {
        name: 'Onde de choc', cost: 40, anim: 'slam', dur: 0.85, cancel: 0.7,
        actions: [{ t: 0.45, a: 'ring', maxR: 8.5, speed: 17, dmg: 88, type: 'launch', groundOnly: true, fxColor: '#ffb03a' }, { t: 0.45, a: 'shake', amt: 0.5 }, hit(0.45, 40, 'launch', { around: true, radius: 1.6 })],
      },
      ultimate: {
        name: 'Cent Poings du Dragon', cost: 100, anim: 'rush', dur: 2.0, hold: [0.1, 1.45], armor: 'full',
        cine: { text: 'CENT POINGS DU DRAGON', dur: 1.25 },
        actions: [
          { t: 0.05, a: 'warp', mode: 'front', dist: 1.15, maxDist: 14 },
          hit(0.12, 11, 'light', { dur: 1.25, every: 0.06, stun: 0.35, kb: 0.3, chip: 0.3, hold: true }),
          hit(1.5, 105, 'launch', { up: 15, chip: 0.3, impact: 'ドゴォ!!', radius: 1.1 }),
        ],
      },
    },
  },
  {
    id: 'sora',
    name: 'Sora Mikage',
    title: 'Invocatrice',
    blurb: 'Talismans et orbes spirituels à tête chercheuse. Ses renards-esprits combattent à ses côtés.',
    hp: 920, speed: 6.4, weight: 0.9,
    aura: '#5fffc8',
    stance: 'priestess', aiRange: 6, aiZoning: 0.65,
    look: {
      skin: '#f7d8c0', hair: '#14121c', hairStyle: 'priestess', eyes: '#3fffc0',
      top: '#f4f2ee', arms: '#f4f2ee', pants: '#c0262f', belt: '#c0262f', boots: '#f4f2ee', accent: '#5fffc8',
      extras: ['hakama', 'talismans', 'ribbons'],
    },
    moves: {
      light1: { name: 'Talisman', anim: 'palm', dur: 0.28, cancel: 0.15, chain: 'light2', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.09, 26)] },
      light2: { name: 'Éventail', anim: 'slash2', dur: 0.3, cancel: 0.16, chain: 'light3', air: true, lunge: [[0, 0.1, 3]], actions: [hit(0.1, 29)] },
      light3: { name: 'Paume d’esprit', anim: 'palm', dur: 0.46, cancel: 0.3, lunge: [[0, 0.12, 4]], actions: [fx(0.13, 'spiritBurst'), hit(0.14, 46, 'heavy', { radius: 1.05 })] },
      heavy: { name: 'Vague spirituelle', anim: 'cast', dur: 0.6, cancel: 0.42, actions: [proj(0.18, P.palmwave)] },
      ranged: { name: 'Orbe spirituel', anim: 'cast2', dur: 0.5, cancel: 0.36, air: true, actions: [proj(0.15, P.spiritorb)] },
      special: {
        name: 'Esprits gardiens', cost: 40, anim: 'summon', dur: 0.7, cancel: 0.55,
        actions: [{ t: 0.3, a: 'summon', kind: 'fox', count: 2 }],
      },
      ultimate: {
        name: 'Dragon Céleste', cost: 100, anim: 'summon', dur: 1.7, armor: 'full',
        cine: { text: 'DRAGON CÉLESTE', dur: 1.3 },
        actions: [{ t: 0.25, a: 'summon', kind: 'dragon', count: 1, dmg: 300, impact: 'ズドォン!!' }],
      },
    },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** Les « coups normaux » peuvent s'annuler les uns dans les autres. */
export function isNormalMove(id) {
  return /^light\d$/.test(id) || id === 'heavy' || id === 'ranged';
}

/** Description lisible de la liste de coups (écran pause / entraînement). */
export function moveList(def) {
  const m = def.moves;
  const lights = Object.keys(m).filter((k) => /^light\d$/.test(k)).map((k) => m[k].name);
  const rows = [
    ['Attaque légère ×' + lights.length, lights.join(' → ')],
    ['Attaque lourde', m.heavy.name],
    ['Attaque à distance', m.ranged.name],
    [`Spécial (${m.special.cost} énergie)`, m.special.name + (m.special.alt ? ` (puis : ${m[m.special.alt].name})` : '')],
    ['Ultime (100 énergie)', m.ultimate.name],
  ];
  if (def.teleportDodge) rows.push(['Esquive', 'Téléportation (sans direction : dans le dos de l’adversaire)']);
  return rows;
}
