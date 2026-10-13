import type { Clock } from '../clock';
import { addDays } from '../dates';
import { PolicyViolationError } from '../errors';
import type { BookCopy } from '../model/BookCopy';
import type { Reservation } from '../model/Reservation';
import { violation, type Violation } from '../model/violations';
import type { LibraryStore } from '../repositories';
import { found } from './support';

/**
 * The waiting list. Members reserve a book (not a specific copy) when none is
 * on the shelf; the first copy to come back is held for the first in line.
 */
export class ReservationService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;

  constructor(store: LibraryStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  /** All the reasons this member may not reserve this book right now (empty = allowed). */
  check(memberId: number, bookId: number): Violation[] {
    const member = found(this.store.members.findById(memberId), 'Member', memberId);
    found(this.store.books.findById(bookId), 'Book', bookId);
    const violations: Violation[] = [];

    if (!member.isActive) violations.push(violation('MEMBER_SUSPENDED'));
    if (this.store.reservations.findOpenByMember(memberId).some((r) => r.bookId === bookId)) {
      violations.push(violation('ALREADY_RESERVED'));
    }
    const borrowedCopyIds = new Set(this.store.loans.findActiveByMember(memberId).map((l) => l.copyId));
    const copies = this.store.copies.findByBook(bookId);
    if (copies.some((c) => borrowedCopyIds.has(c.id))) violations.push(violation('ALREADY_BORROWED'));
    if (copies.some((c) => c.isOnShelf)) violations.push(violation('COPY_AVAILABLE_ON_SHELF'));
    return violations;
  }

  reserve(memberId: number, bookId: number): Reservation {
    return this.store.transaction(() => {
      const violations = this.check(memberId, bookId);
      if (violations.length > 0) throw new PolicyViolationError(violations);
      return this.store.reservations.add({
        bookId,
        memberId,
        createdOn: this.clock.today(),
        status: 'waiting',
        copyId: null,
        holdUntil: null,
      });
    });
  }

  cancel(reservationId: number): Reservation {
    return this.store.transaction(() => {
      const reservation = this.get(reservationId);
      const heldCopyId = reservation.status === 'ready' ? reservation.copyId : null;
      reservation.cancel();
      this.store.reservations.save(reservation);
      if (heldCopyId !== null) this.passOnHeldCopy(found(this.store.copies.findById(heldCopyId), 'Copy', heldCopyId));
      return reservation;
    });
  }

  /** 1 = next in line. Ready reservations count as position 0 (the book is waiting at the desk). */
  queuePosition(reservationId: number): number {
    const reservation = this.get(reservationId);
    if (reservation.status === 'ready') return 0;
    const waiting = this.store.reservations.findOpenByBook(reservation.bookId).filter((r) => r.status === 'waiting');
    const index = waiting.findIndex((r) => r.id === reservationId);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Called whenever a copy becomes free (returned, repaired, found). If someone
   * is waiting for the book the copy goes on hold for them; otherwise it is
   * left on the shelf. Returns the reservation that got the copy, if any.
   */
  allocate(copy: BookCopy): Reservation | null {
    if (!copy.isOnShelf) return null;
    const next = this.store.reservations.findOpenByBook(copy.bookId).find((r) => r.status === 'waiting');
    if (!next) return null;
    next.markReady(copy.id, addDays(this.clock.today(), this.store.policy.load().holdDays));
    copy.placeOnHold();
    this.store.reservations.save(next);
    this.store.copies.save(copy);
    return next;
  }

  /** Ends every hold whose pick-up window has passed and hands the copies on. */
  expireHolds(): Reservation[] {
    return this.store.transaction(() => {
      const today = this.clock.today();
      const expired = this.store.reservations.findReady().filter((r) => r.isHoldExpiredOn(today));
      for (const reservation of expired) {
        const copyId = reservation.copyId!;
        reservation.expire();
        this.store.reservations.save(reservation);
        this.passOnHeldCopy(found(this.store.copies.findById(copyId), 'Copy', copyId));
      }
      return expired;
    });
  }

  get(reservationId: number): Reservation {
    return found(this.store.reservations.findById(reservationId), 'Reservation', reservationId);
  }

  private passOnHeldCopy(copy: BookCopy): void {
    copy.releaseHold();
    this.store.copies.save(copy);
    this.allocate(copy);
  }
}
