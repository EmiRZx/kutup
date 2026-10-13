import type { Bulletin, CareerState, CareerStatus, DayRecord, EncounterRecord, GameStore, RequestType, ScenarioKind } from '../../game/types';
import type { SqliteDatabase } from '../SqliteDatabase';

type CareerRow = {
  day: number;
  savings: number;
  status: string;
  seed: number;
  minutes: number;
  endless: number;
  bulletin: string;
};
type EncounterRow = {
  day: number;
  position: number;
  kind: string;
  request: string;
  member_id: number;
  barcode: string;
  card_number: string | null;
  decision: string;
  reason: string | null;
  correct: number;
  citation: string | null;
  warning: string | null;
};
type DayRow = {
  day: number;
  date: string;
  served: number;
  correct: number;
  citations: number;
  wages: number;
  penalties: number;
  expenses: number;
  savings_after: number;
};

const toEncounter = (r: EncounterRow): EncounterRecord => ({
  day: r.day,
  index: r.position,
  kind: r.kind as ScenarioKind,
  request: r.request as RequestType,
  memberId: r.member_id,
  barcode: r.barcode,
  cardNumber: r.card_number,
  decision: r.decision as EncounterRecord['decision'],
  reason: r.reason,
  correct: r.correct === 1,
  citation: r.citation,
  warning: r.warning,
});

const toDay = (r: DayRow): DayRecord => ({
  day: r.day,
  date: r.date,
  served: r.served,
  correct: r.correct,
  citations: r.citations,
  wages: r.wages,
  penalties: r.penalties,
  expenses: r.expenses,
  savingsAfter: r.savings_after,
});

/** The desk game's career, kept in the same SQLite file as the library it runs on. */
export class SqliteGameStore implements GameStore {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  load(): CareerState | null {
    const row = this.db.get<CareerRow>('SELECT * FROM game_career WHERE id = 1');
    if (!row) return null;
    return {
      day: row.day,
      savings: row.savings,
      status: row.status as CareerStatus,
      seed: row.seed,
      minutes: row.minutes,
      endless: row.endless === 1,
      bulletin: JSON.parse(row.bulletin) as Bulletin,
    };
  }

  save(state: CareerState): void {
    this.db.run(
      `INSERT INTO game_career (id, day, savings, status, seed, minutes, endless, bulletin)
       VALUES (1, $day, $savings, $status, $seed, $minutes, $endless, $bulletin)
       ON CONFLICT (id) DO UPDATE SET day = $day, savings = $savings, status = $status, seed = $seed,
         minutes = $minutes, endless = $endless, bulletin = $bulletin`,
      { ...state, bulletin: JSON.stringify(state.bulletin) },
    );
  }

  addEncounter(r: EncounterRecord): void {
    this.db.run(
      `INSERT INTO game_encounters
         (day, position, kind, request, member_id, barcode, card_number, decision, reason, correct, citation, warning)
       VALUES ($day, $index, $kind, $request, $memberId, $barcode, $cardNumber, $decision, $reason, $correct, $citation, $warning)`,
      { ...r },
    );
  }

  encounters(day: number): EncounterRecord[] {
    return this.db.all<EncounterRow>('SELECT * FROM game_encounters WHERE day = $day ORDER BY position', { day }).map(toEncounter);
  }

  allEncounters(): EncounterRecord[] {
    return this.db.all<EncounterRow>('SELECT * FROM game_encounters ORDER BY day, position').map(toEncounter);
  }

  addDay(r: DayRecord): void {
    this.db.run(
      `INSERT INTO game_days (day, date, served, correct, citations, wages, penalties, expenses, savings_after)
       VALUES ($day, $date, $served, $correct, $citations, $wages, $penalties, $expenses, $savingsAfter)`,
      { ...r },
    );
  }

  days(): DayRecord[] {
    return this.db.all<DayRow>('SELECT * FROM game_days ORDER BY day').map(toDay);
  }

  clear(): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM game_encounters');
      this.db.run('DELETE FROM game_days');
      this.db.run('DELETE FROM game_career');
    });
  }
}
