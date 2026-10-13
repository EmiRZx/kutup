import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SqlJsStatic } from 'sql.js';
import type { ManualClock } from '../../core/clock';
import { toIsoDate } from '../../core/dates';
import { LibraryError, PolicyViolationError } from '../../core/errors';
import type { Library } from '../../core/Library';
import { openLibrary } from '../../db/openLibrary';
import type { SqliteDatabase } from '../../db/SqliteDatabase';
import { forgetSavedLibrary, loadSavedLibrary, saveLibrary } from './persistence';

export type Tone = 'ok' | 'danger' | 'info';

export interface Toast {
  id: number;
  tone: Tone;
  title: string;
  lines?: string[];
}

export interface Opened {
  library: Library;
  db: SqliteDatabase;
  clock: ManualClock;
}

export interface Session extends Opened {
  /** Increments after every change, so anything reading the library re-renders. */
  revision: number;
  /**
   * Runs a change against the library. Expected refusals (a broken rule, an
   * invalid input) become a toast instead of a crash; returns undefined then.
   */
  act<T>(change: () => T, success?: string | ((result: T) => string)): T | undefined;
  notify(tone: Tone, title: string, lines?: string[]): void;
  /**
   * Swaps in a different library: an uploaded save file, or a fresh sample.
   * `prepare` runs on the new library before it is saved and shown.
   */
  replace(bytes: Uint8Array | 'sample', prepare?: (opened: Opened) => void): boolean;
  toasts: Toast[];
  dismiss(id: number): void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

const SAMPLE_DAYS = 30;

function openSample(sql: SqlJsStatic): Opened {
  return openLibrary(sql, { seed: true, sampleActivityDays: SAMPLE_DAYS, startDate: toIsoDate(new Date()) }) as Opened;
}

/** Opens the library saved in this browser, or a fresh sample one. */
export async function bootLibrary(sql: SqlJsStatic): Promise<{ opened: Opened; restored: boolean; warning?: string }> {
  const saved = await loadSavedLibrary();
  if (saved) {
    try {
      return { opened: openLibrary(sql, { bytes: saved }) as Opened, restored: true };
    } catch (error) {
      return { opened: openSample(sql), restored: false, warning: `The saved library could not be opened (${String(error)}), so a fresh one was created.` };
    }
  }
  return { opened: openSample(sql), restored: false };
}

export function describeError(error: unknown): { title: string; lines?: string[] } {
  if (error instanceof PolicyViolationError) {
    return { title: 'Refused by library rules', lines: error.violations.map((v) => v.message) };
  }
  if (error instanceof LibraryError) return { title: error.message };
  return { title: 'Something went wrong', lines: [String(error)] };
}

export function SessionProvider({ sql, initial, children }: { sql: SqlJsStatic; initial: Opened; children: ReactNode }) {
  const [opened, setOpened] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToast = useRef(1);
  const saveTimer = useRef<number | undefined>(undefined);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (tone: Tone, title: string, lines?: string[]) => {
      const id = nextToast.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, title, lines }]);
      window.setTimeout(() => dismiss(id), tone === 'danger' ? 7000 : 3500);
    },
    [dismiss],
  );

  const persistSoon = useCallback((db: SqliteDatabase) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveLibrary(db.export()), 250);
  }, []);

  const act = useCallback(
    <T,>(change: () => T, success?: string | ((result: T) => string)): T | undefined => {
      try {
        const result = change();
        setRevision((r) => r + 1);
        persistSoon(opened.db);
        if (success) notify('ok', typeof success === 'function' ? success(result) : success);
        return result;
      } catch (error) {
        if (!(error instanceof LibraryError)) console.error(error);
        const { title, lines } = describeError(error);
        notify('danger', title, lines);
        return undefined;
      }
    },
    [opened.db, notify, persistSoon],
  );

  const replace = useCallback(
    (source: Uint8Array | 'sample', prepare?: (opened: Opened) => void) => {
      try {
        const next = source === 'sample' ? openSample(sql) : (openLibrary(sql, { bytes: source }) as Opened);
        prepare?.(next);
        opened.db.close();
        setOpened(next);
        setRevision((r) => r + 1);
        if (source === 'sample') void forgetSavedLibrary().then(() => saveLibrary(next.db.export()));
        else void saveLibrary(next.db.export());
        if (!prepare) notify('ok', source === 'sample' ? 'A fresh sample library is ready' : 'Library file loaded');
        return true;
      } catch (error) {
        notify('danger', 'That file could not be opened as a Kutup library', [String(error)]);
        return false;
      }
    },
    [sql, opened.db, notify],
  );

  // Save once on first load, so a brand-new sample survives a reload.
  useEffect(() => {
    persistSoon(opened.db);
  }, [opened.db, persistSoon]);

  const value = useMemo<Session>(
    () => ({ ...opened, revision, act, notify, replace, toasts, dismiss }),
    [opened, revision, act, notify, replace, toasts, dismiss],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
