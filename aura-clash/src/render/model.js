// Modèles 3D low-poly des combattants, construits entièrement par code, et leur animation
// procédurale : squelette de groupes (hanches → torse → tête, épaules → coudes…), poses-clés
// interpolées, et chaînes à ressort pour les cheveux et les vêtements (écharpe, cape, jupe…).
import * as THREE from 'three';
import { toonMat, toonPart, glowMat, GLSL_NOISE } from './toon.js';

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
      m = toonMat(color, extra);
    }
    m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
    this.mats.push(m);
    return m;
  }

  part(geo, mat, parent, pos = [0, 0, 0], rot = null, outline = 0.02) {
    const mesh = toonPart(geo, mat, { outline: this.ghost ? 0 : outline });
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }

  build() {
    const L = this.def.look;
    const b = L.build || 1;
    this.scale = b;
    const skin = this.mat(L.skin);
    const top = this.mat(L.top || L.skin);
    this.topMats.push(top);
    const arms = this.mat(L.arms || L.skin);
    if (L.arms && L.arms === L.top) this.topMats.push(arms);
    const pants = this.mat(L.pants);
    const boots = this.mat(L.boots || L.pants);
    const beltM = this.mat(L.belt || L.pants);
    const hair = this.mat(L.hair);
    this.hairMats.push(hair);
    this.matSkin = skin;

    // Squelette
    const hips = new THREE.Group();
    hips.position.y = 0.95 * b;
    this.body.add(hips);
    this.hips = hips;
    this.hipsBaseY = hips.position.y;
    this.part(new THREE.BoxGeometry(0.34 * b, 0.2, 0.22 * b), pants, hips, [0, 0, 0]);

    const torso = new THREE.Group();
    torso.position.y = 0.06;
    hips.add(torso);
    this.torso = torso;
    const chestGeo = new THREE.CylinderGeometry(0.21 * b, 0.15 * b, 0.52, 7);
    const chest = this.part(chestGeo, top, torso, [0, 0.27, 0]);
    chest.scale.z = 0.72;
    if (!L.top) {
      // Torse nu : pectoraux et abdominaux suggérés
      this.part(new THREE.BoxGeometry(0.14 * b, 0.1, 0.06), skin, torso, [0.075 * b, 0.4, 0.11 * b], null, 0.012);
      this.part(new THREE.BoxGeometry(0.14 * b, 0.1, 0.06), skin, torso, [-0.075 * b, 0.4, 0.11 * b], null, 0.012);
    }

    const neck = new THREE.Group();
    neck.position.y = 0.55;
    torso.add(neck);
    this.part(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 6), skin, neck, [0, 0.04, 0], null, 0.012);
    const head = new THREE.Group();
    head.position.y = 0.1;
    neck.add(head);
    this.head = head;
    const headMesh = this.part(new THREE.IcosahedronGeometry(0.19, 1), skin, head, [0, 0.13, 0]);
    headMesh.scale.set(0.95, 1.05, 1);
    this.buildFace(head, L);
    this.buildHair(head, L, hair);

    // Bras
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.25 * b, 0.46, 0);
      torso.add(sh);
      this.part(new THREE.IcosahedronGeometry(0.085 * b, 0), arms, sh, [0, -0.01, 0], null, 0.015);
      this.part(new THREE.CylinderGeometry(0.068 * b, 0.06 * b, 0.3, 6), arms, sh, [0, -0.15, 0]);
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      this.part(new THREE.CylinderGeometry(0.058 * b, 0.05 * b, 0.27, 6), L.extras.includes('bandages') ? this.mat('#f2efe6') : arms, el, [0, -0.13, 0]);
      const hand = new THREE.Group();
      hand.position.y = -0.29;
      el.add(hand);
      if (L.extras.includes('gloves')) {
        this.part(new THREE.IcosahedronGeometry(0.1 * b, 1), this.mat('#d8262f'), hand, [0, -0.02, 0]);
      } else {
        this.part(new THREE.BoxGeometry(0.08, 0.09, 0.09), skin, hand, [0, -0.02, 0], null, 0.012);
      }
      if (L.extras.includes('wristbands')) this.part(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 7), beltM, el, [0, -0.24, 0], null, 0.012);
      return { sh, el, hand };
    };
    const A = arm(1); // bras « gauche » (+X)
    const B = arm(-1); // bras « droit » (−X)
    this.shL = A.sh; this.elL = A.el; this.handL = A.hand;
    this.shR = B.sh; this.elR = B.el; this.handR = B.hand;

    // Jambes
    const leg = (side) => {
      const hp = new THREE.Group();
      hp.position.set(side * 0.1 * b, -0.06, 0);
      hips.add(hp);
      this.part(new THREE.CylinderGeometry(0.095 * b, 0.075 * b, 0.46, 6), pants, hp, [0, -0.22, 0]);
      const kn = new THREE.Group();
      kn.position.y = -0.45;
      hp.add(kn);
      this.part(new THREE.CylinderGeometry(0.075 * b, 0.06 * b, 0.42, 6), pants, kn, [0, -0.2, 0]);
      const ft = new THREE.Group();
      ft.position.y = -0.43;
      kn.add(ft);
      this.part(new THREE.BoxGeometry(0.11 * b, 0.08, 0.25), boots, ft, [0, -0.01, 0.05]);
      this.part(new THREE.CylinderGeometry(0.07 * b, 0.065 * b, 0.12, 6), boots, kn, [0, -0.37, 0], null, 0.012);
      return { hp, kn };
    };
    const LL = leg(1);
    const LR = leg(-1);
    this.hipL = LL.hp; this.knL = LL.kn;
    this.hipR = LR.hp; this.knR = LR.kn;

    this.buildExtras(L, { top, pants, beltM, hair, skin, b });
  }

  buildFace(head, L) {
    if (this.ghost) {
      const eye = glowMat('#ff2a5a', 2.5);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.01), eye);
        e.position.set(s * 0.065, 0.15, 0.18);
        head.add(e);
      }
      return;
    }
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const iris = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.eyes || '#222') });
    const dark = new THREE.MeshBasicMaterial({ color: '#121018' });
    this.irisMat = iris;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.01), white);
      w.position.set(s * 0.068, 0.14, 0.172);
      w.rotation.y = s * 0.25;
      head.add(w);
      const i = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.01), iris);
      i.position.set(s * 0.066, 0.137, 0.178);
      i.rotation.y = s * 0.25;
      head.add(i);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.012), dark);
      brow.position.set(s * 0.07, 0.185, 0.17);
      brow.rotation.set(0, s * 0.25, s * -0.25);
      head.add(brow);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), dark);
    mouth.position.set(0, 0.04, 0.176);
    head.add(mouth);
  }

  /** Mèche pointue (cône) orientée selon (pitch, yaw) depuis le centre de la tête. */
  spike(head, mat, pitch, yaw, len, r = 0.075, dist = 0.13) {
    const g = new THREE.Group();
    g.position.set(0, 0.15, 0);
    g.rotation.set(pitch, yaw, 0, 'YXZ');
    head.add(g);
    const cone = this.part(new THREE.ConeGeometry(r, len, 5), mat, g, [0, dist + len / 2, 0], null, 0.015);
    this.spikes.push({ group: g, cone, len, pitch, yaw });
    return g;
  }

  buildHair(head, L, hair) {
    const style = L.hairStyle;
    const cap = (r = 0.205, mat = hair, theta = 0.55) => {
      const m = this.part(new THREE.SphereGeometry(r, 8, 5, 0, TAU, 0, Math.PI * theta), mat, head, [0, 0.15, -0.015]);
      m.rotation.x = -0.25;
      return m;
    };
    if (style === 'spiky') {
      cap();
      const spikes = [
        [-0.2, 0, 0.3], [-0.6, 0, 0.32], [-1.0, 0, 0.3], [-1.4, 0, 0.26],
        [-0.5, 0.9, 0.26], [-0.5, -0.9, 0.26], [-1.0, 0.7, 0.24], [-1.0, -0.7, 0.24],
        [0.4, 0.5, 0.16], [0.4, -0.5, 0.16], [0.6, 0, 0.14], [-1.7, 0, 0.22],
      ];
      for (const [p, y, len] of spikes) this.spike(head, hair, p, y, len);
    } else if (style === 'ninja') {
      cap();
      for (const [p, y, len] of [[-0.9, 0, 0.26], [-1.3, 0.4, 0.24], [-1.3, -0.4, 0.24], [-1.7, 0, 0.22], [-0.5, 0.7, 0.18], [-0.5, -0.7, 0.18], [0.5, 0.3, 0.12], [0.5, -0.3, 0.12]]) {
        this.spike(head, hair, p, y, len, 0.07);
      }
    } else if (style === 'ponytail') {
      cap(0.21);
      for (const [p, y, len] of [[0.7, 0.4, 0.14], [0.75, -0.3, 0.15], [0.6, 0, 0.12], [0.3, 0.9, 0.16], [0.3, -0.9, 0.16]]) this.spike(head, hair, p, y, len, 0.06, 0.12);
      this.part(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6), this.mat('#c0262f'), head, [0, 0.2, -0.2], [1.2, 0, 0], 0.01);
      this.chain(head, { pos: [0, 0.2, -0.22], segs: 5, len: 0.15, w: 0.1, t: 0.08, mat: hair, rest: [0.35, 0], drag: 0.09, stiff: 40 });
    } else if (style === 'long') {
      const alt = this.mat(L.hairAlt || L.hair);
      this.hairMats.push(alt);
      cap();
      const half = this.part(new THREE.SphereGeometry(0.212, 8, 5, 0, Math.PI, 0, Math.PI * 0.5), alt, head, [0, 0.15, -0.015]);
      half.rotation.x = -0.25;
      for (const [p, y, len, m] of [[0.8, 0.35, 0.14, hair], [0.8, -0.35, 0.14, alt], [0.6, 0, 0.12, hair]]) this.spike(head, m, p, y, len, 0.06, 0.12);
      this.chain(head, { pos: [0.06, 0.12, -0.16], segs: 4, len: 0.16, w: 0.14, t: 0.06, mat: hair, rest: [0.15, 0.05], drag: 0.07, stiff: 35 });
      this.chain(head, { pos: [-0.06, 0.12, -0.16], segs: 4, len: 0.16, w: 0.14, t: 0.06, mat: alt, rest: [0.15, -0.05], drag: 0.07, stiff: 35 });
      this.chain(head, { pos: [0.17, 0.1, 0.02], segs: 2, len: 0.13, w: 0.05, t: 0.05, mat: hair, rest: [0, 0.1], drag: 0.05, stiff: 45 });
      this.chain(head, { pos: [-0.17, 0.1, 0.02], segs: 2, len: 0.13, w: 0.05, t: 0.05, mat: alt, rest: [0, -0.1], drag: 0.05, stiff: 45 });
    } else if (style === 'short') {
      cap(0.2, hair, 0.45);
      for (const [p, y, len] of [[-0.3, 0, 0.08], [-0.8, 0.4, 0.08], [-0.8, -0.4, 0.08], [0.2, 0.3, 0.07], [0.2, -0.3, 0.07]]) this.spike(head, hair, p, y, len, 0.06, 0.13);
    } else if (style === 'priestess') {
      cap(0.212, hair, 0.58);
      for (const [p, y, len] of [[0.85, 0.25, 0.13], [0.85, -0.25, 0.13], [0.85, 0, 0.12], [0.6, 0.55, 0.12], [0.6, -0.55, 0.12]]) this.spike(head, hair, p, y, len, 0.055, 0.12);
      this.chain(head, { pos: [0, 0.1, -0.17], segs: 5, len: 0.16, w: 0.3, t: 0.05, mat: hair, rest: [0.1, 0], drag: 0.06, stiff: 30 });
      this.chain(head, { pos: [0.18, 0.08, 0.0], segs: 3, len: 0.14, w: 0.06, t: 0.05, mat: hair, rest: [0, 0.08], drag: 0.05, stiff: 40 });
      this.chain(head, { pos: [-0.18, 0.08, 0.0], segs: 3, len: 0.14, w: 0.06, t: 0.05, mat: hair, rest: [0, -0.08], drag: 0.05, stiff: 40 });
    }
  }

  buildExtras(L, m) {
    const x = L.extras;
    const accent = L.accent ? this.mat(L.accent) : m.beltM;
    const torso = this.torso;
    const b = m.b;
    if (x.includes('belt') || x.includes('sash')) {
      this.part(new THREE.CylinderGeometry(0.19 * b, 0.19 * b, 0.07, 8), m.beltM, this.hips, [0, 0.06, 0], null, 0.012).scale.z = 0.75;
      this.chain(this.hips, { pos: [0.08, 0.04, 0.16 * b], segs: 2, len: 0.14, w: 0.06, t: 0.02, mat: m.beltM, rest: [-0.1, 0.1], drag: 0.05, stiff: 50 });
      this.chain(this.hips, { pos: [-0.04, 0.04, 0.16 * b], segs: x.includes('sash') ? 4 : 2, len: 0.14, w: 0.06, t: 0.02, mat: m.beltM, rest: [-0.1, -0.05], drag: 0.06, stiff: 45 });
    }
    if (x.includes('scarf')) {
      const sc = this.mat(L.accent || '#c0262f');
      this.part(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 8), sc, torso, [0, 0.56, 0], null, 0.015);
      this.chain(torso, { pos: [0.05, 0.56, -0.1], segs: 6, len: 0.16, w: 0.1, t: 0.02, mat: sc, rest: [0.6, 0.05], drag: 0.1, stiff: 25 });
      this.chain(torso, { pos: [-0.05, 0.55, -0.1], segs: 5, len: 0.15, w: 0.09, t: 0.02, mat: sc, rest: [0.55, -0.05], drag: 0.1, stiff: 25 });
    }
    if (x.includes('mask')) {
      this.part(new THREE.BoxGeometry(0.3, 0.12, 0.08), m.top, this.head, [0, 0.05, 0.13], null, 0.012);
    }
    if (x.includes('headband')) {
      const band = this.mat('#2a2f4a');
      this.part(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 9), band, this.head, [0, 0.22, 0], [-0.2, 0, 0], 0.012);
      this.part(new THREE.BoxGeometry(0.12, 0.05, 0.02), this.mat('#b8c0d8'), this.head, [0, 0.225, 0.2], [-0.2, 0, 0], 0.01);
      this.chain(this.head, { pos: [0.04, 0.24, -0.19], segs: 4, len: 0.12, w: 0.05, t: 0.015, mat: band, rest: [0.9, 0.2], drag: 0.1, stiff: 30 });
      this.chain(this.head, { pos: [-0.04, 0.24, -0.19], segs: 4, len: 0.11, w: 0.05, t: 0.015, mat: band, rest: [0.8, -0.2], drag: 0.1, stiff: 30 });
    }
    if (x.includes('kunai')) {
      const g = new THREE.Group();
      g.position.set(0, -0.05, 0.02);
      g.rotation.x = Math.PI / 2 - 0.4;
      this.handR.add(g);
      this.part(new THREE.ConeGeometry(0.035, 0.24, 4), this.mat('#c8d0e0'), g, [0, 0.16, 0], null, 0.01);
      this.part(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5), this.mat('#2a2f4a'), g, [0, 0, 0], null, 0.008);
    }
    if (x.includes('haori')) {
      const h = accent;
      this.chain(torso, { pos: [0.12, 0.5, -0.12], segs: 4, len: 0.2, w: 0.2, t: 0.03, mat: h, rest: [0.12, 0.08], drag: 0.06, stiff: 32 });
      this.chain(torso, { pos: [-0.12, 0.5, -0.12], segs: 4, len: 0.2, w: 0.2, t: 0.03, mat: h, rest: [0.12, -0.08], drag: 0.06, stiff: 32 });
      for (const s of [-1, 1]) {
        this.part(new THREE.BoxGeometry(0.08, 0.45, 0.06), h, torso, [s * 0.13, 0.32, 0.12], [0, 0, s * 0.08], 0.012);
      }
    }
    if (x.includes('katana')) {
      const g = new THREE.Group();
      g.position.set(0, -0.05, 0);
      g.rotation.x = Math.PI / 2 - 0.9;
      this.handR.add(g);
      this.part(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6), this.mat('#2a1e3a'), g, [0, 0.0, 0], null, 0.01);
      this.part(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), this.mat('#d8b040'), g, [0, 0.12, 0], null, 0.01);
      const blade = this.part(new THREE.BoxGeometry(0.03, 0.85, 0.012), this.mat('#e8f4ff', { emissive: new THREE.Color('#5fa8ff'), emissiveIntensity: 0.25 }), g, [0, 0.55, 0], null, 0.01);
      this.blade = blade;
      // Fourreau à la ceinture
      this.part(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), this.mat('#1a1a28'), this.hips, [0.2, 0.05, -0.05], [1.9, 0, 0.3], 0.012);
    }
    if (x.includes('robe') || x.includes('hakama')) {
      const mat = x.includes('robe') ? m.top : m.pants;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = Math.sin(a) * 0.17 * b;
        const pz = Math.cos(a) * 0.13 * b;
        // panneau de jupe : il pend et s'écarte légèrement vers l'extérieur
        this.chain(this.hips, {
          pos: [px, 0.02, pz], segs: 2, len: x.includes('robe') ? 0.36 : 0.3, w: 0.17, t: 0.03, mat,
          rest: [-Math.cos(a) * 0.18, Math.sin(a) * 0.18], drag: 0.045, stiff: 55, yaw: a,
        });
      }
      if (x.includes('robe')) {
        this.part(new THREE.CylinderGeometry(0.2 * b, 0.2 * b, 0.06, 8), this.mat(L.belt), this.hips, [0, 0.08, 0], null, 0.012).scale.z = 0.75;
      }
    }
    if (x.includes('staff')) {
      const g = new THREE.Group();
      g.position.set(0, -0.04, 0);
      this.handR.add(g);
      this.part(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), this.mat('#5a3a22'), g, [0, 0.25, 0], null, 0.012);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), glowMat(this.def.aura, 2.2));
      orb.position.y = 1.1;
      g.add(orb);
      this.part(new THREE.TorusGeometry(0.12, 0.02, 4, 10, Math.PI * 1.4), this.mat('#d8b040'), g, [0, 1.1, 0], [0, 0, -0.6], 0.008);
      this.orb = orb;
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
      this.hairMats[0].color.copy(c);
      this.hairMats[0].userData.baseEmissive = new THREE.Color(on ? '#8a6a00' : '#000000');
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
      case 'walk': {
        const p = mergePose(stance);
        this.walkPhase += speed * 0.035;
        const s = Math.sin(this.walkPhase * 4);
        const c = Math.cos(this.walkPhase * 4);
        const fw = Math.sign(vF) * Math.min(1, Math.abs(vF) / 5);
        const sd = Math.min(1, Math.abs(vS) / 5);
        p.hipL[0] += s * 0.6 * fw; p.hipR[0] -= s * 0.6 * fw;
        p.hipL[2] += s * 0.25 * sd; p.hipR[2] += s * 0.25 * sd;
        p.knL[0] += Math.max(0, c) * 0.8; p.knR[0] += Math.max(0, -c) * 0.8;
        p.hy += Math.abs(c) * 0.04 - 0.02;
        p.torso[0] += fw * 0.12;
        p.shL[0] -= s * 0.15; p.shR[0] += s * 0.15;
        return p;
      }
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
      case 'idle':
      default: {
        const p = mergePose(stance);
        p.hy += breathe;
        p.shL[0] += breathe; p.shR[0] -= breathe;
        return p;
      }
    }
  }

  movePose(f, stance) {
    const mv = this.def.moves[f.moveId];
    if (!mv) return mergePose(stance);
    const anim = ANIMS[mv.anim] || ANIMS.jab;
    const s = strikeTime(mv);
    const holdEnd = mv.hold ? mv.hold[1] : s + Math.min(0.12, mv.dur * 0.25);
    const t = f.mt;
    const wind = mergePose(stance, anim.wind);
    const strike = mergePose(stance, anim.strike);
    let p;
    if (t < s) {
      p = lerpPose(mergePose(stance), wind, ease(clamp(t / (s * 0.8), 0, 1)));
    } else if (t < holdEnd) {
      p = strike;
    } else {
      p = lerpPose(strike, mergePose(stance), ease(clamp((t - holdEnd) / Math.max(0.05, mv.dur - holdEnd), 0, 1)));
    }
    if (anim.spin) p.body[1] = ease(clamp(t / (s + 0.12), 0, 1)) * TAU;
    if (anim.rush && t >= s && t < holdEnd) {
      // Pluie de coups : bras qui alternent très vite
      const ph = Math.sin(this.time * 46);
      p.shR = [ph > 0 ? -1.6 : -0.7, 0, 0.1]; p.elR = [ph > 0 ? -0.05 : -1.8, 0, 0];
      p.shL = [ph < 0 ? -1.6 : -0.7, 0, -0.1]; p.elL = [ph < 0 ? -0.05 : -1.8, 0, 0];
      p.torso[1] = ph * 0.35;
    }
    return p;
  }

  /**
   * Met à jour le modèle. `f` : état du combattant (objet Fighter ou instantané réseau).
   * `extra` : { cine: bool, auraBoost: 0..1 }
   */
  update(dt, f, extra = {}) {
    this.time += dt;
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.y = f.yaw;

    const target = this.targetPose(f, extra);
    const rate = f.state === 'move' ? 34 : f.state === 'hitstun' || f.state === 'ko' ? 26 : 14;
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
    if (extra.cine) return 0.85;
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
