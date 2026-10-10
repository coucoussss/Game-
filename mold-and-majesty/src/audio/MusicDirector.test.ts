import { describe, expect, it } from 'vitest';
import { CHORD_MS, musicFor } from './MusicDirector';

describe('musique d\'ambiance', () => {
  it('se densifie et s\'anime avec la taille du réseau', () => {
    const small = musicFor(5, 'spring', 'temperate', 0);
    const big = musicFor(150, 'spring', 'temperate', 0);
    expect(big.density).toBeGreaterThan(small.density);
    expect(big.tempo).toBeGreaterThan(small.tempo);
    expect(big.chord.length).toBeGreaterThan(small.chord.length);
    expect(musicFor(10_000, 'spring', 'temperate', 0).density).toBeLessThanOrEqual(1);
  });

  it('change d\'accord au fil du temps et boucle sa progression', () => {
    const a = musicFor(10, 'autumn', 'temperate', 0);
    const b = musicFor(10, 'autumn', 'temperate', CHORD_MS);
    expect(b.chord).not.toEqual(a.chord);
    expect(musicFor(10, 'autumn', 'temperate', 4 * CHORD_MS).chord).toEqual(a.chord);
  });

  it('change d\'humeur avec la saison, de tonalité avec le biome', () => {
    expect(musicFor(10, 'winter', 'temperate', 0).mood).toBe('cold');
    expect(musicFor(10, 'spring', 'temperate', 0).mood).toBe('warm');
    expect(musicFor(10, 'spring', 'cave', 0).root).not.toBe(musicFor(10, 'spring', 'temperate', 0).root);
  });

  it('s\'assombrit face au danger', () => {
    const calm = musicFor(10, 'summer', 'temperate', 0);
    const danger = musicFor(10, 'summer', 'temperate', 0, true);
    expect(danger.mood).toBe('tense');
    expect(danger.chord[1]).toBe(calm.chord[1]! - 1);
  });
});
