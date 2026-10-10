import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../config';
import { type KeyValueStorage, SaveSystem } from './SaveSystem';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const sample = {
  forestId: 'whispering-grove',
  resources: { sugar: 12, water: 40, spores: 3 },
  tick: 42,
};

describe('SaveSystem', () => {
  it('sauvegarde puis recharge les mêmes données', () => {
    const saves = new SaveSystem(memoryStorage());
    expect(saves.save(sample)).toBe(true);
    expect(saves.load()).toEqual({ ...sample, version: SAVE_VERSION });
  });

  it('retourne null sans sauvegarde', () => {
    expect(new SaveSystem(memoryStorage()).load()).toBeNull();
  });

  it('ignore une sauvegarde corrompue ou d\'une autre version', () => {
    const storage = memoryStorage();
    const saves = new SaveSystem(storage, 'k');
    storage.data.set('k', '{pas du json');
    expect(saves.load()).toBeNull();
    storage.data.set('k', JSON.stringify({ ...sample, version: SAVE_VERSION + 1 }));
    expect(saves.load()).toBeNull();
  });

  it('ne plante pas si le stockage refuse l\'écriture', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(new SaveSystem(storage).save(sample)).toBe(false);
  });

  it('clear efface la sauvegarde', () => {
    const saves = new SaveSystem(memoryStorage());
    saves.save(sample);
    saves.clear();
    expect(saves.load()).toBeNull();
  });
});
