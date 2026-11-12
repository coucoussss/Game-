/** Types du contenu du jeu (fichiers JSON de `src/data/`). Unités : mètres, secondes de jeu. */

export type Vec2 = readonly [number, number];

/** Rectangle aligné sur les axes, dans le plan horizontal (x, z). */
export interface Rect {
  readonly min: Vec2;
  readonly max: Vec2;
}

export type ItemId = 'crowbar' | 'wire-cutters' | 'ski-mask' | 'pistol' | 'plate-carrier';

/** Comment un objet se manipule : tenu en main ou porté sur soi. */
export type ItemKind = 'tool' | 'weapon' | 'wearable';

export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly kind: ItemKind;
  readonly description: string;
  /** Prix au marché noir, en dollars propres. */
  readonly price: number;
  /** Suspicion qu'il inspire quand il est visible (tenu ou porté), de 0 à 1. */
  readonly suspicion: number;
  /** Facteur de vitesse quand il est porté (1 = aucun effet). */
  readonly speedFactor: number;
  /** Portée d'intimidation en mètres, pour les armes et outils menaçants (0 = aucune). */
  readonly threatRange: number;
  /** Chemin d'un modèle 3D (glb) dans `public/`, s'il en a un. */
  readonly model?: string;
}

export interface WallDef {
  readonly rect: Rect;
  readonly height: number;
  readonly color: string;
  /** Faux pour les meubles bas : ils bloquent le passage, pas la vue. */
  readonly blocksSight: boolean;
}

export type DoorId = 'store-front' | 'store-back';

export interface DoorDef {
  readonly id: DoorId;
  readonly rect: Rect;
  readonly height: number;
  readonly color: string;
}

export type InteractableKind =
  | 'pickup'
  | 'cash'
  | 'register'
  | 'safe'
  | 'fuse-box'
  | 'door'
  | 'fence'
  | 'bed'
  | 'plan-table';

export interface InteractableDef {
  readonly id: string;
  readonly kind: InteractableKind;
  readonly name: string;
  readonly pos: Vec2;
  /** Hauteur du point visé, pour le regard. */
  readonly y: number;
  readonly item?: ItemId;
  readonly amount?: number;
  readonly door?: DoorId;
}

/** Une information à découvrir : on la note dans le carnet en la regardant assez longtemps. */
export interface IntelDef {
  readonly id: string;
  readonly text: string;
  readonly pos: Vec2;
  readonly y: number;
  /** `look` : regarder le point ; `event` : découvert par un événement du monde. */
  readonly trigger: 'look' | 'event';
  readonly range: number;
  /** Icône sur le plan du carnet. */
  readonly marker: 'camera' | 'cash' | 'safe' | 'power' | 'door' | 'person' | 'info';
}

export interface CameraDef {
  readonly id: string;
  readonly pos: Vec2;
  readonly y: number;
  /** Direction de visée, en radians, dans le plan (0 = +x, π/2 = +z). */
  readonly facing: number;
  readonly fov: number;
  readonly range: number;
}

export interface LevelDef {
  readonly bounds: Rect;
  readonly spawn: Vec2;
  readonly hideout: Rect;
  readonly store: Rect;
  /** Arrière-boutique et derrière le comptoir : zones interdites au public. */
  readonly staffOnly: readonly Rect[];
  readonly walls: readonly WallDef[];
  readonly doors: readonly DoorDef[];
  readonly interactables: readonly InteractableDef[];
  readonly intel: readonly IntelDef[];
  readonly cameras: readonly CameraDef[];
  readonly lamps: readonly Vec2[];
  readonly clerk: {
    readonly counter: Vec2;
    readonly waypointsToBreak: readonly Vec2[];
    readonly exitPath: readonly Vec2[];
  };
  readonly pedestrian: { readonly path: readonly Vec2[]; readonly activeFrom: number; readonly activeTo: number };
  readonly fence: { readonly pos: Vec2; readonly openFrom: number; readonly openTo: number };
  readonly police: { readonly spawn: Vec2; readonly stop: Vec2 };
}

export interface RulesDef {
  /** Secondes de jeu écoulées par seconde réelle. */
  readonly timeScale: number;
  readonly startHour: number;
  readonly startCash: number;
  readonly storeOpen: number;
  readonly storeClose: number;
  /** Pause cigarette : toutes les `breakEvery` heures, à `breakMinute`, pendant `breakDuration` minutes. */
  readonly breakEvery: number;
  readonly breakMinute: number;
  readonly breakDuration: number;
  readonly registerBase: number;
  readonly registerPerHour: number;
  readonly registerMax: number;
  readonly safeBase: number;
  readonly launderFee: number;
  /** Délai d'arrivée de la police, en secondes réelles, et réduction par point de chaleur. */
  readonly policeEta: number;
  readonly policeEtaPerHeat: number;
  readonly policeMinEta: number;
  readonly policeSearch: number;
  readonly policeSightRange: number;
  readonly heatPerCall: number;
  readonly heatIdentified: number;
  readonly heatDecayPerDay: number;
  readonly forceDoorTime: number;
  readonly crackSafeTime: number;
  readonly cutFuseTime: number;
  readonly noiseRadius: number;
  readonly civilianFov: number;
  readonly civilianRange: number;
  readonly suspicionRate: number;
  readonly callDelay: number;
  readonly complianceTime: number;
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly crouchSpeed: number;
}

export interface GameData {
  readonly items: ReadonlyMap<ItemId, ItemDef>;
  readonly level: LevelDef;
  readonly rules: RulesDef;
}
