// La scène 3D : moteur de rendu, post-traitement (bloom), lumières, arène courante.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildArena } from './arenas.js';
import { Particles, Effects } from './fx.js';
import { CameraRig } from './camera.js';

export class Stage {
  constructor(canvas, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // garde les couleurs franches et adoucit les hautes lumières
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
    this.rig = new CameraRig(this.camera);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.particles = new Particles(this.scene, 6000);
    this.effects = new Effects(this.scene);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.arena = null;
    this.time = 0;
    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applySettings() {
    const g = this.settings.data.gfx;
    const dpr = window.devicePixelRatio || 1;
    let ratio = { low: 0.75, medium: 1, high: Math.min(dpr, 1.5), auto: Math.min(dpr, 1.5) }[g.quality] || 1;
    if (g.quality === 'auto') ratio *= this.autoScale || 1; // qualité automatique : résolution adaptée
    this.renderer.setPixelRatio(ratio);
    const sh = g.shadows && !(g.quality === 'auto' && (this.autoScale || 1) <= 0.6);
    this.renderer.shadowMap.enabled = sh;
    this.sun.castShadow = sh;
    this.bloom.enabled = g.bloom;
    this.particles.density = g.quality === 'low' || (g.quality === 'auto' && (this.autoScale || 1) < 0.7) ? 0.5 : 1;
    this.rig.shakeScale = g.shake ? 1 : 0;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  setArena(id) {
    if (this.arena && this.arena.id === id) return this.arena;
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
    const a = buildArena(id);
    this.arena = a;
    this.scene.add(a.group);
    this.scene.fog = new THREE.Fog(a.fog[0], a.fog[1], a.fog[2]);
    this.sun.color.set(a.sun.color);
    this.sun.intensity = a.sun.intensity;
    this.sun.position.set(...a.sun.dir);
    this.hemi.color.set(a.hemi[0]);
    this.hemi.groundColor.set(a.hemi[1]);
    this.hemi.intensity = a.hemi[2];
    this.particles.clear();
    this.effects.clear();
    return a;
  }

  /** Avance les éléments animés du décor et les effets. */
  update(dt) {
    this.time += dt;
    const a = this.arena;
    if (a) {
      if (a.update) a.update(this.time);
      if (a.sky.material.uniforms.uTime) a.sky.material.uniforms.uTime.value = this.time;
      if (a.ambient && this.settings.data.gfx.quality !== 'low') a.ambient(this.particles, dt);
      // L'ombre suit le centre de l'action
      this.sun.target.position.set(this.rig.look.x, 0, this.rig.look.z);
      this.sun.position.set(this.rig.look.x + a.sun.dir[0], a.sun.dir[1], this.rig.look.z + a.sun.dir[2]);
    }
    this.particles.update(dt);
    this.effects.update(dt);
    if (Math.abs(this.camera.fov - this.lastFov) > 0.5 || this.lastFov === undefined) {
      this.lastFov = this.camera.fov;
      this.particles.setViewport(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    }
  }

  /**
   * Qualité automatique : mesure la durée moyenne des images ; trop lent → résolution réduite
   * (puis ombres coupées), très rapide → résolution remontée. Vise 60 images par seconde.
   */
  adapt(dt) {
    const g = this.settings.data.gfx;
    if (g.quality !== 'auto' || dt <= 0) return;
    this.autoScale = this.autoScale || 1;
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.95 + dt * 0.05 : dt;
    this.adaptT = (this.adaptT || 0) + dt;
    if (this.adaptT < 2) return;
    this.adaptT = 0;
    const fps = 1 / this.frameAvg;
    let changed = false;
    if (fps < 50 && this.autoScale > 0.5) { this.autoScale = Math.max(0.5, this.autoScale - 0.1); changed = true; }
    else if (fps > 58 && this.autoScale < 1) { this.autoScale = Math.min(1, this.autoScale + 0.05); changed = true; }
    const shadows = g.shadows && this.autoScale > 0.6;
    if (shadows !== this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = shadows; this.sun.castShadow = shadows; changed = true; }
    if (changed) this.applySettings();
  }

  render() {
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
