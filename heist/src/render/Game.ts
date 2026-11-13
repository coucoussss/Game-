import * as THREE from 'three';
import type { GameData, ItemId, Rect } from '../data/types';
import { daylight } from '../systems/Clock';
import type { Point } from '../systems/geometry';
import { IDLE_INPUT, SAVE_VERSION, World, type SaveData, type WorldEvent } from '../systems/World';
import { ActorView } from './ActorView';
import { Effects } from './Effects';
import { Hud } from './Hud';
import { Input } from './Input';
import { LevelView } from './LevelView';
import { Sfx } from './Sfx';
import { Viewmodel } from './Viewmodel';

/** Pas fixe de la simulation, indépendant de la fréquence d'affichage. */
const TICK = 1 / 60;
const SAVE_KEY = 'sans-filet/save';
const SETTINGS_KEY = 'sans-filet/settings';
const BASE_FOV = 72;

/** Stockage clé-valeur injecté (localStorage dans le navigateur). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Distance jusqu'au premier mur le long d'un rayon horizontal (méthode des dalles). */
function rayToWalls(from: Point, dir: Point, walls: readonly Rect[], max: number): number {
  let best = max;
  for (const r of walls) {
    let t0 = 0;
    let t1 = best;
    let ok = true;
    for (const [o, d, lo, hi] of [
      [from.x, dir.x, r.min[0], r.max[0]],
      [from.z, dir.z, r.min[1], r.max[1]],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) ok = false;
        continue;
      }
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) ok = false;
    }
    if (ok && t0 > 0.05 && t0 < best) best = t0;
  }
  return best;
}

/** Relie la simulation (`World`) à Three.js, au DOM, au son et à la sauvegarde. */
export class Game {
  world: World;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.03, 900);
  private readonly input: Input;
  private readonly level: LevelView;
  private readonly actors: ActorView;
  private readonly effects: Effects;
  private readonly viewmodel: Viewmodel;
  private readonly hud: Hud;
  private readonly sfx = new Sfx();
  private accumulator = 0;
  private last = performance.now();
  private time = 0;
  private eye = 1.65;
  private shake = 0;
  private lastDay = 0;
  private prevOverlay: string | null = null;
  private readonly params = new URLSearchParams(location.search);

  constructor(
    container: HTMLElement,
    hudRoot: HTMLElement,
    private readonly data: GameData,
    private readonly storage: KeyValueStorage,
  ) {
    this.world = this.freshWorld();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);
    this.level = new LevelView(this.scene, data);
    this.actors = new ActorView(this.scene);
    this.actors.reset(this.world);
    this.effects = new Effects(this.scene);
    this.viewmodel = new Viewmodel(this.camera);
    this.hud = new Hud(hudRoot, data, this.world, {
      resume: () => this.resume(),
      newGame: () => this.start(this.freshWorld(Math.floor(Math.random() * 1e9))),
      continueGame: () => this.start(this.loadSave() ?? this.freshWorld()),
      save: () => this.save(true),
      quit: () => {
        this.save(false);
        this.toTitle();
      },
      setVolume: (v) => {
        this.sfx.setVolume(v);
        this.saveSettings();
      },
      setSensitivity: (v) => {
        this.input.sensitivity = 0.0022 * v;
        this.saveSettings();
      },
    });
    this.loadSettings();
    this.hud.hasSave = this.loadSave() !== null;
    this.hud.show('title');

    this.renderer.domElement.addEventListener('click', () => {
      this.sfx.start();
      if (!this.hud.overlay && !this.input.locked) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.hud.overlay === null) this.openOverlay('pause');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.hud.overlay !== 'title') this.save(false);
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    if (this.params.has('play')) this.start(this.world);
  }

  private freshWorld(seed = Number(this.params.get('seed') ?? 1)): World {
    const w = new World(this.data, seed);
    const hour = this.params.get('hour');
    if (hour !== null) {
      w.clock.seconds = Number(hour) * 3600;
      w.sleep();
      w.clock.seconds = Number(hour) * 3600 + 86400;
      w.step(0, IDLE_INPUT);
      w.drainEvents();
    }
    if (this.params.get('give') === 'all') {
      for (const id of this.data.items.keys()) w.inventory.add(id as ItemId);
      w.inventory.cash = 5000;
      w.inventory.laundered = 5000;
      w.inventory.mag = this.data.rules.magazine;
      w.inventory.ammo = 32;
      w.inventory.armor = this.data.rules.armorPoints;
    }
    return w;
  }

  private loadSave(): World | null {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const save = JSON.parse(raw) as SaveData;
      if (save.v !== SAVE_VERSION) return null;
      return World.restore(this.data, save, Math.floor(Math.random() * 1e9));
    } catch {
      return null;
    }
  }

  /** Sauvegarde la progression ; impossible pendant un coup (on ne fige pas une fuite). */
  private save(notify: boolean): void {
    if (this.hud.overlay === 'title') return;
    if (this.world.incident) {
      if (notify) this.hud.toast('Impossible de sauvegarder en plein coup.', 'danger');
      return;
    }
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.world.snapshot()));
      this.hud.hasSave = true;
    } catch {
      // Stockage indisponible (navigation privée) : on continue sans sauvegarder.
    }
  }

  private loadSettings(): void {
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { volume?: number; sensitivity?: number };
      if (typeof s.volume === 'number') {
        this.hud.volume = s.volume;
        this.sfx.setVolume(s.volume);
      }
      if (typeof s.sensitivity === 'number') {
        this.hud.sensitivity = s.sensitivity;
        this.input.sensitivity = 0.0022 * s.sensitivity;
      }
    } catch {
      // Réglages illisibles : valeurs par défaut.
    }
  }

  private saveSettings(): void {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify({ volume: this.hud.volume, sensitivity: this.hud.sensitivity }));
    } catch {
      // Pas grave.
    }
  }

  /** Lance (ou reprend) une partie avec ce monde. */
  private start(world: World): void {
    this.world = world;
    this.actors.reset(world);
    this.hud.setWorld(world);
    this.level.repairCases();
    this.input.facing = world.player.facing;
    this.input.pitch = 0;
    this.lastDay = world.clock.day;
    this.hud.show(null);
    this.resume();
  }

  private toTitle(): void {
    this.input.unlock();
    this.hud.hasSave = this.loadSave() !== null;
    this.hud.show('title');
  }

  run(): void {
    const frame = (now: number) => {
      this.frame(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private resume(): void {
    this.sfx.start();
    // Autosauvegarde en sortant du marché noir ou d'un bilan.
    if (this.prevOverlay === 'shop' || this.prevOverlay === 'report') this.save(false);
    this.input.flush();
    this.input.lock();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private openOverlay(overlay: 'notebook' | 'shop' | 'pause'): void {
    this.hud.show(overlay);
    this.input.flush();
    this.input.unlock();
  }

  private frame(dt: number): void {
    this.time += dt;
    const w = this.world;
    const overlay = this.hud.overlay;
    if (overlay !== null) this.prevOverlay = overlay;

    if (overlay === null) {
      if (this.input.consume('Tab')) this.openOverlay('notebook');
      else if (this.input.consume('Escape') && !this.input.locked) this.openOverlay('pause');
      this.accumulator += dt;
      while (this.accumulator >= TICK && this.hud.overlay === null) {
        this.accumulator -= TICK;
        const input = this.input.read();
        const wheel = this.input.consumeWheel();
        let slot = input.slot;
        if (wheel !== 0 && slot === null) {
          const list = w.inventory.holdable();
          if (list.length) {
            const cur = w.inventory.held ? list.indexOf(w.inventory.held) : -1;
            slot = (cur + wheel + list.length + (cur < 0 && wheel < 0 ? 1 : 0)) % list.length;
          }
        }
        w.step(TICK, { ...input, slot });
        this.handleEvents(w.drainEvents());
      }
    } else {
      this.accumulator = 0;
      if (overlay === 'notebook' && this.input.consume('Tab')) {
        this.hud.show(null);
        this.resume();
      }
      // Le monde continue de vivre derrière l'écran titre.
      if (overlay === 'title') {
        w.step(dt, IDLE_INPUT);
        w.drainEvents();
      }
    }
    if (w.clock.day !== this.lastDay && w.clock.hour >= 5) {
      this.lastDay = w.clock.day;
      this.level.repairCases();
    }

    this.updateCamera(dt);
    this.viewmodel.root.visible = this.hud.overlay !== 'title';
    this.actors.update(dt, this.time, this.level.transient);
    this.effects.update(dt, this.level.transient);
    this.ambientEffects();
    this.level.update(w, this.camera, dt, this.time);
    this.viewmodel.update(w, dt, this.time);
    this.hud.update(dt);
    this.updateSound(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number): void {
    const w = this.world;
    const cam = this.camera;
    if (this.hud.overlay === 'title') {
      // Plan lent le long de la rue, de nuit comme de jour.
      const t = this.time * 0.035;
      const x = -40 + ((t * 30) % 110);
      cam.position.set(x, 2.2 + Math.sin(t * 2) * 0.3, 3.4);
      cam.rotation.set(-0.02, Math.PI * 0.62 + Math.sin(t) * 0.12, 0, 'YXZ');
      cam.fov = BASE_FOV;
      cam.updateProjectionMatrix();
      return;
    }
    const p = w.player;
    this.eye += (w.eyeHeight() - this.eye) * Math.min(1, dt * 10);
    const speed = p.moving ? (p.sprinting ? 1.6 : 1) : 0;
    const bob = Math.sin(this.time * 10 * Math.max(0.6, speed)) * 0.025 * speed * (1 - this.viewmodel.aimFactor);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.04;
    cam.position.set(p.pos.x + (Math.random() - 0.5) * sh, this.eye + bob + (Math.random() - 0.5) * sh, p.pos.z + (Math.random() - 0.5) * sh);
    cam.rotation.set(p.pitch, -p.facing - Math.PI / 2, 0, 'YXZ');
    const fov = BASE_FOV - this.viewmodel.aimFactor * 20 + (p.sprinting ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
    this.input.zoom = 1 - this.viewmodel.aimFactor * 0.45;
  }

  /** Étincelles de la perceuse et du métal forcé. */
  private ambientEffects(): void {
    const w = this.world;
    for (const s of w.sites.values()) {
      if (s.drill === null) continue;
      const it = this.data.level.interactables.find((i) => i.kind === 'vault-drill' && i.site === s.def.id);
      if (it && Math.random() < 0.6) this.effects.sparks(new THREE.Vector3(it.pos[0], 1.15, it.pos[1] + 0.05), 2);
    }
    const a = w.action;
    if (a && a.noisy && w.inventory.held === 'crowbar' && Math.random() < 0.15) {
      const it = this.data.level.interactables.find((i) => i.id === a.target);
      if (it) this.effects.sparks(new THREE.Vector3(it.pos[0], it.y, it.pos[1]), 2);
    }
  }

  private updateSound(dt: number): void {
    const w = this.world;
    const p = w.player;
    const police = w.police;
    let siren = 0;
    if (police.state === 'en-route') siren = Math.max(0, 1 - police.timer / 14);
    else if (police.state === 'searching') siren = 0.6;
    else if (police.state === 'leaving') siren = police.timer / 4;
    let bell = 0;
    for (const s of w.sites.values()) if (s.alarm > 0) bell = 1;
    const car = w.alarmRinging && bell === 0 ? 1 : 0;
    const indoor = w.inHideout() || w.siteAt(p.pos) !== null;
    const playing = this.hud.overlay === null;
    this.sfx.update(this.time, {
      siren: playing ? siren : siren * 0.3,
      bell: playing ? bell : 0,
      car: playing ? car : 0,
      drill: playing && w.drilling ? 1 : 0,
      day: daylight(w.clock.hour),
      indoor,
    });
    const rate = playing && p.moving ? (p.sprinting ? 1.7 : p.crouching ? 0.55 : 1.1) * w.inventory.speedFactor() : 0;
    this.sfx.steps(dt, rate, indoor);
    if (playing && w.noisy) this.sfx.scrape(dt);
  }

  /** Point d'impact d'un tir du joueur qui n'a touché personne : premier mur, ou le sol. */
  private impactPoint(): THREE.Vector3 {
    const w = this.world;
    const p = w.player;
    const dir = { x: Math.cos(p.facing), z: Math.sin(p.facing) };
    const walls = this.data.level.walls.filter((wl) => !wl.glass).map((wl) => wl.rect);
    let t = rayToWalls(p.pos, dir, walls, 60);
    const slope = Math.tan(p.pitch);
    if (slope < -0.01) t = Math.min(t, this.eye / -slope);
    const y = this.eye + slope * t;
    return new THREE.Vector3(p.pos.x + dir.x * t, Math.max(0.02, y), p.pos.z + dir.z * t);
  }

  private handleEvents(events: WorldEvent[]): void {
    const w = this.world;
    for (const e of events) {
      switch (e.type) {
        case 'message':
          this.hud.toast(e.text, e.danger ? 'danger' : e.text.startsWith('+') ? 'money' : 'info');
          break;
        case 'intel':
          this.hud.toast(`Noté : ${e.def.text}`, 'intel');
          this.sfx.chime(true);
          break;
        case 'loot':
          this.sfx.chime(false);
          break;
        case 'alarm':
          this.shake = Math.max(this.shake, 0.3);
          break;
        case 'shot': {
          if (e.by === 'player') {
            this.viewmodel.kick();
            this.shake = Math.max(this.shake, 0.35);
            const muzzle = this.viewmodel.muzzle.getWorldPosition(new THREE.Vector3());
            this.effects.muzzle(muzzle);
            this.sfx.gunshot(0);
            if (e.hit) {
              const target = new THREE.Vector3(e.to.x, 1.3, e.to.z);
              this.effects.tracer(muzzle, target);
              this.effects.blood(target);
              this.hud.hitMarker();
            } else {
              const impact = this.impactPoint();
              this.effects.tracer(muzzle, impact);
              this.effects.impact(impact);
            }
          } else {
            const dx = e.to.x - e.from.x;
            const dz = e.to.z - e.from.z;
            const d = Math.hypot(dx, dz) || 1;
            const from = new THREE.Vector3(e.from.x + (dx / d) * 0.55, 1.42, e.from.z + (dz / d) * 0.55);
            this.effects.muzzle(from);
            const to = new THREE.Vector3(e.to.x, this.eye - 0.2, e.to.z);
            if (!e.hit) {
              to.x += (Math.random() - 0.5) * 1.6;
              to.y += (Math.random() - 0.3) * 1.2;
              to.z += (Math.random() - 0.5) * 1.6;
              // La balle continue sa course derrière le joueur.
              to.sub(from).multiplyScalar(1.6).add(from);
              this.effects.impact(to);
            }
            this.effects.tracer(from, to);
            this.sfx.gunshot(Math.hypot(e.from.x - w.player.pos.x, e.from.z - w.player.pos.z));
          }
          break;
        }
        case 'swing':
          this.viewmodel.strike();
          this.sfx.swing(e.hit);
          if (e.hit) {
            this.hud.hitMarker();
            this.shake = Math.max(this.shake, 0.25);
          }
          break;
        case 'reload':
          this.viewmodel.startReload();
          this.sfx.reload();
          break;
        case 'dry-fire':
          this.sfx.dryFire();
          break;
        case 'hurt':
          this.hud.flashHurt(e.armor);
          this.sfx.hurt(e.armor);
          this.shake = Math.max(this.shake, 0.5);
          break;
        case 'npc-down':
          break;
        case 'glass': {
          const at = this.level.shatter(e.pos);
          if (at) this.effects.shards(at);
          this.sfx.glass(Math.hypot(e.pos.x - w.player.pos.x, e.pos.z - w.player.pos.z));
          break;
        }
        case 'vault-open':
          this.sfx.vault();
          this.shake = Math.max(this.shake, 0.6);
          break;
        case 'slept':
          this.hud.blackout();
          this.level.repairCases();
          this.save(false);
          break;
        case 'open-shop':
          this.openOverlay('shop');
          break;
        case 'open-notebook':
          this.openOverlay('notebook');
          break;
        case 'win':
          this.hud.show('win');
          this.input.flush();
          this.input.unlock();
          this.save(false);
          break;
        case 'report':
          if (!e.report.success) this.hud.blackout();
          this.hud.show('report', e.report);
          this.input.flush();
          this.input.unlock();
          this.level.repairCases();
          break;
      }
    }
  }
}
