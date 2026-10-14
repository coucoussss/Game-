// Replays : un combat local est enregistré sous forme d'instantanés (30 par seconde, les mêmes que
// ceux envoyés aux invités en réseau local), puis rejoué avec l'affichage de l'invité : on peut le
// ralentir, le mettre en pause, avancer, ou le quitter.
import { RemoteState } from './net/session.js';
import { CHAR_BY_ID } from './game/characters.js';
import { ARENAS } from './render/arenas.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ReplayPlayer {
  /** rec : { cfg, snaps, maxHp } enregistré par Battle. onExit : retour (menu de fin du combat). */
  constructor(app, rec, onExit) {
    this.app = app;
    this.rec = rec;
    this.onExit = onExit;
    this.cfg = { ...rec.cfg, role: 'replay' };
    this.paused = false;
    this.speed = 1;
    this.idx = 0;
    this.t = rec.snaps[0].t;
    this.state = new RemoteState(rec.cfg.fighters.map((f, i) => ({ charId: f.charId, team: f.team, maxHp: rec.maxHp[i] })));
    app.stage.setArena(rec.cfg.arena);
    app.view.attach(rec.cfg.fighters, rec.cfg.arena, rec.cfg.hazards !== false);
    app.view.localIds = new Set();
    app.view.onMatchEnd = null;
    app.hud.setup(rec.cfg.fighters.map((f, i) => ({
      id: i, name: CHAR_BY_ID[f.charId].name, team: f.team, color: CHAR_BY_ID[f.charId].aura, label: f.ctrl.type === 'human' ? `J${(f.ctrl.player || 0) + 1}` : 'IA',
    })), {});
    app.hud.setupBars([]);
    app.hud.show(true);
    app.overlay.clear();
    const arena = ARENAS.find((a) => a.id === rec.cfg.arena);
    app.audio.music(arena ? arena.music : 0);
    this.el = document.createElement('div');
    this.el.className = 'replay-bar';
    this.el.innerHTML = `<span class="rp-tag">● REPLAY</span>
      <button class="btn small" data-sp="0.25">×¼</button><button class="btn small" data-sp="0.5">×½</button>
      <button class="btn small on" data-sp="1">×1</button><button class="btn small" data-sp="2">×2</button>
      <button class="btn small" data-act="pause">Pause</button><button class="btn small" data-act="restart">Début</button>
      <button class="btn small ghost" data-act="exit">Quitter</button><div class="rp-progress"><i></i></div>`;
    document.getElementById('ui').appendChild(this.el);
    this.el.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => this.setSpeed(Number(b.dataset.sp))));
    this.el.querySelector('[data-act=pause]').addEventListener('click', () => { this.paused = !this.paused; this.el.querySelector('[data-act=pause]').textContent = this.paused ? 'Lecture' : 'Pause'; });
    this.el.querySelector('[data-act=restart]').addEventListener('click', () => this.restart());
    this.el.querySelector('[data-act=exit]').addEventListener('click', () => this.exit());
    this.keys = (e) => {
      if (e.code === 'Escape') this.exit();
      else if (e.code === 'Space') { e.preventDefault(); this.el.querySelector('[data-act=pause]').click(); }
      else if (e.code === 'ArrowLeft') this.setSpeed(Math.max(0.25, this.speed / 2));
      else if (e.code === 'ArrowRight') this.setSpeed(Math.min(2, this.speed * 2));
    };
    window.addEventListener('keydown', this.keys);
    app.stage.rig.focus = null;
  }

  setSpeed(s) {
    this.speed = s;
    this.el.querySelectorAll('[data-sp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.sp) === s));
  }

  restart() {
    this.idx = 0;
    this.t = this.rec.snaps[0].t;
    this.state.buffer = [];
    this.state.pendingEvents = [];
    this.app.stage.particles.clear();
    this.app.stage.effects.clear();
    this.app.overlay.clear();
  }

  frame(dt) {
    const app = this.app;
    const snaps = this.rec.snaps;
    const st = this.state;
    const sdt = this.paused ? 0 : dt * this.speed;
    this.t += sdt;
    // On alimente l'état avec les instantanés dont l'heure est passée
    while (this.idx < snaps.length && snaps[this.idx].t <= this.t + 0.05) {
      const s = snaps[this.idx++];
      st.buffer.push(s);
      if (st.buffer.length > 40) st.buffer.shift();
      for (const ev of s.ev || []) if (ev.type !== 'matchEnd') st.pendingEvents.push({ t: s.t, ev });
    }
    st.offset = this.t - performance.now() / 1000;
    const events = st.sample(sdt, 0, { mx: 0, mz: 0 }, () => 0);
    app.view.handleEvents(events, st);
    app.view.update(sdt, st);
    app.stage.rig.update(dt, st.fighters);
    app.hud.update(dt, st, {});
    const last = snaps[snaps.length - 1];
    const p = Math.min(1, (this.t - snaps[0].t) / Math.max(0.01, last.t - snaps[0].t));
    this.el.querySelector('.rp-progress i').style.width = `${p * 100}%`;
    if (this.idx >= snaps.length && this.t > last.t + 1.5 && !this.paused) { this.paused = true; this.el.querySelector('[data-act=pause]').textContent = 'Lecture'; }
    app.input.endTick();
  }

  exit() {
    if (this.done) return;
    this.done = true;
    this.app.endReplay(this.onExit);
  }

  dispose() {
    window.removeEventListener('keydown', this.keys);
    this.el.remove();
    this.app.view.detach();
    this.app.hud.show(false);
    this.app.overlay.clear();
    this.app.stage.particles.clear();
    this.app.stage.effects.clear();
  }
}

/** Nom lisible d'un enregistrement (pour le menu). */
export function replayTitle(rec) {
  return rec.cfg.fighters.map((f) => esc(CHAR_BY_ID[f.charId].name)).join(' vs ');
}
