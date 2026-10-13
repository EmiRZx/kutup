# Kutup: The Librarian's Desk

A library management system disguised as a game.

Underneath is a complete, conventional library system: catalog, members, cards,
loans, reservations and fines, stored in a real SQLite database. On top of it
sits a *Papers, Please*-style desk game in which you are the librarian. Patrons
walk up with a card and a book, and you stamp **APPROVED** or **DENIED**. The
library core acts as the referee: it checks every decision you make against
the same rules the admin panel enforces.

> 🚧 Work in progress. The core, the database and the back office are done;
> the desk game is next.

## The back office

A complete library administration app on top of the same core:

- **Dashboard**: collection figures, overdue loans with accrued fines, the hold shelf, most borrowed titles.
- **Circulation desk**: type a card number and a barcode and every lending rule is checked as you type. Librarians
  can override soft rules with a written reason, which is kept on the loan record.
- **Catalog** and **Members**: add titles and copies, register members, manage cards, renewals, fines and reservations.
- **Lending rules**: edit the policy; changes apply to the next request.
- **Database**: browse every table, read the schema, and run read-only SQL against the live library.
- **Calendar**: the library runs on its own calendar. *Next day* advances it, so loans fall due and holds expire.

The library is saved in the browser automatically, and can be downloaded as (or opened from) a `.sqlite` file.

## Architecture

```
src/core/   Domain model and services in pure TypeScript (no UI, no database)
  model/      Book, BookCopy, Author, Member, LibraryCard, Loan, Reservation, Fine, LendingPolicy
  services/   CatalogService, MemberService, LendingService, ReservationService, FineService
  Library.ts  Facade that wires the services together
src/db/     SQLite (sql.js / WebAssembly) implementation of the core's repository interfaces
src/ui/     React app: title screen and back office (hash routing, no UI framework)
src/game/   The desk game (planned)
tests/      Vitest suites for the core and the database
scripts/    Browser end-to-end test and screenshot tool (Puppeteer + local Chrome)
```

- **The core never touches the database directly.** It depends on repository
  interfaces (`src/core/repositories.ts`), and `src/db` implements them with SQLite.
- **The core never reads the system clock.** It asks a `Clock`, so tests and
  the game can run the library on their own calendar.
- **Rules are data.** `LendingPolicy` is an immutable value object stored in the
  database; the game changes the rules day by day.
- **Invalid states can't be saved.** Entities guard their own state machines
  (a lost copy can't be lent), and the schema backs this up with `CHECK`,
  `UNIQUE` and foreign-key constraints.
- **The save file is the database.** The whole library exports as a single
  `.sqlite` file that any SQLite browser can open.

## Getting started

```bash
npm install
npm run dev        # start the app
npm test           # unit and integration tests
npm run typecheck
npm run build

# against a running build (npx vite preview --port 4173):
npm run e2e          # end-to-end checks in headless Chrome
npm run screenshots  # capture every screen into ./screenshots
```
