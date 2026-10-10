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
  /** Cellules indexées par « gx,gy ». */
  readonly cells: Map<string, RivalCell>;
}

export const cellKey = (gx: number, gy: number) => `${gx},${gy}`;
