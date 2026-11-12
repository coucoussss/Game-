import { loadGameData } from './data';
import { Game } from './render/Game';

const container = document.getElementById('game');
const hud = document.getElementById('hud');
if (!container || !hud) throw new Error('Page incomplète : #game ou #hud introuvable.');

const game = new Game(container, hud, loadGameData());
game.start();

// Accès de débogage depuis la console : `__heist.world`.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __heist: Game }).__heist = game;
}
