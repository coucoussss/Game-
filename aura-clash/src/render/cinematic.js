// Mise en scène des ultimes, façon anime : trois plans enchaînés en coupes franches pendant la
// cinématique (gros plan sur les yeux, contre-plongée héroïque, plan par-dessus l'épaule vers la
// cible), un décor de lignes de vitesse aux couleurs de l'aura qui remplace l'arène, et un sceau
// magique qui tourne au sol.
import * as THREE from 'three';
import { faceOf } from './riggedModel.js';
import { sealTexture } from './fx.js';

const tmp = new THREE.Vector3();

function backdropMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uRes: { value: new THREE.Vector2(1, 1) }, uFade: { value: 0 },
    },
    vertexShader: /* glsl */`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform vec2 uRes; uniform float uFade;
      float h(float n) { return fract(sin(n * 91.345) * 47453.123); }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes - 0.5;
        uv.x *= uRes.x / uRes.y;
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        // Lignes de vitesse radiales qui filent vers l'extérieur
        float ray = floor(a * 38.0);
        float seed = h(ray);
        float stream = fract(r * (1.5 + seed) - uTime * (1.8 + seed * 2.5) - seed * 10.0);
        float line = step(0.55, seed) * smoothstep(0.0, 0.25, stream) * (1.0 - smoothstep(0.25, 0.7, stream));
        // Fond : couleur de l'aura au centre, nuit d'encre sur les bords
        vec3 base = mix(uColor * 0.5, vec3(0.03, 0.02, 0.06), smoothstep(0.0, 0.6, r));
        vec3 col = base + mix(uColor, vec3(1.0), 0.6) * line * smoothstep(0.12, 0.4, r) * 0.75;
        // Halo pulsé
        col += uColor * 0.22 * (1.0 - smoothstep(0.0, 0.3, r)) * (0.7 + 0.3 * sin(uTime * 18.0));
        gl_FragColor = vec4(mix(vec3(0.0), col, uFade), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: true,
    fog: false,
  });
}

export class CineDirector {
  constructor(stage, overlay, audio) {
    this.stage = stage;
    this.overlay = overlay;
    this.audio = audio;
    this.active = null;
    this.bg = new THREE.Mesh(new THREE.SphereGeometry(5.5, 32, 16), backdropMaterial('#ffffff'));
    this.bg.renderOrder = -5;
    this.bg.visible = false;
    this.bg.frustumCulled = false;
    stage.scene.add(this.bg);
    this.seals = [];
  }

  /** Sceau magique au sol (couleur de l'aura) ; `life` en secondes. */
  seal(x, z, r, color, life = 2, spin = 1.5) {
    const mat = new THREE.MeshBasicMaterial({
      map: sealTexture(), color: new THREE.Color(color).multiplyScalar(1.8), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.04, z);
    m.renderOrder = 6;
    this.stage.scene.add(m);
    this.seals.push({ m, t: 0, life, spin });
  }

  /** Début de la cinématique d'un ultime. */
  start(model, fighter, color, dur) {
    this.active = { model, f: fighter, color, dur, t: 0, shot: -1 };
    this.bg.material.uniforms.uColor.value.set(color);
    this.bg.position.set(fighter.x, fighter.y + 1, fighter.z);
    this.bg.visible = true;
    this.seal(fighter.x, fighter.z, 2.6, color, dur + 0.6, 2.2);
  }

  stop() {
    if (!this.active) return;
    this.active = null;
    this.bgOut = 0.18; // le décor d'anime s'efface vite
    if (this.stage.rig.focus && this.stage.rig.focus.mode === 'manual') this.stage.rig.focus = null;
  }

  update(dt) {
    const rig = this.stage.rig;
    const u = this.bg.material.uniforms;
    u.uTime.value += dt;
    this.stage.renderer.getDrawingBufferSize(u.uRes.value);
    // Sceaux
    for (const s of this.seals) {
      s.t += dt;
      const k = Math.min(1, s.t / 0.25);
      const fade = Math.max(0, Math.min(1, (s.life - s.t) / 0.4));
      s.m.scale.setScalar(0.3 + 0.7 * (1 - (1 - k) ** 3));
      s.m.rotation.z += dt * s.spin;
      s.m.material.opacity = fade;
    }
    this.seals = this.seals.filter((s) => {
      if (s.t < s.life) return true;
      this.stage.scene.remove(s.m);
      s.m.geometry.dispose();
      s.m.material.dispose();
      return false;
    });
    if (this.bgOut > 0) {
      this.bgOut -= dt;
      u.uFade.value = Math.max(0, this.bgOut / 0.18);
      if (this.bgOut <= 0) this.bg.visible = false;
    }
    const c = this.active;
    if (!c) return;
    c.t += dt;
    u.uFade.value = Math.min(1, c.t / 0.12);
    const k = c.t / c.dur;
    const shot = k < 0.3 ? 0 : k < 0.64 ? 1 : 2;
    const f = c.f;
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    const rx = fz;
    const rz = -fx;
    const focus = { mode: 'manual', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, roll: 0, cut: false };
    if (shot !== c.shot) {
      // Coupe : éclair blanc d'une image et souffle
      c.shot = shot;
      focus.cut = true;
      this.overlay.flash('#ffffff', 0.07);
      this.audio.play(shot === 0 ? 'teleport' : 'dash');
    }
    const sc = faceOf(c.model, tmp); // géants (boss du mode Vagues) et têtes « chibi » : plans élargis
    const hx = tmp.x; const hy = tmp.y; const hz = tmp.z;
    if (shot === 0) {
      // Gros plan sur le regard, qui avance lentement
      const p = k / 0.3;
      const d = (0.62 - p * 0.14) * sc;
      focus.pos.set(hx + fx * d + rx * 0.04 * sc, hy + 0.01, hz + fz * d + rz * 0.04 * sc);
      focus.look.set(hx, hy - 0.01, hz);
      focus.fov = 26 - p * 4;
    } else if (shot === 1) {
      // Contre-plongée héroïque qui tourne autour du combattant, cadre penché
      const p = (k - 0.3) / 0.34;
      const ang = 0.7 - p * 0.9;
      const ox = fx * Math.cos(ang) - rx * Math.sin(ang);
      const oz = fz * Math.cos(ang) - rz * Math.sin(ang);
      focus.pos.set(f.x + ox * 2.2 * sc, f.y + 0.25, f.z + oz * 2.2 * sc);
      focus.look.set(f.x, f.y + 1.25 * sc, f.z);
      focus.fov = 46;
      focus.roll = 0.14;
    } else {
      // Par-dessus l'épaule, vers la cible
      const p = (k - 0.64) / 0.36;
      focus.pos.set(f.x - fx * (2.5 - p * 0.5) * sc + rx * 1.1 * sc, f.y + 1.65 * sc, f.z - fz * (2.5 - p * 0.5) * sc + rz * 1.1 * sc);
      focus.look.set(f.x + fx * 6, f.y + 1.0, f.z + fz * 6);
      focus.fov = 54 - p * 6;
      focus.roll = -0.09;
    }
    if (rig.focus && rig.focus.mode === 'manual' && !focus.cut) {
      Object.assign(rig.focus, focus);
    } else {
      rig.setFocus(focus);
    }
    // Débris et poussière qui s'élèvent autour du combattant
    const pt = this.stage.particles;
    pt.emit({ x: f.x, y: 0.1, z: f.z, count: 3, spread: 2.2, dir: [0, 1, 0], cone: 0.15, speed: 3, color: '#b8a890', size: 0.22, life: 0.9, hdr: 0.6, drag: 0.5 });
    pt.emit({ x: f.x, y: f.y + 1, z: f.z, count: 4, spread: 0.7, dir: [0, 1, 0], cone: 0.5, speed: 6, color: c.color, size: 0.25, life: 0.5 });
  }

  clear() {
    this.active = null;
    this.bg.visible = false;
    this.bgOut = 0;
    for (const s of this.seals) { this.stage.scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); }
    this.seals = [];
  }
}
