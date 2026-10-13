import type { Genre } from '../../core/model/Book';

export interface SeedBook {
  title: string;
  authors: string[];
  year: number | null;
  genre: Genre;
  copies: number;
  referenceOnly?: boolean;
}

/** Public-domain classics. Enough variety for every genre shelf and every lending rule. */
export const SEED_BOOKS: readonly SeedBook[] = [
  { title: 'Pride and Prejudice', authors: ['Jane Austen'], year: 1813, genre: 'fiction', copies: 3 },
  { title: 'Emma', authors: ['Jane Austen'], year: 1815, genre: 'fiction', copies: 1 },
  { title: 'Jane Eyre', authors: ['Charlotte Brontë'], year: 1847, genre: 'fiction', copies: 2 },
  { title: 'Wuthering Heights', authors: ['Emily Brontë'], year: 1847, genre: 'fiction', copies: 2 },
  { title: 'Great Expectations', authors: ['Charles Dickens'], year: 1861, genre: 'fiction', copies: 2 },
  { title: 'A Tale of Two Cities', authors: ['Charles Dickens'], year: 1859, genre: 'history', copies: 1 },
  { title: 'Moby-Dick', authors: ['Herman Melville'], year: 1851, genre: 'fiction', copies: 1 },
  { title: 'Crime and Punishment', authors: ['Fyodor Dostoevsky'], year: 1866, genre: 'fiction', copies: 2 },
  { title: 'The Brothers Karamazov', authors: ['Fyodor Dostoevsky'], year: 1880, genre: 'fiction', copies: 1 },
  { title: 'Anna Karenina', authors: ['Leo Tolstoy'], year: 1878, genre: 'fiction', copies: 1 },
  { title: 'War and Peace', authors: ['Leo Tolstoy'], year: 1869, genre: 'history', copies: 1 },
  { title: 'Les Misérables', authors: ['Victor Hugo'], year: 1862, genre: 'fiction', copies: 1 },
  { title: 'The Count of Monte Cristo', authors: ['Alexandre Dumas'], year: 1844, genre: 'fiction', copies: 2 },
  { title: 'Don Quixote', authors: ['Miguel de Cervantes'], year: 1605, genre: 'fiction', copies: 1 },
  { title: 'The Picture of Dorian Gray', authors: ['Oscar Wilde'], year: 1890, genre: 'fiction', copies: 2 },
  { title: 'The Metamorphosis', authors: ['Franz Kafka'], year: 1915, genre: 'fiction', copies: 2 },
  { title: 'Mai ve Siyah', authors: ['Halit Ziya Uşaklıgil'], year: 1897, genre: 'fiction', copies: 1 },
  { title: 'Araba Sevdası', authors: ['Recaizade Mahmut Ekrem'], year: 1898, genre: 'fiction', copies: 1 },
  { title: 'Eylül', authors: ['Mehmet Rauf'], year: 1901, genre: 'fiction', copies: 1 },
  { title: 'The Adventures of Sherlock Holmes', authors: ['Arthur Conan Doyle'], year: 1892, genre: 'mystery', copies: 3 },
  { title: 'The Hound of the Baskervilles', authors: ['Arthur Conan Doyle'], year: 1902, genre: 'mystery', copies: 2 },
  { title: 'The Moonstone', authors: ['Wilkie Collins'], year: 1868, genre: 'mystery', copies: 1 },
  { title: 'Frankenstein', authors: ['Mary Shelley'], year: 1818, genre: 'horror', copies: 2 },
  { title: 'Dracula', authors: ['Bram Stoker'], year: 1897, genre: 'horror', copies: 2 },
  { title: 'Strange Case of Dr Jekyll and Mr Hyde', authors: ['Robert Louis Stevenson'], year: 1886, genre: 'horror', copies: 1 },
  { title: 'The Time Machine', authors: ['H. G. Wells'], year: 1895, genre: 'science-fiction', copies: 2 },
  { title: 'The War of the Worlds', authors: ['H. G. Wells'], year: 1898, genre: 'science-fiction', copies: 1 },
  { title: 'Twenty Thousand Leagues Under the Seas', authors: ['Jules Verne'], year: 1870, genre: 'science-fiction', copies: 1 },
  { title: 'Journey to the Centre of the Earth', authors: ['Jules Verne'], year: 1864, genre: 'science-fiction', copies: 1 },
  { title: "Alice's Adventures in Wonderland", authors: ['Lewis Carroll'], year: 1865, genre: 'children', copies: 2 },
  { title: 'Treasure Island', authors: ['Robert Louis Stevenson'], year: 1883, genre: 'children', copies: 2 },
  { title: 'Peter Pan', authors: ['J. M. Barrie'], year: 1911, genre: 'children', copies: 1 },
  { title: 'The Wonderful Wizard of Oz', authors: ['L. Frank Baum'], year: 1900, genre: 'fantasy', copies: 1 },
  { title: 'Leaves of Grass', authors: ['Walt Whitman'], year: 1855, genre: 'poetry', copies: 1 },
  { title: 'The Raven and Other Poems', authors: ['Edgar Allan Poe'], year: 1845, genre: 'poetry', copies: 1 },
  { title: 'The Odyssey', authors: ['Homer'], year: null, genre: 'poetry', copies: 2 },
  { title: 'Hamlet', authors: ['William Shakespeare'], year: 1603, genre: 'drama', copies: 2 },
  { title: 'Macbeth', authors: ['William Shakespeare'], year: 1623, genre: 'drama', copies: 1 },
  { title: 'The Importance of Being Earnest', authors: ['Oscar Wilde'], year: 1895, genre: 'drama', copies: 1 },
  { title: 'Meditations', authors: ['Marcus Aurelius'], year: null, genre: 'philosophy', copies: 1 },
  { title: 'Thus Spoke Zarathustra', authors: ['Friedrich Nietzsche'], year: 1883, genre: 'philosophy', copies: 1 },
  { title: 'The Communist Manifesto', authors: ['Karl Marx', 'Friedrich Engels'], year: 1848, genre: 'philosophy', copies: 1 },
  { title: 'On the Origin of Species', authors: ['Charles Darwin'], year: 1859, genre: 'science', copies: 1 },
  { title: 'The History of the Decline and Fall of the Roman Empire', authors: ['Edward Gibbon'], year: 1776, genre: 'history', copies: 1 },
  { title: 'A Dictionary of the English Language', authors: ['Samuel Johnson'], year: 1755, genre: 'reference', copies: 1, referenceOnly: true },
  { title: 'Encyclopaedia Britannica, Eleventh Edition', authors: ['Hugh Chisholm'], year: 1911, genre: 'reference', copies: 1, referenceOnly: true },
];
