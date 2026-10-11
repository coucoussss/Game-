// Déroulement d'un combat, quel que soit le mode :
//   'local'  : simulation sur cette machine (versus IA, deux joueurs, 2v2, entraînement)
//   'host'   : simulation ici + envoi des instantanés aux invités du réseau local
//   'client' : affichage des instantanés reçus de l'hôte + envoi de nos entrées
import { Match } from './game/match.js';
import { CpuBrain } from './game/ai.js';
import { CHAR_BY_ID } from './game/characters.js';
import { TICK } from './game/constants.js';
import { ARENA_RADIUS, ARENAS } from './render/arenas.js';
import { encodeSnapshot, RemoteState } from './net/session.js';

const SNAP_EVERY = 2; // un instantané tous les 2 ticks = 30 par seconde

export class Battle {
  /**
   * cfg : {
   *   role: 'local' | 'host' | 'client',
   *   arena, training, roundTime, difficulty,
   *   fighters: [{ charId, team, ctrl: { type: 'human', player } | { type: 'cpu', level } | { type: 'dummy', mode } | { type: 'remote', peer }, name }],
   *   net: NetClient (host / client), localFighter (client)
   * }
   */
  constructor(app, cfg) {
    this.app = app;
    this.cfg = cfg;
    this.role = cfg.role || 'local';
    this.acc = 0;
    this.tick = 0;
    this.paused = false;
    this.ended = false;
    this.netEvents = [];
    this.remoteInputs = new Map();
    this.sendAcc = 0;
    this.clientPressed = 0;
    this.comboDmg = 0;
    this.comboHits = 0;
    this.lastComboDmg = 0;
    this.humans = cfg.fighters.filter((f) => f.ctrl.type === 'human').length;

    const stage = app.stage;
    stage.setArena(cfg.arena);
    app.view.attach(cfg.fighters);
    app.view.localIds = new Set(cfg.fighters.map((f, i) => (f.ctrl.type === 'human' ? i : -1)).filter((i) => i >= 0));
    app.view.onMatchEnd = (team) => this.onMatchEnd(team);

    if (this.role === 'client') {
      this.state = new RemoteState(cfg.fighters.map((f) => ({ charId: f.charId, team: f.team, maxHp: CHAR_BY_ID[f.charId].hp })));
      this.state.localId = cfg.localFighter;
      app.view.localIds = new Set([cfg.localFighter]);
    } else {
      this.match = new Match({
        fighters: cfg.fighters.map((f) => ({ charId: f.charId, team: f.team })),
        arenaRadius: ARENA_RADIUS,
        roundTime: cfg.roundTime || 99,
        training: !!cfg.training,
      });
      this.state = this.match;
      this.brains = cfg.fighters.map((f, i) => {
        if (f.ctrl.type === 'cpu') return new CpuBrain(i, f.ctrl.level || cfg.difficulty || 'normal');
        if (f.ctrl.type === 'dummy') return new CpuBrain(i, 'normal', f.ctrl.mode || 'stand');
        return null;
      });
      // Les événements initiaux (annonce de la manche 1) partent aussi chez les invités
      this.netEvents.push(...this.match.events);
    }

    const labels = cfg.fighters.map((f) => {
      if (f.name) return f.name;
      if (f.ctrl.type === 'human') return `J${f.ctrl.player + 1}`;
      if (f.ctrl.type === 'dummy') return 'MANNEQUIN';
      return 'IA';
    });
    app.hud.setup(cfg.fighters.map((f, i) => ({
      id: i, name: CHAR_BY_ID[f.charId].name, team: f.team, color: CHAR_BY_ID[f.charId].aura, label: labels[i],
    })), { training: cfg.training });
    app.hud.show(true);
    app.overlay.clear();
    app.input.resetEdges();
    stage.rig.focus = null;
    stage.rig.snapTo(this.state.fighters);
    const arenaInfo = ARENAS.find((a) => a.id === cfg.arena);
    app.audio.music(arenaInfo ? arenaInfo.music : 0);
    this.specialCost = cfg.fighters.map((f) => CHAR_BY_ID[f.charId].moves.special.cost);

    if (this.role === 'host') {
      cfg.net.on('in', (msg) => {
        const r = this.remoteInputs.get(msg.from) || { mx: 0, mz: 0, held: 0, pressed: 0 };
        r.mx = Number(msg.mx) || 0;
        r.mz = Number(msg.mz) || 0;
        r.held = msg.h | 0;
        r.pressed |= msg.p | 0;
        this.remoteInputs.set(msg.from, r);
      });
    } else if (this.role === 'client') {
      cfg.net.on('snap', (msg) => this.state.push(msg));
    }
  }

  /** Convertit une entrée écran (x : droite, y : fond) en direction au sol. */
  toWorld(x, y) {
    const b = this.app.stage.rig.basis();
    return { mx: b.rx * x + b.fx * y, mz: b.rz * x + b.fz * y };
  }

  humanInput(f, slot) {
    const solo = this.humans <= 1;
    const s = this.app.input.sample(f.ctrl.player, solo);
    const w = this.toWorld(s.x, s.y);
    const pressed = this.app.input.edges(slot, s.held);
    if (s.pause) this.wantPause = true;
    return { mx: w.mx, mz: w.mz, held: s.held, pressed };
  }

  frame(dt) {
    const app = this.app;
    if (this.role === 'client') return this.clientFrame(dt);
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= TICK && steps < 5) {
        this.acc -= TICK;
        steps++;
        this.stepSim();
      }
      if (steps === 5) this.acc = 0;
    }
    const events = this.match.events.splice(0);
    this.trackCombo(events);
    app.view.handleEvents(events, this.match);
    app.view.update(this.paused ? 0 : dt, this.match);
    app.stage.rig.update(dt, this.match.fighters);
    app.hud.update(dt, this.match, { specialCost: this.specialCost, ping: null, trainingText: this.cfg.training ? this.trainingText() : null });
    if (this.paused) app.input.endTick(); // les appuis faits pendant la pause ne ressortent pas après
    if (this.wantPause) {
      if (this.role === 'local') app.ui.openPause();
      else app.ui.openNetMenu();
    }
    this.wantPause = false;
  }

  stepSim() {
    const m = this.match;
    const inputs = this.cfg.fighters.map((f, i) => {
      if (f.ctrl.type === 'human') return this.humanInput(f, i);
      if (f.ctrl.type === 'remote') {
        const r = this.remoteInputs.get(f.ctrl.peer);
        if (!r) return null;
        const out = { mx: r.mx, mz: r.mz, held: r.held, pressed: r.pressed };
        r.pressed = 0;
        return out;
      }
      return this.brains[i] ? this.brains[i].think(m, TICK) : null;
    });
    this.app.input.endTick();
    const before = m.events.length;
    m.step(TICK, inputs);
    this.tick++;
    if (this.role === 'host') {
      this.netEvents.push(...m.events.slice(before));
      if (this.tick % SNAP_EVERY === 0) {
        this.cfg.net.send(encodeSnapshot(m, this.netEvents, this.tick));
        this.netEvents = [];
      }
    }
  }

  clientFrame(dt) {
    const app = this.app;
    const st = this.state;
    // Entrées locales envoyées à l'hôte à chaque image (≈ 60 Hz)
    const s = app.input.sample(0, true);
    const w = this.toWorld(s.x, s.y);
    this.clientPressed |= app.input.edges(0, s.held);
    app.input.endTick();
    this.sendAcc += dt;
    if (this.sendAcc >= TICK * 0.9) {
      this.sendAcc = 0;
      this.cfg.net.send({ type: 'in', mx: Math.round(w.mx * 100) / 100, mz: Math.round(w.mz * 100) / 100, h: s.held, p: this.clientPressed });
      this.clientPressed = 0;
    }
    const rtt = this.cfg.net.rtt || 0;
    const delay = Math.min(0.2, Math.max(0.06, rtt / 2000 + 0.05));
    const events = st.sample(dt, delay, w, (f) => CHAR_BY_ID[f.charId].speed * (f.transformed ? 1.2 : 1));
    app.view.handleEvents(events, st);
    app.view.update(dt, st);
    app.stage.rig.update(dt, st.fighters);
    app.hud.update(dt, st, { specialCost: this.specialCost, ping: Math.round(rtt) });
    if (s.pause) app.ui.openNetMenu();
    if (app.ui.screen) this.clientPressed = 0; // menu ouvert : on n'envoie pas les validations du menu
  }

  trackCombo(events) {
    if (!this.cfg.training) return;
    for (const ev of events) {
      if (ev.type !== 'hit' || ev.blocked) continue;
      if (ev.combo <= 1) { this.comboDmg = 0; this.comboHits = 0; }
      this.comboDmg += ev.dmg || 0;
      this.comboHits = ev.combo || 1;
      this.lastComboDmg = this.comboDmg;
    }
  }

  trainingText() {
    const dummy = this.cfg.fighters.find((f) => f.ctrl.type === 'dummy');
    const modes = { stand: 'Immobile', guard: 'Garde', jump: 'Saute', cpu: 'Combat' };
    return `<span>Mannequin : <b>${modes[dummy?.ctrl.mode] || '—'}</b></span>
      <span>Énergie infinie : <b>${this.match.infiniteEnergy ? 'oui' : 'non'}</b></span>
      <span>Dernier combo : <b>${this.comboHits} coups — ${this.lastComboDmg} dégâts</b></span>
      <span class="hint">Échap / Start : options d’entraînement</span>`;
  }

  setDummyMode(mode) {
    const i = this.cfg.fighters.findIndex((f) => f.ctrl.type === 'dummy');
    if (i < 0) return;
    this.cfg.fighters[i].ctrl.mode = mode;
    this.brains[i].dummy = mode;
  }

  resetPositions() {
    if (!this.match) return;
    this.match.round = 0;
    this.match.startRound();
    this.match.events.length = 0;
  }

  onMatchEnd(team) {
    if (this.ended) return;
    this.ended = true;
    setTimeout(() => this.app.ui.showResults(this, team), 1800);
  }

  winnerNames(team) {
    if (team < 0) return null;
    return this.cfg.fighters.filter((f) => f.team === team).map((f) => CHAR_BY_ID[f.charId].name);
  }

  dispose() {
    this.app.view.detach();
    this.app.view.onMatchEnd = null;
    this.app.hud.show(false);
    this.app.overlay.clear();
    this.app.stage.particles.clear();
    this.app.stage.effects.clear();
    if (this.cfg.net) {
      this.cfg.net.on('in', null);
      this.cfg.net.on('snap', null);
    }
  }
}
