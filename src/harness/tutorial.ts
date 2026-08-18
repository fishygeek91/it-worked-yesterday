import type { GameSession, SessionInput } from "./session";
import { isDiamondInput } from "./session";
import { MERGED_INPUT, parseUrl, sessionFromUrl, TUTORIAL_INPUT, YESTERDAY_INPUT } from "./url";

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
export function isTutorialInput(input: SessionInput): boolean {
  if (isDiamondInput(input)) {
    return false;
  }
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
export function isYesterdayInput(input: SessionInput): boolean {
  if (isDiamondInput(input)) {
    return false;
  }
  return (
    input.suspectCount === YESTERDAY_INPUT.suspectCount &&
    input.firstBadIndex === YESTERDAY_INPUT.firstBadIndex &&
    input.seed === YESTERDAY_INPUT.seed &&
    input.mutation === YESTERDAY_INPUT.mutation
  );
}

/**
 * True when this session is the pinned feature-branch diamond.
 *
 * @param input - Session pin
 */
export function isMergedInput(input: SessionInput): boolean {
  return (
    isDiamondInput(input) &&
    input.suspectCount === MERGED_INPUT.suspectCount &&
    input.seed === MERGED_INPUT.seed &&
    input.mutation === MERGED_INPUT.mutation &&
    input.firstBadLane === MERGED_INPUT.firstBadLane &&
    input.firstBadOnLane === MERGED_INPUT.firstBadOnLane
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
 * What one page load is: a live dungeon or the learn case file.
 */
export type Visit = { kind: "play"; session: GameSession } | { kind: "learn" };

/**
 * Route one page load. Unseen players cannot skip the tutorial — not even
 * into the learn case file. After that, an empty query is yesterday and
 * `l=learn` opens the case file without planting a history.
 *
 * @param search - Location search
 * @param store - Persistence
 */
export function visitForSearch(search: string, store: TutorialStore): Visit {
  if (!isTutorialDone(store)) {
    return { kind: "play", session: sessionFromUrl("?l=tutorial") };
  }
  if (isEmptySearch(search)) {
    return { kind: "play", session: sessionFromUrl("?l=yesterday") };
  }
  if (parseUrl(search).level === "learn") {
    return { kind: "learn" };
  }
  return { kind: "play", session: sessionFromUrl(search) };
}

/**
 * Plant a session for this visit. Play-only wrapper over `visitForSearch`;
 * a learn visit has no session and refuses here.
 *
 * @param search - Location search
 * @param store - Persistence
 */
export function sessionForVisit(search: string, store: TutorialStore): GameSession {
  const visit = visitForSearch(search, store);
  if (visit.kind !== "play") {
    return sessionFromUrl(search);
  }
  return visit.session;
}
