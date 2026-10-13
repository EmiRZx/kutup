import type { ManualClock } from '../../core/clock';
import { addDays, daysBetween, isBefore, type IsoDate } from '../../core/dates';
import { LibraryError } from '../../core/errors';
import type { Library } from '../../core/Library';
import type { Random } from '../../core/random';

/**
 * Plays out `until − today` days of ordinary library life through the public
 * services, so a sample library opens with history: loans, late returns,
 * fines, reservations and holds. Nothing is written behind the core's back;
 * every action passes the same rules a librarian's would.
 */
export function seedActivity(library: Library, clock: ManualClock, until: IsoDate, random: Random): void {
  const members = library.members.search('');
  // Roughly one member in four is chronically late.
  const tardy = new Set(members.filter(() => random.chance(0.25)).map((m) => m.id));
  const plannedReturn = new Map<number, IsoDate>();
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      if (!(error instanceof LibraryError)) throw error;
    }
  };

  while (!isBefore(until, clock.today())) {
    const today = clock.today();
    library.openForTheDay();

    // Returns that were planned for today (or earlier).
    for (const loan of library.store.loans.findActive()) {
      const due = plannedReturn.get(loan.id);
      if (due && !isBefore(today, due)) {
        const copy = library.store.copies.findById(loan.copyId)!;
        const condition = random.chance(0.03) ? 'damaged' : random.chance(0.1) ? 'worn' : 'good';
        attempt(() => library.lending.returnCopy(copy.barcode, condition));
      }
    }

    // Members collecting books held for them.
    for (const hold of library.store.reservations.findReady()) {
      if (!random.chance(0.6)) continue;
      const card = library.store.cards.findActiveByMember(hold.memberId);
      const copy = library.store.copies.findById(hold.copyId!);
      if (card && copy) attempt(() => borrow(hold.memberId, card.number, copy.barcode));
    }

    // New visitors browsing the shelves.
    const visitors = random.int(2, 5);
    for (let i = 0; i < visitors; i++) {
      const member = random.pick(members);
      const card = library.store.cards.findActiveByMember(member.id);
      if (!card) continue;
      const book = random.pick(library.catalog.search(''));
      const copy = library.catalog.copiesOf(book.id).find((c) => c.isOnShelf);
      if (copy) {
        const check = library.lending.checkCheckout({ memberId: member.id, cardNumber: card.number, barcode: copy.barcode });
        if (check.allowed) borrow(member.id, card.number, copy.barcode);
        else if (check.violations.some((v) => v.code === 'FINES_OUTSTANDING')) attempt(() => library.fines.payAll(member.id));
      } else if (random.chance(0.5) && library.reservations.check(member.id, book.id).length === 0) {
        library.reservations.reserve(member.id, book.id);
      }
    }

    // Some people settle their fines unprompted.
    for (const member of members) {
      if (library.fines.balance(member.id) > 0 && random.chance(0.15)) library.fines.payAll(member.id);
    }

    if (today === until) break;
    clock.advance(1);
  }

  function borrow(memberId: number, cardNumber: string, barcode: string) {
    const loan = library.lending.checkout({ memberId, cardNumber, barcode });
    const loanDays = daysBetween(loan.borrowedOn, loan.dueOn);
    const returnOn = tardy.has(memberId)
      ? addDays(loan.dueOn, random.int(-2, 12))
      : addDays(loan.borrowedOn, random.int(2, loanDays));
    plannedReturn.set(loan.id, returnOn);
  }
}
