import { describe, expect, it } from 'vitest';
import { gameData, validateForest } from '../data';
import type { ThicknessId } from '../data/types';
import { applyForestRules } from './ForestRules';
import { difficultyAt, generateForest } from './ForestGenerator';
import { campaignOrder, newProfile, normalizeProfile, recordReach } from './Profile';
import { seasonAt } from './SeasonSystem';
import { World } from './World';

const forest = (id: string) => gameData.forests.get(id)!;

describe('règles des forêts', () => {
  it('la forêt de givre double l\'hiver et écourte l\'été', () => {
    const data = applyForestRules(gameData, forest('frost-wood'));
    const L = gameData.seasons.seasonLengthTicks;
    expect(seasonAt(L + L / 2 - 1, data.seasons).def.id).toBe('summer');
    expect(seasonAt(L + L / 2, data.seasons).def.id).toBe('autumn');
    const winterStart = L + L / 2 + L;
    expect(seasonAt(winterStart + 1.5 * L, data.seasons).def.id).toBe('winter');
    expect(data.seasons.seasons[0]!.rules.frozenSurface).toBe(true); // printemps gelé
  });

  it('la jungle n\'a pas d\'hiver', () => {
    const data = applyForestRules(gameData, forest('green-jungle'));
    const seen = new Set<string>();
    for (let t = 0; t < 4 * gameData.seasons.seasonLengthTicks; t += 100) seen.add(seasonAt(t, data.seasons).def.id);
    expect(seen.has('winter')).toBe(false);
    expect(seen.has('autumn')).toBe(true);
  });

  it('ne garde que les moisissures de la forêt', () => {
    const data = applyForestRules(gameData, forest('human-ruins'));
    expect(Object.keys(data.threats.rivals.kinds)).toEqual(['black-rot']);
  });

  it('la caverne n\'a pas d\'arbres et son cœur produit davantage', () => {
    const world = new World(gameData, 'deep-cavern', 1);
    expect(world.allies.some((a) => a.species === 'tree')).toBe(false);
    const base = gameData.network.nodes.heart.production!.sugar!;
    expect(world.data.network.nodes.heart.production!.sugar).toBeCloseTo(base * 4);
  });

  it('les ruines sèment des obstacles, que rien ne traverse', () => {
    const world = new World(gameData, 'human-ruins', 3);
    expect(world.obstacles.length).toBeGreaterThan(5);
    const o = world.obstacles[0]!;
    expect(world.isBlocked(o.x + 1, o.y + 1)).toBe(true);
    for (const d of world.deposits) expect(world.isBlocked(d.x, d.y)).toBe(false);
  });

  it('la nappe du marais noie les filaments fins qui y plongent', () => {
    const world = new World(gameData, 'mist-marsh', 1, { threats: false });
    const level = world.waterTableY!;
    const a = world.net.addNode('junction', 100, level + 4);
    const b = world.net.addNode('junction', 110, level + 4);
    const seg = world.net.addSegment(a.id, b.id, 'thin', true)!;
    world.step();
    expect(seg.health).toBeLessThan(1);
    expect(world.moisture).toBeGreaterThanOrEqual(forest('mist-marsh').rules.minMoisture!);
  });

  it('dans la pinède brûlée, des arbres sont déjà calcinés (jamais l\'arbre-mère)', () => {
    const world = new World(gameData, 'burnt-pinewood', 5);
    const trees = world.allies.filter((a) => a.species === 'tree');
    expect(trees[0]!.state).not.toBe('burnt');
    expect(trees.some((t) => t.state === 'burnt')).toBe(true);
  });

  it('l\'Arbre-Mère est géant et commerce pour trois', () => {
    const world = new World(gameData, 'mother-tree', 1);
    const mother = world.allies.find((a) => a.species === 'tree')!;
    expect(mother.size).toBe(3);
    expect(mother.height).toBeGreaterThan(60);
  });
});

describe('génération procédurale', () => {
  it('produit des forêts valides et reproductibles', () => {
    for (let depth = 1; depth <= 12; depth++) {
      const f = generateForest(42, depth, gameData);
      expect(() => validateForest(f, { ...gameData, species: gameData.species })).not.toThrow();
      expect(generateForest(42, depth, gameData)).toEqual(f);
    }
    expect(generateForest(1, 1, gameData)).not.toEqual(generateForest(2, 1, gameData));
  });

  it('se durcit avec la profondeur', () => {
    expect(difficultyAt(10)).toBeGreaterThan(difficultyAt(1));
    expect(generateForest(7, 10, gameData).goal.reach).toBeGreaterThan(generateForest(7, 1, gameData).goal.reach);
  });

  it('un monde peut naître d\'une forêt générée', () => {
    const world = new World(gameData, generateForest(9, 4, gameData), 9);
    for (let i = 0; i < 500; i++) world.step();
    expect(world.net.nodes.size).toBeGreaterThan(0);
  });
});

describe('progression', () => {
  it('un nouveau profil ne connaît que la première forêt', () => {
    const profile = newProfile(gameData, 1);
    expect(profile.unlocked).toEqual(['whispering-grove']);
    expect(campaignOrder(gameData)).toHaveLength(8);
  });

  it('atteindre l\'objectif conquiert la forêt et débloque la suivante', () => {
    const profile = newProfile(gameData, 1);
    expect(recordReach(profile, gameData, 'whispering-grove', 10)).toEqual({ conquered: false, unlocked: null });
    expect(profile.bestReach['whispering-grove']).toBe(10);
    const goal = forest('whispering-grove').goal.reach;
    expect(recordReach(profile, gameData, 'whispering-grove', goal)).toEqual({ conquered: true, unlocked: 'mist-marsh' });
    expect(profile.completed).toContain('whispering-grove');
    expect(recordReach(profile, gameData, 'whispering-grove', goal + 5).unlocked).toBeNull();
  });

  it('complète un ancien profil avec les réglages par défaut', () => {
    const old = { ...newProfile(gameData, 1), settings: { musicVolume: 0.1 } } as never;
    expect(normalizeProfile(old, gameData).settings.sfxVolume).toBeDefined();
  });
});

describe('sauvegarde de partie', () => {
  it('une partie restaurée reprend exactement à l\'identique', () => {
    const world = new World(gameData, 'human-ruins', 11);
    const heart = [...world.net.nodes.values()][0]!;
    let prev = heart;
    for (let i = 1; i <= 6; i++) {
      const n = world.net.addNode('junction', heart.x + i * 10, heart.y + (i % 2) * 4);
      world.net.addSegment(prev.id, n.id, (['thin', 'thick'] as ThicknessId[])[i % 2]!, true);
      prev = n;
    }
    world.spawnRival();
    world.seedParasites();
    for (let i = 0; i < 3000; i++) world.step();

    const json = JSON.parse(JSON.stringify(world.snapshot()));
    const copy = World.restore(gameData, json);
    for (let i = 0; i < 3000; i++) {
      world.step();
      copy.step();
    }
    expect(copy.net.totals()).toEqual(world.net.totals());
    expect(copy.tick).toBe(world.tick);
    expect(copy.allies.map((a) => [a.x, a.trust])).toEqual(world.allies.map((a) => [a.x, a.trust]));
    expect(copy.colonies.map((c) => c.cells.size)).toEqual(world.colonies.map((c) => c.cells.size));
    expect(copy.memory).toBeCloseTo(world.memory, 9);
  });
});
