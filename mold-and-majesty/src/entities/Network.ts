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

/** État sérialisable du réseau. */
export interface NetworkSnapshot {
  nodes: NetNode[];
  segments: NetSegment[];
  spores: number;
  nextId: number;
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
  /** Grille spatiale (cases de 16 px) pour retrouver vite les nœuds proches d'un point. */
  private grid: Map<number, NetNode[]> | null = null;

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
    this.grid = null;
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
    this.grid = null;
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

  /** Appelle `visit` pour chaque nœud à moins de `radius` pixels de (x, y). */
  forEachNodeNear(x: number, y: number, radius: number, visit: (node: NetNode) => void): void {
    const grid = this.spatialGrid();
    const r = Math.ceil(radius / 16);
    const cx = Math.floor(x / 16);
    const cy = Math.floor(y / 16);
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        for (const node of grid.get(gx * 4096 + gy) ?? []) {
          if (Math.hypot(node.x - x, node.y - y) <= radius) visit(node);
        }
      }
    }
  }

  private spatialGrid(): Map<number, NetNode[]> {
    if (!this.grid) {
      // Les nœuds ne bougent pas : la grille n'est reconstruite qu'après un ajout ou un retrait.
      this.grid = new Map();
      for (const node of this.nodes.values()) {
        const key = Math.floor(node.x / 16) * 4096 + Math.floor(node.y / 16);
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(node);
        else this.grid.set(key, [node]);
      }
    }
    return this.grid;
  }

  /** Nœud le plus proche de (x, y) dans le rayon donné. */
  findNodeNear(x: number, y: number, radius: number): NetNode | undefined {
    const grid = this.spatialGrid();
    let best: NetNode | undefined;
    let bestDist = radius;
    const r = Math.ceil(radius / 16);
    const cx = Math.floor(x / 16);
    const cy = Math.floor(y / 16);
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        for (const node of grid.get(gx * 4096 + gy) ?? []) {
          const d = Math.hypot(node.x - x, node.y - y);
          if (d < bestDist || (d === bestDist && (!best || node.id < best.id))) {
            best = node;
            bestDist = d;
          }
        }
      }
    }
    return best;
  }

  snapshot(): NetworkSnapshot {
    return {
      nodes: structuredClone([...this.nodes.values()]),
      segments: structuredClone([...this.segments.values()]),
      spores: this.spores,
      nextId: this.nextId,
    };
  }

  static fromSnapshot(snapshot: NetworkSnapshot): Network {
    const net = new Network();
    for (const node of snapshot.nodes) {
      net.nodes.set(node.id, { ...structuredClone(node), stock: { ...emptyStock(), ...node.stock } });
      net.adjacency.set(node.id, new Set());
    }
    for (const seg of snapshot.segments) {
      net.segments.set(seg.id, { ...seg });
      net.adjacency.get(seg.a)?.add(seg.id);
      net.adjacency.get(seg.b)?.add(seg.id);
    }
    net.spores = snapshot.spores;
    net.nextId = snapshot.nextId;
    return net;
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
