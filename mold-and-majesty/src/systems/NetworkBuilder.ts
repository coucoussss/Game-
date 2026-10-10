import type { NodeKind, ThicknessId } from '../data/types';
import type { NetNode, NetSegment, Network } from '../entities/Network';

export interface StrokeOptions {
  /** Pas de la grille souple, en pixels : chaque point posé y est aimanté. */
  grid: number;
  /** Distance entre deux points successifs d'un tracé, en pixels. */
  step: number;
  /** Rayon d'aimantation vers un nœud existant, en pixels. */
  snapRadius: number;
  /** Zone constructible (le sous-sol, hors interface). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

/**
 * Transforme un geste continu (souris ou doigt) en filaments : tous les `step` pixels,
 * un point est posé sur la grille souple, ou aimanté à un nœud existant s'il y en a un
 * à portée (ce qui permet de refermer des boucles). Chaque point devient une jonction
 * reliée au précédent par un segment en pousse.
 */
export class StrokeBuilder {
  private last: NetNode | null = null;

  constructor(
    private readonly net: Network,
    private readonly options: StrokeOptions,
  ) {}

  get active(): boolean {
    return this.last !== null;
  }

  /** Commence un tracé ; il doit partir d'un nœud existant. */
  begin(x: number, y: number): boolean {
    this.last = this.net.findNodeNear(x, y, this.options.snapRadius) ?? null;
    return this.last !== null;
  }

  /** Prolonge le tracé vers (x, y). Retourne les segments créés. */
  move(x: number, y: number, thickness: ThicknessId): NetSegment[] {
    const created: NetSegment[] = [];
    const { grid, step, snapRadius, bounds } = this.options;
    // Garde-fou : un geste très rapide ne peut pas poser un nombre illimité de points.
    for (let i = 0; i < 64 && this.last; i++) {
      const from = this.last;
      const dist = Math.hypot(x - from.x, y - from.y);
      if (dist < step) break;

      const tx = from.x + ((x - from.x) / dist) * step;
      const ty = from.y + ((y - from.y) / dist) * step;
      let target = this.net.findNodeNear(tx, ty, snapRadius);
      if (target === from) target = undefined;
      if (!target) {
        const gx = snapToGrid(tx, grid);
        const gy = snapToGrid(ty, grid);
        if (gx < bounds.minX || gx > bounds.maxX || gy < bounds.minY || gy > bounds.maxY) break;
        if (gx === from.x && gy === from.y) break;
        target = this.net.addNode('junction', gx, gy);
      }
      const segment = this.net.addSegment(from.id, target.id, thickness);
      if (segment) created.push(segment);
      this.last = target;
    }
    return created;
  }

  end(): void {
    this.last = null;
  }
}

/** Nœuds qu'une jonction peut devenir. */
export const CONVERTIBLE_KINDS: readonly NodeKind[] = ['storage', 'relay', 'fruiting'];

/**
 * Lance la conversion d'un nœud vers un nouveau rôle. Le coût en sucre est ensuite
 * investi progressivement par la simulation (voir `build` dans FlowSystem).
 */
export function convertNode(net: Network, nodeId: number, kind: NodeKind): boolean {
  const node = net.nodes.get(nodeId);
  if (!node || node.kind === 'heart' || node.kind === kind || !CONVERTIBLE_KINDS.includes(kind)) return false;
  node.kind = kind;
  node.build = 0;
  node.fruiting = 0;
  return true;
}
