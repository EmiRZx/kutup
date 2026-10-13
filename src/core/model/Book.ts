import type { Author } from './Author';

export const GENRES = [
  'fiction',
  'mystery',
  'science-fiction',
  'fantasy',
  'horror',
  'poetry',
  'drama',
  'philosophy',
  'history',
  'science',
  'children',
  'reference',
] as const;

export type Genre = (typeof GENRES)[number];

export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value);
}

export interface BookProps {
  id: number;
  isbn: string;
  title: string;
  authors: readonly Author[];
  publishedYear: number | null;
  genre: Genre;
  referenceOnly: boolean;
}

/**
 * A title in the catalog: the abstract work, not a physical object.
 * The library may own several {@link BookCopy} instances of the same Book.
 */
export class Book {
  readonly id: number;
  readonly isbn: string;
  title: string;
  authors: readonly Author[];
  publishedYear: number | null;
  genre: Genre;
  /** Reference-only books (rare editions, dictionaries) are read in the building only. */
  referenceOnly: boolean;

  constructor(props: BookProps) {
    this.id = props.id;
    this.isbn = props.isbn;
    this.title = props.title;
    this.authors = props.authors;
    this.publishedYear = props.publishedYear;
    this.genre = props.genre;
    this.referenceOnly = props.referenceOnly;
  }

  /** "Jane Austen", "A and B", "A, B and C". */
  get authorLine(): string {
    const names = this.authors.map((a) => a.name);
    if (names.length <= 1) return names[0] ?? 'Anonymous';
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  }

  matches(query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      this.title.toLowerCase().includes(q) ||
      this.isbn.includes(q.replace(/[\s-]/g, '')) ||
      this.authors.some((a) => a.name.toLowerCase().includes(q))
    );
  }
}
