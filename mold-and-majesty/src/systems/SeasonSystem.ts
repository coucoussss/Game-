import type { SeasonDef, SeasonPalette, SeasonRules, SeasonsDef } from '../data/types';
import { hexToInt, lerpColor } from '../ui/color';
import type { FlowModifiers } from './FlowSystem';
import type { Random } from './Random';

export interface SeasonInfo {
  index: number;
  def: SeasonDef;
  next: SeasonDef;
  /** Avancement dans la saison (0..1). */
  progress: number;
  /** Année, à partir de 1. */
  year: number;
}

/** Saison correspondant à un tick donné. Les saisons s'enchaînent dans l'ordre de seasons.json. */
export function seasonAt(tick: number, defs: SeasonsDef): SeasonInfo {
  const count = defs.seasons.length;
  const elapsed = Math.floor(tick / defs.seasonLengthTicks);
  const index = elapsed % count;
  return {
    index,
    def: defs.seasons[index]!,
    next: defs.seasons[(index + 1) % count]!,
    progress: (tick % defs.seasonLengthTicks) / defs.seasonLengthTicks,
    year: Math.floor(elapsed / count) + 1,
  };
}

/** Multiplicateurs de simulation pour une saison, compte tenu de la mémoire du réseau. */
export function seasonModifiers(rules: SeasonRules, memory: number, defs: SeasonsDef): FlowModifiers {
  return {
    sugarProduction: rules.sugarProduction,
    mineralTrade: rules.mineralTrade,
    tradeRatio: rules.tradeRatio,
    growthSpeed: rules.growthSpeed,
    growthCost: rules.growthCost,
    upkeep: rules.upkeep,
    fruiting: rules.fruiting,
    decay: 1 / (1 + memory * defs.memory.decayReduction),
  };
}

/** Palette avec les couleurs converties en entiers. */
export type ResolvedPalette = { [K in keyof SeasonPalette]: number };

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Palette à l'instant donné : celle de la saison, qui glisse vers la suivante pendant la
 * dernière part `paletteBlend` de la saison. C'est l'horloge visible du jeu : les feuilles
 * jaunissent avant l'automne, tombent avant l'hiver, bourgeonnent avant le printemps.
 */
export function paletteAt(info: SeasonInfo, defs: SeasonsDef): ResolvedPalette {
  const start = 1 - defs.paletteBlend;
  const t = info.progress <= start ? 0 : smoothstep((info.progress - start) / defs.paletteBlend);
  const a = info.def.palette;
  const b = info.next.palette;
  const color = (key: 'sky' | 'leaf' | 'leafAlt' | 'trunk' | 'surface' | 'humus' | 'deep') =>
    lerpColor(hexToInt(a[key]), hexToInt(b[key]), t);
  return {
    sky: color('sky'),
    leaf: color('leaf'),
    leafAlt: color('leafAlt'),
    trunk: color('trunk'),
    surface: color('surface'),
    humus: color('humus'),
    deep: color('deep'),
    leafDensity: a.leafDensity + (b.leafDensity - a.leafDensity) * t,
    snow: a.snow + (b.snow - a.snow) * t,
  };
}

export interface WeatherState {
  id: string;
  /** Ticks restants avant le prochain changement de temps. */
  ticksLeft: number;
}

/** Tire une nouvelle météo parmi celles permises par la saison. */
export function rollWeather(season: SeasonDef, defs: SeasonsDef, rng: Random): WeatherState {
  const id = rng.weighted(season.weather);
  const w = defs.weather[id]!;
  return { id, ticksLeft: rng.int(w.minTicks, w.maxTicks) };
}

/**
 * Fait avancer la météo d'un tick. Elle change à l'expiration de sa durée, ou
 * immédiatement si la saison qui commence ne la permet pas (pas de neige en été).
 */
export function stepWeather(state: WeatherState, season: SeasonDef, defs: SeasonsDef, rng: Random): WeatherState {
  if (state.ticksLeft <= 1 || !(state.id in season.weather)) return rollWeather(season, defs, rng);
  return { id: state.id, ticksLeft: state.ticksLeft - 1 };
}
