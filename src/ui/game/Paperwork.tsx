import { CAMPAIGN_DAYS } from '../../game/campaign';
import { ECONOMY, reviewFor } from '../../game/economy';
import type { Game } from '../../game/Game';
import { RULE_NAMES } from '../../game/judge';
import { rulePages } from '../../game/rulebook';
import { terminalDate } from '../../game/terminal';
import { formatMoney } from '../format';
import { Link } from '../state/router';
import { useSession } from '../state/session';

/** The morning paper and the director's memo. */
export function Bulletin({ game }: { game: Game }) {
  const session = useSession();
  const { bulletin, day } = game.state;
  const today = session.library.clock.today();
  return (
    <main className="paperwork">
      <article className="newspaper">
        <header className="newspaper__masthead">
          <div className="newspaper__meta">
            <span>No. {day}</span>
            <span>{terminalDate(today)}</span>
            <span>Price: 10¢</span>
          </div>
          <h1>The Kutup Courier</h1>
        </header>
        <h2 className="newspaper__headline">{bulletin.headline}</h2>

        <div className="memo">
          <div className="memo__head">
            MEMO · From the Director · To: Circulation desk · Day {day}
            {day <= CAMPAIGN_DAYS && !game.state.endless ? ` of ${CAMPAIGN_DAYS}` : ''}
          </div>
          {bulletin.newRules.length > 0 && (
            <>
              <h3>New rules from today</h3>
              <ul>
                {rulePages(new Set(bulletin.newRules), session.library.policy).map((p) => (
                  <li key={p.code}>
                    <strong>{p.name}.</strong> {p.how}
                  </li>
                ))}
              </ul>
            </>
          )}
          {bulletin.notices.length > 0 && (
            <>
              <h3>Notices</h3>
              <ul>
                {bulletin.notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
          {bulletin.suspended.length > 0 && (
            <>
              <h3>Suspended members: do not serve</h3>
              <ul className="memo__names">
                {bulletin.suspended.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          <p className="memo__sign">— The Director</p>
        </div>

        <div className="paperwork__actions">
          <span className="muted">Savings: {formatMoney(game.state.savings)}</span>
          <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => session.act(() => game.openDesk())}>
            Open the doors
          </button>
        </div>
      </article>
    </main>
  );
}

/** The evening accounts. */
export function Ledger({ game }: { game: Game }) {
  const session = useSession();
  const records = game.todaysRecords();
  const day = game.history().days.find((d) => d.day === game.state.day);
  if (!day) return null;
  const free = Math.min(day.citations, ECONOMY.freeCitationsPerDay);
  const before = day.savingsAfter - day.wages + day.penalties + day.expenses;

  return (
    <main className="paperwork">
      <article className="ledger-sheet">
        <h1>Day {day.day} · {terminalDate(day.date)}</h1>
        <table className="accounts">
          <tbody>
            <tr>
              <td>Savings this morning</td>
              <td className="num">{formatMoney(before)}</td>
            </tr>
            <tr>
              <td>
                Wages: {day.correct} of {day.served} patrons handled correctly × {formatMoney(ECONOMY.wagePerPatron)}
              </td>
              <td className="num">+{formatMoney(day.wages)}</td>
            </tr>
            <tr>
              <td>
                Citations: {day.citations} ({free} free warning{free === 1 ? '' : 's'})
              </td>
              <td className="num">−{formatMoney(day.penalties)}</td>
            </tr>
            {ECONOMY.expenses.map((e) => (
              <tr key={e.label}>
                <td>{e.label}</td>
                <td className="num">−{formatMoney(e.amount)}</td>
              </tr>
            ))}
            <tr className="accounts__total">
              <td>Savings tonight</td>
              <td className={`num${day.savingsAfter < 0 ? ' negative' : ''}`}>{formatMoney(day.savingsAfter)}</td>
            </tr>
          </tbody>
        </table>
        {day.savingsAfter < 0 && game.state.status === 'evening' && (
          <p className="warning-line">You are in debt. Below {formatMoney(ECONOMY.firedBelow)} the director will let you go.</p>
        )}

        <h2>The day book</h2>
        <ol className="daybook">
          {records.map((r) => {
            const member = session.library.store.members.findById(r.memberId);
            const book = session.library.store.copies.findByBarcode(r.barcode);
            const title = book && session.library.store.books.findById(book.bookId)?.title;
            return (
              <li key={r.index} className={r.correct ? 'daybook--ok' : 'daybook--bad'}>
                <span className="daybook__mark">{r.correct ? '✓' : '✗'}</span>
                <span>
                  {member?.name}, <em>{title}</em>: {r.request}{' '}
                  {r.decision === 'deny' ? `refused (${RULE_NAMES[r.reason as keyof typeof RULE_NAMES] ?? r.reason})` : r.decision === 'approve' ? 'approved' : `checked in as ${r.reason}`}
                  {r.citation && <span className="daybook__note"> — {r.citation}</span>}
                  {r.warning && <span className="daybook__note"> — {r.warning}</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="paperwork__actions">
          {game.state.status === 'evening' && (
            <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => session.act(() => game.goHome())}>
              Go home
            </button>
          )}
          {game.state.status !== 'evening' && <span className="muted">The director would like a word…</span>}
        </div>
      </article>
    </main>
  );
}

/** End of the campaign, or the end of the job. */
export function Review({ game, onNewCareer }: { game: Game; onNewCareer: () => void }) {
  const session = useSession();
  const { days, encounters } = game.history();
  const review = reviewFor(encounters);
  const fired = game.state.status === 'fired';
  const citations = encounters.filter((e) => e.citation).length;

  return (
    <main className="paperwork">
      <article className={`review${fired ? ' review--fired' : ''}`}>
        <div className="review__head">{fired ? 'NOTICE OF DISMISSAL' : 'PERFORMANCE REVIEW'}</div>
        {fired ? (
          <>
            <h1>Your services are no longer required.</h1>
            <p>
              After {days.length} day{days.length === 1 ? '' : 's'} at the desk your savings stand at {formatMoney(game.state.savings)}. The
              director has asked you to hand in your stamps.
            </p>
          </>
        ) : (
          <>
            <h1>{review.title}</h1>
            <p className="review__remark">{review.remark}</p>
          </>
        )}
        <dl className="review__figures">
          <dt>Patrons served</dt>
          <dd>{encounters.length}</dd>
          <dt>Handled correctly</dt>
          <dd>{Math.round(review.accuracy * 100)}%</dd>
          <dt>Citations</dt>
          <dd>{citations}</dd>
          <dt>Savings</dt>
          <dd>{formatMoney(game.state.savings)}</dd>
        </dl>
        <p className="muted">
          Every loan you approved against the rules is on record in the back office, with the reason attached.{' '}
          <Link to="/admin/database">See for yourself.</Link>
        </p>
        <div className="paperwork__actions">
          {!fired && (
            <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => session.act(() => game.goHome())}>
              Keep working
            </button>
          )}
          <button type="button" className="rubber-stamp rubber-stamp--no" onClick={onNewCareer}>
            New career
          </button>
        </div>
      </article>
    </main>
  );
}

export function NewCareer({ onStart, hasCareer }: { onStart: () => void; hasCareer: boolean }) {
  return (
    <main className="paperwork">
      <article className="letter">
        <div className="letter__head">KUTUP PUBLIC LIBRARY · Office of the Director</div>
        <p>Dear applicant,</p>
        <p>
          We are pleased to offer you the post of <strong>Circulation Clerk</strong>, starting tomorrow at nine o’clock sharp. Patrons will come to
          your desk to borrow, return and renew books. Your job is to stamp each request <em>approved</em> or <em>denied</em>, according to the
          rules, which you will learn one day at a time.
        </p>
        <p>
          You are paid for every patron handled correctly. Mistakes earn a citation; the first two each day are a warning, the rest come out of
          your wages. Rent is due every evening.
        </p>
        <p>The library’s own records are the final word on every decision. They are never wrong. Try not to be.</p>
        <p className="letter__sign">— The Director</p>
        {hasCareer && <p className="warning-line">Starting over replaces your current career and the library it runs on.</p>}
        <div className="paperwork__actions">
          <Link to="/">Not today</Link>
          <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={onStart}>
            {hasCareer ? 'Start over' : 'Accept the post'}
          </button>
        </div>
      </article>
    </main>
  );
}
