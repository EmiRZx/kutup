import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../src/core/clock';
import { addDays, daysBetween, isAfter, isBefore, isIsoDate } from '../../src/core/dates';
import {
  formatCardNumber,
  generateCardNumber,
  isbn13CheckDigit,
  isValidCardNumber,
  isValidIsbn13,
  luhnCheckDigit,
} from '../../src/core/identifiers';
import { seededRandom } from '../helpers';

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true); // leap year
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
    expect(daysBetween('2026-03-15', '2026-03-01')).toBe(-14);
    expect(isBefore('2026-03-01', '2026-03-02')).toBe(true);
    expect(isAfter('2026-03-01', '2026-03-02')).toBe(false);
  });
});

describe('ManualClock', () => {
  it('only moves forward, by whole days', () => {
    const clock = new ManualClock('2026-03-01');
    expect(clock.advance(3)).toBe('2026-03-04');
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(0.5)).toThrow(RangeError);
    expect(() => new ManualClock('yesterday')).toThrow(RangeError);
  });
});

describe('ISBN-13', () => {
  it('accepts real ISBNs with or without hyphens', () => {
    expect(isValidIsbn13('978-0-14-143951-8')).toBe(true); // Pride and Prejudice, Penguin Classics
    expect(isValidIsbn13('9780141439518')).toBe(true);
  });

  it('rejects a wrong check digit, wrong prefix or wrong length', () => {
    expect(isValidIsbn13('9780141439519')).toBe(false);
    expect(isValidIsbn13('1230141439518')).toBe(false);
    expect(isValidIsbn13('978014143951')).toBe(false);
  });

  it('computes the check digit', () => {
    expect(isbn13CheckDigit('978014143951')).toBe(8);
  });
});

describe('library card numbers', () => {
  it('uses the Luhn check digit', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3); // the textbook example
  });

  it('generates numbers that validate', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const number = generateCardNumber(random);
      expect(number).toMatch(/^[1-9]\d{7}$/);
      expect(isValidCardNumber(number)).toBe(true);
    }
  });

  it('catches a single mistyped digit (a forged card)', () => {
    const number = generateCardNumber(seededRandom(1));
    const last = Number(number[3]);
    const forged = number.slice(0, 3) + ((last + 1) % 10) + number.slice(4);
    expect(isValidCardNumber(forged)).toBe(false);
  });

  it('prints in two groups of four', () => {
    expect(formatCardNumber('48210937')).toBe('4821 0937');
  });
});
