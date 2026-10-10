import Phaser from 'phaser';
import { createBaseTextures } from '../art/textures';
import { gameData } from '../data';
import { generateForest } from '../systems/ForestGenerator';

/** Génère les textures communes puis ouvre le royaume (ou, en développement, une forêt). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createBaseTextures(this);
    // Développement : ?forest=mist-marsh (ou ?forest=endless-3) lance directement une forêt.
    const params = new URLSearchParams(window.location.search);
    const id = params.get('forest');
    if (id) {
      const depth = /^endless-(\d+)$/.exec(id);
      const forest = depth ? generateForest(1, Number(depth[1]), gameData) : gameData.forests.get(id);
      if (forest) {
        this.scene.start('Game', { mode: depth ? 'endless' : 'campaign', forest });
        return;
      }
    }
    this.scene.start('ForestSelect');
  }
}
