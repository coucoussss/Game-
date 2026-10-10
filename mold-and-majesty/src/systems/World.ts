import { GROUND_Y, NATIVE_WIDTH, PLAY_BOTTOM, TILE } from '../config';
import type { GameData } from '../data';
import type { AllySpeciesId, ForestDef } from '../data/types';
import { ALLY_SPECIES } from '../data/types';
import type { Ally } from '../entities/Ally';
import { Network, type NetworkSnapshot } from '../entities/Network';
import { type RivalCell, type RivalColony, cellKey } from '../entities/Rival';
import { createAlly, habitatBand, stepAllies } from './AllySystem';
import {
  type ActiveClimate,
  type ClimateContext,
  TREE_REGROWTH,
  applyClimate,
  onClimateEnd,
  onClimateStart,
  rollClimate,
  startClimate,
} from './ClimateSystem';
import type { WorldEvent } from './events';
import { type FlowModifiers, stepNetwork } from './FlowSystem';
import { seedInfection, stepParasites } from './ParasiteSystem';
import { applyForestRules } from './ForestRules';
import { Random } from './Random';
import { sporeReach } from './RhythmGame';
import { applyBonuses, computeBonuses, unlockStatus } from './Skills';
import { type RivalContext, spawnColony, stepRivals } from './RivalSystem';
import { type SeasonInfo, type WeatherState, rollWeather, seasonAt, seasonModifiers, stepWeather } from './SeasonSystem';
import { type Deposit, absorb, applyFrost, applyLitter, generateDeposits, layerBounds, stepMoisture } from './SoilSystem';

export interface WorldOptions {
  /** Moisissures, parasites et événements climatiques (désactivables pour les tests d'équilibrage). */
  threats?: boolean;
  /** Compétences déjà acquises (progression du profil). */
  skills?: Iterable<string>;
  /** Mémoire de départ (banque du profil) ; par défaut, celle de la forêt. */
  memory?: number;
}

/** État complet et sérialisable d'une partie (sauvegarde). */
export interface WorldSnapshot {
  forest: ForestDef;
  seed: number;
  threats: boolean;
  rngState: number;
  tick: number;
  memory: number;
  moisture: number;
  weather: WeatherState;
  climate: ActiveClimate | null;
  skills: string[];
  sporeeYear: number;
  lastReach: number;
  bestReach: number;
  sporesCounted: number;
  nextId: number;
  lastSeasonIndex: number;
  net: NetworkSnapshot;
  allies: Ally[];
  colonies: { id: number; kind: string; cells: RivalCell[] }[];
  deposits: Deposit[];
  obstacles: Obstacle[];
}

/** Résultat d'une sporée d'automne. */
export interface SporeeResult {
  score: number;
  released: number;
  reach: number;
  memoryGained: number;
}

/** Rectangle infranchissable (gravats, béton). */
export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dégâts de noyade de la nappe d'eau permanente (× `decay` de l'épaisseur). */
const WATER_TABLE_DAMAGE = 1.5;

/** Nombre maximal d'événements gardés en attente quand personne ne les consomme. */
const MAX_PENDING_EVENTS = 200;

/**
 * État complet d'une partie et sa simulation, sans Phaser : réseau, calendrier, météo,
 * sol, mémoire, alliés et menaces. Un appel à `step()` = un tick.
 */
export class World {
  net = new Network();
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
  /** Données effectives : celles des JSON, modifiées par la forêt puis par les compétences. */
  data: GameData;
  /** Données modifiées par la seule règle de la forêt. */
  private readonly forestData: GameData;
  readonly obstacles: Obstacle[] = [];
  readonly skills: Set<string>;
  /** Année de la dernière sporée (une seule par automne). */
  sporeeYear = 0;
  lastReach = 0;
  bestReach = 0;
  tick = 0;
  memory: number;
  /** Humidité du sol (0..1). */
  moisture: number;
  weather: WeatherState;
  climate: ActiveClimate | null = null;
  private sporesCounted = 0;
  private nextId = 1;
  private lastSeasonIndex = 0;

  constructor(
    readonly baseData: GameData,
    forestOrId: string | ForestDef,
    readonly seed = 1,
    options: WorldOptions = {},
  ) {
    const forest = typeof forestOrId === 'string' ? baseData.forests.get(forestOrId) : forestOrId;
    if (!forest) throw new Error(`Forêt inconnue : "${String(forestOrId)}"`);
    this.forest = forest;
    this.threats = options.threats ?? true;
    this.skills = new Set(options.skills ?? []);
    this.forestData = applyForestRules(baseData, forest);
    this.data = applyBonuses(this.forestData, computeBonuses(this.skills, baseData.skills));
    const data = this.data;
    this.rng = new Random(seed);
    this.widthPx = Math.min(forest.widthTiles * TILE, NATIVE_WIDTH);
    this.deposits = generateDeposits(forest, this.widthPx, this.rng);
    this.memory = options.memory ?? forest.startingResources.memory;
    this.net.spores = forest.startingResources.spores;
    this.sporesCounted = this.net.spores;

    const [top, bottom] = layerBounds(forest).humus;
    const { sugar, water, minerals } = forest.startingResources;
    const heart = this.net.addNode('heart', Math.round(this.widthPx / 2), Math.min(top + 16, bottom - 4), {
      sugar,
      water,
      minerals,
    });
    this.placeObstacles(heart.x, heart.y);
    this.plantTrees(heart.x, heart.y);
    for (const species of ALLY_SPECIES) {
      if (species === 'tree') continue;
      for (let i = 0; i < forest.allies[species]; i++) this.spawnAlly(species, false);
    }

    this.weather = rollWeather(this.season.def, data.seasons, this.rng);
    this.moisture = Math.max(forest.rules.minMoisture ?? 0, data.seasons.weather[this.weather.id]!.moisture);
  }

  /** Gravats et blocs de béton : ni filament ni moisissure ne les traversent. */
  private placeObstacles(heartX: number, heartY: number): void {
    const count = this.forest.rules.obstacles ?? 0;
    const bounds = layerBounds(this.forest);
    for (let i = 0, attempts = 0; i < count && attempts < count * 20; attempts++) {
      const w = this.rng.int(8, 22);
      const h = this.rng.int(4, 10);
      const x = this.rng.int(4, this.widthPx - w - 4);
      const y = this.rng.int(bounds.surface[1] + 4, PLAY_BOTTOM - h);
      if (Math.hypot(x + w / 2 - heartX, y + h / 2 - heartY) < 40) continue;
      this.obstacles.push({ x, y, w, h });
      i++;
    }
    // Pas de gisement enfoui sous le béton.
    for (let i = this.deposits.length - 1; i >= 0; i--) {
      if (this.isBlocked(this.deposits[i]!.x, this.deposits[i]!.y)) this.deposits.splice(i, 1);
    }
  }

  /** Le point est-il dans un obstacle ? */
  isBlocked(x: number, y: number): boolean {
    return this.obstacles.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  }

  /** Ordonnée de la surface de la nappe d'eau permanente (ou null). */
  get waterTableY(): number | null {
    const share = this.forest.rules.waterTable ?? 0;
    if (share <= 0) return null;
    const bounds = layerBounds(this.forest);
    const bottom = Math.min(bounds.deep[1], PLAY_BOTTOM);
    return Math.round(bottom - (bottom - bounds.humus[0]) * share);
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
      const giant = mother && this.forest.rules.motherTree;
      tree.height = giant ? 72 : 34 + this.rng.int(0, 12);
      tree.size = giant ? 3 : 1;
      for (let r = 0; r < (giant ? 6 : 3); r++) {
        let rx = x + 3;
        let ry = GROUND_Y;
        for (let s = 0; s < 4; s++) {
          if (mother && r === 0) {
            rx += Math.round((heartX - rx) / (4 - s));
            ry += Math.round((heartY - 8 - ry) / (4 - s));
          } else {
            rx += this.rng.int(-6, 6);
            ry += this.rng.int(3, 7);
            if (ry >= humusTop + (giant ? 30 : 10)) break;
          }
          tree.roots.push({ x: rx, y: ry });
        }
      }
      if (!mother && this.rng.next() < (this.forest.rules.burntTrees ?? 0)) {
        tree.state = 'burnt';
        tree.cooldown = this.rng.int(TREE_REGROWTH / 4, TREE_REGROWTH);
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
    this.moisture = Math.max(this.forest.rules.minMoisture ?? 0, stepMoisture(this.moisture, target, rate));

    const coldSnap = c?.kind === 'frost' ? c.intensity : 0;
    absorb(this.net, this.deposits, soil, this.forest, this.moisture, rules.frozenSurface || coldSnap > 0);
    applyLitter(this.deposits, rules.litter);
    applyFrost(this.net, network, this.forest, Math.max(rules.frost, coldSnap), mods.decay);
    if (c) applyClimate(c, this.climateContext());
    this.drownBelowWaterTable(mods.decay);

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
    const index = this.season.index;
    if (index !== this.lastSeasonIndex) {
      this.lastSeasonIndex = index;
      this.memory += seasons.memory.perSeason + this.net.segments.size * seasons.memory.perSegment;
      this.replenishAllies();
    }
  }

  /** La nappe d'eau noie les filaments qui y plongent ; les épais tiennent plus longtemps. */
  private drownBelowWaterTable(decay: number): void {
    const level = this.waterTableY;
    if (level === null) return;
    for (const seg of this.net.segments.values()) {
      if (seg.growth < 1 || this.net.midpoint(seg).y < level) continue;
      seg.health -= this.data.network.thickness[seg.thickness].decay * WATER_TABLE_DAMAGE * decay;
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
      blocked: (x, y) => this.isBlocked(x, y),
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

  /** Photographie l'état complet de la partie. */
  snapshot(): WorldSnapshot {
    return structuredClone({
      forest: this.forest,
      seed: this.seed,
      threats: this.threats,
      rngState: this.rng.state,
      tick: this.tick,
      memory: this.memory,
      moisture: this.moisture,
      weather: this.weather,
      climate: this.climate,
      skills: [...this.skills],
      sporeeYear: this.sporeeYear,
      lastReach: this.lastReach,
      bestReach: this.bestReach,
      sporesCounted: this.sporesCounted,
      nextId: this.nextId,
      lastSeasonIndex: this.lastSeasonIndex,
      net: this.net.snapshot(),
      allies: this.allies,
      colonies: this.colonies.map((c) => ({ id: c.id, kind: c.kind, cells: [...c.cells.values()] })),
      deposits: this.deposits,
      obstacles: this.obstacles,
    });
  }

  /** Recrée une partie depuis une sauvegarde : la simulation reprend exactement là où elle était. */
  static restore(baseData: GameData, snap: WorldSnapshot): World {
    const world = new World(baseData, snap.forest, snap.seed, { threats: snap.threats, skills: snap.skills, memory: snap.memory });
    const s = structuredClone(snap);
    world.net = Network.fromSnapshot(s.net);
    world.rng.state = s.rngState;
    world.tick = s.tick;
    world.moisture = s.moisture;
    world.weather = s.weather;
    world.climate = s.climate;
    world.sporeeYear = s.sporeeYear;
    world.lastReach = s.lastReach;
    world.bestReach = s.bestReach;
    world.sporesCounted = s.sporesCounted;
    world.nextId = s.nextId;
    world.lastSeasonIndex = s.lastSeasonIndex;
    world.allies.splice(0, world.allies.length, ...s.allies);
    world.colonies.splice(
      0,
      world.colonies.length,
      ...s.colonies.map((c) => ({ id: c.id, kind: c.kind, cells: new Map(c.cells.map((cell) => [cellKey(cell.gx, cell.gy), cell])) })),
    );
    world.deposits.splice(0, world.deposits.length, ...s.deposits);
    world.obstacles.splice(0, world.obstacles.length, ...s.obstacles);
    world.events.length = 0;
    return world;
  }

  /** Aligne les compétences sur celles du profil et recalcule les données effectives. */
  syncSkills(ids: Iterable<string>): void {
    for (const id of ids) this.skills.add(id);
    this.data = applyBonuses(this.forestData, computeBonuses(this.skills, this.baseData.skills));
  }

  /** Achète une compétence avec de la mémoire. Retourne false si c'est impossible. */
  unlockSkill(id: string): boolean {
    const skill = this.baseData.skills.skills.find((s) => s.id === id);
    if (!skill || unlockStatus(skill, this.skills, this.memory) !== 'available') return false;
    this.memory -= skill.cost;
    this.skills.add(id);
    this.data = applyBonuses(this.forestData, computeBonuses(this.skills, this.baseData.skills));
    return true;
  }

  /** Ruches opérationnelles du réseau. */
  get hives(): number {
    return [...this.net.nodes.values()].filter((n) => n.kind === 'fruiting' && n.build >= 1).length;
  }

  /** La sporée est possible une fois par automne, avec au moins une ruche et quelques spores. */
  canSporulate(): boolean {
    const season = this.season;
    return (
      season.def.id === 'autumn' &&
      this.sporeeYear < season.year &&
      this.hives > 0 &&
      this.net.spores >= this.data.sporulation.minSpores
    );
  }

  /** Libère les spores selon le score du mini-jeu rythmique. */
  sporulate(score: number): SporeeResult {
    const def = this.data.sporulation;
    const released = this.net.spores;
    const reach = sporeReach(def, released, score);
    const memoryGained = reach * def.memoryPerMeter;
    this.net.spores = 0;
    this.sporesCounted = 0;
    this.memory += memoryGained;
    this.sporeeYear = this.season.year;
    this.lastReach = reach;
    this.bestReach = Math.max(this.bestReach, reach);
    this.emit({ type: 'sporee', reach, score });
    return { score, released, reach, memoryGained };
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
