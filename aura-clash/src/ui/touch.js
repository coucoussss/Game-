// Commandes tactiles (iPad, tablettes, écrans tactiles) : un joystick virtuel à gauche, qui
// apparaît là où le pouce se pose, et des boutons d'action à droite. Elles s'affichent pendant les
// combats dès qu'on touche l'écran, et s'effacent si l'on utilise un clavier ou une manette.
import { BTN } from '../game/constants.js';

const BUTTONS = [
  // [bit, libellé, classe de position, maintien]
  [BTN.LIGHT, 'Léger', 'b-light', false],
  [BTN.HEAVY, 'Lourd', 'b-heavy', false],
  [BTN.RANGED, 'Tir', 'b-ranged', false],
  [BTN.JUMP, 'Saut', 'b-jump', false],
  [BTN.DODGE, 'Esquive', 'b-dodge', false],
  [BTN.GUARD, 'Garde', 'b-guard', true],
  [BTN.SPECIAL, 'Spécial', 'b-special', false],
  [BTN.ULT, 'Ultime', 'b-ult', false],
  [BTN.CHARGE, 'Charge', 'b-charge', true],
];

export class TouchControls {
  constructor(root, input, settings) {
    this.input = input;
    this.settings = settings;
    this.active = false;
    this.inBattle = false;
    this.el = document.createElement('div');
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="pad">${BUTTONS.map(([bit, label, cls]) => `<button class="tbtn ${cls}" data-bit="${bit}">${label}</button>`).join('')}</div>
      <button class="tpause" aria-label="Pause">≡</button>`;
    root.appendChild(this.el);
    this.zone = this.el.querySelector('.stick-zone');
    this.base = this.el.querySelector('.stick-base');
    this.knob = this.el.querySelector('.stick-knob');
    this.stickId = null;
    this.origin = { x: 0, y: 0 };
    this.held = 0;
    this.buttonPointers = new Map(); // pointerId -> bit

    // Le premier contact tactile active les commandes ; un clavier ou une manette les masque.
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.setActive(true); }, true);
    window.addEventListener('keydown', () => this.setActive(false));

    this.zone.addEventListener('pointerdown', (e) => this.stickStart(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    this.zone.addEventListener('pointerup', (e) => this.stickEnd(e));
    this.zone.addEventListener('pointercancel', (e) => this.stickEnd(e));

    this.el.querySelectorAll('.tbtn').forEach((b) => {
      const bit = Number(b.dataset.bit);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.buttonPointers.set(e.pointerId, bit);
        this.input.touchPress(bit);
        b.classList.add('down');
        this.sync();
      });
      const up = (e) => {
        if (!this.buttonPointers.has(e.pointerId)) return;
        this.buttonPointers.delete(e.pointerId);
        b.classList.remove('down');
        this.sync();
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
    this.el.querySelector('.tpause').addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.touchPause = true; });
    // Pas de menu contextuel ni de loupe lors d'un appui long
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.applyLayout();
  }

  /** Applique la taille et la disposition enregistrées (positions en % de l'écran). */
  applyLayout() {
    const t = this.settings ? this.settings.data.touch : { scale: 1, layout: {} };
    this.el.style.setProperty('--tscale', t.scale);
    this.el.querySelectorAll('.tbtn').forEach((b) => {
      const cls = [...b.classList].find((c) => c.startsWith('b-'));
      const pos = t.layout[cls];
      if (pos) {
        b.classList.add('placed');
        b.style.left = `${pos[0]}vw`;
        b.style.top = `${pos[1]}vh`;
      } else {
        b.classList.remove('placed');
        b.style.left = '';
        b.style.top = '';
      }
    });
    this.base.classList.toggle('fixed', !!t.fixedStick);
    if (t.fixedStick) { this.base.style.left = ''; this.base.style.top = ''; }
  }

  /**
   * Mode édition : les boutons s'affichent hors combat et se déplacent au doigt (ou à la souris).
   * `onDone` est appelé quand on quitte le mode.
   */
  editLayout(onDone) {
    const t = this.settings.data.touch;
    this.editing = true;
    this.el.classList.remove('hidden');
    this.el.classList.add('editing');
    const bar = document.createElement('div');
    bar.className = 'touch-edit-bar';
    bar.innerHTML = `<span>Fais glisser les boutons où tu veux.</span>
      <button class="btn small" data-act="smaller">Plus petits</button><button class="btn small" data-act="bigger">Plus grands</button>
      <button class="btn small" data-act="reset">Disposition d'origine</button><button class="btn small" data-act="done">Terminé</button>`;
    this.el.appendChild(bar);
    const drag = new Map();
    const down = (e) => {
      const b = e.target.closest('.tbtn');
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      b.setPointerCapture(e.pointerId);
      const r = b.getBoundingClientRect();
      drag.set(e.pointerId, { b, dx: e.clientX - r.left, dy: e.clientY - r.top });
    };
    const move = (e) => {
      const d = drag.get(e.pointerId);
      if (!d) return;
      const cls = [...d.b.classList].find((c) => c.startsWith('b-'));
      const x = ((e.clientX - d.dx) / window.innerWidth) * 100;
      const y = ((e.clientY - d.dy) / window.innerHeight) * 100;
      t.layout[cls] = [Math.max(0, Math.min(95, x)), Math.max(0, Math.min(92, y))];
      this.applyLayout();
    };
    const up = (e) => drag.delete(e.pointerId);
    this.el.addEventListener('pointerdown', down, true);
    this.el.addEventListener('pointermove', move);
    this.el.addEventListener('pointerup', up);
    bar.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'smaller') t.scale = Math.max(0.7, Math.round((t.scale - 0.1) * 10) / 10);
      if (act === 'bigger') t.scale = Math.min(1.5, Math.round((t.scale + 0.1) * 10) / 10);
      if (act === 'reset') { t.layout = {}; t.scale = 1; }
      this.applyLayout();
      this.settings.save();
      if (act === 'done') {
        this.editing = false;
        this.el.removeEventListener('pointerdown', down, true);
        this.el.removeEventListener('pointermove', move);
        this.el.removeEventListener('pointerup', up);
        bar.remove();
        this.el.classList.remove('editing');
        this.update();
        if (onDone) onDone();
      }
    });
  }

  /** Affiche la recharge des attaques sur les boutons (voile qui descend). */
  setCooldowns(f) {
    if (!this.active || !f || !f.cd) return;
    if (!this.cdButtons) {
      const q = (c) => this.el.querySelector(`.${c}`);
      this.cdButtons = { light: q('b-light'), heavy: q('b-heavy'), ranged: q('b-ranged'), special: q('b-special'), ultimate: q('b-ult') };
    }
    for (const [slot, el] of Object.entries(this.cdButtons)) {
      const cd = f.cd[slot] || 0;
      el.style.setProperty('--cd', cd > 0 ? Math.min(1, cd / (f.cdMax[slot] || 1)).toFixed(3) : '0');
      el.classList.toggle('cooling', cd > 0);
    }
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.update();
  }

  /** Les commandes ne s'affichent qu'en combat. */
  setBattle(on) {
    this.inBattle = on;
    if (!on) this.reset();
    this.update();
  }

  update() {
    if (this.editing) return;
    const on = this.active && this.inBattle;
    this.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch-on', on);
  }

  reset() {
    this.buttonPointers.clear();
    this.stickId = null;
    this.input.touch.x = 0;
    this.input.touch.y = 0;
    this.sync();
    this.base.classList.remove('on');
    this.el.querySelectorAll('.tbtn.down').forEach((b) => b.classList.remove('down'));
  }

  sync() {
    let held = 0;
    for (const bit of this.buttonPointers.values()) held |= bit;
    this.input.touch.held = held;
  }

  stickStart(e) {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.zone.setPointerCapture(e.pointerId);
    this.stickId = e.pointerId;
    if (this.settings && this.settings.data.touch.fixedStick) {
      // Joystick fixe : le centre reste au même endroit, quel que soit le point de contact
      const r = this.base.getBoundingClientRect();
      this.origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
    }
    this.base.classList.add('on');
    this.stickMove(e);
  }

  stickMove(e) {
    if (e.pointerId !== this.stickId) return;
    const sens = this.settings ? this.settings.data.touch.sens : 1;
    const R = (Math.min(window.innerWidth, window.innerHeight) * 0.09) / sens; // sensibilité : course plus courte
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = d < R * 0.18 ? 0 : 1; // petite zone morte
    this.input.touch.x = (dx / R) * k;
    this.input.touch.y = (-dy / R) * k;
  }

  stickEnd(e) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.input.touch.x = 0;
    this.input.touch.y = 0;
    this.knob.style.transform = '';
    if (!(this.settings && this.settings.data.touch.fixedStick)) this.base.classList.remove('on');
  }
}
