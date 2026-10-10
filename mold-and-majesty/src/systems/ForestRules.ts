import type { GameData } from '../data';
import type { ForestDef } from '../data/types';

/**
 * Données effectives d'une forêt : sa règle spéciale s'applique aux paramètres des JSON
 * (durée des saisons, gel, menaces, climat, production du cœur), sur une copie.
 * Les particularités du terrain (nappe d'eau, gravats, arbres calcinés…) sont gérées
 * par le monde lui-même.
 */
export function applyForestRules(base: GameData, forest: ForestDef): GameData {
  const r = forest.rules;

  const seasons = structuredClone(base.seasons);
  for (const s of seasons.seasons) {
    s.lengthFactor = (s.lengthFactor ?? 1) * (r.seasonLength?.[s.id] ?? 1);
    s.rules.frost *= r.frost ?? 1;
    if (r.frozenSeasons?.includes(s.id)) s.rules.frozenSurface = true;
  }

  const events = new Map(
    [...base.events].map(([id, e]) => {
      const weight = r.eventWeights?.[id] ?? 1;
      const seasonsWeights = Object.fromEntries(Object.entries(e.seasons).map(([k, w]) => [k, w * weight]));
      const intensity = e.kind === 'frost' ? e.intensity * (r.frost ?? 1) : e.intensity;
      return [id, { ...e, seasons: seasonsWeights, intensity }];
    }),
  );

  const threats = structuredClone(base.threats);
  threats.rivals.chancePerTick *= r.rivalChance ?? 1;
  threats.rivals.kinds = Object.fromEntries(
    Object.entries(threats.rivals.kinds)
      .filter(([id]) => forest.rivals.includes(id))
      .map(([id, k]) => [id, { ...k, growthChance: Math.min(1, k.growthChance * (r.rivalGrowth ?? 1)) }]),
  );
  threats.parasites.chancePerTick = Math.min(1, threats.parasites.chancePerTick * (r.parasiteChance ?? 1));

  const network = structuredClone(base.network);
  const production = network.nodes.heart.production ?? {};
  network.nodes.heart.production = { ...production, sugar: (production.sugar ?? 0) * (r.heartProduction ?? 1) };

  return {
    ...base,
    seasons,
    events,
    eventChance: Math.min(1, base.eventChance * (r.eventChance ?? 1)),
    threats,
    network,
  };
}
