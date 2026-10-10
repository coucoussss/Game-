import type { AllySpeciesId, BetrayalKind } from '../data/types';

/**
 * Faits marquants de la simulation, destinés à l'affichage (animations, bandeaux).
 * La simulation les empile ; la scène les consomme à chaque image.
 */
export type WorldEvent =
  | { type: 'betrayal'; allyId: number; kind: BetrayalKind; x: number; y: number; tx: number; ty: number }
  | { type: 'arrive' | 'leave'; allyId: number; species: AllySpeciesId }
  | { type: 'infection'; nodeId: number; fromNodeId: number | null }
  | { type: 'climate'; eventId: string; name: string; phase: 'start' | 'end' }
  | { type: 'rival'; colonyId: number; phase: 'spawn' | 'defeated'; x: number; y: number };

export type Emit = (event: WorldEvent) => void;
