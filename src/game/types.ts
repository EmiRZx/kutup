import type { IsoDate } from '../core/dates';
import type { MemberType } from '../core/model/Member';
import type { Violation, ViolationCode } from '../core/model/violations';

export type RequestType = 'borrow' | 'return' | 'renew';

/** Every kind of patron that can walk up to the desk. */
export const SCENARIO_KINDS = [
  // Borrowing, all in order
  'valid-borrow',
  'hold-pickup',
  // Borrowing, all in order, but close enough to a line to make you look twice
  'card-expiring',
  'near-fine-limit',
  'near-loan-limit',
  // Borrowing, with something wrong
  'expired-card',
  'someone-elses-card',
  'forged-card',
  'lost-card',
  'suspended',
  'loan-limit',
  'overdue',
  'fines',
  'reference',
  'held-for-another',
  // Returns
  'return-good',
  'return-damaged',
  // Renewals
  'valid-renew',
  'last-renewal',
  'renew-limit',
  'renew-overdue',
  'renew-waiting',
] as const;

export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

/** The physical library card the patron puts on the desk. It may not be theirs, or may not be real. */
export interface DeskCard {
  number: string;
  name: string;
  memberType: MemberType;
  expiresOn: IsoDate;
  /** Whose face is printed on the card. */
  photoSeed: number;
}

/** The book the patron puts on the desk, with everything you can see by looking at it. */
export interface DeskBook {
  barcode: string;
  title: string;
  author: string;
  referenceOnly: boolean;
  /** The slip tucked into a book on the hold shelf, naming who it is for. */
  holdSlip: string | null;
  /** Only meaningful for returns: torn, stained, water-damaged. */
  damaged: boolean;
  coverSeed: number;
}

export interface Encounter {
  day: number;
  /** 0 for the first patron of the day. */
  index: number;
  kind: ScenarioKind;
  request: RequestType;
  patron: { memberId: number; name: string };
  /** Null for returns: you don't need a card to hand a book back. */
  card: DeskCard | null;
  book: DeskBook;
  /** The loan being returned or renewed. */
  loanId: number | null;
  greeting: string;
}

export type Decision =
  | { type: 'approve' }
  | { type: 'deny'; reason: ViolationCode }
  | { type: 'check-in'; condition: 'good' | 'damaged' };

export type Mood = 'happy' | 'neutral' | 'annoyed' | 'angry';

/** What the library core says about the decision you just stamped. */
export interface Verdict {
  correct: boolean;
  /** A formal citation from the supervisor: costs money after the daily allowance of warnings. */
  citation: string | null;
  /** A note that costs nothing but the wage for this patron. */
  warning: string | null;
  /** The rules that really applied. */
  truth: Violation[];
  reply: string;
  mood: Mood;
}

export type CareerStatus = 'morning' | 'open' | 'evening' | 'review' | 'fired';

export interface Bulletin {
  headline: string;
  /** Rules that start applying today. */
  newRules: ViolationCode[];
  notices: string[];
  /** Members suspended overnight, as listed on the noticeboard. */
  suspended: string[];
}

export interface CareerState {
  day: number;
  /** Cents. */
  savings: number;
  status: CareerStatus;
  seed: number;
  /** Minutes since the doors opened at 09:00. */
  minutes: number;
  bulletin: Bulletin;
  /** True once the 7-day campaign is over and the player chose to keep working. */
  endless: boolean;
}

export interface EncounterRecord {
  day: number;
  index: number;
  kind: ScenarioKind;
  request: RequestType;
  memberId: number;
  barcode: string;
  cardNumber: string | null;
  decision: Decision['type'];
  reason: string | null;
  correct: boolean;
  citation: string | null;
  warning: string | null;
}

export interface DayRecord {
  day: number;
  date: IsoDate;
  served: number;
  correct: number;
  citations: number;
  wages: number;
  penalties: number;
  expenses: number;
  savingsAfter: number;
}

/** Persistence for the career, implemented with SQLite in `src/db`. */
export interface GameStore {
  load(): CareerState | null;
  save(state: CareerState): void;
  addEncounter(record: EncounterRecord): void;
  encounters(day: number): EncounterRecord[];
  allEncounters(): EncounterRecord[];
  addDay(record: DayRecord): void;
  days(): DayRecord[];
  clear(): void;
}
