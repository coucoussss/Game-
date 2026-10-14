// Mode Vagues : 30 niveaux, chacun composé de plusieurs vagues de fléaux, de démons et de monstres.
// Tout est calculé ici, sans hasard caché : un niveau donné est toujours composé de la même façon
// (générateur pseudo-aléatoire initialisé par le numéro du niveau). Logique pure, testable sous Node.
import { MONSTERS } from './monsters.js';

export const WAVE_LEVELS = 30;
export const MAX_ON_FIELD = 4; // ennemis présents en même temps au plus
export const WAVE_HEAL = 0.35; // part de la vie rendue entre deux vagues

/** Régions traversées, par tranche de 5 niveaux (le dernier niveau de chaque tranche a un boss). */
export const REGIONS = [
  { name: 'Lisière maudite', arena: 'cliffs', boss: 'roi-goule' },
  { name: 'Temple profané', arena: 'temple', boss: 'shogun-oni' },
  { name: 'Cité des ombres', arena: 'neon', boss: 'imperatrice' },
  { name: 'Glacier des âmes', arena: 'glacier', boss: 'dragon-noir' },
  { name: 'Fournaise infernale', arena: 'volcano', boss: 'titan' },
  { name: 'Cœur de l’Éclipse', arena: 'temple', boss: 'roi-fleau' },
];

const BY_TIER = [1, 2, 3].map((t) => MONSTERS.filter((m) => m.tier === t && !m.boss).map((m) => m.id));
const TIER_COST = { 1: 1, 2: 2.2, 3: 3.5, 4: 5 };
// Énergie gagnée : les fléaux mineurs n'utilisent presque jamais leurs pouvoirs, les boss sans cesse
const TIER_ENERGY = { 1: 0.35, 2: 0.7, 3: 1, 4: 1.15 };

function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const regionOf = (n) => REGIONS[Math.min(REGIONS.length - 1, Math.floor((n - 1) / 5))];
export const isBossLevel = (n) => n % 5 === 0;
/** Nombre de vagues d'un niveau : 3 au début, une de plus tous les 4 niveaux, 10 au niveau 29. */
export const waveCount = (n) => Math.min(10, 3 + Math.floor((n - 1) / 4));

/** Rangs qu'un niveau peut aligner. */
function tiersFor(n) {
  const t = [1];
  if (n >= 4) t.push(2);
  if (n >= 11) t.push(3);
  return t;
}

/** Multiplicateurs de puissance d'un ennemi selon le niveau. */
function modsFor(n, tier, boss = false) {
  const k = n - 1;
  return {
    hp: boss ? 1 + 0.012 * k : 1 + 0.022 * k,
    dmg: boss ? 1 + 0.01 * k : 1 + 0.014 * k,
    speed: 1 + 0.004 * k,
    energy: TIER_ENERGY[tier] * (1 + 0.01 * k),
  };
}

function aiLevel(n, tier) {
  if (tier === 4) return n >= 15 ? 'hard' : 'normal';
  if (tier >= 2) return 'normal';
  return n >= 20 ? 'normal' : 'easy';
}

const entry = (n, id, tier, extra = {}) => ({
  charId: id, tier, level: aiLevel(n, tier), mods: modsFor(n, tier, tier === 4), ...extra,
});

/**
 * Composition d'un niveau.
 * Renvoie { n, region, arena, boss (id ou null), waves: [[{ charId, tier, level, mods, elite? }]], reward }.
 */
export function buildLevel(n) {
  const r = rng(n * 97 + 13);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const region = regionOf(n);
  const total = waveCount(n);
  const tiers = tiersFor(n);
  const waves = [];
  for (let w = 0; w < total; w++) {
    const last = w === total - 1;
    const wave = [];
    let budget = 1 + n * 0.14 + w * 0.4;
    if (last && isBossLevel(n)) {
      // Vague du boss : le boss et une escorte qui grossit avec le niveau
      wave.push(entry(n, region.boss, 4, { boss: true }));
      budget = Math.max(0, n * 0.12 - 0.6);
    } else if (last && n >= 16) {
      // Dernière vague : un ancien boss revient, affaibli, en tant qu'élite
      const old = REGIONS[Math.floor(r() * Math.min(REGIONS.length - 1, Math.floor((n - 1) / 5)))].boss;
      const e = entry(n, old, 4, { elite: true });
      e.mods.hp *= 0.55;
      e.mods.dmg *= 0.85;
      wave.push(e);
      budget -= TIER_COST[4];
    }
    // On dépense le budget, en préférant les rangs élevés quand on peut se les offrir
    while (wave.length < MAX_ON_FIELD) {
      const options = tiers.filter((t) => TIER_COST[t] <= budget + 1e-9);
      if (!options.length) break;
      // Les premières vagues d'un rang tout juste débloqué restent rares
      const weights = options.map((t) => (t === tiers[tiers.length - 1] && tiers.length > 1 && w < total / 3 ? 0.4 : t ** 1.4));
      let x = r() * weights.reduce((s, v) => s + v, 0);
      let t = options[0];
      for (let i = 0; i < options.length; i++) { x -= weights[i]; if (x <= 0) { t = options[i]; break; } }
      wave.push(entry(n, pick(BY_TIER[t - 1]), t));
      budget -= TIER_COST[t];
    }
    if (!wave.length) wave.push(entry(n, pick(BY_TIER[0]), 1));
    waves.push(wave);
  }
  return {
    n,
    region: region.name,
    arena: region.arena,
    boss: isBossLevel(n) ? region.boss : null,
    waves,
    reward: 100 + 30 * n + (isBossLevel(n) ? 250 : 0),
  };
}

// --- Difficulté ------------------------------------------------------------------------------

/** Niveaux de difficulté : multiplicateurs appliqués aux ennemis, et aux récompenses. */
export const DIFFICULTIES = {
  facile: { label: 'Facile', hp: 0.75, dmg: 0.7, reward: 0.7, ai: -1 },
  normal: { label: 'Normal', hp: 1, dmg: 1, reward: 1, ai: 0 },
  cauchemar: { label: 'Cauchemar', hp: 1.35, dmg: 1.3, reward: 1.6, ai: 1 },
};
const AI_ORDER = ['easy', 'normal', 'hard'];

/** Applique la difficulté à une entrée d'ennemi (copie). */
export function withDifficulty(e, diffId) {
  const d = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
  const lv = AI_ORDER[Math.max(0, Math.min(2, AI_ORDER.indexOf(e.level) + d.ai))];
  return { ...e, level: lv, mods: { ...e.mods, hp: e.mods.hp * d.hp, dmg: e.mods.dmg * d.dmg } };
}

// --- Mode Infini ------------------------------------------------------------------------------

const BOSS_CYCLE = REGIONS.map((r) => r.boss);

/**
 * Vague `k` (0, 1, 2…) du mode Infini : la difficulté monte sans fin ; un boss toutes les
 * 10 vagues (ils reviennent dans l'ordre, de plus en plus forts).
 */
export function endlessWave(k) {
  const n = Math.min(60, 8 + k * 0.9); // « niveau » équivalent
  const r = rng(9001 + k * 31);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const tiers = tiersFor(Math.floor(n));
  const wave = [];
  let budget = 1.5 + n * 0.14 + (k % 10) * 0.25;
  if ((k + 1) % 10 === 0) {
    const id = BOSS_CYCLE[Math.floor(k / 10) % BOSS_CYCLE.length];
    wave.push(entry(Math.floor(n), id, 4, { boss: true }));
    budget = Math.min(4, n * 0.08);
  }
  while (wave.length < MAX_ON_FIELD) {
    const options = tiers.filter((t) => TIER_COST[t] <= budget + 1e-9);
    if (!options.length) break;
    const t = options[Math.floor(r() * options.length)];
    wave.push(entry(Math.floor(n), pick(BY_TIER[t - 1]), t));
    budget -= TIER_COST[t];
  }
  if (!wave.length) wave.push(entry(Math.floor(n), pick(BY_TIER[0]), 1));
  return wave;
}

/** Ryō du mode Infini : 35 par vague repoussée, plus 150 par boss vaincu. */
export function endlessReward(wavesCleared) {
  return wavesCleared * 35 + Math.floor(wavesCleared / 10) * 150;
}

// --- Bénédictions (choix entre deux vagues) --------------------------------------------------

/** [identifiant, nom, description, icône] — chaque bénédiction peut être prise plusieurs fois. */
export const BLESSINGS = [
  ['force', 'Force du dragon', '+20 % de dégâts', '力'],
  ['vitalite', 'Cœur de pierre', '+25 % de vie maximale (et soin)', '命'],
  ['celerite', 'Pas du vent', '+12 % de vitesse', '風'],
  ['ki', 'Source de ki', '+40 % d’énergie gagnée, +50 d’énergie', '気'],
  ['maitrise', 'Maîtrise', '−20 % de temps de recharge', '技'],
  ['vampire', 'Soif de sang', 'Tes coups te rendent 8 % des dégâts', '血'],
  ['brasier', 'Poings de braise', '+6 dégâts de feu à chaque coup', '炎'],
  ['explosif', 'Chaîne d’explosions', 'Les ennemis que tu abats explosent', '爆'],
  ['agile', 'Ombre fugace', 'Esquive deux fois plus fréquente', '影'],
  ['bouclier', 'Bouclier spirituel', 'Chaque vague commence avec 120 de bouclier', '盾'],
  ['colere', 'Colère du survivant', '+40 % de dégâts sous 35 % de vie', '怒'],
  ['parade', 'Œil du maître', 'Fenêtre de parade parfaite doublée', '見'],
];

/** Trois bénédictions au hasard, différentes. */
export function blessingChoices(rand = Math.random) {
  const pool = BLESSINGS.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** Ryō gagnés : la récompense pleine à la première victoire, un quart ensuite ; 25 par vague en cas d'échec. */
export function levelReward(level, won, wavesCleared, firstClear) {
  if (won) return firstClear ? level.reward : Math.round(level.reward * 0.3);
  return wavesCleared * 25;
}
