import { GROUND_Y, NATIVE_WIDTH, TILE } from '../config';
import type { GameData } from '../data';
import type { AllySpeciesId, ForestDef } from '../data/types';
import { ALLY_SPECIES } from '../data/types';
import type { Ally } from '../entities/Ally';
import { Network } from '../entities/Network';
import type { RivalColony } from '../entities/Rival';
import { createAlly, habitatBand, stepAllies } from './AllySystem';
import {
  type ActiveClimate,
  type ClimateContext,
  applyClimate,
  onClimateEnd,
  onClimateStart,
  rollClimate,
  startClimate,
} from './ClimateSystem';
import type { WorldEvent } from './events';
import { type FlowModifiers, stepNetwork } from './FlowSystem';
import { seedInfection, stepParasites } from './ParasiteSystem';
import { Random } from './Random';
import { type RivalContext, spawnColony, stepRivals } from './RivalSystem';
import { type SeasonInfo, type WeatherState, rollWeather, seasonAt, seasonModifiers, stepWeather } from './SeasonSystem';
import { type Deposit, absorb, applyFrost, applyLitter, generateDeposits, layerBounds, stepMoisture } from './SoilSystem';

export interface WorldOptions {
  /** Moisissures, parasites et événements climatiques (désactivables pour les tests d'équilibrage). */
  threats?: boolean;
}

/** Nombre maximal d'événements gardés en attente quand personne ne les consomme. */
const MAX_PENDING_EVENTS = 200;

/**
 * État complet d'une partie et sa simulation, sans Phaser : réseau, calendrier, météo,
 * sol, mémoire, alliés et menaces. Un appel à `step()` = un tick.
 */
export class World {
  readonly net = new Network();
  readonly forest: ForestDef;
  readonly deposits: Deposit[];
  readonly allies: Ally[] = [];
  readonly colonies: RivalColony[] = [];
  readonly rng: Random;
  /** Faits marquants à animer ; la scène les vide à chaque image. */
  readonly events: WorldEvent[] = [];
  /** Largeur jouable, en pixels (un seul écran tant que la caméra n'existe pas). */
  readonly widthPx: number;
  readonly threats: boolean;
  tick = 0;
  memory: number;
  /** Humidité du sol (0..1). */
  moisture: number;
  weather: WeatherState;
  climate: ActiveClimate | null = null;
  private sporesCounted = 0;
  private nextId = 1;

  constructor(
    readonly data: GameData,
    forestId: string,
    seed = 1,
    options: WorldOptions = {},
  ) {
    const forest = data.forests.get(forestId);
    if (!forest) throw new Error(`Forêt inconnue : "${forestId}"`);
    this.forest = forest;
    this.threats = options.threats ?? true;
    this.rng = new Random(seed);
    this.widthPx = Math.min(forest.widthTiles * TILE, NATIVE_WIDTH);
    this.deposits = generateDeposits(forest, this.widthPx, this.rng);
    this.memory = forest.startingResources.memory;
    this.net.spores = forest.startingResources.spores;
    this.sporesCounted = this.net.spores;

    const [top, bottom] = layerBounds(forest).humus;
    const { sugar, water, minerals } = forest.startingResources;
    const heart = this.net.addNode('heart', Math.round(this.widthPx / 2), Math.min(top + 16, bottom - 4), {
      sugar,
      water,
      minerals,
    });
    this.plantTrees(heart.x, heart.y);
    for (const species of ALLY_SPECIES) {
      if (species === 'tree') continue;
      for (let i = 0; i < forest.allies[species]; i++) this.spawnAlly(species, false);
    }

    this.weather = rollWeather(this.season.def, data.seasons, this.rng);
    this.moisture = data.seasons.weather[this.weather.id]!.moisture;
  }

  get season(): SeasonInfo {
    return seasonAt(this.tick, this.data.seasons);
  }

  get modifiers(): FlowModifiers {
    return seasonModifiers(this.season.def.rules, this.memory, this.data.seasons);
  }

  /** Les arbres sont répartis sur la largeur ; le premier, l'arbre-mère, plonge ses racines vers le cœur. */
  private plantTrees(heartX: number, heartY: number): void {
    const count = this.forest.allies.tree;
    const slot = this.widthPx / Math.max(1, count);
    const humusTop = layerBounds(this.forest).humus[0];
    for (let i = 0; i < count; i++) {
      const mother = i === 0;
      const x = mother ? heartX - 3 : Math.round(((i + Math.floor(count / 2) + 0.5) % count) * slot + this.rng.int(-8, 8));
      const tree = createAlly(this.nextId++, 'tree', this.data.allies, x, GROUND_Y - 1, this.rng);
      tree.height = 34 + this.rng.int(0, 12);
      for (let r = 0; r < 3; r++) {
        let rx = x + 3;
        let ry = GROUND_Y;
        for (let s = 0; s < 4; s++) {
          if (mother && r === 0) {
            rx += Math.round((heartX - rx) / (4 - s));
            ry += Math.round((heartY - 8 - ry) / (4 - s));
          } else {
            rx += this.rng.int(-6, 6);
            ry += this.rng.int(3, 7);
            if (ry >= humusTop + 10) break;
          }
          tree.roots.push({ x: rx, y: ry });
        }
      }
      this.allies.push(tree);
    }
  }

  /** Fait apparaître un allié mobile : au hasard dans son habitat, ou à l'orée de la forêt. */
  private spawnAlly(species: AllySpeciesId, fromEdge: boolean): Ally {
    const def = this.data.allies.species[species];
    const [top, bottom] = habitatBand(def.habitat, this.forest);
    const x = fromEdge ? (this.rng.next() < 0.5 ? -4 : this.widthPx + 4) : this.rng.int(10, this.widthPx - 10);
    const ally = createAlly(this.nextId++, species, this.data.allies, x, this.rng.int(Math.round(top), Math.round(bottom)), this.rng);
    if (fromEdge) {
      ally.tx = this.rng.int(20, this.widthPx - 20);
      ally.ty = ally.y;
      this.emit({ type: 'arrive', allyId: ally.id, species });
    }
    this.allies.push(ally);
    return ally;
  }

  /** À chaque saison, de nouveaux alliés remplacent ceux qui sont partis. */
  private replenishAllies(): void {
    for (const species of ALLY_SPECIES) {
      if (species === 'tree') continue;
      const present = this.allies.filter((a) => a.species === species).length;
      if ((this.data.allies.species[species].activity[this.season.def.id] ?? 0) <= 0) continue;
      for (let i = present; i < this.forest.allies[species]; i++) this.spawnAlly(species, true);
    }
  }

  private emit = (event: WorldEvent): void => {
    this.events.push(event);
    if (this.events.length > MAX_PENDING_EVENTS) this.events.shift();
  };

  step(): void {
    const { seasons, soil, network, threats } = this.data;
    const season = this.season;
    const rules = season.def.rules;
    const mods = this.modifiers;

    this.weather = stepWeather(this.weather, season.def, seasons, this.rng);
    this.stepClimate();
    const c = this.climate;
    const weatherMoisture = seasons.weather[this.weather.id]!.moisture;
    const target = c?.kind === 'drought' ? 0 : c?.kind === 'flood' ? 1 : weatherMoisture;
    const rate = c?.kind === 'drought' || c?.kind === 'flood' ? soil.moistureRate * 4 : soil.moistureRate;
    this.moisture = stepMoisture(this.moisture, target, rate);

    const coldSnap = c?.kind === 'frost' ? c.intensity : 0;
    absorb(this.net, this.deposits, soil, this.forest, this.moisture, rules.frozenSurface || coldSnap > 0);
    applyLitter(this.deposits, rules.litter);
    applyFrost(this.net, network, this.forest, Math.max(rules.frost, coldSnap), mods.decay);
    if (c) applyClimate(c, this.climateContext());

    stepAllies(this.allies, {
      net: this.net,
      defs: this.data.allies,
      forest: this.forest,
      deposits: this.deposits,
      season: season.def,
      widthPx: this.widthPx,
      rng: this.rng,
      tick: this.tick,
      emit: this.emit,
    });

    if (this.threats) {
      const defeated = stepRivals(this.colonies, this.rivalContext(), true);
      this.memory += defeated * threats.rivals.victoryMemory;
      stepParasites(this.parasiteContext(), true);
    }

    stepNetwork(this.net, network, mods);

    // La mémoire retient chaque spore et chaque saison traversée.
    const newSpores = this.net.spores - this.sporesCounted;
    this.sporesCounted = this.net.spores;
    this.memory += newSpores * seasons.memory.perSpore;

    this.tick++;
    if (this.tick % seasons.seasonLengthTicks === 0) {
      this.memory += seasons.memory.perSeason + this.net.segments.size * seasons.memory.perSegment;
      this.replenishAllies();
    }
  }

  private rivalContext(): RivalContext {
    return {
      net: this.net,
      netDefs: this.data.network,
      threats: this.data.threats,
      forest: this.forest,
      deposits: this.deposits,
      season: this.season.def,
      widthPx: this.widthPx,
      rng: this.rng,
      decay: this.modifiers.decay,
      emit: this.emit,
      nextId: () => this.nextId++,
    };
  }

  private parasiteContext() {
    return {
      net: this.net,
      netDefs: this.data.network,
      threats: this.data.threats,
      season: this.season.def,
      rng: this.rng,
      emit: this.emit,
    };
  }

  /** Fait apparaître une moisissure rivale (débogage, tests). */
  spawnRival(kind?: string): RivalColony | null {
    return spawnColony(this.colonies, this.rivalContext(), kind);
  }

  /** Infecte un nœud au hasard (débogage, tests). */
  seedParasites(): number | null {
    return seedInfection(this.parasiteContext());
  }

  private climateContext(): ClimateContext {
    return {
      net: this.net,
      netDefs: this.data.network,
      forest: this.forest,
      deposits: this.deposits,
      allies: this.allies,
      decay: this.modifiers.decay,
      emit: this.emit,
    };
  }

  /** Déclenche, fait durer ou termine l'événement climatique. */
  private stepClimate(): void {
    if (this.climate) {
      if (--this.climate.ticksLeft <= 0) {
        onClimateEnd(this.climate, this.climateContext());
        this.climate = null;
      }
      return;
    }
    if (!this.threats || this.rng.next() >= this.data.eventChance) return;
    const allowed = this.forest.events.map((id) => this.data.events.get(id)!);
    const def = rollClimate(allowed, this.season.def, this.rng);
    if (!def) return;
    this.startClimate(def.id);
  }

  /** Lance un événement climatique précis (débogage, tests). */
  startClimate(eventId: string): ActiveClimate {
    const def = this.data.events.get(eventId);
    if (!def) throw new Error(`Événement inconnu : "${eventId}"`);
    this.climate = startClimate(def, this.rng, this.widthPx);
    onClimateStart(this.climate, this.climateContext());
    return this.climate;
  }
}
