/** Horloge de jeu. Le temps est compté en secondes de jeu depuis minuit du jour 1. */

export const SECONDS_PER_DAY = 24 * 3600;

export class Clock {
  constructor(public seconds: number) {}

  static atHour(day: number, hour: number): Clock {
    return new Clock((day - 1) * SECONDS_PER_DAY + hour * 3600);
  }

  advance(gameSeconds: number): void {
    this.seconds += gameSeconds;
  }

  /** Jour courant, à partir de 1. */
  get day(): number {
    return Math.floor(this.seconds / SECONDS_PER_DAY) + 1;
  }

  /** Heure décimale dans la journée, dans [0, 24[. */
  get hour(): number {
    return (this.seconds % SECONDS_PER_DAY) / 3600;
  }

  /** Avance jusqu'à la prochaine occurrence de l'heure donnée (strictement dans le futur). */
  skipTo(hour: number): void {
    let target = (this.day - 1) * SECONDS_PER_DAY + hour * 3600;
    while (target <= this.seconds) target += SECONDS_PER_DAY;
    this.seconds = target;
  }

  format(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `Jour ${this.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** Vrai si `hour` est dans la plage [from, to[, qui peut passer minuit. */
export function inHourRange(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * Lumière du jour, de 0 (nuit) à 1 (plein jour), avec aube de 6 h à 8 h et crépuscule de 19 h à 21 h.
 */
export function daylight(hour: number): number {
  if (hour < 6 || hour >= 21) return 0;
  if (hour < 8) return (hour - 6) / 2;
  if (hour < 19) return 1;
  return 1 - (hour - 19) / 2;
}
