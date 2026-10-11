// Caméra dynamique : cadre tous les combattants, de côté (style jeu de combat 3D), recule quand
// ils s'éloignent, et se laisse piloter par les cinématiques (ultimes, KO) et les secousses.
import * as THREE from 'three';

const v = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 4, 14);
    this.look = new THREE.Vector3(0, 1.2, 0);
    this.side = new THREE.Vector3(0, 0, 1);
    this.shake = 0;
    this.fov = 50;
    this.focus = null; // { x, y, z, yaw, t, dur, mode }
    this.time = 0;
    this.shakeScale = 1;
    this.roll = 0;
    this.punch = 0;
  }

  /** Petit zoom bref (coup puissant). */
  addPunch(a) {
    this.punch = Math.min(10, this.punch + a);
  }

  addShake(a) {
    this.shake = Math.min(1.4, this.shake + a * this.shakeScale);
  }

  /** Mise en scène : zoom sur un combattant (ultime) ou sur le KO. */
  setFocus(f) {
    this.focus = f;
  }

  /** Axe « gauche-droite » de l'écran projeté au sol, pour convertir les entrées en directions. */
  basis() {
    const fwd = v.subVectors(this.look, this.camera.position);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    // droite = avant × haut
    return { fx: fwd.x, fz: fwd.z, rx: -fwd.z, rz: fwd.x };
  }

  /**
   * @param fighters [{x,y,z,team,alive}]
   * @param dt temps réel
   */
  update(dt, fighters, opts = {}) {
    this.time += dt;
    const alive = fighters.filter((f) => f.alive !== false);
    const list = alive.length ? alive : fighters;
    let cx = 0; let cy = 0; let cz = 0;
    for (const f of list) { cx += f.x; cy += f.y; cz += f.z; }
    cx /= list.length; cy /= list.length; cz /= list.length;

    // Axe principal : entre les barycentres des deux équipes
    const t0 = list.filter((f) => f.team === 0);
    const t1 = list.filter((f) => f.team === 1);
    let ax = 1; let az = 0;
    if (t0.length && t1.length) {
      const a = t0.reduce((s, f) => [s[0] + f.x / t0.length, s[1] + f.z / t0.length], [0, 0]);
      const b = t1.reduce((s, f) => [s[0] + f.x / t1.length, s[1] + f.z / t1.length], [0, 0]);
      ax = b[0] - a[0]; az = b[1] - a[1];
      const l = Math.hypot(ax, az);
      if (l > 0.3) { ax /= l; az /= l; } else { ax = -this.side.z; az = this.side.x; }
    }
    let spread = 0;
    for (const f of list) for (const g of list) spread = Math.max(spread, Math.hypot(f.x - g.x, f.z - g.z));
    // La caméra se place perpendiculairement à l'axe, du côté où elle se trouve déjà (pas de saut)
    let sx = -az; let sz = ax;
    if (sx * this.side.x + sz * this.side.z < 0) { sx = -sx; sz = -sz; }
    const k = 1 - Math.exp(-dt * 2.5);
    this.side.x += (sx - this.side.x) * k;
    this.side.z += (sz - this.side.z) * k;
    const sl = Math.hypot(this.side.x, this.side.z) || 1;
    this.side.x /= sl; this.side.z /= sl;

    const dist = Math.min(30, Math.max(8.5, 6 + spread * 0.85));
    const height = 2.6 + spread * 0.18 + cy * 0.5;
    const wantPos = new THREE.Vector3(cx + this.side.x * dist, height, cz + this.side.z * dist);
    const wantLook = new THREE.Vector3(cx, 1.1 + cy * 0.6, cz);
    let wantFov = opts.fov || 50;

    if (this.focus) {
      const f = this.focus;
      f.t += dt;
      const fx = Math.sin(f.yaw);
      const fz = Math.cos(f.yaw);
      if (f.mode === 'cine') {
        // Plan rapproché de face, qui glisse lentement
        const p = Math.min(1, f.t / f.dur);
        const orbit = -0.6 + p * 0.5;
        const ox = fx * Math.cos(orbit) - fz * Math.sin(orbit);
        const oz = fx * Math.sin(orbit) + fz * Math.cos(orbit);
        wantPos.set(f.x + ox * (3.2 - p * 0.8), f.y + 1.5 + p * 0.2, f.z + oz * (3.2 - p * 0.8));
        wantLook.set(f.x, f.y + 1.35, f.z);
        wantFov = 42;
      } else if (f.mode === 'ko') {
        const k = f.k || 1; // les géants sont filmés de plus loin
        wantPos.set(f.x + this.side.x * 6 * k + fx * 2 * k, f.y + 2.2 * k, f.z + this.side.z * 6 * k + fz * 2 * k);
        wantLook.set(f.x, f.y + 0.8 * k, f.z);
        wantFov = 40;
      } else if (f.mode === 'showcase') {
        const a = this.time * 0.25;
        wantPos.set(f.x + Math.sin(a) * 4.5, 1.6, f.z + Math.cos(a) * 4.5 + 0.5);
        wantLook.set(f.x, 1.1, f.z);
        wantFov = 38;
      } else if (f.mode === 'manual') {
        // Plan imposé par la mise en scène des ultimes (position, cible, focale, roulis)
        wantPos.copy(f.pos);
        wantLook.copy(f.look);
        wantFov = f.fov || 40;
      } else if (f.mode === 'orbit') {
        const a = this.time * 0.08;
        wantPos.set(Math.sin(a) * 16, 5.5, Math.cos(a) * 16);
        wantLook.set(0, 1.5, 0);
        wantFov = 50;
      }
      if (f.dur && f.t > f.dur && f.mode !== 'showcase' && f.mode !== 'orbit') this.focus = null;
    }
    const manual = this.focus && this.focus.mode === 'manual';
    const wantRoll = manual ? this.focus.roll || 0 : 0;

    const snap = manual ? 14 : this.focus && this.focus.mode === 'cine' ? 10 : 4;
    const kp = 1 - Math.exp(-dt * snap);
    if (manual && this.focus.cut) {
      // Coupe franche entre deux plans
      this.focus.cut = false;
      this.pos.copy(wantPos);
      this.look.copy(wantLook);
      this.fov = wantFov;
    } else {
      this.pos.lerp(wantPos, kp);
      this.look.lerp(wantLook, 1 - Math.exp(-dt * snap * 1.5));
      this.fov += (wantFov - this.fov) * kp;
    }
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 10);
    this.punch *= Math.exp(-dt * 9);

    this.camera.position.copy(this.pos);
    if (this.shake > 0.001) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * 7);
    }
    this.camera.lookAt(this.look);
    if (Math.abs(this.roll) > 0.001) this.camera.rotateZ(this.roll);
    const fov = this.fov - this.punch;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  snapTo(fighters) {
    this.update(10, fighters);
  }
}
