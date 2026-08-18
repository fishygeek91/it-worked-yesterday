/**
 * Stable error codes for edge validation (URL, commands, seed, range).
 */
export type GameErrorCode =
  | "INVALID_SEED"
  | "INVALID_SHA"
  | "INVALID_COMMAND"
  | "INVALID_RANGE"
  | "NOT_READY_TO_ACCUSE"
  | "ALREADY_ACCUSED"
  | "INVALID_MARK"
  | "EMPTY_REPO"
  | "INVALID_INDEX"
  | "INVALID_URL"
  | "MISSING_FILE"
  | "MUTATION_SITE";

/**
 * Typed failure. Callers branch on `code`, not on message text.
 */
export class GameError extends Error {
  readonly code: GameErrorCode;

  /**
   * @param code - Stable machine code
   * @param message - Human postmortem line
   */
  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}
