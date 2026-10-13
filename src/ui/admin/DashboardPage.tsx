import { Badge, Empty, PageHeader, Panel, Stat } from '../components/ui';
import { formatDate, formatMoney, plural, relativeDays } from '../format';
import { Link } from '../state/router';
import { useSession } from '../state/session';

export function DashboardPage() {
  const { library, clock } = useSession();
  const today = clock.today();
  const s = library.reports.snapshot();
  const overdue = library.lending.overdue();
  const holds = library.store.reservations.findReady();
  const popular = library.reports.mostBorrowed(6);
  const onShelf = s.copies.available;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="How the library stands this morning." />

      <div className="stats">
        <Stat label="Titles" value={s.titles} hint={plural(s.totalCopies, 'copy', 'copies')} />
        <Stat label="On the shelves" value={onShelf} tone="ok" hint={`${Math.round((onShelf / Math.max(1, s.totalCopies)) * 100)}% of the collection`} />
        <Stat label="Members" value={s.members} />
        <Stat label="Out on loan" value={s.activeLoans} tone="info" />
        <Stat label="Overdue" value={s.overdueLoans} tone={s.overdueLoans > 0 ? 'danger' : 'ok'} />
        <Stat label="Holds to collect" value={s.holdsReady} tone="warn" hint={`${s.reservationsWaiting} still waiting`} />
        <Stat label="Unpaid fines" value={formatMoney(s.outstandingFines)} tone={s.outstandingFines > 0 ? 'danger' : undefined} />
        <Stat label="Out of service" value={s.copies.in_repair + s.copies.lost} hint={`${s.copies.in_repair} in repair, ${s.copies.lost} lost`} />
      </div>

      <div className="grid grid--2">
        <Panel title="Overdue" aside={plural(overdue.length, 'loan')}>
          {overdue.length === 0 ? (
            <Empty>Everything is back on time. Enjoy it while it lasts.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Book</th>
                    <th>Was due</th>
                    <th className="num">Fine</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((o) => (
                    <tr key={o.loan.id}>
                      <td>
                        <Link to={`/admin/members/${o.member.id}`}>{o.member.name}</Link>
                      </td>
                      <td>
                        <Link to={`/admin/catalog/${o.book.id}`} className="book-title">
                          {o.book.title}
                        </Link>
                      </td>
                      <td>
                        {formatDate(o.loan.dueOn)}
                        <div>
                          <Badge tone="danger">{plural(o.daysLate, 'day')} late</Badge>
                        </div>
                      </td>
                      <td className="num">{formatMoney(o.accruedFine)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="stack">
          <Panel title="On the hold shelf" aside="Waiting to be collected">
            {holds.length === 0 ? (
              <Empty>No books are waiting for anyone.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>For</th>
                      <th>Book</th>
                      <th>Collect by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holds.map((h) => {
                      const member = library.store.members.findById(h.memberId)!;
                      const book = library.store.books.findById(h.bookId)!;
                      return (
                        <tr key={h.id}>
                          <td>
                            <Link to={`/admin/members/${member.id}`}>{member.name}</Link>
                          </td>
                          <td className="book-title">{book.title}</td>
                          <td>{h.holdUntil && relativeDays(h.holdUntil, today)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Most borrowed">
            {popular.length === 0 ? (
              <Empty>No loans yet.</Empty>
            ) : (
              <ol className="ruled-list">
                {popular.map(({ book, loans }) => (
                  <li key={book.id}>
                    <Link to={`/admin/catalog/${book.id}`} className="book-title">
                      {book.title}
                    </Link>{' '}
                    <span className="muted">— {plural(loans, 'loan')}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
