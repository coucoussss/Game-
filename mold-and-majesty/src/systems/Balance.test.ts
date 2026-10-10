import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import { AutoPlayer } from './AutoPlayer';
import { campaignOrder } from './Profile';
import { World } from './World';

/**
 * Garde-fous d'équilibrage de la campagne, mesurés avec le joueur automatique
 * (deux ruches, axes vers les gisements, sporée en fin d'automne). Si l'un d'eux casse
 * après un réglage des JSON, la courbe de difficulté a changé : vérifier que c'est voulu.
 */
describe('courbe de difficulté', () => {
  const goals = campaignOrder(gameData).map((id) => gameData.forests.get(id)!.goal.reach);

  it('les objectifs croissent tout au long de la campagne', () => {
    for (let i = 1; i < goals.length; i++) expect(goals[i]).toBeGreaterThan(goals[i - 1]!);
  });

  const firstYear = (forest: string, rhythm: number) => new AutoPlayer(new World(gameData, forest, 2), rhythm).play(1).reaches[0]!;

  it('la première forêt se conquiert dès la première année, même avec un rythme moyen', () => {
    expect(firstYear('whispering-grove', 0.5)).toBeGreaterThanOrEqual(goals[0]!);
  }, 60000);

  it('l\'Arbre-Mère exige mieux qu\'une stratégie de débutant', () => {
    expect(firstYear('mother-tree', 0.5)).toBeLessThan(goals[goals.length - 1]!);
  }, 60000);
});
