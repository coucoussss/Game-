// Aura de combat, style anime : des langues de flamme nettes (deux tons, cœur blanc brûlant) qui
// montent autour du corps, plus des éléments qui dépendent de l'intensité et du personnage :
//   repos (énergie pleine)  → lueur discrète au sol
//   charge                  → grandes flammes, éclairs, sol qui se fissure, débris en lévitation
//   maximum (transformation, ultime, charge à pleine énergie) → colonne de lumière, yeux qui brillent
// Chaque combattant a son style (flamme dorée, fumée d'ombre, éclats de lame, givre, foudre…).
import * as THREE from 'three';
import { GLSL_NOISE } from './toon.js';

/**
 * Styles d'aura. core : cœur de la flamme ; blend : 'add' (lumière) ou 'normal' (fumée sombre) ;
 * tongues : nombre de langues ; speed : vitesse de montée ; bolts : éclairs ; rocks : débris ;
 * particle : particules émises par la vue (voir view.js).
 */
export const AURA_STYLES = {
  flame: { core: '#ffffff', tongues: 7, speed: 3.2, soft: 0.06, bolts: 3, particle: 'ember' },
  shadow: { core: '#e8d8ff', tongues: 5, speed: 1.6, soft: 0.18, blend: 'normal', dark: '#14081e', particle: 'smoke' },
  blade: { core: '#ffffff', tongues: 11, speed: 4.5, soft: 0.04, particle: 'streak' },
  frost: { core: '#ffffff', tongues: 6, speed: 2.2, soft: 0.08, particle: 'flake' },
  spirit: { core: '#f0fff8', tongues: 5, speed: 1.8, soft: 0.14, particle: 'wisp' },
  storm: { core: '#ffffff', tongues: 9, speed: 4, soft: 0.04, bolts: 6, particle: 'spark' },
  petal: { core: '#fff4fb', tongues: 6, speed: 2.4, soft: 0.1, particle: 'petal' },
  stone: { core: '#fff2d8', tongues: 6, speed: 2.4, soft: 0.07, rocks: 10, particle: 'dust' },
  blood: { core: '#ffd8e0', tongues: 6, speed: 2, soft: 0.12, blend: 'normal', dark: '#2a0008', particle: 'mist' },
  abyss: { core: '#ff6a7a', tongues: 5, speed: 1.4, soft: 0.16, blend: 'normal', dark: '#06020a', bolts: 2, particle: 'abyss' },
};

const BY_CHAR = {
  kael: 'flame', kage: 'shadow', ren: 'blade', lyra: 'frost', goro: 'flame', sora: 'spirit',
  raiden: 'storm', hana: 'petal', garo: 'stone', yami: 'blood', akane: 'flame', jin: 'spirit',
};

export function auraStyleOf(def) {
  if (def.auraStyle) return def.auraStyle;
  if (BY_CHAR[def.id]) return BY_CHAR[def.id];
  if (def.monster) return def.boss ? 'abyss' : 'shadow';
  return 'flame';
}

const FLAME_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

/** Coque de flammes : forme nette (seuil), cœur clair, langues qui ondulent et montent. */
function flameMaterial(style, color, seed, layer) {
  const normal = style.blend === 'normal';
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uInt: { value: 0 }, uSeed: { value: seed },
      uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(style.core) },
      uDark: { value: new THREE.Color(style.dark || '#000000') },
      uTongues: { value: style.tongues + layer * 2 }, uSpeed: { value: style.speed * (1 + layer * 0.25) },
      uSoft: { value: style.soft }, uLayer: { value: layer },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime, uInt, uSeed, uTongues, uSpeed, uSoft, uLayer;
      uniform vec3 uColor, uCore, uDark;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        vec2 q = vec2(cos(a), sin(a));
        float y = vUv.y;
        float t = uTime * uSpeed;
        float n = vnoise(q * 1.7 + vec2(uSeed, y * 3.2 - t)) * 0.6
                + vnoise(q * 3.9 + vec2(uSeed * 2.0, y * 6.5 - t * 1.7)) * 0.4;
        // Langues de flamme : ondulation autour du corps, qui se tord en montant
        float tongue = 0.5 + 0.5 * sin(a * uTongues + n * 5.0 - uTime * 1.5 + y * 3.0);
        float reach = 0.25 + 0.75 * uInt; // les flammes grandissent avec l'intensité
        float shape = (1.0 - y / reach) * 0.9 + n * 0.6 + tongue * 0.35 - 0.45 - uLayer * 0.08 - smoothstep(0.55, 1.0, y) * 0.9;
        float body = smoothstep(0.0, uSoft, shape);
        float core = smoothstep(0.55, 0.55 + uSoft, shape);
        float rim = 1.0 - abs(dot(vN, vV));
        float vis = body * (0.07 + pow(rim, 1.4) * 1.2) * smoothstep(0.0, 0.05, y) * clamp(uInt * 1.6, 0.0, 1.0);
        vec3 col = mix(uColor, uCore, core * (1.0 - uLayer * 0.4));
        ${normal
    ? 'col = mix(uDark, col, 0.25 + core * 0.75); gl_FragColor = vec4(col, vis * 0.85);'
    : 'gl_FragColor = vec4(col * vis * 0.85, vis);'}
      }`,
    transparent: true,
    depthWrite: false,
    blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Voile de chaleur : bandes très légères qui ondulent (impression de distorsion de l'air). */
function hazeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInt: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime, uInt;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        float n = vnoise(vec2(cos(a), sin(a)) * 3.0 + vec2(0.0, vUv.y * 10.0 - uTime * 6.0));
        float band = smoothstep(0.55, 0.75, n) * (1.0 - smoothstep(0.75, 0.95, n));
        float rim = 1.0 - abs(dot(vN, vV));
        float vis = band * rim * uInt * 0.22 * smoothstep(0.0, 0.2, vUv.y) * (1.0 - vUv.y);
        gl_FragColor = vec4(vec3(1.0) * vis, vis);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Colonne de lumière vers le ciel (intensité maximale). */
function pillarMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uInt: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime, uInt; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        float n = vnoise(vec2(cos(a), sin(a)) * 2.0 + vec2(0.0, vUv.y * 18.0 - uTime * 9.0));
        float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);
        float streak = smoothstep(0.45, 0.8, n);
        float vis = (rim * 0.6 + streak * 0.5) * uInt * (1.0 - vUv.y) * smoothstep(0.0, 0.03, vUv.y);
        vec3 col = mix(uColor, vec3(1.0), streak * 0.6);
        gl_FragColor = vec4(col * vis * 1.5, vis);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Texture du sol fissuré (fissures rayonnantes, lumineuses au centre). */
let crackTex = null;
function crackTexture() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + Math.random() * 0.3;
    let r = 14;
    let x = 128 + Math.cos(a) * r;
    let y = 128 + Math.sin(a) * r;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, y);
    while (r < 118) {
      r += 8 + Math.random() * 12;
      a += (Math.random() - 0.5) * 0.5;
      x = 128 + Math.cos(a) * r;
      y = 128 + Math.sin(a) * r;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1, 4 - r / 40);
      if (Math.random() < 0.25) {
        // Ramification
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a + 0.8) * 14, y + Math.sin(a + 0.8) * 14);
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
  crackTex = new THREE.CanvasTexture(c);
  return crackTex;
}

/** Éclair en ruban (deux rubans croisés : visible sous tous les angles). */
function makeBolt(mat) {
  const g = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < 9; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = k * Math.PI / 2;
    m.frustumCulled = false;
    g.add(m);
  }
  return g;
}

function reshapeBolt(bolt, h) {
  // Un trait en zigzag de bas en haut, autour du corps
  const a = Math.random() * Math.PI * 2;
  const r = 0.35 + Math.random() * 0.35;
  const y0 = 0.2 + Math.random() * 0.6;
  const len = 0.8 + Math.random() * h * 0.6;
  for (const m of bolt.children) {
    const p = m.geometry.attributes.position;
    let x = 0;
    for (let i = 0; i < 10; i++) {
      const y = y0 + (len * i) / 9;
      x += (Math.random() - 0.5) * 0.22;
      const w = 0.035 * (1 - i / 12);
      p.setXYZ(i * 2, x - w, y, 0);
      p.setXYZ(i * 2 + 1, x + w, y, 0);
    }
    p.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  }
  bolt.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  bolt.rotation.y = a;
}

const RAINBOW = new THREE.Color();

export class AuraFX {
  /**
   * @param model  CharacterModel (on se greffe sur sa racine et sa tête)
   */
  constructor(model) {
    this.model = model;
    const def = model.def;
    this.def = def;
    this.styleId = auraStyleOf(def);
    this.style = AURA_STYLES[this.styleId];
    this.root = new THREE.Group();
    model.root.add(this.root);
    this.level = 0;
    this.max = 0;
    this.time = 0;
    this.mats = [];
    const color = def.aura;
    // Trois coques de flammes : intérieure (dense), médiane, extérieure (grandes langues)
    this.shells = [[0.42, 0.58, 2.3], [0.6, 0.8, 2.8], [0.82, 1.05, 3.4]].map(([rt, rb, h], i) => {
      const mat = flameMaterial(this.style, color, i * 7.3 + Math.random() * 3, i);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 24, 1, true), mat);
      mesh.position.y = h / 2 - 0.1;
      mesh.renderOrder = 5 + i;
      this.root.add(mesh);
      this.mats.push(mat);
      return mesh;
    });
    this.haze = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 3.2, 20, 1, true), hazeMaterial());
    this.haze.position.y = 1.5;
    this.root.add(this.haze);
    // Sol fissuré et lumineux
    this.cracks = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({
      map: crackTexture(), color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    }));
    this.cracks.rotation.x = -Math.PI / 2;
    this.cracks.position.y = 0.03;
    this.root.add(this.cracks);
    // Colonne de lumière
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 40, 24, 1, true), pillarMaterial(color));
    this.pillar.position.y = 20;
    this.pillar.renderOrder = 4;
    this.root.add(this.pillar);
    // Éclairs
    this.boltMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.styleId === 'abyss' ? '#ff2a4a' : '#ffffff').lerp(new THREE.Color(color), 0.25).multiplyScalar(2.2),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.bolts = [];
    const nb = this.style.bolts || 2; // tout le monde a quelques éclairs à pleine charge
    for (let i = 0; i < nb; i++) {
      const b = makeBolt(this.boltMat);
      b.visible = false;
      this.root.add(b);
      this.bolts.push({ g: b, t: Math.random() * 0.1 });
    }
    // Débris en lévitation
    const rockMat = new THREE.MeshToonMaterial({ color: new THREE.Color(this.styleId === 'stone' ? '#8a7a68' : '#6a6070') });
    this.rocks = [];
    const nr = this.style.rocks || 6;
    for (let i = 0; i < nr; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.09, 0), rockMat);
      const a = (i / nr) * Math.PI * 2 + Math.random() * 0.4;
      r.userData = { a, r: 0.9 + Math.random() * 0.9, h: 0.3 + Math.random() * 1.8, s: 0.5 + Math.random(), y: 0 };
      r.visible = false;
      this.root.add(r);
      this.rocks.push(r);
    }
    this.rockMat = rockMat;
    // Yeux qui brillent (sprites additifs posés sur le visage)
    this.eyes = [];
    if (model.head) {
      const em = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      for (const sd of [-1, 1]) {
        const s = new THREE.Sprite(em);
        s.scale.setScalar(0.1);
        s.position.set(sd * 0.072, 0.128, 0.19);
        model.head.add(s);
        this.eyes.push(s);
      }
      this.eyeMat = em;
    }
    this.setVisible(false);
  }

  setVisible(v) {
    this.root.visible = v;
  }

  setColor(color) {
    for (const m of this.mats) m.uniforms.uColor.value.set(color);
    this.pillar.material.uniforms.uColor.value.set(color);
    this.cracks.material.color.set(color).multiplyScalar(1.4);
    if (this.eyeMat) this.eyeMat.color.set(color).multiplyScalar(2);
  }

  /**
   * @param level  intensité des flammes 0..1
   * @param charge 0..1 : on charge (fissures, débris, éclairs)
   * @param max    0..1 : intensité maximale (colonne de lumière, yeux)
   */
  update(dt, level, charge, max) {
    // Aura arc-en-ciel (rang Légende) : la couleur tourne sans cesse
    if (this.def.rainbow) {
      this.hue = ((this.hue || 0) + dt * 0.25) % 1;
      this.setColor(RAINBOW.setHSL(this.hue, 1, 0.6));
    }
    this.time += dt;
    const k = Math.min(1, dt * 8);
    this.level += (level - this.level) * k;
    this.charge = (this.charge || 0) + (charge - (this.charge || 0)) * Math.min(1, dt * 3);
    this.max += (max - this.max) * Math.min(1, dt * 5);
    const on = this.level > 0.02 || this.charge > 0.02 || this.max > 0.02;
    this.root.visible = on;
    if (this.eyeMat) this.eyeMat.opacity = Math.min(1, this.max * 1.2);
    if (!on) return;
    for (const m of this.mats) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uInt.value = this.level;
    }
    for (let i = 0; i < this.shells.length; i++) this.shells[i].visible = this.level > 0.02 && (i < 2 || this.level > 0.35);
    const pulse = 1 + Math.sin(this.time * 18) * 0.02;
    this.root.scale.set(pulse, 1, pulse);
    this.haze.visible = this.level > 0.3;
    this.haze.material.uniforms.uTime.value = this.time;
    this.haze.material.uniforms.uInt.value = this.level;
    // Fissures
    this.cracks.material.opacity = Math.min(0.9, this.charge * 0.9 + this.max * 0.4);
    this.cracks.visible = this.cracks.material.opacity > 0.01;
    this.cracks.scale.setScalar(0.6 + this.charge * 0.5);
    this.cracks.rotation.z += dt * 0.05;
    // Colonne de lumière
    this.pillar.visible = this.max > 0.02;
    this.pillar.material.uniforms.uTime.value = this.time;
    this.pillar.material.uniforms.uInt.value = this.max * 0.8;
    this.pillar.scale.set(0.6 + this.max * 0.5, 1, 0.6 + this.max * 0.5);
    // Éclairs : renouvelés à toute vitesse pendant la charge et au maximum
    const boltOn = Math.max(this.charge, this.max) > 0.5;
    for (const b of this.bolts) {
      b.t -= dt;
      if (!boltOn) { b.g.visible = false; continue; }
      if (b.t <= 0) {
        b.t = 0.05 + Math.random() * 0.12;
        b.g.visible = Math.random() < 0.75;
        if (b.g.visible) reshapeBolt(b.g, 2.2);
      }
    }
    // Débris : ils se soulèvent pendant la charge et retombent ensuite
    for (const r of this.rocks) {
      const u = r.userData;
      const want = this.charge > 0.3 ? u.h * this.charge : 0;
      u.y += (want - u.y) * Math.min(1, dt * (want > u.y ? 1.5 : 4));
      r.visible = u.y > 0.03;
      if (!r.visible) continue;
      u.a += dt * u.s * 0.8;
      r.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(this.time * 2 + u.a) * 0.08, Math.sin(u.a) * u.r);
      r.rotation.x += dt * u.s * 2;
      r.rotation.y += dt * u.s * 1.5;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.haze.material.dispose();
    this.pillar.material.dispose();
    this.cracks.material.dispose();
    this.boltMat.dispose();
    this.rockMat.dispose();
    if (this.eyeMat) this.eyeMat.dispose();
    for (const e of this.eyes) e.parent && e.parent.remove(e);
    this.root.parent && this.root.parent.remove(this.root);
  }
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
