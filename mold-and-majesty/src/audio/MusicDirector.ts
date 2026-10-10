import type { Mood } from './AudioEngine';

/** Ce que la musique d'ambiance doit jouer à un instant donné. */
export interface MusicState {
  root: number;
  tempo: number;
  mood: Mood;
  /** Accord courant, en demi-tons au-dessus de la fondamentale. */
  chord: number[];
  /** Densité des arpèges (0..1). */
  density: number;
  /** Indice de l'accord dans la progression (change toutes les CHORD_MS). */
  step: number;
}

/** Durée d'un accord, en ms. */
export const CHORD_MS = 8000;

/** Progression d'accords et humeur de chaque saison. */
const SEASONS: Record<string, { mood: Mood; chords: number[][] }> = {
  spring: { mood: 'warm', chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 9]] },
  summer: { mood: 'hopeful', chords: [[0, 4, 7, 11], [2, 5, 9], [5, 9, 12], [7, 11, 14]] },
  autumn: { mood: 'sad', chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]] },
  winter: { mood: 'cold', chords: [[0, 7, 14], [-2, 5, 12], [-4, 3, 10], [-5, 2, 9]] },
};

/** Fondamentale de chaque biome (Hz) : chaque forêt a sa tonalité. */
const ROOTS: Record<string, number> = {
  temperate: 220,
  marsh: 196,
  burnt: 174.6,
  ice: 246.9,
  jungle: 233.1,
  ruins: 207.7,
  cave: 164.8,
  mother: 261.6,
};

/**
 * Musique d'ambiance qui évolue avec le réseau : un petit réseau ne fait entendre qu'une
 * nappe et quelques notes éparses ; en grandissant, les arpèges se densifient, le tempo
 * s'anime et les accords s'enrichissent (octave, puis neuvième). Le danger (catastrophe,
 * moisissure) assombrit l'humeur.
 */
export function musicFor(networkSize: number, seasonId: string, biome: string, timeMs: number, danger = false): MusicState {
  const season = SEASONS[seasonId] ?? SEASONS.spring!;
  const step = Math.floor(timeMs / CHORD_MS) % season.chords.length;
  const chord = [...season.chords[step]!];
  if (networkSize >= 40) chord.push(chord[0]! + 12);
  if (networkSize >= 100) chord.push(chord[0]! + 14);
  if (danger) chord[1] = chord[1]! - 1;
  return {
    root: ROOTS[biome] ?? 220,
    tempo: Math.round(52 + Math.min(32, networkSize / 4)),
    mood: danger ? 'tense' : season.mood,
    chord,
    density: Math.min(1, 0.08 + networkSize / 160),
    step,
  };
}
