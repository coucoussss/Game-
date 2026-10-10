import eventsJson from './events.json';
import forestsJson from './forests.json';
import networkJson from './network.json';
import speciesJson from './species.json';
import type { EventDef, ForestDef, NetworkDef, SpeciesDef } from './types';
import { FLUX_IDS, NODE_KINDS, RESOURCE_IDS, THICKNESS_IDS } from './types';

export interface GameData {
  species: ReadonlyMap<string, SpeciesDef>;
  events: ReadonlyMap<string, EventDef>;
  forests: ReadonlyMap<string, ForestDef>;
  network: NetworkDef;
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
  network: NetworkDef;
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
  validateNetwork(raw.network);
  return { species, events, forests, network: raw.network };
}

function inRange(value: number, min: number, max: number, label: string): void {
  if (!(value >= min && value <= max)) throw new Error(`Réseau : ${label} = ${value} hors de [${min}, ${max}]`);
}

/** Vérifie que les paramètres du réseau gardent la simulation stable (pas de stock négatif ni d'oscillation). */
export function validateNetwork(net: NetworkDef): void {
  for (const f of FLUX_IDS) inRange(net.flux[f]?.mobility ?? NaN, 0, 1, `flux.${f}.mobility`);
  for (const t of THICKNESS_IDS) {
    const d = net.thickness[t];
    if (!d) throw new Error(`Réseau : épaisseur "${t}" manquante`);
    inRange(d.conductance, 0, 1, `thickness.${t}.conductance`);
    inRange(d.growthSpeed, 0.001, 10, `thickness.${t}.growthSpeed`);
    inRange(d.decay, 0, 1, `thickness.${t}.decay`);
    inRange(d.regen, 0, 1, `thickness.${t}.regen`);
  }
  for (const k of NODE_KINDS) {
    const d = net.nodes[k];
    if (!d) throw new Error(`Réseau : type de nœud "${k}" manquant`);
    inRange(d.capacity, 1, 1e6, `nodes.${k}.capacity`);
    inRange(d.cost, 0, 1e6, `nodes.${k}.cost`);
  }
  inRange(net.signal.decay, 0, 1, 'signal.decay');
  inRange(net.signal.relayStrength, 0, 1, 'signal.relayStrength');
  inRange(net.fruiting.signalThreshold, 0, 1, 'fruiting.signalThreshold');
  inRange(net.buildRate, 0.001, 1e6, 'buildRate');
}

/** Données du jeu, chargées depuis les fichiers JSON de src/data. */
export const gameData: GameData = buildGameData({
  species: speciesJson as SpeciesDef[],
  events: eventsJson as EventDef[],
  forests: forestsJson as ForestDef[],
  network: networkJson as NetworkDef,
});
