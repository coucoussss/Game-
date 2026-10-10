import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';

/**
 * Plus grand facteur entier tel que la résolution native tienne dans la fenêtre.
 * Jamais inférieur à 1 : sur un écran trop petit, on déborde plutôt que de flouter.
 */
export function computeIntegerZoom(
  viewportWidth: number,
  viewportHeight: number,
  nativeWidth = NATIVE_WIDTH,
  nativeHeight = NATIVE_HEIGHT,
): number {
  const zoom = Math.floor(Math.min(viewportWidth / nativeWidth, viewportHeight / nativeHeight));
  return Math.max(1, zoom);
}
