import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import type { Rect } from '../data/types';
import { NavGrid } from './NavGrid';

const bounds: Rect = { min: [0, 0], max: [10, 10] };
// Un mur qui coupe la zone en deux, avec un passage en haut.
const wall: Rect = { min: [4.8, 2], max: [5.2, 10] };

function length(points: { x: number; z: number }[], from: { x: number; z: number }): number {
  let total = 0;
  let prev = from;
  for (const p of points) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}

describe('NavGrid', () => {
  it('va tout droit quand rien ne gêne', () => {
    const nav = new NavGrid(bounds, []);
    const path = nav.path({ x: 1, z: 1 }, { x: 9, z: 9 });
    expect(path.at(-1)).toEqual({ x: 9, z: 9 });
    expect(path.length).toBeLessThanOrEqual(2);
  });

  it('contourne un mur', () => {
    const nav = new NavGrid(bounds, [wall]);
    const a = { x: 2, z: 8 };
    const b = { x: 8, z: 8 };
    const path = nav.path(a, b);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(b);
    expect(length(path, a)).toBeGreaterThan(12);
    let prev = a;
    for (const p of path) {
      expect(nav.walkable(prev, p)).toBe(true);
      prev = p;
    }
  });

  it('relie la rue à la chambre forte de la banque', () => {
    const { level } = loadGameData();
    const nav = new NavGrid(level.bounds, level.walls.map((w) => w.rect));
    const path = nav.path({ x: 50, z: 0 }, { x: 42, z: -12.4 });
    expect(path.length).toBeGreaterThan(2);
    const end = path.at(-1);
    expect(Math.hypot((end?.x ?? 0) - 42, (end?.z ?? 0) + 12.4)).toBeLessThan(1);
  });

  it('relie la planque à chaque cible et à la ruelle', () => {
    const { level } = loadGameData();
    const nav = new NavGrid(level.bounds, level.walls.map((w) => w.rect));
    for (const target of [[-16, -6], [16, -5], [50, -6], [-30, -16.5], [-9.5, -12.5], [14, -12]] as const) {
      expect(nav.path({ x: -45, z: -9 }, { x: target[0], z: target[1] }).length).toBeGreaterThan(0);
    }
  });
});
