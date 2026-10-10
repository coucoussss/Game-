import { describe, expect, it } from 'vitest';
import { buildGameData, gameData, validateNetwork, validateSeasons } from './index';
import type { ForestDef } from './types';

const forest: ForestDef = {
  id: 'f',
  name: 'F',
  description: '',
  widthTiles: 10,
  layers: { surface: 1, humus: 1, deep: 1 },
  startingResources: { sugar: 0, water: 0, minerals: 0, memory: 0, spores: 0 },
  deposits: { surface: { count: 0, amount: 0 }, humus: { count: 0, amount: 0 }, deep: { count: 0, amount: 0 } },
  species: ['ghost'],
  events: [],
};

describe('données du jeu', () => {
  it('les fichiers JSON livrés sont valides', () => {
    expect(gameData.forests.size).toBeGreaterThan(0);
    expect(gameData.species.size).toBeGreaterThan(0);
    expect(gameData.events.size).toBeGreaterThan(0);
  });

  it('rejette une référence vers une espèce inconnue', () => {
    expect(() => buildGameData({ species: [], events: [], forests: [forest], network: gameData.network, seasons: gameData.seasons, soil: gameData.soil })).toThrow(/espèce inconnue/);
  });

  it('rejette les identifiants en double', () => {
    const s = { id: 'a', name: 'A', description: '', cost: 1, yield: 1, layer: 'surface' as const };
    expect(() => buildGameData({ species: [s, s], events: [], forests: [], network: gameData.network, seasons: gameData.seasons, soil: gameData.soil })).toThrow(/double/);
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
});
