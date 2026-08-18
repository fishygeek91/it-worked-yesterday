import {
  accuse,
  checkout,
  commitAt,
  costOf,
  firstChangedFile,
  GameError,
  generateBuggyHistory,
  generateDiamondHistory,
  generateOctopusHistory,
  mark,
  runSuite,
  start,
} from "../core";
import type {
  BisectState,
  DiamondGenerateInput,
  GeneratedHistory,
  GenerateInput,
  OctopusGenerateInput,
  SuiteResult,
} from "../core";

/**
 * Plant pin. Linear levels use `GenerateInput`; the diamond uses the
 * v2.0 pin; the octopus uses the v2.1 pin.
 */
export type SessionInput = GenerateInput | DiamondGenerateInput | OctopusGenerateInput;

/**
 * True when this pin plants the v2.1 octopus.
 *
 * @param input - Session pin
 */
export function isOctopusInput(input: SessionInput): input is OctopusGenerateInput {
  return "laneCount" in input;
}

/**
 * True when this pin plants the one diamond.
 *
 * @param input - Session pin
 */
export function isDiamondInput(input: SessionInput): input is DiamondGenerateInput {
  return !isOctopusInput(input) && "firstBadLane" in input;
}

/**
 * Operand-free session commands. `blame` is the v1.1 peek. The v2.1
 * `checkout <sha>` carries an operand, so it dispatches as a full
 * command string, not as a member of this union.
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
 * `transcript` is the v2.0 save file: `g`/`b`/`l` in dispatch order.
 */
export type GameSession = {
  input: SessionInput;
  generated: GeneratedHistory;
  bisect: BisectState;
  marks: number;
  lastResult: SuiteResult;
  lastPeek: BlamePeek | null;
  ledger: readonly LedgerEntry[];
  outcome: SessionOutcome;
  transcript: string;
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
 * The v2.1 penalty move: walk the lantern to `sha`, inside or outside the
 * suspect set. It costs the reserved `checkout` row and buys no evidence:
 * the suspect set, bounds, status, ledger, and transcript do not move.
 * Why no ledger line: the ledger records the interview, and a walk is
 * not testimony. Why no transcript letter: `t` is an alphabet, not a
 * grammar — see the v2.1 design section.
 *
 * @param session - Current session
 * @param sha - Full SHA of the room to walk to
 */
function dispatchCheckout(session: GameSession, sha: string): GameSession {
  const cost = costOf("checkout");
  if (session.outcome !== "playing") {
    return session;
  }
  const repo = checkout(session.bisect.repo, sha);
  const bisect: BisectState = { ...session.bisect, repo, current: sha };
  return {
    ...session,
    bisect,
    marks: session.marks + cost,
    lastResult: suiteAtCurrent(bisect),
    lastPeek: null,
  };
}

/**
 * Plant a dungeon and start at the first midpoint. Marks start at zero.
 *
 * @param input - Linear pin or the v2.0 diamond pin
 */
export function createSession(input: SessionInput): GameSession {
  const generated = isOctopusInput(input)
    ? generateOctopusHistory(input)
    : isDiamondInput(input)
      ? generateDiamondHistory(input)
      : generateBuggyHistory(input);
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
    transcript: "",
  };
}

/**
 * Apply one command. Immutable. Clock increments only through `costOf`.
 * Why the test (not this function) chooses good/bad: the engine must not
 * auto-mark; a bad investigation can accuse the wrong SHA.
 *
 * `blame` names a path and does not move the range. `checkout <sha>` is
 * the v2.1 penalty move: one operand, full SHA, may leave the range.
 *
 * @param session - Current session
 * @param command - Raw command name, or `checkout <sha>`
 */
export function dispatch(session: GameSession, command: string): GameSession {
  const words = command.split(" ");
  if (words[0] === "checkout") {
    const sha = words[1];
    if (words.length !== 2 || sha === undefined || sha.length === 0) {
      throw new GameError("INVALID_COMMAND", "checkout needs exactly one sha");
    }
    return dispatchCheckout(session, sha);
  }
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
      transcript: `${session.transcript}l`,
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
      transcript: `${session.transcript}${command === "good" ? "g" : "b"}`,
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
