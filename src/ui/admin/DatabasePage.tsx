import { useState } from 'react';
import type { QueryResult } from '../../db/SqliteDatabase';
import { Button, Empty, Notice, PageHeader, Panel } from '../components/ui';
import { downloadFile } from '../state/persistence';
import { useSession } from '../state/session';

const EXAMPLES: { label: string; sql: string }[] = [
  {
    label: 'Overdue loans',
    sql: `SELECT m.name, b.title, l.due_on,
       julianday((SELECT today FROM calendar)) - julianday(l.due_on) AS days_late
FROM loans l
JOIN members m      ON m.id = l.member_id
JOIN book_copies c  ON c.id = l.copy_id
JOIN books b        ON b.id = c.book_id
WHERE l.returned_on IS NULL
  AND l.due_on < (SELECT today FROM calendar)
ORDER BY days_late DESC;`,
  },
  {
    label: 'Most borrowed',
    sql: `SELECT b.title, count(*) AS times_lent
FROM loans l
JOIN book_copies c ON c.id = l.copy_id
JOIN books b       ON b.id = c.book_id
GROUP BY b.id
ORDER BY times_lent DESC
LIMIT 10;`,
  },
  {
    label: 'Who owes what',
    sql: `SELECT m.name, printf('$%.2f', sum(f.amount) / 100.0) AS owes, count(*) AS fines
FROM fines f JOIN members m ON m.id = f.member_id
WHERE f.status = 'unpaid'
GROUP BY m.id
ORDER BY sum(f.amount) DESC;`,
  },
  {
    label: 'Loans per genre',
    sql: `SELECT b.genre, count(*) AS loans
FROM loans l
JOIN book_copies c ON c.id = l.copy_id
JOIN books b       ON b.id = c.book_id
GROUP BY b.genre
ORDER BY loans DESC;`,
  },
  {
    label: 'Librarian overrides',
    sql: `SELECT l.id AS loan, m.name, o.violation_code, l.override_note
FROM loan_overrides o
JOIN loans l   ON l.id = o.loan_id
JOIN members m ON m.id = l.member_id;`,
  },
];

export function DatabasePage() {
  const { db, revision } = useSession();
  const [sql, setSql] = useState(EXAMPLES[0]!.sql);
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  void revision; // re-render (and re-count rows) after every change

  const run = (text: string) => {
    setSql(text);
    try {
      setResults(db.queryReadOnly(text));
      setError(null);
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tables = db.tables();
  const schema = db.all<{ sql: string }>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name");

  return (
    <>
      <PageHeader
        title="Database"
        subtitle="The whole library is one SQLite file, running in your browser. Look inside."
        actions={
          <>
            <Button onClick={() => setShowSchema((s) => !s)}>{showSchema ? 'Hide schema' : 'Show schema'}</Button>
            <Button variant="primary" onClick={() => downloadFile(db.export(), 'kutup.sqlite')}>
              Download kutup.sqlite
            </Button>
          </>
        }
      />

      {showSchema && (
        <Panel title="Schema" aside="CREATE statements, exactly as stored">
          <pre className="schema">{schema.map((s) => `${s.sql};`).join('\n\n')}</pre>
        </Panel>
      )}

      <div className="grid grid--sidebar">
        <Panel title="Tables" aside={`${tables.length} tables`}>
          <ul className="table-list">
            {tables.map((t) => (
              <li key={t.name}>
                <button type="button" onClick={() => run(`SELECT * FROM ${t.name} LIMIT 100;`)}>
                  <span className="mono">{t.name}</span>
                  <span className="muted">{t.rows}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="SQL console" aside="Read-only: nothing typed here can change the library">
          <div className="stack">
            <div className="btn-row">
              {EXAMPLES.map((ex) => (
                <Button key={ex.label} size="sm" variant="ghost" onClick={() => run(ex.sql)}>
                  {ex.label}
                </Button>
              ))}
            </div>
            <textarea
              className="textarea"
              value={sql}
              spellCheck={false}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(sql);
              }}
              aria-label="SQL query"
            />
            <div className="btn-row">
              <Button variant="primary" onClick={() => run(sql)}>
                Run query
              </Button>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Ctrl + Enter
              </span>
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            {results && results.length === 0 && <Empty>The query ran and returned no rows.</Empty>}
            {results?.map((r, i) => (
              <div key={i} className="table-wrap sql-result">
                <table className="ledger mono">
                  <thead>
                    <tr>
                      {r.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k} className={typeof cell === 'number' ? 'num' : undefined}>
                            {cell === null ? <span className="muted">NULL</span> : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  {r.rows.length} rows
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
