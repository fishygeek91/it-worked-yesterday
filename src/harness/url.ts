import { GameError, isUint32, mulberry32 } from "../core";
import type { DiamondGenerateInput, GenerateInput, MutationId, OctopusGenerateInput } from "../core";
import {
  createSession,
  dispatch,
  isDiamondInput,
  isOctopusInput,
  type GameSession,
  type SessionCommand,
  type SessionInput,
} from "./session";

/**
 * Level id in `l`. Case-sensitive. `learn` is a case file, not a dungeon.
 */
export type LevelId = "tutorial" | "yesterday" | "seeded" | "learn" | "merged" | "octopus";

/**
 * Letters in the `t` param. Accuse is not in the alphabet: a finished
 * game shares `marks`, a search in progress shares a save file.
 */
export type TranscriptLetter = "g" | "b" | "l";

/**
 * Clock on a dungeon URL. `t` and `marks` are mutually exclusive.
 */
export type UrlClock = { marks: number } | { transcript: string };

/**
 * Parsed query. Pinned levels drop `n` and `seed`; seeded keeps both.
 * `learn` carries no clock: there is no dungeon to overlay or replay.
 */
export type UrlState =
  | ({ level: "tutorial" } & UrlClock)
  | ({ level: "yesterday" } & UrlClock)
  | ({ level: "merged" } & UrlClock)
  | ({ level: "octopus" } & UrlClock)
  | ({ level: "seeded"; n: 32 | 64; seed: number } & UrlClock)
  | { level: "learn" };

const ALLOWED_KEYS = new Set(["l", "n", "seed", "marks", "t"]);

const TRANSCRIPT_COMMAND: Record<TranscriptLetter, SessionCommand> = {
  g: "good",
  b: "bad",
  l: "blame",
};

const TRANSCRIPT_PATTERN = /^[gbl]+$/;

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

/**
 * Pinned tutorial dungeon. n=8, first-bad 3, offByOneLoopBound.
 */
export const TUTORIAL_INPUT: GenerateInput = {
  suspectCount: 8,
  firstBadIndex: 3,
  seed: 1729,
  mutation: "offByOneLoopBound",
};

/**
 * Pinned yesterday dungeon. n=16, first-bad 14 (last quarter), flippedBoolean.
 */
export const YESTERDAY_INPUT: GenerateInput = {
  suspectCount: 16,
  firstBadIndex: 14,
  seed: 1729,
  mutation: "flippedBoolean",
};

/**
 * Pinned merged dungeon. n=32, first-bad on the branch, missingReturn.
 */
export const MERGED_INPUT: DiamondGenerateInput = {
  suspectCount: 32,
  seed: 1729,
  mutation: "missingReturn",
  firstBadLane: "branch",
  firstBadOnLane: 7,
};

/**
 * Pinned octopus dungeon per the v2.1 design table: The release train.
 * n=32, three lanes of ten, first-bad on lane 1 at suspect 4,
 * invertedSortComparator.
 */
export const OCTOPUS_INPUT: OctopusGenerateInput = {
  suspectCount: 32,
  laneCount: 3,
  seed: 1729,
  mutation: "invertedSortComparator",
  firstBadLane: 1,
  firstBadOnLane: 4,
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
  return (
    value === "tutorial" ||
    value === "yesterday" ||
    value === "seeded" ||
    value === "learn" ||
    value === "merged" ||
    value === "octopus"
  );
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
 * Parse `t`. Missing means no transcript. Empty or unknown letters throw.
 * Why reject instead of truncate: a shortened save file would invent a
 * different investigation.
 *
 * @param raw - Query value or null
 */
function parseTranscript(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  if (!TRANSCRIPT_PATTERN.test(raw)) {
    invalidUrl("invalid t");
  }
  return raw;
}

/**
 * True when `letter` is in the transcript alphabet.
 *
 * @param letter - One character
 */
function isTranscriptLetter(letter: string): letter is TranscriptLetter {
  return letter === "g" || letter === "b" || letter === "l";
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
 * Pick order is first-bad, then mutation. Do not invent a second stream.
 *
 * @param n - 32 or 64
 * @param seed - URL seed
 */
export function seededInput(n: 32 | 64, seed: number): GenerateInput {
  const rng = mulberry32(seed);
  const firstBadIndex = rng.nextInt(n);
  const mutation = MUTATION_IDS[rng.nextInt(MUTATION_IDS.length)];
  if (mutation === undefined) {
    throw new GameError("INVALID_INDEX", "url: empty mutation table");
  }
  return { suspectCount: n, firstBadIndex, seed, mutation };
}

/**
 * True when two linear generate inputs are the same dungeon pin.
 *
 * @param left - First input
 * @param right - Second input
 */
function sameLinearInput(left: GenerateInput, right: GenerateInput): boolean {
  return (
    left.suspectCount === right.suspectCount &&
    left.firstBadIndex === right.firstBadIndex &&
    left.seed === right.seed &&
    left.mutation === right.mutation
  );
}

/**
 * True when two diamond pins are the same dungeon.
 *
 * @param left - First pin
 * @param right - Second pin
 */
function sameDiamondInput(left: DiamondGenerateInput, right: DiamondGenerateInput): boolean {
  return (
    left.suspectCount === right.suspectCount &&
    left.seed === right.seed &&
    left.mutation === right.mutation &&
    left.firstBadLane === right.firstBadLane &&
    left.firstBadOnLane === right.firstBadOnLane
  );
}

/**
 * True when two octopus pins are the same dungeon.
 *
 * @param left - First pin
 * @param right - Second pin
 */
function sameOctopusInput(left: OctopusGenerateInput, right: OctopusGenerateInput): boolean {
  return (
    left.suspectCount === right.suspectCount &&
    left.laneCount === right.laneCount &&
    left.seed === right.seed &&
    left.mutation === right.mutation &&
    left.firstBadLane === right.firstBadLane &&
    left.firstBadOnLane === right.firstBadOnLane
  );
}

/**
 * Map parsed URL state to a generate input. `learn` refuses: it has no
 * history to plant, and coercing it into one would invent a fourth dungeon.
 *
 * @param state - Parsed query
 */
function inputFromUrl(state: UrlState): SessionInput {
  if (state.level === "learn") {
    invalidUrl("learn is not a dungeon");
  }
  if (state.level === "tutorial") {
    return TUTORIAL_INPUT;
  }
  if (state.level === "yesterday") {
    return YESTERDAY_INPUT;
  }
  if (state.level === "merged") {
    return MERGED_INPUT;
  }
  if (state.level === "octopus") {
    return OCTOPUS_INPUT;
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
  if (levelRaw === "learn") {
    return { level: "learn" };
  }
  const transcript = parseTranscript(params.get("t"));
  const marksRaw = params.get("marks");
  if (transcript !== null && marksRaw !== null) {
    invalidUrl("t and marks are mutually exclusive");
  }
  const clock: UrlClock =
    transcript !== null ? { transcript } : { marks: parseMarks(marksRaw) };
  if (levelRaw === "seeded") {
    return {
      level: "seeded",
      n: parseSeededN(params.get("n")),
      seed: parseSeed(params.get("seed")),
      ...clock,
    };
  }
  if (levelRaw === "yesterday") {
    return { level: "yesterday", ...clock };
  }
  if (levelRaw === "merged") {
    return { level: "merged", ...clock };
  }
  if (levelRaw === "octopus") {
    return { level: "octopus", ...clock };
  }
  return { level: "tutorial", ...clock };
}

/**
 * Serialize URL state. Order is `l`, then seeded `n`/`seed`, then `t` or `marks`.
 *
 * @param state - Parsed query
 */
export function serializeUrl(state: UrlState): string {
  if (state.level === "learn") {
    return "?l=learn";
  }
  const params = new URLSearchParams();
  params.set("l", state.level);
  if (state.level === "seeded") {
    params.set("n", String(state.n));
    params.set("seed", String(state.seed));
  }
  if ("transcript" in state) {
    params.set("t", state.transcript);
  } else {
    params.set("marks", String(state.marks));
  }
  return `?${params.toString()}`;
}

/**
 * Replay `t` through the live engine. Any throw the engine would make
 * becomes `INVALID_URL` — a broken save file is a refused share, not a
 * coerced shorter walk.
 *
 * @param session - Fresh dungeon
 * @param transcript - Letters to dispatch
 */
function replayTranscript(session: GameSession, transcript: string): GameSession {
  let next = session;
  for (const letter of transcript) {
    if (!isTranscriptLetter(letter)) {
      invalidUrl(`invalid t letter ${letter}`);
    }
    try {
      next = dispatch(next, TRANSCRIPT_COMMAND[letter]);
    } catch (error) {
      if (error instanceof GameError) {
        invalidUrl(`illegal transcript: ${error.message}`);
      }
      throw error;
    }
  }
  return next;
}

/**
 * Plant a dungeon from a URL. `t` replays through `dispatch`. `marks`
 * still overlays the displayed clock the v1 way, so old share links
 * keep working.
 *
 * @param search - Query string
 */
export function sessionFromUrl(search: string): GameSession {
  const state = parseUrl(search);
  const session = createSession(inputFromUrl(state));
  if (state.level !== "learn" && "transcript" in state) {
    return replayTranscript(session, state.transcript);
  }
  const marks = state.level === "learn" ? 0 : state.marks;
  return { ...session, marks };
}

/**
 * Share query for this session. A search in progress carries `t` so the
 * link is a real save file. A finished game carries `marks` like v1.
 * A session with no commands yet still uses `marks` so a fresh desk and
 * an old overlay link serialize the same way.
 *
 * @param session - Current session
 */
export function shareUrl(session: GameSession): string {
  const clock: UrlClock =
    session.outcome === "playing" && session.transcript.length > 0
      ? { transcript: session.transcript }
      : { marks: session.marks };
  if (isOctopusInput(session.input)) {
    if (sameOctopusInput(session.input, OCTOPUS_INPUT)) {
      return serializeUrl({ level: "octopus", ...clock });
    }
    invalidUrl("only the pinned octopus has a url");
  }
  if (isDiamondInput(session.input)) {
    if (sameDiamondInput(session.input, MERGED_INPUT)) {
      return serializeUrl({ level: "merged", ...clock });
    }
    invalidUrl("only the pinned diamond has a url");
  }
  if (sameLinearInput(session.input, TUTORIAL_INPUT)) {
    return serializeUrl({ level: "tutorial", ...clock });
  }
  if (sameLinearInput(session.input, YESTERDAY_INPUT)) {
    return serializeUrl({ level: "yesterday", ...clock });
  }
  const n = session.input.suspectCount;
  if (n !== 32 && n !== 64) {
    invalidUrl(`seeded n must be 32 or 64, got ${String(n)}`);
  }
  return serializeUrl({
    level: "seeded",
    n,
    seed: session.input.seed,
    ...clock,
  });
}
