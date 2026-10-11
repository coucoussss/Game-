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

/** Ryō gagnés : la récompense pleine à la première victoire, un quart ensuite ; 25 par vague en cas d'échec. */
export function levelReward(level, won, wavesCleared, firstClear) {
  if (won) return firstClear ? level.reward : Math.round(level.reward * 0.3);
  return wavesCleared * 25;
}
