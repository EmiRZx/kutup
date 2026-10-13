import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViolationCode } from '../../core/model/violations';
import { DENIAL_REASONS } from '../../game/campaign';
import { ECONOMY } from '../../game/economy';
import { CLOSING_MINUTES, type Game } from '../../game/Game';
import { RULE_NAMES } from '../../game/judge';
import { rulePages } from '../../game/rulebook';
import { lookup } from '../../game/terminal';
import type { Decision, Encounter, Verdict } from '../../game/types';
import { formatMoney } from '../format';
import { useSession } from '../state/session';
import { BookOnDesk, CardOnDesk, WallCalendar, WallClock, type StampMark } from './DeskItems';
import { Portrait } from './Portrait';
import { Terminal, type TerminalEntry } from './Terminal';

/** One real second is two minutes at the desk: a full day takes four minutes. */
const TICK_MS = 500;

function stampFor(decision: Decision): StampMark {
  switch (decision.type) {
    case 'approve':
      return { label: 'APPROVED', tone: 'ok' };
    case 'deny':
      return { label: 'DENIED', tone: 'no' };
    case 'check-in':
      return decision.condition === 'good' ? { label: 'RECEIVED', tone: 'ok' } : { label: 'DAMAGED', tone: 'no' };
  }
}

export function DeskScene({ game }: { game: Game }) {
  const session = useSession();
  const { library } = session;
  const [minutes, setMinutes] = useState(game.state.minutes);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [stamp, setStamp] = useState<StampMark | null>(null);
  const [closed, setClosed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [denying, setDenying] = useState(false);
  const [terminal, setTerminal] = useState<TerminalEntry[]>([]);
  const [showRules, setShowRules] = useState(false);
  const minutesRef = useRef(minutes);
  const started = useRef(false);

  useEffect(() => {
    minutesRef.current = minutes;
  }, [minutes]);

  const callNext = useCallback(() => {
    const next = session.act(() => game.nextEncounter(minutesRef.current));
    setVerdict(null);
    setStamp(null);
    setDenying(false);
    setTerminal([]);
    setEncounter(next ?? null);
    if (!next) setClosed(true);
  }, [game, session]);

  // The first patron walks up as soon as the doors open.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    callNext();
  }, [callNext]);

  // The clock on the wall. It stops for nobody, except a paused game or a hidden tab.
  useEffect(() => {
    if (paused || closed) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setMinutes((m) => Math.min(m + 1, CLOSING_MINUTES));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [paused, closed]);

  const decide = (decision: Decision) => {
    if (!encounter || verdict) return;
    const result = session.act(() => game.decide(encounter, decision, minutesRef.current));
    if (result) {
      setVerdict(result);
      setStamp(stampFor(decision));
      setDenying(false);
    }
  };

  const scan = (query: string) => setTerminal((t) => [...t.slice(-6), { query: query.toUpperCase(), lines: lookup(library, query) }]);

  const today = library.clock.today();
  const records = game.todaysRecords();
  const citationsToday = records.filter((r) => r.citation).length;
  const waiting = closed ? 0 : game.waiting();
  const known = game.known;
  const reasons = encounter && encounter.request !== 'return' ? DENIAL_REASONS[encounter.request].filter((c) => known.has(c)) : [];
  const closingTime = minutes >= CLOSING_MINUTES;

  return (
    <div className="desk-scene">
      {/* The hall, seen across the counter */}
      <section className="booth">
        <div className="booth__queue" aria-label={`${waiting} waiting`}>
          {Array.from({ length: Math.min(waiting, 8) }, (_, i) => (
            <span key={i} className="silhouette" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
          <div className="booth__queue-label">{closingTime && !encounter ? 'Doors locked' : `${waiting} waiting`}</div>
        </div>

        <div className="booth__window">
          {encounter && !closed ? (
            <div className={`patron${verdict ? ' patron--done' : ''}`} key={`${encounter.day}-${encounter.index}`}>
              <Portrait seed={encounter.patron.memberId} mood={verdict?.mood ?? 'neutral'} size={210} title={encounter.patron.name} />
              <div className="speech">
                <p>{verdict ? verdict.reply : encounter.greeting}</p>
                <span className="speech__request">
                  {encounter.request === 'borrow' ? 'Wants to borrow' : encounter.request === 'renew' ? 'Wants to renew' : 'Returning a book'}
                </span>
              </div>
            </div>
          ) : (
            <div className="booth__empty">{closed ? (closingTime ? 'Five o’clock. The doors are locked.' : 'That’s everyone for today.') : '…'}</div>
          )}
        </div>

        <div className="booth__wall">
          <WallClock minutes={minutes} />
          <WallCalendar date={today} day={game.state.day} />
        </div>
      </section>

      {/* The desk */}
      <section className="desk">
        <Terminal entries={terminal} onQuery={scan} />

        <div className="desk__documents">
          {encounter && !closed && (
            <>
              {encounter.card && <CardOnDesk card={encounter.card} onScan={scan} stamp={stamp && encounter.request !== 'return' ? stamp : undefined} />}
              <BookOnDesk book={encounter.book} onScan={scan} stamp={stamp && encounter.request === 'return' ? stamp : undefined} />
            </>
          )}
          {verdict?.citation && (
            <div className="citation" role="alert">
              <div className="citation__head">CITATION</div>
              <p>{verdict.citation}</p>
              <div className="citation__foot">
                {citationsToday <= ECONOMY.freeCitationsPerDay
                  ? `Warning ${citationsToday} of ${ECONOMY.freeCitationsPerDay}. No penalty.`
                  : `Penalty: ${formatMoney(ECONOMY.citationPenalty)} deducted from today's wages.`}
              </div>
            </div>
          )}
          {verdict?.warning && (
            <div className="memo-note" role="status">
              {verdict.warning}
            </div>
          )}
        </div>

        <div className="desk__tools">
          <button type="button" className="rulebook-tab" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules}>
            {showRules ? 'Close rule book' : 'Rule book'}
          </button>
          {showRules && <RuleBook game={game} />}

          <div className="stamps">
            {closed ? (
              <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => session.act(() => game.closeDay())}>
                Close up for the day
              </button>
            ) : verdict ? (
              <button type="button" className="bell" onClick={callNext} autoFocus>
                🛎 Next, please
              </button>
            ) : encounter?.request === 'return' ? (
              <>
                <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => decide({ type: 'check-in', condition: 'good' })}>
                  Received
                </button>
                <button type="button" className="rubber-stamp rubber-stamp--no" onClick={() => decide({ type: 'check-in', condition: 'damaged' })}>
                  Damaged
                </button>
              </>
            ) : encounter ? (
              denying ? (
                <div className="reasons" role="group" aria-label="Reason for refusal">
                  <div className="reasons__title">Refuse because…</div>
                  {reasons.map((code: ViolationCode) => (
                    <button key={code} type="button" className="reason" onClick={() => decide({ type: 'deny', reason: code })}>
                      {RULE_NAMES[code]}
                    </button>
                  ))}
                  <button type="button" className="reason reason--cancel" onClick={() => setDenying(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="rubber-stamp rubber-stamp--ok" onClick={() => decide({ type: 'approve' })}>
                    Approved
                  </button>
                  <button type="button" className="rubber-stamp rubber-stamp--no" onClick={() => setDenying(true)}>
                    Denied
                  </button>
                </>
              )
            ) : null}
          </div>

          <div className="desk__status">
            <span>
              Served {records.length} · Citations {citationsToday}
            </span>
            {!closed && (
              <button type="button" className="link-button" onClick={() => setPaused((p) => !p)}>
                {paused ? '▶ Resume' : '❚❚ Pause'}
              </button>
            )}
          </div>
        </div>
      </section>

      {paused && (
        <div className="pause-screen" onClick={() => setPaused(false)}>
          <div>
            <h2>Tea break</h2>
            <p>The clock is stopped. Click anywhere to get back to the desk.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleBook({ game }: { game: Game }) {
  const { library } = useSession();
  const pages = rulePages(game.known, library.policy);
  return (
    <div className="rulebook">
      <h3>Circulation rules</h3>
      <ol>
        {pages.map((p) => (
          <li key={p.code}>
            <strong>{p.name}.</strong> {p.how}
          </li>
        ))}
        <li>
          <strong>Returns.</strong> Stamp DAMAGED if a book is torn or stained. Late fines are charged automatically.
        </li>
      </ol>
    </div>
  );
}
