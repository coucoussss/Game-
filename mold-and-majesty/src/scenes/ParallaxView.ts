import type Phaser from 'phaser';
import { GROUND_Y, NATIVE_WIDTH } from '../config';
import { Random } from '../systems/Random';
import type { World } from '../systems/World';
import { lerpColor, shade } from '../ui/color';

interface Layer {
  graphics: Phaser.GameObjects.Graphics;
  factor: number;
  /** Silhouette : hauteur (px au-dessus du sol) par colonne. */
  heights: number[];
  /** Mélange vers la couleur du ciel (brume de distance). */
  haze: number;
}

/**
 * Ciel et arrière-plans en parallaxe : collines lointaines, puis deux rangées de
 * silhouettes d'arbres, qui défilent moins vite que le premier plan. Leurs couleurs
 * suivent la palette de la saison (fournie à chaque image).
 */
export class ParallaxView {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly layers: Layer[] = [];
  private readonly stars: [number, number][] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.sky = scene.add.graphics().setDepth(-3).setScrollFactor(0);
    const rng = new Random(world.seed ^ 0xa11a);
    for (let i = 0; i < 40; i++) this.stars.push([rng.int(0, NATIVE_WIDTH), rng.int(0, GROUND_Y - 30)]);
    const make = (factor: number, haze: number, gen: (x: number) => number) => {
      const width = Math.ceil(NATIVE_WIDTH + (world.widthPx - NATIVE_WIDTH) * factor) + 2;
      const heights = Array.from({ length: width }, (_, x) => Math.max(0, Math.round(gen(x))));
      this.layers.push({ graphics: scene.add.graphics().setDepth(-2 + factor).setScrollFactor(factor), factor, heights, haze });
    };
    // Collines : somme de sinusoïdes.
    const phase = rng.next() * 10;
    make(0.15, 0.7, (x) => 26 + Math.sin(x / 47 + phase) * 8 + Math.sin(x / 13 + phase * 2) * 3);
    // Deux rangées de sapins et de feuillus en silhouette.
    const trees = (spacing: number, height: number) => {
      const peaks: [number, number, number][] = [];
      for (let x = 0; x < 2000; x += spacing + rng.int(-spacing / 3, spacing / 3)) peaks.push([x, height * (0.6 + rng.next() * 0.6), rng.next()]);
      return (x: number) => {
        let h = 4;
        for (const [px, ph, kind] of peaks) {
          const d = Math.abs(x - px);
          // Sapin pointu ou houppier arrondi.
          const v = kind < 0.5 ? ph - d * 2.2 : d < ph * 0.45 ? ph - (d * d) / (ph * 0.35) : 0;
          if (v > h) h = v;
        }
        return h;
      };
    };
    make(0.35, 0.5, trees(14, 26));
    make(0.6, 0.25, trees(11, 20));
  }

  draw(p: { sky: number; trunk: number; leaf: number }, timeMs: number): void {
    const cave = this.world.forest.rules.noSky === true;
    const s = this.sky.clear();
    if (!cave) {
      // Ciel en bandes (dégradé pixel), étoiles discrètes quand il est sombre.
      for (let i = 0; i < 8; i++) {
        s.fillStyle(lerpColor(p.sky, shade(p.sky, 1.35), i / 8)).fillRect(0, Math.round((GROUND_Y * i) / 8), NATIVE_WIDTH, Math.ceil(GROUND_Y / 8) + 1);
      }
      const darkness = 1 - ((p.sky >> 16) + ((p.sky >> 8) & 0xff) + (p.sky & 0xff)) / 765;
      if (darkness > 0.6) {
        for (const [i, [x, y]] of this.stars.entries()) {
          s.fillStyle(0xe8dcc0, (darkness - 0.6) * 2 * (0.5 + 0.5 * Math.sin(timeMs / 700 + i))).fillRect(x, y, 1, 1);
        }
      }
    }
    for (const layer of this.layers) {
      const g = layer.graphics.clear();
      if (cave) continue;
      const base = lerpColor(shade(layer.factor < 0.2 ? p.trunk : p.leaf, 0.45), p.sky, layer.haze);
      g.fillStyle(base);
      layer.heights.forEach((h, x) => {
        if (h > 0) g.fillRect(x, GROUND_Y - h, 1, h);
      });
    }
  }
}
