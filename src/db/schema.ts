import { LendingPolicy } from '../core/model/LendingPolicy';
import type { SqliteDatabase } from './SqliteDatabase';

/**
 * Schema migrations, applied in order. SQLite's `user_version` records how
 * many have run, so an old save file is upgraded the moment it is opened.
 * Never edit a migration that has shipped; append a new one instead.
 */
const MIGRATIONS: readonly string[] = [
  /* 1: the library */ `
  CREATE TABLE authors (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    birth_year  INTEGER
  );

  CREATE TABLE books (
    id              INTEGER PRIMARY KEY,
    isbn            TEXT    NOT NULL UNIQUE CHECK (length(isbn) = 13),
    title           TEXT    NOT NULL,
    published_year  INTEGER,
    genre           TEXT    NOT NULL,
    reference_only  INTEGER NOT NULL DEFAULT 0 CHECK (reference_only IN (0, 1))
  );

  -- Many-to-many: a book can have several authors, an author several books.
  CREATE TABLE book_authors (
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_id  INTEGER NOT NULL REFERENCES authors(id),
    position   INTEGER NOT NULL,
    PRIMARY KEY (book_id, author_id)
  );

  CREATE TABLE book_copies (
    id           INTEGER PRIMARY KEY,
    book_id      INTEGER NOT NULL REFERENCES books(id),
    barcode      TEXT    NOT NULL UNIQUE,
    status       TEXT    NOT NULL CHECK (status IN ('available', 'on_loan', 'on_hold', 'in_repair', 'lost', 'withdrawn')),
    condition    TEXT    NOT NULL CHECK (condition IN ('good', 'worn', 'damaged')),
    acquired_on  TEXT    NOT NULL
  );
  CREATE INDEX book_copies_by_book ON book_copies(book_id);

  CREATE TABLE members (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL CHECK (type IN ('student', 'staff', 'guest')),
    email      TEXT,
    status     TEXT    NOT NULL CHECK (status IN ('active', 'suspended')),
    joined_on  TEXT    NOT NULL
  );

  CREATE TABLE library_cards (
    id          INTEGER PRIMARY KEY,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    number      TEXT    NOT NULL UNIQUE,
    issued_on   TEXT    NOT NULL,
    expires_on  TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('active', 'lost', 'revoked'))
  );
  -- The database itself guarantees a member never has two usable cards.
  CREATE UNIQUE INDEX one_active_card_per_member ON library_cards(member_id) WHERE status = 'active';

  CREATE TABLE loans (
    id             INTEGER PRIMARY KEY,
    copy_id        INTEGER NOT NULL REFERENCES book_copies(id),
    member_id      INTEGER NOT NULL REFERENCES members(id),
    borrowed_on    TEXT    NOT NULL,
    due_on         TEXT    NOT NULL,
    returned_on    TEXT,
    renewals       INTEGER NOT NULL DEFAULT 0 CHECK (renewals >= 0),
    override_note  TEXT,
    CHECK (due_on >= borrowed_on),
    CHECK (returned_on IS NULL OR returned_on >= borrowed_on)
  );
  -- ...and that one copy is never lent to two people at once.
  CREATE UNIQUE INDEX one_active_loan_per_copy ON loans(copy_id) WHERE returned_on IS NULL;
  CREATE INDEX loans_by_member ON loans(member_id);

  -- Rules a librarian knowingly overrode to allow a loan.
  CREATE TABLE loan_overrides (
    loan_id         INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    violation_code  TEXT    NOT NULL,
    PRIMARY KEY (loan_id, violation_code)
  );

  CREATE TABLE reservations (
    id          INTEGER PRIMARY KEY,
    book_id     INTEGER NOT NULL REFERENCES books(id),
    member_id   INTEGER NOT NULL REFERENCES members(id),
    created_on  TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
    copy_id     INTEGER REFERENCES book_copies(id),
    hold_until  TEXT,
    CHECK (status <> 'ready' OR (copy_id IS NOT NULL AND hold_until IS NOT NULL)),
    CHECK (status <> 'waiting' OR (copy_id IS NULL AND hold_until IS NULL))
  );
  CREATE INDEX reservations_by_book ON reservations(book_id, status);

  CREATE TABLE fines (
    id          INTEGER PRIMARY KEY,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    loan_id     INTEGER REFERENCES loans(id),
    amount      INTEGER NOT NULL CHECK (amount > 0),
    reason      TEXT    NOT NULL CHECK (reason IN ('overdue', 'damage', 'lost')),
    issued_on   TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('unpaid', 'paid', 'waived')),
    settled_on  TEXT,
    CHECK ((status = 'unpaid') = (settled_on IS NULL))
  );
  CREATE INDEX fines_by_member ON fines(member_id, status);

  -- The rule book: exactly one row of general settings...
  CREATE TABLE lending_policy (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    daily_fine               INTEGER NOT NULL CHECK (daily_fine >= 0),
    max_fine_per_loan        INTEGER NOT NULL CHECK (max_fine_per_loan >= 0),
    fine_block_threshold     INTEGER NOT NULL CHECK (fine_block_threshold >= 0),
    hold_days                INTEGER NOT NULL CHECK (hold_days >= 1),
    block_when_overdue       INTEGER NOT NULL CHECK (block_when_overdue IN (0, 1)),
    reference_loans_allowed  INTEGER NOT NULL CHECK (reference_loans_allowed IN (0, 1)),
    damage_fee               INTEGER NOT NULL CHECK (damage_fee >= 0),
    lost_fee                 INTEGER NOT NULL CHECK (lost_fee >= 0)
  );

  -- ...and one row per membership type.
  CREATE TABLE member_type_rules (
    member_type   TEXT    PRIMARY KEY CHECK (member_type IN ('student', 'staff', 'guest')),
    max_loans     INTEGER NOT NULL CHECK (max_loans >= 0),
    loan_days     INTEGER NOT NULL CHECK (loan_days >= 1),
    max_renewals  INTEGER NOT NULL CHECK (max_renewals >= 0)
  );
  `,

  /* 2: the date the library's clock is set to, so a saved library resumes on the same day */ `
  CREATE TABLE calendar (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    today  TEXT    NOT NULL
  );
  `,

  /* 3: card validity depends on the membership type (guest cards last a month) */ `
  ALTER TABLE member_type_rules
    ADD COLUMN card_validity_days INTEGER NOT NULL DEFAULT 365 CHECK (card_validity_days >= 1);
  UPDATE member_type_rules SET card_validity_days = 730 WHERE member_type = 'staff';
  UPDATE member_type_rules SET card_validity_days = 30  WHERE member_type = 'guest';
  `,

  /* 4: the desk game. These tables belong to the game layer; the library core never reads them. */ `
  -- The player's career: one row.
  CREATE TABLE game_career (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    day       INTEGER NOT NULL CHECK (day >= 1),
    savings   INTEGER NOT NULL,
    status    TEXT    NOT NULL CHECK (status IN ('morning', 'open', 'evening', 'review', 'fired')),
    seed      INTEGER NOT NULL,
    minutes   INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0),
    endless   INTEGER NOT NULL DEFAULT 0 CHECK (endless IN (0, 1)),
    bulletin  TEXT    NOT NULL
  );

  -- Every patron served at the desk, and how the player handled them.
  CREATE TABLE game_encounters (
    id           INTEGER PRIMARY KEY,
    day          INTEGER NOT NULL,
    position     INTEGER NOT NULL,
    kind         TEXT    NOT NULL,
    request      TEXT    NOT NULL CHECK (request IN ('borrow', 'return', 'renew')),
    member_id    INTEGER NOT NULL REFERENCES members(id),
    barcode      TEXT    NOT NULL REFERENCES book_copies(barcode),
    card_number  TEXT,
    decision     TEXT    NOT NULL CHECK (decision IN ('approve', 'deny', 'check-in')),
    reason       TEXT,
    correct      INTEGER NOT NULL CHECK (correct IN (0, 1)),
    citation     TEXT,
    warning      TEXT,
    UNIQUE (day, position)
  );

  -- The evening ledger of each working day.
  CREATE TABLE game_days (
    day            INTEGER PRIMARY KEY,
    date           TEXT    NOT NULL,
    served         INTEGER NOT NULL,
    correct        INTEGER NOT NULL,
    citations      INTEGER NOT NULL,
    wages          INTEGER NOT NULL,
    penalties      INTEGER NOT NULL,
    expenses       INTEGER NOT NULL,
    savings_after  INTEGER NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: SqliteDatabase): void {
  const current = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`This save file was made by a newer version of Kutup (schema ${current} > ${SCHEMA_VERSION})`);
  }
  for (let version = current; version < SCHEMA_VERSION; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]!);
      if (version === 0) seedDefaultPolicy(db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

function seedDefaultPolicy(db: SqliteDatabase): void {
  const p = LendingPolicy.defaults();
  db.run(
    `INSERT INTO lending_policy VALUES (1, $dailyFine, $maxFinePerLoan, $fineBlockThreshold, $holdDays,
       $blockWhenOverdue, $referenceLoansAllowed, $damageFee, $lostFee)`,
    {
      dailyFine: p.dailyFine,
      maxFinePerLoan: p.maxFinePerLoan,
      fineBlockThreshold: p.fineBlockThreshold,
      holdDays: p.holdDays,
      blockWhenOverdue: p.blockWhenOverdue,
      referenceLoansAllowed: p.referenceLoansAllowed,
      damageFee: p.damageFee,
      lostFee: p.lostFee,
    },
  );
  for (const [type, r] of Object.entries(p.rules)) {
    // Migration 1's columns only; later migrations fill in their own defaults.
    db.run('INSERT INTO member_type_rules VALUES ($type, $maxLoans, $loanDays, $maxRenewals)', {
      type,
      maxLoans: r.maxLoans,
      loanDays: r.loanDays,
      maxRenewals: r.maxRenewals,
    });
  }
}
