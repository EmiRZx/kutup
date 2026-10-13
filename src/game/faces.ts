import { Random } from '../core/random';

/**
 * Every member's face, derived from their id. The same member always has the
 * same face, so regulars are recognisable and card photos can be compared.
 * The UI draws it; the game uses it to find look-alikes.
 */
export interface Face {
  skin: number;
  hair: number;
  shirt: number;
  hairStyle: number;
  faceWidth: number;
  faceHeight: number;
  glasses: boolean;
  beard: boolean;
  eyeGap: number;
}

export const SKIN_TONES = 6;
export const HAIR_COLOURS = 8;
export const SHIRT_COLOURS = 8;

export function faceFor(seed: number): Face {
  const r = new Random(Math.imul(seed + 17, 2654435761));
  return {
    skin: r.int(0, SKIN_TONES - 1),
    hair: r.int(0, HAIR_COLOURS - 1),
    shirt: r.int(0, SHIRT_COLOURS - 1),
    hairStyle: r.int(0, 5),
    faceWidth: r.int(50, 60),
    faceHeight: r.int(62, 72),
    glasses: r.chance(0.3),
    beard: r.chance(0.15),
    eyeGap: r.int(18, 24),
  };
}

/** How many of the features you'd notice at a glance differ between two faces (0 to 5). */
export function visibleDifferences(a: Face, b: Face): number {
  return [a.skin !== b.skin, a.hair !== b.hair, a.hairStyle !== b.hairStyle, a.glasses !== b.glasses, a.beard !== b.beard].filter(Boolean).length;
}
