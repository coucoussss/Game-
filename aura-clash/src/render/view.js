// Affichage d'un match : relie l'état de la simulation (local, ou reçu de l'hôte en LAN)
// aux modèles 3D, aux effets, au son et à l'interface. Ne modifie jamais la simulation.
import * as THREE from 'three';
import { CharacterModel, buildFox, buildDragon, strikeTime, ANIMS } from './model.js';
import { BeamVisual, flameMaterial, Trail } from './fx.js';
import { CineDirector } from './cinematic.js';
import { glowMat, toonMat, toonPart } from './toon.js';
import { CHAR_BY_ID } from '../game/characters.js';

const tmp = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

const PROJ_COLORS = {
  kiball: '#8fd8ff', bigki: '#ffe05a', shuriken: '#d8e0ff', crescent: '#9ff8ff', fireball: '#ff6a1a',
  iceshard: '#9ae8ff', airfist: '#ffffff', spiritorb: '#5fffc8', palmwave: '#7fffd8',
  bolt: '#fff38a', windblade: '#ffc8ec', rock: '#b09070', darkorb: '#ff2a5a',
};

export class MatchView {
  constructor(stage, audio, hud, overlay) {
    this.stage = stage;
    this.audio = audio;
    this.hud = hud;
    this.overlay = overlay;
    this.models = [];
    this.ents = new Map();
    this.localIds = new Set(); // combattants contrôlés sur cette machine (sons « énergie insuffisante »)
    this.onMatchEnd = null;
    this.cineId = -1;
    this.director = new CineDirector(stage, overlay, audio);
    this.ghosts = [];
    this.cineChar = null;
  }

  /** Crée les modèles des combattants. `fighters` : [{ charId, team }] */
  attach(fighters) {
    this.detach();
    for (const f of fighters) this.addFighter(f.charId);
  }

  /** Ajoute le modèle d'un combattant (mode Vagues : les ennemis arrivent en cours de combat). */
  addFighter(charId) {
    const def = CHAR_BY_ID[charId];
    const model = new CharacterModel(def);
    this.stage.scene.add(model.root);
    this.models.push({ model, def, prevMt: 0, prevMove: '', trailT: 0 });
  }

  detach() {
    for (const m of this.models) {
      this.stage.scene.remove(m.model.root);
      m.model.dispose();
      for (const t of m.trails || []) t.dispose();
    }
    this.director.clear();
    for (const g of this.ghosts) { this.stage.scene.remove(g.model.root); g.model.dispose(); }
    this.ghosts = [];
    this.models = [];
    for (const v of this.ents.values()) v.dispose();
    this.ents.clear();
  }

  /**
   * Met à jour l'affichage. `state` : { fighters, entities, cine, phase, ... } (Match ou instantané).
   */
  update(dt, state) {
    const p = this.stage.particles;
    this.director.update(dt);
    this.updateGhosts(dt);
    const cineId = state.cine ? state.cine.id : -1;
    state.fighters.forEach((f, i) => {
      const vm = this.models[i];
      if (!vm) return;
      if (f.gone) {
        // Vaincu d'une vague précédente : il se dissout en cendres
        if (vm.model.root.visible) {
          vm.model.root.visible = false;
          p.emit({ x: f.x, y: 0.6, z: f.z, count: 40, speed: 3, spread: 0.8, color: '#2a1a3a', size: 0.6, sizeEnd: 1.1, life: 0.6, hdr: 0.6, up: 2, drag: 2 });
          p.emit({ x: f.x, y: 0.6, z: f.z, count: 24, speed: 4, color: vm.def.aura, size: 0.2, life: 0.6, up: 3 });
        }
        return;
      }
      // Pendant une cinématique, les autres combattants sont figés (on n'avance pas leur animation)
      const frozen = (cineId >= 0 && cineId !== f.id) || state.hitstop > 0;
      vm.model.update(frozen ? 0 : dt, f, {
        cine: cineId === f.id,
        cineShot: cineId === f.id && this.director.active ? this.director.active.shot : -1,
        react: f.state === 'hitstun' ? vm.react : null,
        intro: state.phase === 'intro' && !state.training,
      });
      this.fighterFx(dt, vm, f, p, frozen);
    });
    if (dt > 0) this.auraClash(dt, state);
    this.updateEntities(dt, state);
  }

  /**
   * Particules de l'aura, selon le style du personnage, et onde de choc quand elle s'embrase.
   */
  auraParticles(dt, vm, f, p, color) {
    const fx = vm.model.auraFx;
    if (!fx) return;
    const lv = fx.level;
    const prev = vm.prevAura || 0;
    vm.prevAura = lv;
    if (prev < 0.55 && lv >= 0.55) {
      // L'aura s'embrase : onde de choc au sol, éclair et souffle
      this.stage.effects.groundRing(f.x, 0.05, f.z, 0.3, 4, 0.45, color);
      this.stage.effects.burstRing(f.x, f.y + 1, f.z, 0.3, 2.6, 0.3, color, this.stage.camera);
      this.stage.effects.light(f.x, f.y + 1.2, f.z, color, 6, 0.4, 10);
      p.emit({ x: f.x, y: 0.2, z: f.z, count: 30, flat: true, speed: 9, color: '#c8b8a0', size: 0.5, life: 0.5, hdr: 0.5, drag: 3 });
      this.audio.play('auraBurst');
    }
    if (lv < 0.1) return;
    const n = lv * dt * 60; // ~1 émission par image à pleine intensité
    if (Math.random() > n) return;
    const sc = vm.model.root.scale.x;
    const base = { x: f.x, y: f.y + 0.3 * sc, z: f.z, spread: 0.55 * sc };
    switch (fx.style.particle) {
      case 'ember':
        p.emit({ ...base, count: 2, dir: [0, 1, 0], cone: 0.2, speed: 6, color, size: 0.16, life: 0.7, drag: 1 });
        p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.3, speed: 4, color: '#fff3c0', size: 0.1, life: 0.5 });
        break;
      case 'smoke':
      case 'mist':
      case 'abyss':
        p.emit({ ...base, count: 2, dir: [0, 1, 0], cone: 0.35, speed: 2.5, color, size: 0.45, sizeEnd: 0.9, life: 0.9, hdr: 0.45, drag: 1 });
        if (fx.style.particle === 'abyss') p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.4, speed: 5, color: '#ff2a3a', size: 0.12, life: 0.6 });
        break;
      case 'streak':
        p.emit({ ...base, count: 2, dir: [0, 1, 0], cone: 0.05, speed: 12, color: '#e8ffff', size: 0.08, life: 0.3 });
        break;
      case 'flake':
        p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.6, speed: 1.5, color: '#e8f8ff', size: 0.14, life: 1.1, drag: 0.5 });
        p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.2, speed: 5, color, size: 0.12, life: 0.6 });
        break;
      case 'wisp':
        p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.5, speed: 2.2, color, size: 0.3, sizeEnd: 0.05, life: 1.1, drag: 0.4 });
        break;
      case 'spark':
        p.emit({ ...base, count: 3, speed: 9, color: '#fffbd0', size: 0.07, life: 0.18 });
        break;
      case 'petal':
        p.emit({ ...base, count: 1, dir: [Math.sin(fx.time * 3), 0.7, Math.cos(fx.time * 3)], cone: 0.4, speed: 3, color, size: 0.2, life: 1.2, drag: 0.6 });
        break;
      case 'dust':
        p.emit({ x: f.x, y: 0.1, z: f.z, count: 2, flat: true, speed: 3, spread: 0.8, color: '#c8b090', size: 0.35, life: 0.6, hdr: 0.5 });
        p.emit({ ...base, count: 1, dir: [0, 1, 0], cone: 0.2, speed: 5, color, size: 0.14, life: 0.6 });
        break;
      default:
        p.emit({ ...base, count: 2, dir: [0, 1, 0], cone: 0.25, speed: 5, color, size: 0.2, life: 0.6, drag: 1 });
    }
    if (f.state === 'charge' && Math.random() < dt * 10) p.emit({ x: f.x, y: 0.05, z: f.z, count: 3, flat: true, speed: 4, color: '#c8b8a0', size: 0.3, life: 0.5, hdr: 0.5 });
  }

  /** Deux auras embrasées face à face : éclairs et étincelles entre les combattants. */
  auraClash(dt, state) {
    const fs = state.fighters;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        if (a.team === b.team || a.gone || b.gone) continue;
        const ma = this.models[i] && this.models[i].model.auraFx;
        const mb = this.models[j] && this.models[j].model.auraFx;
        if (!ma || !mb || ma.level < 0.6 || mb.level < 0.6) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > 7 || Math.random() > dt * 14) continue;
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const ca = this.models[i].def.aura;
        const cb = this.models[j].def.aura;
        this.stage.effects.lightning(a.x, 1.2 + Math.random(), a.z, mx, 1 + Math.random(), mz, ca);
        this.stage.effects.lightning(b.x, 1.2 + Math.random(), b.z, mx, 1 + Math.random(), mz, cb);
        this.stage.particles.emit({ x: mx, y: 1.3, z: mz, count: 8, speed: 8, color: '#ffffff', size: 0.12, life: 0.25 });
        if (Math.random() < 0.3) this.audio.play('crackle');
      }
    }
  }

  fighterFx(dt, vm, f, p, frozen) {
    if (frozen) return;
    const color = f.transformed ? vm.def.auraAlt || vm.def.aura : vm.def.aura;
    vm.trailT -= dt;
    if (f.state === 'charge') {
      vm.humT = (vm.humT || 0) - dt;
      if (vm.humT <= 0) { vm.humT = 0.36; this.audio.play('chargeHum'); }
    }
    this.auraParticles(dt, vm, f, p, color);
    if (f.transformed && vm.trailT <= 0) {
      p.emit({ x: f.x, y: f.y + 1, z: f.z, count: 1, dir: [0, 1, 0], cone: 0.5, speed: 3, spread: 0.4, color, size: 0.14, life: 0.5 });
    }
    if (f.state === 'dodge' && vm.trailT <= 0) {
      vm.trailT = 0.02;
      p.emit({ x: f.x, y: f.y + 1, z: f.z, count: 4, speed: 0.5, spread: 0.4, color, size: 0.35, life: 0.25, hdr: 0.8 });
    }
    if (f.state === 'dizzy' && vm.trailT <= 0) {
      vm.trailT = 0.08;
      const a = vm.model.time * 6;
      p.emit({ x: f.x + Math.sin(a) * 0.4, y: f.y + 2.15, z: f.z + Math.cos(a) * 0.4, count: 1, speed: 0.1, color: '#ffe060', size: 0.18, life: 0.3 });
    }
    this.updateTrails(dt, vm, f, color);
    // Arcs de taille et souffle des coups, calés sur l'instant de frappe
    if (f.state === 'move' && f.moveId) {
      const mv = vm.def.moves[f.moveId];
      if (mv) {
        if (vm.prevMove !== f.moveId || f.mt < vm.prevMt) vm.prevMt = 0;
        const s = strikeTime(mv);
        const anim = ANIMS[mv.anim];
        if (f.moveId === 'heavy' && vm.prevMt < s - 0.09 && f.mt >= s - 0.09) {
          // Éclat de préparation sur le poing / l'arme juste avant un coup lourd
          const limb = vm.model.strikeLimb(mv.anim)[0];
          if (limb) { limb.getWorldPosition(tmp); this.stage.effects.flash(tmp.x, tmp.y, tmp.z, 0.9, 0.12, color); }
        }
        if (vm.prevMt < s && f.mt >= s && anim) {
          const y = f.y + 1.1;
          if (anim.arc) this.stage.effects.slashArc(f.x, y, f.z, f.yaw, anim.arc, vm.def.id === 'ren' ? '#bff8ff' : color, mv.anim === 'iai' ? 3 : 1.5);
          else if (['kick', 'spinkick'].includes(mv.anim)) this.stage.effects.slashArc(f.x, f.y + 0.8, f.z, f.yaw, 3, '#ffffff', 1.2);
        }
        if (mv.anim === 'beam' && f.mt > 0 && f.mt < s) {
          vm.model.handWorld(tmp, true);
          p.emit({ x: tmp.x, y: tmp.y, z: tmp.z, count: 2, speed: 2.5, color, size: 0.18, life: 0.3, drag: 3 });
        }
        if ((mv.anim === 'dash' || mv.anim === 'charge') && f.mt > s * 0.5 && vm.trailT <= 0) {
          vm.trailT = 0.02;
          p.emit({ x: f.x, y: f.y + 1, z: f.z, count: 3, speed: 0.5, spread: 0.4, color, size: 0.3, life: 0.2 });
        }
        vm.prevMt = f.mt;
        vm.prevMove = f.moveId;
      }
    } else {
      vm.prevMove = '';
      vm.prevMt = 0;
    }
  }

  /** Traînées lumineuses des membres qui frappent (et rafale d'onomatopées du pugiliste). */
  updateTrails(dt, vm, f, color) {
    const camPos = this.stage.camera.position;
    let limbs = [];
    let active = false;
    let mv = null;
    if (f.state === 'move' && f.moveId) {
      mv = vm.def.moves[f.moveId];
      const anim = mv && ANIMS[mv.anim];
      if (mv && anim && !['summon', 'powerup', 'cast', 'beam'].includes(mv.anim)) {
        const s = strikeTime(mv);
        const end = mv.hold ? mv.hold[1] : s + 0.12;
        active = f.mt >= s - 0.06 && f.mt <= end + 0.04;
        limbs = vm.model.strikeLimb(mv.anim);
      }
    }
    if (!vm.trails) vm.trails = [];
    const weapon = vm.model.tip && limbs[0] === vm.model.tip;
    for (let i = 0; i < 2; i++) {
      const limb = limbs[i];
      if (!vm.trails[i] && limb) vm.trails[i] = new Trail(this.stage.scene, weapon ? '#d8f4ff' : color, weapon ? 0.2 : 0.13);
      const tr = vm.trails[i];
      if (!tr) continue;
      if (limb) limb.getWorldPosition(tmp);
      tr.update(dt, limb ? tmp : null, camPos, active && !!limb);
    }
    // Cent Poings du Dragon : rafale d'onomatopées et d'éclairs de poings autour de la cible
    if (f.charId === 'goro' && f.moveId === 'ultimate' && f.mt > 0.12 && f.mt < 1.4) {
      vm.rushT = (vm.rushT || 0) - dt;
      if (vm.rushT <= 0) {
        vm.rushT = 0.11;
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        const px = f.x + fx * 1.1 + (Math.random() - 0.5) * 0.8;
        const py = f.y + 1.1 + (Math.random() - 0.5) * 0.7;
        const pz = f.z + fz * 1.1 + (Math.random() - 0.5) * 0.8;
        this.stage.effects.flash(px, py, pz, 0.9, 0.08, '#ffd8a0');
        tmp.set(px, py, pz).project(this.stage.camera);
        this.overlay.mangaSmall(Math.random() < 0.5 ? 'ドド' : 'ゴッ', (tmp.x * 0.5 + 0.5) * 100 + (Math.random() - 0.5) * 30, (-tmp.y * 0.5 + 0.5) * 100 + (Math.random() - 0.5) * 30);
      }
    }
  }

  /** Silhouette fantôme laissée par le ninja quand il se téléporte (ultime). */
  spawnGhost(f) {
    let g = this.ghosts.find((x) => x.t >= x.life);
    if (!g) {
      if (this.ghosts.length >= 4) return;
      const model = new CharacterModel(CHAR_BY_ID[f.charId], { ghost: true });
      this.stage.scene.add(model.root);
      g = { model, t: 0, life: 0.45 };
      this.ghosts.push(g);
    }
    g.t = 0;
    g.model.root.visible = true;
    const fake = { x: f.x, y: f.y, z: f.z, yaw: f.yaw, vx: 0, vy: 0, vz: 0, state: 'move', moveId: f.moveId, mt: f.mt, onGround: true, flash: 0 };
    for (let i = 0; i < 6; i++) g.model.update(0.05, fake);
  }

  updateGhosts(dt) {
    for (const g of this.ghosts) {
      if (g.t >= g.life) continue;
      g.t += dt;
      const k = 1 - g.t / g.life;
      for (const m of g.model.mats) m.opacity = 0.7 * k;
      g.model.root.scale.setScalar(1 + (1 - k) * 0.15);
      if (g.t >= g.life) g.model.root.visible = false;
    }
  }

  // --- Entités (projectiles, rayons, zones, invocations) -------------------------------------

  updateEntities(dt, state) {
    const seen = new Set();
    for (const e of state.entities) {
      seen.add(e.id);
      let v = this.ents.get(e.id);
      if (!v) {
        v = this.createEntity(e, state);
        this.ents.set(e.id, v);
      }
      v.update(dt, e, state);
    }
    for (const [id, v] of this.ents) {
      if (!seen.has(id)) { v.dispose(); this.ents.delete(id); }
    }
  }

  createEntity(e, state) {
    const scene = this.stage.scene;
    const p = this.stage.particles;
    const owner = state.fighters[e.owner];
    const ownerDef = owner ? CHAR_BY_ID[owner.charId] : null;
    const auraColor = ownerDef ? ownerDef.aura : '#ffffff';
    const simple = (obj, fn) => {
      scene.add(obj);
      return {
        update: (dt, en) => fn(dt, en),
        dispose: () => { scene.remove(obj); obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
      };
    };

    if (e.kind === 'proj') {
      const col = PROJ_COLORS[e.type] || '#ffffff';
      const g = new THREE.Group();
      let spin = null;
      if (e.type === 'shuriken') {
        const star = new THREE.Group();
        const metal = toonMat('#b8c0d8');
        for (let i = 0; i < 2; i++) {
          const blade = toonPart(new THREE.BoxGeometry(0.62, 0.03, 0.12), metal, { outline: 0.012 });
          blade.rotation.y = (i * Math.PI) / 2;
          star.add(blade);
        }
        g.add(star);
        spin = star;
      } else if (e.type === 'rock') {
        const rock = toonPart(new THREE.DodecahedronGeometry(0.62, 0), toonMat('#7a6656'), { outline: 0.03 });
        g.add(rock);
        spin = rock;
      } else if (e.type === 'bolt') {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), glowMat('#ffffff', 3));
        core.scale.set(1, 1, 3.5);
        g.add(core);
        const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), glowMat(col, 1.4, 0.45));
        halo.scale.set(1, 1, 3);
        g.add(halo);
      } else if (e.type === 'crescent' || e.type === 'windblade') {
        const sc = e.type === 'windblade' ? 0.55 : 1;
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.95 * sc, 0.09 * sc, 6, 20, Math.PI * 1.1), glowMat(col, 2.6));
        arc.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.55);
        g.add(arc);
        const arc2 = new THREE.Mesh(new THREE.TorusGeometry(0.85 * sc, 0.2 * sc, 6, 20, Math.PI * 1.1), glowMat(col, 1, 0.35));
        arc2.rotation.copy(arc.rotation);
        g.add(arc2);
      } else if (e.type === 'iceshard') {
        const c = toonPart(new THREE.ConeGeometry(0.16, 0.8, 5), toonMat('#c8f4ff', { emissive: new THREE.Color('#3a9aff'), emissiveIntensity: 0.6 }), { outline: 0.015 });
        c.rotation.x = Math.PI / 2;
        g.add(c);
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), glowMat(col, 1, 0.3)));
      } else if (e.type === 'airfist' || e.type === 'palmwave') {
        const r = e.type === 'palmwave' ? 1.1 : 0.6;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.18, 6, 24), glowMat(col, 1.6, 0.7));
        g.add(ring);
        g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 24), glowMat(col, 0.7, 0.3)));
        spin = ring;
      } else {
        const r = e.r;
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55, 1), glowMat('#ffffff', 3)));
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), glowMat(col, 1.6, 0.55)));
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.5, 1), glowMat(col, 0.8, 0.2)));
      }
      let trail = 0;
      return simple(g, (dt, en) => {
        g.position.set(en.x, en.y, en.z);
        const sp = Math.hypot(en.vx || 0, en.vz || 0);
        if (sp > 0.01) g.rotation.y = Math.atan2(en.vx, en.vz);
        if (spin) {
          if (e.type === 'shuriken') spin.rotation.y += dt * 30;
          else if (e.type === 'rock') { spin.rotation.x += dt * 8; spin.rotation.z += dt * 5; }
          else { const s = 1 + (en.t || 0) * 2; spin.scale.set(s, s, s); }
        }
        g.children.forEach((c, i) => { if (i > 0 && e.type !== 'shuriken') c.scale.setScalar(1 + Math.sin((en.t || 0) * 30 + i) * 0.08); });
        trail -= dt;
        if (trail <= 0) {
          trail = 0.016;
          const big = e.type === 'bigki' || e.type === 'fireball';
          p.emit({
            x: en.x, y: en.y, z: en.z, count: big ? 4 : 2, speed: big ? 2 : 0.8, spread: e.r * 0.5,
            color: col, size: e.r * (big ? 1.4 : 1.1), life: e.type === 'fireball' ? 0.45 : 0.25, up: e.type === 'fireball' ? 2 : 0,
          });
        }
      });
    }

    if (e.kind === 'beam') {
      const bv = new BeamVisual(scene, e.color || auraColor);
      let pt = 0;
      let ringT = 0;
      return {
        update: (dt, en) => {
          bv.update(dt, en);
          pt -= dt;
          if (pt <= 0) {
            pt = 0.016;
            const ex = en.x + en.dx * en.len;
            const ez = en.z + en.dz * en.len;
            const ey = en.y + en.dy * en.len;
            p.emit({ x: ex, y: ey, z: ez, count: 4, speed: 9, color: en.color || auraColor, size: 0.3, life: 0.3 });
            p.emit({ x: en.x + en.dx * en.len * Math.random(), y: en.y, z: en.z + en.dz * en.len * Math.random(), count: 2, speed: 4, color: '#ffffff', size: 0.2, life: 0.3 });
            // Anneaux d'énergie qui filent le long du rayon
            ringT -= 0.016;
            if (ringT <= 0) {
              ringT = 0.07;
              const d = Math.random() * en.len;
              this.stage.effects.orientedRing(en.x + en.dx * d, en.y + en.dy * d, en.z + en.dz * d, en.dx, en.dy, en.dz, en.width * 1.2, en.width * 3.2, 0.25, en.color || auraColor);
            }
            this.stage.rig.addShake(0.04);
          }
        },
        dispose: () => bv.dispose(),
      };
    }

    if (e.kind === 'ring') {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(e.color || '#ffffff').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.8, 48, 1, true), mat);
      ring.position.y = 0.4;
      g.add(ring);
      return simple(g, (dt, en) => {
        g.position.set(en.x, 0.02, en.z);
        g.scale.set(en.r, 1, en.r);
        mat.opacity = Math.max(0, 1 - en.r / (en.maxR || 8));
        const a = Math.random() * Math.PI * 2;
        p.emit({ x: en.x + Math.sin(a) * en.r, y: 0.2, z: en.z + Math.cos(a) * en.r, count: 3, dir: [Math.sin(a), 0.8, Math.cos(a)], cone: 0.3, speed: 4, color: '#d8c8a8', size: 0.35, life: 0.4, hdr: 0.6 });
      });
    }

    if (e.kind === 'aoe') return this.createAoe(e, simple, auraColor);

    if (e.kind === 'minion') {
      if (e.type === 'clone') {
        const m = new CharacterModel(CHAR_BY_ID.kage, { ghost: true });
        scene.add(m.root);
        const fake = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, moveId: '', mt: 0, onGround: true, flash: 0 };
        return {
          update: (dt, en) => {
            Object.assign(fake, { x: en.x, y: en.y || 0, z: en.z, yaw: en.yaw || 0 });
            if ((en.t || 0) > 0.18) { fake.state = 'move'; fake.moveId = 'ultimate'; fake.mt = 0.1; }
            m.update(dt, fake);
            p.emit({ x: en.x, y: 1, z: en.z, count: 1, speed: 0.3, spread: 0.3, color: '#7a3aff', size: 0.4, life: 0.25, hdr: 0.7 });
          },
          dispose: () => { scene.remove(m.root); m.dispose(); },
        };
      }
      if (e.type === 'fox') {
        const fox = buildFox(auraColor);
        return simple(fox, (dt, en) => {
          fox.position.set(en.x, en.y, en.z);
          fox.rotation.y = en.yaw || 0;
          const tt = en.t || 0;
          fox.userData.tails.forEach((t, i) => { t.rotation.z = Math.sin(tt * 8 + i) * 0.3; });
          if (Math.random() < 0.5) p.emit({ x: en.x, y: en.y + 0.2, z: en.z, count: 1, speed: 0.5, spread: 0.3, color: auraColor, size: 0.2, life: 0.4 });
        });
      }
      if (e.type === 'dragon') {
        const d = buildDragon(auraColor);
        if (e.tx != null) this.director.seal(e.tx, e.tz, 4.6, auraColor, (e.T || 1.35) + 0.5, 2.5);
        const trail = [];
        return simple(d, (dt, en) => {
          const { head, segs } = d.userData;
          head.position.set(en.x, en.y, en.z);
          head.rotation.set(-(en.pitch || 0), en.yaw || 0, 0, 'YXZ');
          trail.unshift([en.x, en.y, en.z]);
          if (trail.length > 60) trail.pop();
          segs.forEach((s, i) => {
            const pt = trail[Math.min(trail.length - 1, (i + 1) * 3)];
            s.position.set(pt[0], pt[1] + Math.sin((en.t || 0) * 10 + i) * 0.15, pt[2]);
          });
          p.emit({ x: en.x, y: en.y, z: en.z, count: 6, speed: 3, spread: 0.6, color: auraColor, size: 0.5, life: 0.5 });
        });
      }
    }
    return { update() {}, dispose() {} };
  }

  createAoe(e, simple, auraColor) {
    const p = this.stage.particles;
    const g = new THREE.Group();
    const warnColor = {
      meteor: '#ff4a1a', icepillar: '#7ad8ff', thunder: '#fff38a', tornado: '#ffc8ec', windburst: '#ffc8ec',
      darkblast: '#ff2a5a', rockpillar: '#e0a85a', rockblast: '#e0a85a',
    }[e.type] || '#ff8a2a';
    const warn = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(warnColor).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.06;
    g.add(warn);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(warnColor), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.05;
    g.add(fill);
    let meteor = null;
    let crystals = null;
    let flame = null;
    if (e.type === 'meteor') {
      this.director.seal(e.x, e.z, e.r * 1.15, '#ff5a1a', e.delay + 0.7, 1.2);
      meteor = new THREE.Group();
      const geo = new THREE.DodecahedronGeometry(2.4, 1);
      const rock = toonPart(geo, toonMat('#3a2420', { emissive: new THREE.Color('#ff3a0a'), emissiveIntensity: 0.6, flatShading: true }), { outline: 0.06 });
      meteor.add(rock);
      meteor.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), glowMat('#ff6a1a', 1.2, 0.35)));
      g.add(meteor);
    }
    let column = null;
    if (e.type === 'thunder') {
      // Colonne de foudre qui s'abat du ciel
      column = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 8, 1, true), glowMat('#ffffff', 3));
      beam.position.y = 15;
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 12, 1, true), glowMat(warnColor, 1.6, 0.45));
      halo.position.y = 15;
      column.add(beam, halo);
      column.scale.set(e.r / 1.5, 1, e.r / 1.5);
      column.visible = false;
      g.add(column);
    }
    if (e.type === 'tornado') {
      // Tornade : cône évasé tournoyant
      column = new THREE.Mesh(new THREE.CylinderGeometry(e.r, e.r * 0.3, 5, 18, 1, true), flameMaterial('#ffd0f0', 0.9));
      column.position.y = 2.5;
      column.visible = false;
      g.add(column);
    }
    if (e.type === 'icepillar' || e.type === 'rockpillar') {
      crystals = new THREE.Group();
      const mat = e.type === 'rockpillar'
        ? toonMat('#7a6656', { flatShading: true })
        : toonMat('#c8f4ff', { emissive: new THREE.Color('#3a9aff'), emissiveIntensity: 0.5, flatShading: true });
      for (let i = 0; i < 6; i++) {
        const h = 1.6 + Math.random() * 1.8;
        const c = toonPart(new THREE.ConeGeometry(0.3 + Math.random() * 0.25, h, 5), mat, { outline: 0.02 });
        const a = (i / 6) * Math.PI * 2;
        const r = i === 0 ? 0 : e.r * 0.5;
        c.position.set(Math.sin(a) * r, h / 2, Math.cos(a) * r);
        c.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
        crystals.add(c);
      }
      crystals.visible = false;
      g.add(crystals);
    }
    if (e.type === 'firepillar' || e.type === 'meteor') {
      flame = new THREE.Mesh(new THREE.CylinderGeometry(e.r * 0.7, e.r, e.type === 'meteor' ? 3 : 4.5, 16, 1, true), flameMaterial('#ff5a1a', 1));
      flame.position.y = e.type === 'meteor' ? 1.5 : 2.25;
      flame.visible = false;
      g.add(flame);
    }
    let pt = 0;
    return simple(g, (dt, en) => {
      g.position.set(en.x, 0, en.z);
      const t = en.t || 0;
      const k = Math.min(1, t / en.delay);
      warn.scale.setScalar(en.r * (0.3 + k * 0.7));
      fill.scale.setScalar(en.r * k);
      warn.material.opacity = en.done ? Math.max(0, 1 - (t - en.delay) * 3) : 0.6 + Math.sin(t * 25) * 0.4;
      fill.material.opacity = en.done ? 0 : 0.25;
      if (meteor) {
        meteor.visible = !en.done;
        meteor.position.set(-8 * (1 - k), 30 * (1 - k) + 1, -6 * (1 - k));
        meteor.rotation.x += dt * 2; meteor.rotation.y += dt * 3;
        pt -= dt;
        if (!en.done && pt <= 0) {
          pt = 0.016;
          p.emit({ x: en.x + meteor.position.x, y: meteor.position.y, z: en.z + meteor.position.z, count: 8, speed: 3, spread: 1.5, color: '#ff7a2a', size: 1.2, life: 0.6, up: 4 });
        }
      }
      if (column) {
        const since = t - en.delay;
        if (e.type === 'thunder') {
          column.visible = en.done && since < 0.45;
          column.children.forEach((c) => { c.material.opacity = Math.max(0, 1 - since / 0.45) * (0.6 + Math.random() * 0.4); });
        } else {
          column.visible = en.done;
          column.rotation.y += dt * 9;
          column.material.uniforms.uTime.value = t * 1.5;
          column.material.uniforms.uInt.value = Math.max(0, 1 - since / ((en.zone ? en.zone.dur : 0.6) + 0.1));
          if (Math.random() < 0.5) p.emit({ x: en.x + (Math.random() - 0.5) * en.r, y: Math.random() * 4, z: en.z + (Math.random() - 0.5) * en.r, count: 1, speed: 6, color: '#ffe0f4', size: 0.2, life: 0.4 });
        }
      }
      if (crystals) {
        crystals.visible = en.done;
        if (en.done) {
          const kk = Math.min(1, (t - en.delay) / 0.08);
          const fade = Math.max(0, 1 - (t - en.delay - 0.35) / 0.35);
          crystals.scale.set(1, kk * fade + 0.001, 1);
        }
      }
      if (flame) {
        flame.visible = en.done;
        if (en.done) {
          flame.material.uniforms.uTime.value = t;
          const life = en.type === 'meteor' ? (en.zone ? en.zone.dur : 1) : 0.7;
          flame.material.uniforms.uInt.value = Math.max(0, 1 - (t - en.delay) / life);
          if (en.type === 'meteor' && Math.random() < 0.6) {
            p.emit({ x: en.x + rand(-en.r, en.r) * 0.7, y: 0.2, z: en.z + rand(-en.r, en.r) * 0.7, count: 2, dir: [0, 1, 0], cone: 0.3, speed: 4, color: '#ff6a1a', size: 0.5, life: 0.7 });
          }
        }
      }
    });
  }

  // --- Événements de la simulation -------------------------------------------------------------

  handleEvents(events, state) {
    const fx = this.stage.effects;
    const p = this.stage.particles;
    const cam = this.stage.camera;
    const a = this.audio;
    for (const ev of events) {
      switch (ev.type) {
        case 'sfx':
          a.play(ev.name);
          break;
        case 'shake':
          this.stage.rig.addShake(ev.amt);
          break;
        case 'hit': {
          const big = ev.kind === 'heavy' || ev.kind === 'launch' || ev.kind === 'kd';
          if (ev.blocked) {
            p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 14, speed: 7, color: '#8ac8ff', size: 0.18, life: 0.25, drag: 5 });
            fx.burstRing(ev.x, ev.y, ev.z, 0.3, 1.0, 0.18, '#8ac8ff', cam);
            a.play('block');
          } else {
            const c = ev.color || '#ffffff';
            // Réaction de la victime (côté aléatoire pour varier) et éclat d'impact manga
            const vt = this.models[ev.tgt];
            if (vt) vt.react = { kind: big ? 'heavy' : 'light', side: Math.random() < 0.5 ? -1 : 1 };
            fx.mangaHit(ev.x, ev.y, ev.z, big);
            p.emit({ x: ev.x, y: ev.y, z: ev.z, count: big ? 26 : 10, speed: big ? 14 : 9, color: '#ffffff', size: big ? 0.26 : 0.18, life: 0.28, drag: 5 });
            p.emit({ x: ev.x, y: ev.y, z: ev.z, count: big ? 18 : 6, speed: big ? 9 : 5, color: c, size: big ? 0.4 : 0.26, life: 0.38, drag: 4 });
            fx.flash(ev.x, ev.y, ev.z, big ? 2.6 : 1.2, big ? 0.12 : 0.08, '#ffffff');
            if (big) this.overlay.speedLines(0.18, 0.6);
            this.stage.rig.addPunch(ev.kind === 'kd' ? 3.5 : big ? 1.6 : 0.5);
            if (ev.kind === 'kd') this.overlay.impactFrame(0.07);
            if (big) {
              fx.burstRing(ev.x, ev.y, ev.z, 0.4, 2.6, 0.25, c, cam);
              fx.light(ev.x, ev.y, ev.z, c, 6.0, 0.25, 12);
            }
            a.play(big ? 'hitHeavy' : 'hitLight');
            a.play({ blade: 'hitBlade', spear: 'hitSpear', claw: 'hitClaw', magic: 'hitMagic' }[ev.weapon] || 'hitFist');
            if (ev.combo >= 2) this.hud.combo(ev.att, ev.combo);
            if (ev.counter) {
              // Riposte après parade : impact surdimensionné
              this.hud.moveName(ev.att, 'RIPOSTE !');
              this.overlay.impactFrame(0.12);
              this.overlay.manga('返し!!', 50, 32);
              fx.shockSphere(ev.x, ev.y, ev.z, 0.3, 3.5, 0.35, c);
              this.stage.rig.addPunch(5);
              a.play('counter');
            }
          }
          break;
        }
        case 'fx':
          this.effect(ev, state);
          break;
        case 'parry': {
          // Parade parfaite : éclair blanc, onde, ralenti et petit kanji
          const c = ev.color || '#ffffff';
          this.overlay.flash('#ffffff', 0.18);
          this.overlay.speedLines(0.5, 1.2);
          fx.burstRing(ev.x, ev.y, ev.z, 0.2, 3.2, 0.3, '#ffffff', cam);
          fx.burstRing(ev.x, ev.y, ev.z, 0.2, 2.2, 0.35, c, cam);
          fx.light(ev.x, ev.y, ev.z, '#ffffff', 10, 0.3, 10);
          p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 40, speed: 12, color: '#fff7c0', size: 0.18, life: 0.4, drag: 4 });
          this.hud.moveName(ev.id, 'PARADE PARFAITE !');
          this.overlay.manga('見切り!', 50, 30);
          this.stage.rig.addPunch(2.5);
          a.play('parry');
          break;
        }
        case 'bossPhase': {
          // Éveil du boss : cinématique, teinte, onde et rugissement
          const f = state.fighters[ev.id];
          const def = CHAR_BY_ID[ev.charId];
          this.cineChar = ev.charId;
          this.director.start(this.models[ev.id].model, f, def.aura, ev.dur);
          this.overlay.cinematic(ev.text, def.aura, def.name, ev.dur);
          this.overlay.tint(def.aura, ev.dur + 1);
          this.overlay.manga('覚醒!!', 50, 30);
          this.stage.rig.addShake(1);
          fx.shockSphere(f.x, 1.5, f.z, 0.5, 8, 0.9, def.aura);
          a.shout(def.look.body === 'f', 1, 'o');
          a.play('ultCharge');
          break;
        }
        case 'blessing':
          this.hud.moveName(ev.id, 'BÉNÉDICTION !');
          this.overlay.flash('#fff3c0', 0.25);
          this.stage.effects.groundRing(state.fighters[ev.id].x, 0.05, state.fighters[ev.id].z, 0.3, 4, 0.5, '#ffd23f');
          break;
        case 'pursuit':
          this.overlay.speedLines(0.4, 1);
          p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 26, speed: 9, color: '#ffffff', size: 0.25, life: 0.3, drag: 4 });
          this.hud.moveName(ev.id, 'POURSUITE !');
          a.play('pursuit');
          break;
        case 'cine': {
          const f = state.fighters[ev.id];
          const def = CHAR_BY_ID[ev.charId];
          const col = f.transformed ? def.auraAlt || def.aura : def.aura;
          this.cineChar = ev.charId;
          this.director.start(this.models[ev.id].model, f, col, ev.dur);
          a.shout(def.look.body === 'f', 1, def.monster ? 'o' : 'a');
          this.overlay.cinematic(ev.text, col, def.name, ev.dur);
          this.overlay.tint(col, ev.dur + 0.8);
          a.boost(ev.dur + 2.5);
          fx.light(f.x, f.y + 0.4, f.z, def.aura, 4.5, ev.dur, 12);
          a.play('ultCharge');
          break;
        }
        case 'cineEnd':
          this.director.stop();
          this.overlay.flash('#ffffff', 0.2);
          this.overlay.speedLines(0.8, 1.2);
          // Le sabreur suspend le temps : monde en noir et blanc jusqu'à la coupe
          if (this.cineChar === 'ren') this.overlay.mono(0.85);
          a.play('ultRelease');
          break;
        case 'impact': {
          tmp.set(ev.x, ev.y, ev.z).project(cam);
          this.overlay.manga(ev.text, (tmp.x * 0.5 + 0.5) * 100, (-tmp.y * 0.5 + 0.5) * 100);
          this.overlay.monoT = 0;
          this.overlay.impactFrame(0.16);
          this.overlay.speedLines(0.7, 1.3);
          this.stage.rig.addPunch(8);
          if (this.cineChar === 'ren' || this.cineChar === 'kage') this.overlay.screenSlash(this.cineChar === 'ren' ? '#9ff8ff' : '#b07aff', this.cineChar === 'ren' ? -14 : 22);
          this.stage.effects.burstRing(ev.x, ev.y, ev.z, 0.5, 5, 0.3, '#ffffff', cam);
          a.play('impact');
          break;
        }
        case 'round':
          if (ev.wave) this.announceWave(ev.wave, state);
          else this.hud.announce(`MANCHE ${ev.n}`, { dur: 1.3 });
          a.play('round');
          break;
        case 'waveClear':
          this.hud.announce('VAGUE REPOUSSÉE !', { dur: 1.8, color: '#7fffb0' });
          this.overlay.speedLines(0.6, 0.8);
          a.play('roundWin');
          break;
        case 'waveSpawn':
          this.announceWave(ev, state);
          a.play(ev.boss ? 'ultCharge' : 'round');
          break;
        case 'fight':
          this.hud.announce('COMBATTEZ !', { dur: 0.9, color: '#ffd23f' });
          a.play('fight');
          break;
        case 'ko': {
          const f = state.fighters[ev.id];
          const allDown = state.fighters.filter((o) => o.team === f.team && !o.gone).every((o) => o.hp <= 0 || o.state === 'ko' || o.id === ev.id);
          const wv = state.waveInfo;
          if (wv && f.team === 1 && (!allDown || wv.n < wv.total)) {
            // Mode Vagues : un ennemi tombe (la fin de vague est annoncée à part)
            this.stage.effects.burstRing(f.x, f.y + 1, f.z, 0.3, 2.2, 0.25, CHAR_BY_ID[f.charId].aura, cam);
            a.play('impact');
            break;
          }
          if (allDown) {
            this.overlay.impactFrame(0.3);
            this.overlay.manga('決着!!', 50, 28);
            a.play('finalHit');
            this.hud.announce('K.O.', { dur: 2.2, big: true, color: '#ff3a3a' });
            this.stage.rig.setFocus({ mode: 'ko', x: f.x, y: f.y, z: f.z, yaw: f.yaw, t: 0, dur: 2.4, k: CHAR_BY_ID[f.charId].look.size || 1 });
            this.overlay.flash('#ffffff', 0.35);
            this.overlay.speedLines(1.2, 1);
            a.play('ko');
          } else {
            this.hud.announce('HORS COMBAT', { dur: 1.1, color: '#ff8a3a' });
            a.play('impact');
          }
          break;
        }
        case 'timeup':
          this.hud.announce('TEMPS ÉCOULÉ', { dur: 1.5, color: '#ffd23f' });
          a.play('round');
          break;
        case 'roundWin': {
          if (state.waveInfo) {
            if (ev.team === 0) this.hud.announce('NIVEAU TERMINÉ !', { dur: 2.4, color: '#ffd23f' });
            else this.hud.announce('DÉFAITE…', { dur: 2.4, color: '#ff5a6a' });
            a.play('roundWin');
            break;
          }
          if (ev.team < 0) this.hud.announce('MANCHE NULLE', { dur: 2.2 });
          else this.hud.announce(`${this.hud.teamName(ev.team)} GAGNE LA MANCHE`, { dur: 2.2, color: ev.team === 0 ? '#5ab4ff' : '#ff5a6a' });
          a.play('roundWin');
          break;
        }
        case 'matchEnd':
          if (this.onMatchEnd) this.onMatchEnd(ev.team);
          break;
        case 'transform': {
          const f = state.fighters[ev.id];
          const def = CHAR_BY_ID[f.charId];
          fx.shockSphere(ev.x, ev.y, ev.z, 0.5, 6, 0.6, def.auraAlt || def.aura);
          fx.groundRing(ev.x, 0, ev.z, 0.5, 9, 0.7, def.auraAlt || def.aura);
          fx.light(ev.x, ev.y + 1, ev.z, def.auraAlt || def.aura, 12.0, 0.8, 16);
          p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 120, speed: 16, color: def.auraAlt || def.aura, size: 0.4, life: 0.8, drag: 2 });
          this.overlay.flash(def.auraAlt || '#ffffff', 0.3);
          this.overlay.manga('覚醒!!', 50, 35);
          this.hud.moveName(ev.id, 'TRANSFORMATION !');
          a.play('transform');
          break;
        }
        case 'guardBreak':
          this.hud.moveName(ev.id, 'GARDE BRISÉE !');
          fx.burstRing(ev.x, ev.y, ev.z, 0.4, 2.5, 0.3, '#8ac8ff', cam);
          a.play('guardBreak');
          break;
        case 'special': {
          this.hud.moveName(ev.id, ev.name);
          const sp = state.fighters[ev.id];
          if (sp && sp.def) a.shout(sp.def.look.body === 'f', 0.35, 'e');
          break;
        }
        case 'cooldown':
        case 'noEnergy':
          if (this.localIds.has(ev.id)) a.play('denied');
          break;
        default:
          break;
      }
    }
  }

  /** Annonce d'une vague ; l'arrivée d'un boss a droit à sa mise en scène. */
  announceWave(w, state) {
    if (!w.boss) {
      this.hud.announce(w.total === Infinity ? `VAGUE ${w.n}` : `VAGUE ${w.n} / ${w.total}`, { dur: 1.6, color: w.n === w.total ? '#ff8a5a' : '#ffffff' });
      return;
    }
    const boss = state.fighters.filter((f) => f.team === 1 && !f.gone).find((f) => f.def && f.def.boss) || null;
    const def = boss ? CHAR_BY_ID[boss.charId] : null;
    this.hud.announce(def ? def.name.toUpperCase() : 'BOSS', { dur: 2.6, color: def ? def.aura : '#ff2a3a' });
    this.overlay.flash('#1a0008', 0.45);
    this.overlay.speedLines(1.2, 1.6);
    this.overlay.manga('ボス!!', 50, 30);
    this.stage.rig.addShake(0.8);
    if (boss) {
      this.stage.effects.shockSphere(boss.x, 1.5, boss.z, 0.5, 6, 0.8, def.aura);
      this.stage.effects.groundRing(boss.x, 0, boss.z, 0.5, 9, 0.9, def.aura);
      this.stage.effects.light(boss.x, 2, boss.z, def.aura, 10, 1.2, 16);
    }
  }

  effect(ev, state) {
    const fx = this.stage.effects;
    const p = this.stage.particles;
    const cam = this.stage.camera;
    const c = ev.color || '#ffffff';
    switch (ev.fx) {
      case 'dust':
        p.emit({ x: ev.x, y: 0.1, z: ev.z, count: ev.big ? 26 : 10, flat: true, speed: ev.big ? 6 : 3.5, color: '#c8b8a0', size: ev.big ? 0.7 : 0.45, sizeEnd: 0.9, life: 0.5, hdr: 0.45, drag: 3 });
        break;
      case 'vanish':
        if (ev.id != null && state.fighters[ev.id] && state.fighters[ev.id].state === 'move') {
          const g = state.fighters[ev.id];
          this.spawnGhost({ charId: g.charId, x: ev.x, y: ev.y - 1, z: ev.z, yaw: g.yaw, moveId: g.moveId, mt: g.mt });
        }
        // fallthrough
      case 'appear':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 24, speed: 5, spread: 0.4, color: '#2a1a3a', size: 0.7, sizeEnd: 1.1, life: 0.35, hdr: 0.6, drag: 4 });
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 14, speed: 8, color: c, size: 0.2, life: 0.3 });
        fx.burstRing(ev.x, ev.y, ev.z, 0.2, 1.4, 0.15, c, cam);
        break;
      case 'kiCharge':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 18, speed: -6, spread: 1.4, color: c, size: 0.2, life: 0.25, drag: 0 });
        fx.light(ev.x, ev.y, ev.z, c, 2.4, 0.3);
        break;
      case 'vanishTrail':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 16, speed: 3, spread: 0.4, color: c, size: 0.4, life: 0.3 });
        break;
      case 'flameburst':
        p.emit({ x: ev.x, y: ev.y - 0.5, z: ev.z, count: 60, flat: true, speed: 12, color: '#ff6a1a', size: 0.6, life: 0.45, up: 2, drag: 3 });
        fx.groundRing(ev.x, 0, ev.z, 0.3, 2.6, 0.3, '#ff6a1a');
        fx.light(ev.x, ev.y, ev.z, '#ff6a1a', 5.0, 0.3);
        break;
      case 'spiritBurst':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 30, speed: 7, color: c, size: 0.35, life: 0.4 });
        break;
      case 'slashLine':
      case 'slashTrail':
        if (ev.x2 != null) fx.streak(ev.x, ev.y, ev.z, ev.x2, ev.y, ev.z2, '#d8faff', 0.9, 0.12);
        this.overlay.speedLines(0.6, 0.8);
        break;
      case 'shieldHit':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: ev.broken ? 40 : 10, speed: ev.broken ? 9 : 5, color: '#7ff0ff', size: 0.2, life: 0.35 });
        if (ev.broken) { fx.burstRing(ev.x, ev.y, ev.z, 0.4, 2.4, 0.3, '#7ff0ff', this.stage.camera); this.audio.play('guardBreak'); }
        break;
      case 'slamLand':
        // Rabattu au sol : cratère de poussière et onde de choc
        p.emit({ x: ev.x, y: 0.1, z: ev.z, count: 50, flat: true, speed: 9, color: '#c8b8a0', size: 0.8, sizeEnd: 1.2, life: 0.6, hdr: 0.45, drag: 3 });
        p.emit({ x: ev.x, y: 0.2, z: ev.z, count: 24, dir: [0, 1, 0], cone: 0.6, speed: 8, color: '#8a7a68', size: 0.25, life: 0.7 });
        fx.groundRing(ev.x, 0, ev.z, 0.3, 4.5, 0.45, '#ffffff');
        this.overlay.impactFrame(0.08);
        this.stage.rig.addPunch(4);
        break;
      case 'summonBurst':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 40, speed: 8, color: c, size: 0.35, life: 0.5 });
        fx.groundRing(ev.x, 0, ev.z, 0.3, 3, 0.4, c);
        break;
      case 'poof':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 22, speed: 4, spread: 0.3, color: ev.kind === 'clone' ? '#5a2a8a' : '#a8fff0', size: 0.6, sizeEnd: 1, life: 0.4, hdr: 0.8 });
        break;
      case 'clash':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 30, speed: 10, color: '#ffffff', size: 0.3, life: 0.3 });
        fx.flash(ev.x, ev.y, ev.z, 2.4, 0.15);
        break;
      case 'explosion': {
        const col = ev.kind === 'fireball' ? '#ff6a1a' : ev.kind === 'beam' ? '#ffffff' : '#ffe05a';
        const r = ev.r || 2;
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 70, speed: r * 6, color: col, size: 0.6, life: 0.5, drag: 3 });
        fx.shockSphere(ev.x, ev.y, ev.z, 0.3, r, 0.35, col);
        fx.flash(ev.x, ev.y, ev.z, r * 2, 0.2, col);
        fx.light(ev.x, ev.y, ev.z, col, 8.0, 0.4, r * 5);
        break;
      }
      case 'projHit':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 12, speed: 6, color: PROJ_COLORS[ev.kind] || '#ffffff', size: 0.25, life: 0.25 });
        break;
      case 'aoeBoom': {
        const r = ev.r || 2;
        if (['meteor', 'dragon', 'darkblast', 'rockblast', 'windburst'].includes(ev.type) || (ev.type === 'thunder' && r > 3)) {
          const col = { meteor: '#ff6a1a', darkblast: '#ff2a5a', rockblast: '#e0a85a', windburst: '#ffc8ec', thunder: '#fff38a' }[ev.type] || c;
          p.emit({ x: ev.x, y: 0.5, z: ev.z, count: 200, speed: 24, color: col, size: 0.9, life: 0.9, drag: 2.5, gravity: 4 });
          p.emit({ x: ev.x, y: 0.2, z: ev.z, count: 60, flat: true, speed: 18, color: '#8a7a6a', size: 1.6, sizeEnd: 2.5, life: 1, hdr: 0.5 });
          fx.shockSphere(ev.x, 0, ev.z, 1, r * 1.6, 0.7, col);
          fx.groundRing(ev.x, 0, ev.z, 1, r * 2.6, 0.8, col);
          fx.light(ev.x, 3, ev.z, col, 24.0, 0.9, 30);
          this.overlay.flash(col, 0.3);
        } else if (ev.type === 'thunder') {
          p.emit({ x: ev.x, y: 0.4, z: ev.z, count: 40, speed: 12, color: '#fff38a', size: 0.3, life: 0.35 });
          fx.groundRing(ev.x, 0, ev.z, 0.3, r * 1.4, 0.3, '#fff38a');
          fx.light(ev.x, 3, ev.z, '#fff38a', 10, 0.3, 14);
          this.overlay.flash('#fffbd0', 0.06);
        } else if (ev.type === 'rockpillar' || ev.type === 'tornado') {
          p.emit({ x: ev.x, y: 0.3, z: ev.z, count: 40, flat: true, speed: 10, color: ev.type === 'tornado' ? '#ffe0f4' : '#a08870', size: 0.6, life: 0.5, hdr: 0.7 });
          fx.groundRing(ev.x, 0, ev.z, 0.3, r * 1.3, 0.3, ev.type === 'tornado' ? '#ffc8ec' : '#e0a85a');
        } else if (ev.type === 'icepillar') {
          p.emit({ x: ev.x, y: 0.5, z: ev.z, count: 40, speed: 10, color: '#c8f4ff', size: 0.3, life: 0.5, gravity: 10 });
          fx.groundRing(ev.x, 0, ev.z, 0.3, r * 1.3, 0.3, '#9ae8ff');
        } else {
          p.emit({ x: ev.x, y: 0.3, z: ev.z, count: 50, dir: [0, 1, 0], cone: 0.5, speed: 12, color: '#ff6a1a', size: 0.6, life: 0.5 });
          fx.groundRing(ev.x, 0, ev.z, 0.3, r * 1.3, 0.3, '#ff6a1a');
          fx.light(ev.x, 1, ev.z, '#ff6a1a', 5.0, 0.4);
        }
        break;
      }
      case 'wallHit':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 20, speed: 8, color: '#ffffff', size: 0.3, life: 0.3 });
        fx.burstRing(ev.x, ev.y, ev.z, 0.3, 2, 0.2, '#ffffff', cam);
        break;
      case 'bite':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 12, speed: 6, color: c, size: 0.3, life: 0.3 });
        break;
      case 'detransform':
        p.emit({ x: ev.x, y: ev.y, z: ev.z, count: 30, speed: 4, color: '#ffd23f', size: 0.3, life: 0.5 });
        break;
      default:
        break;
    }
  }
}
