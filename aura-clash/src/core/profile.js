// Profil du joueur : porte-monnaie en Ryō (la monnaie du jeu) et personnages débloqués.
// Sauvegardé dans le navigateur ou la fenêtre du jeu (localStorage), sur cette machine.
import { CHAR_BY_ID, CHARACTERS } from '../game/characters.js';

const KEY = 'auraclash.profile.v1';
export const START_RYO = 500;

/** Gains de fin de match, selon le résultat. */
export const REWARDS = { win: 300, draw: 180, loss: 120, lanBonus: 50, perRound: 40 };

export class Profile {
  constructor() {
    this.data = { ryo: START_RYO, owned: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Number.isFinite(saved.ryo) && Array.isArray(saved.owned)) {
        this.data = { ryo: Math.max(0, Math.floor(saved.ryo)), owned: saved.owned.filter((id) => CHAR_BY_ID[id]) };
      }
    } catch { /* stockage indisponible : profil de départ */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignoré */ }
  }

  get ryo() { return this.data.ryo; }

  /** Les personnages de base sont gratuits ; les autres s'achètent. */
  owns(id) {
    const c = CHAR_BY_ID[id];
    return !!c && (!c.price || this.data.owned.includes(id));
  }

  ownedIds() {
    return CHARACTERS.filter((c) => this.owns(c.id)).map((c) => c.id);
  }

  /** Achète un personnage. Renvoie 'ok', 'owned' ou 'poor'. */
  buy(id) {
    const c = CHAR_BY_ID[id];
    if (!c || this.owns(id)) return 'owned';
    if (this.data.ryo < c.price) return 'poor';
    this.data.ryo -= c.price;
    this.data.owned.push(id);
    this.save();
    return 'ok';
  }

  earn(n) {
    this.data.ryo += Math.max(0, Math.floor(n));
    this.save();
  }
}
