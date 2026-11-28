import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import { LOOK_TIME, Notebook } from './Notebook';

const intel = loadGameData().level.intel;

describe('Notebook', () => {
  it('apprend une information regardée assez longtemps', () => {
    const nb = new Notebook(intel);
    expect(nb.observe(['store-camera'], LOOK_TIME / 2, 0)).toEqual([]);
    expect(nb.progress()).toBeCloseTo(0.5);
    const learned = nb.observe(['store-camera'], LOOK_TIME / 2 + 0.01, 0);
    expect(learned.map((d) => d.id)).toEqual(['store-camera']);
    expect(nb.has('store-camera')).toBe(true);
  });

  it('oublie le regard quand on détourne les yeux', () => {
    const nb = new Notebook(intel);
    nb.observe(['store-safe'], LOOK_TIME * 0.9, 0);
    nb.observe([], 0.1, 0);
    expect(nb.observe(['store-safe'], LOOK_TIME * 0.2, 0)).toEqual([]);
    expect(nb.has('store-safe')).toBe(false);
  });

  it('n’apprend qu’une fois', () => {
    const nb = new Notebook(intel);
    expect(nb.learn('fence', 0)).not.toBeNull();
    expect(nb.learn('fence', 1)).toBeNull();
    expect(nb.entries()).toHaveLength(1);
  });
});
