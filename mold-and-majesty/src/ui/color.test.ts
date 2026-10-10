import { describe, expect, it } from 'vitest';
import { hexToInt, lerpColor, shade } from './color';

describe('couleurs', () => {
  it('convertit l\'hexadécimal', () => {
    expect(hexToInt('#ff8000')).toBe(0xff8000);
    expect(() => hexToInt('#ff80')).toThrow();
  });

  it('interpole chaque composante et borne t', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0x102030, 0x405060, 0)).toBe(0x102030);
    expect(lerpColor(0x102030, 0x405060, 2)).toBe(0x405060);
  });

  it('assombrit et éclaircit', () => {
    expect(shade(0x808080, 0.5)).toBe(0x404040);
    expect(shade(0x000000, 2)).toBe(0xffffff);
  });
});
