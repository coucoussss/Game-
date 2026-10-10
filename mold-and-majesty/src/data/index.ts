import eventsJson from './events.json';
import forestsJson from './forests.json';
import speciesJson from './species.json';
import type { EventDef, ForestDef, SpeciesDef } from './types';
import { RESOURCE_IDS } from './types';

export interface GameData {
  species: ReadonlyMap<string, SpeciesDef>;
  events: ReadonlyMap<string, EventDef>;
  forests: ReadonlyMap<string, ForestDef>;
}

function indexById<T extends { id: string }>(items: T[], kind: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`${kind} en double : "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}

/**
 * Indexe et valide les données brutes : identifiants uniques, valeurs cohérentes,
 * et références croisées (une forêt ne cite que des espèces/événements existants).
 */
export function buildGameData(raw: {
  species: SpeciesDef[];
  events: EventDef[];
  forests: ForestDef[];
}): GameData {
  const species = indexById(raw.species, 'Espèce');
  const events = indexById(raw.events, 'Événement');
  const forests = indexById(raw.forests, 'Forêt');

  for (const s of species.values()) {
    if (s.cost < 0 || s.yield < 0) throw new Error(`Espèce "${s.id}" : coût ou rendement négatif`);
  }
  for (const e of events.values()) {
    if (e.weight <= 0) throw new Error(`Événement "${e.id}" : poids doit être > 0`);
    for (const key of Object.keys(e.effects)) {
      if (!RESOURCE_IDS.includes(key as never)) {
        throw new Error(`Événement "${e.id}" : ressource inconnue "${key}"`);
      }
    }
  }
  for (const f of forests.values()) {
    for (const id of f.species) {
      if (!species.has(id)) throw new Error(`Forêt "${f.id}" : espèce inconnue "${id}"`);
    }
    for (const id of f.events) {
      if (!events.has(id)) throw new Error(`Forêt "${f.id}" : événement inconnu "${id}"`);
    }
  }
  return { species, events, forests };
}

/** Données du jeu, chargées depuis les fichiers JSON de src/data. */
export const gameData: GameData = buildGameData({
  species: speciesJson as SpeciesDef[],
  events: eventsJson as EventDef[],
  forests: forestsJson as ForestDef[],
});
