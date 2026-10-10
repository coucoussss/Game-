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

/** Nature d'un événement climatique. */
export type ClimateKind = 'drought' | 'flood' | 'fire' | 'frost' | 'windfall';
export const CLIMATE_KINDS: readonly ClimateKind[] = ['drought', 'flood', 'fire', 'frost', 'windfall'];

/** Événement climatique qui frappe la forêt. */
export interface EventDef {
  id: string;
  name: string;
  description: string;
  kind: ClimateKind;
  /** Poids de tirage selon la saison (saison absente = impossible). */
  seasons: Record<string, number>;
  /** Durée [min, max] en ticks. */
  duration: [number, number];
  /** Force de l'événement (dégâts, minéraux apportés…). */
  intensity: number;
}

/** Contenu de events.json. */
export interface EventsDef {
  /** Probabilité, à chaque tick sans événement en cours, qu'un événement se déclenche. */
  chancePerTick: number;
  events: EventDef[];
}

/**
 * Règle spéciale d'une forêt : modificateurs appliqués aux données (saisons, menaces…)
 * et particularités du terrain. Tous les champs sont optionnels.
 */
export interface ForestRules {
  /** Énoncé de la règle, montré à l'écran de sélection. */
  summary: string;
  /** Multiplicateur de durée par saison (0 = la saison n'existe pas ici). */
  seasonLength?: Record<string, number>;
  /** Saisons où la surface est gelée, en plus de celles qui le sont déjà. */
  frozenSeasons?: string[];
  /** Multiplicateur du gel. */
  frost?: number;
  /** Nappe d'eau permanente : part (0..1) du sous-sol (humus et profondeurs) sous l'eau, depuis le bas. */
  waterTable?: number;
  /** Humidité minimale du sol (marais, jungle). */
  minMoisture?: number;
  /** Multiplicateurs de poids des événements climatiques. */
  eventWeights?: Record<string, number>;
  /** Multiplicateur de la fréquence des événements climatiques. */
  eventChance?: number;
  /** Multiplicateurs des moisissures (apparition, croissance) et des parasites. */
  rivalChance?: number;
  rivalGrowth?: number;
  parasiteChance?: number;
  /** Multiplicateur de la production de sucre du cœur. */
  heartProduction?: number;
  /** Pas de ciel : caverne (pas de météo visible, pas d'arbres). */
  noSky?: boolean;
  /** Obscurité ambiante (0..1), percée par la bioluminescence. */
  darkness?: number;
  /** Blocs infranchissables (gravats, béton) semés dans le sol. */
  obstacles?: number;
  /** Part des arbres déjà calcinés au départ. */
  burntTrees?: number;
  /** Un Arbre-Mère géant se dresse au centre. */
  motherTree?: boolean;
}

/** Forêt jouable (carte / niveau). */
export interface ForestDef {
  id: string;
  name: string;
  description: string;
  /** Biome : choisit l'ambiance visuelle et sonore. */
  biome: string;
  rules: ForestRules;
  /** Objectif : une sporée qui porte au moins à cette distance, en mètres. */
  goal: { reach: number };
  /** Espèces de moisissures rivales présentes. */
  rivals: string[];
  /** Souvenir débloqué en entrant dans cette forêt (étape 7). */
  memory?: string;
  /** Largeur de la coupe, en tuiles de 8 px. */
  widthTiles: number;
  /** Profondeur de chaque couche, en tuiles. */
  layers: { surface: number; humus: number; deep: number };
  startingResources: Record<ResourceId, number>;
  /** Gisements de minéraux générés dans chaque couche. */
  deposits: Record<Layer, { count: number; amount: number }>;
  /** Nombre d'alliés de chaque espèce présents dans la forêt. */
  allies: Record<AllySpeciesId, number>;
  /** Identifiants d'espèces disponibles dans cette forêt. */
  species: string[];
  /** Identifiants d'événements climatiques possibles dans cette forêt. */
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
  /** Multiplicateur de durée (règle de forêt) ; 0 = saison absente. */
  lengthFactor?: number;
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

// ─── Alliés ───────────────────────────────────────────────────────────────

export type AllySpeciesId = 'tree' | 'ant' | 'worm' | 'beetle';
export const ALLY_SPECIES: readonly AllySpeciesId[] = ['tree', 'ant', 'worm', 'beetle'];

/** Traits de caractère (0..1) qui pilotent le comportement d'un allié. */
export interface Personality {
  /** Vitesse à laquelle la confiance grandit quand l'allié est satisfait. */
  warmth: number;
  /** Tolérance aux manques : un allié patient perd confiance lentement. */
  patience: number;
  /** Ce que l'allié réclame (multiplie ses exigences). */
  greed: number;
  /** Ce que l'allié donne (multiplie ses dons). */
  generosity: number;
  /** Résistance à la tentation de trahir. */
  loyalty: number;
}
export const PERSONALITY_TRAITS: readonly (keyof Personality)[] = ['warmth', 'patience', 'greed', 'generosity', 'loyalty'];

export type TradeResource = 'sugar' | 'water' | 'minerals';
export type AllyService = 'guard' | 'aerate' | 'disperse';
export type BetrayalKind = 'hoard' | 'raid' | 'gnaw' | 'infest';

export interface AllySpeciesDef {
  name: string;
  personality: Personality;
  /** Écart aléatoire maximal de chaque trait d'un individu à l'autre. */
  variation: number;
  /** Couches où l'allié vit (et, en hiver, où il se retire). */
  habitat: Layer[];
  winterHabitat?: Layer[];
  /** Vitesse de déplacement, en pixels par tick (0 = immobile). */
  speed: number;
  /** Distance à laquelle l'allié peut commercer avec un nœud. */
  contactRadius: number;
  /** Activité selon la saison (0 = en sommeil). */
  activity: Record<string, number>;
  /** Échange par tick : ce que l'allié prend au nœud en contact, et ce qu'il y dépose. */
  deal: { wants: Partial<Record<TradeResource, number>>; gives: Partial<Record<TradeResource, number>> };
  /** Service rendu au réseau quand l'allié est en contact. */
  service?: { kind: AllyService; strength: number };
  betrayal: {
    kind: BetrayalKind;
    /** Confiance sous laquelle la trahison devient possible. */
    threshold: number;
    /** Probabilité par tick, au pire de la défiance, pour un allié sans loyauté. */
    chance: number;
    amount: number;
    cooldownTicks: number;
  };
  /** L'allié peut-il quitter la forêt quand la confiance s'effondre ? */
  leaves: boolean;
}

export interface AlliesDef {
  trust: {
    /** Confiance d'un nouvel arrivant. */
    initial: number;
    /** Gain maximal par tick (× warmth) quand l'accord est honoré. */
    gain: number;
    /** Perte maximale par tick (× manque × (1 − patience)). */
    loss: number;
    /** Retour vers la confiance initiale, par tick, sans contact. */
    drift: number;
    /** Sous ce seuil, un allié qui peut partir s'en va. */
    leave: number;
  };
  species: Record<AllySpeciesId, AllySpeciesDef>;
}

// ─── Menaces ──────────────────────────────────────────────────────────────

export interface RivalKindDef {
  name: string;
  color: string;
  /** Probabilité de croissance par tick. */
  growthChance: number;
  maxCells: number;
  /** Résistance de chaque cellule. */
  hp: number;
  /** Toxines : dégâts sur les segments à portée (proportionnels à leur `decay`, comme le gel). */
  toxin: { radius: number; intensity: number };
  /** Minéraux pris par cellule et par tick aux gisements recouverts. */
  appetite: number;
}

export interface ThreatsDef {
  rivals: {
    chancePerTick: number;
    seasons: Record<string, number>;
    maxColonies: number;
    /** Distance minimale au cœur pour apparaître. */
    minDistance: number;
    startCells: number;
    /** Taille d'une cellule, en pixels. */
    cellSize: number;
    /** Mémoire gagnée en anéantissant une colonie. */
    victoryMemory: number;
    kinds: Record<string, RivalKindDef>;
  };
  parasites: {
    chancePerTick: number;
    seasons: Record<string, number>;
    /** Charge initiale d'un nœud infecté. */
    seedLoad: number;
    /** Croissance de la charge par tick. */
    growth: number;
    /** Probabilité de contagion par segment, par tick, à charge 1. */
    spread: number;
    /** Sucre volé par tick, à charge 1. */
    drain: number;
    /** Dégâts aux segments d'un nœud saturé, par tick. */
    damage: number;
    /** Guérison par tick, à remplissage de signal 1. */
    cure: number;
  };
  /** Guerre chimique : les nœuds riches en signal sécrètent des antifongiques. */
  defense: { radius: number; damage: number; sugarCost: number; minSignal: number };
}

// ─── Sporée et compétences ───────────────────────────────────────────────

/** Paramètres du mini-jeu rythmique de la sporée d'automne (src/data/sporulation.json). */
export interface SporulationDef {
  bpm: number;
  /** Nombre de mesures de 8 croches. */
  bars: number;
  /** Délai avant la première note, en ms. */
  leadInMs: number;
  /** Fenêtres de jugement (écart maximal à la note), en ms. */
  windows: { perfect: number; good: number };
  /** Motifs d'une mesure : 1 = note sur la croche. */
  patterns: number[][];
  /** Portée de base, en mètres. */
  baseReach: number;
  /** Portée ajoutée par spore libérée. */
  perSpore: number;
  /** Part de la portée obtenue même avec un rythme raté. */
  minScoreFactor: number;
  /** Mémoire gagnée par mètre de portée. */
  memoryPerMeter: number;
  /** Spores nécessaires pour lancer une sporée. */
  minSpores: number;
}

export type SkillBranch = 'roots' | 'chemistry' | 'spores';
export const SKILL_BRANCHES: readonly SkillBranch[] = ['roots', 'chemistry', 'spores'];

/** Bonus qu'une compétence peut accorder : chacun multiplie un paramètre des données. */
export type BonusKey =
  | 'waterAbsorption'
  | 'mineralRate'
  | 'growthCost'
  | 'upkeep'
  | 'frostResistance'
  | 'defenseDamage'
  | 'defenseCost'
  | 'trustGain'
  | 'parasiteCure'
  | 'fruiting'
  | 'rhythmWindow'
  | 'sporeReach'
  | 'memoryPerSpore';
export const BONUS_KEYS: readonly BonusKey[] = [
  'waterAbsorption',
  'mineralRate',
  'growthCost',
  'upkeep',
  'frostResistance',
  'defenseDamage',
  'defenseCost',
  'trustGain',
  'parasiteCure',
  'fruiting',
  'rhythmWindow',
  'sporeReach',
  'memoryPerSpore',
];

export interface SkillDef {
  id: string;
  branch: SkillBranch;
  /** Rang dans la branche (1 = racine de la branche). */
  tier: number;
  name: string;
  description: string;
  /** Coût en mémoire. */
  cost: number;
  requires: string[];
  effects: Partial<Record<BonusKey, number>>;
}

export interface SkillsDef {
  branches: Record<SkillBranch, string>;
  skills: SkillDef[];
}

/** Ambiance visuelle d'un biome : teinte mêlée à la palette de saison. */
export interface BiomeDef {
  name: string;
  tint: string;
  /** Force du mélange (0..1). */
  strength: number;
}
