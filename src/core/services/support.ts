import { NotFoundError, ValidationError } from '../errors';

/** Unwraps a lookup result, turning `null` into a {@link NotFoundError}. */
export function found<T>(value: T | null, entity: string, key: string | number): T {
  if (value === null) throw new NotFoundError(entity, key);
  return value;
}

export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${field} must not be empty`);
  return trimmed;
}
