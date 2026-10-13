import type { LibraryStore } from '../core/repositories';
import { SqliteAuthorRepository, SqliteBookRepository, SqliteCopyRepository } from './repositories/catalog';
import { SqliteFineRepository, SqliteLoanRepository, SqliteReservationRepository } from './repositories/circulation';
import { SqliteCardRepository, SqliteMemberRepository } from './repositories/members';
import { SqlitePolicyRepository } from './repositories/policy';
import type { SqliteDatabase } from './SqliteDatabase';

/** The SQLite implementation of every repository the core needs, sharing one database. */
export class SqliteLibraryStore implements LibraryStore {
  readonly db: SqliteDatabase;
  readonly authors: SqliteAuthorRepository;
  readonly books: SqliteBookRepository;
  readonly copies: SqliteCopyRepository;
  readonly members: SqliteMemberRepository;
  readonly cards: SqliteCardRepository;
  readonly loans: SqliteLoanRepository;
  readonly reservations: SqliteReservationRepository;
  readonly fines: SqliteFineRepository;
  readonly policy: SqlitePolicyRepository;

  constructor(db: SqliteDatabase) {
    this.db = db;
    this.authors = new SqliteAuthorRepository(db);
    this.books = new SqliteBookRepository(db);
    this.copies = new SqliteCopyRepository(db);
    this.members = new SqliteMemberRepository(db);
    this.cards = new SqliteCardRepository(db);
    this.loans = new SqliteLoanRepository(db);
    this.reservations = new SqliteReservationRepository(db);
    this.fines = new SqliteFineRepository(db);
    this.policy = new SqlitePolicyRepository(db);
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work);
  }
}
