/** Résolution native du jeu, en pixels logiques. Tout le rendu se fait à cette taille. */
export const NATIVE_WIDTH = 384;
export const NATIVE_HEIGHT = 216;

/** Clé localStorage de la sauvegarde. */
export const SAVE_KEY = 'mold-and-majesty/save';
/** Version du format de sauvegarde ; à incrémenter à chaque changement incompatible. */
export const SAVE_VERSION = 2;

/** Taille d'une tuile, en pixels. */
export const TILE = 8;
/** Ordonnée de la surface du sol : au-dessus le ciel, en dessous le réseau. */
export const GROUND_Y = 80;
/** Durée d'un tick de simulation, en millisecondes (10 ticks/s). */
export const TICK_MS = 100;
