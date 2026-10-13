/**
 * Every reason the library can refuse a request. The game's whole challenge is
 * spotting these at the desk before the core does.
 */
export const VIOLATIONS = {
  // Who is asking
  CARD_UNKNOWN: 'The card number is not registered with the library.',
  CARD_MISMATCH: 'The card belongs to a different member.',
  CARD_EXPIRED: 'The library card has expired.',
  CARD_INACTIVE: 'The library card was reported lost or has been revoked.',
  MEMBER_SUSPENDED: 'The member is suspended.',
  // Their account
  LOAN_LIMIT_REACHED: 'The member already has the maximum number of loans for their membership type.',
  FINES_OUTSTANDING: 'The member owes more in fines than the policy allows.',
  HAS_OVERDUE_LOANS: 'The member has overdue items that must be returned first.',
  // The item
  COPY_UNAVAILABLE: 'This copy is not on the shelf (on loan, lost, in repair or withdrawn).',
  COPY_ON_HOLD_FOR_ANOTHER: 'This copy is being held for another member’s reservation.',
  REFERENCE_ONLY: 'Reference-only books may not leave the library.',
  // Renewals
  RENEWAL_LIMIT_REACHED: 'The loan has already been renewed the maximum number of times.',
  LOAN_OVERDUE: 'Overdue loans cannot be renewed.',
  BOOK_HAS_WAITING_RESERVATIONS: 'Other members are waiting for this book.',
  // Reservations
  ALREADY_RESERVED: 'The member already has an open reservation for this book.',
  ALREADY_BORROWED: 'The member is currently borrowing a copy of this book.',
  COPY_AVAILABLE_ON_SHELF: 'A copy is on the shelf; borrow it instead of reserving.',
} as const;

export type ViolationCode = keyof typeof VIOLATIONS;

export interface Violation {
  readonly code: ViolationCode;
  readonly message: string;
}

/**
 * Violations a librarian can never override, because the request is physically
 * impossible rather than merely against the rules.
 */
const HARD_VIOLATIONS: ReadonlySet<ViolationCode> = new Set([
  'COPY_UNAVAILABLE',
  'ALREADY_RESERVED',
  'ALREADY_BORROWED',
  'COPY_AVAILABLE_ON_SHELF',
]);

export function violation(code: ViolationCode): Violation {
  return { code, message: VIOLATIONS[code] };
}

export function isOverridable(code: ViolationCode): boolean {
  return !HARD_VIOLATIONS.has(code);
}

export function isViolationCode(value: string): value is ViolationCode {
  return Object.hasOwn(VIOLATIONS, value);
}
