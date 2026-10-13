import type { IsoDate } from '../core/dates';
import { formatCardNumber, isValidCardNumber } from '../core/identifiers';
import type { Library } from '../core/Library';

/**
 * The desk terminal: a 1980s circulation computer that answers one query at a
 * time. Type (or scan) a card number to see the account, or a barcode to see
 * the copy. Everything here is read straight from the core; it is the only
 * way to learn what can't be seen on the desk.
 *
 * It prints the record, never a verdict: it won't tell you a card has expired
 * or a book is late. Comparing dates and amounts with the rule book is the
 * librarian's job. Only the machine's own errors show up in red.
 */

export interface TerminalLine {
  text: string;
  tone?: 'alert' | 'dim';
}

/** Every search ties up the desk for a few minutes: the old machine is slow. */
export const QUERY_MINUTES = 4;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function terminalDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const field = (label: string, value: string): TerminalLine => ({ text: `${label.padEnd(10, '.')} ${value}` });

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
      { text: `CARD ${printed}` },
      { text: '*** NO RECORD ***', tone: 'alert' },
      ...(number.length === 8 && !isValidCardNumber(number) ? [{ text: 'CHECK DIGIT INVALID', tone: 'alert' as const }] : []),
    ];
  }
  const { member, card } = found;
  const summary = library.members.summary(member.id);
  const cardStatus = card.status === 'lost' ? 'REPORTED LOST' : card.status === 'revoked' ? 'REPLACED' : 'ISSUED';
  const lines: TerminalLine[] = [
    { text: `CARD ${card.printedNumber}` },
    field('CARD', cardStatus),
    field('VALID TO', terminalDate(card.expiresOn)),
    field('HOLDER', member.name.toUpperCase()),
    field('TYPE', member.type.toUpperCase()),
    field('STATUS', member.isActive ? 'ACTIVE' : 'SUSPENDED'),
    field('BOOKS OUT', String(summary.activeLoans.length)),
  ];
  for (const { loan, copy } of summary.activeLoans) {
    lines.push({ text: `  ${copy.barcode} DUE ${terminalDate(loan.dueOn)}` });
  }
  lines.push(field('OWES', money(summary.balance)));
  for (const hold of summary.reservations.filter((r) => r.status === 'ready')) {
    const book = library.store.books.findById(hold.bookId);
    lines.push(field('ON HOLD', `${book?.title.toUpperCase()} (UNTIL ${terminalDate(hold.holdUntil!)})`));
  }
  return lines;
}

function lookupCopy(library: Library, barcode: string): TerminalLine[] {
  const copy = library.store.copies.findByBarcode(barcode);
  if (!copy) return [{ text: `COPY ${barcode}` }, { text: '*** NO RECORD ***', tone: 'alert' }];
  const book = library.store.books.findById(copy.bookId)!;
  const lines: TerminalLine[] = [{ text: `COPY ${copy.barcode}` }, field('TITLE', book.title.toUpperCase())];
  lines.push(field('LENDING', book.referenceOnly ? 'REFERENCE ONLY' : 'GENERAL'));

  switch (copy.status) {
    case 'available':
      lines.push(field('STATUS', 'ON SHELF'));
      break;
    case 'on_hold': {
      const hold = library.store.reservations.findReadyByCopy(copy.id);
      const who = hold && library.store.members.findById(hold.memberId);
      lines.push(field('STATUS', `ON HOLD FOR ${who?.name.toUpperCase() ?? '?'}`));
      if (hold?.holdUntil) lines.push(field('HOLD ENDS', terminalDate(hold.holdUntil)));
      break;
    }
    case 'on_loan': {
      const loan = library.store.loans.findActiveByCopy(copy.id)!;
      const borrower = library.store.members.findById(loan.memberId)!;
      lines.push(field('STATUS', `ON LOAN TO ${borrower.name.toUpperCase()}`));
      lines.push(field('DUE', terminalDate(loan.dueOn)));
      lines.push(field('RENEWED', `${loan.renewals} TIME${loan.renewals === 1 ? '' : 'S'}`));
      break;
    }
    default:
      lines.push(field('STATUS', copy.status.replace('_', ' ').toUpperCase()));
  }

  const waiting = library.store.reservations.findOpenByBook(copy.bookId).filter((r) => r.status === 'waiting').length;
  lines.push(field('WAITING', waiting === 0 ? 'NOBODY' : `${waiting} RESERVATION${waiting === 1 ? '' : 'S'}`));
  return lines;
}
