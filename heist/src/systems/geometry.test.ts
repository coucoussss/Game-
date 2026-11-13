import { describe, expect, it } from 'vitest';
import type { Rect } from '../data/types';
import { angleDiff, lineOfSight, moveCircle, segmentHitsRect } from './geometry';

const wall: Rect = { min: [0, 0], max: [1, 4] };

describe('geometry', () => {
  it('ramène les écarts angulaires dans ]−π, π]', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDiff(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });

  it('détecte un segment qui traverse un rectangle', () => {
    expect(segmentHitsRect({ x: -1, z: 2 }, { x: 2, z: 2 }, wall)).toBe(true);
    expect(segmentHitsRect({ x: -1, z: 5 }, { x: 2, z: 5 }, wall)).toBe(false);
    expect(segmentHitsRect({ x: -2, z: 2 }, { x: -1, z: 2 }, wall)).toBe(false);
  });

  it('coupe la ligne de vue derrière un mur', () => {
    expect(lineOfSight({ x: -1, z: 2 }, { x: 3, z: 2 }, [wall])).toBe(false);
    expect(lineOfSight({ x: -1, z: 6 }, { x: 3, z: 6 }, [wall])).toBe(true);
  });

  it('empêche de traverser un mur et glisse le long', () => {
    const end = moveCircle({ x: -1, z: 2 }, { x: 5, z: 1 }, 0.3, [wall]);
    expect(end.x).toBeLessThanOrEqual(-0.3 + 1e-9);
    expect(end.z).toBeCloseTo(3);
  });
});
