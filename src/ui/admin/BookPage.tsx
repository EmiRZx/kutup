import { useState } from 'react';
import { GENRES, type Genre } from '../../core/model/Book';
import { Badge, Button, Empty, Field, Notice, PageHeader, Panel } from '../components/ui';
import { COPY_STATUS, formatDate, formatIsbn, RESERVATION_STATUS } from '../format';
import { Link } from '../state/router';
import { useSession } from '../state/session';
import { MemberSelect } from './pickers';

export function BookPage({ bookId }: { bookId: number }) {
  const session = useSession();
  const { library } = session;
  const book = library.store.books.findById(bookId);
  const [reserveFor, setReserveFor] = useState<number | null>(null);

  if (!book) {
    return (
      <>
        <PageHeader title="Not in the catalog" />
        <Notice tone="danger">There is no book #{bookId}. <Link to="/admin/catalog">Back to the catalog</Link></Notice>
      </>
    );
  }

  const copies = library.catalog.copiesOf(book.id);
  const queue = library.store.reservations.findOpenByBook(book.id);
  const availability = library.catalog.availability(book.id);

  return (
    <>
      <PageHeader
        title={<span className="book-title" style={{ fontStyle: 'italic' }}>{book.title}</span>}
        subtitle={`${book.authorLine}${book.publishedYear ? `, ${book.publishedYear}` : ''}`}
        actions={<Link to="/admin/catalog">← Catalog</Link>}
      />

      <div className="grid grid--sidebar">
        <div className="stack">
          <Panel title="Catalog card">
            <dl className="meta">
              <dt>ISBN</dt>
              <dd className="mono">{formatIsbn(book.isbn)}</dd>
              <dt>Genre</dt>
              <dd>
                <select
                  className="select"
                  value={book.genre}
                  onChange={(e) => session.act(() => library.catalog.updateBook(book.id, { genre: e.target.value as Genre }), 'Genre updated')}
                >
                  {GENRES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </dd>
              <dt>Lending</dt>
              <dd>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={book.referenceOnly}
                    onChange={(e) =>
                      session.act(
                        () => library.catalog.updateBook(book.id, { referenceOnly: e.target.checked }),
                        e.target.checked ? 'Now reference only' : 'Now lendable',
                      )
                    }
                  />
                  Reference only
                </label>
              </dd>
              <dt>Copies</dt>
              <dd>
                {availability.onShelf} on shelf · {availability.onLoan} on loan · {availability.onHold} on hold ·{' '}
                {availability.outOfService} out of service
              </dd>
            </dl>
          </Panel>

          <Panel title="Reservation queue" aside={`${queue.length} open`}>
            {queue.length === 0 ? (
              <Empty>Nobody is waiting for this book.</Empty>
            ) : (
              <ol style={{ margin: '0 0 12px', paddingLeft: 22 }}>
                {queue.map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    <Link to={`/admin/members/${r.memberId}`}>{library.store.members.findById(r.memberId)?.name}</Link>{' '}
                    <Badge tone={RESERVATION_STATUS[r.status].tone}>{RESERVATION_STATUS[r.status].label}</Badge>{' '}
                    <span className="muted">since {formatDate(r.createdOn)}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              <Field label="Reserve for">
                <MemberSelect value={reserveFor} onChange={setReserveFor} />
              </Field>
              <div>
                <Button
                  size="sm"
                  disabled={reserveFor === null}
                  onClick={() =>
                    reserveFor !== null &&
                    session.act(() => library.reservations.reserve(reserveFor, book.id), 'Added to the queue') &&
                    setReserveFor(null)
                  }
                >
                  Place reservation
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Copies"
          aside={
            <Button size="sm" onClick={() => session.act(() => library.catalog.addCopies(book.id, 1), (c) => `New copy ${c[0]?.barcode}`)}>
              + Add a copy
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Where is it?</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {copies.map((copy) => {
                  const loan = copy.status === 'on_loan' ? library.store.loans.findActiveByCopy(copy.id) : null;
                  const hold = copy.status === 'on_hold' ? library.store.reservations.findReadyByCopy(copy.id) : null;
                  const who = loan ?? hold;
                  const member = who && library.store.members.findById(who.memberId);
                  return (
                    <tr key={copy.id}>
                      <td className="mono">{copy.barcode}</td>
                      <td>
                        <Badge tone={COPY_STATUS[copy.status].tone}>{COPY_STATUS[copy.status].label}</Badge>
                      </td>
                      <td>{copy.condition}</td>
                      <td>
                        {member && (
                          <>
                            {loan ? 'With ' : 'Held for '}
                            <Link to={`/admin/members/${member.id}`}>{member.name}</Link>
                            <span className="muted">
                              {loan ? `, due ${formatDate(loan.dueOn)}` : hold?.holdUntil ? `, until ${formatDate(hold.holdUntil)}` : ''}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="actions">
                        {copy.status === 'available' && (
                          <Button size="sm" onClick={() => session.act(() => library.catalog.sendToRepair(copy.barcode), 'Sent to repair')}>
                            Repair
                          </Button>
                        )}
                        {(copy.status === 'in_repair' || copy.status === 'lost') && (
                          <Button size="sm" onClick={() => session.act(() => library.catalog.restoreToShelf(copy.barcode), 'Back in circulation')}>
                            {copy.status === 'lost' ? 'Found it' : 'Repaired'}
                          </Button>
                        )}
                        {copy.canTransitionTo('withdrawn') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.confirm(`Withdraw ${copy.barcode} from the collection for good?`) &&
                              session.act(() => library.catalog.withdraw(copy.barcode), 'Withdrawn')
                            }
                          >
                            Withdraw
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
