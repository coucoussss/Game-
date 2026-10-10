import type Phaser from 'phaser';
import { lerpColor } from '../ui/color';
import { PALETTE_CHARS } from './palette';
import { SPRITES, spriteSize } from './sprites';

export interface DrawOptions {
  frame?: number;
  alpha?: number;
  /** Couleur vers laquelle teinter, et dosage (0..1). */
  tint?: number;
  tintAmount?: number;
  flipX?: boolean;
}

/**
 * Dessine un sprite pixel par pixel dans un Graphics, centré sur (x, y).
 * Pratique pour les petits éléments redessinés à chaque image (nœuds, bêtes).
 */
export function drawSprite(g: Phaser.GameObjects.Graphics, name: string, x: number, y: number, opts: DrawOptions = {}): void {
  const def = SPRITES[name];
  if (!def) return;
  const frame = def.frames[(opts.frame ?? 0) % def.frames.length]!;
  const { w, h } = spriteSize(def);
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  const alpha = opts.alpha ?? 1;
  for (let row = 0; row < h; row++) {
    const line = frame[row]!;
    for (let col = 0; col < w; col++) {
      const color = PALETTE_CHARS[line[opts.flipX ? w - 1 - col : col]!];
      if (color === undefined) continue;
      g.fillStyle(opts.tint !== undefined ? lerpColor(color, opts.tint, opts.tintAmount ?? 0.5) : color, alpha);
      g.fillRect(x0 + col, y0 + row, 1, 1);
    }
  }
}
