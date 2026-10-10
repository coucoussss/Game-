/** Utilitaires de couleur sans dépendance à Phaser (testables). */

/** « #rrggbb » → 0xrrggbb. */
export function hexToInt(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex) || Number.isNaN(value)) throw new Error(`Couleur invalide : "${hex}"`);
  return value;
}

/** Interpolation linéaire composante par composante, t borné à [0, 1]. */
export function lerpColor(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * k) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** Assombrit (k < 1) ou éclaircit vers le blanc (k > 1). */
export function shade(color: number, k: number): number {
  return k <= 1 ? lerpColor(0x000000, color, k) : lerpColor(color, 0xffffff, k - 1);
}
