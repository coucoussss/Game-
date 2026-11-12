import { describe, expect, it } from 'vitest';
import { DRIVE_TIME, Police } from './Police';

const rules = { policeEta: 40, policeEtaPerHeat: 0.2, policeMinEta: 15, policeSearch: 30 };

describe('Police', () => {
  it('arrive plus vite quand la chaleur monte, sans descendre sous le minimum', () => {
    const p = new Police(rules);
    expect(p.etaFor(0)).toBe(40);
    expect(p.etaFor(50)).toBe(30);
    expect(p.etaFor(1000)).toBe(15);
  });

  it('arrive, fouille, puis repart', () => {
    const p = new Police(rules);
    expect(p.call(0, false)).toBe(true);
    expect(p.call(0, true)).toBe(false);
    expect(p.loud).toBe(true);
    expect(p.carProgress()).toBe(0);
    p.step(39);
    expect(p.state).toBe('en-route');
    expect(p.carProgress()).toBeGreaterThan(0);
    expect(p.step(2)).toBe('searching');
    expect(p.carProgress()).toBe(1);
    expect(p.step(31)).toBe('leaving');
    expect(p.step(DRIVE_TIME + 0.1)).toBe('idle');
    expect(p.loud).toBe(false);
  });
});
