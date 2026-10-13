import { daysBetween } from '../core/dates';
import { LibraryError } from '../core/errors';
import type { Library } from '../core/Library';
import type { MemberType } from '../core/model/Member';
import type { Random } from '../core/random';
import { FIRST_NAMES, LAST_NAMES } from './names';

/**
 * Ordinary library life, played out through the public services only: people
 * return books (some late, a few damaged), collect holds, borrow, queue for
 * books that are out, pay fines and sign up. Every action passes the same
 * rules a librarian's would, so the history it leaves behind is legitimate.
 *
 * It fills the sample library with a past, and in the game it is everything
 * that happens while the player is not at the desk.
 */

/** Roughly one member in four is chronically late. Stable per member, no state needed. */
export function isTardy(memberId: number): boolean {
  return Math.imul(memberId, 2654435761) >>> 30 === 0;
}

export function randomName(random: Random): string {
  return `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
}

/** One day of off-screen activity on the library's current date. Does not move the clock. */
export function simulateDay(library: Library, random: Random): void {
  const today = library.clock.today();
  const attempt = (action: () => unknown) => {
    try {
      action();
    } catch (error) {
      if (!(error instanceof LibraryError)) throw error;
    }
  };

  // Returns.
  for (const loan of library.store.loans.findActive()) {
    const daysLeft = daysBetween(today, loan.dueOn);
    const chance = isTardy(loan.memberId) ? (daysLeft > 0 ? 0.03 : 0.12) : daysLeft > 0 ? 0.1 : 0.7;
    if (!random.chance(chance)) continue;
    const copy = library.store.copies.findById(loan.copyId)!;
    const condition = random.chance(0.03) ? 'damaged' : random.chance(0.1) ? 'worn' : 'good';
    attempt(() => library.lending.returnCopy(copy.barcode, condition));
  }

  // Members collecting books held for them.
  for (const hold of library.store.reservations.findReady()) {
    if (!random.chance(0.6)) continue;
    const card = library.store.cards.findActiveByMember(hold.memberId);
    const copy = library.store.copies.findById(hold.copyId!);
    if (card && copy) {
      attempt(() => library.lending.checkout({ memberId: hold.memberId, cardNumber: card.number, barcode: copy.barcode }));
    }
  }

  // New faces. Guest cards only last a month, so these are tomorrow's expired cards.
  if (random.chance(0.15)) attempt(() => register(library, random, 'guest'));
  if (random.chance(0.05)) attempt(() => register(library, random, 'student'));

  // Visitors browsing the shelves.
  const members = library.members.search('').filter((m) => m.isActive);
  const books = library.catalog.search('');
  const visitors = random.int(2, 5);
  for (let i = 0; i < visitors && members.length > 0; i++) {
    const member = random.pick(members);
    const card = library.store.cards.findActiveByMember(member.id);
    if (!card) continue;
    const book = random.pick(books);
    const copy = library.catalog.copiesOf(book.id).find((c) => c.isOnShelf);
    if (copy) {
      const check = library.lending.checkCheckout({ memberId: member.id, cardNumber: card.number, barcode: copy.barcode });
      if (check.allowed) library.lending.checkout({ memberId: member.id, cardNumber: card.number, barcode: copy.barcode });
      else if (check.violations.some((v) => v.code === 'FINES_OUTSTANDING') && random.chance(0.5)) library.fines.payAll(member.id);
    } else if (random.chance(0.5) && library.reservations.check(member.id, book.id).length === 0) {
      library.reservations.reserve(member.id, book.id);
    }
  }

  // Some people settle their fines unprompted.
  for (const member of members) {
    if (library.fines.balance(member.id) > 0 && random.chance(0.12)) library.fines.payAll(member.id);
  }
}

function register(library: Library, random: Random, type: MemberType) {
  return library.members.register({ name: randomName(random), type });
}
