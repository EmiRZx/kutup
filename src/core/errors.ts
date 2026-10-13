import type { Violation } from './model/violations';

/** Base class for every error the library raises on purpose. */
export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A referenced record (member, copy, loan...) does not exist. */
export class NotFoundError extends LibraryError {
  readonly entity: string;
  readonly key: string | number;

  constructor(entity: string, key: string | number) {
    super(`${entity} not found: ${key}`);
    this.entity = entity;
    this.key = key;
  }
}

/** Input that can never be valid, e.g. a malformed ISBN or an empty name. */
export class ValidationError extends LibraryError {}

/** An entity was asked to make a transition its current state does not allow. */
export class InvalidStateError extends LibraryError {}

/**
 * A request broke one or more lending rules. Carries every violation found,
 * so the caller (a librarian, or the game) can show all of them at once.
 */
export class PolicyViolationError extends LibraryError {
  readonly violations: readonly Violation[];

  constructor(violations: readonly Violation[]) {
    super(`Request refused: ${violations.map((v) => v.code).join(', ')}`);
    this.violations = violations;
  }
}
