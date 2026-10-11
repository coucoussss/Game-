// Effets visuels : particules (GPU, en mélange additif), anneaux d'onde de choc, éclairs,
// arcs de taille, lumières d'impact, rayons d'énergie et colonnes de flammes.
import * as THREE from 'three';
import { radialTexture, GLSL_NOISE } from './toon.js';

const rand = (a, b) => a + Math.random() * (b - a);

// --- Particules -----------------------------------------------------------------------------

export class Particles {
  constructor(scene, max = 5000) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.data = new Float32Array(max * 6); // vie, vie max, taille début, taille fin, gravité, frottement
    this.base = new Float32Array(max * 3); // couleur d'origine
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('acolor', this.aCol);
    geo.setAttribute('size', this.aSize);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float size; attribute vec4 acolor; varying vec4 vColor; uniform float uScale;
        void main() {
          vColor = acolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a;
          gl_FragColor = vec4(vColor.rgb * vColor.a * a, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.tmpColor = new THREE.Color();
    this.density = 1;
  }

  setViewport(height, fov) {
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }

  /**
   * Émet des particules. o : { x, y, z, count, speed, color, size, sizeEnd, life, gravity, drag,
   *   dir: [x,y,z] (sinon sphérique), cone (0..1), spread (rayon de départ), up (vitesse verticale ajoutée), hdr }
   */
  emit(o) {
    const count = Math.max(1, Math.round((o.count || 10) * this.density));
    const c = this.tmpColor.set(o.color || '#ffffff').multiplyScalar(o.hdr || 1.15);
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      let dx; let dy; let dz;
      if (o.dir) {
        const cone = o.cone ?? 0.3;
        dx = o.dir[0] + rand(-cone, cone);
        dy = o.dir[1] + rand(-cone, cone);
        dz = o.dir[2] + rand(-cone, cone);
      } else {
        dx = rand(-1, 1); dy = rand(-1, 1); dz = rand(-1, 1);
        if (o.flat) dy *= 0.15;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = (o.speed ?? 5) * rand(0.4, 1);
      const sr = o.spread || 0;
      this.pos[i * 3] = o.x + rand(-sr, sr);
      this.pos[i * 3 + 1] = o.y + rand(-sr, sr) * (o.flat ? 0.2 : 1);
      this.pos[i * 3 + 2] = o.z + rand(-sr, sr);
      this.vel[i * 3] = (dx / l) * sp;
      this.vel[i * 3 + 1] = (dy / l) * sp + (o.up || 0);
      this.vel[i * 3 + 2] = (dz / l) * sp;
      const life = (o.life ?? 0.6) * rand(0.6, 1.2);
      const d = this.data;
      d[i * 6] = life;
      d[i * 6 + 1] = life;
      d[i * 6 + 2] = (o.size ?? 0.25) * rand(0.6, 1.3);
      d[i * 6 + 3] = o.sizeEnd ?? 0;
      d[i * 6 + 4] = o.gravity ?? 0;
      d[i * 6 + 5] = o.drag ?? 2;
      this.base[i * 3] = c.r; this.base[i * 3 + 1] = c.g; this.base[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    const d = this.data;
    let i = 0;
    while (i < this.n) {
      d[i * 6] -= dt;
      if (d[i * 6] <= 0) {
        // Remplace par la dernière particule (pas de trou dans le tableau)
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
            this.base[i * 3 + k] = this.base[j * 3 + k];
          }
          for (let k = 0; k < 6; k++) d[i * 6 + k] = d[j * 6 + k];
        }
        continue;
      }
      const drag = Math.exp(-d[i * 6 + 5] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - d[i * 6 + 4] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = d[i * 6] / d[i * 6 + 1]; // 1 → 0
      this.size[i] = d[i * 6 + 3] + (d[i * 6 + 2] - d[i * 6 + 3]) * k;
      const a = Math.min(1, k * 2.5);
      this.col[i * 4] = this.base[i * 3];
      this.col[i * 4 + 1] = this.base[i * 3 + 1];
      this.col[i * 4 + 2] = this.base[i * 3 + 2];
      this.col[i * 4 + 3] = a;
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  clear() { this.n = 0; }
}

// --- Effets ponctuels (anneaux, éclairs, arcs, lumières) -------------------------------------

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.thinRingGeo = new THREE.RingGeometry(0.95, 1, 48);
    this.sphereGeo = new THREE.SphereGeometry(1, 20, 12);
    this.arcGeo = new THREE.RingGeometry(0.75, 1.35, 24, 1, -0.2, 2.6);
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 10, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, max: 0 });
    }
  }

  add(obj, upd, dur) {
    this.scene.add(obj);
    this.items.push({ obj, upd, t: 0, dur });
  }

  /** Onde de choc au sol (anneau horizontal qui s'élargit). */
  groundRing(x, y, z, r0, r1, dur, color, opacity = 0.9) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.05, z);
    this.add(m, (k) => {
      const r = r0 + (r1 - r0) * (1 - (1 - k) ** 3);
      m.scale.set(r, r, r);
      mat.opacity = opacity * (1 - k);
    }, dur);
  }

  /** Anneau vertical tourné vers la caméra (impact). */
  burstRing(x, y, z, r0, r1, dur, color, camera) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.thinRingGeo, mat);
    m.position.set(x, y, z);
    m.quaternion.copy(camera.quaternion);
    this.add(m, (k) => {
      const r = r0 + (r1 - r0) * (1 - (1 - k) ** 2);
      m.scale.set(r, r, r);
      mat.opacity = 1 - k;
    }, dur);
  }

  /** Anneau perpendiculaire à une direction (anneaux le long d'un rayon). */
  orientedRing(x, y, z, dx, dy, dz, r0, r1, dur, color) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.thinRingGeo, mat);
    m.position.set(x, y, z);
    m.lookAt(x + dx, y + dy, z + dz);
    this.add(m, (k) => {
      const r = r0 + (r1 - r0) * k;
      m.scale.set(r, r, r);
      mat.opacity = 0.9 * (1 - k);
    }, dur);
  }

  /** Sphère translucide qui gonfle (explosion, onde d'énergie). */
  shockSphere(x, y, z, r0, r1, dur, color) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(this.sphereGeo, mat);
    m.position.set(x, y, z);
    this.add(m, (k) => {
      const r = r0 + (r1 - r0) * (1 - (1 - k) ** 3);
      m.scale.set(r, r, r);
      mat.opacity = 0.6 * (1 - k) ** 1.5;
    }, dur);
  }

  /** Éclair lumineux (sprite additif). */
  flash(x, y, z, size, dur, color = '#ffffff') {
    const mat = new THREE.SpriteMaterial({
      map: radialTexture(), color: new THREE.Color(color).multiplyScalar(2.5), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    this.add(s, (k) => {
      const r = size * (0.6 + k * 0.8);
      s.scale.set(r, r, r);
      mat.opacity = (1 - k) ** 2;
    }, dur);
  }

  /** Arc de taille devant un combattant. `variant` choisit l'orientation. */
  slashArc(x, y, z, yaw, variant, color, scale = 1.4) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.arcGeo, mat);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    g.add(m);
    // Orientation de l'arc selon le type de taille
    const tilt = { 1: [0.2, 0, -0.7], 2: [-0.2, 0, 0.7], 3: [0, Math.PI / 2, 0], 4: [0, Math.PI / 2, Math.PI], 5: [-Math.PI / 2, 0, 0] }[variant] || [-Math.PI / 2, 0, 0];
    m.rotation.set(tilt[0] - Math.PI / 2, tilt[1], tilt[2]);
    m.position.z = 0.6;
    this.add(g, (k) => {
      const s = scale * (0.85 + k * 0.4);
      m.scale.set(s, s, s);
      mat.opacity = 0.95 * (1 - k) ** 1.5;
      m.rotation.z = tilt[2] + k * 0.8;
    }, 0.18);
  }

  /** Lumière ponctuelle brève (éclaire le décor en cel-shading). */
  light(x, y, z, color, intensity, dur, range = 10) {
    let slot = this.lights.find((s) => s.t >= s.dur) || this.lights.reduce((a, b) => (a.max - a.t < b.max - b.t ? a : b));
    slot.l.position.set(x, y, z);
    slot.l.color.set(color);
    slot.l.distance = range;
    slot.l.visible = true;
    slot.t = 0;
    slot.dur = dur;
    slot.max = intensity;
  }

  /** Trait lumineux entre deux points (sillage d'une technique de sabre). */
  streak(x1, y1, z1, x2, y2, z2, color, dur = 0.5, width = 0.12) {
    const dx = x2 - x1; const dy = y2 - y1; const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz) || 0.01;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, width * 0.3, len), mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.lookAt(x2, y2, z2);
    this.add(m, (k) => {
      m.scale.x = 1 + k * 2;
      mat.opacity = 1 - k;
      if (k >= 1) m.geometry.dispose();
    }, dur);
  }

  update(dt) {
    for (const it of this.items) {
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.upd(k);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.dead = true;
        it.obj.traverse((o) => { if (o.material) o.material.dispose(); });
      }
    }
    this.items = this.items.filter((i) => !i.dead);
    for (const s of this.lights) {
      if (s.t >= s.dur) { s.l.visible = false; continue; }
      s.t += dt;
      s.l.intensity = s.max * Math.max(0, 1 - s.t / s.dur) ** 2;
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
  }
}

// --- Visuels persistants : rayon, flammes -----------------------------------------------------

export function flameMaterial(color, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uInt: { value: intensity } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform float uInt; varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        vec2 q = vec2(cos(a), sin(a)) * 2.0;
        float n = vnoise(q + vec2(0.0, vUv.y * 5.0 - uTime * 6.0)) * 0.6 + vnoise(q * 2.0 + vec2(1.7, vUv.y * 9.0 - uTime * 9.0)) * 0.4;
        float f = smoothstep(0.25, 0.75, n + (1.0 - vUv.y) * 0.45) * (1.0 - smoothstep(0.6, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.y);
        vec3 col = mix(uColor, vec3(1.0, 0.95, 0.8), smoothstep(0.7, 1.0, n + (1.0 - vUv.y) * 0.3));
        gl_FragColor = vec4(col * f * 2.0 * uInt, f * uInt);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform float uFade;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        float a = vUv.x * 6.2831853;
        float n = vnoise(vec2(cos(a) * 2.0 + vUv.y * 30.0 - uTime * 25.0, sin(a) * 2.0));
        float facing = abs(dot(vN, vV));
        float core = smoothstep(0.2, 1.0, facing);
        vec3 col = mix(uColor * 1.3, vec3(1.6), core * 0.6);
        float alpha = (0.25 + core * 0.5) * (0.7 + n * 0.5) * uFade;
        gl_FragColor = vec4(col * alpha, alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** Rayon d'énergie : cylindre orienté le long de Z, de longueur variable. */
export class BeamVisual {
  constructor(scene, color) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.mat = beamMaterial(color);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 0.5);
    this.outer = new THREE.Mesh(geo, this.mat);
    this.inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.outer, this.inner);
    const sm = new THREE.SpriteMaterial({ map: radialTexture(), color: new THREE.Color(color).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.head = new THREE.Sprite(sm);
    this.tail = new THREE.Sprite(sm);
    this.group.add(this.head, this.tail);
    scene.add(this.group);
    this.time = 0;
  }

  update(dt, e) {
    this.time += dt;
    const w = e.width * (1 + Math.sin(this.time * 40) * 0.08);
    const dirLen = Math.hypot(e.dx, e.dy, e.dz) || 1;
    this.group.position.set(e.x, e.y, e.z);
    this.group.lookAt(e.x + e.dx / dirLen, e.y + e.dy / dirLen, e.z + e.dz / dirLen);
    const grow = Math.min(1, e.t / 0.15);
    const fade = e.t > e.dur - 0.2 ? Math.max(0, (e.dur - e.t) / 0.2) : 1;
    this.outer.scale.set(w * grow, w * grow, Math.max(0.01, e.len));
    this.inner.scale.set(w * 0.4 * grow, w * 0.4 * grow, Math.max(0.01, e.len));
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uFade.value = fade;
    this.head.position.set(0, 0, e.len);
    this.head.scale.setScalar(w * 2.6 * grow);
    this.tail.position.set(0, 0, 0);
    this.tail.scale.setScalar(w * 2.2);
  }

  dispose() {
    this.scene.remove(this.group);
    this.mat.dispose();
  }
}

// --- Traînée de mouvement (« smear » des coups d'anime) -----------------------------------------
// Un ruban lumineux, toujours face à la caméra, qui suit une main, un pied ou la pointe d'une arme
// pendant la frappe, puis s'efface en ~0,15 s.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
export class Trail {
  constructor(scene, color, width = 0.16, max = 16) {
    this.scene = scene;
    this.max = max;
    this.width = width;
    this.pts = []; // { p: Vector3, age }
    this.color = new THREE.Color(color).multiplyScalar(1.6);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.col = new Float32Array(max * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
  }

  /** À chaque image : `active` = le coup est en train de frapper. */
  update(dt, point, camPos, active) {
    for (const q of this.pts) q.age += dt;
    this.pts = this.pts.filter((q) => q.age < 0.16);
    if (active && point) {
      const last = this.pts[0];
      if (!last || last.p.distanceToSquared(point) > 0.0004) this.pts.unshift({ p: point.clone(), age: 0 });
      if (this.pts.length > this.max) this.pts.length = this.max;
    }
    const n = this.pts.length;
    const geo = this.mesh.geometry;
    if (n < 2) { geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = this.pts[i].p;
      const nb = this.pts[Math.min(n - 1, i + 1)].p;
      const pr = this.pts[Math.max(0, i - 1)].p;
      _a.subVectors(pr, nb).normalize(); // direction du mouvement
      _b.subVectors(camPos, p).normalize();
      _c.crossVectors(_a, _b).normalize();
      const k = 1 - i / (n - 1);
      const w = this.width * (0.25 + 0.75 * k) * (1 - this.pts[i].age / 0.16);
      this.pos.set([p.x + _c.x * w, p.y + _c.y * w, p.z + _c.z * w, p.x - _c.x * w, p.y - _c.y * w, p.z - _c.z * w], i * 6);
      const a = k * k * (1 - this.pts[i].age / 0.16);
      for (let j = 0; j < 2; j++) this.col.set([this.color.r * a, this.color.g * a, this.color.b * a], i * 6 + j * 3);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// --- Sceau magique (cercle de runes au sol, pendant les ultimes) -------------------------------
let sealTex = null;
export function sealTexture() {
  if (sealTex) return sealTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 6;
  for (const r of [240, 222, 150, 132]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  // Étoile à 8 branches
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i * 3 * Math.PI * 2) / 8;
    const x = Math.cos(a) * 222;
    const y = Math.sin(a) * 222;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  // Runes entre les deux cercles extérieurs
  const runes = '覚醒神風雷炎氷魂龍光闇剣拳霊天地気力斬破滅極';
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillText(runes[i % runes.length], 0, -231);
    g.restore();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * 141, Math.sin(a) * 141, 8, 0, Math.PI * 2);
    g.fill();
  }
  sealTex = new THREE.CanvasTexture(c);
  return sealTex;
}
