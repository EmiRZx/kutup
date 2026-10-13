import { daysBetween, type IsoDate } from '../core/dates';
import { formatCardNumber } from '../core/identifiers';
import type { CopyStatus } from '../core/model/BookCopy';
import type { FineReason, FineStatus } from '../core/model/Fine';
import type { MemberType } from '../core/model/Member';
import type { ReservationStatus } from '../core/model/Reservation';

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

/** 1250 → "$12.50". The core counts cents; only the UI ever sees dollars. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Dollar input ("12.5") → cents (1250); null when it isn't a valid amount. */
export function parseMoney(input: string): number | null {
  const clean = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

function asUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "2 Mar 2026" */
export function formatDate(date: IsoDate | null): string {
  if (!date) return '—';
  return asUtc(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "Monday, 2 March 2026" */
export function formatLongDate(date: IsoDate): string {
  return asUtc(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "today", "in 3 days", "2 days ago" */
export function relativeDays(date: IsoDate, today: IsoDate): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function formatIsbn(isbn: string): string {
  return isbn.length === 13 ? `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}` : isbn;
}

export { formatCardNumber };

export const COPY_STATUS: Record<CopyStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'On shelf', tone: 'ok' },
  on_loan: { label: 'On loan', tone: 'info' },
  on_hold: { label: 'On hold', tone: 'warn' },
  in_repair: { label: 'In repair', tone: 'muted' },
  lost: { label: 'Lost', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
};

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: BadgeTone }> = {
  waiting: { label: 'Waiting', tone: 'info' },
  ready: { label: 'Ready', tone: 'ok' },
  fulfilled: { label: 'Collected', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  expired: { label: 'Expired', tone: 'danger' },
};

export const FINE_STATUS: Record<FineStatus, { label: string; tone: BadgeTone }> = {
  unpaid: { label: 'Unpaid', tone: 'danger' },
  paid: { label: 'Paid', tone: 'ok' },
  waived: { label: 'Waived', tone: 'muted' },
};

export const FINE_REASON: Record<FineReason, string> = {
  overdue: 'Late return',
  damage: 'Damage',
  lost: 'Lost item',
};

export const MEMBER_TYPE: Record<MemberType, string> = {
  student: 'Student',
  staff: 'Staff',
  guest: 'Guest',
};

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
