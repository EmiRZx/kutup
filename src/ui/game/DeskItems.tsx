import type { IsoDate } from '../../core/dates';
import { formatCardNumber } from '../../core/identifiers';
import type { DeskBook, DeskCard } from '../../game/types';
import { terminalDate } from '../../game/terminal';
import { Portrait } from './Portrait';

const COVERS = ['#7a3f3f', '#2f5d50', '#2f5873', '#6d4a7a', '#8a6a2a', '#3d3d5c', '#5b4c3a', '#7a5a3a', '#335c3d'];

export function CardOnDesk({ card, onScan, stamp }: { card: DeskCard; onScan: (number: string) => void; stamp?: StampMark }) {
  return (
    <div className="desk-card" aria-label="Library card">
      <div className="desk-card__head">
        <span>KUTUP PUBLIC LIBRARY</span>
        <span>{card.memberType.toUpperCase()}</span>
      </div>
      <div className="desk-card__stripe" />
      <div className="desk-card__body">
        <div className="desk-card__photo">
          <Portrait seed={card.photoSeed} size={76} title="Card photo" />
        </div>
        <div className="desk-card__fields">
          <div className="desk-card__name">{card.name}</div>
          <button type="button" className="desk-card__number" onClick={() => onScan(card.number)} title="Scan the card number">
            {formatCardNumber(card.number)}
          </button>
          <div className="desk-card__valid">
            VALID TO <strong>{terminalDate(card.expiresOn)}</strong>
          </div>
        </div>
      </div>
      {stamp && <Stamp {...stamp} />}
    </div>
  );
}

export function BookOnDesk({ book, onScan, stamp }: { book: DeskBook; onScan: (barcode: string) => void; stamp?: StampMark }) {
  const cover = COVERS[book.coverSeed % COVERS.length];
  return (
    <div className={`desk-book${book.damaged ? ' desk-book--damaged' : ''}`} style={{ ['--cover' as string]: cover }} aria-label="Book">
      {book.holdSlip && (
        <div className="hold-slip" title="Hold slip">
          <span>HOLD</span>
          <strong>{book.holdSlip}</strong>
        </div>
      )}
      <div className="desk-book__cover">
        <div className="desk-book__title">{book.title}</div>
        <div className="desk-book__author">{book.author}</div>
        {book.referenceOnly && <div className="ref-sticker">REFERENCE</div>}
        <button type="button" className="barcode" onClick={() => onScan(book.barcode)} title="Scan the barcode">
          <span className="barcode__bars" style={{ backgroundImage: barsFor(book.barcode) }} />
          <span className="barcode__text">{book.barcode}</span>
        </button>
        {book.damaged && (
          <>
            <span className="damage damage--ring" />
            <span className="damage damage--tear" />
            <span className="damage damage--water" />
          </>
        )}
      </div>
      {stamp && <Stamp {...stamp} />}
    </div>
  );
}

/** Fake but stable barcode stripes, derived from the barcode text. */
function barsFor(code: string): string {
  const stops: string[] = [];
  let x = 0;
  for (const ch of code.repeat(2)) {
    const w = (ch.charCodeAt(0) % 3) + 1;
    stops.push(`#1d1712 ${x}px ${x + w}px`, `transparent ${x + w}px ${x + w + ((ch.charCodeAt(0) >> 2) % 2) + 1}px`);
    x += w + ((ch.charCodeAt(0) >> 2) % 2) + 1;
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export interface StampMark {
  label: string;
  tone: 'ok' | 'no';
}

export function Stamp({ label, tone }: StampMark) {
  return <div className={`stamp-mark stamp-mark--${tone}`}>{label}</div>;
}

export function WallClock({ minutes }: { minutes: number }) {
  const total = 9 * 60 + minutes;
  const hour = ((total / 60) % 12) * 30;
  const minute = (total % 60) * 6;
  const label = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return (
    <div className="wall-clock" aria-label={`Time ${label}`}>
      <svg viewBox="0 0 100 100" width={86} height={86}>
        <circle cx={50} cy={50} r={46} fill="#fbf6ea" stroke="#2a2118" strokeWidth={4} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={50} y1={8} x2={50} y2={i % 3 === 0 ? 16 : 12} stroke="#2a2118" strokeWidth={i % 3 === 0 ? 3 : 1.5} transform={`rotate(${i * 30} 50 50)`} />
        ))}
        <line x1={50} y1={50} x2={50} y2={28} stroke="#2a2118" strokeWidth={4} strokeLinecap="round" transform={`rotate(${hour} 50 50)`} />
        <line x1={50} y1={50} x2={50} y2={16} stroke="#9e3328" strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${minute} 50 50)`} />
        <circle cx={50} cy={50} r={3.5} fill="#2a2118" />
      </svg>
      <div className="wall-clock__digital">{label}</div>
    </div>
  );
}

export function WallCalendar({ date, day }: { date: IsoDate; day: number }) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <div className="wall-calendar" aria-label={`Today is ${terminalDate(date)}`}>
      <div className="wall-calendar__month">{d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}</div>
      <div className="wall-calendar__day">{d.getUTCDate()}</div>
      <div className="wall-calendar__weekday">{d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}</div>
      <div className="wall-calendar__shift">Day {day}</div>
    </div>
  );
}
