import { describe, expect, it } from 'vitest';
import { SPRITES } from '../art/sprites';
import { gameData } from '../data';
import memories from '../data/memories.json';
import { type MemoryDef, cuesBetween, evaluate, initialState, validateSequence } from './Sequence';

const all = memories as unknown as MemoryDef[];
const sprites = new Set([...Object.keys(SPRITES), 'water']);

const demo: MemoryDef = {
  id: 'demo',
  numeral: '0',
  title: 'Démo',
  duration: 10000,
  backdrop: { sky: '#000000', soil: '#000000', surfaceY: 80, features: [] },
  music: { root: 220, tempo: 60, mood: 'warm' },
  actors: [{ id: 'a', sprite: 'king', x: 0, y: 10, alpha: 0 }],
  cues: [
    { t: 1000, actor: 'a', to: { x: 100 }, duration: 1000, ease: 'linear' },
    { t: 3000, actor: 'a', to: { x: 50, alpha: 1 }, duration: 2000, ease: 'linear' },
    { t: 0, camera: { zoom: 2 }, duration: 0 },
    { t: 4000, fade: 1, duration: 1000, ease: 'linear' },
    { t: 2000, shake: 2 },
    { t: 2500, sfx: 'chime' },
  ],
};

describe('séquences', () => {
  it('interpole les acteurs entre les repères', () => {
    expect(evaluate(demo, 0).actors.a!.x).toBe(0);
    expect(evaluate(demo, 1500).actors.a!.x).toBeCloseTo(50);
    expect(evaluate(demo, 2500).actors.a!.x).toBe(100);
    expect(evaluate(demo, 4000).actors.a!.x).toBeCloseTo(75);
    expect(evaluate(demo, 4000).actors.a!.alpha).toBeCloseTo(0.5);
    expect(evaluate(demo, 9000).actors.a!.x).toBe(50);
  });

  it('gère caméra et fondu', () => {
    expect(initialState(demo).camera).toEqual({ x: 192, y: 108, zoom: 1 });
    expect(evaluate(demo, 10).camera.zoom).toBe(2);
    expect(evaluate(demo, 4500).fade).toBeCloseTo(0.5);
  });

  it('déclenche les repères ponctuels une seule fois au passage', () => {
    expect(cuesBetween(demo, 0, 2000)).toHaveLength(0);
    expect(cuesBetween(demo, 2000, 3000).map((c) => c.shake ?? c.sfx)).toEqual([2, 'chime']);
    expect(cuesBetween(demo, 3000, 9000)).toHaveLength(0);
  });

  it('refuse les transitions qui se chevauchent', () => {
    const bad = { ...demo, cues: [...demo.cues, { t: 1500, actor: 'a', to: { x: 5 }, duration: 100 }] };
    expect(() => validateSequence(bad, sprites)).toThrow(/chevauchent/);
  });

  it('refuse un acteur ou un sprite inconnu', () => {
    expect(() => validateSequence({ ...demo, cues: [{ t: 0, actor: 'zz', to: { x: 1 } }] }, sprites)).toThrow(/acteur inconnu/);
    expect(() => validateSequence({ ...demo, actors: [{ id: 'a', sprite: 'dragon' }] }, sprites)).toThrow(/sprite inconnu/);
  });
});

describe('les 8 souvenirs', () => {
  it('sont valides et commencent comme ils finissent : dans le noir', () => {
    expect(all).toHaveLength(8);
    for (const m of all) {
      validateSequence(m, sprites);
      expect(evaluate(m, 0).fade).toBe(1);
      expect(evaluate(m, m.duration).fade).toBeCloseTo(1);
      expect(evaluate(m, m.duration / 2).fade).toBe(0);
    }
  });

  it('chaque forêt de la campagne ouvre un souvenir différent', () => {
    const ids = [...gameData.forests.values()].map((f) => f.memory);
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) expect(all.some((m) => m.id === id)).toBe(true);
  });
});
