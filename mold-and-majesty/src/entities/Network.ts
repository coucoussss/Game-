import { FLUX_IDS, type FluxId, type NodeKind, type ThicknessId } from '../data/types';

export type Stock = Record<FluxId, number>;

export interface NetNode {
  readonly id: number;
  /** Position en pixels, entière. */
  readonly x: number;
  readonly y: number;
  kind: NodeKind;
  stock: Stock;
  /** Avancement de la conversion vers `kind` (0..1) ; 1 = opérationnel. */
  build: number;
  /** Avancement de la prochaine spore (ruche uniquement). */
  fruiting: number;
  /** Charge parasitaire (0 = sain, 1 = saturé). */
  infection: number;
}

export interface NetSegment {
  readonly id: number;
  /** Nœud d'origine : c'est lui qui paie la pousse. */
  readonly a: number;
  readonly b: number;
  readonly thickness: ThicknessId;
  /** Longueur en pixels. */
  readonly length: number;
  /** Santé (0..1] : sous-alimenté, le segment pâlit ; à 0, il meurt. */
  health: number;
  /** Avancement de la pousse (0..1) ; le segment ne conduit rien avant 1. */
  growth: number;
}

export function emptyStock(): Stock {
  return { sugar: 0, water: 0, minerals: 0, signal: 0 };
}

/**
 * Graphe du réseau de mycélium : données pures, sans Phaser ni règles de simulation
 * (celles-ci vivent dans systems/FlowSystem.ts).
 */
export class Network {
  readonly nodes = new Map<number, NetNode>();
  readonly segments = new Map<number, NetSegment>();
  /** Spores produites par les ruches depuis le début de la partie. */
  spores = 0;
  private readonly adjacency = new Map<number, Set<number>>();
  private nextId = 1;

  addNode(kind: NodeKind, x: number, y: number, stock: Partial<Stock> = {}): NetNode {
    const node: NetNode = {
      id: this.nextId++,
      x: Math.round(x),
      y: Math.round(y),
      kind,
      stock: { ...emptyStock(), ...stock },
      build: 1,
      fruiting: 0,
      infection: 0,
    };
    this.nodes.set(node.id, node);
    this.adjacency.set(node.id, new Set());
    return node;
  }

  /** Crée un segment en pousse (ou déjà poussé si `grown`). Retourne null si invalide ou doublon. */
  addSegment(a: number, b: number, thickness: ThicknessId, grown = false): NetSegment | null {
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (!na || !nb || a === b || this.segmentBetween(a, b)) return null;
    const segment: NetSegment = {
      id: this.nextId++,
      a,
      b,
      thickness,
      length: Math.hypot(nb.x - na.x, nb.y - na.y),
      health: 1,
      growth: grown ? 1 : 0,
    };
    this.segments.set(segment.id, segment);
    this.adjacency.get(a)!.add(segment.id);
    this.adjacency.get(b)!.add(segment.id);
    return segment;
  }

  removeSegment(id: number): void {
    const segment = this.segments.get(id);
    if (!segment) return;
    this.segments.delete(id);
    this.adjacency.get(segment.a)?.delete(id);
    this.adjacency.get(segment.b)?.delete(id);
  }

  removeNode(id: number): void {
    for (const segId of [...(this.adjacency.get(id) ?? [])]) this.removeSegment(segId);
    this.adjacency.delete(id);
    this.nodes.delete(id);
  }

  segmentsOf(nodeId: number): NetSegment[] {
    return [...(this.adjacency.get(nodeId) ?? [])].map((id) => this.segments.get(id)!);
  }

  segmentBetween(a: number, b: number): NetSegment | undefined {
    return this.segmentsOf(a).find((s) => s.a === b || s.b === b);
  }

  /** Segment le plus proche du point (x, y), à moins de `radius` pixels de son tracé. */
  findSegmentNear(x: number, y: number, radius: number): NetSegment | undefined {
    let best: NetSegment | undefined;
    let bestDist = radius;
    for (const seg of this.segments.values()) {
      const a = this.nodes.get(seg.a)!;
      const b = this.nodes.get(seg.b)!;
      const d = distanceToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d <= bestDist) {
        best = seg;
        bestDist = d;
      }
    }
    return best;
  }

  /** Point milieu d'un segment. */
  midpoint(seg: NetSegment): { x: number; y: number } {
    const a = this.nodes.get(seg.a)!;
    const b = this.nodes.get(seg.b)!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** Nœud le plus proche de (x, y) dans le rayon donné. */
  findNodeNear(x: number, y: number, radius: number): NetNode | undefined {
    let best: NetNode | undefined;
    let bestDist = radius;
    for (const node of this.nodes.values()) {
      const d = Math.hypot(node.x - x, node.y - y);
      if (d <= bestDist) {
        best = node;
        bestDist = d;
      }
    }
    return best;
  }

  /** Somme des stocks de tous les nœuds. */
  totals(): Stock {
    const total = emptyStock();
    for (const node of this.nodes.values()) {
      for (const flux of FLUX_IDS) total[flux] += node.stock[flux];
    }
    return total;
  }
}

/** Distance d'un point à un segment [a, b]. */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
