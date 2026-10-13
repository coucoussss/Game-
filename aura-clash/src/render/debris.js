// Débris physiques : quand un combattant s'écrase au sol ou qu'une attaque puissante frappe le sol,
// des morceaux de roche volent, rebondissent, roulent puis disparaissent. Les débris peuvent aussi
// léviter autour d'un combattant qui libère son aura, puis être projetés par l'onde de choc.
// Purement visuel (aucun effet sur la simulation), donc identique en réseau et dans les replays.
import * as THREE from 'three';

const MAX = 220;
const GRAVITY = 24;
// Couleur du sol de chaque arène (les débris en sont arrachés)
const ARENA_ROCK = { cliffs: '#8a7a64', temple: '#8a7f8c', neon: '#55576a', glacier: '#bfe4f4', volcano: '#4a3236' };
const CRATERS = 14;

function craterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(10,6,4,0.95)');
  grd.addColorStop(0.55, 'rgba(25,18,12,0.7)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // Fissures rayonnantes
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    let x = 64, y = 64;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      a += (Math.random() - 0.5) * 0.7;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DebrisSystem {
  constructor(stage) {
    this.stage = stage;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshToonMaterial({ color: '#ffffff', flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Couleur par débris (nuances de la roche)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    stage.scene.add(this.mesh);
    this.items = [];
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    // Cratères et traces de brûlure au sol
    const ctex = craterTexture();
    this.craterGeo = new THREE.PlaneGeometry(2, 2);
    this.craters = [];
    for (let i = 0; i < CRATERS; i++) {
      const m = new THREE.Mesh(this.craterGeo, new THREE.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 1;
      stage.scene.add(m);
      this.craters.push({ m, t: 0, dur: 1 });
    }
    this.nextCrater = 0;
  }

  /** Facteur de quantité selon la qualité graphique. */
  get amount() {
    const q = this.stage.settings && this.stage.settings.data.gfx.quality;
    return q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
  }

  rockColor() {
    const id = this.stage.arena && this.stage.arena.id;
    return ARENA_ROCK[id] || '#8a7a68';
  }

  spawn(o) {
    if (this.items.length >= MAX) this.items.shift();
    const base = new THREE.Color(o.color || this.rockColor());
    const shade = 0.75 + Math.random() * 0.4;
    this.items.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, wz: (Math.random() - 0.5) * 14,
      s: o.s, sx: 0.8 + Math.random() * 0.5, sy: 0.6 + Math.random() * 0.5, sz: 0.8 + Math.random() * 0.5,
      t: 0, life: o.life || 3.5 + Math.random() * 2.5, rest: false,
      float: o.float || null,
      r: base.r * shade, g: base.g * shade, b: base.b * shade,
    });
  }

  /**
   * Gerbe de débris arrachés au sol.
   * opts : count, power (vitesse), spread (rayon de départ), up (part verticale 0..1), dir [dx, dz] et
   * dirAmt (poussée dans une direction), size [min, max], color, y.
   */
  burst(x, z, opts = {}) {
    const n = Math.round((opts.count || 12) * this.amount);
    const power = opts.power || 8;
    const spread = opts.spread || 0.6;
    const up = opts.up ?? 0.7;
    const [smin, smax] = opts.size || [0.08, 0.28];
    const [dx, dz] = opts.dir || [0, 0];
    const dirAmt = opts.dirAmt || 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const sp = power * (0.45 + Math.random() * 0.75);
      const h = Math.cos(a), v = Math.sin(a);
      this.spawn({
        x: x + h * r, y: (opts.y || 0) + 0.1, z: z + v * r,
        vx: h * sp * (1 - up) + dx * dirAmt * (0.5 + Math.random()),
        vy: sp * (up + Math.random() * 0.4),
        vz: v * sp * (1 - up) + dz * dirAmt * (0.5 + Math.random()),
        s: smin + Math.random() ** 2 * (smax - smin),
        color: opts.color,
      });
    }
  }

  /** Rochers qui se détachent du sol et lévitent autour d'un point (libération d'aura). */
  levitate(x, z, count = 12, radius = 3) {
    const n = Math.round(count * this.amount);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * radius;
      this.spawn({
        x: x + Math.cos(a) * r, y: 0.05, z: z + Math.sin(a) * r, vx: 0, vy: 0, vz: 0,
        s: 0.1 + Math.random() ** 2 * 0.35, life: 5 + Math.random() * 2,
        float: { h: 0.6 + Math.random() * 2.6, speed: 0.6 + Math.random() * 0.8, ph: Math.random() * 6 },
      });
    }
  }

  /** L'onde de choc projette les rochers en lévitation (et ceux posés au sol) autour d'un point. */
  release(x, z, radius = 6, power = 14) {
    for (const d of this.items) {
      const dx = d.x - x, dz = d.z - z;
      const dist = Math.hypot(dx, dz) || 0.01;
      if (dist > radius) continue;
      const k = (1 - dist / radius) * 0.6 + 0.4;
      d.float = null;
      d.rest = false;
      d.vx = (dx / dist) * power * k * (0.7 + Math.random() * 0.6);
      d.vz = (dz / dist) * power * k * (0.7 + Math.random() * 0.6);
      d.vy = power * 0.45 * (0.6 + Math.random() * 0.8);
      d.wx *= 2; d.wz *= 2;
      d.t = Math.min(d.t, 1);
    }
  }

  /** Cratère (sol enfoncé et fissuré) qui s'efface lentement. */
  crater(x, z, r = 1.5, dur = 7) {
    const c = this.craters[this.nextCrater];
    this.nextCrater = (this.nextCrater + 1) % CRATERS;
    c.m.position.set(x, 0.035 + this.nextCrater * 0.001, z);
    c.m.scale.setScalar(r);
    c.m.rotation.z = Math.random() * Math.PI * 2;
    c.m.visible = true;
    c.t = 0;
    c.dur = dur;
  }

  update(dt) {
    const time = this.stage.time || 0;
    let n = 0;
    const dm = this.dummy;
    for (const d of this.items) {
      d.t += dt;
      if (d.float) {
        // Lévitation : montée lente puis flottement
        const target = d.float.h + Math.sin(time * d.float.speed * 2 + d.float.ph) * 0.15;
        d.y += (target - d.y) * Math.min(1, dt * 1.6);
        d.rx += dt * 0.8; d.ry += dt * 0.6;
        if (d.t > d.life - 1) d.float = null; // retombe s'il n'a pas été projeté
      } else if (!d.rest) {
        d.vy -= GRAVITY * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const floor = d.s * 0.45;
        if (d.y < floor) {
          d.y = floor;
          if (d.vy < -2.5) {
            // Rebond amorti
            d.vy = -d.vy * 0.32;
            d.vx *= 0.62; d.vz *= 0.62;
            d.wx *= 0.6; d.wy *= 0.6; d.wz *= 0.6;
          } else {
            d.vy = 0;
            d.vx *= 0.5; d.vz *= 0.5;
            if (Math.hypot(d.vx, d.vz) < 0.3) d.rest = true;
          }
        }
      }
      // Disparition : le débris rétrécit dans sa dernière seconde
      const fade = Math.min(1, Math.max(0, (d.life - d.t) / 0.9));
      if (fade <= 0) { d.dead = true; continue; }
      dm.position.set(d.x, d.y, d.z);
      dm.rotation.set(d.rx, d.ry, d.rz);
      dm.scale.set(d.s * d.sx * fade, d.s * d.sy * fade, d.s * d.sz * fade);
      dm.updateMatrix();
      this.mesh.setMatrixAt(n, dm.matrix);
      this.mesh.instanceColor.setXYZ(n, d.r, d.g, d.b);
      n++;
    }
    if (this.items.some((d) => d.dead)) this.items = this.items.filter((d) => !d.dead);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    for (const c of this.craters) {
      if (!c.m.visible) continue;
      c.t += dt;
      const k = c.t / c.dur;
      c.m.material.opacity = k < 0.05 ? k / 0.05 : Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1) c.m.visible = false;
    }
  }

  clear() {
    this.items = [];
    this.mesh.count = 0;
    for (const c of this.craters) c.m.visible = false;
  }
}
