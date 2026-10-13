import { ManualClock } from '../core/clock';
import { assertIsoDate, type IsoDate } from '../core/dates';
import type { SqliteDatabase } from './SqliteDatabase';

/**
 * A {@link ManualClock} whose date is stored in the database, so that a saved
 * library reopens on the day it was left. The first time, it starts on `start`.
 */
export class StoredClock extends ManualClock {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase, start: IsoDate) {
    const saved = db.get<{ today: string }>('SELECT today FROM calendar WHERE id = 1')?.today;
    super(saved ?? start);
    this.db = db;
    if (!saved) this.persist();
  }

  override set(date: IsoDate): void {
    super.set(assertIsoDate(date));
    this.persist();
  }

  override advance(days = 1): IsoDate {
    const today = super.advance(days);
    this.persist();
    return today;
  }

  private persist(): void {
    this.db.run('INSERT INTO calendar (id, today) VALUES (1, $today) ON CONFLICT (id) DO UPDATE SET today = $today', {
      today: this.today(),
    });
  }
}
