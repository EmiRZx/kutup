import type { Library } from '../core/Library';
import { isOverridable, VIOLATIONS, type Violation, type ViolationCode } from '../core/model/violations';
import type { Random } from '../core/random';
import { replyFor } from './dialogue';
import type { Decision, Encounter, Verdict } from './types';

/** What the supervisor writes on the citation slip when a rule was broken at the desk. */
export const CITATIONS: Record<ViolationCode, string> = {
  CARD_UNKNOWN: 'Lent on a forged card. The number is not in our records.',
  CARD_MISMATCH: 'Lent on someone else’s card.',
  CARD_EXPIRED: 'Lent on an expired card.',
  CARD_INACTIVE: 'Lent on a card that was reported lost.',
  MEMBER_SUSPENDED: 'Served a suspended member.',
  LOAN_LIMIT_REACHED: 'Lent beyond the member’s loan limit.',
  FINES_OUTSTANDING: 'Lent to a member with unpaid fines over the limit.',
  HAS_OVERDUE_LOANS: 'Lent to a member with overdue books.',
  COPY_UNAVAILABLE: 'Tried to lend a copy that is not on the shelf.',
  COPY_ON_HOLD_FOR_ANOTHER: 'Gave away a book held for another member.',
  REFERENCE_ONLY: 'Let a reference-only book leave the building.',
  RENEWAL_LIMIT_REACHED: 'Renewed a loan past the renewal limit.',
  LOAN_OVERDUE: 'Renewed an overdue loan.',
  BOOK_HAS_WAITING_RESERVATIONS: 'Renewed a book other members are waiting for.',
  ALREADY_RESERVED: 'Duplicate reservation.',
  ALREADY_BORROWED: 'Reserved a book the member already has.',
  COPY_AVAILABLE_ON_SHELF: 'Reserved a book that was on the shelf.',
};

/** Short names for the rule book and the denial reasons. */
export const RULE_NAMES: Record<ViolationCode, string> = {
  CARD_UNKNOWN: 'Forged card',
  CARD_MISMATCH: 'Not their card',
  CARD_EXPIRED: 'Card expired',
  CARD_INACTIVE: 'Card reported lost',
  MEMBER_SUSPENDED: 'Member suspended',
  LOAN_LIMIT_REACHED: 'Too many books out',
  FINES_OUTSTANDING: 'Unpaid fines',
  HAS_OVERDUE_LOANS: 'Overdue books',
  COPY_UNAVAILABLE: 'Copy unavailable',
  COPY_ON_HOLD_FOR_ANOTHER: 'Held for someone else',
  REFERENCE_ONLY: 'Reference only',
  RENEWAL_LIMIT_REACHED: 'Renewal limit',
  LOAN_OVERDUE: 'Loan is overdue',
  BOOK_HAS_WAITING_RESERVATIONS: 'Others are waiting',
  ALREADY_RESERVED: 'Already reserved',
  ALREADY_BORROWED: 'Already borrowed',
  COPY_AVAILABLE_ON_SHELF: 'On the shelf',
};

const ruleName = (code: ViolationCode) => RULE_NAMES[code];

/**
 * Carries out the player's decision through the library core and grades it
 * against what the core says was right. The library always ends up in a
 * legitimate state: wrongly approved loans are recorded as overrides, with
 * the broken rules attached, exactly as a real librarian's would be.
 */
export function judge(library: Library, encounter: Encounter, decision: Decision, random: Random): Verdict {
  switch (encounter.request) {
    case 'borrow':
      return judgeRequest(encounter, decision, random, {
        check: () =>
          library.lending.checkCheckout({ memberId: encounter.patron.memberId, cardNumber: encounter.card!.number, barcode: encounter.book.barcode })
            .violations,
        carryOut: (note) =>
          library.lending.checkout(
            { memberId: encounter.patron.memberId, cardNumber: encounter.card!.number, barcode: encounter.book.barcode },
            note ? { note } : undefined,
          ),
      });
    case 'renew':
      return judgeRequest(encounter, decision, random, {
        check: () => library.lending.checkRenewal(encounter.loanId!).violations,
        carryOut: (note) => library.lending.renew(encounter.loanId!, note ? { note } : undefined),
      });
    case 'return':
      return judgeReturn(library, encounter, decision, random);
  }
}

function judgeRequest(
  encounter: Encounter,
  decision: Decision,
  random: Random,
  request: { check: () => Violation[]; carryOut: (overrideNote: string | null) => unknown },
): Verdict {
  const truth = request.check();
  const base = { truth, warning: null, citation: null };

  if (decision.type === 'approve') {
    if (truth.length === 0) {
      request.carryOut(null);
      return { ...base, correct: true, ...replyFor(random, 'served') };
    }
    const citation = CITATIONS[truth[0]!.code];
    if (truth.every((v) => isOverridable(v.code))) {
      // It happens: the loan goes through, and the record shows who let it.
      request.carryOut(`Approved at the desk on day ${encounter.day} despite: ${truth.map((v) => ruleName(v.code)).join(', ')}`);
      return { ...base, correct: false, citation, ...replyFor(random, 'served') };
    }
    return { ...base, correct: false, citation: `${citation} The system refused it anyway.`, ...replyFor(random, 'caught', truth[0]!.code) };
  }

  if (decision.type === 'deny') {
    if (truth.length === 0) {
      return { ...base, correct: false, citation: 'Refused a member in good standing.', ...replyFor(random, 'wronged') };
    }
    if (truth.some((v) => v.code === decision.reason)) {
      return { ...base, correct: true, ...replyFor(random, 'caught', decision.reason) };
    }
    return {
      ...base,
      correct: false,
      warning: `Right call, wrong reason. You cited “${ruleName(decision.reason)}”; the problem was: ${truth.map((v) => ruleName(v.code)).join(', ')}.`,
      ...replyFor(random, 'caught', truth[0]!.code),
    };
  }

  throw new Error(`A ${encounter.request} request cannot be checked in`);
}

function judgeReturn(library: Library, encounter: Encounter, decision: Decision, random: Random): Verdict {
  if (decision.type !== 'check-in') throw new Error('A return can only be checked in');
  const receipt = library.lending.returnCopy(encounter.book.barcode, decision.condition);
  const truth: Violation[] = [];
  const actual = encounter.book.damaged ? 'damaged' : 'good';
  if (decision.condition !== actual) {
    return {
      truth,
      correct: false,
      warning: null,
      citation: actual === 'damaged' ? 'Missed the damage on a returned book.' : 'Charged a damage fee for a book in good condition.',
      ...(actual === 'damaged' ? replyFor(random, 'returned') : replyFor(random, 'charged-damage')),
    };
  }
  const late = receipt.fines.some((f) => f.reason === 'overdue');
  const reply = decision.condition === 'damaged' ? replyFor(random, 'charged-damage') : late ? replyFor(random, 'late-fine') : replyFor(random, 'returned');
  return { truth, correct: true, warning: null, citation: null, ...reply };
}

/** A violation's full sentence, for the rule book. */
export function ruleText(code: ViolationCode): string {
  return VIOLATIONS[code];
}
