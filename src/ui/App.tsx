import { useEffect, useState } from 'react';
import type { SqlJsStatic } from 'sql.js';
import { loadSqlJs } from '../db/loadSqlJs';
import { AdminLayout } from './admin/AdminLayout';
import { BookPage } from './admin/BookPage';
import { CatalogPage } from './admin/CatalogPage';
import { CirculationPage } from './admin/CirculationPage';
import { DashboardPage } from './admin/DashboardPage';
import { DatabasePage } from './admin/DatabasePage';
import { MemberPage } from './admin/MemberPage';
import { MembersPage } from './admin/MembersPage';
import { PolicyPage } from './admin/PolicyPage';
import { ReservationsPage } from './admin/ReservationsPage';
import { Toasts } from './components/ui';
import { Home } from './Home';
import { useRoute } from './state/router';
import { bootLibrary, SessionProvider, useSession } from './state/session';

type Boot =
  | { state: 'loading' }
  | { state: 'ready'; sql: SqlJsStatic; initial: Awaited<ReturnType<typeof bootLibrary>> }
  | { state: 'failed'; message: string };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadSqlJs()
      .then(async (sql) => {
        const initial = await bootLibrary(sql);
        if (!cancelled) setBoot({ state: 'ready', sql, initial });
      })
      .catch((error: unknown) => !cancelled && setBoot({ state: 'failed', message: String(error) }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.state === 'loading') return <div className="boot">Unlocking the library…</div>;
  if (boot.state === 'failed') return <div className="boot">The library could not open: {boot.message}</div>;

  return (
    <SessionProvider sql={boot.sql} initial={boot.initial.opened}>
      <BootNotice warning={boot.initial.warning} />
      <Routes />
      <Toasts />
    </SessionProvider>
  );
}

function BootNotice({ warning }: { warning?: string }) {
  const { notify } = useSession();
  useEffect(() => {
    if (warning) notify('danger', warning);
  }, [warning, notify]);
  return null;
}

function Routes() {
  const { segments } = useRoute();
  const [area, section = '', id] = segments;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [area, section, id]);

  if (area !== 'admin') return <Home />;

  const numericId = id !== undefined ? Number(id) : NaN;
  let page;
  switch (section) {
    case 'circulation':
      page = <CirculationPage />;
      break;
    case 'catalog':
      page = Number.isInteger(numericId) ? <BookPage bookId={numericId} /> : <CatalogPage />;
      break;
    case 'members':
      page = Number.isInteger(numericId) ? <MemberPage memberId={numericId} /> : <MembersPage />;
      break;
    case 'reservations':
      page = <ReservationsPage />;
      break;
    case 'policy':
      page = <PolicyPage />;
      break;
    case 'database':
      page = <DatabasePage />;
      break;
    default:
      page = <DashboardPage />;
  }
  return <AdminLayout section={section}>{page}</AdminLayout>;
}
