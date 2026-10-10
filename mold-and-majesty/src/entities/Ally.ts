import type { AllySpeciesId, Personality, TradeResource } from '../data/types';

export type AllyState = 'active' | 'dormant' | 'leaving' | 'gone' | 'burnt';

/** Un allié de la forêt : arbre, colonie de fourmis, ver ou scarabée. Données pures. */
export interface Ally {
  readonly id: number;
  readonly species: AllySpeciesId;
  x: number;
  y: number;
  /** Destination actuelle. */
  tx: number;
  ty: number;
  /** Confiance envers le réseau (0..1). Jamais affichée : elle se lit dans le comportement. */
  trust: number;
  readonly personality: Personality;
  state: AllyState;
  /** Nœud avec lequel l'allié commerce en ce moment. */
  contact: number | null;
  /** Ticks avant qu'une nouvelle trahison soit possible (ou, arbre brûlé, avant repousse). */
  cooldown: number;
  /** Ticks de bouderie après une trahison : l'allié prend sans rien donner. */
  sulk: number;
  /** Tick et ressource du dernier don, pour les animations d'échange. */
  lastTrade: number;
  lastGift: TradeResource | null;
  lastBetrayal: number;
  /** Arbre : points de ses racines (zone de contact) et hauteur du tronc. */
  roots: { x: number; y: number }[];
  height: number;
  /** Échelle de l'allié : l'Arbre-Mère vaut plusieurs arbres (échanges multipliés). */
  size: number;
}

/** Humeur lisible, dérivée de la confiance : c'est elle que les animations traduisent. */
export type Mood = 'devoted' | 'friendly' | 'wary' | 'hostile';

export function moodOf(ally: Ally): Mood {
  if (ally.trust >= 0.75) return 'devoted';
  if (ally.trust >= 0.45) return 'friendly';
  if (ally.trust >= 0.25) return 'wary';
  return 'hostile';
}
