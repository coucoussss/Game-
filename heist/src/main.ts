import { loadGameData } from './data';
import { Game } from './render/Game';

const container = document.getElementById('game');
const hud = document.getElementById('hud');
if (!container || !hud) throw new Error('Page incomplète : #game ou #hud introuvable.');

/** localStorage peut être indisponible (navigation privée, cookies bloqués) : on se rabat sur la mémoire. */
function storage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  try {
    const s = window.localStorage;
    s.getItem('test');
    return s;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  }
}

const game = new Game(container, hud, loadGameData(), storage());
game.run();

// Accès de débogage depuis la console : `__heist.world`.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __heist: Game }).__heist = game;
}
