import type { IsoDate } from '../../core/dates';
import { Fine, type FineProps, type FineReason, type FineStatus } from '../../core/model/Fine';
import { Loan, type LoanProps } from '../../core/model/Loan';
import { Reservation, type ReservationProps, type ReservationStatus } from '../../core/model/Reservation';
import { isViolationCode, type ViolationCode } from '../../core/model/violations';
import type { Draft, FineRepository, LoanRepository, ReservationRepository } from '../../core/repositories';
import type { SqliteDatabase } from '../SqliteDatabase';

type LoanRow = {
  id: number;
  copy_id: number;
  member_id: number;
  borrowed_on: string;
  due_on: string;
  returned_on: string | null;
  renewals: number;
  override_note: string | null;
};
type ReservationRow = {
  id: number;
  book_id: number;
  member_id: number;
  created_on: string;
  status: string;
  copy_id: number | null;
  hold_until: string | null;
};
type FineRow = {
  id: number;
  member_id: number;
  loan_id: number | null;
  amount: number;
  reason: string;
  issued_on: string;
  status: string;
  settled_on: string | null;
};

export class SqliteLoanRepository implements LoanRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<LoanProps>): Loan {
    const id = this.db.insert(
      `INSERT INTO loans (copy_id, member_id, borrowed_on, due_on, returned_on, renewals, override_note)
       VALUES ($copyId, $memberId, $borrowedOn, $dueOn, $returnedOn, $renewals, $overrideNote) RETURNING id`,
      {
        copyId: draft.copyId,
        memberId: draft.memberId,
        borrowedOn: draft.borrowedOn,
        dueOn: draft.dueOn,
        returnedOn: draft.returnedOn,
        renewals: draft.renewals,
        overrideNote: draft.overrideNote,
      },
    );
    this.writeOverrides(id, draft.overriddenViolations);
    return new Loan({ id, ...draft });
  }

  save(loan: Loan): void {
    this.db.run(
      `UPDATE loans SET due_on = $dueOn, returned_on = $returnedOn, renewals = $renewals, override_note = $overrideNote
       WHERE id = $id`,
      { id: loan.id, dueOn: loan.dueOn, returnedOn: loan.returnedOn, renewals: loan.renewals, overrideNote: loan.overrideNote },
    );
    this.writeOverrides(loan.id, loan.overriddenViolations);
  }

  findById(id: number): Loan | null {
    return this.one('SELECT * FROM loans WHERE id = $id', { id });
  }

  findActiveByCopy(copyId: number): Loan | null {
    return this.one('SELECT * FROM loans WHERE copy_id = $copyId AND returned_on IS NULL', { copyId });
  }

  findActiveByMember(memberId: number): Loan[] {
    return this.many('SELECT * FROM loans WHERE member_id = $memberId AND returned_on IS NULL ORDER BY due_on, id', {
      memberId,
    });
  }

  findByMember(memberId: number): Loan[] {
    return this.many('SELECT * FROM loans WHERE member_id = $memberId ORDER BY borrowed_on DESC, id DESC', { memberId });
  }

  findOverdue(date: IsoDate): Loan[] {
    return this.many('SELECT * FROM loans WHERE returned_on IS NULL AND due_on < $date ORDER BY due_on, id', { date });
  }

  findActive(): Loan[] {
    return this.many('SELECT * FROM loans WHERE returned_on IS NULL ORDER BY due_on, id');
  }

  mostBorrowed(limit: number): { bookId: number; loans: number }[] {
    return this.db
      .all<{ book_id: number; loans: number }>(
        `SELECT c.book_id, count(*) AS loans
         FROM loans l JOIN book_copies c ON c.id = l.copy_id
         GROUP BY c.book_id ORDER BY loans DESC, c.book_id LIMIT $limit`,
        { limit },
      )
      .map((r) => ({ bookId: r.book_id, loans: r.loans }));
  }

  private writeOverrides(loanId: number, codes: readonly ViolationCode[]): void {
    this.db.run('DELETE FROM loan_overrides WHERE loan_id = $loanId', { loanId });
    for (const code of codes) {
      this.db.run('INSERT INTO loan_overrides (loan_id, violation_code) VALUES ($loanId, $code)', { loanId, code });
    }
  }

  private one(sql: string, params: Record<string, number | string>): Loan | null {
    return this.many(sql, params)[0] ?? null;
  }

  private many(sql: string, params: Record<string, number | string> = {}): Loan[] {
    return this.db.all<LoanRow>(sql, params).map((r) => {
      const overrides = this.db
        .all<{ violation_code: string }>('SELECT violation_code FROM loan_overrides WHERE loan_id = $id ORDER BY rowid', {
          id: r.id,
        })
        .map((o) => o.violation_code)
        .filter(isViolationCode);
      return new Loan({
        id: r.id,
        copyId: r.copy_id,
        memberId: r.member_id,
        borrowedOn: r.borrowed_on,
        dueOn: r.due_on,
        returnedOn: r.returned_on,
        renewals: r.renewals,
        overriddenViolations: overrides,
        overrideNote: r.override_note,
      });
    });
  }
}

const toReservation = (r: ReservationRow) =>
  new Reservation({
    id: r.id,
    bookId: r.book_id,
    memberId: r.member_id,
    createdOn: r.created_on,
    status: r.status as ReservationStatus,
    copyId: r.copy_id,
    holdUntil: r.hold_until,
  });

export class SqliteReservationRepository implements ReservationRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<ReservationProps>): Reservation {
    const id = this.db.insert(
      `INSERT INTO reservations (book_id, member_id, created_on, status, copy_id, hold_until)
       VALUES ($bookId, $memberId, $createdOn, $status, $copyId, $holdUntil) RETURNING id`,
      { ...draft },
    );
    return new Reservation({ id, ...draft });
  }

  save(reservation: Reservation): void {
    this.db.run('UPDATE reservations SET status = $status, copy_id = $copyId, hold_until = $holdUntil WHERE id = $id', {
      id: reservation.id,
      status: reservation.status,
      copyId: reservation.copyId,
      holdUntil: reservation.holdUntil,
    });
  }

  findById(id: number): Reservation | null {
    const row = this.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = $id', { id });
    return row && toReservation(row);
  }

  findOpenByBook(bookId: number): Reservation[] {
    return this.db
      .all<ReservationRow>(
        `SELECT * FROM reservations WHERE book_id = $bookId AND status IN ('waiting', 'ready')
         ORDER BY created_on, id`,
        { bookId },
      )
      .map(toReservation);
  }

  findOpenByMember(memberId: number): Reservation[] {
    return this.db
      .all<ReservationRow>(
        `SELECT * FROM reservations WHERE member_id = $memberId AND status IN ('waiting', 'ready')
         ORDER BY created_on, id`,
        { memberId },
      )
      .map(toReservation);
  }

  findReadyByCopy(copyId: number): Reservation | null {
    const row = this.db.get<ReservationRow>("SELECT * FROM reservations WHERE copy_id = $copyId AND status = 'ready'", {
      copyId,
    });
    return row && toReservation(row);
  }

  findReady(): Reservation[] {
    return this.db
      .all<ReservationRow>("SELECT * FROM reservations WHERE status = 'ready' ORDER BY hold_until, id")
      .map(toReservation);
  }

  findOpen(): Reservation[] {
    return this.db
      .all<ReservationRow>("SELECT * FROM reservations WHERE status IN ('waiting', 'ready') ORDER BY created_on, id")
      .map(toReservation);
  }
}

const toFine = (r: FineRow) =>
  new Fine({
    id: r.id,
    memberId: r.member_id,
    loanId: r.loan_id,
    amount: r.amount,
    reason: r.reason as FineReason,
    issuedOn: r.issued_on,
    status: r.status as FineStatus,
    settledOn: r.settled_on,
  });

export class SqliteFineRepository implements FineRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<FineProps>): Fine {
    const id = this.db.insert(
      `INSERT INTO fines (member_id, loan_id, amount, reason, issued_on, status, settled_on)
       VALUES ($memberId, $loanId, $amount, $reason, $issuedOn, $status, $settledOn) RETURNING id`,
      { ...draft },
    );
    return new Fine({ id, ...draft });
  }

  save(fine: Fine): void {
    this.db.run('UPDATE fines SET status = $status, settled_on = $settledOn WHERE id = $id', {
      id: fine.id,
      status: fine.status,
      settledOn: fine.settledOn,
    });
  }

  findById(id: number): Fine | null {
    const row = this.db.get<FineRow>('SELECT * FROM fines WHERE id = $id', { id });
    return row && toFine(row);
  }

  findByMember(memberId: number): Fine[] {
    return this.db
      .all<FineRow>('SELECT * FROM fines WHERE member_id = $memberId ORDER BY issued_on DESC, id DESC', { memberId })
      .map(toFine);
  }

  totalOutstanding(): number {
    return this.db.get<{ total: number }>("SELECT coalesce(sum(amount), 0) AS total FROM fines WHERE status = 'unpaid'")!.total;
  }

  findOutstandingByMember(memberId: number): Fine[] {
    return this.db
      .all<FineRow>("SELECT * FROM fines WHERE member_id = $memberId AND status = 'unpaid' ORDER BY issued_on, id", {
        memberId,
      })
      .map(toFine);
  }
}
