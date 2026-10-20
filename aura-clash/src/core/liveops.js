// Progression « en continu » : passe de combat saisonnier, missions, coffres de temps de jeu,
// connexion quotidienne, roue, coffres à raretés, fragments de personnages, offres du jour,
// rotation de personnages, boss du jour, tour, maîtrise et succès.
//
// Logique pure : toutes les fonctions reçoivent l'heure (`now`, en ms) et un tirage aléatoire,
// pour rester testables (scripts/test-liveops.mjs). L'état vit dans `profile.data.live`.
import { CHARACTERS, CHAR_BY_ID } from '../game/characters.js';
import { MONSTERS } from '../game/monsters.js';
import { SKINS, SKIN_BY_ID } from '../game/techniques.js';

const DAY = 86400000;
/** Lundi 5 janvier 2026 : origine des saisons et des semaines. */
const EPOCH = Date.UTC(2026, 0, 5);

// --- Calendrier ------------------------------------------------------------------------------------

/** Numéro du jour local (0 = 5 janvier 2026). */
export function dayIndex(now) {
  const off = new Date(now).getTimezoneOffset() * 60000;
  return Math.floor((now - off - EPOCH) / DAY);
}

export function weekIndex(now) {
  return Math.floor(dayIndex(now) / 7);
}

/** Millisecondes restantes avant minuit (heure locale). */
export function msToMidnight(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime() - now;
}

/** Millisecondes restantes avant lundi minuit. */
export function msToWeekEnd(now) {
  const left = 6 - (((dayIndex(now) % 7) + 7) % 7);
  return msToMidnight(now) + left * DAY;
}

/** Samedi ou dimanche : week-end de l'Aura (récompenses doublées). */
export function isWeekend(now) {
  const d = ((dayIndex(now) % 7) + 7) % 7;
  return d === 5 || d === 6;
}

/** Durée lisible : « 3 j 4 h », « 2 h 12 min », « 45 s ». */
export function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} j ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${s % 60} s`;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];

// --- Raretés, skins, titres, cadres --------------------------------------------------------------

export const RARITIES = [
  { id: 'common', name: 'Commun', color: '#b8c0cc' },
  { id: 'rare', name: 'Rare', color: '#4aa8ff' },
  { id: 'epic', name: 'Épique', color: '#b45cff' },
  { id: 'legendary', name: 'Légendaire', color: '#ffc23a' },
  { id: 'mythic', name: 'Mythique', color: '#ff3a5a' },
];
export const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));
export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);

export { SKINS, SKIN_BY_ID };

export const TITLES = [
  { id: 'eveille', name: 'L’Éveillé', rarity: 'common' },
  { id: 'poing-ki', name: 'Poing de Ki', rarity: 'rare' },
  { id: 'chasseur', name: 'Chasseur d’Oni', rarity: 'rare' },
  { id: 'tempete', name: 'Œil de la Tempête', rarity: 'epic' },
  { id: 'rayon', name: 'Maître du Rayon', rarity: 'epic' },
  { id: 'inflexible', name: 'L’Inflexible', rarity: 'epic' },
  { id: 'dragon', name: 'Cœur de Dragon', rarity: 'legendary' },
  { id: 'aube', name: 'Héraut de l’Aube', rarity: 'legendary' },
  { id: 'divin', name: 'Aura Divine', rarity: 'mythic' },
  { id: 'tour', name: 'Seigneur de la Tour', rarity: 'legendary' },
  { id: 'fidele', name: 'Fidèle de l’Aura', rarity: 'epic' },
  { id: 'chanceux', name: 'Béni par la Roue', rarity: 'epic' },
];
export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** Cadres de portrait (classe CSS frame-<id>). */
export const FRAMES = [
  { id: 'bronze', name: 'Cadre de bronze', rarity: 'common' },
  { id: 'argent', name: 'Cadre d’argent', rarity: 'rare' },
  { id: 'or', name: 'Cadre d’or', rarity: 'epic' },
  { id: 'flamme', name: 'Cadre de flammes', rarity: 'legendary' },
  { id: 'prisme', name: 'Cadre prismatique', rarity: 'mythic' },
];
export const FRAME_BY_ID = Object.fromEntries(FRAMES.map((f) => [f.id, f]));

/** Personnages à débloquer (payants) : cibles des fragments. */
export const PAID = CHARACTERS.filter((c) => c.price && !c.monster).map((c) => c.id);
export const FRAGS_TO_UNLOCK = 100;
/** Fragments d'un personnage déjà possédé : convertis en Ryō. */
export const FRAG_TO_RYO = 8;

// --- Saisons ---------------------------------------------------------------------------------------

export const SEASON_DAYS = 35;
export const PASS_TIERS = 60;
export const TIER_XP = 1500;
/** Au-delà du palier 60 : un coffre bonus tous les BONUS_XP. */
export const BONUS_XP = 5000;
/** Pubs qui débloquent le « Pass Or » (toute la voie premium). */
export const GOLD_ADS = 20;

const SEASON_THEMES = [
  { name: 'L’Éveil du Dragon', color: '#ff6a2a', skin: 'phenix', title: 'dragon', frame: 'flamme' },
  { name: 'Nuit des Oni', color: '#b45cff', skin: 'sang', title: 'chasseur', frame: 'or' },
  { name: 'Tempête de Jade', color: '#3dffa0', skin: 'jade', title: 'tempete', frame: 'prisme' },
  { name: 'Lune de Givre', color: '#7fd8ff', skin: 'glace', title: 'inflexible', frame: 'argent' },
  { name: 'Couronne d’Or', color: '#ffd23f', skin: 'or-royal', title: 'aube', frame: 'flamme' },
  { name: 'Galaxie Brisée', color: '#8a6bff', skin: 'galaxie', title: 'divin', frame: 'prisme' },
];

export function seasonIndex(now) {
  return Math.max(0, Math.floor(dayIndex(now) / SEASON_DAYS));
}

export function seasonInfo(now) {
  const i = seasonIndex(now);
  const th = SEASON_THEMES[i % SEASON_THEMES.length];
  const endDay = (i + 1) * SEASON_DAYS;
  const ends = msToMidnight(now) + (endDay - dayIndex(now) - 1) * DAY;
  return {
    index: i, num: i + 1, ...th,
    char: PAID[i % PAID.length],
    endsIn: ends,
    finalWeek: ends <= 7 * DAY,
  };
}

/**
 * Récompense d'un palier du passe. track : 'free' | 'premium'.
 * Réparties pour qu'il y ait toujours quelque chose d'excitant tous les 2 ou 3 paliers.
 */
export function tierReward(season, n, track) {
  if (track === 'free') {
    if (n === PASS_TIERS) return { t: 'chest', r: 'legendary' };
    if (n % 10 === 0) return { t: 'chest', r: 'epic' };
    if (n % 5 === 0) return { t: 'chest', r: 'rare' };
    if (n === 15) return { t: 'title', id: 'eveille' };
    if (n % 3 === 0) return { t: 'frag', id: season.char, n: 10 };
    return { t: 'ryo', n: 100 + 5 * n };
  }
  if (n === 30) return { t: 'char', id: season.char };
  if (n === PASS_TIERS) return { t: 'skin', id: season.skin };
  if (n === 50) return { t: 'title', id: season.title };
  if (n === 45) return { t: 'frame', id: season.frame };
  const skins = ['braise', 'sakura', 'foudre', 'glace'];
  if (n === 10 || n === 20 || n === 40 || n === 55) return { t: 'skin', id: skins[[10, 20, 40, 55].indexOf(n)] };
  if (n % 5 === 0) return { t: 'chest', r: n >= 35 ? 'legendary' : 'epic' };
  if (n % 2 === 0) return { t: 'frag', id: season.char, n: 15 };
  return { t: 'ryo', n: 250 + 10 * n };
}

export function passTier(xp) {
  return Math.min(PASS_TIERS, Math.floor(Math.max(0, xp) / TIER_XP));
}

/** Coffres bonus gagnés après le dernier palier. */
export function bonusChests(xp) {
  return Math.max(0, Math.floor((xp - PASS_TIERS * TIER_XP) / BONUS_XP));
}

// --- Missions --------------------------------------------------------------------------------------

/**
 * Missions : [identifiant, texte avec {n}, statistique suivie, objectif quotidien].
 * La progression = valeur de la statistique − valeur au moment où la mission a été tirée.
 * `{c}` est remplacé par le nom d'un personnage (statistique charFights.<id>).
 */
const MISSION_POOL = [
  ['fights', 'Joue {n} combats', 'fights', 3],
  ['wins', 'Gagne {n} combats', 'wins', 2],
  ['parries', 'Réussis {n} parades parfaites', 'parries', 3],
  ['counters', 'Réussis {n} ripostes', 'counters', 2],
  ['hits', 'Touche {n} fois tes adversaires', 'hits', 60],
  ['kos', 'Mets {n} adversaires K.-O.', 'kos', 4],
  ['dmg', 'Inflige {n} dégâts', 'dmg', 2500],
  ['pursuits', 'Réussis {n} poursuites aériennes', 'pursuits', 2],
  ['slams', 'Rabats {n} adversaires au sol', 'slams', 2],
  ['ranked', 'Joue {n} combats classés', 'modes.ranked', 2],
  ['waves', 'Joue {n} parties du mode Vagues', 'modes.waves', 2],
  ['char', 'Joue {n} combats avec {c}', 'charFights', 2],
  ['perfects', 'Gagne {n} manche sans perdre de vie', 'perfects', 1],
  ['tower', 'Gravis {n} étages de la Tour', 'towerWins', 2],
];

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 5;
export const DAILY_MISSION_XP = 600;
export const WEEKLY_MISSION_XP = 2500;
export const MISSION_REROLLS = 2;

export function statValue(stats, path) {
  let v = stats || {};
  for (const k of path.split('.')) v = v && typeof v === 'object' ? v[k] : 0;
  return Number.isFinite(v) ? v : 0;
}

function makeMission(def, kind, stats, rnd, owned) {
  const [id, , stat, goal] = def;
  const mult = kind === 'weekly' ? 6 : 1;
  const m = { id, kind, goal: goal * mult, claimed: false };
  if (id === 'char') {
    m.char = pick(owned.length ? owned : ['kael'], rnd);
    m.stat = `charFights.${m.char}`;
  } else m.stat = stat;
  m.base = statValue(stats, m.stat);
  return m;
}

export function drawMissions(kind, count, stats, rnd, owned, exclude = []) {
  const pool = MISSION_POOL.filter((d) => !exclude.includes(d[0]));
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(rnd() * pool.length) % pool.length;
    out.push(makeMission(pool.splice(i, 1)[0], kind, stats, rnd, owned));
  }
  return out;
}

export function missionText(m) {
  const def = MISSION_POOL.find((d) => d[0] === m.id);
  const c = m.char && CHAR_BY_ID[m.char] ? CHAR_BY_ID[m.char].name : '';
  return (def ? def[1] : m.id).replace('{n}', m.goal).replace('{c}', c);
}

export function missionProgress(m, stats) {
  const v = Math.max(0, statValue(stats, m.stat) - m.base);
  return { value: Math.min(m.goal, v), goal: m.goal, done: v >= m.goal };
}

export function missionReward(m) {
  return m.kind === 'weekly'
    ? [{ t: 'xp', n: WEEKLY_MISSION_XP }, { t: 'chest', r: 'rare' }]
    : [{ t: 'xp', n: DAILY_MISSION_XP }, { t: 'ryo', n: 100 }];
}

// --- Coffres de temps de jeu, connexion, roue ---------------------------------------------------------

/** Paliers de temps de jeu du jour (minutes) et coffre gagné. */
export const PLAY_CHESTS = [
  [5, 'common'], [15, 'common'], [30, 'rare'], [60, 'epic'], [120, 'legendary'],
];

export const LOGIN_DAYS = 28;

export function loginReward(day) {
  if (day === LOGIN_DAYS) return { t: 'frag', id: null, n: FRAGS_TO_UNLOCK };
  if (day % 7 === 0) return { t: 'chest', r: day >= 21 ? 'legendary' : 'epic' };
  if (day === 10 || day === 24) return { t: 'skin', id: day === 10 ? 'sakura' : 'galaxie' };
  if (day === 17) return { t: 'title', id: 'fidele' };
  if (day % 3 === 0) return { t: 'frag', id: null, n: 15 };
  if (day % 2 === 0) return { t: 'xp', n: 800 };
  return { t: 'ryo', n: 150 + 25 * day };
}

/** Segments de la roue (poids = chance relative). */
export const WHEEL = [
  { reward: { t: 'ryo', n: 200 }, w: 26, color: '#3a4a6a' },
  { reward: { t: 'xp', n: 800 }, w: 20, color: '#2a6a5a' },
  { reward: { t: 'ryo', n: 500 }, w: 15, color: '#3a4a6a' },
  { reward: { t: 'frag', id: null, n: 15 }, w: 14, color: '#5a3a7a' },
  { reward: { t: 'chest', r: 'rare' }, w: 11, color: '#1f4f8a' },
  { reward: { t: 'chest', r: 'epic' }, w: 7, color: '#6a2a8a' },
  { reward: { t: 'skin', id: null }, w: 5, color: '#8a6a1a' },
  { reward: { t: 'ryo', n: 3000, jackpot: true }, w: 2, color: '#a8231f' },
];
export const WHEEL_AD_SPINS = 3;

export function spinWheel(rnd) {
  const total = WHEEL.reduce((n, s) => n + s.w, 0);
  let r = rnd() * total;
  for (let i = 0; i < WHEEL.length; i++) {
    r -= WHEEL[i].w;
    if (r < 0) return i;
  }
  return 0;
}

// --- Coffres ---------------------------------------------------------------------------------------------

/** Contenu d'un coffre selon sa rareté (les chances sont affichées dans le jeu). */
export const CHESTS = {
  common: { cards: 2, ryo: [80, 200], frag: [3, 6], xp: [200, 400], skin: 0, title: 0, frame: 0.02 },
  rare: { cards: 3, ryo: [150, 400], frag: [6, 12], xp: [400, 700], skin: 0.04, title: 0.03, frame: 0.04 },
  epic: { cards: 4, ryo: [300, 700], frag: [10, 20], xp: [600, 1000], skin: 0.12, title: 0.08, frame: 0.06 },
  legendary: { cards: 5, ryo: [600, 1300], frag: [18, 35], xp: [900, 1500], skin: 0.35, title: 0.15, frame: 0.1 },
  mythic: { cards: 6, ryo: [1200, 2500], frag: [30, 60], xp: [1500, 2500], skin: 0.75, title: 0.3, frame: 0.2 },
};

const between = ([a, b], rnd) => Math.round(a + rnd() * (b - a));

/** Les cartes d'un coffre (récompenses concrètes, la plus rare en dernier). */
export function rollChest(rarity, rnd) {
  const c = CHESTS[rarity] || CHESTS.common;
  const cards = [];
  let special = false;
  for (let i = 0; i < c.cards; i++) {
    const r = rnd();
    if (!special && r < c.skin) { cards.push({ t: 'skin', id: null, minRarity: rarity }); special = true; continue; }
    if (!special && r < c.skin + c.title) { cards.push({ t: 'title', id: null, minRarity: rarity }); special = true; continue; }
    if (!special && r < c.skin + c.title + c.frame) { cards.push({ t: 'frame', id: null, minRarity: rarity }); special = true; continue; }
    const k = i % 3;
    if (k === 0) cards.push({ t: 'ryo', n: between(c.ryo, rnd) });
    else if (k === 1) cards.push({ t: 'frag', id: null, n: between(c.frag, rnd) });
    else cards.push({ t: 'xp', n: between(c.xp, rnd) });
  }
  return cards;
}

/** Chances lisibles d'un coffre (pour l'affichage obligatoire des taux). */
export function chestOdds(rarity) {
  const c = CHESTS[rarity];
  const one = (p) => 1 - (1 - p) ** c.cards;
  return { skin: one(c.skin), title: one(c.title), frame: one(c.frame) };
}

// --- Offres du jour, rotation, boss, tour ---------------------------------------------------------------

/** Offres de la boutique du jour (identiques pour tout le monde ce jour-là). */
export function dailyOffers(now) {
  const rnd = seeded(dayIndex(now) * 7919 + 17);
  const skin = pick(SKINS.filter((s) => s.rarity !== 'mythic'), rnd);
  const skinPrice = { rare: 1500, epic: 2500, legendary: 4000 }[skin.rarity];
  const char = pick(PAID, rnd);
  return [
    { id: 'free', name: 'Cadeau du jour', reward: { t: 'chest', r: rnd() < 0.25 ? 'epic' : 'rare' }, price: 0, ad: true },
    { id: 'skin', name: `Skin ${skin.name}`, reward: { t: 'skin', id: skin.id }, price: skinPrice, was: Math.round(skinPrice * 1.6), tag: '−40 %' },
    { id: 'frag', name: `30 fragments de ${CHAR_BY_ID[char].name}`, reward: { t: 'frag', id: char, n: 30 }, price: 900, was: 1500, tag: 'POPULAIRE' },
    { id: 'chest', name: 'Coffre épique', reward: { t: 'chest', r: 'epic' }, price: 1200, was: 2000, tag: '−40 %' },
    { id: 'legend', name: 'Coffre légendaire', reward: { t: 'chest', r: 'legendary' }, price: 3500, was: 6000, tag: 'MEILLEURE OFFRE' },
  ];
}

/** Trois personnages payants jouables gratuitement cette semaine. */
export function weeklyRotation(now) {
  const w = weekIndex(now);
  const n = PAID.length;
  if (!n) return [];
  const start = (w * 3) % n;
  return [0, 1, 2].map((k) => PAID[(start + k) % n]).filter((v, i, a) => a.indexOf(v) === i);
}

export const BOSSES = MONSTERS.filter((m) => m.boss && !m.final).map((m) => m.id);

export function dailyBoss(now) {
  const d = dayIndex(now);
  return {
    id: BOSSES[((d % BOSSES.length) + BOSSES.length) % BOSSES.length],
    mods: { dmg: 1.15, hp: 1.35, speed: 1, energy: 1.1, cd: 0.95 },
    reward: [{ t: 'ryo', n: 800 }, { t: 'chest', r: 'epic' }, { t: 'xp', n: 1000 }],
  };
}

/** Étage n de la Tour : adversaire, difficulté et récompense. */
export function towerFloor(n) {
  const rnd = seeded(n * 104729 + 3);
  const pool = CHARACTERS.filter((c) => !c.monster).map((c) => c.id);
  const boss = n % 10 === 0;
  const k = 1 + 0.05 * (n - 1);
  return {
    n,
    foe: boss ? BOSSES[(n / 10 - 1) % BOSSES.length] : pick(pool, rnd),
    level: n <= 3 ? 'easy' : n <= 9 ? 'normal' : 'hard',
    mods: { dmg: Math.min(2.2, k), hp: Math.min(2.6, k * (boss ? 1.2 : 1)), speed: 1, energy: 1, cd: 1 },
    boss,
    reward: [
      { t: 'ryo', n: 60 + 15 * n },
      { t: 'xp', n: 150 + 20 * n },
      ...(n % 5 === 0 ? [{ t: 'chest', r: n >= 40 ? 'mythic' : n >= 20 ? 'legendary' : n % 10 === 0 ? 'epic' : 'rare' }] : []),
    ],
  };
}

// --- Maîtrise, niveau de compte, succès -----------------------------------------------------------------

/** Victoires avec un personnage pour chaque étoile de maîtrise. */
export const MASTERY = [5, 15, 30, 60, 100];

export function masteryOf(stats, charId) {
  const w = statValue(stats, `charWins.${charId}`);
  const stars = MASTERY.filter((t) => w >= t).length;
  return { wins: w, stars, next: MASTERY[stars] || null };
}

export const BADGES = [
  { min: 1, id: 'bronze', name: 'Bronze' },
  { min: 10, id: 'argent', name: 'Argent' },
  { min: 25, id: 'or', name: 'Or' },
  { min: 50, id: 'platine', name: 'Platine' },
  { min: 75, id: 'diamant', name: 'Diamant' },
];

export function badgeOf(level) {
  let b = BADGES[0];
  for (const x of BADGES) if (level >= x.min) b = x;
  return b;
}

/**
 * Succès : paliers générés à partir des statistiques.
 * { id, name, desc, stat, goal, reward }
 */
export const ACHIEVEMENTS = (() => {
  const out = [];
  const tiers = (key, stat, name, desc, goals, base) => goals.forEach((g, i) => out.push({
    id: `${key}-${g}`, name: `${name} ${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}`, desc: desc.replace('{n}', g), stat, goal: g,
    reward: i >= 4 ? { t: 'chest', r: 'legendary' } : i >= 2 ? { t: 'chest', r: 'epic' } : { t: 'ryo', n: base * (i + 1) },
  }));
  tiers('fights', 'fights', 'Combattant', 'Joue {n} combats.', [10, 50, 150, 400, 1000], 150);
  tiers('wins', 'wins', 'Conquérant', 'Gagne {n} combats.', [10, 50, 100, 250, 500], 200);
  tiers('kos', 'kos', 'Briseur', 'Mets {n} adversaires K.-O.', [25, 100, 300, 800, 2000], 150);
  tiers('hits', 'hits', 'Déluge de coups', 'Touche {n} fois.', [500, 2500, 10000, 30000, 80000], 120);
  tiers('dmg', 'dmg', 'Force brute', 'Inflige {n} dégâts.', [10000, 50000, 200000, 600000, 1500000], 150);
  tiers('parries', 'parries', 'Mur d’acier', 'Réussis {n} parades parfaites.', [25, 100, 300, 800], 200);
  tiers('counters', 'counters', 'Contre-attaque', 'Réussis {n} ripostes.', [25, 100, 300, 800], 200);
  tiers('tower', 'towerBest', 'Grimpeur', 'Atteins l’étage {n} de la Tour.', [5, 10, 20, 35, 50], 250);
  tiers('bosses', 'bossOfDay', 'Tueur de géants', 'Vaincs {n} boss du jour.', [1, 5, 15, 40], 300);
  tiers('chests', 'chestsOpened', 'Pilleur', 'Ouvre {n} coffres.', [10, 50, 150, 400], 150);
  tiers('login', 'loginDays', 'Assidu', 'Connecte-toi {n} jours.', [3, 7, 14, 28, 60], 150);
  tiers('tiers', 'passTiersTotal', 'Saisonnier', 'Atteins {n} paliers de passe au total.', [10, 30, 60, 120, 240], 200);
  for (const c of CHARACTERS.filter((x) => !x.monster)) {
    out.push({ id: `master-${c.id}`, name: `Maître : ${c.name}`, desc: `Gagne ${MASTERY[4]} combats avec ${c.name}.`, stat: `charWins.${c.id}`, goal: MASTERY[4], reward: { t: 'chest', r: 'legendary' } });
  }
  return out;
})();

// --- État ----------------------------------------------------------------------------------------------

export function newLive() {
  return {
    season: -1, passXp: 0, freeClaimed: [], premClaimed: [], gold: false, passAds: 0, bonusClaimed: 0,
    day: -1, dayPlay: 0, playChests: [], rerolls: 0, daily: [], week: -1, weekly: [],
    login: { last: -99, streak: 0, claimedDay: -1, lost: 0, total: 0 },
    wheel: { day: -1, free: false, ads: 0 },
    frags: {}, skins: [], titles: [], frames: [], title: '', frame: '', skinFor: {},
    boostUntil: 0, trials: {}, shopDay: -1, shopBought: [], welcome: false,
    boss: { day: -1, tries: 0, adTry: false, won: false },
    tower: { floor: 1, best: 0 },
    firstWinDay: -1, ach: [], seenSeason: -1,
  };
}

/** Répare un état chargé (sauvegarde ancienne ou modifiée). */
export function sanitizeLive(s) {
  const base = newLive();
  if (!s || typeof s !== 'object') return base;
  const out = { ...base, ...s };
  for (const k of ['freeClaimed', 'premClaimed', 'playChests', 'daily', 'weekly', 'skins', 'titles', 'frames', 'shopBought', 'ach']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  for (const k of ['frags', 'trials', 'skinFor']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  for (const k of ['login', 'wheel', 'boss', 'tower']) out[k] = { ...base[k], ...(s[k] && typeof s[k] === 'object' ? s[k] : {}) };
  for (const k of ['passXp', 'dayPlay', 'passAds', 'bonusClaimed', 'boostUntil', 'rerolls']) if (!Number.isFinite(out[k]) || out[k] < 0) out[k] = 0;
  out.skins = out.skins.filter((id) => SKIN_BY_ID[id]);
  out.titles = out.titles.filter((id) => TITLE_BY_ID[id]);
  out.frames = out.frames.filter((id) => FRAME_BY_ID[id]);
  if (!SKIN_BY_ID[out.title] && !TITLE_BY_ID[out.title]) out.title = '';
  if (!FRAME_BY_ID[out.frame]) out.frame = '';
  out.tower.floor = Math.max(1, Math.floor(out.tower.floor) || 1);
  return out;
}

/**
 * Met l'état à jour pour l'heure donnée : nouvelle saison, nouveau jour, nouvelle semaine.
 * `stats` : statistiques du profil ; `owned` : personnages jouables (missions « avec X »).
 */
export function refresh(live, now, stats, owned, rnd = Math.random) {
  const season = seasonIndex(now);
  if (live.season !== season) {
    live.season = season;
    live.passXp = 0;
    live.freeClaimed = [];
    live.premClaimed = [];
    live.gold = false;
    live.passAds = 0;
    live.bonusClaimed = 0;
  }
  const day = dayIndex(now);
  if (live.day !== day) {
    live.day = day;
    live.dayPlay = 0;
    live.playChests = [];
    live.rerolls = 0;
    live.daily = drawMissions('daily', DAILY_COUNT, stats, rnd, owned);
  }
  const week = weekIndex(now);
  if (live.week !== week) {
    live.week = week;
    live.weekly = drawMissions('weekly', WEEKLY_COUNT, stats, rnd, owned);
  }
  // Essais de personnages : expirent au bout de 3 jours
  for (const [id, t] of Object.entries(live.trials)) if (!t || t.until < now || t.fights <= 0) delete live.trials[id];
  return live;
}

/** Changer une mission (une pub) : une autre de la même famille. */
export function rerollMission(live, kind, i, stats, owned, rnd) {
  const list = kind === 'weekly' ? live.weekly : live.daily;
  const m = list[i];
  if (!m || m.claimed) return false;
  const [fresh] = drawMissions(kind, 1, stats, rnd, owned, list.map((x) => x.id));
  if (!fresh) return false;
  list[i] = fresh;
  live.rerolls += 1;
  return true;
}

// --- Connexion quotidienne --------------------------------------------------------------------------

/**
 * État de la connexion du jour : { day (1..28) à réclamer, claimable, broken (série perdue
 * récupérable par une pub : la veille a été manquée) }.
 */
export function loginState(live, now) {
  const d = dayIndex(now);
  const L = live.login;
  if (L.claimedDay === d) return { day: L.streak, claimable: false, broken: 0 };
  const gap = d - L.last;
  const continues = gap === 1;
  const broken = gap === 2 && L.streak > 0 ? L.streak : 0;
  const next = continues ? (L.streak % LOGIN_DAYS) + 1 : 1;
  return { day: next, claimable: true, broken };
}

/** Réclame la récompense du jour ; `rescue` : la série perdue est sauvée (après une pub). */
export function claimLogin(live, now, rescue = false) {
  const st = loginState(live, now);
  if (!st.claimable) return null;
  const day = rescue && st.broken ? (st.broken % LOGIN_DAYS) + 1 : st.day;
  live.login = { ...live.login, last: dayIndex(now), streak: day, claimedDay: dayIndex(now), total: (live.login.total || 0) + 1 };
  return { day, reward: loginReward(day) };
}

// --- Fin de combat -------------------------------------------------------------------------------------

/** XP de passe d'un combat. */
export const PASS_XP = { win: 150, draw: 90, loss: 70, firstWin: 400, perWave: 15 };

/**
 * XP de passe gagnée en fin de combat (avant boosts) et bonus appliqués.
 * Renvoie { xp, bonuses: [libellés], firstWin }.
 */
export function matchPassXp(live, now, result, waves = 0) {
  let xp = PASS_XP[result] || 0;
  xp += PASS_XP.perWave * Math.max(0, waves);
  const bonuses = [];
  let firstWin = false;
  if (result === 'win' && live.firstWinDay !== dayIndex(now)) {
    firstWin = true;
    live.firstWinDay = dayIndex(now);
    xp += PASS_XP.firstWin;
    bonuses.push('Première victoire du jour');
  }
  let mult = 1;
  if (isWeekend(now)) { mult *= 2; bonuses.push('Week-end ×2'); }
  if (live.boostUntil > now) { mult *= 2; bonuses.push('Boost ×2'); }
  if (seasonInfo(now).finalWeek) { mult *= 1.5; bonuses.push('Dernière semaine ×1,5'); }
  return { xp: Math.round(xp * mult), bonuses, firstWin };
}

// --- Notifications (points rouges) ---------------------------------------------------------------------

export function pendingCounts(live, now, stats) {
  const tier = passTier(live.passXp);
  let pass = 0;
  for (let n = 1; n <= tier; n++) {
    if (!live.freeClaimed.includes(n)) pass++;
    if (live.gold && !live.premClaimed.includes(n)) pass++;
  }
  pass += Math.max(0, bonusChests(live.passXp) - live.bonusClaimed);
  const missions = [...live.daily, ...live.weekly].filter((m) => !m.claimed && missionProgress(m, stats).done).length;
  const chests = PLAY_CHESTS.filter(([min], i) => live.dayPlay >= min * 60 && !live.playChests.includes(i)).length;
  const login = loginState(live, now).claimable ? 1 : 0;
  const wheel = live.wheel.day !== dayIndex(now) || !live.wheel.free ? 1 : 0;
  const ach = ACHIEVEMENTS.filter((a) => !live.ach.includes(a.id) && statValue(stats, a.stat) >= a.goal).length;
  return { pass, missions, chests, login, wheel, ach, total: pass + missions + chests + login + wheel + ach };
}
