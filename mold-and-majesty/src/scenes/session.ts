import { gameData } from '../data';
import type { ForestDef } from '../data/types';
import { generateForest } from '../systems/ForestGenerator';
import { PROFILE_KEY, PROFILE_VERSION, type Profile, newProfile, normalizeProfile } from '../systems/Profile';
import { type KeyValueStorage, SaveSystem, memoryStorage } from '../systems/SaveSystem';
import type { WorldSnapshot } from '../systems/World';

/** localStorage si disponible, sinon un stockage en mémoire (navigation privée stricte). */
function safeStorage(): KeyValueStorage {
  try {
    const probe = '__mm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

const store = new SaveSystem<Profile>(safeStorage(), PROFILE_KEY, PROFILE_VERSION);
let current: Profile | null = null;

/** Profil du joueur (chargé une fois, créé au besoin). */
export function profile(): Profile {
  if (!current) {
    const loaded = store.load();
    current = loaded ? normalizeProfile(loaded, gameData) : newProfile(gameData);
  }
  return current;
}

export function saveProfile(): void {
  store.save(profile());
}

export function resetProfile(): void {
  current = newProfile(gameData);
  saveProfile();
}

/** Ce que la scène de jeu reçoit pour démarrer. */
export interface GameStart {
  mode: 'campaign' | 'endless';
  forest: ForestDef;
  /** Partie sauvegardée à reprendre. */
  snapshot?: WorldSnapshot;
}

/** Forêt de la profondeur suivante du mode infini. */
export function nextEndlessForest(): ForestDef {
  const p = profile();
  return generateForest(p.endless.seed, p.endless.depth + 1, gameData);
}
