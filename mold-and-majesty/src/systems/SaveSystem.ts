/** Sous-ensemble de l'API Storage, pour pouvoir injecter un faux stockage en test. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Envelope<T> {
  version: number;
  data: T;
}

/**
 * Sauvegarde versionnée dans un stockage clé/valeur (localStorage en jeu).
 * Une sauvegarde corrompue ou d'une autre version est ignorée ; une écriture refusée
 * (quota, navigation privée) n'interrompt jamais le jeu.
 */
export class SaveSystem<T> {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string,
    private readonly version: number,
  ) {}

  save(data: T): boolean {
    try {
      const envelope: Envelope<T> = { version: this.version, data };
      this.storage.setItem(this.key, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  load(): T | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const envelope = JSON.parse(raw) as Envelope<T>;
      return envelope.version === this.version ? envelope.data : null;
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

/** Stockage en mémoire (tests, ou navigateur sans localStorage). */
export function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
