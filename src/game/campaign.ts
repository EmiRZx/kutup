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
  'card-expiring': 'borrow',
  'near-fine-limit': 'borrow',
  'near-loan-limit': 'borrow',
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
  'last-renewal': 'renew',
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
    introduces: ['valid-borrow', 'card-expiring', 'expired-card', 'return-good', 'return-damaged'],
    patrons: 9,
    notices: [
      'Click a card number or a barcode to look it up on the terminal. Each search takes a few minutes, so choose them well.',
      'The terminal prints the record as it stands. Comparing dates and amounts with the rule book is your job.',
      'Inspect returned books. Damaged copies are stamped DAMAGED and sent to the bindery.',
    ],
  },
  {
    day: 2,
    headline: 'Card fraud on the rise',
    introduces: ['someone-elses-card', 'forged-card'],
    patrons: 11,
    notices: [
      'The name and photo on a card must match the person holding it.',
      'Run every card number through the terminal. NO RECORD means the card is forged.',
    ],
  },
  {
    day: 3,
    headline: 'Director demands fines be collected',
    introduces: ['fines', 'near-fine-limit', 'overdue'],
    patrons: 12,
    notices: [
      'Members who owe too much, or who have a book past its due date, may not borrow. The terminal lists every loan with its DUE date.',
      'The heating is on for the winter. Expect it on your bills.',
    ],
  },
  {
    day: 4,
    headline: 'Rare books vanishing from the reading room',
    introduces: ['reference', 'lost-card'],
    patrons: 14,
    notices: [
      'Books with a red REFERENCE sticker never leave the building.',
      'Cards reported lost are blocked, even if their owner finds them again.',
    ],
  },
  {
    day: 5,
    headline: 'Reservations and renewals now handled at the desk',
    introduces: ['hold-pickup', 'held-for-another', 'valid-renew', 'last-renewal', 'renew-limit', 'renew-overdue', 'renew-waiting'],
    patrons: 15,
    notices: [
      'A book with a hold slip goes only to the member named on the slip.',
      'Renewals: scan the book. No renewals past the limit, for overdue loans, or when others are waiting.',
      'Night-school fees are due from today.',
    ],
  },
  {
    day: 6,
    headline: 'Exam week: students limited to three books',
    introduces: ['loan-limit', 'near-loan-limit', 'suspended'],
    patrons: 16,
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
    patrons: 18,
    notices: ['Every rule applies. Your performance review is this evening.'],
  },
];

export const CAMPAIGN_DAYS = CAMPAIGN.length;

export function planFor(day: number): DayPlan {
  return CAMPAIGN[day - 1] ?? { day, headline: 'Another day at the desk', introduces: [], patrons: 18, notices: [] };
}

/** Every kind of patron that can appear on `day`. */
export function kindsUpTo(day: number): ScenarioKind[] {
  return CAMPAIGN.filter((p) => p.day <= day).flatMap((p) => p.introduces);
}

/** Every rule the player has been taught by `day`. */
export function knownRules(day: number): Set<ViolationCode> {
  return new Set(kindsUpTo(day).flatMap((k) => (TARGET[k] ? [TARGET[k]] : [])));
}

const HONEST: ReadonlySet<ScenarioKind> = new Set([
  'valid-borrow',
  'hold-pickup',
  'card-expiring',
  'near-fine-limit',
  'near-loan-limit',
  'return-good',
  'valid-renew',
  'last-renewal',
]);

export function isHonest(kind: ScenarioKind): boolean {
  return HONEST.has(kind);
}

/** How often each honest kind turns up, relative to the others. Borrowers are the heart of the job. */
const HONEST_WEIGHT: Partial<Record<ScenarioKind, number>> = { 'valid-borrow': 3 };

/** The share of today's queue that is trouble: a little over a third on day one, rising to three in five. */
export function troubleShare(day: number): number {
  return Math.min(0.6, 0.32 + 0.04 * day);
}

/**
 * Today's queue, as a list of kinds. Everything introduced today shows up at
 * least once; the rest is a mix of honest patrons and trouble, with more
 * trouble as the week goes on.
 */
export function deckFor(day: number, pick: <T>(items: readonly T[]) => T, shuffle: <T>(items: readonly T[]) => T[]): ScenarioKind[] {
  const plan = planFor(day);
  const available = kindsUpTo(day);
  const honest = available.filter(isHonest).flatMap((k) => Array<ScenarioKind>(HONEST_WEIGHT[k] ?? 2).fill(k));
  const trouble = available.filter((k) => !isHonest(k));
  const fresh = plan.introduces.filter((k) => k !== 'valid-borrow' && k !== 'return-good');
  const deck: ScenarioKind[] = [...fresh];
  const troubleWanted = Math.round(plan.patrons * troubleShare(day));
  while (deck.length < plan.patrons) {
    const wantTrouble = deck.filter((k) => !isHonest(k)).length < troubleWanted;
    deck.push(wantTrouble && trouble.length > 0 ? pick(trouble) : pick(honest));
  }
  return shuffle(deck);
}
