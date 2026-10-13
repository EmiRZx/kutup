import type { LendingPolicy } from '../core/model/LendingPolicy';
import type { ViolationCode } from '../core/model/violations';
import { RULE_NAMES } from './judge';

export interface RulePage {
  code: ViolationCode;
  name: string;
  /** How to spot it at the desk. */
  how: string;
  /** Where the evidence is. */
  where: 'card' | 'book' | 'terminal' | 'noticeboard';
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The librarian's rule book, in the order it is taught, with today's numbers filled in. */
export function rulePages(known: ReadonlySet<ViolationCode>, policy: LendingPolicy): RulePage[] {
  const r = policy.rules;
  const pages: Omit<RulePage, 'name'>[] = [
    { code: 'CARD_EXPIRED', where: 'card', how: 'Compare VALID TO on the card with today’s date on the calendar. The card is good through that date.' },
    { code: 'CARD_MISMATCH', where: 'card', how: 'The name and the photo on the card must match the person at the desk.' },
    { code: 'CARD_UNKNOWN', where: 'terminal', how: 'Scan the card number. NO RECORD means the card is forged.' },
    { code: 'FINES_OUTSTANDING', where: 'terminal', how: `No loans while the member OWES ${money(policy.fineBlockThreshold)} or more.` },
    { code: 'HAS_OVERDUE_LOANS', where: 'terminal', how: 'No new loans while the account shows OVERDUE books.' },
    { code: 'REFERENCE_ONLY', where: 'book', how: 'A red REFERENCE sticker means the book never leaves the building.' },
    { code: 'CARD_INACTIVE', where: 'terminal', how: 'A card REPORTED LOST stays blocked, even when its owner finds it again.' },
    { code: 'COPY_ON_HOLD_FOR_ANOTHER', where: 'book', how: 'A hold slip names the only member who may take that copy.' },
    {
      code: 'RENEWAL_LIMIT_REACHED',
      where: 'terminal',
      how: `Renewals allowed: students ${r.student.maxRenewals}, staff ${r.staff.maxRenewals}, guests ${r.guest.maxRenewals}. Scan the book to see RENEWED.`,
    },
    { code: 'LOAN_OVERDUE', where: 'terminal', how: 'An overdue loan cannot be renewed. Scan the book to see the DUE date.' },
    { code: 'BOOK_HAS_WAITING_RESERVATIONS', where: 'terminal', how: 'No renewal while anyone is WAITING for the book.' },
    {
      code: 'LOAN_LIMIT_REACHED',
      where: 'terminal',
      how: `Books at once: students ${r.student.maxLoans}, staff ${r.staff.maxLoans}, guests ${r.guest.maxLoans}. See BOOKS OUT.`,
    },
    { code: 'MEMBER_SUSPENDED', where: 'noticeboard', how: 'Suspended members are on the morning noticeboard, and SUSPENDED on the terminal.' },
  ];
  return pages.filter((p) => known.has(p.code)).map((p) => ({ ...p, name: RULE_NAMES[p.code] }));
}
