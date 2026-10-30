// Combattants en modèles 3D animés (Mixamo) : squelette et animations importés, repeints en
// cel-shading (MeshToonMaterial + contour), avec la même interface que CharacterModel pour que la vue,
// les portraits, les icônes et les menus n'aient rien à changer. Les armes et l'équipement des skins
// sont repris du modèle dessiné par le code et accrochés aux os.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterModel, strikeTime } from './model.js';
import { animeMat, extrudeOutlineMat } from './toon.js';
import { AuraFX } from './aura.js';
import { ANIMS_GLB, MODEL_GLB } from '../assets/models/index.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- Chargement --------------------------------------------------------------------------------

const TEMPLATES = {}; // id → { scene, restHips }
const CLIPS = {}; // nom → AnimationClip (pistes nommées d'après les os : « Hips.quaternion »…)
const ANIM_REST = {}; // nom → position de repos du bassin dans le squelette de l'animation
const ANIM_SRC = {}; // nom → { clip (pistes d'origine), root (squelette de l'animation, au repos) }

function parseGlb(loader, bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}

/** Nom d'os sans le suffixe d'unicité ajouté par GLTFLoader (« Hips_3 » → « Hips »). */
const boneName = (n) => n.replace(/^mixamorig\d*[:_]?/, '').replace(/_\d+$/, '');

/**
 * Charge les modèles embarqués (asynchrone). `onProgress(k)` reçoit l'avancement entre 0 et 1.
 * Un modèle illisible est ignoré : le combattant garde alors son modèle dessiné par le code.
 */
export async function loadRiggedModels(onProgress = () => {}) {
  const ids = Object.keys(MODEL_GLB);
  if (!ANIMS_GLB || !ids.length) return;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  const step = () => onProgress(++done / (ids.length + 1));
  try {
    const g = await parseGlb(loader, ANIMS_GLB);
    for (const clip of g.animations) {
      let hipsNode = null;
      const first = clip.tracks.length && g.scene.getObjectByName(clip.tracks[0].name.split('.')[0]);
      let skel = first;
      while (skel && skel.parent && skel.parent !== g.scene) skel = skel.parent;
      ANIM_SRC[clip.name] = { clip: clip.clone(), root: skel || null };
      for (const t of clip.tracks) {
        const [node, prop] = t.name.split('.');
        if (boneName(node) === 'Hips' && prop === 'position') hipsNode = g.scene.getObjectByName(node);
        t.name = `${boneName(node)}.${prop}`;
      }
      CLIPS[clip.name] = clip;
      ANIM_REST[clip.name] = hipsNode ? hipsNode.position.clone() : null;
    }
  } catch (err) {
    console.warn('Animations illisibles, modèles dessinés conservés', err);
    return;
  }
  step();
  for (const id of ids) {
    try {
      const g = await parseGlb(loader, MODEL_GLB[id]);
      g.scene.traverse((o) => { if (o.isBone || o.name) o.name = boneName(o.name); });
      const hips = g.scene.getObjectByName('Hips');
      if (!hips) throw new Error('squelette sans bassin');
      TEMPLATES[id] = { scene: g.scene, restHips: hips.position.clone(), clips: new Map() };
    } catch (err) {
      console.warn(`Modèle « ${id} » illisible, modèle dessiné conservé`, err);
    }
    step();
  }
}

export function hasRiggedModel(id) {
  return !!(TEMPLATES[id] && CLIPS.idle);
}

/** Crée le modèle d'un combattant : animé (Mixamo) s'il est disponible, sinon dessiné par le code. */
export function createCharacterModel(def, opts = {}) {
  if (def && hasRiggedModel(def.id) && !def.monster) {
    try {
      return new RiggedModel(def, opts);
    } catch (err) {
      console.warn(`Modèle animé « ${def.id} » en échec, modèle dessiné utilisé`, err);
    }
  }
  return new CharacterModel(def, opts);
}

/**
 * Animation adaptée à un personnage : on garde les rotations, et la translation du bassin est
 * ramenée à ses proportions (hauteur) et centrée (les déplacements viennent de la simulation).
 */
function clipFor(tpl, name) {
  if (tpl.clips.has(name)) return tpl.clips.get(name);
  const src = CLIPS[name];
  let clip = null;
  if (src) {
    clip = needsRetarget(tpl, name) ? retarget(tpl, name) : src.clone();
    const rest = ANIM_REST[name];
    const k = rest && Math.abs(rest.y) > 1e-6 ? tpl.restHips.y / rest.y : 1;
    for (const t of clip.tracks) {
      if (t.name !== 'Hips.position') continue;
      const v = t.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = tpl.restHips.x;
        v[i + 1] *= k;
        v[i + 2] = tpl.restHips.z;
      }
    }
  }
  tpl.clips.set(name, clip);
  return clip;
}

/** Les os du personnage et ceux de l'animation ont-ils des repères différents au repos ? */
function needsRetarget(tpl, name) {
  const src = ANIM_SRC[name];
  if (!src || !src.root) return false;
  const anim = bonesByName(src.root);
  let worst = 0;
  tpl.scene.traverse((o) => {
    const a = anim.get(o.name);
    if (o.isBone && a) worst = Math.max(worst, o.quaternion.angleTo(a.quaternion));
  });
  return worst > 0.05;
}

function bonesByName(root) {
  const map = new Map();
  root.traverse((o) => { const n = boneName(o.name); if (!map.has(n)) map.set(n, o); });
  return map;
}

/**
 * Reciblage : les squelettes n'ont pas les mêmes repères d'os, on transfère donc, image par image,
 * l'écart à la pose de repos exprimé dans le repère du monde (les deux sont en T-pose au repos).
 */
function retarget(tpl, name) {
  const src = ANIM_SRC[name];
  const animRoot = src.root;
  const anim = bonesByName(animRoot);
  const bones = [];
  tpl.scene.traverse((o) => { if (o.isBone && anim.has(o.name)) bones.push(o); });
  const restA = new Map();
  const restT = new Map();
  animRoot.updateMatrixWorld(true);
  tpl.scene.updateMatrixWorld(true);
  for (const b of bones) {
    restA.set(b.name, anim.get(b.name).getWorldQuaternion(new THREE.Quaternion()));
    restT.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
  }
  const parentRest = new Map(bones.map((b) => [b.name, b.parent.getWorldQuaternion(new THREE.Quaternion())]));
  const saved = new Map([...anim.values()].map((o) => [o, [o.position.clone(), o.quaternion.clone()]]));
  const mixer = new THREE.AnimationMixer(animRoot);
  const act = mixer.clipAction(src.clip);
  act.play();
  const d = src.clip.duration;
  const n = Math.max(2, Math.ceil(d * 30) + 1);
  const times = new Float32Array(n);
  const values = new Map(bones.map((b) => [b.name, new Float32Array(n * 4)]));
  const hipsPos = new Float32Array(n * 3);
  const world = new Map();
  const wa = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const hipsA = anim.get('Hips');
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * d;
    times[i] = t;
    mixer.setTime(t);
    animRoot.updateMatrixWorld(true);
    world.clear();
    for (const b of bones) {
      anim.get(b.name).getWorldQuaternion(wa);
      // Monde cible = (monde anim × repos anim⁻¹) × repos cible
      const wt = wa.clone().multiply(restA.get(b.name).clone().invert()).multiply(restT.get(b.name));
      world.set(b.name, wt);
      const pw = world.get(b.parent.name) || parentRest.get(b.name);
      q.copy(pw).invert().multiply(wt);
      values.get(b.name).set([q.x, q.y, q.z, q.w], i * 4);
    }
    if (hipsA) hipsPos.set([hipsA.position.x, hipsA.position.y, hipsA.position.z], i * 3);
  }
  act.stop();
  mixer.uncacheRoot(animRoot);
  for (const [o, [p, r]] of saved) { o.position.copy(p); o.quaternion.copy(r); }
  const tracks = bones.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values.get(b.name)));
  if (hipsA) tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipsPos));
  return new THREE.AnimationClip(name, d, tracks);
}

// --- Animations ----------------------------------------------------------------------------

// Clip(s) pour chaque animation de coup (characters.js), par ordre de préférence
const MOVE_CLIPS = {
  jab: ['jab', 'cross'], cross: ['cross', 'jab'], hook: ['hook', 'cross', 'jab'], uppercut: ['uppercut', 'hook', 'jab'],
  kick: ['kick', 'spinkick'], spinkick: ['spinkick', 'kick'],
  slash1: ['slash1', 'hook'], slash2: ['slash2', 'slash1', 'hook'], slash3: ['slash3', 'slash1', 'uppercut'],
  thrust: ['thrust', 'slash1', 'jab'], rising: ['rising', 'uppercut', 'slash3'], iai: ['iai', 'slash3', 'slash1'],
  staff1: ['staff1', 'slash1', 'hook'], staff2: ['staff2', 'slash2', 'hook'],
  cast: ['cast', 'fireball'], cast2: ['fireball', 'cast'], beam: ['beam', 'fireball', 'cast'], throw: ['throw', 'fireball', 'jab'],
  palm: ['palm', 'jab'], summon: ['summon', 'cast', 'powerup'], powerup: ['powerup', 'taunt'], slam: ['slam', 'cast', 'uppercut'],
  dash: ['dash', 'run'], charge: ['charge', 'run'], rush: ['rush', 'jab'],
};
// Instant de l'impact dans chaque clip (fraction de sa durée), pour le caler sur la frappe du jeu
const IMPACT = {
  jab: 0.35, cross: 0.4, hook: 0.45, uppercut: 0.45, kick: 0.45, spinkick: 0.5, slash1: 0.4, slash2: 0.4, slash3: 0.45,
  thrust: 0.4, rising: 0.45, iai: 0.4, staff1: 0.4, staff2: 0.4, cast: 0.45, fireball: 0.45, beam: 0.4, throw: 0.45,
  palm: 0.4, summon: 0.5, powerup: 0.4, slam: 0.5, dash: 0.3, charge: 0.3, rush: 0.3, run: 0.3,
};

function firstClip(tpl, names) {
  for (const n of names) {
    const c = clipFor(tpl, n);
    if (c) return c;
  }
  return null;
}

// --- Repères des os -------------------------------------------------------------------------
// Les armes et l'équipement ont été dessinés pour le modèle par code (personnage tourné vers +Z,
// bras le long du corps). On les accroche à des groupes posés sur les os, orientés comme dans
// l'ancien modèle : en T-pose, le bras gauche pointe vers +X (bras « baissés » tournés de 90°).
const DOWN_TO_LEFT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const DOWN_TO_RIGHT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

/** Donneur d'équipement : le modèle dessiné, dont on récupère armes et accessoires de skin. */
class GearDonor extends CharacterModel {
  buildExtras(L, m) {
    this.handStart = [this.handL.children.length, this.handR.children.length];
    super.buildExtras(L, m);
  }

  buildSkinGear(id, m) {
    this.skinStart = new Map([this.head, this.torso, this.hips, this.shL, this.shR].map((g) => [g, g.children.length]));
    super.buildSkinGear(id, m);
  }
}

// --- Modèle ---------------------------------------------------------------------------------

export class RiggedModel {
  /**
   * @param def  définition du personnage (characters.js)
   * @param opts { ghost: true } pour un clone d'ombre (matériaux sombres et translucides)
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.ghost = !!opts.ghost;
    this.rigged = true;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mats = [];
    this.flatMats = [];
    this.time = Math.random() * 10;
    this.dispYaw = null;
    this.transformed = false;
    this.blinkT = 3;
    this.lastFlash = -1;
    this.auraLevel = 0;
    this.tpl = TEMPLATES[def.id];

    // Le modèle dessiné sert d'étalon (taille) et de donneur d'équipement
    const donor = new GearDonor(def, { ghost: this.ghost });
    donor.root.scale.setScalar(1);
    donor.root.updateMatrixWorld(true);
    const donorHead = donor.head.getWorldPosition(new THREE.Vector3());

    this.rig = SkeletonUtils.clone(this.tpl.scene);
    this.body.add(this.rig);
    this.rig.updateMatrixWorld(true);
    const bone = (n) => this.rig.getObjectByName(n);
    this.bones = {
      hips: bone('Hips'), spine: bone('Spine'), chest: bone('Spine2') || bone('Spine1'), head: bone('Head'), top: bone('HeadTop_End'),
      shL: bone('LeftArm'), shR: bone('RightArm'), handL: bone('LeftHand'), handR: bone('RightHand'),
      footL: bone('LeftToeBase') || bone('LeftFoot'), footR: bone('RightToeBase') || bone('RightFoot'),
    };
    // Mise à l'échelle : la base du crâne à la même hauteur que celle du modèle dessiné
    const headY = this.bones.head.getWorldPosition(new THREE.Vector3()).y;
    const box = new THREE.Box3().setFromObject(this.rig);
    const s = donorHead.y / Math.max(1e-4, headY);
    this.rig.scale.multiplyScalar(s);
    this.rig.position.y -= box.min.y * s; // pieds au sol
    this.rig.updateMatrixWorld(true);
    this.height = (box.max.y - box.min.y) * s;

    this.paint(s);
    this.buildProxies();
    this.harvest(donor);
    this.buildAura();
    if (def.look.size) this.root.scale.setScalar(def.look.size);

    this.mixer = new THREE.AnimationMixer(this.rig);
    this.actions = new Map();
    this.cur = null; // { key, action }
    this.setTransformed(false);
  }

  /** Matériaux cel-shadés (texture d'origine conservée), contour d'encre, teinte du skin. */
  paint(scale) {
    const L = this.def.look;
    const tint = this.def.costume ? new THREE.Color(L.top || L.pants || '#ffffff') : null;
    const cache = new Map();
    const meshes = [];
    this.rig.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = list.map((src) => {
        if (cache.has(src)) return cache.get(src);
        let m;
        if (this.ghost) {
          m = new THREE.MeshToonMaterial({ color: new THREE.Color('#2a1446'), transparent: true, opacity: 0.75, emissive: new THREE.Color('#3a1a6a') });
        } else {
          const skinLike = /skin|body|face|head|eye|hair|teeth|mouth/i.test(src.name || '');
          const color = src.map ? new THREE.Color('#ffffff') : (src.color ? src.color.clone() : new THREE.Color('#cccccc'));
          if (tint && !skinLike) color.lerp(tint, 0.45);
          m = animeMat(color, { map: src.map || null, transparent: !!src.transparent, alphaTest: src.alphaTest || 0, side: src.side });
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        }
        m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
        this.mats.push(m);
        cache.set(src, m);
        return m;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // la boîte de la T-pose ne suit pas l'animation
      if (!this.ghost && mesh.isSkinnedMesh) {
        // Contour : copie du maillage, faces arrière, gonflée le long des normales
        const geo = mesh.geometry;
        geo.computeBoundingBox();
        const w = mesh.matrixWorld.getMaxScaleOnAxis() || 1;
        const hull = new THREE.SkinnedMesh(geo, extrudeOutlineMat(0.011 / Math.max(1e-5, w)));
        hull.bind(mesh.skeleton, mesh.bindMatrix);
        hull.frustumCulled = false;
        hull.userData.outline = true;
        mesh.parent.add(hull);
      }
    }
    this.rigScale = scale;
  }

  /** Groupes accrochés aux os, orientés et mis à l'échelle comme les articulations de l'ancien modèle. */
  buildProxies() {
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const make = (b, frame, scale = 1) => {
      const g = new THREE.Group();
      if (!b) { this.body.add(g); return g; }
      const m = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld);
      const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
      m.decompose(pos, q, sc);
      g.quaternion.copy(q.invert()).multiply(frame);
      g.scale.setScalar(scale / sc.x);
      b.add(g);
      return g;
    };
    const I = new THREE.Quaternion();
    const B = this.bones;
    // Taille de la tête : rapport entre le crâne importé et celui du modèle dessiné (≈ 0,33)
    let headK = 0.6;
    if (B.head && B.top) headK = clamp(B.head.getWorldPosition(new THREE.Vector3()).distanceTo(B.top.getWorldPosition(new THREE.Vector3())) / 0.33, 0.35, 1.2);
    this.headScale = headK;
    this.head = make(B.head, I, headK);
    this.torso = make(B.spine, I);
    this.hips = make(B.hips, I);
    this.shL = make(B.shL, DOWN_TO_LEFT);
    this.shR = make(B.shR, DOWN_TO_RIGHT);
    this.handL = make(B.handL, DOWN_TO_LEFT);
    this.handR = make(B.handR, DOWN_TO_RIGHT);
    this.footL = make(B.footL, I);
    this.footR = make(B.footR, I);
  }

  /** Reprend du modèle dessiné les armes (mains) et l'équipement du skin, et les accroche aux os. */
  harvest(donor) {
    const moved = [];
    const take = (from, to, start) => {
      if (start === undefined) return;
      const list = from.children.slice(start);
      for (const o of list) { to.add(o); moved.push(o); }
    };
    if (!this.ghost) {
      if (donor.handStart) {
        take(donor.handL, this.handL, donor.handStart[0]);
        take(donor.handR, this.handR, donor.handStart[1]);
      }
      if (donor.skinStart) {
        const map = new Map([[donor.head, this.head], [donor.torso, this.torso], [donor.hips, this.hips], [donor.shL, this.shL], [donor.shR, this.shR]]);
        for (const [from, start] of donor.skinStart) take(from, map.get(from), start);
      }
      if (donor.talismans) {
        for (const t of donor.talismans) { this.root.add(t); moved.push(t); }
        this.talismans = donor.talismans;
      }
    }
    // L'arme dont la pointe laisse une traînée
    if (donor.tip && moved.some((o) => isInside(donor.tip, o))) this.tip = donor.tip;
    // Chaînes à ressort (rubans, capes de skin) qui ont suivi
    this.chains = donor.chains.filter((ch) => ch.pivots.length && moved.some((o) => isInside(ch.pivots[0].g, o)));
    this.donor = donor;
    // Matériaux des pièces reprises : ils clignotent avec le reste à l'impact
    const keep = new Set();
    for (const o of moved) o.traverse((c) => { if (c.material && !Array.isArray(c.material)) keep.add(c.material); });
    for (const m of donor.mats) if (keep.has(m)) this.mats.push(m);
    for (const m of donor.flatMats || []) if (keep.has(m)) this.flatMats.push(m);
    // Le reste du donneur est libéré
    const movedSet = new Set(moved);
    donor.root.traverse((o) => {
      if (o.geometry && !hasAncestorIn(o, movedSet)) o.geometry.dispose();
    });
    for (const m of donor.mats) if (!keep.has(m)) m.dispose();
    if (donor.auraFx) donor.auraFx.dispose();
  }

  buildAura() {
    this.auraFx = this.ghost ? null : new AuraFX(this);
    this.aura = this.auraFx ? this.auraFx.root : new THREE.Group();
    if (this.auraFx && this.auraFx.eyes) {
      // Yeux lumineux : la tête importée est plus petite, on recale les reflets sur le visage
      for (const e of this.auraFx.eyes) e.position.set(Math.sign(e.position.x) * 0.072, 0.2, 0.2);
    }
  }

  setAuraColor(color) {
    if (this.auraFx) this.auraFx.setColor(color);
  }

  setTransformed(on) {
    if (on === this.transformed) return;
    this.transformed = on;
    this.setAuraColor(on ? this.def.auraAlt || this.def.aura : this.def.aura);
    // Transformation : le personnage s'illumine légèrement à la couleur de l'aura
    this.transformGlow = on ? 0.12 : 0;
    this.lastFlash = -1;
  }

  setFlash(k) {
    const v = k + (this.transformGlow || 0);
    if (this.ghost || v === this.lastFlash) return;
    this.lastFlash = v;
    const glow = this.transformGlow ? new THREE.Color(this.def.auraAlt || this.def.aura).multiplyScalar(this.transformGlow) : null;
    for (const m of this.mats) {
      if (!m.emissive || !m.userData.baseEmissive) continue;
      m.emissive.copy(m.userData.baseEmissive).addScalar(k);
      if (glow) m.emissive.add(glow);
    }
  }

  /** Les visages sont peints dans la texture : pas d'expressions. */
  setExpression() {}

  // --- Animation ----------------------------------------------------------------------------

  action(key, clip, loop = true) {
    let a = this.actions.get(key);
    if (!a) {
      a = this.mixer.clipAction(clip);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      this.actions.set(key, a);
    }
    return a;
  }

  /** Passe à une autre animation, en fondu. `manual` : le temps du clip est piloté à la main. */
  play(key, clip, { loop = true, fade = 0.12, restart = false, manual = false, speed = 1 } = {}) {
    if (!clip) return null;
    const a = this.action(key, clip, loop);
    if (this.cur && this.cur.key === key && !restart) {
      a.timeScale = manual ? 0 : speed;
      return a;
    }
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.timeScale = manual ? 0 : speed;
    a.play();
    if (this.cur && this.cur.action !== a) this.cur.action.crossFadeTo(a, fade, false);
    else if (!this.cur) a.fadeIn(0.01);
    this.cur = { key, action: a };
    return a;
  }

  /** Choisit l'animation selon l'état du combattant. */
  animate(dt, f, extra) {
    const tpl = this.tpl;
    const C = (n) => clipFor(tpl, n);
    const speed = Math.hypot(f.vx, f.vz);
    if (extra.portrait) return this.play('idle', C('idle'), { fade: 0 });
    if (extra.cine) return this.play('cine', firstClip(tpl, ['powerup', 'taunt', 'idle']));
    if (extra.intro && (f.state === 'idle' || f.state === 'walk')) return this.play('intro', firstClip(tpl, ['taunt', 'powerup', 'idle']));
    switch (f.state) {
      case 'move': return this.animateMove(f);
      case 'air': {
        const a = this.play('jump', firstClip(tpl, ['jump', 'idle']), { loop: false, manual: true, fade: 0.08 });
        if (a) {
          // Le saut suit la vitesse verticale : impulsion, sommet, descente
          const d = a.getClip().duration;
          const k = clamp(0.5 - (f.vy || 0) / 24, 0.2, 0.75);
          a.time += (k * d - a.time) * Math.min(1, dt * 12);
        }
        return a;
      }
      case 'land': return this.play('idle', C('idle'), { fade: 0.1 });
      case 'guard':
      case 'blockstun': return this.play('block', firstClip(tpl, ['block', 'idle']), { loop: false, fade: 0.06 });
      case 'dodge': return this.play('dodge', firstClip(tpl, ['dodge', 'run']), { loop: false, fade: 0.05, speed: 1.6 });
      case 'hitstun': {
        if (f.onGround === false) return this.play('knockdown', firstClip(tpl, ['knockdown', 'hit']), { loop: false, fade: 0.06 });
        const fresh = f.st < this.lastSt || this.prevState !== 'hitstun';
        return this.play('hit', firstClip(tpl, ['hit', 'block']), { loop: false, fade: 0.04, restart: fresh, speed: 1.4 });
      }
      case 'dizzy': return this.play('dizzy', firstClip(tpl, ['dizzy', 'hit', 'idle']), { speed: 0.6 });
      case 'knockdown': return this.play('knockdown', firstClip(tpl, ['knockdown', 'ko']), { loop: false, fade: 0.08 });
      case 'getup': return this.play('getup', firstClip(tpl, ['getup', 'idle']), { loop: false, fade: 0.08, speed: 1.5 });
      case 'ko': return this.play('ko', firstClip(tpl, ['ko', 'knockdown']), { loop: false, fade: 0.1 });
      case 'victory': return this.play('victory', firstClip(tpl, ['victory', 'taunt', 'idle']));
      case 'charge': return this.play('charge', firstClip(tpl, ['powerup', 'taunt', 'idle']));
      case 'walk':
      case 'idle':
      default: {
        if (speed > 5.2) return this.play('run', firstClip(tpl, ['run', 'walk', 'idle']), { speed: clamp(speed / 7, 0.7, 1.5) });
        if (speed > 0.4) return this.play('walk', firstClip(tpl, ['walk', 'idle']), { speed: clamp(speed / 3, 0.6, 1.8), fade: 0.18 });
        return this.play('idle', C('idle'), { fade: 0.2 });
      }
    }
  }

  /**
   * Coup : le temps du clip est recalé sur celui du jeu, par morceaux, pour que l'impact du clip
   * tombe exactement à l'instant de la frappe (strikeTime) et que le retour en garde dure le reste du coup.
   */
  animateMove(f) {
    const mv = this.def.moves[f.moveId];
    if (!mv) return this.play('idle', clipFor(this.tpl, 'idle'));
    const names = MOVE_CLIPS[mv.anim] || ['jab'];
    const clip = firstClip(this.tpl, names);
    if (!clip) return this.play('idle', clipFor(this.tpl, 'idle'));
    const key = `move:${f.moveId}`;
    const fresh = this.prevMove !== f.moveId || f.mt < this.prevMt;
    const a = this.play(key, clip, { loop: false, manual: true, restart: fresh, fade: 0.06 });
    const d = clip.duration;
    const name = names.find((n) => clipFor(this.tpl, n) === clip);
    const ci = (IMPACT[name] ?? 0.4) * d;
    const s = strikeTime(mv);
    const holdEnd = mv.hold ? mv.hold[1] : s + Math.min(0.12, mv.dur * 0.25);
    const t = f.mt;
    let ct;
    if (t < s) ct = ci * (t / s);
    else if (t < holdEnd) {
      // Pluie de coups : le clip boucle autour de l'impact ; sinon il se fige au coup
      ct = mv.anim === 'rush' ? ci * 0.6 + ((t - s) * 3 % 1) * ci * 0.8 : ci + Math.min(0.06, t - s);
    } else ct = ci + (d - ci) * clamp((t - holdEnd) / Math.max(0.05, mv.dur - holdEnd), 0, 1);
    a.time = clamp(ct, 0, d - 1e-3);
    return a;
  }

  update(dt, f, extra = {}) {
    this.time += dt;
    this.root.position.set(f.x, f.y, f.z);
    if (this.dispYaw === null) this.dispYaw = f.yaw;
    const dy = Math.atan2(Math.sin(f.yaw - this.dispYaw), Math.cos(f.yaw - this.dispYaw));
    if (Math.abs(dy) > 2.6 && f.state === 'move') this.dispYaw = f.yaw;
    else this.dispYaw += dy * Math.min(1, dt * 16);
    this.root.rotation.y = this.dispYaw;
    this.react = extra.react || null;

    this.animate(dt, f, extra);
    this.mixer.update(dt);
    this.prevState = f.state;
    this.lastSt = f.st;
    this.prevMove = f.state === 'move' ? f.moveId : '';
    this.prevMt = f.state === 'move' ? f.mt : 0;

    // Chaînes à ressort de l'équipement repris
    if (this.chains.length) {
      const yaw = f.yaw;
      const vF = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
      const vS = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
      this.donor.chains = this.chains;
      this.donor.time = this.time;
      this.donor.updateChains(dt, vF, vS, f.vy || 0);
    }

    // Aura (même logique que le modèle dessiné)
    if (this.auraFx) {
      const aura = this.auraTarget(f, extra);
      const full = (f.energy ?? 0) >= 100;
      const ult = f.state === 'move' && f.moveId === 'ultimate';
      const charge = f.state === 'charge' ? 1 : 0;
      let max = 0;
      const mvDef = f.state === 'move' ? this.def.moves[f.moveId] : null;
      const charging = !!(mvDef && mvDef.charging && f.mt >= mvDef.charging[0] && f.mt < mvDef.charging[1]);
      if ((f.state === 'charge' && (f.energy >= 90 || f.transformed)) || (ult && f.mt < 0.5) || charging) max = 1;
      else if (f.transformed) max = 0.3;
      if (extra.cine) max = 0;
      let level = Math.max(aura, full && f.state !== 'ko' ? 0.14 : 0, charging ? 0.6 + 0.4 * Math.min(1, (f.mt - mvDef.charging[0]) / (mvDef.charging[1] - mvDef.charging[0])) : 0);
      if (extra.intro) level = Math.max(level, 0.65);
      if (this.def.boss && f.state !== 'ko') level = Math.max(level, 0.3);
      if (extra.cine) level = Math.min(level, 0.5);
      this.auraFx.update(dt, level, charging ? 1 : charge, max);
      if (extra.cine && this.auraFx.eyeMat) this.auraFx.eyeMat.opacity = 1;
      this.auraLevel = this.auraFx.level;
    }
    if (this.talismans) {
      this.talismans.forEach((tl, i) => {
        const a = this.time * 1.4 + (i * TAU) / 3;
        tl.position.set(Math.sin(a) * 0.75, 1.15 + Math.sin(this.time * 2 + i) * 0.15, Math.cos(a) * 0.75);
        tl.rotation.set(0.2, a + Math.PI / 2, Math.sin(this.time * 3 + i) * 0.3);
      });
    }
    this.setTransformed(!!f.transformed);
    this.setFlash(f.flash > 0 ? 0.45 : 0);
  }

  auraTarget(f, extra) {
    if (extra.cine) return extra.cineShot === 0 ? 0 : 0.7;
    if (f.state === 'charge') return 1;
    if (f.transformed) return 0.55;
    if (f.state === 'move') {
      if (f.moveId === 'ultimate') return 1;
      if (f.moveId === 'special' || f.moveId === 'special2') return 0.8;
    }
    return extra.auraBoost || 0;
  }

  /** Point qui laisse une traînée pendant le coup (main, pied ou arme), selon l'animation. */
  strikeLimb(animName) {
    if (/kick/.test(animName)) return [this.footR];
    if (/slash|thrust|rising|iai|staff/.test(animName)) return [this.tip || this.handR];
    if (animName === 'cross') return [this.handL];
    if (animName === 'rush' || animName === 'slam' || animName === 'cast' || animName === 'beam') return [this.handL, this.handR];
    return [this.handR];
  }

  handWorld(out, right = true) {
    (right ? this.handR : this.handL).getWorldPosition(out);
    return out;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      // La géométrie importée est partagée par tous les clones : seule celle de l'équipement est libérée
      if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    for (const m of this.flatMats) m.dispose();
    if (this.auraFx) this.auraFx.dispose();
  }
}

function isInside(obj, ancestor) {
  for (let o = obj; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

function hasAncestorIn(obj, set) {
  for (let o = obj; o; o = o.parent) if (set.has(o)) return true;
  return false;
}
