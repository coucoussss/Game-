import type Phaser from 'phaser';
import { PALETTE_CHARS } from './palette';
import { SPRITES, spriteSize } from './sprites';

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


/** Transforme les cartes de sprites en textures (une image par frame, côte à côte). */
export function createSpriteTextures(scene: Phaser.Scene): void {
  for (const [name, def] of Object.entries(SPRITES)) {
    const key = `spr-${name}`;
    if (scene.textures.exists(key)) continue;
    const { w, h } = spriteSize(def);
    const canvas = scene.textures.createCanvas(key, w * def.frames.length, h)!;
    const ctx = canvas.getContext();
    def.frames.forEach((frame, f) => {
      frame.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          const color = PALETTE_CHARS[ch];
          if (color === undefined) return;
          ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          ctx.fillRect(f * w + x, y, 1, 1);
        });
      });
      canvas.add(f, 0, f * w, 0, w, h);
    });
    canvas.refresh();
  }
}

/** Nappe d'eau des souvenirs (sprite « water »). */
export function createWaterTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('spr-water')) return;
  const w = 400;
  const h = 150;
  const canvas = scene.textures.createCanvas('spr-water', w, h)!;
  const ctx = canvas.getContext();
  ctx.fillStyle = '#3a6a9a';
  ctx.fillRect(0, 2, w, h - 2);
  ctx.fillStyle = '#9fc4e8';
  for (let x = 0; x < w; x += 6) ctx.fillRect(x, (x / 6) % 2, 3, 1);
  ctx.fillStyle = '#2a5080';
  for (let i = 0; i < 300; i++) ctx.fillRect((i * 97) % w, 6 + ((i * 53) % (h - 8)), 2, 1);
  canvas.refresh();
}
