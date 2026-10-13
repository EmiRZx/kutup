import type { IsoDate } from '../dates';
import { InvalidStateError } from '../errors';

export const MEMBER_TYPES = ['student', 'staff', 'guest'] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

export const MEMBER_STATUSES = ['active', 'suspended'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface MemberProps {
  id: number;
  name: string;
  type: MemberType;
  email: string | null;
  status: MemberStatus;
  joinedOn: IsoDate;
}

/** A registered patron. What they may borrow depends on their {@link MemberType}. */
export class Member {
  readonly id: number;
  name: string;
  type: MemberType;
  email: string | null;
  private _status: MemberStatus;
  readonly joinedOn: IsoDate;

  constructor(props: MemberProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.email = props.email;
    this._status = props.status;
    this.joinedOn = props.joinedOn;
  }

  get status(): MemberStatus {
    return this._status;
  }

  get isActive(): boolean {
    return this._status === 'active';
  }

  suspend(): void {
    if (!this.isActive) throw new InvalidStateError(`${this.name} is already suspended`);
    this._status = 'suspended';
  }

  reinstate(): void {
    if (this.isActive) throw new InvalidStateError(`${this.name} is not suspended`);
    this._status = 'active';
  }
}
