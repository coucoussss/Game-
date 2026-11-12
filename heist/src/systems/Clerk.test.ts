import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import { Clerk, clerkDuty, Route } from './Clerk';

const { level, rules } = loadGameData();

/** Fait tourner l'employé de `from` à `to` heures, par pas de 0,1 s réelle. */
function run(clerk: Clerk, from: number, to: number): void {
  const dtHours = (0.1 * rules.timeScale) / 3600;
  for (let h = from; h < to; h += dtHours) clerk.step(0.1, h, false);
}

describe('Clerk', () => {
  it('suit un emploi du temps', () => {
    expect(clerkDuty(9, rules)).toBe('counter');
    expect(clerkDuty(10.5 + 1 / 60, rules)).toBe('break');
    expect(clerkDuty(11.5 + 1 / 60, rules)).toBe('counter');
    expect(clerkDuty(23, rules)).toBe('leave');
    expect(clerkDuty(7.9, rules)).toBe('counter');
  });

  it('suit un trajet à vitesse constante', () => {
    const r = Route.of([[0, 0], [2, 0], [2, 2]]);
    const pos = { x: 0, z: 0 };
    r.advance(pos, 3);
    expect(pos.x).toBeCloseTo(2);
    expect(pos.z).toBeCloseTo(1);
    r.advance(pos, 5);
    expect(r.done).toBe(true);
  });

  it('sort fumer en ouvrant la porte arrière, puis revient', () => {
    const clerk = new Clerk(level, rules);
    clerk.settle(10.4);
    expect(clerk.mode).toBe('counter');
    run(clerk, 10.4, 10.5 + 8 / 60);
    expect(clerk.mode).toBe('smoking');
    expect(clerk.holdsBackDoorOpen).toBe(true);
    run(clerk, 10.5 + 8 / 60, 10.9);
    expect(clerk.mode).toBe('counter');
    expect(clerk.holdsBackDoorOpen).toBe(false);
  });

  it('dépose la caisse au coffre à la fermeture, puis s’en va', () => {
    const clerk = new Clerk(level, rules);
    clerk.settle(21.9);
    let deposited = false;
    const dtHours = (0.1 * rules.timeScale) / 3600;
    for (let h = 21.9; h < 22.6; h += dtHours) {
      clerk.step(0.1, h, false);
      deposited ||= clerk.depositedThisStep;
    }
    expect(deposited).toBe(true);
    expect(clerk.present).toBe(false);
  });
});
