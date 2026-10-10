/** Espèce de champignon que le réseau peut faire pousser (bâtiment du royaume). */
export interface SpeciesDef {
  id: string;
  name: string;
  description: string;
  /** Coût de construction en sucre. */
  cost: number;
  /** Production de sucre par tick. */
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

export type ResourceId = 'sugar' | 'water' | 'spores';
export const RESOURCE_IDS: readonly ResourceId[] = ['sugar', 'water', 'spores'];

/** Flux qui circulent dans le réseau de mycélium. */
export type FluxId = 'sugar' | 'water' | 'signal';
export const FLUX_IDS: readonly FluxId[] = ['sugar', 'water', 'signal'];

/** Épaisseur d'un segment de filament. */
export type ThicknessId = 'thin' | 'medium' | 'thick';
export const THICKNESS_IDS: readonly ThicknessId[] = ['thin', 'medium', 'thick'];

/** Rôle d'un nœud du réseau. */
export type NodeKind = 'heart' | 'junction' | 'storage' | 'relay' | 'fruiting';
export const NODE_KINDS: readonly NodeKind[] = ['heart', 'junction', 'storage', 'relay', 'fruiting'];

export interface ThicknessDef {
  name: string;
  /** Largeur de trait, en pixels. */
  width: number;
  /** Multiplicateur de débit (0..1]. */
  conductance: number;
  /** Vitesse de pousse, en tuiles par tick. */
  growthSpeed: number;
  /** Sucre consommé par tuile poussée. */
  growthCost: number;
  /** Entretien par tuile et par tick. */
  upkeep: { sugar: number; water: number };
  /** Perte de santé par tick quand le segment est totalement affamé. */
  decay: number;
  /** Gain de santé par tick quand l'entretien est couvert. */
  regen: number;
}

export interface NodeKindDef {
  name: string;
  /** Stock maximal de chaque flux. */
  capacity: number;
  /** Sucre nécessaire pour convertir une jonction vers ce rôle. */
  cost: number;
  /** Production par tick (cœur uniquement en pratique). */
  production?: Partial<Record<'sugar' | 'water', number>>;
}

/** Paramètres de la simulation du réseau (src/data/network.json). */
export interface NetworkDef {
  /** Mobilité de chaque flux (0..1] : part du déséquilibre corrigée par tick. */
  flux: Record<FluxId, { mobility: number }>;
  thickness: Record<ThicknessId, ThicknessDef>;
  nodes: Record<NodeKind, NodeKindDef>;
  signal: {
    /** Atténuation par tick, partout dans le réseau (0..1). */
    decay: number;
    /** Remplissage minimal pour qu'un relais réémette. */
    relayThreshold: number;
    /** Remplissage auquel un relais réémet. */
    relayStrength: number;
    /** Sucre consommé par réémission. */
    relayCost: number;
  };
  fruiting: {
    /** Remplissage de signal requis pour fructifier. */
    signalThreshold: number;
    /** Consommation par tick. */
    sugar: number;
    water: number;
    /** Progression par tick ; une spore est produite à chaque fois que 1 est atteint. */
    rate: number;
  };
  /** Sucre investi par tick dans la conversion d'un nœud. */
  buildRate: number;
}
