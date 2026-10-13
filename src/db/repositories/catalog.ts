import { Author, type AuthorProps } from '../../core/model/Author';
import { Book, isGenre, type BookProps } from '../../core/model/Book';
import { BookCopy, COPY_STATUSES, type BookCopyProps, type CopyCondition, type CopyStatus } from '../../core/model/BookCopy';
import type { AuthorRepository, BookRepository, CopyRepository, Draft } from '../../core/repositories';
import type { SqliteDatabase } from '../SqliteDatabase';

type AuthorRow = { id: number; name: string; birth_year: number | null };
type BookRow = {
  id: number;
  isbn: string;
  title: string;
  published_year: number | null;
  genre: string;
  reference_only: number;
};
type CopyRow = {
  id: number;
  book_id: number;
  barcode: string;
  status: string;
  condition: string;
  acquired_on: string;
};

const toAuthor = (r: AuthorRow) => new Author({ id: r.id, name: r.name, birthYear: r.birth_year });

/** Escapes LIKE wildcards so a search for "100%" means the literal text. */
export function likePattern(query: string): string {
  return `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class SqliteAuthorRepository implements AuthorRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<AuthorProps>): Author {
    const id = this.db.insert('INSERT INTO authors (name, birth_year) VALUES ($name, $birthYear) RETURNING id', draft);
    return new Author({ id, ...draft });
  }

  findById(id: number): Author | null {
    const row = this.db.get<AuthorRow>('SELECT * FROM authors WHERE id = $id', { id });
    return row && toAuthor(row);
  }

  findByName(name: string): Author | null {
    const row = this.db.get<AuthorRow>('SELECT * FROM authors WHERE name = $name COLLATE NOCASE', { name });
    return row && toAuthor(row);
  }

  all(): Author[] {
    return this.db.all<AuthorRow>('SELECT * FROM authors ORDER BY name').map(toAuthor);
  }
}

export class SqliteBookRepository implements BookRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<BookProps>): Book {
    const id = this.db.insert(
      `INSERT INTO books (isbn, title, published_year, genre, reference_only)
       VALUES ($isbn, $title, $publishedYear, $genre, $referenceOnly) RETURNING id`,
      { isbn: draft.isbn, title: draft.title, publishedYear: draft.publishedYear, genre: draft.genre, referenceOnly: draft.referenceOnly },
    );
    draft.authors.forEach((author, position) =>
      this.db.run('INSERT INTO book_authors (book_id, author_id, position) VALUES ($id, $authorId, $position)', {
        id,
        authorId: author.id,
        position,
      }),
    );
    return new Book({ id, ...draft });
  }

  save(book: Book): void {
    this.db.run(
      'UPDATE books SET title = $title, published_year = $publishedYear, genre = $genre, reference_only = $referenceOnly WHERE id = $id',
      { id: book.id, title: book.title, publishedYear: book.publishedYear, genre: book.genre, referenceOnly: book.referenceOnly },
    );
  }

  findById(id: number): Book | null {
    const row = this.db.get<BookRow>('SELECT * FROM books WHERE id = $id', { id });
    return row && this.toBook(row);
  }

  findByIsbn(isbn: string): Book | null {
    const row = this.db.get<BookRow>('SELECT * FROM books WHERE isbn = $isbn', { isbn });
    return row && this.toBook(row);
  }

  search(query: string): Book[] {
    return this.db
      .all<BookRow>(
        `SELECT * FROM books b
         WHERE lower(b.title) LIKE $pattern ESCAPE '\\'
            OR b.isbn LIKE $isbnPattern ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id
                       WHERE ba.book_id = b.id AND lower(a.name) LIKE $pattern ESCAPE '\\')
         ORDER BY b.title`,
        { pattern: likePattern(query), isbnPattern: likePattern(query.replace(/[\s-]/g, '')) },
      )
      .map((r) => this.toBook(r));
  }

  all(): Book[] {
    return this.db.all<BookRow>('SELECT * FROM books ORDER BY title').map((r) => this.toBook(r));
  }

  private toBook(r: BookRow): Book {
    const authors = this.db
      .all<AuthorRow>(
        `SELECT a.* FROM authors a JOIN book_authors ba ON ba.author_id = a.id
         WHERE ba.book_id = $id ORDER BY ba.position`,
        { id: r.id },
      )
      .map(toAuthor);
    if (!isGenre(r.genre)) throw new Error(`Corrupt row: book ${r.id} has unknown genre ${r.genre}`);
    return new Book({
      id: r.id,
      isbn: r.isbn,
      title: r.title,
      authors,
      publishedYear: r.published_year,
      genre: r.genre,
      referenceOnly: r.reference_only === 1,
    });
  }
}

const toCopy = (r: CopyRow) =>
  new BookCopy({
    id: r.id,
    bookId: r.book_id,
    barcode: r.barcode,
    // The CHECK constraints in the schema guarantee these values.
    status: r.status as CopyStatus,
    condition: r.condition as CopyCondition,
    acquiredOn: r.acquired_on,
  });

export class SqliteCopyRepository implements CopyRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<BookCopyProps>): BookCopy {
    const id = this.db.insert(
      `INSERT INTO book_copies (book_id, barcode, status, condition, acquired_on)
       VALUES ($bookId, $barcode, $status, $condition, $acquiredOn) RETURNING id`,
      { ...draft },
    );
    return new BookCopy({ id, ...draft });
  }

  save(copy: BookCopy): void {
    this.db.run('UPDATE book_copies SET status = $status, condition = $condition WHERE id = $id', {
      id: copy.id,
      status: copy.status,
      condition: copy.condition,
    });
  }

  findById(id: number): BookCopy | null {
    const row = this.db.get<CopyRow>('SELECT * FROM book_copies WHERE id = $id', { id });
    return row && toCopy(row);
  }

  findByBarcode(barcode: string): BookCopy | null {
    const row = this.db.get<CopyRow>('SELECT * FROM book_copies WHERE barcode = $barcode', { barcode });
    return row && toCopy(row);
  }

  findByBook(bookId: number): BookCopy[] {
    return this.db.all<CopyRow>('SELECT * FROM book_copies WHERE book_id = $bookId ORDER BY barcode', { bookId }).map(toCopy);
  }

  countByBook(bookId: number): number {
    return this.db.get<{ n: number }>('SELECT count(*) AS n FROM book_copies WHERE book_id = $bookId', { bookId })!.n;
  }

  countByStatus(): Record<CopyStatus, number> {
    const counts = Object.fromEntries(COPY_STATUSES.map((s) => [s, 0])) as Record<CopyStatus, number>;
    for (const row of this.db.all<{ status: string; n: number }>('SELECT status, count(*) AS n FROM book_copies GROUP BY status')) {
      counts[row.status as CopyStatus] = row.n;
    }
    return counts;
  }
}
