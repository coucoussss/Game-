import type { DoorDef, GameData, IntelDef, InteractableDef, ItemId, Rect } from '../data/types';
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
import { NavGrid } from './NavGrid';
import { Notebook } from './Notebook';
import { Npc, PedestrianBrain, StaffBrain } from './Npc';
import { Police } from './Police';
import { Rng, rollContainer, SiteState, type ContainerState } from './Site';

export const PLAYER_RADIUS = 0.3;
export const EYE_HEIGHT = 1.65;
export const CROUCH_EYE_HEIGHT = 1.0;
export const INTERACT_RANGE = 2.0;
/** Version du format de sauvegarde. */
export const SAVE_VERSION = 2;

/** Demi-angle du regard du joueur pour remarquer quelqu'un. */
const PLAYER_VIEW = 0.6;
/** Demi-angle de visée pour tenir un vigile en respect. */
const AIM_ANGLE = 0.25;
const GUARD_SPEED = 3.4;
const FIRE_COOLDOWN = 0.32;
const MELEE_COOLDOWN = 0.7;
const RELOAD_TIME = 1.4;
const ALARM_DURATION = 60;
const MAX_OFFICERS = 8;

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
  /** Clic gauche : tirer, frapper, enfiler. */
  readonly fire: boolean;
  /** Clic droit maintenu : braquer son arme sur quelqu'un. */
  readonly aim: boolean;
  readonly reload: boolean;
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
  fire: false,
  aim: false,
  reload: false,
  slot: null,
};

export type CrimeKind = 'threat' | 'theft' | 'break-in' | 'sabotage' | 'trespass' | 'assault' | 'shooting';

export interface Report {
  readonly success: boolean;
  readonly cause: 'clean' | 'arrested' | 'shot';
  readonly site: string | null;
  readonly loot: number;
  readonly calls: readonly string[];
  readonly identified: boolean;
  readonly policeCame: boolean;
  readonly victims: number;
  readonly lost: readonly ItemId[];
  readonly duration: number;
}

export type WorldEvent =
  | { readonly type: 'message'; readonly text: string; readonly danger?: boolean }
  | { readonly type: 'intel'; readonly def: IntelDef }
  | { readonly type: 'open-shop' }
  | { readonly type: 'open-notebook' }
  | { readonly type: 'alarm'; readonly site: string }
  | { readonly type: 'loot'; readonly amount: number }
  | { readonly type: 'shot'; readonly from: Point; readonly to: Point; readonly by: 'player' | 'npc'; readonly hit: boolean; readonly shooter?: string }
  | { readonly type: 'swing'; readonly hit: boolean }
  | { readonly type: 'reload' }
  | { readonly type: 'dry-fire' }
  | { readonly type: 'hurt'; readonly amount: number; readonly armor: boolean }
  | { readonly type: 'npc-down'; readonly id: string; readonly dead: boolean }
  | { readonly type: 'glass'; readonly pos: Point }
  | { readonly type: 'vault-open' }
  | { readonly type: 'slept' }
  | { readonly type: 'win' }
  | { readonly type: 'report'; readonly report: Report };

interface Incident {
  site: string | null;
  loot: number;
  calls: string[];
  identified: boolean;
  policeCame: boolean;
  victims: number;
  start: number;
}

interface HoldAction {
  readonly target: string;
  readonly total: number;
  readonly crime: CrimeKind;
  readonly noisy: boolean;
  readonly label: string;
  progress: number;
}

interface Noise {
  readonly pos: Point;
  readonly radius: number;
  readonly kind: 'work' | 'shot' | 'alarm';
}

export interface SaveData {
  readonly v: number;
  readonly seconds: number;
  readonly cash: number;
  readonly dirty: number;
  readonly laundered: number;
  readonly items: readonly ItemId[];
  readonly worn: readonly ItemId[];
  readonly mag: number;
  readonly ammo: number;
  readonly armor: number;
  readonly hp: number;
  readonly heat: number;
  readonly wanted: boolean;
  readonly debtPaid: number;
  readonly known: readonly (readonly [string, number])[];
  readonly used: readonly string[];
  readonly emptied: readonly (readonly [string, number])[];
  readonly stats: Stats;
}

export interface Stats {
  heists: number;
  arrests: number;
  stolen: number;
  victims: number;
}

/**
 * Tout l'état d'une partie, sans Three.js. `step(dt, input)` fait avancer le monde de `dt` secondes réelles.
 */
export class World {
  readonly clock: Clock;
  readonly inventory: Inventory;
  readonly notebook: Notebook;
  readonly police: Police;
  readonly nav: NavGrid;
  readonly rng: Rng;
  readonly sites = new Map<string, SiteState>();
  readonly containers = new Map<string, ContainerState>();
  /** Employés, vigiles et passants. */
  readonly npcs: Npc[] = [];
  readonly staff: StaffBrain[] = [];
  readonly pedestrians: PedestrianBrain[] = [];
  officers: Npc[] = [];

  readonly player = {
    pos: { x: 0, z: 0 } as Point,
    facing: 0,
    pitch: 0,
    crouching: false,
    moving: false,
    sprinting: false,
    hp: 100,
  };
  heat = 0;
  /** Le joueur a été reconnu lors d'un précédent coup : on le reconnaîtra à visage découvert. */
  wanted = false;
  debtPaid = 0;
  readonly stats: Stats = { heists: 0, arrests: 0, stolen: 0, victims: 0 };
  readonly used = new Set<string>();

  events: WorldEvent[] = [];
  prompt: string | null = null;
  action: HoldAction | null = null;
  /** Le joueur tient quelqu'un en respect. */
  threatening = false;
  /** Le joueur braque son arme (clic droit). */
  aiming = false;
  noisy = false;
  reloadTimer = 0;
  incident: Incident | null = null;
  /** Où la police se gare pour l'incident en cours. */
  policeStop: Point;

  private readonly frontUnlock = new Map<string, number>();
  private readonly heldDoors = new Set<string>();
  private prevInteract = false;
  private prevFire = false;
  private prevReload = false;
  private fireCooldown = 0;
  private meleeCooldown = 0;
  /** Le joueur a tiré ou frappé pendant cet incident : la police ne cherche plus à l'arrêter en douceur. */
  private violent = false;
  private lastResetDay: number;
  private readonly blockers: Rect[];
  private readonly sightBlockers: Rect[];
  private moveObs: Rect[] = [];
  private sightObs: Rect[] = [];
  private noises: Noise[] = [];
  private carAlarm: { pos: Point; time: number } | null = null;
  private reinforce = 0;
  private spawned = 0;
  private readonly doorById = new Map<string, DoorDef>();

  constructor(
    readonly data: GameData,
    seed = 1,
  ) {
    const { rules, level } = data;
    this.rng = new Rng(seed);
    this.clock = Clock.atHour(1, rules.startHour);
    this.inventory = new Inventory(data.items, rules.startCash);
    this.notebook = new Notebook(level.intel);
    this.police = new Police(rules);
    this.player.pos = toPoint(level.spawn);
    this.player.facing = -Math.PI / 2;
    this.player.hp = rules.playerHealth;
    this.policeStop = toPoint(level.policeSpawn);
    this.blockers = level.walls.map((w) => w.rect);
    this.sightBlockers = level.walls.filter((w) => w.blocksSight).map((w) => w.rect);
    this.nav = new NavGrid(level.bounds, this.blockers);
    for (const d of level.doors) this.doorById.set(d.id, d);
    for (const s of level.sites) this.sites.set(s.id, new SiteState(s));
    for (const it of level.interactables) {
      if (it.kind === 'container') this.containers.set(it.id, { amount: rollContainer(it, this.rng), emptiedDay: null });
      if (it.kind === 'register' && it.site) this.sites.get(it.site)?.registers.set(it.id, { amount: 0, emptied: false });
    }
    for (const def of level.staff) {
      const npc = new Npc(def.id, 'staff', def.role, def.name, def.armed, def.site, 0);
      this.npcs.push(npc);
      this.staff.push(new StaffBrain(def, npc, this.nav));
    }
    for (const def of level.pedestrians) {
      const npc = new Npc(def.id, 'pedestrian', 'pedestrian', 'Un passant', false, null, def.variant);
      npc.hp = 60;
      this.npcs.push(npc);
      this.pedestrians.push(new PedestrianBrain(def, npc));
    }
    this.lastResetDay = this.clock.day;
    this.settleEveryone();
    this.refreshDoors();
    this.updateRegisters();
  }

  // --- État dérivé -------------------------------------------------------------------------------

  get fencePresent(): boolean {
    const f = this.data.level.fence;
    return inHourRange(this.clock.hour, f.openFrom, f.openTo);
  }

  get debtLeft(): number {
    return Math.max(0, this.data.rules.debt - this.debtPaid);
  }

  /** Argent sale que le joueur peut encore porter. */
  get carryRoom(): number {
    const cap = this.inventory.has('duffel-bag') ? this.data.rules.carryBag : this.data.rules.carryBase;
    return Math.max(0, cap - this.inventory.dirty);
  }

  site(id: string | null | undefined): SiteState | null {
    return id ? (this.sites.get(id) ?? null) : null;
  }

  siteOpen(site: SiteState): boolean {
    return inHourRange(this.clock.hour, site.def.open, site.def.close);
  }

  siteAt(p: Point): SiteState | null {
    for (const s of this.sites.values()) if (pointInRect(p, s.def.rect)) return s;
    return null;
  }

  doorOpen(id: string): boolean {
    const door = this.doorById.get(id);
    if (!door) return true;
    const site = this.site(door.site);
    if (door.role === 'vault') return site?.vaultOpen ?? false;
    if (site?.openDoors.has(id)) return true;
    if (door.role === 'front' && site && this.siteOpen(site)) return true;
    if ((this.frontUnlock.get(id) ?? 0) > 0) return true;
    return this.heldDoors.has(id);
  }

  inHideout(): boolean {
    return pointInRect(this.player.pos, this.data.level.hideout);
  }

  eyeHeight(): number {
    return this.player.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
  }

  /** Tous les personnages capables d'agir, policiers compris. */
  everyone(): Npc[] {
    return this.officers.length ? [...this.npcs, ...this.officers] : this.npcs;
  }

  npc(id: string): Npc | null {
    return this.everyone().find((n) => n.id === id) ?? null;
  }

  /** Recalcule les portes tenues ouvertes et les obstacles du pas courant. */
  private refreshDoors(): void {
    this.heldDoors.clear();
    for (const b of this.staff) {
      const d = b.heldDoor;
      if (d) this.heldDoors.add(d);
    }
    // Quiconque a les clés (ou un bélier) ouvre la porte en passant.
    const walkers = this.everyone().filter((n) => n.active && (n.kind !== 'pedestrian' || n.moving));
    for (const door of this.data.level.doors) {
      if (door.role === 'vault') continue;
      const cx = (door.rect.min[0] + door.rect.max[0]) / 2;
      const cz = (door.rect.min[1] + door.rect.max[1]) / 2;
      for (const n of walkers) {
        if (n.kind === 'pedestrian' && door.role !== 'front') continue;
        if (Math.abs(n.pos.x - cx) < 1.1 && Math.abs(n.pos.z - cz) < 1.1) {
          this.heldDoors.add(door.id);
          break;
        }
      }
    }
    this.moveObs = [...this.blockers];
    this.sightObs = [...this.sightBlockers];
    for (const d of this.data.level.doors) {
      if (this.doorOpen(d.id)) continue;
      this.moveObs.push(d.rect);
      this.sightObs.push(d.rect);
    }
  }

  /** Ligne de vue entre deux points, en raccourcissant le segment près de la cible (posée sur un mur). */
  clearSight(from: Point, to: Point): boolean {
    const d = distance(from, to);
    if (d < 1e-6) return true;
    const back = Math.min(0.3, d * 0.5);
    const end = { x: to.x - ((to.x - from.x) / d) * back, z: to.z - ((to.z - from.z) / d) * back };
    return lineOfSight(from, end, this.sightObs);
  }

  /** Vrai si l'endroit où se tient le joueur est éclairé. */
  private playerLit(): boolean {
    const hour = this.clock.hour;
    if (hour >= 7 && hour < 20) return true;
    if (this.inHideout()) return true;
    const site = this.siteAt(this.player.pos);
    if (site) return site.powered;
    return this.data.level.lamps.some((l) => distance(toPoint(l), this.player.pos) < 6);
  }

  /** Distance à laquelle on remarque le joueur, selon l'éclairage et la posture. */
  private visibilityRange(base: number): number {
    let range = base;
    if (!this.playerLit()) range *= 0.4;
    if (this.player.crouching) range *= 0.6;
    return range;
  }

  /** Vrai si quelqu'un placé en `pos` et regardant vers `facing` voit le joueur. */
  sees(pos: Point, facing: number, baseRange = this.data.rules.civilianRange, fov = this.data.rules.civilianFov): boolean {
    const d = distance(pos, this.player.pos);
    if (d > this.visibilityRange(baseRange)) return false;
    if (d > 1.2 && Math.abs(angleDiff(facing, bearing(pos, this.player.pos))) > fov / 2) return false;
    return this.clearSight(pos, this.player.pos);
  }

  /** Vrai si une caméra alimentée a le joueur dans son champ. */
  cameraSees(): boolean {
    for (const cam of this.data.level.cameras) {
      if (!this.site(cam.site)?.powered) continue;
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
    const dist = Math.hypot(dx, dz, dy);
    if (dist > maxRange || dist < 0.05) return false;
    const cp = Math.cos(this.player.pitch);
    const dot =
      (cp * Math.cos(this.player.facing) * dx + Math.sin(this.player.pitch) * dy + cp * Math.sin(this.player.facing) * dz) / dist;
    if (Math.acos(Math.min(1, dot)) > Math.max(Math.atan(tolerance / dist), 0.07)) return false;
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
    const pressedFire = input.fire && !this.prevFire;
    const pressedReload = input.reload && !this.prevReload;
    this.prevInteract = input.interact;
    this.prevFire = input.fire;
    this.prevReload = input.reload;

    this.refreshDoors();
    this.movePlayer(dt, input);
    if (input.slot !== null) {
      this.inventory.select(input.slot);
      this.action = null;
      this.reloadTimer = 0;
    }
    for (const [id, t] of this.frontUnlock) this.frontUnlock.set(id, Math.max(0, t - dt));
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.noises = [];

    let crime = this.handleInteraction(dt, input, pressedInteract);
    crime = this.handleWeapons(dt, input, pressedFire, pressedReload) ?? crime;
    const here = this.siteAt(this.player.pos);
    if (crime === null && here && !this.siteOpen(here)) crime = 'trespass';
    if (crime !== null) this.ensureIncident(here?.def.id ?? null);

    if (this.noisy) this.noises.push({ pos: this.player.pos, radius: rules.noiseRadius, kind: 'work' });
    this.updateSites(dt);

    const hour = this.clock.hour;
    for (const b of this.staff) {
      b.step(dt, hour);
      if (b.depositedThisStep) this.deposit(b.def.site);
    }
    for (const b of this.pedestrians) b.step(dt, hour);
    for (const n of this.npcs) this.updateNpc(n, dt, crime);

    if (crime !== null && this.cameraSees()) {
      this.markSeen();
      this.callPolice('Une caméra a déclenché une alerte silencieuse', false);
    }

    this.updateIntel(dt);
    this.updatePolice(dt);
    this.updateRegisters();
    if (!this.incident && this.player.hp < rules.playerHealth) this.player.hp = Math.min(rules.playerHealth, this.player.hp + dt * 1.5);
    this.tryFinishIncident();
  }

  /** Au petit matin (5 h) : la chaleur retombe, les blessés reviennent, la ville répare et réapprovisionne. */
  private dailyUpdate(): void {
    const day = this.clock.day;
    if (day === this.lastResetDay || this.clock.hour < 5) return;
    const elapsed = day - this.lastResetDay;
    this.lastResetDay = day;
    this.heat = Math.max(0, this.heat - this.data.rules.heatDecayPerDay * elapsed);
    if (this.heat < 20) this.wanted = false;
    for (const s of this.sites.values()) if (this.incident?.site !== s.def.id) s.restore();
    for (const it of this.data.level.interactables) {
      const c = this.containers.get(it.id);
      if (!c || !it.container || c.emptiedDay === null) continue;
      if (day - c.emptiedDay >= it.container.refillDays) {
        c.amount = rollContainer(it, this.rng);
        c.emptiedDay = null;
      }
    }
    for (const n of this.npcs) {
      if (n.down === 'no') continue;
      n.down = 'no';
      n.hp = n.kind === 'pedestrian' ? 60 : 100;
      n.calm();
      n.present = false;
    }
    for (const b of this.staff) if (!b.npc.present) b.mode = 'away';
  }

  private settleEveryone(): void {
    const hour = this.clock.hour;
    for (const b of this.staff) if (b.npc.down === 'no') b.settle(hour);
    for (const b of this.pedestrians) if (b.npc.down === 'no') b.settle(hour);
  }

  private updateRegisters(): void {
    const r = this.data.rules;
    for (const it of this.data.level.interactables) {
      if (it.kind !== 'register') continue;
      const site = this.site(it.site);
      const reg = site?.registers.get(it.id);
      if (!site || !reg) continue;
      // Fermée, la caisse garde ce qu'elle contient jusqu'à ce qu'on la range ou qu'on la vide.
      if (reg.emptied || !this.siteOpen(site)) continue;
      const hours = Math.max(0, this.clock.hour - site.def.open);
      const value = it.amount ?? Math.min(r.registerMax, Math.floor(r.registerBase + r.registerPerHour * hours));
      reg.amount = Math.max(reg.amount, value);
    }
  }

  /** L'employé range la recette du site dans le coffre. */
  private deposit(siteId: string): void {
    const site = this.site(siteId);
    if (!site) return;
    let total = 0;
    for (const reg of site.registers.values()) {
      if (!reg.emptied) total += reg.amount;
      reg.amount = 0;
      reg.emptied = true;
    }
    for (const it of this.data.level.interactables) {
      if (it.site !== siteId || !it.container?.collects) continue;
      const c = this.containers.get(it.id);
      if (c) c.amount += total;
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
    p.sprinting = p.moving && input.sprint && !input.crouch;
    if (!p.moving) return;
    const f = input.forward / Math.max(1, len);
    const s = input.strafe / Math.max(1, len);
    const dx = (Math.cos(p.facing) * f - Math.sin(p.facing) * s) * speed * dt;
    const dz = (Math.sin(p.facing) * f + Math.cos(p.facing) * s) * speed * dt;
    p.pos = moveCircle(p.pos, { x: dx, z: dz }, PLAYER_RADIUS, this.moveObs);
  }

  // --- Interactions ------------------------------------------------------------------------------

  /** Cible d'interaction : l'interactif le plus proche, devant le joueur, à portée et en vue. */
  target(): InteractableDef | null {
    let best: InteractableDef | null = null;
    let bestScore = Infinity;
    for (const it of this.data.level.interactables) {
      if (this.used.has(it.id)) continue;
      if (it.kind === 'fence' && !this.fencePresent) continue;
      if (it.kind === 'door' && it.door && this.doorOpen(it.door)) continue;
      const pos = toPoint(it.pos);
      const d = distance(this.player.pos, pos);
      if (d > (it.reach ?? INTERACT_RANGE)) continue;
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
    if (this.action && this.action.target !== it.id) this.action = null;
    const held = this.inventory.held;
    const rules = this.data.rules;
    const site = this.site(it.site);

    const hold = (total: number, crime: CrimeKind, noisy: boolean, label: string, done: () => void): CrimeKind | null => {
      this.prompt = `[E maintenu] ${label}`;
      if (!input.interact) {
        this.action = null;
        return null;
      }
      if (!this.action || this.action.target !== it.id || this.action.label !== label) {
        this.action = { target: it.id, total, crime, noisy, label, progress: 0 };
      }
      this.action.progress += dt;
      this.noisy = noisy;
      if (this.action.progress >= total) {
        this.action = null;
        this.ensureIncident(it.site ?? null);
        done();
      }
      return crime;
    };

    switch (it.kind) {
      case 'cash':
        this.prompt = `[E] Fouiller : ${it.name}`;
        if (pressed) {
          this.used.add(it.id);
          this.inventory.cash += it.amount ?? 0;
          this.emit({ type: 'message', text: `${it.amount ?? 0} $ au fond d'une poche. C'est tout ce qu'il te reste.` });
        }
        return null;
      case 'pickup':
        this.prompt = `[E] Fouiller : ${it.name}`;
        if (pressed && it.item) {
          this.used.add(it.id);
          this.inventory.add(it.item);
          this.emit({ type: 'message', text: `Trouvé : ${this.inventory.def(it.item).name}.` });
        }
        return null;
      case 'register': {
        const reg = site?.registers.get(it.id);
        if (!reg || reg.emptied || reg.amount <= 0) {
          this.prompt = `${it.name} : vide.`;
          return null;
        }
        if (it.needsStaff) {
          const clerk = this.npc(it.needsStaff);
          if (!clerk?.active || clerk.compliant <= 0) {
            this.prompt = `${it.name}. Le guichetier ne remettra sa caisse que sous la menace.`;
            return null;
          }
        }
        this.prompt = `[E] Vider la caisse (${reg.amount} $)`;
        if (!pressed) return null;
        if (this.carryRoom <= 0) {
          this.emit({ type: 'message', text: 'Tu ne peux plus rien porter.' });
          return null;
        }
        const taken = Math.min(reg.amount, this.carryRoom);
        reg.amount -= taken;
        reg.emptied = reg.amount <= 0;
        this.ensureIncident(it.site ?? null);
        this.addLoot(taken);
        return 'theft';
      }
      case 'container':
        return this.handleContainer(it, site, hold);
      case 'fuse-box': {
        if (!site) return null;
        if (!site.powered) {
          this.prompt = 'Les câbles pendent, tranchés.';
          return null;
        }
        if (site.def.lockedFuseBox && !site.fuseUnlocked) {
          const open = (): void => {
            site.fuseUnlocked = true;
            this.emit({ type: 'message', text: 'Le cadenas cède. Le boîtier est ouvert.' });
          };
          if (held === 'lockpicks') return hold(4, 'sabotage', false, 'Crocheter le cadenas', open);
          if (held === 'crowbar') return hold(3, 'sabotage', true, 'Faire sauter le cadenas', open);
          this.prompt = 'Boîtier cadenassé. Il faut des crochets ou un pied-de-biche en main.';
          return null;
        }
        if (held !== 'wire-cutters') {
          this.prompt = 'Boîtier électrique. Il faut un coupe-fil en main.';
          return null;
        }
        return hold(rules.cutFuseTime, 'sabotage', false, 'Couper les câbles', () => {
          site.powered = false;
          site.alarm = 0;
          this.emit({ type: 'message', text: 'Courant coupé : caméras et alarme sont mortes.' });
        });
      }
      case 'door':
        return this.handleDoor(it, site, pressed, hold);
      case 'vault-drill': {
        if (!site || site.vaultOpen) return null;
        if (site.drill !== null) {
          const pct = Math.floor((site.drill / rules.drillTime) * 100);
          this.prompt = `La perceuse mord l'acier… ${pct} %`;
          return null;
        }
        if (held !== 'drill') {
          this.prompt = 'Porte blindée. Seule une perceuse thermique en viendra à bout.';
          return null;
        }
        return hold(3, 'break-in', true, 'Installer la perceuse', () => {
          site.drill = 0;
          const i = this.inventory.items.indexOf('drill');
          if (i >= 0) this.inventory.items.splice(i, 1);
          this.inventory.held = null;
          this.emit({ type: 'message', text: 'La perceuse est en place. Tiens bon jusqu’au bout.' });
          if (site.powered) this.triggerAlarm(site, 'Le capteur sismique de la chambre forte a réagi');
        });
      }
      case 'fence':
        this.prompt = '[E] Parler au Fourgue';
        if (pressed) {
          this.learnIntel('fence');
          this.emit({ type: 'open-shop' });
        }
        return null;
      case 'bed': {
        const calm = this.police.state === 'idle' && !this.npcs.some((n) => n.active && n.hostile);
        this.prompt = calm ? '[E] Dormir' : 'Impossible de dormir maintenant.';
        if (pressed && calm) this.sleep();
        return null;
      }
      case 'plan-table':
        this.prompt = '[E] Étudier le plan';
        if (pressed) this.emit({ type: 'open-notebook' });
        return null;
    }
  }

  private handleContainer(
    it: InteractableDef,
    site: SiteState | null,
    hold: (total: number, crime: CrimeKind, noisy: boolean, label: string, done: () => void) => CrimeKind | null,
  ): CrimeKind | null {
    const spec = it.container;
    const state = this.containers.get(it.id);
    if (!spec || !state) return null;
    if (spec.behind && !this.doorOpen(spec.behind)) return null;
    if (state.amount <= 0) {
      this.prompt = `${it.name} : vide.`;
      return null;
    }
    const held = this.inventory.held;
    const loot = (broken: boolean): void => {
      if (this.carryRoom <= 0) {
        this.emit({ type: 'message', text: 'Tu ne peux plus rien porter. Il faudrait un sac.' });
      } else {
        const taken = Math.min(state.amount, this.carryRoom);
        state.amount -= taken;
        if (state.amount <= 0) state.emptiedDay = this.clock.day;
        else this.emit({ type: 'message', text: 'Tes poches débordent : il en reste.' });
        this.addLoot(taken);
      }
      if (!broken) return;
      if (spec.alarmed) {
        this.emit({ type: 'glass', pos: toPoint(it.pos) });
        if (site?.powered) this.triggerAlarm(site, 'Un détecteur de bris de verre a sonné');
      }
      if (spec.carAlarm > 0 && this.rng.next() < spec.carAlarm) {
        this.carAlarm = { pos: toPoint(it.pos), time: 10 };
        this.emit({ type: 'message', text: "L'alarme de la voiture se met à hurler !", danger: true });
      }
    };
    if (spec.tool === 'none') return hold(spec.time, 'theft', spec.noisy, spec.verb, () => loot(false));
    if (held === 'crowbar') return hold(spec.time, 'theft', spec.noisy, spec.verb, () => loot(true));
    if (held === 'lockpicks' && spec.pickTime > 0) return hold(spec.pickTime, 'theft', false, 'Crocheter la serrure', () => loot(false));
    this.prompt = `${it.name}. Il faut un pied-de-biche${spec.pickTime > 0 ? ' ou des crochets' : ''} en main.`;
    return null;
  }

  private handleDoor(
    it: InteractableDef,
    site: SiteState | null,
    pressed: boolean,
    hold: (total: number, crime: CrimeKind, noisy: boolean, label: string, done: () => void) => CrimeKind | null,
  ): CrimeKind | null {
    const door = it.door ? this.doorById.get(it.door) : undefined;
    if (!door || !site || this.doorOpen(door.id)) return null;
    const rules = this.data.rules;
    const held = this.inventory.held;
    const inside = pointInRect(this.player.pos, site.def.rect);
    // Les portes extérieures ont un contact d'alarme ; pas les portes intérieures.
    const contact = door.role !== 'inner';
    const open = (): void => {
      site.openDoors.add(door.id);
      if (contact && site.powered) this.triggerAlarm(site, `Le contact de la porte a sonné (${site.def.name})`);
    };
    if (inside && door.role === 'front') {
      this.prompt = '[E] Déverrouiller de l’intérieur';
      if (pressed) this.frontUnlock.set(door.id, 6);
      return null;
    }
    if (inside && door.role === 'back') {
      this.prompt = site.powered ? '[E] Pousser la barre (alarme !)' : '[E] Pousser la barre';
      if (pressed) {
        this.ensureIncident(site.def.id);
        open();
      }
      return null;
    }
    if (held === 'lockpicks') return hold(rules.pickDoorTime, 'break-in', false, 'Crocheter la serrure', open);
    if (held === 'crowbar') return hold(rules.forceDoorTime, 'break-in', true, 'Forcer la porte', open);
    this.prompt =
      door.role === 'front'
        ? `Fermé. Ouverture à ${site.def.open} h. (Crochets ou pied-de-biche pour entrer.)`
        : 'Verrouillée. Il faut des crochets ou un pied-de-biche en main.';
    return null;
  }

  private triggerAlarm(site: SiteState, reason: string): void {
    if (site.alarm > 0) return;
    site.alarm = ALARM_DURATION;
    this.ensureIncident(site.def.id);
    this.emit({ type: 'alarm', site: site.def.id });
    this.emit({ type: 'message', text: 'ALARME !', danger: true });
    this.callPolice(reason, true);
  }

  private addLoot(amount: number): void {
    if (amount <= 0) return;
    this.inventory.dirty += amount;
    this.stats.stolen += amount;
    if (this.incident) this.incident.loot += amount;
    this.emit({ type: 'loot', amount });
    this.emit({ type: 'message', text: `+${amount} $ (argent sale)` });
  }

  // --- Armes -------------------------------------------------------------------------------------

  private handleWeapons(dt: number, input: PlayerInput, pressedFire: boolean, pressedReload: boolean): CrimeKind | null {
    const inv = this.inventory;
    const rules = this.data.rules;
    const held = inv.held;
    let crime: CrimeKind | null = null;
    this.threatening = false;
    this.aiming = false;

    // Rechargement.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) inv.reload(rules.magazine);
    } else if (held === 'pistol' && (pressedReload || (pressedFire && inv.mag <= 0)) && inv.mag < rules.magazine && inv.ammo > 0) {
      this.reloadTimer = RELOAD_TIME;
      this.emit({ type: 'reload' });
      return null;
    }

    // Tenir en respect : les civils qui voient l'arme lèvent les mains ; un vigile, seulement s'il est visé
    // avant d'avoir dégainé.
    const range = inv.threatRange();
    if (range > 0 && input.aim && !this.action) {
      this.aiming = true;
      for (const n of this.npcs) {
        if (!n.active || n.hostile) continue;
        const d = distance(this.player.pos, n.pos);
        if (d > range) continue;
        const off = Math.abs(angleDiff(this.player.facing, bearing(this.player.pos, n.pos)));
        if (off > (n.armed ? AIM_ANGLE : 0.9)) continue;
        if (!this.clearSight(this.player.pos, n.pos)) continue;
        n.compliant = rules.complianceTime;
        n.robbed = true;
        n.callTimer = null;
        n.investigating = false;
        n.facing = bearing(n.pos, this.player.pos);
        this.threatening = true;
        this.markSeen();
      }
      if (this.threatening) crime = 'threat';
    }

    if (!pressedFire || held === null || this.action) return crime;
    const def = inv.def(held);
    if (def.kind === 'wearable') {
      const worn = inv.toggleWear(held);
      this.emit({ type: 'message', text: worn ? `${def.name} enfilé.` : `${def.name} retiré.` });
      return crime;
    }
    if (held === 'pistol') {
      if (this.fireCooldown > 0 || this.reloadTimer > 0) return crime;
      if (inv.mag <= 0) {
        this.emit({ type: 'dry-fire' });
        return crime;
      }
      inv.mag--;
      this.fireCooldown = FIRE_COOLDOWN;
      this.shoot();
      return 'shooting';
    }
    if (held === 'crowbar' && this.meleeCooldown <= 0) {
      this.meleeCooldown = MELEE_COOLDOWN;
      const victim = this.aimedNpc(1.9, 0.6);
      this.emit({ type: 'swing', hit: victim !== null });
      if (!victim) return crime;
      this.violent = true;
      this.noises.push({ pos: this.player.pos, radius: 6, kind: 'work' });
      // Qui ne t'a pas vu venir s'effondre d'un coup.
      const unaware = !victim.hostile && !this.sees(victim.pos, victim.facing);
      this.damage(victim, unaware ? 1000 : rules.meleeDamage, false);
      return 'assault';
    }
    return crime;
  }

  /** Le personnage le plus proche dans l'axe du regard. */
  private aimedNpc(maxRange: number, minTolerance: number): Npc | null {
    let best: Npc | null = null;
    let bestD = Infinity;
    for (const n of this.everyone()) {
      if (!n.active) continue;
      const d = distance(this.player.pos, n.pos);
      if (d > maxRange || d >= bestD) continue;
      const off = Math.abs(angleDiff(this.player.facing, bearing(this.player.pos, n.pos)));
      if (off > Math.max(Math.atan(0.42 / Math.max(d, 0.1)), minTolerance)) continue;
      // Le corps va du sol à 1,8 m : on tolère la visée en hauteur correspondante.
      const lo = Math.atan2(0 - this.eyeHeight(), d);
      const hi = Math.atan2(1.85 - this.eyeHeight(), d);
      if (minTolerance < 0.1 && (this.player.pitch < lo - 0.03 || this.player.pitch > hi + 0.03)) continue;
      if (!this.clearSight(this.player.pos, n.pos)) continue;
      best = n;
      bestD = d;
    }
    return best;
  }

  private shoot(): void {
    const rules = this.data.rules;
    const p = this.player.pos;
    this.violent = true;
    this.noises.push({ pos: p, radius: rules.gunshotRadius, kind: 'shot' });
    const victim = this.aimedNpc(45, 0.02);
    const far = { x: p.x + Math.cos(this.player.facing) * 40, z: p.z + Math.sin(this.player.facing) * 40 };
    this.emit({ type: 'shot', from: { ...p }, to: victim ? { ...victim.pos } : far, by: 'player', hit: victim !== null });
    if (victim) this.damage(victim, rules.pistolDamage, true);
  }

  private damage(n: Npc, amount: number, lethal: boolean): void {
    n.hp -= amount;
    if (n.hp > 0) {
      if (n.armed) this.makeHostile(n);
      else if (n.callTimer === null && !n.called) n.callTimer = this.data.rules.callDelay;
      return;
    }
    n.down = lethal ? 'dead' : 'ko';
    n.moving = false;
    n.calm();
    this.emit({ type: 'npc-down', id: n.id, dead: lethal });
    if (lethal) {
      this.heat += this.data.rules.heatPerVictim;
      this.stats.victims++;
      if (this.incident) this.incident.victims++;
    }
    if (n.kind === 'officer' && this.reinforce <= 0) this.reinforce = 12;
  }

  /** Blesse le joueur ; les plaques du gilet encaissent une partie du coup tant qu'il en reste. */
  hurt(amount: number): void {
    const rules = this.data.rules;
    const armor = this.inventory.activeArmor();
    const absorbed = Math.min(armor, amount * rules.armorAbsorb);
    this.inventory.armor = Math.max(0, this.inventory.armor - absorbed);
    this.player.hp -= amount - absorbed;
    this.emit({ type: 'hurt', amount: amount - absorbed, armor: absorbed > 0 });
    if (this.player.hp <= 0) this.bust('shot');
  }

  // --- Personnages -------------------------------------------------------------------------------

  private markSeen(): void {
    if (this.inventory.masked() || !this.incident || this.incident.identified) return;
    this.incident.identified = true;
    this.heat += this.data.rules.heatIdentified;
    this.wanted = true;
  }

  private makeHostile(n: Npc): void {
    if (n.hostile) return;
    n.hostile = true;
    n.investigating = false;
    n.compliant = 0;
    n.lastKnown = { ...this.player.pos };
    n.unseenFor = 0;
    n.shootTimer = 0.8;
    n.path = [];
    if (!n.called && n.callTimer === null) n.callTimer = 2;
  }

  /** Vrai si `n` voit quelqu'un à terre. */
  private seesBody(n: Npc): boolean {
    for (const other of this.npcs) {
      if (other === n || !other.present || other.down === 'no') continue;
      const d = distance(n.pos, other.pos);
      if (d > 10) continue;
      if (d > 1.5 && Math.abs(angleDiff(n.facing, bearing(n.pos, other.pos))) > 1.0) continue;
      if (this.clearSight(n.pos, other.pos)) return true;
    }
    return false;
  }

  private updateNpc(n: Npc, dt: number, crime: CrimeKind | null): void {
    if (!n.active) return;
    const rules = this.data.rules;
    if (n.hostile) {
      this.combatStep(n, dt, GUARD_SPEED);
      if (!n.hostile) n.called = false;
      return;
    }
    if (n.called && !n.armed) {
      // Il a donné l'alerte : il se terre jusqu'à ce que tout soit fini.
      if (this.police.state === 'idle' && !this.incident) n.called = false;
      return;
    }

    // Mains en l'air : il ne bouge pas tant que l'arme est en vue, mais il n'oublie pas.
    if (n.compliant > 0) {
      const d = distance(n.pos, this.player.pos);
      const watched = this.inventory.threatRange() > 0 && d < 14 && this.clearSight(n.pos, this.player.pos);
      if (!watched) n.compliant -= dt;
      if (n.compliant <= 0) {
        if (n.armed) this.makeHostile(n);
        else if (n.robbed && n.callTimer === null) n.callTimer = rules.callDelay;
      }
      return;
    }

    const sees = this.sees(n.pos, n.facing);
    const d = distance(n.pos, this.player.pos);
    const alarmed = (sees && crime !== null) || this.seesBody(n);
    if (alarmed) {
      if (sees) this.markSeen();
      if (n.armed) this.makeHostile(n);
      else if (n.callTimer === null) n.callTimer = rules.callDelay;
    } else if (sees) {
      let s = this.inventory.visibleSuspicion();
      const site = this.site(n.site);
      if (n.kind === 'staff' && site && this.siteOpen(site) && site.def.staffOnly.some((r) => pointInRect(this.player.pos, r))) s = 1;
      if (n.kind === 'staff' && this.wanted && !this.inventory.masked() && n.callTimer === null && !n.called) {
        n.callTimer = rules.callDelay;
        this.emit({ type: 'message', text: `${n.name} te dévisage. Il t'a reconnu.`, danger: true });
      }
      n.suspicion += s * rules.suspicionRate * dt * (d < 5 ? 2 : 1);
    } else {
      n.suspicion = Math.max(0, n.suspicion - 0.1 * dt);
    }

    // Bruits : le métal qu'on force, les coups de feu, les alarmes.
    for (const noise of this.noises) {
      const nd = distance(n.pos, noise.pos);
      const reach = noise.radius * (noise.kind === 'shot' || this.clearSight(n.pos, noise.pos) ? 1 : 0.5);
      if (nd > reach) continue;
      if (noise.kind === 'shot') {
        if (n.armed) this.makeHostile(n);
        else if (n.callTimer === null) n.callTimer = rules.callDelay;
      } else if (n.armed) {
        n.suspicion += 0.8 * dt;
        if (n.suspicion >= 1 || noise.kind === 'alarm') this.investigate(n, noise.pos);
      } else if (noise.kind === 'work') {
        n.suspicion += 0.8 * dt;
        n.facing = bearing(n.pos, noise.pos);
      }
    }
    if (n.hostile) return;

    if (n.investigating) {
      if (n.path.length > 0) n.follow(2.4, dt);
      else {
        n.moving = false;
        n.lookTimer -= dt;
        n.facing += dt * 1.2;
        if (n.lookTimer <= 0) {
          n.investigating = false;
          n.suspicion = 0;
        }
      }
    }

    if (n.suspicion >= 1 && n.callTimer === null && !n.called && !n.investigating) {
      n.suspicion = 1;
      n.callTimer = rules.callDelay;
    }
    if (n.callTimer !== null) {
      n.callTimer -= dt;
      if (n.callTimer <= 0) {
        n.callTimer = null;
        n.called = true;
        n.robbed = false;
        n.suspicion = 0;
        this.callPolice(`${n.name} a appelé la police`, false);
      }
    }
  }

  private investigate(n: Npc, pos: Point): void {
    if (n.investigating && n.path.length > 0) return;
    n.investigating = true;
    n.path = this.nav.path(n.pos, pos);
    n.lookTimer = 4;
  }

  /**
   * Poursuite et tir, communs aux vigiles et aux policiers : ils tirent sur un joueur dangereux, courent
   * arrêter un joueur désarmé, et fouillent sa dernière position connue quand ils le perdent de vue.
   */
  private combatStep(n: Npc, dt: number, speed: number): void {
    const rules = this.data.rules;
    const p = this.player.pos;
    const sees = this.sees(n.pos, n.facing, 34, 2.6);
    const d = distance(n.pos, p);
    if (sees) {
      n.lastKnown = { ...p };
      n.unseenFor = 0;
      n.facing = bearing(n.pos, p);
    } else {
      n.unseenFor += dt;
    }
    // Alerte par radio.
    if (n.callTimer !== null) {
      n.callTimer -= dt;
      if (n.callTimer <= 0) {
        n.callTimer = null;
        n.called = true;
        this.callPolice(`${n.name} a donné l'alerte par radio`, false);
      }
    }

    const held = this.inventory.held;
    const dangerous = this.violent || this.aiming || (held !== null && this.inventory.def(held).kind === 'weapon');
    n.aiming = false;
    n.repath -= dt;

    if (sees && dangerous && d < 30) {
      n.aiming = true;
      if (d > 13) this.chase(n, p, speed, dt);
      else n.moving = false;
      n.shootTimer -= dt;
      if (n.shootTimer <= 0) {
        n.shootTimer = 0.9 + this.rng.next() * 0.5;
        let chance = Math.max(0.12, Math.min(0.7, 0.8 - d * 0.035));
        if (this.player.crouching) chance *= 0.75;
        if (this.player.sprinting) chance *= 0.7;
        const hit = this.rng.next() < chance;
        this.emit({ type: 'shot', from: { ...n.pos }, to: { ...p }, by: 'npc', hit, shooter: n.id });
        this.noises.push({ pos: n.pos, radius: rules.gunshotRadius, kind: 'shot' });
        if (hit) this.hurt(rules.guardDamage);
      }
      return;
    }
    if (sees) {
      n.aiming = d < 9;
      if (d < 1.5) {
        this.bust('arrested');
        return;
      }
      this.chase(n, p, speed, dt);
      return;
    }
    if (n.lastKnown) {
      if (distance(n.pos, n.lastKnown) > 1) {
        this.chase(n, n.lastKnown, speed * 0.8, dt);
      } else {
        // Sur place : il balaie les alentours du regard, puis abandonne cette piste.
        n.moving = false;
        n.lookTimer += dt;
        n.facing += dt * 1.6;
        if (n.lookTimer > 3) {
          n.lookTimer = 0;
          n.lastKnown = null;
        }
      }
      return;
    }
    if (n.kind === 'officer') {
      // Fouille : il va de point en point autour de la cible.
      if (n.path.length === 0) {
        const site = this.site(this.incident?.site);
        const r = site?.def.rect;
        const target = r
          ? { x: r.min[0] + this.rng.next() * (r.max[0] - r.min[0]), z: r.min[1] - 3 + this.rng.next() * (r.max[1] - r.min[1] + 5) }
          : { x: this.policeStop.x + (this.rng.next() - 0.5) * 24, z: -3 + (this.rng.next() - 0.5) * 8 };
        n.path = this.nav.path(n.pos, target);
      }
      n.follow(speed * 0.5, dt);
      return;
    }
    // Un vigile qui a perdu sa cible finit par regagner son poste.
    n.moving = false;
    if (n.unseenFor > 15) {
      n.hostile = false;
      n.aiming = false;
    }
  }

  private chase(n: Npc, target: Point, speed: number, dt: number): void {
    if (n.repath <= 0 || n.path.length === 0) {
      n.repath = 0.5;
      n.path = this.nav.walkable(n.pos, target) ? [{ ...target }] : this.nav.path(n.pos, target);
    }
    n.follow(speed, dt);
  }

  // --- Sites, police, incidents ------------------------------------------------------------------

  private updateSites(dt: number): void {
    const rules = this.data.rules;
    for (const s of this.sites.values()) {
      const r = s.def.rect;
      const center = { x: (r.min[0] + r.max[0]) / 2, z: (r.min[1] + r.max[1]) / 2 };
      if (s.alarm > 0) {
        s.alarm = s.powered ? s.alarm - dt : 0;
        this.noises.push({ pos: center, radius: 32, kind: 'alarm' });
      }
      if (s.drill !== null) {
        s.drill += dt;
        const drillAt = this.data.level.interactables.find((i) => i.kind === 'vault-drill' && i.site === s.def.id);
        this.noises.push({ pos: drillAt ? toPoint(drillAt.pos) : center, radius: 22, kind: 'work' });
        if (s.drill >= rules.drillTime) {
          s.drill = null;
          s.vaultOpen = true;
          this.inventory.add('drill');
          this.emit({ type: 'vault-open' });
          this.emit({ type: 'message', text: 'La porte de la chambre forte cède. Tu récupères la perceuse.' });
        }
      }
    }
    if (this.carAlarm) {
      this.carAlarm.time -= dt;
      this.noises.push({ pos: this.carAlarm.pos, radius: 28, kind: 'alarm' });
      if (this.carAlarm.time <= 0) this.carAlarm = null;
    }
  }

  /** Vrai si une alarme de site ou de voiture sonne (pour le son). */
  get alarmRinging(): boolean {
    if (this.carAlarm) return true;
    for (const s of this.sites.values()) if (s.alarm > 0) return true;
    return false;
  }

  /** Vrai si une perceuse tourne quelque part. */
  get drilling(): boolean {
    for (const s of this.sites.values()) if (s.drill !== null) return true;
    return false;
  }

  private ensureIncident(siteId: string | null): void {
    if (this.incident) {
      this.incident.site ??= siteId;
      return;
    }
    this.incident = { site: siteId, loot: 0, calls: [], identified: false, policeCame: false, victims: 0, start: this.clock.seconds };
  }

  private callPolice(reason: string, loud: boolean): void {
    this.ensureIncident(this.siteAt(this.player.pos)?.def.id ?? null);
    const inc = this.incident;
    if (!inc) return;
    if (!inc.calls.includes(reason)) inc.calls.push(reason);
    const site = this.site(inc.site);
    if (this.police.call(this.heat, loud, site?.def.tier ?? 0)) {
      this.heat += this.data.rules.heatPerCall;
      const b = this.data.level.bounds;
      this.policeStop = site
        ? toPoint(site.def.policeStop)
        : { x: Math.max(b.min[0] + 8, Math.min(b.max[0] - 8, this.player.pos.x)), z: 0 };
      this.spawned = 0;
    }
  }

  private spawnOfficers(count: number): void {
    for (let i = 0; i < count && this.spawned < MAX_OFFICERS; i++) {
      const n = new Npc(`officer-${this.clock.seconds.toFixed(0)}-${this.spawned}`, 'officer', 'officer', 'Un policier', true, null, this.spawned);
      n.present = true;
      n.hostile = true;
      n.called = true;
      n.shootTimer = 1;
      const side = this.spawned % 2 === 0 ? 1 : -1;
      const start = { x: this.policeStop.x + side * (1.2 + Math.floor(this.spawned / 2) * 0.9), z: this.policeStop.z - 1.6 };
      n.pos.x = start.x;
      n.pos.z = start.z;
      n.facing = -Math.PI / 2;
      this.officers.push(n);
      this.spawned++;
    }
  }

  private updateIntel(dt: number): void {
    const visible: string[] = [];
    for (const intel of this.data.level.intel) {
      if (intel.trigger !== 'look' || this.notebook.has(intel.id)) continue;
      if (intel.marker === 'camera' && !this.site(intel.site)?.powered) continue;
      if (this.looksAt(toPoint(intel.pos), intel.y, intel.range)) visible.push(intel.id);
    }
    for (const def of this.notebook.observe(visible, dt, this.clock.seconds)) this.emit({ type: 'intel', def });

    for (const b of this.staff) {
      const def = b.def;
      if (!b.npc.active || !this.playerNotices(b.npc.pos)) continue;
      if (def.seenIntel) this.learnIntel(def.seenIntel);
      if (def.pause?.intel && b.mode === 'pause') this.learnIntel(def.pause.intel);
      if (def.leaveIntel && b.mode === 'leaving') this.learnIntel(def.leaveIntel);
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
      const tier = this.site(this.incident?.site)?.def.tier ?? 0;
      this.spawnOfficers(2 + Math.max(0, tier - 1));
      this.emit({ type: 'message', text: 'La police est sur place.', danger: true });
    } else if (changed === 'leaving') {
      this.officers = this.officers.filter((o) => o.down !== 'no');
      for (const o of this.officers) o.present = false;
      this.officers = [];
    }
    if (this.police.state !== 'searching') return;

    if (this.reinforce > 0) {
      this.reinforce -= dt;
      if (this.reinforce <= 0) {
        this.spawnOfficers(2);
        this.emit({ type: 'message', text: 'Des renforts arrivent.', danger: true });
      }
    }
    let onTrail = false;
    for (const o of this.officers) {
      if (!o.active) continue;
      this.combatStep(o, dt, this.data.rules.officerSpeed);
      if (this.police.state !== 'searching') return;
      if (o.unseenFor < 6) onTrail = true;
    }
    if (onTrail) this.police.extendSearch(14);
  }

  private tryFinishIncident(): void {
    if (!this.incident || this.police.state !== 'idle' || !this.inHideout()) return;
    for (const n of this.npcs) {
      if (n.active && (n.callTimer !== null || n.compliant > 0 || n.hostile)) return;
    }
    this.finishIncident(true, 'clean', []);
  }

  /** Arrêté, ou abattu : le matériel et le butin sont perdus, et le temps passe. */
  private bust(cause: 'arrested' | 'shot'): void {
    const lost = this.inventory.confiscate();
    this.heat += 20;
    this.wanted = true;
    this.stats.arrests++;
    this.ensureIncident(null);
    this.finishIncident(false, cause, lost);
    this.police.reset();
    this.officers = [];
    this.clock.skipTo(8);
    if (cause === 'shot') {
      // L'hôpital avant la cellule : un jour de plus, et la note à payer.
      this.clock.advance(24 * 3600);
      this.inventory.cash = Math.floor(this.inventory.cash * 0.7);
    }
    this.dailyUpdate();
    this.respawn();
  }

  private finishIncident(success: boolean, cause: Report['cause'], lost: ItemId[]): void {
    const inc = this.incident;
    this.incident = null;
    this.violent = false;
    this.carAlarm = null;
    for (const n of this.npcs) {
      const down = n.down;
      n.calm();
      n.down = down;
    }
    if (!inc) return;
    if (success && inc.loot > 0) this.stats.heists++;
    this.emit({
      type: 'report',
      report: {
        success,
        cause,
        site: inc.site,
        loot: inc.loot,
        calls: inc.calls,
        identified: inc.identified,
        policeCame: inc.policeCame,
        victims: inc.victims,
        lost,
        duration: this.clock.seconds - inc.start,
      },
    });
  }

  private respawn(): void {
    this.player.pos = toPoint(this.data.level.spawn);
    this.player.facing = -Math.PI / 2;
    this.player.hp = this.data.rules.playerHealth;
    this.action = null;
    this.reloadTimer = 0;
    this.settleEveryone();
    this.refreshDoors();
    this.updateRegisters();
  }

  /** Dort jusqu'à 8 h (matin) ou 23 h (nuit noire), selon ce qui vient en premier. */
  sleep(): void {
    const h = this.clock.hour;
    this.clock.skipTo(h >= 8 && h < 23 ? 23 : 8);
    this.dailyUpdate();
    this.player.hp = this.data.rules.playerHealth;
    this.settleEveryone();
    this.refreshDoors();
    this.updateRegisters();
    this.emit({ type: 'slept' });
    this.emit({ type: 'message', text: `Réveil : ${this.clock.format()}` });
  }

  // --- Marché noir -------------------------------------------------------------------------------

  buy(id: ItemId): string {
    const rules = this.data.rules;
    const name = this.inventory.def(id).name;
    switch (this.inventory.buy(id)) {
      case 'ok':
        if (id === 'pistol') this.inventory.mag = rules.magazine;
        if (id === 'plate-carrier') this.inventory.armor = rules.armorPoints;
        return `${name} : vendu.`;
      case 'owned':
        return `Tu as déjà : ${name}.`;
      case 'poor':
        return 'Pas assez d’argent propre.';
      case 'locked':
        return '« Fais d’abord tes preuves. »';
    }
  }

  buyAmmo(): string {
    const rules = this.data.rules;
    if (!this.inventory.has('pistol')) return 'Il te faut d’abord un pistolet.';
    if (this.inventory.cash < rules.ammoPrice) return 'Pas assez d’argent propre.';
    this.inventory.cash -= rules.ammoPrice;
    this.inventory.ammo += rules.magazine;
    return `Un chargeur de ${rules.magazine} balles.`;
  }

  buyPlates(): string {
    const rules = this.data.rules;
    if (!this.inventory.has('plate-carrier')) return 'Il te faut d’abord un gilet.';
    if (this.inventory.armor >= rules.armorPoints) return 'Tes plaques sont intactes.';
    if (this.inventory.cash < rules.platePrice) return 'Pas assez d’argent propre.';
    this.inventory.cash -= rules.platePrice;
    this.inventory.armor = rules.armorPoints;
    return 'Plaques neuves installées.';
  }

  launder(): string {
    if (this.inventory.dirty <= 0) return 'Tu n’as pas d’argent sale.';
    const clean = this.inventory.launder(this.data.rules.launderFee);
    return `Le Fourgue garde sa part. Tu récupères ${clean} $ propres.`;
  }

  /** Verse tout l'argent propre possible sur la dette. La solder termine la partie. */
  payDebt(): string {
    const amount = Math.min(this.inventory.cash, this.debtLeft);
    if (amount <= 0) return this.debtLeft <= 0 ? 'Ta dette est soldée.' : 'Tu n’as rien à verser.';
    this.inventory.cash -= amount;
    this.debtPaid += amount;
    if (this.debtLeft <= 0) {
      this.emit({ type: 'win' });
      return 'Dette soldée. Tu es libre.';
    }
    return `${amount} $ versés. Il reste ${this.debtLeft} $.`;
  }

  // --- Sauvegarde --------------------------------------------------------------------------------

  /** Instantané de la progression. On ne sauvegarde qu'au calme : les coups en cours ne sont pas conservés. */
  snapshot(): SaveData {
    const inv = this.inventory;
    const emptied: [string, number][] = [];
    for (const [id, c] of this.containers) if (c.emptiedDay !== null) emptied.push([id, c.emptiedDay]);
    return {
      v: SAVE_VERSION,
      seconds: this.clock.seconds,
      cash: inv.cash,
      dirty: inv.dirty,
      laundered: inv.laundered,
      items: [...inv.items],
      worn: [...inv.worn],
      mag: inv.mag,
      ammo: inv.ammo,
      armor: inv.armor,
      hp: this.player.hp,
      heat: this.heat,
      wanted: this.wanted,
      debtPaid: this.debtPaid,
      known: [...this.notebook.known],
      used: [...this.used],
      emptied,
      stats: { ...this.stats },
    };
  }

  /** Reconstruit une partie depuis une sauvegarde ; renvoie null si elle est d'une autre version. */
  static restore(data: GameData, save: SaveData, seed = 1): World | null {
    if (save.v !== SAVE_VERSION) return null;
    const w = new World(data, seed);
    w.clock.seconds = save.seconds;
    w.lastResetDay = w.clock.hour < 5 ? w.clock.day - 1 : w.clock.day;
    const inv = w.inventory;
    inv.cash = save.cash;
    inv.dirty = save.dirty;
    inv.laundered = save.laundered;
    for (const id of save.items) if (data.items.has(id)) inv.add(id);
    for (const id of save.worn) if (inv.has(id)) inv.worn.add(id);
    inv.mag = save.mag;
    inv.ammo = save.ammo;
    inv.armor = save.armor;
    w.player.hp = save.hp;
    w.heat = save.heat;
    w.wanted = save.wanted;
    w.debtPaid = save.debtPaid;
    for (const [id, at] of save.known) w.notebook.learn(id, at);
    for (const id of save.used) w.used.add(id);
    for (const [id, day] of save.emptied) {
      const c = w.containers.get(id);
      if (c) {
        c.amount = 0;
        c.emptiedDay = day;
      }
    }
    Object.assign(w.stats, save.stats);
    w.settleEveryone();
    w.refreshDoors();
    w.updateRegisters();
    return w;
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
