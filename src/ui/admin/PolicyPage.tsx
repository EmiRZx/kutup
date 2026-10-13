import { useState } from 'react';
import { LendingPolicy, type LendingPolicyProps } from '../../core/model/LendingPolicy';
import { MEMBER_TYPES } from '../../core/model/Member';
import { Button, Field, Notice, PageHeader, Panel } from '../components/ui';
import { formatMoney, MEMBER_TYPE, parseMoney } from '../format';
import { useSession } from '../state/session';

type MoneyKey = 'dailyFine' | 'maxFinePerLoan' | 'fineBlockThreshold' | 'damageFee' | 'lostFee';

const MONEY_FIELDS: { key: MoneyKey; label: string; hint: string }[] = [
  { key: 'dailyFine', label: 'Fine per day late', hint: 'Charged for each day after the due date' },
  { key: 'maxFinePerLoan', label: 'Fine cap per loan', hint: 'A single late book never costs more' },
  { key: 'fineBlockThreshold', label: 'Block borrowing at', hint: 'Members owing this much may not borrow' },
  { key: 'damageFee', label: 'Damage fee', hint: 'Charged when a book comes back damaged' },
  { key: 'lostFee', label: 'Lost book fee', hint: 'Replacement cost of a lost copy' },
];

/** The rule book, editable. Drafts are kept as text until saved, then validated by the core. */
export function PolicyPage() {
  const session = useSession();
  const current = session.library.policy;
  const [draft, setDraft] = useState(() => toDraft(current));

  const save = () => {
    const props = fromDraft(draft);
    if (typeof props === 'string') {
      session.notify('danger', props);
      return;
    }
    session.act(() => {
      session.library.policy = new LendingPolicy(props);
    }, 'Lending rules updated. They apply from the next request.');
  };

  return (
    <>
      <PageHeader
        title="Lending rules"
        subtitle="The rule book every loan is checked against: at the desk, in this office and in the game."
        actions={
          <>
            <Button onClick={() => setDraft(toDraft(LendingPolicy.defaults()))}>Load defaults</Button>
            <Button variant="primary" onClick={save}>
              Save rules
            </Button>
          </>
        }
      />

      <Panel title="By membership type">
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Membership</th>
                <th>Books at once</th>
                <th>Loan period (days)</th>
                <th>Renewals</th>
              </tr>
            </thead>
            <tbody>
              {MEMBER_TYPES.map((type) => (
                <tr key={type}>
                  <td>{MEMBER_TYPE[type]}</td>
                  {(['maxLoans', 'loanDays', 'maxRenewals'] as const).map((key) => (
                    <td key={key}>
                      <input
                        className="input"
                        style={{ maxWidth: 110 }}
                        inputMode="numeric"
                        aria-label={`${MEMBER_TYPE[type]} ${key}`}
                        value={draft.rules[type][key]}
                        onChange={(e) => setDraft((d) => ({ ...d, rules: { ...d.rules, [type]: { ...d.rules[type], [key]: e.target.value } } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid--2">
        <Panel title="Fines and fees">
          <div className="form-grid">
            {MONEY_FIELDS.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={`${hint}. Now ${formatMoney(current[key])}.`}>
                <input className="input" value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </Panel>

        <Panel title="Other rules">
          <div className="stack">
            <Field label="Hold shelf (days)" hint="How long a reserved book waits to be collected">
              <input className="input" inputMode="numeric" value={draft.holdDays} onChange={(e) => setDraft((d) => ({ ...d, holdDays: e.target.value }))} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={draft.blockWhenOverdue} onChange={(e) => setDraft((d) => ({ ...d, blockWhenOverdue: e.target.checked }))} />
              Members with overdue books may not borrow
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.referenceLoansAllowed}
                onChange={(e) => setDraft((d) => ({ ...d, referenceLoansAllowed: e.target.checked }))}
              />
              Reference-only books may be lent
            </label>
            <Notice>Changing a rule never rewrites history: existing loans keep their due dates.</Notice>
          </div>
        </Panel>
      </div>
    </>
  );
}

type Draft = {
  rules: Record<(typeof MEMBER_TYPES)[number], { maxLoans: string; loanDays: string; maxRenewals: string }>;
  holdDays: string;
  blockWhenOverdue: boolean;
  referenceLoansAllowed: boolean;
} & Record<MoneyKey, string>;

function toDraft(p: LendingPolicy): Draft {
  const rules = {} as Draft['rules'];
  for (const t of MEMBER_TYPES) {
    const r = p.rulesFor(t);
    rules[t] = { maxLoans: String(r.maxLoans), loanDays: String(r.loanDays), maxRenewals: String(r.maxRenewals) };
  }
  const money = Object.fromEntries(MONEY_FIELDS.map(({ key }) => [key, (p[key] / 100).toFixed(2)])) as Record<MoneyKey, string>;
  return { rules, holdDays: String(p.holdDays), blockWhenOverdue: p.blockWhenOverdue, referenceLoansAllowed: p.referenceLoansAllowed, ...money };
}

/** The draft as policy settings, or an error message for the first field that isn't a number. */
function fromDraft(d: Draft): LendingPolicyProps | string {
  const whole = (value: string, name: string): number | string => (/^\d+$/.test(value.trim()) ? Number(value) : `${name} must be a whole number`);
  const rules = {} as LendingPolicyProps['rules'];
  for (const t of MEMBER_TYPES) {
    const r = d.rules[t];
    const values = [whole(r.maxLoans, `${MEMBER_TYPE[t]} books at once`), whole(r.loanDays, `${MEMBER_TYPE[t]} loan period`), whole(r.maxRenewals, `${MEMBER_TYPE[t]} renewals`)];
    const error = values.find((v) => typeof v === 'string');
    if (error !== undefined) return error as string;
    const [maxLoans, loanDays, maxRenewals] = values as number[];
    rules[t] = { maxLoans: maxLoans!, loanDays: loanDays!, maxRenewals: maxRenewals! };
  }
  const money = {} as Record<MoneyKey, number>;
  for (const { key, label } of MONEY_FIELDS) {
    const cents = parseMoney(d[key]);
    if (cents === null) return `${label} must be an amount like 0.25`;
    money[key] = cents;
  }
  const holdDays = whole(d.holdDays, 'Hold shelf days');
  if (typeof holdDays === 'string') return holdDays;
  return { rules, holdDays, blockWhenOverdue: d.blockWhenOverdue, referenceLoansAllowed: d.referenceLoansAllowed, ...money };
}
