import { describe, expect, it } from 'vitest';
import { PALETTE_CHARS } from './palette';
import { SPRITES, spriteSize } from './sprites';

describe('sprites', () => {
  it('chaque image est un rectangle de taille constante, dans la palette', () => {
    for (const [name, def] of Object.entries(SPRITES)) {
      const { w, h } = spriteSize(def);
      for (const frame of def.frames) {
        expect(frame, name).toHaveLength(h);
        for (const row of frame) {
          expect(row.length, `${name} : « ${row} »`).toBe(w);
          for (const ch of row) if (ch !== '.') expect(PALETTE_CHARS, `${name} : couleur « ${ch} »`).toHaveProperty(ch);
        }
      }
    }
  });

  it('la palette reste limitée', () => {
    expect(Object.keys(PALETTE_CHARS).length).toBeLessThanOrEqual(24);
  });
});
