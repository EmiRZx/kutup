import { describe, expect, it } from 'vitest';
import type { ManualClock } from '../../src/core/clock';
import type { Library } from '../../src/core/Library';
import { Random } from '../../src/core/random';
import { openLibrary } from '../../src/db/openLibrary';
import { SqliteGameStore } from '../../src/db/repositories/game';
import { CAMPAIGN_DAYS, kindsUpTo, knownRules, TARGET } from '../../src/game/campaign';
import { ECONOMY, ledgerFor, reviewFor } from '../../src/game/economy';
import { CLOSING_MINUTES, Game } from '../../src/game/Game';
import { buildEncounter } from '../../src/game/scenarios';
import { lookup } from '../../src/game/terminal';
import { SCENARIO_KINDS, type Decision, type Encounter, type ScenarioKind } from '../../src/game/types';
import { loadSql } from '../helpers';

async function newCareer(seed = 7) {
  const opened = openLibrary(await loadSql(), { seed: true, sampleActivityDays: 30, startDate: '2026-10-13' });
  const clock = opened.clock as ManualClock;
  const store = new SqliteGameStore(opened.db);
  const game = Game.start(opened.library, store, clock, seed);
  return { ...opened, clock, store, game };
}

/** What a player who knows every rule perfectly would stamp, according to the core. */
function truthOf(library: Library, e: Encounter) {
  if (e.request === 'borrow') {
    return library.lending.checkCheckout({ memberId: e.patron.memberId, cardNumber: e.card!.number, barcode: e.book.barcode }).violations;
  }
  if (e.request === 'renew') return library.lending.checkRenewal(e.loanId!).violations;
  return [];
}

function perfectDecision(library: Library, e: Encounter): Decision {
  if (e.request === 'return') return { type: 'check-in', condition: e.book.damaged ? 'damaged' : 'good' };
  const truth = truthOf(library, e);
  return truth.length === 0 ? { type: 'approve' } : { type: 'deny', reason: truth[0]!.code };
}

/** Plays a whole day with `decide`, checking the fairness invariant for every patron. */
function playDay(game: Game, decide: (e: Encounter) => Decision) {
  game.openDesk();
  const known = knownRules(game.state.day);
  let minutes = 0;
  const seen: Encounter[] = [];
  for (let e = game.nextEncounter(minutes); e; e = game.nextEncounter((minutes += 20))) {
    const truth = truthOf(game.library, e);
    // Fairness: nobody breaks a rule the player hasn't been taught yet...
    for (const v of truth) expect(known, `day ${game.state.day} ${e.kind}: ${v.code}`).toContain(v.code);
    // ...and every troublemaker really breaks the rule their story is about.
    const target = TARGET[e.kind];
    if (target) expect(truth.map((v) => v.code), `${e.kind}`).toContain(target);
    else if (e.request !== 'return') expect(truth, `${e.kind} should be clean`).toEqual([]);
    seen.push(e);
    game.decide(e, decide(e), minutes);
  }
  return { seen, record: game.closeDay() };
}

describe('scenarios', () => {
  it('can build every kind of patron from a lived-in library, and each one is what it claims to be', async () => {
    const { library, game } = await newCareer();
    // Unlock everything, including suspensions.
    while (game.state.day < 6) {
      playDay(game, (e) => perfectDecision(library, e));
      game.goHome();
    }
    const known = knownRules(CAMPAIGN_DAYS);
    const random = new Random(1);
    const built = new Map<ScenarioKind, Encounter>();
    for (const kind of SCENARIO_KINDS) {
      const e = buildEncounter(kind, { library, random, day: 7, index: 0, known, seen: new Set() });
      if (!e) continue;
      built.set(kind, e);
      const codes = truthOf(library, e).map((v) => v.code);
      if (TARGET[kind]) expect(codes, kind).toContain(TARGET[kind]);
      else if (e.request !== 'return') expect(codes, kind).toEqual([]);
    }
    // These never depend on luck; the builders arrange whatever they need.
    const guaranteed: ScenarioKind[] = [
      'valid-borrow',
      'expired-card',
      'someone-elses-card',
      'forged-card',
      'lost-card',
      'suspended',
      'loan-limit',
      'fines',
      'reference',
      'return-good',
      'return-damaged',
      'valid-renew',
      'renew-limit',
    ];
    for (const kind of guaranteed) expect(built.has(kind), kind).toBe(true);
  });

  it('show what a librarian could actually see', async () => {
    const { library, game } = await newCareer();
    const random = new Random(3);
    const ctx = { library, random, day: 7, index: 0, known: knownRules(7), seen: new Set<number>() };
    const mismatch = buildEncounter('someone-elses-card', ctx)!;
    expect(mismatch.card!.name).not.toBe(mismatch.patron.name);
    expect(mismatch.card!.photoSeed).not.toBe(mismatch.patron.memberId);
    const reference = buildEncounter('reference', ctx)!;
    expect(reference.book.referenceOnly).toBe(true);
    const expired = buildEncounter('expired-card', ctx)!;
    expect(expired.card!.expiresOn < library.clock.today()).toBe(true);
    expect(buildEncounter('return-damaged', ctx)!.book.damaged).toBe(true);
    expect(game.state.day).toBe(1);
  });
});

describe('a full career', () => {
  it('a perfect librarian is never cited and earns the top title', async () => {
    const { library, game, store } = await newCareer();
    const kindsSeen = new Set<ScenarioKind>();
    let expectedSavings = ECONOMY.startingSavings;
    while (game.state.status !== 'review') {
      const { seen, record } = playDay(game, (e) => perfectDecision(library, e));
      seen.forEach((e) => kindsSeen.add(e.kind));
      expect(record.citations).toBe(0);
      expect(record.correct).toBe(record.served);
      expectedSavings += record.wages - record.expenses;
      expect(game.state.savings).toBe(expectedSavings);
      if (game.state.status === 'evening') game.goHome();
    }
    expect(game.state.day).toBe(CAMPAIGN_DAYS);
    expect(reviewFor(store.allEncounters()).title).toBe('Head Librarian');
    // Every kind introduced in the campaign actually showed up at some point.
    for (const kind of kindsUpTo(CAMPAIGN_DAYS)) {
      if (!['hold-pickup', 'held-for-another', 'overdue', 'renew-overdue', 'renew-waiting'].includes(kind)) {
        expect(kindsSeen.has(kind), kind).toBe(true);
      }
    }
    // The core never had to record an override.
    expect(library.store.loans.findActive().every((l) => !l.wasOverridden)).toBe(true);
  }, 30_000);

  it('a librarian who approves everything gets cited, and the overrides are on record', async () => {
    const { game, db } = await newCareer();
    let citations = 0;
    for (let day = 1; day <= 3; day++) {
      const { record } = playDay(game, (e) => (e.request === 'return' ? { type: 'check-in', condition: 'good' } : { type: 'approve' }));
      citations += record.citations;
      if (game.state.status !== 'evening') break;
      game.goHome();
    }
    expect(citations).toBeGreaterThan(3);
    const overrides = db.all<{ violation_code: string }>('SELECT violation_code FROM loan_overrides');
    expect(overrides.length).toBeGreaterThan(0);
    expect(overrides.map((o) => o.violation_code)).toContain('CARD_EXPIRED');
  }, 30_000);

  it('refusing everyone gets you fired', async () => {
    const { game } = await newCareer();
    while (game.state.status !== 'fired') {
      expect(game.state.day).toBeLessThan(CAMPAIGN_DAYS);
      playDay(game, (e) => (e.request === 'return' ? { type: 'check-in', condition: 'damaged' } : { type: 'deny', reason: 'CARD_EXPIRED' }));
      if (game.state.status === 'evening') game.goHome();
    }
    expect(game.state.savings).toBeLessThan(ECONOMY.firedBelow);
  }, 30_000);
});

describe('the day cycle', () => {
  it('is reproducible from the seed', async () => {
    const a = await newCareer(42);
    const b = await newCareer(42);
    expect(a.game.deck()).toEqual(b.game.deck());
    a.game.openDesk();
    b.game.openDesk();
    const ea = a.game.nextEncounter(0);
    const eb = b.game.nextEncounter(0);
    expect(ea?.kind).toBe(eb?.kind);
    expect(ea?.book.title).toBe(eb?.book.title);
  });

  it('closes at five o’clock', async () => {
    const { game } = await newCareer();
    game.openDesk();
    expect(game.nextEncounter(CLOSING_MINUTES)).toBeNull();
  });

  it('survives a save and reload in the middle of a day', async () => {
    const { game, db, library } = await newCareer();
    game.openDesk();
    const first = game.nextEncounter(0)!;
    game.decide(first, perfectDecision(library, first), 30);
    const reopened = openLibrary(await loadSql(), { bytes: db.export() });
    const resumed = Game.resume(reopened.library, new SqliteGameStore(reopened.db), reopened.clock as ManualClock)!;
    expect(resumed.state).toMatchObject({ day: 1, status: 'open', minutes: 30 });
    expect(resumed.todaysRecords()).toHaveLength(1);
  });

  it('brings in the exam-week rule on day 6 and posts the suspensions', async () => {
    const { game, library } = await newCareer();
    while (game.state.day < 6) {
      playDay(game, (e) => perfectDecision(library, e));
      game.goHome();
    }
    expect(library.policy.rulesFor('student').maxLoans).toBe(3);
    expect(game.state.bulletin.newRules).toEqual(['LOAN_LIMIT_REACHED', 'MEMBER_SUSPENDED']);
    expect(game.state.bulletin.suspended.length).toBeGreaterThan(0);
  }, 30_000);
});

describe('economy', () => {
  it('pays per correct patron and fines citations beyond the daily allowance', () => {
    const record = (correct: boolean, citation: string | null) => ({
      day: 1,
      index: 0,
      kind: 'valid-borrow' as const,
      request: 'borrow' as const,
      memberId: 1,
      barcode: 'B',
      cardNumber: null,
      decision: 'approve' as const,
      reason: null,
      correct,
      citation,
      warning: null,
    });
    const ledger = ledgerFor([record(true, null), record(true, null), record(false, 'x'), record(false, 'y'), record(false, 'z')]);
    expect(ledger).toMatchObject({ served: 5, correct: 2, citations: 3, wages: 600, penalties: 500, expenses: 1400, net: -1300 });
  });
});

describe('the desk terminal', () => {
  it('shows what the desk cannot', async () => {
    const { library } = await newCareer();
    const ctx = { library, random: new Random(5), day: 7, index: 0, known: knownRules(7), seen: new Set<number>() };
    const text = (query: string) => lookup(library, query).map((l) => l.text).join('\n');

    const forged = buildEncounter('forged-card', ctx)!;
    expect(text(forged.card!.number)).toContain('NO RECORD');

    const lost = buildEncounter('lost-card', ctx)!;
    expect(text(lost.card!.number)).toContain('REPORTED LOST');

    const fines = buildEncounter('fines', ctx)!;
    expect(lookup(library, fines.card!.number).find((l) => l.text.startsWith('OWES'))?.tone).toBe('alert');

    const reference = buildEncounter('reference', ctx)!;
    expect(text(reference.book.barcode)).toContain('REFERENCE ONLY');

    const renew = buildEncounter('renew-limit', ctx)!;
    expect(lookup(library, renew.book.barcode).find((l) => l.text.startsWith('RENEWED'))?.tone).toBe('alert');

    expect(text('hello')).toContain('SYNTAX ERROR');
  });
});
