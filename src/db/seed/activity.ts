import type { ManualClock } from '../../core/clock';
import { isBefore, type IsoDate } from '../../core/dates';
import type { Library } from '../../core/Library';
import type { Random } from '../../core/random';
import { simulateDay } from '../../sim/life';

/**
 * Plays out every day from the clock's date up to and including `until`, so a
 * sample library opens with a history of loans, late returns, fines and holds.
 */
export function seedActivity(library: Library, clock: ManualClock, until: IsoDate, random: Random): void {
  while (!isBefore(until, clock.today())) {
    library.openForTheDay();
    simulateDay(library, random);
    if (clock.today() === until) break;
    clock.advance(1);
  }
}
