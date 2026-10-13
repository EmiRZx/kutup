import type { IsoDate } from '../dates';
import { InvalidStateError } from '../errors';

export const FINE_REASONS = ['overdue', 'damage', 'lost'] as const;
export type FineReason = (typeof FINE_REASONS)[number];

export const FINE_STATUSES = ['unpaid', 'paid', 'waived'] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export interface FineProps {
  id: number;
  memberId: number;
  loanId: number | null;
  /** In cents. Money is always an integer number of cents in the core. */
  amount: number;
  reason: FineReason;
  issuedOn: IsoDate;
  status: FineStatus;
  settledOn: IsoDate | null;
}

export class Fine {
  readonly id: number;
  readonly memberId: number;
  readonly loanId: number | null;
  readonly amount: number;
  readonly reason: FineReason;
  readonly issuedOn: IsoDate;
  private _status: FineStatus;
  private _settledOn: IsoDate | null;

  constructor(props: FineProps) {
    this.id = props.id;
    this.memberId = props.memberId;
    this.loanId = props.loanId;
    this.amount = props.amount;
    this.reason = props.reason;
    this.issuedOn = props.issuedOn;
    this._status = props.status;
    this._settledOn = props.settledOn;
  }

  get status(): FineStatus {
    return this._status;
  }

  get settledOn(): IsoDate | null {
    return this._settledOn;
  }

  get isOutstanding(): boolean {
    return this._status === 'unpaid';
  }

  pay(on: IsoDate): void {
    this.settle('paid', on);
  }

  waive(on: IsoDate): void {
    this.settle('waived', on);
  }

  private settle(status: FineStatus, on: IsoDate): void {
    if (!this.isOutstanding) throw new InvalidStateError(`Fine ${this.id} is already ${this._status}`);
    this._status = status;
    this._settledOn = on;
  }
}
