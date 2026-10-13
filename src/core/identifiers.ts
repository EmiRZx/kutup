/**
 * Check-digit schemes for the two numbers a librarian handles all day:
 * ISBN-13 on books and the Luhn-checked number on library cards. A forged
 * card with a made-up number fails `isValidCardNumber`, which the game uses.
 */

/** Removes the hyphens and spaces people type into ISBNs. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/** Check digit for the first 12 digits of an ISBN-13 (weights 1,3,1,3,...). */
export function isbn13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new RangeError('Expected exactly 12 digits');
  const sum = [...first12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidIsbn13(raw: string): boolean {
  const isbn = normalizeIsbn(raw);
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  return isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12]);
}

/** Luhn check digit for a string of digits (the same scheme as bank cards). */
export function luhnCheckDigit(payload: string): number {
  if (!/^\d+$/.test(payload)) throw new RangeError('Expected digits only');
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    // Double every second digit, counting from the right of the payload.
    let digit = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

export const CARD_NUMBER_LENGTH = 8;

/** Card numbers are 7 random digits plus a Luhn check digit, e.g. "48210937". */
export function isValidCardNumber(number: string): boolean {
  if (!new RegExp(`^\\d{${CARD_NUMBER_LENGTH}}$`).test(number)) return false;
  return luhnCheckDigit(number.slice(0, -1)) === Number(number.slice(-1));
}

/** Builds a card number from a random source returning values in [0, 1). */
export function generateCardNumber(random: () => number): string {
  const first = 1 + Math.floor(random() * 9); // never starts with 0
  let payload = String(first);
  while (payload.length < CARD_NUMBER_LENGTH - 1) payload += String(Math.floor(random() * 10));
  return payload + luhnCheckDigit(payload);
}

/** "48210937" -> "4821 0937", the way it is printed on the physical card. */
export function formatCardNumber(number: string): string {
  return `${number.slice(0, 4)} ${number.slice(4)}`;
}
