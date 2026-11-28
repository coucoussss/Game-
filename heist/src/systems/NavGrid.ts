import type { Rect } from '../data/types';
import { lineOfSight, type Point } from './geometry';

/** Taille d'une case de navigation, en mètres. */
export const NAV_CELL = 0.5;

/**
 * Grille de navigation pour les personnages qui poursuivent (police, vigiles). Les obstacles sont gonflés
 * du rayon d'un corps. Les portes ne bloquent pas : ceux qui s'en servent ont les clés, ou un bélier.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly inflated: Rect[];
  // Tampons réutilisés d'une recherche à l'autre.
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly state: Uint8Array;

  constructor(
    private readonly bounds: Rect,
    obstacles: readonly Rect[],
    radius = 0.2,
  ) {
    this.cols = Math.ceil((bounds.max[0] - bounds.min[0]) / NAV_CELL);
    this.rows = Math.ceil((bounds.max[1] - bounds.min[1]) / NAV_CELL);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.inflated = obstacles.map((r) => ({
      min: [r.min[0] - radius, r.min[1] - radius] as const,
      max: [r.max[0] + radius, r.max[1] + radius] as const,
    }));
    for (const r of this.inflated) {
      const c0 = Math.max(0, Math.floor((r.min[0] - bounds.min[0]) / NAV_CELL - 0.5 + 1e-6) + 1);
      const c1 = Math.min(this.cols - 1, Math.ceil((r.max[0] - bounds.min[0]) / NAV_CELL - 0.5 - 1e-6) - 1);
      const r0 = Math.max(0, Math.floor((r.min[1] - bounds.min[1]) / NAV_CELL - 0.5 + 1e-6) + 1);
      const r1 = Math.min(this.rows - 1, Math.ceil((r.max[1] - bounds.min[1]) / NAV_CELL - 0.5 - 1e-6) - 1);
      for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) this.blocked[row * this.cols + col] = 1;
    }
  }

  private cellOf(p: Point): number {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor((p.x - this.bounds.min[0]) / NAV_CELL)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor((p.z - this.bounds.min[1]) / NAV_CELL)));
    return row * this.cols + col;
  }

  private center(cell: number): Point {
    const col = cell % this.cols;
    const row = Math.floor(cell / this.cols);
    return { x: this.bounds.min[0] + (col + 0.5) * NAV_CELL, z: this.bounds.min[1] + (row + 0.5) * NAV_CELL };
  }

  /** Case libre la plus proche de `p` (recherche en anneaux). */
  private nearestFree(p: Point): number {
    const start = this.cellOf(p);
    if (!this.blocked[start]) return start;
    const col0 = start % this.cols;
    const row0 = Math.floor(start / this.cols);
    for (let ring = 1; ring < 12; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const col = col0 + dc;
          const row = row0 + dr;
          if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
          const cell = row * this.cols + col;
          if (this.blocked[cell]) continue;
          const c = this.center(cell);
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = cell;
          }
        }
      }
      if (best >= 0) return best;
    }
    return start;
  }

  isFree(p: Point): boolean {
    return !this.blocked[this.cellOf(p)];
  }

  /** Vrai si on peut marcher en ligne droite de a à b. */
  walkable(a: Point, b: Point): boolean {
    return lineOfSight(a, b, this.inflated);
  }

  /** Chemin de `a` à `b` (A*, 8 directions, lissé). Renvoie une liste de points, `b` compris ; vide si aucun. */
  path(a: Point, b: Point): Point[] {
    const start = this.nearestFree(a);
    const goal = this.nearestFree(b);
    const goalP = this.center(goal);
    this.state.fill(0);
    const heap: number[] = [];
    const f: number[] = [];
    const push = (cell: number, score: number): void => {
      let i = heap.length;
      heap.push(cell);
      f.push(score);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if ((f[parent] ?? 0) <= score) break;
        heap[i] = heap[parent] ?? 0;
        f[i] = f[parent] ?? 0;
        i = parent;
      }
      heap[i] = cell;
      f[i] = score;
    };
    const pop = (): number => {
      const top = heap[0] ?? -1;
      const lastCell = heap.pop() ?? -1;
      const lastF = f.pop() ?? 0;
      const n = heap.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let child = i * 2 + 1;
          if (child >= n) break;
          if (child + 1 < n && (f[child + 1] ?? 0) < (f[child] ?? 0)) child++;
          if ((f[child] ?? 0) >= lastF) break;
          heap[i] = heap[child] ?? 0;
          f[i] = f[child] ?? 0;
          i = child;
        }
        heap[i] = lastCell;
        f[i] = lastF;
      }
      return top;
    };
    const h = (cell: number): number => {
      const c = this.center(cell);
      return Math.hypot(c.x - goalP.x, c.z - goalP.z);
    };

    this.g[start] = 0;
    this.from[start] = -1;
    this.state[start] = 1;
    push(start, h(start));
    let found = false;
    while (heap.length > 0) {
      const cur = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      const col = cur % this.cols;
      const row = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const next = nr * this.cols + nc;
          if (this.blocked[next] || this.state[next] === 2) continue;
          // Pas de diagonale qui rogne un coin.
          if (dr !== 0 && dc !== 0 && (this.blocked[row * this.cols + nc] || this.blocked[nr * this.cols + col])) continue;
          const cost = (this.g[cur] ?? 0) + (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1) * NAV_CELL;
          if (this.state[next] === 1 && cost >= (this.g[next] ?? 0)) continue;
          this.g[next] = cost;
          this.from[next] = cur;
          this.state[next] = 1;
          push(next, cost + h(next));
        }
      }
    }
    if (!found) return [];

    const cells: number[] = [];
    for (let c = goal; c !== -1; c = this.from[c] ?? -1) cells.push(c);
    cells.reverse();
    const raw = cells.map((c) => this.center(c));
    if (this.isFree(b)) raw.push({ x: b.x, z: b.z });

    // Lissage : on saute les points intermédiaires tant que la ligne droite est libre.
    const out: Point[] = [];
    let anchor = a;
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.walkable(anchor, raw[j] as Point)) j--;
      const next = raw[j] as Point;
      out.push(next);
      anchor = next;
      i = j + 1;
    }
    return out;
  }
}
