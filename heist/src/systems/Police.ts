/**
 * La police : on l'appelle, elle arrive après un délai qui raccourcit avec la chaleur, fouille les
 * abords de la cible un moment, puis repart. Les durées sont en secondes réelles.
 */

export type PoliceState = 'idle' | 'en-route' | 'searching' | 'leaving';

export interface PoliceRules {
  readonly policeEta: number;
  readonly policeEtaPerHeat: number;
  readonly policeEtaPerTier: number;
  readonly policeMinEta: number;
  readonly policeSearch: number;
}

/** Durée du trajet visible de la voiture, à l'arrivée comme au départ. */
export const DRIVE_TIME = 4;

export class Police {
  state: PoliceState = 'idle';
  /** Temps restant dans l'état courant. */
  timer = 0;
  /** Durée totale du trajet d'approche, pour animer la voiture. */
  private eta = 0;
  /** Vrai si l'appel vient d'une alarme sonore : le joueur l'entend. */
  loud = false;

  constructor(private readonly rules: PoliceRules) {}

  /** Plus la cible est importante et plus le joueur est connu, plus la police arrive vite. */
  etaFor(heat: number, tier = 0): number {
    const r = this.rules;
    return Math.max(r.policeMinEta, r.policeEta - heat * r.policeEtaPerHeat - tier * r.policeEtaPerTier);
  }

  /** Déclenche un appel. Renvoie vrai si la police n'était pas déjà en route. */
  call(heat: number, loud: boolean, tier = 0): boolean {
    this.loud = this.loud || loud;
    if (this.state === 'en-route' || this.state === 'searching') return false;
    this.state = 'en-route';
    this.eta = this.etaFor(heat, tier);
    this.timer = this.eta;
    return true;
  }

  /** Avance d'un pas. Renvoie l'état atteint s'il vient de changer. */
  step(dt: number): PoliceState | null {
    if (this.state === 'idle') return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    switch (this.state) {
      case 'en-route':
        this.state = 'searching';
        this.timer = this.rules.policeSearch;
        break;
      case 'searching':
        this.state = 'leaving';
        this.timer = DRIVE_TIME;
        break;
      case 'leaving':
        this.reset();
        break;
    }
    return this.state;
  }

  /** Prolonge la fouille tant que les agents ont une piste. */
  extendSearch(min: number): void {
    if (this.state === 'searching') this.timer = Math.max(this.timer, min);
  }

  reset(): void {
    this.state = 'idle';
    this.timer = 0;
    this.loud = false;
  }

  /** Position de la voiture le long de son trajet : 0 = hors champ, 1 = arrêtée sur place. */
  carProgress(): number {
    switch (this.state) {
      case 'idle':
        return 0;
      case 'en-route':
        return this.timer > DRIVE_TIME ? 0 : 1 - this.timer / DRIVE_TIME;
      case 'searching':
        return 1;
      case 'leaving':
        return this.timer / DRIVE_TIME;
    }
  }
}
