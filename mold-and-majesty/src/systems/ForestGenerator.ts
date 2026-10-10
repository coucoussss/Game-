import type { GameData } from '../data';
import type { ForestDef, Layer } from '../data/types';
import { ALLY_SPECIES, LAYERS } from '../data/types';
import { Random } from './Random';

const PLACES = ['Bois', 'Combe', 'Val', 'Futaie', 'Lande', 'Taillis', 'Sous-bois', 'Clairière', 'Ravine', 'Fondrière'];
const NAMES = [
  'des Lueurs',
  'aux Spores',
  'du Silence',
  'des Racines',
  'de la Brume',
  'des Échos',
  'du Givre',
  'des Ombres',
  'sans Nom',
  'du Couchant',
  'des Cendres',
  'aux Mille Fils',
];

/** Difficulté d'une profondeur du mode infini (1 = première forêt). */
export const difficultyAt = (depth: number) => 1 + 0.12 * (depth - 1);

/**
 * Génère une forêt complète à partir d'une graine et d'une profondeur : biome et règle
 * tirés d'un modèle de la campagne, puis couches, gisements, alliés, rivaux et
 * événements variés au hasard. Plus la profondeur grandit, plus les menaces se font
 * fréquentes, les minéraux rares et l'objectif lointain. Même graine = même forêt.
 */
export function generateForest(seed: number, depth: number, data: GameData): ForestDef {
  const rng = new Random((seed * 7919 + depth * 104729) | 0);
  const templates = [...data.forests.values()];
  const template = templates[rng.int(0, templates.length - 1)]!;
  const difficulty = difficultyAt(depth);
  const scarcity = Math.max(0.5, 1 - 0.04 * (depth - 1));

  const rules = structuredClone(template.rules);
  rules.rivalChance = (rules.rivalChance ?? 1) * difficulty;
  rules.parasiteChance = (rules.parasiteChance ?? 1) * difficulty;
  rules.eventChance = (rules.eventChance ?? 1) * (1 + 0.08 * (depth - 1));

  const layers = { surface: rng.int(3, 5), humus: rng.int(6, 10), deep: rng.int(8, 12) };
  const deposits = Object.fromEntries(
    LAYERS.map((layer) => {
      const t = template.deposits[layer];
      const count = t.count === 0 ? 0 : Math.max(1, Math.round(t.count * (0.7 + rng.next() * 0.6)));
      return [layer, { count, amount: Math.round(t.amount * scarcity) }];
    }),
  ) as Record<Layer, { count: number; amount: number }>;

  const allies = Object.fromEntries(
    ALLY_SPECIES.map((species) => {
      const base = template.allies[species];
      if (species === 'tree') return [species, rules.noSky ? 0 : Math.max(2, base + rng.int(-1, 1))];
      return [species, Math.max(0, base + rng.int(-1, 1))];
    }),
  ) as ForestDef['allies'];

  const allRivals = Object.keys(data.threats.rivals.kinds);
  const rivals = new Set(template.rivals);
  if (depth >= 3 && rng.next() < 0.5) rivals.add(allRivals[rng.int(0, allRivals.length - 1)]!);

  const events = template.events.filter(() => rng.next() < 0.8);
  if (events.length < 2) events.splice(0, events.length, ...template.events.slice(0, 2));

  return {
    id: `endless-${seed}-${depth}`,
    name: `${PLACES[rng.int(0, PLACES.length - 1)]} ${NAMES[rng.int(0, NAMES.length - 1)]}`,
    description: `Profondeur ${depth} : une forêt jamais vue, dans le style « ${template.name} ».`,
    biome: template.biome,
    rules,
    goal: { reach: Math.round(70 + 12 * (depth - 1)) },
    rivals: [...rivals],
    widthTiles: template.widthTiles,
    layers,
    startingResources: { ...template.startingResources, memory: 0, spores: 0 },
    deposits,
    allies,
    species: [...template.species],
    events,
  };
}
