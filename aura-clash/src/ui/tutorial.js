// Tutoriel interactif : un entraînement guidé, étape par étape. Chaque étape est validée par ce que
// le joueur fait vraiment en jeu (événements de la simulation), pas par un bouton « suivant ».
import { keyLabel } from '../core/input.js';
import { MAX_ENERGY } from '../game/constants.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const TUTORIAL_REWARD = 300;

/**
 * Étapes. `dummy` : comportement du mannequin ; `setup(match, me)` : préparation ;
 * `check(ctx)` : true quand l'étape est réussie. ctx = { me, match, ev (événements du tick), st (mémoire de l'étape) }.
 */
const STEPS = [
  {
    title: 'Se déplacer', text: (k) => `Déplace-toi avec ${k('up')} ${k('left')} ${k('down')} ${k('right')} (ou le joystick).`,
    check: ({ me, st }) => {
      if (st.x === undefined) { st.x = me.x; st.z = me.z; st.d = 0; }
      st.d += Math.hypot(me.x - st.x, me.z - st.z);
      st.x = me.x; st.z = me.z;
      return st.d > 5;
    },
  },
  { title: 'Sauter', text: (k) => `Saute avec ${k('jump')}.`, check: ({ me }) => me.y > 1 },
  {
    title: 'Enchaînement léger', text: (k) => `Approche-toi du mannequin et frappe ${k('light')} plusieurs fois : réussis un combo de 3 coups.`,
    check: ({ ev, me }) => ev.some((e) => e.type === 'hit' && e.att === me.id && !e.blocked && e.combo >= 3),
  },
  {
    title: 'Attaque lourde', text: (k) => `Frappe avec l'attaque lourde ${k('heavy')}. Plus lente, plus puissante.`,
    check: ({ ev, me, match }) => ev.some((e) => e.type === 'hit' && e.att === me.id && !e.blocked && match.fighters[e.att].moveId === 'heavy'),
  },
  {
    title: 'Attaque à distance', text: (k) => `Recule et tire avec ${k('ranged')}.`,
    check: ({ me, st }) => { if (me.state === 'move' && me.moveId === 'ranged') st.ok = true; return st.ok; },
  },
  {
    title: 'Garde', dummy: 'attack', text: (k) => `Le mannequin attaque ! Maintiens ${k('guard')} face à lui pour bloquer un coup.`,
    check: ({ ev, me }) => ev.some((e) => e.type === 'hit' && e.tgt === me.id && e.blocked),
  },
  {
    title: 'Parade parfaite', dummy: 'attack', text: (k) => `Appuie sur ${k('guard')} au tout dernier moment, juste avant l'impact : parade parfaite ! Puis frappe pour une riposte.`,
    check: ({ ev, me }) => ev.some((e) => e.type === 'parry' && e.id === me.id),
  },
  {
    title: 'Esquive', text: (k) => `Esquive avec ${k('dodge')} (avec une direction pour un pas de côté).`,
    check: ({ me }) => me.state === 'dodge',
  },
  {
    title: 'Charger l’énergie', text: (k) => `Maintiens ${k('charge')} pour charger ton énergie jusqu'à 60.`,
    setup: (m, me) => { me.energy = 0; },
    check: ({ me }) => me.energy >= 60,
  },
  {
    title: 'Spécial', text: (k) => `Utilise ton coup spécial avec ${k('special')} (il coûte de l'énergie).`,
    setup: (m, me) => { me.energy = Math.max(me.energy, 60); },
    check: ({ ev, me }) => ev.some((e) => e.type === 'special' && e.id === me.id),
  },
  {
    title: 'Poursuite aérienne', text: (k) => `Envoie le mannequin en l'air avec ${k('heavy')}, puis appuie aussitôt sur ${k('jump')} pour le rejoindre.`,
    note: 'Certains coups lourds n’envoient pas en l’air : finis alors ton enchaînement léger par un coup lourd, ou utilise un lanceur.',
    check: ({ ev, me }) => ev.some((e) => e.type === 'pursuit' && e.id === me.id),
  },
  {
    title: 'Frappe plongeante', text: (k) => `En l'air, appuie sur ${k('heavy')} pour rabattre l'adversaire au sol.`,
    check: ({ ev, me, match }) => ev.some((e) => e.type === 'hit' && e.att === me.id && match.fighters[me.id].moveId === 'airslam'),
  },
  {
    title: 'Ultime', text: (k) => `Énergie pleine : déclenche ton ultime avec ${k('ultimate')} !`,
    setup: (m, me) => { me.energy = MAX_ENERGY; me.cd.ultimate = 0; },
    check: ({ ev, me }) => ev.some((e) => e.type === 'cine' && e.id === me.id),
  },
];

export class Tutorial {
  constructor(app, charId) {
    this.app = app;
    this.charId = charId;
    this.i = 0;
    this.st = {};
    this.doneT = 0;
  }

  start() {
    const app = this.app;
    app.tutorial = this;
    app.startBattle({
      role: 'local', arena: 'temple', training: true, tutorial: true,
      fighters: [
        { charId: this.charId, team: 0, ctrl: { type: 'human', player: 0 } },
        { charId: 'kage', team: 1, ctrl: { type: 'dummy', mode: 'stand' }, name: 'MANNEQUIN' },
      ],
    });
    this.el = document.createElement('div');
    this.el.className = 'tuto-panel';
    document.getElementById('ui').appendChild(this.el);
    this.enter(0);
  }

  key(action) {
    const app = this.app;
    if (app.input.lastDevice === 'touch') {
      const names = { light: 'Léger', heavy: 'Lourd', ranged: 'Distance', special: 'Spécial', ultimate: 'Ultime', guard: 'Garde', dodge: 'Esquive', charge: 'Charge', jump: 'Saut', up: '', down: '', left: '', right: '' };
      return names[action] ? `<kbd>${names[action]}</kbd>` : '';
    }
    const code = (app.settings.data.keys[0][action] || [])[0];
    return `<kbd>${esc(keyLabel(code))}</kbd>`;
  }

  enter(i) {
    this.i = i;
    this.st = {};
    const b = this.app.battle;
    if (!b) return;
    if (i >= STEPS.length) { this.finish(); return; }
    const step = STEPS[i];
    b.setDummyMode(step.dummy || 'stand');
    const me = b.match.fighters[0];
    if (step.setup) step.setup(b.match, me);
    this.render(false);
  }

  render(done) {
    const step = STEPS[this.i];
    const k = (a) => this.key(a);
    this.el.className = `tuto-panel ${done ? 'done' : ''}`;
    this.el.innerHTML = `<div class="tuto-step">TUTORIEL — ÉTAPE ${this.i + 1} / ${STEPS.length}</div>
      <div class="tuto-title">${done ? '✔ ' : ''}${esc(step.title)}</div>
      <div class="tuto-text">${step.text(k)}</div>
      ${step.note ? `<div class="tuto-note">${esc(step.note)}</div>` : ''}
      <div class="tuto-bar">${STEPS.map((_, j) => `<i class="${j < this.i || (done && j === this.i) ? 'ok' : j === this.i ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="tuto-hint">Échap : options et sortie du tutoriel</div>`;
  }

  /** Appelé par le combat à chaque image, avec les événements de la simulation. */
  update(dt, events, match) {
    if (this.finished || this.i >= STEPS.length) return;
    if (this.doneT > 0) {
      this.doneT -= dt;
      if (this.doneT <= 0) this.enter(this.i + 1);
      return;
    }
    const me = match.fighters[0];
    if (STEPS[this.i].check({ me, match, ev: events, st: this.st })) {
      this.doneT = 1.1;
      this.render(true);
      this.app.audio.play('roundWin');
    }
  }

  finish() {
    this.finished = true;
    const app = this.app;
    const prof = app.profile;
    const first = !prof.data.tutorialDone;
    if (first) { prof.data.tutorialDone = true; prof.earn(TUTORIAL_REWARD); }
    this.el.className = 'tuto-panel done';
    this.el.innerHTML = `<div class="tuto-title">TUTORIEL TERMINÉ !</div>
      <div class="tuto-text">Tu maîtrises les bases.${first ? ` <b>+${TUTORIAL_REWARD} Ryō</b>` : ''}</div>`;
    app.audio.play('transform');
    setTimeout(() => {
      if (app.tutorial !== this) return;
      app.endBattle();
    }, 2600);
  }

  dispose() {
    if (this.el) this.el.remove();
    if (this.app.tutorial === this) this.app.tutorial = null;
  }
}
