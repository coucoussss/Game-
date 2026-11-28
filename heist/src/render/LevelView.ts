import * as THREE from 'three';
import { propRect } from '../data';
import type { DoorDef, GameData } from '../data/types';
import { daylight } from '../systems/Clock';
import type { Point } from '../systems/geometry';
import type { World } from '../systems/World';
import { box, chrome, flat, glass, metalDark, put, rbox, shadows, surface } from './build';
import { CityView, Sky, type LightSource } from './CityView';
import { Human, lookFor } from './models/human';
import { makeDrill } from './models/items';
import { cashPallet, makeCamera, makeDisplayCase, makeFuseBox, makeSafe, makeVaultDoor } from './models/props';
import { glowTexture } from './textures';
import { loadModel, VEST_URLS } from './Viewmodel';

/** Nombre de lumières ponctuelles réellement calculées : on les attribue aux sources les plus utiles. */
const POOL = 10;

interface DoorView {
  readonly def: DoorDef;
  readonly pivot: THREE.Object3D;
  readonly openAngle: number;
  /** Les portes vitrées coulissent au lieu de pivoter. */
  readonly sliding: boolean;
  angle: number;
}

interface LinkedView {
  readonly container: string;
  readonly update: (amount: number, dt: number) => void;
}

/**
 * La partie vivante du décor : ciel et soleil, ombres, réserve de lumières, portes, caméras, boîtiers
 * électriques, coffres, vitrines, chambre forte, le Fourgue et son étal.
 */
export class LevelView {
  readonly city: CityView;
  /** Sources éphémères (gyrophares, coups de feu) ajoutées par les autres vues avant chaque `update`. */
  readonly transient: LightSource[] = [];
  private readonly sky: Sky;
  private readonly hemi = new THREE.HemisphereLight('#9fb4d8', '#2a2622', 1);
  private readonly sun = new THREE.DirectionalLight('#fff1d6', 1);
  private readonly pool: THREE.PointLight[] = [];
  private readonly glows: { sprite: THREE.Sprite; source: LightSource }[] = [];
  private readonly doors: DoorView[] = [];
  private readonly cameras: { site: string; led: THREE.Mesh }[] = [];
  private readonly fuses: { site: string; parts: ReturnType<typeof makeFuseBox>; door: number }[] = [];
  private readonly linked: LinkedView[] = [];
  private readonly cases: { pos: Point; container: string; glass: THREE.Group; broken: boolean }[] = [];
  private vault: { door: THREE.Group; drill: THREE.Object3D; base: THREE.Vector3; angle: number; site: string } | null = null;
  private readonly fence: Human;
  private vest: THREE.Object3D | null = null;
  private readonly fenceLight: LightSource;
  private readonly tmp = new THREE.Vector3();
  private readonly top = new THREE.Color();
  private readonly horizon = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly data: GameData,
  ) {
    const level = data.level;
    this.city = new CityView(scene, level, data.propKinds);
    this.sky = new Sky(scene);
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -34;
    cam.right = cam.top = 34;
    cam.near = 1;
    cam.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.fog = new THREE.Fog('#141a2a', 30, 150);

    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 10, 2);
      scene.add(l);
      this.pool.push(l);
    }
    const glowMap = glowTexture();
    for (const source of this.city.handles.lights) {
      if (source.tag !== 'street' && source.tag !== 'alley') continue;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: source.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sprite.position.copy(source.pos);
      sprite.scale.setScalar(source.tag === 'street' ? 2.6 : 1.4);
      scene.add(sprite);
      this.glows.push({ sprite, source });
    }

    for (const d of level.doors) this.buildDoor(d);
    for (const c of level.cameras) {
      const m = makeCamera();
      put(m.root, c.pos[0], c.y, c.pos[1], 0, Math.PI / 2 - c.facing, 0);
      m.head.rotation.x = 0.4;
      // Le support est fixé au mur : on recule le boîtier vers lui.
      m.root.translateZ(-0.12);
      shadows(m.root);
      scene.add(m.root);
      this.cameras.push({ site: c.site, led: m.led });
    }
    for (const it of level.interactables) {
      if (it.kind !== 'fuse-box' || !it.site) continue;
      const parts = makeFuseBox();
      put(parts.root, it.pos[0], it.y, it.pos[1], 0, Math.PI, 0);
      parts.root.translateZ(-0.06);
      shadows(parts.root);
      scene.add(parts.root);
      this.fuses.push({ site: it.site, parts, door: 0 });
    }
    this.buildDynamicProps();

    // Le Fourgue, son étal, sa lanterne, et le gilet en vitrine.
    const f = level.fence;
    this.fence = new Human(lookFor('fence'));
    this.fence.update(0, f.pos[0], f.pos[1], f.facing, 'idle');
    scene.add(this.fence.root);
    this.fenceLight = { pos: new THREE.Vector3(f.pos[0] + 0.85, 1.1, f.pos[1] + 0.65), color: new THREE.Color('#ffb040'), range: 9, power: 10, level: 0, tag: 'fence' };
    this.city.handles.lights.push(this.fenceLight);
    void loadModel(VEST_URLS, 0.55, false)
      .then((vest) => {
        put(vest, f.pos[0] - 0.4, 0.86, f.pos[1] + 0.9, 0, -0.5, 0);
        shadows(vest);
        scene.add(vest);
        this.vest = vest;
      })
      .catch((err: unknown) => console.warn('Modèle du gilet introuvable :', err));
  }

  private buildDoor(d: DoorDef): void {
    const len = d.alongX ? d.rect.max[0] - d.rect.min[0] : d.rect.max[1] - d.rect.min[1];
    const cx = (d.rect.min[0] + d.rect.max[0]) / 2;
    const cz = (d.rect.min[1] + d.rect.max[1]) / 2;
    if (d.role === 'vault') {
      const v = makeVaultDoor(len);
      put(v.root, cx, 0, cz, 0, d.alongX ? 0 : Math.PI / 2, 0);
      shadows(v.root);
      this.scene.add(v.root);
      const drill = makeDrill();
      drill.scale.setScalar(1.6);
      put(drill, cx, 1.15, cz + 0.62, 0, Math.PI, 0);
      drill.visible = false;
      this.scene.add(drill);
      this.vault = { door: v.door, drill, base: drill.position.clone(), angle: 0, site: d.site ?? 'bank' };
      return;
    }
    const height = d.role === 'front' ? 2.45 : d.role === 'back' ? 2.15 : 2.15;
    const leaf = new THREE.Group();
    const w = len - 0.04;
    if (d.role === 'front') {
      // Porte vitrée à cadre chromé, poignée bâton, autocollants d'horaires.
      leaf.add(put(box(w, height, 0.03, glass('#cfe6ec', 0.22)), w / 2, height / 2, 0));
      for (const x of [0.03, w - 0.03]) leaf.add(put(box(0.06, height, 0.05, chrome()), x, height / 2, 0));
      for (const y of [0.04, height - 0.04]) leaf.add(put(box(w, 0.08, 0.05, chrome()), w / 2, y, 0));
      leaf.add(put(box(w, 0.3, 0.05, chrome()), w / 2, 0.15, 0));
      for (const s of [-1, 1]) leaf.add(put(box(0.03, 0.9, 0.03, chrome()), w - 0.18, 1.1, s * 0.06));
      leaf.add(put(box(0.5, 0.18, 0.002, flat('#ffffff', { rough: 0.6 })), w / 2, 1.5, 0.017));
    } else if (d.role === 'back') {
      const steelMat = surface('metal', '#59606a');
      leaf.add(put(box(w, height, 0.06, steelMat), w / 2, height / 2, 0));
      for (const s of [-1, 1]) {
        leaf.add(put(box(w * 0.75, 0.06, 0.06, flat('#c0392b', { rough: 0.4, metal: 0.4 })), w / 2, 1.0, s * 0.06));
        leaf.add(put(box(0.08, 0.12, 0.05, metalDark()), w * 0.12, 1.0, s * 0.05));
      }
      leaf.add(put(rbox(0.1, 0.2, 0.04, 0.01, flat('#d8d8d0')), w - 0.12, 2.0, 0.05));
    } else {
      const woodMat = surface('wood', '#5a3d27');
      leaf.add(put(box(w, height, 0.05, woodMat), w / 2, height / 2, 0));
      for (const y of [0.55, 1.5]) leaf.add(put(box(w - 0.2, 0.7, 0.06, surface('wood', '#4a3020')), w / 2, y, 0));
      for (const s of [-1, 1]) leaf.add(put(box(0.12, 0.02, 0.04, chrome()), w - 0.12, 1.0, s * 0.04));
      leaf.add(put(box(0.06, 0.06, 0.07, flat('#111')), w - 0.12, 1.15, 0));
    }
    shadows(leaf);
    const pivot = new THREE.Group();
    pivot.add(leaf);
    put(pivot, d.alongX ? d.rect.min[0] + 0.02 : cx, 0.01, d.alongX ? cz : d.rect.min[1] + 0.02, 0, d.alongX ? 0 : -Math.PI / 2, 0);
    this.scene.add(pivot);
    // La porte s'ouvre vers l'intérieur du bâtiment qui la contient.
    const building = this.data.level.buildings.find(
      (b) => cx >= b.rect.min[0] - 0.01 && cx <= b.rect.max[0] + 0.01 && cz >= b.rect.min[1] - 0.01 && cz <= b.rect.max[1] + 0.01 && !b.solid,
    );
    const center = building ? (d.alongX ? (building.rect.min[1] + building.rect.max[1]) / 2 : (building.rect.min[0] + building.rect.max[0]) / 2) : 0;
    const here = d.alongX ? cz : cx;
    const openAngle = (here > center ? 1 : -1) * 1.55;
    this.doors.push({ def: d, pivot, openAngle, sliding: d.role === 'front', angle: 0 });
  }

  /** Coffres, vitrines et palette de billets : leur aspect suit le contenu du contenant le plus proche. */
  private buildDynamicProps(): void {
    const level = this.data.level;
    const nearestContainer = (x: number, z: number): string | null => {
      let best: string | null = null;
      let bestD = 1.6;
      for (const it of level.interactables) {
        if (it.kind !== 'container') continue;
        const d = Math.hypot(it.pos[0] - x, it.pos[1] - z);
        if (d < bestD) {
          bestD = d;
          best = it.id;
        }
      }
      return best;
    };
    for (const p of level.props) {
      const kind = this.data.propKinds.get(p.type);
      if (!kind) continue;
      const r = propRect(p.pos, kind, p.rot);
      const x = (r.min[0] + r.max[0]) / 2;
      const z = (r.min[1] + r.max[1]) / 2;
      const container = nearestContainer(p.pos[0], p.pos[1]);
      if (p.type === 'safe') {
        const s = makeSafe(p.variant ?? 0);
        put(s.root, x, 0, z, 0, (-(p.rot ?? 0) * Math.PI) / 2, 0);
        shadows(s.root);
        this.scene.add(s.root);
        let angle = 0;
        if (container) {
          this.linked.push({
            container,
            update: (amount, dt) => {
              angle += ((amount > 0 ? 0 : -1.9) - angle) * Math.min(1, dt * 3);
              s.door.rotation.y = angle;
            },
          });
        }
      } else if (p.type === 'display-case') {
        const c = makeDisplayCase();
        put(c.root, x, 0, z);
        shadows(c.root);
        this.scene.add(c.root);
        if (container) {
          this.linked.push({ container, update: (amount) => (c.jewels.visible = amount > 0) });
          this.cases.push({ pos: { x, z }, container, glass: c.glass, broken: false });
        }
      } else if (p.type === 'cash-pallet') {
        const base = put(box(1.2, 0.12, 0.9, surface('wood', '#9a7a54')), x, 0.06, z);
        const full = put(cashPallet(), x, 0, z);
        shadows(full);
        this.scene.add(base, full);
        if (container) this.linked.push({ container, update: (amount) => (full.visible = amount > 0) });
      }
    }
  }

  /** Une vitrine vient d'être brisée : on retire sa cloche de verre. */
  shatter(pos: Point): THREE.Vector3 | null {
    let best: (typeof this.cases)[number] | null = null;
    let bestD = 2;
    for (const c of this.cases) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bestD && !c.broken) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return null;
    best.broken = true;
    best.glass.visible = false;
    return new THREE.Vector3(best.pos.x, 1.05, best.pos.z);
  }

  /** Les vitrines brisées sont remplacées au matin. */
  repairCases(): void {
    for (const c of this.cases) {
      c.broken = false;
      c.glass.visible = true;
    }
  }

  update(world: World, camera: THREE.Camera, dt: number, time: number): void {
    const hour = world.clock.hour;
    const day = daylight(hour);
    const night = 1 - day;

    // Ciel : dégradé jour / crépuscule / nuit.
    const dusk = Math.max(0, 1 - Math.abs(hour - 19.8) / 1.6) + Math.max(0, 1 - Math.abs(hour - 6.8) / 1.3);
    this.top.set('#060912').lerp(new THREE.Color('#3a6cb4'), day);
    this.horizon.set('#141b2c').lerp(new THREE.Color('#b3cde6'), day).lerp(new THREE.Color('#e8905a'), Math.min(0.75, dusk * 0.8));
    this.sky.uniforms.top.value.copy(this.top);
    this.sky.uniforms.horizon.value.copy(this.horizon);
    this.sky.uniforms.night.value = night;
    const a = ((hour - 6) / 14) * Math.PI;
    const sunDir = this.tmp.set(Math.cos(a) * 0.85, Math.sin(a), 0.45).normalize();
    this.sky.uniforms.sunDir.value.copy(sunDir);
    const moonA = (((hour + 12) % 24) - 6) / 14 * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(moonA) * 0.7, Math.max(0.25, Math.sin(moonA)), -0.5).normalize();
    this.sky.uniforms.moonDir.value.copy(moonDir);
    this.sky.uniforms.sunColor.value.set(dusk > 0.3 ? '#ffb070' : '#fff2d0');
    this.sky.mesh.position.copy(camera.position);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.horizon).multiplyScalar(0.85);
      this.scene.fog.near = 25 + day * 20;
      this.scene.fog.far = 110 + day * 90;
    }

    // Soleil le jour, lune la nuit : une seule lumière directionnelle, avec ombres autour du joueur.
    const useSun = day > 0.12 && sunDir.y > 0.05;
    const dir = useSun ? sunDir : moonDir;
    this.sun.intensity = useSun ? 0.4 + day * 2.4 : 0.32;
    this.sun.color.set(useSun ? (dusk > 0.3 ? '#ffb27a' : '#fff1d6') : '#9fb4e8');
    const p = world.player.pos;
    // Ancrage au pas de la carte d'ombre, pour qu'elles ne scintillent pas en marchant.
    const snap = 68 / 2048;
    const sx = Math.round(p.x / snap) * snap;
    const sz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + dir.x * 60, dir.y * 60, sz + dir.z * 60);
    this.hemi.color.copy(this.top).lerp(new THREE.Color('#ffffff'), 0.3);
    this.hemi.groundColor.set('#2a2622');
    this.hemi.intensity = 0.28 + day * 0.85;

    // Niveaux des sources de lumière.
    const lights = this.city.handles.lights;
    for (const s of lights) {
      if (s.tag === 'street' || s.tag === 'alley') s.level = Math.min(1, night * 1.4);
      else if (s.tag === 'hideout') s.level = 1;
      else if (s.tag === 'fence') s.level = world.fencePresent ? 1 : 0;
      else {
        const site = world.site(s.tag);
        s.level = !site || !site.powered ? 0 : world.siteOpen(site) ? 1 : 0.28;
      }
    }
    for (const m of this.city.handles.nightGlow) m.emissiveIntensity = night * (m === this.city.handles.nightGlow[2] ? 2.5 : 1.2);
    this.city.handles.skyline.emissiveIntensity = night * 0.45;
    for (const [id, mats] of this.city.handles.sitePower) {
      const site = world.site(id);
      const on = !site || site.powered;
      const lvl = !on ? 0 : site && !world.siteOpen(site) ? 0.35 : 1;
      for (const m of mats) m.emissiveIntensity = lvl * (m.map ? 0.7 : 1.6);
    }
    this.assignLights(camera.position);
    for (const g of this.glows) {
      const lvl = g.source.level;
      g.sprite.visible = lvl > 0.02;
      (g.sprite.material as THREE.SpriteMaterial).opacity = lvl * 0.85;
    }

    // Portes.
    for (const d of this.doors) {
      const target = world.doorOpen(d.def.id) ? d.openAngle : 0;
      d.angle += (target - d.angle) * Math.min(1, dt * 7);
      const leaf = d.pivot.children[0];
      if (!leaf) continue;
      if (d.sliding) {
        // Glisse le long du mur, côté intérieur, jusqu'à dégager le passage.
        const t = Math.abs(d.angle) / 1.55;
        leaf.position.set(-t * (d.def.alongX ? d.def.rect.max[0] - d.def.rect.min[0] : d.def.rect.max[1] - d.def.rect.min[1]) * 0.96, 0, -0.12 * Math.sign(d.openAngle) * Math.min(1, t * 4));
      } else leaf.rotation.set(0, d.angle, 0);
    }
    if (this.vault) {
      const site = world.site(this.vault.site);
      const target = site?.vaultOpen ? -1.75 : 0;
      this.vault.angle += (target - this.vault.angle) * Math.min(1, dt * 0.6);
      this.vault.door.rotation.y = this.vault.angle;
      const drilling = site?.drill !== null && site?.drill !== undefined;
      this.vault.drill.visible = drilling;
      // La perceuse vibre contre l'acier.
      if (drilling) this.vault.drill.position.set(this.vault.base.x + Math.sin(time * 90) * 0.004, this.vault.base.y + Math.cos(time * 77) * 0.004, this.vault.base.z);
    }
    for (const c of this.cameras) c.led.visible = (world.site(c.site)?.powered ?? false) && Math.sin(time * 4) > -0.3;
    for (const f of this.fuses) {
      const site = world.site(f.site);
      if (!site) continue;
      const open = site.fuseUnlocked || !site.def.lockedFuseBox || !site.powered;
      f.door += ((open ? -1.9 : 0) - f.door) * Math.min(1, dt * 5);
      f.parts.door.rotation.y = f.door;
      f.parts.padlock.visible = site.def.lockedFuseBox && !site.fuseUnlocked;
      f.parts.cables.visible = site.powered;
      f.parts.cut.visible = !site.powered;
    }
    for (const l of this.linked) l.update(world.containers.get(l.container)?.amount ?? 0, dt);

    // Le Fourgue.
    const present = world.fencePresent;
    this.fence.root.visible = present;
    const f = this.data.level.fence;
    if (present) {
      const pl = world.player.pos;
      const d = Math.hypot(pl.x - f.pos[0], pl.z - f.pos[1]);
      this.fence.gaze = d < 8 ? new THREE.Vector3(pl.x, world.eyeHeight(), pl.z) : null;
      this.fence.setDetail(d < 16);
      this.fence.update(dt, f.pos[0], f.pos[1], f.facing, 'idle');
    }
    if (this.vest) {
      this.vest.visible = present && !world.inventory.has('plate-carrier');
      this.vest.rotation.y += dt * 0.5;
    }
  }

  /** Attribue la réserve de lumières aux sources qui comptent le plus pour la caméra. */
  private assignLights(cam: THREE.Vector3): void {
    const candidates: { s: LightSource; score: number }[] = [];
    for (const list of [this.city.handles.lights, this.transient]) {
      for (const s of list) {
        if (s.level <= 0.01) continue;
        const d = s.pos.distanceTo(cam);
        if (d > s.range + 45) continue;
        candidates.push({ s, score: (s.power * s.level) / (1 + d * d * 0.015) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (let i = 0; i < POOL; i++) {
      const l = this.pool[i];
      const c = candidates[i];
      if (!l) continue;
      if (!c) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(c.s.pos);
      l.color.copy(c.s.color);
      l.distance = c.s.range;
      l.intensity = c.s.power * c.s.level;
    }
    this.transient.length = 0;
  }
}
