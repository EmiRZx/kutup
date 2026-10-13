import { useState } from 'react';
import { daysBetween } from '../../core/dates';
import type { CopyCondition } from '../../core/model/BookCopy';
import { COPY_CONDITIONS } from '../../core/model/BookCopy';
import { FineService } from '../../core/services/FineService';
import type { ReturnReceipt } from '../../core/services/LendingService';
import { Badge, Button, Field, Notice, PageHeader, Panel, ViolationList } from '../components/ui';
import { COPY_STATUS, FINE_REASON, formatDate, formatMoney, plural } from '../format';
import { Link, useRoute } from '../state/router';
import { useSession } from '../state/session';
import { MemberSelect } from './pickers';

export function CirculationPage() {
  const { query } = useRoute();
  return (
    <>
      <PageHeader title="Circulation desk" subtitle="Scan a card and a book. The rules are checked as you type." />
      <div className="grid grid--2">
        {/* Keyed by the card in the URL, so "Lend a book" from a member's page always starts fresh. */}
        <CheckOutPanel key={query.get('card') ?? ''} initialCard={query.get('card') ?? ''} />
        <CheckInPanel />
      </div>
    </>
  );
}

function CheckOutPanel({ initialCard }: { initialCard: string }) {
  const session = useSession();
  const { library } = session;
  const [card, setCard] = useState(initialCard);
  const [barcode, setBarcode] = useState('');
  const [claimedMemberId, setClaimedMemberId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const cardNumber = card.replace(/\s/g, '');
  const holder = cardNumber.length >= 8 ? library.members.findByCardNumber(cardNumber) : null;
  // The card says who it belongs to; if it is unknown, the librarian says who is asking.
  const memberId = holder?.member.id ?? claimedMemberId;
  const copy = barcode.trim() ? library.store.copies.findByBarcode(barcode.trim().toUpperCase()) : null;
  const book = copy && library.store.books.findById(copy.bookId);
  const check = memberId !== null && copy ? library.lending.checkCheckout({ memberId, cardNumber, barcode: copy.barcode }) : null;

  const reset = () => {
    setBarcode('');
    setNote('');
  };

  const lend = (withOverride: boolean) => {
    if (!check) return;
    const loan = session.act(
      () =>
        library.lending.checkout(
          { memberId: check.member.id, cardNumber, barcode: check.copy.barcode },
          withOverride ? { note } : undefined,
        ),
      (l) => `Lent to ${check.member.name}. Due back ${formatDate(l.dueOn)}.`,
    );
    if (loan) reset();
  };

  return (
    <Panel title="Check out" aside="Lend a book">
      <div className="stack">
        <Field label="Library card number" hint="8 digits, as printed on the card">
          <input className="input input--big mono" value={card} onChange={(e) => setCard(e.target.value)} placeholder="0000 0000" autoComplete="off" />
        </Field>
        <div className="lookup">
          {cardNumber.length >= 8 &&
            (holder ? (
              <>
                Card of <Link to={`/admin/members/${holder.member.id}`}>{holder.member.name}</Link>{' '}
                <Badge tone={holder.card.status === 'active' ? 'ok' : 'danger'}>{holder.card.status}</Badge>
              </>
            ) : (
              <span style={{ color: 'var(--red)' }}>No such card. Who is asking?</span>
            ))}
        </div>
        {cardNumber.length >= 8 && !holder && (
          <Field label="Patron claims to be">
            <MemberSelect value={claimedMemberId} onChange={setClaimedMemberId} />
          </Field>
        )}

        <Field label="Book barcode" hint="e.g. B00001-01, found on the copy's spine">
          <input className="input input--big mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="B00000-00" autoComplete="off" />
        </Field>
        <div className="lookup">
          {barcode.trim() &&
            (copy && book ? (
              <>
                <span className="book-title">{book.title}</span> <Badge tone={COPY_STATUS[copy.status].tone}>{COPY_STATUS[copy.status].label}</Badge>
              </>
            ) : (
              <span style={{ color: 'var(--red)' }}>No copy with that barcode.</span>
            ))}
        </div>

        {check &&
          (check.allowed ? (
            <Notice tone="ok">
              All clear. {check.member.name} may borrow this copy until{' '}
              <strong>{formatDate(check.dueOn)}</strong>.
            </Notice>
          ) : (
            <Notice tone={check.overridable ? 'warn' : 'danger'}>
              <strong>{check.overridable ? 'Against the rules.' : 'Impossible.'}</strong>
              <ViolationList violations={check.violations} />
            </Notice>
          ))}

        {check && !check.allowed && check.overridable && (
          <Field label="Override reason" hint="Required. Kept on the loan record for the auditors.">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Card renewal in progress" />
          </Field>
        )}

        <div className="btn-row">
          {check?.allowed !== false ? (
            <Button variant="primary" disabled={!check} onClick={() => lend(false)}>
              Lend
            </Button>
          ) : (
            <Button variant="danger" disabled={!check.overridable || !note.trim()} onClick={() => lend(true)}>
              Override and lend
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CheckInPanel() {
  const session = useSession();
  const { library, clock } = session;
  const [barcode, setBarcode] = useState('');
  const [condition, setCondition] = useState<CopyCondition>('good');
  const [receipt, setReceipt] = useState<ReturnReceipt | null>(null);

  const copy = barcode.trim() ? library.store.copies.findByBarcode(barcode.trim().toUpperCase()) : null;
  const loan = copy && library.store.loans.findActiveByCopy(copy.id);
  const borrower = loan && library.store.members.findById(loan.memberId);
  const book = copy && library.store.books.findById(copy.bookId);
  const today = clock.today();
  const lateFine = loan ? FineService.overdueAmount(loan, today, library.policy) : 0;

  const checkIn = () => {
    if (!copy) return;
    const result = session.act(() => library.lending.returnCopy(copy.barcode, condition), 'Checked in');
    if (result) {
      setReceipt(result);
      setBarcode('');
      setCondition('good');
    }
  };

  return (
    <Panel title="Check in" aside="Take a book back">
      <div className="stack">
        <Field label="Book barcode">
          <input
            className="input input--big mono"
            value={barcode}
            onChange={(e) => {
              setBarcode(e.target.value);
              setReceipt(null);
            }}
            placeholder="B00000-00"
            autoComplete="off"
          />
        </Field>
        <div className="lookup">
          {barcode.trim() &&
            (!copy ? (
              <span style={{ color: 'var(--red)' }}>No copy with that barcode.</span>
            ) : !loan ? (
              <>
                <span className="book-title">{book?.title}</span> is not on loan{' '}
                <Badge tone={COPY_STATUS[copy.status].tone}>{COPY_STATUS[copy.status].label}</Badge>
              </>
            ) : (
              <>
                <span className="book-title">{book?.title}</span>, borrowed by{' '}
                <Link to={`/admin/members/${borrower?.id}`}>{borrower?.name}</Link>, due {formatDate(loan.dueOn)}{' '}
                {loan.isOverdueOn(today) ? (
                  <Badge tone="danger">{plural(daysBetween(loan.dueOn, today), 'day')} late · {formatMoney(lateFine)}</Badge>
                ) : (
                  <Badge tone="ok">on time</Badge>
                )}
              </>
            ))}
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 6 }}>
            Condition on return
          </legend>
          <div className="radio-row">
            {COPY_CONDITIONS.map((c) => (
              <label key={c} className="check">
                <input type="radio" name="condition" checked={condition === c} onChange={() => setCondition(c)} />
                {c}
                {c === 'damaged' && <span className="muted">(+{formatMoney(library.policy.damageFee)}, sent to repair)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="btn-row">
          <Button variant="primary" disabled={!loan} onClick={checkIn}>
            Check in
          </Button>
        </div>

        {receipt && (
          <div className="receipt">
            <strong className="book-title">{receipt.book.title}</strong> ({receipt.copy.barcode}) is back.
            <br />
            {receipt.daysLate > 0 ? `${plural(receipt.daysLate, 'day')} late.` : 'Returned on time.'}
            {receipt.fines.map((f) => (
              <div key={f.id}>
                Charged: {FINE_REASON[f.reason]} — <strong>{formatMoney(f.amount)}</strong>
              </div>
            ))}
            {receipt.heldFor ? (
              <div>
                <Badge tone="warn">Hold shelf</Badge> Reserved by{' '}
                {library.store.members.findById(receipt.heldFor.memberId)?.name}; keep until {formatDate(receipt.heldFor.holdUntil)}.
              </div>
            ) : (
              <div>
                <Badge tone={COPY_STATUS[receipt.copy.status].tone}>{COPY_STATUS[receipt.copy.status].label}</Badge>{' '}
                {receipt.copy.status === 'available' ? 'Re-shelve it.' : 'Send it to the bindery.'}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
