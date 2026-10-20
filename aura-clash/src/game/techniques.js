// Techniques alternatives : pour chaque combattant, un second spécial et un second ultime, achetés
// en Ryō dans « Améliorations », puis choisis avant le combat (équipement « A » ou « B »).
import { HIT_TYPES } from './constants.js';

const hit = (t, dmg, type = 'light', o = {}) => ({ t, a: 'hit', dmg, type, reach: 1.05, radius: 0.85, ...HIT_TYPES[type], ...o });
const proj = (t, p, o = {}) => ({ t, a: 'proj', p, ...o });
const fx = (t, name, o = {}) => ({ t, a: 'fx', fx: name, ...o });
const aoe = (t, type, delay, r, dmg, h, o = {}) => ({ t, a: 'aoe', type, delay, r, dmg, hit: h, ...o });
const ring = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];

export const TECH_PRICES = { special: 600, ultimate: 1200 };

/** { charId: { special: coup, ultimate: coup } } — les ultimes ont leur cinématique. */
export const TECHNIQUES = {
  kael: {
    special: {
      name: 'Poing météore', cost: 40, anim: 'dash', dur: 0.7, cancel: 0.58, invuln: [0, 0.12], lunge: [[0.06, 0.34, 18]],
      actions: [fx(0.02, 'kiCharge'), hit(0.08, 16, 'light', { dur: 0.26, every: 0.08, radius: 1.1, stun: 0.4, kb: 4 }), hit(0.38, 62, 'kd', { radius: 1.25, impact: 'ドン!' })],
    },
    ultimate: {
      name: 'Tempête de Ki', cost: 100, anim: 'cast2', dur: 2.0, armor: 'full',
      cine: { text: 'TEMPÊTE DE KI', dur: 1.3 },
      actions: [
        ...[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t, i) => proj(t, { kind: 'kiball', speed: 26, dmg: 18, hit: 'light', r: 0.4, life: 1.3 }, { offset: i % 2 ? 0.4 : -0.4 })),
        proj(1.15, { kind: 'bigki', speed: 17, dmg: 150, hit: 'kd', r: 1.0, life: 2, explode: { r: 3, dmg: 40 } }),
      ],
    },
  },
  kage: {
    special: {
      name: 'Pluie de kunaïs', cost: 40, anim: 'throw', dur: 0.62, cancel: 0.5, air: true,
      actions: [proj(0.12, { kind: 'shuriken', speed: 32, dmg: 17, hit: 'light', r: 0.3, life: 1 }, { spread: [-22, -11, 0, 11, 22] }), proj(0.3, { kind: 'shuriken', speed: 32, dmg: 17, hit: 'light', r: 0.3, life: 1 }, { spread: [-16, 0, 16] })],
    },
    ultimate: {
      name: 'Exécution de l’Ombre', cost: 100, anim: 'iai', dur: 1.8, armor: 'full', invuln: [0, 0.5],
      cine: { text: 'EXÉCUTION DE L’OMBRE', dur: 1.25 },
      actions: [{ t: 0.1, a: 'warp', mode: 'through', dist: 2.0, maxDist: 15 }, fx(0.11, 'slashLine'), aoe(0.18, 'darkblast', 0.6, 3.4, 260, 'kd', { chip: 0.3, impact: '影!!' })],
    },
  },
  ren: {
    special: {
      name: 'Croissants jumeaux', cost: 40, anim: 'slash2', dur: 0.66, cancel: 0.52,
      actions: [proj(0.12, { kind: 'crescent', speed: 22, dmg: 40, hit: 'heavy', r: 0.9, life: 0.9, pierce: true }, { spread: [-12, 12] }), proj(0.32, { kind: 'crescent', speed: 22, dmg: 40, hit: 'heavy', r: 0.9, life: 0.9, pierce: true })],
    },
    ultimate: {
      name: 'Mille Lames', cost: 100, anim: 'dash', dur: 1.9, armor: 'full',
      cine: { text: 'MILLE LAMES', dur: 1.25 },
      actions: [
        ...[0, 72, 144, 216, 288].flatMap((deg, i) => [{ t: 0.08 + i * 0.2, a: 'warp', mode: 'around', angle: deg, dist: 1.4 }, hit(0.1 + i * 0.2, 36, 'light', { stun: 0.6, kb: 0.4, chip: 0.3, reach: 1.4 })]),
        { t: 1.25, a: 'warp', mode: 'around', angle: 0, dist: 1.5 }, hit(1.3, 130, 'kd', { chip: 0.3, impact: '斬!!', radius: 1.4, reach: 1.4 }),
      ],
    },
  },
  lyra: {
    special: {
      name: 'Prison de glace', cost: 40, anim: 'summon', dur: 0.75, cancel: 0.6,
      actions: [0, 120, 240].map((deg) => aoe(0.15, 'icepillar', 0.4, 1.4, 34, 'launch', { offset: ring(deg, 1.6) })),
    },
    ultimate: {
      name: 'Supernova', cost: 100, anim: 'summon', dur: 2.1, armor: 'full',
      cine: { text: 'SUPERNOVA', dur: 1.3 },
      // Lyra rassemble le feu et la glace ; des piliers alternés encerclent l'adversaire,
      // puis une étoile se forme au-dessus de lui, implose et explose
      actions: [
        fx(0.02, 'novaGather'),
        ...[0, 60, 120, 180, 240, 300].map((deg, i) => aoe(0.2 + i * 0.07, i % 2 ? 'icepillar' : 'firepillar', 0.35, 1.1, 16, 'light', { offset: ring(deg, 2.8) })),
        aoe(0.25, 'supernova', 1.35, 4.8, 230, 'kd', { chip: 0.3, impact: '爆!!' }),
        { t: 1.6, a: 'shake', amt: 1.4 },
      ],
    },
  },
  goro: {
    special: {
      name: 'Dragon montant', cost: 40, anim: 'uppercut', dur: 0.75, cancel: 0.6, invuln: [0, 0.2], lunge: [[0.05, 0.25, 8]],
      actions: [fx(0.1, 'flameburst'), hit(0.18, 78, 'launch', { radius: 1.2, hy: 1.4, up: 14, impact: '昇!' })],
    },
    ultimate: {
      name: 'Poing du Ciel', cost: 100, anim: 'charge', dur: 1.7, armor: 'full', lunge: [[0.1, 0.6, 16]],
      cine: { text: 'POING DU CIEL', dur: 1.25 },
      actions: [hit(0.15, 14, 'light', { dur: 0.45, every: 0.06, radius: 1.2, stun: 0.6, kb: 1 }), hit(0.75, 160, 'kd', { radius: 1.5, chip: 0.3, impact: '天!!' }), aoe(0.75, 'rockblast', 0.05, 3, 60, 'kd')],
    },
  },
  sora: {
    special: {
      name: 'Danse des esprits', cost: 40, anim: 'cast', dur: 0.66, cancel: 0.52,
      actions: [proj(0.15, { kind: 'spiritorb', speed: 13, dmg: 30, hit: 'heavy', r: 0.45, life: 2.6, homing: 3.5 }, { spread: [-30, 0, 30] })],
    },
    ultimate: {
      name: 'Renards Célestes', cost: 100, anim: 'summon', dur: 1.7, armor: 'full',
      cine: { text: 'RENARDS CÉLESTES', dur: 1.25 },
      actions: [{ t: 0.3, a: 'summon', kind: 'fox', count: 4 }, aoe(0.3, 'tornado', 0.4, 3.4, 90, 'launch', { impact: '狐!!' })],
    },
  },
  raiden: {
    special: {
      name: 'Lance-éclairs', cost: 40, anim: 'cast2', dur: 0.6, cancel: 0.48, air: true,
      actions: [proj(0.13, { kind: 'bolt', speed: 42, dmg: 30, hit: 'heavy', r: 0.38, life: 0.55 }, { spread: [-14, 0, 14] })],
    },
    ultimate: {
      name: 'Colère du Ciel', cost: 100, anim: 'summon', dur: 1.9, armor: 'full',
      cine: { text: 'COLÈRE DU CIEL', dur: 1.3 },
      actions: [...[0, 72, 144, 216, 288].map((deg, i) => aoe(0.2, 'thunder', 0.5 + i * 0.12, 1.6, 40, 'heavy', { offset: ring(deg, 2.4) })), aoe(0.2, 'thunder', 1.3, 3, 160, 'kd', { chip: 0.3, impact: '雷!!' })],
    },
  },
  hana: {
    special: {
      name: 'Valse des pétales', cost: 40, anim: 'spinkick', dur: 0.66, cancel: 0.52,
      actions: [proj(0.15, { kind: 'windblade', speed: 22, dmg: 15, hit: 'light', r: 0.45, life: 0.8 }, { spread: [-150, -105, -60, -15, 15, 60, 105, 150, 180] })],
    },
    ultimate: {
      name: 'Cyclone de Sakura', cost: 100, anim: 'summon', dur: 1.9, armor: 'full',
      cine: { text: 'CYCLONE DE SAKURA', dur: 1.25 },
      actions: [aoe(0.15, 'tornado', 0.3, 4.2, 80, 'launch', { zone: { dur: 1.4, tick: 0.15, dmg: 12 } }), aoe(0.15, 'windburst', 1.6, 4.4, 110, 'kd', { chip: 0.3, impact: '桜!!' })],
    },
  },
  garo: {
    special: {
      name: 'Avalanche', cost: 40, anim: 'throw', dur: 0.8, cancel: 0.62,
      actions: [proj(0.22, { kind: 'rock', speed: 16, dmg: 44, hit: 'kd', r: 0.7, life: 1.4, explode: { r: 1.6, dmg: 12 } }, { spread: [-16, 0, 16] })],
    },
    ultimate: {
      name: 'Montagne Vivante', cost: 100, anim: 'slam', dur: 1.9, armor: 'full',
      cine: { text: 'MONTAGNE VIVANTE', dur: 1.3 },
      actions: [...[0, 90, 180, 270].map((deg, i) => aoe(0.45, 'rockpillar', 0.2 + i * 0.1, 1.6, 40, 'launch', { offset: ring(deg, 2.2) })), aoe(0.45, 'rockblast', 1.0, 4.4, 190, 'kd', { chip: 0.3, impact: '山!!' })],
    },
  },
  yami: {
    special: {
      name: 'Crocs des ténèbres', cost: 40, anim: 'cast2', dur: 0.62, cancel: 0.5,
      actions: [proj(0.15, { kind: 'darkorb', speed: 13, dmg: 28, hit: 'heavy', r: 0.5, life: 2.2, homing: 2.5 }, { spread: [-24, 0, 24] })],
    },
    ultimate: {
      name: 'Lune de Sang', cost: 100, anim: 'iai', dur: 2.0, armor: 'full', invuln: [0, 0.5],
      cine: { text: 'LUNE DE SANG', dur: 1.3 },
      actions: [aoe(0.2, 'darkblast', 0.4, 2, 70, 'heavy'), aoe(0.2, 'darkblast', 0.75, 2.6, 80, 'heavy', { offset: [1.5, 0] }), aoe(0.2, 'darkblast', 1.15, 4, 200, 'kd', { chip: 0.3, impact: '月!!' })],
    },
  },
  akane: {
    special: {
      name: 'Pluie de braises', cost: 40, anim: 'cast', dur: 0.66, cancel: 0.52,
      actions: [proj(0.15, { kind: 'fireball', speed: 18, dmg: 30, hit: 'heavy', r: 0.42, life: 1.4, explode: { r: 1.4, dmg: 8 } }, { spread: [-18, 0, 18] })],
    },
    ultimate: {
      name: 'Couronne Solaire', cost: 100, anim: 'powerup', dur: 1.9, armor: 'full',
      cine: { text: 'COURONNE SOLAIRE', dur: 1.3 },
      actions: [...[0, 60, 120, 180, 240, 300].map((deg, i) => aoe(0.3, 'firepillar', 0.4 + i * 0.1, 1.5, 40, 'launch', { offset: ring(deg, 2.6) })), aoe(0.3, 'meteor', 1.3, 3, 150, 'kd', { chip: 0.3, impact: '陽!!' })],
    },
  },
  jin: {
    special: {
      name: 'Mille paumes', cost: 40, anim: 'rush', dur: 0.85, cancel: 0.7, lunge: [[0, 0.5, 4]],
      actions: [hit(0.08, 12, 'light', { dur: 0.5, every: 0.06, radius: 1.1, stun: 0.45, kb: 1 }), hit(0.62, 40, 'kd', { radius: 1.2 })],
    },
    ultimate: {
      name: 'Bouddha de Fer', cost: 100, anim: 'slam', dur: 1.8, armor: 'full',
      cine: { text: 'BOUDDHA DE FER', dur: 1.3 },
      actions: [{ t: 0.45, a: 'ring', maxR: 10, speed: 16, dmg: 90, type: 'launch', fxColor: '#ffd8a0' }, aoe(0.45, 'rockblast', 0.6, 4, 170, 'kd', { chip: 0.3, impact: '仏!!' })],
    },
  },
};

// --- Tenues -------------------------------------------------------------------------------------

export const COSTUME_PRICE = 400;
const CLOTH_KEYS = ['top', 'topAlt', 'arms', 'pants', 'belt', 'boots', 'accent', 'armor', 'gloves', 'emblemColor', 'blade'];

/** Deux tenues alternatives pour chacun : obscure (tons sombres, aura pourpre) et céleste (blanc et or). */
export const COSTUMES = [
  { id: 'ombre', name: 'Tenue d’ombre', tone: (c) => mix(c, '#14101c', 0.62), aura: '#b05cff' },
  { id: 'celeste', name: 'Tenue céleste', tone: (c) => mix(c, '#f4ecd8', 0.55), accent: '#e8b830', aura: '#ffe08a' },
];

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const r = Math.round(ch(pa, 16) * (1 - k) + ch(pb, 16) * k);
  const g = Math.round(ch(pa, 8) * (1 - k) + ch(pb, 8) * k);
  const bl = Math.round(ch(pa, 0) * (1 - k) + ch(pb, 0) * k);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/**
 * Skins universels (portables par tous les combattants) : couleurs de tenue et d'aura.
 * Ils ne s'achètent pas en Ryō : coffres, passe, roue, connexion, offres du jour.
 */
export const SKINS = [
  { id: 'braise', name: 'Braise', rarity: 'rare', tint: '#c2361a', accent: '#ffb03a', aura: '#ff6a1f', k: 0.55 },
  { id: 'jade', name: 'Jade', rarity: 'rare', tint: '#1f8a5a', accent: '#d8ffe8', aura: '#3dffa0', k: 0.55 },
  { id: 'sakura', name: 'Sakura', rarity: 'rare', tint: '#f08abf', accent: '#ffffff', aura: '#ff8fc8', k: 0.5 },
  { id: 'glace', name: 'Glace éternelle', rarity: 'epic', tint: '#bfe8ff', accent: '#4ac8ff', aura: '#bff4ff', k: 0.6 },
  { id: 'foudre', name: 'Foudre', rarity: 'epic', tint: '#232a4a', accent: '#ffe23a', aura: '#7fd8ff', k: 0.6 },
  { id: 'sang', name: 'Lune de sang', rarity: 'epic', tint: '#3a0610', accent: '#ff1f3d', aura: '#ff1f3d', k: 0.65 },
  { id: 'galaxie', name: 'Galaxie', rarity: 'legendary', tint: '#1a1046', accent: '#ff7af0', aura: '#8a6bff', k: 0.7 },
  { id: 'or-royal', name: 'Or royal', rarity: 'legendary', tint: '#f2d27a', accent: '#fff4c2', aura: '#ffd23f', k: 0.6 },
  { id: 'neant', name: 'Néant', rarity: 'mythic', tint: '#06060a', accent: '#ffffff', aura: '#ffffff', k: 0.8 },
  { id: 'phenix', name: 'Phénix', rarity: 'mythic', tint: '#ff4a12', accent: '#fff07a', aura: '#ffb31f', k: 0.7 },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/** Tenue d'un skin universel : teinte plus ou moins forte, accents et aura. */
function skinCostume(s) {
  return { id: s.id, name: s.name, tone: (c) => mix(c, s.tint, s.k), accent: s.accent, aura: s.aura };
}

/** Définition « habillée » d'un personnage (même identifiant, couleurs de tenue et d'aura changées). */
export function dressed(def, costumeId) {
  const c = COSTUMES.find((x) => x.id === costumeId) || (SKIN_BY_ID[costumeId] && skinCostume(SKIN_BY_ID[costumeId]));
  if (!c) return def;
  const look = { ...def.look };
  for (const k of CLOTH_KEYS) {
    if (!look[k] || look[k] === look.skin) continue;
    look[k] = c.accent && (k === 'belt' || k === 'accent' || k === 'emblemColor') ? c.accent : c.tone(look[k]);
  }
  return { ...def, look, aura: c.aura, auraAlt: def.auraAlt ? c.aura : undefined, costume: c.id };
}
