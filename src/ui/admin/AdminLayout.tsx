import { useRef, type ReactNode } from 'react';
import { Button } from '../components/ui';
import { formatLongDate } from '../format';
import { Link } from '../state/router';
import { downloadFile } from '../state/persistence';
import { useSession } from '../state/session';

const SECTIONS = [
  { path: '', label: 'Dashboard' },
  { path: 'circulation', label: 'Circulation desk' },
  { path: 'catalog', label: 'Catalog' },
  { path: 'members', label: 'Members' },
  { path: 'reservations', label: 'Reservations' },
  { path: 'policy', label: 'Lending rules' },
  { path: 'database', label: 'Database' },
] as const;

export function AdminLayout({ section, children }: { section: string; children: ReactNode }) {
  const session = useSession();
  const { library, clock } = session;
  const overdue = library.lending.overdue().length;

  return (
    <div className="admin">
      <aside className="sidebar">
        <Link to="/" className="sidebar__brand">
          <div className="sidebar__logo">KUTUP</div>
          <div className="sidebar__tagline">Back office</div>
        </Link>
        <nav className="nav" aria-label="Back office">
          {SECTIONS.map(({ path, label }) => (
            <Link key={path} to={`/admin/${path}`} aria-current={section === path ? 'page' : undefined}>
              {label}
              {path === '' && overdue > 0 && (
                <span className="nav__count" title="Overdue loans">
                  {overdue}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar__foot">
          The same library the desk game runs on. Every rule here is enforced there too.
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="date-stamp">
            <span className="date-stamp__date" title="The library's calendar">
              {formatLongDate(clock.today())}
            </span>
            <Button
              size="sm"
              onClick={() =>
                session.act(
                  () => {
                    clock.advance(1);
                    library.openForTheDay();
                  },
                  () => `Good morning. It is ${formatLongDate(clock.today())}.`,
                )
              }
              title="Close for the day and open tomorrow. Uncollected holds expire."
            >
              Next day →
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                session.act(
                  () => {
                    for (let i = 0; i < 7; i++) {
                      clock.advance(1);
                      library.openForTheDay();
                    }
                  },
                  () => `A week passes. It is ${formatLongDate(clock.today())}.`,
                )
              }
            >
              +1 week
            </Button>
          </div>
          <FileMenu />
        </div>
        {children}
      </div>
    </div>
  );
}

function FileMenu() {
  const session = useSession();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="btn-row">
      <Button size="sm" onClick={() => downloadFile(session.db.export(), `kutup-${session.clock.today()}.sqlite`)}>
        Save .sqlite
      </Button>
      <Button size="sm" onClick={() => input.current?.click()}>
        Open file…
      </Button>
      <input
        ref={input}
        type="file"
        accept=".sqlite,.db,application/vnd.sqlite3,application/x-sqlite3"
        className="visually-hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) session.replace(new Uint8Array(await file.arrayBuffer()));
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (window.confirm('Throw away this library and start a fresh sample one? Save a copy first if you need it.')) {
            session.replace('sample');
          }
        }}
      >
        Reset sample
      </Button>
    </div>
  );
}
