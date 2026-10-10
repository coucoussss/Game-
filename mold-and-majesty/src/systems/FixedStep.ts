/**
 * Accumulateur de temps pour une simulation à tick fixe, indépendante du framerate.
 * Au-delà de `maxSteps` ticks en retard (onglet en arrière-plan…), le retard est abandonné
 * plutôt que rattrapé d'un coup.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly stepMs: number,
    private readonly maxSteps = 10,
  ) {}

  /** Ajoute le temps écoulé et retourne le nombre de ticks à simuler. */
  advance(deltaMs: number): number {
    this.accumulator += deltaMs;
    const steps = Math.floor(this.accumulator / this.stepMs);
    this.accumulator -= steps * this.stepMs;
    if (steps > this.maxSteps) {
      this.accumulator = 0;
      return this.maxSteps;
    }
    return steps;
  }
}
