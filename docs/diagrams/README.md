# UML diagrams

Class, object and deployment diagrams for Kutup, drawn from the source code as it is. The PlantUML
sources are in [`src/`](src); every diagram is also rendered as SVG (zoomable, best for reading) and PNG.

| Diagram | What it shows |
| --- | --- |
| [Class, sheet 1: domain model](class-1-domain.svg) | The library's entities (`Book`, `BookCopy`, `Member`, `LibraryCard`, `Loan`, `Reservation`, `Fine`, `Author`), the rule book `LendingPolicy`, every enumeration and how they relate, with multiplicities |
| [Class, sheet 2: services](class-2-services.svg) | The `Library` facade, the six services, `Clock`, `Random`, the utility modules and the error hierarchy |
| [Class, sheet 3: service data types](class-3-service-types.svg) | What the services take and return: `CheckoutRequest`, `CheckoutAssessment`, `ReturnReceipt`, `AccountSummary`, ... |
| [Class, sheet 4: persistence](class-4-persistence.svg) | The repository interfaces in the core and their SQLite implementations, `SqliteDatabase`, `StoredClock`, schema and seeding |
| [Class, sheet 5: game](class-5-game.svg) | `Game`, the career state, a patron's `Encounter`, decisions and verdicts, and the game's modules (campaign, scenarios, judge, economy, terminal) |
| [Class, sheet 6: overview and UI](class-6-overview.svg) | How the packages depend on each other, and the React user interface |
| [Object diagram](object-diagram.svg) | A real moment from a game: day 3, 12:20, a student who owes a damage fee asks to borrow *Hamlet* and is refused. Every value comes from the running program |
| [Deployment diagram](deployment-diagram.svg) | Where everything runs: the player's browser (JavaScript, WebAssembly SQLite, IndexedDB), GitHub Pages, GitHub Actions and the developer's computer |

## Notation

- `+` public, `-` private. `{readOnly}` marks fields that never change after construction;
  `«get»` marks a read-only property computed by a getter. Underlined members are static.
- `[0..1]` means optional (may be `null`), `[*]` or `[0..*]` a list.
- Modules of plain functions are shown as `«utility»` classes with static operations.
- TypeScript union types such as `'student' | 'staff' | 'guest'` are shown as `«enumeration»`s, and the
  `Decision` union as an abstract class with one subclass per case.
- Associations between entities are stored as ids (`Loan.copyId`, `Fine.loanId`, ...); the diagram shows both.

## Regenerating

With Java and [PlantUML](https://plantuml.com) (and optionally Graphviz) installed:

```bash
cd docs/diagrams/src
java -jar plantuml.jar -charset UTF-8 -tsvg -o .. *.puml
java -jar plantuml.jar -charset UTF-8 -tpng -o .. *.puml
```
