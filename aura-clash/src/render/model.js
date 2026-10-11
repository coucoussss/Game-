// Modèles 3D low-poly des combattants, construits entièrement par code, et leur animation
// procédurale : squelette de groupes (hanches → torse → tête, épaules → coudes…), poses-clés
// interpolées, et chaînes à ressort pour les cheveux et les vêtements (écharpe, cape, jupe…).
import * as THREE from 'three';
import { toonMat, toonPart, toonPartSmooth, glowMat, animeMat, GLSL_NOISE } from './toon.js';
import { limbGeo, flareGeo, torsoGeo, headGeo, faceZ, shoeGeo, faceGeo, lockGeo } from './anatomy.js';
import { faceTexture, emblemTexture } from './face.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k * k * (3 - 2 * k);

// --- Poses ----------------------------------------------------------------------------
// Conventions (personnage tourné vers +Z) :
//   épaules/coudes : x négatif = vers l'avant ; z (miroir) : négatif à gauche, positif à droite = vers l'extérieur
//   hanches : x négatif = jambe vers l'avant ; genoux : x positif = plié
//   torse/tête : x positif = penché en avant ; y = rotation (le bras droit avance quand y > 0)

const KEYS = ['body', 'hips', 'torso', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];
const BASE = {
  hy: 0, by: 0, bz: 0,
  body: [0, 0, 0], hips: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0],
  shL: [0, 0, -0.12], elL: [-0.2, 0, 0], shR: [0, 0, 0.12], elR: [-0.2, 0, 0],
  hipL: [0, 0, -0.05], knL: [0.05, 0, 0], hipR: [0, 0, 0.05], knR: [0.05, 0, 0],
};

const STANCES = {
  fists: { hy: -0.08, torso: [0.1, -0.45, 0], head: [0, 0.4, 0], shL: [-1.0, 0.3, -0.2], elL: [-2.0, 0, 0], shR: [-0.6, 0, 0.3], elR: [-2.1, 0, 0], hipL: [-0.4, 0, -0.12], knL: [0.55, 0, 0], hipR: [0.25, 0, 0.12], knR: [0.5, 0, 0] },
  blade: { hy: -0.1, torso: [0.12, -0.35, 0], head: [0, 0.3, 0], shL: [-0.7, 0, -0.1], elL: [-1.1, 0, 0], shR: [-0.8, 0, 0.1], elR: [-0.7, 0, 0], hipL: [-0.45, 0, -0.12], knL: [0.6, 0, 0], hipR: [0.3, 0, 0.12], knR: [0.55, 0, 0] },
  staff: { hy: -0.03, torso: [0.05, -0.15, 0], head: [0, 0.15, 0], shL: [-0.5, 0, -0.3], elL: [-1.0, 0, 0], shR: [-0.35, 0, 0.2], elR: [-1.1, 0, 0], hipL: [-0.2, 0, -0.08], knL: [0.25, 0, 0], hipR: [0.15, 0, 0.08], knR: [0.2, 0, 0] },
  ninja: { hy: -0.2, torso: [0.4, -0.2, 0], head: [-0.25, 0.2, 0], shL: [-1.2, 0, -0.5], elL: [-0.7, 0, 0], shR: [0.4, 0, 0.5], elR: [-0.5, 0, 0], hipL: [-0.7, 0, -0.25], knL: [1.2, 0, 0], hipR: [0.35, 0, 0.25], knR: [1.0, 0, 0] },
  priestess: { hy: -0.02, torso: [0.02, 0, 0], head: [0.05, 0, 0], shL: [-0.7, 0, -0.1], elL: [-1.4, 0, 0], shR: [-0.7, 0, 0.1], elR: [-1.4, 0, 0], hipL: [-0.05, 0, -0.04], knL: [0.1, 0, 0], hipR: [0.05, 0, 0.04], knR: [0.1, 0, 0] },
};

const VICTORY = {
  fists: { torso: [-0.1, 0, 0], head: [-0.25, 0, 0], shR: [-2.95, 0, 0.15], elR: [-0.15, 0, 0], shL: [0.1, 0, -0.4], elL: [-1.6, 0, 0], hipL: [0, 0, -0.15], hipR: [0, 0, 0.15], knL: [0, 0, 0], knR: [0, 0, 0] },
  blade: { torso: [0, 0.5, 0], head: [0, -0.5, 0], shR: [-0.2, 0, 1.1], elR: [-0.1, 0, 0], shL: [0, 0, -0.2], elL: [-0.3, 0, 0], hipL: [-0.1, 0, -0.1], hipR: [0.1, 0, 0.1], knL: [0.1, 0, 0], knR: [0.1, 0, 0] },
  staff: { torso: [-0.1, 0, 0], head: [-0.2, 0, 0], shR: [-2.5, 0, 0.4], elR: [-0.4, 0, 0], shL: [-0.2, 0, -0.6], elL: [-0.4, 0, 0] },
  ninja: { hy: -0.05, torso: [0.1, 0, 0], shL: [-1.4, 0, 0.3], elL: [-1.6, 0, 0], shR: [-1.4, 0, -0.3], elR: [-1.6, 0, 0], hipL: [0, 0, -0.1], hipR: [0, 0, 0.1], knL: [0.1, 0, 0], knR: [0.1, 0, 0] },
  priestess: { torso: [0, 0, 0], head: [-0.15, 0, 0], shL: [-2.4, 0, -0.9], elL: [-0.3, 0, 0], shR: [-2.4, 0, 0.9], elR: [-0.3, 0, 0] },
};

export const ANIMS = {
  jab: { wind: { torso: [0.1, -0.6, 0], shR: [-0.5, 0, 0.3], elR: [-2.2, 0, 0] }, strike: { torso: [0.15, 0.35, 0], head: [0, -0.3, 0], shR: [-1.6, 0, 0.05], elR: [-0.05, 0, 0] } },
  cross: { wind: { torso: [0.1, 0.2, 0], shL: [-0.6, 0, -0.3], elL: [-2.2, 0, 0] }, strike: { torso: [0.15, -0.7, 0], head: [0, 0.6, 0], shL: [-1.6, 0, -0.05], elL: [-0.05, 0, 0] } },
  hook: { wind: { torso: [0.1, -0.7, 0], shR: [-0.4, 0, 0.9], elR: [-1.4, 0, 0] }, strike: { torso: [0.2, 0.6, 0], head: [0, -0.5, 0], shR: [-1.5, 0.9, 0.4], elR: [-1.3, 0, 0] } },
  kick: { wind: { torso: [-0.1, -0.4, 0], hipR: [-0.5, 0, 0.1], knR: [1.6, 0, 0], hipL: [0, 0, -0.1], knL: [0.3, 0, 0] }, strike: { torso: [-0.35, -0.5, 0], hipR: [-1.6, 0, 0.1], knR: [0.05, 0, 0], hipL: [0.1, 0, -0.1], knL: [0.2, 0, 0], shL: [-0.6, 0, -0.8], shR: [-0.4, 0, 0.8], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0] } },
  spinkick: { spin: true, wind: { hipR: [-0.6, 0, 0.2], knR: [1.4, 0, 0] }, strike: { torso: [-0.25, 0, -0.2], hipR: [-0.3, 0, 1.4], knR: [0.1, 0, 0], shL: [-0.3, 0, -1.2], shR: [-0.3, 0, 1.2], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0] } },
  uppercut: { wind: { hy: -0.3, torso: [0.4, -0.4, 0], shR: [0.3, 0, 0.3], elR: [-1.8, 0, 0], knL: [1.0, 0, 0], knR: [1.0, 0, 0], hipL: [-0.7, 0, -0.1], hipR: [0.2, 0, 0.1] }, strike: { hy: 0.12, torso: [-0.25, 0.4, 0], head: [-0.4, 0, 0], shR: [-2.9, 0, 0.15], elR: [-0.3, 0, 0], hipL: [-0.1, 0, 0], knL: [0.1, 0, 0] } },
  cast: { wind: { torso: [-0.1, 0, 0], shL: [-0.3, 0, -0.6], elL: [-1.6, 0, 0], shR: [-0.3, 0, 0.6], elR: [-1.6, 0, 0] }, strike: { torso: [0.2, 0, 0], shL: [-1.55, 0.2, -0.05], elL: [-0.05, 0, 0], shR: [-1.55, -0.2, 0.05], elR: [-0.05, 0, 0] } },
  cast2: { wind: { torso: [0, -0.6, 0], shR: [-0.3, 0, 0.4], elR: [-1.8, 0, 0] }, strike: { torso: [0.1, 0.3, 0], head: [0, -0.3, 0], shR: [-1.6, 0, 0], elR: [0, 0, 0] } },
  beam: { wind: { hy: -0.15, torso: [0.1, -1.0, 0], head: [0, 0.8, 0], shL: [0.2, 0, -0.2], elL: [-1.4, 0, 0], shR: [0.3, 0, 0.3], elR: [-1.4, 0, 0], hipL: [-0.5, 0, -0.3], knL: [0.6, 0, 0], hipR: [0.3, 0, 0.3], knR: [0.5, 0, 0] }, strike: { hy: -0.15, torso: [0.15, 0, 0], head: [0, 0, 0], shL: [-1.55, 0, 0.18], elL: [0, 0, 0], shR: [-1.55, 0, -0.18], elR: [0, 0, 0], hipL: [-0.5, 0, -0.3], knL: [0.6, 0, 0], hipR: [0.4, 0, 0.3], knR: [0.4, 0, 0] } },
  slash1: { arc: 1, wind: { torso: [0, -0.6, 0], shR: [-2.7, 0, 0.5], elR: [-0.6, 0, 0] }, strike: { torso: [0.25, 0.5, 0], shR: [-0.9, 0, -0.7], elR: [-0.2, 0, 0] } },
  slash2: { arc: 2, wind: { torso: [0, 0.5, 0], shR: [-1.3, 0, -1.0], elR: [-0.8, 0, 0] }, strike: { torso: [0.15, -0.6, 0], shR: [-1.4, 0, 1.0], elR: [-0.1, 0, 0] } },
  slash3: { arc: 3, wind: { torso: [-0.2, 0, 0], shR: [-3.0, 0, 0.1], shL: [-2.8, 0, -0.1], elR: [-0.4, 0, 0], elL: [-0.6, 0, 0] }, strike: { hy: -0.15, torso: [0.45, 0, 0], shR: [-0.9, 0, 0.1], shL: [-0.9, 0, -0.1], elR: [0, 0, 0], elL: [-0.3, 0, 0] } },
  thrust: { wind: { torso: [0, -0.6, 0], shR: [-0.4, 0, 0.3], elR: [-1.9, 0, 0] }, strike: { hy: -0.15, torso: [0.35, 0.2, 0], shR: [-1.6, 0, 0], elR: [0, 0, 0], hipL: [-0.9, 0, 0], knL: [0.8, 0, 0], hipR: [0.5, 0, 0], knR: [0.2, 0, 0] } },
  rising: { arc: 4, wind: { hy: -0.3, torso: [0.45, 0.3, 0], shR: [-0.3, 0, -0.8], elR: [-0.3, 0, 0], knL: [1.1, 0, 0], knR: [1.0, 0, 0], hipL: [-0.8, 0, 0], hipR: [0.1, 0, 0] }, strike: { hy: 0.1, torso: [-0.3, -0.3, 0], shR: [-3.0, 0, 0.3], elR: [-0.1, 0, 0] } },
  throw: { wind: { torso: [-0.1, -0.7, 0], shR: [0.6, 0, 0.5], elR: [-1.2, 0, 0] }, strike: { torso: [0.25, 0.5, 0], shR: [-1.7, 0, -0.2], elR: [-0.1, 0, 0] } },
  slam: { wind: { hy: 0.1, torso: [-0.3, 0, 0], shL: [-3.0, 0, -0.3], shR: [-3.0, 0, 0.3], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0], head: [-0.3, 0, 0] }, strike: { hy: -0.4, torso: [0.7, 0, 0], shL: [-1.0, 0, -0.2], shR: [-1.0, 0, 0.2], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipL: [-1.2, 0, -0.3], knL: [1.6, 0, 0], hipR: [0.2, 0, 0.3], knR: [1.4, 0, 0] } },
  palm: { wind: { torso: [0, -0.5, 0], shR: [-0.2, 0, 0.3], elR: [-1.8, 0, 0] }, strike: { hy: -0.12, torso: [0.2, 0.4, 0], shR: [-1.5, 0, 0], elR: [-0.1, 0, 0], hipL: [-0.7, 0, -0.2], knL: [0.7, 0, 0], hipR: [0.4, 0, 0.2], knR: [0.3, 0, 0] } },
  summon: { wind: { torso: [0.2, 0, 0], shL: [-0.6, 0, -0.2], elL: [-1.8, 0, 0], shR: [-0.6, 0, 0.2], elR: [-1.8, 0, 0], head: [0.3, 0, 0] }, strike: { torso: [-0.25, 0, 0], head: [-0.4, 0, 0], shL: [-2.6, 0, -0.7], elL: [-0.2, 0, 0], shR: [-2.6, 0, 0.7], elR: [-0.2, 0, 0] } },
  powerup: { wind: { hy: -0.2, torso: [0.3, 0, 0], head: [0.2, 0, 0], shL: [0.1, 0, -0.4], elL: [-1.3, 0, 0], shR: [0.1, 0, 0.4], elR: [-1.3, 0, 0], hipL: [0, 0, -0.35], hipR: [0, 0, 0.35], knL: [0.5, 0, 0], knR: [0.5, 0, 0] }, strike: { hy: -0.1, torso: [-0.35, 0, 0], head: [-0.5, 0, 0], shL: [0.3, 0, -0.9], elL: [-0.6, 0, 0], shR: [0.3, 0, 0.9], elR: [-0.6, 0, 0], hipL: [0, 0, -0.4], hipR: [0, 0, 0.4], knL: [0.4, 0, 0], knR: [0.4, 0, 0] } },
  dash: { wind: { hy: -0.2, torso: [0.7, 0, 0], head: [-0.4, 0, 0], shL: [0.9, 0, -0.3], shR: [0.9, 0, 0.3], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0] }, strike: { hy: -0.2, torso: [0.8, 0, 0], head: [-0.5, 0, 0], shL: [1.1, 0, -0.3], shR: [-1.6, 0, 0.2], elR: [0, 0, 0], hipL: [-1.0, 0, 0], knL: [1.0, 0, 0], hipR: [0.6, 0, 0], knR: [0.6, 0, 0] } },
  iai: { arc: 5, wind: { hy: -0.3, torso: [0.5, -0.5, 0], shR: [-0.4, 0, -0.6], elR: [-1.4, 0, 0], shL: [-0.2, 0, -0.2], elL: [-1.2, 0, 0], hipL: [-0.9, 0, -0.2], knL: [1.1, 0, 0], hipR: [0.5, 0, 0.2], knR: [0.9, 0, 0] }, strike: { hy: -0.35, torso: [0.6, 0.6, 0], shR: [-1.3, 0, 1.4], elR: [0, 0, 0], shL: [0.3, 0, -0.5], hipL: [-1.0, 0, -0.2], knL: [1.2, 0, 0], hipR: [0.6, 0, 0.2], knR: [0.9, 0, 0] } },
  charge: { wind: { hy: -0.2, torso: [0.6, -0.5, 0], shL: [-0.9, 0, -0.3], elL: [-1.8, 0, 0], shR: [-0.3, 0, 0.3], elR: [-1.5, 0, 0] }, strike: { hy: -0.25, torso: [0.8, -0.7, 0], head: [-0.5, 0.5, 0], shL: [-1.2, 0, -0.2], elL: [-1.9, 0, 0], shR: [-0.2, 0, 0.4], elR: [-1.4, 0, 0], hipL: [-1.0, 0, 0], knL: [0.8, 0, 0], hipR: [0.5, 0, 0], knR: [0.4, 0, 0] } },
  rush: { rush: true, wind: { hy: -0.15, torso: [0.3, 0, 0], shL: [-0.8, 0, -0.2], elL: [-2.0, 0, 0], shR: [-0.8, 0, 0.2], elR: [-2.0, 0, 0] }, strike: { hy: -0.18, torso: [0.3, 0, 0], hipL: [-0.6, 0, -0.3], knL: [0.7, 0, 0], hipR: [0.4, 0, 0.3], knR: [0.5, 0, 0] } },
  staff1: { arc: 1, wind: { torso: [0, -0.6, 0], shR: [-2.4, 0, 0.6], elR: [-0.8, 0, 0] }, strike: { torso: [0.2, 0.5, 0], shR: [-1.0, 0, -0.5], elR: [-0.4, 0, 0] } },
  staff2: { arc: 2, wind: { torso: [0, 0.5, 0], shR: [-1.0, 0, -0.9], elR: [-1.0, 0, 0] }, strike: { torso: [0.15, -0.6, 0], shR: [-1.5, 0, 0.9], elR: [-0.2, 0, 0] } },
};

const LYING = {
  hy: 0, by: 0.17, bz: 0.95, body: [-Math.PI / 2, 0, 0], torso: [0, 0, 0], head: [-0.2, 0.3, 0],
  shL: [-2.7, 0, -0.5], elL: [-0.3, 0, 0], shR: [-0.6, 0, 0.9], elR: [-0.6, 0, 0],
  hipL: [-0.1, 0, -0.2], knL: [0.3, 0, 0], hipR: [-0.4, 0, 0.15], knR: [0.8, 0, 0],
};

function mergePose(...parts) {
  const out = {};
  for (const k of ['hy', 'by', 'bz']) out[k] = BASE[k];
  for (const k of KEYS) out[k] = BASE[k].slice();
  for (const p of parts) {
    if (!p) continue;
    for (const k in p) out[k] = Array.isArray(p[k]) ? p[k].slice() : p[k];
  }
  return out;
}

function lerpPose(a, b, k) {
  const out = {};
  for (const key of ['hy', 'by', 'bz']) out[key] = a[key] + (b[key] - a[key]) * k;
  for (const key of KEYS) {
    const x = a[key];
    const y = b[key];
    out[key] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return out;
}

/** Instant du « coup » dans un mouvement (premier effet), utilisé pour caler l'animation. */
const strikeCache = new WeakMap();
export function strikeTime(mv) {
  if (strikeCache.has(mv)) return strikeCache.get(mv);
  let s = Infinity;
  for (const a of mv.actions) if (a.a !== 'fx' && a.a !== 'sfx' && a.a !== 'shake') s = Math.min(s, a.t);
  if (!Number.isFinite(s)) s = mv.dur * 0.3;
  s = Math.max(0.04, s);
  strikeCache.set(mv, s);
  return s;
}

// --- Shader d'aura ------------------------------------------------------------------------

function auraMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInt: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uInt; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        vec2 q = vec2(cos(a), sin(a)) * 2.2;
        float n = vnoise(q + vec2(0.0, vUv.y * 4.0 - uTime * 4.5)) * 0.65
                + vnoise(q * 2.3 + vec2(3.1, vUv.y * 7.0 - uTime * 7.0)) * 0.35;
        float fade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float rim = 1.0 - abs(dot(vN, vV));
        float flame = smoothstep(0.3, 0.75, n + (1.0 - vUv.y) * 0.3);
        float alpha = flame * fade * (0.15 + rim * 0.8) * uInt;
        gl_FragColor = vec4(uColor * alpha * 0.9, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- Modèle ---------------------------------------------------------------------------------

export class CharacterModel {
  /**
   * @param def  définition du personnage (characters.js)
   * @param opts { ghost: true } pour un clone d'ombre (matériaux sombres et translucides)
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.ghost = !!opts.ghost;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mats = [];
    this.chains = [];
    this.hairMats = [];
    this.topMats = [];
    this.spikes = [];
    this.walkPhase = 0;
    this.loco = { phase: 0, m: 0 };
    this.dispYaw = null;
    this.time = Math.random() * 10;
    this.cur = mergePose(STANCES[def.stance]);
    this.lastVel = new THREE.Vector3();
    this.transformed = false;
    this.build();
    this.buildAura();
  }

  mat(color, extra) {
    let m;
    if (this.ghost) {
      m = new THREE.MeshToonMaterial({ color: new THREE.Color('#2a1446'), transparent: true, opacity: 0.75, emissive: new THREE.Color('#3a1a6a') });
    } else {
      m = animeMat(color, extra);
    }
    m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
    this.mats.push(m);
    return m;
  }

  part(geo, mat, parent, pos = [0, 0, 0], rot = null, outline = 0.016) {
    const mesh = toonPartSmooth(geo, mat, { outline: this.ghost ? 0 : outline });
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }

  /** Matériau sans éclairage (yeux, traits du visage). */
  flat(color) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), polygonOffset: true, polygonOffsetFactor: -2 });
    this.flatMats.push(m);
    return m;
  }

  build() {
    const L = this.def.look;
    const x = L.extras;
    const b = L.build || 1;
    this.scale = b;
    this.flatMats = [];
    const kind = L.body || 'm';
    const skin = this.mat(L.skin);
    const top = this.mat(L.top || L.skin);
    this.topMats.push(top);
    const arms = L.arms && L.arms !== L.skin ? this.mat(L.arms) : skin;
    if (L.arms && L.arms === L.top) this.topMats.push(arms);
    const pants = this.mat(L.pants);
    const boots = this.mat(L.boots || L.pants);
    const beltM = this.mat(L.belt || L.pants);
    const hair = this.mat(L.hair);
    const accent = this.mat(L.accent || L.belt || '#888888');
    const dark = this.mat('#1c1a26');
    this.hairMats.push(hair);
    this.matSkin = skin;
    const armorM = this.mat(L.armor || '#5a6272');
    const m = { skin, top, arms, pants, boots, beltM, hair, accent, dark, armorM, b };

    // --- Bassin et torse ---
    const hips = new THREE.Group();
    hips.position.y = 1.05; // 0,06 + cuisse 0,48 + tibia 0,46 + pied : les pieds touchent le sol
    this.body.add(hips);
    this.hips = hips;
    this.hipsBaseY = hips.position.y;
    const pelvis = this.part(new THREE.SphereGeometry(0.17 * b, 14, 10), pants, hips, [0, -0.02, 0]);
    pelvis.scale.set(1, 0.62, 0.74);

    const torso = new THREE.Group();
    torso.position.y = 0.06;
    hips.add(torso);
    this.torso = torso;
    const chest = this.part(torsoGeo(kind, b), top, torso, [0, -0.06, 0]);
    chest.scale.z = kind === 'f' ? 0.72 : 0.68;
    if (!L.top) this.bareChest(torso, skin, b);
    else if (kind === 'f') {
      for (const s of [-1, 1]) {
        const c = this.part(new THREE.SphereGeometry(0.062, 12, 8), top, torso, [s * 0.062, 0.33, 0.075], null, 0.012);
        c.scale.set(1, 0.85, 0.75);
      }
    }

    // --- Cou et tête ---
    const neck = new THREE.Group();
    neck.position.y = 0.55;
    torso.add(neck);
    this.part(limbGeo(0.055, 0.062, 0.12, { seg: 10 }), skin, neck, [0, 0.1, 0], null, 0.012);
    const head = new THREE.Group();
    head.position.y = 0.1;
    neck.add(head);
    this.head = head;
    const faceSkin = this.mat(L.skin, { face: true });
    const headMesh = this.part(headGeo(0.2), faceSkin, head, [0, 0.13, 0], null, 0.016);
    headMesh.receiveShadow = false; // visage d'anime : jamais sali par l'ombre des cheveux
    for (const s of [-1, 1]) {
      const ear = this.part(new THREE.SphereGeometry(0.04, 8, 6), skin, head, [s * 0.178, 0.12, -0.01], null, 0.01);
      ear.scale.set(0.45, 1, 0.75);
    }
    this.buildFace(head, L);
    this.buildHair(head, L, hair);

    // --- Bras ---
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * (kind === 'f' ? 0.205 : 0.235) * b, 0.46, 0);
      torso.add(sh);
      const ab = kind === 'f' ? 0.85 : 1;
      this.part(new THREE.SphereGeometry(0.088 * b * ab, 12, 10), x.includes('armor') && side > 0 ? armorM : arms, sh, [0, -0.015, 0]);
      this.part(limbGeo(0.068 * b * ab, 0.052 * b * ab, 0.29, { bulge: 0.014 * b * ab, at: 0.45 }), arms, sh, [0, -0.02, 0]);
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      this.part(new THREE.SphereGeometry(0.052 * b * ab, 10, 8), arms, el, [0, 0, 0], null, 0.012);
      const fore = x.includes('bandages') ? this.mat('#f2efe6') : x.includes('armor') ? armorM : arms;
      this.part(limbGeo(0.056 * b * ab, 0.042 * b * ab, 0.26, { bulge: 0.01 * b * ab, at: 0.25 }), fore, el, [0, -0.01, 0]);
      const hand = new THREE.Group();
      hand.position.y = -0.29;
      el.add(hand);
      if (x.includes('gloves')) {
        const g = this.part(new THREE.SphereGeometry(0.1 * b, 14, 10), this.mat(L.gloves || '#d8262f'), hand, [0, -0.03, 0.01]);
        g.scale.set(0.9, 1, 1.05);
        this.part(limbGeo(0.07 * b, 0.075 * b, 0.07), this.mat('#f2f2f2'), hand, [0, 0.05, 0], null, 0.01);
      } else {
        this.buildHand(hand, skin, side, b * ab);
      }
      if (x.includes('wristbands')) this.part(limbGeo(0.058, 0.058, 0.06, { seg: 10 }), beltM, el, [0, -0.2, 0], null, 0.012);
      if (x.includes('sleeves')) {
        // Manche large de kimono / de robe, qui flotte sous le bras
        const sl = this.part(flareGeo(0.085 * b, 0.15 * b, 0.36), L.arms ? arms : top, sh, [0, -0.02, 0], null, 0.012);
        sl.material = sl.material.clone();
        sl.material.side = THREE.DoubleSide;
        this.mats.push(sl.material);
      }
      return { sh, el, hand };
    };
    const A = arm(1);
    const B = arm(-1);
    this.shL = A.sh; this.elL = A.el; this.handL = A.hand;
    this.shR = B.sh; this.elR = B.el; this.handR = B.hand;

    // --- Jambes ---
    const baggy = x.includes('gi') || x.includes('hakama');
    const leg = (side) => {
      const hp = new THREE.Group();
      hp.position.set(side * 0.1 * b, -0.06, 0);
      hips.add(hp);
      this.part(new THREE.SphereGeometry(0.1 * b, 10, 8), pants, hp, [0, 0, 0], null, 0.012);
      const tr = baggy ? 1.3 : 1;
      this.part(limbGeo(0.1 * b * tr, 0.064 * b * tr, 0.48, { bulge: 0.012 * b, at: 0.3 }), pants, hp, [0, 0, 0]);
      const kn = new THREE.Group();
      kn.position.y = -0.48;
      hp.add(kn);
      this.part(new THREE.SphereGeometry(0.068 * b * tr, 10, 8), pants, kn, [0, 0, 0], null, 0.012);
      if (baggy) this.part(flareGeo(0.085 * b, 0.12 * b, 0.34), pants, kn, [0, 0, 0], null, 0.014);
      else this.part(limbGeo(0.068 * b, 0.045 * b, 0.45, { bulge: 0.016 * b, at: 0.3 }), pants, kn, [0, 0, 0]);
      // Botte (ou pied nu) et chaussure
      const bare = x.includes('barefoot');
      const bootM = bare ? skin : boots;
      this.part(limbGeo(0.066 * b, 0.056 * b, 0.18), bootM, kn, [0, -0.27, 0], null, 0.014);
      if (x.includes('armor')) this.part(new THREE.BoxGeometry(0.1, 0.22, 0.06), armorM, kn, [0, -0.2, 0.06], [0.08, 0, 0], 0.012);
      const ft = new THREE.Group();
      ft.position.y = -0.46;
      kn.add(ft);
      this.part(shoeGeo(), bootM, ft, [0, -0.005, 0]);
      if (!bare) this.part(new THREE.BoxGeometry(0.13, 0.025, 0.28), dark, ft, [0, -0.04, 0.045], null, 0.01);
      return { hp, kn, ft };
    };
    const LL = leg(1);
    const LR = leg(-1);
    this.hipL = LL.hp; this.knL = LL.kn;
    this.hipR = LR.hp; this.knR = LR.kn;
    this.footL = LL.ft; this.footR = LR.ft;

    this.buildExtras(L, m);
  }

  /** Torse nu musclé : pectoraux, abdominaux, trapèzes. */
  bareChest(torso, skin, b) {
    for (const s of [-1, 1]) {
      const pec = this.part(new THREE.SphereGeometry(0.105 * b, 14, 10), skin, torso, [s * 0.085 * b, 0.36, 0.07 * b], [0, 0, s * 0.15], 0.012);
      pec.scale.set(1, 0.68, 0.5);
      const trap = this.part(new THREE.SphereGeometry(0.09 * b, 10, 8), skin, torso, [s * 0.1 * b, 0.5, -0.02], null, 0.01);
      trap.scale.set(1.1, 0.6, 0.8);
    }
    for (let r = 0; r < 3; r++) {
      for (const s of [-1, 1]) {
        const ab = this.part(new THREE.SphereGeometry(0.04 * b, 8, 6), skin, torso, [s * 0.042 * b, 0.09 + r * 0.07, 0.1 * b], null, 0.008);
        ab.scale.set(1, 0.8, 0.45);
      }
    }
  }

  /** Main en poing : paume, doigts repliés, pouce. */
  buildHand(hand, skin, side, b) {
    this.part(new THREE.BoxGeometry(0.085 * b, 0.075 * b, 0.07 * b), skin, hand, [0, -0.01, 0], null, 0.01);
    this.part(new THREE.BoxGeometry(0.088 * b, 0.05 * b, 0.075 * b), skin, hand, [0, -0.06, 0.012], [0.3, 0, 0], 0.01);
    this.part(new THREE.BoxGeometry(0.028 * b, 0.06 * b, 0.032 * b), skin, hand, [side * -0.04 * b, -0.03, 0.035], [0, 0, side * 0.4], 0.008);
  }

  buildFace(head, L) {
    const R = 0.2;
    const cy = 0.13; // centre de la sphère de la tête
    if (this.ghost) {
      const eye = glowMat('#ff2a5a', 2.5);
      for (const sd of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.01), eye);
        e.position.set(sd * 0.07, cy - 0.01, faceZ(R, 0.07, -0.01) + 0.004);
        head.add(e);
      }
      return;
    }
    // Visage dessiné (yeux, sourcils, nez, bouche) posé comme un calque sur la tête
    this.faceMat = new THREE.MeshBasicMaterial({
      map: faceTexture(this.def, 'neutral'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.flatMats.push(this.faceMat);
    const face = new THREE.Mesh(faceGeo(R), this.faceMat);
    face.position.y = cy;
    face.renderOrder = 2;
    head.add(face);
    this.expr = 'neutral';
    this.blinkT = 2 + Math.random() * 2;
  }

  /** Change l'expression du visage (neutre, combatif, douleur, K.O., sourire, cligne). */
  setExpression(expr) {
    if (!this.faceMat || expr === this.expr) return;
    this.expr = expr;
    this.faceMat.map = faceTexture(this.def, expr);
  }

  /** Matériau des mèches (dégradé racine → pointe par couleurs de sommet). */
  lockMat(color, main = true) {
    const key = `${color}|${main}`;
    this.lockMats = this.lockMats || new Map();
    if (!this.lockMats.has(key)) {
      const m = this.mat(color, { vertexColors: true });
      m.userData.hairMain = main;
      this.hairMats.push(m);
      this.lockMats.set(key, m);
    }
    return this.lockMats.get(key);
  }

  /** Mèche d'anime (ruban effilé et incurvé) orientée selon (pitch, yaw) depuis le centre de la tête. */
  spike(head, mat, pitch, yaw, len, r = 0.075, dist = 0.13) {
    const g = new THREE.Group();
    g.position.set(0, 0.15, 0);
    g.rotation.set(pitch, yaw, 0, 'YXZ');
    head.add(g);
    const main = mat === this.hairMats[0] || (mat.userData && mat.userData.hairMain);
    const lm = this.ghost ? mat : this.lockMat(`#${mat.color.getHexString()}`, main);
    const bend = 0.25 + Math.random() * 0.25;
    const cone = this.part(lockGeo(len * 1.1, r * 1.05, { bend, twist: (Math.random() - 0.5) * 0.3, flat: 0.55 }), lm, g, [0, dist - 0.02, 0], null, 0.012);
    this.spikes.push({ group: g, cone, len, pitch, yaw });
    return g;
  }

  /** Frange : mèches qui tombent sur le front en s'incurvant. */
  bangs(head, mat, list, r = 0.05) {
    const main = mat === this.hairMats[0] || (mat.userData && mat.userData.hairMain);
    const lm = this.ghost ? mat : this.lockMat(`#${mat.color.getHexString()}`, main);
    for (const [xx, len, tilt] of list) {
      const c = this.part(lockGeo(len * 1.1, r * 1.1, { bend: -0.45, twist: -tilt * 0.4, flat: 0.45 }), lm, head, [xx, 0.29, 0.13], [Math.PI, 0, tilt], 0.01);
      c.rotation.x = Math.PI - 0.5;
    }
  }

  buildHair(head, L, hair) {
    const style = L.hairStyle;
    // Reflet brillant en arc sur le dessus du crâne, typique des cheveux d'anime
    if (!this.ghost) {
      const shine = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.012, 4, 24, Math.PI * 0.75),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(L.hair).lerp(new THREE.Color('#ffffff'), 0.55) }),
      );
      shine.position.set(0, 0.2, 0.0);
      shine.rotation.set(-1.0, 0, Math.PI * 0.125);
      shine.scale.set(1.08, 1.08, 1);
      head.add(shine);
      this.flatMats.push(shine.material);
    }
    const cap = (r = 0.212, mat = hair, theta = 0.56) => {
      const m = this.part(new THREE.SphereGeometry(r, 18, 10, 0, TAU, 0, Math.PI * theta), mat, head, [0, 0.15, -0.02]);
      m.rotation.x = -0.62; // calotte basculée vers l'arrière : le front reste visible sous la frange
      m.receiveShadow = false;
      return m;
    };
    // Mèches avant communes : elles bordent le front sous la calotte basculée
    const front = (mat, len = 0.17, n = 5) => {
      for (let i = 0; i < n; i++) {
        const yaw = -0.75 + (1.5 * i) / (n - 1);
        this.spike(head, mat, 0.85 + Math.abs(yaw) * 0.25, yaw, len * (1 - Math.abs(yaw) * 0.2), 0.065, 0.11);
      }
    };
    if (style !== 'ninja' && style !== 'short') front(hair, style === 'priestess' ? 0.15 : 0.17);
    if (style === 'short') front(hair, 0.1, 4);
    if (style === 'spiky') {
      cap();
      const spikes = [
        [-0.15, 0, 0.32], [-0.55, 0, 0.36], [-0.95, 0, 0.34], [-1.35, 0, 0.3], [-1.75, 0, 0.24],
        [-0.45, 0.85, 0.3], [-0.45, -0.85, 0.3], [-0.95, 0.65, 0.3], [-0.95, -0.65, 0.3], [-1.4, 0.45, 0.26], [-1.4, -0.45, 0.26],
        [0.25, 0.9, 0.2], [0.25, -0.9, 0.2], [-0.15, 0.5, 0.3], [-0.15, -0.5, 0.3],
      ];
      for (const [p, y, len] of spikes) this.spike(head, hair, p, y, len, 0.08);
      this.bangs(head, hair, [[-0.07, 0.15, 0.25], [0.0, 0.17, 0], [0.07, 0.14, -0.3], [-0.12, 0.11, 0.5]]);
    } else if (style === 'ninja') {
      cap();
      for (const [p, y, len] of [[-0.9, 0, 0.28], [-1.3, 0.4, 0.26], [-1.3, -0.4, 0.26], [-1.7, 0, 0.24], [-0.5, 0.75, 0.22], [-0.5, -0.75, 0.22], [-0.15, 0.3, 0.2], [-0.15, -0.3, 0.2], [-1.0, 0.8, 0.2], [-1.0, -0.8, 0.2]]) {
        this.spike(head, hair, p, y, len, 0.072);
      }
      this.bangs(head, hair, [[-0.08, 0.13, 0.3], [0.03, 0.15, -0.1], [0.1, 0.12, -0.4]]);
    } else if (style === 'ponytail') {
      cap(0.214);
      for (const [p, y, len] of [[0.3, 0.95, 0.17], [0.3, -0.95, 0.17], [-0.2, 0.6, 0.15], [-0.2, -0.6, 0.15]]) this.spike(head, hair, p, y, len, 0.06, 0.12);
      this.bangs(head, hair, [[-0.1, 0.16, 0.35], [-0.03, 0.19, 0.1], [0.05, 0.17, -0.15], [0.12, 0.14, -0.4]]);
      this.part(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), this.mat('#c0262f'), head, [0, 0.2, -0.2], [1.2, 0, 0], 0.01);
      this.chain(head, { pos: [0, 0.2, -0.22], segs: 6, len: 0.14, w: 0.12, t: 0.09, mat: hair, rest: [0.35, 0], drag: 0.09, stiff: 40 });
    } else if (style === 'long') {
      const alt = this.mat(L.hairAlt || L.hair);
      this.hairMats.push(alt);
      cap();
      const half = this.part(new THREE.SphereGeometry(0.215, 18, 10, 0, Math.PI, 0, Math.PI * 0.52), alt, head, [0, 0.15, -0.012]);
      half.rotation.x = -0.28;
      this.bangs(head, hair, [[-0.1, 0.17, 0.3], [-0.03, 0.2, 0.08]]);
      this.bangs(head, alt, [[0.04, 0.19, -0.08], [0.11, 0.16, -0.3]]);
      this.chain(head, { pos: [0.06, 0.12, -0.16], segs: 5, len: 0.15, w: 0.15, t: 0.06, mat: hair, rest: [0.15, 0.05], drag: 0.07, stiff: 35 });
      this.chain(head, { pos: [-0.06, 0.12, -0.16], segs: 5, len: 0.15, w: 0.15, t: 0.06, mat: alt, rest: [0.15, -0.05], drag: 0.07, stiff: 35 });
      this.chain(head, { pos: [0.17, 0.1, 0.03], segs: 3, len: 0.13, w: 0.06, t: 0.05, mat: hair, rest: [0, 0.1], drag: 0.05, stiff: 45 });
      this.chain(head, { pos: [-0.17, 0.1, 0.03], segs: 3, len: 0.13, w: 0.06, t: 0.05, mat: alt, rest: [0, -0.1], drag: 0.05, stiff: 45 });
    } else if (style === 'short') {
      cap(0.206, hair, 0.46);
      for (const [p, y, len] of [[-0.3, 0, 0.1], [-0.75, 0.4, 0.1], [-0.75, -0.4, 0.1], [-1.2, 0, 0.09], [0.15, 0.4, 0.08], [0.15, -0.4, 0.08], [-0.3, 0.7, 0.09], [-0.3, -0.7, 0.09]]) this.spike(head, hair, p, y, len, 0.065, 0.13);
    } else if (style === 'priestess') {
      cap(0.216, hair, 0.6);
      this.bangs(head, hair, [[-0.11, 0.15, 0.1], [-0.055, 0.17, 0.05], [0, 0.17, 0], [0.055, 0.17, -0.05], [0.11, 0.15, -0.1]], 0.045);
      this.chain(head, { pos: [0, 0.1, -0.17], segs: 6, len: 0.15, w: 0.32, t: 0.05, mat: hair, rest: [0.1, 0], drag: 0.06, stiff: 30 });
      this.chain(head, { pos: [0.18, 0.08, 0.02], segs: 4, len: 0.13, w: 0.06, t: 0.05, mat: hair, rest: [0, 0.08], drag: 0.05, stiff: 40 });
      this.chain(head, { pos: [-0.18, 0.08, 0.02], segs: 4, len: 0.13, w: 0.06, t: 0.05, mat: hair, rest: [0, -0.08], drag: 0.05, stiff: 40 });
    }
  }

  buildExtras(L, m) {
    const x = L.extras;
    const { accent, top, pants, beltM, armorM, b } = m;
    const torso = this.torso;
    const kind = L.body || 'm';
    const tw = kind === 'big' ? 1.18 : kind === 'f' ? 0.78 : 1; // largeur relative du torse
    if (L.emblem && !this.ghost) {
      // Emblème brodé : grand dans le dos, petit sur la poitrine
      const zb = (kind === 'f' ? 0.112 : kind === 'big' ? 0.16 : 0.133) * b;
      const col = L.emblemColor || L.belt || '#c0262f';
      const mk = (r, y, z, ry) => {
        const e = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({
          map: emblemTexture(L.emblem, col), transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
        }));
        e.position.set(ry ? 0 : 0.085 * b, y, z);
        e.rotation.y = ry;
        torso.add(e);
        this.flatMats.push(e.material);
      };
      mk(0.09 * b, 0.34, -zb - 0.006, Math.PI);
      if (L.top) mk(0.032, 0.43, zb * 0.92 + 0.008, 0);
    }
    if (x.includes('gi')) {
      // Kimono de combat : tee-shirt visible dans l'encolure en V, revers, ceinture nouée
      this.part(new THREE.BoxGeometry(0.11, 0.2, 0.03), this.mat(L.topAlt || '#1d2bb0'), torso, [0, 0.43, 0.115], [-0.25, 0, 0], 0.008);
      for (const s of [-1, 1]) {
        this.part(new THREE.BoxGeometry(0.04, 0.3, 0.02), this.mat('#e05a00'), torso, [s * 0.05, 0.38, 0.125], [-0.15, 0, s * -0.35], 0.008);
      }
    }
    if (x.includes('kimono')) {
      for (const s of [-1, 1]) {
        this.part(new THREE.BoxGeometry(0.045, 0.34, 0.02), accent, torso, [s * 0.045, 0.36, 0.118 * tw], [-0.1, 0, s * -0.3], 0.008);
      }
    }
    if (x.includes('armor')) {
      this.part(new THREE.BoxGeometry(0.28, 0.2, 0.06), armorM, torso, [0, 0.35, 0.1], [-0.08, 0, 0], 0.012);
      this.part(new THREE.BoxGeometry(0.22, 0.05, 0.05), armorM, torso, [0, 0.2, 0.1], null, 0.01);
    }
    if (x.includes('mantle')) {
      const mt = this.part(new THREE.SphereGeometry(0.26 * tw, 16, 8, 0, TAU, 0, Math.PI * 0.35), accent, torso, [0, 0.42, 0], null, 0.012);
      mt.scale.z = 0.8;
      this.part(new THREE.TorusGeometry(0.2 * tw, 0.018, 6, 20), this.mat('#ffb43a'), torso, [0, 0.47, 0], [Math.PI / 2, 0, 0], 0.008).scale.y = 0.75;
    }
    if (x.includes('belt') || x.includes('sash') || x.includes('gi')) {
      this.part(new THREE.TorusGeometry(0.155 * tw * b, 0.032, 6, 20), beltM, this.hips, [0, 0.06, 0], [Math.PI / 2, 0, 0], 0.01).scale.y = 0.74;
      this.part(new THREE.SphereGeometry(0.035, 8, 6), beltM, this.hips, [0.03, 0.06, 0.125 * tw * b], null, 0.008);
      this.chain(this.hips, { pos: [0.04, 0.04, 0.13 * tw * b], segs: 2, len: 0.14, w: 0.05, t: 0.02, mat: beltM, rest: [-0.1, 0.12], drag: 0.05, stiff: 50 });
      this.chain(this.hips, { pos: [0.0, 0.04, 0.13 * tw * b], segs: x.includes('sash') ? 4 : 2, len: 0.14, w: 0.05, t: 0.02, mat: beltM, rest: [-0.1, -0.05], drag: 0.06, stiff: 45 });
    }
    if (x.includes('scarf')) {
      const sc = this.mat(L.accent || '#c0262f');
      this.part(new THREE.TorusGeometry(0.085, 0.045, 8, 16), sc, torso, [0, 0.56, 0], [Math.PI / 2, 0, 0], 0.012);
      this.chain(torso, { pos: [0.05, 0.56, -0.1], segs: 7, len: 0.15, w: 0.1, t: 0.025, mat: sc, rest: [0.6, 0.05], drag: 0.1, stiff: 25 });
      this.chain(torso, { pos: [-0.05, 0.55, -0.1], segs: 6, len: 0.14, w: 0.09, t: 0.025, mat: sc, rest: [0.55, -0.05], drag: 0.1, stiff: 25 });
    }
    if (x.includes('mask')) {
      const mk = this.part(new THREE.SphereGeometry(0.192, 16, 8, 0, Math.PI, Math.PI * 0.55, Math.PI * 0.3), top, this.head, [0, 0.13, 0.008], [0, -Math.PI / 2, 0], 0.01);
      mk.scale.set(0.95, 1.1, 1.06);
    }
    if (x.includes('headband')) {
      const band = this.mat('#2a2f4a');
      this.part(new THREE.TorusGeometry(0.2, 0.026, 6, 22), band, this.head, [0, 0.215, 0], [Math.PI / 2 - 0.2, 0, 0], 0.01);
      this.part(new THREE.BoxGeometry(0.13, 0.055, 0.02), this.mat('#b8c0d8'), this.head, [0, 0.225, 0.205], [-0.2, 0, 0], 0.008);
      this.chain(this.head, { pos: [0.04, 0.24, -0.19], segs: 5, len: 0.11, w: 0.05, t: 0.015, mat: band, rest: [0.9, 0.2], drag: 0.1, stiff: 30 });
      this.chain(this.head, { pos: [-0.04, 0.24, -0.19], segs: 5, len: 0.1, w: 0.05, t: 0.015, mat: band, rest: [0.8, -0.2], drag: 0.1, stiff: 30 });
    }
    if (x.includes('redband')) {
      const band = this.mat('#d8262f');
      this.part(new THREE.TorusGeometry(0.198, 0.022, 6, 22), band, this.head, [0, 0.2, 0], [Math.PI / 2 - 0.15, 0, 0], 0.01);
      this.chain(this.head, { pos: [0, 0.2, -0.2], segs: 4, len: 0.11, w: 0.045, t: 0.015, mat: band, rest: [0.7, 0.1], drag: 0.1, stiff: 30 });
    }
    if (x.includes('kunai')) {
      const g = new THREE.Group();
      g.position.set(0, -0.05, 0.02);
      g.rotation.x = Math.PI / 2 - 0.4;
      this.handR.add(g);
      this.part(new THREE.ConeGeometry(0.035, 0.26, 4), this.mat('#c8d0e0'), g, [0, 0.17, 0], null, 0.01);
      this.part(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), this.mat('#2a2f4a'), g, [0, 0, 0], null, 0.008);
      this.part(new THREE.TorusGeometry(0.025, 0.007, 4, 10), this.mat('#c8d0e0'), g, [0, -0.06, 0], null, 0.004);
    }
    if (x.includes('haori')) {
      const h = accent;
      this.chain(torso, { pos: [0.12, 0.5, -0.12], segs: 5, len: 0.17, w: 0.22, t: 0.03, mat: h, rest: [0.12, 0.08], drag: 0.06, stiff: 32 });
      this.chain(torso, { pos: [-0.12, 0.5, -0.12], segs: 5, len: 0.17, w: 0.22, t: 0.03, mat: h, rest: [0.12, -0.08], drag: 0.06, stiff: 32 });
    }
    if (x.includes('katana')) {
      const g = new THREE.Group();
      g.position.set(0, -0.05, 0);
      g.rotation.x = Math.PI / 2 - 0.9;
      this.handR.add(g);
      this.part(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), this.mat('#2a1e3a'), g, [0, 0.0, 0], null, 0.01);
      this.part(new THREE.CylinderGeometry(0.065, 0.065, 0.022, 10), this.mat('#d8b040'), g, [0, 0.13, 0], null, 0.01);
      const blade = this.part(new THREE.BoxGeometry(0.032, 0.88, 0.012), this.mat(L.blade ? '#2a0a12' : '#e8f4ff', { emissive: new THREE.Color(L.blade || '#5fa8ff'), emissiveIntensity: L.blade ? 0.9 : 0.25 }), g, [0, 0.58, 0], null, 0.008);
      this.blade = blade;
      this.tip = new THREE.Object3D();
      this.tip.position.y = 1.0;
      g.add(this.tip);
      this.part(new THREE.CylinderGeometry(0.032, 0.03, 0.82, 8), this.mat('#1a1a28'), this.hips, [0.21, 0.05, -0.05], [1.9, 0, 0.3], 0.01);
    }
    if (x.includes('robe') || x.includes('hakama')) {
      const mat = x.includes('robe') ? top : pants;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = Math.sin(a) * 0.165 * b * tw;
        const pz = Math.cos(a) * 0.125 * b * tw;
        this.chain(this.hips, {
          pos: [px, 0.02, pz], segs: 3, len: x.includes('robe') ? 0.26 : 0.2, w: 0.14, t: 0.025, mat,
          rest: [-Math.cos(a) * 0.2, Math.sin(a) * 0.2], drag: 0.045, stiff: 55, yaw: a,
        });
      }
      if (x.includes('robe')) {
        this.part(new THREE.TorusGeometry(0.16 * b * tw, 0.028, 6, 20), this.mat(L.belt), this.hips, [0, 0.08, 0], [Math.PI / 2, 0, 0], 0.01).scale.y = 0.75;
      }
    }
    if (x.includes('staff')) {
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      this.handR.add(g);
      this.part(new THREE.CylinderGeometry(0.025, 0.032, 1.6, 8), this.mat('#5a3a22'), g, [0, 0.25, 0], null, 0.012);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), glowMat(this.def.aura, 2.2));
      orb.position.y = 1.1;
      g.add(orb);
      this.part(new THREE.TorusGeometry(0.13, 0.02, 6, 16, Math.PI * 1.4), this.mat('#d8b040'), g, [0, 1.1, 0], [0, 0, -0.6], 0.008);
      this.part(new THREE.ConeGeometry(0.04, 0.16, 6), this.mat('#d8b040'), g, [0, -0.6, 0], [Math.PI, 0, 0], 0.008);
      this.orb = orb;
      this.tip = orb;
    }
    if (x.includes('spear')) {
      // Lance : hampe longue, lame en pointe, anneau doré
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      this.handR.add(g);
      this.part(new THREE.CylinderGeometry(0.022, 0.026, 2.0, 8), this.mat('#3a2a22'), g, [0, 0.3, 0], null, 0.012);
      this.part(new THREE.ConeGeometry(0.06, 0.38, 4), this.mat('#e8eef8', { emissive: new THREE.Color(this.def.aura), emissiveIntensity: 0.35 }), g, [0, 1.48, 0], null, 0.01).scale.z = 0.35;
      this.part(new THREE.TorusGeometry(0.045, 0.014, 6, 12), this.mat('#d8b040'), g, [0, 1.28, 0], [Math.PI / 2, 0, 0], 0.006);
      this.tip = new THREE.Object3D();
      this.tip.position.y = 1.6;
      g.add(this.tip);
    }
    if (x.includes('fans')) {
      // Éventails ouverts dans chaque main
      for (const hand of [this.handL, this.handR]) {
        const fan = this.part(new THREE.CircleGeometry(0.24, 14, 0, Math.PI), this.mat(L.accent), hand, [0, -0.06, 0.05], [0, Math.PI / 2, Math.PI / 2], 0.008);
        fan.material.side = THREE.DoubleSide;
      }
    }
    if (x.includes('horns')) {
      for (const sd of [-1, 1]) {
        this.part(new THREE.ConeGeometry(0.035, 0.2, 6), this.mat('#1a0a10'), this.head, [sd * 0.11, 0.31, 0.03], [-0.35, 0, -sd * 0.45], 0.008);
      }
    }
    if (x.includes('talismans')) {
      this.talismans = [];
      const paper = this.mat('#f8f0d8');
      for (let i = 0; i < 3; i++) {
        const t = this.part(new THREE.BoxGeometry(0.12, 0.22, 0.01), paper, this.root, [0, 1.2, 0], null, 0.01);
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.012), new THREE.MeshBasicMaterial({ color: '#c0262f' }));
        t.add(mark);
        this.talismans.push(t);
      }
    }
    if (x.includes('ribbons')) {
      const r = this.mat('#d8262f');
      this.part(new THREE.SphereGeometry(0.045, 8, 6), r, this.head, [0, 0.2, -0.2], null, 0.008).scale.set(1.6, 0.8, 0.6);
      this.chain(this.head, { pos: [0.08, 0.2, -0.2], segs: 3, len: 0.12, w: 0.05, t: 0.015, mat: r, rest: [0.6, 0.3], drag: 0.08, stiff: 30 });
      this.chain(this.head, { pos: [-0.08, 0.2, -0.2], segs: 3, len: 0.12, w: 0.05, t: 0.015, mat: r, rest: [0.6, -0.3], drag: 0.08, stiff: 30 });
    }
  }

  /** Chaîne de segments à ressort (cheveux, tissus). */
  chain(parent, o) {
    const root = new THREE.Group();
    root.position.set(...o.pos);
    if (o.yaw) root.rotation.y = o.yaw;
    parent.add(root);
    const pivots = [];
    let p = root;
    for (let i = 0; i < o.segs; i++) {
      const pv = new THREE.Group();
      if (i > 0) pv.position.y = -o.len;
      p.add(pv);
      const w = o.w * (1 - (i / o.segs) * 0.35);
      this.part(new THREE.BoxGeometry(w, o.len, o.t), o.mat, pv, [0, -o.len / 2, 0], null, 0.012);
      pivots.push({ g: pv, ax: o.rest[0], az: o.rest[1], vx: 0, vz: 0 });
      p = pv;
    }
    this.chains.push({ root, pivots, rest: o.rest, drag: o.drag, stiff: o.stiff, yaw: o.yaw || 0 });
  }

  buildAura() {
    this.aura = new THREE.Group();
    this.auraMats = [];
    const sizes = [[0.55, 0.8, 2.5], [0.75, 1.05, 2.9]];
    for (const [rt, rb, h] of sizes) {
      const mat = auraMaterial(this.def.aura);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 18, 1, true), mat);
      mesh.position.y = h / 2 - 0.15;
      mesh.renderOrder = 5;
      this.aura.add(mesh);
      this.auraMats.push(mat);
    }
    this.aura.visible = false;
    this.root.add(this.aura);
    this.auraLevel = 0;
  }

  setAuraColor(color) {
    for (const m of this.auraMats) m.uniforms.uColor.value.set(color);
  }

  /** Change la couleur des cheveux et du haut (transformation du guerrier). */
  setTransformed(on) {
    if (on === this.transformed) return;
    this.transformed = on;
    const L = this.def.look;
    if (L.hairAlt && this.def.id === 'kael') {
      const c = new THREE.Color(on ? L.hairAlt : L.hair);
      for (const m of this.hairMats) {
        if (m !== this.hairMats[0] && !m.userData.hairMain) continue;
        m.color.copy(c);
        m.userData.baseEmissive = new THREE.Color(on ? '#8a6a00' : '#000000');
      }
      this.lastFlash = -1;
    }
    if (L.topAlt) for (const m of this.topMats) m.color.set(on ? L.topAlt : L.top);
    this.setAuraColor(on ? this.def.auraAlt || this.def.aura : this.def.aura);
    for (const s of this.spikes) s.cone.scale.set(1, on ? 1.35 : 1, 1);
  }

  setFlash(k) {
    if (this.ghost || k === this.lastFlash) return;
    this.lastFlash = k;
    for (const m of this.mats) {
      if (!m.emissive || !m.userData.baseEmissive) continue;
      m.emissive.copy(m.userData.baseEmissive).addScalar(k);
    }
  }

  // --- Animation -----------------------------------------------------------------------------

  /**
   * Calcule la pose voulue à partir de l'état du combattant.
   * `f` : { state, st, moveId, mt, vx, vz, vy, yaw, onGround, ... } ; `extra` : { cine }
   */
  targetPose(f, extra) {
    const def = this.def;
    const stance = STANCES[def.stance];
    const t = this.time;
    const breathe = Math.sin(t * 2.4) * 0.02;
    const yaw = f.yaw;
    const vF = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
    const vS = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
    const speed = Math.hypot(f.vx, f.vz);

    if (extra && extra.cine) {
      // Cinématique d'ultime : posture de concentration
      const a = ANIMS.powerup;
      return mergePose(stance, a.wind, { head: [-0.2, 0, 0], hy: -0.18 + Math.sin(t * 30) * 0.01 });
    }

    switch (f.state) {
      case 'air':
      case 'land': {
        if (f.state === 'land') return mergePose(stance, { hy: -0.22, knL: [1.0, 0, 0], knR: [1.0, 0, 0], hipL: [-0.6, 0, -0.1], hipR: [-0.5, 0, 0.1] });
        const up = f.vy > 0;
        return mergePose(stance, {
          hipL: [up ? -1.1 : -0.6, 0, -0.1], knL: [up ? 1.5 : 0.8, 0, 0], hipR: [up ? -0.3 : -0.2, 0, 0.1], knR: [up ? 1.0 : 0.5, 0, 0],
          shL: [-0.4, 0, -0.7], shR: [-0.4, 0, 0.7], elL: [-0.8, 0, 0], elR: [-0.8, 0, 0], torso: [up ? 0.15 : -0.1, 0, 0],
        });
      }
      case 'guard':
      case 'blockstun': {
        const jolt = f.state === 'blockstun' ? -0.15 : 0;
        return mergePose(stance, {
          hy: -0.14, torso: [0.25 + jolt, 0, 0], head: [0.25, 0, 0],
          shL: [-1.35, 0, 0.25], elL: [-2.1, 0, 0], shR: [-1.35, 0, -0.25], elR: [-2.1, 0, 0],
        });
      }
      case 'charge': {
        const j = Math.sin(t * 50) * 0.02;
        return mergePose(stance, ANIMS.powerup.wind, { head: [-0.35 + j, 0, 0], hy: -0.22 + j });
      }
      case 'dodge': {
        const back = vF < -1;
        return mergePose(stance, {
          hy: -0.15, torso: [back ? -0.35 : 0.55, 0, 0], shL: [back ? -0.8 : 0.8, 0, -0.4], shR: [back ? -0.8 : 0.8, 0, 0.4],
          elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], hipL: [-0.8, 0, 0], knL: [1.0, 0, 0], hipR: [0.4, 0, 0], knR: [0.6, 0, 0],
          body: [0, 0, -Math.sign(vS) * 0.2],
        });
      }
      case 'hitstun': {
        const air = !f.onGround;
        const r = this.react;
        if (r && !air) {
          const sd = r.side;
          if (r.kind === 'heavy') {
            // Plié en deux par un coup au ventre
            return mergePose(stance, {
              hy: -0.2, torso: [0.8, sd * 0.25, 0], head: [0.45, -sd * 0.2, 0], shL: [-0.7, 0, 0.1], elL: [-1.6, 0, 0],
              shR: [-0.6, 0, -0.1], elR: [-1.5, 0, 0], hipL: [-0.5, 0, -0.1], knL: [0.9, 0, 0], hipR: [0.2, 0, 0.1], knR: [0.7, 0, 0],
            });
          }
          // Tête qui part sur le côté, épaule qui suit
          return mergePose(stance, {
            hy: -0.06, torso: [-0.35, sd * 0.55, sd * 0.18], head: [-0.4, sd * 0.6, sd * 0.35],
            shL: [-0.2, 0, -0.9 - sd * 0.2], elL: [-0.5, 0, 0], shR: [-0.3, 0, 0.9 - sd * 0.2], elR: [-0.6, 0, 0],
            hipL: [-0.2, 0, -0.12], knL: [0.35, 0, 0], hipR: [0.25, 0, 0.12], knR: [0.4, 0, 0],
          });
        }
        if (air) {
          // Projeté en l'air : dos cambré, bras et jambes qui traînent
          return mergePose(stance, {
            torso: [-0.75, 0, 0], head: [-0.6, 0, 0], shL: [-2.4, 0, -0.6], shR: [-2.2, 0, 0.7], elL: [-0.3, 0, 0], elR: [-0.4, 0, 0],
            hipL: [0.3, 0, -0.15], knL: [0.6, 0, 0], hipR: [0.1, 0, 0.15], knR: [0.9, 0, 0], body: [-0.7 - Math.min(0.8, f.st * 1.5), 0, 0],
          });
        }
        return mergePose(stance, {
          hy: -0.05, torso: [-0.55, 0.25, 0], head: [-0.45, 0, 0], shL: [-0.3, 0, -1.0], shR: [-0.5, 0, 0.9],
          elL: [-0.4, 0, 0], elR: [-0.6, 0, 0], body: air ? [-0.7 - Math.min(0.6, f.st), 0, 0] : [0, 0, 0],
          hipL: [air ? -0.5 : -0.2, 0, -0.1], knL: [air ? 0.8 : 0.3, 0, 0], hipR: [air ? -0.1 : 0.2, 0, 0.1], knR: [0.4, 0, 0],
        });
      }
      case 'dizzy': {
        const w = Math.sin(t * 5);
        return mergePose(stance, {
          hy: -0.1, torso: [0.2, w * 0.2, w * 0.15], head: [0.3, w * 0.4, -w * 0.3],
          shL: [0.1, 0, -0.2], elL: [-0.3, 0, 0], shR: [0.1, 0, 0.2], elR: [-0.3, 0, 0],
          hipL: [0, 0, -0.1], knL: [0.3, 0, 0], hipR: [0, 0, 0.1], knR: [0.3, 0, 0],
        });
      }
      case 'knockdown':
        return mergePose(LYING);
      case 'getup':
        return mergePose(stance, { hy: -0.3, torso: [0.6, 0, 0], knL: [1.4, 0, 0], knR: [1.2, 0, 0], hipL: [-1.1, 0, 0], hipR: [-0.6, 0, 0] });
      case 'ko':
        if (!f.onGround) return mergePose(LYING, { by: 0, bz: 0.4, body: [-1.0 - Math.min(1.5, f.st * 2), 0, 0] });
        return mergePose(LYING);
      case 'victory': {
        const v = mergePose(stance, VICTORY[def.stance]);
        v.hy += Math.sin(t * 3) * 0.015;
        return v;
      }
      case 'move':
        return this.movePose(f, stance);
      case 'walk':
      case 'idle':
      default: {
        const p = mergePose(stance);
        p.hy += breathe;
        p.shL[0] += breathe; p.shR[0] -= breathe;
        this.locomotion(p, f);
        return p;
      }
    }
  }

  /**
   * Marche et pas chassés : cycle de jambes calé sur la distance parcourue (les pieds ne glissent
   * pas), direction prise en compte (avant, arrière, côté), buste penché dans le mouvement, bras qui
   * se balancent, et transition progressive entre arrêt et marche.
   */
  locomotion(p, f) {
    const L = this.loco;
    const m = L.m;
    if (m < 0.01) return;
    const yaw = f.yaw;
    const vF = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
    const vS = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
    const sp = Math.hypot(vF, vS) || 1;
    const dF = vF / sp;
    const dS = vS / sp;
    const s = Math.sin(L.phase);
    const c = Math.cos(L.phase);
    const run = clamp((sp - 5.5) / 2, 0, 1);
    const amp = (0.5 + run * 0.25) * m;
    // Les jambes quittent la garde écartée pour marcher
    for (const k of ['hipL', 'hipR', 'knL', 'knR']) {
      const tgt = k.startsWith('kn') ? [0.15, 0, 0] : [-0.05, 0, k === 'hipL' ? -0.06 : 0.06];
      for (let i = 0; i < 3; i++) p[k][i] += (tgt[i] - p[k][i]) * m * 0.75;
    }
    const dir = dF >= -0.2 ? 1 : -1;
    p.hipL[0] += -s * amp * dF * 1.1;
    p.hipR[0] += s * amp * dF * 1.1;
    p.hipL[2] += Math.max(0, s) * 0.32 * Math.abs(dS) * m;
    p.hipR[2] += Math.max(0, -s) * 0.32 * Math.abs(dS) * m;
    p.knL[0] += Math.max(0, c * dir) * (0.85 + run * 0.4) * m + 0.12 * m;
    p.knR[0] += Math.max(0, -c * dir) * (0.85 + run * 0.4) * m + 0.12 * m;
    p.hy += (-0.035 + Math.abs(c) * 0.045) * m;
    p.torso[0] += (dF * (0.14 + run * 0.18)) * m;
    p.body[2] -= dS * 0.08 * m;
    p.hips[1] += s * 0.12 * m;
    p.torso[1] -= s * 0.09 * m;
    p.shL[0] += s * 0.22 * dF * m;
    p.shR[0] -= s * 0.22 * dF * m;
  }

  movePose(f, stance) {
    const mv = this.def.moves[f.moveId];
    if (!mv) return mergePose(stance);
    const anim = ANIMS[mv.anim] || ANIMS.jab;
    const s = strikeTime(mv);
    const holdEnd = mv.hold ? mv.hold[1] : s + Math.min(0.12, mv.dur * 0.25);
    const t = f.mt;
    const base = mergePose(stance);
    const wind = mergePose(stance, anim.wind);
    const strike = mergePose(stance, anim.strike);
    let p;
    let impact = 0; // 1 au moment de la frappe, décroît ensuite (pour le transfert de poids)
    let commit = 0; // engagement du corps dans le coup (pas en avant)
    if (t < s) {
      commit = (t / s) * 0.35;
      // Anticipation : on arme lentement puis on se « charge » juste avant de frapper
      const k = clamp(t / (s * 0.85), 0, 1);
      p = lerpPose(base, wind, k * k * (3 - 2 * k) * 1.04);
    } else if (t < holdEnd) {
      // Frappe : passage très rapide de l'armé au coup, avec un léger dépassement (élan)
      const k = clamp((t - s) / 0.07, 0, 1);
      const over = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // « back out » : dépasse puis revient
      p = lerpPose(wind, strike, over);
      impact = 1 - clamp((t - s) / 0.18, 0, 1);
      commit = 1;
    } else {
      // Retour en garde : décélération douce (le poids du corps revient)
      const k = clamp((t - holdEnd) / Math.max(0.05, mv.dur - holdEnd), 0, 1);
      p = lerpPose(strike, base, 1 - (1 - k) ** 3);
      commit = (1 - k) ** 2;
    }
    // Coups de poing et de lame : le pied avant glisse en avant, le corps s'engage dans la frappe
    if (!anim.strike.hipL && !anim.strike.hipR && !anim.spin && !anim.rush) {
      const lunge = { hipL: [-0.7, 0, -0.16], knL: [0.6, 0, 0], hipR: [0.42, 0, 0.12], knR: [0.4, 0, 0] };
      for (const key in lunge) for (let i = 0; i < 3; i++) p[key][i] += (lunge[key][i] - p[key][i]) * commit * 0.85;
      p.hy -= 0.08 * commit;
      p.torso[0] += 0.1 * commit;
    }
    // Le coup part des hanches : une partie de la rotation du torse passe dans le bassin,
    // le corps s'abaisse à l'impact, et la tête reste tournée vers l'adversaire.
    const twist = p.torso[1];
    p.hips[1] += twist * 0.5;
    p.torso[1] = twist * 0.65;
    p.head[1] -= twist * 0.55;
    p.hy -= 0.05 * impact;
    p.torso[0] += 0.08 * impact * (mv.lunge ? 1.5 : 1);
    if (anim.spin) p.body[1] = ease(clamp(t / (s + 0.12), 0, 1)) * TAU;
    if (anim.rush && t >= s && t < holdEnd) {
      // Pluie de coups : bras qui alternent très vite
      const ph = Math.sin(this.time * 46);
      p.shR = [ph > 0 ? -1.6 : -0.7, 0, 0.1]; p.elR = [ph > 0 ? -0.05 : -1.8, 0, 0];
      p.shL = [ph < 0 ? -1.6 : -0.7, 0, -0.1]; p.elL = [ph < 0 ? -0.05 : -1.8, 0, 0];
      p.torso[1] = ph * 0.3;
      p.hips[1] = ph * 0.15;
    }
    return p;
  }

  /** Point qui laisse une traînée pendant le coup (main, pied ou arme), selon l'animation. */
  strikeLimb(animName) {
    if (/kick/.test(animName)) return [this.footR];
    if (/slash|thrust|rising|iai|staff/.test(animName)) return [this.tip || this.handR];
    if (animName === 'cross') return [this.handL];
    if (animName === 'rush' || animName === 'slam' || animName === 'cast' || animName === 'beam') return [this.handL, this.handR];
    return [this.handR];
  }

  /**
   * Met à jour le modèle. `f` : état du combattant (objet Fighter ou instantané réseau).
   * `extra` : { cine: bool, auraBoost: 0..1 }
   */
  update(dt, f, extra = {}) {
    this.time += dt;
    this.root.position.set(f.x, f.y, f.z);
    // Orientation lissée : le personnage pivote au lieu de sauter d'un angle à l'autre
    if (this.dispYaw === null) this.dispYaw = f.yaw;
    let dy = Math.atan2(Math.sin(f.yaw - this.dispYaw), Math.cos(f.yaw - this.dispYaw));
    if (Math.abs(dy) > 2.6 && f.state === 'move') this.dispYaw = f.yaw; // demi-tour instantané (téléportation)
    else this.dispYaw += dy * Math.min(1, dt * 16);
    this.root.rotation.y = this.dispYaw;
    // Locomotion : vitesse au sol → amplitude et phase du cycle de marche
    const gsp = Math.hypot(f.vx, f.vz);
    const walking = (f.state === 'walk' || f.state === 'idle') && f.onGround !== false && gsp > 0.3;
    const wantM = walking ? Math.min(1, gsp / 4) : 0;
    this.loco.m += (wantM - this.loco.m) * Math.min(1, dt * 9);
    if (walking) this.loco.phase += dt * (gsp / 1.6) * Math.PI;
    this.react = extra.react || null;
    // Expression du visage selon l'action, avec clignements réguliers
    if (this.faceMat) {
      let ex = 'neutral';
      if (f.state === 'ko' || f.state === 'knockdown') ex = 'ko';
      else if (f.state === 'hitstun' || f.state === 'dizzy' || f.state === 'blockstun') ex = 'hurt';
      else if (f.state === 'victory') ex = 'smile';
      else if (f.state === 'move' || f.state === 'charge' || f.state === 'guard' || extra.cine) ex = 'fierce';
      this.blinkT -= dt;
      if (this.blinkT < 0.12 && (ex === 'neutral' || ex === 'fierce')) ex = 'blink';
      if (this.blinkT < 0) this.blinkT = 2.2 + Math.random() * 2.5;
      this.setExpression(ex);
    }

    const target = this.targetPose(f, extra);
    const rate = f.state === 'move' ? 48 : f.state === 'hitstun' || f.state === 'ko' ? 26 : 14;
    const k = 1 - Math.exp(-rate * dt);
    // Les rotations complètes (pied tournoyant) ne doivent pas être lissées
    const spin = f.state === 'move' && target.body[1] !== 0;
    this.cur = lerpPose(this.cur, target, k);
    if (spin) this.cur.body[1] = target.body[1];
    if (!spin && f.state !== 'move') this.cur.body[1] *= 1 - k;
    this.applyPose(this.cur);

    // Chaînes à ressort : la vitesse locale fait voler cheveux et tissus
    const yaw = f.yaw;
    const vF = f.vx * Math.sin(yaw) + f.vz * Math.cos(yaw);
    const vS = f.vx * Math.cos(yaw) - f.vz * Math.sin(yaw);
    const vY = f.vy || 0;
    this.updateChains(dt, vF, vS, vY);

    // Mèches : légère ondulation, dressées quand l'aura est forte
    const aura = this.auraTarget(f, extra);
    for (const sp of this.spikes) {
      sp.group.rotation.x = sp.pitch + Math.sin(this.time * 3 + sp.yaw * 4) * 0.03 - (aura > 0.5 ? 0.12 * Math.sign(sp.pitch) : 0);
    }
    // Aura
    this.auraLevel += (aura - this.auraLevel) * Math.min(1, dt * 8);
    this.aura.visible = this.auraLevel > 0.02;
    for (const m of this.auraMats) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uInt.value = this.auraLevel;
    }
    this.aura.scale.setScalar(0.9 + this.auraLevel * 0.25 + Math.sin(this.time * 20) * 0.02);

    if (this.talismans) {
      this.talismans.forEach((tl, i) => {
        const a = this.time * 1.4 + (i * TAU) / 3;
        tl.position.set(Math.sin(a) * 0.75, 1.15 + Math.sin(this.time * 2 + i) * 0.15, Math.cos(a) * 0.75);
        tl.rotation.set(0.2, a + Math.PI / 2, Math.sin(this.time * 3 + i) * 0.3);
      });
    }
    if (this.orb) this.orb.scale.setScalar(1 + Math.sin(this.time * 6) * 0.15 + this.auraLevel * 0.5);
    this.setTransformed(!!f.transformed);
    this.setFlash(f.flash > 0 ? 0.45 : 0);
  }

  auraTarget(f, extra) {
    if (extra.cine) return extra.cineShot === 0 ? 0 : 0.7; // pas d'aura devant l'objectif pendant le gros plan
    if (f.state === 'charge') return 1;
    if (f.transformed) return 0.55;
    if (f.state === 'move') {
      if (f.moveId === 'ultimate') return 1;
      if (f.moveId === 'special' || f.moveId === 'special2') return 0.8;
    }
    return extra.auraBoost || 0;
  }

  applyPose(p) {
    const b = this.scale;
    this.hips.position.y = this.hipsBaseY + p.hy * b;
    this.body.position.y = p.by;
    this.body.position.z = p.bz;
    this.body.rotation.set(p.body[0], p.body[1], p.body[2]);
    this.hips.rotation.set(p.hips[0], p.hips[1], p.hips[2]);
    this.torso.rotation.set(p.torso[0], p.torso[1], p.torso[2]);
    this.head.rotation.set(p.head[0], p.head[1], p.head[2]);
    // Les membres : z en miroir (positif = vers l'extérieur des deux côtés)
    this.shL.rotation.set(p.shL[0], p.shL[1], -p.shL[2]);
    this.shR.rotation.set(p.shR[0], p.shR[1], -p.shR[2]);
    this.elL.rotation.set(p.elL[0], 0, 0);
    this.elR.rotation.set(p.elR[0], 0, 0);
    this.hipL.rotation.set(p.hipL[0], p.hipL[1], -p.hipL[2]);
    this.hipR.rotation.set(p.hipR[0], p.hipR[1], -p.hipR[2]);
    this.knL.rotation.set(p.knL[0], 0, 0);
    this.knR.rotation.set(p.knR[0], 0, 0);
  }

  updateChains(dt, vF, vS, vY) {
    const t = this.time;
    for (const ch of this.chains) {
      // Vitesse dans le repère de la chaîne (les panneaux de jupe sont tournés)
      const cy = Math.cos(ch.yaw);
      const sy = Math.sin(ch.yaw);
      const lf = vF * cy - vS * sy;
      const ls = vF * sy + vS * cy;
      const n = ch.pivots.length;
      let prevX = 0;
      let prevZ = 0;
      for (let i = 0; i < n; i++) {
        const pv = ch.pivots[i];
        const lag = 1 + i * 0.35;
        let tx = ch.rest[0] + lf * ch.drag * lag + Math.max(0, -vY) * ch.drag * 0.6 + Math.sin(t * 2.2 + i * 0.7) * 0.05;
        const tz = ch.rest[1] - ls * ch.drag * lag + Math.sin(t * 1.7 + i) * 0.04;
        tx = clamp(tx, -0.6, 1.5);
        const stiff = ch.stiff / lag;
        pv.vx += ((tx - pv.ax) * stiff - pv.vx * 7) * dt;
        pv.vz += ((tz - pv.az) * stiff - pv.vz * 7) * dt;
        pv.ax += pv.vx * dt;
        pv.az += pv.vz * dt;
        // Rotation relative au segment parent
        pv.g.rotation.set(pv.ax - prevX, 0, pv.az - prevZ);
        prevX = pv.ax;
        prevZ = pv.az;
      }
    }
  }

  /** Position monde approximative d'une main (pour les effets). */
  handWorld(out, right = true) {
    (right ? this.handR : this.handL).getWorldPosition(out);
    return out;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    for (const m of this.flatMats || []) m.dispose();
    for (const m of this.auraMats) m.dispose();
  }
}

/** Renard-esprit de l'invocatrice. */
export function buildFox(color) {
  const g = new THREE.Group();
  const body = glowMat(color, 1.4, 0.85);
  const core = toonMat('#e8fff6', { emissive: new THREE.Color(color), emissiveIntensity: 0.6 });
  const torso = toonPart(new THREE.IcosahedronGeometry(0.28, 0), core, { outline: 0.015 });
  torso.scale.set(0.8, 0.7, 1.3);
  g.add(torso);
  const head = toonPart(new THREE.ConeGeometry(0.18, 0.4, 5), core, { outline: 0.015 });
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.15, 0.38);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = toonPart(new THREE.ConeGeometry(0.07, 0.2, 4), core, { outline: 0.012 });
    ear.position.set(s * 0.1, 0.32, 0.3);
    g.add(ear);
  }
  const tails = [];
  for (let i = 0; i < 3; i++) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6), body);
    tail.position.set((i - 1) * 0.12, 0.15, -0.45);
    tail.rotation.x = -Math.PI / 2 - 0.5;
    g.add(tail);
    tails.push(tail);
  }
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glowMat(color, 0.6, 0.25));
  g.add(halo);
  g.userData.tails = tails;
  return g;
}

/** Dragon céleste : une chaîne de segments lumineux qui suit la tête. */
export function buildDragon(color) {
  const g = new THREE.Group();
  const mat = glowMat(color, 1.6, 0.9);
  const scale = toonMat('#e8fff6', { emissive: new THREE.Color(color), emissiveIntensity: 0.8 });
  const head = new THREE.Group();
  const skull = toonPart(new THREE.ConeGeometry(0.7, 1.8, 6), scale, { outline: 0.03 });
  skull.rotation.x = Math.PI / 2;
  head.add(skull);
  for (const s of [-1, 1]) {
    const horn = toonPart(new THREE.ConeGeometry(0.12, 1.0, 5), scale, { outline: 0.02 });
    horn.position.set(s * 0.35, 0.5, -0.4);
    horn.rotation.x = -0.9;
    head.add(horn);
  }
  head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), glowMat(color, 0.8, 0.3)));
  g.add(head);
  const segs = [];
  for (let i = 0; i < 14; i++) {
    const r = 0.6 * (1 - i / 16);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? mat : scale);
    g.add(m);
    segs.push(m);
  }
  g.userData = { head, segs, trail: [] };
  return g;
}
