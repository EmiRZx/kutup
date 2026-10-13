import { ValidationError } from '../errors';
import { MEMBER_TYPES, type MemberType } from './Member';

export interface MemberTypeRules {
  /** How many items a member of this type may hold at once. 0 = may not borrow. */
  maxLoans: number;
  loanDays: number;
  maxRenewals: number;
}

export interface LendingPolicyProps {
  rules: Record<MemberType, MemberTypeRules>;
  /** Cents charged per day late. */
  dailyFine: number;
  /** Overdue fines for a single loan never exceed this (cents). */
  maxFinePerLoan: number;
  /** Members owing this much or more (cents) may not borrow. */
  fineBlockThreshold: number;
  /** Days a returned copy waits at the desk for the member who reserved it. */
  holdDays: number;
  /** Whether having an overdue item blocks new loans. */
  blockWhenOverdue: boolean;
  /** Whether reference-only books may be lent at all. */
  referenceLoansAllowed: boolean;
  damageFee: number;
  lostFee: number;
}

/**
 * The rule book. It is a value object: changing a rule produces a new policy
 * via {@link LendingPolicy.with}. The game hands out a new policy on each
 * in-game day ("from today, students may only borrow 3 books").
 */
export class LendingPolicy implements LendingPolicyProps {
  readonly rules: Readonly<Record<MemberType, Readonly<MemberTypeRules>>>;
  readonly dailyFine: number;
  readonly maxFinePerLoan: number;
  readonly fineBlockThreshold: number;
  readonly holdDays: number;
  readonly blockWhenOverdue: boolean;
  readonly referenceLoansAllowed: boolean;
  readonly damageFee: number;
  readonly lostFee: number;

  constructor(props: LendingPolicyProps) {
    LendingPolicy.validate(props);
    this.rules = Object.freeze({
      student: Object.freeze({ ...props.rules.student }),
      staff: Object.freeze({ ...props.rules.staff }),
      guest: Object.freeze({ ...props.rules.guest }),
    });
    this.dailyFine = props.dailyFine;
    this.maxFinePerLoan = props.maxFinePerLoan;
    this.fineBlockThreshold = props.fineBlockThreshold;
    this.holdDays = props.holdDays;
    this.blockWhenOverdue = props.blockWhenOverdue;
    this.referenceLoansAllowed = props.referenceLoansAllowed;
    this.damageFee = props.damageFee;
    this.lostFee = props.lostFee;
  }

  static defaults(): LendingPolicy {
    return new LendingPolicy({
      rules: {
        student: { maxLoans: 5, loanDays: 14, maxRenewals: 2 },
        staff: { maxLoans: 10, loanDays: 28, maxRenewals: 3 },
        guest: { maxLoans: 2, loanDays: 7, maxRenewals: 0 },
      },
      dailyFine: 25,
      maxFinePerLoan: 1000,
      fineBlockThreshold: 500,
      holdDays: 3,
      blockWhenOverdue: true,
      referenceLoansAllowed: false,
      damageFee: 1500,
      lostFee: 3000,
    });
  }

  rulesFor(type: MemberType): Readonly<MemberTypeRules> {
    return this.rules[type];
  }

  /** A copy of this policy with some settings changed. */
  with(changes: Partial<Omit<LendingPolicyProps, 'rules'>> & { rules?: Partial<Record<MemberType, Partial<MemberTypeRules>>> }): LendingPolicy {
    const { rules: ruleChanges, ...rest } = changes;
    const rules = {} as Record<MemberType, MemberTypeRules>;
    for (const type of MEMBER_TYPES) rules[type] = { ...this.rules[type], ...ruleChanges?.[type] };
    return new LendingPolicy({ ...this.toProps(), ...rest, rules });
  }

  toProps(): LendingPolicyProps {
    return {
      rules: { student: { ...this.rules.student }, staff: { ...this.rules.staff }, guest: { ...this.rules.guest } },
      dailyFine: this.dailyFine,
      maxFinePerLoan: this.maxFinePerLoan,
      fineBlockThreshold: this.fineBlockThreshold,
      holdDays: this.holdDays,
      blockWhenOverdue: this.blockWhenOverdue,
      referenceLoansAllowed: this.referenceLoansAllowed,
      damageFee: this.damageFee,
      lostFee: this.lostFee,
    };
  }

  private static validate(props: LendingPolicyProps): void {
    const nonNegative = (name: string, value: number) => {
      if (!Number.isInteger(value) || value < 0) throw new ValidationError(`${name} must be a whole number ≥ 0`);
    };
    for (const type of MEMBER_TYPES) {
      const r = props.rules[type];
      if (!r) throw new ValidationError(`Missing rules for ${type}`);
      nonNegative(`${type}.maxLoans`, r.maxLoans);
      nonNegative(`${type}.maxRenewals`, r.maxRenewals);
      if (!Number.isInteger(r.loanDays) || r.loanDays < 1) throw new ValidationError(`${type}.loanDays must be ≥ 1`);
    }
    nonNegative('dailyFine', props.dailyFine);
    nonNegative('maxFinePerLoan', props.maxFinePerLoan);
    nonNegative('fineBlockThreshold', props.fineBlockThreshold);
    nonNegative('damageFee', props.damageFee);
    nonNegative('lostFee', props.lostFee);
    if (!Number.isInteger(props.holdDays) || props.holdDays < 1) throw new ValidationError('holdDays must be ≥ 1');
  }
}
