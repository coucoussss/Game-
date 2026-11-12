import { describe, expect, it } from 'vitest';
import itemsJson from './items.json';
import levelJson from './level.json';
import rulesJson from './rules.json';
import { buildGameData, loadGameData } from '.';
import type { ItemDef, LevelDef, RulesDef } from './types';

const items = itemsJson as unknown as ItemDef[];
const level = levelJson as unknown as LevelDef;
const rules = rulesJson as RulesDef;

describe('données', () => {
  it('se chargent et se valident', () => {
    const data = loadGameData();
    expect(data.items.size).toBe(5);
    expect(data.items.get('plate-carrier')?.model).toBe('models/plate-carrier.glb');
  });

  it('refusent un objet en double', () => {
    expect(() => buildGameData([...items, items[0] as ItemDef], level, rules)).toThrow(/double/);
  });

  it('exigent que le joueur commence dans sa planque', () => {
    expect(() => buildGameData(items, { ...level, spawn: [8, -8] }, rules)).toThrow(/planque/);
  });

  it('refusent un interactif qui désigne une porte inconnue', () => {
    const bad = { ...level, interactables: [...level.interactables, { id: 'x', kind: 'door', name: 'X', pos: [0, 0], y: 1 }] };
    expect(() => buildGameData(items, bad as LevelDef, rules)).toThrow(/porte/);
  });

  it('refusent des horaires incohérents', () => {
    expect(() => buildGameData(items, level, { ...rules, storeOpen: 23 })).toThrow(/ferme/);
  });
});
