import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import steps from '../data/tutorial.json';
import { Tutorial } from './Tutorial';
import { World } from './World';

describe('tutoriel', () => {
  it('commence par faire pousser un filament', () => {
    const t = new Tutorial(steps);
    const world = new World(gameData, 'whispering-grove', 1, { threats: false });
    expect(t.update(world)).toBe(false);
    expect(t.current?.id).toBe('grow');
  });

  it('avance quand le joueur accomplit l\'étape, et saute celles déjà faites', () => {
    const t = new Tutorial(steps);
    const world = new World(gameData, 'whispering-grove', 1, { threats: false });
    const heart = [...world.net.nodes.values()][0]!;
    const deposit = world.deposits.find((d) => d.layer !== 'surface')!;
    const tip = world.net.addNode('junction', deposit.x, deposit.y);
    world.net.addSegment(heart.id, tip.id, 'thin', true);
    expect(t.update(world)).toBe(true);
    // Filament poussé et cristal atteint : on en est à l'arbre.
    expect(t.current?.id).toBe('tree');
  });

  it('refuse une étape inconnue', () => {
    expect(() => new Tutorial([{ id: 'voler', text: '' }])).toThrow(/inconnue/);
  });

  it('finit après la sporée', () => {
    const t = new Tutorial(steps);
    t.index = steps.length - 1;
    const world = new World(gameData, 'whispering-grove', 1, { threats: false });
    world.sporeeYear = 1;
    t.update(world);
    expect(t.finished).toBe(true);
  });
});
