import { TILE } from '../config';
import { FLUX_IDS, type FluxId, type NetworkDef } from '../data/types';
import type { NetNode, NetSegment, Network } from '../entities/Network';

/*
 * Simulation des flux du réseau, à tick fixe.
 *
 * Modèle : chaque nœud est un réservoir de capacité C. Sa « pression » pour un flux est
 * son taux de remplissage stock / C. Le long d'un segment actif, le débit va de la pression
 * haute vers la basse :
 *
 *   débit = mobilité(flux) × conductance(épaisseur) × santé / longueur(tuiles)
 *           × (pA − pB) × min(CA, CB) / 2
 *
 * Avec des coefficients ≤ 1, un segment ne fait jamais plus qu'égaliser ses deux extrémités.
 * Si un nœud doit fournir plus qu'il n'a, tous ses débits sortants sont réduits au prorata :
 * aucun stock ne devient négatif, et le transport conserve exactement la matière.
 *
 * Ordre d'un tick : nœuds (production, signal, ruches, conversion) → transport
 * → entretien et santé des segments → pousse → nettoyage des morts.
 */

/** Un nœud est-il opérationnel (conversion terminée) ? */
const isBuilt = (n: NetNode) => n.build >= 1;
const isActive = (s: NetSegment) => s.growth >= 1;
const lengthInTiles = (s: NetSegment) => Math.max(1, s.length / TILE);

export function capacityOf(node: NetNode, defs: NetworkDef): number {
  return defs.nodes[node.kind].capacity;
}

/** Avance la simulation d'un tick. */
export function stepNetwork(net: Network, defs: NetworkDef): void {
  updateNodes(net, defs);
  transport(net, defs);
  upkeep(net, defs);
  grow(net, defs);
  removeDead(net);
}

/** Production du cœur, atténuation et relais du signal, fructification, conversion des nœuds. */
export function updateNodes(net: Network, defs: NetworkDef): void {
  const { signal, fruiting } = defs;
  for (const node of net.nodes.values()) {
    const cap = capacityOf(node, defs);
    const s = node.stock;
    s.signal *= 1 - signal.decay;

    if (!isBuilt(node)) {
      const cost = defs.nodes[node.kind].cost;
      const spent = Math.min(s.sugar, defs.buildRate, (1 - node.build) * cost);
      s.sugar -= spent;
      node.build = cost > 0 ? Math.min(1, node.build + spent / cost) : 1;
    } else if (node.kind === 'heart') {
      const prod = defs.nodes.heart.production ?? {};
      s.sugar += prod.sugar ?? 0;
      s.water += prod.water ?? 0;
      s.signal = cap;
    } else if (node.kind === 'relay') {
      if (s.signal >= signal.relayThreshold * cap && s.sugar >= signal.relayCost) {
        s.sugar -= signal.relayCost;
        s.signal = Math.max(s.signal, signal.relayStrength * cap);
      }
    } else if (node.kind === 'fruiting') {
      if (s.signal >= fruiting.signalThreshold * cap && s.sugar >= fruiting.sugar && s.water >= fruiting.water) {
        s.sugar -= fruiting.sugar;
        s.water -= fruiting.water;
        node.fruiting += fruiting.rate;
        if (node.fruiting >= 1) {
          node.fruiting -= 1;
          net.spores += 1;
        }
      }
    }

    // Ce qui dépasse la capacité est perdu.
    for (const f of FLUX_IDS) s[f] = Math.min(s[f], cap);
  }
}

/** Diffusion des trois flux le long des segments actifs. Conserve la matière. */
export function transport(net: Network, defs: NetworkDef): void {
  for (const flux of FLUX_IDS) transportFlux(net, defs, flux);
}

function transportFlux(net: Network, defs: NetworkDef, flux: FluxId): void {
  const mobility = defs.flux[flux].mobility;
  const flows: { from: NetNode; to: NetNode; amount: number }[] = [];
  const outflow = new Map<number, number>();

  for (const seg of net.segments.values()) {
    if (!isActive(seg)) continue;
    const a = net.nodes.get(seg.a)!;
    const b = net.nodes.get(seg.b)!;
    const capA = capacityOf(a, defs);
    const capB = capacityOf(b, defs);
    const delta = a.stock[flux] / capA - b.stock[flux] / capB;
    if (delta === 0) continue;
    const g = (mobility * defs.thickness[seg.thickness].conductance * seg.health) / lengthInTiles(seg);
    const amount = (g * Math.abs(delta) * Math.min(capA, capB)) / 2;
    const [from, to] = delta > 0 ? [a, b] : [b, a];
    flows.push({ from, to, amount });
    outflow.set(from.id, (outflow.get(from.id) ?? 0) + amount);
  }

  // Facteur de rationnement par nœud source, calculé avant d'appliquer quoi que ce soit.
  const ratio = new Map<number, number>();
  for (const [id, out] of outflow) {
    const available = net.nodes.get(id)!.stock[flux];
    ratio.set(id, out > available ? available / out : 1);
  }
  for (const { from, to, amount } of flows) {
    const moved = amount * ratio.get(from.id)!;
    // max(0, …) absorbe les erreurs d'arrondi en virgule flottante.
    from.stock[flux] = Math.max(0, from.stock[flux] - moved);
    to.stock[flux] += moved;
  }
}

/**
 * Chaque segment actif consomme sucre et eau, puisés dans ses deux extrémités au prorata
 * de leurs stocks : un segment est nourri si l'un ou l'autre bout en a assez.
 * Un nœud qui ne peut pas tout fournir rationne équitablement tous ses segments.
 * Couvert : le segment regagne de la santé. Sinon il en perd, à proportion du manque.
 */
export function upkeep(net: Network, defs: NetworkDef): void {
  type Resource = 'sugar' | 'water';
  const resources: readonly Resource[] = ['sugar', 'water'];
  /** Demande totale adressée à chaque nœud, par ressource. */
  const demand = new Map<number, Record<Resource, number>>();
  /** Part de la demande de chaque segment adressée à son extrémité a. */
  const shares: { seg: NetSegment; need: Record<Resource, number>; shareA: Record<Resource, number> }[] = [];

  for (const seg of net.segments.values()) {
    if (!isActive(seg)) continue;
    const up = defs.thickness[seg.thickness].upkeep;
    const tiles = lengthInTiles(seg);
    const a = net.nodes.get(seg.a)!.stock;
    const b = net.nodes.get(seg.b)!.stock;
    const need = { sugar: up.sugar * tiles, water: up.water * tiles };
    const shareA = { sugar: 0.5, water: 0.5 };
    for (const r of resources) {
      if (a[r] + b[r] > 0) shareA[r] = a[r] / (a[r] + b[r]);
    }
    shares.push({ seg, need, shareA });
    for (const [id, isA] of [[seg.a, true], [seg.b, false]] as const) {
      const d = demand.get(id) ?? { sugar: 0, water: 0 };
      for (const r of resources) d[r] += need[r] * (isA ? shareA[r] : 1 - shareA[r]);
      demand.set(id, d);
    }
  }

  // Part de la demande que chaque nœud peut honorer, puis prélèvement.
  const ratio = new Map<number, Record<Resource, number>>();
  for (const [id, d] of demand) {
    const stock = net.nodes.get(id)!.stock;
    const r = { sugar: 1, water: 1 };
    for (const res of resources) {
      if (d[res] > 0) r[res] = Math.min(1, stock[res] / d[res]);
      stock[res] = Math.max(0, stock[res] - d[res] * r[res]);
    }
    ratio.set(id, r);
  }

  for (const { seg, shareA } of shares) {
    const ra = ratio.get(seg.a)!;
    const rb = ratio.get(seg.b)!;
    const satisfaction = Math.min(
      ...resources.map((r) => shareA[r] * ra[r] + (1 - shareA[r]) * rb[r]),
    );
    const t = defs.thickness[seg.thickness];
    seg.health = satisfaction >= 1 - 1e-9
      ? Math.min(1, seg.health + t.regen)
      : seg.health - t.decay * (1 - satisfaction);
  }
}

/** Les segments en pousse avancent en puisant du sucre dans leur nœud d'origine. */
export function grow(net: Network, defs: NetworkDef): void {
  for (const seg of net.segments.values()) {
    if (isActive(seg)) continue;
    const t = defs.thickness[seg.thickness];
    const origin = net.nodes.get(seg.a)!;
    const step = Math.min(1 - seg.growth, t.growthSpeed / lengthInTiles(seg));
    const cost = step * lengthInTiles(seg) * t.growthCost;
    const paid = Math.min(cost, origin.stock.sugar);
    origin.stock.sugar -= paid;
    seg.growth = cost > 0 ? seg.growth + step * (paid / cost) : 1;
    if (seg.growth > 1 - 1e-9) seg.growth = 1;
  }
}

/** Retire les segments morts, puis les nœuds isolés (sauf le cœur). */
export function removeDead(net: Network): void {
  for (const seg of [...net.segments.values()]) {
    if (seg.health <= 0) net.removeSegment(seg.id);
  }
  for (const node of [...net.nodes.values()]) {
    if (node.kind !== 'heart' && net.segmentsOf(node.id).length === 0) net.removeNode(node.id);
  }
}
