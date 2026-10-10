import { GROUND_Y } from '../config';
import type {
  AlliesDef,
  AllySpeciesDef,
  AllySpeciesId,
  ForestDef,
  Layer,
  Personality,
  SeasonDef,
  TradeResource,
} from '../data/types';
import { PERSONALITY_TRAITS } from '../data/types';
import type { Ally } from '../entities/Ally';
import type { NetNode, Network } from '../entities/Network';
import type { Emit } from './events';
import type { Random } from './Random';
import { type Deposit, layerAt, layerBounds } from './SoilSystem';

export interface AllyContext {
  net: Network;
  defs: AlliesDef;
  forest: ForestDef;
  deposits: Deposit[];
  season: SeasonDef;
  widthPx: number;
  rng: Random;
  tick: number;
  emit: Emit;
}

/** Bande verticale [haut, bas] couverte par un ensemble de couches. */
export function habitatBand(layers: readonly Layer[], forest: ForestDef): [number, number] {
  const bounds = layerBounds(forest);
  const top = Math.min(...layers.map((l) => bounds[l][0]));
  const bottom = Math.max(...layers.map((l) => bounds[l][1]));
  return [top + 2, bottom - 3];
}

function habitatOf(def: AllySpeciesDef, dormant: boolean): Layer[] {
  return dormant && def.winterHabitat ? def.winterHabitat : def.habitat;
}

/** Personnalité d'un individu : celle de l'espèce, légèrement variée. */
export function rollPersonality(def: AllySpeciesDef, rng: Random): Personality {
  const p = { ...def.personality };
  for (const trait of PERSONALITY_TRAITS) {
    p[trait] = Math.min(1, Math.max(0, p[trait] + (rng.next() * 2 - 1) * def.variation));
  }
  return p;
}

export function createAlly(
  id: number,
  species: AllySpeciesId,
  defs: AlliesDef,
  x: number,
  y: number,
  rng: Random,
): Ally {
  return {
    id,
    species,
    x,
    y,
    tx: x,
    ty: y,
    trust: defs.trust.initial,
    personality: rollPersonality(defs.species[species], rng),
    state: 'active',
    contact: null,
    cooldown: 0,
    sulk: 0,
    lastTrade: -Infinity,
    lastGift: null,
    lastBetrayal: -Infinity,
    roots: [],
    height: 0,
  };
}

/** Nœud avec lequel l'allié peut commercer : près de lui, ou près de ses racines (arbre). */
export function findContact(ally: Ally, def: AllySpeciesDef, net: Network): NetNode | undefined {
  const points = ally.roots.length > 0 ? ally.roots : [{ x: ally.x, y: ally.y }];
  let best: NetNode | undefined;
  let bestDist = def.contactRadius;
  for (const point of points) {
    const node = net.findNodeNear(point.x, point.y, bestDist);
    if (node) {
      best = node;
      bestDist = Math.hypot(node.x - point.x, node.y - point.y);
    }
  }
  return best;
}

/** Avance tous les alliés d'un tick. Les alliés partis sont retirés de la liste. */
export function stepAllies(allies: Ally[], ctx: AllyContext): void {
  for (const ally of allies) stepAlly(ally, ctx);
  for (let i = allies.length - 1; i >= 0; i--) {
    if (allies[i]!.state === 'gone') allies.splice(i, 1);
  }
}

export function stepAlly(ally: Ally, ctx: AllyContext): void {
  const def = ctx.defs.species[ally.species];
  if (ally.state === 'burnt') {
    if (--ally.cooldown <= 0) ally.state = 'active';
    return;
  }
  if (ally.state === 'leaving') {
    move(ally, def.speed * 2);
    if (ally.x < -6 || ally.x > ctx.widthPx + 6) ally.state = 'gone';
    return;
  }

  const activity = def.activity[ctx.season.id] ?? 0;
  if (activity <= 0) {
    // Sommeil : l'allié se retire dans son refuge d'hiver, sans commercer ni changer d'avis.
    if (ally.state !== 'dormant') {
      ally.state = 'dormant';
      chooseTarget(ally, def, ctx, true);
    }
    move(ally, def.speed);
    ally.contact = null;
    return;
  }
  if (ally.state === 'dormant') {
    ally.state = 'active';
    chooseTarget(ally, def, ctx, false);
  }

  if (def.speed > 0) {
    const arrived = Math.hypot(ally.tx - ally.x, ally.ty - ally.y) < 1;
    if (arrived || ctx.rng.next() < 0.002) chooseTarget(ally, def, ctx, false);
    move(ally, def.speed * activity);
  }

  const node = findContact(ally, def, ctx.net);
  ally.contact = node?.id ?? null;
  if (node) trade(ally, def, node, activity, ctx);
  else ally.trust += (ctx.defs.trust.initial - ally.trust) * ctx.defs.trust.drift;

  if (ally.sulk > 0) ally.sulk--;
  if (ally.cooldown > 0) ally.cooldown--;
  maybeBetray(ally, def, ctx);

  if (def.leaves && ally.trust <= ctx.defs.trust.leave) {
    ally.state = 'leaving';
    ally.tx = ally.x < ctx.widthPx / 2 ? -10 : ctx.widthPx + 10;
    ally.ty = ally.y;
    ctx.emit({ type: 'leave', allyId: ally.id, species: ally.species });
  }
}

function move(ally: Ally, speed: number): void {
  const dx = ally.tx - ally.x;
  const dy = ally.ty - ally.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= speed || dist === 0) {
    ally.x = ally.tx;
    ally.y = ally.ty;
  } else {
    ally.x += (dx / dist) * speed;
    ally.y += (dy / dist) * speed;
  }
}

/**
 * Choisit une destination. Plus l'allié a confiance, plus il va vers le réseau
 * (pour commercer) ; méfiant, il erre au hasard dans son habitat.
 */
function chooseTarget(ally: Ally, def: AllySpeciesDef, ctx: AllyContext, dormant: boolean): void {
  if (def.speed <= 0) return;
  const layers = habitatOf(def, dormant);
  const [top, bottom] = habitatBand(layers, ctx.forest);
  if (!dormant && ctx.rng.next() < ally.trust) {
    const nodes = [...ctx.net.nodes.values()].filter((n) => {
      const layer = layerAt(n.y, ctx.forest);
      return layer !== null && layers.includes(layer);
    });
    if (nodes.length > 0) {
      const node = nodes[ctx.rng.int(0, nodes.length - 1)]!;
      ally.tx = node.x + ctx.rng.int(-3, 3);
      ally.ty = Math.min(bottom, Math.max(top, node.y + ctx.rng.int(-3, 3)));
      return;
    }
  }
  ally.tx = ctx.rng.int(4, ctx.widthPx - 4);
  ally.ty = ctx.rng.int(Math.round(top), Math.round(bottom));
}

/**
 * Applique l'accord : l'allié prend ce qu'il réclame au nœud, donne en proportion de ce
 * qu'il a reçu et de sa confiance, rend son service, puis révise sa confiance.
 */
export function trade(ally: Ally, def: AllySpeciesDef, node: NetNode, activity: number, ctx: AllyContext): void {
  const p = ally.personality;
  let satisfaction = 1;
  for (const [res, amount] of Object.entries(def.deal.wants) as [TradeResource, number][]) {
    const want = amount * (0.5 + p.greed) * activity;
    if (want <= 0) continue;
    const taken = Math.min(node.stock[res], want);
    node.stock[res] -= taken;
    satisfaction = Math.min(satisfaction, taken / want);
  }

  const willingness = ally.sulk > 0 ? 0 : satisfaction * (0.3 + 0.7 * ally.trust);
  let gift: TradeResource | null = null;
  for (const [res, amount] of Object.entries(def.deal.gives) as [TradeResource, number][]) {
    const given = amount * (0.5 + p.generosity) * activity * willingness;
    if (given > 0) {
      node.stock[res] += given;
      gift ??= res;
    }
  }
  if (willingness > 0) {
    ally.lastTrade = ctx.tick;
    ally.lastGift = gift;
    if (satisfaction > 0.5 && def.service) serve(def.service.kind, def.service.strength * activity, node, ctx);
  }

  const { gain, loss } = ctx.defs.trust;
  if (satisfaction >= 0.999) ally.trust += gain * p.warmth;
  else ally.trust -= loss * (1 - satisfaction) * (1 - 0.9 * p.patience);
  ally.trust = Math.min(1, Math.max(0, ally.trust));
}

function serve(kind: NonNullable<AllySpeciesDef['service']>['kind'], strength: number, node: NetNode, ctx: AllyContext): void {
  if (kind === 'guard') {
    // Les fourmis nettoient les parasites du nœud et de ses voisins immédiats.
    node.infection = Math.max(0, node.infection - strength);
    for (const seg of ctx.net.segmentsOf(node.id)) {
      const other = ctx.net.nodes.get(seg.a === node.id ? seg.b : seg.a)!;
      other.infection = Math.max(0, other.infection - strength / 2);
    }
  } else if (kind === 'aerate') {
    // Les vers brassent la terre : les gisements voisins se reconstituent.
    for (const d of ctx.deposits) {
      if (Math.hypot(d.x - node.x, d.y - node.y) <= 24) d.amount = Math.min(d.max, d.amount + strength);
    }
  } else if (node.kind === 'fruiting' && node.build >= 1) {
    // Les scarabées dispersent les spores des ruches.
    node.fruiting += strength;
  }
}

function maybeBetray(ally: Ally, def: AllySpeciesDef, ctx: AllyContext): void {
  const b = def.betrayal;
  if (ally.cooldown > 0 || ally.trust >= b.threshold) return;
  const chance = b.chance * (1 - ally.personality.loyalty) * (1 - ally.trust / b.threshold);
  if (ctx.rng.next() >= chance) return;
  const target = betray(ally, def, ctx);
  ally.cooldown = b.cooldownTicks;
  ally.lastBetrayal = ctx.tick;
  ctx.emit({ type: 'betrayal', allyId: ally.id, kind: b.kind, x: ally.x, y: ally.y, tx: target?.x ?? ally.x, ty: target?.y ?? ally.y });
}

/** Exécute la trahison propre à l'espèce. Retourne le point visé (pour l'animation). */
export function betray(ally: Ally, def: AllySpeciesDef, ctx: AllyContext): { x: number; y: number } | null {
  const { kind, amount, cooldownTicks } = def.betrayal;
  const near = (radius: number) => ctx.net.findNodeNear(ally.x, ally.y, radius);
  switch (kind) {
    case 'hoard': {
      // L'arbre garde tout pour lui : il aspire du sucre et boude un moment.
      const node = findContact(ally, def, ctx.net);
      ally.sulk = Math.round(cooldownTicks / 3);
      if (!node) return null;
      node.stock.sugar = Math.max(0, node.stock.sugar - amount);
      return node;
    }
    case 'raid': {
      // Les fourmis pillent le nœud le plus sucré des environs.
      let richest: NetNode | undefined;
      for (const node of ctx.net.nodes.values()) {
        if (Math.hypot(node.x - ally.x, node.y - ally.y) > 80) continue;
        if (!richest || node.stock.sugar > richest.stock.sugar) richest = node;
      }
      if (!richest) return null;
      richest.stock.sugar = Math.max(0, richest.stock.sugar - amount);
      ally.tx = richest.x;
      ally.ty = Math.max(GROUND_Y + 2, Math.min(ally.ty, richest.y));
      return richest;
    }
    case 'gnaw': {
      // Le ver ronge le filament le plus proche.
      const seg = ctx.net.findSegmentNear(ally.x, ally.y, 12);
      if (!seg) return null;
      seg.health -= amount;
      return ctx.net.midpoint(seg);
    }
    case 'infest': {
      // Le scarabée dépose des parasites sur un nœud.
      const node = near(30);
      if (!node) return null;
      node.infection = Math.max(node.infection, amount);
      ctx.emit({ type: 'infection', nodeId: node.id, fromNodeId: null });
      return node;
    }
  }
}
