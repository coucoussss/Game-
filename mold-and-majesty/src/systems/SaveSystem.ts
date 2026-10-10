import { SAVE_KEY, SAVE_VERSION } from '../config';
import type { ResourceId } from '../data/types';

export interface SaveData {
  version: number;
  forestId: string;
  resources: Record<ResourceId, number>;
  /** Nombre de ticks de simulation écoulés. */
  tick: number;
}

/** Sous-ensemble de l'API Storage, pour pouvoir injecter un faux stockage en test. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class SaveSystem {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = SAVE_KEY,
  ) {}

  save(data: Omit<SaveData, 'version'>): boolean {
    try {
      this.storage.setItem(this.key, JSON.stringify({ ...data, version: SAVE_VERSION }));
      return true;
    } catch {
      // Quota dépassé ou stockage bloqué (navigation privée) : on n'interrompt pas le jeu.
      return false;
    }
  }

  /** Retourne la sauvegarde, ou null si absente, corrompue ou d'une version incompatible. */
  load(): SaveData | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const data = JSON.parse(raw) as SaveData;
      return data.version === SAVE_VERSION ? data : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // Ignoré : rien à effacer si le stockage est inaccessible.
    }
  }
}
