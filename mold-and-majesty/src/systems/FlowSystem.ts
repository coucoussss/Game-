import { TILE } from '../config';
import { FLUX_IDS, type NetworkDef } from '../data/types';
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
 *
 * La saison et la mémoire agissent via des `FlowModifiers` (multiplicateurs) ; le sol
 * (absorption, gel) est géré à part, dans SoilSystem.
 */

/** Multiplicateurs appliqués à la simulation (saison, mémoire). */
export interface FlowModifiers {
  sugarProduction: number;
  growthSpeed: number;
  growthCost: number;
  upkeep: number;
  fruiting: number;
  /** Multiplicateur du dépérissement (la mémoire le réduit). */
  decay: number;
}

/** Aucune modification : les valeurs de network.json s'appliquent telles quelles. */
export const NEUTRAL_MODIFIERS: Readonly<FlowModifiers> = {
  sugarProduction: 1,
  growthSpeed: 1,
  growthCost: 1,
  upkeep: 1,
  fruiting: 1,
  decay: 1,
};

/** Un nœud est-il opérationnel (conversion terminée) ? */
const isBuilt = (n: NetNode) => n.build >= 1;
const isActive = (s: NetSegment) => s.growth >= 1;
const lengthInTiles = (s: NetSegment) => Math.max(1, s.length / TILE);

export function capacityOf(node: NetNode, defs: NetworkDef): number {
  return defs.nodes[node.kind].capacity;
}

/** Avance la simulation d'un tick. */
export function stepNetwork(net: Network, defs: NetworkDef, mods: FlowModifiers = NEUTRAL_MODIFIERS): void {
  updateNodes(net, defs, mods);
  transport(net, defs);
  upkeep(net, defs, mods);
  grow(net, defs, mods);
  removeDead(net);
}

/**
 * Production du cœur, atténuation et relais du signal, fructification, conversion des nœuds.
 * (L'échange minéraux → sucre avec les arbres est géré par AllySystem.)
 */
export function updateNodes(net: Network, defs: NetworkDef, mods: FlowModifiers = NEUTRAL_MODIFIERS): void {
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
      s.sugar += (prod.sugar ?? 0) * mods.sugarProduction;
      s.water += prod.water ?? 0;
      s.signal = cap;
    } else if (node.kind === 'relay') {
      if (s.signal >= signal.relayThreshold * cap && s.sugar >= signal.relayCost) {
        s.sugar -= signal.relayCost;
        s.signal = Math.max(s.signal, signal.relayStrength * cap);
      }
    } else if (node.kind === 'fruiting') {
      const ready = s.signal >= fruiting.signalThreshold * cap && s.sugar >= fruiting.sugar && s.water >= fruiting.water;
      if (ready && mods.fruiting > 0) {
        s.sugar -= fruiting.sugar;
        s.water -= fruiting.water;
        node.fruiting += fruiting.rate * mods.fruiting;
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

/** Diffusion des flux le long des segments actifs. Conserve la matière. */
export function transport(net: Network, defs: NetworkDef): void {
  // Ce qui ne dépend pas du flux est calculé une fois par segment.
  const as: NetNode[] = [];
  const bs: NetNode[] = [];
  const capAs: number[] = [];
  const capBs: number[] = [];
  const gs: number[] = [];
  for (const seg of net.segments.values()) {
    if (!isActive(seg)) continue;
    const a = net.nodes.get(seg.a)!;
    const b = net.nodes.get(seg.b)!;
    as.push(a);
    bs.push(b);
    capAs.push(capacityOf(a, defs));
    capBs.push(capacityOf(b, defs));
    gs.push((defs.thickness[seg.thickness].conductance * seg.health) / lengthInTiles(seg));
  }
  const amounts = new Float64Array(as.length);
  const outflow = new Map<number, number>();
  for (const flux of FLUX_IDS) {
    const mobility = defs.flux[flux].mobility;
    outflow.clear();
    for (let i = 0; i < as.length; i++) {
      const a = as[i]!;
      const b = bs[i]!;
      const capA = capAs[i]!;
      const capB = capBs[i]!;
      const delta = a.stock[flux] / capA - b.stock[flux] / capB;
      // Montant signé : positif de a vers b.
      const amount = (mobility * gs[i]! * delta * Math.min(capA, capB)) / 2;
      amounts[i] = amount;
      if (amount === 0) continue;
      const from = amount > 0 ? a : b;
      outflow.set(from.id, (outflow.get(from.id) ?? 0) + Math.abs(amount));
    }
    // Facteur de rationnement par nœud source, calculé avant d'appliquer quoi que ce soit.
    const ratio = new Map<number, number>();
    for (const [id, out] of outflow) {
      const available = net.nodes.get(id)!.stock[flux];
      ratio.set(id, out > available ? available / out : 1);
    }
    for (let i = 0; i < as.length; i++) {
      const amount = amounts[i]!;
      if (amount === 0) continue;
      const [from, to] = amount > 0 ? [as[i]!, bs[i]!] : [bs[i]!, as[i]!];
      const moved = Math.abs(amount) * ratio.get(from.id)!;
      // max(0, …) absorbe les erreurs d'arrondi en virgule flottante.
      from.stock[flux] = Math.max(0, from.stock[flux] - moved);
      to.stock[flux] += moved;
    }
  }
}

/**
 * Chaque segment actif consomme sucre et eau, puisés dans ses deux extrémités au prorata
 * de leurs stocks : un segment est nourri si l'un ou l'autre bout en a assez.
 * Un nœud qui ne peut pas tout fournir rationne équitablement tous ses segments.
 * Couvert : le segment regagne de la santé. Sinon il en perd, à proportion du manque.
 */
export function upkeep(net: Network, defs: NetworkDef, mods: FlowModifiers = NEUTRAL_MODIFIERS): void {
  type Resource = 'sugar' | 'water';
  const resources: readonly Resource[] = ['sugar', 'water'];
  /** Demande totale adressée à chaque nœud, par ressource. */
  const demand = new Map<number, Record<Resource, number>>();
  /** Part de la demande de chaque segment adressée à son extrémité a. */
  const shares: { seg: NetSegment; need: Record<Resource, number>; shareA: Record<Resource, number> }[] = [];

  for (const seg of net.segments.values()) {
    if (!isActive(seg)) continue;
    const up = defs.thickness[seg.thickness].upkeep;
    const tiles = lengthInTiles(seg) * mods.upkeep;
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
      : seg.health - t.decay * mods.decay * (1 - satisfaction);
  }
}

/** Les segments en pousse avancent en puisant sucre et minéraux dans leur nœud d'origine. */
export function grow(net: Network, defs: NetworkDef, mods: FlowModifiers = NEUTRAL_MODIFIERS): void {
  for (const seg of net.segments.values()) {
    if (isActive(seg)) continue;
    const t = defs.thickness[seg.thickness];
    const origin = net.nodes.get(seg.a)!.stock;
    const tiles = lengthInTiles(seg);
    const step = Math.min(1 - seg.growth, (t.growthSpeed * mods.growthSpeed) / tiles);
    const sugarCost = step * tiles * t.growthCost * mods.growthCost;
    const mineralCost = step * tiles * t.growthMinerals * mods.growthCost;
    // La pousse avance au rythme de la ressource la plus rare.
    const ratio = Math.min(
      sugarCost > 0 ? origin.sugar / sugarCost : 1,
      mineralCost > 0 ? origin.minerals / mineralCost : 1,
      1,
    );
    origin.sugar = Math.max(0, origin.sugar - sugarCost * ratio);
    origin.minerals = Math.max(0, origin.minerals - mineralCost * ratio);
    seg.growth += step * ratio;
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
