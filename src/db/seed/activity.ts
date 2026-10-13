import type { ManualClock } from '../../core/clock';
import { daysBetween, isBefore, type IsoDate } from '../../core/dates';
import type { Library } from '../../core/Library';
import type { Random } from '../../core/random';
import { randomName, simulateDay } from '../../sim/life';

/** Visiting summer-school students sign up on each of the first this-many days, on month-long guest passes. */
const SUMMER_SCHOOL_DAYS = 12;

/**
 * Plays out every day from the clock's date up to and including `until`, so a
 * sample library opens with a history of loans, late returns, fines and holds.
 * The summer-school intake means a guest pass or two runs out around every
 * day of the following weeks.
 */
export function seedActivity(library: Library, clock: ManualClock, until: IsoDate, random: Random): void {
  const first = clock.today();
  while (!isBefore(until, clock.today())) {
    library.openForTheDay();
    if (daysBetween(first, clock.today()) < SUMMER_SCHOOL_DAYS) library.members.register({ name: randomName(random), type: 'guest' });
    simulateDay(library, random);
    if (clock.today() === until) break;
    clock.advance(1);
  }
}
