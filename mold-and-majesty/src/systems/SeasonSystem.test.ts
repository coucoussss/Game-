import { describe, expect, it } from 'vitest';
import { gameData } from '../data';
import { hexToInt } from '../ui/color';
import { Random } from './Random';
import { paletteAt, rollWeather, seasonAt, seasonModifiers, stepWeather } from './SeasonSystem';

const defs = gameData.seasons;
const L = defs.seasonLengthTicks;

describe('calendrier', () => {
  it('enchaîne printemps, été, automne, hiver puis change d\'année', () => {
    expect(seasonAt(0, defs).def.id).toBe('spring');
    expect(seasonAt(L, defs).def.id).toBe('summer');
    expect(seasonAt(2 * L, defs).def.id).toBe('autumn');
    expect(seasonAt(3 * L, defs).def.id).toBe('winter');
    const nextSpring = seasonAt(4 * L, defs);
    expect(nextSpring.def.id).toBe('spring');
    expect(nextSpring.year).toBe(2);
    expect(seasonAt(3 * L, defs).next.id).toBe('spring');
  });

  it('mesure l\'avancement dans la saison', () => {
    expect(seasonAt(L + L / 4, defs).progress).toBeCloseTo(0.25);
  });
});

describe('règles', () => {
  const rules = (id: string) => defs.seasons.find((s) => s.id === id)!.rules;

  it('chaque saison a sa vocation', () => {
    // Le printemps étend : la pousse y est la plus rapide et la moins chère.
    expect(rules('spring').growthSpeed).toBe(Math.max(...defs.seasons.map((s) => s.rules.growthSpeed)));
    expect(rules('spring').growthCost).toBe(Math.min(...defs.seasons.map((s) => s.rules.growthCost)));
    // L'été produit : production de sucre maximale (et arbres au plus actif, cf. allies.json).
    expect(rules('summer').sugarProduction).toBe(Math.max(...defs.seasons.map((s) => s.rules.sugarProduction)));
    // L'automne fructifie.
    expect(rules('autumn').fruiting).toBe(Math.max(...defs.seasons.map((s) => s.rules.fruiting)));
    // L'hiver : plus de sucre, entretien réduit, gel.
    expect(rules('winter').sugarProduction).toBe(0);
    expect(rules('winter').upkeep).toBeLessThan(rules('summer').upkeep);
    expect(rules('winter').frost).toBeGreaterThan(0);
  });

  it('la mémoire réduit le dépérissement', () => {
    expect(seasonModifiers(rules('winter'), 0, defs).decay).toBe(1);
    expect(seasonModifiers(rules('winter'), 50, defs).decay).toBeLessThan(1);
  });
});

describe('palette', () => {
  it('reste celle de la saison au début, puis glisse vers la suivante', () => {
    const summer = defs.seasons[1]!.palette;
    const autumn = defs.seasons[2]!.palette;
    expect(paletteAt(seasonAt(L, defs), defs).leaf).toBe(hexToInt(summer.leaf));
    expect(paletteAt(seasonAt(2 * L - 1, defs), defs).leaf).toBe(hexToInt(autumn.leaf));
    const mid = paletteAt(seasonAt(L + Math.round(L * (1 - defs.paletteBlend / 2)), defs), defs);
    expect(mid.leaf).not.toBe(hexToInt(summer.leaf));
    expect(mid.leaf).not.toBe(hexToInt(autumn.leaf));
  });

  it('les arbres perdent leurs feuilles avant l\'hiver et la neige vient avec lui', () => {
    const endOfAutumn = paletteAt(seasonAt(3 * L - 1, defs), defs);
    expect(endOfAutumn.leafDensity).toBeCloseTo(0, 2);
    expect(paletteAt(seasonAt(3 * L + 10, defs), defs).snow).toBe(1);
  });
});

describe('météo', () => {
  it('ne tire que des météos permises par la saison', () => {
    const rng = new Random(3);
    const summer = defs.seasons[1]!;
    for (let i = 0; i < 200; i++) expect(summer.weather).toHaveProperty(rollWeather(summer, defs, rng).id);
  });

  it('dure entre minTicks et maxTicks, puis change', () => {
    const rng = new Random(5);
    const spring = defs.seasons[0]!;
    let state = rollWeather(spring, defs, rng);
    const w = defs.weather[state.id]!;
    expect(state.ticksLeft).toBeGreaterThanOrEqual(w.minTicks);
    expect(state.ticksLeft).toBeLessThanOrEqual(w.maxTicks);
    state = { id: state.id, ticksLeft: 1 };
    const next = stepWeather(state, spring, defs, rng);
    expect(next.ticksLeft).toBeGreaterThan(1);
  });

  it('change immédiatement si la nouvelle saison ne la permet pas', () => {
    const rng = new Random(9);
    const summer = defs.seasons[1]!;
    const next = stepWeather({ id: 'snow', ticksLeft: 5000 }, summer, defs, rng);
    expect(next.id).not.toBe('snow');
  });
});
