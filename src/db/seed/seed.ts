import { isbn13CheckDigit } from '../../core/identifiers';
import type { Library } from '../../core/Library';
import type { MemberType } from '../../core/model/Member';
import { SEED_BOOKS } from './catalog';

/**
 * These editions are the library's own, so their ISBNs are synthetic: a fixed
 * prefix, the book's position in the seed list, and a correct check digit.
 */
export function seedIsbn(index: number): string {
  const first12 = `97899${String(index + 1).padStart(7, '0')}`;
  return first12 + isbn13CheckDigit(first12);
}

export function seedCatalog(library: Library): void {
  library.store.transaction(() => {
    SEED_BOOKS.forEach((seed, index) => {
      const book = library.catalog.addBook({
        isbn: seedIsbn(index),
        title: seed.title,
        authors: seed.authors,
        publishedYear: seed.year,
        genre: seed.genre,
        referenceOnly: seed.referenceOnly ?? false,
      });
      library.catalog.addCopies(book.id, seed.copies);
    });
  });
}

const SEED_MEMBERS: readonly [string, MemberType][] = [
  ['Elif Yılmaz', 'student'],
  ['Mert Kaya', 'student'],
  ['Zeynep Demir', 'student'],
  ['Arda Şahin', 'student'],
  ['Selin Çelik', 'student'],
  ['Deniz Aydın', 'student'],
  ['Can Polat', 'student'],
  ['Ece Korkmaz', 'student'],
  ['Baran Yıldız', 'student'],
  ['Defne Koç', 'student'],
  ['Omar Haddad', 'student'],
  ['Lena Novak', 'student'],
  ['Kofi Mensah', 'student'],
  ['Mei Lin', 'student'],
  ['Lucas Moreau', 'student'],
  ['Prof. Ayşe Arslan', 'staff'],
  ['Dr. Kemal Öztürk', 'staff'],
  ['Dr. Sofia Rossi', 'staff'],
  ['Hasan Erdem', 'staff'],
  ['Hannah Becker', 'guest'],
  ['Tomás García', 'guest'],
  ['Nur Aksoy', 'guest'],
];

/** "Prof. Ayşe Arslan" -> "ayse.arslan@kutup.edu" */
export function emailFor(name: string): string {
  const local = name
    .replace(/^(Prof|Dr)\.\s*/, '')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${local}@kutup.edu`;
}

export function seedMembers(library: Library): void {
  library.store.transaction(() => {
    for (const [name, type] of SEED_MEMBERS) library.members.register({ name, type, email: emailFor(name) });
  });
}
