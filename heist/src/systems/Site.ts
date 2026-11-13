import type { InteractableDef, SiteDef } from '../data/types';

export interface ContainerState {
  amount: number;
  /** Jour où il a été vidé, ou null s'il est plein. */
  emptiedDay: number | null;
}

/** État d'une cible pendant la partie : courant, alarme, portes forcées, butin restant. */
export class SiteState {
  powered = true;
  /** Le cadenas du boîtier électrique a sauté. */
  fuseUnlocked = false;
  /** Temps restant de sonnerie. */
  alarm = 0;
  /** Perceuse en place sur la porte de la chambre forte : progression en secondes, ou null. */
  drill: number | null = null;
  vaultOpen = false;
  readonly openDoors = new Set<string>();
  readonly registers = new Map<string, { amount: number; emptied: boolean }>();

  constructor(readonly def: SiteDef) {}

  /** Remise en état au petit matin : réparations, courant rétabli, caisses rouvertes. */
  restore(): void {
    this.powered = true;
    this.fuseUnlocked = false;
    this.alarm = 0;
    this.drill = null;
    this.vaultOpen = false;
    this.openDoors.clear();
    for (const r of this.registers.values()) {
      r.emptied = false;
      r.amount = 0;
    }
  }
}

/** Générateur pseudo-aléatoire à graine (mulberry32) : les parties et les tests sont reproductibles. */
export class Rng {
  constructor(private state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
}

/** Tire le contenu d'un contenant plein. */
export function rollContainer(def: InteractableDef, rng: Rng): number {
  const c = def.container;
  if (!c) return 0;
  // Arrondi à la dizaine : ça fait plus « liasse ».
  return Math.round(rng.int(c.amount[0], c.amount[1]) / 10) * 10;
}
