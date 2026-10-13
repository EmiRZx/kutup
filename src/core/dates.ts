/**
 * The library thinks in whole days, never in hours. Every date in the core is
 * an ISO-8601 calendar date string such as "2026-10-13". Strings compare
 * correctly with < and >, serialize to SQLite as-is, and avoid time-zone bugs.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Returns true when `value` is a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Throws if `value` is not a valid ISO date; otherwise returns it unchanged. */
export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new RangeError(`Not an ISO date: "${value}"`);
  return value;
}

function toEpochDay(date: IsoDate): number {
  assertIsoDate(date);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromEpochDay(epochDay: number): IsoDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Converts a JavaScript Date to the calendar date it falls on in local time. */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `date` moved forward (or backward, for negative `days`) by whole days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Number of days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return daysBetween(a, b) > 0;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return daysBetween(a, b) < 0;
}
