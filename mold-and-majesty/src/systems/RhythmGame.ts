import type { SporulationDef } from '../data/types';
import { Random } from './Random';

export type Judgement = 'perfect' | 'good' | 'miss';

/**
 * Partition d'une sporée : instants des notes (ms depuis le début), tirés de mesures
 * choisies au hasard dans `patterns`. La première croche de chaque mesure porte toujours
 * une note, pour garder le pouls lisible.
 */
export function generatePattern(def: SporulationDef, seed: number): number[] {
  const rng = new Random(seed);
  const eighth = 60000 / def.bpm / 2;
  const notes: number[] = [];
  for (let bar = 0; bar < def.bars; bar++) {
    const pattern = def.patterns[rng.int(0, def.patterns.length - 1)]!;
    pattern.forEach((on, i) => {
      if (on || i === 0) notes.push(Math.round(def.leadInMs + (bar * 8 + i) * eighth));
    });
  }
  return notes;
}

/**
 * Mini-jeu rythmique de la sporée, sans affichage : on lui donne l'heure de chaque frappe,
 * il juge la note la plus proche et tient le score. Une frappe hors de toute fenêtre est
 * une fausse note (légère pénalité).
 */
export class RhythmGame {
  readonly judgements: (Judgement | null)[];
  strays = 0;
  combo = 0;
  maxCombo = 0;

  constructor(
    readonly notes: readonly number[],
    readonly windows: { perfect: number; good: number },
  ) {
    this.judgements = notes.map(() => null);
  }

  /** Juge une frappe à l'instant `time`. Retourne null pour une fausse note. */
  hit(time: number): Judgement | null {
    let best = -1;
    let bestDelta = Infinity;
    this.notes.forEach((t, i) => {
      const delta = Math.abs(t - time);
      if (this.judgements[i] === null && delta <= this.windows.good && delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    });
    if (best < 0) {
      this.strays++;
      this.combo = 0;
      return null;
    }
    const judgement: Judgement = bestDelta <= this.windows.perfect ? 'perfect' : 'good';
    this.judgements[best] = judgement;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    return judgement;
  }

  /** Déclare manquées les notes dépassées. Retourne leurs indices. */
  update(time: number): number[] {
    const missed: number[] = [];
    this.notes.forEach((t, i) => {
      if (this.judgements[i] === null && time - t > this.windows.good) {
        this.judgements[i] = 'miss';
        this.combo = 0;
        missed.push(i);
      }
    });
    return missed;
  }

  get finished(): boolean {
    return this.judgements.every((j) => j !== null);
  }

  /** Score de 0 à 1 : parfait = 1, bien = 0,5, raté = 0 ; chaque fausse note retire 0,1 note. */
  score(): number {
    if (this.notes.length === 0) return 0;
    let total = 0;
    for (const j of this.judgements) total += j === 'perfect' ? 1 : j === 'good' ? 0.5 : 0;
    return Math.max(0, Math.min(1, (total - 0.1 * this.strays) / this.notes.length));
  }
}

/** Portée de la sporée, en mètres : plus de spores et un meilleur rythme portent plus loin. */
export function sporeReach(def: SporulationDef, spores: number, score: number): number {
  const rhythm = def.minScoreFactor + (1 - def.minScoreFactor) * score;
  return Math.round((def.baseReach + def.perSpore * spores) * rhythm);
}
