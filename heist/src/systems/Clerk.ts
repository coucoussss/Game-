import type { LevelDef, RulesDef, Vec2 } from '../data/types';
import { inHourRange } from './Clock';
import { bearing, distance, toPoint, type Point } from './geometry';

/** Vitesse de marche des passants, en mètres par seconde réelle. */
export const NPC_SPEED = 1.4;

/** Suit une suite de points à vitesse constante. */
export class Route {
  index = 1;
  constructor(readonly points: readonly Point[]) {}

  static of(points: readonly Vec2[]): Route {
    return new Route(points.map(toPoint));
  }

  get done(): boolean {
    return this.index >= this.points.length;
  }

  /** Déplace `pos` vers le prochain point ; renvoie la direction suivie, ou null à l'arrêt. */
  advance(pos: Point, dist: number): number | null {
    let facing: number | null = null;
    let left = dist;
    while (left > 0 && !this.done) {
      const target = this.points[this.index];
      if (!target) break;
      const d = distance(pos, target);
      if (d > 1e-6) facing = bearing(pos, target);
      if (d <= left) {
        pos.x = target.x;
        pos.z = target.z;
        left -= d;
        this.index++;
      } else {
        pos.x += ((target.x - pos.x) / d) * left;
        pos.z += ((target.z - pos.z) / d) * left;
        left = 0;
      }
    }
    return facing;
  }
}

export type ClerkMode = 'away' | 'arriving' | 'counter' | 'to-break' | 'smoking' | 'from-break' | 'closing';

/** Ce que l'emploi du temps demande à l'employé à une heure donnée. */
export type ClerkDuty = 'away' | 'counter' | 'break' | 'leave';

export function clerkDuty(hour: number, rules: RulesDef): ClerkDuty {
  if (inHourRange(hour, rules.storeOpen - 0.25, rules.storeOpen)) return 'counter';
  if (!inHourRange(hour, rules.storeOpen, rules.storeClose)) return 'leave';
  const h = Math.floor(hour);
  const minute = (hour - h) * 60;
  const onBreak =
    h > rules.storeOpen &&
    h % rules.breakEvery === 0 &&
    minute >= rules.breakMinute &&
    minute < rules.breakMinute + rules.breakDuration;
  return onBreak ? 'break' : 'counter';
}

/**
 * L'employé de la supérette suit son emploi du temps : arrivée, comptoir, pauses cigarette par la porte
 * arrière, rangement de la caisse dans le coffre, départ. Les réactions au joueur sont gérées par `World`.
 */
export class Clerk {
  mode: ClerkMode = 'away';
  readonly pos: Point;
  facing = Math.PI / 2;
  private route: Route | null = null;
  private readonly arrivePath: readonly Vec2[];
  /** Vrai à l'instant où l'employé dépose la caisse dans le coffre. */
  depositedThisStep = false;

  constructor(
    private readonly level: LevelDef,
    private readonly rules: RulesDef,
  ) {
    this.pos = toPoint(level.clerk.counter);
    // Le trajet d'arrivée est la fin du trajet de départ, à l'envers, sans le passage au coffre.
    const exit = level.clerk.exitPath;
    this.arrivePath = [...exit.slice(4)].reverse().concat([level.clerk.counter]);
  }

  get present(): boolean {
    return this.mode !== 'away';
  }

  /** La porte arrière est ouverte pendant la pause : quand l'employé la franchit ou fume dehors. */
  get holdsBackDoorOpen(): boolean {
    if (this.mode === 'smoking') return true;
    if (!this.route) return false;
    if (this.mode === 'to-break') return this.route.index >= this.route.points.length - 1;
    if (this.mode === 'from-break') return this.route.index <= 1;
    return false;
  }

  /** Place l'employé selon l'heure, sans trajet (début de partie, réveil, sortie de garde à vue). */
  settle(hour: number): void {
    const duty = clerkDuty(hour, this.rules);
    this.route = null;
    if (duty === 'away' || duty === 'leave') {
      this.mode = 'away';
      return;
    }
    const spot = duty === 'break' ? this.level.clerk.waypointsToBreak.at(-1) : this.level.clerk.counter;
    this.mode = duty === 'break' ? 'smoking' : 'counter';
    if (spot) Object.assign(this.pos, toPoint(spot));
    this.facing = this.restFacing();
  }

  /** `frozen` : l'employé ne bouge plus (mains en l'air, au téléphone, caché). */
  step(dt: number, hour: number, frozen: boolean): void {
    this.depositedThisStep = false;
    const duty = clerkDuty(hour, this.rules);
    switch (this.mode) {
      case 'away':
        if (duty === 'counter') this.start('arriving', this.arrivePath);
        break;
      case 'counter':
        if (duty === 'break') this.start('to-break', this.level.clerk.waypointsToBreak);
        else if (duty === 'leave') this.start('closing', this.level.clerk.exitPath);
        break;
      case 'smoking':
        if (duty !== 'break') this.start('from-break', [...this.level.clerk.waypointsToBreak].reverse());
        break;
      default:
        break;
    }
    if (frozen || !this.route) return;

    const before = this.route.index;
    const facing = this.route.advance(this.pos, NPC_SPEED * dt);
    if (facing !== null) this.facing = facing;
    // Le troisième point du trajet de départ est le coffre.
    if (this.mode === 'closing' && before <= 2 && this.route.index > 2) this.depositedThisStep = true;
    if (!this.route.done) return;

    this.route = null;
    if (this.mode === 'arriving' || this.mode === 'from-break') this.mode = 'counter';
    else if (this.mode === 'to-break') this.mode = 'smoking';
    else if (this.mode === 'closing') this.mode = 'away';
    this.facing = this.restFacing();
  }

  private start(mode: ClerkMode, path: readonly Vec2[]): void {
    this.mode = mode;
    this.route = Route.of(path);
    const first = this.route.points[0];
    if (first && mode === 'arriving') Object.assign(this.pos, first);
  }

  private restFacing(): number {
    // Au comptoir, il regarde la porte d'entrée ; dehors, il regarde la ruelle.
    return this.mode === 'smoking' ? -Math.PI / 2 : Math.PI / 2;
  }
}
