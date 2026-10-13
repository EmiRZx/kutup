import { describe, expect, it } from 'vitest';
import { InvalidStateError, ValidationError } from '../../src/core/errors';
import { Author } from '../../src/core/model/Author';
import { Book } from '../../src/core/model/Book';
import { BookCopy, type CopyStatus } from '../../src/core/model/BookCopy';
import { Fine } from '../../src/core/model/Fine';
import { LendingPolicy } from '../../src/core/model/LendingPolicy';
import { LibraryCard } from '../../src/core/model/LibraryCard';
import { Loan } from '../../src/core/model/Loan';
import { Member } from '../../src/core/model/Member';
import { Reservation } from '../../src/core/model/Reservation';

const copy = (status: CopyStatus = 'available') =>
  new BookCopy({ id: 1, bookId: 1, barcode: 'B00001-01', status, condition: 'good', acquiredOn: '2026-01-01' });

const loan = (overrides: Partial<ConstructorParameters<typeof Loan>[0]> = {}) =>
  new Loan({
    id: 1,
    copyId: 1,
    memberId: 1,
    borrowedOn: '2026-03-01',
    dueOn: '2026-03-15',
    returnedOn: null,
    renewals: 0,
    overriddenViolations: [],
    overrideNote: null,
    ...overrides,
  });

describe('Author and Book', () => {
  const austen = new Author({ id: 1, name: 'Jane Austen', birthYear: 1775 });
  const marx = new Author({ id: 2, name: 'Karl Marx', birthYear: 1818 });
  const engels = new Author({ id: 3, name: 'Friedrich Engels', birthYear: 1820 });

  it('sorts authors by surname', () => {
    expect(austen.sortName).toBe('Austen, Jane');
    expect(new Author({ id: 4, name: 'Homer', birthYear: null }).sortName).toBe('Homer');
  });

  it('formats the author line', () => {
    const book = (authors: Author[]) =>
      new Book({ id: 1, isbn: '9780141439518', title: 'T', authors, publishedYear: null, genre: 'fiction', referenceOnly: false });
    expect(book([austen]).authorLine).toBe('Jane Austen');
    expect(book([marx, engels]).authorLine).toBe('Karl Marx and Friedrich Engels');
    expect(book([austen, marx, engels]).authorLine).toBe('Jane Austen, Karl Marx and Friedrich Engels');
    expect(book([]).authorLine).toBe('Anonymous');
  });
});

describe('BookCopy state machine', () => {
  it('follows the normal lending cycle', () => {
    const c = copy();
    c.checkOut();
    expect(c.status).toBe('on_loan');
    c.checkIn('worn');
    expect(c.status).toBe('available');
    expect(c.condition).toBe('worn');
  });

  it('sends damaged returns to repair', () => {
    const c = copy('on_loan');
    c.checkIn('damaged');
    expect(c.status).toBe('in_repair');
    c.restoreToShelf();
    expect(c.status).toBe('available');
  });

  it('refuses impossible transitions', () => {
    expect(() => copy('on_loan').checkOut()).toThrow(InvalidStateError);
    expect(() => copy('lost').checkOut()).toThrow(InvalidStateError);
    expect(() => copy('on_loan').placeOnHold()).toThrow(InvalidStateError);
    expect(() => copy('available').releaseHold()).toThrow(InvalidStateError);
    expect(() => copy('withdrawn').restoreToShelf()).toThrow(InvalidStateError);
    expect(copy('withdrawn').canTransitionTo('available')).toBe(false);
  });
});

describe('Member', () => {
  it('can be suspended and reinstated, once each', () => {
    const m = new Member({ id: 1, name: 'A', type: 'student', email: null, status: 'active', joinedOn: '2026-01-01' });
    m.suspend();
    expect(m.isActive).toBe(false);
    expect(() => m.suspend()).toThrow(InvalidStateError);
    m.reinstate();
    expect(m.isActive).toBe(true);
  });
});

describe('LibraryCard', () => {
  const card = () =>
    new LibraryCard({ id: 1, memberId: 1, number: '48210937', issuedOn: '2026-01-01', expiresOn: '2026-06-30', status: 'active' });

  it('is valid through its expiry date', () => {
    expect(card().isUsableOn('2026-06-30')).toBe(true);
    expect(card().isUsableOn('2026-07-01')).toBe(false);
    expect(card().isExpiredOn('2026-07-01')).toBe(true);
  });

  it('becomes unusable when lost', () => {
    const c = card();
    c.markLost();
    expect(c.isUsableOn('2026-02-01')).toBe(false);
    expect(() => c.extendTo('2027-01-01')).toThrow(InvalidStateError);
  });

  it('only extends forward', () => {
    const c = card();
    expect(() => c.extendTo('2026-05-01')).toThrow(InvalidStateError);
    c.extendTo('2027-06-30');
    expect(c.expiresOn).toBe('2027-06-30');
  });
});

describe('Loan', () => {
  it('is not overdue on its due date, only after', () => {
    expect(loan().isOverdueOn('2026-03-15')).toBe(false);
    expect(loan().isOverdueOn('2026-03-16')).toBe(true);
    expect(loan().daysLate('2026-03-20')).toBe(5);
    expect(loan().daysLate('2026-03-10')).toBe(0);
  });

  it('counts lateness up to the return date once closed', () => {
    const l = loan();
    l.close('2026-03-18');
    expect(l.isActive).toBe(false);
    expect(l.isOverdueOn('2026-04-01')).toBe(false);
    expect(l.daysLate('2026-04-01')).toBe(3);
    expect(() => l.close('2026-03-19')).toThrow(InvalidStateError);
  });

  it('renews forward only and counts renewals', () => {
    const l = loan();
    l.renew('2026-03-29');
    expect(l.renewals).toBe(1);
    expect(() => l.renew('2026-03-20')).toThrow(InvalidStateError);
  });

  it('records overrides without duplicates', () => {
    const l = loan();
    l.recordOverride(['CARD_EXPIRED'], 'Known regular');
    l.recordOverride(['CARD_EXPIRED', 'LOAN_LIMIT_REACHED'], 'Exam week');
    expect(l.overriddenViolations).toEqual(['CARD_EXPIRED', 'LOAN_LIMIT_REACHED']);
    expect(l.overrideNote).toBe('Known regular; Exam week');
    expect(l.wasOverridden).toBe(true);
  });
});

describe('Reservation', () => {
  const r = () =>
    new Reservation({ id: 1, bookId: 1, memberId: 1, createdOn: '2026-03-01', status: 'waiting', copyId: null, holdUntil: null });

  it('moves from waiting to ready to fulfilled', () => {
    const res = r();
    res.markReady(5, '2026-03-04');
    expect(res.isHoldExpiredOn('2026-03-04')).toBe(false);
    expect(res.isHoldExpiredOn('2026-03-05')).toBe(true);
    res.fulfill();
    expect(res.isOpen).toBe(false);
  });

  it('can go back to the queue when its copy is taken', () => {
    const res = r();
    res.markReady(5, '2026-03-04');
    res.returnToQueue();
    expect(res.status).toBe('waiting');
    expect(res.copyId).toBeNull();
  });

  it('refuses invalid transitions', () => {
    expect(() => r().fulfill()).toThrow(InvalidStateError);
    expect(() => r().expire()).toThrow(InvalidStateError);
    const done = r();
    done.cancel();
    expect(() => done.cancel()).toThrow(InvalidStateError);
  });
});

describe('Fine', () => {
  it('is settled exactly once', () => {
    const f = new Fine({ id: 1, memberId: 1, loanId: null, amount: 250, reason: 'overdue', issuedOn: '2026-03-01', status: 'unpaid', settledOn: null });
    f.pay('2026-03-02');
    expect(f.isOutstanding).toBe(false);
    expect(f.settledOn).toBe('2026-03-02');
    expect(() => f.waive('2026-03-03')).toThrow(InvalidStateError);
  });
});

describe('LendingPolicy', () => {
  it('produces modified copies without touching the original', () => {
    const base = LendingPolicy.defaults();
    const strict = base.with({ dailyFine: 50, rules: { student: { maxLoans: 3 } } });
    expect(strict.dailyFine).toBe(50);
    expect(strict.rulesFor('student')).toEqual({ ...base.rulesFor('student'), maxLoans: 3 });
    expect(strict.rulesFor('staff')).toEqual(base.rulesFor('staff'));
    expect(base.rulesFor('student').maxLoans).toBe(5);
  });

  it('rejects nonsense values', () => {
    const base = LendingPolicy.defaults();
    expect(() => base.with({ dailyFine: -1 })).toThrow(ValidationError);
    expect(() => base.with({ holdDays: 0 })).toThrow(ValidationError);
    expect(() => base.with({ rules: { guest: { loanDays: 0 } } })).toThrow(ValidationError);
  });

  it('is immutable', () => {
    const p = LendingPolicy.defaults();
    expect(() => {
      (p.rules.student as { maxLoans: number }).maxLoans = 99;
    }).toThrow(TypeError);
  });
});
