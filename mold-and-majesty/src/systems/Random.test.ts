import { describe, expect, it } from 'vitest';
import { Random } from './Random';

describe('Random', () => {
  it('est déterministe pour une même graine', () => {
    const a = new Random(42);
    const b = new Random(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('reste dans [0, 1) et respecte les bornes entières', () => {
    const rng = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('respecte les poids d\'un tirage pondéré', () => {
    const rng = new Random(1);
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 4000; i++) counts[rng.weighted({ a: 3, b: 1, never: 0 })]++;
    expect(counts.never).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });
});
