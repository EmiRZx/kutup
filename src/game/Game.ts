import type { ManualClock } from '../core/clock';
import type { Library } from '../core/Library';
import type { ViolationCode } from '../core/model/violations';
import { Random } from '../core/random';
import { simulateDay } from '../sim/life';
import { CAMPAIGN_DAYS, deckFor, kindsUpTo, knownRules, planFor, TARGET, type DayPlan } from './campaign';
import { ECONOMY, ledgerFor } from './economy';
import { judge } from './judge';
import { buildEncounter, FALLBACKS } from './scenarios';
import type { Bulletin, CareerState, DayRecord, Decision, Encounter, EncounterRecord, GameStore, ScenarioKind, Verdict } from './types';

/** The desk is open from 09:00 (minute 0) to 17:00 (minute 480). */
export const CLOSING_MINUTES = 8 * 60;

/** Mixes the career seed with a day and a slot, so every patron is reproducible. */
function mix(seed: number, day: number, slot: number): number {
  return (seed ^ Math.imul(day, 0x9e3779b1) ^ Math.imul(slot + 1, 0x85ebca77)) >>> 0;
}

/**
 * A librarian's career: the day cycle (morning bulletin → desk → evening
 * ledger → overnight), the queue of patrons and the bookkeeping. Every change
 * to the library goes through the core's services; the game only decides
 * *who* walks in and grades what the player does about them.
 */
export class Game {
  readonly library: Library;
  private readonly store: GameStore;
  private readonly clock: ManualClock;
  private current: CareerState;

  private constructor(library: Library, store: GameStore, clock: ManualClock, state: CareerState) {
    this.library = library;
    this.store = store;
    this.clock = clock;
    this.current = state;
  }

  /** The career saved in this library, if there is one. */
  static resume(library: Library, store: GameStore, clock: ManualClock): Game | null {
    const state = store.load();
    return state ? new Game(library, store, clock, state) : null;
  }

  /** Begins a new career the morning after the library's current date. */
  static start(library: Library, store: GameStore, clock: ManualClock, seed: number): Game {
    store.clear();
    const game = new Game(library, store, clock, {
      day: 1,
      savings: ECONOMY.startingSavings,
      status: 'morning',
      seed,
      minutes: 0,
      bulletin: { headline: '', newRules: [], notices: [], suspended: [] },
      endless: false,
    });
    library.store.transaction(() => {
      clock.advance(1);
      library.openForTheDay();
      game.prepareMorning();
    });
    return game;
  }

  get state(): Readonly<CareerState> {
    return this.current;
  }

  get plan(): DayPlan {
    return planFor(this.current.day);
  }

  /** Rules the player has been taught so far. */
  get known(): Set<ViolationCode> {
    return knownRules(this.current.day);
  }

  get isLastCampaignDay(): boolean {
    return this.current.day === CAMPAIGN_DAYS && !this.current.endless;
  }

  todaysRecords(): EncounterRecord[] {
    return this.store.encounters(this.current.day);
  }

  history(): { days: DayRecord[]; encounters: EncounterRecord[] } {
    return { days: this.store.days(), encounters: this.store.allEncounters() };
  }

  /** Today's queue, as planned this morning. Deterministic for a given seed and day. */
  deck(): ScenarioKind[] {
    const random = new Random(mix(this.current.seed, this.current.day, -1));
    return deckFor(this.current.day, (items) => random.pick(items), (items) => random.shuffle(items));
  }

  /** How many patrons are still waiting after the current one. */
  waiting(): number {
    return Math.max(0, this.deck().length - this.todaysRecords().length - 1);
  }

  openDesk(): void {
    this.expect('morning');
    this.update({ status: 'open', minutes: 0 });
  }

  /**
   * Calls the next patron to the desk, or returns null when the queue is empty
   * or it is closing time. May nudge the library first (a card reported lost
   * last week, say) so that the patron's story is true.
   */
  nextEncounter(minutes: number): Encounter | null {
    this.expect('open');
    const index = this.todaysRecords().length;
    const deck = this.deck();
    if (index >= deck.length || minutes >= CLOSING_MINUTES) return null;

    const random = new Random(mix(this.current.seed, this.current.day, index));
    const seen = new Set(this.todaysRecords().map((r) => r.memberId));
    const context = { library: this.library, random, day: this.current.day, index, known: this.known, seen };
    const available = new Set(kindsUpTo(this.current.day));
    const order = [deck[index]!, ...random.shuffle(FALLBACKS.filter((k) => available.has(k)))];
    return this.library.store.transaction(() => {
      for (const kind of order) {
        const encounter = buildEncounter(kind, context);
        if (encounter) return encounter;
      }
      return null;
    });
  }

  /** Stamps a decision: the core carries it out and grades it, and the result goes in the day book. */
  decide(encounter: Encounter, decision: Decision, minutes: number): Verdict {
    this.expect('open');
    const random = new Random(mix(this.current.seed, this.current.day, encounter.index + 1000));
    return this.library.store.transaction(() => {
      const verdict = judge(this.library, encounter, decision, random);
      this.store.addEncounter({
        day: encounter.day,
        index: encounter.index,
        kind: encounter.kind,
        request: encounter.request,
        memberId: encounter.patron.memberId,
        barcode: encounter.book.barcode,
        cardNumber: encounter.card?.number ?? null,
        decision: decision.type,
        reason: decision.type === 'deny' ? decision.reason : decision.type === 'check-in' ? decision.condition : null,
        correct: verdict.correct,
        citation: verdict.citation,
        warning: verdict.warning,
      });
      this.update({ minutes: Math.min(minutes, CLOSING_MINUTES) });
      return verdict;
    });
  }

  /** Closes the desk and settles the day's accounts. */
  closeDay(): DayRecord {
    this.expect('open');
    const ledger = ledgerFor(this.todaysRecords(), this.current.day);
    const savingsAfter = this.current.savings + ledger.net;
    const record: DayRecord = {
      day: this.current.day,
      date: this.clock.today(),
      served: ledger.served,
      correct: ledger.correct,
      citations: ledger.citations,
      wages: ledger.wages,
      penalties: ledger.penalties,
      expenses: ledger.expenses,
      savingsAfter,
    };
    this.library.store.transaction(() => {
      this.store.addDay(record);
      const status = savingsAfter < ECONOMY.firedBelow ? 'fired' : this.isLastCampaignDay ? 'review' : 'evening';
      this.update({ savings: savingsAfter, status });
    });
    return record;
  }

  /** Goes home for the night. The library carries on without you until tomorrow morning. */
  goHome(): void {
    if (this.current.status === 'review') this.current = { ...this.current, endless: true };
    else this.expect('evening');
    const random = new Random(mix(this.current.seed, this.current.day, 9999));
    this.library.store.transaction(() => {
      simulateDay(this.library, random); // the evening shift
      this.clock.advance(1);
      this.library.openForTheDay();
      this.current = { ...this.current, day: this.current.day + 1, minutes: 0, status: 'morning' };
      this.prepareMorning();
    });
  }

  /** Today's rule changes and noticeboard. */
  private prepareMorning(): void {
    const plan = this.plan;
    if (plan.policy) this.library.policy = plan.policy(this.library.policy);
    if (plan.introduces.includes('suspended') || (this.known.has('MEMBER_SUSPENDED') && this.suspended().length === 0)) {
      this.suspendWorstDebtors();
    }
    if (this.known.has('COPY_ON_HOLD_FOR_ANOTHER')) this.stockHoldShelf(2);
    const bulletin: Bulletin = {
      headline: plan.headline,
      newRules: plan.introduces.flatMap((k) => (TARGET[k] ? [TARGET[k]] : [])),
      notices: plan.notices,
      suspended: this.known.has('MEMBER_SUSPENDED') ? this.suspended().map((m) => m.name) : [],
    };
    this.update({ bulletin });
  }

  private suspended() {
    return this.library.members.search('').filter((m) => !m.isActive);
  }

  /** The director suspends the two members who owe the most (with a little help from the accounts office if nobody does). */
  private suspendWorstDebtors(): void {
    const owing = this.library.members
      .search('')
      .filter((m) => m.isActive)
      .map((m) => ({ m, owes: this.library.fines.balance(m.id) + this.library.fines.accruingBalance(m.id) }))
      .sort((a, b) => b.owes - a.owes)
      .slice(0, 2);
    for (const { m } of owing) this.library.members.suspend(m.id);
  }

  /**
   * Makes sure a few reserved books are waiting at the desk: someone reserves a
   * book that is out, and its borrower drops it in the returns box overnight.
   * The core then puts it on hold, exactly as it would for real.
   */
  private stockHoldShelf(target: number): void {
    const random = new Random(mix(this.current.seed, this.current.day, 7777));
    const today = this.clock.today();
    for (const loan of random.shuffle(this.library.store.loans.findActive())) {
      if (this.library.store.reservations.findReady().length >= target) return;
      if (loan.isOverdueOn(today)) continue;
      const copy = this.library.store.copies.findById(loan.copyId)!;
      if (this.library.store.reservations.findOpenByBook(copy.bookId).length > 0) continue;
      const reserver = random
        .shuffle(this.library.members.search(''))
        .find((m) => m.id !== loan.memberId && this.library.reservations.check(m.id, copy.bookId).length === 0);
      if (!reserver) continue;
      this.library.reservations.reserve(reserver.id, copy.bookId);
      this.library.lending.returnCopy(copy.barcode);
    }
  }

  private expect(status: CareerState['status']): void {
    if (this.current.status !== status) throw new Error(`The career is in the ${this.current.status} phase, not ${status}`);
  }

  private update(changes: Partial<CareerState>): void {
    this.current = { ...this.current, ...changes };
    this.store.save(this.current);
  }
}
