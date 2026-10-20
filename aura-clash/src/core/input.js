// Entrées : clavier et manettes (Gamepad API, Xbox et PlayStation), touches configurables.
import { BTN } from '../game/constants.js';
import { DEFAULT_PAD } from './settings.js';

const ACTION_BITS = {
  jump: BTN.JUMP, light: BTN.LIGHT, heavy: BTN.HEAVY, ranged: BTN.RANGED, special: BTN.SPECIAL,
  ultimate: BTN.ULT, guard: BTN.GUARD, dodge: BTN.DODGE, charge: BTN.CHARGE,
};
const DEADZONE = 0.3;

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.tapped = new Set(); // touches enfoncées depuis le dernier tick (pour ne rater aucun appui bref)
    this.menuQueue = [];
    this.pads = [];
    this.prevPadButtons = new Map();
    this.padRepeat = new Map();
    this.prevHeld = [0, 0, 0, 0];
    this.prevPause = [false, false];
    this.capture = null;
    this.lastDevice = 'keyboard';
    // Commandes tactiles (renseignées par ui/touch.js)
    this.touch = { x: 0, y: 0, held: 0 };
    this.touchTapped = 0;
    this.touchPause = false;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('gamepadconnected', (e) => {
      this.onPadChange?.(`Manette connectée : ${e.gamepad.id.split('(')[0].trim()}`);
    });
    window.addEventListener('gamepaddisconnected', () => this.onPadChange?.('Manette déconnectée'));
  }

  onKey(e, isDown) {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (isDown && this.capture && this.capture.type === 'key') {
      e.preventDefault();
      const cb = this.capture.cb;
      this.capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (typing) {
      if (isDown && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        this.menuQueue.push(e.code === 'Escape' ? 'back' : 'ok');
      }
      return;
    }
    if (isDown) {
      this.lastDevice = 'keyboard';
      if (!e.repeat) { this.down.add(e.code); this.tapped.add(e.code); }
      const nav = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back',
        KeyQ: 'tabL', KeyE: 'tabR', PageUp: 'tabL', PageDown: 'tabR',
      }[e.code];
      if (nav) this.menuQueue.push(nav);
      // Empêche le défilement de la page et les raccourcis du navigateur
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    } else {
      this.down.delete(e.code);
    }
  }

  /** À appeler une fois par image : lit l'état des manettes. */
  poll(dt) {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pads = [];
    for (const gp of raw) if (gp && gp.connected) this.pads.push(gp);

    if (this.capture && this.capture.type === 'pad') {
      for (const gp of this.pads) {
        const prev = this.prevPadButtons.get(gp.index) || [];
        for (let b = 0; b < gp.buttons.length; b++) {
          if (gp.buttons[b].pressed && !prev[b]) {
            const cb = this.capture.cb;
            this.capture = null;
            cb(b === 9 ? null : b);
            break;
          }
        }
      }
    }

    // Navigation des menus à la manette (fronts montants + répétition)
    for (const gp of this.pads) {
      const prev = this.prevPadButtons.get(gp.index) || [];
      const now = gp.buttons.map((b) => b.pressed);
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const dirs = {
        up: now[12] || ay < -0.6, down: now[13] || ay > 0.6, left: now[14] || ax < -0.6, right: now[15] || ax > 0.6,
      };
      for (const [d, on] of Object.entries(dirs)) {
        const key = `${gp.index}:${d}`;
        const r = this.padRepeat.get(key);
        if (on) {
          if (r == null) { this.menuQueue.push(d); this.padRepeat.set(key, 0.4); this.lastDevice = 'pad'; }
          else if (r - dt <= 0) { this.menuQueue.push(d); this.padRepeat.set(key, 0.12); }
          else this.padRepeat.set(key, r - dt);
        } else this.padRepeat.delete(key);
      }
      if (!this.capture) {
        if (now[0] && !prev[0]) { this.menuQueue.push('ok'); this.lastDevice = 'pad'; }
        if (now[1] && !prev[1]) this.menuQueue.push('back');
        if (now[4] && !prev[4]) this.menuQueue.push('tabL');
        if (now[5] && !prev[5]) this.menuQueue.push('tabR');
      }
      this.prevPadButtons.set(gp.index, now);
    }
  }

  /** Actions de menu accumulées depuis le dernier appel. */
  menuActions() {
    const q = this.menuQueue;
    this.menuQueue = [];
    return q;
  }

  /** Attend la prochaine touche (type 'key') ou le prochain bouton (type 'pad'). */
  captureNext(type, cb) {
    this.capture = { type, cb };
  }

  cancelCapture() {
    this.capture = null;
  }

  /**
   * Entrée d'un joueur pour ce tick.
   * @param player 0 ou 1 (profil de touches et manette correspondante)
   * @param solo   un seul joueur humain : tous les claviers et toutes les manettes le contrôlent
   * @returns { x, y, held, pause } (x : droite de l'écran, y : vers le fond de l'écran)
   */
  sample(player, solo = false) {
    const s = this.settings.data;
    const profiles = solo ? [0, 1] : [player];
    let x = 0; let y = 0; let held = 0; let pause = false;
    for (const p of profiles) {
      const k = s.keys[p];
      const on = (a) => (k[a] || []).some((c) => this.down.has(c) || this.tapped.has(c));
      if (on('left')) x -= 1;
      if (on('right')) x += 1;
      if (on('up')) y += 1;
      if (on('down')) y -= 1;
      for (const [a, bit] of Object.entries(ACTION_BITS)) if (on(a)) held |= bit;
      if ((k.pause || []).some((c) => this.tapped.has(c))) pause = true;
    }
    if (solo || player === 0) {
      x += this.touch.x;
      y += this.touch.y;
      held |= this.touch.held | this.touchTapped;
      if (this.touchPause) { pause = true; this.touchPause = false; }
    }
    const pads = solo ? this.pads : this.pads[player] ? [this.pads[player]] : [];
    for (const gp of pads) {
      const map = s.pad[solo ? 0 : player] || DEFAULT_PAD;
      const btn = (a) => (map[a] || []).some((b) => gp.buttons[b] && (gp.buttons[b].pressed || gp.buttons[b].value > 0.5));
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > DEADZONE) { x += ax; y -= ay; }
      if (btn('left')) x -= 1;
      if (btn('right')) x += 1;
      if (btn('up')) y += 1;
      if (btn('down')) y -= 1;
      for (const [a, bit] of Object.entries(ACTION_BITS)) if (btn(a)) held |= bit;
      const prev = this.prevPause[player] || false;
      const pz = btn('pause');
      if (pz && !prev) pause = true;
      this.prevPause[player] = pz;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, held, pause };
  }

  /** Fin de tick : les appuis brefs ont été pris en compte. */
  /** Appui sur un bouton tactile (compté même s'il est relâché avant le tick suivant). */
  touchPress(bit) {
    this.touchTapped |= bit;
    this.lastDevice = 'touch';
  }

  endTick() {
    this.touchTapped = 0;
    this.tapped.clear();
  }

  /** Calcule le masque des boutons nouvellement pressés pour un emplacement donné. */
  edges(slot, held) {
    const pressed = held & ~this.prevHeld[slot];
    this.prevHeld[slot] = held;
    return pressed;
  }

  resetEdges() {
    this.prevHeld = [0, 0, 0, 0];
  }

  padCount() {
    return this.pads.length;
  }
}

/** Nom lisible d'une touche (en tenant compte de la disposition AZERTY quand c'est possible). */
let layoutMap = null;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((m) => { layoutMap = m; }).catch(() => {});
}
export function keyLabel(code) {
  if (!code) return '—';
  if (layoutMap && layoutMap.get(code)) return layoutMap.get(code).toUpperCase();
  const names = {
    Space: 'Espace', ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D',
    AltLeft: 'Alt', Enter: 'Entrée', Escape: 'Échap', Tab: 'Tab', Backspace: 'Retour',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', NumpadEnter: 'Pavé Entrée',
    NumpadAdd: 'Pavé +', NumpadSubtract: 'Pavé −', NumpadDecimal: 'Pavé .', NumpadMultiply: 'Pavé ×', NumpadDivide: 'Pavé /',
  };
  if (names[code]) return names[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);
  return code;
}
