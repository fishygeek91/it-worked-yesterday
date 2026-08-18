import { GameError } from "./errors";

/**
 * Seeded RNG. Same seed → same stream. Never use Math.random in core.
 */
export type Rng = {
  /** Next float in [0, 1). */
  next: () => number;
  /** Integer in [0, maxExclusive). */
  nextInt: (maxExclusive: number) => number;
};

const UINT32_MAX = 0xffffffff;

/**
 * True when `seed` is an integer in [0, 2^32 - 1].
 */
export function isUint32(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= UINT32_MAX;
}

/**
 * mulberry32. Deterministic. Same seed → same stream.
 * Why a custom PRNG: Math.random is not seedable and would break share URLs.
 *
 * @param seed - uint32 integer
 */
export function mulberry32(seed: number): Rng {
  if (!isUint32(seed)) {
    throw new GameError("INVALID_SEED", `seed must be a uint32 integer, got ${String(seed)}`);
  }
  let state = seed >>> 0;
  const next = (): number => {
    // Classic mulberry32 step. The add wraps via later unsigned ops.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new GameError(
        "INVALID_INDEX",
        `nextInt maxExclusive must be a positive integer, got ${String(maxExclusive)}`,
      );
    }
    return Math.floor(next() * maxExclusive);
  };
  return { next, nextInt };
}
