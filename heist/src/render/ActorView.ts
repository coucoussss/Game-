import * as THREE from 'three';
import type { LevelDef } from '../data/types';
import type { Point } from '../systems/geometry';
import type { Witness, World } from '../systems/World';
import { mat } from './LevelView';

export type Pose = 'idle' | 'walk' | 'hands-up' | 'phone' | 'smoke';

/** Silhouette humaine en blocs, tournée vers +z localement, avec quelques poses. */
export class Humanoid {
  readonly root = new THREE.Group();
  private readonly legL: THREE.Object3D;
  private readonly legR: THREE.Object3D;
  private readonly armL: THREE.Object3D;
  private readonly armR: THREE.Object3D;
  private phase = 0;
  private readonly last = new THREE.Vector2();

  constructor(shirt: string, pants: string, skin = '#c99a78', hat?: string) {
    const limb = (w: number, h: number, color: string, x: number, y: number): THREE.Object3D => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(color));
      m.position.y = -h / 2;
      pivot.add(m);
      this.root.add(pivot);
      return pivot;
    };
    this.legL = limb(0.16, 0.85, pants, -0.1, 0.85);
    this.legR = limb(0.16, 0.85, pants, 0.1, 0.85);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.24), mat(shirt));
    torso.position.y = 1.16;
    this.root.add(torso);
    this.armL = limb(0.12, 0.6, shirt, -0.29, 1.45);
    this.armR = limb(0.12, 0.6, shirt, 0.29, 1.45);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), mat(skin));
    head.position.y = 1.62;
    this.root.add(head);
    if (hat) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.32), mat(hat));
      cap.position.set(0, 1.77, 0.03);
      this.root.add(cap);
    }
  }

  /** Place la silhouette ; la marche est déduite du déplacement depuis l'image précédente. */
  place(pos: Point, facing: number, pose: Pose, dt: number): void {
    const moved = Math.hypot(pos.x - this.last.x, pos.z - this.last.y);
    this.last.set(pos.x, pos.z);
    this.root.position.set(pos.x, 0, pos.z);
    this.root.rotation.y = Math.PI / 2 - facing;
    const walking = pose === 'walk' || (pose === 'idle' && moved > 0.001 && moved < 1);
    this.phase += walking ? dt * 8 : 0;
    const swing = walking ? Math.sin(this.phase) * 0.6 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.set(-swing * 0.7, 0, 0);
    this.armR.rotation.set(swing * 0.7, 0, 0);
    if (pose === 'hands-up') {
      this.armL.rotation.set(Math.PI, 0, 0.25);
      this.armR.rotation.set(Math.PI, 0, -0.25);
    } else if (pose === 'phone') {
      this.armR.rotation.set(-2.6, 0, 0.5);
    } else if (pose === 'smoke') {
      this.armR.rotation.set(-1.9 + Math.sin(this.phase + performance.now() / 900) * 0.2, 0, 0.4);
    }
  }
}

function poseOf(w: Witness, base: Pose): Pose {
  if (w.compliant > 0) return 'hands-up';
  if (w.callTimer !== null) return 'phone';
  return base;
}

/** Voiture de police : arrive de l'est, gyrophares, puis repart. */
class PoliceCar {
  readonly root = new THREE.Group();
  private readonly red: THREE.PointLight;
  private readonly blue: THREE.PointLight;
  private readonly redBar: THREE.MeshBasicMaterial;
  private readonly blueBar: THREE.MeshBasicMaterial;

  constructor() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 1.9), mat('#e8e8ea'));
    body.position.y = 0.6;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.18, 1.92), mat('#1d3f9a'));
    stripe.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.7), mat('#1c2330'));
    cabin.position.set(-0.2, 1.3, 0);
    this.redBar = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
    this.blueBar = new THREE.MeshBasicMaterial({ color: '#2a5cff' });
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.6), this.redBar);
    r.position.set(-0.2, 1.66, -0.35);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.6), this.blueBar);
    b.position.set(-0.2, 1.66, 0.35);
    this.red = new THREE.PointLight('#ff2a2a', 0, 18, 1.5);
    this.red.position.set(-0.2, 2, -0.6);
    this.blue = new THREE.PointLight('#2a5cff', 0, 18, 1.5);
    this.blue.position.set(-0.2, 2, 0.6);
    for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), mat('#111'));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      this.root.add(wheel);
    }
    this.root.add(body, stripe, cabin, r, b, this.red, this.blue);
  }

  update(progress: number, from: THREE.Vector3, to: THREE.Vector3, time: number): void {
    this.root.visible = progress > 0;
    if (!this.root.visible) {
      this.red.intensity = this.blue.intensity = 0;
      return;
    }
    // Ralentit en arrivant.
    const t = 1 - (1 - progress) * (1 - progress);
    this.root.position.lerpVectors(from, to, t);
    const flash = Math.sin(time * 12) > 0;
    this.red.intensity = flash ? 30 : 0;
    this.blue.intensity = flash ? 0 : 30;
    this.redBar.color.set(flash ? '#ff2a2a' : '#401010');
    this.blueBar.color.set(flash ? '#101840' : '#2a5cff');
  }
}

/** Tous les personnages du monde : employé, passant, Fourgue, police. */
export class ActorView {
  private readonly clerk = new Humanoid('#2f7a4a', '#2a2a33', '#c99a78', '#2f7a4a');
  private readonly pedestrian = new Humanoid('#3b5a8c', '#3d352c', '#a87a5c');
  private readonly fence = new Humanoid('#1d1d22', '#1d1d22', '#8a6a52', '#111');
  private readonly car = new PoliceCar();
  private readonly carFrom: THREE.Vector3;
  private readonly carTo: THREE.Vector3;
  private readonly cigarette: THREE.PointLight;

  constructor(scene: THREE.Scene, level: LevelDef) {
    scene.add(this.clerk.root, this.pedestrian.root, this.fence.root, this.car.root);
    this.carFrom = new THREE.Vector3(level.police.spawn[0], 0, level.police.spawn[1]);
    this.carTo = new THREE.Vector3(level.police.stop[0], 0, level.police.stop[1]);
    this.fence.place({ x: level.fence.pos[0], z: level.fence.pos[1] }, Math.PI / 2, 'idle', 0);
    this.cigarette = new THREE.PointLight('#ff7a2a', 0, 2, 2);
    scene.add(this.cigarette);
  }

  update(world: World, dt: number, time: number): void {
    const c = world.clerk;
    this.clerk.root.visible = c.present;
    const moving = c.mode === 'arriving' || c.mode === 'to-break' || c.mode === 'from-break' || c.mode === 'closing';
    const base = c.mode === 'smoking' ? 'smoke' : moving ? 'walk' : 'idle';
    const frozen = world.clerkWitness.compliant > 0 || world.clerkWitness.callTimer !== null;
    this.clerk.place(c.pos, c.facing, poseOf(world.clerkWitness, frozen ? 'idle' : base), dt);
    this.cigarette.intensity = c.present && c.mode === 'smoking' ? 1.5 + Math.sin(time * 3) * 0.5 : 0;
    this.cigarette.position.set(c.pos.x, 1.55, c.pos.z);

    this.pedestrian.root.visible = world.pedestrianPresent;
    const pw = world.pedestrianWitness;
    this.pedestrian.place(world.pedestrian.pos, world.pedestrian.facing, poseOf(pw, pw.callTimer === null ? 'walk' : 'idle'), dt);

    this.fence.root.visible = world.fencePresent;
    this.car.update(world.police.carProgress(), this.carFrom, this.carTo, time);
  }
}
