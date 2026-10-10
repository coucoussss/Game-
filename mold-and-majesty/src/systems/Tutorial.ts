import type { World } from './World';

export interface TutorialStep {
  id: string;
  text: string;
}

/** Condition de réussite de chaque étape, lue dans l'état du monde. */
const DONE: Record<string, (w: World) => boolean> = {
  grow: (w) => [...w.net.segments.values()].some((s) => s.growth >= 1),
  minerals: (w) =>
    [...w.net.nodes.values()].some(
      (n) => n.kind !== 'heart' && w.deposits.some((d) => Math.hypot(d.x - n.x, d.y - n.y) <= w.data.soil.mineralRadius),
    ),
  tree: (w) => w.allies.some((a) => a.species === 'tree' && w.tick - a.lastTrade < 30),
  thick: (w) => [...w.net.segments.values()].some((s) => s.thickness === 'thick' && s.growth >= 1),
  storage: (w) => [...w.net.nodes.values()].some((n) => n.kind === 'storage' && n.build >= 1),
  relay: (w) => [...w.net.nodes.values()].some((n) => n.kind === 'relay' && n.build >= 1),
  hive: (w) => w.hives > 0,
  sporee: (w) => w.sporeeYear > 0,
};

/**
 * Tutoriel de la première forêt : une suite d'étapes, chacune validée par l'état du
 * monde (et non par un clic sur « suivant »). Une étape déjà accomplie par le joueur
 * est franchie d'elle-même.
 */
export class Tutorial {
  index = 0;

  constructor(readonly steps: readonly TutorialStep[]) {
    for (const step of steps) if (!DONE[step.id]) throw new Error(`Tutoriel : étape inconnue "${step.id}"`);
  }

  get current(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** Avance tant que les étapes sont accomplies. Retourne true si une étape vient d'être franchie. */
  update(world: World): boolean {
    let advanced = false;
    while (this.current && DONE[this.current.id]!(world)) {
      this.index++;
      advanced = true;
    }
    return advanced;
  }
}
