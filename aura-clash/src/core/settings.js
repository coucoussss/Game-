// Réglages du joueur, sauvegardés dans le localStorage de la fenêtre du jeu.
// Les touches sont identifiées par leur code physique (KeyboardEvent.code) : un clavier
// AZERTY ou QWERTY place donc les commandes aux mêmes endroits.

const KEY = 'auraclash.settings.v1';

export const ACTIONS = [
  ['up', 'Haut (profondeur)'],
  ['down', 'Bas (profondeur)'],
  ['left', 'Gauche'],
  ['right', 'Droite'],
  ['jump', 'Saut'],
  ['light', 'Attaque légère'],
  ['heavy', 'Attaque lourde'],
  ['ranged', 'Attaque à distance'],
  ['special', 'Spécial'],
  ['ultimate', 'Ultime'],
  ['guard', 'Garde'],
  ['dodge', 'Esquive'],
  ['charge', 'Charger l’énergie'],
  ['pause', 'Pause'],
];

export const DEFAULT_KEYS = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], light: ['KeyJ'], heavy: ['KeyK'], ranged: ['KeyL'],
    special: ['KeyI'], ultimate: ['KeyO'], guard: ['KeyU'], dodge: ['ShiftLeft'], charge: ['KeyH'],
    pause: ['Escape'],
  },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    jump: ['Numpad0'], light: ['Numpad1'], heavy: ['Numpad2'], ranged: ['Numpad3'],
    special: ['Numpad5'], ultimate: ['Numpad6'], guard: ['Numpad4'], dodge: ['NumpadDecimal'], charge: ['NumpadAdd'],
    pause: ['NumpadEnter'],
  },
];

// Boutons de manette (disposition « standard » du Gamepad API : Xbox / PlayStation)
//  0 A/Croix  1 B/Rond  2 X/Carré  3 Y/Triangle  4 LB/L1  5 RB/R1  6 LT/L2  7 RT/R2
//  8 Back/Share  9 Start/Options  10 L3  11 R3  12-15 croix directionnelle
export const DEFAULT_PAD = {
  up: [12], down: [13], left: [14], right: [15],
  jump: [0], light: [2], heavy: [3], ranged: [1],
  special: [5], ultimate: [7], guard: [6], dodge: [4], charge: [10, 11],
  pause: [9],
};

export const PAD_NAMES = {
  0: 'A / ✕', 1: 'B / ◯', 2: 'X / ▢', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1', 6: 'LT / L2', 7: 'RT / R2',
  8: 'Back / Share', 9: 'Start / Options', 10: 'L3', 11: 'R3', 12: 'Croix ↑', 13: 'Croix ↓', 14: 'Croix ←', 15: 'Croix →', 16: 'Guide',
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function defaults() {
  return {
    audio: { master: 0.8, music: 0.55, sfx: 0.85 },
    gfx: { quality: 'auto', bloom: true, shadows: true, shake: true, fullscreen: false },
    game: { difficulty: 'normal', roundTime: 99, playerName: 'Joueur' },
    keys: clone(DEFAULT_KEYS),
    pad: [clone(DEFAULT_PAD), clone(DEFAULT_PAD)],
    // Tactile : taille des boutons, joystick fixe ou flottant, sensibilité, disposition personnalisée
    touch: { scale: 1, fixedStick: false, sens: 1, layout: {} },
  };
}

export class Settings {
  constructor() {
    this.fresh = true;
    this.data = defaults();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.fresh = !raw; // premier lancement : aucun réglage enregistré
      if (!raw) return;
      const saved = JSON.parse(raw);
      const d = defaults();
      // Fusion prudente : une clé absente ou d'un mauvais type garde sa valeur par défaut
      for (const section of ['audio', 'gfx', 'game', 'touch']) {
        for (const k of Object.keys(d[section])) {
          if (saved[section] && typeof saved[section][k] === typeof d[section][k]) d[section][k] = saved[section][k];
        }
      }
      for (let p = 0; p < 2; p++) {
        for (const [a] of ACTIONS) {
          if (Array.isArray(saved.keys?.[p]?.[a])) d.keys[p][a] = saved.keys[p][a].filter((x) => typeof x === 'string');
          if (Array.isArray(saved.pad?.[p]?.[a])) d.pad[p][a] = saved.pad[p][a].filter((x) => Number.isInteger(x));
        }
      }
      if (saved.touch && saved.touch.layout && typeof saved.touch.layout === 'object') d.touch.layout = saved.touch.layout;
      this.data = d;
    } catch {
      this.data = defaults();
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* stockage indisponible */ }
  }

  resetControls(player) {
    this.data.keys[player] = clone(DEFAULT_KEYS[player]);
    this.data.pad[player] = clone(DEFAULT_PAD);
    this.save();
  }
}
