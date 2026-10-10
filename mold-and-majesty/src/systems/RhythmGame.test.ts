import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import { RhythmGame, generatePattern, sporeReach } from './RhythmGame';

const def = gameData.sporulation;
const windows = { perfect: 50, good: 120 };

describe('partition', () => {
  it('est reproductible, croissante, et commence après le décompte', () => {
    const a = generatePattern(def, 42);
    expect(a).toEqual(generatePattern(def, 42));
    expect(a[0]).toBe(def.leadInMs);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]!);
  });

  it('place une note sur le premier temps de chaque mesure', () => {
    const notes = generatePattern(def, 7);
    const bar = (60000 / def.bpm / 2) * 8;
    for (let b = 0; b < def.bars; b++) {
      expect(notes.some((t) => Math.abs(t - (def.leadInMs + b * bar)) < 1)).toBe(true);
    }
  });
});

describe('jugement', () => {
  it('distingue parfait, bien et fausse note', () => {
    const game = new RhythmGame([1000, 2000, 3000], windows);
    expect(game.hit(1020)).toBe('perfect');
    expect(game.hit(2100)).toBe('good');
    expect(game.hit(2500)).toBeNull();
    expect(game.strays).toBe(1);
  });

  it('ne juge pas deux fois la même note', () => {
    const game = new RhythmGame([1000], windows);
    expect(game.hit(1000)).toBe('perfect');
    expect(game.hit(1010)).toBeNull();
  });

  it('déclare manquées les notes dépassées et termine la partie', () => {
    const game = new RhythmGame([1000, 2000], windows);
    expect(game.update(1500)).toEqual([0]);
    expect(game.finished).toBe(false);
    game.hit(2000);
    expect(game.finished).toBe(true);
    expect(game.judgements).toEqual(['miss', 'perfect']);
  });

  it('compte les combos', () => {
    const game = new RhythmGame([1000, 2000, 3000, 4000], windows);
    game.hit(1000);
    game.hit(2000);
    game.update(3500);
    game.hit(4000);
    expect(game.maxCombo).toBe(2);
    expect(game.combo).toBe(1);
  });

  it('note de 0 à 1, les fausses notes coûtent', () => {
    const perfect = new RhythmGame([1000, 2000], windows);
    perfect.hit(1000);
    perfect.hit(2000);
    expect(perfect.score()).toBe(1);
    const sloppy = new RhythmGame([1000, 2000], windows);
    sloppy.hit(1100);
    sloppy.hit(1500);
    sloppy.update(5000);
    expect(sloppy.score()).toBeCloseTo((0.5 - 0.1) / 2);
  });
});

describe('portée', () => {
  it('croît avec les spores et le score, sans jamais tomber à zéro', () => {
    expect(sporeReach(def, 10, 1)).toBeGreaterThan(sporeReach(def, 10, 0.5));
    expect(sporeReach(def, 20, 1)).toBeGreaterThan(sporeReach(def, 10, 1));
    expect(sporeReach(def, 0, 0)).toBeGreaterThan(0);
  });
});
