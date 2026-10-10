import { describe, expect, it } from 'vitest';
import { buildGameData, gameData } from './index';
import type { ForestDef } from './types';

const forest: ForestDef = {
  id: 'f',
  name: 'F',
  description: '',
  widthTiles: 10,
  layers: { surface: 1, humus: 1, deep: 1 },
  startingResources: { nutrients: 0, water: 0, spores: 0 },
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
    expect(() => buildGameData({ species: [], events: [], forests: [forest] })).toThrow(/espèce inconnue/);
  });

  it('rejette les identifiants en double', () => {
    const s = { id: 'a', name: 'A', description: '', cost: 1, yield: 1, layer: 'surface' as const };
    expect(() => buildGameData({ species: [s, s], events: [], forests: [] })).toThrow(/double/);
  });
});
