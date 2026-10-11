// Scènes du mode histoire : les personnages en 3D dans l'arène, mis en scène plan par plan
// (gros plan sur celui qui parle, plan à deux, plan large, contre-plongée), avec une boîte de
// dialogue façon visual novel (portrait, nom, texte qui s'écrit), des poses et des effets.
import * as THREE from 'three';
import { CharacterModel } from '../render/model.js';
import { CHAR_BY_ID } from '../game/characters.js';
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
    const allies = new Set(['kael', ...(this.opts.allies || [])]);
    const left = this.ch.cast.filter((id) => allies.has(id));
    const right = this.ch.cast.filter((id) => !allies.has(id));
    const place = (ids, side) => ids.forEach((id, k) => {
      const model = new CharacterModel(CHAR_BY_ID[id]);
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
      ${this.opts.title ? `<div class="story-title"><div class="st-kanji">${esc(this.ch.kanji)}</div><div class="st-num">CHAPITRE ${this.ch.n}</div><div class="st-name">${esc(this.ch.title)}</div></div>` : ''}
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
    if (this.finished) return;
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

  /** Calcule le plan de caméra de la réplique courante. */
  shot(line) {
    const sp = this.models.find((m) => m.id === line.who) || this.models[0];
    const a = this.models[0];
    const b = this.models[1] || a;
    const fx = Math.sin(sp.f.yaw);
    const fz = Math.cos(sp.f.yaw);
    sp.model.head.getWorldPosition(tmp);
    const hx = tmp.x; const hy = tmp.y + 0.1; const hz = tmp.z;
    const drift = this.lineT * 0.05;
    const f = { mode: 'manual', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, roll: 0 };
    switch (line.shot) {
      case 'close':
        // Plan poitrine, de trois quarts face, cadré sur le visage
        f.pos.set(sp.f.x + fx * (2.1 - drift) + fz * 0.55, 1.62, sp.f.z + fz * (2.1 - drift) - fx * 0.55);
        f.look.set(sp.f.x, Math.max(1.2, hy - 0.2), sp.f.z);
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
    // Texte qui s'écrit
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
