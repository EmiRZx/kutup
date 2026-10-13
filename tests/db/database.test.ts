import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../src/core/clock';
import { SEED_BOOKS } from '../../src/db/seed/catalog';
import { emailFor } from '../../src/db/seed/seed';
import { openLibrary } from '../../src/db/openLibrary';
import { SCHEMA_VERSION } from '../../src/db/schema';
import { SqliteDatabase } from '../../src/db/SqliteDatabase';
import { addBook, addMember, freshLibrary, lend, loadSql } from '../helpers';

describe('SqliteDatabase', () => {
  it('creates the schema and default policy on a fresh database', async () => {
    const db = SqliteDatabase.open(await loadSql());
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(SCHEMA_VERSION);
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
    expect(tables).toEqual([
      'authors',
      'book_authors',
      'book_copies',
      'books',
      'fines',
      'lending_policy',
      'library_cards',
      'loan_overrides',
      'loans',
      'member_type_rules',
      'members',
      'reservations',
    ]);
    expect(db.all('SELECT * FROM member_type_rules')).toHaveLength(3);
  });

  it('rolls back every write in a failed transaction', async () => {
    const { library, db } = await freshLibrary();
    expect(() =>
      library.store.transaction(() => {
        addMember(library, 'Ghost');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.all('SELECT * FROM members')).toEqual([]);
    expect(db.all('SELECT * FROM library_cards')).toEqual([]);
  });

  it('enforces integrity even if the code had a bug', async () => {
    const { library, db } = await freshLibrary();
    const alice = addMember(library);
    const { barcodes } = addBook(library);
    const loan = lend(library, alice, barcodes[0]!);
    // A second active loan for the same copy, written behind the core's back:
    expect(() =>
      db.run(
        "INSERT INTO loans (copy_id, member_id, borrowed_on, due_on) VALUES ($copyId, $memberId, '2026-03-02', '2026-03-16')",
        { copyId: loan.copyId, memberId: alice.member.id },
      ),
    ).toThrow(/UNIQUE/);
    expect(() => db.run("UPDATE book_copies SET status = 'borrowed'")).toThrow(/CHECK/);
    expect(() => db.run('INSERT INTO loans (copy_id, member_id, borrowed_on, due_on) VALUES (999, 999, "a", "b")')).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('round-trips the whole library through a save file', async () => {
    const sql = await loadSql();
    const { library, db } = await freshLibrary();
    const alice = addMember(library, 'Alice');
    const { barcodes } = addBook(library, 'Saved Book');
    const loan = library.lending.checkout(
      { memberId: alice.member.id, cardNumber: '00000000', barcode: barcodes[0]! },
      { note: 'Left card at home' },
    );

    const bytes = db.export();
    const reopened = openLibrary(sql, { clock: new ManualClock('2026-03-02'), bytes }).library;
    const restored = reopened.lending.getLoan(loan.id);
    expect(restored.overriddenViolations).toEqual(['CARD_UNKNOWN']);
    expect(restored.overrideNote).toBe('Left card at home');
    expect(reopened.members.summary(alice.member.id).activeLoans[0]?.book.title).toBe('Saved Book');
    // Foreign keys still enforced after export:
    expect(() => db.run('INSERT INTO book_copies (book_id, barcode, status, condition, acquired_on) VALUES (999, "X", "available", "good", "2026-01-01")')).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('refuses save files from a newer version', async () => {
    const sql = await loadSql();
    const raw = new sql.Database();
    raw.run(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => SqliteDatabase.open(sql, raw.export())).toThrow(/newer version/);
  });
});

describe('seed data', () => {
  it('fills a fresh library with the sample catalog and members', async () => {
    const { library } = openLibrary(await loadSql(), { clock: new ManualClock('2026-03-02'), seed: true });
    expect(library.catalog.search('')).toHaveLength(SEED_BOOKS.length);
    const copies = SEED_BOOKS.reduce((n, b) => n + b.copies, 0);
    expect(library.store.copies.findByBook(1).length).toBeGreaterThan(0);
    expect(library.catalog.search('').reduce((n, b) => n + library.catalog.availability(b.id).total, 0)).toBe(copies);
    expect(library.members.search('').length).toBeGreaterThan(0);
    expect(library.catalog.search('marx')[0]?.authorLine).toBe('Karl Marx and Friedrich Engels');
  });

  it('builds plain e-mail addresses from Turkish names', () => {
    expect(emailFor('Prof. Ayşe Arslan')).toBe('ayse.arslan@kutup.edu');
    expect(emailFor('Elif Yılmaz')).toBe('elif.yilmaz@kutup.edu');
    expect(emailFor('Dr. Kemal Öztürk')).toBe('kemal.ozturk@kutup.edu');
  });
});
