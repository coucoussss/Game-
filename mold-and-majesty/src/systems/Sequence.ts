/*
 * Séquences scriptées (souvenirs) : un état (acteurs, caméra, fondu, teinte) calculé
 * pour n'importe quel instant à partir d'une liste de repères JSON, et des repères
 * ponctuels (particules, secousse, son, musique, titre) à déclencher au passage.
 * Sans Phaser : la scène MemoryScene ne fait qu'afficher cet état.
 */

export type Ease = 'linear' | 'sine' | 'quad' | 'back';

export interface ActorProps {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  angle: number;
}

export interface SequenceActorDef extends Partial<ActorProps> {
  id: string;
  sprite: string;
  /** Images par seconde de l'animation (0 = image fixe). */
  fps?: number;
  flipX?: boolean;
  tint?: string;
  depth?: number;
}

export interface CameraProps {
  x: number;
  y: number;
  zoom: number;
}

export interface SequenceCue {
  /** Instant du repère, en ms. */
  t: number;
  /** Durée d'une transition, en ms (0 = immédiat). */
  duration?: number;
  ease?: Ease;
  /** Transition d'un acteur vers ces valeurs. */
  actor?: string;
  to?: Partial<ActorProps>;
  /** Transition de caméra (centre et zoom). */
  camera?: Partial<CameraProps>;
  /** Fondu au noir : opacité visée (1 = noir complet). */
  fade?: number;
  /** Voile coloré : couleur et opacité visée. */
  tint?: { color: string; alpha: number };
  /** Repères ponctuels. */
  particles?: { preset: string; x: number; y: number; width?: number; duration: number };
  shake?: number;
  sfx?: string;
  music?: { chord: number[] };
  title?: string;
}

export interface MusicDef {
  /** Fréquence fondamentale (Hz) et tempo des arpèges. */
  root: number;
  tempo: number;
  mood: 'warm' | 'sad' | 'tense' | 'cold' | 'hopeful';
}

export interface BackdropDef {
  sky: string;
  soil: string;
  /** Ordonnée de la surface du sol. */
  surfaceY: number;
  /** Éléments de décor dessinés par code. */
  features: string[];
}

export interface MemoryDef {
  id: string;
  numeral: string;
  title: string;
  /** Durée totale, en ms. */
  duration: number;
  backdrop: BackdropDef;
  music: MusicDef;
  actors: SequenceActorDef[];
  cues: SequenceCue[];
}

export interface SequenceState {
  actors: Record<string, ActorProps>;
  camera: CameraProps;
  fade: number;
  tint: { color: string; alpha: number };
}

const EASES: Record<Ease, (k: number) => number> = {
  linear: (k) => k,
  sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
  quad: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Avancement (0..1, adouci) d'un repère à l'instant t. */
function progress(cue: SequenceCue, t: number): number {
  if (!cue.duration) return 1;
  const k = Math.min(1, Math.max(0, (t - cue.t) / cue.duration));
  return EASES[cue.ease ?? 'sine'](k);
}

/** Valeurs de départ : la caméra au centre de l'écran, sans fondu ni voile. */
export function initialState(def: MemoryDef, screen = { w: 384, h: 216 }): SequenceState {
  const actors: Record<string, ActorProps> = {};
  for (const a of def.actors) {
    actors[a.id] = { x: a.x ?? 0, y: a.y ?? 0, alpha: a.alpha ?? 1, scale: a.scale ?? 1, angle: a.angle ?? 0 };
  }
  return { actors, camera: { x: screen.w / 2, y: screen.h / 2, zoom: 1 }, fade: 0, tint: { color: '#000000', alpha: 0 } };
}

/**
 * État de la séquence à l'instant t. Les repères sont appliqués dans l'ordre : chacun
 * part de la valeur laissée par les précédents. Deux transitions d'une même propriété
 * ne doivent pas se chevaucher (vérifié par `validateSequence`).
 */
export function evaluate(def: MemoryDef, t: number): SequenceState {
  const state = initialState(def);
  const cues = [...def.cues].sort((a, b) => a.t - b.t);
  for (const cue of cues) {
    if (cue.t > t) break;
    const k = progress(cue, t);
    if (cue.actor && cue.to) {
      const actor = state.actors[cue.actor]!;
      for (const [prop, target] of Object.entries(cue.to) as [keyof ActorProps, number][]) {
        actor[prop] = lerp(actor[prop], target, k);
      }
    }
    if (cue.camera) {
      for (const [prop, target] of Object.entries(cue.camera) as [keyof CameraProps, number][]) {
        state.camera[prop] = lerp(state.camera[prop], target, k);
      }
    }
    if (cue.fade !== undefined) state.fade = lerp(state.fade, cue.fade, k);
    if (cue.tint) {
      // Le voile change de couleur immédiatement et ajuste son opacité en douceur.
      state.tint.color = cue.tint.color;
      state.tint.alpha = lerp(state.tint.alpha, cue.tint.alpha, k);
    }
  }
  return state;
}

/** Repères ponctuels dont l'instant tombe dans [t0, t1). */
export function cuesBetween(def: MemoryDef, t0: number, t1: number): SequenceCue[] {
  return def.cues.filter(
    (c) => c.t >= t0 && c.t < t1 && (c.particles || c.shake !== undefined || c.sfx || c.music || c.title),
  );
}

/** Vérifie une séquence : acteurs et sprites connus, repères dans la durée, pas de transitions qui se chevauchent. */
export function validateSequence(def: MemoryDef, sprites: ReadonlySet<string>): void {
  const label = `Souvenir "${def.id}"`;
  const ids = new Set<string>();
  for (const a of def.actors) {
    if (ids.has(a.id)) throw new Error(`${label} : acteur en double "${a.id}"`);
    ids.add(a.id);
    if (!sprites.has(a.sprite)) throw new Error(`${label} : sprite inconnu "${a.sprite}"`);
  }
  const busy = new Map<string, [number, number][]>();
  for (const c of def.cues) {
    if (c.t < 0 || c.t + (c.duration ?? 0) > def.duration) throw new Error(`${label} : repère hors de la séquence (t=${c.t})`);
    if (c.actor && !ids.has(c.actor)) throw new Error(`${label} : acteur inconnu "${c.actor}"`);
    const props = [
      ...(c.actor && c.to ? Object.keys(c.to).map((p) => `${c.actor}.${p}`) : []),
      ...(c.camera ? Object.keys(c.camera).map((p) => `camera.${p}`) : []),
      ...(c.fade !== undefined ? ['fade'] : []),
      ...(c.tint ? ['tint'] : []),
    ];
    for (const prop of props) {
      const span: [number, number] = [c.t, c.t + (c.duration ?? 0)];
      const spans = busy.get(prop) ?? [];
      if (spans.some(([a, b]) => span[0] < b && a < span[1])) {
        throw new Error(`${label} : transitions de "${prop}" qui se chevauchent vers t=${c.t}`);
      }
      spans.push(span);
      busy.set(prop, spans);
    }
  }
}
