import {
  accuse,
  commitAt,
  costOf,
  firstChangedFile,
  GameError,
  generateBuggyHistory,
  mark,
  runSuite,
  start,
} from "../core";
import type { BisectState, GeneratedHistory, GenerateInput, SuiteResult } from "../core";

/**
 * Session commands. `blame` is the v1.1 peek; `checkout` stays reserved.
 */
export type SessionCommand = "good" | "bad" | "reset" | "accuse" | "blame";

/**
 * Whether the player is still searching, or has named a SHA.
 */
export type SessionOutcome = "playing" | "won" | "lost";

/**
 * Path named by the last `blame`, or `null` when that room showed no bug path.
 */
export type BlamePeek = {
  path: string | null;
};

/**
 * One line of the interview record: the room, what the player said,
 * and what the suite said. Written on every mark, read back on a loss.
 */
export type LedgerEntry = {
  sha: string;
  said: "good" | "bad";
  suiteOk: boolean;
};

/**
 * Headless game session. The harness owns the clock; core owns the range.
 */
export type GameSession = {
  input: GenerateInput;
  generated: GeneratedHistory;
  bisect: BisectState;
  marks: number;
  lastResult: SuiteResult;
  lastPeek: BlamePeek | null;
  ledger: readonly LedgerEntry[];
  outcome: SessionOutcome;
};

const SESSION_COMMANDS = new Set<string>(["good", "bad", "reset", "accuse", "blame"]);

/**
 * True when `command` is a live session command.
 *
 * @param command - Raw command name
 */
function isSessionCommand(command: string): command is SessionCommand {
  return SESSION_COMMANDS.has(command);
}

/**
 * Suite result for the checked-out room. Display only; dispatch never reads it
 * to choose a mark.
 *
 * @param bisect - Current search
 */
function suiteAtCurrent(bisect: BisectState): SuiteResult {
  return runSuite(commitAt(bisect.repo, bisect.current).tree);
}

/**
 * First non-salt path that still differs from the last green tree.
 * Green rooms only differ by `meta/note.txt`, so they return `null`.
 *
 * @param session - Current session
 */
function peekPath(session: GameSession): string | null {
  const good = commitAt(session.bisect.repo, session.generated.knownGood);
  const room = commitAt(session.bisect.repo, session.bisect.current);
  const hunk = firstChangedFile(good.tree, room.tree);
  if (hunk === null) {
    return null;
  }
  return hunk.path;
}

/**
 * Plant a dungeon and start at the first midpoint. Marks start at zero.
 *
 * @param input - Seed, n, first-bad index, mutation
 */
export function createSession(input: GenerateInput): GameSession {
  const generated = generateBuggyHistory(input);
  const bisect = start(generated.repo, generated.knownGood, generated.knownBad);
  return {
    input,
    generated,
    bisect,
    marks: 0,
    lastResult: suiteAtCurrent(bisect),
    lastPeek: null,
    ledger: [],
    outcome: "playing",
  };
}

/**
 * Apply one command. Immutable. Clock increments only through `costOf`.
 * Why the test (not this function) chooses good/bad: the engine must not
 * auto-mark; a bad investigation can accuse the wrong SHA.
 *
 * `blame` names a path and does not move the range. `checkout` stays rejected.
 *
 * @param session - Current session
 * @param command - Raw command name
 */
export function dispatch(session: GameSession, command: string): GameSession {
  if (!isSessionCommand(command)) {
    throw new GameError("INVALID_COMMAND", `unknown session command ${command}`);
  }
  const cost = costOf(command);
  if (command === "reset") {
    const next = createSession(session.input);
    return { ...next, marks: cost };
  }
  if (session.outcome !== "playing") {
    return session;
  }
  if (command === "blame") {
    return {
      ...session,
      marks: session.marks + cost,
      lastPeek: { path: peekPath(session) },
    };
  }
  if (command === "good" || command === "bad") {
    const room = commitAt(session.bisect.repo, session.bisect.current);
    const entry: LedgerEntry = {
      sha: room.sha,
      said: command,
      suiteOk: session.lastResult.ok,
    };
    const bisect = mark(session.bisect, command);
    return {
      ...session,
      bisect,
      marks: session.marks + cost,
      lastResult: suiteAtCurrent(bisect),
      lastPeek: null,
      ledger: [...session.ledger, entry],
    };
  }
  const bisect = accuse(session.bisect);
  const accused = bisect.accused;
  if (accused === null) {
    throw new GameError("NOT_READY_TO_ACCUSE", "accuse did not name a SHA");
  }
  return {
    ...session,
    bisect,
    marks: session.marks + cost,
    lastResult: suiteAtCurrent(bisect),
    lastPeek: null,
    outcome: accused === session.generated.firstBad ? "won" : "lost",
  };
}
