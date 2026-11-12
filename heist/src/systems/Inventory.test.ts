import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import { Inventory } from './Inventory';

const data = loadGameData();

describe('Inventory', () => {
  it('commence vide et refuse un achat trop cher', () => {
    const inv = new Inventory(data.items, 0);
    expect(inv.items).toEqual([]);
    expect(inv.buy('ski-mask')).toBe('poor');
  });

  it('achète avec l’argent propre uniquement', () => {
    const inv = new Inventory(data.items, 40);
    inv.dirty = 1000;
    expect(inv.buy('pistol')).toBe('poor');
    expect(inv.buy('wire-cutters')).toBe('ok');
    expect(inv.cash).toBe(0);
    expect(inv.buy('wire-cutters')).toBe('owned');
  });

  it('blanchit en prélevant une commission', () => {
    const inv = new Inventory(data.items, 0);
    inv.dirty = 400;
    expect(inv.launder(0.25)).toBe(300);
    expect(inv.cash).toBe(300);
    expect(inv.dirty).toBe(0);
  });

  it('rend suspect selon ce qui est visible, et le gilet ralentit', () => {
    const inv = new Inventory(data.items, 0);
    inv.add('ski-mask');
    inv.add('plate-carrier');
    inv.add('wire-cutters');
    expect(inv.visibleSuspicion()).toBe(0);
    inv.select(2);
    expect(inv.visibleSuspicion()).toBeCloseTo(0.2);
    inv.select(0);
    expect(inv.toggleWear('ski-mask')).toBe(true);
    expect(inv.masked()).toBe(true);
    expect(inv.held).toBeNull();
    expect(inv.visibleSuspicion()).toBeCloseTo(0.8);
    inv.toggleWear('plate-carrier');
    expect(inv.speedFactor()).toBeLessThan(1);
  });

  it('confisque tout le matériel et le butin', () => {
    const inv = new Inventory(data.items, 50);
    inv.add('pistol');
    inv.dirty = 200;
    expect(inv.confiscate()).toEqual(['pistol']);
    expect(inv.items).toEqual([]);
    expect(inv.dirty).toBe(0);
    expect(inv.cash).toBe(50);
  });
});
