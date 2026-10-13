import { useState } from 'react';
import { GENRES, type Genre } from '../../core/model/Book';
import { Badge, Button, Empty, Field, PageHeader, Panel } from '../components/ui';
import { Link, navigate } from '../state/router';
import { useSession } from '../state/session';

export function CatalogPage() {
  const { library } = useSession();
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<Genre | ''>('');
  const [adding, setAdding] = useState(false);

  const books = library.catalog.search(query).filter((b) => !genre || b.genre === genre);

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle="Every title the library owns, and how many copies are on the shelf."
        actions={
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close form' : 'Add a book'}
          </Button>
        }
      />

      {adding && <AddBookForm onDone={() => setAdding(false)} />}

      <Panel>
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <Field label="Search">
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, author or ISBN" />
          </Field>
          <Field label="Genre">
            <select className="select" value={genre} onChange={(e) => setGenre(e.target.value as Genre | '')}>
              <option value="">All genres</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {books.length === 0 ? (
          <Empty>Nothing on the shelves matches that.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th className="num">Year</th>
                  <th>Genre</th>
                  <th>On shelf</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => {
                  const a = library.catalog.availability(book.id);
                  return (
                    <tr key={book.id}>
                      <td>
                        <Link to={`/admin/catalog/${book.id}`} className="book-title">
                          {book.title}
                        </Link>{' '}
                        {book.referenceOnly && <Badge tone="info">Reference</Badge>}
                      </td>
                      <td>{book.authorLine}</td>
                      <td className="num">{book.publishedYear ?? '—'}</td>
                      <td className="muted">{book.genre}</td>
                      <td>
                        <Badge tone={a.onShelf > 0 ? 'ok' : a.total > 0 ? 'warn' : 'muted'}>
                          {a.onShelf} / {a.total}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function AddBookForm({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const [isbn, setIsbn] = useState('');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState<Genre>('fiction');
  const [referenceOnly, setReferenceOnly] = useState(false);
  const [copies, setCopies] = useState('1');

  const submit = () => {
    const book = session.act(
      () =>
        session.library.store.transaction(() => {
          const added = session.library.catalog.addBook({
            isbn,
            title,
            authors: authors.split(/[,;]/).map((a) => a.trim()).filter(Boolean),
            publishedYear: year.trim() ? Number(year) : null,
            genre,
            referenceOnly,
          });
          session.library.catalog.addCopies(added.id, Math.max(1, Number(copies) || 1));
          return added;
        }),
      (b) => `“${b.title}” added to the catalog`,
    );
    if (book) {
      onDone();
      navigate(`/admin/catalog/${book.id}`);
    }
  };

  return (
    <Panel title="New title" aside="ISBN-13 with a valid check digit, e.g. 978-0-14-143951-8">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="ISBN-13">
          <input className="input mono" value={isbn} onChange={(e) => setIsbn(e.target.value)} required />
        </Field>
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Authors" hint="Separate several with commas">
          <input className="input" value={authors} onChange={(e) => setAuthors(e.target.value)} required />
        </Field>
        <Field label="Year">
          <input className="input" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Genre">
          <select className="select" value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
            {GENRES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Copies">
          <input className="input" type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={referenceOnly} onChange={(e) => setReferenceOnly(e.target.checked)} />
          Reference only (never leaves the building)
        </label>
        <div className="btn-row">
          <Button type="submit" variant="primary">
            Add to catalog
          </Button>
        </div>
      </form>
    </Panel>
  );
}
