import { useState } from 'react';
import { Badge, Button, Empty, Field, PageHeader, Panel, ViolationList } from '../components/ui';
import { formatDate, RESERVATION_STATUS, relativeDays } from '../format';
import { Link } from '../state/router';
import { useSession } from '../state/session';
import { BookSelect, MemberSelect } from './pickers';

export function ReservationsPage() {
  const session = useSession();
  const { library, clock } = session;
  const [memberId, setMemberId] = useState<number | null>(null);
  const [bookId, setBookId] = useState<number | null>(null);
  const today = clock.today();
  const open = library.store.reservations.findOpen();
  const ready = open.filter((r) => r.status === 'ready');
  const waiting = open.filter((r) => r.status === 'waiting');
  const problems = memberId !== null && bookId !== null ? library.reservations.check(memberId, bookId) : [];

  return (
    <>
      <PageHeader title="Reservations" subtitle="Who is waiting for what, and what is waiting for whom." />

      <div className="grid grid--2">
        <Panel title="Hold shelf" aside={`${ready.length} to collect · held ${library.policy.holdDays} days`}>
          {ready.length === 0 ? (
            <Empty>The hold shelf is empty.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>For</th>
                    <th>Collect by</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {ready.map((r) => (
                    <tr key={r.id}>
                      <td className="book-title">{library.store.books.findById(r.bookId)?.title}</td>
                      <td>
                        <Link to={`/admin/members/${r.memberId}`}>{library.store.members.findById(r.memberId)?.name}</Link>
                      </td>
                      <td>
                        {formatDate(r.holdUntil)} <span className="muted">({relativeDays(r.holdUntil!, today)})</span>
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" onClick={() => session.act(() => library.reservations.cancel(r.id), 'Hold cancelled; copy passed on')}>
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Place a reservation" aside="Only for books with no copy on the shelf">
          <div className="stack">
            <Field label="Member">
              <MemberSelect value={memberId} onChange={setMemberId} />
            </Field>
            <Field label="Book">
              <BookSelect value={bookId} onChange={setBookId} />
            </Field>
            {problems.length > 0 && <ViolationList violations={problems} />}
            <div>
              <Button
                variant="primary"
                disabled={memberId === null || bookId === null || problems.length > 0}
                onClick={() =>
                  memberId !== null &&
                  bookId !== null &&
                  session.act(() => library.reservations.reserve(memberId, bookId), 'Added to the queue') &&
                  setBookId(null)
                }
              >
                Reserve
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Waiting lists" aside={`${waiting.length} waiting`}>
        {waiting.length === 0 ? (
          <Empty>Nobody is queueing.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Member</th>
                  <th>Since</th>
                  <th>Position</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {waiting.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/admin/catalog/${r.bookId}`} className="book-title">
                        {library.store.books.findById(r.bookId)?.title}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/admin/members/${r.memberId}`}>{library.store.members.findById(r.memberId)?.name}</Link>
                    </td>
                    <td>{formatDate(r.createdOn)}</td>
                    <td>
                      <Badge tone={RESERVATION_STATUS[r.status].tone}>#{library.reservations.queuePosition(r.id)}</Badge>
                    </td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" onClick={() => session.act(() => library.reservations.cancel(r.id), 'Reservation cancelled')}>
                        Cancel
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
