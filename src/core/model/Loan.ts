import { daysBetween, isBefore, type IsoDate } from '../dates';
import { InvalidStateError } from '../errors';
import type { ViolationCode } from './violations';

export interface LoanProps {
  id: number;
  copyId: number;
  memberId: number;
  borrowedOn: IsoDate;
  dueOn: IsoDate;
  returnedOn: IsoDate | null;
  renewals: number;
  /** Rules the librarian knowingly broke to allow this loan (or one of its renewals). */
  overriddenViolations: readonly ViolationCode[];
  overrideNote: string | null;
}

/** One copy lent to one member, from the day it leaves the desk until it comes back. */
export class Loan {
  readonly id: number;
  readonly copyId: number;
  readonly memberId: number;
  readonly borrowedOn: IsoDate;
  private _dueOn: IsoDate;
  private _returnedOn: IsoDate | null;
  private _renewals: number;
  private _overriddenViolations: ViolationCode[];
  private _overrideNote: string | null;

  constructor(props: LoanProps) {
    this.id = props.id;
    this.copyId = props.copyId;
    this.memberId = props.memberId;
    this.borrowedOn = props.borrowedOn;
    this._dueOn = props.dueOn;
    this._returnedOn = props.returnedOn;
    this._renewals = props.renewals;
    this._overriddenViolations = [...props.overriddenViolations];
    this._overrideNote = props.overrideNote;
  }

  get dueOn(): IsoDate {
    return this._dueOn;
  }

  get returnedOn(): IsoDate | null {
    return this._returnedOn;
  }

  get renewals(): number {
    return this._renewals;
  }

  get overriddenViolations(): readonly ViolationCode[] {
    return this._overriddenViolations;
  }

  get overrideNote(): string | null {
    return this._overrideNote;
  }

  get wasOverridden(): boolean {
    return this._overriddenViolations.length > 0;
  }

  get isActive(): boolean {
    return this._returnedOn === null;
  }

  /** Overdue means still out after the due date; the due date itself is fine. */
  isOverdueOn(date: IsoDate): boolean {
    return this.isActive && isBefore(this._dueOn, date);
  }

  /** Days late as of `date` (or as of the return date, once returned). */
  daysLate(date: IsoDate): number {
    const end = this._returnedOn ?? date;
    return Math.max(0, daysBetween(this._dueOn, end));
  }

  renew(newDueOn: IsoDate): void {
    if (!this.isActive) throw new InvalidStateError(`Loan ${this.id} is already closed`);
    if (!isBefore(this._dueOn, newDueOn)) throw new InvalidStateError('A renewal must move the due date forward');
    this._dueOn = newDueOn;
    this._renewals += 1;
  }

  recordOverride(codes: readonly ViolationCode[], note: string | null): void {
    for (const code of codes) {
      if (!this._overriddenViolations.includes(code)) this._overriddenViolations.push(code);
    }
    if (note) this._overrideNote = this._overrideNote ? `${this._overrideNote}; ${note}` : note;
  }

  close(returnedOn: IsoDate): void {
    if (!this.isActive) throw new InvalidStateError(`Loan ${this.id} is already closed`);
    if (isBefore(returnedOn, this.borrowedOn)) throw new InvalidStateError('A loan cannot end before it starts');
    this._returnedOn = returnedOn;
  }
}
