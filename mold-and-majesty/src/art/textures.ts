import type Phaser from 'phaser';

/** Génère par code les textures communes (pixels, halos) au démarrage. */
export function createBaseTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (!tex.exists('px')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
    g.generateTexture('px', 1, 1);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 2, 2);
    g.generateTexture('px2', 2, 2);
    g.destroy();
  }
  for (const [key, size] of [
    ['glow', 32],
    ['glow-big', 96],
  ] as const) {
    if (tex.exists(key)) continue;
    // Halo radial : blanc au centre, transparent au bord, par paliers (rendu pixel art).
    const canvas = tex.createCanvas(key, size, size)!;
    const ctx = canvas.getContext();
    const r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
        if (d >= 1) continue;
        const a = Math.round((1 - d) ** 2 * 6) / 6;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    canvas.refresh();
  }
}
