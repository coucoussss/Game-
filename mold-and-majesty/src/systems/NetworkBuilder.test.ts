import { describe, expect, it } from 'vitest';
import { Network } from '../entities/Network';
import { StrokeBuilder, convertNode, snapToGrid } from './NetworkBuilder';

const options = { grid: 4, step: 10, snapRadius: 6, bounds: { minX: 0, maxX: 200, minY: 50, maxY: 150 } };

function setup() {
  const net = new Network();
  const heart = net.addNode('heart', 100, 100);
  return { net, heart, stroke: new StrokeBuilder(net, options) };
}

describe('snapToGrid', () => {
  it('aimante à la graduation la plus proche', () => {
    expect(snapToGrid(9, 4)).toBe(8);
    expect(snapToGrid(10.5, 4)).toBe(12);
  });
});

describe('StrokeBuilder', () => {
  it('refuse un tracé qui ne part pas d\'un nœud', () => {
    const { stroke } = setup();
    expect(stroke.begin(20, 60)).toBe(false);
    expect(stroke.begin(103, 98)).toBe(true);
  });

  it('pose un point tous les `step` pixels, sur la grille', () => {
    const { net, stroke } = setup();
    stroke.begin(100, 100);
    const created = stroke.move(135, 100, 'thin');
    expect(created).toHaveLength(3);
    expect([...net.nodes.values()].map((n) => n.x)).toEqual([100, 112, 124, 136]);
    expect(created.every((s) => s.growth === 0 && s.thickness === 'thin')).toBe(true);
  });

  it('aimante le tracé à un nœud existant pour fermer une boucle', () => {
    const { net, heart, stroke } = setup();
    const other = net.addNode('junction', 108, 100);
    stroke.begin(100, 100);
    stroke.move(111, 100, 'medium');
    expect(net.segmentBetween(heart.id, other.id)).toBeDefined();
    expect(net.nodes.size).toBe(2);
  });

  it('s\'arrête au bord de la zone constructible', () => {
    const { net, stroke } = setup();
    stroke.begin(100, 100);
    stroke.move(100, 0, 'thin');
    for (const n of net.nodes.values()) expect(n.y).toBeGreaterThanOrEqual(50);
  });

  it('ne fait rien après end()', () => {
    const { net, stroke } = setup();
    stroke.begin(100, 100);
    stroke.end();
    expect(stroke.move(150, 100, 'thin')).toEqual([]);
    expect(net.nodes.size).toBe(1);
  });
});

describe('convertNode', () => {
  it('convertit une jonction et remet sa construction à zéro', () => {
    const net = new Network();
    const node = net.addNode('junction', 0, 0);
    expect(convertNode(net, node.id, 'relay')).toBe(true);
    expect(node.kind).toBe('relay');
    expect(node.build).toBe(0);
  });

  it('refuse de convertir le cœur ou vers un rôle interdit', () => {
    const net = new Network();
    const heart = net.addNode('heart', 0, 0);
    const node = net.addNode('junction', 10, 0);
    expect(convertNode(net, heart.id, 'storage')).toBe(false);
    expect(convertNode(net, node.id, 'heart')).toBe(false);
  });
});
