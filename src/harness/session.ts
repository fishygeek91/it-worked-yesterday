import {
  accuse,
  commitAt,
  costOf,
  GameError,
  generateBuggyHistory,
  mark,
  runSuite,
  start,
} from "../core";
import type { BisectState, GeneratedHistory, GenerateInput, SuiteResult } from "../core";

/**
 * v1 session commands. `blame` and `checkout` stay reserved in the score table.
 */
export type SessionCommand = "good" | "bad" | "reset" | "accuse";

/**
 * Whether the player is still searching, or has named a SHA.
 */
export type SessionOutcome = "playing" | "won" | "lost";

/**
 * Headless game session. The harness owns the clock; core owns the range.
 */
export type GameSession = {
  input: GenerateInput;
  generated: GeneratedHistory;
  bisect: BisectState;
  marks: number;
  lastResult: SuiteResult;
  outcome: SessionOutcome;
};

const SESSION_COMMANDS = new Set<string>(["good", "bad", "reset", "accuse"]);

/**
 * True when `command` is a v1 session command.
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
    outcome: "playing",
  };
}

/**
 * Apply one v1 command. Immutable. Clock increments only through `costOf`.
 * Why the test (not this function) chooses good/bad: the engine must not
 * auto-mark; a bad investigation can accuse the wrong SHA.
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
  if (command === "good" || command === "bad") {
    const bisect = mark(session.bisect, command);
    return {
      ...session,
      bisect,
      marks: session.marks + cost,
      lastResult: suiteAtCurrent(bisect),
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
    outcome: accused === session.generated.firstBad ? "won" : "lost",
  };
}
