import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualClock } from '../../src/core/clock';
import { InvalidStateError, NotFoundError, ValidationError } from '../../src/core/errors';
import { isValidCardNumber } from '../../src/core/identifiers';
import type { Library } from '../../src/core/Library';
import { addBook, addMember, freshLibrary, lend } from '../helpers';

let library: Library;
let clock: ManualClock;

beforeEach(async () => {
  ({ library, clock } = await freshLibrary());
});

describe('CatalogService', () => {
  it('adds a book with its authors, reusing known authors', () => {
    const first = library.catalog.addBook({
      isbn: '978-0-14-143951-8',
      title: 'Pride and Prejudice',
      authors: ['Jane Austen'],
      publishedYear: 1813,
      genre: 'fiction',
    });
    library.catalog.addBook({ isbn: '9780141439587', title: 'Emma', authors: ['jane austen'], genre: 'fiction' });
    expect(first.isbn).toBe('9780141439518');
    expect(library.store.authors.all()).toHaveLength(1);
    expect(library.catalog.getBook(first.id).authorLine).toBe('Jane Austen');
  });

  it('validates new books', () => {
    const valid = { isbn: '9780141439518', title: 'T', authors: ['A'], genre: 'fiction' as const };
    expect(() => library.catalog.addBook({ ...valid, isbn: '9780141439519' })).toThrow(ValidationError);
    expect(() => library.catalog.addBook({ ...valid, title: '  ' })).toThrow(ValidationError);
    expect(() => library.catalog.addBook({ ...valid, authors: [] })).toThrow(ValidationError);
    expect(() => library.catalog.addBook({ ...valid, publishedYear: 3000 })).toThrow(ValidationError);
    library.catalog.addBook(valid);
    expect(() => library.catalog.addBook(valid)).toThrow(/already exists/);
  });

  it('numbers copies with barcodes', () => {
    const { book, barcodes } = addBook(library, 'Book', 2);
    expect(barcodes).toEqual([`B${String(book.id).padStart(5, '0')}-01`, `B${String(book.id).padStart(5, '0')}-02`]);
    const more = library.catalog.addCopies(book.id, 1);
    expect(more[0]?.barcode.endsWith('-03')).toBe(true);
  });

  it('searches by title, author and ISBN, ignoring case', () => {
    library.catalog.addBook({ isbn: '9780141439518', title: 'Pride and Prejudice', authors: ['Jane Austen'], genre: 'fiction' });
    library.catalog.addBook({ isbn: '9780141441146', title: 'Dracula', authors: ['Bram Stoker'], genre: 'horror' });
    expect(library.catalog.search('pride').map((b) => b.title)).toEqual(['Pride and Prejudice']);
    expect(library.catalog.search('STOKER').map((b) => b.title)).toEqual(['Dracula']);
    expect(library.catalog.search('978-0141441').map((b) => b.title)).toEqual(['Dracula']);
    expect(library.catalog.search('%')).toEqual([]); // wildcards are literal
    expect(library.catalog.search('')).toHaveLength(2);
  });

  it('reports availability', () => {
    const alice = addMember(library);
    const { book, barcodes } = addBook(library, 'Book', 3);
    lend(library, alice, barcodes[0]!);
    library.catalog.sendToRepair(barcodes[1]!);
    expect(library.catalog.availability(book.id)).toEqual({ total: 3, onShelf: 1, onLoan: 1, onHold: 0, outOfService: 1 });
  });

  it('raises NotFoundError for unknown barcodes', () => {
    expect(() => library.catalog.getCopy('NOPE')).toThrow(NotFoundError);
  });
});

describe('MemberService', () => {
  it('registers a member with a valid, unique card', () => {
    const { member, card } = library.members.register({ name: ' Elif Yılmaz ', type: 'student', email: 'elif@kutup.edu' });
    expect(member.name).toBe('Elif Yılmaz');
    expect(card.memberId).toBe(member.id);
    expect(isValidCardNumber(card.number)).toBe(true);
    expect(card.expiresOn).toBe('2027-03-02');
    expect(library.members.findByCardNumber(card.printedNumber)?.member.id).toBe(member.id);
  });

  it('issues cards valid for as long as the membership type allows', () => {
    expect(library.members.register({ name: 'Visitor', type: 'guest' }).card.expiresOn).toBe('2026-04-01');
    expect(library.members.register({ name: 'Prof', type: 'staff' }).card.expiresOn).toBe('2028-03-01');
  });

  it('validates registrations', () => {
    expect(() => library.members.register({ name: '', type: 'student' })).toThrow(ValidationError);
    expect(() => library.members.register({ name: 'A', type: 'student', email: 'not-an-email' })).toThrow(ValidationError);
  });

  it('replaces a lost card with a new number', () => {
    const { member, card } = addMember(library);
    const replacement = library.members.reportCardLost(member.id);
    expect(replacement.number).not.toBe(card.number);
    expect(library.store.cards.findById(card.id)?.status).toBe('lost');
    expect(library.store.cards.findByMember(member.id)).toHaveLength(2);
  });

  it('renews an expired card from today', () => {
    const { member } = addMember(library);
    clock.advance(400);
    expect(library.members.renewCard(member.id).expiresOn).toBe('2028-04-05');
  });

  it('suspends once', () => {
    const { member } = addMember(library);
    library.members.suspend(member.id);
    expect(() => library.members.suspend(member.id)).toThrow(InvalidStateError);
  });

  it('summarises an account for the desk terminal', () => {
    const alice = addMember(library);
    const { barcodes } = addBook(library, 'Dracula', 2);
    lend(library, alice, barcodes[0]!);
    clock.advance(3);
    lend(library, alice, barcodes[1]!);
    clock.advance(13);
    const summary = library.members.summary(alice.member.id);
    expect(summary.activeLoans.map((d) => d.book.title)).toEqual(['Dracula', 'Dracula']);
    expect(summary.overdueLoans).toHaveLength(1);
    expect(summary.balance).toBe(0);
    expect(library.fines.accruingBalance(alice.member.id)).toBe(50);
  });

  it('searches by name or e-mail', () => {
    library.members.register({ name: 'Zeynep Demir', type: 'student', email: 'zeynep@kutup.edu' });
    library.members.register({ name: 'Mert Kaya', type: 'staff' });
    expect(library.members.search('zeyn').map((m) => m.name)).toEqual(['Zeynep Demir']);
    expect(library.members.search('kutup.edu').map((m) => m.name)).toEqual(['Zeynep Demir']);
    expect(library.members.search('')).toHaveLength(2);
  });
});
