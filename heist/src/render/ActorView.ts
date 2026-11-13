import * as THREE from 'three';
import type { Npc } from '../systems/Npc';
import type { World } from '../systems/World';
import type { LightSource } from './CityView';
import { shadows } from './build';
import { Human, lookFor, type PoseName } from './models/human';
import { makePoliceCar } from './models/props';

interface Body {
  readonly human: Human;
  readonly npc: Npc;
  lastX: number;
  lastZ: number;
  speed: number;
}

/** Pose d'un personnage d'après son état dans la simulation. */
export function poseOf(npc: Npc, mode: string | null, speed: number): PoseName {
  if (npc.down !== 'no') return 'down';
  if (npc.compliant > 0) return 'hands-up';
  if (npc.aiming) return 'aim';
  if (npc.callTimer !== null && !npc.armed) return 'phone';
  if (npc.called && !npc.armed && !npc.moving) return 'cower';
  if (npc.moving || speed > 0.3) {
    if (npc.hostile && speed > 2.5) return 'run';
    if (npc.investigating || npc.role === 'watchman') return 'search';
    return 'walk';
  }
  if (mode === 'pause' && npc.role === 'clerk') return 'smoke';
  return 'idle';
}

/** Tous les personnages du monde, et la voiture de police avec ses gyrophares. */
export class ActorView {
  private readonly bodies = new Map<string, Body>();
  private readonly car = makePoliceCar();
  private readonly carFrom = new THREE.Vector3();
  private readonly carTo = new THREE.Vector3();
  private readonly red: LightSource = { pos: new THREE.Vector3(), color: new THREE.Color('#ff2a2a'), range: 22, power: 60, level: 0, tag: 'police' };
  private readonly blue: LightSource = { pos: new THREE.Vector3(), color: new THREE.Color('#2a5cff'), range: 22, power: 60, level: 0, tag: 'police' };
  private world: World | null = null;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    shadows(this.car.root);
    this.car.root.visible = false;
    scene.add(this.car.root);
  }

  /** Change de partie : on repart d'une scène sans personnages. */
  reset(world: World): void {
    for (const b of this.bodies.values()) this.scene.remove(b.human.root);
    this.bodies.clear();
    this.world = world;
  }

  /** Personnage visé par le joueur (pour les impacts de balle). */
  bodyOf(id: string): THREE.Object3D | null {
    return this.bodies.get(id)?.human.root ?? null;
  }

  update(dt: number, time: number, lights: LightSource[]): void {
    const world = this.world;
    if (!world) return;
    const modes = new Map<string, string>();
    for (const b of world.staff) modes.set(b.npc.id, b.mode);

    const seen = new Set<string>();
    const pl = world.player.pos;
    this.eye.set(pl.x, world.eyeHeight(), pl.z);
    for (const npc of world.everyone()) {
      seen.add(npc.id);
      let body = this.bodies.get(npc.id);
      if (!body) {
        const look = lookFor(npc.kind === 'officer' ? 'officer' : npc.role, npc.variant + (npc.kind === 'pedestrian' ? npc.id.length : 0));
        const human = new Human(look);
        this.scene.add(human.root);
        body = { human, npc, lastX: npc.pos.x, lastZ: npc.pos.z, speed: 0 };
        this.bodies.set(npc.id, body);
      }
      const visible = npc.present || npc.down !== 'no';
      body.human.root.visible = visible;
      if (!visible) continue;
      const moved = Math.hypot(npc.pos.x - body.lastX, npc.pos.z - body.lastZ);
      const inst = dt > 0 ? moved / dt : 0;
      // Un saut de plus d'un mètre est une téléportation (réapparition), pas une course.
      body.speed += ((inst > 12 ? 0 : inst) - body.speed) * Math.min(1, dt * 8);
      body.lastX = npc.pos.x;
      body.lastZ = npc.pos.z;
      // Regard : on suit des yeux le joueur s'il est proche, menaçant, ou si l'on est sur ses gardes.
      const d = Math.hypot(npc.pos.x - pl.x, npc.pos.z - pl.z);
      const alert = npc.compliant > 0 || npc.hostile || npc.suspicion > 0.2 || npc.aiming;
      body.human.gaze = d < (alert ? 25 : 6) && npc.down === 'no' ? this.eye : null;
      // Détails fins (doigts, coutures, cils…) seulement de près.
      body.human.setDetail(d < 16);
      body.human.update(dt, npc.pos.x, npc.pos.z, npc.facing, poseOf(npc, modes.get(npc.id) ?? null, body.speed), body.speed);
    }
    for (const [id, body] of this.bodies) {
      if (seen.has(id)) continue;
      this.scene.remove(body.human.root);
      this.bodies.delete(id);
    }

    // Voiture de police : elle remonte la rue depuis l'est et se gare devant la cible.
    const progress = world.police.carProgress();
    const car = this.car;
    car.root.visible = progress > 0;
    const spawn = world.data.level.policeSpawn;
    this.carFrom.set(spawn[0] + 30, 0, 1.2);
    this.carTo.set(world.policeStop.x + 3, 0, world.policeStop.z + 1.2);
    if (progress > 0) {
      const t = 1 - (1 - progress) * (1 - progress);
      car.root.position.lerpVectors(this.carFrom, this.carTo, t);
      car.root.rotation.y = Math.PI;
      const flash = Math.sin(time * 14) > 0;
      const r = car.red.material as THREE.MeshStandardMaterial;
      const b = car.blue.material as THREE.MeshStandardMaterial;
      r.emissiveIntensity = flash ? 4 : 0.1;
      b.emissiveIntensity = flash ? 0.1 : 4;
      car.red.getWorldPosition(this.red.pos);
      car.blue.getWorldPosition(this.blue.pos);
      this.red.pos.y += 0.4;
      this.blue.pos.y += 0.4;
      this.red.level = flash ? 1 : 0.05;
      this.blue.level = flash ? 0.05 : 1;
      lights.push(this.red, this.blue);
    }
  }
}
