import * as THREE from 'three';
import type { LevelDef, Rect } from '../data/types';
import { daylight } from '../systems/Clock';
import type { World } from '../systems/World';

/** Boîte posée au sol, de `rect` en plan et de hauteur `h`, à partir de l'altitude `y0`. */
export function box(rect: Rect, h: number, material: THREE.Material, y0 = 0): THREE.Mesh {
  const w = rect.max[0] - rect.min[0];
  const d = rect.max[1] - rect.min[1];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set((rect.min[0] + rect.max[0]) / 2, y0 + h / 2, (rect.min[1] + rect.max[1]) / 2);
  return mesh;
}

const mats = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: string): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

/** Texture de bruit légère, pour casser l'aspect uni des grandes surfaces. */
function grainTexture(base: string, spread: number, repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2200; i++) {
      const v = Math.floor(Math.random() * spread);
      g.fillStyle = `rgba(${v},${v},${v},0.08)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(lines: readonly string[], bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = Math.floor(h / (lines.length + 0.6));
    g.font = `bold ${size}px sans-serif`;
    lines.forEach((line, i) => g.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1)));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Le décor : sol, bâtiments, portes, accessoires et éclairage. `update` suit l'heure, le courant et les portes.
 */
export class LevelView {
  private readonly hemi = new THREE.HemisphereLight('#9fb4d8', '#2a2622', 1);
  private readonly sun = new THREE.DirectionalLight('#fff1d6', 1);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly storeLights: THREE.PointLight[] = [];
  private readonly hideoutLight = new THREE.PointLight('#ffb36b', 6, 12, 1.6);
  private readonly frontDoor: THREE.Mesh;
  private readonly backDoor: THREE.Group;
  private readonly cameraLed: THREE.Mesh;
  private readonly cables: THREE.Mesh;
  private readonly storeSign: THREE.MeshBasicMaterial;
  private readonly registerScreen: THREE.MeshBasicMaterial;
  private readonly skyDay = new THREE.Color('#8fb2d9');
  private readonly skyNight = new THREE.Color('#0b1020');
  private readonly sky = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelDef,
  ) {
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(-20, 30, 10);

    this.buildGround();
    for (const w of level.walls) scene.add(box(w.rect, w.height, mat(w.color)));
    this.buildRoofs();

    // Portes.
    const front = level.doors.find((d) => d.id === 'store-front');
    const back = level.doors.find((d) => d.id === 'store-back');
    const glass = new THREE.MeshLambertMaterial({ color: '#9fc4c9', transparent: true, opacity: 0.35 });
    this.frontDoor = box(front?.rect ?? level.store, front?.height ?? 2.4, glass);
    scene.add(this.frontDoor);
    this.backDoor = new THREE.Group();
    if (back) {
      const w = back.rect.max[0] - back.rect.min[0];
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, back.height, 0.08), mat(back.color));
      leaf.position.set(w / 2, back.height / 2, 0);
      this.backDoor.add(leaf);
      this.backDoor.position.set(back.rect.min[0], 0, (back.rect.min[1] + back.rect.max[1]) / 2);
    }
    scene.add(this.backDoor);

    // Supérette : enseigne, caisse, caméra, boîte à fusibles.
    this.storeSign = new THREE.MeshBasicMaterial({ map: signTexture(['SUPÉRETTE LUMIÈRE', '8 h – 22 h'], '#1d3b2a', '#e8f5c8') });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), this.storeSign);
    sign.position.set(8, 2.75, -3.97);
    scene.add(sign);

    const register = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.35), mat('#2b2d31'));
    register.position.set(6, 1.13, -7.8);
    this.registerScreen = new THREE.MeshBasicMaterial({ color: '#57e389' });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), this.registerScreen);
    screen.position.set(0, 0.2, 0.05);
    screen.rotation.x = -0.4;
    register.add(screen);
    scene.add(register);

    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), mat('#a8a8a8'));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(2.9, 0.55, -12.88);
    scene.add(dial);

    this.cameraLed = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
    for (const cam of level.cameras) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.32), mat('#d8d8d0'));
      body.position.set(cam.pos[0], cam.y, cam.pos[1]);
      body.rotation.y = Math.PI / 2 - cam.facing;
      body.rotation.x = 0.35;
      scene.add(body);
      this.cameraLed.position.set(0, 0.04, 0.17);
      body.add(this.cameraLed);
    }

    const fuse = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.15), mat('#7d8389'));
    fuse.position.set(8, 1.5, -14.12);
    scene.add(fuse);
    this.cables = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), mat('#1a1a1a'));
    this.cables.position.set(8, 2.5, -14.09);
    scene.add(this.cables);

    this.buildProps();

    for (const l of level.lamps) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 8), mat('#2c2f33'));
      post.position.set(l[0], 2, l[1]);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
      head.position.set(0, 2, 0);
      post.add(head);
      scene.add(post);
      const light = new THREE.PointLight('#ffcf8a', 0, 16, 1.2);
      light.position.set(l[0], 3.7, l[1]);
      scene.add(light);
      this.lamps.push(light);
    }
    for (const p of [[5, -6.5], [11, -6.5], [8, -12.5]] as const) {
      const light = new THREE.PointLight('#e9f6ff', 0, 10, 1.5);
      light.position.set(p[0], 2.9, p[1]);
      scene.add(light);
      this.storeLights.push(light);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.15), new THREE.MeshBasicMaterial({ color: '#f2fbff' }));
      tube.position.copy(light.position).setY(3.17);
      tube.userData.tube = true;
      scene.add(tube);
      light.userData.tube = tube;
    }
    this.hideoutLight.position.set(-15, 2.7, -9);
    scene.add(this.hideoutLight);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd08a' }));
    bulb.position.copy(this.hideoutLight.position);
    scene.add(bulb);

    scene.fog = new THREE.Fog(this.skyNight, 15, 60);
  }

  private buildGround(): void {
    const b = this.level.bounds;
    const all: Rect = { min: [b.min[0] - 20, b.min[1] - 20], max: [b.max[0] + 20, b.max[1] + 20] };
    const asphalt = new THREE.MeshLambertMaterial({ map: grainTexture('#2c2d30', 255, 30) });
    this.scene.add(box(all, 0.02, asphalt, -0.02));
    const pave = new THREE.MeshLambertMaterial({ map: grainTexture('#6a6862', 255, 12) });
    this.scene.add(box({ min: [b.min[0], -4], max: [b.max[0], -2.4] }, 0.12, pave));
    this.scene.add(box({ min: [b.min[0], 4.2], max: [b.max[0], 6] }, 0.12, pave));
    const gravel = new THREE.MeshLambertMaterial({ map: grainTexture('#3d3a35', 255, 16) });
    this.scene.add(box({ min: [b.min[0], b.min[1]], max: [b.max[0], -14] }, 0.03, gravel));
    // Marquage au sol.
    for (let x = b.min[0] + 2; x < b.max[0]; x += 4) {
      this.scene.add(box({ min: [x, 0.95], max: [x + 2, 1.05] }, 0.01, mat('#c9c3a8'), 0.0));
    }
    this.scene.add(box(this.level.store, 0.02, new THREE.MeshLambertMaterial({ map: grainTexture('#b8b4a6', 120, 6) }), 0.12));
    this.scene.add(box(this.level.hideout, 0.02, new THREE.MeshLambertMaterial({ map: grainTexture('#55524c', 255, 6) }), 0.01));
  }

  private buildRoofs(): void {
    this.scene.add(box(this.level.store, 0.2, mat('#3a3631'), 3.2));
    this.scene.add(box(this.level.hideout, 0.2, mat('#34383c'), 3.0));
  }

  private buildProps(): void {
    const s = this.scene;
    // Marchandises sur les étagères.
    const colors = ['#c94f4f', '#e0b14a', '#4f8ac9', '#6fb35a', '#d9d4c7'];
    let i = 0;
    for (const shelf of [{ x0: 3, x1: 6, z: -5.75 }, { x0: 10, x1: 12.8, z: -5.95 }]) {
      for (let x = shelf.x0 + 0.2; x < shelf.x1 - 0.1; x += 0.35) {
        for (const y of [0.55, 1.05, 1.62]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.3), mat(colors[i++ % colors.length] ?? '#fff'));
          p.position.set(x, y, shelf.z);
          s.add(p);
        }
      }
    }
    // Planque : manteau, oreiller, plan.
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.5), mat('#4a3a2a'));
    coat.position.set(-19.65, 1.3, -6);
    s.add(coat);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4), mat('#c8c2b4'));
    pillow.position.set(-19.2, 0.66, -13.3);
    s.add(pillow);
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ map: signTexture(['PLAN', '· · ·'], '#d8d2bd', '#2a4a8a', 256, 170) }));
    plan.rotation.x = -Math.PI / 2;
    plan.position.set(-12.2, 0.91, -8.4);
    s.add(plan);
    // Ruelle : couvercle de benne, caisses du Fourgue.
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.3), mat('#24392a'));
    lid.position.set(17.2, 1.35, -16.4);
    lid.rotation.x = -0.25;
    s.add(lid);
    for (const [x, z] of [[-6, -18.4], [-6.3, -17.7]] as const) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), mat('#6b5236'));
      crate.position.set(x, 0.3, z);
      s.add(crate);
    }
    // Vitrine de la supérette, éclairée de l'intérieur.
    const shopWindow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.4), new THREE.MeshBasicMaterial({ color: '#f3e6b0', transparent: true, opacity: 0.25 }));
    shopWindow.position.set(4.5, 1.5, -3.97);
    s.add(shopWindow);
  }

  update(world: World, time: number): void {
    const hour = world.clock.hour;
    const day = daylight(hour);
    this.sky.copy(this.skyNight).lerp(this.skyDay, day);
    this.scene.background = this.sky;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.sky);
    this.hemi.intensity = 0.25 + day * 1.4;
    this.sun.intensity = day * 1.6;
    this.sun.color.set(day < 0.6 ? '#ffb27a' : '#fff1d6');

    const night = 1 - day;
    for (const l of this.lamps) l.intensity = night * 60;
    // La boutique est éclairée quand elle a du courant : tout le jour, et en veilleuse la nuit.
    const storeLit = world.powered ? (world.storeOpen ? 30 : 8) : 0;
    for (const l of this.storeLights) {
      l.intensity = storeLit;
      const tube = l.userData.tube as THREE.Mesh | undefined;
      if (tube) tube.visible = storeLit > 0;
    }
    this.hideoutLight.intensity = 25 + night * 15;
    this.storeSign.color.set(world.powered ? '#ffffff' : '#333333');
    this.registerScreen.color.set(world.powered ? '#57e389' : '#111111');
    this.cameraLed.visible = world.powered && Math.sin(time * 4) > -0.2;
    this.cables.material = world.powered ? mat('#1a1a1a') : mat('#7a3b1d');

    this.frontDoor.visible = !world.doorOpen('store-front');
    this.backDoor.rotation.y = world.doorOpen('store-back') ? -1.6 : 0;
  }
}
