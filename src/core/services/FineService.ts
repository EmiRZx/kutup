import type { Clock } from '../clock';
import type { IsoDate } from '../dates';
import { ValidationError } from '../errors';
import type { Fine, FineReason } from '../model/Fine';
import type { LendingPolicy } from '../model/LendingPolicy';
import type { Loan } from '../model/Loan';
import type { LibraryStore } from '../repositories';
import { found } from './support';

/** Calculates, records and settles fines. Amounts are integer cents. */
export class FineService {
  private readonly store: LibraryStore;
  private readonly clock: Clock;

  constructor(store: LibraryStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  /** The overdue fine for a loan returned on `returnedOn`: daily rate × days late, capped per loan. */
  static overdueAmount(loan: Loan, returnedOn: IsoDate, policy: LendingPolicy): number {
    return Math.min(loan.daysLate(returnedOn) * policy.dailyFine, policy.maxFinePerLoan);
  }

  /** Records the overdue fine for a closed loan, if it was late. */
  chargeOverdue(loan: Loan): Fine | null {
    if (loan.returnedOn === null) throw new ValidationError(`Loan ${loan.id} is still active`);
    const amount = FineService.overdueAmount(loan, loan.returnedOn, this.store.policy.load());
    return amount > 0 ? this.charge(loan.memberId, amount, 'overdue', loan.id) : null;
  }

  charge(memberId: number, amount: number, reason: FineReason, loanId: number | null = null): Fine {
    if (!Number.isInteger(amount) || amount <= 0) throw new ValidationError('A fine must be a positive number of cents');
    return this.store.fines.add({
      memberId,
      loanId,
      amount,
      reason,
      issuedOn: this.clock.today(),
      status: 'unpaid',
      settledOn: null,
    });
  }

  /** Total unpaid fines, in cents. */
  balance(memberId: number): number {
    return this.store.fines.findOutstandingByMember(memberId).reduce((sum, fine) => sum + fine.amount, 0);
  }

  /** What the member would owe if every active loan came back today. */
  accruingBalance(memberId: number): number {
    const policy = this.store.policy.load();
    const today = this.clock.today();
    return this.store.loans
      .findActiveByMember(memberId)
      .reduce((sum, loan) => sum + FineService.overdueAmount(loan, today, policy), 0);
  }

  pay(fineId: number): Fine {
    return this.settle(fineId, (fine) => fine.pay(this.clock.today()));
  }

  waive(fineId: number): Fine {
    return this.settle(fineId, (fine) => fine.waive(this.clock.today()));
  }

  /** Pays every outstanding fine; returns the amount collected in cents. */
  payAll(memberId: number): number {
    return this.store.transaction(() => {
      const today = this.clock.today();
      let total = 0;
      for (const fine of this.store.fines.findOutstandingByMember(memberId)) {
        fine.pay(today);
        this.store.fines.save(fine);
        total += fine.amount;
      }
      return total;
    });
  }

  private settle(fineId: number, change: (fine: Fine) => void): Fine {
    return this.store.transaction(() => {
      const fine = found(this.store.fines.findById(fineId), 'Fine', fineId);
      change(fine);
      this.store.fines.save(fine);
      return fine;
    });
  }
}
