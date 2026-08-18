import type { GenerateInput } from "../core";
import type { GameSession } from "./session";
import { sessionFromUrl, TUTORIAL_INPUT, YESTERDAY_INPUT } from "./url";

/**
 * Client persistence for tutorial completion. Not part of the seed.
 */
export const TUTORIAL_DONE_KEY = "iwy.tutorialDone";

/**
 * Key-value store. The browser adapter writes the key; tests use memory.
 */
export type TutorialStore = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
};

/**
 * True when the tutorial has been completed once.
 *
 * @param store - Persistence
 */
export function isTutorialDone(store: TutorialStore): boolean {
  return store.get(TUTORIAL_DONE_KEY) === "1";
}

/**
 * Record that the tutorial was completed. Call only after a tutorial win.
 *
 * @param store - Persistence
 */
export function markTutorialDone(store: TutorialStore): void {
  store.set(TUTORIAL_DONE_KEY, "1");
}

/**
 * True when this session is the pinned tutorial dungeon.
 *
 * @param input - Generate input
 */
export function isTutorialInput(input: GenerateInput): boolean {
  return (
    input.suspectCount === TUTORIAL_INPUT.suspectCount &&
    input.firstBadIndex === TUTORIAL_INPUT.firstBadIndex &&
    input.seed === TUTORIAL_INPUT.seed &&
    input.mutation === TUTORIAL_INPUT.mutation
  );
}

/**
 * True when this session is the pinned yesterday dungeon.
 *
 * @param input - Generate input
 */
export function isYesterdayInput(input: GenerateInput): boolean {
  return (
    input.suspectCount === YESTERDAY_INPUT.suspectCount &&
    input.firstBadIndex === YESTERDAY_INPUT.firstBadIndex &&
    input.seed === YESTERDAY_INPUT.seed &&
    input.mutation === YESTERDAY_INPUT.mutation
  );
}

/**
 * True when the query has no params. Parse still maps this to tutorial;
 * the visit router maps it to yesterday after the tutorial is done.
 *
 * @param search - Location search
 */
function isEmptySearch(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return raw.length === 0;
}

/**
 * Plant a session for this visit. Unseen players cannot skip the tutorial.
 * After that, an empty query is yesterday (the last free-play).
 *
 * @param search - Location search
 * @param store - Persistence
 */
export function sessionForVisit(search: string, store: TutorialStore): GameSession {
  if (!isTutorialDone(store)) {
    return sessionFromUrl("?l=tutorial");
  }
  if (isEmptySearch(search)) {
    return sessionFromUrl("?l=yesterday");
  }
  return sessionFromUrl(search);
}
