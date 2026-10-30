// Scènes du mode histoire : les personnages en 3D dans l'arène, mis en scène plan par plan
// (gros plan sur celui qui parle, plan à deux, plan large, contre-plongée), avec une boîte de
// dialogue façon visual novel (portrait, nom, texte qui s'écrit), des poses et des effets.
import * as THREE from 'three';
import { createCharacterModel, faceOf } from '../render/riggedModel.js';
import { CHAR_BY_ID } from '../game/characters.js';
import { tr } from '../i18n/i18n.js';
import { ARENAS } from '../render/arenas.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tmp = new THREE.Vector3();

/** Pose de mise en scène → état simulé du combattant (pour l'animation du modèle). */
function poseState(pose, t, def) {
  switch (pose) {
    case 'victory': return { state: 'victory' };
    case 'charge': return { state: 'charge' };
    case 'guard': return { state: 'guard' };
    case 'hurt': return { state: 'hitstun', react: { kind: 'heavy', side: 1 } };
    case 'ko': return { state: 'knockdown' };
    case 'powerup': return { state: 'idle', cine: true };
    case 'attack': {
      const mv = def.moves.heavy;
      const period = mv.dur + 0.7;
      const mt = t % period;
      return mt < mv.dur ? { state: 'move', moveId: 'heavy', mt } : { state: 'idle' };
    }
    default: return { state: 'idle' };
  }
}

export class StoryScene {
  /**
   * @param lines  répliques (voir chapters.js)
   * @param opts   { title: bool (carton de titre), allies: [charId], onDone }
   */
  constructor(app, chapter, lines, opts = {}) {
    this.app = app;
    this.ch = chapter;
    this.lines = lines;
    this.opts = opts;
    this.i = -1;
    this.t = 0;
    this.shown = 0;
    this.models = [];
    this.finished = false;
  }

  start() {
    const app = this.app;
    const stage = app.stage;
    app.clearBackdrop();
    stage.setArena(this.ch.arena);
    const arena = ARENAS.find((a) => a.id === this.ch.arena);
    app.audio.music(arena ? arena.music : 'menu');
    // Placement : le héros et ses alliés à gauche, les autres à droite
    const hero = this.ch.hero || 'kael';
    const allies = new Set([hero, ...(this.opts.allies || [])]);
    const left = this.ch.cast.filter((id) => allies.has(id));
    const right = this.ch.cast.filter((id) => !allies.has(id));
    const place = (ids, side) => ids.forEach((id, k) => {
      const model = createCharacterModel(CHAR_BY_ID[id]);
      stage.scene.add(model.root);
      const z = k === 0 ? 0 : (k % 2 ? 1.7 : -1.7);
      const x = side * (2.1 + (k ? 1.3 : 0));
      const f = { x, y: 0, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, moveId: '', mt: 0, onGround: true, flash: 0, transformed: false };
      this.models.push({ id, model, f, pose: 'idle', poseT: 0 });
    });
    place(left, -1);
    place(right, 1);

    const el = document.createElement('div');
    el.className = 'screen story-scene';
    el.innerHTML = `
      ${this.opts.title ? `<div class="story-title"><div class="st-kanji">${esc(this.ch.kanji)}</div><div class="st-num">${this.ch.hero ? 'RÉCIT' : `CHAPITRE ${this.ch.n}`}</div><div class="st-name">${esc(this.ch.title)}</div></div>` : ''}
      <div class="dialog hidden">
        <div class="dl-portrait"></div>
        <div class="dl-box"><div class="dl-name"></div><div class="dl-text"></div><div class="dl-next">▼</div></div>
      </div>
      <button class="btn small dl-skip" data-nav>Passer la scène ▶▶</button>`;
    this.el = el;
    this.titleT = this.opts.title ? 2.6 : 0;
    el.addEventListener('click', (e) => { if (!e.target.closest('.dl-skip')) this.advance(); });
    el.querySelector('.dl-skip').addEventListener('click', () => this.finish());
    app.ui.show({
      el,
      onNav: (a) => {
        if (this.choosing) return false; // navigation entre les boutons du choix
        if (a === 'ok') { this.advance(); return true; }
        if (a === 'back') { this.finish(); return true; }
        return true;
      },
    });
    app.ui.focused = null;
    if (!this.opts.title) this.advance();
    else app.audio.play('ui_start');
  }

  advance() {
    if (this.finished || this.choosing) return;
    if (this.titleT > 0) { this.titleT = 0; this.hideTitle(); this.next(); return; }
    const line = this.lines[this.i];
    if (line && this.shown < line.text.length) { this.shown = line.text.length; return; } // affiche tout le texte
    this.next();
  }

  hideTitle() {
    const t = this.el.querySelector('.story-title');
    if (t) t.classList.add('out');
  }

  next() {
    this.i += 1;
    if (this.i >= this.lines.length) { this.finish(); return; }
    const line = this.lines[this.i];
    this.shown = 0;
    this.lineT = 0;
    const speaker = this.models.find((m) => m.id === line.who);
    if (speaker && line.pose) { speaker.pose = line.pose; speaker.poseT = 0; }
    this.cut = true;
    // Boîte de dialogue
    const dlg = this.el.querySelector('.dialog');
    dlg.classList.remove('hidden');
    const def = line.who ? CHAR_BY_ID[line.who] : null;
    dlg.classList.toggle('narrator', !def);
    dlg.style.setProperty('--c', def ? def.aura : '#c8c0e0');
    dlg.querySelector('.dl-name').textContent = def ? def.name : '';
    dlg.querySelector('.dl-portrait').innerHTML = def ? this.app.ui.portrait(def.id) : '';
    dlg.querySelector('.dl-text').textContent = '';
    this.fx(line.fx, speaker);
    if (line.vanish) this.startVanish(line.vanish);
    if (line.choice) this.showChoice(line);
  }

  /** Choix du joueur (fin de l'histoire) : des boutons, puis la suite correspondante. */
  showChoice(line) {
    this.choosing = true;
    const box = document.createElement('div');
    box.className = 'dl-choice';
    box.innerHTML = line.choice.map((c, i) => `<button class="btn" data-nav data-i="${i}" ${i === 0 ? 'data-autofocus' : ''}>${c.label}</button>`).join('');
    this.el.appendChild(box);
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = line.choice[Number(b.dataset.i)];
      box.remove();
      this.choosing = false;
      this.chosen = c.ending;
      if (this.opts.onChoice) this.opts.onChoice(c.ending);
      const more = (this.ch.endings && this.ch.endings[c.ending]) || [];
      this.lines = [...this.lines.slice(0, this.i + 1), ...more];
      this.app.audio.play('ui_ok');
      this.next();
    }));
    this.app.ui.focused = null;
    setTimeout(() => { const f = box.querySelector('button'); if (f) this.app.ui.focus(f, false); }, 50);
  }

  fx(kind, speaker) {
    const app = this.app;
    const st = app.stage;
    const at = speaker ? speaker.f : { x: 0, y: 0, z: 0 };
    const col = speaker ? CHAR_BY_ID[speaker.id].aura : '#ffffff';
    if (kind === 'flash') { app.overlay.flash('#ffffff', 0.15); app.audio.play('teleport'); }
    if (kind === 'shake') { st.rig.addShake(0.6); app.audio.play('thud'); }
    if (kind === 'aura') {
      st.particles.emit({ x: at.x, y: 1, z: at.z, count: 80, speed: 9, color: col, size: 0.35, life: 0.7 });
      st.effects.groundRing(at.x, 0, at.z, 0.4, 4, 0.6, col);
      app.overlay.speedLines(0.6, 1);
      app.audio.play('charge');
    }
    if (kind === 'impact') {
      app.overlay.impactFrame(0.18);
      st.effects.shockSphere(at.x, 1, at.z, 0.4, 5, 0.6, col);
      st.rig.addShake(0.8);
      app.audio.play('transform');
    }
    if (kind === 'dark') { app.overlay.mono(0.9); app.overlay.flash('#2a0010', 0.4); app.audio.play('ultCharge'); }
  }

  /**
   * Un personnage vaincu disparaît (fin d'un récit) : il se fige, se teinte puis se désagrège en
   * particules selon le style : cendres, pétales, pierres, lucioles ou lumière.
   */
  startVanish(v) {
    const m = this.models.find((x) => x.id === v.who);
    if (!m || m.vanish) return;
    // Matériaux propres à ce modèle (ils peuvent être partagés avec d'autres personnages)
    m.model.root.traverse((o) => {
      if (!o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        mat.transparent = true;
        mat.userData.baseOpacity = mat.opacity ?? 1;
        if (mat.color) mat.userData.baseColor = mat.color.clone();
      }
    });
    m.vanish = { t: 0, dur: v.style === 'stone' ? 2.6 : 2.3, style: v.style || 'ash', acc: 0 };
    const st = this.app.stage;
    const tint = { ash: '#ff7a3a', petals: '#ffb0d8', stone: '#d8c8a8', fireflies: '#d8ff8a', light: '#fff4d0' }[m.vanish.style] || '#ffffff';
    st.effects.light(m.f.x, 1.2, m.f.z, tint, 8, 1.4, 10);
    st.effects.groundRing(m.f.x, 0.05, m.f.z, 0.3, 3.5, 0.9, tint);
    if (m.vanish.style === 'stone') { st.rig.addShake(0.5); this.app.audio.play('thud'); } else this.app.audio.play('teleport');
  }

  updateVanish(m, dt) {
    const v = m.vanish;
    if (v.done) return;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    const p = this.app.stage.particles;
    const { x, z } = m.f;
    // Teinte : cendres → noir charbonneux, lumière → blanc, pierres → gris
    const toward = { ash: new THREE.Color('#1a1214'), stone: new THREE.Color('#6a6058'), light: new THREE.Color('#ffffff'), petals: new THREE.Color('#ffd0e8'), fireflies: new THREE.Color('#2a3a2a') }[v.style];
    const fade = Math.max(0, (k - 0.35) / 0.65); // disparition dans la seconde moitié
    m.model.root.traverse((o) => {
      if (!o.material) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (mat.userData.baseColor && toward) mat.color.copy(mat.userData.baseColor).lerp(toward, Math.min(1, k * 1.8));
        mat.opacity = (mat.userData.baseOpacity ?? 1) * (1 - fade);
      }
    });
    if (v.style === 'stone') m.model.root.position.y = -fade * 0.9; // le golem s'affaisse
    if (v.style === 'light') m.model.root.position.y = fade * 0.6; // l'armée s'élève en lumière
    // Particules qui s'échappent du corps, du bas vers le haut au fil de la désagrégation
    v.acc += dt;
    while (v.acc > 0.016) {
      v.acc -= 0.016;
      const n = k < 0.95 ? 6 : 0;
      for (let i = 0; i < n; i++) {
        const y = 0.2 + Math.random() * 2 * (0.4 + k);
        const px = x + (Math.random() - 0.5) * 0.9, pz = z + (Math.random() - 0.5) * 0.9;
        if (v.style === 'ash') {
          p.emit({ x: px, y, z: pz, count: 1, dir: [0.5, 1, 0.2], cone: 0.5, speed: 1.2 + Math.random() * 2, color: Math.random() < 0.25 ? '#ff8a3a' : '#2a2224', size: 0.12 + Math.random() * 0.14, life: 1.6, drag: 0.4, hdr: Math.random() < 0.25 ? 2 : 0.6 });
        } else if (v.style === 'petals') {
          const a = v.t * 6 + i;
          p.emit({ x: x + Math.cos(a) * 0.7, y, z: z + Math.sin(a) * 0.7, count: 1, dir: [-Math.sin(a), 0.7, Math.cos(a)], cone: 0.3, speed: 3, color: Math.random() < 0.5 ? '#ffb0d8' : '#ffe0f0', size: 0.16, life: 1.4, drag: 0.6, hdr: 1.2 });
        } else if (v.style === 'stone') {
          p.emit({ x: px, y, z: pz, count: 1, dir: [Math.random() - 0.5, -0.2, Math.random() - 0.5], cone: 0.8, speed: 2, color: Math.random() < 0.5 ? '#8a7a68' : '#5a5048', size: 0.2 + Math.random() * 0.2, life: 1, gravity: 9, drag: 0.5, hdr: 0.5 });
        } else if (v.style === 'fireflies') {
          if (Math.random() < 0.5) p.emit({ x: px, y, z: pz, count: 1, dir: [0, 1, 0], cone: 0.4, speed: 0.8 + Math.random(), color: '#d8ff8a', size: 0.14, life: 2.6, drag: 0.1, hdr: 2.5 });
        } else {
          p.emit({ x: px, y, z: pz, count: 1, dir: [0, 1, 0], cone: 0.3, speed: 2.5, color: Math.random() < 0.5 ? '#ffffff' : '#fff0c0', size: 0.14, life: 1.2, drag: 0.3, hdr: 2.2 });
        }
      }
    }
    if (k >= 1) {
      v.done = true;
      m.model.root.visible = false;
      // Dernier souffle : petite gerbe finale
      const col = { ash: '#ff8a3a', petals: '#ffb0d8', stone: '#b8a890', fireflies: '#d8ff8a', light: '#ffffff' }[v.style];
      p.emit({ x, y: 1, z, count: 40, speed: 4, color: col, size: 0.18, life: 1, drag: 1.5, hdr: 1.5 });
      if (v.style === 'stone') {
        for (let i = 0; i < 8; i++) p.emit({ x: x + (Math.random() - 0.5) * 1.2, y: 0.25, z: z + (Math.random() - 0.5) * 1.2, count: 1, speed: 0.2, color: '#7a6a5a', size: 0.5 + Math.random() * 0.4, life: 3, drag: 4, hdr: 0.4 });
      }
    }
  }

  /** Calcule le plan de caméra de la réplique courante. */
  shot(line) {
    const sp = this.models.find((m) => m.id === line.who) || this.models[0];
    const a = this.models[0];
    const b = this.models[1] || a;
    const fx = Math.sin(sp.f.yaw);
    const fz = Math.cos(sp.f.yaw);
    const fs = faceOf(sp.model, tmp);
    const hx = tmp.x; const hy = tmp.y; const hz = tmp.z;
    const drift = this.lineT * 0.05;
    const f = { mode: 'manual', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, roll: 0 };
    switch (line.shot) {
      case 'close':
        // Plan poitrine, de trois quarts face, cadré sur le visage
        f.pos.set(sp.f.x + fx * (2.1 - drift) * Math.max(1, fs * 0.7) + fz * 0.55, hy + 0.05, sp.f.z + fz * (2.1 - drift) * Math.max(1, fs * 0.7) - fx * 0.55);
        f.look.set(sp.f.x, hy - 0.15 * fs, sp.f.z);
        f.fov = 30;
        break;
      case 'low':
        f.pos.set(sp.f.x + fx * 2.3 + fz * 0.6, 0.35, sp.f.z + fz * 2.3 - fx * 0.6);
        f.look.set(sp.f.x, 1.35, sp.f.z);
        f.fov = 46;
        f.roll = 0.1;
        break;
      case 'two': {
        const mx = (a.f.x + b.f.x) / 2;
        const mz = (a.f.z + b.f.z) / 2;
        f.pos.set(mx, 1.7, mz + 6 - drift * 4);
        f.look.set(mx, 1.2, mz);
        f.fov = 40;
        break;
      }
      default: {
        const ang = this.t * 0.06;
        f.pos.set(Math.sin(ang) * 10, 3.6, Math.cos(ang) * 10);
        f.look.set(0, 1.2, 0);
        f.fov = 48;
      }
    }
    return f;
  }

  update(dt) {
    if (this.finished) return;
    this.t += dt;
    this.lineT = (this.lineT || 0) + dt;
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) { this.hideTitle(); this.next(); }
    }
    const line = this.lines[this.i];
    // Texte qui s'écrit (traduit avant d'être écrit lettre à lettre)
    if (line && !line.trDone) { line.text = tr(line.text); line.trDone = true; }
    if (line && this.shown < line.text.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(line.text.length, this.shown + dt * 48);
      if (Math.floor(this.shown) !== before) {
        this.el.querySelector('.dl-text').textContent = line.text.slice(0, Math.floor(this.shown));
        if (Math.floor(this.shown) % 4 === 0 && line.who) this.app.audio.play('ui_move');
      }
    }
    this.el.querySelector('.dl-next')?.classList.toggle('on', !!line && this.shown >= line.text.length);
    // Personnages
    for (const m of this.models) {
      m.poseT += dt;
      const ps = poseState(m.pose, m.poseT, CHAR_BY_ID[m.id]);
      Object.assign(m.f, { state: ps.state, moveId: ps.moveId || '', mt: ps.mt || 0 });
      m.f.st += dt;
      m.model.update(dt, m.f, { cine: !!ps.cine, react: ps.react || null });
      if (m.vanish) this.updateVanish(m, dt);
    }
    // Caméra
    const rig = this.app.stage.rig;
    const shotLine = line || { shot: 'wide' };
    const f = this.shot(shotLine);
    if (this.cut) { f.cut = true; this.cut = false; rig.setFocus(f); } else if (rig.focus && rig.focus.mode === 'manual') Object.assign(rig.focus, f, { cut: false });
    else rig.setFocus(f);
    rig.update(dt, this.models.map((m) => ({ ...m.f, team: 0, alive: true })));
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.dispose();
    if (this.opts.onDone) this.opts.onDone();
  }

  dispose() {
    for (const m of this.models) { this.app.stage.scene.remove(m.model.root); m.model.dispose(); }
    this.models = [];
    this.app.stage.rig.focus = null;
    this.app.overlay.clear();
    if (this.app.scene === this) this.app.scene = null;
  }
}
