import { NATIVE_WIDTH, TILE } from '../config';
import type { GameData } from '../data';
import type { ForestDef } from '../data/types';
import { Network } from '../entities/Network';
import { type FlowModifiers, stepNetwork } from './FlowSystem';
import { Random } from './Random';
import { type SeasonInfo, type WeatherState, rollWeather, seasonAt, seasonModifiers, stepWeather } from './SeasonSystem';
import { type Deposit, absorb, applyFrost, applyLitter, generateDeposits, layerBounds, stepMoisture } from './SoilSystem';

/**
 * État complet d'une partie et sa simulation, sans Phaser : réseau, calendrier,
 * météo, sol et mémoire. Un appel à `step()` = un tick.
 */
export class World {
  readonly net = new Network();
  readonly forest: ForestDef;
  readonly deposits: Deposit[];
  readonly rng: Random;
  /** Largeur jouable, en pixels (un seul écran tant que la caméra n'existe pas). */
  readonly widthPx: number;
  tick = 0;
  memory: number;
  /** Humidité du sol (0..1). */
  moisture: number;
  weather: WeatherState;
  private sporesCounted = 0;

  constructor(
    readonly data: GameData,
    forestId: string,
    seed = 1,
  ) {
    const forest = data.forests.get(forestId);
    if (!forest) throw new Error(`Forêt inconnue : "${forestId}"`);
    this.forest = forest;
    this.rng = new Random(seed);
    this.widthPx = Math.min(forest.widthTiles * TILE, NATIVE_WIDTH);
    this.deposits = generateDeposits(forest, this.widthPx, this.rng);
    this.memory = forest.startingResources.memory;
    this.net.spores = forest.startingResources.spores;
    this.sporesCounted = this.net.spores;

    const [top, bottom] = layerBounds(forest).humus;
    const { sugar, water, minerals } = forest.startingResources;
    this.net.addNode('heart', Math.round(this.widthPx / 2), Math.min(top + 16, bottom - 4), { sugar, water, minerals });

    this.weather = rollWeather(this.season.def, data.seasons, this.rng);
    this.moisture = data.seasons.weather[this.weather.id]!.moisture;
  }

  get season(): SeasonInfo {
    return seasonAt(this.tick, this.data.seasons);
  }

  get modifiers(): FlowModifiers {
    return seasonModifiers(this.season.def.rules, this.memory, this.data.seasons);
  }

  step(): void {
    const { seasons, soil, network } = this.data;
    const season = this.season;
    const rules = season.def.rules;
    const mods = this.modifiers;

    this.weather = stepWeather(this.weather, season.def, seasons, this.rng);
    this.moisture = stepMoisture(this.moisture, seasons.weather[this.weather.id]!.moisture, soil.moistureRate);
    absorb(this.net, this.deposits, soil, this.forest, this.moisture, rules.frozenSurface);
    applyLitter(this.deposits, rules.litter);
    applyFrost(this.net, network, this.forest, rules.frost, mods.decay);
    stepNetwork(this.net, network, mods);

    // La mémoire retient chaque spore et chaque saison traversée.
    const newSpores = this.net.spores - this.sporesCounted;
    this.sporesCounted = this.net.spores;
    this.memory += newSpores * seasons.memory.perSpore;

    this.tick++;
    if (this.tick % seasons.seasonLengthTicks === 0) {
      this.memory += seasons.memory.perSeason + this.net.segments.size * seasons.memory.perSegment;
    }
  }
}
