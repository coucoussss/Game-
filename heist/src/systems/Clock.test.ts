import { describe, expect, it } from 'vitest';
import { Clock, daylight, inHourRange } from './Clock';

describe('Clock', () => {
  it('donne le jour et l’heure', () => {
    const c = Clock.atHour(2, 13.5);
    expect(c.day).toBe(2);
    expect(c.hour).toBeCloseTo(13.5);
    expect(c.format()).toBe('Jour 2 · 13:30');
  });

  it('saute à la prochaine occurrence d’une heure', () => {
    const c = Clock.atHour(1, 23);
    c.skipTo(8);
    expect(c.day).toBe(2);
    expect(c.hour).toBeCloseTo(8);
    c.skipTo(8);
    expect(c.day).toBe(3);
  });

  it('gère les plages qui passent minuit', () => {
    expect(inHourRange(2, 18, 5)).toBe(true);
    expect(inHourRange(12, 18, 5)).toBe(false);
    expect(inHourRange(9, 8, 22)).toBe(true);
    expect(inHourRange(22, 8, 22)).toBe(false);
  });

  it('fait varier la lumière du jour', () => {
    expect(daylight(3)).toBe(0);
    expect(daylight(12)).toBe(1);
    expect(daylight(20)).toBeCloseTo(0.5);
  });
});
