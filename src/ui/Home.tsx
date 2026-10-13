import { formatLongDate } from './format';
import { Link } from './state/router';
import { useSession } from './state/session';

/** The title screen: the game's front door, and the back office's side door. */
export function Home() {
  const { library, clock } = useSession();
  const s = library.reports.snapshot();

  return (
    <main className="home">
      <div className="home__sign">
        <div className="home__eyebrow">Est. 1986 · Open weekdays</div>
        <h1 className="home__title">KUTUP</h1>
        <div className="home__subtitle">The Librarian's Desk</div>
      </div>

      <p className="home__lede">
        A library management system disguised as a game. You sit behind the desk; patrons bring a card and a book. Stamp{' '}
        <span className="ink-stamp ink-stamp--ok">APPROVED</span> or <span className="ink-stamp ink-stamp--no">DENIED</span>. The library's own
        rules are the referee.
      </p>

      <div className="home__doors">
        <div className="door door--locked" aria-disabled="true">
          <div className="door__label">Front desk</div>
          <h2 className="door__title">Start your shift</h2>
          <p>Work the circulation desk, one patron at a time. Catch the forged cards before the auditors do.</p>
          <span className="door__soon">Under construction</span>
        </div>

        <Link to="/admin" className="door">
          <div className="door__label">Staff only</div>
          <h2 className="door__title">Back office</h2>
          <p>
            The full library system: catalog, members, loans, reservations, fines, the rule book and the raw SQLite database.
          </p>
          <span className="door__go">Enter →</span>
        </Link>
      </div>

      <footer className="home__foot">
        {formatLongDate(clock.today())} · {s.titles} titles · {s.members} members · {s.activeLoans} books out
      </footer>
    </main>
  );
}
