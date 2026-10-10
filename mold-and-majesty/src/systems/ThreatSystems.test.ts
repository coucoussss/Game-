import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../config';
import { gameData } from '../data';
import type { ThreatsDef } from '../data/types';
import { createAlly } from './AllySystem';
import {
  ASH_MINERALS,
  type ClimateContext,
  applyClimate,
  fireSpan,
  floodLevel,
  onClimateEnd,
  onClimateStart,
  rollClimate,
  startClimate,
} from './ClimateSystem';
import type { WorldEvent } from './events';
import { Network } from '../entities/Network';
import { type RivalColony, cellKey } from '../entities/Rival';
import { type ParasiteContext, seedInfection, stepParasites } from './ParasiteSystem';
import { Random } from './Random';
import { type RivalContext, applyToxins, cellCenter, chemicalDefense, feedColonies, spawnColony, stepRivals } from './RivalSystem';
import { layerBounds } from './SoilSystem';
import { World } from './World';

const forest = gameData.forests.get('whispering-grove')!;
const bounds = layerBounds(forest);
const summer = gameData.seasons.seasons.find((s) => s.id === 'summer')!;
const winter = gameData.seasons.seasons.find((s) => s.id === 'winter')!;
const CS = gameData.threats.rivals.cellSize;

function rivalContext(net = new Network(), threats: ThreatsDef = gameData.threats): RivalContext & { events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  let id = 100;
  return {
    net,
    netDefs: gameData.network,
    threats,
    forest,
    deposits: [],
    season: summer,
    widthPx: 384,
    rng: new Random(2),
    decay: 1,
    emit: (e) => events.push(e),
    nextId: () => id++,
    events,
  };
}

/** Colonie d'un bloc de cellules centré sur (x, y). */
function blob(kind: string, x: number, y: number, size = 3): RivalColony {
  const colony: RivalColony = { id: 1, kind, cells: new Map() };
  const gx0 = Math.floor(x / CS);
  const gy0 = Math.floor(y / CS);
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      colony.cells.set(cellKey(gx0 + dx, gy0 + dy), { gx: gx0 + dx, gy: gy0 + dy, hp: gameData.threats.rivals.kinds[kind]!.hp });
    }
  }
  return colony;
}

describe('moisissures rivales', () => {
  it('naissent loin du cœur, dans le sol', () => {
    const net = new Network();
    const heart = net.addNode('heart', 192, 128);
    const ctx = rivalContext(net);
    const colonies: RivalColony[] = [];
    for (let i = 0; i < 3; i++) spawnColony(colonies, ctx);
    expect(colonies.length).toBe(gameData.threats.rivals.maxColonies);
    expect(spawnColony(colonies, ctx)).toBeNull();
    for (const c of colonies) {
      for (const cell of c.cells.values()) {
        const x = cellCenter(cell.gx, CS);
        const y = cellCenter(cell.gy, CS);
        expect(y).toBeGreaterThan(GROUND_Y);
        expect(Math.hypot(x - heart.x, y - heart.y)).toBeGreaterThan(gameData.threats.rivals.minDistance - CS * 6);
      }
    }
    expect(ctx.events.filter((e) => e.type === 'rival')).toHaveLength(3);
  });

  it('grandissent avec le temps, sans dépasser leur taille maximale', () => {
    const ctx = rivalContext();
    const colonies = [blob('verdigris', 100, 150, 1)];
    for (let i = 0; i < 20000; i++) stepRivals(colonies, ctx, false);
    const size = colonies[0]!.cells.size;
    expect(size).toBeGreaterThan(10);
    expect(size).toBeLessThanOrEqual(gameData.threats.rivals.kinds.verdigris!.maxCells);
  });

  it('empoisonnent les segments proches, les fins plus que les épais', () => {
    const net = new Network();
    const a = net.addNode('junction', 100, 140);
    const b = net.addNode('junction', 110, 140);
    const c = net.addNode('junction', 100, 150);
    const thin = net.addSegment(a.id, b.id, 'thin', true)!;
    const thick = net.addSegment(a.id, c.id, 'thick', true)!;
    const far1 = net.addNode('junction', 300, 140);
    const far2 = net.addNode('junction', 310, 140);
    const far = net.addSegment(far1.id, far2.id, 'thin', true)!;
    applyToxins([blob('black-rot', 100, 140)], rivalContext(net));
    expect(thin.health).toBeLessThan(thick.health);
    expect(thick.health).toBeLessThan(1);
    expect(far.health).toBe(1);
  });

  it('reculent devant un nœud riche en signal, qui paie en sucre', () => {
    const net = new Network();
    const relay = net.addNode('relay', 102, 142, { signal: 50, sugar: 50 });
    const colony = blob('verdigris', 100, 140);
    const before = colony.cells.size;
    for (let i = 0; i < 100; i++) chemicalDefense([colony], rivalContext(net));
    expect(colony.cells.size).toBeLessThan(before);
    expect(relay.stock.sugar).toBeLessThan(50);
  });

  it('un nœud sans signal ne se défend pas', () => {
    const net = new Network();
    net.addNode('junction', 102, 142, { sugar: 50 });
    const colony = blob('verdigris', 100, 140);
    for (let i = 0; i < 100; i++) chemicalDefense([colony], rivalContext(net));
    expect(colony.cells.size).toBe(9);
  });

  it('une colonie anéantie disparaît et donne de la mémoire', () => {
    // Colonie figée (sans croissance ni nouvelles apparitions) au contact du cœur.
    const threats = structuredClone(gameData.threats);
    threats.rivals.kinds.verdigris!.growthChance = 0;
    threats.rivals.chancePerTick = 0;
    const world = new World({ ...gameData, threats, eventChance: 0 }, 'whispering-grove', 1, { threats: true });
    const heart = [...world.net.nodes.values()][0]!;
    world.colonies.push(blob('verdigris', heart.x + 4, heart.y, 2));
    for (let i = 0; i < 200 && world.colonies.length > 0; i++) world.step();
    expect(world.colonies).toHaveLength(0);
    expect(world.memory).toBeGreaterThanOrEqual(gameData.threats.rivals.victoryMemory);
  });

  it('dévorent les minéraux des gisements recouverts', () => {
    const ctx = rivalContext();
    ctx.deposits.push({ x: 102, y: 142, layer: 'humus', amount: 10, max: 10 });
    feedColonies([blob('black-rot', 100, 140)], ctx);
    expect(ctx.deposits[0]!.amount).toBeLessThan(10);
  });
});

describe('parasites', () => {
  function chain() {
    const net = new Network();
    const nodes = [0, 1, 2, 3].map((i) => net.addNode('junction', i * 10, 150, { sugar: 20 }));
    for (let i = 1; i < nodes.length; i++) net.addSegment(nodes[i - 1]!.id, nodes[i]!.id, 'thick', true);
    const events: WorldEvent[] = [];
    const ctx: ParasiteContext = {
      net,
      netDefs: gameData.network,
      threats: structuredClone(gameData.threats),
      season: summer,
      rng: new Random(4),
      emit: (e) => events.push(e),
    };
    return { net, nodes, ctx, events };
  }

  it('se propagent le long des segments', () => {
    const { nodes, ctx, events } = chain();
    ctx.threats.parasites.spread = 0.05;
    nodes[0]!.infection = 1;
    for (let i = 0; i < 2000; i++) stepParasites(ctx, false);
    expect(nodes[3]!.infection).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'infection' && e.fromNodeId !== null)).toBe(true);
  });

  it('couper le segment arrête la contagion', () => {
    const { net, nodes, ctx } = chain();
    ctx.threats.parasites.spread = 0.05;
    nodes[0]!.infection = 1;
    net.removeSegment(net.segmentBetween(nodes[1]!.id, nodes[2]!.id)!.id);
    for (let i = 0; i < 2000; i++) stepParasites(ctx, false);
    expect(nodes[2]!.infection).toBe(0);
    expect(nodes[3]!.infection).toBe(0);
  });

  it('volent du sucre et, saturés, abîment les filaments', () => {
    const { net, nodes, ctx } = chain();
    nodes[0]!.infection = 0.9;
    stepParasites(ctx, false);
    expect(nodes[0]!.stock.sugar).toBeLessThan(20);
    expect(net.segmentsOf(nodes[0]!.id)[0]!.health).toBeLessThan(1);
  });

  it('le signal les soigne', () => {
    const { nodes, ctx } = chain();
    ctx.threats.parasites.spread = 0;
    const full = gameData.network.nodes.junction.capacity;
    nodes[0]!.infection = 0.2;
    for (let i = 0; i < 500; i++) {
      nodes[0]!.stock.signal = full;
      stepParasites(ctx, false);
    }
    expect(nodes[0]!.infection).toBe(0);
  });

  it('n\'infectent jamais le cœur au hasard', () => {
    const net = new Network();
    net.addNode('heart', 0, 0);
    const ctx: ParasiteContext = {
      net,
      netDefs: gameData.network,
      threats: gameData.threats,
      season: summer,
      rng: new Random(1),
      emit: () => {},
    };
    expect(seedInfection(ctx)).toBeNull();
  });
});

describe('climat', () => {
  function climateContext(): ClimateContext & { net: Network } {
    return {
      net: new Network(),
      netDefs: gameData.network,
      forest,
      deposits: [],
      allies: [],
      decay: 1,
      emit: () => {},
    };
  }
  const event = (id: string) => gameData.events.get(id)!;

  it('ne tire que des événements possibles en cette saison', () => {
    const rng = new Random(1);
    const events = [...gameData.events.values()];
    for (let i = 0; i < 100; i++) {
      const e = rollClimate(events, winter, rng)!;
      expect(e.seasons.winter).toBeGreaterThan(0);
    }
    expect(rollClimate([event('fire')], winter, rng)).toBeNull();
  });

  it('l\'inondation monte, noie les filaments profonds, puis se retire', () => {
    const ctx = climateContext();
    const c = startClimate(event('flood'), new Random(1), 384);
    const deepY = bounds.deep[0] + 20;
    const a = ctx.net.addNode('junction', 100, deepY);
    const b = ctx.net.addNode('junction', 110, deepY);
    const c2 = ctx.net.addNode('junction', 100, bounds.surface[0] + 4);
    const d = ctx.net.addNode('junction', 110, bounds.surface[0] + 4);
    const deep = ctx.net.addSegment(a.id, b.id, 'thin', true)!;
    const high = ctx.net.addSegment(c2.id, d.id, 'thin', true)!;
    const start = floodLevel(c, forest);
    c.ticksLeft = Math.round(c.duration / 2);
    const peak = floodLevel(c, forest);
    expect(peak).toBeLessThan(start); // l'eau est montée
    applyClimate(c, ctx);
    expect(deep.health).toBeLessThan(1);
    expect(high.health).toBe(1);
    c.ticksLeft = 0;
    expect(floodLevel(c, forest)).toBeCloseTo(start);
  });

  it('le feu s\'étend, brûle les arbres et les filaments de surface, puis rend des cendres', () => {
    const ctx = climateContext();
    const c = startClimate(event('fire'), new Random(1), 384);
    const tree = createAlly(1, 'tree', gameData.allies, c.x + 30, GROUND_Y - 1, new Random(1));
    ctx.allies.push(tree);
    const a = ctx.net.addNode('junction', c.x + 26, bounds.surface[0] + 4);
    const b = ctx.net.addNode('junction', c.x + 34, bounds.surface[0] + 4);
    const seg = ctx.net.addSegment(a.id, b.id, 'thick', true)!;
    let ticks = 0;
    while (tree.state !== 'burnt' && ticks < c.duration) {
      c.ticksLeft--;
      ticks++;
      applyClimate(c, ctx);
    }
    expect(tree.state).toBe('burnt');
    expect(fireSpan(c)[1]).toBeGreaterThan(c.x + 20);
    expect(seg.health).toBeLessThan(1);
    ctx.deposits.push({ x: 0, y: bounds.surface[0] + 4, layer: 'surface', amount: 0, max: 1000 });
    onClimateEnd(c, ctx);
    expect(ctx.deposits[0]!.amount).toBe(ASH_MINERALS);
  });

  it('un chêne abattu dépose un gisement riche en surface', () => {
    const ctx = climateContext();
    const c = startClimate(event('fallen-oak'), new Random(1), 384);
    onClimateStart(c, ctx);
    expect(ctx.deposits).toHaveLength(1);
    expect(ctx.deposits[0]!.layer).toBe('surface');
    expect(ctx.deposits[0]!.amount).toBe(event('fallen-oak').intensity);
  });

  it('la sécheresse assèche le sol, le gel tardif gèle la surface (dans le monde)', () => {
    const world = new World(gameData, 'whispering-grove', 1, { threats: false });
    world.moisture = 1;
    world.startClimate('drought');
    for (let i = 0; i < 1000; i++) world.step();
    expect(world.moisture).toBeLessThan(0.05);

    const frosty = new World(gameData, 'whispering-grove', 1, { threats: false });
    const heart = [...frosty.net.nodes.values()][0]!;
    const a = frosty.net.addNode('junction', heart.x, bounds.surface[0] + 4);
    const b = frosty.net.addNode('junction', heart.x + 10, bounds.surface[0] + 4);
    frosty.net.addSegment(heart.id, a.id, 'thick', true);
    const seg = frosty.net.addSegment(a.id, b.id, 'thin', true)!;
    a.stock.sugar = b.stock.sugar = 0;
    frosty.startClimate('cold-snap');
    frosty.step();
    expect(seg.health).toBeLessThan(1);
    expect(frosty.season.def.id).toBe('spring');
  });
});
