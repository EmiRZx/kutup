import { addDays, assertIsoDate, toIsoDate, type IsoDate } from './dates';

/**
 * The core never asks the operating system what day it is; it asks a Clock.
 * That keeps every rule testable, and lets the game run the library on its
 * own calendar.
 */
export interface Clock {
  today(): IsoDate;
}

/** Real-world calendar, for running the library as an ordinary application. */
export class SystemClock implements Clock {
  today(): IsoDate {
    return toIsoDate(new Date());
  }
}

/** A clock that only moves when told to: used by tests and by the game's day cycle. */
export class ManualClock implements Clock {
  private current: IsoDate;

  constructor(start: IsoDate) {
    this.current = assertIsoDate(start);
  }

  today(): IsoDate {
    return this.current;
  }

  set(date: IsoDate): void {
    this.current = assertIsoDate(date);
  }

  advance(days = 1): IsoDate {
    if (!Number.isInteger(days) || days < 0) throw new RangeError('A clock only moves forward by whole days');
    this.current = addDays(this.current, days);
    return this.current;
  }
}
