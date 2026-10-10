import { describe, expect, it } from 'vitest';
import { TILE } from '../config';
import type { NetworkDef } from '../data/types';
import { Network } from '../entities/Network';
import { NEUTRAL_MODIFIERS, grow, removeDead, stepNetwork, transport, updateNodes, upkeep } from './FlowSystem';

/** Paramètres fixes, indépendants du réglage de network.json. */
function defs(): NetworkDef {
  const thickness = (conductance: number, decay: number, growthSpeed: number) => ({
    name: '',
    width: 1,
    conductance,
    growthSpeed,
    growthCost: 1,
    growthMinerals: 0,
    upkeep: { sugar: 0.1, water: 0.1 },
    decay,
    regen: 0.05,
  });
  return {
    flux: { sugar: { mobility: 0.5 }, water: { mobility: 0.5 }, minerals: { mobility: 0.5 }, signal: { mobility: 0.9 } },
    thickness: {
      thin: thickness(0.3, 0.2, 1),
      medium: thickness(0.6, 0.1, 0.5),
      thick: thickness(1, 0.05, 0.25),
    },
    nodes: {
      heart: { name: '', capacity: 100, cost: 0, production: { sugar: 5, water: 5 } },
      junction: { name: '', capacity: 10, cost: 0 },
      storage: { name: '', capacity: 100, cost: 8 },
      relay: { name: '', capacity: 10, cost: 4 },
      fruiting: { name: '', capacity: 10, cost: 4 },
    },
    signal: { decay: 0.05, relayThreshold: 0.01, relayStrength: 0.8, relayCost: 0.1 },
    fruiting: { signalThreshold: 0.3, sugar: 0.5, water: 0.5, rate: 0.25 },
    buildRate: 2,
  };
}

/** Deux nœuds reliés par un segment déjà poussé, d'une tuile de long. */
function pair(thickness: 'thin' | 'medium' | 'thick' = 'medium') {
  const net = new Network();
  const a = net.addNode('storage', 0, 0, { sugar: 80, water: 20 });
  const b = net.addNode('storage', TILE, 0);
  const seg = net.addSegment(a.id, b.id, thickness, true)!;
  return { net, a, b, seg };
}

/** Comme pair(), sans aucune réserve aux extrémités. */
function starvedPair(thickness: 'thin' | 'medium' | 'thick' = 'medium') {
  const p = pair(thickness);
  p.a.stock = { sugar: 0, water: 0, minerals: 0, signal: 0 };
  return p;
}

/** Chaîne cœur → n jonctions, segments déjà poussés. */
function chain(n: number, thickness: 'thin' | 'medium' | 'thick' = 'medium') {
  const net = new Network();
  const nodes = [net.addNode('heart', 0, 0, { sugar: 100, water: 100 })];
  for (let i = 1; i <= n; i++) {
    nodes.push(net.addNode('junction', i * TILE, 0));
    net.addSegment(nodes[i - 1]!.id, nodes[i]!.id, thickness, true);
  }
  return { net, nodes };
}

describe('transport', () => {
  it('conserve exactement le sucre et l\'eau', () => {
    const { net, nodes } = chain(6);
    nodes[3]!.stock.water = 7;
    const before = net.totals();
    for (let i = 0; i < 50; i++) transport(net, defs());
    const after = net.totals();
    expect(after.sugar).toBeCloseTo(before.sugar, 9);
    expect(after.water).toBeCloseTo(before.water, 9);
  });

  it('va du plein vers le vide et égalise les taux de remplissage', () => {
    const { net, a, b } = pair();
    transport(net, defs());
    expect(b.stock.sugar).toBeGreaterThan(0);
    expect(a.stock.sugar).toBeLessThan(80);
    for (let i = 0; i < 200; i++) transport(net, defs());
    expect(a.stock.sugar).toBeCloseTo(40, 3);
    expect(b.stock.sugar).toBeCloseTo(40, 3);
  });

  it('ne fait jamais déborder l\'équilibre en un tick', () => {
    const { net, a, b } = pair('thick');
    transport(net, defs());
    expect(a.stock.sugar / 100).toBeGreaterThanOrEqual(b.stock.sugar / 100);
  });

  it('égalise en pression : un petit nœud se remplit autant qu\'un grand', () => {
    const net = new Network();
    const big = net.addNode('storage', 0, 0, { water: 50 });
    const small = net.addNode('junction', TILE, 0);
    net.addSegment(big.id, small.id, 'thick', true);
    for (let i = 0; i < 500; i++) transport(net, defs());
    expect(big.stock.water / 100).toBeCloseTo(small.stock.water / 10, 3);
  });

  it('un segment épais transporte plus qu\'un fin', () => {
    const thin = pair('thin');
    const thick = pair('thick');
    transport(thin.net, defs());
    transport(thick.net, defs());
    expect(thick.b.stock.sugar).toBeGreaterThan(thin.b.stock.sugar);
  });

  it('un segment long transporte moins qu\'un court', () => {
    const short = pair();
    const net = new Network();
    const a = net.addNode('storage', 0, 0, { sugar: 80 });
    const b = net.addNode('storage', 4 * TILE, 0);
    net.addSegment(a.id, b.id, 'medium', true);
    transport(short.net, defs());
    transport(net, defs());
    expect(b.stock.sugar).toBeLessThan(short.b.stock.sugar);
  });

  it('un segment en pousse ne conduit rien', () => {
    const net = new Network();
    const a = net.addNode('storage', 0, 0, { sugar: 80 });
    const b = net.addNode('storage', TILE, 0);
    net.addSegment(a.id, b.id, 'medium');
    transport(net, defs());
    expect(b.stock.sugar).toBe(0);
  });

  it('aucun stock ne devient négatif, même en étoile', () => {
    const net = new Network();
    const hub = net.addNode('junction', 0, 0, { sugar: 10 });
    for (let i = 0; i < 12; i++) {
      const leaf = net.addNode('storage', Math.cos(i) * TILE, Math.sin(i) * TILE);
      net.addSegment(hub.id, leaf.id, 'thick', true);
    }
    for (let i = 0; i < 20; i++) {
      transport(net, defs());
      for (const n of net.nodes.values()) expect(n.stock.sugar).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('signaux', () => {
  it('s\'atténuent avec la distance au cœur', () => {
    const { net, nodes } = chain(6);
    for (let i = 0; i < 100; i++) stepNetwork(net, defs());
    const signal = nodes.map((n) => n.stock.signal / 10);
    expect(signal[1]).toBeGreaterThan(signal[3]!);
    expect(signal[3]).toBeGreaterThan(signal[6]!);
  });

  it('un relais réémet le signal plus loin', () => {
    const run = (withRelay: boolean) => {
      const { net, nodes } = chain(8);
      if (withRelay) nodes[4]!.kind = 'relay';
      for (let i = 0; i < 100; i++) {
        nodes[4]!.stock.sugar = 5; // isole l'effet du relais de l'approvisionnement en sucre
        stepNetwork(net, defs());
      }
      return nodes[8]!.stock.signal;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 2);
  });

  it('un relais sans sucre ne réémet pas', () => {
    const net = new Network();
    const relay = net.addNode('relay', 0, 0, { signal: 5 });
    updateNodes(net, defs());
    expect(relay.stock.signal).toBeCloseTo(4.75); // simple atténuation de 5 %
  });
});

describe('santé des segments', () => {
  it('un segment est nourri même si une seule extrémité a des réserves', () => {
    const { net, seg } = pair();
    for (let i = 0; i < 20; i++) upkeep(net, defs());
    expect(seg.health).toBe(1);
  });

  it('un segment affamé pâlit progressivement puis meurt', () => {
    const { net, seg } = starvedPair();
    const health: number[] = [];
    for (let i = 0; i < 30 && net.segments.has(seg.id); i++) {
      upkeep(net, defs());
      health.push(seg.health);
      removeDead(net);
    }
    expect(health[0]).toBeLessThan(1);
    expect(health[0]).toBeGreaterThan(0);
    expect(health[1]).toBeLessThan(health[0]!);
    expect(net.segments.has(seg.id)).toBe(false);
  });

  it('un segment fin meurt plus vite qu\'un épais', () => {
    const ticksToDie = (thickness: 'thin' | 'thick') => {
      const { net, seg } = starvedPair(thickness);
      let ticks = 0;
      while (net.segments.has(seg.id) && ticks < 1000) {
        upkeep(net, defs());
        removeDead(net);
        ticks++;
      }
      return ticks;
    };
    expect(ticksToDie('thin')).toBeLessThan(ticksToDie('thick'));
  });

  it('un manque partiel abîme moins qu\'une famine totale', () => {
    const partial = pair();
    partial.a.stock.sugar = 0.06; // 60 % de la demande de 0,1
    const starved = starvedPair();
    upkeep(partial.net, defs());
    upkeep(starved.net, defs());
    expect(partial.seg.health).toBeGreaterThan(starved.seg.health);
    expect(partial.seg.health).toBeLessThan(1);
  });

  it('un segment pâli se rétablit quand l\'approvisionnement revient', () => {
    const { net, seg } = pair();
    seg.health = 0.5;
    upkeep(net, defs());
    expect(seg.health).toBeCloseTo(0.55);
  });

  it('la mort d\'un segment emporte les nœuds isolés, jamais le cœur', () => {
    const { net, nodes } = chain(1);
    net.segments.values().next().value!.health = 0;
    removeDead(net);
    expect(net.nodes.has(nodes[0]!.id)).toBe(true);
    expect(net.nodes.has(nodes[1]!.id)).toBe(false);
  });

  it('un réseau trop étendu en filaments fins finit par affamer son extrémité', () => {
    const { net } = chain(30, 'thin');
    const last = [...net.segments.values()].at(-1)!;
    for (let i = 0; i < 400; i++) stepNetwork(net, defs());
    expect(net.segments.has(last.id)).toBe(false);
  });
});

describe('pousse', () => {
  it('consomme le sucre du nœud d\'origine et active le segment', () => {
    const net = new Network();
    const a = net.addNode('storage', 0, 0, { sugar: 50 });
    const b = net.addNode('junction', 2 * TILE, 0);
    const seg = net.addSegment(a.id, b.id, 'medium')!; // 0,5 tuile/tick sur 2 tuiles
    grow(net, defs());
    expect(seg.growth).toBeCloseTo(0.25);
    expect(a.stock.sugar).toBeCloseTo(49.5);
    for (let i = 0; i < 3; i++) grow(net, defs());
    expect(seg.growth).toBe(1);
    expect(a.stock.sugar).toBeCloseTo(48);
  });

  it('un filament fin pousse plus vite qu\'un épais', () => {
    const growth = (thickness: 'thin' | 'thick') => {
      const net = new Network();
      const a = net.addNode('storage', 0, 0, { sugar: 50 });
      const b = net.addNode('junction', 4 * TILE, 0);
      const seg = net.addSegment(a.id, b.id, thickness)!;
      grow(net, defs());
      return seg.growth;
    };
    expect(growth('thin')).toBeGreaterThan(growth('thick'));
  });

  it('cale sans sucre', () => {
    const net = new Network();
    const a = net.addNode('junction', 0, 0);
    const b = net.addNode('junction', TILE, 0);
    const seg = net.addSegment(a.id, b.id, 'thin')!;
    grow(net, defs());
    expect(seg.growth).toBe(0);
  });
});

describe('nœuds', () => {
  it('le cœur produit et plafonne à sa capacité', () => {
    const net = new Network();
    const heart = net.addNode('heart', 0, 0, { sugar: 98 });
    updateNodes(net, defs());
    expect(heart.stock.sugar).toBe(100);
    expect(heart.stock.water).toBe(5);
    expect(heart.stock.signal).toBe(100);
  });

  it('une ruche fructifie seulement avec du signal', () => {
    const run = (signal: number) => {
      const net = new Network();
      const hive = net.addNode('fruiting', 0, 0, { sugar: 10, water: 10, signal });
      for (let i = 0; i < 4; i++) {
        hive.stock.signal = signal;
        updateNodes(net, defs());
      }
      return net.spores;
    };
    expect(run(10)).toBe(1); // 4 × 0,25
    expect(run(0)).toBe(0);
  });

  it('une conversion investit du sucre avant de rendre le nœud opérationnel', () => {
    const net = new Network();
    const node = net.addNode('relay', 0, 0, { sugar: 3, signal: 5 });
    node.build = 0;
    updateNodes(net, defs()); // 2 de sucre investis sur 4
    expect(node.build).toBeCloseTo(0.5);
    expect(node.stock.signal).toBeCloseTo(4.75); // pas encore de réémission
    updateNodes(net, defs()); // il ne reste que 1 de sucre
    expect(node.build).toBeCloseTo(0.75);
  });
});

describe('modificateurs de saison', () => {
  const mods = (overrides: Partial<typeof NEUTRAL_MODIFIERS>) => ({ ...NEUTRAL_MODIFIERS, ...overrides });

  it('sans production (hiver), le cœur ne crée plus de sucre', () => {
    const net = new Network();
    const heart = net.addNode('heart', 0, 0);
    updateNodes(net, defs(), mods({ sugarProduction: 0 }));
    expect(heart.stock.sugar).toBe(0);
  });

  it('le cœur échange des minéraux contre du sucre avec les arbres', () => {
    const net = new Network();
    const heart = net.addNode('heart', 0, 0, { minerals: 1 });
    updateNodes(net, defs(), mods({ sugarProduction: 0, mineralTrade: 0.4, tradeRatio: 5 }));
    expect(heart.stock.minerals).toBeCloseTo(0.6);
    expect(heart.stock.sugar).toBeCloseTo(2);
  });

  it('pas d\'échange sans minéraux', () => {
    const net = new Network();
    const heart = net.addNode('heart', 0, 0);
    updateNodes(net, defs(), mods({ sugarProduction: 0, mineralTrade: 0.4, tradeRatio: 5 }));
    expect(heart.stock.sugar).toBe(0);
  });

  it('la pousse accélère au printemps et coûte moins', () => {
    const growth = (m: typeof NEUTRAL_MODIFIERS) => {
      const net = new Network();
      const a = net.addNode('storage', 0, 0, { sugar: 50 });
      const b = net.addNode('junction', 4 * TILE, 0);
      const seg = net.addSegment(a.id, b.id, 'thick')!;
      grow(net, defs(), m);
      return { growth: seg.growth, spent: 50 - a.stock.sugar };
    };
    const normal = growth(NEUTRAL_MODIFIERS);
    const spring = growth(mods({ growthSpeed: 2, growthCost: 0.5 }));
    expect(spring.growth).toBeCloseTo(normal.growth * 2);
    expect(spring.spent).toBeCloseTo(normal.spent); // deux fois plus de pousse pour le même prix
  });

  it('un filament qui exige des minéraux cale sans eux', () => {
    const d = defs();
    d.thickness.thick.growthMinerals = 1;
    const net = new Network();
    const a = net.addNode('storage', 0, 0, { sugar: 50 });
    const b = net.addNode('junction', 4 * TILE, 0);
    const seg = net.addSegment(a.id, b.id, 'thick')!;
    grow(net, d);
    expect(seg.growth).toBe(0);
    a.stock.minerals = 10;
    grow(net, d);
    expect(seg.growth).toBeGreaterThan(0);
    expect(a.stock.minerals).toBeLessThan(10);
  });

  it('l\'entretien réduit de l\'hiver épargne les réserves', () => {
    const spent = (upkeepMul: number) => {
      const { net, a } = pair();
      upkeep(net, defs(), mods({ upkeep: upkeepMul }));
      return 80 - a.stock.sugar;
    };
    expect(spent(0.1)).toBeCloseTo(spent(1) / 10);
  });

  it('pas de fructification hors saison', () => {
    const net = new Network();
    const hive = net.addNode('fruiting', 0, 0, { sugar: 10, water: 10, signal: 10 });
    for (let i = 0; i < 10; i++) updateNodes(net, defs(), mods({ fruiting: 0 }));
    expect(net.spores).toBe(0);
    expect(hive.stock.sugar).toBe(10);
  });

  it('la mémoire ralentit le dépérissement', () => {
    const health = (decay: number) => {
      const { net, seg } = starvedPair();
      upkeep(net, defs(), mods({ decay }));
      return seg.health;
    };
    expect(health(0.5)).toBeGreaterThan(health(1));
  });
});

describe('simulation complète', () => {
  it('un réseau épais et court se stabilise en bonne santé', () => {
    const { net } = chain(4, 'thick');
    for (let i = 0; i < 500; i++) stepNetwork(net, defs());
    expect(net.segments.size).toBe(4);
    for (const seg of net.segments.values()) expect(seg.health).toBe(1);
  });
});
