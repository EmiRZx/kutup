import type { Database, SqlJsStatic } from 'sql.js';
import { migrate } from './schema';

export type SqlValue = string | number | null | Uint8Array;
export type Params = Record<string, SqlValue | boolean | undefined>;
export type Row = Record<string, SqlValue>;

/** sql.js wants `$name` keys; callers write plain `{ name }`. Booleans become 0/1. */
function bindable(params: Params): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[`$${key}`] = typeof value === 'boolean' ? Number(value) : value;
  }
  return out;
}

/**
 * A thin, synchronous wrapper around a sql.js (SQLite compiled to WebAssembly)
 * database. The whole library lives in one SQLite file that can be exported,
 * saved, and opened in any SQLite tool.
 */
export class SqliteDatabase {
  private readonly db: Database;
  private transactionDepth = 0;

  private constructor(db: Database) {
    this.db = db;
    this.db.run('PRAGMA foreign_keys = ON');
    migrate(this);
  }

  /** Opens a new empty database, or an existing one from exported bytes. */
  static open(sql: SqlJsStatic, bytes?: Uint8Array): SqliteDatabase {
    return new SqliteDatabase(new sql.Database(bytes));
  }

  /** Runs one or more statements that return nothing (DDL, PRAGMA). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Runs a write statement and reports how many rows it changed. */
  run(sql: string, params: Params = {}): number {
    this.db.run(sql, bindable(params));
    return this.db.getRowsModified();
  }

  all<T extends Row = Row>(sql: string, params: Params = {}): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(bindable(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T extends Row = Row>(sql: string, params: Params = {}): T | null {
    return this.all<T>(sql, params)[0] ?? null;
  }

  /** Runs `INSERT ... RETURNING id` and gives back the new row's id. */
  insert(sql: string, params: Params = {}): number {
    const row = this.get<{ id: number }>(sql, params);
    if (!row) throw new Error('INSERT did not return an id');
    return row.id;
  }

  /**
   * All-or-nothing: commits if `work` returns, rolls back if it throws.
   * Nested calls join the outermost transaction.
   */
  transaction<T>(work: () => T): T {
    if (this.transactionDepth > 0) {
      this.transactionDepth++;
      try {
        return work();
      } finally {
        this.transactionDepth--;
      }
    }
    this.db.exec('BEGIN');
    this.transactionDepth = 1;
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.transactionDepth = 0;
    }
  }

  /** The complete database as bytes: this is the save file. */
  export(): Uint8Array {
    if (this.transactionDepth > 0) throw new Error('Cannot export in the middle of a transaction');
    const bytes = this.db.export();
    // sql.js reopens the database during export, which resets connection settings.
    this.db.run('PRAGMA foreign_keys = ON');
    return bytes;
  }

  close(): void {
    this.db.close();
  }
}
