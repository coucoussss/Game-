import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../config';
import { gameData } from '../data';
import type { AlliesDef, AllySpeciesId, SeasonDef } from '../data/types';
import type { Ally } from '../entities/Ally';
import { moodOf } from '../entities/Ally';
import { Network } from '../entities/Network';
import { type AllyContext, betray, createAlly, findContact, rollPersonality, stepAlly, trade } from './AllySystem';
import type { WorldEvent } from './events';
import { Random } from './Random';

const forest = gameData.forests.get('whispering-grove')!;
const summer = gameData.seasons.seasons.find((s) => s.id === 'summer')!;
const winter = gameData.seasons.seasons.find((s) => s.id === 'winter')!;
const humusY = GROUND_Y + forest.layers.surface * 8 + 10;

function setup(species: AllySpeciesId, season: SeasonDef = summer, defs: AlliesDef = gameData.allies) {
  const net = new Network();
  const node = net.addNode('storage', 100, species === 'worm' ? humusY : GROUND_Y + 10, { sugar: 100, water: 50, minerals: 50 });
  const events: WorldEvent[] = [];
  const rng = new Random(1);
  const ally = createAlly(1, species, defs, node.x + 2, node.y, rng);
  if (species === 'tree') {
    ally.x = node.x;
    ally.y = GROUND_Y - 1;
    ally.roots = [{ x: node.x, y: node.y - 4 }];
  }
  const ctx: AllyContext = {
    net,
    defs,
    forest,
    deposits: [],
    season,
    widthPx: 384,
    rng,
    tick: 0,
    emit: (e) => events.push(e),
  };
  return { net, node, ally, ctx, events, def: defs.species[species] };
}

/** Personnalité neutre et prévisible pour les tests. */
function neutral(ally: Ally, overrides: Partial<Ally['personality']> = {}): void {
  Object.assign(ally.personality, { warmth: 0.5, patience: 0.5, greed: 0.5, generosity: 0.5, loyalty: 0.5, ...overrides });
}

describe('personnalité', () => {
  it('varie d\'un individu à l\'autre, dans [0, 1] et autour de celle de l\'espèce', () => {
    const def = gameData.allies.species.beetle;
    const rng = new Random(3);
    const rolls = Array.from({ length: 50 }, () => rollPersonality(def, rng));
    for (const p of rolls) {
      expect(p.loyalty).toBeGreaterThanOrEqual(0);
      expect(p.loyalty).toBeLessThanOrEqual(1);
      expect(Math.abs(p.greed - def.personality.greed)).toBeLessThanOrEqual(def.variation + 1e-9);
    }
    expect(new Set(rolls.map((p) => p.greed)).size).toBeGreaterThan(1);
  });
});

describe('échanges', () => {
  it('l\'arbre prend des minéraux et rend du sucre à ses racines', () => {
    const { node, ally, ctx, def } = setup('tree');
    neutral(ally);
    const before = { ...node.stock };
    trade(ally, def, node, 1, ctx);
    expect(node.stock.minerals).toBeLessThan(before.minerals);
    expect(node.stock.sugar).toBeGreaterThan(before.sugar);
    expect(ally.lastGift).toBe('sugar');
  });

  it('un allié confiant donne davantage', () => {
    const gift = (trust: number) => {
      const { node, ally, ctx, def } = setup('tree');
      neutral(ally);
      ally.trust = trust;
      trade(ally, def, node, 1, ctx);
      return node.stock.sugar;
    };
    expect(gift(1)).toBeGreaterThan(gift(0.2));
  });

  it('la confiance monte quand l\'accord est honoré, baisse sinon', () => {
    const fed = setup('ant');
    neutral(fed.ally);
    trade(fed.ally, fed.def, fed.node, 1, fed.ctx);
    expect(fed.ally.trust).toBeGreaterThan(gameData.allies.trust.initial);

    const starved = setup('ant');
    neutral(starved.ally);
    starved.node.stock.sugar = 0;
    trade(starved.ally, starved.def, starved.node, 1, starved.ctx);
    expect(starved.ally.trust).toBeLessThan(gameData.allies.trust.initial);
  });

  it('un allié patient perd confiance moins vite', () => {
    const loss = (patience: number) => {
      const { node, ally, ctx, def } = setup('ant');
      neutral(ally, { patience });
      node.stock.sugar = 0;
      trade(ally, def, node, 1, ctx);
      return gameData.allies.trust.initial - ally.trust;
    };
    expect(loss(0.9)).toBeLessThan(loss(0.1));
  });

  it('un allié qui boude prend sans rien donner', () => {
    const { node, ally, ctx, def } = setup('tree');
    ally.sulk = 10;
    const sugar = node.stock.sugar;
    trade(ally, def, node, 1, ctx);
    expect(node.stock.sugar).toBe(sugar);
    expect(node.stock.minerals).toBeLessThan(50);
  });
});

describe('services', () => {
  it('les fourmis nettoient les parasites', () => {
    const { node, ally, ctx, def } = setup('ant');
    node.infection = 0.5;
    trade(ally, def, node, 1, ctx);
    expect(node.infection).toBeLessThan(0.5);
  });

  it('les vers reconstituent les gisements voisins', () => {
    const { node, ally, ctx, def } = setup('worm');
    ctx.deposits.push({ x: node.x + 5, y: node.y, layer: 'humus', amount: 0, max: 10 });
    trade(ally, def, node, 1, ctx);
    expect(ctx.deposits[0]!.amount).toBeGreaterThan(0);
  });

  it('les scarabées font avancer la fructification des ruches', () => {
    const { node, ally, ctx, def } = setup('beetle');
    node.kind = 'fruiting';
    trade(ally, def, node, 1, ctx);
    expect(node.fruiting).toBeGreaterThan(0);
  });
});

describe('trahisons', () => {
  it('les fourmis pillent le nœud le plus sucré', () => {
    const { net, ally, ctx, def } = setup('ant');
    const rich = net.addNode('storage', 130, GROUND_Y + 10, { sugar: 200 });
    const target = betray(ally, def, ctx);
    expect(target).toBe(rich);
    expect(rich.stock.sugar).toBe(200 - def.betrayal.amount);
  });

  it('le ver ronge un filament', () => {
    const { net, node, ally, ctx, def } = setup('worm');
    const other = net.addNode('junction', node.x + 10, node.y);
    const seg = net.addSegment(node.id, other.id, 'thin', true)!;
    betray(ally, def, ctx);
    expect(seg.health).toBeCloseTo(1 - def.betrayal.amount);
  });

  it('le scarabée infeste un nœud', () => {
    const { node, ally, ctx, def, events } = setup('beetle');
    betray(ally, def, ctx);
    expect(node.infection).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'infection')).toBe(true);
  });

  it('l\'arbre aspire du sucre puis boude', () => {
    const { node, ally, ctx, def } = setup('tree');
    betray(ally, def, ctx);
    expect(node.stock.sugar).toBe(100 - def.betrayal.amount);
    expect(ally.sulk).toBeGreaterThan(0);
  });

  it('trahit seulement sous le seuil de confiance, plus souvent sans loyauté', () => {
    const count = (trust: number, loyalty: number) => {
      const { ally, ctx, events } = setup('ant');
      neutral(ally, { loyalty });
      let betrayals = 0;
      for (let i = 0; i < 3000; i++) {
        ally.trust = trust;
        ally.cooldown = 0;
        ally.state = 'active';
        stepAlly(ally, ctx);
        betrayals += events.splice(0).filter((e) => e.type === 'betrayal').length;
      }
      return betrayals;
    };
    expect(count(0.9, 0)).toBe(0);
    expect(count(0.1, 0)).toBeGreaterThan(count(0.1, 0.9));
  });
});

describe('comportement', () => {
  it('un allié à bout de confiance quitte la forêt', () => {
    const { ally, ctx, events } = setup('beetle');
    ally.trust = 0.01;
    ally.cooldown = 1e9; // pas de trahison pendant ce test
    stepAlly(ally, ctx);
    expect(ally.state).toBe('leaving');
    expect(events.some((e) => e.type === 'leave')).toBe(true);
    for (let i = 0; i < 5000 && ally.state === 'leaving'; i++) stepAlly(ally, ctx);
    expect(ally.state).toBe('gone');
  });

  it('un arbre ne part jamais, même sans confiance', () => {
    const { ally, ctx } = setup('tree');
    ally.trust = 0;
    ally.cooldown = 1e9;
    stepAlly(ally, ctx);
    expect(ally.state).toBe('active');
  });

  it('s\'endort en hiver sans commercer', () => {
    const { node, ally, ctx } = setup('ant', winter);
    const sugar = node.stock.sugar;
    stepAlly(ally, ctx);
    expect(ally.state).toBe('dormant');
    expect(node.stock.sugar).toBe(sugar);
  });

  it('l\'arbre commerce par ses racines, pas par son tronc', () => {
    const { ally, net, def } = setup('tree');
    expect(findContact(ally, def, net)).toBeDefined();
    ally.roots = [{ x: 300, y: 100 }];
    expect(findContact(ally, def, net)).toBeUndefined();
  });

  it('l\'humeur traduit la confiance', () => {
    const { ally } = setup('ant');
    ally.trust = 0.9;
    expect(moodOf(ally)).toBe('devoted');
    ally.trust = 0.1;
    expect(moodOf(ally)).toBe('hostile');
  });
});
