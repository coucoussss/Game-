import type { NetworkDef, SeasonDef, ThreatsDef } from '../data/types';
import type { Network } from '../entities/Network';
import type { Emit } from './events';
import type { Random } from './Random';

/*
 * Parasites : une épidémie qui court sur le graphe. Un nœud infecté voit sa charge
 * monter, se fait voler du sucre, contamine ses voisins par les segments (d'autant plus
 * que le segment conduit bien), et finit par abîmer ses filaments. Le signal soigne ;
 * les fourmis nettoient ; couper un segment arrête la contagion.
 */

export interface ParasiteContext {
  net: Network;
  netDefs: NetworkDef;
  threats: ThreatsDef;
  season: SeasonDef;
  rng: Random;
  emit: Emit;
}

/** Infecte un nœud (hors cœur) au hasard. */
export function seedInfection(ctx: ParasiteContext): number | null {
  const candidates = [...ctx.net.nodes.values()].filter((n) => n.kind !== 'heart' && n.infection === 0);
  if (candidates.length === 0) return null;
  const node = candidates[ctx.rng.int(0, candidates.length - 1)]!;
  node.infection = ctx.threats.parasites.seedLoad;
  ctx.emit({ type: 'infection', nodeId: node.id, fromNodeId: null });
  return node.id;
}

export function stepParasites(ctx: ParasiteContext, allowSpawn: boolean): void {
  const p = ctx.threats.parasites;
  if (allowSpawn && ctx.rng.next() < p.chancePerTick * (p.seasons[ctx.season.id] ?? 0)) seedInfection(ctx);

  const infected = [...ctx.net.nodes.values()].filter((n) => n.infection > 0);
  // Contagion calculée sur l'état du début du tick : pas d'effet domino instantané.
  const contagions: [number, number][] = [];
  for (const node of infected) {
    for (const seg of ctx.net.segmentsOf(node.id)) {
      if (seg.growth < 1) continue;
      const otherId = seg.a === node.id ? seg.b : seg.a;
      const other = ctx.net.nodes.get(otherId)!;
      if (other.infection > 0) continue;
      const conductance = ctx.netDefs.thickness[seg.thickness].conductance * seg.health;
      if (ctx.rng.next() < p.spread * node.infection * conductance) contagions.push([node.id, otherId]);
    }
  }

  for (const node of infected) {
    const s = node.stock;
    const cap = ctx.netDefs.nodes[node.kind].capacity;
    s.sugar = Math.max(0, s.sugar - p.drain * node.infection);
    node.infection += p.growth * (1 - node.infection);
    node.infection -= p.cure * (s.signal / cap);
    if (node.infection <= 0.001) {
      node.infection = 0;
      continue;
    }
    if (node.infection > 0.8) {
      for (const seg of ctx.net.segmentsOf(node.id)) seg.health -= p.damage;
    }
  }

  for (const [from, to] of contagions) {
    const node = ctx.net.nodes.get(to);
    if (!node || node.infection > 0) continue;
    node.infection = p.seedLoad;
    ctx.emit({ type: 'infection', nodeId: to, fromNodeId: from });
  }
}
