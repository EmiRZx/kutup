import { isAfter, type IsoDate } from '../dates';
import { InvalidStateError } from '../errors';

export const RESERVATION_STATUSES = ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface ReservationProps {
  id: number;
  bookId: number;
  memberId: number;
  createdOn: IsoDate;
  status: ReservationStatus;
  /** The copy set aside for this member once the reservation is `ready`. */
  copyId: number | null;
  holdUntil: IsoDate | null;
}

/**
 * A member's place in the queue for a book. When a copy comes back it is held
 * for the first waiting member until `holdUntil`; after that the hold expires
 * and the copy moves on to the next person in line.
 */
export class Reservation {
  readonly id: number;
  readonly bookId: number;
  readonly memberId: number;
  readonly createdOn: IsoDate;
  private _status: ReservationStatus;
  private _copyId: number | null;
  private _holdUntil: IsoDate | null;

  constructor(props: ReservationProps) {
    this.id = props.id;
    this.bookId = props.bookId;
    this.memberId = props.memberId;
    this.createdOn = props.createdOn;
    this._status = props.status;
    this._copyId = props.copyId;
    this._holdUntil = props.holdUntil;
  }

  get status(): ReservationStatus {
    return this._status;
  }

  get copyId(): number | null {
    return this._copyId;
  }

  get holdUntil(): IsoDate | null {
    return this._holdUntil;
  }

  /** Still in the queue or waiting at the desk. */
  get isOpen(): boolean {
    return this._status === 'waiting' || this._status === 'ready';
  }

  isHoldExpiredOn(date: IsoDate): boolean {
    return this._status === 'ready' && this._holdUntil !== null && isAfter(date, this._holdUntil);
  }

  markReady(copyId: number, holdUntil: IsoDate): void {
    this.expect('waiting', 'mark ready');
    this._status = 'ready';
    this._copyId = copyId;
    this._holdUntil = holdUntil;
  }

  /** The held copy was lent to someone else; go back to waiting at the front of the queue. */
  returnToQueue(): void {
    this.expect('ready', 'return to queue');
    this._status = 'waiting';
    this._copyId = null;
    this._holdUntil = null;
  }

  fulfill(): void {
    this.expect('ready', 'fulfill');
    this._status = 'fulfilled';
  }

  expire(): void {
    this.expect('ready', 'expire');
    this._status = 'expired';
  }

  cancel(): void {
    if (!this.isOpen) throw new InvalidStateError(`Reservation ${this.id} is already ${this._status}`);
    this._status = 'cancelled';
  }

  private expect(status: ReservationStatus, action: string): void {
    if (this._status !== status) {
      throw new InvalidStateError(`Cannot ${action} reservation ${this.id}: it is ${this._status}`);
    }
  }
}
