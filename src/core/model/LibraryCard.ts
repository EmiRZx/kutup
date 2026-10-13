import { isAfter, type IsoDate } from '../dates';
import { InvalidStateError } from '../errors';
import { formatCardNumber } from '../identifiers';

export const CARD_STATUSES = ['active', 'lost', 'revoked'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export interface LibraryCardProps {
  id: number;
  memberId: number;
  number: string;
  issuedOn: IsoDate;
  expiresOn: IsoDate;
  status: CardStatus;
}

/**
 * The physical card a member shows at the desk. A member has at most one
 * active card; reporting it lost deactivates it and a new number is issued.
 */
export class LibraryCard {
  readonly id: number;
  readonly memberId: number;
  readonly number: string;
  readonly issuedOn: IsoDate;
  private _expiresOn: IsoDate;
  private _status: CardStatus;

  constructor(props: LibraryCardProps) {
    this.id = props.id;
    this.memberId = props.memberId;
    this.number = props.number;
    this.issuedOn = props.issuedOn;
    this._expiresOn = props.expiresOn;
    this._status = props.status;
  }

  get expiresOn(): IsoDate {
    return this._expiresOn;
  }

  get status(): CardStatus {
    return this._status;
  }

  get printedNumber(): string {
    return formatCardNumber(this.number);
  }

  /** A card is still valid on its expiry date and expires the day after. */
  isExpiredOn(date: IsoDate): boolean {
    return isAfter(date, this._expiresOn);
  }

  isUsableOn(date: IsoDate): boolean {
    return this._status === 'active' && !this.isExpiredOn(date);
  }

  extendTo(expiresOn: IsoDate): void {
    if (this._status !== 'active') throw new InvalidStateError(`Card ${this.printedNumber} is ${this._status}`);
    if (!isAfter(expiresOn, this._expiresOn)) throw new InvalidStateError('A card can only be extended forward');
    this._expiresOn = expiresOn;
  }

  markLost(): void {
    if (this._status !== 'active') throw new InvalidStateError(`Card ${this.printedNumber} is already ${this._status}`);
    this._status = 'lost';
  }

  revoke(): void {
    if (this._status === 'revoked') throw new InvalidStateError(`Card ${this.printedNumber} is already revoked`);
    this._status = 'revoked';
  }
}
