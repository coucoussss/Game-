// Les combattants : statistiques, apparence et liste des coups.
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
import { MONSTERS } from './monsters.js';
import { TECHNIQUES } from './techniques.js';

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
  bolt: { kind: 'bolt', speed: 42, dmg: 38, hit: 'heavy', r: 0.38, life: 0.55 },
  windblade: { kind: 'windblade', speed: 25, dmg: 16, hit: 'light', r: 0.45, life: 0.8 },
  rock: { kind: 'rock', speed: 16, dmg: 66, hit: 'kd', r: 0.7, life: 1.4, explode: { r: 1.8, dmg: 14 } },
  darkorb: { kind: 'darkorb', speed: 14, dmg: 40, hit: 'heavy', r: 0.5, life: 2.2, homing: 2.5 },
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
      extras: ['wristbands', 'gi'], body: 'm', emblem: '武', emblemColor: '#1d2bb0',
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
      extras: ['scarf', 'mask', 'headband', 'kunai', 'armor', 'sash'], body: 'm', emblem: '影', emblemColor: '#5a2d8c',
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
      extras: ['haori', 'katana', 'kimono', 'sleeves', 'hakama'], body: 'm', emblem: '月', emblemColor: '#3a6fd8',
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
      extras: ['robe', 'staff', 'sleeves', 'mantle'], body: 'f', emblem: '炎', emblemColor: '#e0401a',
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
      extras: ['gloves', 'bandages', 'sash', 'redband', 'barefoot'], build: 1.08, body: 'big', emblem: '拳', emblemColor: '#c0262f',
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
      extras: ['hakama', 'talismans', 'ribbons', 'kimono', 'sleeves'], body: 'f', emblem: '霊', emblemColor: '#c0262f',
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
  // --- Personnages à débloquer dans la boutique (prix en Ryō) ---
  {
    id: 'raiden',
    name: 'Raiden Kurogane',
    title: 'Lancier du tonnerre',
    price: 1200,
    blurb: 'Une lance à la portée redoutable et des éclairs qui frappent du ciel. Il tient l’adversaire à distance.',
    hp: 980, speed: 6.9, weight: 1,
    aura: '#ffe94a',
    stance: 'staff', aiRange: 2.6, aiZoning: 0.4,
    look: {
      skin: '#f0c9a2', hair: '#f5d742', hairStyle: 'spiky', eyes: '#ffc400',
      top: '#24262f', arms: '#24262f', pants: '#3a3d4a', belt: '#ffcc00', boots: '#15161c', accent: '#ffcc00', armor: '#c8a43a',
      extras: ['spear', 'armor', 'scarf', 'sash'], body: 'm', emblem: '雷', emblemColor: '#c89a00',
    },
    moves: {
      light1: { name: 'Estoc', anim: 'thrust', dur: 0.28, cancel: 0.15, chain: 'light2', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.09, 27, 'light', { reach: 1.65 })] },
      light2: { name: 'Double estoc', anim: 'staff1', dur: 0.3, cancel: 0.16, chain: 'light3', air: true, lunge: [[0, 0.1, 4]], actions: [hit(0.1, 29, 'light', { reach: 1.6 })] },
      light3: { name: 'Balayage', anim: 'staff2', dur: 0.46, cancel: 0.3, lunge: [[0, 0.12, 5]], actions: [hit(0.15, 48, 'heavy', { reach: 1.5, radius: 1.25 })] },
      heavy: { name: 'Lance foudroyante', anim: 'rising', dur: 0.62, cancel: 0.42, actions: [fx(0.02, 'kiCharge'), hit(0.18, 72, 'launch', { reach: 1.6, hy: 1.4 })] },
      ranged: { name: 'Éclair', anim: 'cast2', dur: 0.48, cancel: 0.36, air: true, actions: [proj(0.13, P.bolt)] },
      special: {
        name: 'Tempête de foudre', cost: 40, anim: 'summon', dur: 0.75, cancel: 0.6,
        actions: [
          { t: 0.15, a: 'aoe', type: 'thunder', delay: 0.3, r: 1.5, dmg: 32, hit: 'heavy' },
          { t: 0.15, a: 'aoe', type: 'thunder', delay: 0.5, r: 1.5, dmg: 32, hit: 'heavy', offset: [1.6, 0.8] },
          { t: 0.15, a: 'aoe', type: 'thunder', delay: 0.7, r: 1.7, dmg: 38, hit: 'launch', offset: [-1.6, -0.8] },
        ],
      },
      ultimate: {
        name: 'Jugement du Tonnerre', cost: 100, anim: 'summon', dur: 1.6, armor: 'full',
        cine: { text: 'JUGEMENT DU TONNERRE', dur: 1.3 },
        actions: [{ t: 0.2, a: 'aoe', type: 'thunder', delay: 0.85, r: 4.5, dmg: 300, hit: 'kd', chip: 0.3, impact: 'バリバリッ!!' }],
      },
    },
  },
  {
    id: 'hana',
    name: 'Hana Kazemiya',
    title: 'Danseuse du vent',
    price: 1200,
    blurb: 'Ses éventails tranchent l’air : rafales de lames de vent, tornades et pirouettes insaisissables.',
    hp: 900, speed: 7.6, weight: 0.85,
    aura: '#ff8ad8',
    stance: 'ninja', aiRange: 2.4, aiZoning: 0.5,
    look: {
      skin: '#f9dcc8', hair: '#ff6fb5', hairStyle: 'ponytail', eyes: '#ff3f98',
      top: '#ffffff', arms: '#ffd6ec', pants: '#ff6fb5', belt: '#7a2a5a', boots: '#ffffff', accent: '#ff6fb5',
      extras: ['fans', 'kimono', 'sleeves', 'hakama', 'ribbons'], body: 'f', emblem: '風', emblemColor: '#d83a8a',
    },
    moves: {
      light1: { name: 'Éventail', anim: 'slash1', dur: 0.24, cancel: 0.13, chain: 'light2', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.07, 24, 'light', { reach: 1.25 })] },
      light2: { name: 'Revers d’éventail', anim: 'slash2', dur: 0.26, cancel: 0.14, chain: 'light3', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.08, 26, 'light', { reach: 1.25 })] },
      light3: { name: 'Pirouette', anim: 'spinkick', dur: 0.46, cancel: 0.3, air: true, lunge: [[0, 0.14, 5]], actions: [hit(0.15, 46, 'heavy', { radius: 1.25 })] },
      heavy: { name: 'Coup de vent', anim: 'kick', dur: 0.6, cancel: 0.42, lunge: [[0.08, 0.26, 10]], actions: [fx(0.1, 'vanishTrail'), hit(0.14, 68, 'launch', { dur: 0.12, radius: 1 })] },
      ranged: { name: 'Lames de vent', anim: 'throw', dur: 0.48, cancel: 0.36, air: true, actions: [proj(0.13, P.windblade, { spread: [-15, 0, 15] })] },
      special: {
        name: 'Tornade', cost: 40, anim: 'summon', dur: 0.7, cancel: 0.55,
        actions: [{ t: 0.2, a: 'aoe', type: 'tornado', delay: 0.3, r: 2.2, dmg: 22, hit: 'launch', zone: { dur: 1.4, tick: 0.2, dmg: 8 } }],
      },
      ultimate: {
        name: 'Typhon Céleste', cost: 100, anim: 'summon', dur: 1.8, armor: 'full',
        cine: { text: 'TYPHON CÉLESTE', dur: 1.25 },
        actions: [
          { t: 0.15, a: 'aoe', type: 'tornado', delay: 0.4, r: 4, dmg: 110, hit: 'launch', zone: { dur: 1.1, tick: 0.15, dmg: 12 } },
          { t: 0.15, a: 'aoe', type: 'windburst', delay: 1.5, r: 4.2, dmg: 120, hit: 'kd', chip: 0.3, impact: 'ビュオオッ!!' },
        ],
      },
    },
  },
  {
    id: 'garo',
    name: 'Garo le Colosse',
    title: 'Géant de pierre',
    price: 1800,
    blurb: 'Lent mais terrifiant : poings de roche, rochers lancés et séismes. Il encaisse comme une montagne.',
    hp: 1320, speed: 5.2, weight: 1.45,
    aura: '#e0a85a',
    stance: 'fists', aiRange: 2.1, aiZoning: 0.2,
    look: {
      skin: '#8a6a58', hair: '#3a2a20', hairStyle: 'short', eyes: '#ffb030',
      top: '#5a4636', arms: '#8a6a58', pants: '#3a3028', belt: '#d8a050', boots: '#2a221c', accent: '#d8a050', armor: '#6a6a76', gloves: '#7a7a86',
      extras: ['gloves', 'armor', 'sash', 'barefoot'], build: 1.2, body: 'big', emblem: '岩', emblemColor: '#8a5a20',
    },
    moves: {
      light1: { name: 'Marteau', anim: 'jab', dur: 0.34, cancel: 0.18, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.11, 32, 'light', { radius: 1 })] },
      light2: { name: 'Crochet de roche', anim: 'hook', dur: 0.38, cancel: 0.2, chain: 'light3', lunge: [[0, 0.1, 3]], actions: [hit(0.12, 38, 'light', { radius: 1 })] },
      light3: { name: 'Uppercut de granit', anim: 'uppercut', dur: 0.56, cancel: 0.34, actions: [hit(0.2, 58, 'launch', { radius: 1.1, hy: 1.3 })] },
      heavy: {
        name: 'Écrasement', anim: 'slam', dur: 0.85, cancel: 0.6, armor: 'light',
        actions: [hit(0.45, 85, 'launch', { around: true, radius: 2 }), { t: 0.45, a: 'shake', amt: 0.4 }, fx(0.45, 'dust')],
      },
      ranged: { name: 'Rocher', anim: 'throw', dur: 0.6, cancel: 0.45, actions: [proj(0.22, P.rock)] },
      special: {
        name: 'Séisme', cost: 40, anim: 'slam', dur: 0.9, cancel: 0.72,
        actions: [{ t: 0.45, a: 'ring', maxR: 10, speed: 14, dmg: 95, type: 'launch', groundOnly: true, fxColor: '#e0a85a' }, { t: 0.45, a: 'shake', amt: 0.6 }],
      },
      ultimate: {
        name: 'Éruption Titanesque', cost: 100, anim: 'slam', dur: 1.8, armor: 'full',
        cine: { text: 'ÉRUPTION TITANESQUE', dur: 1.3 },
        actions: [
          { t: 0.45, a: 'aoe', type: 'rockpillar', delay: 0.25, r: 2, dmg: 90, hit: 'launch' },
          { t: 0.45, a: 'aoe', type: 'rockpillar', delay: 0.45, r: 1.6, dmg: 40, hit: 'heavy', offset: [2.2, 0] },
          { t: 0.45, a: 'aoe', type: 'rockpillar', delay: 0.45, r: 1.6, dmg: 40, hit: 'heavy', offset: [-2.2, 0] },
          { t: 0.45, a: 'aoe', type: 'rockblast', delay: 1.0, r: 4.5, dmg: 170, hit: 'kd', chip: 0.3, impact: 'ドゴゴゴ!!' },
        ],
      },
    },
  },
  {
    id: 'yami',
    name: 'Yami Kurosaki',
    title: 'Épéiste démoniaque',
    price: 2500,
    blurb: 'Une lame maudite d’un rouge sang, des orbes de ténèbres et une éclipse qui engloutit tout.',
    hp: 950, speed: 7.3, weight: 1,
    aura: '#ff2a5a',
    stance: 'blade', aiRange: 2.3, aiZoning: 0.35,
    look: {
      skin: '#ead4dc', hair: '#f0f0f8', hairAlt: '#c8c8dc', hairStyle: 'long', eyes: '#ff1a3a',
      top: '#14121c', arms: '#14121c', pants: '#1c1826', belt: '#8a1a2a', boots: '#0c0a10', accent: '#8a1a2a', blade: '#ff3a5a',
      extras: ['katana', 'haori', 'kimono', 'horns'], body: 'm', emblem: '魔', emblemColor: '#8a1a2a',
    },
    moves: {
      light1: { name: 'Taille maudite', anim: 'slash1', dur: 0.24, cancel: 0.13, chain: 'light2', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.07, 27, 'light', { reach: 1.35 })] },
      light2: { name: 'Revers', anim: 'slash2', dur: 0.25, cancel: 0.13, chain: 'light3', air: true, lunge: [[0, 0.08, 4]], actions: [hit(0.07, 27, 'light', { reach: 1.35 })] },
      light3: { name: 'Taille infernale', anim: 'slash3', dur: 0.42, cancel: 0.28, lunge: [[0, 0.12, 6]], actions: [hit(0.12, 50, 'heavy', { reach: 1.4 })] },
      heavy: { name: 'Croc du démon', anim: 'rising', dur: 0.6, cancel: 0.4, actions: [hit(0.17, 74, 'launch', { reach: 1.35, radius: 1.05, hy: 1.4 })] },
      ranged: { name: 'Orbe maudit', anim: 'cast2', dur: 0.5, cancel: 0.36, air: true, actions: [proj(0.15, P.darkorb)] },
      special: {
        name: 'Frappe d’ombre', cost: 40, anim: 'dash', dur: 0.75, cancel: 0.62, invuln: [0, 0.15], lunge: [[0.08, 0.42, 18]],
        actions: [fx(0.05, 'vanishTrail'), hit(0.08, 20, 'light', { dur: 0.36, every: 0.07, radius: 1.1, stun: 0.5, kb: 6 }), hit(0.48, 32, 'heavy', { radius: 1.3, around: true })],
      },
      ultimate: {
        name: 'Éclipse Infernale', cost: 100, anim: 'iai', dur: 1.8, armor: 'full', invuln: [0, 0.6],
        cine: { text: 'ÉCLIPSE INFERNALE', dur: 1.3 },
        actions: [
          { t: 0.12, a: 'warp', mode: 'through', dist: 2.2, maxDist: 16 },
          fx(0.13, 'slashLine'),
          { t: 0.2, a: 'aoe', type: 'darkblast', delay: 0.75, r: 4, dmg: 320, hit: 'kd', chip: 0.3, impact: '滅!!' },
        ],
      },
    },
  },
];

/** Coup commun à tous : Lourd en l'air = frappe plongeante qui rabat l'adversaire au sol. */
export const AIR_SLAM = {
  name: 'Frappe plongeante', anim: 'slam', dur: 0.6, cancel: 0.5, air: true, dive: 16,
  actions: [hit(0.06, 46, 'kd', { up: -18, kb: 2, radius: 1.15, hy: 0.4, dur: 0.3 }), fx(0.02, 'kiCharge')],
};
/** Arme principale (pour le son des impacts). */
function weaponOf(c) {
  const x = c.look.extras;
  if (x.includes('katana')) return 'blade';
  if (x.includes('spear') || c.stance === 'staff') return 'spear';
  if (x.includes('fans')) return 'blade';
  if (x.includes('claws')) return 'claw';
  if (c.stance === 'priestess') return 'magic';
  return 'fist';
}
for (const c of [...CHARACTERS, ...MONSTERS]) {
  if (!c.moves.airslam) c.moves.airslam = AIR_SLAM;
  // Techniques alternatives (spécial « B » et ultime « B »)
  const t = TECHNIQUES[c.id];
  if (t) { c.moves.specialB = t.special; c.moves.ultimateB = t.ultimate; }
  c.weapon = weaponOf(c);
}

// Les créatures du mode Vagues sont indexées avec les combattants (même moteur), sans être jouables.
export const CHAR_BY_ID = Object.fromEntries([...CHARACTERS, ...MONSTERS].map((c) => [c.id, c]));

/** Les « coups normaux » peuvent s'annuler les uns dans les autres. */
export function isNormalMove(id) {
  return /^light\d$/.test(id) || id === 'heavy' || id === 'ranged';
}

/** Définition vue à travers l'équipement choisi : `special` et `ultimate` pointent vers les versions B. */
export function withLoadout(def, loadout) {
  if (!loadout || (loadout.special !== 'B' && loadout.ultimate !== 'B')) return def;
  const moves = { ...def.moves };
  if (loadout.special === 'B' && moves.specialB) moves.special = moves.specialB;
  if (loadout.ultimate === 'B' && moves.ultimateB) moves.ultimate = moves.ultimateB;
  return { ...def, moves };
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
  rows.push(['Lourd en l’air', 'Frappe plongeante (rabat l’adversaire au sol)']);
  rows.push(['Garde au dernier moment', 'Parade parfaite, puis riposte renforcée']);
  if (def.teleportDodge) rows.push(['Esquive', 'Téléportation (sans direction : dans le dos de l’adversaire)']);
  return rows;
}

// --- Temps de recharge ---------------------------------------------------------------------
// Chaque type d'attaque a son temps de recharge, proportionnel à sa puissance (dégâts potentiels).

/** Emplacements d'attaque : [identifiant, libellé, coup de référence, action de commande]. */
export const SLOTS = [
  ['light', 'Léger', 'light1'],
  ['heavy', 'Lourd', 'heavy'],
  ['ranged', 'Distance', 'ranged'],
  ['special', 'Spécial', 'special'],
  ['ultimate', 'Ultime', 'ultimate'],
];
export const SLOT_IDS = SLOTS.map((s) => s[0]);

export function slotOf(moveId) {
  if (/^light/.test(moveId)) return 'light';
  if (moveId === 'airslam') return 'heavy';
  if (moveId.startsWith('ultimate')) return 'ultimate';
  if (moveId.startsWith('special')) return 'special';
  return moveId;
}

/** Dégâts potentiels d'un coup (somme de ses actions offensives). */
export function movePower(mv) {
  let p = 0;
  for (const a of mv.actions) {
    switch (a.a) {
      case 'hit': p += a.dmg * (a.every ? Math.floor((a.dur || 0) / a.every) + 1 : 1); break;
      case 'proj': {
        const pr = a.p || a.cycle[0];
        p += (pr.dmg + (pr.explode ? pr.explode.dmg : 0)) * (a.spread ? a.spread.length : 1);
        break;
      }
      case 'beam': p += a.dmg * Math.floor(a.dur / a.tick) + a.finalDmg; break;
      case 'aoe': p += a.dmg + (a.zone ? a.zone.dmg * Math.floor(a.zone.dur / a.zone.tick) : 0); break;
      case 'ring': p += a.dmg; break;
      case 'summon': p += a.kind === 'clone' ? 40 * a.count : a.kind === 'fox' ? 50 * a.count : a.dmg || 0; break;
      case 'buff': p += 120; break;
      default: break;
    }
  }
  return p;
}

const cdCache = new WeakMap();
/** Temps de recharge (s) déclenché par un coup : 0,4 s + 0,02 s par point de puissance, 10 s au plus. */
export function cooldownOf(mv, moveId) {
  if (cdCache.has(mv)) return cdCache.get(mv);
  let cd;
  if (mv.cd != null) cd = mv.cd;
  else if (slotOf(moveId) === 'light') cd = 0.45; // l'enchaînement léger reste vif
  else cd = Math.min(10, Math.round((0.4 + movePower(mv) * 0.02) * 10) / 10);
  cdCache.set(mv, cd);
  return cd;
}
