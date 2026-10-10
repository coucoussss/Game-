import Phaser from 'phaser';
import { createBaseTextures } from '../art/textures';

/** Génère les textures communes puis lance la scène de jeu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createBaseTextures(this);
    this.scene.start('Game');
  }
}
