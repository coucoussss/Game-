import { describe, expect, it } from 'vitest';
import { computeIntegerZoom } from './integerScale';

describe('computeIntegerZoom', () => {
  it('retourne 5 pour du 1920x1080', () => {
    expect(computeIntegerZoom(1920, 1080)).toBe(5);
  });

  it('arrondit vers le bas selon la dimension limitante', () => {
    expect(computeIntegerZoom(1280, 1024)).toBe(3); // largeur : 3.33, hauteur : 4.74
  });

  it('ne descend jamais sous 1', () => {
    expect(computeIntegerZoom(200, 100)).toBe(1);
  });
});
