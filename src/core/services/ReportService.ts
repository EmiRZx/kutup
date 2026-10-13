import type { Clock } from '../clock';
import type { Book } from '../model/Book';
import type { CopyStatus } from '../model/BookCopy';
import type { LibraryStore } from '../repositories';

export interface LibrarySnapshot {
  titles: number;
  copies: Record<CopyStatus, number>;
  totalCopies: number;
  members: number;
  activeLoans: number;
  overdueLoans: number;
  holdsReady: number;
  reservationsWaiting: number;
  /** Unpaid fines across the library, in cents. */
  outstandingFines: number;
}

/** Read-only figures for the back office dashboard. */
export class ReportService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;

  constructor(store: LibraryStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  snapshot(): LibrarySnapshot {
    const copies = this.store.copies.countByStatus();
    const open = this.store.reservations.findOpen();
    return {
      titles: this.store.books.all().length,
      copies,
      totalCopies: Object.values(copies).reduce((a, b) => a + b, 0),
      members: this.store.members.all().length,
      activeLoans: this.store.loans.findActive().length,
      overdueLoans: this.store.loans.findOverdue(this.clock.today()).length,
      holdsReady: open.filter((r) => r.status === 'ready').length,
      reservationsWaiting: open.filter((r) => r.status === 'waiting').length,
      outstandingFines: this.store.fines.totalOutstanding(),
    };
  }

  mostBorrowed(limit = 5): { book: Book; loans: number }[] {
    return this.store.loans
      .mostBorrowed(limit)
      .flatMap(({ bookId, loans }) => {
        const book = this.store.books.findById(bookId);
        return book ? [{ book, loans }] : [];
      });
  }
}
