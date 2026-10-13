// Menus du jeu (HTML par-dessus la scène 3D), navigables à la souris, au clavier et à la manette.
import { CHARACTERS, CHAR_BY_ID, moveList } from '../game/characters.js';
import { AI_LEVELS, DUMMY_MODES } from '../game/ai.js';
import { ARENAS } from '../render/arenas.js';
import { HAZARD_INFO } from '../game/hazards.js';
import { ACTIONS, PAD_NAMES } from '../core/settings.js';
import { keyLabel } from '../core/input.js';
import { NetClient, parseAddress, LAN_PORT } from '../net/session.js';
import { REWARDS, UPGRADES, UPGRADE_COSTS, UPGRADE_MAX } from '../core/profile.js';
import { CHAPTERS, STORY_TITLE } from '../story/chapters.js';
import { ARCS } from '../story/arcs.js';
import { StoryScene } from '../story/scene.js';
import { Tutorial, TUTORIAL_REWARD } from './tutorial.js';
import { TECH_PRICES, COSTUMES, COSTUME_PRICE } from '../game/techniques.js';
import { CHALLENGES, challengeState, pendingChallenges } from '../core/challenges.js';
import { WAVE_LEVELS, WAVE_HEAL, buildLevel, levelReward, isBossLevel, regionOf, DIFFICULTIES, withDifficulty, endlessWave, endlessReward, BLESSINGS } from '../game/waves.js';
import { MONSTERS, TIERS } from '../game/monsters.js';
import { lang, setLang, tr } from '../i18n/i18n.js';
import { levelFromXp } from '../core/level.js';
import { RANKS, LEGEND, DIVISIONS, DIV_POINTS, DAILY_RYO, RANK_TITLES, RANK_AURAS, POPULATION, estimate, formatTop, recordStats, opponentFor, applyResult, dailyAvailable, stepName, rankName, bestTier, unlockedTitles, unlockedAuras, titleOf, auraOf } from '../game/ranked.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const lastIp = () => { try { return localStorage.getItem('auraclash.lastIp') || ''; } catch { return ''; } };
// Version « page web » (artefact, iPad) : pas de réseau local, le navigateur ne peut ni héberger ni joindre.
const WEB_ONLY = typeof window !== 'undefined' && !!window.AURA_WEB_ONLY;
const randomChar = () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
const randomOf = (ids) => ids[Math.floor(Math.random() * ids.length)];
const baseChars = () => CHARACTERS.filter((c) => !c.price).map((c) => c.id);
const randomArena = () => ARENAS[Math.floor(Math.random() * ARENAS.length)].id;

const FIREWALL_HELP = `
  <p><b>Pare-feu Windows :</b> la première fois que tu cliques sur « Créer une partie » (ou « Rejoindre »),
  Windows peut afficher « Le Pare-feu Windows a bloqué certaines fonctionnalités ». Coche
  <b>Réseaux privés</b> puis clique sur <b>Autoriser l’accès</b>.</p>
  <p>Si tes amis ne voient pas la partie : vérifie que vous êtes sur le même réseau (même box / Wi-Fi), que ce réseau
  est déclaré « privé » dans Windows, ou lance <b>firewall.bat</b> (clic droit → Exécuter en tant qu’administrateur),
  fourni avec le jeu, qui ouvre les ports <b>TCP ${LAN_PORT}</b> et <b>UDP ${LAN_PORT + 1}</b>.</p>`;

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.screen = null;
    this.focused = null;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    document.body.appendChild(this.toastEl);
    this.portraits = {};
    this.net = null;
    this.lobbyState = null;
  }

  // --- Mécanique des écrans et de la navigation ---------------------------------------------

  show(screen) {
    if (this.screen && this.screen.destroy) this.screen.destroy();
    if (this.screen && this.screen.el) this.screen.el.remove();
    this.screen = screen;
    this.focused = null;
    if (!screen) return;
    this.root.appendChild(screen.el);
    screen.el.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('mouseenter', () => this.focus(el, false));
    });
    const first = screen.el.querySelector('[data-autofocus]') || this.items()[0];
    if (first) this.focus(first, false);
  }

  items() {
    if (!this.screen) return [];
    return [...this.screen.el.querySelectorAll('[data-nav]')].filter((e) => !e.disabled && e.offsetParent !== null);
  }

  focus(el, sound = true) {
    if (!el || el === this.focused) return;
    if (this.focused) this.focused.classList.remove('focus');
    this.focused = el;
    el.classList.add('focus');
    if (sound) this.app.audio.play('ui_move');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    if (this.screen && this.screen.onFocus) this.screen.onFocus(el);
  }

  move(dir) {
    const items = this.items();
    if (!items.length) return;
    if (!this.focused || !items.includes(this.focused)) { this.focus(items[0]); return; }
    const r = this.focused.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === this.focused) continue;
      const q = el.getBoundingClientRect();
      const dx = q.left + q.width / 2 - cx;
      const dy = q.top + q.height / 2 - cy;
      const primary = { up: -dy, down: dy, left: -dx, right: dx }[dir];
      if (primary <= 4) continue;
      const secondary = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = primary + secondary * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.focus(best);
  }

  /** Actions de menu (clavier / manette) pour l'image courante. */
  handle(actions) {
    const s = this.screen;
    if (!s) return;
    for (const a of actions) {
      if (s.onNav && s.onNav(a, this.focused)) continue;
      const f = this.focused;
      if ((a === 'left' || a === 'right') && f && f.dataset.slider !== undefined) {
        const input = f.querySelector('input') || f;
        input.value = Math.max(0, Math.min(1, Number(input.value) + (a === 'left' ? -0.05 : 0.05)));
        input.dispatchEvent(new Event('input'));
        continue;
      }
      if ((a === 'left' || a === 'right') && f && f.dataset.cycle !== undefined) {
        f.dispatchEvent(new CustomEvent('cycle', { detail: a === 'left' ? -1 : 1 }));
        this.app.audio.play('ui_move');
        continue;
      }
      if (['up', 'down', 'left', 'right'].includes(a)) this.move(a);
      else if (a === 'ok' && f) {
        if (f.tagName === 'INPUT') { f.focus(); continue; }
        this.app.audio.play('ui_ok');
        f.click();
      } else if (a === 'back' && s.back) {
        this.app.audio.play('ui_back');
        s.back();
      }
    }
  }

  toast(msg, dur = 3) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), dur * 1000);
  }

  portrait(id, cls = '') {
    const def = CHAR_BY_ID[id];
    const src = this.portraits[id];
    return src
      ? `<img class="portrait ${cls}" src="${src}" alt="" style="--c:${def.aura}">`
      : `<div class="portrait ${cls} fallback" style="--c:${def.aura}">${def.name[0]}</div>`;
  }

  menu(title, buttons, opts = {}) {
    const el = h(`<div class="screen menu ${opts.cls || ''}">
      ${title ? `<h2 class="menu-title">${title}</h2>` : ''}
      ${opts.subtitle ? `<p class="menu-sub">${opts.subtitle}</p>` : ''}
      <div class="menu-list">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-nav data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}${b.hint ? `<small>${b.hint}</small>` : ''}</button>`).join('')}</div>
      ${opts.footer || ''}
    </div>`);
    el.querySelectorAll('.btn[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => buttons[Number(btn.dataset.i)].action());
    });
    return el;
  }

  // --- Écran titre et menu principal ------------------------------------------------------

  title() {
    this.app.setBackdrop('title');
    const el = h(`<div class="screen title-screen">
      <div class="logo"><span class="logo-a">AURA</span><span class="logo-b">CLASH</span></div>
      <div class="logo-jp">オーラ・クラッシュ</div>
      <button class="btn press" data-nav data-autofocus>${matchMedia('(pointer: coarse)').matches ? 'Touche l’écran pour commencer' : 'Appuie sur une touche'}</button>
      <div class="credits">Jeu de combat 3D — 10 combattants, 15 créatures, 5 arènes, multijoueur en réseau local</div>
    </div>`);
    el.querySelector('.press').addEventListener('click', () => {
      this.app.audio.play('ui_start');
      this.app.input.menuActions(); // la touche qui a fermé l'écran titre ne valide pas aussi le menu
      this.mainMenu();
    });
    const anyKey = (e) => { if (this.screen && this.screen.el === el && e.code !== 'F11') { e.preventDefault(); el.querySelector('.press').click(); } };
    window.addEventListener('keydown', anyKey);
    this.show({ el, destroy: () => window.removeEventListener('keydown', anyKey), onNav: (a) => { if (a === 'ok' || a === 'back') { el.querySelector('.press').click(); return true; } return false; } });
    this.app.audio.music('menu');
  }

  mainMenu() {
    this.app.setBackdrop('menu');
    this.app.audio.music('menu');
    const electron = !!window.auraNative;
    const prof = this.app.profile;
    const done = CHAPTERS.filter((c) => prof.hasCleared(c.id)).length;
    const pending = pendingChallenges(prof).length;
    // Tuiles : les modes de jeu en grand, la progression en plus petit
    const play = [
      { kanji: '物', label: 'Mode Histoire', hint: `${done} / ${CHAPTERS.length} chapitres · récits`, color: '#ff8a3a', action: () => this.storyMenu() },
      { kanji: '波', label: 'Mode Vagues', hint: `niveau ${Math.min(WAVE_LEVELS, prof.levelUnlocked())} / ${WAVE_LEVELS} · boss · infini`, color: '#ff3a5a', action: () => this.wavesMenu() },
      { kanji: '級', label: 'Classé', hint: this.rankText(prof.data.ranked), color: '#ffd23f', badge: dailyAvailable(prof.data.ranked) ? '×2' : '', action: () => this.rankedMenu() },
      { kanji: '戦', label: 'Combat libre', hint: 'versus, 2 contre 2, réseau, entraînement', color: '#5ab4ff', action: () => this.freeMenu() },
      { kanji: '学', label: 'Tutoriel', hint: prof.data.tutorialDone ? 'revoir les techniques' : `les bases — +${TUTORIAL_REWARD} Ryō`, color: '#7fffb0', badge: prof.data.tutorialDone ? '' : 'NEW', action: () => this.charSelect([{ label: 'TUTORIEL', team: 0, ctrl: { type: 'human', player: 0 } }], (fs) => new Tutorial(this.app, fs[0].charId).start(), () => this.mainMenu()) },
    ];
    const meta = [
      { kanji: '強', label: 'Améliorations', hint: 'stats, techniques, tenues', action: () => this.upgrades() },
      { kanji: '店', label: 'Boutique', hint: 'nouveaux combattants', action: () => this.shop() },
      { kanji: '賞', label: 'Défis', hint: `${CHALLENGES.filter((c) => challengeState(prof, c).claimed).length} / ${CHALLENGES.length} réclamés`, badge: pending ? String(pending) : '', action: () => this.challenges() },
      { kanji: '己', label: 'Profil', hint: `${esc(this.app.settings.data.game.playerName || 'Joueur')} · niv. ${levelFromXp(prof.data.xp).level}`, color: '#7fe0ff', action: () => this.profileScreen() },
      { kanji: '画', label: 'Galerie', hint: 'modèles 3D et auras', action: () => this.gallery() },
    ];
    const sys = [
      { label: 'Options', action: () => this.options(() => this.mainMenu()) },
      { label: lang === 'fr' ? '🌐 English' : '🌐 Français', cls: 'ghost', action: () => setLang(lang === 'fr' ? 'en' : 'fr') },
      ...(electron ? [{ label: 'Quitter', cls: 'ghost', action: () => window.auraNative.quit() }] : []),
    ];
    const tile = (t, i, kind) => `<button class="tile ${kind}" data-nav data-k="${kind}" data-i="${i}" style="--c:${t.color || '#ffd23f'}">
      <span class="t-kanji">${t.kanji}</span><span class="t-txt"><b>${t.label}</b><small>${t.hint}</small></span>
      ${t.badge ? `<span class="t-badge">${t.badge}</span>` : ''}</button>`;
    const el = h(`<div class="screen main-menu home">
      <div class="home-head"><div class="menu-logo"><span class="logo-a">AURA</span><span class="logo-b">CLASH</span></div><div class="wallet">${prof.ryo} <small>Ryō</small>${titleOf(prof.data.ranked) ? `<div class="wallet-title"><span>${esc(titleOf(prof.data.ranked))}</span></div>` : ''}</div></div>
      <div class="home-label">JOUER</div>
      <div class="tiles play">${play.map((t, i) => tile(t, i, 'play')).join('')}</div>
      <div class="home-label">PROGRESSION</div>
      <div class="tiles meta">${meta.map((t, i) => tile(t, i, 'meta')).join('')}</div>
      <div class="home-foot">${sys.map((b, i) => `<button class="btn small ${b.cls || ''}" data-nav data-k="sys" data-i="${i}">${b.label}</button>`).join('')}
        <span class="controls-hint">Flèches / manette : naviguer — Entrée / A : valider — Échap / B : retour</span></div>
    </div>`);
    const lists = { play, meta, sys };
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => lists[b.dataset.k][Number(b.dataset.i)].action()));
    this.show({ el, back: () => this.title() });
    this.focus(el.querySelector('.tile'), false);
  }

  // --- Préparation des combats --------------------------------------------------------------

  freeMenu() {
    const el = this.menu('COMBAT LIBRE', [
      { label: 'Versus contre l’IA', hint: '1 joueur, best of 3', action: () => this.setupVersus('cpu') },
      { label: 'Versus local', hint: '2 joueurs sur le même appareil', action: () => this.setupVersus('local2') },
      { label: '2 contre 2', hint: 'avec ou sans partenaire humain', action: () => this.setup2v2() },
      ...(window.AURA_PLATFORM ? [] : [{ label: 'Réseau local (LAN)', hint: WEB_ONLY ? 'disponible dans la version PC (.exe)' : 'créer ou rejoindre une partie', disabled: WEB_ONLY, action: () => this.lanMenu() }]),
      { label: 'Entraînement', hint: 'mannequin configurable', action: () => this.setupTraining() },
      { label: 'Retour', cls: 'ghost', action: () => this.mainMenu() },
    ]);
    this.show({ el, back: () => this.mainMenu() });
  }

  setupVersus(kind) {
    const diff = this.app.settings.data.game.difficulty;
    const slots = kind === 'cpu'
      ? [{ label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } }, { label: 'ADVERSAIRE (IA)', team: 1, ctrl: { type: 'cpu', level: diff } }]
      : [{ label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } }, { label: 'JOUEUR 2', team: 1, ctrl: { type: 'human', player: 1 } }];
    this.charSelect(slots, (fighters) => {
      this.arenaSelect((arena) => this.app.startBattle({ role: 'local', arena, fighters, difficulty: diff }), () => this.setupVersus(kind));
    }, () => this.freeMenu());
  }

  setup2v2() {
    const diff = this.app.settings.data.game.difficulty;
    const cpu = (team) => ({ team, ctrl: { type: 'cpu', level: diff } });
    const go = (slots) => this.charSelect(slots, (fighters) => {
      this.arenaSelect((arena) => this.app.startBattle({ role: 'local', arena, fighters, difficulty: diff }), () => this.setup2v2());
    }, () => this.setup2v2());
    const el = this.menu('2 CONTRE 2', [
      { label: 'Toi + une IA contre deux IA', action: () => go([{ label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } }, { label: 'ALLIÉ (IA)', ...cpu(0) }, { label: 'ADVERSAIRE 1 (IA)', ...cpu(1) }, { label: 'ADVERSAIRE 2 (IA)', ...cpu(1) }]) },
      { label: 'Deux joueurs ensemble contre deux IA', action: () => go([{ label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } }, { label: 'JOUEUR 2', team: 0, ctrl: { type: 'human', player: 1 } }, { label: 'ADVERSAIRE 1 (IA)', ...cpu(1) }, { label: 'ADVERSAIRE 2 (IA)', ...cpu(1) }]) },
      { label: 'Joueur 1 + IA contre Joueur 2 + IA', action: () => go([{ label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } }, { label: 'ALLIÉ DE J1 (IA)', ...cpu(0) }, { label: 'JOUEUR 2', team: 1, ctrl: { type: 'human', player: 1 } }, { label: 'ALLIÉ DE J2 (IA)', ...cpu(1) }]) },
      { label: 'Retour', cls: 'ghost', action: () => this.freeMenu() },
    ], { subtitle: 'Chaque équipe gagne la manche quand ses deux adversaires sont K.O.' });
    this.show({ el, back: () => this.freeMenu() });
  }

  setupTraining() {
    this.charSelect([
      { label: 'JOUEUR 1', team: 0, ctrl: { type: 'human', player: 0 } },
      { label: 'MANNEQUIN', team: 1, ctrl: { type: 'dummy', mode: 'stand' } },
    ], (fighters) => {
      this.arenaSelect((arena) => this.app.startBattle({ role: 'local', arena, fighters, training: true }), () => this.setupTraining());
    }, () => this.freeMenu());
  }

  /**
   * Sélection des personnages, emplacement par emplacement.
   * slots : [{ label, team, ctrl }] ; onDone(fighters)
   */
  charSelect(slots, onDone, onBack, startIndex = 0, picks = []) {
    const idx = startIndex;
    const slot = slots[idx];
    const human = slot.ctrl.type === 'human';
    const locked = (id) => human && !this.app.profile.owns(id);
    const el = h(`<div class="screen select">
      <div class="select-head"><span class="step">${idx + 1} / ${slots.length}</span> <b>${esc(slot.label)}</b> — choisis un combattant</div>
      <div class="select-body">
        <div class="char-grid">
          ${CHARACTERS.map((c) => `<button class="char-card ${locked(c.id) ? 'locked' : ''}" data-nav data-id="${c.id}" style="--c:${c.aura}">${this.portrait(c.id)}<span class="cname">${esc(c.name)}</span><span class="ctitle">${esc(c.title)}</span>${locked(c.id) ? `<span class="lock">🔒 ${c.price} Ryō</span>` : ''}</button>`).join('')}
          <button class="char-card random" data-nav data-id="random"><div class="portrait fallback">?</div><span class="cname">Aléatoire</span><span class="ctitle">Laisse le destin choisir</span></button>
        </div>
        <div class="char-info"></div>
      </div>
      <div class="picks">${slots.map((s, i) => `<div class="pick ${i === idx ? 'cur' : ''} team${s.team}">${picks[i] ? this.portrait(picks[i], 'mini') : '<div class="portrait mini fallback">?</div>'}<span>${esc(s.label)}</span></div>`).join('')}</div>
    </div>`);
    const info = el.querySelector('.char-info');
    const showInfo = (id) => {
      if (id === 'random') {
        info.innerHTML = '<h3>Aléatoire</h3><p>Un combattant tiré au sort.</p>';
        this.app.setBackdrop('select', null);
        return;
      }
      const c = CHAR_BY_ID[id];
      const stat = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
      info.innerHTML = `<h3 style="color:${c.aura}">${esc(c.name)}</h3><div class="ititle">${esc(c.title)}</div>
        <p>${esc(c.blurb)}</p>
        ${stat('Vie', (c.hp - 800) / 400)}${stat('Vitesse', (c.speed - 5) / 3)}${stat('Portée', c.aiZoning)}
        <table class="moves">${moveList(c).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
      this.app.setBackdrop('select', id);
    };
    el.querySelectorAll('.char-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (card.dataset.id !== 'random' && locked(card.dataset.id)) {
          const c = CHAR_BY_ID[card.dataset.id];
          this.app.audio.play('denied');
          this.toast(`${c.name} est verrouillé : débloque-le dans la Boutique (${c.price} Ryō).`, 3.5);
          return;
        }
        const id = card.dataset.id === 'random' ? (human ? randomOf(this.app.profile.ownedIds()) : randomChar()) : card.dataset.id;
        const next = picks.slice();
        next[idx] = id;
        this.app.audio.play('ui_ok');
        if (idx + 1 < slots.length) this.charSelect(slots, onDone, onBack, idx + 1, next);
        else onDone(slots.map((s, i) => ({ charId: next[i], team: s.team, ctrl: s.ctrl })));
      });
    });
    const prevPick = picks[idx];
    this.show({
      el,
      back: () => (idx > 0 ? this.charSelect(slots, onDone, onBack, idx - 1, picks) : onBack()),
      onFocus: (f) => showInfo(f.dataset.id),
    });
    if (prevPick) this.focus(el.querySelector(`[data-id="${prevPick}"]`), false);
    showInfo(this.focused ? this.focused.dataset.id : CHARACTERS[0].id);
  }

  arenaSelect(onDone, onBack) {
    const el = h(`<div class="screen arena-select">
      <div class="select-head"><b>ARÈNE</b> — choisis le lieu du combat</div>
      <div class="arena-list">
        ${ARENAS.map((a) => `<button class="arena-card" data-nav data-id="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><em class="hz">⚠ ${esc(HAZARD_INFO[a.id] || '')}</em></button>`).join('')}
        <button class="arena-card" data-nav data-id="random"><b>Aléatoire</b><small>Une arène au hasard</small></button>
      </div>
    </div>`);
    el.querySelectorAll('.arena-card').forEach((c) => c.addEventListener('click', () => onDone(c.dataset.id === 'random' ? randomArena() : c.dataset.id)));
    this.show({ el, back: onBack, onFocus: (f) => { if (f.dataset.id !== 'random') this.app.setBackdrop('arena', f.dataset.id); } });
    this.app.setBackdrop('arena', ARENAS[0].id);
  }

  // --- Boutique ---------------------------------------------------------------------------

  shop() {
    const prof = this.app.profile;
    const items = CHARACTERS.filter((c) => c.price);
    const el = h(`<div class="screen select shop">
      <div class="select-head"><b>BOUTIQUE</b> — débloque de nouveaux combattants <span class="wallet inline">${prof.ryo} <small>Ryō</small></span></div>
      <div class="select-body">
        <div class="char-grid shop-grid">
          ${items.map((c) => `<button class="char-card ${prof.owns(c.id) ? 'owned' : 'locked'}" data-nav data-id="${c.id}" style="--c:${c.aura}">${this.portrait(c.id)}<span class="cname">${esc(c.name)}</span><span class="ctitle">${esc(c.title)}</span>
            <span class="lock">${prof.owns(c.id) ? '✔ Débloqué' : `${c.price} Ryō`}</span></button>`).join('')}
        </div>
        <div class="char-info"></div>
      </div>
      <div class="shop-foot">Gagne des Ryō en combattant : victoire +${REWARDS.win}, défaite +${REWARDS.loss}, +${REWARDS.perRound} par manche gagnée, +${REWARDS.lanBonus} en réseau local.
        <button class="btn small" data-nav data-act="back">Retour</button></div>
    </div>`);
    const info = el.querySelector('.char-info');
    const showInfo = (id) => {
      const c = CHAR_BY_ID[id];
      if (!c) return;
      const owned = prof.owns(id);
      const stat = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div></div>`;
      info.innerHTML = `<h3 style="color:${c.aura}">${esc(c.name)}</h3><div class="ititle">${esc(c.title)}</div>
        <p>${esc(c.blurb)}</p>
        ${stat('Vie', (c.hp - 800) / 600)}${stat('Vitesse', (c.speed - 5) / 3)}${stat('Portée', c.aiZoning)}
        <table class="moves">${moveList(c).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
        <div class="buy-line">${owned ? '<b class="ok">Déjà débloqué</b>' : `Prix : <b>${c.price} Ryō</b> ${prof.ryo < c.price ? `<span class="miss">(il te manque ${c.price - prof.ryo})</span>` : '— Entrée / A pour acheter'}`}</div>`;
      this.app.setBackdrop('select', id);
    };
    el.querySelectorAll('.char-card').forEach((card) => card.addEventListener('click', () => {
      const c = CHAR_BY_ID[card.dataset.id];
      const res = prof.buy(c.id);
      if (res === 'ok') {
        this.app.audio.play('roundWin');
        this.toast(`${c.name} est débloqué ! Il est jouable dans tous les modes.`, 3.5);
        this.shop();
        const again = this.screen.el.querySelector(`[data-id="${c.id}"]`);
        if (again) this.focus(again, false);
        showInfoAfter(c.id);
      } else if (res === 'owned') {
        this.toast(`${c.name} est déjà débloqué.`);
      } else {
        this.app.audio.play('denied');
        this.toast(`Il te manque ${c.price - prof.ryo} Ryō pour ${c.name}.`);
      }
    }));
    const showInfoAfter = (id) => { const s2 = this.screen; if (s2 && s2.onFocus) s2.onFocus({ dataset: { id } }); };
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu(), onFocus: (f) => showInfo(f.dataset.id) });
    showInfo(this.focused && this.focused.dataset.id ? this.focused.dataset.id : items[0].id);
  }

  // --- Mode histoire ------------------------------------------------------------------------

  storyMenu() {
    this.app.setBackdrop('menu');
    const prof = this.app.profile;
    const el = h(`<div class="screen menu story-menu">
      <h2 class="menu-title">${esc(STORY_TITLE)}</h2>
      <p class="menu-sub">Yami vole l’aura des grands maîtres pour réveiller l’Éclipse Infernale. Kael part l’arrêter.</p>
      <div class="chapters">${CHAPTERS.map((c, i) => {
        const open = i === 0 || prof.hasCleared(CHAPTERS[i - 1].id);
        const cleared = prof.hasCleared(c.id);
        return `<button class="chapter ${cleared ? 'cleared' : ''}" data-nav data-i="${i}" ${open ? '' : 'disabled'}>
          <span class="ch-kanji">${esc(c.kanji)}</span>
          <span class="ch-txt"><small>Chapitre ${c.n}${cleared ? ' — terminé ✔' : ''}</small><b>${open ? esc(c.title) : '???'}</b>
          <em>${open ? `Récompense : ${c.reward.ryo} Ryō${c.reward.unlock ? ` + ${esc(CHAR_BY_ID[c.reward.unlock].name)}` : ''}` : 'Termine le chapitre précédent'}</em></span>
        </button>`;
      }).join('')}</div>
      <h3 class="arcs-title">Récits des combattants</h3>
      <div class="chapters arcs">${ARCS.map((c, i) => {
        const open = prof.owns(c.hero);
        const cleared = prof.hasCleared(c.id);
        const hero = CHAR_BY_ID[c.hero];
        return `<button class="chapter arc ${cleared ? 'cleared' : ''}" data-nav data-arc="${i}" ${open ? '' : 'disabled'} style="--c:${hero.aura}">
          ${this.portrait(c.hero, 'mini')}
          <span class="ch-txt"><small>${esc(hero.name)}${cleared ? ' — terminé ✔' : ''}</small><b>${open ? esc(c.title) : '???'}</b>
          <em>${open ? `Récompense : ${c.reward.ryo} Ryō` : 'Débloque ce combattant pour lire son récit'}</em></span>
        </button>`;
      }).join('')}</div>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
    </div>`);
    el.querySelectorAll('[data-arc]').forEach((b) => b.addEventListener('click', () => this.playChapter(ARCS[Number(b.dataset.arc)])));
    el.querySelectorAll('.chapter:not(.arc)').forEach((b) => b.addEventListener('click', () => this.playChapter(CHAPTERS[Number(b.dataset.i)])));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    const next = el.querySelector('.chapter:not([disabled]):not(.cleared)');
    if (next) this.focus(next, false);
  }

  /** Joue un chapitre : scène d'introduction → combat → scène de fin → récompenses. */
  playChapter(ch) {
    const app = this.app;
    const scene = new StoryScene(app, ch, ch.intro, {
      title: true,
      allies: (ch.fight.allies || []).map((a) => a.charId),
      onDone: () => this.storyFight(ch),
    });
    app.scene = scene;
    scene.start();
  }

  storyFight(ch) {
    const app = this.app;
    const merge = (a, b) => {
      const m = { ...a };
      for (const k in b || {}) m[k] = (m[k] || 1) * b[k];
      return m;
    };
    const hero = ch.hero || 'kael';
    const fighters = [
      { charId: hero, team: 0, ctrl: { type: 'human', player: 0 }, mods: merge(app.profile.modsFor(hero), ch.fight.playerMods) },
      ...(ch.fight.allies || []).map((a) => ({ charId: a.charId, team: 0, ctrl: { type: 'cpu', level: a.level } })),
      ...ch.fight.enemies.map((e) => ({ charId: e.charId, team: 1, ctrl: { type: 'cpu', level: e.level }, mods: e.mods })),
    ];
    app.startBattle({ role: 'local', arena: ch.arena, fighters, story: ch.id, storyTitle: ch.hero ? `RÉCIT — ${ch.title}` : `CHAPITRE ${ch.n} — ${ch.title}` });
  }

  /** Fin d'un combat du mode histoire (appelé à la place de l'écran de résultats). */
  storyFightEnd(battle, team) {
    const app = this.app;
    const ch = CHAPTERS.find((c) => c.id === battle.cfg.story) || ARCS.find((c) => c.id === battle.cfg.story);
    const heroDef = CHAR_BY_ID[ch.hero || 'kael'];
    if (team === 0) {
      app.profile.bumpStat('wins');
      app.endBattle(false);
      const scene = new StoryScene(app, ch, ch.outro, {
        allies: (ch.fight.allies || []).map((a) => a.charId),
        onChoice: (ending) => { app.profile.data.ending = ending; app.profile.save(); },
        onDone: () => this.storyReward(ch),
      });
      app.scene = scene;
      scene.start();
      return;
    }
    const el = this.menu('DÉFAITE', [
      { label: 'Réessayer le combat', action: () => app.restartBattle() },
      { label: 'Revoir la scène', action: () => { app.endBattle(false); this.playChapter(ch); } },
      { label: `Améliorer ${esc(heroDef.name)}`, hint: 'force, vie, vitesse, ki, maîtrise', action: () => { app.endBattle(false); this.upgrades(heroDef.id); } },
      { label: 'Menu du mode histoire', cls: 'danger', action: () => { app.endBattle(false); this.storyMenu(); } },
    ], { cls: 'results', subtitle: `${ch.hero ? 'Récit' : `Chapitre ${ch.n}`} — ${ch.title}. Les améliorations de ${heroDef.name} peuvent faire la différence.` });
    this.show({ el });
  }

  storyReward(ch) {
    const prof = this.app.profile;
    const first = !prof.hasCleared(ch.id);
    const ryo = first ? ch.reward.ryo : Math.round(ch.reward.ryo * 0.25);
    prof.earn(ryo);
    let unlocked = null;
    if (ch.reward.unlock && prof.grant(ch.reward.unlock)) unlocked = CHAR_BY_ID[ch.reward.unlock];
    prof.clearChapter(ch.id);
    const idx = CHAPTERS.indexOf(ch);
    const nextCh = idx >= 0 ? CHAPTERS[idx + 1] : null;
    const isArc = idx < 0;
    const buttons = [];
    if (nextCh) buttons.push({ label: `Chapitre ${nextCh.n} : ${nextCh.title}`, action: () => this.playChapter(nextCh) });
    buttons.push({ label: 'Menu du mode histoire', action: () => this.storyMenu() });
    buttons.push({ label: 'Menu principal', cls: 'ghost', action: () => this.mainMenu() });
    const el = this.menu('', buttons, { cls: 'results' });
    const endingName = { redemption: 'La Rédemption', seal: 'Le Sceau' }[this.app.profile.data.ending];
    el.prepend(h(`<div class="result-head"><div class="result-big win">${isArc ? 'RÉCIT TERMINÉ' : `CHAPITRE ${ch.n} TERMINÉ`}</div>
      <div class="result-sub">${esc(ch.title)}</div>
      <div class="reward">+${ryo} Ryō${first ? '' : ' <small>(chapitre déjà terminé : récompense réduite)</small>'}</div>
      ${unlocked ? `<div class="unlock">${this.portrait(unlocked.id, 'big')}<b>${esc(unlocked.name)} est débloqué !</b></div>` : ''}
      ${!nextCh && !isArc ? `<div class="the-end">— FIN${endingName ? ` : ${endingName}` : ''} —</div><div class="result-sub">Rejoue le chapitre 8 pour découvrir l’autre fin.</div>` : ''}</div>`));
    this.show({ el });
    this.app.audio.play('roundWin');
    this.app.setBackdrop('menu');
  }

  // --- Mode Vagues ------------------------------------------------------------------------

  wavesMenu(sel = null) {
    this.app.setBackdrop('menu');
    const prof = this.app.profile;
    const open = Math.min(WAVE_LEVELS, prof.levelUnlocked());
    const levels = Array.from({ length: WAVE_LEVELS }, (_, i) => i + 1);
    const regionColors = ['#7aff9a', '#ff9a5a', '#c87aff', '#7ad8ff', '#ff5a3a', '#ff1a4a'];
    const endlessOpen = prof.hasClearedLevel(WAVE_LEVELS);
    const el = h(`<div class="screen menu wave-menu">
      <h2 class="menu-title">MODE VAGUES</h2>
      <p class="menu-sub">Repousse les vagues de fléaux, de démons et de monstres. Un boss attend tous les 5 niveaux. Entre deux vagues, tu récupères ${Math.round(WAVE_HEAL * 100)} % de ta vie.</p>
      <div class="wave-info"></div>
      <div class="levels">${levels.map((n) => `<button class="lvl ${isBossLevel(n) ? 'boss' : ''} ${prof.hasClearedLevel(n) ? 'cleared' : ''}" data-nav data-n="${n}" style="--rc:${regionColors[Math.floor((n - 1) / 5)]}" ${n <= open ? '' : 'disabled'}>
        <small>NIVEAU</small><b>${n}</b></button>`).join('')}</div>
      <div class="menu-list row">
        <button class="btn" data-nav data-act="diff">Difficulté : ${esc(DIFFICULTIES[prof.data.difficulty].label)}</button>
        <button class="btn ${endlessOpen ? '' : 'locked'}" data-nav data-act="endless">Mode Infini${endlessOpen ? '' : ' 🔒'}</button>
        <button class="btn" data-nav data-act="beasts">Bestiaire</button>
        <button class="btn ghost" data-nav data-act="back">Retour</button></div>
    </div>`);
    const info = el.querySelector('.wave-info');
    const showInfo = (n) => {
      if (!n) return;
      const lv = buildLevel(n);
      const foes = [...new Set(lv.waves.flat().map((e) => e.charId))];
      const bossId = lv.boss;
      const cleared = prof.hasClearedLevel(n);
      info.innerHTML = `<div class="wi-txt"><h3>Niveau ${n} — ${esc(lv.region)}</h3>
        <p>${lv.waves.length} vagues${bossId ? ` · boss : <b style="color:${CHAR_BY_ID[bossId].aura}">${esc(CHAR_BY_ID[bossId].name)}</b>` : ''}</p>
        <p>Récompense : ${cleared ? `${Math.round(lv.reward * 0.3)} Ryō (déjà réussi)` : `${lv.reward} Ryō`}</p></div>
        <div class="foes">${foes.map((id) => `<div class="foe ${id === bossId ? 'boss' : ''}">${this.portrait(id)}<span>${esc(CHAR_BY_ID[id].name)}</span></div>`).join('')}</div>`;
    };
    el.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => this.wavePick(Number(b.dataset.n))));
    el.querySelector('[data-act=beasts]').addEventListener('click', () => this.bestiary(() => this.wavesMenu(sel)));
    el.querySelector('[data-act=diff]').addEventListener('click', () => {
      const ids = Object.keys(DIFFICULTIES);
      prof.setDifficulty(ids[(ids.indexOf(prof.data.difficulty) + 1) % ids.length]);
      this.app.audio.play('ui_ok');
      this.wavesMenu(sel);
      this.focus(this.screen.el.querySelector('[data-act=diff]'), false);
    });
    el.querySelector('[data-act=endless]').addEventListener('click', () => {
      if (!endlessOpen) { this.app.audio.play('denied'); this.toast('Le mode Infini s’ouvre quand le niveau 30 est réussi.', 3); return; }
      this.endlessMenu();
    });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu(), onFocus: (f) => showInfo(Number(f.dataset.n) || 0) });
    const start = el.querySelector(`.lvl[data-n="${sel && sel <= open ? sel : open}"]`);
    if (start) this.focus(start, false);
    showInfo(sel && sel <= open ? sel : open);
  }

  /** Choix du combattant pour un niveau (parmi ceux que l'on possède). */
  wavePick(n, charId = null) {
    if (charId) { this.startWaves(n, charId); return; }
    this.charSelect([{ label: `NIVEAU ${n}`, team: 0, ctrl: { type: 'human', player: 0 } }],
      (fighters) => this.startWaves(n, fighters[0].charId), () => this.wavesMenu(n));
  }

  startWaves(n, charId) {
    const app = this.app;
    const lv = buildLevel(n);
    const diff = app.profile.data.difficulty;
    lv.waves = lv.waves.map((w) => w.map((e) => withDifficulty(e, diff)));
    const foe = (e) => ({ charId: e.charId, team: 1, ctrl: { type: 'cpu', level: e.level }, mods: e.mods, boss: !!e.boss, elite: !!e.elite });
    app.startBattle({
      role: 'local',
      arena: lv.arena,
      fighters: [
        { charId, team: 0, ctrl: { type: 'human', player: 0 }, mods: app.profile.modsFor(charId) },
        ...lv.waves[0].map(foe),
      ],
      waves: lv.waves,
      waveLevel: n,
      regionName: lv.region,
      difficultyId: diff,
    });
  }

  // --- Mode Infini ---

  endlessMenu() {
    const prof = this.app.profile;
    const recs = prof.data.endless;
    const el = this.menu('MODE INFINI', [
      { label: 'Commencer', hint: `vagues sans fin — difficulté ${DIFFICULTIES[prof.data.difficulty].label}`, action: () => this.charSelect([{ label: 'MODE INFINI', team: 0, ctrl: { type: 'human', player: 0 } }], (fs) => this.startEndless(fs[0].charId), () => this.endlessMenu()) },
      { label: 'Retour', cls: 'ghost', action: () => this.wavesMenu() },
    ], {
      subtitle: 'Les vagues ne s’arrêtent jamais : un boss toutes les 10 vagues, de plus en plus fort. Jusqu’où iras-tu ?',
      footer: `<div class="records"><h3>Records</h3>${recs.length ? `<ol>${recs.map((r) => `<li>${this.portrait(r.charId, 'mini')}<b>${r.score} vagues</b><span>${esc(CHAR_BY_ID[r.charId] ? CHAR_BY_ID[r.charId].name : '')} · ${esc(DIFFICULTIES[r.difficulty] ? DIFFICULTIES[r.difficulty].label : '')} · ${esc(r.date)}</span></li>`).join('')}</ol>` : '<p>Aucun record pour l’instant.</p>'}</div>`,
    });
    this.show({ el, back: () => this.wavesMenu() });
  }

  // --- Mode Classé ----------------------------------------------------------------------------

  /** Rang en texte court (tuile du menu). */
  rankText(r) {
    const streak = r.streak >= 2 ? ` · 🔥${r.streak}` : '';
    return (r.tier === LEGEND ? `${RANKS[LEGEND].icon} ${r.legendPts} pts` : `${RANKS[r.tier].icon} ${DIVISIONS[r.div]} · ${r.pts} / ${DIV_POINTS}`) + streak;
  }

  /** Emblème du rang (nom et division dans des éléments séparés, pour la traduction). */
  rankBadge(r, big = true) {
    const rank = RANKS[r.tier];
    return `<div class="rk-badge ${big ? 'big' : ''}" style="--rc:${rank.color}"><span class="rk-icon">${rank.icon}</span>
      <span class="rk-name"><b>${esc(rank.name)}</b>${r.tier === LEGEND ? '' : ` <i>${DIVISIONS[r.div]}</i>`}</span></div>`;
  }

  /** Jauge de points (de `from` à la valeur actuelle, animée). */
  rankBar(r, from = null) {
    const pct = r.tier === LEGEND ? 100 : (r.pts / DIV_POINTS) * 100;
    const start = from === null ? pct : from;
    return `<div class="rk-bar ${r.promo ? 'promo' : ''}" style="--rc:${RANKS[r.tier].color}"><i style="width:${start}%" data-to="${pct}"></i></div>
      <div class="rk-pts">${r.tier === LEGEND ? `<b>${r.legendPts}</b> <span>points de Légende</span>` : `<b>${r.pts}</b> / ${DIV_POINTS} <span>Points d’Aura</span>`}</div>`;
  }

  animateBars(el) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll('.rk-bar i[data-to]').forEach((i) => { i.style.width = `${i.dataset.to}%`; });
    }));
  }

  rankedMenu() {
    this.app.setBackdrop('menu');
    this.app.audio.music('menu');
    const prof = this.app.profile;
    const r = prof.data.ranked;
    const opp = opponentFor(r);
    const next = r.tier < LEGEND ? RANKS[r.tier + 1] : null;
    const daily = dailyAvailable(r);
    const total = r.wins + r.losses;
    const el = this.menu('CLASSÉ', [
      { label: r.promo ? 'Combat de promotion' : 'Combattre', hint: r.promo ? (opp.boss ? `boss : ${esc(CHAR_BY_ID[opp.boss].name)}` : 'un adversaire plus coriace') : 'adversaire et arène au hasard', cls: r.promo ? 'gold' : '', action: () => this.charSelect([{ label: 'CLASSÉ', team: 0, ctrl: { type: 'human', player: 0 } }], (fs) => this.startRanked(fs[0].charId), () => this.rankedMenu()) },
      ...this.rankRewardButtons(r),
      { label: 'Statistiques', hint: 'classement estimé, personnages, records, historique', action: () => this.rankedStats() },
      { label: 'Profil', hint: 'niveau, succès, vitrine, carte à partager', action: () => this.profileScreen(() => this.rankedMenu()) },
      { label: 'Retour', cls: 'ghost', action: () => this.mainMenu() },
    ], {
      cls: 'ranked-menu',
      subtitle: 'Gagne des Points d’Aura contre une IA de plus en plus forte. 100 points pour changer de division, un combat de promotion pour changer de rang. Une défaite ne te fait jamais descendre de division.',
      footer: `<div class="rk-info">
        <div class="rk-chips">
          ${r.promo && next ? `<span class="rk-chip promo">⚔ <span>Combat de promotion</span> → ${next.icon} <span>${esc(next.name)}</span></span>` : ''}
          <span class="rk-chip ${daily ? 'daily' : 'off'}">${daily ? `☀ <span>Bonus du jour : points ×2 et +${DAILY_RYO} Ryō</span>` : '☾ <span>Bonus du jour obtenu — reviens demain</span>'}</span>
          ${r.streak >= 2 ? `<span class="rk-chip streak">🔥 <span>Série de ${r.streak} victoires</span></span>` : ''}
        </div>
        <div class="rk-stats"><span><span>Victoires</span> <b>${r.wins}</b></span><span><span>Défaites</span> <b>${r.losses}</b></span><span><span>Taux de victoire</span> <b>${total ? Math.round((r.wins / total) * 100) : 0} %</b></span><span><span>Meilleur rang</span> <b>${esc(stepName(r.best))}</b></span><span><span>Meilleure série</span> <b>${r.bestStreak}</b></span></div>
        ${this.rankRewardsList(r)}
        ${next ? `<div class="rk-next"><span>Rang suivant</span> ${next.icon} <b>${esc(next.name)}</b> <span>+${next.reward} Ryō</span></div>` : '<div class="rk-next"><span>Tu as atteint le rang suprême. Chaque victoire fait grimper ton score.</span></div>'}
      </div>`,
    });
    const head = h(`<div class="rk-head">${this.rankBadge(r)}${this.rankBar(r)}${this.worldRankHtml(r)}</div>`);
    el.insertBefore(head, el.querySelector('.menu-list'));
    this.show({ el, back: () => this.mainMenu() });
  }

  /** Boutons pour équiper un titre et une aura exclusive (s'il y en a de débloqués). */
  rankRewardButtons(r) {
    const prof = this.app.profile;
    const titles = unlockedTitles(r);
    const auras = unlockedAuras(r);
    const out = [];
    if (titles.length) {
      const opts = [0, ...titles];
      const cur = opts.indexOf(titleOf(r) ? r.title : 0);
      out.push({ label: `<span class="opt-line"><span>Titre</span> : <span>${titleOf(r) ? esc(titleOf(r)) : 'aucun'}</span> ▸</span>`, hint: 'affiché au menu, à l’écran VS et en combat', action: () => { r.title = opts[(cur + 1) % opts.length]; prof.save(); this.rankedMenu(); } });
    }
    if (auras.length) {
      const opts = ['', ...auras.map((a) => a.id)];
      const cur = opts.indexOf(auraOf(r) || '');
      const a = RANK_AURAS.find((x) => x.id === auraOf(r));
      out.push({ label: `<span class="opt-line"><span>Aura</span> : <span>${a ? esc(a.name) : 'celle du personnage'}</span> ▸</span>`, hint: 'aura exclusive en combat (tous les modes)', action: () => { r.aura = opts[(cur + 1) % opts.length]; prof.save(); this.rankedMenu(); } });
    }
    return out;
  }

  /** Les récompenses de chaque rang, débloquées ou non. */
  rankRewardsList(r) {
    const have = bestTier(r);
    const items = RANKS.map((rank, t) => {
      if (t === 0) return '';
      const aura = RANK_AURAS.find((a) => a.tier === t);
      const parts = [`<span>+${rank.reward} Ryō</span>`];
      if (RANK_TITLES[t]) parts.push(`<span>« <span>${esc(RANK_TITLES[t])}</span> »</span>`);
      if (aura) parts.push(`<span class="rk-aura" style="--ac:${aura.color}"><span>${esc(aura.name)}</span></span>`);
      return `<li class="${have >= t ? 'got' : 'lock'}"><b>${rank.icon} <span>${esc(rank.name)}</span></b>${parts.join(' ')}${have >= t ? ' ✔' : ' 🔒'}</li>`;
    }).join('');
    return `<ul class="rk-rewards">${items}</ul>`;
  }

  fmtNum(n) { return n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US'); }
  fmtTop(t) { return lang === 'fr' ? formatTop(t) : formatTop(t).replace(',', '.'); }
  fmtPos(n) { return lang === 'fr' ? `≈ ${this.fmtNum(n)}<sup>e</sup>` : `≈ #${this.fmtNum(n)}`; }

  /** Classement mondial estimé (toujours présenté comme une estimation). */
  worldRankHtml(r, passed = 0) {
    const est = estimate(r);
    return `<div class="rk-world" title="Position estimée d’après la répartition habituelle des rangs.">
      <span class="rk-world-l">🌍 <span>Classement mondial</span> <em>(estimé)</em></span>
      <b>Top ${this.fmtTop(est.top)} %</b> <span class="rk-world-pos">${this.fmtPos(est.pos)} / ${this.fmtNum(POPULATION)}</span>
      ${passed > 0 ? `<div class="rk-passed">▲ <span>Tu as dépassé environ ${this.fmtNum(passed)} joueurs !</span></div>` : ''}
    </div>`;
  }

  rankedStats() {
    this.app.setBackdrop('menu');
    const prof = this.app.profile;
    const r = prof.data.ranked;
    const est = estimate(r);
    const total = r.wins + r.losses;
    const pct = (w, l) => (w + l ? Math.round((w / (w + l)) * 100) : 0);
    const chars = Object.entries(r.chars || {}).filter(([id, v]) => CHAR_BY_ID[id] && v.w + v.l > 0)
      .sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l));
    const fav = chars[0];
    const best = chars.filter(([, v]) => v.w + v.l >= 3).sort((a, b) => pct(b[1].w, b[1].l) - pct(a[1].w, a[1].l))[0];
    const m = r.tot.matches || 0;
    const avg = (n) => (m ? Math.round(n / m) : 0);
    const name = (id) => esc(CHAR_BY_ID[id] ? CHAR_BY_ID[id].name : '?');
    const charRows = chars.map(([id, v]) => `<tr><td>${this.portrait(id, 'mini')} ${name(id)}</td><td>${v.w}</td><td>${v.l}</td><td><b>${pct(v.w, v.l)} %</b></td></tr>`).join('');
    const hist = [...r.history].reverse().map((x) => `<li class="${x.r}"><span class="rk-h-res">${x.r === 'win' ? '✔' : x.r === 'loss' ? '✘' : '='}</span>
      <span>${name(x.c)}</span> <em>vs</em> <span>${name(x.o)}</span>
      <b class="${x.delta < 0 ? 'neg' : ''}">${x.delta >= 0 ? '+' : ''}${x.delta}</b><span class="rk-h-rank">${esc(stepName(x.step))}</span><small>${esc(x.d)}</small></li>`).join('');
    const el = this.menu('STATISTIQUES', [{ label: 'Retour', cls: 'ghost', action: () => this.rankedMenu() }], {
      cls: 'ranked-stats',
      footer: `<div class="rk-statgrid">
        <section><h3>Classement mondial <em>(estimé)</em></h3>
          <div class="rk-big">Top ${this.fmtTop(est.top)} %</div>
          <p><span>Meilleur que</span> <b>${this.fmtTop(100 - est.top)} %</b> <span>des joueurs</span> · ${this.fmtPos(est.pos)}</p>
          <p><span>Meilleur classement</span> : <b>Top ${this.fmtTop(r.bestTop)} %</b></p>
          ${this.rankCurve(r.curve)}
          <p class="rk-note">Position estimée d’après la répartition habituelle des rangs (le jeu n’a pas de serveur).</p></section>
        <section><h3>Résumé</h3>
          <ul class="rk-kv">
            <li><span>Combats classés</span><b>${total}</b></li>
            <li><span>Taux de victoire</span><b>${pct(r.wins, r.losses)} %</b></li>
            <li><span>Meilleur rang</span><b>${esc(stepName(r.best))}</b></li>
            <li><span>Meilleure série</span><b>${r.bestStreak}</b></li>
            <li><span>Personnage favori</span><b>${fav ? name(fav[0]) : '—'}</b></li>
            <li><span>Personnage le plus efficace</span><b>${best ? `${name(best[0])} (${pct(best[1].w, best[1].l)} %)` : '—'}</b></li>
            <li><span>Dégâts moyens par combat</span><b>${avg(r.tot.dmg)}</b></li>
            <li><span>Parades parfaites par combat</span><b>${m ? (Math.round((r.tot.parries / m) * 10) / 10).toString().replace('.', ',') : 0}</b></li>
            <li><span>Plus long combo</span><b>${r.rec.combo}</b></li>
            <li><span>Plus de dégâts en un combat</span><b>${r.rec.dmg}</b></li>
          </ul></section>
        <section><h3>Par personnage</h3>${charRows ? `<table class="rk-table"><thead><tr><th></th><th>${lang === 'fr' ? 'V' : 'W'}</th><th>${lang === 'fr' ? 'D' : 'L'}</th><th>%</th></tr></thead><tbody>${charRows}</tbody></table>` : '<p class="rk-note">Aucun combat classé pour l’instant.</p>'}</section>
        <section><h3>Derniers combats</h3>${hist ? `<ol class="rk-hist">${hist}</ol>` : '<p class="rk-note">Aucun combat classé pour l’instant.</p>'}</section>
      </div>`,
    });
    this.show({ el, back: () => this.rankedMenu() });
  }

  /** Courbe du classement estimé (un point par jour joué) ; plus haut = meilleur. */
  rankCurve(curve) {
    if (!curve || curve.length < 2) return '<p class="rk-note">La courbe de progression apparaîtra après deux jours de combats classés.</p>';
    const W = 300, H = 90;
    // Échelle logarithmique : passer de 50 % à 10 % compte autant que de 1 % à 0,2 %
    const y = (top) => { const v = Math.log10(Math.max(0.001, top)); return 6 + ((v + 3) / 5) * (H - 12); };
    const pts = curve.map((c, i) => `${(6 + (i / (curve.length - 1)) * (W - 12)).toFixed(1)},${y(c.top).toFixed(1)}`).join(' ');
    return `<svg class="rk-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" /></svg>
      <div class="rk-curve-l"><span>${esc(curve[0].d)}</span><span>${esc(curve[curve.length - 1].d)}</span></div>`;
  }

  // --- Profil du joueur -------------------------------------------------------------------------

  /** Personnage affiché sur le profil : celui choisi, sinon le plus joué, sinon Kael. */
  avatarOf() {
    const prof = this.app.profile;
    if (prof.data.avatar && CHAR_BY_ID[prof.data.avatar]) return prof.data.avatar;
    const fights = (prof.data.stats && prof.data.stats.charFights) || {};
    const fav = Object.entries(fights).filter(([id]) => CHAR_BY_ID[id]).sort((a, b) => b[1] - a[1])[0];
    return fav ? fav[0] : 'kael';
  }

  fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  }

  profileScreen(onBack = () => this.mainMenu()) {
    this.app.setBackdrop('menu');
    const app = this.app;
    const prof = app.profile;
    const r = prof.data.ranked;
    const st = prof.data.stats || {};
    const lv = levelFromXp(prof.data.xp);
    const name = app.settings.data.game.playerName || 'Joueur';
    const avatar = this.avatarOf();
    const title = titleOf(r);
    const aura = RANK_AURAS.find((a) => a.id === auraOf(r));
    const est = estimate(r);
    const chStates = CHALLENGES.map((c) => ({ c, s: challengeState(prof, c) }));
    const doneN = chStates.filter((x) => x.s.done).length;
    const show = (prof.data.showcase || []).map((id) => chStates.find((x) => x.c[0] === id)).filter((x) => x && x.s.done);
    const modes = st.modes || {};
    const fights = Object.values(modes).reduce((a, b) => a + b, 0);
    const charFights = Object.entries(st.charFights || {}).filter(([id]) => CHAR_BY_ID[id]).sort((a, b) => b[1] - a[1]);
    const storyDone = CHAPTERS.filter((c) => prof.hasCleared(c.id)).length;
    const seen = MONSTERS.filter((m) => (prof.data.seen || []).includes(m.id)).length;
    const owned = prof.ownedIds();
    const costumes = Object.values(prof.data.costumes || {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
    const nm = (id) => esc(CHAR_BY_ID[id] ? CHAR_BY_ID[id].name : '—');
    const kv = (k, v) => `<li><span>${k}</span><b>${v}</b></li>`;
    const el = h(`<div class="screen menu profile-screen">
      <div class="pf-head" style="--ac:${aura ? aura.color : CHAR_BY_ID[avatar].aura}">
        <div class="pf-avatar">${this.portrait(avatar, 'pf-portrait')}</div>
        <div class="pf-id">
          <input class="pf-name" type="text" maxlength="16" value="${esc(name)}" aria-label="Pseudo" data-nav>
          ${title ? `<div class="pf-title"><span>${esc(title)}</span></div>` : ''}
          <div class="pf-level"><b><span>Niveau</span> ${lv.level}</b>${lv.max ? ' <span>(maximum)</span>' : ` <small>${lv.cur} / ${lv.need} XP</small>`}</div>
          <div class="pf-xp"><i style="width:${lv.max ? 100 : Math.round((lv.cur / lv.need) * 100)}%"></i></div>
        </div>
        <div class="pf-rank">${this.rankBadge(r, false)}<div class="pf-world">🌍 Top ${this.fmtTop(est.top)} % <em>(estimé)</em></div></div>
      </div>
      <div class="pf-showcase">${show.length ? show.map(({ c }) => `<div class="pf-trophy">🏆 <b>${esc(c[1])}</b></div>`).join('') : '<div class="pf-trophy empty"><span>Vitrine vide : choisis jusqu’à 3 succès ci-dessous</span></div>'}</div>
      <div class="pf-grid">
        <section><h3>Classé</h3><ul class="rk-kv">
          ${kv('Rang', `${RANKS[r.tier].icon} <span>${esc(rankName(r))}</span>`)}${kv('Meilleur rang', esc(stepName(r.best)))}
          ${kv('Victoires / défaites', `${r.wins} / ${r.losses}`)}${kv('Meilleure série', r.bestStreak)}
          ${kv('Meilleur classement', `Top ${this.fmtTop(r.bestTop)} %`)}${kv('Aura équipée', aura ? `<span class="rk-aura" style="--ac:${aura.color}">${esc(aura.name)}</span>` : '—')}</ul></section>
        <section><h3>Statistiques</h3><ul class="rk-kv">
          ${kv('Temps de jeu', this.fmtTime((prof.data.playTime || 0) + (app.playAcc || 0)))}${kv('Combats joués', fights)}
          ${kv('Victoires (tous modes)', st.wins || 0)}
          ${kv('Classé · Histoire · Vagues · Infini · Libre', `${modes.ranked || 0} · ${modes.story || 0} · ${modes.waves || 0} · ${modes.endless || 0} · ${modes.free || 0}`)}
          ${kv('Personnage favori', charFights[0] ? `${nm(charFights[0][0])} (${charFights[0][1]})` : '—')}
          ${kv('Plus long combo', st.maxCombo || 0)}${kv('Parades parfaites', st.parries || 0)}${kv('Ultimes décisifs', st.ultFinish || 0)}
          ${kv('Boss vaincus', st.bosses || 0)}${kv('Meilleur niveau en Vagues', Math.max(0, prof.levelUnlocked() - 1))}
          ${kv('Record en Infini', prof.data.endless[0] ? prof.data.endless[0].score : 0)}</ul></section>
        <section><h3>Progression</h3><ul class="rk-kv">
          ${kv('Histoire', `${storyDone} / ${CHAPTERS.length}${prof.data.ending ? ` · <span>${prof.data.ending === 'redemption' ? 'La Rédemption' : 'Le Sceau'}</span>` : ''}`)}
          ${kv('Combattants', `${owned.length} / ${CHARACTERS.length}`)}${kv('Bestiaire', `${seen} / ${MONSTERS.length}`)}
          ${kv('Tenues achetées', costumes)}${kv('Titres et auras de rang', `${unlockedTitles(r).length} · ${unlockedAuras(r).length}`)}</ul>
          <div class="pf-roster">${CHARACTERS.map((c) => `<span class="pf-char ${owned.includes(c.id) ? '' : 'lock'}">${this.portrait(c.id, 'mini')}${owned.includes(c.id) && prof.rank(c.id) ? `<small>${prof.rank(c.id)}</small>` : ''}</span>`).join('')}</div></section>
        <section class="pf-ach"><h3><span>Succès</span> <em>${doneN} / ${CHALLENGES.length}</em></h3>
          <p class="rk-note">Touche un succès obtenu pour l’ajouter à ta vitrine (3 au maximum).</p>
          <div class="pf-achlist">${chStates.map(({ c, s }) => `<button class="pf-a ${s.done ? 'done' : ''} ${show.some((x) => x.c[0] === c[0]) ? 'shown' : ''}" ${s.done ? `data-nav data-show="${c[0]}"` : 'disabled'}>
            <b>${s.done ? '🏆' : '🔒'} <span>${esc(c[1])}</span></b><small>${esc(c[2])}</small>${s.done ? '' : `<span class="pf-prog">${s.value} / ${s.goal}</span>`}</button>`).join('')}</div></section>
      </div>
      <div class="menu-list pf-actions">
        <button class="btn" data-nav data-act="avatar"><span class="opt-line"><span>Avatar</span> : <span>${nm(avatar)}</span> ▸</span><small>parmi tes combattants</small></button>
        <button class="btn gold" data-nav data-act="share">Partager ma carte<small>image à télécharger (Discord, réseaux…)</small></button>
        <button class="btn ghost" data-nav data-act="back">Retour</button>
      </div>
    </div>`);
    const input = el.querySelector('.pf-name');
    input.addEventListener('change', () => {
      app.settings.data.game.playerName = input.value.trim().slice(0, 16) || 'Joueur';
      app.settings.save();
    });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    el.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.show;
      let list = (prof.data.showcase || []).filter((x) => x !== id);
      if (list.length === (prof.data.showcase || []).length) list = [...list, id].slice(-3);
      prof.data.showcase = list;
      prof.save();
      this.profileScreen(onBack);
    }));
    el.querySelector('[data-act=avatar]').addEventListener('click', () => {
      const list = owned.length ? owned : ['kael'];
      prof.data.avatar = list[(list.indexOf(avatar) + 1) % list.length];
      prof.save();
      this.profileScreen(onBack);
      this.focus(this.screen.el.querySelector('[data-act=avatar]'), false);
    });
    el.querySelector('[data-act=share]').addEventListener('click', () => this.shareCard());
    el.querySelector('[data-act=back]').addEventListener('click', () => onBack());
    this.show({ el, back: onBack });
  }

  /** Carte de profil en image (1200 × 630), à télécharger et partager. */
  async shareCard() {
    const app = this.app;
    const prof = app.profile;
    const r = prof.data.ranked;
    const lv = levelFromXp(prof.data.xp);
    const avatar = this.avatarOf();
    const def = CHAR_BY_ID[avatar];
    const aura = RANK_AURAS.find((a) => a.id === auraOf(r));
    const col = aura ? aura.color : def.aura;
    const est = estimate(r);
    const W = 1200, H = 630;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#120a2a'); bg.addColorStop(1, '#05060a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(270, 330, 20, 270, 330, 330);
    glow.addColorStop(0, col); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55; g.fillStyle = glow; g.fillRect(0, 0, 640, H); g.globalAlpha = 1;
    // Portrait
    const src = this.portraits[avatar];
    if (src) {
      const img = new Image();
      await new Promise((res) => { img.onload = res; img.onerror = res; img.src = src; });
      g.save(); g.beginPath(); g.arc(270, 330, 190, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 80, 140, 380, 380); g.restore();
    }
    g.lineWidth = 8; g.strokeStyle = col; g.beginPath(); g.arc(270, 330, 194, 0, Math.PI * 2); g.stroke();
    const font = (s, w = 900) => `italic ${w} ${s}px 'Dela Gothic One', 'Arial Black', sans-serif`;
    const text = (t, x, y, f, c, stroke = true) => { g.font = f; if (stroke) { g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(t, x, y); } g.fillStyle = c; g.fillText(t, x, y); };
    text('AURA', 520, 92, font(54), '#ffffff'); text('CLASH', 690, 92, font(54), '#ffd23f');
    text(app.settings.data.game.playerName || tr('Joueur'), 520, 190, font(64), '#ffffff');
    const title = titleOf(r);
    if (title) text(`« ${tr(title)} »`, 520, 240, font(34, 800), '#ffd23f');
    text(`${tr('Niveau')} ${lv.level}`, 520, 300, font(34, 800), '#7fe0ff');
    text(`${RANKS[r.tier].icon} ${tr(RANKS[r.tier].name)}${r.tier === LEGEND ? '' : ` ${DIVISIONS[r.div]}`}`, 520, 370, font(48), RANKS[r.tier].color);
    text(`${tr('Classement mondial')} ${tr('(estimé)')} : Top ${this.fmtTop(est.top)} %`, 520, 420, font(26, 700), '#c8c0e8', false);
    const show = (prof.data.showcase || []).map((id) => CHALLENGES.find((c) => c[0] === id)).filter((c) => c && challengeState(prof, c).done);
    show.forEach((c, i) => text(`🏆 ${tr(c[1])}`, 520, 480 + i * 40, font(26, 800), '#ffffff', false));
    text(`${r.wins} ${tr('Victoires')} · ${tr('Meilleur rang')} : ${tr(stepName(r.best))}`, 520, 600, font(22, 600), '#a8a4c0', false);
    const url = cv.toDataURL('image/png');
    const box = h(`<div class="screen menu share-screen">
      <h2 class="menu-title">MA CARTE</h2>
      <img class="share-img" src="${url}" alt="">
      <p class="rk-note">Si le téléchargement ne démarre pas, fais un clic droit (ou un appui long) sur l’image pour l’enregistrer.</p>
      <div class="menu-list"><a class="btn gold" data-nav href="${url}" download="AuraClash-carte.png">Télécharger l’image</a>
      <button class="btn ghost" data-nav data-act="back">Retour</button></div></div>`);
    box.querySelector('[data-act=back]').addEventListener('click', () => this.profileScreen());
    this.show({ el: box, back: () => this.profileScreen() });
  }

  startRanked(charId) {
    const app = this.app;
    const r = app.profile.data.ranked;
    const opp = opponentFor(r);
    const pool = CHARACTERS.filter((c) => !c.monster && c.id !== charId).map((c) => c.id);
    const foe = opp.boss || pool[Math.floor(Math.random() * pool.length)];
    const arenas = ['cliffs', 'temple', 'neon', 'glacier', 'volcano'];
    app.startBattle({
      role: 'local',
      arena: arenas[Math.floor(Math.random() * arenas.length)],
      roundTime: 99,
      ranked: { promo: r.promo, boss: !!opp.boss },
      fighters: [
        { charId, team: 0, ctrl: { type: 'human', player: 0 } },
        { charId: foe, team: 1, ctrl: { type: 'cpu', level: opp.level }, mods: opp.mods, boss: !!opp.boss },
      ],
    });
  }

  /** Récompenses débloquées en atteignant un rang (affichées après une promotion). */
  newRewardsHtml(tier) {
    const aura = RANK_AURAS.find((a) => a.tier === tier);
    const bits = [];
    if (RANK_TITLES[tier]) bits.push(`<span><span>Nouveau titre</span> : « <span>${esc(RANK_TITLES[tier])}</span> »</span>`);
    if (aura) bits.push(`<span class="rk-aura" style="--ac:${aura.color}"><span>Nouvelle aura</span> : <span>${esc(aura.name)}</span></span>`);
    return bits.length ? `<div class="rk-unlock">${bits.join('')}<small>équipé automatiquement</small></div>` : '';
  }

  rankedEnd(battle, team) {
    const app = this.app;
    const prof = app.profile;
    const charId = battle.cfg.fighters[0].charId;
    if (!battle.rankedRes) {
      const st = prof.data.stats || {};
      const s0 = battle.rankedStart || {};
      const d = (k) => (st[k] || 0) - (s0[k] || 0);
      const result = team < 0 ? 'draw' : team === 0 ? 'win' : 'loss';
      const before = { ...prof.data.ranked };
      const res = applyResult(before, { result, perfect: d('perfects') > 0, ultFinish: d('ultFinish') > 0, parries: d('parries'), maxCombo: battle.rankedCombo || 0 });
      const oppId = battle.cfg.fighters[1] ? battle.cfg.fighters[1].charId : '';
      res.state = recordStats(res.state, { result, charId, oppId, delta: res.delta, dmg: battle.rankedDmg || 0, parries: d('parries'), maxCombo: battle.rankedCombo || 0 });
      const passed = estimate(before).pos - estimate(res.state).pos;
      prof.data.ranked = res.state;
      if (result === 'win') prof.bumpStat('wins');
      prof.earn(res.ryo);
      battle.rankedRes = { res, before, passed };
      if (res.event === 'promoted') app.audio.play('ui_start');
    }
    const { res, before } = battle.rankedRes;
    const r = res.state;
    const sameDiv = before.tier === r.tier && before.div === r.div;
    const from = r.tier === LEGEND ? 100 : sameDiv ? (before.pts / DIV_POINTS) * 100 : 0;
    const big = team < 0 ? 'MATCH NUL' : team === 0 ? 'VICTOIRE' : 'DÉFAITE';
    const banner = {
      promoted: `<div class="rk-banner up">⚡ <span>PROMOTION !</span> ${RANKS[r.tier].icon} <span>${esc(RANKS[r.tier].name)}</span></div>${this.newRewardsHtml(r.tier)}`,
      promoStart: '<div class="rk-banner promo">⚔ <span>COMBAT DE PROMOTION DÉBLOQUÉ !</span></div>',
      promoFailed: '<div class="rk-banner fail"><span>Promotion ratée — retente ta chance !</span></div>',
      divUp: `<div class="rk-banner up">▲ <span>Division supérieure</span> : <span>${esc(RANKS[r.tier].name)}</span> ${DIVISIONS[r.div]}</div>`,
    }[res.event] || '';
    const lines = res.lines.map(([label, n]) => `<li><span>${esc(label)}</span><b class="${n < 0 ? 'neg' : ''}">${n >= 0 ? '+' : ''}${n}</b></li>`).join('');
    const el = this.menu('', [
      { label: r.promo ? 'Combat de promotion' : 'Combat suivant', cls: r.promo ? 'gold' : '', action: () => this.startRanked(charId) },
      { label: 'Changer de combattant', action: () => { app.endBattle(false); this.charSelect([{ label: 'CLASSÉ', team: 0, ctrl: { type: 'human', player: 0 } }], (fs) => this.startRanked(fs[0].charId), () => this.rankedMenu()); } },
      ...(battle.rec && app.lastReplay === battle.rec ? [{ label: 'Revoir le combat', hint: 'replay : ralenti, pause', action: () => app.startReplay(() => this.rankedMenu()) }] : []),
      { label: 'Menu Classé', action: () => { app.endBattle(false); this.rankedMenu(); } },
      { label: 'Menu principal', cls: 'ghost', action: () => app.endBattle() },
    ], { cls: 'results ranked-result' });
    el.prepend(h(`<div class="result-head">
      <div class="result-big ${team === 0 ? 'win' : ''}">${big}</div>
      ${banner}
      <div class="rk-result">${this.rankBadge(r, false)}${this.rankBar(r, from)}</div>
      <div class="rk-delta ${res.delta < 0 ? 'neg' : ''}">${res.delta >= 0 ? '+' : ''}${res.delta} <span>Points d’Aura</span></div>
      ${lines ? `<ul class="rk-lines">${lines}</ul>` : ''}
      ${res.ryo ? `<div class="reward">+${res.ryo} Ryō <small>(total : ${prof.ryo})</small></div>` : ''}
      ${battle.xpGain ? `<div class="xp-gain">+${battle.xpGain} XP</div>` : ''}
      ${this.worldRankHtml(r, battle.rankedRes.passed)}
    </div>`));
    this.show({ el });
    this.animateBars(el);
  }

  startEndless(charId) {
    const app = this.app;
    const diff = app.profile.data.difficulty;
    const first = endlessWave(0).map((e) => withDifficulty(e, diff));
    const foe = (e) => ({ charId: e.charId, team: 1, ctrl: { type: 'cpu', level: e.level }, mods: e.mods, boss: !!e.boss, elite: !!e.elite });
    const arenas = ['cliffs', 'temple', 'neon', 'glacier', 'volcano'];
    app.startBattle({
      role: 'local',
      arena: arenas[Math.floor(Math.random() * arenas.length)],
      fighters: [{ charId, team: 0, ctrl: { type: 'human', player: 0 }, mods: app.profile.modsFor(charId) }, ...first.map(foe)],
      endless: true,
      firstWave: first,
      difficultyId: diff,
    });
  }

  endlessEnd(battle) {
    const app = this.app;
    const prof = app.profile;
    const cleared = battle.match.wave;
    const charId = battle.cfg.fighters[0].charId;
    let reward = 0;
    let rank = 0;
    if (!battle.rewarded) {
      battle.rewarded = true;
      reward = Math.round(endlessReward(cleared) * DIFFICULTIES[battle.cfg.difficultyId || 'normal'].reward);
      prof.earn(reward);
      rank = prof.recordEndless(cleared, charId, battle.cfg.difficultyId || 'normal');
    }
    const el = this.menu('', [
      { label: 'Recommencer', action: () => this.startEndless(charId) },
      { label: `Améliorer ${esc(CHAR_BY_ID[charId].name)}`, action: () => { app.endBattle(false); this.upgrades(charId); } },
      { label: 'Mode Vagues', action: () => { app.endBattle(false); this.wavesMenu(); } },
      { label: 'Menu principal', cls: 'ghost', action: () => app.endBattle() },
    ], { cls: 'results' });
    el.prepend(h(`<div class="result-head"><div class="result-big ${rank === 1 ? 'win' : ''}">${rank === 1 ? 'NOUVEAU RECORD !' : 'FIN DE LA PARTIE'}</div>
      <div class="result-portraits">${this.portrait(charId, 'big')}</div>
      <div class="result-sub">Vagues repoussées : <b>${cleared}</b>${rank > 1 ? ` — ${rank}e meilleur score` : ''}</div>
      ${reward ? `<div class="reward">+${reward} Ryō <small>(total : ${prof.ryo})</small></div>` : ''}</div>`));
    this.show({ el });
  }

  /** Fin d'un niveau du mode Vagues (à la place de l'écran de résultats). */
  wavesEnd(battle, team) {
    const app = this.app;
    const prof = app.profile;
    const n = battle.cfg.waveLevel;
    const lv = buildLevel(n);
    const won = team === 0;
    const cleared = won ? lv.waves.length : battle.match.wave;
    const first = won && !prof.hasClearedLevel(n);
    let reward = 0;
    if (!battle.rewarded) {
      battle.rewarded = true;
      reward = Math.round(levelReward(lv, won, cleared, first) * DIFFICULTIES[battle.cfg.difficultyId || 'normal'].reward);
      prof.earn(reward);
      if (won) { prof.clearLevel(n); prof.bumpStat('wins'); }
    }
    const charId = battle.cfg.fighters[0].charId;
    const def = CHAR_BY_ID[charId];
    const buttons = [];
    if (won && n < WAVE_LEVELS) buttons.push({ label: `Niveau ${n + 1}`, hint: regionOf(n + 1).name, action: () => this.startWaves(n + 1, charId) });
    if (!won) buttons.push({ label: 'Réessayer', action: () => app.restartBattle() });
    buttons.push(
      { label: `Améliorer ${esc(def.name)}`, hint: 'force, vie, vitesse, ki, maîtrise', action: () => { app.endBattle(false); this.upgrades(charId); } },
      { label: 'Choisir un niveau', action: () => { app.endBattle(false); this.wavesMenu(won ? Math.min(WAVE_LEVELS, n + 1) : n); } },
      { label: 'Menu principal', cls: 'ghost', action: () => app.endBattle() },
    );
    const el = this.menu('', buttons, { cls: 'results' });
    const final = won && n === WAVE_LEVELS;
    el.prepend(h(`<div class="result-head">
      <div class="result-big ${won ? 'win' : ''}">${won ? `NIVEAU ${n} RÉUSSI` : 'DÉFAITE'}</div>
      <div class="result-portraits">${this.portrait(charId, 'big')}${lv.boss && won ? this.portrait(lv.boss, 'big') : ''}</div>
      <div class="result-sub">${esc(lv.region)} — vagues repoussées : ${cleared} / ${lv.waves.length}</div>
      ${reward ? `<div class="reward">+${reward} Ryō <small>(total : ${prof.ryo})</small></div>` : ''}
      ${final ? '<div class="the-end">L’ÉCLIPSE EST VAINCUE</div>' : ''}</div>`));
    this.show({ el });
    if (won) this.app.audio.play('roundWin');
  }

  /** Choix d'une bénédiction entre deux vagues (trois cartes). */
  blessingChoice(choices, onPick) {
    const el = h(`<div class="screen blessing-screen">
      <h2 class="menu-title">BÉNÉDICTION</h2>
      <p class="menu-sub">La vague est repoussée. Choisis un pouvoir pour la suite du niveau.</p>
      <div class="bless-cards">${choices.map(([id, name, desc, kanji], i) => `<button class="bless-card" data-nav data-i="${i}" ${i === 0 ? 'data-autofocus' : ''}>
        <span class="bk">${esc(kanji)}</span><b>${esc(name)}</b><small>${esc(desc)}</small></button>`).join('')}</div>
    </div>`);
    el.querySelectorAll('.bless-card').forEach((b) => b.addEventListener('click', () => {
      this.app.audio.play('transform');
      this.show(null);
      onPick(choices[Number(b.dataset.i)][0]);
    }));
    this.show({ el, onNav: (a) => a === 'back' });
    this.app.audio.play('summon');
  }

  bestiary(onBack) {
    const el = h(`<div class="screen menu">
      <h2 class="menu-title">BESTIAIRE</h2>
      <div class="bestiary">${MONSTERS.map((m) => `<div class="beast" style="--c:${TIERS[m.tier].color}">
        ${this.portrait(m.id, 'big')}<b>${esc(m.name)}</b><em>${esc(m.boss ? m.title : TIERS[m.tier].label)}</em>
        <p>${esc(m.blurb)}</p><p>Pouvoir : ${esc(m.moves.special.name)} · Ultime : ${esc(m.moves.ultimate.name)}</p></div>`).join('')}</div>
      <button class="btn" data-nav data-autofocus>Retour</button>
    </div>`);
    el.querySelector('.btn').addEventListener('click', onBack);
    this.show({ el, back: onBack });
  }

  // --- Défis ---------------------------------------------------------------------------------

  challenges() {
    const prof = this.app.profile;
    const el = h(`<div class="screen menu challenges">
      <h2 class="menu-title">DÉFIS</h2>
      <p class="menu-sub">Des objectifs à accomplir dans tous les modes. Réclame tes récompenses ! <span class="wallet inline">${prof.ryo} <small>Ryō</small></span></p>
      <div class="ch-list">${CHALLENGES.map((c) => {
        const s = challengeState(prof, c);
        return `<div class="ch-row ${s.claimed ? 'claimed' : s.done ? 'done' : ''}">
          <div class="ch-txt"><b>${esc(c[1])}</b><small>${esc(c[2])}</small>
            <div class="ch-bar"><i style="width:${Math.round((s.value / s.goal) * 100)}%"></i></div></div>
          <div class="ch-val">${s.value} / ${s.goal}</div>
          ${s.claimed ? '<div class="ch-ok">✔</div>' : `<button class="btn small" data-nav data-claim="${c[0]}" ${s.done ? '' : 'disabled'}>${c[5]} Ryō</button>`}
        </div>`;
      }).join('')}</div>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
    </div>`);
    el.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => {
      const c = CHALLENGES.find((x) => x[0] === b.dataset.claim);
      if (prof.claim(c[0], c[5])) {
        this.app.audio.play('roundWin');
        this.toast(`${c[1]} : +${c[5]} Ryō !`);
        this.challenges();
        const next = this.screen.el.querySelector('[data-claim]:not([disabled])') || this.screen.el.querySelector('[data-act=back]');
        if (next) this.focus(next, false);
      }
    }));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    const first = el.querySelector('[data-claim]:not([disabled])');
    if (first) this.focus(first, false);
  }

  // --- Galerie -------------------------------------------------------------------------------

  gallery(sel = null) {
    const app = this.app;
    const prof = app.profile;
    const seen = new Set(prof.data.seen || []);
    const entries = [
      ...CHARACTERS.map((c) => ({ c, open: true })),
      ...MONSTERS.map((c) => ({ c, open: seen.has(c.id) })),
    ];
    const cur = sel || 'kael';
    const g = app.gallery || (app.gallery = { yaw: 0.4, dist: 3.4, pose: 'idle', h: 1.1 });
    const poses = [['idle', 'Garde'], ['intro', 'Entrée'], ['victory', 'Victoire'], ['aura', 'Aura'], ['ult', 'Ultime']];
    const exprs = [[null, 'Auto'], ['fierce', 'Combatif'], ['angry', 'Colère'], ['shock', 'Stupeur'], ['menace', 'Menace'], ['smile', 'Sourire']];
    const def = CHAR_BY_ID[cur];
    const el = h(`<div class="screen gallery">
      <div class="gal-list">${entries.map(({ c, open }) => `<button class="gal-item ${c.id === cur ? 'sel' : ''} ${open ? '' : 'locked'}" data-nav data-id="${c.id}" style="--c:${c.aura}">
        ${open ? this.portrait(c.id, 'mini') : '<div class="portrait mini fallback">?</div>'}<span>${open ? esc(c.name) : '???'}</span></button>`).join('')}</div>
      <div class="gal-info"><h3 style="color:${def.aura}">${esc(def.name)}</h3><div class="ititle">${esc(def.title)}</div><p>${esc(def.blurb)}</p>
        <p class="gal-ult">Ultime : <b>${esc(def.moves.ultimate.name)}</b></p></div>
      <div class="gal-controls">
        <div class="gal-row">${poses.map(([id, l]) => `<button class="btn small ${g.pose === id ? 'on' : ''}" data-nav data-pose="${id}">${l}</button>`).join('')}</div>
        <div class="gal-row">${exprs.map(([id, l]) => `<button class="btn small ${(g.expr || null) === id ? 'on' : ''}" data-nav data-expr="${id || ''}">${l}</button>`).join('')}</div>
        <div class="gal-row"><button class="btn small" data-nav data-rot="-1">◀</button><button class="btn small" data-nav data-zoom="1">−</button><button class="btn small" data-nav data-zoom="-1">+</button><button class="btn small" data-nav data-rot="1">▶</button>
          <button class="btn small ${g.auto ? 'on' : ''}" data-nav data-auto>Rotation auto</button><button class="btn small ghost" data-nav data-act="back">Retour</button></div>
        <div class="gal-hint">Glisse sur la scène pour tourner autour du personnage, molette pour zoomer.</div>
      </div>
    </div>`);
    app.setBackdrop('gallery', cur);
    el.querySelectorAll('.gal-item').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('locked')) { app.audio.play('denied'); this.toast('Créature pas encore rencontrée (mode Vagues).', 2.5); return; }
      this.gallery(b.dataset.id);
    }));
    const keepFocus = (sel2) => { this.gallery(cur); const f = this.screen.el.querySelector(sel2); if (f) this.focus(f, false); };
    el.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => { g.pose = b.dataset.pose; keepFocus(`[data-pose="${g.pose}"]`); }));
    el.querySelectorAll('[data-expr]').forEach((b) => b.addEventListener('click', () => { g.expr = b.dataset.expr || null; keepFocus(`[data-expr="${b.dataset.expr}"]`); }));
    el.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => { g.yaw += Number(b.dataset.rot) * 0.5; }));
    el.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { g.dist = Math.max(1.4, Math.min(7, g.dist + Number(b.dataset.zoom) * 0.6)); }));
    el.querySelector('[data-auto]').addEventListener('click', () => { g.auto = !g.auto; keepFocus('[data-auto]'); });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    // Glisser pour tourner, molette pour zoomer, gros plan sur le visage en zoomant fort
    let drag = null;
    el.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) drag = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      g.yaw -= (e.clientX - drag.x) * 0.01;
      g.h = Math.max(0.4, Math.min(1.9, g.h + (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('wheel', (e) => { g.dist = Math.max(1.0, Math.min(7, g.dist + Math.sign(e.deltaY) * 0.3)); }, { passive: true });
    this.show({ el, back: () => this.mainMenu() });
    const s2 = el.querySelector('.gal-item.sel');
    if (s2) { this.focus(s2, false); s2.scrollIntoView({ block: 'nearest' }); }
  }

  // --- Améliorations ----------------------------------------------------------------------

  upgrades(sel = null) {
    const prof = this.app.profile;
    const owned = prof.ownedIds();
    const cur = sel && owned.includes(sel) ? sel : owned[0];
    const c = CHAR_BY_ID[cur];
    const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`;
    const rows = UPGRADES.map(([id, label, desc, per, , sign]) => {
      const lv = prof.level(cur, id);
      const max = lv >= UPGRADE_MAX;
      const cost = max ? 0 : UPGRADE_COSTS[lv];
      return `<div class="up-row">
        <div class="up-name"><b>${label}</b><small>${desc}</small></div>
        <div class="up-pips">${Array.from({ length: UPGRADE_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <div class="up-val">${pct(sign * per * lv)}${max ? '' : ` → <em>${pct(sign * per * (lv + 1))}</em>`}</div>
        <button class="btn small up-buy" data-nav data-track="${id}" ${max ? 'disabled' : ''}>${max ? 'Maximum' : `${cost} Ryō`}</button>
      </div>`;
    }).join('');
    const el = h(`<div class="screen select upgrades">
      <div class="select-head"><b>AMÉLIORATIONS</b> — renforce tes combattants <span class="wallet inline">${prof.ryo} <small>Ryō</small></span></div>
      <div class="select-body">
        <div class="char-grid up-grid">
          ${owned.map((id) => `<button class="char-card ${id === cur ? 'sel' : ''}" data-nav data-id="${id}" style="--c:${CHAR_BY_ID[id].aura}">${this.portrait(id)}<span class="cname">${esc(CHAR_BY_ID[id].name)}</span><span class="ctitle">Rang ${prof.rank(id)} / ${UPGRADES.length * UPGRADE_MAX}</span></button>`).join('')}
        </div>
        <div class="char-info up-panel">
          <h3 style="color:${c.aura}">${esc(c.name)}</h3><div class="ititle">${esc(c.title)} — rang ${prof.rank(cur)} / ${UPGRADES.length * UPGRADE_MAX}</div>
          ${rows}
          <h4 class="up-sub">Techniques</h4>
          ${['special', 'ultimate'].map((slot) => {
            const a = c.moves[slot];
            const b = c.moves[`${slot}B`];
            if (!b) return '';
            const has = prof.hasTech(cur, slot);
            const eq = prof.loadoutFor(cur)[slot];
            return `<div class="up-row tech">
              <div class="up-name"><b>${slot === 'special' ? 'Spécial' : 'Ultime'}</b><small>A : ${esc(a.name)} · B : ${esc(b.name)}</small></div>
              ${has
    ? `<div class="up-toggle"><button class="btn small ${eq === 'A' ? 'on' : ''}" data-nav data-equip="${slot}:A">A</button><button class="btn small ${eq === 'B' ? 'on' : ''}" data-nav data-equip="${slot}:B">B</button></div>`
    : `<button class="btn small up-tech" data-nav data-tech="${slot}">Débloquer B — ${TECH_PRICES[slot]} Ryō</button>`}
            </div>`;
          }).join('')}
          <h4 class="up-sub">Tenues</h4>
          <div class="up-row tech"><div class="up-toggle wide">
            <button class="btn small ${!prof.outfitFor(cur) ? 'on' : ''}" data-nav data-outfit="">Classique</button>
            ${COSTUMES.map((k) => prof.hasCostume(cur, k.id)
    ? `<button class="btn small ${prof.outfitFor(cur) === k.id ? 'on' : ''}" data-nav data-outfit="${k.id}">${esc(k.name)}</button>`
    : `<button class="btn small" data-nav data-buyoutfit="${k.id}">${esc(k.name)} — ${COSTUME_PRICE} Ryō</button>`).join('')}
          </div></div>
          <p class="muted">Les améliorations s'appliquent dans tous les modes joués sur cette machine : versus, 2 contre 2, entraînement, histoire. En réseau local, tout le monde se bat à égalité, sans amélioration.</p>
        </div>
      </div>
      <div class="shop-foot"><span>Gagne des Ryō en combattant et dans le mode histoire.</span><button class="btn small" data-nav data-act="back">Retour</button></div>
    </div>`);
    el.querySelectorAll('.char-card').forEach((card) => card.addEventListener('click', () => this.upgrades(card.dataset.id)));
    el.querySelectorAll('.up-buy').forEach((b) => b.addEventListener('click', () => {
      const res = prof.upgrade(cur, b.dataset.track);
      if (res === 'ok') {
        this.app.audio.play('transform');
        this.toast(`${c.name} : ${UPGRADES.find((u) => u[0] === b.dataset.track)[1]} niveau ${prof.level(cur, b.dataset.track)} !`);
        this.upgrades(cur);
        const again = this.screen.el.querySelector(`[data-track="${b.dataset.track}"]`);
        if (again && !again.disabled) this.focus(again, false);
      } else if (res === 'poor') {
        this.app.audio.play('denied');
        this.toast(`Il te manque ${UPGRADE_COSTS[prof.level(cur, b.dataset.track)] - prof.ryo} Ryō.`);
      }
    }));
    const refocus = (q) => { this.upgrades(cur); const f = this.screen.el.querySelector(q); if (f) this.focus(f, false); };
    const result = (res, what, q) => {
      if (res === 'ok') { this.app.audio.play('transform'); this.toast(`${c.name} : ${what} !`); refocus(q); }
      else if (res === 'poor') { this.app.audio.play('denied'); this.toast('Pas assez de Ryō.'); }
    };
    el.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', () => {
      const slot = b.dataset.tech;
      result(prof.buyTech(cur, slot, TECH_PRICES[slot]), `${c.moves[`${slot}B`].name} débloqué et équipé`, `[data-equip="${slot}:B"]`);
    }));
    el.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
      const [slot, v] = b.dataset.equip.split(':');
      prof.setLoadout(cur, slot, v);
      this.app.audio.play('ui_ok');
      refocus(`[data-equip="${b.dataset.equip}"]`);
    }));
    el.querySelectorAll('[data-buyoutfit]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.buyoutfit;
      const res = prof.buyCostume(cur, id, COSTUME_PRICE);
      if (res === 'ok') this.app.backdrop.key = null; // recharge le modèle avec la nouvelle tenue
      result(res, `${COSTUMES.find((k) => k.id === id).name} achetée`, `[data-outfit="${id}"]`);
    }));
    el.querySelectorAll('[data-outfit]').forEach((b) => b.addEventListener('click', () => {
      prof.setOutfit(cur, b.dataset.outfit || null);
      this.app.backdrop.key = null;
      this.app.audio.play('ui_ok');
      refocus(`[data-outfit="${b.dataset.outfit}"]`);
    }));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    const first = el.querySelector('.up-buy:not([disabled])');
    if (first && sel) this.focus(first, false);
    this.app.setBackdrop('select', cur);
  }

  // --- Pause, résultats ------------------------------------------------------------------------

  openPause() {
    const b = this.app.battle;
    if (!b || b.paused) return;
    b.paused = true;
    const training = b.cfg.training;
    const close = () => { b.paused = false; this.show(null); this.app.input.resetEdges(); this.app.input.endTick(); };
    const buttons = [
      { label: 'Reprendre', action: close },
      { label: 'Liste des coups', action: () => this.moveListScreen(() => this.reopenPause()) },
    ];
    if (training) {
      const dummy = b.cfg.fighters.find((f) => f.ctrl.type === 'dummy');
      const modes = Object.keys(DUMMY_MODES);
      buttons.push(
        { label: `Mannequin : ${DUMMY_MODES[dummy.ctrl.mode]}`, action: () => { b.setDummyMode(modes[(modes.indexOf(dummy.ctrl.mode) + 1) % modes.length]); this.reopenPause(); } },
        { label: `Énergie infinie : ${b.match.infiniteEnergy ? 'oui' : 'non'}`, action: () => { b.match.infiniteEnergy = !b.match.infiniteEnergy; this.reopenPause(); } },
        { label: 'Replacer les combattants', action: () => { b.resetPositions(); close(); } },
      );
    } else if (!b.cfg.ranked) {
      buttons.push({ label: 'Recommencer le combat', action: () => this.app.restartBattle() });
    }
    buttons.push(
      { label: 'Options', action: () => this.options(() => this.reopenPause()) },
      // En Classé, quitter un combat compte comme une défaite (sinon on pourrait fuir les défaites)
      b.cfg.ranked
        ? { label: 'Abandonner', hint: 'compte comme une défaite', cls: 'danger', action: () => { b.ended = true; this.rankedEnd(b, 1); } }
        : { label: 'Quitter le combat', cls: 'danger', action: () => this.app.endBattle() },
    );
    const el = this.menu('PAUSE', buttons, { cls: 'pause' });
    this.show({ el, back: close, onNav: (a) => false });
  }

  reopenPause() {
    const b = this.app.battle;
    if (b) b.paused = false;
    this.openPause();
  }

  moveListScreen(onBack) {
    const b = this.app.battle;
    const ids = b ? [...new Set(b.cfg.fighters.map((f) => f.charId))] : CHARACTERS.map((c) => c.id);
    const el = h(`<div class="screen menu movelist">
      <h2 class="menu-title">LISTE DES COUPS</h2>
      <div class="ml-cols">${ids.map((id) => {
        const c = CHAR_BY_ID[id];
        return `<div class="ml-col"><h3 style="color:${c.aura}">${esc(c.name)}</h3><table class="moves">${moveList(c).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>`;
      }).join('')}</div>
      <div class="ml-general">
        <b>Bases :</b> la garde bloque les coups de face (attention à la jauge de garde). L’esquive rend invulnérable un court instant.
        Les attaques légères s’enchaînent, et tout coup normal peut être annulé par un autre en fin d’animation.
        L’énergie monte en frappant, en encaissant ou en chargeant. Ultime : énergie pleine.<br>
        <b>Parade parfaite :</b> lever la garde au tout dernier moment annule le coup, fait vaciller l’attaquant et ouvre une <b>riposte</b> (+50 % de dégâts).
        <b>Poursuite :</b> après un coup qui envoie en l’air, Saut te téléporte à hauteur de l’adversaire ; enchaîne en l’air puis <b>Lourd</b> pour la <b>frappe plongeante</b> qui le rabat au sol.
      </div>
      <button class="btn" data-nav data-autofocus>Retour</button>
    </div>`);
    el.querySelector('.btn').addEventListener('click', onBack);
    this.show({ el, back: onBack });
  }

  showResults(battle, team) {
    if (this.app.battle !== battle) return;
    if (battle.cfg.story) { this.storyFightEnd(battle, team); return; }
    if (battle.cfg.waveLevel) { this.wavesEnd(battle, team); return; }
    if (battle.cfg.endless) { this.endlessEnd(battle); return; }
    if (battle.cfg.ranked) { this.rankedEnd(battle, team); return; }
    const names = battle.winnerNames(team);
    const role = battle.role;
    const winner = team < 0 ? 'MATCH NUL' : `VICTOIRE`;
    const sub = names ? names.join(' & ') : 'Égalité parfaite';
    const winIds = team >= 0 ? battle.cfg.fighters.filter((f) => f.team === team).map((f) => f.charId) : [];
    // Gains en Ryō pour les joueurs de cette machine (une seule fois par match)
    let reward = 0;
    const myTeams = new Set(battle.cfg.fighters.filter((f, i) => (role === 'client' ? i === battle.cfg.localFighter : f.ctrl.type === 'human')).map((f) => f.team));
    if (!battle.rewarded && myTeams.size && !battle.cfg.training) {
      battle.rewarded = true;
      const res = team < 0 ? 'draw' : myTeams.has(team) ? 'win' : 'loss';
      const wins = battle.state.wins || [0, 0];
      const rounds = [...myTeams].reduce((n, t) => Math.max(n, wins[t] || 0), 0);
      reward = REWARDS[res] + rounds * REWARDS.perRound + (role !== 'local' ? REWARDS.lanBonus : 0);
      this.app.profile.earn(reward);
      if (res === 'win') this.app.profile.bumpStat('wins');
    }
    let buttons;
    if (role === 'local') {
      buttons = [
        { label: 'Revanche', action: () => this.app.restartBattle() },
        ...(battle.rec && this.app.lastReplay === battle.rec ? [{ label: 'Revoir le combat', hint: 'replay : ralenti, pause', action: () => this.app.startReplay(() => this.mainMenu()) }] : []),
        { label: 'Changer de combattants', action: () => { this.app.endBattle(false); this.reselect(battle.cfg); } },
        { label: 'Menu principal', action: () => this.app.endBattle() },
      ];
    } else if (role === 'host') {
      buttons = [
        { label: 'Retour au salon', action: () => { this.app.endBattle(false); this.lobbyReturn(); } },
        { label: 'Fermer la partie', cls: 'danger', action: () => { this.app.endBattle(false); this.leaveLan(); } },
      ];
    } else {
      buttons = [{ label: 'Quitter la partie', cls: 'danger', action: () => { this.app.endBattle(false); this.leaveLan(); } }];
    }
    const el = this.menu('', buttons, {
      cls: 'results',
      subtitle: '',
      footer: '',
    });
    el.prepend(h(`<div class="result-head"><div class="result-big ${team < 0 ? '' : 'win'}">${winner}</div>
      <div class="result-portraits">${winIds.map((id) => this.portrait(id, 'big')).join('')}</div>
      <div class="result-sub">${esc(sub)}</div>${reward ? `<div class="reward">+${reward} Ryō <small>(total : ${this.app.profile.ryo})</small></div>` : ''}${battle.xpGain ? `<div class="xp-gain">+${battle.xpGain} XP</div>` : ''}${role === 'client' ? '<div class="result-wait">En attente de l’hôte…</div>' : ''}</div>`));
    this.show({ el });
  }

  reselect(cfg) {
    const slots = cfg.fighters.map((f) => ({
      label: f.ctrl.type === 'human' ? `JOUEUR ${f.ctrl.player + 1}` : f.ctrl.type === 'dummy' ? 'MANNEQUIN' : `IA (équipe ${f.team === 0 ? 'bleue' : 'rouge'})`,
      team: f.team, ctrl: f.ctrl,
    }));
    this.charSelect(slots, (fighters) => this.arenaSelect((arena) => this.app.startBattle({ ...cfg, arena, fighters }), () => this.reselect(cfg)), () => this.mainMenu());
  }

  // --- Options ----------------------------------------------------------------------------

  options(onBack, tab = 'audio', player = 0) {
    const s = this.app.settings;
    const d = s.data;
    const tabs = [['audio', 'Son'], ['gfx', 'Graphismes'], ['controls', 'Commandes'], ['touch', 'Tactile'], ['game', 'Jeu'], ['save', 'Sauvegarde']];
    let body = '';
    if (tab === 'audio') {
      const slider = (key, label) => `<label class="opt" data-nav data-slider><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${d.audio[key]}" data-key="${key}"><em>${Math.round(d.audio[key] * 100)}%</em></label>`;
      body = slider('master', 'Volume général') + slider('music', 'Musique') + slider('sfx', 'Bruitages');
    } else if (tab === 'gfx') {
      const cyc = (key, label, values) => `<button class="opt" data-nav data-cycle data-key="${key}" data-values='${JSON.stringify(values)}'><span>${label}</span><b>${values.find((v) => v[0] === d.gfx[key])?.[1] ?? d.gfx[key]}</b></button>`;
      body = cyc('quality', 'Qualité', [['auto', 'Automatique'], ['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']])
        + cyc('bloom', 'Bloom (halo lumineux)', [[true, 'Activé'], [false, 'Désactivé']])
        + cyc('shadows', 'Ombres', [[true, 'Activées'], [false, 'Désactivées']])
        + cyc('shake', 'Tremblements de caméra', [[true, 'Activés'], [false, 'Désactivés']])
        + cyc('fullscreen', 'Plein écran (F11)', [[false, 'Non'], [true, 'Oui']]);
    } else if (tab === 'touch') {
      const t = d.touch;
      body = `<button class="opt" data-nav data-tcycle="fixedStick" data-values='${JSON.stringify([[false, 'Flottant (là où se pose le pouce)'], [true, 'Fixe (en bas à gauche)']])}'><span>Joystick</span><b>${t.fixedStick ? 'Fixe (en bas à gauche)' : 'Flottant (là où se pose le pouce)'}</b></button>
        <label class="opt" data-nav data-slider><span>Sensibilité du joystick</span><input type="range" min="0.6" max="1.8" step="0.1" value="${t.sens}" data-touch="sens"><em>${Math.round(t.sens * 100)}%</em></label>
        <label class="opt" data-nav data-slider><span>Taille des boutons</span><input type="range" min="0.7" max="1.5" step="0.05" value="${t.scale}" data-touch="scale"><em>${Math.round(t.scale * 100)}%</em></label>
        <button class="btn small" data-nav data-act="layout">Disposer les boutons à l’écran…</button>
        <p class="ctrl-note">Sur iPad et tablette : les commandes apparaissent en combat dès que tu touches l’écran. Glisse les boutons pour les placer à ta main.</p>`;
    } else if (tab === 'save') {
      body = `<p class="ctrl-note">Ta progression (Ryō, personnages, améliorations, histoire, vagues, défis) est enregistrée sur cet appareil. Pour la transférer sur un autre appareil (PC ↔ iPad), copie ce code et colle-le là-bas.</p>
        <textarea class="save-code" readonly>${esc(this.app.profile.exportCode())}</textarea>
        <div class="row-btns"><button class="btn small" data-nav data-act="copy">Copier le code</button><button class="btn small" data-nav data-act="download">Télécharger le fichier</button></div>
        <p class="ctrl-note">Importer une sauvegarde (remplace la progression actuelle) :</p>
        <textarea class="save-import" placeholder="Colle ici le code de sauvegarde"></textarea>
        <div class="row-btns"><button class="btn small" data-nav data-act="import">Importer</button></div>`;
    } else if (tab === 'game') {
      const levels = Object.entries(AI_LEVELS).map(([k, v]) => [k, v.label]);
      body = `<button class="opt" data-nav data-cycle data-gkey="difficulty" data-values='${JSON.stringify(levels)}'><span>Difficulté de l’IA</span><b>${AI_LEVELS[d.game.difficulty].label}</b></button>
        <button class="opt" data-nav data-cycle data-gkey="roundTime" data-values='${JSON.stringify([[60, '60 s'], [99, '99 s'], [150, '150 s']])}'><span>Durée d’une manche</span><b>${d.game.roundTime} s</b></button>
        <label class="opt" data-nav><span>Nom en réseau</span><input type="text" maxlength="16" class="name-input" value="${esc(d.game.playerName)}"></label>`;
    } else {
      const k = d.keys[player];
      const p = d.pad[player];
      body = `<div class="ctrl-head"><button class="btn small ${player === 0 ? 'on' : ''}" data-nav data-player="0">Joueur 1</button><button class="btn small ${player === 1 ? 'on' : ''}" data-nav data-player="1">Joueur 2</button>
        <span class="ctrl-note">Clique sur une case puis appuie sur la touche ou le bouton voulu (Échap / Start pour annuler).</span></div>
        <table class="binds"><tr><th>Action</th><th>Clavier</th><th>Manette</th></tr>
        ${ACTIONS.map(([a, label]) => `<tr><td>${label}</td>
          <td><button class="bind" data-nav data-bind="key" data-action="${a}">${(k[a] || []).map(keyLabel).join(' / ') || '—'}</button></td>
          <td><button class="bind" data-nav data-bind="pad" data-action="${a}">${(p[a] || []).map((b) => PAD_NAMES[b] || `Bouton ${b}`).join(' / ') || '—'}</button></td></tr>`).join('')}
        </table>
        <button class="btn small" data-nav data-reset>Rétablir les commandes par défaut</button>
        <p class="ctrl-note">Avec un seul joueur humain, tous les claviers et toutes les manettes le contrôlent. À deux, le joueur 1 utilise la 1re manette branchée, le joueur 2 la 2e. Manettes Xbox et PlayStation reconnues (stick gauche ou croix pour bouger).</p>`;
    }
    const el = h(`<div class="screen options">
      <h2 class="menu-title">OPTIONS</h2>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${id === tab ? 'on' : ''}" data-nav data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="opt-body">${body}</div>
      <button class="btn back" data-nav>Retour</button>
    </div>`);
    const reopen = (t = tab, pl = player) => this.options(onBack, t, pl);
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => reopen(b.dataset.tab)));
    el.querySelector('.back').addEventListener('click', () => { s.save(); onBack(); });
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      d.audio[inp.dataset.key] = Number(inp.value);
      inp.parentElement.querySelector('em').textContent = `${Math.round(inp.value * 100)}%`;
      this.app.audio.applyVolumes();
      s.save();
    }));
    el.querySelectorAll('[data-cycle]').forEach((b) => {
      const values = JSON.parse(b.dataset.values);
      const sect = b.dataset.key ? 'gfx' : 'game';
      const key = b.dataset.key || b.dataset.gkey;
      const step = (dir) => {
        const i = values.findIndex((v) => v[0] === d[sect][key]);
        const next = values[(i + dir + values.length) % values.length];
        d[sect][key] = next[0];
        b.querySelector('b').textContent = next[1];
        s.save();
        if (sect === 'gfx') this.app.applyGfx();
      };
      b.addEventListener('click', () => step(1));
      b.addEventListener('cycle', (e) => step(e.detail));
    });
    // Tactile
    el.querySelectorAll('[data-touch]').forEach((inp) => inp.addEventListener('input', () => {
      d.touch[inp.dataset.touch] = Number(inp.value);
      inp.parentElement.querySelector('em').textContent = `${Math.round(inp.value * 100)}%`;
      this.app.touch.applyLayout();
      s.save();
    }));
    el.querySelectorAll('[data-tcycle]').forEach((b) => b.addEventListener('click', () => {
      d.touch[b.dataset.tcycle] = !d.touch[b.dataset.tcycle];
      s.save();
      this.app.touch.applyLayout();
      reopen('touch');
    }));
    const lay = el.querySelector('[data-act=layout]');
    if (lay) lay.addEventListener('click', () => { this.show(null); this.app.touch.editLayout(() => reopen('touch')); });
    // Sauvegarde
    const code = el.querySelector('.save-code');
    if (code) {
      el.querySelector('[data-act=copy]').addEventListener('click', async () => {
        code.select();
        try { await navigator.clipboard.writeText(code.value); this.toast('Code copié !'); } catch { document.execCommand('copy'); this.toast('Code sélectionné : copie-le (Ctrl+C / appui long).'); }
      });
      el.querySelector('[data-act=download]').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([code.value], { type: 'text/plain' }));
        a.download = `aura-clash-sauvegarde-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      el.querySelector('[data-act=import]').addEventListener('click', () => {
        const ok = this.app.profile.importCode(el.querySelector('.save-import').value);
        if (ok) { this.app.audio.play('roundWin'); this.toast('Sauvegarde importée !'); reopen('save'); }
        else { this.app.audio.play('denied'); this.toast('Code invalide.'); }
      });
    }
    const nameInput = el.querySelector('.name-input');
    if (nameInput) nameInput.addEventListener('change', () => { d.game.playerName = nameInput.value.trim().slice(0, 16) || 'Joueur'; s.save(); });
    el.querySelectorAll('[data-player]').forEach((b) => b.addEventListener('click', () => reopen('controls', Number(b.dataset.player))));
    el.querySelectorAll('[data-bind]').forEach((b) => b.addEventListener('click', () => {
      const type = b.dataset.bind;
      const action = b.dataset.action;
      b.textContent = type === 'key' ? 'Appuie sur une touche…' : 'Appuie sur un bouton…';
      b.classList.add('waiting');
      this.app.input.captureNext(type, (code) => {
        if (code !== null && code !== undefined) {
          const map = type === 'key' ? d.keys[player] : d.pad[player];
          // Une touche ne sert qu'à une action : on la retire des autres
          for (const a of Object.keys(map)) map[a] = (map[a] || []).filter((c) => c !== code);
          map[action] = [code];
          s.save();
        }
        reopen('controls', player);
        const again = this.screen.el.querySelector(`[data-bind="${type}"][data-action="${action}"]`);
        if (again) this.focus(again, false);
      });
    }));
    const reset = el.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => { s.resetControls(player); reopen('controls', player); this.toast('Commandes par défaut rétablies'); });
    this.show({
      el,
      back: () => { if (this.app.input.capture) return; s.save(); onBack(); },
      onNav: (a) => {
        if (this.app.input.capture) return true;
        if (a === 'tabL' || a === 'tabR') {
          const i = tabs.findIndex((t) => t[0] === tab);
          reopen(tabs[(i + (a === 'tabL' ? -1 : 1) + tabs.length) % tabs.length][0]);
          return true;
        }
        return false;
      },
    });
    const cur = el.querySelector(`[data-tab="${tab}"]`);
    if (cur) this.focus(cur, false);
  }

  // --- Réseau local ------------------------------------------------------------------------

  lanMenu() {
    this.app.setBackdrop('menu');
    const native = window.auraNative;
    const name = this.app.settings.data.game.playerName;
    const el = h(`<div class="screen menu lan">
      <h2 class="menu-title">RÉSEAU LOCAL</h2>
      <label class="opt" data-nav><span>Ton nom</span><input type="text" maxlength="16" class="name-input" value="${esc(name)}"></label>
      <div class="menu-list">
        <button class="btn" data-nav data-act="host" ${native ? '' : 'disabled'}>Créer une partie<small>${native ? 'ton PC devient le serveur' : 'disponible dans la version .exe'}</small></button>
        <button class="btn" data-nav data-act="join">Rejoindre une partie<small>découverte automatique ou adresse IP</small></button>
        <button class="btn ghost" data-nav data-act="back">Retour</button>
      </div>
      <div class="help">${FIREWALL_HELP}</div>
    </div>`);
    const nameInput = el.querySelector('.name-input');
    const saveName = () => { this.app.settings.data.game.playerName = nameInput.value.trim().slice(0, 16) || 'Joueur'; this.app.settings.save(); };
    nameInput.addEventListener('change', saveName);
    el.querySelector('[data-act=host]').addEventListener('click', () => { saveName(); this.hostGame(); });
    el.querySelector('[data-act=join]').addEventListener('click', () => { saveName(); this.joinScreen(); });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.freeMenu());
    this.show({ el, back: () => this.freeMenu() });
  }

  async hostGame() {
    const native = window.auraNative;
    const name = this.app.settings.data.game.playerName;
    let info;
    try {
      info = await native.host({ name: `Partie de ${name}` });
    } catch (err) {
      this.toast(`Impossible de créer la partie : ${err.message || err}`, 5);
      return;
    }
    const net = new NetClient();
    try {
      await net.connect('127.0.0.1', info.port, { name, token: info.token });
    } catch (err) {
      await native.stopHost();
      this.toast(err.message, 5);
      return;
    }
    this.net = net;
    this.hostInfo = info;
    this.lobbyState = {
      players: [{ id: net.id, name, charId: 'kael', team: 0, ready: true, isHost: true }],
      settings: { mode: '1v1', arena: 'cliffs', difficulty: this.app.settings.data.game.difficulty, roundTime: this.app.settings.data.game.roundTime },
    };
    net.on('join', (msg) => {
      const L = this.lobbyState;
      const t0 = L.players.filter((p) => p.team === 0).length;
      const t1 = L.players.filter((p) => p.team === 1).length;
      L.players.push({ id: msg.id, name: msg.name, charId: randomOf(baseChars()), team: t1 <= t0 ? 1 : 0, ready: false, isHost: false });
      this.app.audio.play('ui_ok');
      this.toast(`${msg.name} a rejoint la partie`);
      this.broadcastLobby();
    });
    net.on('leave', (msg) => {
      const L = this.lobbyState;
      const p = L.players.find((x) => x.id === msg.id);
      L.players = L.players.filter((x) => x.id !== msg.id);
      if (p) this.toast(`${p.name} a quitté la partie`);
      if (this.app.battle && this.app.battle.role === 'host') this.app.convertPeerToCpu(msg.id);
      this.broadcastLobby();
    });
    net.on('pick', (msg) => {
      const p = this.lobbyState.players.find((x) => x.id === msg.from);
      if (p && CHAR_BY_ID[msg.charId]) { p.charId = msg.charId; this.broadcastLobby(); }
    });
    net.on('ready', (msg) => {
      const p = this.lobbyState.players.find((x) => x.id === msg.from);
      if (p) { p.ready = !!msg.on; this.broadcastLobby(); }
    });
    net.on('disconnect', () => { this.toast('Serveur arrêté.'); this.leaveLan(); });
    this.broadcastLobby();
  }

  broadcastLobby() {
    if (!this.net || !this.lobbyState) return;
    this.net.send({ type: 'lobby', ...this.lobbyState });
    if (!this.app.battle) this.lobbyScreen();
  }

  lobbyReturn() {
    if (!this.net) { this.mainMenu(); return; }
    if (this.net.isHost) this.broadcastLobby();
    else this.lobbyScreen();
  }

  joinScreen() {
    const native = window.auraNative;
    let servers = [];
    const el = h(`<div class="screen menu lan-join">
      <h2 class="menu-title">REJOINDRE UNE PARTIE</h2>
      <div class="found"><div class="found-title">Parties trouvées sur le réseau :</div><div class="found-list"><div class="muted">${native ? 'Recherche en cours…' : 'Découverte automatique disponible dans la version .exe'}</div></div></div>
      <div class="ip-row"><label class="opt" data-nav><span>Adresse IP de l’hôte</span><input type="text" class="ip-input" placeholder="ex. 192.168.1.20" value="${esc(lastIp())}"></label>
      <button class="btn" data-nav data-act="connect">Se connecter</button></div>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
      <div class="help">${FIREWALL_HELP}</div>
    </div>`);
    const list = el.querySelector('.found-list');
    const ipInput = el.querySelector('.ip-input');
    const connect = (host, port) => this.joinGame(host, port);
    const render = () => {
      if (!servers.length) {
        if (native) list.innerHTML = '<div class="muted">Recherche en cours… (aucune partie pour l’instant)</div>';
        return;
      }
      list.innerHTML = servers.map((s, i) => `<button class="btn server" data-nav data-i="${i}" ${s.inGame || s.players >= s.max ? 'disabled' : ''}>${esc(s.name)}<small>${esc(s.address)}:${s.port} — ${s.players}/${s.max} joueurs${s.inGame ? ' — en combat' : ''}</small></button>`).join('');
      list.querySelectorAll('.server').forEach((b) => {
        b.addEventListener('mouseenter', () => this.focus(b, false));
        b.addEventListener('click', () => { const s = servers[Number(b.dataset.i)]; connect(s.address, s.port); });
      });
    };
    let off = null;
    if (native) {
      native.discover(true);
      off = native.onServers((l) => {
        const before = JSON.stringify(servers);
        servers = l;
        if (JSON.stringify(servers) !== before) render();
      });
    }
    el.querySelector('[data-act=connect]').addEventListener('click', () => {
      const addr = parseAddress(ipInput.value);
      if (!addr) { this.toast('Saisis l’adresse IP affichée chez l’hôte (ex. 192.168.1.20).'); return; }
      try { localStorage.setItem('auraclash.lastIp', ipInput.value.trim()); } catch { /* stockage indisponible */ }
      connect(addr.host, addr.port);
    });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.lanMenu());
    this.show({
      el,
      back: () => this.lanMenu(),
      destroy: () => { if (native) native.discover(false); if (off) off(); },
    });
  }

  async joinGame(host, port) {
    const name = this.app.settings.data.game.playerName;
    this.toast(`Connexion à ${host}…`, 6);
    const net = new NetClient();
    try {
      await net.connect(host, port, { name });
    } catch (err) {
      this.toast(err.message, 6);
      return;
    }
    this.toast(`Connecté à ${net.serverName || host}`);
    this.net = net;
    this.lobbyState = null;
    net.on('lobby', (msg) => {
      this.lobbyState = { players: msg.players, settings: msg.settings };
      if (this.app.battle) {
        // L'hôte est revenu au salon
        this.app.endBattle(false);
      }
      this.lobbyScreen();
    });
    net.on('start', (msg) => {
      const me = msg.cfg.fighters.findIndex((f) => f.owner === net.id);
      this.app.startBattle({
        role: 'client', net, arena: msg.cfg.arena, roundTime: msg.cfg.roundTime, localFighter: me,
        fighters: msg.cfg.fighters.map((f) => ({ charId: f.charId, team: f.team, name: f.name, ctrl: f.owner === net.id ? { type: 'human', player: 0 } : { type: 'remote', peer: f.owner } })),
      });
    });
    net.on('reject', (msg) => { this.toast(msg.reason, 5); });
    net.on('hostLeft', () => { this.toast('L’hôte a fermé la partie.', 5); this.leaveLan(); });
    net.on('disconnect', () => { if (this.net === net) { this.toast('Connexion perdue avec l’hôte.', 5); this.leaveLan(); } });
    this.lobbyScreen();
  }

  lobbyScreen() {
    const net = this.net;
    if (!net) return;
    const L = this.lobbyState;
    const isHost = net.isHost;
    if (!L) {
      const el = this.menu('SALON', [{ label: 'Quitter', cls: 'danger', action: () => this.leaveLan() }], { subtitle: 'En attente des informations de l’hôte…' });
      this.show({ el, back: () => this.leaveLan() });
      return;
    }
    const st = L.settings;
    const me = L.players.find((p) => p.id === net.id);
    const ips = isHost && this.hostInfo ? this.hostInfo.ips : [];
    const prevFocus = this.focused ? (this.focused.dataset.key || null) : null;
    const arenaName = ARENAS.find((a) => a.id === st.arena)?.name || st.arena;
    const el = h(`<div class="screen lobby">
      <h2 class="menu-title">SALON ${isHost ? '— TU ES L’HÔTE' : ''}</h2>
      ${isHost ? `<div class="ipbox">Adresse à donner à tes amis :
        <div class="ips">${ips.length ? ips.map((ip) => `<span class="ip">${esc(ip.address)}</span>`).join('') : '<span class="ip">aucune carte réseau trouvée</span>'}</div>
        <small>Port ${this.hostInfo.port} — ils peuvent aussi cliquer sur « Rejoindre » : la partie apparaît automatiquement.</small></div>` : ''}
      <div class="lobby-body">
        <div class="players">
          ${L.players.map((p) => `<div class="player team${p.team} ${p.id === net.id ? 'me' : ''}">
            ${this.portrait(p.charId, 'mini')}
            <div class="pinfo"><b>${esc(p.name)}${p.isHost ? ' ★' : ''}</b><span>${esc(CHAR_BY_ID[p.charId]?.name || '')}</span></div>
            ${p.id === net.id ? `<button class="btn small" data-nav data-key="char" data-cycle>◀ Personnage ▶</button>` : ''}
            ${isHost ? `<button class="btn small team-btn" data-nav data-key="team${p.id}" data-team="${p.id}">Équipe ${p.team === 0 ? 'bleue' : 'rouge'}</button>` : `<span class="team-label">Équipe ${p.team === 0 ? 'bleue' : 'rouge'}</span>`}
            <span class="ready ${p.ready ? 'on' : ''}">${p.ready ? 'PRÊT' : 'pas prêt'}</span>
            ${isHost && !p.isHost ? `<button class="btn small danger" data-nav data-key="kick${p.id}" data-kick="${p.id}">Exclure</button>` : ''}
          </div>`).join('')}
        </div>
        <div class="lobby-settings">
          ${isHost ? `
            <button class="opt" data-nav data-cycle data-key="mode"><span>Mode</span><b>${st.mode === '2v2' ? '2 contre 2' : '1 contre 1'}</b></button>
            <button class="opt" data-nav data-cycle data-key="arena"><span>Arène</span><b>${esc(arenaName)}</b></button>
            <button class="opt" data-nav data-cycle data-key="difficulty"><span>IA (places libres)</span><b>${AI_LEVELS[st.difficulty]?.label}</b></button>
            <button class="btn start" data-nav data-key="start">LANCER LE COMBAT</button>
            <button class="btn danger" data-nav data-key="close">Fermer la partie</button>`
    : `
            <div class="opt"><span>Mode</span><b>${st.mode === '2v2' ? '2 contre 2' : '1 contre 1'}</b></div>
            <div class="opt"><span>Arène</span><b>${esc(arenaName)}</b></div>
            <button class="btn ${me?.ready ? 'on' : ''}" data-nav data-key="ready">${me?.ready ? 'Je ne suis plus prêt' : 'Je suis prêt !'}</button>
            <button class="btn danger" data-nav data-key="quit">Quitter</button>`}
          <p class="muted">Les places libres sont prises par l’IA. ${isHost ? 'Clique sur « Équipe » pour changer un joueur de camp.' : 'L’hôte lance le combat.'}</p>
        </div>
      </div>
    </div>`);
    const q = (k) => el.querySelector(`[data-key="${k}"]`);
    const charBtn = q('char');
    if (charBtn) {
      const cycle = (dir) => {
        const pool = this.app.profile.ownedIds();
        const i = Math.max(0, pool.indexOf(me.charId));
        const next = pool[(i + dir + pool.length) % pool.length];
        if (isHost) { me.charId = next; this.broadcastLobby(); } else { me.charId = next; net.send({ type: 'pick', charId: next }); this.lobbyScreen(); }
      };
      charBtn.addEventListener('click', () => cycle(1));
      charBtn.addEventListener('cycle', (e) => cycle(e.detail));
    }
    if (isHost) {
      el.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => {
        const p = L.players.find((x) => x.id === Number(b.dataset.team));
        if (p) { p.team = 1 - p.team; this.broadcastLobby(); }
      }));
      el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => net.send({ type: 'kick', id: Number(b.dataset.kick) })));
      const cyc = (key, fn) => { const b = q(key); b.addEventListener('click', () => fn(1)); b.addEventListener('cycle', (e) => fn(e.detail)); };
      cyc('mode', () => { st.mode = st.mode === '2v2' ? '1v1' : '2v2'; this.broadcastLobby(); });
      cyc('arena', (dir) => { const i = ARENAS.findIndex((a) => a.id === st.arena); st.arena = ARENAS[(i + dir + ARENAS.length) % ARENAS.length].id; this.broadcastLobby(); });
      cyc('difficulty', (dir) => { const k = Object.keys(AI_LEVELS); st.difficulty = k[(k.indexOf(st.difficulty) + dir + k.length) % k.length]; this.broadcastLobby(); });
      q('start').addEventListener('click', () => this.startLanMatch());
      q('close').addEventListener('click', () => this.leaveLan());
    } else {
      q('ready').addEventListener('click', () => { net.send({ type: 'ready', on: !me?.ready }); if (me) me.ready = !me.ready; this.lobbyScreen(); });
      q('quit').addEventListener('click', () => this.leaveLan());
    }
    this.show({ el, back: () => this.leaveLan() });
    if (prevFocus && q(prevFocus)) this.focus(q(prevFocus), false);
    this.app.setBackdrop('select', me?.charId);
  }

  startLanMatch() {
    const L = this.lobbyState;
    const st = L.settings;
    const per = st.mode === '2v2' ? 2 : 1;
    for (const team of [0, 1]) {
      if (L.players.filter((p) => p.team === team).length > per) {
        this.toast(`Trop de joueurs dans l’équipe ${team === 0 ? 'bleue' : 'rouge'} pour ce mode.`, 4);
        return;
      }
    }
    const notReady = L.players.filter((p) => !p.ready && !p.isHost);
    if (notReady.length) this.toast(`Lancement sans attendre : ${notReady.map((p) => p.name).join(', ')}`);
    const fighters = [];
    for (const team of [0, 1]) {
      const humans = L.players.filter((p) => p.team === team);
      for (let k = 0; k < per; k++) {
        const p = humans[k];
        if (p) fighters.push({ charId: p.charId, team, owner: p.id, name: p.name });
        else fighters.push({ charId: randomChar(), team, owner: null, name: 'IA' });
      }
    }
    const cfg = { arena: st.arena, roundTime: st.roundTime, fighters };
    this.net.send({ type: 'start', cfg });
    this.app.startBattle({
      role: 'host', net: this.net, arena: st.arena, roundTime: st.roundTime, difficulty: st.difficulty,
      fighters: fighters.map((f) => ({
        charId: f.charId, team: f.team, name: f.name,
        ctrl: f.owner === this.net.id ? { type: 'human', player: 0 } : f.owner ? { type: 'remote', peer: f.owner } : { type: 'cpu', level: st.difficulty },
      })),
    });
  }

  openNetMenu() {
    const b = this.app.battle;
    if (!b || this.screen) return;
    const close = () => { this.show(null); };
    const el = this.menu('MENU', [
      { label: 'Reprendre', action: close },
      { label: 'Liste des coups', action: () => this.moveListScreen(() => { this.show(null); this.openNetMenu(); }) },
      { label: b.role === 'host' ? 'Arrêter le combat (retour au salon)' : 'Quitter la partie', cls: 'danger', action: () => {
        this.app.endBattle(false);
        if (b.role === 'host') this.lobbyReturn(); else this.leaveLan();
      } },
    ], { subtitle: 'Le combat continue en réseau pendant ce menu.', cls: 'pause' });
    this.show({ el, back: close });
  }

  async leaveLan() {
    const net = this.net;
    this.net = null;
    this.lobbyState = null;
    if (this.app.battle) this.app.endBattle(false);
    if (net) net.close();
    if (window.auraNative && net && net.isHost) await window.auraNative.stopHost();
    this.lanMenu();
  }
}
