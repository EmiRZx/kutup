import { LendingPolicy, type MemberTypeRules } from '../../core/model/LendingPolicy';
import type { MemberType } from '../../core/model/Member';
import type { PolicyRepository } from '../../core/repositories';
import type { SqliteDatabase } from '../SqliteDatabase';

type PolicyRow = {
  daily_fine: number;
  max_fine_per_loan: number;
  fine_block_threshold: number;
  hold_days: number;
  block_when_overdue: number;
  reference_loans_allowed: number;
  damage_fee: number;
  lost_fee: number;
};
type RulesRow = {
  member_type: string;
  max_loans: number;
  loan_days: number;
  max_renewals: number;
  card_validity_days: number;
};

export class SqlitePolicyRepository implements PolicyRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  load(): LendingPolicy {
    const p = this.db.get<PolicyRow>('SELECT * FROM lending_policy WHERE id = 1');
    if (!p) throw new Error('The lending_policy table is empty');
    const rules = {} as Record<MemberType, MemberTypeRules>;
    for (const r of this.db.all<RulesRow>('SELECT * FROM member_type_rules')) {
      rules[r.member_type as MemberType] = {
        maxLoans: r.max_loans,
        loanDays: r.loan_days,
        maxRenewals: r.max_renewals,
        cardValidityDays: r.card_validity_days,
      };
    }
    return new LendingPolicy({
      rules,
      dailyFine: p.daily_fine,
      maxFinePerLoan: p.max_fine_per_loan,
      fineBlockThreshold: p.fine_block_threshold,
      holdDays: p.hold_days,
      blockWhenOverdue: p.block_when_overdue === 1,
      referenceLoansAllowed: p.reference_loans_allowed === 1,
      damageFee: p.damage_fee,
      lostFee: p.lost_fee,
    });
  }

  save(policy: LendingPolicy): void {
    this.db.transaction(() => {
      this.db.run(
        `UPDATE lending_policy SET daily_fine = $dailyFine, max_fine_per_loan = $maxFinePerLoan,
           fine_block_threshold = $fineBlockThreshold, hold_days = $holdDays, block_when_overdue = $blockWhenOverdue,
           reference_loans_allowed = $referenceLoansAllowed, damage_fee = $damageFee, lost_fee = $lostFee
         WHERE id = 1`,
        {
          dailyFine: policy.dailyFine,
          maxFinePerLoan: policy.maxFinePerLoan,
          fineBlockThreshold: policy.fineBlockThreshold,
          holdDays: policy.holdDays,
          blockWhenOverdue: policy.blockWhenOverdue,
          referenceLoansAllowed: policy.referenceLoansAllowed,
          damageFee: policy.damageFee,
          lostFee: policy.lostFee,
        },
      );
      for (const [type, r] of Object.entries(policy.rules)) {
        this.db.run(
          `UPDATE member_type_rules SET max_loans = $maxLoans, loan_days = $loanDays, max_renewals = $maxRenewals,
             card_validity_days = $cardValidityDays
           WHERE member_type = $type`,
          { type, ...r },
        );
      }
    });
  }
}
