import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ItemId } from '../data/types';
import type { World } from '../systems/World';
import { mat } from './LevelView';

/** Charge un modèle glb et le ramène à une hauteur donnée, posé sur son socle et centré. */
export async function loadModel(url: string, height: number, zUp: boolean): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const inner = gltf.scene;
  if (zUp) inner.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(inner);
  const size = bbox.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 1e-6);
  inner.scale.multiplyScalar(scale);
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const center = b2.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -b2.min.y, -center.z);
  return holder;
}

function crowbar(): THREE.Object3D {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.55, 0.035), mat('#b3262b'));
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.12), mat('#b3262b'));
  hook.position.set(0, 0.28, 0.05);
  g.add(shaft, hook);
  g.rotation.set(-0.6, 0, 0.3);
  return g;
}

function cutters(): THREE.Object3D {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), mat('#d14b1f'));
    handle.position.set(side * 0.025, -0.08, 0);
    handle.rotation.z = side * 0.12;
    g.add(handle);
  }
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.025), mat('#777'));
  jaw.position.y = 0.06;
  g.add(jaw);
  g.rotation.set(-0.9, 0, 0.2);
  return g;
}

function pistol(): THREE.Object3D {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.2), mat('#3a3a3c'));
  slide.position.set(0, 0.04, -0.06);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.045), mat('#5a4030'));
  grip.position.set(0, -0.02, 0.02);
  grip.rotation.x = 0.25;
  g.add(slide, grip);
  return g;
}

function mask(): THREE.Object3D {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.16), mat('#141414'));
  g.rotation.set(-0.5, 0.3, 0);
  return g;
}

/**
 * Ce que le joueur tient en main, au premier plan. Le gilet est le modèle 3D fourni ; il trône aussi
 * sur l'étal du Fourgue.
 */
export class Viewmodel {
  readonly root = new THREE.Group();
  private readonly models = new Map<ItemId, THREE.Object3D>();
  private bob = 0;
  private raise = 0;
  private current: ItemId | null = null;
  /** Le gilet exposé sur l'étal du Fourgue. */
  private display: THREE.Object3D | null = null;

  constructor(camera: THREE.Camera, scene: THREE.Scene, fenceTable: THREE.Vector3) {
    camera.add(this.root);
    this.root.position.set(0.28, -0.26, -0.5);
    this.models.set('crowbar', crowbar());
    this.models.set('wire-cutters', cutters());
    this.models.set('pistol', pistol());
    this.models.set('ski-mask', mask());
    for (const m of this.models.values()) {
      m.visible = false;
      this.root.add(m);
    }
    void loadModel('models/plate-carrier.glb', 0.55, false)
      .then((vest) => {
        const display = vest.clone();
        display.position.copy(fenceTable);
        display.rotation.y = -0.6;
        scene.add(display);
        this.display = display;
        const held = vest.clone();
        held.scale.multiplyScalar(0.45);
        held.position.set(-0.05, -0.12, 0);
        held.rotation.y = Math.PI;
        held.visible = false;
        this.root.add(held);
        this.models.set('plate-carrier', held);
        this.current = null;
      })
      .catch((err: unknown) => console.warn('Modèle du gilet introuvable :', err));
  }

  update(world: World, dt: number): void {
    if (this.display) {
      this.display.visible = world.fencePresent && !world.inventory.has('plate-carrier');
      this.display.rotation.y += dt * 0.6;
    }
    const held = world.inventory.held;
    if (held !== this.current) {
      for (const [id, m] of this.models) m.visible = id === held;
      this.current = held;
    }
    const aiming = world.threatening;
    this.raise += ((aiming ? 1 : 0) - this.raise) * Math.min(1, dt * 10);
    this.bob += world.player.moving ? dt * 9 : 0;
    const working = world.action !== null;
    const shake = working && world.action?.crime !== 'sabotage' ? Math.sin(performance.now() / 40) * 0.01 : 0;
    this.root.position.set(
      0.28 - this.raise * 0.28 + Math.sin(this.bob) * 0.012 + shake,
      -0.26 + this.raise * 0.12 + Math.abs(Math.cos(this.bob)) * 0.012 + (working ? 0.06 : 0),
      -0.5 - (working ? 0.1 : 0),
    );
  }
}
