import type { EncounterRecord } from './types';

/** All amounts in cents, like the rest of the library. */
export const ECONOMY = {
  startingSavings: 2000,
  wagePerPatron: 300,
  /** The first citation each day is just a warning. */
  freeCitationsPerDay: 1,
  citationPenalty: 500,
  /** The bills, and the day each one starts arriving. */
  expenses: [
    { label: 'Rent', amount: 1400, from: 1 },
    { label: 'Lunch and bus fare', amount: 500, from: 1 },
    { label: 'Heating', amount: 400, from: 3 },
    { label: 'Night-school fees', amount: 600, from: 5 },
  ],
  /** Sink below this and the director lets you go. */
  firedBelow: -2500,
} as const;

export interface DayLedger {
  served: number;
  correct: number;
  citations: number;
  wages: number;
  penalties: number;
  expenses: number;
  net: number;
}

/** Tonight's bills. */
export function expensesFor(day: number): { label: string; amount: number }[] {
  return ECONOMY.expenses.filter((e) => day >= e.from);
}

export function ledgerFor(records: readonly EncounterRecord[], day: number): DayLedger {
  const correct = records.filter((r) => r.correct).length;
  const citations = records.filter((r) => r.citation).length;
  const wages = correct * ECONOMY.wagePerPatron;
  const penalties = Math.max(0, citations - ECONOMY.freeCitationsPerDay) * ECONOMY.citationPenalty;
  const expenses = expensesFor(day).reduce((sum, e) => sum + e.amount, 0);
  return { served: records.length, correct, citations, wages, penalties, expenses, net: wages - penalties - expenses };
}

export interface Review {
  accuracy: number;
  title: string;
  remark: string;
}

/** The director's verdict at the end of the campaign. */
export function reviewFor(records: readonly EncounterRecord[]): Review {
  const accuracy = records.length === 0 ? 0 : records.filter((r) => r.correct).length / records.length;
  const [title, remark] =
    accuracy >= 0.95
      ? ['Head Librarian', 'Not a single forged card got past you. The auditors asked who trained you.']
      : accuracy >= 0.85
        ? ['Senior Circulation Clerk', 'Reliable, sharp and fair. The regulars ask for you by name.']
        : accuracy >= 0.7
          ? ['Circulation Clerk', 'A solid week, with a few books walking out that shouldn’t have.']
          : accuracy >= 0.5
            ? ['Shelver (probation)', 'Perhaps the stacks are a better fit than the desk for now.']
            : ['Volunteer', 'The director has suggested you read the rule book. All of it.'];
  return { accuracy, title, remark };
}
