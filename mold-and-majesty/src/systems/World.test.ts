import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import type { ThicknessId } from '../data/types';
import { World } from './World';

const L = gameData.seasons.seasonLengthTicks;

function heartOf(world: World) {
  return [...world.net.nodes.values()].find((n) => n.kind === 'heart')!;
}

describe('World', () => {
  it('commence au printemps de l\'an 1 avec un cœur garni', () => {
    const world = new World(gameData, 'whispering-grove');
    expect(world.season.def.id).toBe('spring');
    expect(world.season.year).toBe(1);
    expect(heartOf(world).stock.sugar).toBe(120);
    expect(heartOf(world).stock.minerals).toBe(40);
  });

  it('est déterministe pour une même graine', () => {
    const a = new World(gameData, 'whispering-grove', 3);
    const b = new World(gameData, 'whispering-grove', 3);
    for (let i = 0; i < 3000; i++) {
      a.step();
      b.step();
    }
    expect(a.weather).toEqual(b.weather);
    expect(a.moisture).toBe(b.moisture);
    expect(a.net.totals()).toEqual(b.net.totals());
  });

  it('gagne de la mémoire à chaque saison traversée', () => {
    const world = new World(gameData, 'whispering-grove');
    for (let i = 0; i < L - 1; i++) world.step();
    expect(world.memory).toBe(0);
    world.step();
    expect(world.memory).toBeCloseTo(gameData.seasons.memory.perSeason);
    expect(world.season.def.id).toBe('summer');
  });

  it('refuse une forêt inconnue', () => {
    expect(() => new World(gameData, 'atlantide')).toThrow(/inconnue/);
  });
});

/**
 * Garde-fou d'équilibrage : un réseau de départ raisonnable traverse une année complète.
 * Si ce test casse après un réglage des JSON, c'est que l'équilibre du jeu a changé.
 */
describe('une année dans le Bosquet des Murmures', () => {
  const world = new World(gameData, 'whispering-grove', 7, { threats: false });
  const heart = heartOf(world);
  const branches: [number, number, ThicknessId][] = [
    [1, 0, 'thick'],
    [-1, 0, 'medium'],
    [0.6, 0.8, 'thin'],
    [-0.6, -0.5, 'thin'], // monte jusque dans la couche de surface, exposée au gel
  ];
  for (const [dx, dy, thickness] of branches) {
    let prev = heart;
    for (let i = 1; i <= 8; i++) {
      const node = world.net.addNode('junction', heart.x + dx * 10 * i, heart.y + dy * 10 * i);
      world.net.addSegment(prev.id, node.id, thickness, true);
      if (thickness === 'thick' && i === 3) node.kind = 'storage';
      if (thickness === 'medium' && i === 4) node.kind = 'fruiting';
      prev = node;
    }
  }

  const snapshots: Record<string, { segments: number; spores: number }> = {};
  for (let t = 0; t < 4 * L; t++) {
    world.step();
    if ((t + 1) % L === 0) {
      snapshots[world.season.def.id] = { segments: world.net.segments.size, spores: world.net.spores };
    }
  }
  const atStartOf = (id: string) => snapshots[id]!;

  it('ne fructifie pas au printemps, surtout en automne', () => {
    expect(atStartOf('summer').spores).toBe(0);
    const summer = atStartOf('autumn').spores - atStartOf('summer').spores;
    const autumn = atStartOf('winter').spores - atStartOf('autumn').spores;
    expect(autumn).toBeGreaterThan(summer * 3);
  });

  it('survit à l\'année, mais l\'hiver emporte des filaments fins de surface', () => {
    expect(atStartOf('winter').segments).toBe(32);
    expect(atStartOf('spring').segments).toBeLessThan(32);
    expect(atStartOf('spring').segments).toBeGreaterThan(20);
    expect(world.season.year).toBe(2);
  });

  it('a accumulé de la mémoire', () => {
    expect(world.memory).toBeGreaterThan(4 * gameData.seasons.memory.perSeason);
  });
});
