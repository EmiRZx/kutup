import type { SqlJsStatic } from 'sql.js';
import { ManualClock, type Clock } from '../core/clock';
import { addDays, toIsoDate, type IsoDate } from '../core/dates';
import { Library } from '../core/Library';
import { Random } from '../core/random';
import type { MemberServiceOptions } from '../core/services/MemberService';
import { StoredClock } from './calendar';
import { seedActivity } from './seed/activity';
import { seedCatalog, seedMembers } from './seed/seed';
import { SqliteDatabase } from './SqliteDatabase';
import { SqliteLibraryStore } from './SqliteLibraryStore';

export interface OpenLibraryOptions extends MemberServiceOptions {
  /** The clock to run on. Omit to use a {@link StoredClock} kept in the database itself. */
  clock?: Clock;
  /** Where a new {@link StoredClock} starts. Defaults to the real date. */
  startDate?: IsoDate;
  /** An exported database (a save file). Omit to start a fresh library. */
  bytes?: Uint8Array;
  /** Fill a fresh library with the sample catalog and members. */
  seed?: boolean;
  /**
   * With `seed`: also simulate this many days of library life ending today,
   * so the sample opens with loans, fines and reservations. Needs a ManualClock.
   */
  sampleActivityDays?: number;
}

export interface OpenedLibrary {
  library: Library;
  db: SqliteDatabase;
  clock: Clock;
}

/** Composition root: SQLite database → repositories → services. */
export function openLibrary(sql: SqlJsStatic, options: OpenLibraryOptions = {}): OpenedLibrary {
  const db = SqliteDatabase.open(sql, options.bytes);
  const clock = options.clock ?? new StoredClock(db, options.startDate ?? toIsoDate(new Date()));
  const library = new Library(new SqliteLibraryStore(db), clock, options);
  if (options.seed && !options.bytes) {
    const days = options.sampleActivityDays ?? 0;
    if (days > 0 && !(clock instanceof ManualClock)) throw new Error('Sample activity needs a ManualClock');
    const today = clock.today();
    if (days > 0) (clock as ManualClock).set(addDays(today, -days));
    seedCatalog(library);
    seedMembers(library);
    if (days > 0) seedActivity(library, clock as ManualClock, today, new Random(1986));
  }
  return { library, db, clock };
}
