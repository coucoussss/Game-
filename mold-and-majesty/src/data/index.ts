import alliesJson from './allies.json';
import eventsJson from './events.json';
import forestsJson from './forests.json';
import networkJson from './network.json';
import seasonsJson from './seasons.json';
import soilJson from './soil.json';
import speciesJson from './species.json';
import threatsJson from './threats.json';
import type {
  AlliesDef,
  EventDef,
  EventsDef,
  ForestDef,
  NetworkDef,
  SeasonsDef,
  SoilDef,
  SpeciesDef,
  ThreatsDef,
} from './types';
import { ALLY_SPECIES, CLIMATE_KINDS, FLUX_IDS, LAYERS, NODE_KINDS, PERSONALITY_TRAITS, THICKNESS_IDS } from './types';
import { hexToInt } from '../ui/color';

export interface GameData {
  species: ReadonlyMap<string, SpeciesDef>;
  events: ReadonlyMap<string, EventDef>;
  /** Probabilité par tick qu'un événement climatique se déclenche. */
  eventChance: number;
  forests: ReadonlyMap<string, ForestDef>;
  network: NetworkDef;
  seasons: SeasonsDef;
  soil: SoilDef;
  allies: AlliesDef;
  threats: ThreatsDef;
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
  events: EventsDef;
  forests: ForestDef[];
  network: NetworkDef;
  seasons: SeasonsDef;
  soil: SoilDef;
  allies: AlliesDef;
  threats: ThreatsDef;
}): GameData {
  const species = indexById(raw.species, 'Espèce');
  const events = indexById(raw.events.events, 'Événement');
  const forests = indexById(raw.forests, 'Forêt');

  for (const s of species.values()) {
    if (s.cost < 0 || s.yield < 0) throw new Error(`Espèce "${s.id}" : coût ou rendement négatif`);
  }
  const seasonIds = new Set(raw.seasons.seasons.map((s) => s.id));
  const checkSeasons = (weights: Record<string, number>, label: string) => {
    for (const [id, w] of Object.entries(weights)) {
      if (!seasonIds.has(id)) throw new Error(`${label} : saison inconnue "${id}"`);
      if (!(w >= 0)) throw new Error(`${label} : poids négatif pour "${id}"`);
    }
  };
  inRange(raw.events.chancePerTick, 0, 1, 'events.chancePerTick');
  for (const e of events.values()) {
    const label = `Événement "${e.id}"`;
    if (!CLIMATE_KINDS.includes(e.kind)) throw new Error(`${label} : nature inconnue "${e.kind}"`);
    const [min, max] = e.duration;
    if (!(min >= 1 && max >= min)) throw new Error(`${label} : durée invalide`);
    if (!(e.intensity >= 0)) throw new Error(`${label} : intensité négative`);
    checkSeasons(e.seasons, label);
  }
  for (const f of forests.values()) {
    for (const id of f.species) {
      if (!species.has(id)) throw new Error(`Forêt "${f.id}" : espèce inconnue "${id}"`);
    }
    for (const id of f.events) {
      if (!events.has(id)) throw new Error(`Forêt "${f.id}" : événement inconnu "${id}"`);
    }
    for (const id of ALLY_SPECIES) {
      if (!(f.allies?.[id] >= 0)) throw new Error(`Forêt "${f.id}" : nombre d'alliés "${id}" invalide`);
    }
  }
  validateNetwork(raw.network);
  validateSeasons(raw.seasons);
  validateSoil(raw.soil);
  validateAllies(raw.allies, checkSeasons);
  validateThreats(raw.threats, checkSeasons);
  return {
    species,
    events,
    eventChance: raw.events.chancePerTick,
    forests,
    network: raw.network,
    seasons: raw.seasons,
    soil: raw.soil,
    allies: raw.allies,
    threats: raw.threats,
  };
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

/** Vérifie le cycle des saisons : règles cohérentes, couleurs valides, météos existantes. */
export function validateSeasons(def: SeasonsDef): void {
  if (def.seasons.length === 0) throw new Error('Saisons : aucune saison définie');
  if (!(def.seasonLengthTicks >= 1)) throw new Error('Saisons : seasonLengthTicks doit être ≥ 1');
  if (!(def.paletteBlend > 0 && def.paletteBlend <= 1)) throw new Error('Saisons : paletteBlend hors de ]0, 1]');
  for (const [id, w] of Object.entries(def.weather)) {
    if (!(w.moisture >= 0 && w.moisture <= 1)) throw new Error(`Météo "${id}" : humidité hors de [0, 1]`);
    if (!(w.minTicks >= 1 && w.maxTicks >= w.minTicks)) throw new Error(`Météo "${id}" : durées invalides`);
    if (w.skyTint) hexToInt(w.skyTint);
  }
  for (const season of def.seasons) {
    const label = `Saison "${season.id}"`;
    for (const [key, value] of Object.entries(season.rules)) {
      if (typeof value === 'number' && value < 0) throw new Error(`${label} : ${key} négatif`);
    }
    for (const [key, value] of Object.entries(season.palette)) {
      if (typeof value === 'string') hexToInt(value);
      else if (!(value >= 0 && value <= 1)) throw new Error(`${label} : palette.${key} hors de [0, 1]`);
    }
    const weights = Object.entries(season.weather);
    if (!weights.some(([, w]) => w > 0)) throw new Error(`${label} : aucune météo possible`);
    for (const [id] of weights) {
      if (!def.weather[id]) throw new Error(`${label} : météo inconnue "${id}"`);
    }
  }
}

export function validateSoil(soil: SoilDef): void {
  for (const layer of LAYERS) {
    inRange(soil.layerWater[layer] ?? NaN, 0, 10, `soil.layerWater.${layer}`);
    inRange(soil.layerBuffer[layer] ?? NaN, 0, 1, `soil.layerBuffer.${layer}`);
  }
  inRange(soil.moistureRate, 0, 1, 'soil.moistureRate');
  inRange(soil.waterRate, 0, 1e3, 'soil.waterRate');
  inRange(soil.mineralRate, 0, 1e3, 'soil.mineralRate');
}

type SeasonCheck = (weights: Record<string, number>, label: string) => void;

/** Vérifie les espèces alliées : traits dans [0, 1], habitats connus, accords positifs. */
export function validateAllies(def: AlliesDef, checkSeasons: SeasonCheck): void {
  const { trust } = def;
  for (const key of ['initial', 'gain', 'loss', 'drift', 'leave'] as const) inRange(trust[key], 0, 1, `allies.trust.${key}`);
  for (const id of ALLY_SPECIES) {
    const sp = def.species[id];
    if (!sp) throw new Error(`Alliés : espèce "${id}" manquante`);
    const label = `allié ${id}`;
    for (const trait of PERSONALITY_TRAITS) inRange(sp.personality[trait], 0, 1, `${label}.personality.${trait}`);
    inRange(sp.variation, 0, 0.5, `${label}.variation`);
    for (const layer of [...sp.habitat, ...(sp.winterHabitat ?? [])]) {
      if (!LAYERS.includes(layer)) throw new Error(`Alliés : ${label} habite une couche inconnue "${layer}"`);
    }
    for (const amount of [...Object.values(sp.deal.wants), ...Object.values(sp.deal.gives)]) {
      inRange(amount ?? NaN, 0, 100, `${label}.deal`);
    }
    inRange(sp.betrayal.threshold, 0, 1, `${label}.betrayal.threshold`);
    inRange(sp.betrayal.chance, 0, 1, `${label}.betrayal.chance`);
    checkSeasons(sp.activity, `Alliés : ${label}`);
  }
}

/** Vérifie les menaces : probabilités dans [0, 1], couleurs valides. */
export function validateThreats(def: ThreatsDef, checkSeasons: SeasonCheck): void {
  inRange(def.rivals.chancePerTick, 0, 1, 'rivals.chancePerTick');
  inRange(def.rivals.cellSize, 1, 32, 'rivals.cellSize');
  checkSeasons(def.rivals.seasons, 'Moisissures');
  for (const [id, kind] of Object.entries(def.rivals.kinds)) {
    hexToInt(kind.color);
    inRange(kind.growthChance, 0, 1, `rivals.${id}.growthChance`);
    inRange(kind.hp, 0.001, 1e3, `rivals.${id}.hp`);
  }
  if (Object.keys(def.rivals.kinds).length === 0) throw new Error('Moisissures : aucune espèce définie');
  const p = def.parasites;
  for (const key of ['chancePerTick', 'seedLoad', 'growth', 'spread', 'cure'] as const) inRange(p[key], 0, 1, `parasites.${key}`);
  checkSeasons(p.seasons, 'Parasites');
  inRange(def.defense.minSignal, 0, 1, 'defense.minSignal');
}

/** Données du jeu, chargées depuis les fichiers JSON de src/data. */
export const gameData: GameData = buildGameData({
  species: speciesJson as SpeciesDef[],
  events: eventsJson as unknown as EventsDef,
  forests: forestsJson as ForestDef[],
  network: networkJson as NetworkDef,
  // Les objets de météo ont des clés différentes selon la saison : TypeScript exige un passage par unknown.
  seasons: seasonsJson as unknown as SeasonsDef,
  soil: soilJson as SoilDef,
  allies: alliesJson as unknown as AlliesDef,
  threats: threatsJson as ThreatsDef,
});
