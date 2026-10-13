# UML diagrams

Class, object and deployment diagrams of the Kutup **library system** (`src/core` and `src/db`), drawn from the
source code as it is. The PlantUML sources are in [`src/`](src); every diagram is also rendered as SVG
(zoomable, best for reading) and PNG.

| Diagram | What it shows |
| --- | --- |
| [Class diagram, sheet 1 of 3: domain model](class-1-domain.svg) | The library's entities (`Book`, `BookCopy`, `Author`, `Member`, `LibraryCard`, `Loan`, `Reservation`, `Fine`), the rule book `LendingPolicy`, every enumeration, and how they relate, with multiplicities |
| [Class diagram, sheet 2 of 3: services](class-2-services.svg) | The `Library` facade, the six services (catalog, members, lending, reservations, fines, reports), `Clock`, `Random`, the utility modules and the error hierarchy |
| [Class diagram, sheet 3 of 3: storage](class-3-storage.svg) | The repository interfaces in the core and their SQLite implementations, `SqliteDatabase`, `StoredClock`, the schema and the sample data |
| [Object diagram](object-diagram.svg) | The library on 16 October 2026: a student who owes a damage fee asks to borrow *Hamlet*, and `checkCheckout()` refuses. Every value comes from the running program |
| [Deployment diagram](deployment-diagram.svg) | Where the system runs: the user's browser (JavaScript, SQLite compiled to WebAssembly, IndexedDB) and the static web server |

The [`simple/`](simple) folder has a **simplified version of the three class diagram sheets**: the same
classes and relationships, with only public members, getters shown as plain attributes, parameter types left
out, and the helper modules and repository operations summarised:
[domain](simple/class-1-domain-simple.svg), [services](simple/class-2-services-simple.svg),
[storage](simple/class-3-storage-simple.svg).

The [`extra/`](extra) folder has further diagrams that are not part of the library system itself: the desk
game, the package overview with the React UI, the services' input and output types, and versions of the
object and deployment diagrams that include the game and the build pipeline.

## Notation

- `+` public, `-` private. `{readOnly}` marks fields that never change after construction;
  `«get»` marks a read-only property computed by a getter. Underlined members are static.
- `[0..1]` means optional (may be `null`), `[*]` or `[0..*]` a list.
- Modules of plain functions are shown as `«utility»` classes with static operations.
- TypeScript union types such as `'student' | 'staff' | 'guest'` are shown as `«enumeration»`s.
- Associations between entities are stored as ids (`Loan.copyId`, `Fine.loanId`, ...); the diagram shows both.
- In the object diagram, object names are underlined (`baran : Member`) and only values are shown.

## Regenerating

With Java and [PlantUML](https://plantuml.com) (and optionally Graphviz) installed:

```bash
cd docs/diagrams/src
java -jar plantuml.jar -charset UTF-8 -tsvg -o .. *.puml
java -jar plantuml.jar -charset UTF-8 -tpng -o .. *.puml
```
