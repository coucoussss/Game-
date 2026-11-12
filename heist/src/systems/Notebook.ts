import type { IntelDef } from '../data/types';

/** Temps de regard nécessaire pour noter une observation, en secondes réelles. */
export const LOOK_TIME = 1.0;

/**
 * Le carnet de repérage : ce que le joueur a vu de ses yeux. Le plan n'affiche que ces informations.
 */
export class Notebook {
  readonly known = new Map<string, number>();
  private readonly focus = new Map<string, number>();

  constructor(private readonly defs: readonly IntelDef[]) {}

  has(id: string): boolean {
    return this.known.has(id);
  }

  /** Note une information ; renvoie sa définition si elle est nouvelle. */
  learn(id: string, at: number): IntelDef | null {
    if (this.known.has(id)) return null;
    const def = this.defs.find((d) => d.id === id);
    if (!def) return null;
    this.known.set(id, at);
    return def;
  }

  /**
   * Accumule le regard posé sur les informations visibles cette image ; celles regardées assez longtemps
   * sont apprises. Le regard se perd dès qu'on détourne les yeux.
   */
  observe(visible: readonly string[], dt: number, at: number): IntelDef[] {
    const learned: IntelDef[] = [];
    for (const id of [...this.focus.keys()]) if (!visible.includes(id)) this.focus.delete(id);
    for (const id of visible) {
      if (this.known.has(id)) continue;
      const t = (this.focus.get(id) ?? 0) + dt;
      this.focus.set(id, t);
      if (t >= LOOK_TIME) {
        this.focus.delete(id);
        const def = this.learn(id, at);
        if (def) learned.push(def);
      }
    }
    return learned;
  }

  /** Progression du regard en cours (0..1), pour la jauge du réticule. */
  progress(): number {
    let best = 0;
    for (const t of this.focus.values()) best = Math.max(best, t / LOOK_TIME);
    return Math.min(1, best);
  }

  entries(): IntelDef[] {
    return this.defs.filter((d) => this.known.has(d.id));
  }
}
