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
  layer: Layer;
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
  /** Gisements de minéraux générés dans chaque couche. */
  deposits: Record<Layer, { count: number; amount: number }>;
  /** Identifiants d'espèces disponibles dans cette forêt. */
  species: string[];
  /** Identifiants d'événements possibles dans cette forêt. */
  events: string[];
}

/**
 * Ressources du jeu. Sucre, eau et minéraux circulent dans le réseau ; la mémoire est
 * globale (le réseau apprend des saisons traversées) ; les spores sont le fruit de l'automne.
 */
export type ResourceId = 'sugar' | 'water' | 'minerals' | 'memory' | 'spores';
export const RESOURCE_IDS: readonly ResourceId[] = ['sugar', 'water', 'minerals', 'memory', 'spores'];

/** Flux qui circulent dans le réseau de mycélium. */
export type FluxId = 'sugar' | 'water' | 'minerals' | 'signal';
export const FLUX_IDS: readonly FluxId[] = ['sugar', 'water', 'minerals', 'signal'];

export type Layer = 'surface' | 'humus' | 'deep';
export const LAYERS: readonly Layer[] = ['surface', 'humus', 'deep'];

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
  /** Minéraux consommés par tuile poussée. */
  growthMinerals: number;
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
  /** Production de base par tick, modulée par la saison (cœur uniquement en pratique). */
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

/** Règles d'une saison : multiplicateurs appliqués à la simulation. */
export interface SeasonRules {
  /** Multiplicateur de la production de sucre du cœur. */
  sugarProduction: number;
  /** Minéraux que les arbres échangent au cœur, par tick. */
  mineralTrade: number;
  /** Sucre rendu par les arbres pour chaque minéral. */
  tradeRatio: number;
  growthSpeed: number;
  growthCost: number;
  upkeep: number;
  fruiting: number;
  /** Intensité du gel sur les segments de la couche de surface (0 = aucun). */
  frost: number;
  /** Sol de surface gelé : il ne cède plus d'eau. */
  frozenSurface: boolean;
  /** Minéraux rendus aux gisements de surface par la litière, par tick. */
  litter: number;
}

/** Palette d'une saison (couleurs « #rrggbb »), interpolée en fin de saison vers la suivante. */
export interface SeasonPalette {
  sky: string;
  leaf: string;
  leafAlt: string;
  trunk: string;
  surface: string;
  humus: string;
  deep: string;
  /** Densité du feuillage (0..1). */
  leafDensity: number;
  /** Couverture de neige au sol (0..1). */
  snow: number;
}

export type Precipitation = 'none' | 'rain' | 'snow' | 'fog';

export interface WeatherDef {
  name: string;
  /** Humidité vers laquelle tend le sol (0..1). */
  moisture: number;
  minTicks: number;
  maxTicks: number;
  precipitation: Precipitation;
  /** Teinte du ciel mêlée à la palette, et son intensité. */
  skyTint?: string;
  tintStrength?: number;
}

export interface SeasonDef {
  id: string;
  name: string;
  /** Ce que la saison demande au joueur (affiché au changement de saison). */
  motto: string;
  rules: SeasonRules;
  palette: SeasonPalette;
  /** Poids de tirage de chaque météo possible. */
  weather: Record<string, number>;
}

export interface SeasonsDef {
  /** Durée d'une saison, en ticks (9000 = 15 min à 10 ticks/s). */
  seasonLengthTicks: number;
  /** Part finale de la saison pendant laquelle la palette glisse vers la suivante. */
  paletteBlend: number;
  seasons: SeasonDef[];
  weather: Record<string, WeatherDef>;
  memory: {
    /** Mémoire gagnée à chaque fin de saison traversée. */
    perSeason: number;
    /** Mémoire gagnée par segment vivant en fin de saison. */
    perSegment: number;
    perSpore: number;
    /** Réduction du dépérissement : facteur 1 / (1 + mémoire × decayReduction). */
    decayReduction: number;
  };
}

/** Paramètres du sol (src/data/soil.json). */
export interface SoilDef {
  /** Eau absorbée par nœud et par tick, à humidité 1. */
  waterRate: number;
  /** Facteur d'absorption d'eau selon la couche. */
  layerWater: Record<Layer, number>;
  /**
   * Inertie hydrique de la couche (0..1) : part de l'humidité conservée quelle que soit la
   * météo. Les couches profondes restent humides pendant les sécheresses.
   */
  layerBuffer: Record<Layer, number>;
  /** Minéraux extraits par nœud, par gisement à portée et par tick. */
  mineralRate: number;
  /** Portée d'extraction d'un nœud, en pixels. */
  mineralRadius: number;
  /** Vitesse à laquelle l'humidité du sol suit la météo (0..1 par tick). */
  moistureRate: number;
}
