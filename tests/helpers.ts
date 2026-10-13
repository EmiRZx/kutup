import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { ManualClock } from '../src/core/clock';
import type { Library } from '../src/core/Library';
import type { MemberType } from '../src/core/model/Member';
import { openLibrary } from '../src/db/openLibrary';
import { seedIsbn } from '../src/db/seed/seed';

let sql: SqlJsStatic | undefined;

export async function loadSql(): Promise<SqlJsStatic> {
  sql ??= await initSqlJs();
  return sql;
}

/** A tiny deterministic random source so card numbers are reproducible. */
export function seededRandom(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const START = '2026-03-02';

/** A fresh, empty in-memory library whose calendar starts on {@link START}. */
export async function freshLibrary() {
  const clock = new ManualClock(START);
  const { library, db } = openLibrary(await loadSql(), { clock, random: seededRandom() });
  return { library, db, clock };
}

let isbnCounter = 1000;

/** Adds a book with `copies` copies and returns it with its barcodes. */
export function addBook(library: Library, title = 'Test Book', copies = 1, extra: { referenceOnly?: boolean } = {}) {
  const book = library.catalog.addBook({
    isbn: seedIsbn(isbnCounter++),
    title,
    authors: ['Test Author'],
    publishedYear: 2000,
    genre: 'fiction',
    referenceOnly: extra.referenceOnly ?? false,
  });
  const barcodes = library.catalog.addCopies(book.id, copies).map((c) => c.barcode);
  return { book, barcodes };
}

export function addMember(library: Library, name = 'Test Member', type: MemberType = 'student') {
  return library.members.register({ name, type });
}

/** Lends `barcode` to the member using their own valid card. */
export function lend(library: Library, member: { member: { id: number }; card: { number: string } }, barcode: string) {
  return library.lending.checkout({ memberId: member.member.id, cardNumber: member.card.number, barcode });
}
