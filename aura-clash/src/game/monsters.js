// Bestiaire du mode Vagues : fléaux, démons, monstres et boss.
// Même format que les combattants (characters.js) : ils utilisent le même moteur de combat,
// les mêmes animations et la même IA. Ils ne sont ni jouables ni achetables.
//
// Rangs (tier) :
//   1  Fléau mineur  : peu de vie, coups faibles, pouvoirs modestes
//   2  Démon         : plus robuste, vrais pouvoirs
//   3  Monstre       : élite, pouvoirs puissants
//   4  Boss          : géant, pouvoirs dévastateurs et ultime cinématique
import { HIT_TYPES } from './constants.js';

const hit = (t, dmg, type = 'light', o = {}) => ({
  t, a: 'hit', dmg, type, reach: 1.05, radius: 0.85, ...HIT_TYPES[type], ...o,
});
const proj = (t, p, o = {}) => ({ t, a: 'proj', p, ...o });
const fx = (t, name, o = {}) => ({ t, a: 'fx', fx: name, ...o });
const sfx = (t, name) => ({ t, a: 'sfx', name });
const aoe = (t, type, delay, r, dmg, h, o = {}) => ({ t, a: 'aoe', type, delay, r, dmg, hit: h, ...o });

export const TIERS = {
  1: { label: 'Fléau mineur', color: '#b89aff' },
  2: { label: 'Démon', color: '#ff7a5a' },
  3: { label: 'Monstre', color: '#ff4a8a' },
  4: { label: 'Boss', color: '#ff2a3a' },
};

const RAW = [
  // --- Rang 1 : fléaux mineurs ---------------------------------------------------------
  {
    id: 'larve', tier: 1,
    name: 'Larve du Fléau', title: 'Fléau mineur',
    blurb: 'Une ombre rampante née de la rancœur. Seule, elle est faible ; en nombre, elle submerge.',
    hp: 240, speed: 5.4, weight: 0.8, aura: '#a05aff',
    stance: 'fists', aiRange: 2.0, aiZoning: 0.15,
    look: {
      skin: '#6a5a8a', hair: '#2a1a3a', hairStyle: 'short', eyes: '#ff3af0', face: 'demon',
      pants: '#2a1f38', belt: '#4a2a6a', extras: ['barefoot', 'claws', 'spikes'], body: 'm', size: 0.85,
    },
    moves: {
      light1: { name: 'Griffe', anim: 'jab', dur: 0.36, cancel: 0.2, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.12, 13)] },
      light2: { name: 'Griffe double', anim: 'cross', dur: 0.4, cancel: 0.24, lunge: [[0, 0.1, 3]], actions: [hit(0.13, 16)] },
      heavy: { name: 'Bond vorace', anim: 'dash', dur: 0.7, cancel: 0.5, lunge: [[0.1, 0.3, 9]], actions: [hit(0.15, 28, 'heavy', { dur: 0.15 })] },
      ranged: { name: 'Crachat maudit', anim: 'throw', dur: 0.6, cancel: 0.45, actions: [proj(0.2, { kind: 'darkorb', speed: 11, dmg: 14, hit: 'light', r: 0.32, life: 1.6 })] },
      special: { name: 'Frénésie', cost: 40, anim: 'rush', dur: 0.8, cancel: 0.7, lunge: [[0, 0.5, 5]], actions: [hit(0.1, 8, 'light', { dur: 0.45, every: 0.09, stun: 0.35, kb: 1 })] },
      ultimate: {
        name: 'Nuée du Fléau', cost: 100, anim: 'summon', dur: 1.2, armor: 'full', cine: { text: 'NUÉE DU FLÉAU', dur: 1.0 },
        actions: [aoe(0.2, 'darkblast', 0.6, 2.6, 90, 'kd', { impact: '呪!!' })],
      },
    },
  },
  {
    id: 'goule', tier: 1,
    name: 'Goule affamée', title: 'Fléau mineur',
    blurb: 'Un mort que la faim a relevé. Rapide, griffes sales, hurlement qui fait trembler le sol.',
    hp: 300, speed: 6.0, weight: 0.9, aura: '#c8ff5a',
    stance: 'ninja', aiRange: 2.1, aiZoning: 0.15,
    look: {
      skin: '#7a8a78', hair: '#d8d8c8', hairStyle: 'long', eyes: '#e8ff3a', face: 'demon',
      top: '#3a3a30', arms: '#7a8a78', pants: '#2a2a24', belt: '#5a4a30', extras: ['barefoot', 'claws', 'bandages'], body: 'm', size: 0.95,
    },
    moves: {
      light1: { name: 'Lacération', anim: 'slash1', dur: 0.32, cancel: 0.18, chain: 'light2', lunge: [[0, 0.1, 4]], actions: [hit(0.1, 14)] },
      light2: { name: 'Lacération', anim: 'slash2', dur: 0.34, cancel: 0.2, chain: 'light3', lunge: [[0, 0.1, 4]], actions: [hit(0.1, 14)] },
      light3: { name: 'Ruade', anim: 'spinkick', dur: 0.5, cancel: 0.34, lunge: [[0, 0.14, 4]], actions: [hit(0.17, 24, 'heavy', { radius: 1.05 })] },
      heavy: { name: 'Morsure', anim: 'charge', dur: 0.7, cancel: 0.5, lunge: [[0.08, 0.3, 10]], actions: [hit(0.14, 32, 'kd', { dur: 0.16 })] },
      ranged: { name: 'Os lancé', anim: 'throw', dur: 0.55, cancel: 0.42, actions: [proj(0.18, { kind: 'rock', speed: 18, dmg: 17, hit: 'light', r: 0.35, life: 1 })] },
      special: { name: 'Hurlement', cost: 40, anim: 'powerup', dur: 0.8, cancel: 0.65, actions: [sfx(0.1, 'charge'), { t: 0.35, a: 'ring', maxR: 3.6, speed: 16, dmg: 20, type: 'kd', fxColor: '#c8ff5a' }] },
      ultimate: {
        name: 'Festin macabre', cost: 100, anim: 'dash', dur: 1.4, armor: 'full', cine: { text: 'FESTIN MACABRE', dur: 1.0 },
        actions: [{ t: 0.1, a: 'warp', mode: 'around', angle: 180, dist: 1.2 }, hit(0.15, 22, 'light', { stun: 0.6, kb: 0.5 }), { t: 0.5, a: 'warp', mode: 'around', angle: 0, dist: 1.2 }, hit(0.55, 70, 'kd', { impact: 'ガブッ!!' })],
      },
    },
  },
  {
    id: 'diablotin', tier: 1,
    name: 'Diablotin', title: 'Fléau mineur',
    blurb: 'Petit, ailé et ricanant. Il garde ses distances et crache des boules de feu.',
    hp: 220, speed: 6.8, weight: 0.7, aura: '#ff6a2a',
    stance: 'fists', aiRange: 2.2, aiZoning: 0.65,
    look: {
      skin: '#c8402f', hair: '#1a0a0a', hairStyle: 'short', eyes: '#ffe03a', face: 'demon', horn: '#2a1410',
      pants: '#2a1018', belt: '#ffb030', wing: '#4a1010', wingSpan: 0.55, extras: ['barefoot', 'horns', 'wings', 'tail', 'claws'], body: 'm', size: 0.75,
    },
    moves: {
      light1: { name: 'Coup de queue', anim: 'jab', dur: 0.34, cancel: 0.2, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.11, 12)] },
      light2: { name: 'Griffure', anim: 'cross', dur: 0.38, cancel: 0.24, lunge: [[0, 0.1, 3]], actions: [hit(0.12, 15)] },
      heavy: { name: 'Coup de corne', anim: 'kick', dur: 0.6, cancel: 0.45, lunge: [[0.08, 0.24, 7]], actions: [hit(0.15, 26, 'heavy')] },
      ranged: { name: 'Boule de feu', anim: 'cast2', dur: 0.55, cancel: 0.42, actions: [proj(0.16, { kind: 'fireball', speed: 15, dmg: 18, hit: 'light', r: 0.35, life: 1.4, explode: { r: 1.2, dmg: 5 } })] },
      special: { name: 'Pluie de braises', cost: 40, anim: 'cast', dur: 0.7, cancel: 0.55, actions: [proj(0.2, { kind: 'fireball', speed: 14, dmg: 16, hit: 'light', r: 0.32, life: 1.3 }, { spread: [-14, 0, 14] })] },
      ultimate: {
        name: 'Météore du petit diable', cost: 100, anim: 'summon', dur: 1.5, armor: 'full', cine: { text: 'MÉTÉORE INFERNAL', dur: 1.0 },
        actions: [aoe(0.2, 'meteor', 1.0, 2.6, 110, 'kd', { impact: 'ボン!!' })],
      },
    },
  },

  // --- Rang 2 : démons ---------------------------------------------------------------------
  {
    id: 'oni', tier: 2,
    name: 'Oni rouge', title: 'Démon',
    blurb: 'Une montagne de muscles cornue. Ses poings font trembler la terre et il lance des rochers.',
    hp: 620, speed: 5.0, weight: 1.4, aura: '#ff4a2a',
    stance: 'fists', aiRange: 2.2, aiZoning: 0.2,
    look: {
      skin: '#b8322a', hair: '#1a1414', hairStyle: 'spiky', eyes: '#ffd23a', face: 'demon', horn: '#f0e0b8',
      pants: '#d8a030', belt: '#2a1a14', gloves: '#3a2a20', extras: ['barefoot', 'bigHorns', 'gloves', 'sash'], build: 1.15, body: 'big', size: 1.22,
    },
    moves: {
      light1: { name: 'Poing d’oni', anim: 'jab', dur: 0.4, cancel: 0.22, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.13, 24, 'light', { radius: 1 })] },
      light2: { name: 'Crochet brutal', anim: 'hook', dur: 0.44, cancel: 0.24, chain: 'light3', lunge: [[0, 0.1, 3]], actions: [hit(0.14, 28, 'light', { radius: 1 })] },
      light3: { name: 'Uppercut d’oni', anim: 'uppercut', dur: 0.6, cancel: 0.38, actions: [hit(0.22, 42, 'launch', { radius: 1.1, hy: 1.3 })] },
      heavy: { name: 'Écrasement', anim: 'slam', dur: 0.95, cancel: 0.7, armor: 'light', actions: [hit(0.5, 66, 'launch', { around: true, radius: 2 }), { t: 0.5, a: 'shake', amt: 0.4 }, fx(0.5, 'dust', { big: true })] },
      ranged: { name: 'Rocher', anim: 'throw', dur: 0.7, cancel: 0.5, actions: [proj(0.25, { kind: 'rock', speed: 15, dmg: 40, hit: 'kd', r: 0.65, life: 1.4, explode: { r: 1.6, dmg: 10 } })] },
      special: { name: 'Séisme d’oni', cost: 40, anim: 'slam', dur: 1.0, cancel: 0.8, actions: [{ t: 0.5, a: 'ring', maxR: 7, speed: 13, dmg: 52, type: 'launch', groundOnly: true, fxColor: '#ff6a2a' }, { t: 0.5, a: 'shake', amt: 0.6 }] },
      ultimate: {
        name: 'Colère de l’Oni', cost: 100, anim: 'slam', dur: 1.8, armor: 'full', cine: { text: 'COLÈRE DE L’ONI', dur: 1.2 },
        actions: [aoe(0.45, 'rockpillar', 0.25, 1.8, 60, 'launch'), aoe(0.45, 'rockblast', 0.9, 4, 150, 'kd', { chip: 0.3, impact: '鬼!!' })],
      },
    },
  },
  {
    id: 'demon-lame', tier: 2,
    name: 'Démon-lame', title: 'Démon',
    blurb: 'Un sabreur dont l’âme a été dévorée. Ses tailles sont aussi rapides que celles d’un maître.',
    hp: 520, speed: 7.0, weight: 1, aura: '#ff2a4a',
    stance: 'blade', aiRange: 2.3, aiZoning: 0.3,
    look: {
      skin: '#5a4a6a', hair: '#e0e0f0', hairStyle: 'long', hairAlt: '#a0a0c0', eyes: '#ff2a2a', face: 'demon',
      top: '#1a1420', arms: '#1a1420', pants: '#241a2a', belt: '#8a1a2a', boots: '#0c0a10', accent: '#8a1a2a', blade: '#ff3a5a',
      extras: ['katana', 'haori', 'kimono', 'horns', 'claws'], body: 'm', emblem: '鬼', emblemColor: '#8a1a2a',
    },
    moves: {
      light1: { name: 'Taille maudite', anim: 'slash1', dur: 0.3, cancel: 0.16, chain: 'light2', lunge: [[0, 0.08, 4]], actions: [hit(0.09, 20, 'light', { reach: 1.3 })] },
      light2: { name: 'Revers', anim: 'slash2', dur: 0.3, cancel: 0.16, chain: 'light3', lunge: [[0, 0.08, 4]], actions: [hit(0.09, 20, 'light', { reach: 1.3 })] },
      light3: { name: 'Taille démoniaque', anim: 'slash3', dur: 0.46, cancel: 0.3, lunge: [[0, 0.12, 6]], actions: [hit(0.14, 34, 'heavy', { reach: 1.35 })] },
      heavy: { name: 'Lame montante', anim: 'rising', dur: 0.66, cancel: 0.44, actions: [hit(0.19, 54, 'launch', { reach: 1.3, hy: 1.4 })] },
      ranged: { name: 'Croissant sanglant', anim: 'slash2', dur: 0.55, cancel: 0.42, actions: [proj(0.14, { kind: 'crescent', speed: 19, dmg: 32, hit: 'heavy', r: 0.85, life: 0.85, pierce: true })] },
      special: {
        name: 'Ruée d’ombre', cost: 40, anim: 'dash', dur: 0.8, cancel: 0.66, invuln: [0, 0.12], lunge: [[0.08, 0.4, 16]],
        actions: [fx(0.05, 'vanishTrail'), hit(0.08, 14, 'light', { dur: 0.32, every: 0.08, radius: 1.1, stun: 0.45, kb: 5 }), hit(0.46, 26, 'heavy', { radius: 1.3, around: true })],
      },
      ultimate: {
        name: 'Lame du Néant', cost: 100, anim: 'iai', dur: 1.8, armor: 'full', invuln: [0, 0.5], cine: { text: 'LAME DU NÉANT', dur: 1.2 },
        actions: [{ t: 0.12, a: 'warp', mode: 'through', dist: 2.2, maxDist: 14 }, fx(0.13, 'slashLine'), aoe(0.2, 'darkblast', 0.7, 3.4, 190, 'kd', { chip: 0.3, impact: '斬!!' })],
      },
    },
  },
  {
    id: 'sorciere', tier: 2,
    name: 'Sorcière maudite', title: 'Démon',
    blurb: 'Elle tisse des malédictions à distance : orbes chercheurs, foudre violette et vents d’âmes.',
    hp: 470, speed: 6.2, weight: 0.9, aura: '#c03aff',
    stance: 'priestess', aiRange: 2.4, aiZoning: 0.75,
    look: {
      skin: '#b8b0d8', hair: '#3a1a5a', hairStyle: 'long', hairAlt: '#5a2a8a', eyes: '#d03aff', face: 'demon',
      top: '#1e1030', arms: '#2a1a40', pants: '#1e1030', belt: '#c03aff', boots: '#120a1a', accent: '#c03aff',
      extras: ['kimono', 'sleeves', 'hakama', 'talismans', 'horns'], body: 'f', emblem: '呪', emblemColor: '#7a2aa8',
    },
    moves: {
      light1: { name: 'Paume maudite', anim: 'palm', dur: 0.36, cancel: 0.2, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.12, 16)] },
      light2: { name: 'Double paume', anim: 'cast', dur: 0.4, cancel: 0.24, lunge: [[0, 0.1, 3]], actions: [hit(0.13, 20, 'heavy', { radius: 1 })] },
      heavy: { name: 'Vague d’âmes', anim: 'palm', dur: 0.66, cancel: 0.48, actions: [proj(0.2, { kind: 'palmwave', speed: 15, dmg: 40, hit: 'kd', r: 1.1, life: 0.36 })] },
      ranged: { name: 'Orbe chercheur', anim: 'cast2', dur: 0.55, cancel: 0.42, actions: [proj(0.16, { kind: 'darkorb', speed: 12, dmg: 26, hit: 'heavy', r: 0.45, life: 2.4, homing: 2.5 })] },
      special: {
        name: 'Foudre violette', cost: 40, anim: 'summon', dur: 0.8, cancel: 0.62,
        actions: [aoe(0.15, 'thunder', 0.35, 1.4, 28, 'heavy'), aoe(0.15, 'thunder', 0.6, 1.4, 28, 'heavy', { offset: [1.5, 0.8] })],
      },
      ultimate: {
        name: 'Malédiction des Mille Âmes', cost: 100, anim: 'summon', dur: 1.8, armor: 'full', cine: { text: 'MALÉDICTION DES MILLE ÂMES', dur: 1.25 },
        actions: [aoe(0.15, 'tornado', 0.4, 3.2, 70, 'launch', { zone: { dur: 1.0, tick: 0.18, dmg: 8 } }), aoe(0.15, 'darkblast', 1.4, 3.6, 120, 'kd', { chip: 0.3, impact: '呪!!' })],
      },
    },
  },

  // --- Rang 3 : monstres ---------------------------------------------------------------------
  {
    id: 'golem', tier: 3,
    name: 'Golem d’ombre', title: 'Monstre',
    blurb: 'Pierre noire animée par le Fléau. Lent, presque inarrêtable, il fait jaillir la roche du sol.',
    hp: 1050, speed: 4.4, weight: 1.9, aura: '#7a5aff',
    stance: 'fists', aiRange: 2.3, aiZoning: 0.25,
    look: {
      skin: '#3a3448', hair: '#241e30', hairStyle: 'short', eyes: '#8a6aff', face: 'demon', marks: '#8a6aff', horn: '#1a1424',
      armor: '#4a4060', gloves: '#5a4a7a', pants: '#2a2436', belt: '#7a5aff', extras: ['barefoot', 'gloves', 'armor', 'spikes'], build: 1.25, body: 'big', size: 1.45,
    },
    moves: {
      light1: { name: 'Poing de pierre', anim: 'jab', dur: 0.46, cancel: 0.26, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.15, 32, 'light', { radius: 1.1 })] },
      light2: { name: 'Revers de roc', anim: 'hook', dur: 0.5, cancel: 0.28, chain: 'light3', lunge: [[0, 0.1, 3]], actions: [hit(0.16, 38, 'light', { radius: 1.1 })] },
      light3: { name: 'Uppercut d’obsidienne', anim: 'uppercut', dur: 0.66, cancel: 0.42, actions: [hit(0.24, 56, 'launch', { radius: 1.2, hy: 1.4 })] },
      heavy: { name: 'Marteau-pilon', anim: 'slam', dur: 1.0, cancel: 0.72, armor: 'light', actions: [hit(0.52, 90, 'launch', { around: true, radius: 2.2 }), { t: 0.52, a: 'shake', amt: 0.5 }, fx(0.52, 'dust', { big: true })] },
      ranged: { name: 'Bloc d’obsidienne', anim: 'throw', dur: 0.75, cancel: 0.55, actions: [proj(0.28, { kind: 'rock', speed: 14, dmg: 58, hit: 'kd', r: 0.8, life: 1.5, explode: { r: 2, dmg: 14 } })] },
      special: {
        name: 'Piliers d’ombre', cost: 40, anim: 'slam', dur: 1.0, cancel: 0.8,
        actions: [aoe(0.45, 'rockpillar', 0.2, 1.6, 44, 'launch'), aoe(0.45, 'rockpillar', 0.45, 1.6, 44, 'launch', { offset: [1.8, 1] }), aoe(0.45, 'rockpillar', 0.7, 1.6, 44, 'launch', { offset: [-1.8, -1] })],
      },
      ultimate: {
        name: 'Effondrement Abyssal', cost: 100, anim: 'slam', dur: 1.9, armor: 'full', cine: { text: 'EFFONDREMENT ABYSSAL', dur: 1.3 },
        actions: [aoe(0.45, 'rockpillar', 0.3, 2, 70, 'launch'), aoe(0.45, 'rockblast', 1.0, 4.6, 230, 'kd', { chip: 0.3, impact: 'ドゴォン!!' })],
      },
    },
  },
  {
    id: 'bete', tier: 3,
    name: 'Bête hurlante', title: 'Monstre',
    blurb: 'Un prédateur à la queue fouettante, plus rapide que l’œil. Ses griffes déchirent même le vent.',
    hp: 760, speed: 8.0, weight: 1.1, aura: '#ffb000',
    stance: 'ninja', aiRange: 2.3, aiZoning: 0.25,
    look: {
      skin: '#6a5038', hair: '#2a2018', hairStyle: 'spiky', eyes: '#ffb000', face: 'demon', horn: '#e8dcc0', tail: '#4a3828',
      pants: '#3a2a1e', belt: '#8a3020', extras: ['barefoot', 'claws', 'tail', 'spikes'], build: 1.08, body: 'm', size: 1.12,
    },
    moves: {
      light1: { name: 'Griffe', anim: 'slash1', dur: 0.26, cancel: 0.14, chain: 'light2', lunge: [[0, 0.08, 5]], actions: [hit(0.08, 20)] },
      light2: { name: 'Griffe', anim: 'slash2', dur: 0.26, cancel: 0.14, chain: 'light3', lunge: [[0, 0.08, 5]], actions: [hit(0.08, 20)] },
      light3: { name: 'Fouet de queue', anim: 'spinkick', dur: 0.5, cancel: 0.32, lunge: [[0, 0.14, 5]], actions: [hit(0.16, 38, 'heavy', { radius: 1.3, around: true })] },
      heavy: { name: 'Bond prédateur', anim: 'charge', dur: 0.7, cancel: 0.5, lunge: [[0.06, 0.32, 15]], actions: [hit(0.1, 12, 'light', { dur: 0.22, every: 0.07, stun: 0.4, kb: 4 }), hit(0.34, 40, 'launch', { radius: 1.1 })] },
      ranged: { name: 'Lames de vent', anim: 'slash3', dur: 0.5, cancel: 0.38, actions: [proj(0.14, { kind: 'windblade', speed: 24, dmg: 16, hit: 'light', r: 0.45, life: 0.8 }, { spread: [-15, 0, 15] })] },
      special: { name: 'Tourbillon sauvage', cost: 40, anim: 'summon', dur: 0.75, cancel: 0.6, actions: [aoe(0.2, 'tornado', 0.25, 2.2, 22, 'launch', { zone: { dur: 1.2, tick: 0.2, dmg: 8 } })] },
      ultimate: {
        name: 'Carnage Sauvage', cost: 100, anim: 'dash', dur: 1.8, armor: 'full', cine: { text: 'CARNAGE SAUVAGE', dur: 1.2 },
        actions: [
          { t: 0.08, a: 'warp', mode: 'around', angle: 90, dist: 1.2 }, hit(0.1, 34, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 0.33, a: 'warp', mode: 'around', angle: -90, dist: 1.2 }, hit(0.35, 34, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 0.58, a: 'warp', mode: 'around', angle: 180, dist: 1.2 }, hit(0.6, 34, 'light', { stun: 0.6, kb: 0.5, chip: 0.3 }),
          { t: 1.1, a: 'warp', mode: 'around', angle: 0, dist: 1.3 }, hit(1.15, 110, 'kd', { chip: 0.3, impact: 'ガアァッ!!', radius: 1.3 }),
        ],
      },
    },
  },
  {
    id: 'chevalier', tier: 3,
    name: 'Chevalier déchu', title: 'Monstre',
    blurb: 'Un ancien protecteur corrompu. Sa lance porte loin et appelle une foudre spectrale.',
    hp: 900, speed: 6.2, weight: 1.3, aura: '#5affd8',
    stance: 'staff', aiRange: 2.6, aiZoning: 0.4,
    look: {
      skin: '#8a9aa0', hair: '#e8f0f0', hairStyle: 'long', hairAlt: '#b8c8c8', eyes: '#5affd8', face: 'demon', horn: '#1a2a2a',
      top: '#1a2228', arms: '#1a2228', pants: '#222c32', belt: '#3affc8', boots: '#0c1214', accent: '#3affc8', armor: '#3a4a52',
      extras: ['spear', 'armor', 'horns', 'scarf'], body: 'm', size: 1.15, emblem: '亡', emblemColor: '#1a8a70',
    },
    moves: {
      light1: { name: 'Estoc spectral', anim: 'thrust', dur: 0.32, cancel: 0.18, chain: 'light2', lunge: [[0, 0.1, 4]], actions: [hit(0.1, 26, 'light', { reach: 1.65 })] },
      light2: { name: 'Double estoc', anim: 'staff1', dur: 0.34, cancel: 0.18, chain: 'light3', lunge: [[0, 0.1, 4]], actions: [hit(0.11, 28, 'light', { reach: 1.6 })] },
      light3: { name: 'Fauchage', anim: 'staff2', dur: 0.5, cancel: 0.32, lunge: [[0, 0.12, 5]], actions: [hit(0.16, 44, 'heavy', { reach: 1.5, radius: 1.3 })] },
      heavy: { name: 'Lance des damnés', anim: 'rising', dur: 0.66, cancel: 0.44, actions: [fx(0.02, 'kiCharge'), hit(0.19, 66, 'launch', { reach: 1.6, hy: 1.4 })] },
      ranged: { name: 'Éclair spectral', anim: 'cast2', dur: 0.5, cancel: 0.38, actions: [proj(0.14, { kind: 'bolt', speed: 40, dmg: 34, hit: 'heavy', r: 0.38, life: 0.55 })] },
      special: {
        name: 'Orage des damnés', cost: 40, anim: 'summon', dur: 0.8, cancel: 0.62,
        actions: [aoe(0.15, 'thunder', 0.3, 1.5, 34, 'heavy'), aoe(0.15, 'thunder', 0.5, 1.5, 34, 'heavy', { offset: [1.6, 0.8] }), aoe(0.15, 'thunder', 0.7, 1.7, 40, 'launch', { offset: [-1.6, -0.8] })],
      },
      ultimate: {
        name: 'Jugement des Damnés', cost: 100, anim: 'summon', dur: 1.6, armor: 'full', cine: { text: 'JUGEMENT DES DAMNÉS', dur: 1.25 },
        actions: [aoe(0.2, 'thunder', 0.85, 4.4, 260, 'kd', { chip: 0.3, impact: 'バリバリッ!!' })],
      },
    },
  },

  // --- Rang 4 : boss (un tous les 5 niveaux) --------------------------------------------------
  {
    id: 'roi-goule', tier: 4, boss: true,
    name: 'Roi des Goules', title: 'Boss — Seigneur des morts affamés',
    blurb: 'Il commande la horde. Il appelle ses ombres, hurle à briser la garde et dévore la vie.',
    hp: 1700, speed: 6.0, weight: 1.6, aura: '#c8ff5a',
    stance: 'fists', aiRange: 2.3, aiZoning: 0.3,
    look: {
      skin: '#6a7a68', hair: '#e8e8d8', hairStyle: 'long', hairAlt: '#b8b8a8', eyes: '#e8ff3a', face: 'demon', accent: '#d8c040',
      top: '#2a2a22', arms: '#6a7a68', pants: '#22221c', belt: '#d8c040', boots: '#141410',
      extras: ['barefoot', 'claws', 'crown', 'haori', 'spikes'], build: 1.15, body: 'big', size: 1.5, emblem: '屍', emblemColor: '#6a8a20',
    },
    moves: {
      light1: { name: 'Griffe royale', anim: 'jab', dur: 0.4, cancel: 0.22, chain: 'light2', lunge: [[0, 0.1, 4]], actions: [hit(0.13, 28, 'light', { radius: 1.1 })] },
      light2: { name: 'Lacération royale', anim: 'hook', dur: 0.44, cancel: 0.24, chain: 'light3', lunge: [[0, 0.1, 4]], actions: [hit(0.14, 32, 'light', { radius: 1.1 })] },
      light3: { name: 'Mâchoire de fer', anim: 'uppercut', dur: 0.6, cancel: 0.38, actions: [hit(0.22, 52, 'launch', { radius: 1.2, hy: 1.3 })] },
      heavy: { name: 'Bond du roi', anim: 'slam', dur: 0.95, cancel: 0.7, armor: 'light', lunge: [[0.1, 0.4, 8]], actions: [hit(0.5, 80, 'launch', { around: true, radius: 2.2 }), { t: 0.5, a: 'shake', amt: 0.5 }, fx(0.5, 'dust', { big: true })] },
      ranged: { name: 'Crâne maudit', anim: 'throw', dur: 0.6, cancel: 0.45, actions: [proj(0.2, { kind: 'darkorb', speed: 13, dmg: 34, hit: 'heavy', r: 0.55, life: 2.2, homing: 2.2 }, { spread: [-12, 12] })] },
      special: { name: 'Appel de la horde', cost: 40, anim: 'summon', dur: 0.7, cancel: 0.55, actions: [{ t: 0.2, a: 'summon', kind: 'clone', count: 2 }] },
      ultimate: {
        name: 'Festin des Morts', cost: 100, anim: 'powerup', dur: 1.8, armor: 'full', cine: { text: 'FESTIN DES MORTS', dur: 1.3 },
        actions: [{ t: 0.5, a: 'ring', maxR: 7, speed: 18, dmg: 70, type: 'launch', fxColor: '#c8ff5a' }, aoe(0.5, 'darkblast', 0.8, 4.2, 200, 'kd', { chip: 0.3, impact: '喰!!' })],
      },
    },
  },
  {
    id: 'shogun-oni', tier: 4, boss: true,
    name: 'Shōgun Oni', title: 'Boss — Général des démons',
    blurb: 'Armure laquée, sabre de deux mètres et l’art de la guerre perverti. Chacune de ses tailles est un jugement.',
    hp: 2100, speed: 6.2, weight: 1.7, aura: '#ff3a2a',
    stance: 'blade', aiRange: 2.5, aiZoning: 0.3,
    look: {
      skin: '#a82a2a', hair: '#141010', hairStyle: 'ponytail', eyes: '#ffe03a', face: 'demon', horn: '#e8d8a8',
      top: '#2a1414', arms: '#2a1414', pants: '#1a0c0c', belt: '#d8a020', boots: '#0c0808', accent: '#d8a020', armor: '#5a1a1a', blade: '#ffd23a',
      extras: ['katana', 'armor', 'bigHorns', 'hakama', 'sash'], build: 1.12, body: 'big', size: 1.6, emblem: '将', emblemColor: '#d8a020',
    },
    moves: {
      light1: { name: 'Taille du général', anim: 'slash1', dur: 0.34, cancel: 0.18, chain: 'light2', lunge: [[0, 0.08, 4]], actions: [hit(0.1, 30, 'light', { reach: 1.45 })] },
      light2: { name: 'Revers du général', anim: 'slash2', dur: 0.34, cancel: 0.18, chain: 'light3', lunge: [[0, 0.08, 4]], actions: [hit(0.1, 30, 'light', { reach: 1.45 })] },
      light3: { name: 'Fente de guerre', anim: 'slash3', dur: 0.5, cancel: 0.32, lunge: [[0, 0.12, 6]], actions: [hit(0.15, 52, 'heavy', { reach: 1.5 })] },
      heavy: { name: 'Sabre montant', anim: 'rising', dur: 0.7, cancel: 0.46, actions: [hit(0.2, 80, 'launch', { reach: 1.5, radius: 1.2, hy: 1.5 })] },
      ranged: { name: 'Croissant de guerre', anim: 'slash2', dur: 0.55, cancel: 0.42, actions: [proj(0.14, { kind: 'crescent', speed: 20, dmg: 46, hit: 'heavy', r: 1.0, life: 0.9, pierce: true }, { spread: [-10, 10] })] },
      special: {
        name: 'Charge du shōgun', cost: 40, anim: 'dash', dur: 0.85, cancel: 0.7, invuln: [0, 0.15], lunge: [[0.08, 0.45, 17]],
        actions: [fx(0.05, 'vanishTrail'), hit(0.08, 18, 'light', { dur: 0.36, every: 0.07, radius: 1.3, stun: 0.5, kb: 6 }), hit(0.5, 40, 'launch', { radius: 1.5, around: true })],
      },
      ultimate: {
        name: 'Tempête de Mille Sabres', cost: 100, anim: 'iai', dur: 2.0, armor: 'full', invuln: [0, 0.6], cine: { text: 'TEMPÊTE DE MILLE SABRES', dur: 1.35 },
        actions: [
          { t: 0.12, a: 'warp', mode: 'through', dist: 2.4, maxDist: 16 }, fx(0.13, 'slashLine'),
          aoe(0.2, 'darkblast', 0.6, 3, 110, 'heavy'), aoe(0.2, 'darkblast', 1.0, 4.2, 200, 'kd', { chip: 0.3, impact: '将!!' }),
        ],
      },
    },
  },
  {
    id: 'imperatrice', tier: 4, boss: true,
    name: 'Impératrice du Fléau', title: 'Boss — Reine des malédictions',
    blurb: 'Ses ailes obscurcissent le ciel. Elle fait pleuvoir des météores et un rayon d’aurore maudite.',
    hp: 2000, speed: 6.6, weight: 1.2, aura: '#ff3ad8',
    stance: 'priestess', aiRange: 2.4, aiZoning: 0.7,
    look: {
      skin: '#d8c8e8', hair: '#f0e8ff', hairStyle: 'priestess', eyes: '#ff3ad8', face: 'demon', horn: '#2a0a2a', accent: '#ff3ad8',
      top: '#1a0820', arms: '#2a1030', pants: '#1a0820', belt: '#ff3ad8', boots: '#0c040e', wing: '#3a0a3a', wingSpan: 1.1,
      extras: ['kimono', 'sleeves', 'hakama', 'wings', 'crown', 'talismans'], body: 'f', size: 1.5, emblem: '后', emblemColor: '#a81a8a',
    },
    moves: {
      light1: { name: 'Main de l’impératrice', anim: 'palm', dur: 0.34, cancel: 0.18, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.11, 26)] },
      light2: { name: 'Sceau royal', anim: 'cast', dur: 0.42, cancel: 0.26, lunge: [[0, 0.1, 3]], actions: [hit(0.13, 34, 'heavy', { radius: 1.1 })] },
      heavy: { name: 'Vague impériale', anim: 'palm', dur: 0.66, cancel: 0.48, actions: [proj(0.2, { kind: 'palmwave', speed: 16, dmg: 60, hit: 'kd', r: 1.3, life: 0.4 })] },
      ranged: { name: 'Orbes jumeaux', anim: 'cast2', dur: 0.55, cancel: 0.42, actions: [proj(0.16, { kind: 'darkorb', speed: 12, dmg: 32, hit: 'heavy', r: 0.5, life: 2.4, homing: 3 }, { spread: [-20, 20] })] },
      special: {
        name: 'Pluie d’étoiles noires', cost: 40, anim: 'summon', dur: 0.85, cancel: 0.66,
        actions: [aoe(0.15, 'meteor', 0.6, 1.8, 50, 'kd'), aoe(0.15, 'thunder', 0.4, 1.5, 34, 'heavy', { offset: [2, 0] }), aoe(0.15, 'thunder', 0.8, 1.5, 34, 'heavy', { offset: [-2, 0] })],
      },
      ultimate: {
        name: 'Aurore Maudite', cost: 100, anim: 'beam', dur: 2.3, hold: [0.35, 1.95], armor: 'full', cine: { text: 'AURORE MAUDITE', dur: 1.35 },
        actions: [fx(0.02, 'kiCharge'), { t: 0.4, a: 'beam', dur: 1.5, width: 1.1, tick: 0.08, dmg: 14, finalDmg: 60, impact: '滅!!' }],
      },
    },
  },
  {
    id: 'dragon-noir', tier: 4, boss: true,
    name: 'Seigneur Dragon Noir', title: 'Boss — Le feu qui dévore les cieux',
    blurb: 'Mi-homme, mi-dragon. Il crache des flammes, fait jaillir des colonnes de feu et invoque son dragon.',
    hp: 2100, speed: 6.4, weight: 1.6, aura: '#ff6a1a',
    stance: 'fists', aiRange: 2.3, aiZoning: 0.45,
    look: {
      skin: '#3a2a2a', hair: '#ff6a1a', hairStyle: 'spiky', hairAlt: '#ffd23a', eyes: '#ffb01a', face: 'demon', marks: '#ff6a1a', horn: '#1a1010', tail: '#2a1a1a',
      top: '#1a0e0e', arms: '#3a2a2a', pants: '#1a0e0e', belt: '#ff6a1a', boots: '#0c0606', armor: '#4a2a1a', wing: '#2a0e0a', wingSpan: 1.2,
      extras: ['bigHorns', 'wings', 'tail', 'claws', 'armor', 'spikes'], build: 1.1, body: 'big', size: 1.6, emblem: '竜', emblemColor: '#ff6a1a',
    },
    moves: {
      light1: { name: 'Griffe draconique', anim: 'jab', dur: 0.36, cancel: 0.2, chain: 'light2', lunge: [[0, 0.1, 4]], actions: [hit(0.12, 30, 'light', { radius: 1.1 })] },
      light2: { name: 'Écaille tranchante', anim: 'hook', dur: 0.4, cancel: 0.22, chain: 'light3', lunge: [[0, 0.1, 4]], actions: [hit(0.13, 34, 'light', { radius: 1.1 })] },
      light3: { name: 'Queue de dragon', anim: 'spinkick', dur: 0.55, cancel: 0.36, actions: [hit(0.18, 56, 'kd', { radius: 1.6, around: true })] },
      heavy: { name: 'Uppercut volcanique', anim: 'uppercut', dur: 0.7, cancel: 0.46, actions: [fx(0.15, 'flameburst'), hit(0.22, 82, 'launch', { radius: 1.3, hy: 1.4 })] },
      ranged: { name: 'Souffle de feu', anim: 'cast', dur: 0.6, cancel: 0.45, actions: [proj(0.18, { kind: 'fireball', speed: 18, dmg: 34, hit: 'heavy', r: 0.5, life: 1.4, explode: { r: 1.8, dmg: 12 } }, { spread: [-14, 0, 14] })] },
      special: {
        name: 'Colonnes de feu', cost: 40, anim: 'summon', dur: 0.85, cancel: 0.66,
        actions: [aoe(0.15, 'firepillar', 0.35, 1.7, 40, 'launch'), aoe(0.15, 'firepillar', 0.6, 1.7, 40, 'launch', { offset: [1.9, 0] }), aoe(0.15, 'firepillar', 0.85, 1.7, 40, 'launch', { offset: [-1.9, 0] })],
      },
      ultimate: {
        name: 'Dragon des Cendres', cost: 100, anim: 'summon', dur: 1.8, armor: 'full', cine: { text: 'DRAGON DES CENDRES', dur: 1.35 },
        actions: [{ t: 0.25, a: 'summon', kind: 'dragon', count: 1, dmg: 260, impact: '竜!!' }],
      },
    },
  },
  {
    id: 'titan', tier: 4, boss: true,
    name: 'Titan des Abysses', title: 'Boss — Celui qui marche sous la terre',
    blurb: 'Un colosse qui fait trembler l’arène à chaque pas. Il fait tomber le ciel en pluie de météores.',
    hp: 2300, speed: 4.6, weight: 2.4, aura: '#5ab4ff',
    stance: 'fists', aiRange: 2.5, aiZoning: 0.3,
    look: {
      skin: '#2a3a4a', hair: '#0e1824', hairStyle: 'short', eyes: '#5af0ff', face: 'demon', marks: '#5af0ff', horn: '#0e141c',
      armor: '#3a4a5a', gloves: '#4a5a6a', pants: '#1a242e', belt: '#5af0ff', extras: ['barefoot', 'gloves', 'armor', 'bigHorns', 'spikes'], build: 1.3, body: 'big', size: 1.85,
    },
    moves: {
      light1: { name: 'Poing titanesque', anim: 'jab', dur: 0.5, cancel: 0.28, chain: 'light2', lunge: [[0, 0.1, 3]], actions: [hit(0.17, 40, 'light', { radius: 1.2 })] },
      light2: { name: 'Revers abyssal', anim: 'hook', dur: 0.54, cancel: 0.3, chain: 'light3', lunge: [[0, 0.1, 3]], actions: [hit(0.18, 46, 'heavy', { radius: 1.2 })] },
      light3: { name: 'Uppercut des profondeurs', anim: 'uppercut', dur: 0.7, cancel: 0.44, actions: [hit(0.26, 66, 'launch', { radius: 1.3, hy: 1.5 })] },
      heavy: { name: 'Pas du titan', anim: 'slam', dur: 1.05, cancel: 0.76, armor: 'light', actions: [hit(0.55, 70, 'launch', { around: true, radius: 2.4 }), { t: 0.55, a: 'shake', amt: 0.7 }, fx(0.55, 'dust', { big: true })] },
      ranged: { name: 'Fragment de lune', anim: 'throw', dur: 0.8, cancel: 0.58, actions: [proj(0.3, { kind: 'rock', speed: 14, dmg: 55, hit: 'kd', r: 0.95, life: 1.6, explode: { r: 2.4, dmg: 20 } })] },
      special: { name: 'Séisme abyssal', cost: 40, anim: 'slam', dur: 1.05, cancel: 0.85, actions: [{ t: 0.55, a: 'ring', maxR: 11, speed: 13, dmg: 90, type: 'launch', groundOnly: true, fxColor: '#5ab4ff' }, { t: 0.55, a: 'shake', amt: 0.8 }] },
      ultimate: {
        name: 'Chute des Cieux', cost: 100, anim: 'summon', dur: 2.0, armor: 'full', cine: { text: 'CHUTE DES CIEUX', dur: 1.35 },
        actions: [
          aoe(0.2, 'meteor', 0.9, 2.2, 70, 'kd', { offset: [2.4, 1.2] }), aoe(0.2, 'meteor', 1.1, 2.2, 70, 'kd', { offset: [-2.4, -1.2] }),
          aoe(0.2, 'meteor', 1.4, 4.8, 240, 'kd', { chip: 0.3, impact: 'ドガァン!!', zone: { type: 'firezone', dur: 2, tick: 0.25, dmg: 8 } }),
        ],
      },
    },
  },
  {
    id: 'roi-fleau', tier: 4, boss: true, final: true,
    name: 'Roi Fléau', title: 'Boss final — L’Éclipse Primordiale',
    blurb: 'La source de tous les fléaux. Il maîtrise chaque pouvoir de ses serviteurs, et bien plus encore.',
    hp: 2100, speed: 6.3, weight: 1.8, aura: '#ff1a4a', auraAlt: '#ffffff',
    stance: 'blade', aiRange: 2.5, aiZoning: 0.45,
    look: {
      skin: '#1a1424', hair: '#f8f0ff', hairStyle: 'long', hairAlt: '#ff1a4a', eyes: '#ff1a4a', face: 'demon', marks: '#ff1a4a', horn: '#0a0610', accent: '#ff1a4a', tail: '#140e1c',
      top: '#0a0610', arms: '#1a1424', pants: '#0e0a14', belt: '#ff1a4a', boots: '#060408', armor: '#2a1a3a', blade: '#ff1a4a', wing: '#1a0410', wingSpan: 1.35,
      extras: ['katana', 'bigHorns', 'wings', 'tail', 'crown', 'claws', 'haori', 'armor'], build: 1.08, body: 'm', size: 1.75, emblem: '蝕', emblemColor: '#ff1a4a',
    },
    moves: {
      light1: { name: 'Taille de l’éclipse', anim: 'slash1', dur: 0.3, cancel: 0.16, chain: 'light2', lunge: [[0, 0.08, 5]], actions: [hit(0.09, 28, 'light', { reach: 1.5 })] },
      light2: { name: 'Revers primordial', anim: 'slash2', dur: 0.3, cancel: 0.16, chain: 'light3', lunge: [[0, 0.08, 5]], actions: [hit(0.09, 28, 'light', { reach: 1.5 })] },
      light3: { name: 'Croix des ténèbres', anim: 'slash3', dur: 0.46, cancel: 0.3, lunge: [[0, 0.12, 6]], actions: [hit(0.14, 50, 'heavy', { reach: 1.55, radius: 1.2 })] },
      heavy: { name: 'Couronne d’épées', anim: 'rising', dur: 0.66, cancel: 0.44, actions: [hit(0.19, 50, 'launch', { reach: 1.55, radius: 1.3, hy: 1.5 }), { t: 0.19, a: 'ring', maxR: 3.5, speed: 16, dmg: 20, type: 'kd', fxColor: '#ff1a4a' }] },
      ranged: { name: 'Orbes de l’éclipse', anim: 'cast2', dur: 0.55, cancel: 0.42, actions: [proj(0.15, { kind: 'darkorb', speed: 13, dmg: 30, hit: 'heavy', r: 0.55, life: 2.4, homing: 3 }, { spread: [-24, 0, 24] })] },
      special: {
        name: 'Éveil du Fléau', cost: 50, anim: 'powerup', dur: 1.05, invuln: [0, 1.05], alt: 'special2',
        actions: [sfx(0.05, 'charge'), { t: 0.55, a: 'buff', buff: 'transform', dur: 12 }, { t: 0.55, a: 'ring', maxR: 6, speed: 22, dmg: 50, type: 'kd', fxColor: '#ff1a4a' }],
      },
      special2: {
        name: 'Jugement de l’éclipse', cost: 35, anim: 'summon', dur: 0.85, cancel: 0.66,
        actions: [aoe(0.15, 'thunder', 0.35, 1.7, 46, 'heavy'), aoe(0.15, 'darkblast', 0.7, 2.4, 70, 'launch', { offset: [0, 0] })],
      },
      ultimate: {
        name: 'Éclipse Primordiale', cost: 100, anim: 'beam', dur: 2.4, hold: [0.35, 2.0], armor: 'full', cine: { text: 'ÉCLIPSE PRIMORDIALE', dur: 1.5 },
        actions: [fx(0.02, 'kiCharge'), { t: 0.4, a: 'beam', dur: 1.55, width: 1.3, tick: 0.08, dmg: 12, finalDmg: 70, impact: '蝕!!' }, aoe(0.4, 'darkblast', 1.9, 4.4, 130, 'kd', { chip: 0.3 })],
      },
    },
  },
];

/** Les géants frappent plus loin : allonge et rayon des coups suivent (en partie) leur taille. */
function scaleReach(def) {
  const size = def.look.size || 1;
  if (size === 1) return def;
  const kr = 1 + (size - 1) * 0.7; // allonge
  const kw = 1 + (size - 1) * 0.3; // largeur de la zone touchée (les coups circulaires restent esquivables)
  for (const mv of Object.values(def.moves)) {
    for (const a of mv.actions) {
      if (a.a !== 'hit') continue;
      a.reach = (a.reach || 1.05) * kr;
      a.radius = (a.radius || 0.85) * kw;
    }
  }
  return def;
}

export const MONSTERS = RAW.map((m) => scaleReach({ monster: true, ...m }));
export const MONSTER_BY_ID = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));
