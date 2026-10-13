import { MEMBER_TYPES, type MemberType } from '../../core/model/Member';
import type { LibraryCard } from '../../core/model/LibraryCard';
import type { Member } from '../../core/model/Member';
import { Badge, Button, Empty, Notice, PageHeader, Panel } from '../components/ui';
import { FINE_REASON, FINE_STATUS, formatDate, formatMoney, MEMBER_TYPE, RESERVATION_STATUS, relativeDays } from '../format';
import { Link, navigate } from '../state/router';
import { useSession } from '../state/session';

export function MemberPage({ memberId }: { memberId: number }) {
  const session = useSession();
  const { library, clock } = session;
  const member = library.store.members.findById(memberId);

  if (!member) {
    return (
      <>
        <PageHeader title="No such member" />
        <Notice tone="danger">
          There is no member #{memberId}. <Link to="/admin/members">Back to members</Link>
        </Notice>
      </>
    );
  }

  const today = clock.today();
  const summary = library.members.summary(member.id);
  const fines = library.store.fines.findByMember(member.id);
  const history = library.members.loanHistory(member.id).filter((d) => !d.loan.isActive);
  const rules = library.policy.rulesFor(member.type);

  const renew = (loanId: number) => {
    const check = library.lending.checkRenewal(loanId);
    if (check.allowed) {
      session.act(() => library.lending.renew(loanId), (l) => `Renewed until ${formatDate(l.dueOn)}`);
      return;
    }
    const reasons = check.violations.map((v) => `• ${v.message}`).join('\n');
    if (!check.overridable) {
      session.act(() => library.lending.renew(loanId));
      return;
    }
    const note = window.prompt(`This renewal breaks the rules:\n${reasons}\n\nTo override, give a reason:`);
    if (note !== null) session.act(() => library.lending.renew(loanId, { note }), (l) => `Renewed (override) until ${formatDate(l.dueOn)}`);
  };

  return (
    <>
      <PageHeader
        title={member.name}
        subtitle={`${MEMBER_TYPE[member.type]} member since ${formatDate(member.joinedOn)}${member.email ? ` · ${member.email}` : ''}`}
        actions={
          <>
            <Link to="/admin/members">← Members</Link>
            <Button variant="primary" disabled={!summary.card} onClick={() => navigate(`/admin/circulation?card=${summary.card?.number ?? ''}`)}>
              Lend a book
            </Button>
          </>
        }
      />

      <div className="grid grid--sidebar">
        <div className="stack">
          <CardView member={member} card={summary.card} today={today} />
          <div className="btn-row">
            <Button size="sm" disabled={!summary.card} onClick={() => session.act(() => library.members.renewCard(member.id), (c) => `Card valid until ${formatDate(c.expiresOn)}`)}>
              Renew card
            </Button>
            <Button
              size="sm"
              disabled={!summary.card}
              onClick={() =>
                window.confirm('Block this card and issue a new number?') &&
                session.act(() => library.members.reportCardLost(member.id), (c) => `Old card blocked. New card ${c.printedNumber}.`)
              }
            >
              Report card lost
            </Button>
            {!summary.card && (
              <Button size="sm" onClick={() => session.act(() => library.members.issueCard(member.id), (c) => `Card ${c.printedNumber} issued`)}>
                Issue card
              </Button>
            )}
          </div>

          <Panel title="Account">
            <dl className="meta">
              <dt>Status</dt>
              <dd>{member.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</dd>
              <dt>Membership</dt>
              <dd>
                <select
                  className="select"
                  value={member.type}
                  onChange={(e) =>
                    session.act(() => library.members.update(member.id, { type: e.target.value as MemberType }), 'Membership changed')
                  }
                >
                  {MEMBER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MEMBER_TYPE[t]}
                    </option>
                  ))}
                </select>
              </dd>
              <dt>Allowance</dt>
              <dd>
                {summary.activeLoans.length} of {rules.maxLoans} books · {rules.loanDays} days · {rules.maxRenewals} renewals
              </dd>
              <dt>Owes</dt>
              <dd>
                <strong>{formatMoney(summary.balance)}</strong>
                {library.fines.accruingBalance(member.id) > 0 && (
                  <span className="muted"> (+{formatMoney(library.fines.accruingBalance(member.id))} accruing on late books)</span>
                )}
              </dd>
            </dl>
            <div className="btn-row" style={{ marginTop: 12 }}>
              {member.isActive ? (
                <Button size="sm" variant="danger" onClick={() => session.act(() => library.members.suspend(member.id), 'Member suspended')}>
                  Suspend
                </Button>
              ) : (
                <Button size="sm" onClick={() => session.act(() => library.members.reinstate(member.id), 'Member reinstated')}>
                  Reinstate
                </Button>
              )}
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="On loan" aside={`${summary.activeLoans.length} of ${rules.maxLoans}`}>
            {summary.activeLoans.length === 0 ? (
              <Empty>Nothing borrowed at the moment.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Borrowed</th>
                      <th>Due</th>
                      <th className="actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.activeLoans.map(({ loan, book, copy }) => (
                      <tr key={loan.id}>
                        <td>
                          <Link to={`/admin/catalog/${book.id}`} className="book-title">
                            {book.title}
                          </Link>{' '}
                          <span className="muted mono">{copy.barcode}</span>
                          {loan.wasOverridden && (
                            <div>
                              <Badge tone="warn">Override</Badge> <span className="muted">{loan.overrideNote}</span>
                            </div>
                          )}
                        </td>
                        <td>{formatDate(loan.borrowedOn)}</td>
                        <td>
                          {formatDate(loan.dueOn)}{' '}
                          {loan.isOverdueOn(today) ? (
                            <Badge tone="danger">{loan.daysLate(today)}d late</Badge>
                          ) : (
                            <span className="muted">({relativeDays(loan.dueOn, today)})</span>
                          )}
                          {loan.renewals > 0 && <div className="muted">renewed {loan.renewals}×</div>}
                        </td>
                        <td className="actions">
                          <Button size="sm" onClick={() => renew(loan.id)}>
                            Renew
                          </Button>
                          <Button size="sm" onClick={() => session.act(() => library.lending.returnCopy(copy.barcode), 'Checked in')}>
                            Return
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.confirm(`Declare “${book.title}” lost? A replacement fee of ${formatMoney(library.policy.lostFee)} is charged.`) &&
                              session.act(() => library.lending.declareLost(loan.id), 'Declared lost')
                            }
                          >
                            Lost
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Fines"
            aside={
              summary.balance > 0 && (
                <Button size="sm" variant="primary" onClick={() => session.act(() => library.fines.payAll(member.id), (paid) => `Collected ${formatMoney(paid)}`)}>
                  Pay all {formatMoney(summary.balance)}
                </Button>
              )
            }
          >
            {fines.length === 0 ? (
              <Empty>A clean record.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Issued</th>
                      <th>Reason</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th className="actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {fines.map((f) => (
                      <tr key={f.id}>
                        <td>{formatDate(f.issuedOn)}</td>
                        <td>{FINE_REASON[f.reason]}</td>
                        <td className="num">{formatMoney(f.amount)}</td>
                        <td>
                          <Badge tone={FINE_STATUS[f.status].tone}>{FINE_STATUS[f.status].label}</Badge>
                        </td>
                        <td className="actions">
                          {f.isOutstanding && (
                            <>
                              <Button size="sm" onClick={() => session.act(() => library.fines.pay(f.id), 'Paid')}>
                                Pay
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => session.act(() => library.fines.waive(f.id), 'Waived')}>
                                Waive
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Reservations">
            {summary.reservations.length === 0 ? (
              <Empty>Not waiting for anything.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <tbody>
                    {summary.reservations.map((r) => {
                      const book = library.store.books.findById(r.bookId)!;
                      return (
                        <tr key={r.id}>
                          <td>
                            <Link to={`/admin/catalog/${book.id}`} className="book-title">
                              {book.title}
                            </Link>
                          </td>
                          <td>
                            <Badge tone={RESERVATION_STATUS[r.status].tone}>{RESERVATION_STATUS[r.status].label}</Badge>{' '}
                            <span className="muted">
                              {r.status === 'ready' && r.holdUntil
                                ? `collect by ${formatDate(r.holdUntil)}`
                                : `#${library.reservations.queuePosition(r.id)} in line`}
                            </span>
                          </td>
                          <td className="actions">
                            <Button size="sm" variant="ghost" onClick={() => session.act(() => library.reservations.cancel(r.id), 'Reservation cancelled')}>
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Reading history" aside={`${history.length} returned`}>
            {history.length === 0 ? (
              <Empty>No returned books yet.</Empty>
            ) : (
              <ul className="ruled-list">
                {history.slice(0, 15).map(({ loan, book }) => (
                  <li key={loan.id}>
                    <span className="book-title">{book.title}</span>{' '}
                    <span className="muted">
                      {formatDate(loan.borrowedOn)} – {formatDate(loan.returnedOn)}
                      {loan.daysLate(today) > 0 && `, ${loan.daysLate(today)}d late`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function CardView({ member, card, today }: { member: Member; card: LibraryCard | null; today: string }) {
  if (!card) return <Notice tone="warn">This member has no active library card.</Notice>;
  const expired = card.isExpiredOn(today);
  return (
    <div className={`library-card${expired ? ' library-card--void' : ''}`} aria-label="Library card">
      <div className="library-card__row">
        <span className="library-card__org">KUTUP PUBLIC LIBRARY</span>
        <span>{MEMBER_TYPE[member.type].toUpperCase()}</span>
      </div>
      <div className="library-card__number">{card.printedNumber}</div>
      <div className="library-card__row">
        <span className="library-card__name">{member.name}</span>
        <span>
          VALID TO
          <br />
          {formatDate(card.expiresOn)}
        </span>
      </div>
      {expired && <div className="library-card__void">EXPIRED</div>}
    </div>
  );
}
