import type { IsoDate } from './dates';
import type { Author, AuthorProps } from './model/Author';
import type { Book, BookProps } from './model/Book';
import type { BookCopy, BookCopyProps, CopyStatus } from './model/BookCopy';
import type { Fine, FineProps } from './model/Fine';
import type { LendingPolicy } from './model/LendingPolicy';
import type { LibraryCard, LibraryCardProps } from './model/LibraryCard';
import type { Loan, LoanProps } from './model/Loan';
import type { Member, MemberProps } from './model/Member';
import type { Reservation, ReservationProps } from './model/Reservation';

/**
 * Storage contracts. The core only knows these interfaces; the SQLite
 * implementations live in `src/db`. Swapping the database never touches a rule.
 */

/** The data needed to create an entity: everything except the id the database assigns. */
export type Draft<Props> = Omit<Props, 'id'>;

export interface AuthorRepository {
  add(draft: Draft<AuthorProps>): Author;
  findById(id: number): Author | null;
  findByName(name: string): Author | null;
  all(): Author[];
}

export interface BookRepository {
  add(draft: Draft<BookProps>): Book;
  save(book: Book): void;
  findById(id: number): Book | null;
  findByIsbn(isbn: string): Book | null;
  /** Case-insensitive match on title, author name or ISBN. */
  search(query: string): Book[];
  all(): Book[];
}

export interface CopyRepository {
  add(draft: Draft<BookCopyProps>): BookCopy;
  save(copy: BookCopy): void;
  findById(id: number): BookCopy | null;
  findByBarcode(barcode: string): BookCopy | null;
  findByBook(bookId: number): BookCopy[];
  countByBook(bookId: number): number;
  countByStatus(): Record<CopyStatus, number>;
}

export interface MemberRepository {
  add(draft: Draft<MemberProps>): Member;
  save(member: Member): void;
  findById(id: number): Member | null;
  search(query: string): Member[];
  all(): Member[];
}

export interface CardRepository {
  add(draft: Draft<LibraryCardProps>): LibraryCard;
  save(card: LibraryCard): void;
  findById(id: number): LibraryCard | null;
  findByNumber(number: string): LibraryCard | null;
  findActiveByMember(memberId: number): LibraryCard | null;
  findByMember(memberId: number): LibraryCard[];
}

export interface LoanRepository {
  add(draft: Draft<LoanProps>): Loan;
  save(loan: Loan): void;
  findById(id: number): Loan | null;
  findActiveByCopy(copyId: number): Loan | null;
  findActiveByMember(memberId: number): Loan[];
  findByMember(memberId: number): Loan[];
  /** Active loans whose due date is before `date`. */
  findOverdue(date: IsoDate): Loan[];
  findActive(): Loan[];
  /** Books ranked by how many times any of their copies has been lent. */
  mostBorrowed(limit: number): { bookId: number; loans: number }[];
}

export interface ReservationRepository {
  add(draft: Draft<ReservationProps>): Reservation;
  save(reservation: Reservation): void;
  findById(id: number): Reservation | null;
  /** Open (waiting or ready) reservations for a book, oldest first: the queue. */
  findOpenByBook(bookId: number): Reservation[];
  findOpenByMember(memberId: number): Reservation[];
  /** The ready reservation a copy is currently being held for, if any. */
  findReadyByCopy(copyId: number): Reservation | null;
  findReady(): Reservation[];
  /** Every waiting or ready reservation, oldest first. */
  findOpen(): Reservation[];
}

export interface FineRepository {
  add(draft: Draft<FineProps>): Fine;
  save(fine: Fine): void;
  findById(id: number): Fine | null;
  findByMember(memberId: number): Fine[];
  findOutstandingByMember(memberId: number): Fine[];
  /** Sum of all unpaid fines in the library, in cents. */
  totalOutstanding(): number;
}

export interface PolicyRepository {
  load(): LendingPolicy;
  save(policy: LendingPolicy): void;
}

/** Everything the library stores, plus a way to make several changes atomically. */
export interface LibraryStore {
  readonly authors: AuthorRepository;
  readonly books: BookRepository;
  readonly copies: CopyRepository;
  readonly members: MemberRepository;
  readonly cards: CardRepository;
  readonly loans: LoanRepository;
  readonly reservations: ReservationRepository;
  readonly fines: FineRepository;
  readonly policy: PolicyRepository;
  /** Runs `work` so that either all of its writes happen or none do. */
  transaction<T>(work: () => T): T;
}
