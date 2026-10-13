import type { Clock } from '../clock';
import { addDays } from '../dates';
import { InvalidStateError, ValidationError } from '../errors';
import { generateCardNumber } from '../identifiers';
import type { Book } from '../model/Book';
import type { BookCopy } from '../model/BookCopy';
import type { Fine } from '../model/Fine';
import type { LibraryCard } from '../model/LibraryCard';
import type { Loan } from '../model/Loan';
import { MEMBER_TYPES, type Member, type MemberType } from '../model/Member';
import type { Reservation } from '../model/Reservation';
import type { LibraryStore } from '../repositories';
import type { FineService } from './FineService';
import { found, requireText } from './support';

export interface RegisterInput {
  name: string;
  type: MemberType;
  email?: string | null;
}

export interface LoanDetails {
  loan: Loan;
  copy: BookCopy;
  book: Book;
}

/** Everything the desk terminal shows when a librarian looks a member up. */
export interface AccountSummary {
  member: Member;
  card: LibraryCard | null;
  activeLoans: LoanDetails[];
  overdueLoans: LoanDetails[];
  reservations: Reservation[];
  outstandingFines: Fine[];
  /** Unpaid fines in cents. */
  balance: number;
}

export interface MemberServiceOptions {
  /** How long a newly issued or renewed card stays valid. */
  cardValidityDays?: number;
  /** Source of randomness for card numbers; injectable so tests are deterministic. */
  random?: () => number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Registering patrons and managing their cards and accounts. */
export class MemberService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;
  private readonly fines: FineService;
  private readonly cardValidityDays: number;
  private readonly random: () => number;

  constructor(store: LibraryStore, clock: Clock, fines: FineService, options: MemberServiceOptions = {}) {
    this.store = store;
    this.clock = clock;
    this.fines = fines;
    this.cardValidityDays = options.cardValidityDays ?? 365;
    this.random = options.random ?? Math.random;
  }

  /** Creates a member and issues their first card. */
  register(input: RegisterInput): { member: Member; card: LibraryCard } {
    const name = requireText(input.name, 'Name');
    if (!MEMBER_TYPES.includes(input.type)) throw new ValidationError(`Unknown member type: ${input.type}`);
    const email = input.email?.trim() || null;
    if (email !== null && !EMAIL.test(email)) throw new ValidationError(`Invalid e-mail address: ${email}`);

    return this.store.transaction(() => {
      const member = this.store.members.add({
        name,
        type: input.type,
        email,
        status: 'active',
        joinedOn: this.clock.today(),
      });
      return { member, card: this.issueCard(member.id) };
    });
  }

  /**
   * Issues a fresh card with a new number. Any card the member still has
   * active is revoked first, so only one card can ever be used.
   */
  issueCard(memberId: number): LibraryCard {
    return this.store.transaction(() => {
      this.get(memberId);
      const current = this.store.cards.findActiveByMember(memberId);
      if (current) {
        current.revoke();
        this.store.cards.save(current);
      }
      const today = this.clock.today();
      return this.store.cards.add({
        memberId,
        number: this.unusedCardNumber(),
        issuedOn: today,
        expiresOn: addDays(today, this.cardValidityDays),
        status: 'active',
      });
    });
  }

  /** The member says their card is gone: block it and hand out a new one. */
  reportCardLost(memberId: number): LibraryCard {
    return this.store.transaction(() => {
      const card = this.store.cards.findActiveByMember(memberId);
      if (!card) throw new InvalidStateError(`Member ${memberId} has no active card`);
      card.markLost();
      this.store.cards.save(card);
      return this.issueCard(memberId);
    });
  }

  /** Extends the active card for another validity period from today (or from its expiry, if later). */
  renewCard(memberId: number): LibraryCard {
    return this.store.transaction(() => {
      const card = this.store.cards.findActiveByMember(memberId);
      if (!card) throw new InvalidStateError(`Member ${memberId} has no active card`);
      const today = this.clock.today();
      const base = card.isExpiredOn(today) ? today : card.expiresOn;
      card.extendTo(addDays(base, this.cardValidityDays));
      this.store.cards.save(card);
      return card;
    });
  }

  suspend(memberId: number): Member {
    return this.change(memberId, (m) => m.suspend());
  }

  reinstate(memberId: number): Member {
    return this.change(memberId, (m) => m.reinstate());
  }

  update(memberId: number, changes: { name?: string; type?: MemberType; email?: string | null }): Member {
    return this.change(memberId, (m) => {
      if (changes.name !== undefined) m.name = requireText(changes.name, 'Name');
      if (changes.type !== undefined) {
        if (!MEMBER_TYPES.includes(changes.type)) throw new ValidationError(`Unknown member type: ${changes.type}`);
        m.type = changes.type;
      }
      if (changes.email !== undefined) {
        const email = changes.email?.trim() || null;
        if (email !== null && !EMAIL.test(email)) throw new ValidationError(`Invalid e-mail address: ${email}`);
        m.email = email;
      }
    });
  }

  get(memberId: number): Member {
    return found(this.store.members.findById(memberId), 'Member', memberId);
  }

  search(query: string): Member[] {
    return query.trim() ? this.store.members.search(query.trim()) : this.store.members.all();
  }

  /** The member whose card this is, if the number is registered at all. */
  findByCardNumber(number: string): { member: Member; card: LibraryCard } | null {
    const card = this.store.cards.findByNumber(number.replace(/\s/g, ''));
    if (!card) return null;
    return { member: this.get(card.memberId), card };
  }

  summary(memberId: number): AccountSummary {
    const member = this.get(memberId);
    const today = this.clock.today();
    const activeLoans = this.store.loans.findActiveByMember(memberId).map((loan) => this.details(loan));
    return {
      member,
      card: this.store.cards.findActiveByMember(memberId),
      activeLoans,
      overdueLoans: activeLoans.filter(({ loan }) => loan.isOverdueOn(today)),
      reservations: this.store.reservations.findOpenByMember(memberId),
      outstandingFines: this.store.fines.findOutstandingByMember(memberId),
      balance: this.fines.balance(memberId),
    };
  }

  loanHistory(memberId: number): LoanDetails[] {
    this.get(memberId);
    return this.store.loans.findByMember(memberId).map((loan) => this.details(loan));
  }

  private details(loan: Loan): LoanDetails {
    const copy = found(this.store.copies.findById(loan.copyId), 'Copy', loan.copyId);
    const book = found(this.store.books.findById(copy.bookId), 'Book', copy.bookId);
    return { loan, copy, book };
  }

  private unusedCardNumber(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const number = generateCardNumber(this.random);
      if (!this.store.cards.findByNumber(number)) return number;
    }
    throw new InvalidStateError('Could not find an unused card number');
  }

  private change(memberId: number, change: (member: Member) => void): Member {
    return this.store.transaction(() => {
      const member = this.get(memberId);
      change(member);
      this.store.members.save(member);
      return member;
    });
  }
}
