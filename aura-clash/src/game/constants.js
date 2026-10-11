// Constantes de la simulation. La simulation tourne à pas fixe (60 ticks par seconde),
// indépendamment de la fréquence d'affichage.

export const TICK = 1 / 60;

/** Boutons d'action, en masque de bits (sérialisable tel quel sur le réseau). */
export const BTN = {
  JUMP: 1,
  LIGHT: 2,
  HEAVY: 4,
  RANGED: 8,
  SPECIAL: 16,
  ULT: 32,
  GUARD: 64,
  DODGE: 128,
  CHARGE: 256,
};

export const MAX_ENERGY = 100;
export const GRAVITY = 32;
export const JUMP_VELOCITY = 12;
export const INPUT_BUFFER = 0.16; // une touche pressée reste « en attente » ce temps-là
export const ROUNDS_TO_WIN = 2; // deux manches gagnantes (best of 3)
export const FIGHTER_RADIUS = 0.42;
export const FIGHTER_HEIGHT = 1.8;

/** Entrée vide (personnage figé pendant les annonces, les cinématiques…). */
export const NO_INPUT = Object.freeze({ mx: 0, mz: 0, held: 0, pressed: 0 });

/** Valeurs par défaut des types de coups. */
export const HIT_TYPES = {
  light: { stun: 0.34, kb: 2.4, up: 0, hitstop: 0.05, shake: 0.08 },
  heavy: { stun: 0.52, kb: 7, up: 0, hitstop: 0.08, shake: 0.18 },
  launch: { stun: 0.8, kb: 2.5, up: 11, hitstop: 0.1, shake: 0.25 },
  kd: { stun: 0.9, kb: 13, up: 5.5, kd: true, hitstop: 0.12, shake: 0.35 },
};
