// Point d'entrée du jeu (fenêtre Electron ou navigateur) : assemble le rendu, le son, les entrées,
// les menus et la boucle principale.
import * as THREE from 'three';
import { Settings } from './core/settings.js';
import { Profile } from './core/profile.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Stage } from './render/stage.js';
import { MatchView } from './render/view.js';
import { CharacterModel } from './render/model.js';
import { Overlay } from './ui/overlay.js';
import { Hud } from './ui/hud.js';
import { UI } from './ui/screens.js';
import { renderPortraits } from './ui/portraits.js';
import { showVs } from './ui/vs.js';
import { ReplayPlayer } from './replay.js';
import { TouchControls } from './ui/touch.js';
import { Battle } from './battle.js';
import { CpuBrain } from './game/ai.js';
import { CHARACTERS, CHAR_BY_ID } from './game/characters.js';
import { dressed } from './game/techniques.js';
import { startDomTranslation } from './i18n/i18n.js';
import { platform } from './platform.js';

class App {
  constructor() {
    this.settings = new Settings();
    this.profile = new Profile();
    this.input = new Input(this.settings);
    this.audio = new AudioEngine(this.settings);
    const canvas = document.getElementById('game');
    this.stage = new Stage(canvas, this.settings);
    const overlayRoot = document.getElementById('overlay');
    this.overlay = new Overlay(overlayRoot);
    this.hud = new Hud(overlayRoot);
    this.view = new MatchView(this.stage, this.audio, this.hud, this.overlay);
    this.ui = new UI(this);
    this.touch = new TouchControls(document.body, this.input, this.settings);
    // Tablette : qualité moyenne par défaut (rendu plus fluide sur écran Retina)
    if (matchMedia('(pointer: coarse)').matches && this.settings.fresh) {
      this.settings.data.gfx.quality = 'medium';
    }
    this.battle = null;
    this.scene = null; // scène du mode histoire en cours
    this.backdrop = { mode: null, models: [] };
    this.input.onPadChange = (msg) => this.ui.toast(msg);
    this.applyGfx(true);
    this.last = performance.now();
    this.ui.portraits = renderPortraits();
    this.ui.title();
    requestAnimationFrame((t) => this.frame(t));
  }

  applyGfx(initial = false) {
    const g = this.settings.data.gfx;
    this.stage.applySettings();
    this.overlay.reduced = !g.shake;
    if (initial && !g.fullscreen) return;
    if (window.auraNative) window.auraNative.setFullscreen(g.fullscreen);
    else if (g.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (!g.fullscreen && document.fullscreenElement) document.exitFullscreen?.();
  }

  // --- Décor des menus ----------------------------------------------------------------------

  /** Scène affichée derrière les menus. mode : 'title' | 'menu' | 'select' | 'arena'. */
  setBackdrop(mode, arg) {
    const key = `${mode}:${arg ?? ''}`;
    if (this.backdrop.key === key) return;
    const prevMode = this.backdrop.mode;
    this.backdrop.key = key;
    this.backdrop.mode = mode;
    const rig = this.stage.rig;
    const clearModels = () => {
      for (const m of this.backdrop.models) { this.stage.scene.remove(m.model.root); m.model.dispose(); }
      this.backdrop.models = [];
    };
    const addModel = (id, x, z, yaw, outfit) => {
      const model = new CharacterModel(dressed(CHAR_BY_ID[id], outfit === undefined ? this.profile.outfitFor(id) : outfit));
      this.stage.scene.add(model.root);
      const f = { x, y: 0, z, yaw, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, moveId: '', mt: 0, onGround: true, flash: 0, transformed: false };
      this.backdrop.models.push({ model, f, id });
      return f;
    };
    if (mode === 'title' || mode === 'menu') {
      if (prevMode === 'title' || prevMode === 'menu') return;
      clearModels();
      this.stage.setArena(mode === 'title' ? 'temple' : 'cliffs');
      const ids = CHARACTERS.map((c) => c.id).sort(() => Math.random() - 0.5);
      addModel(ids[0], -2.2, 0, Math.PI / 2);
      addModel(ids[1], 2.2, 0, -Math.PI / 2);
      rig.setFocus({ mode: 'orbit', x: 0, y: 0, z: 0, yaw: 0, t: 0 });
    } else if (mode === 'select') {
      if (prevMode !== 'select') this.stage.setArena('temple');
      clearModels();
      if (arg) {
        // « id@skin » : aperçu d'un skin (boutique)
        const [cid, skin] = String(arg).split('@');
        const f = addModel(cid, 0, 0, 0.35, skin === undefined ? undefined : skin || null);
        f.state = 'victory';
        this.backdrop.models[0].poseT = 0;
      }
      rig.setFocus({ mode: 'showcase', x: 0, y: 0, z: 0, yaw: 0, t: 0 });
    } else if (mode === 'gallery') {
      // Galerie : un seul modèle, caméra libre (rotation et zoom pilotés par l'écran de galerie)
      if (prevMode !== 'gallery') this.stage.setArena('temple');
      clearModels();
      const f = addModel(arg, 0, 0, 0);
      f.energy = 100;
      this.gallery = this.gallery || { yaw: 0.4, dist: 3.4, pose: 'idle', h: 1.1 };
      this.gallery.f = f;
      rig.setFocus({ mode: 'manual', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 38, roll: 0, cut: true });
    } else if (mode === 'arena') {
      clearModels();
      this.stage.setArena(arg);
      rig.setFocus({ mode: 'orbit', x: 0, y: 0, z: 0, yaw: 0, t: 0 });
    }
  }

  updateBackdrop(dt) {
    if (this.backdrop.mode === 'gallery') { this.updateGallery(dt); return; }
    for (const m of this.backdrop.models) {
      m.poseT = (m.poseT || 0) + dt;
      if (this.backdrop.mode === 'select' && m.poseT > 1.6) m.f.state = 'idle';
      if (this.backdrop.mode !== 'select') {
        // Les deux combattants du menu s'échauffent : petits enchaînements de temps en temps
        m.f.st += dt;
        if (m.f.state === 'move') {
          m.f.mt += dt;
          const mv = CHAR_BY_ID[m.id].moves[m.f.moveId];
          if (m.f.mt > mv.dur) { m.f.state = 'idle'; m.f.moveId = ''; }
        } else if (Math.random() < dt * 0.4) {
          m.f.state = 'move';
          m.f.moveId = ['light1', 'light2', 'heavy', 'ranged'][Math.floor(Math.random() * 4)];
          m.f.mt = 0;
        }
      }
      m.model.update(dt, m.f, { auraBoost: this.backdrop.mode === 'select' ? 0.6 : 0.25 });
    }
    this.stage.rig.update(dt, this.backdrop.models.map((m) => ({ ...m.f, team: 0, alive: true })));
  }

  /** Galerie : pose choisie, rotation et zoom de la caméra autour du modèle. */
  updateGallery(dt) {
    const g = this.gallery;
    const m = this.backdrop.models[0];
    if (!m) return;
    const def = CHAR_BY_ID[m.id];
    const f = m.f;
    const extra = {};
    f.st += dt;
    if (g.pose === 'ult') {
      const mv = def.moves.ultimate;
      if (f.state !== 'move') { f.state = 'move'; f.moveId = 'ultimate'; f.mt = 0; }
      f.mt += dt;
      if (f.mt > mv.dur + 0.6) f.mt = 0;
    } else {
      f.moveId = '';
      f.state = g.pose === 'victory' ? 'victory' : g.pose === 'aura' ? 'charge' : 'idle';
      if (g.pose === 'intro') extra.intro = true;
    }
    if (g.expr) { m.model.setExpression(g.expr); m.model.blinkT = 9; }
    const keepExpr = g.expr;
    if (keepExpr) { const se = m.model.setExpression; m.model.setExpression = () => {}; m.model.update(dt, f, extra); m.model.setExpression = se; } else m.model.update(dt, f, extra);
    if (g.auto) g.yaw += dt * 0.35;
    const k = def.look.size || 1;
    const rig = this.stage.rig;
    if (rig.focus && rig.focus.mode === 'manual') {
      const d = g.dist * k;
      rig.focus.pos.set(Math.sin(g.yaw) * d, g.h * k + 0.25 * k, Math.cos(g.yaw) * d);
      rig.focus.look.set(0, g.h * k, 0);
    }
    rig.update(dt, [{ ...f, team: 0, alive: true }]);
  }

  // --- Combats ------------------------------------------------------------------------------

  /** Retire les personnages du décor des menus (avant un combat ou une scène). */
  clearBackdrop() {
    this.setBackdrop('none');
    for (const m of this.backdrop.models) { this.stage.scene.remove(m.model.root); m.model.dispose(); }
    this.backdrop.models = [];
  }

  startBattle(cfg) {
    if (this.battle) this.battle.dispose();
    if (this.scene) { this.scene.dispose(); this.scene = null; }
    this.ui.show(null);
    this.clearBackdrop();
    this.stage.rig.focus = null;
    this.lastCfg = cfg;
    this.battle = new Battle(this, {
      roundTime: this.settings.data.game.roundTime,
      ...cfg,
      fighters: cfg.fighters.map((f) => ({ ...f, ctrl: { ...f.ctrl } })),
    });
    this.audio.play('fight');
    this.touch.setBattle(true);
    // Écran « VS » (hors entraînement et réseau local) : le combat attend qu'il disparaisse
    if (this.vsSkip) this.vsSkip();
    if (!cfg.training && (cfg.role || 'local') === 'local') {
      const b = this.battle;
      b.paused = true;
      this.vsSkip = showVs(this, cfg, () => {
        this.vsSkip = null;
        if (this.battle === b) { b.paused = false; this.input.resetEdges(); this.input.endTick(); }
      });
    }
  }

  /** Rejoue le dernier combat enregistré. */
  startReplay(onExit) {
    if (!this.lastReplay) return;
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    this.ui.show(null);
    this.clearBackdrop();
    this.battle = new ReplayPlayer(this, this.lastReplay, onExit);
  }

  endReplay(onExit) {
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    this.backdrop.key = null;
    this.backdrop.mode = null;
    if (onExit) onExit(); else this.ui.mainMenu();
  }

  restartBattle() {
    if (!this.lastCfg) return;
    this.startBattle(this.lastCfg);
  }

  /** Termine le combat ; `toMenu` ramène au menu principal (sinon l'appelant choisit l'écran). */
  endBattle(toMenu = true) {
    if (this.battle) {
      this.battle.dispose();
      this.battle = null;
    }
    this.touch.setBattle(false);
    this.backdrop.key = null;
    this.backdrop.mode = null;
    if (toMenu) this.ui.mainMenu();
  }

  /** Un invité a quitté la partie en plein combat : l'IA prend sa place. */
  convertPeerToCpu(peer) {
    const b = this.battle;
    if (!b || !b.brains) return;
    b.cfg.fighters.forEach((f, i) => {
      if (f.ctrl.type === 'remote' && f.ctrl.peer === peer) {
        f.ctrl = { type: 'cpu', level: b.cfg.difficulty || 'normal' };
        b.brains[i] = new CpuBrain(i, f.ctrl.level);
      }
    });
  }

  // --- Boucle principale ------------------------------------------------------------------------

  frame(t) {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    // Temps de jeu total (profil), enregistré toutes les 30 s
    this.playAcc = (this.playAcc || 0) + dt;
    // Temps de jeu du jour (coffres de temps de jeu)
    if (this.profile.data.live && !document.hidden) this.profile.data.live.dayPlay += dt;
    if (this.playAcc >= 30) { this.profile.data.playTime = (this.profile.data.playTime || 0) + this.playAcc; this.playAcc = 0; this.profile.save(); }
    this.input.poll(dt);
    const actions = this.input.menuActions();
    if (this.vsSkip && actions.includes('ok')) this.vsSkip(); // manette : A passe l'écran VS
    else if (this.ui.screen || this.ui.revealOpen) this.ui.handle(actions);
    // Signale au site hôte (CrazyGames) quand le joueur est réellement en combat
    if (this.battle && !this.ui.screen && !this.replay) platform.gameplayStart(); else platform.gameplayStop();
    if (this.battle) this.battle.frame(dt);
    else if (this.scene) this.scene.update(dt);
    else this.updateBackdrop(dt);
    this.stage.update(dt);
    this.stage.adapt(dt);
    this.overlay.update(dt);
    this.stage.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

function boot() {
  startDomTranslation();
  platform.init();
  try {
    window.app = new App();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('fatal');
    el.style.display = 'flex';
    el.querySelector('pre').textContent = `${err.message}\n\nAura Clash a besoin de WebGL (carte graphique avec pilotes à jour).`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
