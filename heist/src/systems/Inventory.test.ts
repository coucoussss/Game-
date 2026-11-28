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
    expect(inv.buy('pistol')).toBe('locked');
    expect(inv.buy('crowbar')).toBe('ok');
    inv.cash = 40;
    expect(inv.buy('wire-cutters')).toBe('ok');
    expect(inv.cash).toBe(0);
    expect(inv.buy('wire-cutters')).toBe('owned');
    inv.laundered = 300;
    expect(inv.buy('pistol')).toBe('poor');
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

  it('ne compte pas le sac parmi les objets à prendre en main', () => {
    const inv = new Inventory(data.items, 0);
    inv.add('duffel-bag');
    inv.add('crowbar');
    inv.select(0);
    expect(inv.held).toBe('crowbar');
  });

  it('recharge depuis la réserve, et le blindage ne compte que gilet porté', () => {
    const inv = new Inventory(data.items, 0);
    inv.add('plate-carrier');
    inv.armor = 100;
    expect(inv.activeArmor()).toBe(0);
    inv.toggleWear('plate-carrier');
    expect(inv.activeArmor()).toBe(100);
    inv.ammo = 5;
    expect(inv.reload(8)).toBe(true);
    expect(inv.mag).toBe(5);
    expect(inv.reload(8)).toBe(false);
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
