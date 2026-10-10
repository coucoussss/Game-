import { describe, expect, it } from 'vitest';
import { FixedStep } from './FixedStep';

describe('FixedStep', () => {
  it('cumule les fractions de tick', () => {
    const clock = new FixedStep(100);
    expect(clock.advance(60)).toBe(0);
    expect(clock.advance(60)).toBe(1);
    expect(clock.advance(80)).toBe(1);
  });

  it('plafonne le rattrapage', () => {
    const clock = new FixedStep(100, 5);
    expect(clock.advance(10_000)).toBe(5);
    expect(clock.advance(50)).toBe(0);
  });
});
