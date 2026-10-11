// Déroulement d'un combat, quel que soit le mode :
//   'local'  : simulation sur cette machine (versus IA, deux joueurs, 2v2, entraînement)
//   'host'   : simulation ici + envoi des instantanés aux invités du réseau local
//   'client' : affichage des instantanés reçus de l'hôte + envoi de nos entrées
import { Match } from './game/match.js';
import { CpuBrain } from './game/ai.js';
import { CHAR_BY_ID, SLOTS, withLoadout } from './game/characters.js';
import { keyLabel } from './core/input.js';
import { PAD_NAMES } from './core/settings.js';
import { TICK } from './game/constants.js';
import { ARENA_RADIUS, ARENAS } from './render/arenas.js';
import { encodeSnapshot, RemoteState } from './net/session.js';
import { TIERS } from './game/monsters.js';
import { trackEvents, pendingChallenges, CHALLENGES } from './core/challenges.js';
import { WAVE_HEAL, endlessWave, withDifficulty, blessingChoices } from './game/waves.js';

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
    this.pendingBefore = new Set(pendingChallenges(app.profile).map((c) => c[0]));

    const stage = app.stage;
    stage.setArena(cfg.arena);
    // Joueurs de cette machine (hors réseau local) : techniques choisies et tenue
    if (this.role === 'local') {
      for (const f of cfg.fighters) {
        if (f.ctrl.type !== 'human') continue;
        f.loadout = f.loadout || app.profile.loadoutFor(f.charId);
        f.costume = f.costume === undefined ? app.profile.outfitFor(f.charId) : f.costume;
      }
    }
    app.view.attach(cfg.fighters, cfg.training || cfg.tutorial ? null : cfg.arena, cfg.hazards !== false);
    app.view.localIds = new Set(cfg.fighters.map((f, i) => (f.ctrl.type === 'human' ? i : -1)).filter((i) => i >= 0));
    app.view.onMatchEnd = (team) => this.onMatchEnd(team);

    if (this.role === 'client') {
      this.state = new RemoteState(cfg.fighters.map((f) => ({ charId: f.charId, team: f.team, maxHp: CHAR_BY_ID[f.charId].hp })));
      this.state.localId = cfg.localFighter;
      app.view.localIds = new Set([cfg.localFighter]);
    } else {
      this.match = new Match({
        // Les améliorations achetées s'appliquent aux joueurs de cette machine (hors réseau local)
        fighters: cfg.fighters.map((f) => ({
          charId: f.charId, team: f.team,
          mods: f.mods || (this.role === 'local' && f.ctrl.type === 'human' ? app.profile.modsFor(f.charId) : undefined),
          loadout: f.loadout,
        })),
        arenaRadius: ARENA_RADIUS,
        arena: cfg.arena,
        hazards: cfg.hazards !== false && !cfg.tutorial,
        roundTime: cfg.roundTime || 99,
        training: !!cfg.training,
        waves: cfg.waves ? cfg.waves.map((w) => w.map((e) => ({ ...e }))) : undefined,
        // Mode Infini : vagues générées sans fin (difficulté choisie appliquée)
        waveGen: cfg.endless ? (k) => (k === 0 ? cfg.firstWave : endlessWave(k).map((e) => withDifficulty(e, cfg.difficultyId))) : undefined,
        waveHeal: cfg.waveHeal ?? WAVE_HEAL,
        blessings: !!(cfg.waves || cfg.endless),
        blessEvery: cfg.endless ? 3 : 1,
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

    for (const f of cfg.fighters) if (CHAR_BY_ID[f.charId].monster) app.profile.markSeen(f.charId);
    this.barOwners = cfg.fighters
      .map((f, i) => ({ i, f }))
      .filter(({ i, f }) => (this.role === 'client' ? i === cfg.localFighter : f.ctrl.type === 'human'));
    this.setupHud();
    app.hud.show(true);
    app.overlay.clear();
    app.input.resetEdges();
    app.input.endTick(); // la touche qui a lancé le combat (ou passé la scène) ne compte pas
    stage.rig.focus = null;
    stage.rig.snapTo(this.state.fighters);
    const arenaInfo = ARENAS.find((a) => a.id === cfg.arena);
    this.arenaMusic = arenaInfo ? arenaInfo.music : 0;
    // Un boss dès le début (histoire, première vague) : son thème
    const boss0 = cfg.fighters.find((f) => CHAR_BY_ID[f.charId].boss);
    app.audio.music(boss0 ? `boss:${boss0.charId}` : this.arenaMusic);
    this.specialCost = cfg.fighters.map((f) => withLoadout(CHAR_BY_ID[f.charId], f.loadout).moves.special.cost);

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

  /** Panneaux de vie (les vaincus des vagues précédentes n'y figurent plus) et barres d'attaques. */
  setupHud() {
    const app = this.app;
    const cfg = this.cfg;
    const label = (f) => {
      if (f.name) return f.name;
      if (f.ctrl.type === 'human') return `J${f.ctrl.player + 1}`;
      if (f.ctrl.type === 'dummy') return 'MANNEQUIN';
      const def = CHAR_BY_ID[f.charId];
      if (def.monster) return f.elite ? 'ÉLITE' : TIERS[def.tier].label.toUpperCase();
      return 'IA';
    };
    const gone = (i) => this.match && this.match.fighters[i] && this.match.fighters[i].gone;
    const list = cfg.fighters.map((f, i) => ({ f, i })).filter(({ i }) => !gone(i));
    // Le boss passe en tête de son camp (grande barre de vie)
    list.sort((a, b) => (a.f.team - b.f.team) || ((b.f.boss ? 1 : 0) - (a.f.boss ? 1 : 0)));
    app.hud.setup(list.map(({ f, i }) => ({
      id: i, name: CHAR_BY_ID[f.charId].name, team: f.team, color: CHAR_BY_ID[f.charId].aura, label: label(f), boss: !!f.boss,
    })), { training: cfg.training, waves: !!(cfg.waves || cfg.endless) });
    if (this.match) for (const f of this.match.fighters) if (f.team === 0 && Object.keys(f.bless).length) app.hud.setBlessings(f.id, f.bless);
    // Barre des attaques : une par joueur de cette machine
    const sides = this.barOwners.length > 1 ? ['left', 'right'] : ['mid'];
    app.hud.setupBars(this.barOwners.map(({ i, f }, k) => ({ id: i, def: withLoadout(CHAR_BY_ID[f.charId], f.loadout), side: sides[k] || 'right' })));
    this.labelT = 0;
  }

  /** Mode Vagues : une nouvelle vague est apparue dans la simulation → modèles, IA et interface. */
  onWaveSpawn(ev) {
    ev.ids.forEach((id, k) => {
      const e = ev.entries[k];
      this.cfg.fighters[id] = { charId: e.charId, team: 1, ctrl: { type: 'cpu', level: e.level }, boss: !!e.boss, elite: !!e.elite };
      this.brains[id] = new CpuBrain(id, e.level);
      this.specialCost[id] = CHAR_BY_ID[e.charId].moves.special.cost;
      this.app.view.addFighter(e.charId);
      this.app.profile.markSeen(e.charId);
    });
    this.setupHud();
  }

  /** Mode Vagues : propose trois bénédictions entre deux vagues (le combat est figé pendant le choix). */
  offerBlessing() {
    const me = this.match.fighters.findIndex((f, i) => this.cfg.fighters[i] && this.cfg.fighters[i].ctrl.type === 'human');
    if (me < 0) { this.match.awaitChoice = false; return; }
    this.paused = true;
    // Petit délai : on laisse le temps de voir la vague tomber
    setTimeout(() => {
      if (this.app.battle !== this || this.ended) return;
      this.app.ui.blessingChoice(blessingChoices(), (id) => {
        this.match.applyBlessing(this.match.fighters[me], id);
        this.paused = false;
        this.app.input.resetEdges();
        this.app.input.endTick();
      });
    }, 700);
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
    for (const ev of events) {
      if (ev.type === 'waveSpawn') {
        this.onWaveSpawn(ev);
        const boss = ev.entries.find((e) => e.boss);
        if (boss) app.audio.music(`boss:${boss.charId}`);
        else if (ev.n > 1 && this.match.fighters.every((f) => !f.def.boss || f.gone)) app.audio.music(this.arenaMusic);
      }
      else if (ev.type === 'waveClear' && this.match.awaitChoice) this.offerBlessing();
      else if (ev.type === 'bossPhase') {
        // Seconde phase d'un boss : l'arène bascule au cœur de la cinématique, la musique s'emballe
        if (ev.arena) this.pendingArena = { id: ev.arena, t: 1.1 };
        app.audio.music(`boss2:${ev.charId}`);
      } else if (ev.type === 'blessing') app.hud.setBlessings(ev.id, this.match.fighters[ev.id].bless);
    }
    if (this.pendingArena) {
      this.pendingArena.t -= dt;
      if (this.pendingArena.t <= 0) {
        app.overlay.flash('#ffffff', 0.35);
        app.stage.setArena(this.pendingArena.id);
        this.pendingArena = null;
      }
    }
    this.trackCombo(events);
    if (this.role !== 'client' && !this.cfg.training) trackEvents(app.profile, events, this.match, this.app.view.localIds);
    if (this.cfg.tutorial && app.tutorial) app.tutorial.update(this.paused ? 0 : dt, events, this.match);
    app.view.handleEvents(events, this.match);
    app.view.update(this.paused ? 0 : dt, this.match);
    app.stage.rig.update(dt, this.match.fighters);
    this.refreshBarLabels(dt);
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
      if (m.fighters[i] && m.fighters[i].gone) return null;
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
    this.refreshBarLabels(dt);
    app.hud.update(dt, st, { specialCost: this.specialCost, ping: Math.round(rtt) });
    if (s.pause) app.ui.openNetMenu();
    if (app.ui.screen) this.clientPressed = 0; // menu ouvert : on n'envoie pas les validations du menu
  }

  /** Touche affichée pour chaque attaque, selon le dernier périphérique utilisé. */
  refreshBarLabels(dt) {
    // Recharge visible aussi sur les boutons tactiles
    const own = this.barOwners[0];
    if (own) this.app.touch.setCooldowns(this.state.fighters[own.i]);
    this.labelT -= dt;
    if (this.labelT > 0) return;
    this.labelT = 0.5;
    const input = this.app.input;
    const s = this.app.settings.data;
    const touchNames = { light: '', heavy: '', ranged: '', special: '', ultimate: '' }; // au tactile, les boutons portent déjà le nom
    this.barOwners.forEach(({ f }, k) => {
      const player = this.role === 'client' ? 0 : f.ctrl.player;
      const solo = this.role === 'client' || this.humans <= 1;
      const labels = {};
      for (const [slot] of SLOTS) {
        if (input.lastDevice === 'touch' && player === 0) labels[slot] = touchNames[slot];
        else if (input.lastDevice === 'pad' && input.padCount() > (solo ? 0 : player)) {
          const b = (s.pad[solo ? 0 : player][slot] || [])[0];
          labels[slot] = b != null ? PAD_NAMES[b] || `Bouton ${b}` : '—';
        } else labels[slot] = keyLabel((s.keys[solo ? 0 : player][slot] || [])[0]);
      }
      this.app.hud.setBarLabels(k, labels);
    });
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
    if (this.cfg.tutorial) return '';
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

  /** Défis accomplis pendant ce combat : sauvegarde et notification. */
  announceChallenges() {
    const prof = this.app.profile;
    prof.save();
    const fresh = pendingChallenges(prof).filter((c) => !this.pendingBefore.has(c[0]));
    for (const c of fresh) this.pendingBefore.add(c[0]);
    if (fresh.length) this.app.ui.toast(`🏆 Défi accompli : ${fresh.map((c) => c[1]).join(', ')} — réclame ta récompense dans « Défis »`, 5);
  }

  dispose() {
    this.announceChallenges();
    if (this.cfg.tutorial && this.app.tutorial) this.app.tutorial.dispose();
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
