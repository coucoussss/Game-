/** Types du contenu du jeu (fichiers JSON de `src/data/`). Unités : mètres, secondes. */

export type Vec2 = readonly [number, number];

/** Rectangle aligné sur les axes, dans le plan horizontal (x, z). */
export interface Rect {
  readonly min: Vec2;
  readonly max: Vec2;
}

export type ItemId =
  | 'crowbar'
  | 'wire-cutters'
  | 'ski-mask'
  | 'lockpicks'
  | 'duffel-bag'
  | 'pistol'
  | 'plate-carrier'
  | 'drill';

/** Comment un objet se manipule : outil ou arme tenus en main, vêtement porté, équipement passif. */
export type ItemKind = 'tool' | 'weapon' | 'wearable' | 'gear';

export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly kind: ItemKind;
  readonly description: string;
  /** Prix au marché noir, en dollars propres. */
  readonly price: number;
  /** Argent blanchi au total nécessaire pour que le Fourgue le propose. */
  readonly unlock: number;
  /** Suspicion qu'il inspire quand il est visible (tenu ou porté), de 0 à 1. */
  readonly suspicion: number;
  /** Facteur de vitesse quand il est porté ou tenu (1 = aucun effet). */
  readonly speedFactor: number;
  /** Portée d'intimidation en mètres (0 = aucune). */
  readonly threatRange: number;
}

// --- Ville ---------------------------------------------------------------------------------------

export type DoorRole = 'front' | 'back' | 'inner' | 'vault';

export interface DoorSpec {
  readonly id: string;
  readonly role: DoorRole;
}

export type WallSide = 'n' | 's' | 'e' | 'w';

/** Ouverture dans un mur : porte, vitrine (bloque le passage, pas la vue) ou simple passage. */
export interface OpeningDef {
  readonly from: number;
  readonly to: number;
  readonly door?: DoorSpec;
  readonly window?: boolean;
}

export interface PartitionDef {
  /** Axe le long duquel court la cloison. */
  readonly axis: 'x' | 'z';
  /** Coordonnée sur l'autre axe. */
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly openings: readonly OpeningDef[];
}

export type FacadeStyle = 'brick' | 'concrete' | 'plaster' | 'stone' | 'metal';

export interface BuildingDef {
  readonly id: string;
  readonly rect: Rect;
  readonly height: number;
  readonly style: FacadeStyle;
  readonly color: string;
  /** Bloc plein, sans intérieur. */
  readonly solid?: boolean;
  readonly site?: string;
  readonly floor?: 'tile' | 'concrete' | 'wood' | 'marble';
  readonly openings?: Readonly<Partial<Record<WallSide, readonly OpeningDef[]>>>;
  readonly partitions?: readonly PartitionDef[];
}

/** Gabarit d'un meuble ou d'un objet de décor : son emprise au sol. */
export interface PropKind {
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Faux : simple décor, on passe au travers (lampadaire fin, déchet…). */
  readonly solid: boolean;
  readonly blocksSight: boolean;
}

export interface PropDef {
  readonly type: string;
  readonly pos: Vec2;
  /** Rotation en quarts de tour (0..3). */
  readonly rot?: number;
  readonly variant?: number;
}

export interface SiteDef {
  readonly id: string;
  readonly name: string;
  readonly tier: number;
  readonly rect: Rect;
  readonly staffOnly: readonly Rect[];
  readonly open: number;
  readonly close: number;
  /** Où la police se gare. */
  readonly policeStop: Vec2;
  /** Le boîtier électrique est cadenassé : il faut le crocheter avant de couper. */
  readonly lockedFuseBox: boolean;
}

export type InteractableKind =
  | 'pickup'
  | 'cash'
  | 'register'
  | 'container'
  | 'vault-drill'
  | 'fuse-box'
  | 'door'
  | 'fence'
  | 'bed'
  | 'plan-table';

export interface ContainerSpec {
  /** Outil nécessaire en main (`none` : mains nues). */
  readonly tool: 'none' | 'crowbar';
  readonly time: number;
  readonly noisy: boolean;
  /** Durée au crochet, silencieuse (0 : impossible). */
  readonly pickTime: number;
  readonly amount: readonly [number, number];
  /** Jours entre deux remplissages. */
  readonly refillDays: number;
  /** Briser ce contenant déclenche l'alarme du site si le courant passe. */
  readonly alarmed: boolean;
  /** Chance qu'une alarme de voiture se déclenche. */
  readonly carAlarm: number;
  /** Reçoit la recette des caisses du site à la fermeture. */
  readonly collects: boolean;
  /** Porte qui doit être ouverte pour y accéder (chambre forte). */
  readonly behind?: string;
  readonly verb: string;
}

export interface InteractableDef {
  readonly id: string;
  readonly kind: InteractableKind;
  readonly name: string;
  readonly pos: Vec2;
  /** Hauteur du point visé. */
  readonly y: number;
  readonly reach?: number;
  readonly site?: string;
  readonly item?: ItemId;
  readonly amount?: number;
  readonly door?: string;
  readonly container?: ContainerSpec;
  /** Caisse : employé qui doit coopérer pour la remettre. */
  readonly needsStaff?: string;
}

export interface IntelDef {
  readonly id: string;
  readonly site: string;
  readonly text: string;
  readonly pos: Vec2;
  readonly y: number;
  /** `look` : regarder le point ; `event` : découvert par un événement du monde. */
  readonly trigger: 'look' | 'event';
  readonly range: number;
  readonly marker: 'camera' | 'cash' | 'safe' | 'power' | 'door' | 'person' | 'info';
}

export interface CameraDef {
  readonly id: string;
  readonly site: string;
  readonly pos: Vec2;
  readonly y: number;
  /** Direction de visée dans le plan (0 = +x, π/2 = +z). */
  readonly facing: number;
  readonly fov: number;
  readonly range: number;
}

export type StaffRole = 'clerk' | 'jeweler' | 'teller' | 'guard' | 'watchman';

export interface StaffDef {
  readonly id: string;
  readonly site: string;
  readonly role: StaffRole;
  readonly name: string;
  readonly armed: boolean;
  /** Heures de présence [début, fin[ ; peut passer minuit. */
  readonly from: number;
  readonly to: number;
  readonly post: Vec2;
  readonly postFacing: number;
  /** Trajet du bord de la carte jusqu'au poste. Le départ suit `leave`, ou ce trajet à l'envers. */
  readonly arrive: readonly Vec2[];
  readonly leave?: readonly Vec2[];
  /** Indice du point de `leave` où la recette est déposée au coffre. */
  readonly depositAt?: number;
  readonly pause?: {
    readonly every: number;
    readonly minute: number;
    readonly duration: number;
    readonly path: readonly Vec2[];
    readonly facing: number;
    /** Porte laissée ouverte pendant la pause. */
    readonly door?: string;
    /** Renseignement appris en l'observant. */
    readonly intel?: string;
  };
  /** Ronde en boucle (vigiles). */
  readonly patrol?: readonly Vec2[];
  /** Renseignement appris en voyant l'employé partir. */
  readonly leaveIntel?: string;
  /** Renseignement appris en l'apercevant. */
  readonly seenIntel?: string;
}

export interface PedestrianDef {
  readonly id: string;
  readonly path: readonly Vec2[];
  readonly from: number;
  readonly to: number;
  readonly variant: number;
}

export interface TownDef {
  readonly bounds: Rect;
  readonly spawn: Vec2;
  readonly hideout: Rect;
  readonly buildings: readonly BuildingDef[];
  readonly props: readonly PropDef[];
  readonly sites: readonly SiteDef[];
  readonly interactables: readonly InteractableDef[];
  readonly intel: readonly IntelDef[];
  readonly cameras: readonly CameraDef[];
  readonly staff: readonly StaffDef[];
  readonly pedestrians: readonly PedestrianDef[];
  readonly lamps: readonly Vec2[];
  readonly fence: { readonly pos: Vec2; readonly facing: number; readonly openFrom: number; readonly openTo: number };
  readonly policeSpawn: Vec2;
}

// --- Niveau développé (calculé au chargement) ----------------------------------------------------

export interface WallDef {
  readonly rect: Rect;
  readonly height: number;
  readonly blocksSight: boolean;
  /** Vitrine : allège au-dessus d'un muret. */
  readonly glass: boolean;
  /** Identifiant du bâtiment, ou `prop:<type>` pour un meuble. */
  readonly owner: string;
}

export interface DoorDef {
  readonly id: string;
  readonly role: DoorRole;
  readonly rect: Rect;
  readonly site: string | null;
  /** Vrai si la porte court le long de l'axe x. */
  readonly alongX: boolean;
}

export interface LevelDef extends TownDef {
  readonly walls: readonly WallDef[];
  readonly doors: readonly DoorDef[];
}

export interface RulesDef {
  /** Secondes de jeu écoulées par seconde réelle. */
  readonly timeScale: number;
  readonly startHour: number;
  readonly startCash: number;
  readonly debt: number;
  readonly registerBase: number;
  readonly registerPerHour: number;
  readonly registerMax: number;
  readonly launderFee: number;
  readonly carryBase: number;
  readonly carryBag: number;
  /** Délai d'arrivée de la police (secondes réelles), réduit par la chaleur et le rang de la cible. */
  readonly policeEta: number;
  readonly policeEtaPerHeat: number;
  readonly policeEtaPerTier: number;
  readonly policeMinEta: number;
  readonly policeSearch: number;
  readonly heatPerCall: number;
  readonly heatIdentified: number;
  readonly heatPerVictim: number;
  readonly heatDecayPerDay: number;
  readonly forceDoorTime: number;
  readonly pickDoorTime: number;
  readonly cutFuseTime: number;
  readonly drillTime: number;
  readonly noiseRadius: number;
  readonly gunshotRadius: number;
  readonly civilianFov: number;
  readonly civilianRange: number;
  readonly suspicionRate: number;
  readonly callDelay: number;
  readonly complianceTime: number;
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly crouchSpeed: number;
  readonly playerHealth: number;
  readonly armorPoints: number;
  readonly armorAbsorb: number;
  readonly platePrice: number;
  readonly ammoPrice: number;
  readonly magazine: number;
  readonly pistolDamage: number;
  readonly meleeDamage: number;
  readonly guardDamage: number;
  readonly officerSpeed: number;
}

export interface GameData {
  readonly items: ReadonlyMap<ItemId, ItemDef>;
  readonly propKinds: ReadonlyMap<string, PropKind>;
  readonly level: LevelDef;
  readonly rules: RulesDef;
}
