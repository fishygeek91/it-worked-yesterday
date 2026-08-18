import { GameError, isUint32, mulberry32 } from "../core";
import type { GenerateInput, MutationId } from "../core";
import { createSession, type GameSession } from "./session";

/**
 * Level id in `l`. Case-sensitive.
 */
export type LevelId = "tutorial" | "yesterday" | "seeded";

/**
 * Parsed query. Pinned levels drop `n` and `seed`; seeded keeps both.
 */
export type UrlState =
  | { level: "tutorial"; marks: number }
  | { level: "yesterday"; marks: number }
  | { level: "seeded"; n: 32 | 64; seed: number; marks: number };

const ALLOWED_KEYS = new Set(["l", "n", "seed", "marks"]);

const EXACT_INTEGER = /^(0|[1-9]\d*)$/;

const MUTATION_IDS: readonly MutationId[] = [
  "offByOneLoopBound",
  "flippedBoolean",
  "regexMissingEscape",
  "wrongFixtureValue",
  "brokenComparison",
  "missingReturn",
  "invertedSortComparator",
  "sliceFencepost",
];

const TUTORIAL_INPUT: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

const YESTERDAY_INPUT: GenerateInput = {
  suspectCount: 16,
  firstBadIndex: 14,
  seed: 1729,
  mutation: "flippedBoolean",
};

/**
 * Throw `INVALID_URL`. URL edges use this code, not `INVALID_SEED`.
 *
 * @param message - Postmortem line
 */
function invalidUrl(message: string): never {
  throw new GameError("INVALID_URL", message);
}

/**
 * True when `value` is a level id.
 *
 * @param value - Raw `l`
 */
function isLevelId(value: string): value is LevelId {
  return value === "tutorial" || value === "yesterday" || value === "seeded";
}

/**
 * Parse an exact non-negative decimal integer. No leading zeros, no coerce.
 *
 * @param raw - Query value
 * @param label - Param name for the error
 */
function parseExactInteger(raw: string, label: string): number {
  if (!EXACT_INTEGER.test(raw)) {
    invalidUrl(`invalid ${label}`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    invalidUrl(`invalid ${label}`);
  }
  return value;
}

/**
 * Parse `marks`. Missing means 0.
 *
 * @param raw - Query value or null
 */
function parseMarks(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  return parseExactInteger(raw, "marks");
}

/**
 * Parse seeded `n`. Only 32 or 64.
 *
 * @param raw - Query value or null
 */
function parseSeededN(raw: string | null): 32 | 64 {
  if (raw === null) {
    invalidUrl("seeded n is required");
  }
  const value = parseExactInteger(raw, "n");
  if (value !== 32 && value !== 64) {
    invalidUrl(`seeded n must be 32 or 64, got ${raw}`);
  }
  return value;
}

/**
 * Parse seeded `seed`. Must be a uint32 integer string.
 *
 * @param raw - Query value or null
 */
function parseSeed(raw: string | null): number {
  if (raw === null) {
    invalidUrl("seeded seed is required");
  }
  const value = parseExactInteger(raw, "seed");
  if (!isUint32(value)) {
    invalidUrl(`seed must be a uint32 integer, got ${raw}`);
  }
  return value;
}

/**
 * Build generate input for a seeded URL.
 * Why a fresh mulberry32 here: generate reseeds from the same seed for salts.
 * Pick order is first-bad, then mutation, so TASK 12 cannot invent a second stream.
 *
 * @param n - 32 or 64
 * @param seed - URL seed
 */
function seededInput(n: 32 | 64, seed: number): GenerateInput {
  const rng = mulberry32(seed);
  const firstBadIndex = rng.nextInt(n);
  const mutation = MUTATION_IDS[rng.nextInt(MUTATION_IDS.length)];
  if (mutation === undefined) {
    throw new GameError("INVALID_INDEX", "url: empty mutation table");
  }
  return { suspectCount: n, firstBadIndex, seed, mutation };
}

/**
 * Map parsed URL state to a generate input.
 *
 * @param state - Parsed query
 */
function inputFromUrl(state: UrlState): GenerateInput {
  if (state.level === "tutorial") {
    return TUTORIAL_INPUT;
  }
  if (state.level === "yesterday") {
    return YESTERDAY_INPUT;
  }
  return seededInput(state.n, state.seed);
}

/**
 * Parse a query string. Empty query is pinned tutorial with marks 0.
 *
 * @param search - `?l=…` or `l=…`
 */
export function parseUrl(search: string): UrlState {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  for (const key of params.keys()) {
    if (!ALLOWED_KEYS.has(key)) {
      invalidUrl(`unknown param ${key}`);
    }
  }
  const present = [...params.keys()];
  if (present.length === 0) {
    return { level: "tutorial", marks: 0 };
  }
  const levelRaw = params.get("l");
  if (levelRaw === null) {
    invalidUrl("l is required when a query is present");
  }
  if (!isLevelId(levelRaw)) {
    invalidUrl(`invalid l ${levelRaw}`);
  }
  const marks = parseMarks(params.get("marks"));
  if (levelRaw === "seeded") {
    return {
      level: "seeded",
      n: parseSeededN(params.get("n")),
      seed: parseSeed(params.get("seed")),
      marks,
    };
  }
  return { level: levelRaw, marks };
}

/**
 * Serialize URL state. Order is `l`, then seeded `n`/`seed`, then `marks`.
 *
 * @param state - Parsed query
 */
export function serializeUrl(state: UrlState): string {
  const params = new URLSearchParams();
  params.set("l", state.level);
  if (state.level === "seeded") {
    params.set("n", String(state.n));
    params.set("seed", String(state.seed));
  }
  params.set("marks", String(state.marks));
  return `?${params.toString()}`;
}

/**
 * Plant a fresh dungeon from a URL and overlay the displayed clock.
 * Why overlay, not replay: v1 does not encode the mark transcript.
 *
 * @param search - Query string
 */
export function sessionFromUrl(search: string): GameSession {
  const state = parseUrl(search);
  const session = createSession(inputFromUrl(state));
  return { ...session, marks: state.marks };
}
