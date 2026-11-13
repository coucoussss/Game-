import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import type { StaffDef } from '../data/types';
import { NavGrid } from './NavGrid';
import { Npc, onPause, PedestrianBrain, Route, StaffBrain } from './Npc';

const { level, rules } = loadGameData();
const nav = new NavGrid(level.bounds, level.walls.map((w) => w.rect));

function brain(id: string): StaffBrain {
  const def = level.staff.find((s) => s.id === id) as StaffDef;
  return new StaffBrain(def, new Npc(def.id, 'staff', def.role, def.name, def.armed, def.site, 0), nav);
}

/** Fait vivre un employé de `from` à `to` heures, par pas de 0,1 s réelle. */
function run(b: StaffBrain, from: number, to: number, each?: () => void): void {
  const dtHours = (0.1 * rules.timeScale) / 3600;
  for (let h = from; h < to; h += dtHours) {
    b.step(0.1, h % 24);
    each?.();
  }
}

describe('Route', () => {
  it('suit un trajet à vitesse constante', () => {
    const r = Route.of([[0, 0], [2, 0], [2, 2]]);
    const pos = { x: 0, z: 0 };
    r.advance(pos, 3);
    expect(pos).toEqual({ x: 2, z: 1 });
    r.advance(pos, 5);
    expect(r.done).toBe(true);
  });

  it('boucle sans fin sur une ronde', () => {
    const r = Route.of([[0, 0], [1, 0]], true);
    const pos = { x: 0, z: 0 };
    r.advance(pos, 2.5);
    expect(r.done).toBe(false);
    expect(pos.x).toBeCloseTo(0.5);
  });
});

describe('StaffBrain', () => {
  it('connaît ses heures de pause', () => {
    const clerk = level.staff.find((s) => s.id === 'clerk') as StaffDef;
    expect(onPause(clerk, 10.5 + 1 / 60)).toBe(true);
    expect(onPause(clerk, 11.5 + 1 / 60)).toBe(false);
    expect(onPause(clerk, 23.6)).toBe(false);
  });

  it('l’employé sort fumer en laissant la porte ouverte, puis revient', () => {
    const b = brain('clerk');
    b.settle(10.4);
    expect(b.mode).toBe('post');
    run(b, 10.4, 10.5 + 8 / 60);
    expect(b.mode).toBe('pause');
    expect(b.heldDoor).toBe('store-back');
    run(b, 10.5 + 8 / 60, 10.9);
    expect(b.mode).toBe('post');
    expect(b.heldDoor).toBeNull();
  });

  it('dépose la recette au coffre à la fermeture, puis s’en va', () => {
    const b = brain('clerk');
    b.settle(21.9);
    let deposited = false;
    run(b, 21.9, 22.7, () => (deposited ||= b.depositedThisStep));
    expect(deposited).toBe(true);
    expect(b.npc.present).toBe(false);
  });

  it('le veilleur de nuit prend son service, fait sa ronde, et repart au matin', () => {
    const b = brain('watchman');
    b.settle(12);
    expect(b.npc.present).toBe(false);
    run(b, 21.95, 22.4);
    expect(b.mode).toBe('patrol');
    expect(b.npc.pos.x).toBeLessThan(60);
    run(b, 5.9, 6.6);
    expect(b.npc.present).toBe(false);
  });

  it('un vigile figé par une alerte regagne ensuite son poste', () => {
    const b = brain('jewel-guard');
    b.settle(12);
    b.npc.hostile = true;
    b.npc.pos.x = 12;
    b.npc.pos.z = -7;
    b.step(0.1, 12);
    b.npc.hostile = false;
    run(b, 12, 12.2);
    expect(b.mode).toBe('post');
    expect(b.npc.pos.x).toBeCloseTo(17.8);
  });
});

describe('PedestrianBrain', () => {
  it('fait des allers-retours pendant ses heures, puis rentre', () => {
    const def = level.pedestrians[0];
    if (!def) throw new Error('aucun passant');
    const npc = new Npc(def.id, 'pedestrian', 'pedestrian', 'Un passant', false, null, 0);
    const b = new PedestrianBrain(def, npc);
    b.settle(12);
    expect(npc.present).toBe(true);
    for (let i = 0; i < 200; i++) b.step(0.5, 12);
    expect(npc.pos.x).not.toBe(def.path[0]?.[0]);
    for (let i = 0; i < 400; i++) b.step(0.5, 23.5);
    expect(npc.present).toBe(false);
  });
});
