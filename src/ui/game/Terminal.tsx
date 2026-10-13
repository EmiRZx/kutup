import { useEffect, useRef, useState } from 'react';
import type { TerminalLine } from '../../game/terminal';

export interface TerminalEntry {
  query: string;
  lines: TerminalLine[];
}

/** A green-screen circulation terminal. Type a query, or click a card number or barcode on the desk. */
export function Terminal({ entries, onQuery }: { entries: TerminalEntry[]; onQuery: (query: string) => void }) {
  const [input, setInput] = useState('');
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [entries]);

  return (
    <div className="terminal">
      <div className="terminal__bezel">
        <div className="terminal__screen" ref={screen} aria-live="polite">
          <div className="terminal__line terminal__line--dim">KUTUP CIRCULATION SYSTEM v2.1</div>
          <div className="terminal__line terminal__line--dim">CLICK A CARD NUMBER OR BARCODE TO SCAN IT</div>
          {entries.map((entry, i) => (
            <div key={i} className="terminal__entry">
              <div className="terminal__line">&gt; {entry.query}</div>
              {entry.lines.map((line, j) => (
                <div key={j} className={`terminal__line${line.tone ? ` terminal__line--${line.tone}` : ''}`}>
                  {line.text}
                </div>
              ))}
            </div>
          ))}
          <form
            className="terminal__prompt"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) onQuery(input);
              setInput('');
            }}
          >
            <span>&gt;</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Terminal query" spellCheck={false} autoComplete="off" />
            <span className="terminal__cursor" />
          </form>
        </div>
      </div>
      <div className="terminal__label">CIRCULATION TERMINAL</div>
    </div>
  );
}
