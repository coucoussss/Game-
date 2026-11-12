import * as THREE from 'three';
import type { GameData } from '../data/types';
import { DRIVE_TIME } from '../systems/Police';
import { World } from '../systems/World';
import { ActorView } from './ActorView';
import { Hud } from './Hud';
import { Input } from './Input';
import { LevelView } from './LevelView';
import { Sfx } from './Sfx';
import { Viewmodel } from './Viewmodel';

/** Pas fixe de la simulation, indépendant de la fréquence d'affichage. */
const TICK = 1 / 60;

/** Relie la simulation (`World`) à Three.js, au DOM et au son. */
export class Game {
  readonly world: World;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
  private readonly input: Input;
  private readonly level: LevelView;
  private readonly actors: ActorView;
  private readonly viewmodel: Viewmodel;
  private readonly hud: Hud;
  private readonly sfx = new Sfx();
  private accumulator = 0;
  private last = performance.now();
  private time = 0;
  private eye = 1.65;

  constructor(container: HTMLElement, hudRoot: HTMLElement, data: GameData) {
    this.world = new World(data);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene.add(this.camera);

    this.input = new Input(this.renderer.domElement);
    this.level = new LevelView(this.scene, data.level);
    this.actors = new ActorView(this.scene, data.level);
    const fenceTable = new THREE.Vector3(-3.6, 0.85, -17.65);
    this.viewmodel = new Viewmodel(this.camera, this.scene, fenceTable);
    this.hud = new Hud(hudRoot, data, this.world);
    this.hud.onResume = () => this.resume();
    this.input.facing = this.world.player.facing;

    this.renderer.domElement.addEventListener('click', () => {
      if (!this.hud.overlay && !this.input.locked) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.hud.overlay === null) this.hud.show('pause');
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    const frame = (now: number) => {
      this.frame(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private resume(): void {
    this.sfx.start();
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

  private frame(dt: number): void {
    this.time += dt;
    const w = this.world;

    if (this.hud.overlay === null) {
      if (this.input.consume('Tab')) this.openOverlay('notebook');
      this.accumulator += dt;
      while (this.accumulator >= TICK && this.hud.overlay === null) {
        this.accumulator -= TICK;
        w.step(TICK, this.input.read());
        this.handleEvents();
      }
    } else {
      this.accumulator = 0;
      if (this.hud.overlay === 'notebook' && this.input.consume('Tab')) {
        this.hud.show(null);
        this.resume();
      }
    }

    // Caméra à la première personne.
    const p = w.player;
    this.eye += (w.eyeHeight() - this.eye) * Math.min(1, dt * 10);
    const bob = p.moving ? Math.sin(this.time * 10) * 0.03 : 0;
    this.camera.position.set(p.pos.x, this.eye + bob, p.pos.z);
    this.camera.rotation.set(p.pitch, -p.facing - Math.PI / 2, 0, 'YXZ');

    this.level.update(w, this.time);
    this.actors.update(w, dt, this.time);
    this.viewmodel.update(w, dt);
    this.hud.update();

    const police = w.police;
    let siren = 0;
    if (police.state === 'en-route') siren = Math.max(0, 1 - police.timer / (DRIVE_TIME + 8));
    else if (police.state === 'searching') siren = 0.7;
    else if (police.state === 'leaving') siren = police.timer / DRIVE_TIME;
    if (police.loud && police.state !== 'idle') siren = Math.max(siren, 0.2);
    const alarm = police.loud && police.state !== 'idle' && w.powered;
    const walking = this.hud.overlay === null && p.moving ? (p.crouching ? 0.6 : 1.2) : 0;
    this.sfx.update(dt, this.time, siren, alarm, walking, w.noisy);

    this.renderer.render(this.scene, this.camera);
  }

  private openOverlay(overlay: 'notebook' | 'shop'): void {
    this.hud.show(overlay);
    this.input.flush();
    this.input.unlock();
  }

  private handleEvents(): void {
    for (const e of this.world.drainEvents()) {
      switch (e.type) {
        case 'message':
          this.hud.toast(e.text, e.text.startsWith('ALARME') ? 'danger' : 'info');
          break;
        case 'intel':
          this.hud.toast(`Noté : ${e.def.text}`, 'intel');
          this.sfx.chime(true);
          break;
        case 'loot':
          this.sfx.chime(false);
          break;
        case 'alarm':
          break;
        case 'open-shop':
          this.openOverlay('shop');
          break;
        case 'open-notebook':
          this.openOverlay('notebook');
          break;
        case 'report':
          this.hud.show('report', e.report);
          this.input.flush();
          this.input.unlock();
          break;
      }
    }
  }
}
