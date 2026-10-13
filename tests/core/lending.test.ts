import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualClock } from '../../src/core/clock';
import { InvalidStateError, PolicyViolationError, ValidationError } from '../../src/core/errors';
import type { Library } from '../../src/core/Library';
import type { ViolationCode } from '../../src/core/model/violations';
import { addBook, addMember, freshLibrary, lend, START } from '../helpers';

let library: Library;
let clock: ManualClock;

beforeEach(async () => {
  ({ library, clock } = await freshLibrary());
});

function codesFor(fn: () => unknown): ViolationCode[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof PolicyViolationError) return error.violations.map((v) => v.code);
    throw error;
  }
  throw new Error('Expected a PolicyViolationError');
}

describe('checkout', () => {
  it('lends an available copy for the member type’s loan period', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);

    expect(loan.borrowedOn).toBe(START);
    expect(loan.dueOn).toBe('2026-03-16'); // students: 14 days
    expect(library.catalog.getCopy(barcodes[0]!).status).toBe('on_loan');
    expect(library.members.summary(alice.member.id).activeLoans).toHaveLength(1);
  });

  it('gives staff a longer loan period than guests', () => {
    const staff = addMember(library, 'Prof', 'staff');
    const guest = addMember(library, 'Visitor', 'guest');
    const { barcodes } = addBook(library, 'Book', 2);
    expect(lend(library, staff, barcodes[0]!).dueOn).toBe('2026-03-30');
    expect(lend(library, guest, barcodes[1]!).dueOn).toBe('2026-03-09');
  });

  it('allows a clean request', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const check = library.lending.checkCheckout({ memberId: alice.member.id, cardNumber: alice.card.number, barcode: barcodes[0]! });
    expect(check.allowed).toBe(true);
    expect(check.violations).toEqual([]);
  });

  describe('spots every kind of problem at the desk', () => {
    it('an unknown (forged) card', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      expect(codesFor(() => library.lending.checkout({ memberId: alice.member.id, cardNumber: '12345674', barcode: barcodes[0]! }))).toEqual([
        'CARD_UNKNOWN',
      ]);
    });

    it('someone else’s card', () => {
      const alice = addMember(library, 'Alice');
      const bob = addMember(library, 'Bob');
      const { barcodes } = addBook(library);
      expect(codesFor(() => library.lending.checkout({ memberId: bob.member.id, cardNumber: alice.card.number, barcode: barcodes[0]! }))).toEqual([
        'CARD_MISMATCH',
      ]);
    });

    it('an expired card', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      clock.advance(366);
      expect(codesFor(() => lend(library, alice, barcodes[0]!))).toEqual(['CARD_EXPIRED']);
    });

    it('a card reported lost', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      library.members.reportCardLost(alice.member.id);
      expect(codesFor(() => lend(library, alice, barcodes[0]!))).toEqual(['CARD_INACTIVE']);
    });

    it('a suspended member', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      library.members.suspend(alice.member.id);
      expect(codesFor(() => lend(library, alice, barcodes[0]!))).toEqual(['MEMBER_SUSPENDED']);
    });

    it('the loan limit', () => {
      const guest = addMember(library, 'Visitor', 'guest'); // guests: 2 books
      const { barcodes } = addBook(library, 'Book', 3);
      lend(library, guest, barcodes[0]!);
      lend(library, guest, barcodes[1]!);
      expect(codesFor(() => lend(library, guest, barcodes[2]!))).toEqual(['LOAN_LIMIT_REACHED']);
    });

    it('overdue items', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library, 'Book', 2);
      lend(library, alice, barcodes[0]!);
      clock.advance(15);
      expect(codesFor(() => lend(library, alice, barcodes[1]!))).toEqual(['HAS_OVERDUE_LOANS']);
    });

    it('unpaid fines above the threshold', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library, 'Book', 2);
      lend(library, alice, barcodes[0]!);
      clock.advance(14 + 20); // 20 days late → 20 × 25¢ = $5.00, exactly the threshold
      library.lending.returnCopy(barcodes[0]!);
      expect(library.fines.balance(alice.member.id)).toBe(500);
      expect(codesFor(() => lend(library, alice, barcodes[1]!))).toEqual(['FINES_OUTSTANDING']);

      library.fines.payAll(alice.member.id);
      expect(lend(library, alice, barcodes[1]!).isActive).toBe(true);
    });

    it('a reference-only book', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library, 'Dictionary', 1, { referenceOnly: true });
      expect(codesFor(() => lend(library, alice, barcodes[0]!))).toEqual(['REFERENCE_ONLY']);
    });

    it('a copy that is already out', () => {
      const alice = addMember(library, 'Alice');
      const bob = addMember(library, 'Bob');
      const { barcodes } = addBook(library);
      lend(library, alice, barcodes[0]!);
      expect(codesFor(() => lend(library, bob, barcodes[0]!))).toEqual(['COPY_UNAVAILABLE']);
    });

    it('several problems at once', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library, 'Dictionary', 1, { referenceOnly: true });
      library.members.suspend(alice.member.id);
      clock.advance(400);
      expect(codesFor(() => lend(library, alice, barcodes[0]!))).toEqual(['CARD_EXPIRED', 'MEMBER_SUSPENDED', 'REFERENCE_ONLY']);
    });
  });

  describe('librarian overrides', () => {
    it('lend despite soft violations and keep the reason on record', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      clock.advance(366);
      const loan = library.lending.checkout(
        { memberId: alice.member.id, cardNumber: alice.card.number, barcode: barcodes[0]! },
        { note: 'Card renewal pending' },
      );
      expect(loan.overriddenViolations).toEqual(['CARD_EXPIRED']);
      expect(library.lending.getLoan(loan.id).overrideNote).toBe('Card renewal pending');
    });

    it('need a reason', () => {
      const alice = addMember(library);
      const { barcodes } = addBook(library);
      clock.advance(366);
      expect(() =>
        library.lending.checkout({ memberId: alice.member.id, cardNumber: alice.card.number, barcode: barcodes[0]! }, { note: '  ' }),
      ).toThrow(ValidationError);
    });

    it('cannot make the impossible possible', () => {
      const alice = addMember(library, 'Alice');
      const bob = addMember(library, 'Bob');
      const { barcodes } = addBook(library);
      lend(library, alice, barcodes[0]!);
      expect(() =>
        library.lending.checkout({ memberId: bob.member.id, cardNumber: bob.card.number, barcode: barcodes[0]! }, { note: 'Please' }),
      ).toThrow(PolicyViolationError);
    });
  });
});

describe('returns and fines', () => {
  it('charges nothing for an on-time return', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    clock.advance(14);
    const receipt = library.lending.returnCopy(barcodes[0]!);
    expect(receipt.daysLate).toBe(0);
    expect(receipt.fines).toEqual([]);
    expect(receipt.copy.status).toBe('available');
  });

  it('charges the daily rate for late returns, capped per loan', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library, 'Book', 2);
    lend(library, alice, barcodes[0]!);
    lend(library, alice, barcodes[1]!);
    clock.advance(14 + 3);
    expect(library.lending.returnCopy(barcodes[0]!).fines.map((f) => f.amount)).toEqual([75]);
    clock.advance(100);
    expect(library.lending.returnCopy(barcodes[1]!).fines.map((f) => f.amount)).toEqual([1000]); // the cap
  });

  it('charges a damage fee and sends the copy to repair', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const receipt = library.lending.returnCopy(barcodes[0]!, 'damaged');
    expect(receipt.fines.map((f) => [f.reason, f.amount])).toEqual([['damage', 1500]]);
    expect(receipt.copy.status).toBe('in_repair');
  });

  it('refuses to return a copy that is not out', () => {
    const { barcodes } = addBook(library);
    expect(() => library.lending.returnCopy(barcodes[0]!)).toThrow(InvalidStateError);
  });

  it('handles lost books', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);
    clock.advance(16);
    const fines = library.lending.declareLost(loan.id);
    expect(fines.map((f) => [f.reason, f.amount])).toEqual([
      ['overdue', 50],
      ['lost', 3000],
    ]);
    expect(library.catalog.getCopy(barcodes[0]!).status).toBe('lost');
    expect(library.fines.balance(alice.member.id)).toBe(3050);
  });

  it('lists overdue loans with what they would cost today', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    clock.advance(20);
    const [entry] = library.lending.overdue();
    expect(entry?.member.name).toBe('Test Member');
    expect(entry?.daysLate).toBe(6);
    expect(entry?.accruedFine).toBe(150);
  });
});

describe('renewals', () => {
  it('extends the due date by a full loan period', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);
    clock.advance(10);
    expect(library.lending.renew(loan.id).dueOn).toBe('2026-03-30'); // old due date + 14
  });

  it('stops at the renewal limit', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);
    library.lending.renew(loan.id);
    library.lending.renew(loan.id);
    expect(codesFor(() => library.lending.renew(loan.id))).toEqual(['RENEWAL_LIMIT_REACHED']);
  });

  it('refuses overdue loans and books others are waiting for', () => {
    const alice = addMember(library, 'Alice');
    const bob = addMember(library, 'Bob');
    const { book, barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);
    library.reservations.reserve(bob.member.id, book.id);
    clock.advance(15);
    expect(codesFor(() => library.lending.renew(loan.id))).toEqual(['LOAN_OVERDUE', 'BOOK_HAS_WAITING_RESERVATIONS']);
  });
});

describe('reservations', () => {
  it('cannot be made while a copy is on the shelf', () => {
    const alice = addMember(library);
    const { book } = addBook(library);
    expect(codesFor(() => library.reservations.reserve(alice.member.id, book.id))).toEqual(['COPY_AVAILABLE_ON_SHELF']);
  });

  it('form a first-come, first-served queue', () => {
    const [alice, bob, carol] = ['Alice', 'Bob', 'Carol'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const bobs = library.reservations.reserve(bob.member.id, book.id);
    clock.advance(1);
    const carols = library.reservations.reserve(carol.member.id, book.id);
    expect(library.reservations.queuePosition(bobs.id)).toBe(1);
    expect(library.reservations.queuePosition(carols.id)).toBe(2);

    const receipt = library.lending.returnCopy(barcodes[0]!);
    expect(receipt.heldFor?.memberId).toBe(bob.member.id);
    expect(receipt.copy.status).toBe('on_hold');
    expect(library.reservations.queuePosition(bobs.id)).toBe(0);
    expect(library.reservations.queuePosition(carols.id)).toBe(1);
  });

  it('only the member it is held for can take a held copy', () => {
    const [alice, bob, carol] = ['Alice', 'Bob', 'Carol'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const reservation = library.reservations.reserve(bob.member.id, book.id);
    library.lending.returnCopy(barcodes[0]!);

    expect(codesFor(() => lend(library, carol, barcodes[0]!))).toEqual(['COPY_ON_HOLD_FOR_ANOTHER']);
    lend(library, bob, barcodes[0]!);
    expect(library.reservations.get(reservation.id).status).toBe('fulfilled');
  });

  it('send an overridden hold back to the front of the queue', () => {
    const [alice, bob, carol] = ['Alice', 'Bob', 'Carol'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const reservation = library.reservations.reserve(bob.member.id, book.id);
    library.lending.returnCopy(barcodes[0]!);
    library.lending.checkout(
      { memberId: carol.member.id, cardNumber: carol.card.number, barcode: barcodes[0]! },
      { note: 'Dean’s request' },
    );
    expect(library.reservations.get(reservation.id).status).toBe('waiting');
    expect(library.reservations.queuePosition(reservation.id)).toBe(1);
  });

  it('expire when not collected and pass the copy on', () => {
    const [alice, bob, carol] = ['Alice', 'Bob', 'Carol'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const bobs = library.reservations.reserve(bob.member.id, book.id);
    const carols = library.reservations.reserve(carol.member.id, book.id);
    library.lending.returnCopy(barcodes[0]!); // held for Bob for 3 days

    clock.advance(3);
    library.openForTheDay();
    expect(library.reservations.get(bobs.id).status).toBe('ready');

    clock.advance(1);
    library.openForTheDay();
    expect(library.reservations.get(bobs.id).status).toBe('expired');
    expect(library.reservations.get(carols.id).status).toBe('ready');
    expect(library.catalog.getCopy(barcodes[0]!).status).toBe('on_hold');
  });

  it('return the copy to the shelf when the last reservation is cancelled', () => {
    const [alice, bob] = ['Alice', 'Bob'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    const reservation = library.reservations.reserve(bob.member.id, book.id);
    library.lending.returnCopy(barcodes[0]!);
    library.reservations.cancel(reservation.id);
    expect(library.catalog.getCopy(barcodes[0]!).status).toBe('available');
  });

  it('route a repaired copy to the queue', () => {
    const [alice, bob] = ['Alice', 'Bob'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    library.lending.returnCopy(barcodes[0]!, 'damaged');
    const reservation = library.reservations.reserve(bob.member.id, book.id);
    library.catalog.restoreToShelf(barcodes[0]!);
    expect(library.reservations.get(reservation.id).status).toBe('ready');
  });

  it('refuse duplicates and books the member already has', () => {
    const [alice, bob] = ['Alice', 'Bob'].map((n) => addMember(library, n)) as [
      ReturnType<typeof addMember>,
      ReturnType<typeof addMember>,
    ];
    const { book, barcodes } = addBook(library);
    lend(library, alice, barcodes[0]!);
    library.reservations.reserve(bob.member.id, book.id);
    expect(codesFor(() => library.reservations.reserve(bob.member.id, book.id))).toEqual(['ALREADY_RESERVED']);
    expect(codesFor(() => library.reservations.reserve(alice.member.id, book.id))).toEqual(['ALREADY_BORROWED']);
  });
});

describe('policy changes', () => {
  it('apply immediately and persist', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library, 'Book', 2);
    library.policy = library.policy.with({ rules: { student: { maxLoans: 1, loanDays: 7 } } });
    expect(lend(library, alice, barcodes[0]!).dueOn).toBe('2026-03-09');
    expect(codesFor(() => lend(library, alice, barcodes[1]!))).toEqual(['LOAN_LIMIT_REACHED']);
    expect(library.store.policy.load().rulesFor('student').maxLoans).toBe(1);
  });
});
