import type { LendingPolicy } from '../core/model/LendingPolicy';
import type { ViolationCode } from '../core/model/violations';
import type { RequestType, ScenarioKind } from './types';

/** The rule each troublesome patron is breaking: the one you should cite when you deny them. */
export const TARGET: Partial<Record<ScenarioKind, ViolationCode>> = {
  'expired-card': 'CARD_EXPIRED',
  'someone-elses-card': 'CARD_MISMATCH',
  'forged-card': 'CARD_UNKNOWN',
  'lost-card': 'CARD_INACTIVE',
  suspended: 'MEMBER_SUSPENDED',
  'loan-limit': 'LOAN_LIMIT_REACHED',
  overdue: 'HAS_OVERDUE_LOANS',
  fines: 'FINES_OUTSTANDING',
  reference: 'REFERENCE_ONLY',
  'held-for-another': 'COPY_ON_HOLD_FOR_ANOTHER',
  'renew-limit': 'RENEWAL_LIMIT_REACHED',
  'renew-overdue': 'LOAN_OVERDUE',
  'renew-waiting': 'BOOK_HAS_WAITING_RESERVATIONS',
};

export const REQUEST_OF: Record<ScenarioKind, RequestType> = {
  'valid-borrow': 'borrow',
  'hold-pickup': 'borrow',
  'expired-card': 'borrow',
  'someone-elses-card': 'borrow',
  'forged-card': 'borrow',
  'lost-card': 'borrow',
  suspended: 'borrow',
  'loan-limit': 'borrow',
  overdue: 'borrow',
  fines: 'borrow',
  reference: 'borrow',
  'held-for-another': 'borrow',
  'return-good': 'return',
  'return-damaged': 'return',
  'valid-renew': 'renew',
  'renew-limit': 'renew',
  'renew-overdue': 'renew',
  'renew-waiting': 'renew',
};

/** The reasons a librarian may cite when refusing each kind of request. */
export const DENIAL_REASONS: Record<Exclude<RequestType, 'return'>, readonly ViolationCode[]> = {
  borrow: [
    'CARD_EXPIRED',
    'CARD_MISMATCH',
    'CARD_UNKNOWN',
    'CARD_INACTIVE',
    'MEMBER_SUSPENDED',
    'LOAN_LIMIT_REACHED',
    'HAS_OVERDUE_LOANS',
    'FINES_OUTSTANDING',
    'REFERENCE_ONLY',
    'COPY_ON_HOLD_FOR_ANOTHER',
  ],
  renew: ['MEMBER_SUSPENDED', 'RENEWAL_LIMIT_REACHED', 'LOAN_OVERDUE', 'BOOK_HAS_WAITING_RESERVATIONS'],
};

export interface DayPlan {
  day: number;
  headline: string;
  /** Kinds of patron that first appear today. */
  introduces: ScenarioKind[];
  /** How many patrons queue up today. */
  patrons: number;
  notices: string[];
  /** A change to the rule book that takes effect this morning. */
  policy?: (policy: LendingPolicy) => LendingPolicy;
}

const CAMPAIGN: readonly DayPlan[] = [
  {
    day: 1,
    headline: 'Welcome to the circulation desk',
    introduces: ['valid-borrow', 'expired-card', 'return-good', 'return-damaged'],
    patrons: 7,
    notices: [
      'Click a card number or a barcode to look it up on the terminal.',
      'Inspect returned books. Damaged copies are stamped DAMAGED and sent to the bindery.',
    ],
  },
  {
    day: 2,
    headline: 'Card fraud on the rise',
    introduces: ['someone-elses-card', 'forged-card'],
    patrons: 8,
    notices: [
      'The name and photo on a card must match the person holding it.',
      'Run every card number through the terminal. NO RECORD means the card is forged.',
    ],
  },
  {
    day: 3,
    headline: 'Director demands fines be collected',
    introduces: ['fines', 'overdue'],
    patrons: 9,
    notices: ['Members with unpaid fines over the limit, or with overdue books, may not borrow. The terminal shows both.'],
  },
  {
    day: 4,
    headline: 'Rare books vanishing from the reading room',
    introduces: ['reference', 'lost-card'],
    patrons: 9,
    notices: [
      'Books with a red REFERENCE sticker never leave the building.',
      'Cards reported lost are blocked, even if their owner finds them again.',
    ],
  },
  {
    day: 5,
    headline: 'Reservations and renewals now handled at the desk',
    introduces: ['hold-pickup', 'held-for-another', 'valid-renew', 'renew-limit', 'renew-overdue', 'renew-waiting'],
    patrons: 10,
    notices: [
      'A book with a hold slip goes only to the member named on the slip.',
      'Renewals: check the loan on the terminal. No renewals past the limit, for overdue loans, or when others are waiting.',
    ],
  },
  {
    day: 6,
    headline: 'Exam week: students limited to three books',
    introduces: ['loan-limit', 'suspended'],
    patrons: 10,
    notices: [
      'Until further notice, students may hold at most 3 books at once.',
      'The director has suspended members with large unpaid fines. Check the list below.',
    ],
    policy: (p) => p.with({ rules: { student: { maxLoans: 3 } } }),
  },
  {
    day: 7,
    headline: 'Inspection day: the auditors are watching',
    introduces: [],
    patrons: 11,
    notices: ['Every rule applies. Your performance review is this evening.'],
  },
];

export const CAMPAIGN_DAYS = CAMPAIGN.length;

export function planFor(day: number): DayPlan {
  return CAMPAIGN[day - 1] ?? { day, headline: 'Another day at the desk', introduces: [], patrons: 11, notices: [] };
}

/** Every kind of patron that can appear on `day`. */
export function kindsUpTo(day: number): ScenarioKind[] {
  return CAMPAIGN.filter((p) => p.day <= day).flatMap((p) => p.introduces);
}

/** Every rule the player has been taught by `day`. */
export function knownRules(day: number): Set<ViolationCode> {
  return new Set(kindsUpTo(day).flatMap((k) => (TARGET[k] ? [TARGET[k]] : [])));
}

const HONEST: ReadonlySet<ScenarioKind> = new Set(['valid-borrow', 'hold-pickup', 'return-good', 'valid-renew']);

export function isHonest(kind: ScenarioKind): boolean {
  return HONEST.has(kind);
}

/**
 * Today's queue, as a list of kinds. Roughly half the patrons are honest; the
 * rest are trouble, weighted towards whatever was introduced today.
 */
export function deckFor(day: number, pick: <T>(items: readonly T[]) => T, shuffle: <T>(items: readonly T[]) => T[]): ScenarioKind[] {
  const plan = planFor(day);
  const available = kindsUpTo(day);
  // Borrowers are the heart of the job, so honest borrowers come twice as often as honest returns.
  const honest = available.filter(isHonest).flatMap((k) => (k === 'return-good' ? [k] : [k, k]));
  const trouble = available.filter((k) => !isHonest(k));
  const fresh = plan.introduces.filter((k) => !isHonest(k));
  const deck: ScenarioKind[] = [...fresh]; // everything new shows up at least once
  while (deck.length < plan.patrons) {
    const wantTrouble = deck.filter((k) => !isHonest(k)).length < Math.floor(plan.patrons / 2);
    deck.push(wantTrouble && trouble.length > 0 ? pick(trouble) : pick(honest));
  }
  return shuffle(deck.slice(0, Math.max(plan.patrons, fresh.length)));
}
