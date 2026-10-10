import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import { applyBonuses, computeBonuses, unlockStatus } from './Skills';
import { World } from './World';

const skill = (id: string) => gameData.skills.skills.find((s) => s.id === id)!;

describe('arbre de compétences', () => {
  it('chaque branche compte 4 rangs reliés en chaîne', () => {
    for (const branch of ['roots', 'chemistry', 'spores'] as const) {
      const skills = gameData.skills.skills.filter((s) => s.branch === branch).sort((a, b) => a.tier - b.tier);
      expect(skills.map((s) => s.tier)).toEqual([1, 2, 3, 4]);
      for (let i = 1; i < skills.length; i++) expect(skills[i]!.requires).toContain(skills[i - 1]!.id);
    }
  });

  it('cumule les effets par multiplication', () => {
    const b = computeBonuses(['lean-growth'], gameData.skills);
    expect(b.growthCost).toBeCloseTo(0.7);
    expect(b.upkeep).toBeCloseTo(0.8);
    expect(b.fruiting).toBe(1);
  });

  it('exige les prérequis et assez de mémoire', () => {
    expect(unlockStatus(skill('mineral-sense'), new Set(), 100)).toBe('locked');
    expect(unlockStatus(skill('deep-drink'), new Set(), 1)).toBe('too-expensive');
    expect(unlockStatus(skill('deep-drink'), new Set(), 3)).toBe('available');
    expect(unlockStatus(skill('deep-drink'), new Set(['deep-drink']), 3)).toBe('owned');
  });

  it('modifie une copie des données, jamais les originales', () => {
    const before = gameData.soil.waterRate;
    const data = applyBonuses(gameData, computeBonuses(['deep-drink', 'antifungal', 'steady-pulse', 'frost-ward'], gameData.skills));
    expect(data.soil.waterRate).toBeCloseTo(before * 1.4);
    expect(data.threats.defense.damage).toBeCloseTo(gameData.threats.defense.damage * 1.5);
    expect(data.sporulation.windows.good).toBeCloseTo(gameData.sporulation.windows.good * 1.4);
    expect(data.seasons.seasons[3]!.rules.frost).toBeCloseTo(gameData.seasons.seasons[3]!.rules.frost * 0.5);
    expect(data.events.get('cold-snap')!.intensity).toBeCloseTo(gameData.events.get('cold-snap')!.intensity * 0.5);
    expect(gameData.soil.waterRate).toBe(before);
  });

  it('s\'achète dans le monde en dépensant la mémoire', () => {
    const world = new World(gameData, 'whispering-grove', 1, { memory: 5 });
    expect(world.unlockSkill('mineral-sense')).toBe(false);
    expect(world.unlockSkill('deep-drink')).toBe(true);
    expect(world.memory).toBe(2);
    expect(world.data.soil.waterRate).toBeCloseTo(gameData.soil.waterRate * 1.4);
    expect(world.unlockSkill('deep-drink')).toBe(false);
  });
});

describe('sporée', () => {
  function autumnWorld() {
    const world = new World(gameData, 'whispering-grove', 1, { threats: false });
    world.tick = 2 * gameData.seasons.seasonLengthTicks + 10;
    const heart = [...world.net.nodes.values()][0]!;
    const hive = world.net.addNode('fruiting', heart.x + 10, heart.y);
    world.net.addSegment(heart.id, hive.id, 'thick', true);
    return world;
  }

  it('n\'est possible qu\'en automne, avec une ruche et des spores, une fois par an', () => {
    const world = autumnWorld();
    expect(world.canSporulate()).toBe(false); // pas encore de spores
    world.net.spores = 5;
    expect(world.canSporulate()).toBe(true);
    world.sporulate(1);
    expect(world.canSporulate()).toBe(false);
    world.tick = 10;
    world.net.spores = 5;
    expect(world.canSporulate()).toBe(false); // printemps
  });

  it('libère les spores, mesure la portée et nourrit la mémoire', () => {
    const world = autumnWorld();
    world.net.spores = 10;
    const result = world.sporulate(0.8);
    expect(result.released).toBe(10);
    expect(world.net.spores).toBe(0);
    expect(result.reach).toBe(world.bestReach);
    expect(world.memory).toBeCloseTo(result.memoryGained);
    expect(world.events.some((e) => e.type === 'sporee')).toBe(true);
  });
});
