import type { Clock } from '../clock';
import { ValidationError } from '../errors';
import { isValidIsbn13, normalizeIsbn } from '../identifiers';
import type { Author } from '../model/Author';
import { isGenre, type Book, type Genre } from '../model/Book';
import type { BookCopy, CopyCondition, CopyStatus } from '../model/BookCopy';
import type { LibraryStore } from '../repositories';
import type { ReservationService } from './ReservationService';
import { found, requireText } from './support';

export interface NewBookInput {
  isbn: string;
  title: string;
  /** Author names; unknown authors are added to the catalog automatically. */
  authors: readonly string[];
  publishedYear?: number | null;
  genre: Genre;
  referenceOnly?: boolean;
}

export interface Availability {
  total: number;
  onShelf: number;
  onLoan: number;
  onHold: number;
  /** Lost, in repair or withdrawn. */
  outOfService: number;
}

/** Everything about the books themselves: titles, authors and physical copies. */
export class CatalogService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;
  private readonly reservations: ReservationService;

  constructor(store: LibraryStore, clock: Clock, reservations: ReservationService) {
    this.store = store;
    this.clock = clock;
    this.reservations = reservations;
  }

  /** Returns the existing author with this name, or adds a new one. */
  findOrAddAuthor(name: string, birthYear: number | null = null): Author {
    const clean = requireText(name, 'Author name');
    return this.store.authors.findByName(clean) ?? this.store.authors.add({ name: clean, birthYear });
  }

  addBook(input: NewBookInput): Book {
    const isbn = normalizeIsbn(input.isbn);
    if (!isValidIsbn13(isbn)) throw new ValidationError(`Invalid ISBN-13: ${input.isbn}`);
    if (!isGenre(input.genre)) throw new ValidationError(`Unknown genre: ${input.genre}`);
    if (input.authors.length === 0) throw new ValidationError('A book needs at least one author');
    const year = input.publishedYear ?? null;
    if (year !== null && (!Number.isInteger(year) || year > Number(this.clock.today().slice(0, 4)))) {
      throw new ValidationError(`Implausible publication year: ${year}`);
    }

    return this.store.transaction(() => {
      if (this.store.books.findByIsbn(isbn)) throw new ValidationError(`A book with ISBN ${isbn} already exists`);
      return this.store.books.add({
        isbn,
        title: requireText(input.title, 'Title'),
        authors: input.authors.map((name) => this.findOrAddAuthor(name)),
        publishedYear: year,
        genre: input.genre,
        referenceOnly: input.referenceOnly ?? false,
      });
    });
  }

  /** Adds `count` new physical copies of a book, each with its own barcode. */
  addCopies(bookId: number, count = 1, condition: CopyCondition = 'good'): BookCopy[] {
    if (!Number.isInteger(count) || count < 1) throw new ValidationError('Copy count must be ≥ 1');
    return this.store.transaction(() => {
      const book = this.getBook(bookId);
      const existing = this.store.copies.countByBook(book.id);
      return Array.from({ length: count }, (_, i) =>
        this.store.copies.add({
          bookId: book.id,
          barcode: CatalogService.barcodeFor(book.id, existing + i + 1),
          status: 'available',
          condition,
          acquiredOn: this.clock.today(),
        }),
      );
    });
  }

  /** "B00042-03": the third copy of book #42. */
  static barcodeFor(bookId: number, copyNumber: number): string {
    return `B${String(bookId).padStart(5, '0')}-${String(copyNumber).padStart(2, '0')}`;
  }

  getBook(id: number): Book {
    return found(this.store.books.findById(id), 'Book', id);
  }

  getCopy(barcode: string): BookCopy {
    return found(this.store.copies.findByBarcode(barcode.trim().toUpperCase()), 'Copy', barcode);
  }

  copiesOf(bookId: number): BookCopy[] {
    return this.store.copies.findByBook(bookId);
  }

  search(query: string): Book[] {
    return query.trim() ? this.store.books.search(query.trim()) : this.store.books.all();
  }

  availability(bookId: number): Availability {
    const counts: Record<CopyStatus, number> = {
      available: 0,
      on_loan: 0,
      on_hold: 0,
      in_repair: 0,
      lost: 0,
      withdrawn: 0,
    };
    for (const copy of this.copiesOf(bookId)) counts[copy.status] += 1;
    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      onShelf: counts.available,
      onLoan: counts.on_loan,
      onHold: counts.on_hold,
      outOfService: counts.in_repair + counts.lost + counts.withdrawn,
    };
  }

  updateBook(bookId: number, changes: { title?: string; genre?: Genre; referenceOnly?: boolean }): Book {
    return this.store.transaction(() => {
      const book = this.getBook(bookId);
      if (changes.title !== undefined) book.title = requireText(changes.title, 'Title');
      if (changes.genre !== undefined) {
        if (!isGenre(changes.genre)) throw new ValidationError(`Unknown genre: ${changes.genre}`);
        book.genre = changes.genre;
      }
      if (changes.referenceOnly !== undefined) book.referenceOnly = changes.referenceOnly;
      this.store.books.save(book);
      return book;
    });
  }

  sendToRepair(barcode: string): BookCopy {
    return this.changeCopy(barcode, (copy) => copy.sendToRepair());
  }

  /** A repaired or found copy goes back into circulation, straight to the reservation queue if anyone is waiting. */
  restoreToShelf(barcode: string): BookCopy {
    return this.changeCopy(barcode, (copy) => {
      copy.restoreToShelf();
      this.store.copies.save(copy);
      this.reservations.allocate(copy);
    });
  }

  withdraw(barcode: string): BookCopy {
    return this.changeCopy(barcode, (copy) => copy.withdraw());
  }

  private changeCopy(barcode: string, change: (copy: BookCopy) => void): BookCopy {
    return this.store.transaction(() => {
      const copy = this.getCopy(barcode);
      change(copy);
      this.store.copies.save(copy);
      return copy;
    });
  }
}
