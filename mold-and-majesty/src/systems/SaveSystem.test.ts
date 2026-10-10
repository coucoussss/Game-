import { describe, expect, it } from 'vitest';
import { SaveSystem, memoryStorage } from './SaveSystem';

const sample = { forestId: 'whispering-grove', tick: 42 };

describe('SaveSystem', () => {
  it('sauvegarde puis recharge les mêmes données', () => {
    const saves = new SaveSystem<typeof sample>(memoryStorage(), 'k', 1);
    expect(saves.save(sample)).toBe(true);
    expect(saves.load()).toEqual(sample);
  });

  it('retourne null sans sauvegarde', () => {
    expect(new SaveSystem(memoryStorage(), 'k', 1).load()).toBeNull();
  });

  it('ignore une sauvegarde corrompue ou d\'une autre version', () => {
    const storage = memoryStorage();
    storage.data.set('k', '{pas du json');
    expect(new SaveSystem(storage, 'k', 1).load()).toBeNull();
    new SaveSystem(storage, 'k', 1).save(sample);
    expect(new SaveSystem(storage, 'k', 2).load()).toBeNull();
  });

  it('ne plante pas si le stockage refuse l\'écriture ou la lecture', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    storage.getItem = () => {
      throw new Error('SecurityError');
    };
    const saves = new SaveSystem(storage, 'k', 1);
    expect(saves.save(sample)).toBe(false);
    expect(saves.load()).toBeNull();
  });

  it('clear efface la sauvegarde', () => {
    const saves = new SaveSystem(memoryStorage(), 'k', 1);
    saves.save(sample);
    saves.clear();
    expect(saves.load()).toBeNull();
  });
});
