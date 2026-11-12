import type { DoorId, GameData, IntelDef, InteractableDef, ItemId, Rect } from '../data/types';
import { Clerk, NPC_SPEED } from './Clerk';
import { Clock, inHourRange } from './Clock';
import {
  angleDiff,
  bearing,
  distance,
  lineOfSight,
  moveCircle,
  pointInRect,
  toPoint,
  type Point,
} from './geometry';
import { Inventory } from './Inventory';
import { Notebook } from './Notebook';
import { Police } from './Police';

export const PLAYER_RADIUS = 0.3;
export const EYE_HEIGHT = 1.65;
export const CROUCH_EYE_HEIGHT = 1.0;
export const INTERACT_RANGE = 2.0;
/** Demi-angle du regard du joueur pour remarquer quelqu'un. */
const PLAYER_VIEW = 0.6;
/** Demi-angle de visée pour menacer quelqu'un. */
const AIM_ANGLE = 0.25;

export interface PlayerInput {
  /** Avancer (+1) / reculer (−1). */
  readonly forward: number;
  /** Pas de côté vers la droite (+1) / la gauche (−1). */
  readonly strafe: number;
  /** Direction du regard dans le plan (0 = +x, π/2 = +z), et inclinaison (positive vers le haut). */
  readonly facing: number;
  readonly pitch: number;
  readonly sprint: boolean;
  readonly crouch: boolean;
  /** Touche d'interaction maintenue. */
  readonly interact: boolean;
  /** Bouton d'action maintenu : menacer avec une arme, enfiler un vêtement. */
  readonly use: boolean;
  /** Emplacement d'inventaire choisi cette image (0..n), ou null. */
  readonly slot: number | null;
}

export const IDLE_INPUT: PlayerInput = {
  forward: 0,
  strafe: 0,
  facing: 0,
  pitch: 0,
  sprint: false,
  crouch: false,
  interact: false,
  use: false,
  slot: null,
};

export type CrimeKind = 'threat' | 'theft' | 'break-in' | 'sabotage' | 'trespass';

export interface Report {
  readonly success: boolean;
  readonly loot: number;
  readonly calls: readonly string[];
  readonly identified: boolean;
  readonly policeCame: boolean;
  readonly lost: readonly ItemId[];
  readonly duration: number;
}

export type WorldEvent =
  | { readonly type: 'message'; readonly text: string }
  | { readonly type: 'intel'; readonly def: IntelDef }
  | { readonly type: 'open-shop' }
  | { readonly type: 'open-notebook' }
  | { readonly type: 'alarm' }
  | { readonly type: 'loot'; readonly amount: number }
  | { readonly type: 'report'; readonly report: Report };

/** Un témoin potentiel : l'employé ou un passant. */
export interface Witness {
  readonly name: string;
  suspicion: number;
  /** Compte à rebours avant l'appel à la police, ou null s'il n'appelle pas. */
  callTimer: number | null;
  /** Temps restant les mains en l'air. */
  compliant: number;
  /** A déjà appelé pendant cet incident : il se terre. */
  called: boolean;
  /** A été braqué : il appellera dès qu'il le pourra. */
  robbed: boolean;
}

function newWitness(name: string): Witness {
  return { name, suspicion: 0, callTimer: null, compliant: 0, called: false, robbed: false };
}

interface Incident {
  loot: number;
  calls: string[];
  identified: boolean;
  policeCame: boolean;
  start: number;
}

interface HoldAction {
  readonly target: string;
  readonly total: number;
  readonly crime: CrimeKind;
  readonly noisy: boolean;
  progress: number;
}

export class Pedestrian {
  readonly pos: Point;
  facing = 0;
  private dir = 1;
  private readonly a: Point;
  private readonly b: Point;

  constructor(path: readonly (readonly [number, number])[]) {
    this.a = toPoint(path[0] ?? [0, 0]);
    this.b = toPoint(path[1] ?? [0, 0]);
    this.pos = { ...this.a };
  }

  step(dt: number): void {
    const target = this.dir > 0 ? this.b : this.a;
    const d = distance(this.pos, target);
    const move = NPC_SPEED * dt;
    this.facing = bearing(this.pos, target);
    if (d <= move) {
      Object.assign(this.pos, target);
      this.dir = -this.dir;
    } else {
      this.pos.x += ((target.x - this.pos.x) / d) * move;
      this.pos.z += ((target.z - this.pos.z) / d) * move;
    }
  }
}

/**
 * Tout l'état d'une partie, sans Three.js. `step(dt, input)` fait avancer le monde de `dt` secondes réelles.
 */
export class World {
  readonly clock: Clock;
  readonly inventory: Inventory;
  readonly notebook: Notebook;
  readonly police: Police;
  readonly clerk: Clerk;
  readonly pedestrian: Pedestrian;
  readonly clerkWitness = newWitness("L'employé");
  readonly pedestrianWitness = newWitness('Un passant');

  readonly player = { pos: { x: 0, z: 0 } as Point, facing: 0, pitch: 0, crouching: false, moving: false };
  heat = 0;
  /** Le joueur a été reconnu lors d'un précédent coup : l'employé le reconnaîtra à visage découvert. */
  wanted = false;
  powered = true;
  backDoorForced = false;
  private frontUnlock = 0;
  register = 0;
  registerEmptied = false;
  safe: number;
  readonly used = new Set<string>();

  events: WorldEvent[] = [];
  prompt: string | null = null;
  action: HoldAction | null = null;
  threatening = false;
  noisy = false;
  incident: Incident | null = null;

  private prevInteract = false;
  private prevUse = false;
  private lastResetDay = 0;
  private lastHeatDay: number;
  private readonly blockers: Rect[];
  private readonly sightBlockers: Rect[];

  constructor(readonly data: GameData) {
    const { rules, level } = data;
    this.clock = Clock.atHour(1, rules.startHour);
    this.inventory = new Inventory(data.items, rules.startCash);
    this.notebook = new Notebook(level.intel);
    this.police = new Police(rules);
    this.clerk = new Clerk(level, rules);
    this.pedestrian = new Pedestrian(level.pedestrian.path);
    this.player.pos = toPoint(level.spawn);
    this.player.facing = -Math.PI / 2;
    this.safe = rules.safeBase;
    this.blockers = level.walls.map((w) => w.rect);
    this.sightBlockers = level.walls.filter((w) => w.blocksSight).map((w) => w.rect);
    this.lastHeatDay = this.clock.day;
    this.clerk.settle(this.clock.hour);
    // La partie commence en cours de journée : la caisse est déjà en partie remplie.
    this.lastResetDay = this.clock.day;
    this.register = this.registerValue();
  }

  // --- État dérivé -------------------------------------------------------------------------------

  get storeOpen(): boolean {
    return inHourRange(this.clock.hour, this.data.rules.storeOpen, this.data.rules.storeClose);
  }

  get fencePresent(): boolean {
    const f = this.data.level.fence;
    return inHourRange(this.clock.hour, f.openFrom, f.openTo);
  }

  get pedestrianPresent(): boolean {
    const p = this.data.level.pedestrian;
    return inHourRange(this.clock.hour, p.activeFrom, p.activeTo);
  }

  doorOpen(id: DoorId): boolean {
    if (id === 'store-front') return this.storeOpen || this.frontUnlock > 0;
    return this.backDoorForced || this.clerk.holdsBackDoorOpen;
  }

  inHideout(): boolean {
    return pointInRect(this.player.pos, this.data.level.hideout);
  }

  inStore(): boolean {
    return pointInRect(this.player.pos, this.data.level.store);
  }

  eyeHeight(): number {
    return this.player.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
  }

  private registerValue(): number {
    const r = this.data.rules;
    if (this.registerEmptied || !this.storeOpen) return 0;
    const hours = Math.max(0, this.clock.hour - r.storeOpen);
    return Math.min(r.registerMax, Math.floor(r.registerBase + r.registerPerHour * hours));
  }

  private obstacles(): Rect[] {
    const list = [...this.blockers];
    for (const d of this.data.level.doors) if (!this.doorOpen(d.id)) list.push(d.rect);
    return list;
  }

  private sightObstacles(): Rect[] {
    const list = [...this.sightBlockers];
    for (const d of this.data.level.doors) if (!this.doorOpen(d.id)) list.push(d.rect);
    return list;
  }

  /** Ligne de vue entre deux points, en raccourcissant le segment près de la cible (posée sur un mur). */
  clearSight(from: Point, to: Point): boolean {
    const d = distance(from, to);
    if (d < 1e-6) return true;
    const back = Math.min(0.3, d * 0.5);
    const end = { x: to.x - ((to.x - from.x) / d) * back, z: to.z - ((to.z - from.z) / d) * back };
    return lineOfSight(from, end, this.sightObstacles());
  }

  /** Distance à laquelle un témoin remarque le joueur, selon l'éclairage et la posture. */
  private visibilityRange(): number {
    let range = this.data.rules.civilianRange;
    const hour = this.clock.hour;
    const night = hour < 7 || hour >= 20;
    if (night) {
      const lit = this.inStore()
        ? this.powered
        : this.data.level.lamps.some((l) => distance(toPoint(l), this.player.pos) < 6);
      if (!lit) range *= 0.4;
    }
    if (this.player.crouching) range *= 0.6;
    return range;
  }

  /** Vrai si un civil placé en `pos` et regardant vers `facing` voit le joueur. */
  civilianSees(pos: Point, facing: number): boolean {
    const d = distance(pos, this.player.pos);
    if (d > this.visibilityRange()) return false;
    if (d > 1.2 && Math.abs(angleDiff(facing, bearing(pos, this.player.pos))) > this.data.rules.civilianFov / 2) return false;
    return this.clearSight(pos, this.player.pos);
  }

  cameraSees(): boolean {
    if (!this.powered) return false;
    for (const cam of this.data.level.cameras) {
      const pos = toPoint(cam.pos);
      const d = distance(pos, this.player.pos);
      if (d > cam.range) continue;
      if (Math.abs(angleDiff(cam.facing, bearing(pos, this.player.pos))) > cam.fov / 2) continue;
      if (this.clearSight(pos, this.player.pos)) return true;
    }
    return false;
  }

  /** Vrai si le joueur regarde le point (x, y, z), en tenant compte de l'inclinaison. */
  looksAt(target: Point, y: number, maxRange: number, tolerance = 0.35): boolean {
    const p = this.player.pos;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dy = y - this.eyeHeight();
    const flat = Math.hypot(dx, dz);
    const dist = Math.hypot(flat, dy);
    if (dist > maxRange || dist < 0.05) return false;
    const cp = Math.cos(this.player.pitch);
    const look = [cp * Math.cos(this.player.facing), Math.sin(this.player.pitch), cp * Math.sin(this.player.facing)] as const;
    const dot = (look[0] * dx + look[1] * dy + look[2] * dz) / dist;
    const allowed = Math.max(Math.atan(tolerance / dist), 0.07);
    if (Math.acos(Math.min(1, dot)) > allowed) return false;
    return this.clearSight(p, target);
  }

  private playerNotices(pos: Point): boolean {
    const d = distance(this.player.pos, pos);
    if (d > 25) return false;
    if (Math.abs(angleDiff(this.player.facing, bearing(this.player.pos, pos))) > PLAYER_VIEW) return false;
    return this.clearSight(this.player.pos, pos);
  }

  // --- Boucle ------------------------------------------------------------------------------------

  step(dt: number, input: PlayerInput): void {
    const rules = this.data.rules;
    this.clock.advance(dt * rules.timeScale);
    this.dailyUpdate();

    const pressedInteract = input.interact && !this.prevInteract;
    const pressedUse = input.use && !this.prevUse;
    this.prevInteract = input.interact;
    this.prevUse = input.use;

    this.movePlayer(dt, input);
    if (input.slot !== null) {
      this.inventory.select(input.slot);
      this.action = null;
    }
    if (pressedUse) this.useHeld();

    this.frontUnlock = Math.max(0, this.frontUnlock - dt);
    let crime = this.handleInteraction(dt, input, pressedInteract);

    // Menace : arme pointée sur l'employé, bouton d'action maintenu.
    this.threatening = false;
    const range = this.inventory.threatRange();
    if (range > 0 && input.use && this.clerk.present) {
      const d = distance(this.player.pos, this.clerk.pos);
      const aim = Math.abs(angleDiff(this.player.facing, bearing(this.player.pos, this.clerk.pos)));
      if (d <= range && aim < AIM_ANGLE && this.clearSight(this.player.pos, this.clerk.pos)) {
        this.threatening = true;
        crime = 'threat';
      }
    }
    if (crime === null && this.inStore() && !this.storeOpen) crime = 'trespass';
    if (crime !== null && this.incident === null) {
      this.incident = { loot: 0, calls: [], identified: false, policeCame: false, start: this.clock.seconds };
    }

    // Les civils vivent leur vie (sauf s'ils sont figés par la peur ou au téléphone).
    const cw = this.clerkWitness;
    const clerkFrozen = cw.compliant > 0 || cw.callTimer !== null || (cw.called && this.police.state !== 'idle');
    this.clerk.step(dt, this.clock.hour, clerkFrozen);
    if (this.clerk.depositedThisStep) {
      this.safe += this.register;
      this.register = 0;
      this.registerEmptied = true;
    }
    const pw = this.pedestrianWitness;
    if (this.pedestrianPresent && pw.callTimer === null) this.pedestrian.step(dt);

    if (this.clerk.present) this.updateWitness(cw, this.clerk.pos, this.clerk, dt, crime, true);
    else cw.suspicion = 0;
    if (this.pedestrianPresent) this.updateWitness(pw, this.pedestrian.pos, this.pedestrian, dt, crime, false);

    if (crime !== null && this.cameraSees()) {
      this.markSeen();
      this.callPolice('La caméra a déclenché une alerte silencieuse', false);
    }

    this.updateIntel(dt);
    this.updatePolice(dt);
    if (this.storeOpen && !this.registerEmptied) this.register = Math.max(this.register, this.registerValue());
  }

  /** Remise à zéro quotidienne, à l'ouverture de la boutique, et refroidissement de la chaleur. */
  private dailyUpdate(): void {
    const rules = this.data.rules;
    const day = this.clock.day;
    if (day !== this.lastHeatDay) {
      this.heat = Math.max(0, this.heat - rules.heatDecayPerDay * (day - this.lastHeatDay));
      this.lastHeatDay = day;
      if (this.heat < 20) this.wanted = false;
    }
    if (day !== this.lastResetDay && this.clock.hour >= rules.storeOpen) {
      this.lastResetDay = day;
      this.registerEmptied = false;
      this.register = this.registerValue();
      // Le patron passe tôt : il vide le coffre à la banque, répare ce qui a été cassé.
      this.safe = rules.safeBase;
      this.powered = true;
      this.backDoorForced = false;
    }
  }

  private movePlayer(dt: number, input: PlayerInput): void {
    const rules = this.data.rules;
    const p = this.player;
    p.facing = input.facing;
    p.pitch = input.pitch;
    p.crouching = input.crouch;
    let speed = input.crouch ? rules.crouchSpeed : input.sprint ? rules.sprintSpeed : rules.walkSpeed;
    speed *= this.inventory.speedFactor();
    // Pas de déplacement pendant une action maintenue.
    if (this.action) speed = 0;
    const len = Math.hypot(input.forward, input.strafe);
    p.moving = len > 0.01 && speed > 0;
    if (!p.moving) return;
    const f = input.forward / Math.max(1, len);
    const s = input.strafe / Math.max(1, len);
    const dx = (Math.cos(p.facing) * f - Math.sin(p.facing) * s) * speed * dt;
    const dz = (Math.sin(p.facing) * f + Math.cos(p.facing) * s) * speed * dt;
    p.pos = moveCircle(p.pos, { x: dx, z: dz }, PLAYER_RADIUS, this.obstacles());
  }

  private useHeld(): void {
    const held = this.inventory.held;
    if (held === null || this.inventory.def(held).kind !== 'wearable') return;
    const worn = this.inventory.toggleWear(held);
    const name = this.inventory.def(held).name;
    this.emit({ type: 'message', text: worn ? `${name} enfilé.` : `${name} retiré.` });
  }

  /** Cible d'interaction : l'interactif le plus proche, devant le joueur, à portée et en vue. */
  target(): InteractableDef | null {
    let best: InteractableDef | null = null;
    let bestScore = Infinity;
    for (const it of this.data.level.interactables) {
      if (this.used.has(it.id)) continue;
      if (it.kind === 'fence' && !this.fencePresent) continue;
      const pos = toPoint(it.pos);
      const d = distance(this.player.pos, pos);
      if (d > INTERACT_RANGE) continue;
      const aim = Math.abs(angleDiff(this.player.facing, bearing(this.player.pos, pos)));
      if (aim > 0.7 && d > 0.6) continue;
      if (!this.clearSight(this.player.pos, pos)) continue;
      const score = d + aim * 2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  /** Gère la cible d'interaction et les actions maintenues. Renvoie le crime en cours, s'il y en a un. */
  private handleInteraction(dt: number, input: PlayerInput, pressed: boolean): CrimeKind | null {
    const it = this.target();
    this.prompt = null;
    this.noisy = false;
    if (!it) {
      this.action = null;
      return null;
    }
    const held = this.inventory.held;
    const has = (id: ItemId) => held === id;

    const hold = (total: number, crime: CrimeKind, noisy: boolean, label: string, done: () => void): CrimeKind | null => {
      this.prompt = `[E maintenu] ${label}`;
      if (!input.interact) {
        this.action = null;
        return null;
      }
      if (!this.action || this.action.target !== it.id) {
        this.action = { target: it.id, total, crime, noisy, progress: 0 };
      }
      this.action.progress += dt;
      this.noisy = noisy;
      if (this.action.progress >= total) {
        this.action = null;
        done();
      }
      return crime;
    };

    if (this.action && this.action.target !== it.id) this.action = null;

    switch (it.kind) {
      case 'cash':
        this.prompt = `[E] Fouiller : ${it.name}`;
        if (pressed) {
          this.used.add(it.id);
          this.inventory.cash += it.amount ?? 0;
          this.emit({ type: 'message', text: `${it.amount ?? 0} $ trouvés dans la poche. C'est tout ce qu'il te reste.` });
        }
        return null;
      case 'pickup': {
        this.prompt = `[E] Fouiller : ${it.name}`;
        if (pressed && it.item) {
          this.used.add(it.id);
          this.inventory.add(it.item);
          this.emit({ type: 'message', text: `Trouvé : ${this.inventory.def(it.item).name}.` });
        }
        return null;
      }
      case 'register': {
        if (this.register <= 0) {
          this.prompt = 'La caisse est vide.';
          return null;
        }
        this.prompt = `[E] Vider la caisse (${this.register} $)`;
        if (!pressed) return null;
        const amount = this.register;
        this.register = 0;
        this.registerEmptied = true;
        this.addLoot(amount);
        return 'theft';
      }
      case 'safe': {
        if (this.safe <= 0) {
          this.prompt = 'Le coffre est vide.';
          return null;
        }
        if (!has('crowbar')) {
          this.prompt = 'Un coffre. Il faudrait un pied-de-biche en main.';
          return null;
        }
        return hold(this.data.rules.crackSafeTime, 'theft', true, 'Forcer le coffre', () => {
          const amount = this.safe;
          this.safe = 0;
          this.addLoot(amount);
        });
      }
      case 'fuse-box': {
        if (!this.powered) {
          this.prompt = 'Les câbles pendent, tranchés.';
          return null;
        }
        if (!has('wire-cutters')) {
          this.prompt = 'Boîte à fusibles. Il faudrait un coupe-fil en main.';
          return null;
        }
        return hold(this.data.rules.cutFuseTime, 'sabotage', false, 'Couper les câbles', () => {
          this.powered = false;
          this.emit({ type: 'message', text: 'Courant coupé. La diode de la caméra s’éteint.' });
        });
      }
      case 'door':
        return this.handleDoor(it, pressed, hold);
      case 'fence':
        this.prompt = '[E] Parler au Fourgue';
        if (pressed) {
          this.learnIntel('fence');
          this.emit({ type: 'open-shop' });
        }
        return null;
      case 'bed':
        this.prompt = this.police.state === 'idle' ? '[E] Dormir' : 'Impossible de dormir avec ces sirènes.';
        if (pressed && this.police.state === 'idle') this.sleep();
        return null;
      case 'plan-table':
        this.prompt = '[E] Étudier le plan';
        if (pressed) this.emit({ type: 'open-notebook' });
        return null;
    }
  }

  private handleDoor(
    it: InteractableDef,
    pressed: boolean,
    hold: (total: number, crime: CrimeKind, noisy: boolean, label: string, done: () => void) => CrimeKind | null,
  ): CrimeKind | null {
    const door = it.door;
    if (!door || this.doorOpen(door)) return null;
    const inside = this.inStore();
    if (door === 'store-front') {
      if (!inside) {
        this.prompt = `Fermé. Ouverture à ${this.data.rules.storeOpen} h.`;
        return null;
      }
      this.prompt = '[E] Déverrouiller de l’intérieur';
      if (pressed) this.frontUnlock = 6;
      return null;
    }
    if (inside) {
      this.prompt = this.powered ? '[E] Pousser la barre (alarme !)' : '[E] Pousser la barre';
      if (pressed) this.openBackDoor();
      return null;
    }
    if (this.inventory.held !== 'crowbar') {
      this.prompt = 'Verrouillée. Il faudrait la forcer au pied-de-biche.';
      return null;
    }
    return hold(this.data.rules.forceDoorTime, 'break-in', true, 'Forcer la porte', () => this.openBackDoor());
  }

  private openBackDoor(): void {
    this.backDoorForced = true;
    if (this.incident === null) {
      this.incident = { loot: 0, calls: [], identified: false, policeCame: false, start: this.clock.seconds };
    }
    if (this.powered) {
      this.emit({ type: 'alarm' });
      this.emit({ type: 'message', text: 'ALARME ! Le contact de la porte a sonné.' });
      this.callPolice("L'alarme de la porte arrière a sonné", true);
    }
  }

  private addLoot(amount: number): void {
    this.inventory.dirty += amount;
    if (this.incident) this.incident.loot += amount;
    else this.incident = { loot: amount, calls: [], identified: false, policeCame: false, start: this.clock.seconds };
    this.emit({ type: 'loot', amount });
    this.emit({ type: 'message', text: `+${amount} $ (argent sale)` });
  }

  private markSeen(): void {
    if (this.inventory.masked() || !this.incident) return;
    if (!this.incident.identified) {
      this.incident.identified = true;
      this.heat += this.data.rules.heatIdentified;
      this.wanted = true;
    }
  }

  private updateWitness(
    w: Witness,
    pos: Point,
    body: { facing: number },
    dt: number,
    crime: CrimeKind | null,
    isClerk: boolean,
  ): void {
    const rules = this.data.rules;
    if (w.called) {
      if (this.police.state === 'idle') w.called = false;
      return;
    }

    // Mains en l'air : il ne bouge pas, n'appelle pas, mais n'oublie pas.
    if (isClerk && this.threatening) {
      w.compliant = rules.complianceTime;
      w.robbed = true;
      w.callTimer = null;
      body.facing = bearing(pos, this.player.pos);
      if (!this.inventory.masked()) this.markSeen();
      return;
    }
    if (w.compliant > 0) {
      w.compliant -= dt;
      if (w.compliant <= 0 && w.robbed && w.callTimer === null) w.callTimer = rules.callDelay;
      return;
    }

    const sees = this.civilianSees(pos, body.facing);
    const d = distance(pos, this.player.pos);
    if (sees && crime !== null) {
      this.markSeen();
      if (w.callTimer === null) w.callTimer = rules.callDelay;
    } else if (sees) {
      let s = this.inventory.visibleSuspicion();
      if (isClerk && this.storeOpen && this.data.level.staffOnly.some((r) => pointInRect(this.player.pos, r))) s = 1;
      if (isClerk && this.wanted && !this.inventory.masked() && w.callTimer === null) {
        w.callTimer = rules.callDelay;
        this.emit({ type: 'message', text: "L'employé te dévisage. Il t'a reconnu." });
      }
      w.suspicion += s * rules.suspicionRate * dt * (d < 5 ? 2 : 1);
    } else {
      w.suspicion = Math.max(0, w.suspicion - 0.1 * dt);
    }

    // Les bruits de métal forcé s'entendent de loin, moins bien à travers les murs.
    if (this.noisy) {
      const hearing = rules.noiseRadius * (this.clearSight(pos, this.player.pos) ? 1 : 0.5);
      if (d < hearing) {
        w.suspicion += 0.8 * dt;
        body.facing = bearing(pos, this.player.pos);
      }
    }

    if (w.suspicion >= 1 && w.callTimer === null) {
      w.suspicion = 1;
      w.callTimer = rules.callDelay;
    }
    if (w.callTimer !== null) {
      w.callTimer -= dt;
      if (w.callTimer <= 0) {
        w.callTimer = null;
        w.called = true;
        w.robbed = false;
        w.suspicion = 0;
        this.callPolice(`${w.name} a appelé la police`, false);
      }
    }
  }

  private callPolice(reason: string, loud: boolean): void {
    if (this.incident === null) {
      this.incident = { loot: 0, calls: [], identified: false, policeCame: false, start: this.clock.seconds };
    }
    if (!this.incident.calls.includes(reason)) this.incident.calls.push(reason);
    if (this.police.call(this.heat, loud)) this.heat += this.data.rules.heatPerCall;
  }

  private updateIntel(dt: number): void {
    const visible: string[] = [];
    for (const intel of this.data.level.intel) {
      if (intel.trigger !== 'look' || this.notebook.has(intel.id)) continue;
      if (intel.id === 'camera' && !this.powered) continue;
      if (this.looksAt(toPoint(intel.pos), intel.y, intel.range)) visible.push(intel.id);
    }
    for (const def of this.notebook.observe(visible, dt, this.clock.seconds)) this.emit({ type: 'intel', def });

    if (this.clerk.present && this.playerNotices(this.clerk.pos)) {
      if (this.clerk.mode === 'smoking') this.learnIntel('clerk-break');
      if (this.clerk.mode === 'closing') this.learnIntel('clerk-closing');
    }
  }

  private learnIntel(id: string): void {
    const def = this.notebook.learn(id, this.clock.seconds);
    if (def) this.emit({ type: 'intel', def });
  }

  private updatePolice(dt: number): void {
    const changed = this.police.step(dt);
    if (changed === 'searching') {
      if (this.incident) this.incident.policeCame = true;
      this.emit({ type: 'message', text: 'La police est sur place.' });
    }
    if (this.police.state === 'searching' && this.policeSpotsPlayer()) {
      this.bust();
      return;
    }
    if (this.incident && this.police.state === 'idle' && this.inHideout() && this.anyCivilianCalling() === false) {
      this.finishIncident(true, []);
    }
  }

  private anyCivilianCalling(): boolean {
    return this.clerkWitness.callTimer !== null || this.pedestrianWitness.callTimer !== null || this.clerkWitness.compliant > 0;
  }

  policeSpotsPlayer(): boolean {
    if (this.inHideout()) return false;
    if (this.inStore()) return true;
    const stop = toPoint(this.data.level.police.stop);
    const d = distance(stop, this.player.pos);
    let range = this.data.rules.policeSightRange;
    if (this.player.crouching) range *= 0.5;
    return d < range && this.clearSight(stop, this.player.pos);
  }

  private bust(): void {
    const lost = this.inventory.confiscate();
    this.heat += 20;
    this.wanted = true;
    this.finishIncident(false, lost);
    this.police.reset();
    for (const w of [this.clerkWitness, this.pedestrianWitness]) Object.assign(w, newWitness(w.name));
    this.clock.skipTo(8);
    this.dailyUpdate();
    this.respawn();
  }

  private finishIncident(success: boolean, lost: ItemId[]): void {
    const inc = this.incident;
    this.incident = null;
    this.emit({
      type: 'report',
      report: {
        success,
        loot: inc?.loot ?? 0,
        calls: inc?.calls ?? [],
        identified: inc?.identified ?? false,
        policeCame: inc?.policeCame ?? false,
        lost,
        duration: inc ? this.clock.seconds - inc.start : 0,
      },
    });
  }

  private respawn(): void {
    this.player.pos = toPoint(this.data.level.spawn);
    this.player.facing = -Math.PI / 2;
    this.action = null;
    this.clerk.settle(this.clock.hour);
  }

  /** Dort jusqu'à 8 h (ouverture) ou 23 h (nuit noire), selon ce qui vient en premier. */
  sleep(): void {
    const h = this.clock.hour;
    this.clock.skipTo(h >= 8 && h < 23 ? 23 : 8);
    this.dailyUpdate();
    this.clerk.settle(this.clock.hour);
    if (this.storeOpen && !this.registerEmptied) this.register = this.registerValue();
    this.emit({ type: 'message', text: `Réveil : ${this.clock.format()}` });
  }

  // --- Marché noir -------------------------------------------------------------------------------

  buy(id: ItemId): string {
    const name = this.inventory.def(id).name;
    switch (this.inventory.buy(id)) {
      case 'ok':
        return `${name} acheté.`;
      case 'owned':
        return `Tu as déjà : ${name}.`;
      case 'poor':
        return 'Pas assez d’argent propre.';
    }
  }

  launder(): string {
    if (this.inventory.dirty <= 0) return 'Tu n’as pas d’argent sale.';
    const clean = this.inventory.launder(this.data.rules.launderFee);
    return `Le Fourgue garde sa part. Tu récupères ${clean} $ propres.`;
  }

  /** Vide la file d'événements (lue par le rendu et l'interface). */
  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: WorldEvent): void {
    this.events.push(e);
  }
}
