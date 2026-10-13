import type { Clock } from '../clock';
import { addDays, isAfter, type IsoDate } from '../dates';
import { InvalidStateError, PolicyViolationError, ValidationError } from '../errors';
import type { Book } from '../model/Book';
import type { BookCopy, CopyCondition } from '../model/BookCopy';
import type { Fine } from '../model/Fine';
import type { LibraryCard } from '../model/LibraryCard';
import type { Loan } from '../model/Loan';
import type { Member } from '../model/Member';
import type { Reservation } from '../model/Reservation';
import { isOverridable, violation, type Violation } from '../model/violations';
import type { LibraryStore } from '../repositories';
import { FineService } from './FineService';
import type { ReservationService } from './ReservationService';
import { found } from './support';

/** What happens at the desk: someone hands over a card and a book. */
export interface CheckoutRequest {
  /** The member the patron claims to be. */
  memberId: number;
  /** The number printed on the card they handed over. */
  cardNumber: string;
  barcode: string;
}

/** A librarian's decision to lend despite broken rules. The reason is kept on record. */
export interface Override {
  note: string;
}

export interface Assessment {
  violations: Violation[];
  /** True when there are no violations at all. */
  allowed: boolean;
  /** True when every violation could be overridden by a librarian. */
  overridable: boolean;
}

export interface CheckoutAssessment extends Assessment {
  member: Member;
  card: LibraryCard | null;
  copy: BookCopy;
  book: Book;
  /** When the copy would be due back if lent today. */
  dueOn: IsoDate;
}

export interface RenewalAssessment extends Assessment {
  loan: Loan;
}

export interface ReturnReceipt {
  loan: Loan;
  copy: BookCopy;
  book: Book;
  daysLate: number;
  fines: Fine[];
  /** Set when the copy went straight onto the hold shelf for a waiting member. */
  heldFor: Reservation | null;
}

export interface OverdueEntry {
  loan: Loan;
  member: Member;
  copy: BookCopy;
  book: Book;
  daysLate: number;
  /** The fine that would be charged if it came back today (cents). */
  accruedFine: number;
}

function assess(violations: Violation[]): Assessment {
  return {
    violations,
    allowed: violations.length === 0,
    overridable: violations.every((v) => isOverridable(v.code)),
  };
}

/**
 * Lending, renewing and returning. This is the referee of the game: every
 * decision the player stamps at the desk is checked against `checkCheckout`.
 */
export class LendingService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;
  private readonly fines: FineService;
  private readonly reservations: ReservationService;

  constructor(store: LibraryStore, clock: Clock, fines: FineService, reservations: ReservationService) {
    this.store = store;
    this.clock = clock;
    this.fines = fines;
    this.reservations = reservations;
  }

  /** Every rule the request would break, without changing anything. */
  checkCheckout(request: CheckoutRequest): CheckoutAssessment {
    const member = found(this.store.members.findById(request.memberId), 'Member', request.memberId);
    const copy = found(this.store.copies.findByBarcode(request.barcode), 'Copy', request.barcode);
    const book = found(this.store.books.findById(copy.bookId), 'Book', copy.bookId);
    const card = this.store.cards.findByNumber(request.cardNumber.replace(/\s/g, ''));
    const policy = this.store.policy.load();
    const rules = policy.rulesFor(member.type);
    const today = this.clock.today();
    const violations: Violation[] = [];

    // Who is asking
    if (!card) violations.push(violation('CARD_UNKNOWN'));
    else if (card.memberId !== member.id) violations.push(violation('CARD_MISMATCH'));
    else if (card.status !== 'active') violations.push(violation('CARD_INACTIVE'));
    else if (card.isExpiredOn(today)) violations.push(violation('CARD_EXPIRED'));
    if (!member.isActive) violations.push(violation('MEMBER_SUSPENDED'));

    // Their account
    const activeLoans = this.store.loans.findActiveByMember(member.id);
    if (activeLoans.length >= rules.maxLoans) violations.push(violation('LOAN_LIMIT_REACHED'));
    if (policy.blockWhenOverdue && activeLoans.some((l) => l.isOverdueOn(today))) {
      violations.push(violation('HAS_OVERDUE_LOANS'));
    }
    const balance = this.fines.balance(member.id);
    if (balance > 0 && balance >= policy.fineBlockThreshold) violations.push(violation('FINES_OUTSTANDING'));

    // The item
    if (copy.status === 'on_hold') {
      const hold = this.store.reservations.findReadyByCopy(copy.id);
      if (hold && hold.memberId !== member.id) violations.push(violation('COPY_ON_HOLD_FOR_ANOTHER'));
    } else if (copy.status !== 'available') {
      violations.push(violation('COPY_UNAVAILABLE'));
    }
    if (book.referenceOnly && !policy.referenceLoansAllowed) violations.push(violation('REFERENCE_ONLY'));

    return { ...assess(violations), member, card, copy, book, dueOn: addDays(today, rules.loanDays) };
  }

  /**
   * Lends the copy. Refuses with a {@link PolicyViolationError} if any rule is
   * broken, unless an `override` is given and every violation is overridable.
   */
  checkout(request: CheckoutRequest, override?: Override): Loan {
    return this.store.transaction(() => {
      const check = this.checkCheckout(request);
      const note = this.validateOverride(check, override);
      const { member, copy, book } = check;
      const today = this.clock.today();

      if (copy.status === 'on_hold') {
        const hold = this.store.reservations.findReadyByCopy(copy.id);
        if (hold) {
          if (hold.memberId === member.id) hold.fulfill();
          else hold.returnToQueue(); // overridden: the held copy goes to someone else
          this.store.reservations.save(hold);
        }
      }
      // A member who was still queueing for this book no longer needs to.
      for (const own of this.store.reservations.findOpenByMember(member.id)) {
        if (own.bookId === book.id && own.status === 'waiting') {
          own.cancel();
          this.store.reservations.save(own);
        }
      }

      copy.checkOut();
      this.store.copies.save(copy);
      return this.store.loans.add({
        copyId: copy.id,
        memberId: member.id,
        borrowedOn: today,
        dueOn: check.dueOn,
        returnedOn: null,
        renewals: 0,
        overriddenViolations: check.violations.map((v) => v.code),
        overrideNote: note,
      });
    });
  }

  checkRenewal(loanId: number): RenewalAssessment {
    const loan = this.getLoan(loanId);
    if (!loan.isActive) throw new InvalidStateError(`Loan ${loanId} is already closed`);
    const member = found(this.store.members.findById(loan.memberId), 'Member', loan.memberId);
    const copy = found(this.store.copies.findById(loan.copyId), 'Copy', loan.copyId);
    const rules = this.store.policy.load().rulesFor(member.type);
    const violations: Violation[] = [];

    if (!member.isActive) violations.push(violation('MEMBER_SUSPENDED'));
    if (loan.renewals >= rules.maxRenewals) violations.push(violation('RENEWAL_LIMIT_REACHED'));
    if (loan.isOverdueOn(this.clock.today())) violations.push(violation('LOAN_OVERDUE'));
    const queue = this.store.reservations.findOpenByBook(copy.bookId);
    if (queue.some((r) => r.status === 'waiting' && r.memberId !== member.id)) {
      violations.push(violation('BOOK_HAS_WAITING_RESERVATIONS'));
    }
    return { ...assess(violations), loan };
  }

  /** Extends the loan by a full loan period, counted from today or the current due date, whichever is later. */
  renew(loanId: number, override?: Override): Loan {
    return this.store.transaction(() => {
      const check = this.checkRenewal(loanId);
      const note = this.validateOverride(check, override);
      const { loan } = check;
      const member = found(this.store.members.findById(loan.memberId), 'Member', loan.memberId);
      const today = this.clock.today();
      const base = isAfter(loan.dueOn, today) ? loan.dueOn : today;
      loan.renew(addDays(base, this.store.policy.load().rulesFor(member.type).loanDays));
      if (note) loan.recordOverride(check.violations.map((v) => v.code), note);
      this.store.loans.save(loan);
      return loan;
    });
  }

  /** Checks a copy back in, charges any fines and hands it to the reservation queue. */
  returnCopy(barcode: string, condition: CopyCondition = 'good'): ReturnReceipt {
    return this.store.transaction(() => {
      const copy = found(this.store.copies.findByBarcode(barcode), 'Copy', barcode);
      const loan = this.store.loans.findActiveByCopy(copy.id);
      if (!loan) throw new InvalidStateError(`Copy ${barcode} is not on loan`);
      const book = found(this.store.books.findById(copy.bookId), 'Book', copy.bookId);

      loan.close(this.clock.today());
      this.store.loans.save(loan);
      copy.checkIn(condition);
      this.store.copies.save(copy);

      const fines: Fine[] = [];
      const overdue = this.fines.chargeOverdue(loan);
      if (overdue) fines.push(overdue);
      if (condition === 'damaged') {
        const fee = this.store.policy.load().damageFee;
        if (fee > 0) fines.push(this.fines.charge(loan.memberId, fee, 'damage', loan.id));
      }

      const heldFor = this.reservations.allocate(copy);
      return { loan, copy, book, daysLate: loan.daysLate(loan.returnedOn!), fines, heldFor };
    });
  }

  /** The borrower admits the copy is gone: close the loan and charge for it. */
  declareLost(loanId: number): Fine[] {
    return this.store.transaction(() => {
      const loan = this.getLoan(loanId);
      const copy = found(this.store.copies.findById(loan.copyId), 'Copy', loan.copyId);
      loan.close(this.clock.today());
      this.store.loans.save(loan);
      copy.markLost();
      this.store.copies.save(copy);

      const fines: Fine[] = [];
      const overdue = this.fines.chargeOverdue(loan);
      if (overdue) fines.push(overdue);
      const fee = this.store.policy.load().lostFee;
      if (fee > 0) fines.push(this.fines.charge(loan.memberId, fee, 'lost', loan.id));
      return fines;
    });
  }

  overdue(): OverdueEntry[] {
    const today = this.clock.today();
    const policy = this.store.policy.load();
    return this.store.loans.findOverdue(today).map((loan) => {
      const copy = found(this.store.copies.findById(loan.copyId), 'Copy', loan.copyId);
      return {
        loan,
        copy,
        member: found(this.store.members.findById(loan.memberId), 'Member', loan.memberId),
        book: found(this.store.books.findById(copy.bookId), 'Book', copy.bookId),
        daysLate: loan.daysLate(today),
        accruedFine: FineService.overdueAmount(loan, today, policy),
      };
    });
  }

  getLoan(loanId: number): Loan {
    return found(this.store.loans.findById(loanId), 'Loan', loanId);
  }

  /** Throws unless the request is allowed outright or legitimately overridden; returns the override note. */
  private validateOverride(check: Assessment, override: Override | undefined): string | null {
    if (check.allowed) return null;
    const hard = check.violations.filter((v) => !isOverridable(v.code));
    if (hard.length > 0 || !override) throw new PolicyViolationError(hard.length > 0 ? hard : check.violations);
    const note = override.note.trim();
    if (!note) throw new ValidationError('An override needs a reason');
    return note;
  }
}
