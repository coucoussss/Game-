// Profil du joueur : porte-monnaie en Ryō (la monnaie du jeu), personnages débloqués,
// améliorations, progression du mode histoire et du mode Vagues.
// Sauvegardé dans le navigateur ou la fenêtre du jeu (localStorage), sur cette machine.
import { CHAR_BY_ID, CHARACTERS } from '../game/characters.js';

const KEY = 'auraclash.profile.v1';
export const START_RYO = 500;

/** Gains de fin de match, selon le résultat. */
export const REWARDS = { win: 300, draw: 180, loss: 120, lanBonus: 50, perRound: 40 };

/**
 * Améliorations : 5 voies par personnage, 5 niveaux chacune.
 * [identifiant, nom, description, effet par niveau, clé du multiplicateur, signe]
 */
export const UPGRADES = [
  ['force', 'Force', 'Dégâts de toutes les attaques', 0.06, 'dmg', 1],
  ['endurance', 'Endurance', 'Points de vie', 0.07, 'hp', 1],
  ['vitesse', 'Vitesse', 'Déplacement, esquive et élans', 0.04, 'speed', 1],
  ['ki', 'Ki', 'Énergie gagnée (frapper, encaisser, charger)', 0.12, 'energy', 1],
  ['maitrise', 'Maîtrise', 'Temps de recharge des attaques', 0.07, 'cd', -1],
];
export const UPGRADE_MAX = 5;
export const UPGRADE_COSTS = [200, 350, 550, 800, 1100];

export class Profile {
  constructor() {
    this.data = { ryo: START_RYO, owned: [], upgrades: {}, story: [], waves: [], difficulty: 'normal', endless: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Number.isFinite(saved.ryo) && Array.isArray(saved.owned)) {
        this.data = {
          ryo: Math.max(0, Math.floor(saved.ryo)),
          owned: saved.owned.filter((id) => CHAR_BY_ID[id]),
          upgrades: saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : {},
          story: Array.isArray(saved.story) ? saved.story.filter((x) => typeof x === 'string') : [],
          waves: Array.isArray(saved.waves) ? saved.waves.filter((x) => Number.isInteger(x) && x >= 1) : [],
          difficulty: ['facile', 'normal', 'cauchemar'].includes(saved.difficulty) ? saved.difficulty : 'normal',
          tutorialDone: !!saved.tutorialDone,
          tech: saved.tech && typeof saved.tech === 'object' ? saved.tech : {},
          loadout: saved.loadout && typeof saved.loadout === 'object' ? saved.loadout : {},
          costumes: saved.costumes && typeof saved.costumes === 'object' ? saved.costumes : {},
          outfit: saved.outfit && typeof saved.outfit === 'object' ? saved.outfit : {},
          stats: saved.stats && typeof saved.stats === 'object' ? saved.stats : {},
          claimed: Array.isArray(saved.claimed) ? saved.claimed : [],
          seen: Array.isArray(saved.seen) ? saved.seen.filter((x) => typeof x === 'string') : [],
          endless: Array.isArray(saved.endless) ? saved.endless.filter((r) => r && Number.isFinite(r.score)).slice(0, 5) : [],
        };
      }
    } catch { /* stockage indisponible : profil de départ */ }
  }

  /** Niveau d'une voie d'amélioration (0 à 5). */
  level(charId, track) {
    const v = this.data.upgrades[charId] && this.data.upgrades[charId][track];
    return Number.isInteger(v) ? Math.max(0, Math.min(UPGRADE_MAX, v)) : 0;
  }

  /** Achète le niveau suivant. Renvoie 'ok', 'max', 'poor' ou 'locked'. */
  upgrade(charId, track) {
    if (!this.owns(charId)) return 'locked';
    const lv = this.level(charId, track);
    if (lv >= UPGRADE_MAX) return 'max';
    const cost = UPGRADE_COSTS[lv];
    if (this.data.ryo < cost) return 'poor';
    this.data.ryo -= cost;
    this.data.upgrades[charId] = { ...(this.data.upgrades[charId] || {}), [track]: lv + 1 };
    this.save();
    return 'ok';
  }

  /** Multiplicateurs de combat d'un personnage selon ses améliorations. */
  modsFor(charId) {
    const m = { dmg: 1, hp: 1, speed: 1, energy: 1, cd: 1 };
    for (const [id, , , per, key, sign] of UPGRADES) m[key] *= 1 + sign * per * this.level(charId, id);
    return m;
  }

  /** Total des niveaux d'un personnage (affiché comme « rang »). */
  rank(charId) {
    return UPGRADES.reduce((n, u) => n + this.level(charId, u[0]), 0);
  }

  clearChapter(id) {
    if (!this.data.story.includes(id)) this.data.story.push(id);
    this.save();
  }

  hasCleared(id) {
    return this.data.story.includes(id);
  }

  // --- Mode Vagues : niveaux réussis ---

  hasClearedLevel(n) {
    return this.data.waves.includes(n);
  }

  clearLevel(n) {
    if (!this.data.waves.includes(n)) this.data.waves.push(n);
    this.save();
  }

  /** Niveau le plus haut accessible : le suivant du plus haut réussi. */
  levelUnlocked() {
    return this.data.waves.reduce((m, n) => Math.max(m, n), 0) + 1;
  }

  // --- Techniques alternatives et tenues ---

  hasTech(charId, slot) {
    return !!(this.data.tech && this.data.tech[charId] && this.data.tech[charId].includes(slot));
  }

  /** Achète une technique ('special' ou 'ultimate'). Renvoie 'ok', 'owned', 'poor' ou 'locked'. */
  buyTech(charId, slot, price) {
    if (!this.owns(charId)) return 'locked';
    if (this.hasTech(charId, slot)) return 'owned';
    if (this.data.ryo < price) return 'poor';
    this.data.ryo -= price;
    this.data.tech = this.data.tech || {};
    this.data.tech[charId] = [...(this.data.tech[charId] || []), slot];
    this.setLoadout(charId, slot, 'B');
    return 'ok';
  }

  loadoutFor(charId) {
    const l = (this.data.loadout && this.data.loadout[charId]) || {};
    return { special: this.hasTech(charId, 'special') && l.special === 'B' ? 'B' : 'A', ultimate: this.hasTech(charId, 'ultimate') && l.ultimate === 'B' ? 'B' : 'A' };
  }

  setLoadout(charId, slot, v) {
    this.data.loadout = this.data.loadout || {};
    this.data.loadout[charId] = { ...(this.data.loadout[charId] || {}), [slot]: v };
    this.save();
  }

  hasCostume(charId, id) {
    return !!(this.data.costumes && this.data.costumes[charId] && this.data.costumes[charId].includes(id));
  }

  buyCostume(charId, id, price) {
    if (!this.owns(charId)) return 'locked';
    if (this.hasCostume(charId, id)) return 'owned';
    if (this.data.ryo < price) return 'poor';
    this.data.ryo -= price;
    this.data.costumes = this.data.costumes || {};
    this.data.costumes[charId] = [...(this.data.costumes[charId] || []), id];
    this.setOutfit(charId, id);
    return 'ok';
  }

  outfitFor(charId) {
    const o = this.data.outfit && this.data.outfit[charId];
    return o && this.hasCostume(charId, o) ? o : null;
  }

  setOutfit(charId, id) {
    this.data.outfit = this.data.outfit || {};
    this.data.outfit[charId] = id;
    this.save();
  }

  bumpStat(k, n = 1) {
    this.data.stats = this.data.stats || {};
    this.data.stats[k] = (this.data.stats[k] || 0) + n;
    this.save();
  }

  claim(id, reward) {
    this.data.claimed = this.data.claimed || [];
    if (this.data.claimed.includes(id)) return false;
    this.data.claimed.push(id);
    this.earn(reward);
    return true;
  }

  /** Créatures rencontrées (pour la galerie). */
  markSeen(id) {
    if (!this.data.seen) this.data.seen = [];
    if (!this.data.seen.includes(id)) { this.data.seen.push(id); this.save(); }
  }

  setDifficulty(id) {
    this.data.difficulty = id;
    this.save();
  }

  /** Mode Infini : enregistre un score ; renvoie son rang (1 = record) ou 0 s'il n'entre pas au tableau. */
  recordEndless(score, charId, difficulty) {
    const list = this.data.endless;
    list.push({ score, charId, difficulty, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => b.score - a.score);
    this.data.endless = list.slice(0, 5);
    this.save();
    const i = this.data.endless.findIndex((r) => r.score === score && r.charId === charId);
    return i + 1;
  }

  /** Débloque gratuitement un personnage (récompense du mode histoire). */
  grant(id) {
    if (!this.owns(id)) { this.data.owned.push(id); this.save(); return true; }
    return false;
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
