import type { IsoDate } from '../dates';
import { InvalidStateError } from '../errors';

export const COPY_STATUSES = ['available', 'on_loan', 'on_hold', 'in_repair', 'lost', 'withdrawn'] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];

export const COPY_CONDITIONS = ['good', 'worn', 'damaged'] as const;
export type CopyCondition = (typeof COPY_CONDITIONS)[number];

/**
 * The life cycle of a physical copy, as a state machine. Every status change
 * goes through {@link BookCopy.transition}, so an illegal move (lending a lost
 * book, holding a book that is out on loan) can never reach the database.
 */
const TRANSITIONS: Record<CopyStatus, readonly CopyStatus[]> = {
  available: ['on_loan', 'on_hold', 'in_repair', 'lost', 'withdrawn'],
  on_hold: ['on_loan', 'available'],
  on_loan: ['available', 'in_repair', 'lost'],
  in_repair: ['available', 'withdrawn'],
  lost: ['available', 'withdrawn'],
  withdrawn: [],
};

export interface BookCopyProps {
  id: number;
  bookId: number;
  barcode: string;
  status: CopyStatus;
  condition: CopyCondition;
  acquiredOn: IsoDate;
}

/** One physical, barcoded copy of a {@link Book}. This is what actually gets lent. */
export class BookCopy {
  readonly id: number;
  readonly bookId: number;
  readonly barcode: string;
  private _status: CopyStatus;
  condition: CopyCondition;
  readonly acquiredOn: IsoDate;

  constructor(props: BookCopyProps) {
    this.id = props.id;
    this.bookId = props.bookId;
    this.barcode = props.barcode;
    this._status = props.status;
    this.condition = props.condition;
    this.acquiredOn = props.acquiredOn;
  }

  get status(): CopyStatus {
    return this._status;
  }

  get isOnShelf(): boolean {
    return this._status === 'available';
  }

  canTransitionTo(next: CopyStatus): boolean {
    return TRANSITIONS[this._status].includes(next);
  }

  private transition(next: CopyStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new InvalidStateError(`Copy ${this.barcode} cannot go from ${this._status} to ${next}`);
    }
    this._status = next;
  }

  checkOut(): void {
    this.transition('on_loan');
  }

  /** Back from a borrower. Damaged copies go straight to repair. */
  checkIn(condition: CopyCondition): void {
    this.condition = condition;
    this.transition(condition === 'damaged' ? 'in_repair' : 'available');
  }

  placeOnHold(): void {
    this.transition('on_hold');
  }

  releaseHold(): void {
    if (this._status !== 'on_hold') throw new InvalidStateError(`Copy ${this.barcode} is not on hold`);
    this.transition('available');
  }

  markLost(): void {
    this.transition('lost');
  }

  sendToRepair(): void {
    this.transition('in_repair');
  }

  /** A repaired copy, or a lost one that turned up again. */
  restoreToShelf(): void {
    if (this._status !== 'in_repair' && this._status !== 'lost') {
      throw new InvalidStateError(`Copy ${this.barcode} is ${this._status}, nothing to restore`);
    }
    if (this._status === 'in_repair') this.condition = 'worn';
    this.transition('available');
  }

  withdraw(): void {
    this.transition('withdrawn');
  }
}
