import type { SqlJsStatic } from 'sql.js';
import type { Clock } from '../core/clock';
import { Library } from '../core/Library';
import type { MemberServiceOptions } from '../core/services/MemberService';
import { seedCatalog, seedMembers } from './seed/seed';
import { SqliteDatabase } from './SqliteDatabase';
import { SqliteLibraryStore } from './SqliteLibraryStore';

export interface OpenLibraryOptions extends MemberServiceOptions {
  clock: Clock;
  /** An exported database (a save file). Omit to start a fresh library. */
  bytes?: Uint8Array;
  /** Fill a fresh library with the sample catalog and members. */
  seed?: boolean;
}

/** Composition root: SQLite database → repositories → services. */
export function openLibrary(sql: SqlJsStatic, options: OpenLibraryOptions): { library: Library; db: SqliteDatabase } {
  const db = SqliteDatabase.open(sql, options.bytes);
  const library = new Library(new SqliteLibraryStore(db), options.clock, options);
  if (options.seed && !options.bytes) {
    seedCatalog(library);
    seedMembers(library);
  }
  return { library, db };
}
