/** Espèce de champignon que le réseau peut faire pousser (bâtiment du royaume). */
export interface SpeciesDef {
  id: string;
  name: string;
  description: string;
  /** Coût de construction en nutriments. */
  cost: number;
  /** Production de nutriments par tick. */
  yield: number;
  /** Couche du sol où l'espèce peut pousser. */
  layer: 'surface' | 'humus' | 'deep';
}

/** Événement aléatoire qui touche la forêt. */
export interface EventDef {
  id: string;
  name: string;
  description: string;
  /** Poids relatif de tirage (> 0). */
  weight: number;
  /** Variation immédiate des ressources. */
  effects: Partial<Record<ResourceId, number>>;
}

/** Forêt jouable (carte / niveau). */
export interface ForestDef {
  id: string;
  name: string;
  description: string;
  /** Largeur de la coupe, en tuiles de 8 px. */
  widthTiles: number;
  /** Profondeur de chaque couche, en tuiles. */
  layers: { surface: number; humus: number; deep: number };
  startingResources: Record<ResourceId, number>;
  /** Identifiants d'espèces disponibles dans cette forêt. */
  species: string[];
  /** Identifiants d'événements possibles dans cette forêt. */
  events: string[];
}

export type ResourceId = 'nutrients' | 'water' | 'spores';
export const RESOURCE_IDS: readonly ResourceId[] = ['nutrients', 'water', 'spores'];
