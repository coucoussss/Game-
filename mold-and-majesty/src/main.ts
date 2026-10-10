import '@fontsource/tiny5/latin.css';
import '@fontsource/tiny5/latin-ext.css';
import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { ForestSelectScene } from './scenes/ForestSelectScene';
import { GameScene } from './scenes/GameScene';
import { MemoryScene } from './scenes/MemoryScene';
import { OptionsScene } from './scenes/OptionsScene';
import { PauseScene } from './scenes/PauseScene';
import { RhythmScene } from './scenes/RhythmScene';
import { SkillScene } from './scenes/SkillScene';
import { computeIntegerZoom } from './ui/integerScale';
import { PIXEL_FONT } from './ui/text';

/** Police pixel (Tiny5, OFL) : on attend qu'elle soit chargée avant de dessiner du texte. */
async function loadFont(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(`8px ${PIXEL_FONT}`, 'Àéèçœ'), new Promise((r) => setTimeout(r, 2000))]);
  } catch {
    // Police indisponible : repli sur la police monospace.
  }
}

await loadFont();

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
  scene: [BootScene, ForestSelectScene, GameScene, RhythmScene, SkillScene, MemoryScene, PauseScene, OptionsScene],
});

// Débogage : ?debug expose le jeu dans la console (window.__mm).
if (new URLSearchParams(window.location.search).has('debug')) (window as unknown as { __mm: Phaser.Game }).__mm = game;

// Mise à l'échelle entière uniquement : on recalcule le zoom à chaque redimensionnement.
window.addEventListener('resize', () => {
  game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
});
