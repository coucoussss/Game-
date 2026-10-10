import { describe, expect, it } from 'vitest';
import { buildGameData, gameData, validateNetwork, validateSeasons } from './index';
import type { ForestDef } from './types';

const forest: ForestDef = {
  id: 'f',
  name: 'F',
  description: '',
  widthTiles: 48,
  layers: { surface: 1, humus: 1, deep: 1 },
  startingResources: { sugar: 0, water: 0, minerals: 0, memory: 0, spores: 0 },
  deposits: { surface: { count: 0, amount: 0 }, humus: { count: 0, amount: 0 }, deep: { count: 0, amount: 0 } },
  allies: { tree: 0, ant: 0, worm: 0, beetle: 0 },
  species: ['ghost'],
  biome: 'temperate',
  rules: { summary: 'test' },
  goal: { reach: 10 },
  rivals: ['verdigris'],
  events: [],
};

/** Données brutes minimales et valides, à surcharger dans chaque test. */
function raw() {
  return {
    species: [],
    events: { chancePerTick: 0, events: [] },
    forests: [],
    network: gameData.network,
    seasons: gameData.seasons,
    soil: gameData.soil,
    allies: gameData.allies,
    threats: gameData.threats,
    sporulation: gameData.sporulation,
    skills: gameData.skills,
    biomes: gameData.biomes,
  };
}

describe('données du jeu', () => {
  it('les fichiers JSON livrés sont valides', () => {
    expect(gameData.forests.size).toBeGreaterThan(0);
    expect(gameData.species.size).toBeGreaterThan(0);
    expect(gameData.events.size).toBeGreaterThan(0);
  });

  it('rejette une référence vers une espèce inconnue', () => {
    expect(() => buildGameData({ ...raw(), forests: [forest] })).toThrow(/espèce inconnue/);
  });

  it('rejette les identifiants en double', () => {
    const s = { id: 'a', name: 'A', description: '', cost: 1, yield: 1, layer: 'surface' as const };
    expect(() => buildGameData({ ...raw(), species: [s, s] })).toThrow(/double/);
  });

  it('rejette une mobilité de flux hors de [0, 1]', () => {
    const network = structuredClone(gameData.network);
    network.flux.water.mobility = 1.5;
    expect(() => validateNetwork(network)).toThrow(/mobility/);
  });

  it('rejette une saison qui cite une météo inconnue', () => {
    const seasons = structuredClone(gameData.seasons);
    seasons.seasons[0]!.weather = { tornado: 1 };
    expect(() => validateSeasons(seasons)).toThrow(/météo inconnue/);
  });

  it('rejette une couleur de palette invalide', () => {
    const seasons = structuredClone(gameData.seasons);
    seasons.seasons[1]!.palette.sky = 'bleu';
    expect(() => validateSeasons(seasons)).toThrow(/Couleur invalide/);
  });

  it('définit les quatre saisons dans l\'ordre', () => {
    expect(gameData.seasons.seasons.map((s) => s.id)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    expect(gameData.seasons.seasonLengthTicks).toBe(9000); // 15 min à 10 ticks/s
  });

  it('rejette un trait de personnalité hors de [0, 1]', () => {
    const allies = structuredClone(gameData.allies);
    allies.species.ant.personality.loyalty = 2;
    expect(() => buildGameData({ ...raw(), allies })).toThrow(/loyalty/);
  });

  it('rejette un événement qui cite une saison inconnue', () => {
    const events = structuredClone([...gameData.events.values()]);
    events[0]!.seasons = { mousson: 1 };
    expect(() => buildGameData({ ...raw(), events: { chancePerTick: 0, events } })).toThrow(/saison inconnue/);
  });

  it('rejette une moisissure de couleur invalide', () => {
    const threats = structuredClone(gameData.threats);
    threats.rivals.kinds.verdigris!.color = 'vert';
    expect(() => buildGameData({ ...raw(), threats })).toThrow(/Couleur invalide/);
  });

  it('rejette un prérequis de compétence circulaire', () => {
    const skills = structuredClone(gameData.skills);
    skills.skills[0]!.requires = [skills.skills[3]!.id];
    expect(() => buildGameData({ ...raw(), skills })).toThrow(/circulaire/);
  });

  it('rejette un motif rythmique mal formé', () => {
    const sporulation = structuredClone(gameData.sporulation);
    sporulation.patterns.push([1, 0, 1]);
    expect(() => buildGameData({ ...raw(), sporulation })).toThrow(/8 croches/);
  });

  it('la campagne compte 8 forêts, chacune avec sa règle et son objectif', () => {
    expect(gameData.forests.size).toBe(8);
    for (const f of gameData.forests.values()) {
      expect(f.rules.summary.length).toBeGreaterThan(10);
      expect(f.goal.reach).toBeGreaterThan(0);
    }
  });

  it('refuse une forêt sans automne', () => {
    const bad = { ...forest, species: [], rules: { summary: 'x', seasonLength: { autumn: 0 } } };
    expect(() => buildGameData({ ...raw(), forests: [bad] })).toThrow(/automne/);
  });
});
