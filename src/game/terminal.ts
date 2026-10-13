import type { IsoDate } from '../core/dates';
import { formatCardNumber, isValidCardNumber } from '../core/identifiers';
import type { Library } from '../core/Library';

/**
 * The desk terminal: a 1980s circulation computer that answers one query at a
 * time. Type (or scan) a card number to see the account, or a barcode to see
 * the copy. Everything here is read straight from the core; it is the only
 * way to learn what can't be seen on the desk.
 */

export interface TerminalLine {
  text: string;
  tone?: 'alert' | 'dim';
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function terminalDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const field = (label: string, value: string, tone?: TerminalLine['tone']): TerminalLine => ({
  text: `${label.padEnd(10, '.')} ${value}`,
  tone,
});

export function lookup(library: Library, rawQuery: string): TerminalLine[] {
  const query = rawQuery.trim().toUpperCase().replace(/\s+/g, '');
  if (!query) return [{ text: 'ENTER A CARD NUMBER OR A BARCODE', tone: 'dim' }];
  if (/^\d+$/.test(query)) return lookupCard(library, query);
  if (/^B\d{5}-\d{2}$/.test(query)) return lookupCopy(library, query);
  return [{ text: `?SYNTAX ERROR: ${query}`, tone: 'alert' }];
}

function lookupCard(library: Library, number: string): TerminalLine[] {
  const found = library.members.findByCardNumber(number);
  const printed = number.length === 8 ? formatCardNumber(number) : number;
  if (!found) {
    return [
      { text: `CARD ${printed}`, tone: 'alert' },
      { text: '*** NO RECORD ***', tone: 'alert' },
      ...(number.length === 8 && !isValidCardNumber(number) ? [{ text: 'CHECK DIGIT INVALID', tone: 'alert' as const }] : []),
    ];
  }
  const { member, card } = found;
  const today = library.clock.today();
  const policy = library.policy;
  const summary = library.members.summary(member.id);
  const limit = policy.rulesFor(member.type).maxLoans;
  const cardStatus =
    card.status === 'lost' ? 'REPORTED LOST' : card.status === 'revoked' ? 'REPLACED' : card.isExpiredOn(today) ? 'EXPIRED' : 'VALID';
  const lines: TerminalLine[] = [
    { text: `CARD ${card.printedNumber}` },
    field('CARD', cardStatus, cardStatus === 'VALID' ? undefined : 'alert'),
    field('EXPIRES', terminalDate(card.expiresOn), card.isExpiredOn(today) ? 'alert' : undefined),
    field('HOLDER', member.name.toUpperCase()),
    field('TYPE', member.type.toUpperCase()),
    field('STATUS', member.isActive ? 'ACTIVE' : 'SUSPENDED', member.isActive ? undefined : 'alert'),
    field('BOOKS OUT', `${summary.activeLoans.length} OF ${limit}`, summary.activeLoans.length >= limit ? 'alert' : undefined),
  ];
  if (summary.overdueLoans.length > 0) lines.push(field('OVERDUE', `${summary.overdueLoans.length} BOOK(S)`, 'alert'));
  const owes = summary.balance;
  lines.push(field('OWES', `${money(owes)}  (LIMIT ${money(policy.fineBlockThreshold)})`, owes > 0 && owes >= policy.fineBlockThreshold ? 'alert' : undefined));
  const ready = summary.reservations.filter((r) => r.status === 'ready');
  for (const hold of ready) {
    const book = library.store.books.findById(hold.bookId);
    lines.push(field('ON HOLD', `${book?.title.toUpperCase()} (UNTIL ${terminalDate(hold.holdUntil!)})`));
  }
  return lines;
}

function lookupCopy(library: Library, barcode: string): TerminalLine[] {
  const copy = library.store.copies.findByBarcode(barcode);
  if (!copy) return [{ text: `COPY ${barcode}`, tone: 'alert' }, { text: '*** NO RECORD ***', tone: 'alert' }];
  const book = library.store.books.findById(copy.bookId)!;
  const today = library.clock.today();
  const lines: TerminalLine[] = [{ text: `COPY ${copy.barcode}` }, field('TITLE', book.title.toUpperCase())];
  if (book.referenceOnly) lines.push(field('LENDING', 'REFERENCE ONLY - NOT FOR LOAN', 'alert'));

  switch (copy.status) {
    case 'available':
      lines.push(field('STATUS', 'ON SHELF'));
      break;
    case 'on_hold': {
      const hold = library.store.reservations.findReadyByCopy(copy.id);
      const who = hold && library.store.members.findById(hold.memberId);
      lines.push(field('STATUS', `ON HOLD FOR ${who?.name.toUpperCase() ?? '?'}`, 'alert'));
      if (hold?.holdUntil) lines.push(field('HOLD ENDS', terminalDate(hold.holdUntil)));
      break;
    }
    case 'on_loan': {
      const loan = library.store.loans.findActiveByCopy(copy.id)!;
      const borrower = library.store.members.findById(loan.memberId)!;
      const maxRenewals = library.policy.rulesFor(borrower.type).maxRenewals;
      lines.push(field('STATUS', `ON LOAN TO ${borrower.name.toUpperCase()}`));
      lines.push(field('DUE', terminalDate(loan.dueOn) + (loan.isOverdueOn(today) ? `  (${loan.daysLate(today)} DAYS LATE)` : ''), loan.isOverdueOn(today) ? 'alert' : undefined));
      lines.push(field('RENEWED', `${loan.renewals} OF ${maxRenewals}`, loan.renewals >= maxRenewals ? 'alert' : undefined));
      break;
    }
    default:
      lines.push(field('STATUS', copy.status.replace('_', ' ').toUpperCase(), 'alert'));
  }

  const waiting = library.store.reservations.findOpenByBook(copy.bookId).filter((r) => r.status === 'waiting').length;
  lines.push(field('WAITING', waiting === 0 ? 'NOBODY' : `${waiting} RESERVATION(S)`, waiting > 0 ? 'alert' : undefined));
  return lines;
}
