import { GameError } from "./errors";
import type { CommandName } from "./types";

/**
 * Single source of mark costs. Call sites must use `costOf`.
 * `blame` is the live v1.1 peek. `checkout` stays reserved. Do not change costs without a human.
 */
export const COMMAND_COSTS = {
  good: 1,
  bad: 1,
  reset: 0,
  accuse: 0,
  blame: 2,
  checkout: 1,
} as const satisfies Record<CommandName, number>;

/**
 * Command names that have a row in the cost table.
 */
export type PricedCommand = keyof typeof COMMAND_COSTS;

const PRICED = new Set<string>(Object.keys(COMMAND_COSTS));

/**
 * True when `command` is a row in `COMMAND_COSTS`.
 *
 * @param command - Raw command name
 */
export function isPricedCommand(command: string): command is PricedCommand {
  return PRICED.has(command);
}

/**
 * Cost of one command. Never hardcode this number at a call site.
 *
 * @param command - Command name
 */
export function costOf(command: string): number {
  if (!isPricedCommand(command)) {
    throw new GameError("INVALID_COMMAND", `unknown command ${command}`);
  }
  return COMMAND_COSTS[command];
}

/**
 * Worst-case marks if the player marks what the suite said: ceil(log2(n)).
 *
 * @param suspectCount - Initial remaining suspects, including HEAD
 */
export function optimalMarks(suspectCount: number): number {
  if (!Number.isInteger(suspectCount) || suspectCount < 1) {
    throw new GameError(
      "INVALID_INDEX",
      `suspectCount must be an integer >= 1, got ${String(suspectCount)}`,
    );
  }
  return Math.ceil(Math.log2(suspectCount));
}
