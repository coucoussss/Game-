import * as THREE from 'three';
import { flat, glass } from '../build';
import { signTexture } from '../textures';
import { bodySkin, eyeMaterials, fabric, faceSkin, hairMaterial, lipMaterial, type FabricKind } from './charMaterials';
import { makePistol } from './items';
import { blendTop, RigBuilder, smooth, type Weights } from './rig';

/**
 * Personnages détaillés, entièrement modelés par code : squelette de ~55 os (doigts phalange par phalange,
 * mâchoire, paupières, sourcils, yeux), peau déformable, anatomie sculptée, garde-robe selon le métier,
 * expressions et animations procédurales (marche, course, regard, clignements, peur…).
 */

// --- Apparence -----------------------------------------------------------------------------------

export type HairStyle = 'short' | 'buzz' | 'bald' | 'balding' | 'long' | 'bun' | 'ponytail' | 'curly' | 'cap' | 'beanie' | 'hood' | 'officer-cap';
export type TopKind = 'tshirt' | 'shirt' | 'polo' | 'hoodie' | 'sweater' | 'uniform' | 'blouse';
export type JacketKind = 'suit' | 'leather' | 'bomber' | 'coat' | 'blazer';
export type PantsKind = 'jeans' | 'trousers' | 'cargo' | 'skirt';
export type ShoeKind = 'sneaker' | 'boot' | 'dress' | 'heel';
export type IdleStyle = 'stand' | 'hands-front' | 'arms-crossed' | 'hands-behind' | 'pockets' | 'counter' | 'typing' | 'belt';
export type Extra =
  | 'apron' | 'tie' | 'badge' | 'duty-belt' | 'radio' | 'tactical-vest' | 'glasses' | 'beard' | 'moustache'
  | 'chain' | 'handbag' | 'backpack' | 'hivis' | 'watch' | 'gold-watch' | 'nametag' | 'flashlight' | 'lanyard'
  | 'earrings' | 'scarf' | 'headphones' | 'rings' | 'pocket-square' | 'patches-security' | 'patches-police' | 'epaulettes';

export interface FaceShape {
  /** Largeur du visage, de la mâchoire, des pommettes ; taille et longueur du nez ; épaisseur des lèvres et des sourcils. */
  readonly width: number;
  readonly jaw: number;
  readonly cheek: number;
  readonly nose: number;
  readonly noseLength: number;
  readonly lips: number;
  readonly brow: number;
  readonly ears: number;
}

export interface Look {
  readonly skin: string;
  readonly hair: string;
  readonly hairStyle: HairStyle;
  readonly eyes: string;
  readonly female: boolean;
  /** 0 = jeune, 1 = âgé (rides, cheveux gris). */
  readonly age: number;
  readonly face: FaceShape;
  readonly top: string;
  readonly topKind: TopKind;
  readonly topFabric: FabricKind;
  readonly shortSleeves?: boolean;
  readonly jacket?: { readonly color: string; readonly kind: JacketKind; readonly fabric: FabricKind };
  readonly pants: string;
  readonly pantsKind: PantsKind;
  readonly shoes: string;
  readonly shoeKind: ShoeKind;
  readonly hat?: string;
  readonly gloves?: string;
  readonly extras: readonly Extra[];
  readonly label?: string;
  /** Taille relative (1 = 1,78 m) et carrure. */
  readonly height: number;
  readonly build: number;
  /** Dos voûté (> 0) ou bombé (< 0), amplitude de la démarche. */
  readonly posture: number;
  readonly gait: number;
  readonly idle: IdleStyle;
}

const SKINS = ['#e8c0a0', '#c99472', '#8d5b3e', '#f1cdb0', '#a8724f', '#5e3b28', '#d4a582', '#734a33'];
const HAIRS = ['#2a1d14', '#0f0d0c', '#6b4a2b', '#b08a4a', '#8c8c8c', '#3b2412', '#a0522d', '#1a1410'];
const IRISES = ['#5a3a22', '#3a6a8a', '#4a6a3a', '#2a1a10', '#6a7a8a', '#7a5a2a'];

function pick<T>(list: readonly T[], i: number): T {
  return list[((i % list.length) + list.length) % list.length] as T;
}

function faceFor(seed: number, female: boolean): FaceShape {
  const r = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    width: 0.94 + r(1) * 0.12 - (female ? 0.04 : 0),
    jaw: female ? 0.75 + r(2) * 0.2 : 0.95 + r(2) * 0.3,
    cheek: 0.7 + r(3) * 0.6,
    nose: (female ? 0.85 : 1) * (0.85 + r(4) * 0.35),
    noseLength: 0.85 + r(5) * 0.35,
    lips: (female ? 1.15 : 0.9) * (0.85 + r(6) * 0.35),
    brow: (female ? 0.7 : 1) * (0.8 + r(7) * 0.5),
    ears: 0.9 + r(8) * 0.25,
  };
}

/** Apparence d'un personnage selon son rôle. `variant` fait varier les passants et les policiers. */
export function lookFor(role: string, variant = 0): Look {
  const v = Math.abs(variant);
  switch (role) {
    case 'clerk':
      return {
        skin: '#d9a982', hair: '#3b2412', hairStyle: 'cap', hat: '#1f6b3c', eyes: '#5a3a22', female: false, age: 0.2,
        face: faceFor(11, false), top: '#ecebe4', topKind: 'polo', topFabric: 'cotton', shortSleeves: true,
        pants: '#2b2f3a', pantsKind: 'trousers', shoes: '#1a1a1a', shoeKind: 'sneaker',
        extras: ['apron', 'nametag', 'watch'], label: 'MARC', height: 0.98, build: 0.95, posture: 0.06, gait: 0.9, idle: 'counter',
      };
    case 'jeweler':
      return {
        skin: '#e6c1a3', hair: '#9a9a9a', hairStyle: 'balding', eyes: '#3a6a8a', female: false, age: 0.85,
        face: faceFor(23, false), top: '#f4f2ec', topKind: 'shirt', topFabric: 'cotton',
        jacket: { color: '#23262e', kind: 'suit', fabric: 'suit' },
        pants: '#23262e', pantsKind: 'trousers', shoes: '#0f0f10', shoeKind: 'dress',
        extras: ['tie', 'glasses', 'gold-watch', 'pocket-square', 'rings', 'moustache'], height: 0.96, build: 0.92, posture: 0.12, gait: 0.75, idle: 'hands-front',
      };
    case 'teller': {
      const female = v % 2 === 0;
      return {
        skin: pick(SKINS, v * 3 + 1), hair: pick(HAIRS, v * 5 + 2), hairStyle: female ? (v % 4 === 0 ? 'bun' : 'ponytail') : 'short',
        eyes: pick(IRISES, v), female, age: 0.15 + (v % 3) * 0.15, face: faceFor(30 + v, female),
        top: female ? '#e8eef4' : '#dfe6ee', topKind: female ? 'blouse' : 'shirt', topFabric: 'cotton',
        jacket: female ? undefined : { color: '#2c3344', kind: 'blazer', fabric: 'suit' },
        pants: '#2c3344', pantsKind: female ? 'skirt' : 'trousers', shoes: '#15151a', shoeKind: female ? 'heel' : 'dress',
        extras: female ? ['lanyard', 'earrings', 'watch'] : ['tie', 'lanyard'], height: female ? 0.94 : 1.0, build: female ? 0.86 : 0.98,
        posture: 0, gait: 0.9, idle: 'typing',
      };
    }
    case 'guard':
      return {
        skin: pick(SKINS, v * 3 + 2), hair: pick(HAIRS, v + 1), hairStyle: 'cap', hat: '#1b2233', eyes: pick(IRISES, v + 2), female: false, age: 0.35,
        face: faceFor(40 + v, false), top: '#2a3450', topKind: 'uniform', topFabric: 'cotton',
        pants: '#1b2233', pantsKind: 'cargo', shoes: '#0d0d0f', shoeKind: 'boot',
        extras: ['duty-belt', 'radio', 'badge', 'patches-security', 'epaulettes', 'watch'], label: 'SÉCURITÉ', height: 1.03, build: 1.14,
        posture: -0.04, gait: 1, idle: 'hands-front',
      };
    case 'watchman':
      return {
        skin: '#b98060', hair: '#0f0d0c', hairStyle: 'beanie', hat: '#1c1c20', eyes: '#2a1a10', female: false, age: 0.55,
        face: faceFor(55, false), top: '#2b2b30', topKind: 'sweater', topFabric: 'knit',
        jacket: { color: '#22242a', kind: 'bomber', fabric: 'nylon' },
        pants: '#1c1c20', pantsKind: 'cargo', shoes: '#0d0d0f', shoeKind: 'boot', gloves: '#111111',
        extras: ['duty-belt', 'radio', 'hivis', 'flashlight', 'beard', 'patches-security'], height: 1.02, build: 1.18, posture: 0.05, gait: 0.9, idle: 'hands-behind',
      };
    case 'officer':
      return {
        skin: pick(SKINS, v * 2 + 1), hair: pick(HAIRS, v * 3), hairStyle: 'officer-cap', hat: '#16203a', eyes: pick(IRISES, v), female: v % 3 === 2,
        age: 0.25 + (v % 4) * 0.1, face: faceFor(60 + v, v % 3 === 2), top: '#2a4b8d', topKind: 'uniform', topFabric: 'cotton', shortSleeves: v % 2 === 1,
        pants: '#16203a', pantsKind: 'cargo', shoes: '#0b0b0d', shoeKind: 'boot',
        extras: ['duty-belt', 'radio', 'tactical-vest', 'badge', 'patches-police', 'watch'], height: v % 3 === 2 ? 0.96 : 1.01 + (v % 2) * 0.02, build: 1.08,
        posture: -0.03, gait: 1.05, idle: 'belt',
      };
    case 'fence':
      return {
        skin: '#8d5b3e', hair: '#0f0d0c', hairStyle: 'hood', hat: '#17171b', eyes: '#2a1a10', female: false, age: 0.4,
        face: faceFor(77, false), top: '#17171b', topKind: 'hoodie', topFabric: 'cotton',
        pants: '#26262b', pantsKind: 'cargo', shoes: '#ececec', shoeKind: 'sneaker', gloves: '#2a2a2a',
        extras: ['beard', 'chain', 'rings', 'headphones'], height: 1.01, build: 1.12, posture: 0.08, gait: 0.85, idle: 'arms-crossed',
      };
    default: {
      // Passants : une garde-robe de ville variée.
      const female = v % 2 === 1;
      const tops = ['#7a3b3b', '#3b5a8c', '#5d6b3a', '#c9b27a', '#6a4a7a', '#2f6f73', '#b5553c', '#d8d4c8', '#1f2a3a'];
      const topKinds: TopKind[] = ['hoodie', 'tshirt', 'sweater', 'shirt', 'tshirt', 'polo', 'blouse'];
      const jackets: (Look['jacket'] | undefined)[] = [
        { color: '#3a2a1e', kind: 'leather', fabric: 'leather' },
        undefined,
        { color: '#5a5f68', kind: 'coat', fabric: 'wool' },
        { color: '#2a3a2a', kind: 'bomber', fabric: 'nylon' },
        undefined,
        { color: '#8a6a4a', kind: 'coat', fabric: 'wool' },
      ];
      const styles: HairStyle[] = female ? ['long', 'bun', 'ponytail', 'curly', 'long'] : ['short', 'buzz', 'curly', 'beanie', 'balding', 'short'];
      const extrasPool: Extra[][] = female
        ? [['handbag', 'earrings'], ['scarf', 'earrings', 'glasses'], ['backpack', 'headphones'], ['handbag', 'watch', 'rings']]
        : [['backpack'], ['headphones', 'watch'], ['glasses', 'scarf'], ['beard'], ['moustache', 'watch']];
      const topKind = pick(topKinds, v * 3 + 1);
      return {
        skin: pick(SKINS, v * 7 + 3),
        hair: pick(HAIRS, v * 5 + 1),
        hairStyle: pick(styles, v * 2 + 1),
        hat: pick(tops, v + 4),
        eyes: pick(IRISES, v * 3),
        female,
        age: (v * 37 % 10) / 10,
        face: faceFor(100 + v, female),
        top: pick(tops, v),
        topKind,
        topFabric: topKind === 'sweater' ? 'knit' : 'cotton',
        shortSleeves: topKind === 'tshirt' && v % 3 !== 0,
        jacket: topKind === 'hoodie' ? undefined : pick(jackets, v),
        pants: pick(['#2c3344', '#3d352c', '#1f2126', '#4a4d57', '#5a4a3a', '#33465e'], v),
        pantsKind: female && v % 4 === 1 ? 'skirt' : v % 3 === 0 ? 'jeans' : v % 3 === 1 ? 'trousers' : 'jeans',
        shoes: pick(['#2a2019', '#e8e8e4', '#1a1a1a', '#6a4a2a', '#c0392b'], v),
        shoeKind: female && v % 4 === 1 ? 'heel' : v % 2 === 0 ? 'sneaker' : 'boot',
        extras: pick(extrasPool, v),
        height: (female ? 0.93 : 0.98) + ((v * 37) % 10) * 0.008,
        build: (female ? 0.86 : 0.95) + ((v * 53) % 10) * 0.02,
        posture: (((v * 13) % 7) - 3) * 0.025,
        gait: 0.85 + ((v * 7) % 5) * 0.06,
        idle: pick<IdleStyle>(['pockets', 'stand', 'arms-crossed'], v),
      };
    }
  }
}

// --- Outils de sculpture -------------------------------------------------------------------------

type Profile = readonly (readonly [number, number])[];

/** Tour (révolution) d'un profil [y, rayon], lissé, puis aplati en profondeur ; face avant vers +z. */
function lathe(profile: Profile, seg = 24, sz = 1, phiStart = Math.PI, phiLength = Math.PI * 2, steps = 0): THREE.BufferGeometry {
  // Profil trié du bas vers le haut : sinon la révolution est retournée (normales vers l'intérieur).
  const sorted = [...profile].sort((a, b) => a[0] - b[0]);
  const curve = new THREE.SplineCurve(sorted.map(([y, r]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(steps || profile.length * 4);
  const geo = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  geo.scale(1, 1, sz);
  return geo;
}

/** Déforme les sommets d'une géométrie, puis recalcule les normales. */
function sculpt(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Ne garde que les triangles dont le centre satisfait le prédicat (calottes, barbes, lignes de cheveux). */
function keep(geo: THREE.BufferGeometry, pred: (c: THREE.Vector3) => boolean): THREE.BufferGeometry {
  const idx = geo.index;
  const pos = geo.getAttribute('position');
  if (!idx) return geo;
  const out: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    if (pred(a.add(b).add(c).multiplyScalar(1 / 3))) out.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  }
  geo.setIndex(out);
  return geo;
}

function gauss(p: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const dz = p.z - cz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz) / (r * r));
}

/**
 * Bande de la surface du crâne entre deux lignes, définies par leur hauteur selon l'azimut φ (avant :
 * sin φ = 1). Les bords suivent exactement les lignes : pas de dents de scie.
 */
function scalpBand(shape: (p: THREE.Vector3) => void, top: (phi: number) => number, bottom: (phi: number) => number, rows = 18, cols = 56): THREE.BufferGeometry {
  // Légèrement en deçà des pôles : sinon Three.js ne met qu'un triangle par case sur la première et la
  // dernière rangée, d'où un bord en dents de scie.
  const geo = new THREE.SphereGeometry(1, cols, rows, 0, Math.PI * 2, 1e-4, Math.PI - 2e-4);
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const thetaOf = (y: number) => Math.acos(Math.max(-1, Math.min(1, (y - 0.095) / 0.113)));
  for (let i = 0; i < pos.count; i++) {
    const phi = uv.getX(i) * Math.PI * 2;
    const t = 1 - uv.getY(i);
    const th0 = thetaOf(top(phi));
    const th1 = thetaOf(bottom(phi));
    const th = th0 + (th1 - th0) * t;
    p.set(-Math.cos(phi) * Math.sin(th) * 0.1, Math.cos(th) * 0.1 + 0.095, Math.sin(phi) * Math.sin(th) * 0.1);
    shape(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Interpolation avant / arrière selon l'azimut. */
function frontBack(phi: number, front: number, back: number, width = 0.7): number {
  return THREE.MathUtils.lerp(back, front, smooth(-width, width, Math.sin(phi)));
}

function m(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, mat);
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

function tubeGeo(points: readonly (readonly [number, number, number])[], r: number, seg = 6, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed);
  return new THREE.TubeGeometry(curve, Math.max(6, points.length * 5), r, seg, closed);
}

const sphere = (r: number, ws = 12, hs = 9) => new THREE.SphereGeometry(r, ws, hs);
const cylinder = (rt: number, rb: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const boxGeo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Boîte aux coins arrondis, plate (poches, patchs, semelles). */
function slabGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: d * 0.4, bevelThickness: d * 0.4, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -d / 2);
  return geo;
}

// --- Squelette -----------------------------------------------------------------------------------

const HIP_Y = 0.95;
const THIGH = 0.42;
const SHIN = 0.41;
const FINGERS: readonly { name: string; z: number; lens: readonly [number, number, number]; r: number }[] = [
  { name: 'i', z: 0.027, lens: [0.042, 0.025, 0.02], r: 0.0088 },
  { name: 'm', z: 0.009, lens: [0.047, 0.028, 0.022], r: 0.009 },
  { name: 'r', z: -0.009, lens: [0.044, 0.026, 0.021], r: 0.0085 },
  { name: 'p', z: -0.026, lens: [0.034, 0.02, 0.018], r: 0.0075 },
];

export type PoseName = 'idle' | 'walk' | 'run' | 'hands-up' | 'phone' | 'smoke' | 'aim' | 'cower' | 'down' | 'search';

type Joint =
  | 'base' | 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'jaw'
  | 'shoulderL' | 'shoulderR' | 'armL' | 'elbowL' | 'handL' | 'armR' | 'elbowR' | 'handR'
  | 'legL' | 'kneeL' | 'footL' | 'toeL' | 'legR' | 'kneeR' | 'footR' | 'toeR';

type Pose = Partial<Record<Joint, readonly [number, number, number]>>;

const JOINTS: readonly Joint[] = [
  'base', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
  'shoulderL', 'shoulderR', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR',
  'legL', 'kneeL', 'footL', 'toeL', 'legR', 'kneeR', 'footR', 'toeR',
];

interface Expression {
  jaw: number;
  brows: number;
  lids: number;
  gripL: number;
  gripR: number;
  spreadL: number;
  spreadR: number;
}

/** Personnage complet : construction et animation. */
export class Human {
  readonly root = new THREE.Group();
  private readonly look: Look;
  private readonly joints = {} as Record<Joint, THREE.Bone>;
  private readonly fingerBones: { side: number; bones: THREE.Bone[]; thumb: boolean }[] = [];
  private readonly eyes: THREE.Bone[] = [];
  private readonly lids: THREE.Bone[] = [];
  private readonly brows: THREE.Bone[] = [];
  private readonly detailMeshes: THREE.SkinnedMesh[] = [];
  private readonly pistol: THREE.Object3D;
  private readonly phone: THREE.Object3D;
  private readonly cigarette: THREE.Object3D;
  private beam: THREE.Object3D | null = null;
  private readonly puffs: { sprite: THREE.Sprite; life: number }[] = [];
  private phase = Math.random() * 6;
  private time = Math.random() * 10;
  private blinkTimer = 1 + Math.random() * 3;
  private blink = 0;
  private hipDrop = 0;
  private fall = 0;
  private readonly expr: Expression = { jaw: 0, brows: 0, lids: 0, gripL: 0.3, gripR: 0.3, spreadL: 0, spreadR: 0 };
  /** Point du monde que le personnage regarde (le joueur, souvent), ou null. */
  gaze: THREE.Vector3 | null = null;
  private readonly gazeLocal = new THREE.Vector3();
  private readonly look2 = { yaw: 0, pitch: 0 };

  constructor(look: Look) {
    this.look = look;
    const rig = new RigBuilder();
    this.buildSkeleton(rig);
    this.buildBody(rig);
    this.buildHead(rig);
    this.buildHair(rig);
    this.buildClothes(rig);
    this.buildAccessories(rig);
    const built = rig.build(this.root);
    this.detailMeshes.push(...built.detail);

    for (const name of JOINTS) this.joints[name] = rig.get(name);
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      for (const f of FINGERS) this.fingerBones.push({ side, thumb: false, bones: [rig.get(`${s}${f.name}0`), rig.get(`${s}${f.name}1`), rig.get(`${s}${f.name}2`)] });
      this.fingerBones.push({ side, thumb: true, bones: [rig.get(`${s}t0`), rig.get(`${s}t1`), rig.get(`${s}t2`)] });
      this.eyes.push(rig.get(`eye${s}`));
      this.lids.push(rig.get(`lid${s}`));
      this.brows.push(rig.get(`brow${s}`));
    }

    // Accessoires animés, non fusionnés : pistolet en main, téléphone, cigarette.
    this.pistol = makePistol();
    at(this.pistol, 0, -0.1, 0.03, Math.PI / 2, 0, 0);
    this.joints.handR.add(this.pistol);
    const phoneMat = flat('#111418', { rough: 0.25, metal: 0.5 });
    this.phone = new THREE.Group();
    this.phone.add(m(slabGeo(0.07, 0.145, 0.006, 0.01), phoneMat));
    this.phone.add(at(m(boxGeo(0.062, 0.13, 0.001), flat('#9fd0ff', { emissive: '#6fb6ff', glow: 0.8 })), 0, 0, -0.006));
    at(this.phone, -0.03, -0.1, 0.02, 0, Math.PI / 2, 0);
    this.joints.handR.add(this.phone);
    this.cigarette = new THREE.Group();
    this.cigarette.add(at(m(cylinder(0.0042, 0.0042, 0.06, 8), flat('#f4f2ec')), 0, 0, 0, Math.PI / 2, 0, 0));
    this.cigarette.add(at(m(cylinder(0.0044, 0.0044, 0.02, 8), flat('#c88a4a')), 0, 0, -0.035, Math.PI / 2, 0, 0));
    this.cigarette.add(at(m(sphere(0.005, 6, 5), flat('#ff7a2a', { emissive: '#ff5a10', glow: 2.5 })), 0, 0, 0.031));
    at(this.cigarette, -0.012, -0.12, 0.03, 0, 0, 0);
    this.joints.handR.add(this.cigarette);
    this.pistol.visible = this.phone.visible = this.cigarette.visible = false;
    this.pistol.traverse((o) => (o.castShadow = true));

    if (look.extras.includes('flashlight')) this.buildFlashlight();
    this.root.scale.setScalar(look.height);
  }

  // --- Squelette ---------------------------------------------------------------------------------

  private buildSkeleton(rig: RigBuilder): void {
    const b = this.look.build;
    const fem = this.look.female;
    const shoulderW = (fem ? 0.1 : 0.115) * b;
    rig.bone('base', null, 0, 0, 0);
    rig.bone('hips', 'base', 0, HIP_Y, 0);
    rig.bone('spine', 'hips', 0, 0.09, 0);
    rig.bone('chest', 'spine', 0, 0.17, 0);
    rig.bone('neck', 'chest', 0, 0.27, -0.005);
    rig.bone('head', 'neck', 0, 0.09, 0.012);
    rig.bone('jaw', 'head', 0, 0.07, -0.01);
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      rig.bone(`shoulder${s}`, 'chest', side * 0.055, 0.2, -0.012);
      rig.bone(`arm${s}`, `shoulder${s}`, side * shoulderW, 0, 0);
      rig.bone(`elbow${s}`, `arm${s}`, 0, -0.28, 0);
      rig.bone(`hand${s}`, `elbow${s}`, 0, -0.255, 0);
      // Doigts : la paume regarde vers le corps (−x pour la main droite), les doigts s'alignent d'avant en arrière.
      for (const f of FINGERS) {
        rig.bone(`${s}${f.name}0`, `hand${s}`, side * -0.004, -0.085, f.z);
        rig.bone(`${s}${f.name}1`, `${s}${f.name}0`, 0, -f.lens[0], 0);
        rig.bone(`${s}${f.name}2`, `${s}${f.name}1`, 0, -f.lens[1], 0);
      }
      rig.bone(`${s}t0`, `hand${s}`, side * -0.014, -0.028, 0.034);
      rig.bone(`${s}t1`, `${s}t0`, 0, -0.038, 0.004);
      rig.bone(`${s}t2`, `${s}t1`, 0, -0.03, 0);
      rig.bone(`leg${s}`, 'hips', side * (fem ? 0.092 : 0.088) * b, -0.04, 0);
      rig.bone(`knee${s}`, `leg${s}`, 0, -THIGH, 0);
      rig.bone(`foot${s}`, `knee${s}`, 0, -SHIN, 0);
      rig.bone(`toe${s}`, `foot${s}`, 0, -0.062, 0.135);
      // Visage : yeux, paupières supérieures, sourcils (dans l'espace de la tête).
      rig.bone(`eye${s}`, 'head', side * 0.0335, 0.111, 0.0765);
      rig.bone(`lid${s}`, 'head', side * 0.0335, 0.111, 0.0765);
      rig.bone(`brow${s}`, 'head', side * 0.036, 0.134, 0.084);
    }
  }

  // --- Corps -------------------------------------------------------------------------------------

  /** Rayon du torse (demi-largeur) à la hauteur y (espace du bassin). */
  private torsoProfile(): Profile {
    const b = this.look.build;
    if (this.look.female) {
      return [[-0.11, 0.15 * b], [-0.04, 0.178 * b], [0.04, 0.165 * b], [0.13, 0.132 * b], [0.22, 0.142 * b], [0.31, 0.158 * b], [0.39, 0.162 * b], [0.45, 0.165 * b], [0.5, 0.15 * b], [0.535, 0.1], [0.56, 0.056], [0.575, 0.05]];
    }
    return [[-0.11, 0.152 * b], [-0.04, 0.168 * b], [0.04, 0.162 * b], [0.13, 0.15 * b], [0.22, 0.162 * b], [0.31, 0.178 * b], [0.39, 0.188 * b], [0.45, 0.192 * b], [0.5, 0.17 * b], [0.535, 0.11], [0.56, 0.062], [0.575, 0.055]];
  }

  /** Relief du torse : pectoraux ou poitrine, omoplates, sillon du dos, ventre. */
  private torsoBumps(p: THREE.Vector3): number {
    const fem = this.look.female;
    let d = 0;
    for (const s of [-1, 1]) {
      d += (fem ? 0.026 : 0.012) * gauss(p, s * 0.068, fem ? 0.35 : 0.37, 0.1, fem ? 0.055 : 0.07) * (p.z > 0 ? 1 : 0);
      d += 0.01 * gauss(p, s * 0.08, 0.42, -0.1, 0.07) * (p.z < 0 ? 1 : 0);
    }
    d -= 0.006 * gauss(p, 0, 0.3, -0.12, 0.05);
    d += (this.look.age * 0.012 + (this.look.build - 1) * 0.02) * gauss(p, 0, 0.12, 0.13, 0.1);
    return d;
  }

  private torsoGeo(y0: number, y1: number, inflate: number, phiStart = Math.PI, phiLength = Math.PI * 2, seg = 30): THREE.BufferGeometry {
    const full = this.torsoProfile();
    const lerp = (y: number): number => {
      for (let i = 0; i < full.length - 1; i++) {
        const a = full[i];
        const c = full[i + 1];
        if (a && c && y >= a[0] && y <= c[0]) return a[1] + ((y - a[0]) / (c[0] - a[0])) * (c[1] - a[1]);
      }
      return (y < (full[0]?.[0] ?? 0) ? full[0]?.[1] : full[full.length - 1]?.[1]) ?? 0.1;
    };
    const prof: [number, number][] = [];
    const n = Math.max(2, Math.round(((y1 - y0) / 0.68) * 18));
    for (let i = 0; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n;
      prof.push([y, lerp(y) * inflate]);
    }
    const geo = lathe(prof, seg, this.look.female ? 0.66 : 0.6, phiStart, phiLength, Math.max(4, Math.round(n * 1.3)));
    return sculpt(geo, (p) => {
      const len = Math.hypot(p.x, p.z) || 1;
      const d = this.torsoBumps(p) * inflate;
      p.x += (p.x / len) * d;
      p.z += (p.z / len) * d;
      // Épaules légèrement tombantes vers l'avant.
      if (p.y > 0.44) p.z += 0.012 * smooth(0.44, 0.52, p.y) * smooth(0.06, 0.16, Math.abs(p.x));
    });
  }

  /** Point à la surface du torse (pour poser boutons, poches, insignes), dans l'espace du bassin. */
  private torsoPoint(x: number, y: number, front: number, offset = 0.003): THREE.Vector3 {
    const geo = this.torsoGeo(y - 0.001, y + 0.001, 1, Math.PI, Math.PI * 2, 64);
    const pos = geo.getAttribute('position');
    let best = new THREE.Vector3(x, y, front * 0.1);
    let bestD = Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (Math.sign(p.z) !== front) continue;
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = p.clone();
      }
    }
    geo.dispose();
    best.z += front * offset;
    return best;
  }

  /** Poids du torse entre bassin, colonne, poitrine, épaules et cou. */
  private torsoWeights(p: THREE.Vector3): Weights {
    const wH = 1 - smooth(0.02, 0.14, p.y);
    const wC = smooth(0.17, 0.3, p.y);
    const wS = Math.max(0, 1 - wH - wC);
    const sh = smooth(0.1, 0.18, Math.abs(p.x)) * smooth(0.36, 0.47, p.y) * 0.55;
    const nk = smooth(0.53, 0.575, p.y) * 0.7;
    const side = p.x < 0 ? 'L' : 'R';
    return [
      ['hips', wH],
      ['spine', wS],
      ['chest', wC * (1 - sh - nk)],
      [`shoulder${side}`, wC * sh],
      ['neck', wC * nk],
    ];
  }

  private buildBody(rig: RigBuilder): void {
    const L = this.look;
    const b = L.build;
    const fem = L.female;
    const skin = bodySkin(L.skin);
    const glove = L.gloves ? fabric(L.gloves, 'leather') : null;
    const handMat = glove ?? skin;

    // Cou, avec pomme d'Adam.
    const neck = sculpt(lathe([[-0.03, 0.06], [0.03, 0.053], [0.08, 0.05], [0.12, 0.052]], 20, 0.95), (p) => {
      if (!fem) p.z += 0.008 * gauss(p, 0, 0.04, 0.05, 0.02);
    });
    rig.add('neck', m(neck, skin), {
      weights: (p) => [['neck', smooth(-0.03, 0.03, p.y) * (1 - smooth(0.07, 0.12, p.y) * 0.5)], ['chest', 1 - smooth(-0.03, 0.03, p.y)], ['head', smooth(0.07, 0.12, p.y) * 0.5]],
    });

    // Bras : épaule, bras, avant-bras, avec muscles et pliure douce au coude.
    const sleeveMat = this.sleeveMaterial();
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      const k = (fem ? 0.84 : 1) * b;
      const upper = sculpt(lathe([[0.03, 0.05 * k], [-0.02, 0.056 * k], [-0.1, 0.051 * k], [-0.18, 0.046 * k], [-0.25, 0.042 * k], [-0.3, 0.04 * k]], 18, 0.95), (p) => {
        p.z += 0.006 * k * gauss(p, 0, -0.12, 0.05, 0.06);
        p.x += side * 0.004 * gauss(p, side * 0.05, -0.04, 0, 0.05);
      });
      const fore = sculpt(lathe([[0.03, 0.042 * k], [-0.04, 0.045 * k], [-0.11, 0.041 * k], [-0.19, 0.033 * k], [-0.255, 0.027 * k]], 18, 0.85), (p) => {
        p.x -= side * 0.004 * gauss(p, -side * 0.04, -0.06, 0, 0.05);
      });
      const armMat = L.shortSleeves && !L.jacket ? skin : sleeveMat;
      rig.add(`arm${s}`, m(upper, armMat), { weights: (p) => [[`arm${s}`, 0.5 + 0.5 * smooth(0, 0.08, -p.y)], [`shoulder${s}`, 0.5 - 0.5 * smooth(0, 0.08, -p.y)]] });
      rig.add(`arm${s}`, m(sphere(0.056 * k, 16, 12), armMat), { weights: () => [[`arm${s}`, 0.55], [`shoulder${s}`, 0.45]] });
      rig.add(`elbow${s}`, m(fore, L.jacket || !L.shortSleeves ? sleeveMat : skin), { weights: blendTop(`elbow${s}`, `arm${s}`, 0.07) });
      if (L.shortSleeves && !L.jacket) {
        // Manche courte : un ourlet ample sur le haut du bras.
        const sleeve = lathe([[0.04, 0.062 * k], [-0.06, 0.06 * k], [-0.13, 0.057 * k]], 20, 0.96);
        rig.add(`arm${s}`, m(sleeve, sleeveMat), { weights: (p) => [[`arm${s}`, 0.6 + 0.4 * smooth(0, 0.06, -p.y)], [`shoulder${s}`, 0.4 - 0.4 * smooth(0, 0.06, -p.y)]] });
        rig.add(`arm${s}`, at(m(new THREE.TorusGeometry(0.057 * k, 0.004, 6, 22), sleeveMat), 0, -0.13, 0, Math.PI / 2, 0, 0), { detail: true });
      }
      this.buildHand(rig, s, side, handMat, glove !== null);
    }

    // Jambes : cuisses, genoux, mollets.
    for (const s of ['L', 'R'] as const) {
      const k = b * (fem ? 0.97 : 1);
      const thigh = sculpt(lathe([[0.06, 0.088 * k], [-0.04, 0.086 * k], [-0.16, 0.078 * k], [-0.3, 0.066 * k], [-0.4, 0.056 * k], [-0.44, 0.054 * k]], 20, 1.04), (p) => {
        p.z += 0.008 * gauss(p, 0, -0.12, 0.08, 0.1);
      });
      const shin = sculpt(lathe([[0.04, 0.054 * k], [-0.04, 0.053 * k], [-0.13, 0.056 * k], [-0.26, 0.044 * k], [-0.38, 0.034 * k], [-0.42, 0.033 * k]], 20, 1.0), (p) => {
        // Mollet en arrière, tibia plat devant.
        p.z -= 0.014 * gauss(p, 0, -0.12, -0.06, 0.08);
        if (p.z > 0) p.z *= 0.92;
      });
      const legMat = L.pantsKind === 'skirt' ? bodySkin(L.skin) : this.pantsMaterial();
      rig.add(`leg${s}`, m(thigh, legMat), { weights: blendTop(`leg${s}`, 'hips', 0.12) });
      rig.add(`knee${s}`, m(shin, legMat), { weights: blendTop(`knee${s}`, `leg${s}`, 0.07) });
      rig.add(`knee${s}`, at(m(sphere(0.052 * k, 14, 10), legMat), 0, 0.0, 0.006), { weights: () => [[`knee${s}`, 0.5], [`leg${s}`, 0.5]] });
    }

    // Bassin (sous le vêtement du haut) : il porte le pantalon.
    const pelvis = this.torsoGeo(-0.11, 0.07, 1.0);
    rig.add('hips', m(pelvis, L.pantsKind === 'skirt' ? bodySkin(L.skin) : this.pantsMaterial()), { weights: (p) => this.torsoWeights(p) });
    // Entrejambe.
    const crotch = sphere(0.1 * b, 16, 10);
    crotch.scale(1, 0.8, 0.8);
    rig.add('hips', at(m(crotch, L.pantsKind === 'skirt' ? bodySkin(L.skin) : this.pantsMaterial()), 0, -0.1, 0), {});
  }

  private buildHand(rig: RigBuilder, s: 'L' | 'R', side: number, mat: THREE.Material, gloved: boolean): void {
    const fem = this.look.female;
    const k = fem ? 0.9 : 1;
    // Paume : un pavé sculpté, plus épais à la base du pouce.
    const palm = sculpt(new THREE.BoxGeometry(0.03 * k, 0.088 * k, 0.078 * k, 4, 6, 6), (p) => {
      const ny = p.y / (0.044 * k);
      const nz = p.z / (0.039 * k);
      p.x *= 1 - 0.25 * nz * nz;
      p.z *= 1 - 0.08 * ny * ny;
      p.x -= side * 0.006 * gauss(p, 0, -0.015, 0.03, 0.03);
      const r = 0.012;
      const ax = Math.abs(p.x);
      if (ax > 0.015 * k - r) p.x = Math.sign(p.x) * (0.015 * k - r + (ax - (0.015 * k - r)) * 0.8);
    });
    rig.add(`hand${s}`, at(m(palm, mat), 0, -0.046 * k, 0), { weights: (p) => [[`hand${s}`, 0.6 + 0.4 * smooth(0, 0.02, -p.y)], [`elbow${s}`, 0.4 - 0.4 * smooth(0, 0.02, -p.y)]] });
    const nail = flat('#e8b8a8', { rough: 0.25 });
    for (const f of FINGERS) {
      for (let i = 0; i < 3; i++) {
        const len = (f.lens[i] ?? 0.02) * k;
        const r = f.r * k * (1 - i * 0.08);
        // Phalange : capsule légère (les bouts arrondis font l'articulation).
        rig.add(`${s}${f.name}${i}`, at(m(new THREE.CapsuleGeometry(r, len, 2, 7), mat), 0, -len / 2, 0), { detail: i > 0 });
      }
      if (!gloved) rig.add(`${s}${f.name}2`, at(m(slabGeo(f.r * 1.2, f.r * 1.5, 0.0015, 0.003), nail), side * f.r * 0.85, -(f.lens[2] ?? 0.02) * 0.62, 0, 0, Math.PI / 2, 0), { detail: true });
    }
    const tl = [0.038, 0.03, 0.026];
    for (let i = 0; i < 3; i++) {
      const r = 0.0105 * k * (1 - i * 0.1);
      rig.add(`${s}t${i}`, at(m(new THREE.CapsuleGeometry(r, (tl[i] ?? 0.03) * k, 2, 7), mat), 0, -((tl[i] ?? 0.03) * k) / 2, 0), { detail: i === 2 });
    }
    if (!gloved) rig.add(`${s}t2`, at(m(slabGeo(0.012, 0.014, 0.0015, 0.004), nail), side * 0.009, -0.016, 0, 0, Math.PI / 2, 0), { detail: true });
  }

  // --- Tête ----------------------------------------------------------------------------------------

  /** Forme du crâne et du visage (espace de la tête, centre du crâne en (0, 0.095, 0)). */
  private headShape(p: THREE.Vector3, inflate = 0): void {
    const f = this.look.face;
    const fem = this.look.female;
    const cy = 0.095;
    p.y -= cy;
    p.x *= 0.9 * f.width;
    p.y *= 1.13;
    p.z *= 1.02;
    // Mâchoire : se resserre vers le menton, menton en avant.
    if (p.y < 0) {
      const t = smooth(0, -0.11, p.y);
      p.x *= 1 - 0.24 * t * (1.3 - f.jaw * 0.5);
      if (p.z > -0.02) p.z += 0.016 * smooth(-0.02, -0.1, p.y) * smooth(-0.02, 0.06, p.z);
      if (p.z < 0) p.z *= 1 - 0.25 * t;
    }
    // Tempes plates, occiput.
    if (p.y > 0.01) p.x *= 1 - 0.04 * smooth(0.01, 0.08, p.y);
    p.z += 0.008 * gauss(p, 0, 0.03, -0.1, 0.05);
    const out = new THREE.Vector3(p.x, p.y, p.z).normalize();
    let d = 0;
    for (const s of [-1, 1]) {
      d += 0.007 * f.cheek * gauss(p, s * 0.052, -0.012, 0.072, 0.03);
      d += (fem ? 0.003 : 0.006) * gauss(p, s * 0.032, 0.04, 0.094, 0.022);
      d -= 0.012 * gauss(p, s * 0.034, 0.017, 0.094, 0.02);
      // Fossettes des joues.
      d -= 0.004 * gauss(p, s * 0.045, -0.045, 0.08, 0.02);
    }
    d += 0.004 * gauss(p, 0, 0.02, 0.104, 0.015);
    d += 0.003 * gauss(p, 0, -0.045, 0.092, 0.03);
    d += 0.006 * (fem ? 0.6 : 1) * gauss(p, 0, -0.092, 0.07, 0.025);
    d += inflate;
    p.addScaledVector(out, d);
    p.y += cy;
  }

  /** Bande de cuir chevelu gonflée de `inflate`, entre deux lignes. */
  private scalp(inflate: number, top: (phi: number) => number, bottom: (phi: number) => number): THREE.BufferGeometry {
    return scalpBand((p) => {
      // On repart d'un point de la sphère unité de rayon 0,1 : headShape attend cette forme.
      this.headShape(p, inflate);
    }, top, bottom);
  }

  /** Ligne d'implantation des cheveux : front arrondi, golfes aux tempes, nuque basse. */
  private hairline(phi: number, front = 0.162): number {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    if (s > 0) return THREE.MathUtils.lerp(0.098, front + 0.006 * c * c, smooth(0.25, 0.85, s)) + 0.012 * Math.exp(-((s - 0.7) ** 2) / 0.01);
    return THREE.MathUtils.lerp(0.098, 0.035, smooth(0, 0.6, -s));
  }

  private headWeights(p: THREE.Vector3): Weights {
    // La mâchoire emporte le bas du visage, sous la bouche.
    const j = smooth(0.065, 0.035, p.y) * smooth(-0.04, 0.02, p.z);
    const n = smooth(0.03, -0.01, p.y) * (1 - smooth(-0.04, 0.02, p.z));
    return [['head', 1 - j - n * 0.5], ['jaw', j], ['neck', n * 0.5]];
  }

  private buildHead(rig: RigBuilder): void {
    const L = this.look;
    const f = L.face;
    const tone = L.skin;
    const skin = faceSkin({
      tone,
      age: L.age,
      stubble: L.female || L.extras.includes('beard') || L.extras.includes('moustache') ? 0 : Math.max(0.1, 0.22 + (L.face.jaw - 1) * 0.5),
      blush: L.female ? 0.9 : 0.5,
      freckles: L.skin === '#f1cdb0' && L.hair === '#a0522d',
      makeup: L.female && L.age < 0.6,
    });
    const head = sculpt(new THREE.SphereGeometry(0.1, 48, 36), (p) => {
      p.y += 0.095;
      this.headShape(p);
    });
    rig.add('head', m(head, skin), { weights: (p) => this.headWeights(p) });

    // Yeux : globe, iris strié, cornée brillante.
    const eye = eyeMaterials(L.eyes);
    const lidMat = bodySkin(tone);
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      rig.add(`eye${s}`, m(sphere(0.0122, 20, 16), eye.sclera));
      rig.add(`eye${s}`, at(m(new THREE.CircleGeometry(0.0062, 24), eye.iris), 0, 0, 0.0119), { detail: true });
      // Paupière supérieure (mobile) et inférieure (fixe).
      const upper = new THREE.SphereGeometry(0.0134, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      upper.rotateX(-0.2);
      rig.add(`lid${s}`, m(upper, lidMat));
      rig.add(`lid${s}`, at(m(tubeGeo([[-0.011, 0.0035, 0.0085], [0, 0.0058, 0.0124], [0.011, 0.0035, 0.0085]], 0.0009, 4), flat('#151010', { rough: 0.9 })), 0, 0, 0), { detail: true });
      const lower = new THREE.SphereGeometry(0.0131, 20, 8, 0, Math.PI * 2, Math.PI * 0.69, Math.PI * 0.31);
      rig.add('head', at(m(lower, lidMat), side * 0.0335, 0.111, 0.0765));
      // Sourcils : une mèche courbe, plus ou moins fournie.
      const brow = tubeGeo([[-side * 0.016, -0.003, -0.001], [-side * 0.004, 0.002, 0.004], [side * 0.012, 0.0015, 0.001], [side * 0.021, -0.004, -0.008]], 0.0034 * f.brow, 6);
      brow.scale(1, 0.62, 0.8);
      rig.add(`brow${s}`, m(brow, hairMaterial(L.age > 0.7 ? '#a8a8a8' : L.hair)), { detail: true });
    }

    // Nez : une pièce sculptée (arête fine, pointe, ailes), narines creusées dessous.
    const n = f.nose;
    const nl = f.noseLength;
    const noseSkin = bodySkin(tone);
    const nose = sculpt(new THREE.SphereGeometry(1, 28, 22), (p) => {
      const t = (p.y + 1) / 2;
      const w = THREE.MathUtils.lerp(0.0165, 0.0058, smooth(0.22, 0.95, t)) * n;
      let d = THREE.MathUtils.lerp(0.019, 0.006, smooth(0.15, 1, t)) * n * nl;
      // Pointe arrondie, base qui rentre sous le nez.
      d += 0.004 * Math.exp(-((t - 0.28) ** 2) / 0.02) * n;
      if (t < 0.12) d *= 0.55 + t * 3.5;
      // Ailes : renflements latéraux en bas.
      const ala = Math.exp(-((t - 0.15) ** 2) / 0.012) * smooth(0.4, 0.9, Math.abs(p.x));
      p.x = p.x * w * (1 + ala * 0.35);
      p.y = p.y * 0.024 * nl;
      p.z = p.z > 0 ? p.z * d : p.z * 0.004;
    });
    rig.add('head', at(m(nose, noseSkin), 0, 0.084, 0.093));
    for (const s of [-1, 1]) {
      const nostril = sphere(0.0026 * n, 10, 8);
      nostril.scale(1.3, 0.5, 1.4);
      rig.add('head', at(m(nostril, flat('#2a1410', { rough: 1 })), s * 0.0062 * n, 0.0618 - 0.012 * (nl - 1), 0.104), { detail: true });
    }

    // Bouche : lèvres, commissures, intérieur sombre et dents (visibles quand elle s'ouvre).
    const lip = lipMaterial(tone, L.female && L.age < 0.6);
    const lp = f.lips;
    const upperLip = sculpt(sphere(1, 28, 14), (p) => {
      p.x *= 0.0215;
      p.y *= 0.0042 * lp;
      p.z *= 0.0048 * lp;
      // Arc de Cupidon : léger creux au centre, pointe au milieu.
      p.y += 0.0011 * Math.exp(-(p.x * p.x) / 0.00004) * (p.y > 0 ? 1 : 0) - 0.0006 * Math.exp(-(p.x * p.x) / 0.000008);
      p.z -= 0.006 * (p.x / 0.0215) ** 2;
    });
    rig.add('head', at(m(upperLip, lip), 0, 0.0548, 0.0988));
    const lowerLip = sculpt(sphere(1, 28, 14), (p) => {
      p.x *= 0.0195;
      p.y *= 0.0052 * lp;
      p.z *= 0.0055 * lp;
      p.z -= 0.006 * (p.x / 0.0195) ** 2;
    });
    // Coordonnées dans l'espace de la mâchoire (os en (0, 0.07, −0.01)).
    rig.add('jaw', at(m(lowerLip, lip), 0, 0.0462 - 0.07, 0.0975 + 0.01));
    rig.add('head', m(tubeGeo([[-0.021, 0.0512, 0.094], [-0.01, 0.0505, 0.1012], [0, 0.0508, 0.1028], [0.01, 0.0505, 0.1012], [0.021, 0.0512, 0.094]], 0.0008, 4), flat('#3a1414', { rough: 0.9 })), { detail: true });
    rig.add('head', at(m(boxGeo(0.034, 0.012, 0.012), flat('#2a0e0e', { rough: 1 })), 0, 0.048, 0.088), { detail: true });
    rig.add('head', at(m(boxGeo(0.024, 0.006, 0.006), flat('#f2ece0', { rough: 0.3 })), 0, 0.0505, 0.094), { detail: true });
    rig.add('jaw', at(m(boxGeo(0.022, 0.005, 0.006), flat('#ece4d6', { rough: 0.3 })), 0, 0.044 - 0.07, 0.091 + 0.01), { detail: true });

    // Oreilles : pavillon, hélix en bordure, conque creusée, lobe.
    const ear = bodySkin(tone);
    const inner = flat(new THREE.Color(tone).multiplyScalar(0.72).getStyle(), { rough: 0.7 });
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      const shell = sphere(0.024 * f.ears, 16, 12);
      shell.scale(0.32, 1.18, 0.74);
      e.add(m(shell, ear));
      const helix = new THREE.TorusGeometry(0.0185 * f.ears, 0.0038, 8, 24, Math.PI * 1.45);
      helix.rotateZ(-Math.PI * 0.22);
      helix.scale(1, 1.4, 1);
      helix.rotateY(Math.PI / 2);
      e.add(at(m(helix, ear), 0.003, 0.002, 0));
      const concha = sphere(0.011 * f.ears, 12, 9);
      concha.scale(0.3, 1.0, 0.8);
      e.add(at(m(concha, inner), 0.0065, -0.002, 0.002));
      const lobe = sphere(0.008 * f.ears, 10, 8);
      lobe.scale(0.5, 1, 0.9);
      e.add(at(m(lobe, ear), 0.002, -0.026 * f.ears, 0.004));
      // Bord du pavillon décollé vers l'arrière.
      e.position.set(s * 0.094 * f.width, 0.098, -0.01);
      e.rotation.set(0, s > 0 ? -0.3 : Math.PI + 0.3, 0);
      e.updateMatrix();
      for (const child of [...e.children]) {
        const mesh = child as THREE.Mesh;
        mesh.updateMatrix();
        mesh.geometry = (mesh.geometry as THREE.BufferGeometry).clone().applyMatrix4(mesh.matrix).applyMatrix4(e.matrix);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        rig.add('head', mesh);
      }
      if (L.extras.includes('earrings')) {
        rig.add('head', at(m(new THREE.TorusGeometry(0.006, 0.0012, 6, 14), flat('#e8c060', { rough: 0.2, metal: 1 })), s * (0.097 * f.width), 0.066, -0.006, 0, Math.PI / 2, 0), { detail: true });
      }
    }

    // Barbe, moustache : bandes de la forme du visage, gonflées, sur la zone pileuse.
    if (L.extras.includes('beard') || L.extras.includes('moustache')) {
      const full = L.extras.includes('beard');
      const beardMat = hairMaterial(L.age > 0.7 ? '#9a9a9a' : L.hair, true);
      if (full) {
        // Des pattes jusqu'au menton : la ligne haute descend des tempes jusque sous la lèvre inférieure.
        const fr = (phi: number) => smooth(0.0, 0.95, Math.sin(phi));
        const beard = this.scalp(
          0.0042,
          (phi) => (Math.sin(phi) < -0.1 ? 0.03 : THREE.MathUtils.lerp(0.1, 0.037, fr(phi) ** 1.5)),
          (phi) => (Math.sin(phi) < -0.1 ? 0.03 : THREE.MathUtils.lerp(0.035, -0.014, fr(phi))),
        );
        rig.add('head', m(beard, beardMat), { weights: (p) => this.headWeights(p) });
      }
      // Moustache : au-dessus de la lèvre, s'affine vers les commissures.
      const mw = (phi: number) => smooth(0.88, 0.99, Math.sin(phi));
      const mo = this.scalp(0.0042, (phi) => THREE.MathUtils.lerp(0.0585, 0.066, mw(phi)), (phi) => THREE.MathUtils.lerp(0.0585, 0.055, mw(phi) ** 0.5));
      keep(mo, (c) => c.z > 0.07);
      rig.add('head', m(mo, beardMat), { weights: (p) => this.headWeights(p) });
    }

    if (L.extras.includes('glasses')) {
      const frame = flat('#15151a', { rough: 0.35, metal: 0.6 });
      for (const s of [-1, 1]) {
        rig.add('head', at(m(new THREE.TorusGeometry(0.0175, 0.0018, 6, 24), frame), s * 0.0335, 0.111, 0.1), { detail: true });
        rig.add('head', at(m(new THREE.CircleGeometry(0.0172, 20), glass('#dfe8ee', 0.18)), s * 0.0335, 0.111, 0.1), { detail: true, noShadow: true });
        rig.add('head', m(tubeGeo([[s * 0.051, 0.113, 0.098], [s * 0.084, 0.112, 0.05], [s * 0.088, 0.106, -0.005], [s * 0.084, 0.09, -0.02]], 0.0013, 4), frame), { detail: true });
      }
      rig.add('head', m(tubeGeo([[-0.016, 0.113, 0.103], [0, 0.116, 0.107], [0.016, 0.113, 0.103]], 0.0015, 4), frame), { detail: true });
    }
  }

  // --- Cheveux et couvre-chefs --------------------------------------------------------------------

  /** Calotte de cheveux qui épouse le crâne jusqu'à une ligne d'implantation. */
  private hairCap(thickness: number, line: (phi: number) => number, curly = false): THREE.Mesh {
    const geo = this.scalp(thickness, () => 0.095 + 0.113, line);
    return m(geo, hairMaterial(this.look.age > 0.75 ? '#a8a8a8' : this.look.hair, curly));
  }

  private buildHair(rig: RigBuilder): void {
    const L = this.look;
    const hair = hairMaterial(L.age > 0.75 ? '#a8a8a8' : L.hair, L.hairStyle === 'curly');
    const standard = (phi: number) => this.hairline(phi);
    const inStandard = (c: THREE.Vector3): boolean => {
      const phi = Math.atan2(c.z, -c.x);
      return c.y > this.hairline(phi < 0 ? phi + Math.PI * 2 : phi);
    };
    const head = (mesh: THREE.Mesh, detail = false) => rig.add('head', mesh, { weights: (p) => this.headWeights(p), detail });
    switch (L.hairStyle) {
      case 'bald':
        break;
      case 'balding':
        // Couronne autour de l'arrière du crâne.
        {
          // Couronne : n'existe qu'à l'arrière et au-dessus des oreilles.
          const h = (phi: number) => smooth(0.25, -0.35, Math.sin(phi));
          head(m(this.scalp(0.003, (phi) => 0.098 + h(phi) * 0.042, (phi) => 0.098 - h(phi) * 0.058), hairMaterial('#a8a8a8')));
        }
        break;
      case 'buzz':
        head(this.hairCap(0.0025, standard));
        break;
      case 'short':
      case 'cap':
      case 'officer-cap':
      case 'beanie':
        head(this.hairCap(L.hairStyle === 'short' ? 0.009 : 0.004, standard));
        if (L.hairStyle === 'short') {
          // Mèches sur le dessus : volume irrégulier.
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2;
            const r = 0.03 + (i % 3) * 0.018;
            const tuft = sphere(0.02, 8, 6);
            tuft.scale(1.2, 0.5, 1.6);
            head(at(m(tuft, hair), Math.cos(a) * r, 0.193 - r * 0.25, Math.sin(a) * r * 0.9 + 0.01, 0.2, a, 0), true);
          }
        }
        // Pattes.
        for (const s of [-1, 1]) head(at(m(boxGeo(0.006, 0.026, 0.012), hair), s * 0.084 * L.face.width, 0.098, 0.03));
        break;
      case 'long': {
        head(this.hairCap(0.01, (phi) => Math.min(this.hairline(phi, 0.168), frontBack(phi, 0.2, 0.02))));
        // Chevelure qui tombe dans le dos, et mèches de part et d'autre du visage.
        const back = lathe([[0.16, 0.098], [0.1, 0.112], [0.02, 0.112], [-0.06, 0.104], [-0.14, 0.09]], 30, 0.95, Math.PI * 0.62, Math.PI * 0.76);
        head(at(m(back, hair), 0, 0.02, -0.01));
        for (const s of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            head(m(tubeGeo([[s * (0.07 + i * 0.006), 0.17, 0.04 - i * 0.01], [s * (0.095 + i * 0.004), 0.1, 0.035 - i * 0.012], [s * (0.09 + i * 0.006), 0.0, 0.02 - i * 0.012], [s * (0.08 + i * 0.008), -0.08, 0.0 - i * 0.012]], 0.012, 8), hair));
          }
        }
        break;
      }
      case 'bun':
      case 'ponytail': {
        head(this.hairCap(0.005, (phi) => this.hairline(phi, 0.172)));
        if (L.hairStyle === 'bun') {
          const bun = sphere(0.04, 18, 14);
          bun.scale(1, 0.85, 0.9);
          head(at(m(bun, hair), 0, 0.17, -0.09));
          head(at(m(new THREE.TorusGeometry(0.03, 0.006, 8, 20), flat('#1a1a1a', { rough: 0.6 })), 0, 0.165, -0.065, 0.4, 0, 0), true);
        } else {
          head(at(m(new THREE.TorusGeometry(0.014, 0.005, 8, 16), flat('#7d1f25', { rough: 0.6 })), 0, 0.145, -0.1, 0.6, 0, 0), true);
          head(m(tubeGeo([[0, 0.145, -0.1], [0, 0.12, -0.135], [0, 0.04, -0.14], [0, -0.04, -0.12]], 0.016, 10), hair));
        }
        break;
      }
      case 'curly': {
        head(this.hairCap(0.012, standard, true));
        // Boucles serrées : des dizaines de petites sphères posées sur la calotte.
        const pts = new THREE.SphereGeometry(0.1, 22, 15);
        const pos = pts.getAttribute('position');
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i);
          p.y += 0.095;
          this.headShape(p, 0.014);
          if (!inStandard(p)) continue;
          const curl = sphere(0.0082 + ((i * 7) % 5) * 0.001, 7, 5);
          head(at(m(curl, hair), p.x + (((i * 13) % 7) - 3) * 0.0008, p.y, p.z), (i % 3) !== 0);
        }
        break;
      }
      case 'hood':
        head(this.hairCap(0.003, standard));
        break;
    }
    this.buildHat(rig);
  }

  private buildHat(rig: RigBuilder): void {
    const L = this.look;
    const hatMat = (kind: FabricKind) => fabric(L.hat ?? L.top, kind);
    const add = (mesh: THREE.Mesh, detail = false) => rig.add('head', mesh, { detail });
    switch (L.hairStyle) {
      case 'cap': {
        const mat = hatMat('canvas');
        add(m(this.scalp(0.013, () => 0.212, (phi) => frontBack(phi, 0.142, 0.112)), mat));
        add(m(this.scalp(0.0145, (phi) => frontBack(phi, 0.152, 0.124), (phi) => frontBack(phi, 0.141, 0.111)), mat), true);
        // Panneaux cousus, bouton sommital, visière courbe, œillets.
        add(at(m(sphere(0.008, 10, 8), mat), 0, 0.229, -0.008));
        // Visière : un croissant qui part du bord de la calotte, arrondi sur les côtés.
        const vs = new THREE.Shape();
        vs.absarc(0, 0, 0.1, Math.PI * 0.15, Math.PI * 0.85, false);
        vs.absarc(0, 0.0754, 0.0926, Math.PI + 0.34, -0.34, true);
        const visor = new THREE.ExtrudeGeometry(vs, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 20 });
        visor.rotateX(Math.PI / 2);
        sculpt(visor, (p) => {
          p.y -= Math.pow(p.x / 0.1, 2) * 0.03;
        });
        add(at(m(visor, mat), 0, 0.143, 0.0, -0.18, 0, 0));
        if (L.label) {
          const tex = signTexture([L.label === 'MARC' ? 'LUMIÈRE' : L.label], L.hat ?? '#1b2233', '#f0e8d0', 256, 96);
          const patch = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
          add(at(m(new THREE.PlaneGeometry(0.06, 0.022), patch), 0, 0.18, 0.098, -0.25, 0, 0), true);
        }
        break;
      }
      case 'officer-cap': {
        const mat = hatMat('wool');
        add(at(m(cylinder(0.104 * L.face.width, 0.106 * L.face.width, 0.045, 32), mat), 0, 0.172, 0));
        add(at(m(cylinder(0.106 * L.face.width, 0.106 * L.face.width, 0.022, 32, true), flat('#0b0b0d', { rough: 0.3 })), 0, 0.16, 0));
        const top = cylinder(0.135, 0.11, 0.035, 32);
        top.scale(1, 1, 1.08);
        add(at(m(top, mat), 0, 0.208, -0.005, 0.08, 0, 0));
        add(at(m(new THREE.CircleGeometry(0.135, 32), mat), 0, 0.226, -0.004, -Math.PI / 2 + 0.08, 0, 0));
        const visor = new THREE.CylinderGeometry(0.11, 0.11, 0.005, 32, 1, false, -Math.PI * 0.4, Math.PI * 0.8);
        sculpt(visor, (p) => {
          const r = Math.hypot(p.x, p.z);
          p.z += Math.max(0, r - 0.07) * 0.5;
        });
        add(at(m(visor, flat('#08080a', { rough: 0.12, metal: 0.2 })), 0, 0.15, 0.02, 0.32, 0, 0));
        add(m(tubeGeo([[-0.095, 0.155, 0.04], [0, 0.152, 0.112], [0.095, 0.155, 0.04]], 0.0022, 5), flat('#d8b24a', { rough: 0.25, metal: 1 })), true);
        // Écusson : une étoile dorée sur fond de cocarde.
        add(at(m(new THREE.CircleGeometry(0.016, 20), flat('#d8b24a', { rough: 0.25, metal: 1 })), 0, 0.19, 0.112, -0.1, 0, 0), true);
        const star = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          const r = i % 2 === 0 ? 0.012 : 0.005;
          if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        add(at(m(new THREE.ExtrudeGeometry(star, { depth: 0.002, bevelEnabled: false }), flat('#1d3f9a', { rough: 0.4 })), 0, 0.19, 0.113, -0.1, 0, 0), true);
        break;
      }
      case 'beanie': {
        const mat = hatMat('knit');
        add(m(this.scalp(0.013, () => 0.212, (phi) => frontBack(phi, 0.15, 0.1)), mat));
        add(m(this.scalp(0.021, (phi) => frontBack(phi, 0.185, 0.14), (phi) => frontBack(phi, 0.148, 0.098)), mat));
        add(at(m(sphere(0.022, 10, 8), mat), 0, 0.226, -0.03), true);
        break;
      }
      case 'hood': {
        const mat = fabric(L.top, 'cotton').clone();
        mat.side = THREE.DoubleSide;
        const hood = new THREE.SphereGeometry(0.128, 36, 22, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.7);
        hood.scale(0.95, 1.12, 1.1);
        add(at(m(hood, mat), 0, 0.1, -0.01));
        const rim = new THREE.TorusGeometry(0.092, 0.008, 8, 30, Math.PI * 1.2);
        rim.rotateZ(-Math.PI * 0.1);
        rim.scale(1, 1.25, 1);
        add(at(m(rim, mat), 0, 0.11, 0.085, -0.25, 0, 0));
        break;
      }
      default:
        break;
    }
    if (L.extras.includes('headphones')) {
      const black = flat('#16171a', { rough: 0.4, metal: 0.2 });
      // Autour du cou.
      for (const s of [-1, 1]) {
        rig.add('neck', at(m(cylinder(0.034, 0.034, 0.024, 20), black), s * 0.07, 0.02, 0.03, 0, 0, Math.PI / 2), { detail: true });
        rig.add('neck', at(m(cylinder(0.03, 0.03, 0.026, 20), fabric('#2a2a2e', 'leather')), s * 0.058, 0.02, 0.03, 0, 0, Math.PI / 2), { detail: true });
      }
      rig.add('neck', m(tubeGeo([[-0.07, 0.03, 0.03], [-0.06, 0.0, -0.06], [0, -0.03, -0.09], [0.06, 0.0, -0.06], [0.07, 0.03, 0.03]], 0.008, 6), black), { detail: true });
    }
  }

  // --- Vêtements -----------------------------------------------------------------------------------

  private sleeveMaterial(): THREE.Material {
    const L = this.look;
    return L.jacket ? fabric(L.jacket.color, L.jacket.fabric) : fabric(L.top, L.topFabric);
  }

  private pantsMaterial(): THREE.Material {
    const L = this.look;
    return fabric(L.pants, L.pantsKind === 'jeans' ? 'denim' : L.pantsKind === 'cargo' ? 'canvas' : 'suit');
  }

  private buildClothes(rig: RigBuilder): void {
    const L = this.look;
    const top = fabric(L.top, L.topFabric);
    const torso = (mesh: THREE.Mesh, detail = false) => rig.add('hips', mesh, { weights: (p) => this.torsoWeights(p), detail });
    const stitch = flat(new THREE.Color(L.top).multiplyScalar(0.6).getStyle(), { rough: 0.9 });
    const tucked = L.topKind === 'shirt' || L.topKind === 'uniform' || L.topKind === 'blouse' || L.topKind === 'polo';
    const hem = tucked ? 0.03 : L.topKind === 'hoodie' ? -0.08 : -0.05;

    // Haut du corps.
    torso(m(this.torsoGeo(hem, 0.565, tucked ? 1.01 : 1.035), top));
    if (!tucked) {
      // Ourlet côtelé (sweat, pull) ou simple.
      const band = this.torsoGeo(hem - 0.005, hem + (L.topKind === 'tshirt' ? 0.01 : 0.04), 1.05);
      torso(m(band, L.topKind === 'tshirt' ? top : fabric(L.top, 'knit')));
    }

    // Col et encolure selon le vêtement.
    const neckRing = (r: number, tube: number, mat: THREE.Material, y = 0.555) => {
      const ring = new THREE.TorusGeometry(r, tube, 8, 32);
      ring.rotateX(Math.PI / 2 + 0.25);
      ring.scale(1, 1, 0.95);
      torso(at(m(ring, mat), 0, y, 0.006));
    };
    switch (L.topKind) {
      case 'tshirt':
      case 'sweater':
        neckRing(0.06, L.topKind === 'sweater' ? 0.012 : 0.006, L.topKind === 'sweater' ? fabric(L.top, 'knit') : top);
        break;
      case 'hoodie': {
        neckRing(0.062, 0.01, top);
        // Capuche rabattue dans le dos, cordons, poche kangourou.
        if (L.hairStyle !== 'hood') {
          const hood = new THREE.SphereGeometry(0.11, 24, 12, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.2, Math.PI * 0.5);
          hood.scale(1.1, 0.7, 0.9);
          const hoodMat = top.clone();
          hoodMat.side = THREE.DoubleSide;
          torso(at(m(hood, hoodMat), 0, 0.53, -0.09, -0.3, 0, 0));
        }
        const front = this.torsoPoint(0, 0.06, 1, 0.004);
        const pouch = slabGeo(0.2, 0.11, 0.008, 0.02);
        torso(at(m(pouch, top), 0, front.y, front.z + 0.004, -0.08, 0, 0));
        for (const s of [-1, 1]) {
          const p = this.torsoPoint(s * 0.025, 0.5, 1, 0.006);
          torso(m(tubeGeo([[p.x, p.y, p.z], [p.x + s * 0.004, p.y - 0.08, p.z + 0.012], [p.x, p.y - 0.17, p.z + 0.01]], 0.003, 5), flat('#e8e8e4', { rough: 0.8 })), true);
          torso(at(m(cylinder(0.004, 0.004, 0.018, 6), flat('#c0c0c4', { metal: 0.8, rough: 0.3 })), p.x, p.y - 0.18, p.z + 0.01), true);
        }
        break;
      }
      case 'shirt':
      case 'uniform':
      case 'blouse':
      case 'polo': {
        // Col à pointes : deux rabats.
        for (const s of [-1, 1]) {
          const flap = new THREE.Shape();
          flap.moveTo(0, 0);
          flap.lineTo(s * 0.05, 0.012);
          flap.lineTo(s * 0.03, -0.048);
          flap.lineTo(0, -0.018);
          const g = new THREE.ExtrudeGeometry(flap, { depth: 0.003, bevelEnabled: false });
          torso(at(m(g, top), s * 0.012, 0.575, 0.05, -0.55, s * 0.35, 0));
        }
        neckRing(0.058, 0.009, top, 0.565);
        // Patte de boutonnage et boutons.
        const buttons = L.topKind === 'polo' ? 3 : 6;
        const btn = flat(L.topKind === 'uniform' ? '#c8ccd2' : '#f2efe6', { rough: 0.3, metal: L.topKind === 'uniform' ? 0.8 : 0 });
        for (let i = 0; i < buttons; i++) {
          const y = 0.52 - i * (L.topKind === 'polo' ? 0.035 : 0.075);
          if (y < 0.05) continue;
          const p = this.torsoPoint(0, y, 1, 0.004);
          torso(at(m(cylinder(0.0055, 0.0055, 0.0025, 12), btn), p.x, p.y, p.z, Math.PI / 2, 0, 0), true);
        }
        const p0 = this.torsoPoint(0, 0.53, 1, 0.002);
        const p1 = this.torsoPoint(0, L.topKind === 'polo' ? 0.42 : 0.05, 1, 0.002);
        torso(m(tubeGeo([[0.01, p0.y, p0.z], [0.01, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 + 0.004], [0.01, p1.y, p1.z]], 0.0012, 4), stitch), true);
        // Poches de poitrine (deux à rabat pour un uniforme).
        const pockets = L.topKind === 'uniform' ? [-1, 1] : L.topKind === 'shirt' ? [-1] : [];
        for (const s of pockets) {
          const p = this.torsoPoint(s * 0.075, 0.38, 1, 0.004);
          torso(at(m(slabGeo(0.065, 0.075, 0.004, 0.006), top), p.x, p.y, p.z, -0.12, s * 0.25, 0), true);
          if (L.topKind === 'uniform') {
            torso(at(m(slabGeo(0.068, 0.024, 0.005, 0.004), top), p.x, p.y + 0.038, p.z + 0.004, -0.15, s * 0.25, 0), true);
            torso(at(m(cylinder(0.004, 0.004, 0.003, 10), btn), p.x, p.y + 0.032, p.z + 0.009, Math.PI / 2 - 0.15, 0, 0), true);
          }
        }
        if (L.topKind === 'polo') {
          const p = this.torsoPoint(-0.075, 0.4, 1, 0.003);
          torso(at(m(new THREE.CircleGeometry(0.012, 12), flat('#1f6b3c')), p.x, p.y, p.z, -0.1, -0.25, 0), true);
        }
        break;
      }
    }

    // Coutures d'épaules.
    for (const s of [-1, 1]) {
      const a = this.torsoPoint(s * 0.06, 0.545, 1, 0.002);
      torso(m(tubeGeo([[a.x, a.y, a.z - 0.02], [s * 0.12, 0.51, 0.0], [s * 0.17, 0.47, -0.01]], 0.0012, 4), stitch), true);
    }

    // Manchettes aux poignets (manches longues).
    if (!L.shortSleeves || L.jacket) {
      for (const s of ['L', 'R'] as const) {
        const cuffMat = L.topKind === 'hoodie' || L.topKind === 'sweater' ? fabric(L.top, 'knit') : top;
        rig.add(`elbow${s}`, at(m(cylinder(0.03, 0.031, 0.03, 20, true), cuffMat), 0, -0.235, 0), { detail: false });
        if (L.topKind === 'shirt' || L.topKind === 'uniform') rig.add(`elbow${s}`, at(m(cylinder(0.004, 0.004, 0.003, 8), flat('#f2efe6')), 0.025, -0.235, 0.012, 0, 0, Math.PI / 2), { detail: true });
      }
    }

    if (L.jacket) this.buildJacket(rig);
    this.buildPants(rig);
    this.buildShoes(rig);
  }

  private buildJacket(rig: RigBuilder): void {
    const L = this.look;
    const J = L.jacket;
    if (!J) return;
    const mat = fabric(J.color, J.fabric);
    const torso = (mesh: THREE.Mesh, detail = false) => rig.add('hips', mesh, { weights: (p) => this.torsoWeights(p), detail });
    const long = J.kind === 'coat';
    const bottom = long ? -0.42 : J.kind === 'bomber' ? -0.04 : -0.12;
    const gap = J.kind === 'leather' || J.kind === 'bomber' ? 0.32 : 0.5;
    // Veste ouverte devant : une révolution sans le secteur frontal.
    torso(m(this.torsoGeo(bottom, 0.56, 1.075, gap / 2, Math.PI * 2 - gap), mat));
    if (long) {
      // Pans du manteau qui descendent sur les cuisses.
      const skirt = lathe([[-0.04, 0.17], [-0.25, 0.2], [-0.46, 0.22]], 30, 0.7, gap / 2, Math.PI * 2 - gap);
      torso(m(skirt, mat));
    }
    if (J.kind === 'bomber') {
      torso(m(this.torsoGeo(bottom - 0.01, bottom + 0.035, 1.1, gap / 2, Math.PI * 2 - gap), fabric(J.color, 'knit')));
      const col = new THREE.TorusGeometry(0.065, 0.012, 8, 30);
      col.rotateX(Math.PI / 2 + 0.25);
      torso(at(m(col, fabric(J.color, 'knit')), 0, 0.56, 0.0));
      // Fermeture éclair ouverte, de chaque côté.
      for (const s of [-1, 1]) {
        const a = this.torsoPoint(s * 0.06, 0.5, 1, 0.02);
        const b = this.torsoPoint(s * 0.07, bottom + 0.04, 1, 0.025);
        torso(m(tubeGeo([[a.x, a.y, a.z], [b.x, b.y, b.z]], 0.003, 4), flat('#b8bcc2', { metal: 0.9, rough: 0.3 })), true);
      }
    } else {
      // Revers : deux triangles rabattus sur la poitrine.
      for (const s of [-1, 1]) {
        const lapel = new THREE.Shape();
        lapel.moveTo(0, 0);
        lapel.lineTo(s * 0.06, 0.03);
        lapel.lineTo(s * 0.045, -0.06);
        lapel.lineTo(s * 0.01, -0.2);
        const g = new THREE.ExtrudeGeometry(lapel, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 });
        const p = this.torsoPoint(s * 0.055, 0.5, 1, 0.022);
        torso(at(m(g, mat), p.x - s * 0.035, p.y + 0.04, p.z - 0.004, -0.18, s * 0.3, 0));
      }
      // Boutons et poches à rabat.
      const btn = flat(J.kind === 'blazer' ? '#c8a050' : '#15151a', { rough: 0.3, metal: J.kind === 'blazer' ? 0.9 : 0.2 });
      for (const y of [0.18, 0.06]) {
        const p = this.torsoPoint(0.11, y, 1, 0.025);
        torso(at(m(cylinder(0.008, 0.008, 0.004, 14), btn), p.x - 0.03, p.y, p.z, Math.PI / 2, 0, 0), true);
      }
      for (const s of [-1, 1]) {
        const p = this.torsoPoint(s * 0.11, 0.0, 1, 0.024);
        torso(at(m(slabGeo(0.1, 0.028, 0.005, 0.004), mat), p.x, p.y, p.z, -0.05, s * 0.45, 0), true);
      }
      if (L.extras.includes('pocket-square')) {
        const p = this.torsoPoint(-0.1, 0.4, 1, 0.024);
        torso(at(m(new THREE.ConeGeometry(0.012, 0.025, 3), flat('#7d1f25', { rough: 0.6 })), p.x, p.y + 0.015, p.z, 0, 0.3, 0), true);
        torso(at(m(boxGeo(0.06, 0.003, 0.006), mat), p.x, p.y, p.z), true);
      }
    }
    // Manches : un peu plus amples que le bras.
    for (const s of ['L', 'R'] as const) {
      const sleeve = lathe([[0.04, 0.064], [-0.1, 0.059], [-0.27, 0.052]], 20, 0.96);
      rig.add(`arm${s}`, m(sleeve, mat), { weights: (p) => [[`arm${s}`, 0.6 + 0.4 * smooth(0, 0.06, -p.y)], [`shoulder${s}`, 0.4 - 0.4 * smooth(0, 0.06, -p.y)]] });
      const fore = lathe([[0.03, 0.054], [-0.12, 0.05], [-0.22, 0.042]], 20, 0.92);
      rig.add(`elbow${s}`, m(fore, mat), { weights: blendTop(`elbow${s}`, `arm${s}`, 0.07) });
    }
    if (L.extras.includes('hivis')) {
      const band = fabric('#d8e23a', 'nylon');
      band.emissive = new THREE.Color('#5a6410');
      for (const y of [0.1, 0.32]) torso(m(this.torsoGeo(y, y + 0.03, 1.09, gap / 2, Math.PI * 2 - gap), band));
      for (const s of ['L', 'R'] as const) rig.add(`elbow${s}`, at(m(cylinder(0.052, 0.052, 0.025, 20, true), band), 0, -0.08, 0));
    }
  }

  private buildPants(rig: RigBuilder): void {
    const L = this.look;
    const torso = (mesh: THREE.Mesh, detail = false) => rig.add('hips', mesh, { weights: (p) => this.torsoWeights(p), detail });
    const pm = this.pantsMaterial();
    if (L.pantsKind === 'skirt') {
      const skirt = sculpt(lathe([[0.07, 0.17], [0.0, 0.18], [-0.15, 0.2], [-0.32, 0.22], [-0.42, 0.23]], 36, 0.72), (p) => {
        p.y += 0.003 * Math.sin(Math.atan2(p.x, p.z) * 12);
      });
      torso(m(skirt, pm));
      return;
    }
    // Ceinture, boucle, passants.
    // Ceinture visible seulement si le haut est rentré dans le pantalon.
    const tucked = L.topKind === 'shirt' || L.topKind === 'uniform' || L.topKind === 'blouse' || L.topKind === 'polo';
    const belt = this.look.extras.includes('duty-belt') || !tucked ? null : fabric('#2a1d14', 'leather');
    if (belt) {
      torso(m(this.torsoGeo(0.02, 0.05, 1.04), belt));
      const p = this.torsoPoint(0, 0.035, 1, 0.012);
      torso(at(m(slabGeo(0.04, 0.032, 0.006, 0.004), flat('#b8bcc2', { metal: 1, rough: 0.25 })), p.x, p.y, p.z), true);
      for (const x of [-0.12, -0.06, 0.06, 0.12]) {
        const q = this.torsoPoint(x, 0.035, 1, 0.012);
        torso(at(m(boxGeo(0.01, 0.04, 0.004), pm), q.x, q.y, q.z, 0, Math.atan2(q.x, q.z), 0), true);
      }
    }
    // Poches arrière, coutures, braguette.
    for (const s of [-1, 1]) {
      const p = this.torsoPoint(s * 0.075, -0.03, -1, 0.003);
      torso(at(m(slabGeo(0.075, 0.085, 0.003, 0.012), pm), p.x, p.y, p.z, 0.15, Math.PI + s * 0.25, 0), true);
    }
    const stitchColor = L.pantsKind === 'jeans' ? '#c8873a' : new THREE.Color(L.pants).multiplyScalar(0.6).getStyle();
    const st = flat(stitchColor, { rough: 0.9 });
    const fly0 = this.torsoPoint(0.012, 0.02, 1, 0.002);
    const fly1 = this.torsoPoint(0.012, -0.08, 1, 0.002);
    torso(m(tubeGeo([[fly0.x, fly0.y, fly0.z], [fly1.x, fly1.y, fly1.z], [0, fly1.y - 0.01, fly1.z]], 0.0012, 4), st), true);
    for (const s of [-1, 1]) {
      const a = this.torsoPoint(s * 0.09, 0.02, 1, 0.002);
      const b = this.torsoPoint(s * 0.14, -0.04, 1, 0.002);
      torso(m(tubeGeo([[a.x, a.y, a.z], [s * 0.12, -0.0, (a.z + b.z) / 2 + 0.004], [b.x, b.y, b.z]], 0.0012, 4), st), true);
    }
    if (L.pantsKind === 'jeans') {
      for (const s of [-1, 1]) {
        const r = this.torsoPoint(s * 0.09, 0.015, 1, 0.003);
        torso(at(m(cylinder(0.003, 0.003, 0.002, 8), flat('#c8a050', { metal: 1, rough: 0.3 })), r.x, r.y, r.z, Math.PI / 2, 0, 0), true);
      }
    }
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      // Couture extérieure de la jambe, ourlet au-dessus de la chaussure.
      rig.add(`leg${s}`, m(tubeGeo([[side * 0.088, 0, 0], [side * 0.08, -0.2, 0.0], [side * 0.058, -0.42, 0]], 0.0012, 4), st), { weights: blendTop(`leg${s}`, 'hips', 0.12), detail: true });
      rig.add(`knee${s}`, at(m(cylinder(0.042, 0.046, 0.035, 20, true), pm), 0, -0.39, 0), {});
      if (L.pantsKind === 'cargo') {
        rig.add(`leg${s}`, at(m(slabGeo(0.08, 0.1, 0.02, 0.01), pm), side * 0.075, -0.2, 0.012, 0, side * (Math.PI / 2 - 0.2), 0), { detail: false });
        rig.add(`leg${s}`, at(m(slabGeo(0.082, 0.03, 0.022, 0.006), pm), side * 0.077, -0.15, 0.012, 0, side * (Math.PI / 2 - 0.2), 0), { detail: true });
      }
    }
  }

  private buildShoes(rig: RigBuilder): void {
    const L = this.look;
    const kind = L.shoeKind;
    const upperMat = kind === 'sneaker' ? fabric(L.shoes, 'canvas') : fabric(L.shoes, 'leather');
    const soleMat = flat(kind === 'sneaker' ? '#f2f0ea' : '#151515', { rough: 0.85 });
    for (const s of ['L', 'R'] as const) {
      const side = s === 'L' ? -1 : 1;
      const w = kind === 'heel' ? 0.075 : kind === 'boot' ? 0.105 : 0.098;
      // Empeigne sculptée : large à l'avant, cambrée, pointe arrondie.
      const upper = sculpt(new THREE.BoxGeometry(w, 0.075, 0.25, 6, 4, 12), (p) => {
        const t = (p.z + 0.125) / 0.25;
        p.x *= 0.82 + 0.25 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.85);
        if (t > 0.6) p.y -= (t - 0.6) * (p.y + 0.0375) * 0.9;
        if (t < 0.15) p.x *= 0.9;
        const ax = Math.abs(p.x);
        p.y -= Math.pow(ax / w, 2) * 0.02 * (p.y > 0 ? 1 : 0);
        p.x += side * 0.004 * t;
      });
      const shoe = new THREE.Group();
      shoe.add(at(m(upper, upperMat), 0, -0.034, 0.07));
      // Semelle et talon.
      const sole = slabGeo(w + 0.006, 0.26, kind === 'boot' ? 0.028 : 0.022, 0.04);
      sole.rotateX(Math.PI / 2);
      shoe.add(at(m(sole, soleMat), 0, -0.075, 0.07));
      if (kind === 'heel') shoe.add(at(m(cylinder(0.008, 0.012, 0.07, 10), soleMat), 0, -0.1, -0.04));
      if (kind === 'boot') shoe.add(at(m(cylinder(0.05, 0.052, 0.14, 20), upperMat), 0, 0.03, 0.0));
      for (const part of [...shoe.children]) {
        const mesh = part as THREE.Mesh;
        rig.add(`foot${s}`, at(mesh, mesh.position.x, mesh.position.y + (kind === 'heel' ? 0.02 : 0), mesh.position.z), {
          weights: (p) => [[`foot${s}`, 1 - smooth(0.13, 0.19, p.z)], [`toe${s}`, smooth(0.13, 0.19, p.z)]],
        });
      }
      // Lacets croisés, œillets, languette.
      if (kind !== 'heel') {
        const lace = flat(kind === 'sneaker' ? '#f4f2ec' : '#111', { rough: 0.8 });
        for (let i = 0; i < 5; i++) {
          const z = 0.07 + i * 0.022;
          const y = 0.004 - i * 0.006;
          rig.add(`foot${s}`, m(tubeGeo([[-0.022, y, z], [0, y + 0.003, z + 0.011], [0.022, y, z + 0.022]], 0.0016, 4), lace), { detail: true });
          rig.add(`foot${s}`, m(tubeGeo([[0.022, y, z], [0, y + 0.003, z + 0.011], [-0.022, y, z + 0.022]], 0.0016, 4), lace), { detail: true });
        }
        rig.add(`foot${s}`, at(m(slabGeo(0.04, 0.07, 0.004, 0.012), upperMat), 0, 0.015, 0.075, -1.1, 0, 0), { detail: true });
        if (kind === 'sneaker') {
          const stripe = flat(L.shoes === '#ececec' || L.shoes === '#e8e8e4' ? '#c0392b' : '#f2f0ea', { rough: 0.6 });
          rig.add(`foot${s}`, at(m(tubeGeo([[0, -0.05, 0.0], [0, -0.035, 0.07], [0, -0.05, 0.14]], 0.004, 4), stripe), side * (w / 2 + 0.001), 0, 0), { detail: true });
        }
      }
    }
  }

  // --- Accessoires ---------------------------------------------------------------------------------

  private buildAccessories(rig: RigBuilder): void {
    const L = this.look;
    const has = (e: Extra) => L.extras.includes(e);
    const torso = (mesh: THREE.Mesh, detail = false) => rig.add('hips', mesh, { weights: (p) => this.torsoWeights(p), detail });
    const black = fabric('#111214', 'leather');
    const gold = flat('#e0bc5a', { rough: 0.2, metal: 1 });
    const silver = flat('#c8ccd2', { rough: 0.25, metal: 1 });
    const label = (text: string, bg: string, fg: string, w: number, h: number) =>
      new THREE.MeshStandardMaterial({ map: signTexture([text], bg, fg, 256, Math.round((256 * h) / w)), roughness: 0.7 });

    if (has('apron')) {
      const apron = fabric('#1f6b3c', 'canvas');
      const front = lathe([[0.44, 0.15], [0.3, 0.17], [0.1, 0.165], [-0.1, 0.18], [-0.32, 0.2]], 24, 0.66, -0.85, 1.7);
      torso(m(front, apron));
      const p = this.torsoPoint(0, -0.05, 1, 0.025);
      torso(at(m(slabGeo(0.2, 0.09, 0.004, 0.008), apron), p.x, p.y, p.z + 0.012), true);
      torso(at(m(cylinder(0.004, 0.004, 0.12, 8), flat('#2a6fb0', { rough: 0.4 })), p.x + 0.06, p.y + 0.06, p.z + 0.016), true);
      torso(at(m(boxGeo(0.003, 0.03, 0.003), silver), p.x + 0.06, p.y + 0.09, p.z + 0.02), true);
      for (const s of [-1, 1]) torso(m(tubeGeo([[s * 0.06, 0.44, 0.1], [s * 0.05, 0.53, 0.04], [0, 0.585, -0.03]], 0.006, 5), apron));
      torso(m(tubeGeo([[-0.17, 0.06, 0.0], [-0.12, 0.06, -0.09], [0, 0.06, -0.11], [0.12, 0.06, -0.09], [0.17, 0.06, 0.0]], 0.006, 5), apron));
    }
    if (has('nametag') || has('patches-security') || has('patches-police')) {
      const p = this.torsoPoint(0.075, 0.43, 1, L.jacket ? 0.03 : 0.006);
      const text = has('patches-police') ? 'POLICE' : L.label ?? 'STAFF';
      const bg = has('patches-police') ? '#16203a' : has('patches-security') ? '#111' : '#f4f1e6';
      const fg = has('patches-police') || has('patches-security') ? '#f2f2f2' : '#1a1a1a';
      torso(at(m(new THREE.PlaneGeometry(0.075, 0.02), label(text, bg, fg, 0.075, 0.02)), p.x, p.y, p.z, -0.1, 0.3, 0), true);
    }
    if (has('patches-security') || has('patches-police')) {
      // Écussons d'épaule.
      for (const s of ['L', 'R'] as const) {
        const side = s === 'L' ? -1 : 1;
        const tex = has('patches-police') ? label('POLICE', '#16203a', '#e8c060', 0.06, 0.07) : label('SÉCU', '#111', '#e8e8e8', 0.06, 0.07);
        rig.add(`arm${s}`, at(m(new THREE.CircleGeometry(0.03, 20), tex), side * 0.058, -0.08, 0, 0, side * Math.PI / 2, 0), { detail: true });
      }
    }
    if (has('epaulettes')) for (const s of [-1, 1]) torso(at(m(slabGeo(0.05, 0.11, 0.006, 0.01), fabric(L.top, 'cotton')), s * 0.12, 0.535, -0.01, -Math.PI / 2 + 0.25, 0, s * 0.2));
    if (has('badge')) {
      const p = this.torsoPoint(-0.08, 0.42, 1, has('tactical-vest') ? 0.03 : 0.007);
      const shield = new THREE.Shape();
      shield.moveTo(0, 0.022);
      shield.lineTo(0.017, 0.014);
      shield.lineTo(0.015, -0.01);
      shield.lineTo(0, -0.024);
      shield.lineTo(-0.015, -0.01);
      shield.lineTo(-0.017, 0.014);
      torso(at(m(new THREE.ExtrudeGeometry(shield, { depth: 0.002, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 1 }), gold), p.x, p.y, p.z, -0.1, -0.3, 0), true);
    }
    if (has('tie')) {
      const tieMat = fabric('#7d1f25', 'suit');
      const k = this.torsoPoint(0, 0.535, 1, 0.012);
      const knot = sphere(0.014, 10, 8);
      knot.scale(1, 1.2, 0.7);
      torso(at(m(knot, tieMat), k.x, k.y, k.z));
      const blade = new THREE.Shape();
      blade.moveTo(-0.01, 0);
      blade.lineTo(0.01, 0);
      blade.lineTo(0.024, -0.38);
      blade.lineTo(0, -0.41);
      blade.lineTo(-0.024, -0.38);
      const g = new THREE.ExtrudeGeometry(blade, { depth: 0.003, bevelEnabled: false });
      sculpt(g, (p) => {
        const y = 0.52 + p.y;
        p.z += this.torsoPoint(0, Math.max(0.06, y), 1, 0.008).z - k.z;
      });
      torso(at(m(g, tieMat), 0, k.y - 0.012, k.z));
      const clip = this.torsoPoint(0, 0.33, 1, 0.013);
      torso(at(m(boxGeo(0.04, 0.004, 0.004), gold), clip.x, clip.y, clip.z), true);
    }
    if (has('tactical-vest')) {
      const vest = fabric('#14161b', 'nylon');
      torso(m(this.torsoGeo(0.06, 0.52, 1.13), vest));
      for (const x of [-0.1, -0.035, 0.035, 0.1]) {
        const p = this.torsoPoint(x, 0.16, 1, 0.035);
        torso(at(m(slabGeo(0.055, 0.09, 0.03, 0.008), vest), p.x, p.y, p.z, 0, Math.atan2(p.x, p.z) * 0.6, 0));
        torso(at(m(slabGeo(0.057, 0.025, 0.033, 0.006), vest), p.x, p.y + 0.042, p.z + 0.002, 0, Math.atan2(p.x, p.z) * 0.6, 0), true);
      }
      const back = this.torsoPoint(0, 0.38, -1, 0.032);
      torso(at(m(new THREE.PlaneGeometry(0.22, 0.06), label('POLICE', '#14161b', '#e8ecf4', 0.22, 0.06)), back.x, back.y, back.z, 0, Math.PI, 0), true);
      const front = this.torsoPoint(0, 0.4, 1, 0.032);
      torso(at(m(new THREE.PlaneGeometry(0.14, 0.035), label('POLICE', '#14161b', '#e8ecf4', 0.14, 0.035)), front.x, front.y, front.z), true);
      for (const s of [-1, 1]) torso(at(m(slabGeo(0.06, 0.16, 0.01, 0.01), vest), s * 0.09, 0.53, 0.0, -Math.PI / 2 + 0.2, 0, s * 0.15));
    }
    if (has('radio')) {
      const p = this.torsoPoint(-0.12, 0.45, 1, has('tactical-vest') ? 0.04 : L.jacket ? 0.03 : 0.012);
      torso(at(m(slabGeo(0.042, 0.075, 0.025, 0.006), black), p.x, p.y, p.z, -0.2, -0.4, 0));
      torso(at(m(cylinder(0.004, 0.004, 0.05, 6), black), p.x - 0.01, p.y + 0.06, p.z), true);
      torso(at(m(new THREE.CircleGeometry(0.009, 10), flat('#2a2a2a', { rough: 0.9 })), p.x + 0.004, p.y, p.z + 0.016, -0.2, -0.4, 0), true);
      torso(m(tubeGeo([[p.x, p.y - 0.04, p.z], [p.x + 0.02, p.y - 0.15, p.z + 0.01], [-0.15, 0.1, 0.06], [-0.16, 0.05, -0.02]], 0.0025, 4), black), true);
    }
    if (has('duty-belt')) {
      torso(m(this.torsoGeo(0.005, 0.06, 1.1), black));
      const buckle = this.torsoPoint(0, 0.033, 1, 0.02);
      torso(at(m(slabGeo(0.05, 0.04, 0.006, 0.004), silver), buckle.x, buckle.y, buckle.z), true);
      // Étui avec la crosse du pistolet, porte-chargeurs, menottes, matraque.
      const hol = this.torsoPoint(0.17, 0.0, 1, 0.01);
      torso(at(m(slabGeo(0.05, 0.18, 0.045, 0.012), black), hol.x + 0.01, hol.y - 0.04, hol.z - 0.02, 0, 0.9, 0));
      // Canon vers le bas, crosse vers le haut et l'arrière.
      const holstered = makePistol();
      holstered.scale.setScalar(0.95);
      holstered.rotation.set(Math.PI / 2 + 0.2, 0, 0);
      holstered.updateMatrixWorld(true);
      holstered.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
        const mesh = m(g, o.material as THREE.Material);
        at(mesh, hol.x + 0.01, hol.y + 0.03, hol.z - 0.02, 0, 0.9, 0);
        torso(mesh, true);
      });
      for (const x of [-0.05, -0.1]) {
        const p = this.torsoPoint(x, 0.03, 1, 0.025);
        torso(at(m(slabGeo(0.028, 0.06, 0.02, 0.005), black), p.x, p.y, p.z, 0, Math.atan2(p.x, p.z), 0), true);
      }
      const cuffs = this.torsoPoint(-0.14, 0.03, -1, 0.03);
      torso(at(m(slabGeo(0.06, 0.05, 0.03, 0.006), black), cuffs.x, cuffs.y, cuffs.z, 0, Math.atan2(cuffs.x, cuffs.z), 0), true);
      const baton = this.torsoPoint(-0.17, 0.0, 1, 0.02);
      torso(at(m(cylinder(0.012, 0.014, 0.46, 10), black), baton.x, baton.y - 0.12, baton.z - 0.03, 0.1, 0, -0.08));
    }
    if (has('lanyard')) {
      torso(m(tubeGeo([[-0.06, 0.55, 0.04], [-0.05, 0.42, 0.12], [0, 0.3, 0.13], [0.05, 0.42, 0.12], [0.06, 0.55, 0.04], [0, 0.58, -0.05], [-0.06, 0.55, 0.04]], 0.003, 4, false), flat('#1d3f9a', { rough: 0.7 })), true);
      const p = this.torsoPoint(0, 0.28, 1, 0.012);
      torso(at(m(slabGeo(0.055, 0.08, 0.002, 0.006), label('BCC', '#f4f2ec', '#1d3f9a', 0.055, 0.08)), p.x, p.y, p.z, -0.05, 0, 0), true);
    }
    if (has('chain')) {
      // Une vraie chaîne : des maillons qui s'entrelacent.
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.07, 0.55, 0.0), new THREE.Vector3(-0.05, 0.47, 0.1), new THREE.Vector3(0, 0.42, 0.13), new THREE.Vector3(0.05, 0.47, 0.1), new THREE.Vector3(0.07, 0.55, 0.0)]);
      const n = 34;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const link = new THREE.TorusGeometry(0.006, 0.0018, 5, 10);
        const mesh = m(link, gold);
        mesh.position.copy(p);
        mesh.lookAt(p.clone().add(tan));
        mesh.rotateZ(i % 2 ? Math.PI / 2 : 0);
        torso(mesh, true);
      }
      const pendant = this.torsoPoint(0, 0.4, 1, 0.012);
      torso(at(m(new THREE.OctahedronGeometry(0.013), gold), pendant.x, pendant.y, pendant.z), true);
    }
    if (has('scarf')) {
      const sc = fabric(L.hat ?? '#7d1f25', 'knit');
      const ring = new THREE.TorusGeometry(0.075, 0.025, 10, 28);
      ring.rotateX(Math.PI / 2 + 0.2);
      torso(at(m(ring, sc), 0, 0.56, 0.01));
      torso(at(m(slabGeo(0.06, 0.3, 0.012, 0.01), sc), 0.04, 0.42, 0.12, -0.15, 0, 0.08));
      for (let i = 0; i < 6; i++) torso(at(m(cylinder(0.002, 0.002, 0.03, 4), sc), 0.02 + i * 0.008, 0.26, 0.135), true);
    }
    if (has('watch') || has('gold-watch')) {
      const strap = has('gold-watch') ? gold : fabric('#2a1d14', 'leather');
      const ring = new THREE.TorusGeometry(0.03, 0.005, 6, 20);
      ring.rotateX(Math.PI / 2);
      ring.scale(1, 1, 0.85);
      rig.add('elbowL', at(m(ring, strap), 0, -0.22, 0), { detail: true });
      rig.add('elbowL', at(m(cylinder(0.014, 0.014, 0.008, 20), has('gold-watch') ? gold : silver), -0.031, -0.22, 0, 0, 0, Math.PI / 2), { detail: true });
      rig.add('elbowL', at(m(new THREE.CircleGeometry(0.0115, 20), flat('#f4f2ec', { rough: 0.2 })), -0.0355, -0.22, 0, 0, -Math.PI / 2, 0), { detail: true });
    }
    if (has('rings')) {
      for (const [s, f] of [['L', 'r'], ['R', 'i']] as const) rig.add(`${s}${f}0`, at(m(new THREE.TorusGeometry(0.0095, 0.0018, 6, 14), gold), 0, -0.012, 0, Math.PI / 2, 0, 0), { detail: true });
    }
    if (has('backpack')) {
      const bag = fabric(['#2a3a5a', '#5a2a2a', '#2a2a2a', '#4a5a3a'][L.top.length % 4] ?? '#2a2a2a', 'nylon');
      const p = this.torsoPoint(0, 0.33, -1, 0.07);
      torso(at(m(slabGeo(0.28, 0.38, 0.13, 0.05), bag), p.x, p.y, p.z));
      torso(at(m(slabGeo(0.22, 0.14, 0.04, 0.03), bag), p.x, p.y - 0.09, p.z - 0.08));
      torso(m(tubeGeo([[p.x - 0.12, p.y + 0.16, p.z - 0.07], [p.x, p.y + 0.21, p.z - 0.075], [p.x + 0.12, p.y + 0.16, p.z - 0.07]], 0.003, 4), flat('#c8ccd2', { metal: 0.9 })), true);
      for (const s of [-1, 1]) torso(m(tubeGeo([[s * 0.08, p.y + 0.17, p.z + 0.03], [s * 0.1, 0.56, 0.03], [s * 0.11, 0.45, 0.13], [s * 0.12, 0.25, 0.1], [s * 0.13, 0.17, p.z + 0.05]], 0.012, 6), bag));
    }
    if (has('handbag')) {
      const leather = fabric(['#5a2a1a', '#1a1a1a', '#8a6a4a'][L.top.length % 3] ?? '#5a2a1a', 'leather');
      rig.add('armL', at(m(slabGeo(0.24, 0.18, 0.09, 0.03), leather), -0.09, -0.3, 0.0, 0, Math.PI / 2, 0));
      rig.add('armL', m(tubeGeo([[-0.06, -0.21, 0.06], [-0.03, -0.05, 0.02], [-0.06, -0.21, -0.06]], 0.006, 5), leather));
      rig.add('armL', at(m(boxGeo(0.03, 0.02, 0.01), gold), -0.136, -0.26, 0.0, 0, Math.PI / 2, 0), { detail: true });
    }
  }

  private buildFlashlight(): void {
    const torch = new THREE.Group();
    const body = flat('#1c1d20', { rough: 0.5, metal: 0.6 });
    torch.add(at(m(cylinder(0.017, 0.017, 0.16, 12), body), 0, 0, 0.06, Math.PI / 2, 0, 0));
    torch.add(at(m(cylinder(0.028, 0.019, 0.05, 14), body), 0, 0, 0.16, Math.PI / 2, 0, 0));
    torch.add(at(m(cylinder(0.024, 0.024, 0.004, 14), flat('#fff6d8', { emissive: '#fff0b0', glow: 3 })), 0, 0, 0.187, Math.PI / 2, 0, 0));
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const cone = m(new THREE.ConeGeometry(1.5, 7, 24, 1, true), beamMat);
    at(cone, 0, 0, 3.7, -Math.PI / 2, 0, 0);
    torch.add(cone);
    this.beam = cone;
    at(torch, 0.02, -0.11, 0.0, 0, 0, 0);
    this.joints.handL.add(torch);
  }

  // --- Animation ---------------------------------------------------------------------------------

  /** Affiche ou masque les détails fins (selon la distance à la caméra). */
  setDetail(on: boolean): void {
    for (const d of this.detailMeshes) d.visible = on;
  }

  /**
   * Place et anime le personnage. `facing` est la direction dans le plan (0 = +x, π/2 = +z).
   * `speed` (m/s) règle l'allure de la marche.
   */
  update(dt: number, x: number, z: number, facing: number, pose: PoseName, speed = 1.4): void {
    this.time += dt;
    const L = this.look;
    this.root.position.set(x, 0, z);
    const target = Math.PI / 2 - facing;
    let diff = (target - this.root.rotation.y) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y += diff * Math.min(1, dt * 9);

    const t = this.time;
    const p: Pose = {};
    const e: Expression = { jaw: 0.02, brows: 0, lids: 0, gripL: 0.35, gripR: 0.35, spreadL: 0.05, spreadR: 0.05 };
    let drop = 0;
    const g = L.gait;
    const lean = L.posture;
    const walking = pose === 'walk' || pose === 'run' || pose === 'search';

    if (walking) {
      const run = pose === 'run';
      this.phase += dt * (run ? 10.5 : 6.4) * Math.max(0.6, speed / (run ? 4.5 : 1.4));
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const amp = (run ? 0.9 : 0.45) * g;
      // Jambes : attaque du talon, déroulé, poussée sur la pointe.
      p.legL = [-s * amp, 0, -0.02];
      p.legR = [s * amp, 0, 0.02];
      p.kneeL = [Math.max(0, c) * amp * (run ? 1.9 : 1.35) + 0.06, 0, 0];
      p.kneeR = [Math.max(0, -c) * amp * (run ? 1.9 : 1.35) + 0.06, 0, 0];
      p.footL = [-0.2 * Math.max(0, s) + 0.35 * Math.max(0, -s) * Math.max(0, c), 0, 0];
      p.footR = [-0.2 * Math.max(0, -s) + 0.35 * Math.max(0, s) * Math.max(0, -c), 0, 0];
      p.toeL = [-0.4 * Math.max(0, -s) * Math.max(0, -c), 0, 0];
      p.toeR = [-0.4 * Math.max(0, s) * Math.max(0, c), 0, 0];
      // Bassin qui tourne et bascule, buste en contre-rotation, bras en balancier.
      p.hips = [0, s * 0.1 * g, c * 0.035];
      p.spine = [(run ? 0.2 : 0.03) + lean, -s * 0.05, 0];
      p.chest = [0, -s * 0.09 * g, -c * 0.02];
      p.neck = [0, s * 0.04, 0];
      p.armL = [s * amp * 0.8, 0, -0.08];
      p.armR = [-s * amp * 0.8, 0, 0.08];
      p.elbowL = [run ? -1.45 : -0.18 - Math.max(0, s) * 0.35, 0, 0];
      p.elbowR = [run ? -1.45 : -0.18 - Math.max(0, -s) * 0.35, 0, 0];
      p.handL = [0, run ? 0 : 0.3, 0.1];
      p.handR = [0, run ? 0 : -0.3, -0.1];
      e.gripL = e.gripR = run ? 0.9 : 0.4;
      drop = Math.abs(c) * (run ? 0.05 : 0.022) - (run ? 0.04 : 0);
      if (pose === 'search') {
        p.armL = [-1.2, 0.1, 0.15];
        p.elbowL = [-0.4, 0, 0];
        p.handL = [0, 0, 0];
        e.gripL = 0.85;
        p.neck = [0.05, Math.sin(t * 0.9) * 0.45, 0];
      }
    } else {
      // Au repos : respiration, report du poids d'une jambe sur l'autre, regard qui flâne.
      const breath = Math.sin(t * 1.6) * 0.014;
      const shift = Math.sin(t * 0.25 + this.phase) * 0.5 + 0.5;
      p.hips = [0, 0, (shift - 0.5) * 0.06];
      p.legL = [0, 0, (0.5 - shift) * 0.06 - 0.02];
      p.legR = [0, 0, (0.5 - shift) * 0.06 + 0.02];
      p.kneeL = [shift * 0.12, 0, 0];
      p.kneeR = [(1 - shift) * 0.12, 0, 0];
      p.spine = [lean, 0, (shift - 0.5) * -0.04];
      p.chest = [breath, 0, 0];
      p.shoulderL = [0, 0, breath * 0.5];
      p.shoulderR = [0, 0, -breath * 0.5];
      p.neck = [lean * -0.5, Math.sin(t * 0.33 + this.phase) * 0.25, 0];
      this.idlePose(p, e, t);
    }

    switch (pose) {
      case 'hands-up': {
        const shake = Math.sin(t * 24) * 0.025;
        p.shoulderL = [0, 0, -0.18];
        p.shoulderR = [0, 0, 0.18];
        p.armL = [-0.15, 0, -2.45 + shake];
        p.armR = [-0.15, 0, 2.45 - shake];
        p.elbowL = [-0.35, 0, -0.35];
        p.elbowR = [-0.35, 0, 0.35];
        p.handL = [0, 0, 0];
        p.handR = [0, 0, 0];
        p.neck = [0.12, 0, 0];
        p.spine = [-0.06, 0, 0];
        e.gripL = e.gripR = 0;
        e.spreadL = e.spreadR = 0.5;
        e.jaw = 0.22 + Math.sin(t * 3) * 0.04;
        e.brows = 1;
        e.lids = -0.3;
        break;
      }
      case 'phone':
        p.armR = [-0.5, 0, 0.45];
        p.elbowR = [-2.35, 0, 0];
        p.handR = [0, -0.5, 0];
        p.armL = [-0.3 + Math.sin(t * 2) * 0.15, 0, -0.15];
        p.elbowL = [-0.9, 0, 0];
        p.neck = [0.05, -0.25, 0.15];
        p.spine = [0.1 + lean, 0, 0];
        e.gripR = 0.7;
        e.gripL = 0.2;
        e.jaw = 0.06 + Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3)) * 0.12;
        e.brows = 0.7;
        break;
      case 'smoke': {
        const cycle = (t * 0.22) % 1;
        const drag = smooth(0.0, 0.12, cycle) * (1 - smooth(0.28, 0.4, cycle));
        p.armR = [-0.3 - drag * 0.45, 0, 0.18 + drag * 0.25];
        p.elbowR = [-0.65 - drag * 1.75, 0, 0];
        p.handR = [0, -0.3 * drag, 0];
        p.armL = [0.05, 0, -0.2];
        p.elbowL = [-1.6, 0, 0];
        p.handL = [0, 0, 0];
        p.spine = [-0.06 + lean, 0, 0];
        p.legL = [0, 0, -0.08];
        e.gripR = 0.5;
        e.gripL = 0.6;
        e.lids = drag * 0.4;
        if (cycle > 0.45 && cycle < 0.62) e.jaw = 0.07;
        if (cycle > 0.45 && cycle < 0.62 && Math.random() < dt * 25) this.puff();
        break;
      }
      case 'aim':
        p.armR = [-1.5, -0.15, 0.12];
        p.elbowR = [-0.06, 0, 0];
        p.handR = [0, 0, 0];
        p.armL = [-1.38, 0.55, -0.12];
        p.elbowL = [-0.55, 0, 0];
        p.handL = [0, 0.3, 0];
        p.neck = [0.06, 0, 0.08];
        p.spine = [0.1, 0.1, 0];
        p.legL = [-0.22, 0, -0.1];
        p.legR = [0.22, 0, 0.08];
        p.kneeL = [0.3, 0, 0];
        p.kneeR = [0.18, 0, 0];
        e.gripR = 0.85;
        e.gripL = 0.75;
        e.brows = -0.8;
        e.lids = 0.18;
        drop = 0.04;
        break;
      case 'cower': {
        const tremble = Math.sin(t * 30) * 0.02;
        p.legL = [-1.55, 0, -0.12];
        p.legR = [-1.55, 0, 0.12];
        p.kneeL = [2.45, 0, 0];
        p.kneeR = [2.45, 0, 0];
        p.footL = [-0.8, 0, 0];
        p.footR = [-0.8, 0, 0];
        p.spine = [0.7 + tremble, 0, 0];
        p.chest = [0.2, 0, 0];
        p.armL = [-2.4, 0, 0.55];
        p.armR = [-2.4, 0, -0.55];
        p.elbowL = [-2.0, 0, 0];
        p.elbowR = [-2.0, 0, 0];
        p.neck = [0.55, 0, 0];
        e.gripL = e.gripR = 0.2;
        e.brows = 1;
        e.lids = 0.4;
        e.jaw = 0.12;
        drop = 0.5;
        break;
      }
      case 'down': {
        const v = (L.label?.length ?? 0) + Math.round(L.build * 10);
        p.armL = [0.3, 0, -1.2 - (v % 3) * 0.2];
        p.armR = [-0.25, 0, 0.8];
        p.elbowL = [-0.5, 0, 0];
        p.elbowR = [-1.0, 0, 0];
        p.legL = [0.1, 0, -0.25];
        p.legR = [-0.35, 0, 0.2];
        p.kneeR = [0.8, 0, 0];
        p.neck = [0, 0.8, 0];
        e.gripL = e.gripR = 0.5;
        e.lids = 1;
        e.jaw = 0.1;
        break;
      }
      default:
        break;
    }

    // Glissement vers la pose cible.
    const k = Math.min(1, dt * (pose === 'down' ? 6 : 11));
    for (const name of JOINTS) {
      const bone = this.joints[name];
      if (name === 'base' || name === 'jaw' || name === 'head') continue;
      const want = p[name] ?? [0, 0, 0];
      bone.rotation.x += (want[0] - bone.rotation.x) * k;
      bone.rotation.y += (want[1] - bone.rotation.y) * k;
      bone.rotation.z += (want[2] - bone.rotation.z) * k;
    }
    this.hipDrop += (drop - this.hipDrop) * k;
    this.joints.hips.position.y = HIP_Y - this.hipDrop;

    // Expressions : on glisse aussi vers la cible.
    const ke = Math.min(1, dt * 8);
    for (const key of Object.keys(e) as (keyof Expression)[]) this.expr[key] += (e[key] - this.expr[key]) * ke;
    this.applyFace(dt, pose);
    this.applyHands();

    // Chute : le corps bascule en arrière et se couche au sol.
    this.fall += ((pose === 'down' ? 1 : 0) - this.fall) * Math.min(1, dt * 4);
    this.joints.base.rotation.x = -this.fall * (Math.PI / 2);
    this.joints.base.position.set(0, this.fall * 0.14, -this.fall * 0.9);

    this.pistol.visible = pose === 'aim';
    this.phone.visible = pose === 'phone';
    this.cigarette.visible = pose === 'smoke';
    if (this.beam) this.beam.visible = pose !== 'down';
    this.updatePuffs(dt);
  }

  /** Attitude au repos, propre à chaque personnage. */
  private idlePose(p: Pose, e: Expression, t: number): void {
    switch (this.look.idle) {
      case 'hands-front':
        p.armL = [-0.32, 0, 0.22];
        p.armR = [-0.32, 0, -0.22];
        p.elbowL = [-0.95, 0.3, 0];
        p.elbowR = [-0.95, -0.3, 0];
        p.handL = [0, 0.4, 0];
        p.handR = [0, -0.4, 0];
        e.gripL = 0.5;
        e.gripR = 0.6;
        break;
      case 'arms-crossed':
        p.armL = [-0.55, 0.3, 0.32];
        p.armR = [-0.5, -0.3, -0.3];
        p.elbowL = [-2.0, 0.3, 0];
        p.elbowR = [-2.1, -0.3, 0];
        p.handL = [0, 0, 0.3];
        p.handR = [0, 0, -0.3];
        e.gripL = e.gripR = 0.6;
        break;
      case 'hands-behind':
        p.armL = [0.42, 0, 0.15];
        p.armR = [0.42, 0, -0.15];
        p.elbowL = [-0.75, -0.3, 0];
        p.elbowR = [-0.75, 0.3, 0];
        e.gripL = e.gripR = 0.6;
        break;
      case 'pockets':
        p.armL = [0.12, 0, -0.18];
        p.armR = [0.12, 0, 0.18];
        p.elbowL = [-0.5, 0, 0];
        p.elbowR = [-0.5, 0, 0];
        p.handL = [0.2, 0, 0.2];
        p.handR = [0.2, 0, -0.2];
        e.gripL = e.gripR = 0.8;
        break;
      case 'counter':
        p.armL = [-0.55, 0, -0.1];
        p.armR = [-0.55, 0, 0.1];
        p.elbowL = [-0.45, 0, 0];
        p.elbowR = [-0.45, 0, 0];
        p.handL = [0.6, 0, 0];
        p.handR = [0.6, 0, 0];
        p.spine = [0.12 + this.look.posture, 0, 0];
        e.gripL = e.gripR = 0.15;
        break;
      case 'typing': {
        p.armL = [-0.6, 0, -0.06];
        p.armR = [-0.6, 0, 0.06];
        p.elbowL = [-1.0, 0, 0];
        p.elbowR = [-1.0, 0, 0];
        p.handL = [0.9, 0, 0];
        p.handR = [0.9, 0, 0];
        p.neck = [0.22, 0, 0];
        e.gripL = 0.25 + Math.max(0, Math.sin(t * 11)) * 0.25;
        e.gripR = 0.25 + Math.max(0, Math.sin(t * 13 + 1)) * 0.25;
        break;
      }
      case 'belt':
        p.armL = [0.0, 0, -0.38];
        p.armR = [0.0, 0, 0.38];
        p.elbowL = [-1.0, 0.6, 0];
        p.elbowR = [-1.0, -0.6, 0];
        p.handL = [0, 0.3, 0];
        p.handR = [0, -0.3, 0];
        e.gripL = e.gripR = 0.55;
        break;
      default:
        p.armL = [0.04, 0, -0.08];
        p.armR = [0.04, 0, 0.08];
        p.elbowL = [-0.15, 0, 0];
        p.elbowR = [-0.15, 0, 0];
        break;
    }
  }

  /** Regard, tête, clignements, mâchoire et sourcils. */
  private applyFace(dt: number, pose: PoseName): void {
    const ex = this.expr;
    // Tête et yeux tournés vers le point d'intérêt, dans la limite de la nuque.
    let yaw = 0;
    let pitch = 0;
    if (this.gaze && pose !== 'down' && pose !== 'cower') {
      this.gazeLocal.copy(this.gaze);
      this.joints.neck.parent?.worldToLocal(this.gazeLocal);
      this.gazeLocal.sub(this.joints.neck.position).sub(new THREE.Vector3(0, 0.15, 0));
      yaw = Math.atan2(this.gazeLocal.x, this.gazeLocal.z);
      pitch = -Math.atan2(this.gazeLocal.y, Math.hypot(this.gazeLocal.x, this.gazeLocal.z));
      if (Math.abs(yaw) > 1.7) yaw = 0;
      yaw = Math.max(-1.1, Math.min(1.1, yaw));
      pitch = Math.max(-0.5, Math.min(0.5, pitch));
    }
    const kl = Math.min(1, dt * 5);
    this.look2.yaw += (yaw - this.look2.yaw) * kl;
    this.look2.pitch += (pitch - this.look2.pitch) * kl;
    const head = this.joints.head;
    head.rotation.set(this.look2.pitch * 0.7, this.look2.yaw * 0.9, 0);
    // Les yeux devancent la tête.
    for (const eye of this.eyes) eye.rotation.set(this.look2.pitch * 0.4, (yaw - this.look2.yaw) * 0.9 + this.look2.yaw * 0.2, 0);

    // Clignements : brefs, irréguliers, plus fréquents sous le stress.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = (ex.brows > 0.5 ? 0.8 : 2) + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt * 9);
    const closed = Math.min(1, Math.max(ex.lids, Math.sin(this.blink * Math.PI)));
    for (const lid of this.lids) lid.rotation.x = 0.16 + closed * 0.9 + Math.min(0, ex.lids) * 0.3;
    for (const brow of this.brows) {
      brow.position.y = 0.134 + ex.brows * 0.005;
      brow.rotation.z = (brow.position.x < 0 ? -1 : 1) * ex.brows * -0.12;
    }
    this.joints.jaw.rotation.x = ex.jaw;
  }

  /** Doigts : chaque phalange se plie selon la prise de la main. */
  private applyHands(): void {
    const ex = this.expr;
    for (const f of this.fingerBones) {
      const grip = f.side < 0 ? ex.gripL : ex.gripR;
      const spread = f.side < 0 ? ex.spreadL : ex.spreadR;
      f.bones.forEach((bone, i) => {
        if (f.thumb) {
          bone.rotation.set(i === 0 ? 0.5 + grip * 0.3 : grip * 0.5, 0, -f.side * (i === 0 ? 0.3 : grip * 0.6));
        } else {
          const curl = grip * (i === 0 ? 1.2 : i === 1 ? 1.5 : 1.0) + 0.1;
          bone.rotation.set(i === 0 ? spread * (bone.position.z > 0 ? -0.2 : 0.2) : 0, 0, -f.side * curl);
        }
      });
    }
  }

  /** Bouffée de fumée de cigarette. */
  private puff(): void {
    const mat = new THREE.SpriteMaterial({ color: '#c8ccd2', transparent: true, opacity: 0.35, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.04);
    const mouth = new THREE.Vector3(0, 0.05, 0.12);
    this.joints.head.localToWorld(mouth);
    this.root.worldToLocal(mouth);
    sprite.position.copy(mouth);
    this.root.add(sprite);
    this.puffs.push({ sprite, life: 2 });
  }

  private updatePuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      if (!p) continue;
      p.life -= dt;
      p.sprite.position.y += dt * 0.12;
      p.sprite.position.z += dt * 0.08;
      p.sprite.scale.multiplyScalar(1 + dt * 1.2);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life / 2) * 0.35;
      if (p.life <= 0) {
        this.root.remove(p.sprite);
        this.puffs.splice(i, 1);
      }
    }
  }
}
