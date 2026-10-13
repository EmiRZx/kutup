import { useState } from 'react';
import { MEMBER_TYPES, type MemberType } from '../../core/model/Member';
import { Badge, Button, Empty, Field, PageHeader, Panel } from '../components/ui';
import { formatCardNumber, formatMoney, MEMBER_TYPE } from '../format';
import { Link, navigate } from '../state/router';
import { useSession } from '../state/session';

export function MembersPage() {
  const { library, clock } = useSession();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const members = library.members.search(query);
  const today = clock.today();

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Everyone holding a Kutup library card."
        actions={
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close form' : 'Register a member'}
          </Button>
        }
      />

      {adding && <RegisterForm />}

      <Panel>
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <Field label="Search">
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, e-mail or member number" />
          </Field>
        </div>
        {members.length === 0 ? (
          <Empty>No member by that name.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Card</th>
                  <th className="num">Loans</th>
                  <th className="num">Owes</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const card = library.store.cards.findActiveByMember(m.id);
                  const loans = library.store.loans.findActiveByMember(m.id);
                  const overdue = loans.filter((l) => l.isOverdueOn(today)).length;
                  const balance = library.fines.balance(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="num muted">{m.id}</td>
                      <td>
                        <Link to={`/admin/members/${m.id}`}>{m.name}</Link> {!m.isActive && <Badge tone="danger">Suspended</Badge>}
                      </td>
                      <td>{MEMBER_TYPE[m.type]}</td>
                      <td className="mono">
                        {card ? formatCardNumber(card.number) : '—'}{' '}
                        {card?.isExpiredOn(today) && <Badge tone="warn">Expired</Badge>}
                      </td>
                      <td className="num">
                        {loans.length} {overdue > 0 && <Badge tone="danger">{overdue} late</Badge>}
                      </td>
                      <td className="num">{balance > 0 ? formatMoney(balance) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function RegisterForm() {
  const session = useSession();
  const [name, setName] = useState('');
  const [type, setType] = useState<MemberType>('student');
  const [email, setEmail] = useState('');

  return (
    <Panel title="New member" aside="A card is issued automatically">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const result = session.act(
            () => session.library.members.register({ name, type, email }),
            (r) => `Welcome, ${r.member.name}. Card ${r.card.printedNumber} issued.`,
          );
          if (result) navigate(`/admin/members/${result.member.id}`);
        }}
      >
        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Membership">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as MemberType)}>
            {MEMBER_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEMBER_TYPE[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="E-mail" hint="Optional">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="btn-row">
          <Button type="submit" variant="primary">
            Register
          </Button>
        </div>
      </form>
    </Panel>
  );
}
