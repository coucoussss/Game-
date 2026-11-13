import * as THREE from 'three';
import { ball, box, capsule, chrome, cyl, flat, group, mesh, metalDark, put, rbox, shadows, surface } from '../build';
import { signTexture } from '../textures';
import { makePistol } from './items';

/** Personnage articulé, modelé par code : squelette d'objets, vêtements selon le métier, poses animées. */

export type HairStyle = 'short' | 'bald' | 'long' | 'bun' | 'cap' | 'beanie' | 'hood' | 'officer-cap';
export type Extra =
  | 'apron' | 'tie' | 'badge' | 'belt' | 'holster' | 'radio' | 'vest' | 'glasses' | 'beard'
  | 'chain' | 'bag' | 'hivis' | 'skirt' | 'jacket' | 'flashlight' | 'nametag';

export interface Look {
  readonly skin: string;
  readonly hair: string;
  readonly hairStyle: HairStyle;
  readonly top: string;
  readonly pants: string;
  readonly shoes: string;
  readonly hat?: string;
  readonly shortSleeves?: boolean;
  readonly gloves?: string;
  readonly extras: readonly Extra[];
  /** Taille relative (1 = 1,78 m) et carrure. */
  readonly height: number;
  readonly build: number;
}

const SKINS = ['#e0b592', '#c68e6a', '#8d5b3e', '#f0c9a8', '#a8724f', '#5e3b28'];
const HAIRS = ['#2a1d14', '#0f0d0c', '#6b4a2b', '#b08a4a', '#8c8c8c', '#3b2412'];

/** Apparence d'un personnage selon son rôle. `variant` fait varier les passants et les policiers. */
export function lookFor(role: string, variant = 0): Look {
  const skin = SKINS[(variant * 7 + role.length) % SKINS.length] ?? '#e0b592';
  const hair = HAIRS[(variant * 5 + role.length * 3) % HAIRS.length] ?? '#2a1d14';
  switch (role) {
    case 'clerk':
      return { skin: '#d9a982', hair: '#3b2412', hairStyle: 'cap', hat: '#1f6b3c', top: '#e8e4d8', pants: '#2b2f3a', shoes: '#1a1a1a', shortSleeves: true, extras: ['apron', 'nametag'], height: 0.98, build: 0.95 };
    case 'jeweler':
      return { skin: '#e6c1a3', hair: '#8c8c8c', hairStyle: 'short', top: '#23262e', pants: '#23262e', shoes: '#0f0f10', extras: ['jacket', 'tie', 'glasses'], height: 0.97, build: 0.92 };
    case 'teller':
      return { skin, hair, hairStyle: variant % 2 === 0 ? 'bun' : 'short', top: '#dfe6ee', pants: '#2c3344', shoes: '#15151a', extras: variant % 2 === 0 ? ['nametag', 'skirt'] : ['tie', 'nametag'], height: 0.95 + (variant % 3) * 0.03, build: 0.9 };
    case 'guard':
      return { skin, hair, hairStyle: 'cap', hat: '#1b2233', top: '#27304a', pants: '#1b2233', shoes: '#0d0d0f', extras: ['belt', 'holster', 'radio', 'badge'], height: 1.03, build: 1.12 };
    case 'watchman':
      return { skin: '#b98060', hair: '#0f0d0c', hairStyle: 'beanie', hat: '#1c1c20', top: '#2b2b30', pants: '#1c1c20', shoes: '#0d0d0f', gloves: '#111111', extras: ['belt', 'holster', 'radio', 'hivis', 'flashlight'], height: 1.02, build: 1.15 };
    case 'officer':
      return { skin, hair, hairStyle: 'officer-cap', hat: '#16203a', top: '#2a4b8d', pants: '#16203a', shoes: '#0b0b0d', extras: ['belt', 'holster', 'radio', 'vest', 'badge'], height: 1 + (variant % 3) * 0.02, build: 1.08 };
    case 'fence':
      return { skin: '#8d5b3e', hair: '#0f0d0c', hairStyle: 'hood', hat: '#17171b', top: '#17171b', pants: '#26262b', shoes: '#e8e8e8', gloves: '#2a2a2a', extras: ['beard', 'chain'], height: 1.01, build: 1.1 };
    default: {
      const tops = ['#7a3b3b', '#3b5a8c', '#5d6b3a', '#c9b27a', '#6a4a7a', '#2f6f73', '#b5553c'];
      const pants = ['#2c3344', '#3d352c', '#1f2126', '#4a4d57', '#5a4a3a'];
      const styles: HairStyle[] = ['short', 'long', 'bun', 'beanie', 'bald', 'short'];
      const extras: Extra[][] = [['jacket', 'bag'], ['bag'], ['skirt', 'bag'], ['jacket'], ['glasses'], ['jacket', 'glasses']];
      return {
        skin,
        hair,
        hairStyle: styles[variant % styles.length] ?? 'short',
        hat: tops[(variant + 3) % tops.length],
        top: tops[variant % tops.length] ?? '#3b5a8c',
        pants: pants[variant % pants.length] ?? '#2c3344',
        shoes: variant % 2 === 0 ? '#2a2019' : '#d8d8d8',
        shortSleeves: variant % 3 === 1,
        extras: extras[variant % extras.length] ?? [],
        height: 0.93 + ((variant * 37) % 10) * 0.012,
        build: 0.88 + ((variant * 53) % 10) * 0.025,
      };
    }
  }
}

export type PoseName = 'idle' | 'walk' | 'run' | 'hands-up' | 'phone' | 'smoke' | 'aim' | 'cower' | 'down' | 'search';

type Joint =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'armL' | 'elbowL' | 'wristL' | 'armR' | 'elbowR' | 'wristR'
  | 'legL' | 'kneeL' | 'footL' | 'legR' | 'kneeR' | 'footR';

type Pose = Partial<Record<Joint, readonly [number, number, number]>>;

const THIGH = 0.44;
const SHIN = 0.43;
const FOOT = 0.09;
const HIP_Y = THIGH + SHIN + FOOT;

export class Human {
  readonly root = new THREE.Group();
  /** Tout le corps : c'est lui qui bascule quand le personnage tombe. */
  private readonly body = new THREE.Group();
  private readonly joints = {} as Record<Joint, THREE.Group>;
  private readonly pistol: THREE.Object3D;
  private readonly phone: THREE.Object3D;
  private readonly cigarette: THREE.Object3D;
  private readonly beam: THREE.Object3D | null = null;
  private phase = Math.random() * 6;
  private time = Math.random() * 10;
  private hipDrop = 0;
  private fall = 0;
  private readonly look: Look;

  constructor(look: Look) {
    this.look = look;
    const b = look.build;
    const skin = flat(look.skin, { rough: 0.75 });
    const top = surface('fabric', look.top);
    const pants = surface('fabric', look.pants);
    const shoe = flat(look.shoes, { rough: 0.6 });
    const sleeve = look.shortSleeves ? skin : top;
    const hand = look.gloves ? flat(look.gloves, { rough: 0.9 }) : skin;

    const j = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    this.root.add(this.body);
    const hips = j('hips', this.body, 0, HIP_Y, 0);
    const spine = j('spine', hips, 0, 0.1, 0);
    const chest = j('chest', spine, 0, 0.2, 0);
    const neck = j('neck', chest, 0, 0.3, 0);
    const head = j('head', neck, 0, 0.09, 0);

    // Bassin et torse.
    hips.add(put(rbox(0.33 * b, 0.2, 0.21, 0.07, pants), 0, 0.02, 0));
    spine.add(put(rbox(0.31 * b, 0.24, 0.19, 0.07, top), 0, 0.08, 0));
    chest.add(put(rbox(0.4 * b, 0.32, 0.23, 0.09, top), 0, 0.13, 0));
    chest.add(put(ball(0.075, top), -0.19 * b, 0.24, 0), put(ball(0.075, top), 0.19 * b, 0.24, 0));
    // Col.
    chest.add(put(cyl(0.062, 0.075, 0.05, top, 12), 0, 0.3, 0));
    neck.add(put(cyl(0.048, 0.052, 0.1, skin, 12), 0, 0.03, 0));

    this.buildHead(head, skin);

    // Bras : épaule → coude → poignet.
    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const arm = j(`arm${s}`, chest, side * 0.215 * b, 0.24, 0);
      arm.add(put(capsule(0.052 * b, 0.31, sleeve), 0, -0.14, 0));
      if (look.shortSleeves) arm.add(put(capsule(0.058 * b, 0.16, top), 0, -0.06, 0));
      const elbow = j(`elbow${s}`, arm, 0, -0.29, 0);
      elbow.add(put(capsule(0.044 * b, 0.29, sleeve), 0, -0.13, 0));
      const wrist = j(`wrist${s}`, elbow, 0, -0.27, 0);
      wrist.add(this.buildHand(hand, side));
    }

    // Jambes : hanche → genou → cheville.
    for (const side of [-1, 1] as const) {
      const s = side < 0 ? 'L' : 'R';
      const leg = j(`leg${s}`, hips, side * 0.095 * b, -0.02, 0);
      leg.add(put(capsule(0.078 * b, THIGH + 0.08, pants), 0, -THIGH / 2, 0));
      const knee = j(`knee${s}`, leg, 0, -THIGH, 0);
      knee.add(put(capsule(0.06 * b, SHIN + 0.06, pants), 0, -SHIN / 2, 0));
      const foot = j(`foot${s}`, knee, 0, -SHIN, 0);
      foot.add(put(rbox(0.1, 0.085, 0.27, 0.035, shoe), 0, -0.045, 0.06));
      foot.add(put(box(0.105, 0.02, 0.275, flat('#101010', { rough: 0.9 })), 0, -0.08, 0.06));
    }

    this.dress(look, chest, spine, hips, neck, top);

    // Accessoires tenus en main.
    this.pistol = makePistol();
    this.pistol.scale.setScalar(1);
    put(this.pistol, 0, -0.1, 0.03, Math.PI / 2, 0, 0);
    this.joints.wristR.add(this.pistol);
    this.phone = put(rbox(0.07, 0.14, 0.012, 0.008, flat('#111418', { rough: 0.3, metal: 0.4 })), 0.02, -0.1, 0.02);
    this.phone.add(put(box(0.06, 0.12, 0.002, flat('#9fd0ff', { emissive: '#6fb6ff', glow: 0.8 })), 0, 0, 0.007));
    this.joints.wristR.add(this.phone);
    this.cigarette = group(
      put(cyl(0.004, 0.004, 0.07, flat('#f2f0ea'), 6), 0, 0, 0.035, Math.PI / 2, 0, 0),
      put(ball(0.006, flat('#ff7a2a', { emissive: '#ff5a10', glow: 2 }), 6), 0, 0, 0.072),
    );
    put(this.cigarette, 0.01, -0.13, 0.03);
    this.joints.wristR.add(this.cigarette);
    this.pistol.visible = this.phone.visible = this.cigarette.visible = false;

    if (look.extras.includes('flashlight')) {
      const torch = group(
        put(cyl(0.018, 0.018, 0.16, metalDark(), 10), 0, 0, 0.06, Math.PI / 2, 0, 0),
        put(cyl(0.028, 0.02, 0.05, metalDark(), 10), 0, 0, 0.16, Math.PI / 2, 0, 0),
        put(cyl(0.024, 0.024, 0.004, flat('#fff6d8', { emissive: '#fff0b0', glow: 3 }), 10), 0, 0, 0.187, Math.PI / 2, 0, 0),
      );
      const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      beamMat.userData.noShadow = true;
      const cone = mesh(new THREE.ConeGeometry(1.5, 7, 20, 1, true), beamMat);
      put(cone, 0, 0, 3.7, -Math.PI / 2, 0, 0);
      torch.add(cone);
      this.beam = cone;
      put(torch, 0, -0.1, 0.03);
      this.joints.wristL.add(torch);
    }

    this.root.scale.setScalar(look.height);
    shadows(this.root);
    if (this.beam) this.beam.traverse((o) => (o.castShadow = o.receiveShadow = false));
  }

  private buildHead(head: THREE.Group, skin: THREE.Material): void {
    const look = this.look;
    const skull = ball(0.105, skin, 18);
    skull.scale.set(0.94, 1.14, 1.02);
    head.add(put(skull, 0, 0.1, 0));
    // Mâchoire, nez, oreilles.
    head.add(put(rbox(0.15, 0.09, 0.15, 0.04, skin), 0, 0.025, 0.012));
    head.add(put(rbox(0.026, 0.045, 0.035, 0.012, skin), 0, 0.085, 0.105, -0.25, 0, 0));
    for (const side of [-1, 1]) {
      const ear = ball(0.024, skin, 8);
      ear.scale.set(0.45, 1, 0.75);
      head.add(put(ear, side * 0.1, 0.095, -0.005));
      // Yeux : globe, iris, sourcil.
      head.add(put(ball(0.014, flat('#f4f1ea', { rough: 0.3 }), 8), side * 0.036, 0.118, 0.088));
      head.add(put(ball(0.0075, flat('#22160e', { rough: 0.2 }), 6), side * 0.036, 0.118, 0.099));
      head.add(put(box(0.036, 0.007, 0.012, flat(look.hair)), side * 0.036, 0.142, 0.094, 0, 0, side * -0.12));
    }
    head.add(put(box(0.042, 0.008, 0.006, flat('#7a3b36', { rough: 0.5 })), 0, 0.045, 0.097));

    const hair = flat(look.hair, { rough: 0.9 });
    const hat = flat(look.hat ?? look.top, { rough: 0.85 });
    const capShell = (r: number, sweep: number, mat: THREE.Material, tilt: number): THREE.Mesh => {
      const m = mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * sweep), mat);
      m.scale.set(0.96, 1.14, 1.04);
      return put(m, 0, 0.1, -0.004, tilt, 0, 0);
    };
    switch (look.hairStyle) {
      case 'bald':
        break;
      case 'short':
        head.add(capShell(0.111, 0.5, hair, -0.32));
        break;
      case 'long':
        head.add(capShell(0.113, 0.52, hair, -0.3));
        head.add(put(rbox(0.19, 0.24, 0.07, 0.035, hair), 0, 0.02, -0.085));
        break;
      case 'bun':
        head.add(capShell(0.111, 0.52, hair, -0.3));
        head.add(put(ball(0.045, hair, 10), 0, 0.2, -0.085));
        break;
      case 'beanie':
        head.add(capShell(0.116, 0.48, hat, -0.2));
        head.add(put(cyl(0.111, 0.113, 0.035, hat, 18), 0, 0.125, -0.002, -0.2, 0, 0));
        break;
      case 'hood':
        head.add(capShell(0.128, 0.62, hat, -0.5));
        head.add(put(rbox(0.25, 0.2, 0.13, 0.06, hat), 0, 0, -0.09));
        break;
      case 'cap':
        head.add(capShell(0.111, 0.5, hair, -0.4));
        head.add(put(cyl(0.108, 0.112, 0.07, hat, 18), 0, 0.175, 0));
        head.add(put(rbox(0.16, 0.012, 0.1, 0.005, hat), 0, 0.148, 0.125, 0.12, 0, 0));
        break;
      case 'officer-cap':
        head.add(capShell(0.111, 0.5, hair, -0.4));
        head.add(put(cyl(0.106, 0.11, 0.045, hat, 18), 0, 0.165, 0));
        head.add(put(cyl(0.135, 0.118, 0.03, hat, 18), 0, 0.2, 0, 0.08, 0, 0));
        head.add(put(cyl(0.111, 0.111, 0.014, flat('#0b0b0d', { rough: 0.3 }), 18), 0, 0.15, 0));
        head.add(put(rbox(0.15, 0.01, 0.08, 0.004, flat('#0b0b0d', { rough: 0.25 })), 0, 0.145, 0.115, 0.2, 0, 0));
        head.add(put(ball(0.016, flat('#d8b24a', { rough: 0.25, metal: 1 }), 6), 0, 0.185, 0.108));
        break;
    }
    if (look.extras.includes('beard')) head.add(put(rbox(0.155, 0.085, 0.11, 0.04, flat(look.hair, { rough: 1 })), 0, 0.012, 0.035));
    if (look.extras.includes('glasses')) {
      const frame = flat('#15151a', { rough: 0.4, metal: 0.5 });
      for (const side of [-1, 1]) {
        head.add(put(mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 14), frame), side * 0.036, 0.118, 0.105));
        head.add(put(box(0.003, 0.004, 0.1, frame), side * 0.058, 0.12, 0.055));
      }
      head.add(put(box(0.03, 0.004, 0.003, frame), 0, 0.12, 0.105));
    }
  }

  /** Main légèrement refermée : paume, quatre doigts, pouce. */
  private buildHand(mat: THREE.Material, side: number): THREE.Object3D {
    const g = new THREE.Group();
    g.add(put(rbox(0.07, 0.085, 0.03, 0.012, mat), 0, -0.05, 0));
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.017;
      g.add(put(capsule(0.0085, 0.05, mat, 6), x, -0.108, 0.006, 0.25, 0, 0));
      g.add(put(capsule(0.0078, 0.04, mat, 6), x, -0.14, 0.022, 0.9, 0, 0));
    }
    g.add(put(capsule(0.01, 0.055, mat, 6), side * -0.04, -0.06, 0.016, 0.3, 0, side * -0.7));
    return g;
  }

  /** Vêtements et équipement propres au métier. */
  private dress(look: Look, chest: THREE.Group, spine: THREE.Group, hips: THREE.Group, neck: THREE.Group, top: THREE.Material): void {
    const b = look.build;
    const has = (e: Extra): boolean => look.extras.includes(e);
    const black = flat('#0d0d10', { rough: 0.6 });
    const gold = flat('#d8b24a', { rough: 0.25, metal: 1 });

    if (has('jacket')) {
      const jacket = surface('fabric', look.hat ?? look.top);
      // Deux pans ouverts sur la chemise, et un col.
      for (const side of [-1, 1]) {
        chest.add(put(rbox(0.19 * b, 0.34, 0.245, 0.06, jacket), side * 0.115 * b, 0.12, 0.004));
        spine.add(put(rbox(0.17 * b, 0.26, 0.21, 0.05, jacket), side * 0.095 * b, 0.07, 0.004));
        chest.add(put(box(0.05, 0.14, 0.012, jacket), side * 0.05, 0.2, 0.12, 0, 0, side * 0.35));
      }
      chest.add(put(rbox(0.41 * b, 0.34, 0.12, 0.05, jacket), 0, 0.12, -0.065));
    }
    if (has('tie')) {
      const tie = flat('#7d1f25', { rough: 0.7 });
      chest.add(put(box(0.04, 0.035, 0.014, tie), 0, 0.275, 0.118));
      chest.add(put(box(0.045, 0.26, 0.01, tie), 0, 0.13, 0.121, 0.03, 0, 0));
    }
    if (has('apron')) {
      const apron = surface('fabric', '#1f6b3c');
      chest.add(put(box(0.3 * b, 0.26, 0.012, apron), 0, 0.1, 0.122));
      spine.add(put(box(0.33 * b, 0.26, 0.012, apron), 0, 0.06, 0.104));
      hips.add(put(box(0.34 * b, 0.34, 0.012, apron), 0, -0.1, 0.112));
      chest.add(put(box(0.014, 0.2, 0.26, apron), -0.09, 0.3, 0), put(box(0.014, 0.2, 0.26, apron), 0.09, 0.3, 0));
    }
    if (has('nametag')) chest.add(put(box(0.06, 0.022, 0.006, flat('#f4f1e6', { rough: 0.4 })), 0.1, 0.19, 0.126));
    if (has('badge')) {
      const star = mesh(new THREE.OctahedronGeometry(0.022, 0), gold);
      star.scale.set(1, 1.15, 0.3);
      chest.add(put(star, -0.1, 0.2, 0.122));
    }
    if (has('belt')) {
      hips.add(put(rbox(0.345 * b, 0.05, 0.225, 0.015, black), 0, 0.1, 0));
      hips.add(put(box(0.045, 0.04, 0.01, flat('#b9bcc2', { rough: 0.3, metal: 1 })), 0, 0.1, 0.114));
      // Étuis : menottes, chargeurs.
      hips.add(put(rbox(0.06, 0.07, 0.035, 0.01, black), -0.13 * b, 0.085, 0.09));
      hips.add(put(rbox(0.05, 0.08, 0.035, 0.01, black), 0.02, 0.085, -0.115));
    }
    if (has('holster')) {
      hips.add(put(rbox(0.045, 0.17, 0.1, 0.015, black), 0.185 * b, 0.02, 0.01));
      hips.add(put(rbox(0.03, 0.06, 0.05, 0.01, metalDark()), 0.19 * b, 0.115, -0.02, 0.2, 0, 0));
    }
    if (has('radio')) {
      chest.add(put(rbox(0.045, 0.08, 0.03, 0.008, black), -0.14 * b, 0.25, 0.115));
      chest.add(put(cyl(0.004, 0.004, 0.07, black, 5), -0.155 * b, 0.32, 0.115));
    }
    if (has('vest')) {
      const vest = flat('#14161b', { rough: 0.85 });
      chest.add(put(rbox(0.42 * b, 0.36, 0.27, 0.07, vest), 0, 0.11, 0));
      spine.add(put(rbox(0.36 * b, 0.14, 0.235, 0.05, vest), 0, 0.1, 0));
      for (const x of [-0.11, 0, 0.11]) chest.add(put(rbox(0.085, 0.11, 0.04, 0.012, vest), x * b, 0.02, 0.14));
      const label = new THREE.MeshBasicMaterial({ map: signTexture(['POLICE'], '#14161b', '#e8ecf4', 256, 64, 'bold') });
      label.userData.noShadow = true;
      chest.add(put(mesh(new THREE.PlaneGeometry(0.24, 0.06), label), 0, 0.2, -0.137, 0, Math.PI, 0));
      chest.add(put(mesh(new THREE.PlaneGeometry(0.16, 0.04), label), 0, 0.21, 0.137));
    }
    if (has('hivis')) {
      const band = flat('#d8e23a', { rough: 0.5, emissive: '#8a9410', glow: 0.5 });
      chest.add(put(rbox(0.41 * b, 0.035, 0.24, 0.01, band), 0, 0.06, 0));
      chest.add(put(rbox(0.41 * b, 0.035, 0.24, 0.01, band), 0, 0.18, 0));
    }
    if (has('chain')) neck.add(put(mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 18), gold), 0, -0.02, 0.03, Math.PI / 2 - 0.5, 0, 0));
    if (has('skirt')) hips.add(put(cyl(0.19 * b, 0.25 * b, 0.42, surface('fabric', look.pants), 16), 0, -0.2, 0));
    if (has('bag')) {
      const leather = flat('#5a3d28', { rough: 0.7 });
      hips.add(put(rbox(0.09, 0.22, 0.28, 0.03, leather), -0.24 * b, 0.02, 0));
      chest.add(put(box(0.03, 0.62, 0.012, leather), -0.03, 0.02, 0.125, 0, 0, -0.55));
      chest.add(put(box(0.03, 0.62, 0.012, leather), -0.03, 0.02, -0.125, 0, 0, -0.55));
    }
    void top;
    void chrome;
  }

  /**
   * Place et anime le personnage. `facing` est la direction dans le plan (0 = +x, π/2 = +z).
   * `speed` (m/s) règle l'allure de la marche.
   */
  update(dt: number, x: number, z: number, facing: number, pose: PoseName, speed = 1.4): void {
    this.time += dt;
    this.root.position.set(x, 0, z);
    // Rotation la plus courte vers la direction voulue.
    const target = Math.PI / 2 - facing;
    let diff = (target - this.root.rotation.y) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y += diff * Math.min(1, dt * 10);

    const t = this.time;
    const p: Pose = {};
    let drop = 0;
    const walking = pose === 'walk' || pose === 'run' || pose === 'search';
    if (walking) {
      const run = pose === 'run';
      this.phase += dt * (run ? 11 : 6.2) * Math.max(0.6, speed / (run ? 4.5 : 1.4));
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const amp = run ? 0.95 : 0.5;
      p.legL = [-s * amp, 0, 0];
      p.legR = [s * amp, 0, 0];
      p.kneeL = [Math.max(0, c) * amp * 1.5 + 0.08, 0, 0];
      p.kneeR = [Math.max(0, -c) * amp * 1.5 + 0.08, 0, 0];
      p.footL = [Math.max(0, -s) * 0.3, 0, 0];
      p.footR = [Math.max(0, s) * 0.3, 0, 0];
      p.armL = [s * amp * 0.75, 0, -0.06];
      p.armR = [-s * amp * 0.75, 0, 0.06];
      p.elbowL = [run ? -1.3 : -0.2 - Math.max(0, s) * 0.3, 0, 0];
      p.elbowR = [run ? -1.3 : -0.2 - Math.max(0, -s) * 0.3, 0, 0];
      p.spine = [run ? 0.22 : 0.04, s * 0.06, 0];
      p.chest = [0, -s * 0.1, 0];
      p.hips = [0, s * 0.07, 0];
      drop = Math.abs(c) * (run ? 0.05 : 0.025);
      if (pose === 'search') {
        // Lampe braquée devant soi, tête qui balaie.
        p.armL = [-1.25, 0, 0.1];
        p.elbowL = [-0.35, 0, 0];
        p.head = [0.05, Math.sin(t * 0.9) * 0.5, 0];
      }
    } else {
      const breath = Math.sin(t * 1.6) * 0.012;
      p.chest = [breath, 0, 0];
      p.armL = [0.03, 0, -0.07];
      p.armR = [0.03, 0, 0.07];
      p.elbowL = [-0.12, 0, 0];
      p.elbowR = [-0.12, 0, 0];
      p.head = [0, Math.sin(t * 0.4) * 0.12, 0];
    }
    switch (pose) {
      case 'hands-up': {
        const shake = Math.sin(t * 22) * 0.02;
        p.armL = [0, 0, -2.5 + shake];
        p.armR = [0, 0, 2.5 - shake];
        p.elbowL = [0, 0, -0.5];
        p.elbowR = [0, 0, 0.5];
        p.head = [0.12, 0, 0];
        p.spine = [-0.05, 0, 0];
        break;
      }
      case 'phone':
        p.armR = [-0.55, 0, 0.35];
        p.elbowR = [-2.25, 0, 0];
        p.wristR = [0, 0.6, 0];
        p.head = [0.05, -0.2, 0.12];
        p.spine = [0.1, 0, 0];
        break;
      case 'smoke': {
        const puff = (Math.sin(t * 0.9) + 1) / 2;
        p.armR = [-0.35 - puff * 0.3, 0, 0.2];
        p.elbowR = [-0.6 - puff * 1.6, 0, 0];
        p.armL = [0.1, 0, -0.1];
        p.spine = [-0.06, 0, 0];
        p.legL = [0, 0, -0.06];
        break;
      }
      case 'aim':
        p.armR = [-1.5, -0.12, 0.1];
        p.elbowR = [-0.08, 0, 0];
        p.armL = [-1.42, 0.5, -0.1];
        p.elbowL = [-0.45, 0, 0];
        p.head = [0.05, 0, 0.08];
        p.spine = [0.08, 0, 0];
        p.legL = [-0.18, 0, -0.08];
        p.legR = [0.2, 0, 0.08];
        p.kneeL = [0.25, 0, 0];
        p.kneeR = [0.15, 0, 0];
        drop = 0.03;
        break;
      case 'cower':
        p.legL = [-1.5, 0, -0.1];
        p.legR = [-1.5, 0, 0.1];
        p.kneeL = [2.4, 0, 0];
        p.kneeR = [2.4, 0, 0];
        p.spine = [0.7, 0, 0];
        p.armL = [-2.3, 0, 0.5];
        p.armR = [-2.3, 0, -0.5];
        p.elbowL = [-1.9, 0, 0];
        p.elbowR = [-1.9, 0, 0];
        p.head = [0.5, 0, 0];
        drop = 0.5;
        break;
      case 'down':
        p.armL = [0.3, 0, -1.1];
        p.armR = [-0.2, 0, 0.7];
        p.elbowL = [-0.5, 0, 0];
        p.elbowR = [-0.9, 0, 0];
        p.legL = [0.1, 0, -0.25];
        p.legR = [-0.35, 0, 0.2];
        p.kneeR = [0.7, 0, 0];
        p.head = [0, 0.7, 0];
        break;
      default:
        break;
    }

    // Glissement vers la pose cible.
    const k = Math.min(1, dt * (pose === 'down' ? 6 : 12));
    for (const name of Object.keys(this.joints) as Joint[]) {
      const g = this.joints[name];
      const want = p[name] ?? [0, 0, 0];
      g.rotation.x += (want[0] - g.rotation.x) * k;
      g.rotation.y += (want[1] - g.rotation.y) * k;
      g.rotation.z += (want[2] - g.rotation.z) * k;
    }
    this.hipDrop += (drop - this.hipDrop) * k;
    this.joints.hips.position.y = HIP_Y - this.hipDrop;

    // Chute : le corps bascule en arrière et se couche au sol.
    this.fall += ((pose === 'down' ? 1 : 0) - this.fall) * Math.min(1, dt * 5);
    this.body.rotation.x = -this.fall * (Math.PI / 2);
    this.body.position.set(0, this.fall * 0.13, -this.fall * 0.9);

    this.pistol.visible = pose === 'aim';
    this.phone.visible = pose === 'phone';
    this.cigarette.visible = pose === 'smoke';
    if (this.beam) this.beam.visible = pose !== 'down';
  }
}
