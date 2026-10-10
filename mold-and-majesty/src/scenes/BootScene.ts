import Phaser from 'phaser';

/** Charge les ressources communes puis lance la scène de jeu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Game');
  }
}
