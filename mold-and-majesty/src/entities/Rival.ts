/** Cellule d'une moisissure rivale, sur une grille de `cellSize` pixels. */
export interface RivalCell {
  readonly gx: number;
  readonly gy: number;
  hp: number;
}

/** Colonie de moisissure rivale. Données pures. */
export interface RivalColony {
  readonly id: number;
  readonly kind: string;
  /** Cellules indexées par `cellKey(gx, gy)`. */
  readonly cells: Map<number, RivalCell>;
}

/** Clé numérique d'une case (pas de chaîne : la grille est parcourue à chaque tick). */
export const cellKey = (gx: number, gy: number) => gx * 4096 + gy;
