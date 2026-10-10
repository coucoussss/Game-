import Phaser from 'phaser';
import { createBaseTextures, createSpriteTextures, createWaterTexture } from '../art/textures';
import { gameData } from '../data';
import { generateForest } from '../systems/ForestGenerator';
import { applySettings } from './OptionsScene';
import { profile } from './session';

/** Génère les textures communes puis ouvre le royaume (ou, en développement, une forêt). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createBaseTextures(this);
    applySettings(profile().settings);
    createSpriteTextures(this);
    createWaterTexture(this);
    // Développement : ?forest=mist-marsh (ou ?forest=endless-3) lance directement une forêt ;
    // ?memory=the-fire joue un souvenir.
    const params = new URLSearchParams(window.location.search);
    const memory = params.get('memory');
    if (memory && !/^\d+$/.test(memory)) {
      this.scene.start('Memory', { memoryId: memory });
      return;
    }
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
