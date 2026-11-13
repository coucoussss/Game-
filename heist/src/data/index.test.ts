import { describe, expect, it } from 'vitest';
import itemsJson from './items.json';
import propsJson from './props.json';
import rulesJson from './rules.json';
import townJson from './town.json';
import { buildGameData, expandTown, loadGameData } from '.';
import type { ItemDef, PropKind, RulesDef, TownDef } from './types';

const items = itemsJson as unknown as ItemDef[];
const props = propsJson as Record<string, PropKind>;
const town = townJson as unknown as TownDef;
const rules = rulesJson as RulesDef;

describe('données', () => {
  it('se chargent et se valident', () => {
    const data = loadGameData();
    expect(data.items.size).toBe(8);
    expect(data.level.sites.map((s) => s.id)).toEqual(['store', 'jewelry', 'bank']);
    expect(data.level.doors.length).toBe(9);
  });

  it('découpent les murs autour des portes et des vitrines', () => {
    const level = expandTown(
      {
        ...town,
        props: [],
        buildings: [
          {
            id: 'b', rect: { min: [0, 0], max: [10, 6] }, height: 3, style: 'brick', color: '#fff',
            openings: { s: [{ from: 2, to: 4, door: { id: 'd', role: 'front' } }, { from: 6, to: 8, window: true }] },
          },
        ],
      },
      new Map(),
    );
    expect(level.doors).toHaveLength(1);
    expect(level.doors[0]?.rect).toEqual({ min: [2, 5.8], max: [4, 6] });
    const south = level.walls.filter((w) => w.rect.min[1] === 5.8);
    expect(south.map((w) => [w.rect.min[0], w.rect.max[0], w.glass])).toEqual([
      [0, 2, false], [4, 6, false], [6, 8, true], [8, 10, false],
    ]);
    expect(south[2]?.blocksSight).toBe(false);
  });

  it('refusent un objet en double', () => {
    expect(() => buildGameData([...items, items[0] as ItemDef], props, town, rules)).toThrow(/double/);
  });

  it('exigent que le joueur commence dans sa planque', () => {
    expect(() => buildGameData(items, props, { ...town, spawn: [0, 0] }, rules)).toThrow(/planque/);
  });

  it('refusent un interactif qui désigne une porte inconnue', () => {
    const bad = { ...town, interactables: [...town.interactables, { id: 'x', kind: 'door', name: 'X', pos: [0, 0], y: 1, door: 'nope' }] };
    expect(() => buildGameData(items, props, bad as TownDef, rules)).toThrow(/porte/);
  });

  it('refusent un meuble inconnu', () => {
    expect(() => buildGameData(items, props, { ...town, props: [{ type: 'piano', pos: [0, 0] }] }, rules)).toThrow(/meuble/);
  });

  it('les objets coûteux se débloquent en blanchissant de l’argent', () => {
    const data = loadGameData();
    expect(data.items.get('crowbar')?.unlock).toBe(0);
    expect(data.items.get('drill')?.unlock).toBeGreaterThan(data.items.get('lockpicks')?.unlock ?? 0);
  });
});
