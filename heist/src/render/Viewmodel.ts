import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ItemId } from '../data/types';
import type { World } from '../systems/World';
import { put } from './build';
import { makeArms, makeCrowbar, makeCutters, makeDrill, makeLockpicks, makeMask, makePistol, type FpsArms } from './models/items';

/** Charge un modèle glb et le ramène à une hauteur donnée, posé sur son socle et centré. */
export async function loadModel(url: string, height: number, zUp: boolean): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const inner = gltf.scene;
  if (zUp) inner.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  inner.scale.multiplyScalar(height / Math.max(size.y, 1e-6));
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const center = b2.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -b2.min.y, -center.z);
  return holder;
}

/** Comment l'objet est tenu : position et orientation dans la main droite. */
const GRIP: Record<ItemId, { pos: [number, number, number]; rot: [number, number, number]; scale: number }> = {
  pistol: { pos: [0, -0.01, 0.07], rot: [0, 0, 0], scale: 1 },
  crowbar: { pos: [0, -0.01, 0.08], rot: [1.25, 0, 0], scale: 1 },
  'wire-cutters': { pos: [0, -0.01, 0.08], rot: [1.3, 0, 0], scale: 1 },
  lockpicks: { pos: [0, 0.02, 0.1], rot: [1.0, 0, 0.3], scale: 1 },
  drill: { pos: [0.02, 0.05, 0.12], rot: [0, 0, 0], scale: 0.8 },
  'ski-mask': { pos: [0, 0.03, 0.11], rot: [0.2, 0.3, 0], scale: 1 },
  'plate-carrier': { pos: [-0.05, -0.05, 0.15], rot: [0, Math.PI, 0], scale: 0.4 },
  'duffel-bag': { pos: [0, 0, 0.1], rot: [0, 0, 0], scale: 0.4 },
};

/**
 * Les bras et l'objet tenu, à la première personne : balancement de marche, visée épaulée, recul,
 * coup de pied-de-biche, rechargement, mains au travail pendant les actions maintenues.
 */
export class Viewmodel {
  readonly root = new THREE.Group();
  private readonly arms: FpsArms;
  private readonly models = new Map<ItemId, THREE.Object3D>();
  private current: ItemId | null = null;
  private bob = 0;
  private ads = 0;
  private recoil = 0;
  private swing = 0;
  private reload = 0;
  private draw = 1;
  private work = 0;
  private sway = new THREE.Vector2();
  private lastFacing = 0;
  private lastPitch = 0;
  /** Bout du canon, en coordonnées du monde (pour l'éclair). */
  readonly muzzle = new THREE.Object3D();

  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.arms = makeArms('#2b2d33');
    this.root.add(this.arms.root);
    const make: [ItemId, () => THREE.Object3D][] = [
      ['pistol', makePistol],
      ['crowbar', makeCrowbar],
      ['wire-cutters', makeCutters],
      ['lockpicks', makeLockpicks],
      ['drill', makeDrill],
      ['ski-mask', makeMask],
    ];
    for (const [id, fn] of make) this.addModel(id, fn());
    void loadModel('models/plate-carrier.glb', 0.55, false)
      .then((vest) => {
        this.addModel('plate-carrier', vest);
        this.current = null;
      })
      .catch(() => undefined);
    const pistol = this.models.get('pistol');
    if (pistol) {
      put(this.muzzle, 0, 0.03, 0.14);
      pistol.add(this.muzzle);
    }
    // Rendus par-dessus le décor : pas de bras qui traversent les murs.
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.renderOrder = 10;
        const m = o.material as THREE.Material;
        m.depthTest = true;
      }
    });
  }

  private addModel(id: ItemId, model: THREE.Object3D): void {
    const g = GRIP[id];
    const holder = new THREE.Group();
    holder.add(model);
    put(model, g.pos[0], g.pos[1], g.pos[2], g.rot[0], g.rot[1], g.rot[2]);
    model.scale.setScalar(g.scale);
    holder.visible = false;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    this.arms.rightHand.add(holder);
    this.models.set(id, holder);
  }

  kick(): void {
    this.recoil = 1;
  }

  strike(): void {
    this.swing = 1;
  }

  startReload(): void {
    this.reload = 1;
  }

  /** Le joueur vise (clic droit) : la caméra resserre son champ. */
  get aimFactor(): number {
    return this.ads;
  }

  update(world: World, dt: number, time: number): void {
    const held = world.inventory.held;
    if (held !== this.current) {
      for (const [id, m] of this.models) m.visible = id === held;
      this.current = held;
      this.draw = 1;
    }
    const working = world.action !== null;
    const hasItem = held !== null;
    this.arms.root.visible = hasItem || working;
    this.arms.left.visible = held === 'pistol' || held === 'drill' || working || held === 'crowbar';

    const p = world.player;
    const aiming = world.aiming && held === 'pistol' && world.reloadTimer <= 0;
    this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    this.bob += p.moving ? dt * (p.sprinting ? 13 : p.crouching ? 6 : 9.5) : 0;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.reload = Math.max(0, this.reload - dt / 1.4);
    this.draw = Math.max(0, this.draw - dt * 4);
    this.work += ((working ? 1 : 0) - this.work) * Math.min(1, dt * 8);

    // Inertie du regard : l'arme traîne légèrement derrière les mouvements de souris.
    const df = p.facing - this.lastFacing;
    const dp = p.pitch - this.lastPitch;
    this.lastFacing = p.facing;
    this.lastPitch = p.pitch;
    this.sway.x += (Math.max(-0.06, Math.min(0.06, -df * 0.6)) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (Math.max(-0.06, Math.min(0.06, dp * 0.6)) - this.sway.y) * Math.min(1, dt * 10);

    const amp = (p.sprinting ? 1.8 : 1) * (1 - this.ads * 0.85);
    const bobX = Math.sin(this.bob) * 0.012 * amp;
    const bobY = -Math.abs(Math.cos(this.bob)) * 0.014 * amp;
    const breathe = Math.sin(time * 1.4) * 0.003;
    const sprintTuck = p.sprinting ? 1 : 0;

    // Position de repos, et position épaulée (arme centrée sous l'œil).
    const rest = new THREE.Vector3(0.2, -0.24, -0.38);
    const adsPos = new THREE.Vector3(0.0, -0.095, -0.46);
    const pos = rest.lerp(adsPos, this.ads);
    pos.x += bobX + this.sway.x;
    pos.y += bobY + breathe + this.sway.y - this.draw * 0.25 - this.reload * Math.sin(this.reload * Math.PI) * 0.12 - sprintTuck * 0.05;
    pos.z += this.recoil * 0.06 - this.work * 0.08;
    if (working) {
      pos.x += Math.sin(time * 18) * 0.006;
      pos.y += Math.cos(time * 23) * 0.006 + 0.04;
    }
    this.root.position.copy(pos);
    this.root.rotation.set(
      this.recoil * 0.22 + this.draw * 0.6 + this.reload * 0.5 - this.swing * 0.3,
      sprintTuck * 0.5 + this.swing * 0.8 * Math.sin(this.swing * Math.PI),
      -this.swing * 1.4 * Math.sin(this.swing * Math.PI) + sprintTuck * 0.2,
    );

    // Bras : droit tenant l'objet ; gauche en soutien (deux mains sur le pistolet).
    const right = this.arms.right;
    const left = this.arms.left;
    // L'avant-bras descend vers le bas de l'écran ; le poignet compense pour que l'objet reste dans l'axe.
    const tilt = 0.5 + 0.35 * this.ads;
    right.position.set(0, 0, 0);
    right.rotation.set(tilt, 0.12 * (1 - this.ads), 0);
    this.arms.rightHand.rotation.set(-tilt + 0.22 * (1 - this.ads), Math.PI, 0);
    if (held === 'pistol' || held === null) {
      // Main gauche en soutien sous la poignée ; en visée, l'avant-bras plonge avec le droit.
      left.position.set(-0.05 + this.ads * 0.02, -0.035 - this.ads * 0.02, 0.02);
      left.rotation.set(0.3 + this.ads * (tilt - 0.2), -0.55 + this.ads * 0.25, -0.35);
    } else if (held === 'crowbar' || held === 'drill') {
      left.position.set(-0.17, -0.03, -0.06);
      left.rotation.set(0.3, -0.25, -0.1);
    } else {
      left.position.set(-0.24, -0.08, 0.02);
      left.rotation.set(0.3, -0.2, 0);
    }
    if (working) {
      left.position.set(-0.14, 0.0, -0.1);
      left.rotation.set(0.2, -0.3, -0.25);
    }
    this.root.updateMatrixWorld(true);
  }
}
