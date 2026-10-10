import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { ForestSelectScene } from './scenes/ForestSelectScene';
import { GameScene } from './scenes/GameScene';
import { MemoryScene } from './scenes/MemoryScene';
import { RhythmScene } from './scenes/RhythmScene';
import { SkillScene } from './scenes/SkillScene';
import { computeIntegerZoom } from './ui/integerScale';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: NATIVE_WIDTH,
  height: NATIVE_HEIGHT,
  backgroundColor: '#0e0b12',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: computeIntegerZoom(window.innerWidth, window.innerHeight),
  },
  scene: [BootScene, ForestSelectScene, GameScene, RhythmScene, SkillScene, MemoryScene],
});

// Mise à l'échelle entière uniquement : on recalcule le zoom à chaque redimensionnement.
window.addEventListener('resize', () => {
  game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
});
