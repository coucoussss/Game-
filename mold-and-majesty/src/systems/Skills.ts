import type { GameData } from '../data';
import type { BonusKey, SkillDef, SkillsDef } from '../data/types';
import { BONUS_KEYS } from '../data/types';

export type Bonuses = Record<BonusKey, number>;

/** Produit des effets des compétences possédées (1 = aucun effet). */
export function computeBonuses(owned: Iterable<string>, defs: SkillsDef): Bonuses {
  const bonuses = Object.fromEntries(BONUS_KEYS.map((k) => [k, 1])) as Bonuses;
  const byId = new Map(defs.skills.map((s) => [s.id, s]));
  for (const id of owned) {
    const skill = byId.get(id);
    if (!skill) continue;
    for (const [key, factor] of Object.entries(skill.effects) as [BonusKey, number][]) bonuses[key] *= factor;
  }
  return bonuses;
}

export type UnlockStatus = 'owned' | 'available' | 'locked' | 'too-expensive';

/** Une compétence peut-elle être achetée ? (prérequis possédés, mémoire suffisante) */
export function unlockStatus(skill: SkillDef, owned: ReadonlySet<string>, memory: number): UnlockStatus {
  if (owned.has(skill.id)) return 'owned';
  if (!skill.requires.every((id) => owned.has(id))) return 'locked';
  return memory >= skill.cost ? 'available' : 'too-expensive';
}

/**
 * Données effectives : les bonus s'appliquent aux paramètres des JSON, sur une copie.
 * Les systèmes n'ont ainsi pas besoin de connaître les compétences.
 */
export function applyBonuses(base: GameData, b: Bonuses): GameData {
  const network = structuredClone(base.network);
  for (const t of Object.values(network.thickness)) {
    t.growthCost *= b.growthCost;
    t.growthMinerals *= b.growthCost;
    t.upkeep.sugar *= b.upkeep;
    t.upkeep.water *= b.upkeep;
  }
  network.fruiting.rate *= b.fruiting;

  const soil = { ...base.soil, waterRate: base.soil.waterRate * b.waterAbsorption, mineralRate: base.soil.mineralRate * b.mineralRate };

  const seasons = structuredClone(base.seasons);
  for (const s of seasons.seasons) s.rules.frost *= b.frostResistance;
  seasons.memory.perSpore *= b.memoryPerSpore;

  const events = new Map(
    [...base.events].map(([id, e]) => [id, e.kind === 'frost' ? { ...e, intensity: e.intensity * b.frostResistance } : e]),
  );

  const threats = structuredClone(base.threats);
  threats.defense.damage *= b.defenseDamage;
  threats.defense.sugarCost *= b.defenseCost;
  threats.parasites.cure = Math.min(1, threats.parasites.cure * b.parasiteCure);

  const allies = structuredClone(base.allies);
  allies.trust.gain *= b.trustGain;

  const sporulation = structuredClone(base.sporulation);
  sporulation.windows.perfect *= b.rhythmWindow;
  sporulation.windows.good *= b.rhythmWindow;
  sporulation.baseReach *= b.sporeReach;
  sporulation.perSpore *= b.sporeReach;

  return { ...base, network, soil, seasons, events, threats, allies, sporulation };
}
