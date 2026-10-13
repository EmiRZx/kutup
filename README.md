# Kutup: The Librarian's Desk

A library management system disguised as a game.

Underneath is a complete, conventional library system: catalog, members, cards,
loans, reservations and fines, stored in a real SQLite database. On top of it
sits a *Papers, Please*-style desk game in which you are the librarian. Patrons
walk up with a card and a book, and you stamp **APPROVED** or **DENIED**. The
library core acts as the referee: it checks every decision you make against
the same rules the admin panel enforces.

> 🚧 Work in progress. The core and the database are done; the admin panel and
> the desk game are next.

## Architecture

```
src/core/   Domain model and services in pure TypeScript (no UI, no database)
  model/      Book, BookCopy, Author, Member, LibraryCard, Loan, Reservation, Fine, LendingPolicy
  services/   CatalogService, MemberService, LendingService, ReservationService, FineService
  Library.ts  Facade that wires the services together
src/db/     SQLite (sql.js / WebAssembly) implementation of the core's repository interfaces
src/game/   The desk game (planned)
src/ui/     React: desk scene and admin panel (planned)
tests/      Vitest suites for the core and the database
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
npm test           # run the test suite
npm run typecheck
npm run build
```
