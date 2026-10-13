import { useEffect, useState } from 'react'
import { ManualClock } from './core/clock'
import { loadSqlJs } from './db/loadSqlJs'
import { openLibrary } from './db/openLibrary'

type Status = { state: 'loading' } | { state: 'ready'; books: number; members: number } | { state: 'error'; message: string }

// Placeholder until the admin panel and the desk scene exist: proves the core runs in the browser.
export default function App() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })

  useEffect(() => {
    loadSqlJs()
      .then((sql) => {
        const { library } = openLibrary(sql, { clock: new ManualClock('2026-03-02'), seed: true })
        setStatus({ state: 'ready', books: library.catalog.search('').length, members: library.members.search('').length })
      })
      .catch((error: unknown) => setStatus({ state: 'error', message: String(error) }))
  }, [])

  return (
    <main style={{ padding: 32, fontFamily: 'monospace' }}>
      <h1>Kutup: The Librarian's Desk</h1>
      {status.state === 'loading' && <p>Opening the library…</p>}
      {status.state === 'ready' && (
        <p data-testid="status">
          Library open: {status.books} titles, {status.members} members.
        </p>
      )}
      {status.state === 'error' && <p role="alert">Could not open the library: {status.message}</p>}
    </main>
  )
}
