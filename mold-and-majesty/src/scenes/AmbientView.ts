import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import { GROUND_Y, PLAY_BOTTOM } from '../config';
import type { World } from '../systems/World';

/**
 * Particules d'ambiance : poussières lumineuses qui flottent dans le sol (plus nombreuses
 * dans les caves), pollen en surface au printemps et en été.
 */
export class AmbientView {
  private readonly pollen: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    reduced: boolean,
  ) {
    const w = world.widthPx;
    const cave = world.forest.rules.noSky === true;
    scene.add
      .particles(0, 0, 'px', {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, GROUND_Y + 6, w, PLAY_BOTTOM - GROUND_Y - 6), quantity: 1 } as never,
        lifespan: { min: 5000, max: 9000 },
        speedX: { min: -2, max: 2 },
        speedY: { min: -3, max: 1 },
        // Apparition et disparition en douceur.
        alpha: { values: [0, 0.7, 0], interpolation: 'linear' },
        tint: [COLORS.turquoise, COLORS.magenta, COLORS.gold],
        blendMode: Phaser.BlendModes.ADD,
        frequency: reduced ? 900 : cave ? 90 : 220,
      })
      .setDepth(8.95);
    this.pollen = scene.add
      .particles(0, 0, 'px', {
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 20, w, GROUND_Y - 22), quantity: 1 } as never,
        lifespan: 6000,
        speedX: { min: 2, max: 6 },
        speedY: { min: -2, max: 2 },
        alpha: { start: 0.8, end: 0 },
        tint: [0xf2e4a0, 0xffffff],
        frequency: reduced ? 1500 : 350,
        emitting: false,
      })
      .setDepth(6.5);
  }

  update(): void {
    const season = this.world.season.def.id;
    const pollen = !this.world.forest.rules.noSky && (season === 'spring' || season === 'summer');
    if (pollen && !this.pollen.emitting) this.pollen.start();
    if (!pollen && this.pollen.emitting) this.pollen.stop();
  }
}
