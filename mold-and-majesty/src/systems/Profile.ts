import type { GameData } from '../data';
import type { WorldSnapshot } from './World';

/** Réglages du joueur (étape 9). */
export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  /** Moins de particules, pas de secousses ni de clignotements. */
  reducedMotion: boolean;
  /** Contrastes renforcés (filaments, alliés, menaces). */
  highContrast: boolean;
  /** Fenêtres du rythme élargies. */
  rhythmAssist: boolean;
  /** Afficher les aides du tutoriel. */
  tutorial: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  reducedMotion: false,
  highContrast: false,
  rhythmAssist: false,
  tutorial: true,
};

/** Progression du joueur, conservée d'une partie à l'autre. */
export interface Profile {
  unlocked: string[];
  completed: string[];
  /** Meilleure portée de sporée obtenue dans chaque forêt. */
  bestReach: Record<string, number>;
  /** Banque de mémoire (dépensée dans l'arbre de compétences). */
  memory: number;
  skills: string[];
  /** Souvenirs déjà vus. */
  seenMemories: string[];
  endless: { seed: number; depth: number; best: number };
  /** Partie en cours, reprise depuis l'écran de sélection. */
  run: { mode: 'campaign' | 'endless'; snapshot: WorldSnapshot } | null;
  settings: Settings;
  /** Le tutoriel a été mené à son terme. */
  tutorialDone: boolean;
}

export const PROFILE_KEY = 'mold-and-majesty/profile';
export const PROFILE_VERSION = 1;

/** Ordre de la campagne : celui de forests.json. */
export function campaignOrder(data: GameData): string[] {
  return [...data.forests.keys()];
}

export function newProfile(data: GameData, seed = Date.now() % 2 ** 31): Profile {
  return {
    unlocked: [campaignOrder(data)[0]!],
    completed: [],
    bestReach: {},
    memory: 0,
    skills: [],
    seenMemories: [],
    endless: { seed, depth: 0, best: 0 },
    run: null,
    settings: { ...DEFAULT_SETTINGS },
    tutorialDone: false,
  };
}

/** Complète un profil chargé avec les champs ajoutés depuis (réglages, etc.). */
export function normalizeProfile(profile: Profile, data: GameData): Profile {
  const fresh = newProfile(data, profile.endless?.seed);
  return { ...fresh, ...profile, settings: { ...DEFAULT_SETTINGS, ...profile.settings } };
}

/**
 * Enregistre une sporée réussie dans une forêt de la campagne : meilleure portée et,
 * si l'objectif est atteint, forêt conquise et suivante débloquée.
 * Retourne l'identifiant de la forêt nouvellement débloquée, s'il y en a une.
 */
export function recordReach(profile: Profile, data: GameData, forestId: string, reach: number): { conquered: boolean; unlocked: string | null } {
  profile.bestReach[forestId] = Math.max(profile.bestReach[forestId] ?? 0, reach);
  const forest = data.forests.get(forestId);
  if (!forest || reach < forest.goal.reach) return { conquered: false, unlocked: null };
  if (!profile.completed.includes(forestId)) profile.completed.push(forestId);
  const order = campaignOrder(data);
  const next = order[order.indexOf(forestId) + 1];
  if (next && !profile.unlocked.includes(next)) {
    profile.unlocked.push(next);
    return { conquered: true, unlocked: next };
  }
  return { conquered: true, unlocked: null };
}
