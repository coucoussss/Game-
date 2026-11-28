import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import { Rng, rollContainer, SiteState } from './Site';

const data = loadGameData();

describe('Site', () => {
  it('le générateur à graine est reproductible et reste dans [0, 1[', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('tire le contenu d’un contenant dans sa fourchette, arrondi à la dizaine', () => {
    const trunk = data.level.interactables.find((i) => i.id === 'car-trunk-1');
    if (!trunk?.container) throw new Error('coffre de voiture introuvable');
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      const v = rollContainer(trunk, rng);
      expect(v % 10).toBe(0);
      expect(v).toBeGreaterThanOrEqual(30);
      expect(v).toBeLessThanOrEqual(90);
    }
  });

  it('remet le site en état au petit matin', () => {
    const def = data.level.sites[0];
    if (!def) throw new Error('aucun site');
    const s = new SiteState(def);
    s.powered = false;
    s.fuseUnlocked = true;
    s.alarm = 30;
    s.vaultOpen = true;
    s.openDoors.add('store-back');
    s.registers.set('r', { amount: 200, emptied: true });
    s.restore();
    expect(s.powered).toBe(true);
    expect(s.fuseUnlocked).toBe(false);
    expect(s.alarm).toBe(0);
    expect(s.vaultOpen).toBe(false);
    expect(s.openDoors.size).toBe(0);
    expect(s.registers.get('r')).toEqual({ amount: 0, emptied: false });
  });
});
