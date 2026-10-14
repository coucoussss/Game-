// Affichage des arènes interactives : obstacles destructibles, marée de lave, zones électriques.
import * as THREE from 'three';
import { toonPart, toonMat, glowMat } from './toon.js';
import { createHazards } from '../game/hazards.js';

export class HazardView {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.props = [];
    this.arena = null;
    this.zaps = [];
    this.lava = null;
  }

  /** (Re)construit les obstacles de l'arène. */
  setup(arena) {
    this.clear();
    this.arena = arena;
    const h = createHazards(arena);
    for (const p of h.props) {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      if (p.kind === 'pillar') {
        const m = toonPart(new THREE.CylinderGeometry(0.6, 0.85, 3.2, 7), toonMat('#7a6a5a', { flatShading: true }), { outline: 0.03 });
        m.position.y = 1.6;
        g.add(m);
      } else if (p.kind === 'lantern') {
        const stone = toonMat('#8a8478');
        const base = toonPart(new THREE.CylinderGeometry(0.35, 0.5, 1.2, 6), stone, { outline: 0.02 });
        base.position.y = 0.6;
        const box = toonPart(new THREE.BoxGeometry(0.8, 0.6, 0.8), stone, { outline: 0.02 });
        box.position.y = 1.5;
        const roof = toonPart(new THREE.ConeGeometry(0.75, 0.5, 4), stone, { outline: 0.02 });
        roof.position.y = 2.05;
        roof.rotation.y = Math.PI / 4;
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.82), glowMat('#ffb05a', 2.4));
        light.position.y = 1.5;
        g.add(base, box, roof, light);
      } else if (p.kind === 'stalagmite') {
        const m = toonPart(new THREE.ConeGeometry(0.7, 2.8, 6), toonMat('#bfe8ff', { transparent: true, opacity: 0.9 }), { outline: 0.02 });
        m.position.y = 1.4;
        g.add(m);
      }
      this.group.add(g);
      this.props.push({ g, alive: true, shake: 0 });
    }
    if (arena === 'volcano') {
      // Couronne de lave qui déborde depuis le bord de l'arène
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uInner: { value: 18 }, uOuter: { value: 18 } },
        vertexShader: /* glsl */`varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`varying vec2 vP; uniform float uTime, uInner, uOuter;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main() {
            float r = length(vP);
            float a = atan(vP.y, vP.x);
            float edge = uInner + (n(vec2(a * 6.0, uTime * 0.8)) - 0.5) * 0.6;
            if (r < edge || uOuter - uInner < 0.05) discard;
            float v = n(vP * 1.5 + vec2(uTime * 0.4, uTime * 0.25));
            vec3 col = mix(vec3(0.8, 0.12, 0.0), vec3(1.8, 0.8, 0.15), smoothstep(0.3, 0.8, v));
            col += vec3(2.0, 1.4, 0.5) * smoothstep(edge + 0.3, edge, r);
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      this.lava = new THREE.Mesh(new THREE.RingGeometry(10, 18.6, 96, 1), mat);
      this.lava.rotation.x = -Math.PI / 2;
      this.lava.position.y = 0.04;
      this.lava.renderOrder = 1;
      this.group.add(this.lava);
    }
  }

  clear() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose && !o.material.userData?.shared) o.material.dispose();
    });
    this.group.clear();
    this.props = [];
    this.zaps = [];
    this.lava = null;
    this.arena = null;
  }

  handleEvent(ev) {
    const fx = this.stage.effects;
    const p = this.stage.particles;
    if (ev.type === 'prop') {
      const vp = this.props[ev.id];
      if (!vp) return;
      if (ev.hit && ev.alive) { vp.shake = 0.25; return; }
      vp.alive = ev.alive;
      vp.g.visible = ev.alive;
      if (!ev.alive) {
        const col = ev.kind === 'lantern' ? '#ffb05a' : ev.kind === 'stalagmite' ? '#bfe8ff' : '#9a8a78';
        p.emit({ x: ev.x, y: 1.2, z: ev.z, count: 50, speed: 9, color: col, size: 0.4, life: 0.7, drag: 2, up: 3 });
        p.emit({ x: ev.x, y: 0.2, z: ev.z, count: 30, flat: true, speed: 6, color: '#b8a890', size: 0.6, life: 0.6, hdr: 0.5 });
        fx.shockSphere(ev.x, 1, ev.z, 0.3, ev.kind === 'lantern' ? 3.2 : 2.4, 0.35, col);
        if (ev.kind === 'lantern') fx.light(ev.x, 1.4, ev.z, '#ffb05a', 8, 0.5, 10);
      } else {
        p.emit({ x: vp.g.position.x, y: 1, z: vp.g.position.z, count: 20, speed: 3, color: '#ffffff', size: 0.3, life: 0.5 });
      }
    } else if (ev.type === 'zapWarn') {
      // Avertissement : cercle qui clignote au sol avant la décharge
      const ring = new THREE.Mesh(new THREE.RingGeometry(ev.r - 0.15, ev.r, 40), glowMat('#5af0ff', 2, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ev.x, 0.06, ev.z);
      this.group.add(ring);
      this.zaps.push({ ring, t: 0, x: ev.x, z: ev.z, r: ev.r, live: 0 });
    } else if (ev.type === 'zap') {
      const z = this.zaps.find((q) => Math.abs(q.x - ev.x) < 0.01 && Math.abs(q.z - ev.z) < 0.01);
      if (z) z.live = 1.5;
      fx.light(ev.x, 1, ev.z, '#5af0ff', 8, 1.5, 8);
      fx.groundRing(ev.x, 0.05, ev.z, 0.3, ev.r * 1.3, 0.4, '#5af0ff');
    } else if (ev.type === 'lava') {
      if (ev.rising) fx.light(0, 1, 0, '#ff6a1a', 4, 1, 40);
    }
  }

  update(dt, state) {
    const h = state.hazards;
    for (const vp of this.props) {
      if (vp.shake > 0) {
        vp.shake -= dt;
        vp.g.rotation.z = Math.sin(vp.shake * 80) * vp.shake * 0.3;
      }
    }
    if (h && h.props) h.props.forEach((p, i) => { if (this.props[i] && this.props[i].alive !== p.alive) { this.props[i].alive = p.alive; this.props[i].g.visible = p.alive; } });
    if (this.lava) {
      const reach = h ? h.lava : 0;
      const u = this.lava.material.uniforms;
      u.uTime.value += dt;
      const R = 18 - reach;
      u.uInner.value += (R - u.uInner.value) * Math.min(1, dt * 4);
      u.uOuter.value = 18;
      if (reach > 0.1 && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const r = R + Math.random() * reach;
        this.stage.particles.emit({ x: Math.cos(a) * r, y: 0.1, z: Math.sin(a) * r, count: 1, dir: [0, 1, 0], cone: 0.3, speed: 4, color: '#ff8a2a', size: 0.25, life: 0.8, hdr: 2 });
      }
    }
    for (const z of this.zaps) {
      z.t += dt;
      if (z.live > 0) {
        z.live -= dt;
        z.ring.material.opacity = 0.6 + Math.random() * 0.4;
        if (Math.random() < dt * 25) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * z.r;
          this.stage.effects.lightning(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, z.x + Math.cos(a) * r * 0.5, 1.2 + Math.random(), z.z + Math.sin(a) * r * 0.5, '#5af0ff', 4);
        }
        if (z.live <= 0) z.done = true;
      } else {
        z.ring.material.opacity = 0.3 + 0.5 * (Math.sin(z.t * 20) > 0 ? 1 : 0);
      }
    }
    for (const z of this.zaps) if (z.done) { this.group.remove(z.ring); z.ring.geometry.dispose(); z.ring.material.dispose(); }
    this.zaps = this.zaps.filter((z) => !z.done);
  }
}
