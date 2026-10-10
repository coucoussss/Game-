import { describe, expect, it } from 'vitest';
import { GROUND_Y, TILE } from '../config';
import { gameData } from '../data';
import type { SoilDef } from '../data/types';
import { Network } from '../entities/Network';
import { Random } from './Random';
import { type Deposit, absorb, applyFrost, applyLitter, generateDeposits, layerAt, stepMoisture } from './SoilSystem';

const forest = gameData.forests.get('whispering-grove')!;
const surfaceY = GROUND_Y + 4;
const humusY = GROUND_Y + forest.layers.surface * TILE + 10;
const deepY = GROUND_Y + (forest.layers.surface + forest.layers.humus) * TILE + 10;

const soil: SoilDef = {
  waterRate: 1,
  layerWater: { surface: 1, humus: 0.5, deep: 0.25 },
  layerBuffer: { surface: 0, humus: 0, deep: 0 },
  mineralRate: 2,
  mineralRadius: 10,
  moistureRate: 0.1,
};

describe('couches', () => {
  it('situe une ordonnée dans sa couche', () => {
    expect(layerAt(GROUND_Y - 1, forest)).toBeNull();
    expect(layerAt(surfaceY, forest)).toBe('surface');
    expect(layerAt(humusY, forest)).toBe('humus');
    expect(layerAt(deepY, forest)).toBe('deep');
  });

  it('génère les gisements dans leur couche, de façon reproductible', () => {
    const a = generateDeposits(forest, 384, new Random(1));
    const b = generateDeposits(forest, 384, new Random(1));
    expect(a).toEqual(b);
    const total = forest.deposits.surface.count + forest.deposits.humus.count + forest.deposits.deep.count;
    expect(a).toHaveLength(total);
    for (const d of a) expect(layerAt(d.y, forest)).toBe(d.layer);
  });
});

describe('absorption', () => {
  it('l\'eau dépend de l\'humidité et de la couche', () => {
    const net = new Network();
    const top = net.addNode('junction', 10, surfaceY);
    const deep = net.addNode('junction', 50, deepY);
    absorb(net, [], soil, forest, 0.5, false);
    expect(top.stock.water).toBeCloseTo(0.5);
    expect(deep.stock.water).toBeCloseTo(0.125);
  });

  it('les couches profondes gardent leur humidité pendant une sécheresse', () => {
    const buffered = { ...soil, layerBuffer: { surface: 0, humus: 0.3, deep: 0.6 } };
    const net = new Network();
    const top = net.addNode('junction', 10, surfaceY);
    const deep = net.addNode('junction', 50, deepY);
    absorb(net, [], buffered, forest, 0, false);
    expect(top.stock.water).toBe(0);
    expect(deep.stock.water).toBeCloseTo(0.25 * 0.6);
  });

  it('la surface gelée ne donne plus d\'eau', () => {
    const net = new Network();
    const top = net.addNode('junction', 10, surfaceY);
    const humus = net.addNode('junction', 50, humusY);
    absorb(net, [], soil, forest, 1, true);
    expect(top.stock.water).toBe(0);
    expect(humus.stock.water).toBeGreaterThan(0);
  });

  it('les minéraux viennent des gisements à portée, qui s\'épuisent', () => {
    const net = new Network();
    const near = net.addNode('junction', 100, humusY);
    const far = net.addNode('junction', 200, humusY);
    const deposit: Deposit = { x: 105, y: humusY, layer: 'humus', amount: 3, max: 3 };
    absorb(net, [deposit], soil, forest, 0, false);
    expect(near.stock.minerals).toBe(2);
    expect(far.stock.minerals).toBe(0);
    absorb(net, [deposit], soil, forest, 0, false);
    expect(near.stock.minerals).toBe(3);
    expect(deposit.amount).toBe(0);
  });

  it('l\'humidité suit la météo progressivement', () => {
    expect(stepMoisture(0, 1, 0.1)).toBeCloseTo(0.1);
    let m = 0;
    for (let i = 0; i < 100; i++) m = stepMoisture(m, 1, 0.1);
    expect(m).toBeCloseTo(1, 3);
  });
});

describe('gel et litière', () => {
  it('le gel abîme les filaments de surface, les fins plus que les épais', () => {
    const net = new Network();
    const a = net.addNode('junction', 10, surfaceY);
    const b = net.addNode('junction', 20, surfaceY);
    const c = net.addNode('junction', 30, surfaceY);
    const d = net.addNode('junction', 10, deepY);
    const thin = net.addSegment(a.id, b.id, 'thin', true)!;
    const thick = net.addSegment(b.id, c.id, 'thick', true)!;
    const buried = net.addSegment(a.id, d.id, 'thin', true)!; // milieu dans l'humus
    applyFrost(net, gameData.network, forest, 1, 1);
    expect(thin.health).toBeLessThan(thick.health);
    expect(thick.health).toBeLessThan(1);
    expect(buried.health).toBe(1);
  });

  it('la litière reconstitue les gisements de surface sans dépasser leur maximum', () => {
    const deposits: Deposit[] = [
      { x: 0, y: surfaceY, layer: 'surface', amount: 0, max: 10 },
      { x: 0, y: surfaceY, layer: 'surface', amount: 9, max: 10 },
      { x: 0, y: deepY, layer: 'deep', amount: 0, max: 10 },
    ];
    applyLitter(deposits, 4);
    expect(deposits.map((d) => d.amount)).toEqual([2, 10, 0]);
  });
});
