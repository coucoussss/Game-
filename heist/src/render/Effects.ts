import * as THREE from 'three';
import type { LightSource } from './CityView';
import { glowTexture } from './textures';

interface Particle {
  readonly mesh: THREE.Object3D;
  readonly vel: THREE.Vector3;
  life: number;
  readonly max: number;
  readonly gravity: number;
  readonly spin: number;
  readonly fade: boolean;
  readonly grow: number;
}

interface Tracer {
  readonly line: THREE.Mesh;
  life: number;
}

interface Flash {
  readonly source: LightSource;
  life: number;
}

/**
 * Effets passagers : traînées de balles, éclairs de bouche, étincelles, éclats de verre, poussière, sang.
 * Les objets sont réutilisés autant que possible.
 */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly flashes: Flash[] = [];
  private readonly glow = glowTexture();
  private readonly shardMat = new THREE.MeshStandardMaterial({ color: '#dff0f4', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  private readonly dustMat = new THREE.SpriteMaterial({ color: '#9a948a', transparent: true, opacity: 0.6, depthWrite: false });
  private readonly bloodMat = new THREE.SpriteMaterial({ color: '#6a0d0d', transparent: true, opacity: 0.9, depthWrite: false });
  private readonly sparkMat: THREE.SpriteMaterial;
  private readonly tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly shardGeo = new THREE.PlaneGeometry(0.05, 0.035);

  constructor(private readonly scene: THREE.Scene) {
    this.sparkMat = new THREE.SpriteMaterial({ map: this.glow, color: '#ffb040', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  private spawn(mesh: THREE.Object3D, pos: THREE.Vector3, vel: THREE.Vector3, life: number, gravity: number, opts: { spin?: number; fade?: boolean; grow?: number } = {}): void {
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.particles.push({ mesh, vel, life, max: life, gravity, spin: opts.spin ?? 0, fade: opts.fade ?? true, grow: opts.grow ?? 0 });
  }

  /** Éclair de bouche : une lueur brève et une source de lumière. */
  muzzle(pos: THREE.Vector3): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#ffd080', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(0.5);
    this.spawn(s, pos, new THREE.Vector3(), 0.06, 0, { grow: 4 });
    this.flashes.push({ source: { pos: pos.clone(), color: new THREE.Color('#ffcf80'), range: 9, power: 40, level: 1, tag: 'flash' }, life: 0.06 });
    for (let i = 0; i < 3; i++) {
      const smoke = new THREE.Sprite(this.dustMat.clone());
      smoke.scale.setScalar(0.12);
      this.spawn(smoke, pos, new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4), 0.8, -0.1, { grow: 0.6 });
    }
  }

  /** Traînée lumineuse d'une balle. */
  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 4, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const line = new THREE.Mesh(geo, this.tracerMat.clone());
    line.position.copy(from);
    line.lookAt(to);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  /** Impact sur un mur : étincelles et poussière. */
  impact(pos: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(this.sparkMat);
      s.scale.setScalar(0.06);
      this.spawn(s, pos, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.25 + Math.random() * 0.2, 9.8);
    }
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Sprite(this.dustMat.clone());
      d.scale.setScalar(0.15);
      this.spawn(d, pos, new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8), 0.9, 0.5, { grow: 0.8 });
    }
  }

  /** Balle qui touche quelqu'un. */
  blood(pos: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(this.bloodMat.clone());
      s.scale.setScalar(0.05 + Math.random() * 0.05);
      this.spawn(s, pos, new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5), 0.5, 9.8);
    }
  }

  /** Vitrine qui vole en éclats. */
  shards(pos: THREE.Vector3): void {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      this.spawn(m, p, new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 1.6, 9.8, { spin: 10, fade: false });
    }
  }

  /** Gerbe d'étincelles (perceuse, cadenas qui saute). */
  sparks(pos: THREE.Vector3, count = 3): void {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.sparkMat);
      s.scale.setScalar(0.04 + Math.random() * 0.04);
      this.spawn(s, pos, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, 1 + Math.random() * 2), 0.4 + Math.random() * 0.3, 9.8);
    }
    if (Math.random() < 0.3) this.flashes.push({ source: { pos: pos.clone(), color: new THREE.Color('#ff9a40'), range: 6, power: 12, level: 1, tag: 'flash' }, life: 0.05 });
  }

  update(dt: number, lights: LightSource[]): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.01) {
        p.mesh.position.y = 0.01;
        p.vel.multiplyScalar(0.3);
        p.vel.y = Math.abs(p.vel.y) * 0.2;
      }
      if (p.spin) p.mesh.rotation.x += p.spin * dt * (p.vel.lengthSq() > 0.01 ? 1 : 0);
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      const mat = (p.mesh as THREE.Sprite).material as THREE.Material & { opacity: number };
      if (p.fade && mat && 'opacity' in mat) mat.opacity = Math.max(0, (p.life / p.max) * (mat.opacity > 0 ? 1 : 0)) * 0.9;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      if (!t) continue;
      t.life -= dt;
      (t.line.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / 0.08) * 0.8;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.life -= dt;
      if (f.life <= 0) this.flashes.splice(i, 1);
      else lights.push(f.source);
    }
  }
}
