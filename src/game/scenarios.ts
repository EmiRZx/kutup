import { addDays } from '../core/dates';
import { generateCardNumber } from '../core/identifiers';
import type { Library } from '../core/Library';
import type { Book } from '../core/model/Book';
import type { BookCopy } from '../core/model/BookCopy';
import type { LibraryCard } from '../core/model/LibraryCard';
import type { Loan } from '../core/model/Loan';
import type { Member } from '../core/model/Member';
import type { Violation, ViolationCode } from '../core/model/violations';
import type { Random } from '../core/random';
import { REQUEST_OF } from './campaign';
import { greetingFor } from './dialogue';
import type { DeskBook, DeskCard, Encounter, ScenarioKind } from './types';

/**
 * Turns "a patron with an expired card" into a concrete person, card and book
 * taken from the library's actual state, and proves it with the core: every
 * scenario is checked against `checkCheckout` / `checkRenewal` before it is
 * allowed through the door. Honest patrons have no violations at all;
 * troublemakers break their target rule and nothing the player hasn't been
 * taught yet.
 *
 * Some scenarios need the world nudged first (a card reported lost, a fine
 * charged). Those nudges also go through the public services.
 */

export interface ScenarioContext {
  library: Library;
  random: Random;
  day: number;
  index: number;
  /** Rules the player has been taught so far. */
  known: ReadonlySet<ViolationCode>;
  /** Members already seen today, so the same face doesn't come back twice. */
  seen: ReadonlySet<number>;
}

type Builder = (ctx: ScenarioContext) => Encounter | null;

const ATTEMPTS = 25;

/** Builds the requested kind, or null if the library's current state can't produce one. */
export function buildEncounter(kind: ScenarioKind, ctx: ScenarioContext): Encounter | null {
  return BUILDERS[kind](ctx);
}

// ---------------------------------------------------------------------------
// Helpers

function deskCard(card: LibraryCard, holder: Member): DeskCard {
  return { number: card.number, name: holder.name, memberType: holder.type, expiresOn: card.expiresOn, photoSeed: holder.id };
}

function deskBook(library: Library, copy: BookCopy, extra: Partial<DeskBook> = {}): DeskBook {
  const book = library.store.books.findById(copy.bookId)!;
  return {
    barcode: copy.barcode,
    title: book.title,
    author: book.authorLine,
    referenceOnly: book.referenceOnly,
    holdSlip: null,
    damaged: false,
    coverSeed: book.id,
    ...extra,
  };
}

function encounter(ctx: ScenarioContext, kind: ScenarioKind, member: Member, card: DeskCard | null, book: DeskBook, loanId: number | null = null): Encounter {
  return {
    day: ctx.day,
    index: ctx.index,
    kind,
    request: REQUEST_OF[kind],
    patron: { memberId: member.id, name: member.name },
    card,
    book,
    loanId,
    greeting: greetingFor(kind, member.name, ctx.random),
  };
}

/** Members in random order, minus anyone already at the desk today. */
function candidates(ctx: ScenarioContext, filter: (m: Member) => boolean = () => true): Member[] {
  return ctx.random.shuffle(ctx.library.members.search('').filter((m) => !ctx.seen.has(m.id) && filter(m))).slice(0, ATTEMPTS);
}

function shelfCopies(ctx: ScenarioContext, filter: (book: Book) => boolean): BookCopy[] {
  const books = ctx.library.catalog.search('').filter(filter);
  return ctx.random.shuffle(books.flatMap((b) => ctx.library.catalog.copiesOf(b.id).filter((c) => c.isOnShelf)));
}

const lendable = (book: Book) => !book.referenceOnly;

function borrowViolations(ctx: ScenarioContext, member: Member, cardNumber: string, copy: BookCopy): Violation[] {
  return ctx.library.lending.checkCheckout({ memberId: member.id, cardNumber, barcode: copy.barcode }).violations;
}

/** The scenario is fair: it breaks `target` and nothing the player hasn't been taught. */
function fair(violations: Violation[], target: ViolationCode, known: ReadonlySet<ViolationCode>): boolean {
  return violations.some((v) => v.code === target) && violations.every((v) => known.has(v.code));
}

function usableCard(ctx: ScenarioContext, member: Member): LibraryCard | null {
  const card = ctx.library.store.cards.findActiveByMember(member.id);
  return card && card.isUsableOn(ctx.library.clock.today()) ? card : null;
}

/** A member with a valid card who could borrow `copy` with no problems at all. */
function cleanBorrower(ctx: ScenarioContext, copy: BookCopy, exclude: ReadonlySet<number> = new Set()): { member: Member; card: LibraryCard } | null {
  for (const member of candidates(ctx, (m) => m.isActive && !exclude.has(m.id))) {
    const card = usableCard(ctx, member);
    if (card && borrowViolations(ctx, member, card.number, copy).length === 0) return { member, card };
  }
  return null;
}

/** Tries `make` against a few copies from the shelf until one works. */
function withShelfCopy(ctx: ScenarioContext, filter: (b: Book) => boolean, make: (copy: BookCopy) => Encounter | null): Encounter | null {
  for (const copy of shelfCopies(ctx, filter).slice(0, 6)) {
    const result = make(copy);
    if (result) return result;
  }
  return null;
}

/** Someone whose own account breaks `target` tries to borrow a perfectly ordinary book. */
function accountProblem(kind: ScenarioKind, target: ViolationCode, eligible: (ctx: ScenarioContext, m: Member) => boolean): Builder {
  return (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      for (const member of candidates(ctx, (m) => eligible(ctx, m))) {
        const card = ctx.library.store.cards.findActiveByMember(member.id);
        if (!card) continue;
        if (fair(borrowViolations(ctx, member, card.number, copy), target, ctx.known)) {
          return encounter(ctx, kind, member, deskCard(card, member), deskBook(ctx.library, copy));
        }
      }
      return null;
    });
}

function activeLoans(ctx: ScenarioContext, filter: (loan: Loan, member: Member) => boolean): { loan: Loan; member: Member }[] {
  const out: { loan: Loan; member: Member }[] = [];
  for (const loan of ctx.random.shuffle(ctx.library.store.loans.findActive())) {
    if (ctx.seen.has(loan.memberId)) continue;
    const member = ctx.library.store.members.findById(loan.memberId)!;
    if (filter(loan, member)) out.push({ loan, member });
    if (out.length >= ATTEMPTS) break;
  }
  return out;
}

function returnBuilder(kind: 'return-good' | 'return-damaged'): Builder {
  return (ctx) => {
    const [pick] = activeLoans(ctx, () => true);
    if (!pick) return null;
    const copy = ctx.library.store.copies.findById(pick.loan.copyId)!;
    return encounter(ctx, kind, pick.member, null, deskBook(ctx.library, copy, { damaged: kind === 'return-damaged' }), pick.loan.id);
  };
}

/** A renewal request whose only problems are `target` (or none, for an honest one). */
function renewBuilder(kind: ScenarioKind, target: ViolationCode | null, prepare?: (ctx: ScenarioContext, loan: Loan) => void): Builder {
  return (ctx) => {
    for (const { loan, member } of activeLoans(ctx, (_, m) => usableCard(ctx, m) !== null)) {
      // Only nudge loans that are otherwise in order, so the nudge is the whole story.
      if (prepare) {
        if (!ctx.library.lending.checkRenewal(loan.id).allowed) continue;
        prepare(ctx, loan);
      }
      const { violations } = ctx.library.lending.checkRenewal(loan.id);
      const ok = target === null ? violations.length === 0 : fair(violations, target, ctx.known);
      if (!ok) continue;
      const copy = ctx.library.store.copies.findById(loan.copyId)!;
      return encounter(ctx, kind, member, deskCard(usableCard(ctx, member)!, member), deskBook(ctx.library, copy), loan.id);
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// One builder per kind of patron

const BUILDERS: Record<ScenarioKind, Builder> = {
  'valid-borrow': (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      const found = cleanBorrower(ctx, copy);
      return found && encounter(ctx, 'valid-borrow', found.member, deskCard(found.card, found.member), deskBook(ctx.library, copy));
    }),

  'hold-pickup': (ctx) => {
    for (const hold of ctx.random.shuffle(ctx.library.store.reservations.findReady())) {
      const member = ctx.library.store.members.findById(hold.memberId)!;
      const card = usableCard(ctx, member);
      const copy = ctx.library.store.copies.findById(hold.copyId!)!;
      if (ctx.seen.has(member.id) || !card || borrowViolations(ctx, member, card.number, copy).length > 0) continue;
      return encounter(ctx, 'hold-pickup', member, deskCard(card, member), deskBook(ctx.library, copy, { holdSlip: member.name }));
    }
    return null;
  },

  'expired-card': accountProblem('expired-card', 'CARD_EXPIRED', (ctx, m) =>
    Boolean(ctx.library.store.cards.findActiveByMember(m.id)?.isExpiredOn(ctx.library.clock.today())),
  ),

  'someone-elses-card': (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      const owner = cleanBorrower(ctx, copy);
      if (!owner) return null;
      for (const member of candidates(ctx, (m) => m.id !== owner.member.id)) {
        if (fair(borrowViolations(ctx, member, owner.card.number, copy), 'CARD_MISMATCH', ctx.known)) {
          return encounter(ctx, 'someone-elses-card', member, deskCard(owner.card, owner.member), deskBook(ctx.library, copy));
        }
      }
      return null;
    }),

  'forged-card': (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      let number = generateCardNumber(() => ctx.random.next());
      while (ctx.library.store.cards.findByNumber(number)) number = generateCardNumber(() => ctx.random.next());
      for (const member of candidates(ctx)) {
        if (!fair(borrowViolations(ctx, member, number, copy), 'CARD_UNKNOWN', ctx.known)) continue;
        // A convincing fake: their own name and face, a plausible expiry date.
        const card: DeskCard = {
          number,
          name: member.name,
          memberType: member.type,
          expiresOn: addDays(ctx.library.clock.today(), ctx.random.int(40, 300)),
          photoSeed: member.id,
        };
        return encounter(ctx, 'forged-card', member, card, deskBook(ctx.library, copy));
      }
      return null;
    }),

  'lost-card': (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      const found = cleanBorrower(ctx, copy);
      if (!found) return null;
      // Earlier this month they reported the card lost and got a new one. Then they found the old one.
      ctx.library.members.reportCardLost(found.member.id);
      const old = ctx.library.store.cards.findById(found.card.id)!;
      if (!fair(borrowViolations(ctx, found.member, old.number, copy), 'CARD_INACTIVE', ctx.known)) return null;
      return encounter(ctx, 'lost-card', found.member, deskCard(old, found.member), deskBook(ctx.library, copy));
    }),

  suspended: accountProblem('suspended', 'MEMBER_SUSPENDED', (_, m) => !m.isActive),

  'loan-limit': (ctx) =>
    withShelfCopy(ctx, lendable, (copy) => {
      const found = cleanBorrower(ctx, copy);
      if (!found) return null;
      const { member, card } = found;
      // They already have a stack of books at home: lend them up to the limit first.
      const limit = ctx.library.policy.rulesFor(member.type).maxLoans;
      const others = shelfCopies(ctx, lendable).filter((c) => c.id !== copy.id);
      while (ctx.library.store.loans.findActiveByMember(member.id).length < limit) {
        const next = others.pop();
        if (!next || borrowViolations(ctx, member, card.number, next).length > 0) return null;
        ctx.library.lending.checkout({ memberId: member.id, cardNumber: card.number, barcode: next.barcode });
      }
      if (!fair(borrowViolations(ctx, member, card.number, copy), 'LOAN_LIMIT_REACHED', ctx.known)) return null;
      return encounter(ctx, 'loan-limit', member, deskCard(card, member), deskBook(ctx.library, copy));
    }),

  overdue: accountProblem('overdue', 'HAS_OVERDUE_LOANS', (ctx, m) =>
    ctx.library.store.loans.findActiveByMember(m.id).some((l) => l.isOverdueOn(ctx.library.clock.today())),
  ),

  fines: (ctx) => {
    const natural = accountProblem('fines', 'FINES_OUTSTANDING', (c, m) => c.library.fines.balance(m.id) >= c.library.policy.fineBlockThreshold)(ctx);
    if (natural) return natural;
    // Nobody owes enough today: someone was charged for a damaged book last week and never paid.
    return withShelfCopy(ctx, lendable, (copy) => {
      const found = cleanBorrower(ctx, copy);
      if (!found) return null;
      ctx.library.fines.charge(found.member.id, ctx.library.policy.damageFee, 'damage');
      if (!fair(borrowViolations(ctx, found.member, found.card.number, copy), 'FINES_OUTSTANDING', ctx.known)) return null;
      return encounter(ctx, 'fines', found.member, deskCard(found.card, found.member), deskBook(ctx.library, copy));
    });
  },

  reference: (ctx) =>
    withShelfCopy(ctx, (b) => b.referenceOnly, (copy) => {
      for (const member of candidates(ctx, (m) => m.isActive)) {
        const card = usableCard(ctx, member);
        if (card && fair(borrowViolations(ctx, member, card.number, copy), 'REFERENCE_ONLY', ctx.known)) {
          return encounter(ctx, 'reference', member, deskCard(card, member), deskBook(ctx.library, copy));
        }
      }
      return null;
    }),

  'held-for-another': (ctx) => {
    for (const hold of ctx.random.shuffle(ctx.library.store.reservations.findReady())) {
      const copy = ctx.library.store.copies.findById(hold.copyId!)!;
      const owner = ctx.library.store.members.findById(hold.memberId)!;
      for (const member of candidates(ctx, (m) => m.isActive && m.id !== hold.memberId)) {
        const card = usableCard(ctx, member);
        if (card && fair(borrowViolations(ctx, member, card.number, copy), 'COPY_ON_HOLD_FOR_ANOTHER', ctx.known)) {
          return encounter(ctx, 'held-for-another', member, deskCard(card, member), deskBook(ctx.library, copy, { holdSlip: owner.name }));
        }
      }
    }
    return null;
  },

  'return-good': returnBuilder('return-good'),
  'return-damaged': returnBuilder('return-damaged'),

  'valid-renew': renewBuilder('valid-renew', null),
  // They have renewed online a couple of times already.
  'renew-limit': renewBuilder('renew-limit', 'RENEWAL_LIMIT_REACHED', (ctx, loan) => {
    while (ctx.library.lending.checkRenewal(loan.id).allowed) ctx.library.lending.renew(loan.id);
  }),
  'renew-overdue': renewBuilder('renew-overdue', 'LOAN_OVERDUE'),
  'renew-waiting': renewBuilder('renew-waiting', 'BOOK_HAS_WAITING_RESERVATIONS'),
};

/** Kinds to try, in order, when the planned one can't be built right now. */
export const FALLBACKS: readonly ScenarioKind[] = ['valid-borrow', 'return-good', 'return-damaged', 'valid-renew'];
