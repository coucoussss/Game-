import type { PedestrianDef, StaffDef, Vec2 } from '../data/types';
import { inHourRange } from './Clock';
import { bearing, distance, toPoint, type Point } from './geometry';
import type { NavGrid } from './NavGrid';

/** Vitesse de marche tranquille, en mètres par seconde réelle. */
export const NPC_SPEED = 1.4;

export type NpcKind = 'staff' | 'pedestrian' | 'officer';
export type Down = 'no' | 'ko' | 'dead';

/** Un personnage du monde : corps, perception et réactions. Son emploi du temps est tenu par un « cerveau ». */
export class Npc {
  readonly pos: Point = { x: 0, z: 0 };
  facing = 0;
  present = false;
  hp = 100;
  down: Down = 'no';
  moving = false;

  // Témoin.
  suspicion = 0;
  /** Compte à rebours avant l'appel à la police, ou null. */
  callTimer: number | null = null;
  /** Temps restant les mains en l'air. */
  compliant = 0;
  /** A déjà donné l'alerte pendant cet incident. */
  called = false;
  /** A été menacé ou volé : il appellera dès qu'il le pourra. */
  robbed = false;

  // Combat et poursuite (personnages armés).
  hostile = false;
  /** Va voir d'où vient un bruit. */
  investigating = false;
  lastKnown: Point | null = null;
  /** Temps écoulé depuis qu'il a vu le joueur pour la dernière fois. */
  unseenFor = Infinity;
  shootTimer = 0;
  /** Vrai pendant qu'il tient le joueur en joue (pour l'animation). */
  aiming = false;
  path: Point[] = [];
  repath = 0;
  lookTimer = 0;

  constructor(
    readonly id: string,
    readonly kind: NpcKind,
    readonly role: string,
    readonly name: string,
    readonly armed: boolean,
    readonly site: string | null,
    readonly variant: number,
  ) {}

  /** Peut voir, entendre et réagir. */
  get active(): boolean {
    return this.present && this.down === 'no';
  }

  /** Figé par la peur ou occupé à téléphoner : il ne suit plus son emploi du temps. */
  get frozen(): boolean {
    return this.compliant > 0 || this.callTimer !== null || this.hostile || this.investigating || this.down !== 'no';
  }

  /** Remet le personnage à neuf (nouveau jour, nouvel incident). */
  calm(): void {
    this.suspicion = 0;
    this.callTimer = null;
    this.compliant = 0;
    this.called = false;
    this.robbed = false;
    this.hostile = false;
    this.investigating = false;
    this.lastKnown = null;
    this.unseenFor = Infinity;
    this.aiming = false;
    this.path = [];
  }

  /** Avance le long de `path` à la vitesse donnée. Renvoie vrai une fois arrivé. */
  follow(speed: number, dt: number): boolean {
    let left = speed * dt;
    this.moving = false;
    while (left > 0 && this.path.length > 0) {
      const target = this.path[0] as Point;
      const d = distance(this.pos, target);
      if (d > 1e-6) {
        this.facing = bearing(this.pos, target);
        this.moving = true;
      }
      if (d <= left) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        left -= d;
        this.path.shift();
      } else {
        this.pos.x += ((target.x - this.pos.x) / d) * left;
        this.pos.z += ((target.z - this.pos.z) / d) * left;
        left = 0;
      }
    }
    return this.path.length === 0;
  }
}

/** Suit une suite de points à vitesse constante. */
export class Route {
  index = 1;
  constructor(
    readonly points: readonly Point[],
    readonly loop = false,
  ) {}

  static of(points: readonly Vec2[], loop = false): Route {
    return new Route(points.map(toPoint), loop);
  }

  get done(): boolean {
    return !this.loop && this.index >= this.points.length;
  }

  /** Déplace `pos` le long du trajet ; renvoie la direction suivie, ou null à l'arrêt. */
  advance(pos: Point, dist: number): number | null {
    let facing: number | null = null;
    let left = dist;
    let guard = 0;
    while (left > 0 && !this.done && guard++ < 64) {
      const target = this.points[this.index % this.points.length];
      if (!target) break;
      const d = distance(pos, target);
      if (d > 1e-6) facing = bearing(pos, target);
      if (d <= left) {
        pos.x = target.x;
        pos.z = target.z;
        left -= d;
        this.index = this.loop ? (this.index + 1) % this.points.length : this.index + 1;
      } else {
        pos.x += ((target.x - pos.x) / d) * left;
        pos.z += ((target.z - pos.z) / d) * left;
        left = 0;
      }
    }
    return facing;
  }
}

export type StaffMode = 'away' | 'arriving' | 'post' | 'patrol' | 'to-pause' | 'pause' | 'from-pause' | 'returning' | 'leaving';

/** Vrai si l'employé doit être en pause à cette heure. */
export function onPause(def: StaffDef, hour: number): boolean {
  const p = def.pause;
  if (!p || !inHourRange(hour, def.from, def.to)) return false;
  const h = Math.floor(hour);
  const minute = (hour - h) * 60;
  return h % p.every === 0 && h > def.from && minute >= p.minute && minute < p.minute + p.duration;
}

/**
 * Emploi du temps d'un employé ou d'un vigile : arrivée, poste ou ronde, pauses, départ (avec dépôt de la
 * recette au coffre). Les réactions au joueur sont gérées par `World`, qui fige le cerveau entre-temps.
 */
export class StaffBrain {
  mode: StaffMode = 'away';
  private route: Route | null = null;
  /** Vrai à l'instant où l'employé dépose la recette au coffre. */
  depositedThisStep = false;
  private wasFrozen = false;

  constructor(
    readonly def: StaffDef,
    readonly npc: Npc,
    private readonly nav: NavGrid,
  ) {}

  private get leavePath(): readonly Vec2[] {
    return this.def.leave ?? [...this.def.arrive].reverse();
  }

  /** Porte que l'employé laisse ouverte pendant sa pause. */
  get heldDoor(): string | null {
    const door = this.def.pause?.door;
    if (!door || !this.npc.active) return null;
    if (this.mode === 'pause') return door;
    if (!this.route) return null;
    if (this.mode === 'to-pause' && this.route.index >= this.route.points.length - 1) return door;
    if (this.mode === 'from-pause' && this.route.index <= 1) return door;
    return null;
  }

  /** Place l'employé selon l'heure, sans trajet (début de partie, réveil). */
  settle(hour: number): void {
    const npc = this.npc;
    this.route = null;
    this.wasFrozen = false;
    if (!inHourRange(hour, this.def.from, this.def.to)) {
      this.mode = 'away';
      npc.present = false;
      return;
    }
    npc.present = true;
    npc.moving = false;
    if (onPause(this.def, hour) && this.def.pause) {
      this.mode = 'pause';
      Object.assign(npc.pos, toPoint(this.def.pause.path.at(-1) ?? this.def.post));
      npc.facing = this.def.pause.facing;
    } else if (this.def.patrol) {
      this.mode = 'patrol';
      this.route = Route.of(this.def.patrol, true);
      Object.assign(npc.pos, toPoint(this.def.patrol[0] ?? this.def.post));
    } else {
      this.mode = 'post';
      Object.assign(npc.pos, toPoint(this.def.post));
      npc.facing = this.def.postFacing;
    }
  }

  step(dt: number, hour: number): void {
    const npc = this.npc;
    const def = this.def;
    this.depositedThisStep = false;
    const duty = inHourRange(hour, def.from, def.to);

    if (this.mode === 'away') {
      if (!duty || npc.down !== 'no') return;
      this.mode = 'arriving';
      this.route = Route.of(def.arrive);
      Object.assign(npc.pos, toPoint(def.arrive[0] ?? def.post));
      npc.present = true;
    }
    if (npc.frozen) {
      this.wasFrozen = true;
      npc.moving = npc.hostile || npc.investigating ? npc.moving : false;
      return;
    }
    // Après une alerte, il regagne son poste par le chemin le plus court.
    if (this.wasFrozen) {
      this.wasFrozen = false;
      if (this.mode !== 'leaving' && this.mode !== 'arriving') {
        const home = toPoint(def.patrol?.[0] ?? def.post);
        if (distance(npc.pos, home) > 0.5) {
          this.mode = 'returning';
          this.route = new Route([{ ...npc.pos }, ...this.nav.path(npc.pos, home)]);
        }
      }
    }

    switch (this.mode) {
      case 'post':
        if (!duty) this.start('leaving', this.leavePath);
        else if (onPause(def, hour) && def.pause) this.start('to-pause', def.pause.path);
        break;
      case 'patrol':
        if (!duty) {
          const exit = this.leavePath.map(toPoint);
          const first = exit[0] ?? npc.pos;
          this.mode = 'leaving';
          this.route = new Route([{ ...npc.pos }, ...this.nav.path(npc.pos, first), ...exit.slice(1)]);
        }
        break;
      case 'pause':
        if (!onPause(def, hour) && def.pause) this.start('from-pause', [...def.pause.path].reverse());
        break;
      default:
        break;
    }
    if (!this.route) {
      npc.moving = false;
      return;
    }

    const before = this.route.index;
    const facing = this.route.advance(npc.pos, NPC_SPEED * dt);
    npc.moving = facing !== null;
    if (facing !== null) npc.facing = facing;
    if (this.mode === 'leaving' && def.depositAt !== undefined && before <= def.depositAt && this.route.index > def.depositAt) {
      this.depositedThisStep = true;
    }
    if (!this.route.done) return;

    this.route = null;
    npc.moving = false;
    switch (this.mode) {
      case 'arriving':
      case 'from-pause':
      case 'returning':
        if (def.patrol) {
          this.mode = 'patrol';
          this.route = Route.of(def.patrol, true);
        } else {
          this.mode = 'post';
          npc.facing = def.postFacing;
        }
        break;
      case 'to-pause':
        this.mode = 'pause';
        npc.facing = def.pause?.facing ?? npc.facing;
        break;
      case 'leaving':
        this.mode = 'away';
        npc.present = false;
        break;
      default:
        break;
    }
  }

  private start(mode: StaffMode, path: readonly Vec2[]): void {
    this.mode = mode;
    this.route = Route.of(path);
  }
}

/** Un passant fait des allers-retours sur son trajet pendant ses heures de sortie. */
export class PedestrianBrain {
  private route: Route;
  private forward = true;

  constructor(
    readonly def: PedestrianDef,
    readonly npc: Npc,
  ) {
    this.route = Route.of(def.path);
  }

  settle(hour: number): void {
    this.npc.present = inHourRange(hour, this.def.from, this.def.to);
    this.forward = true;
    this.route = Route.of(this.def.path);
    Object.assign(this.npc.pos, toPoint(this.def.path[0] ?? [0, 0]));
  }

  step(dt: number, hour: number): void {
    const npc = this.npc;
    const out = inHourRange(hour, this.def.from, this.def.to);
    if (!npc.present) {
      if (!out || npc.down !== 'no') return;
      this.settle(hour);
    }
    if (npc.frozen) {
      npc.moving = false;
      return;
    }
    const facing = this.route.advance(npc.pos, NPC_SPEED * dt);
    npc.moving = facing !== null;
    if (facing !== null) npc.facing = facing;
    if (!this.route.done) return;
    // Arrivé au bout : il fait demi-tour, ou rentre chez lui s'il est tard.
    if (!out) {
      npc.present = false;
      return;
    }
    this.forward = !this.forward;
    const pts = this.forward ? this.def.path : [...this.def.path].reverse();
    this.route = Route.of(pts);
  }
}
