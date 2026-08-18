import { GameError } from "../core/errors";
import {
  createSession,
  dispatch,
  TUTORIAL_INPUT,
  YESTERDAY_INPUT,
  type GameSession,
} from "../harness";
import { buildViewModel, renderGraph } from "../render";

/**
 * One frozen hallway on the learn page. Read-only evidence, not a level.
 */
export type LearnExhibit = {
  id: string;
  caption: string;
  svg: string;
};

/**
 * Render one session as the dungeon map. Same renderer the desk uses.
 *
 * @param session - Session to freeze
 */
export function renderWalkGraph(session: GameSession): string {
  return renderGraph(buildViewModel(session));
}

/**
 * Fresh honest-walk session. Always the pinned tutorial dungeon.
 */
export function learnWalkStart(): GameSession {
  return createSession(TUTORIAL_INPUT);
}

/**
 * One demonstration step: mark what the suite said, then accuse when one
 * SHA remains. The real case never marks for the player; this walk says so.
 *
 * @param session - Current walk
 */
export function learnWalkNext(session: GameSession): GameSession {
  if (session.outcome !== "playing") {
    return session;
  }
  if (session.bisect.status === "searching") {
    return dispatch(session, session.lastResult.ok ? "good" : "bad");
  }
  if (session.bisect.status === "readyToAccuse") {
    return dispatch(session, "accuse");
  }
  return session;
}

/**
 * Walk a session with marks against the suite until it loses.
 * The exhibit shows how a bad investigation ends; it never names the
 * real first-bad.
 */
function lostWalk(): GameSession {
  let session = createSession(TUTORIAL_INPUT);
  while (session.bisect.status === "searching") {
    session = dispatch(session, session.lastResult.ok ? "bad" : "good");
  }
  const lost = dispatch(session, "accuse");
  if (lost.outcome !== "lost") {
    throw new GameError("INVALID_RANGE", "learn: the dishonest walk did not lose");
  }
  return lost;
}

/**
 * The four frozen hallways. Deterministic: pinned inputs, no wall clock.
 */
export function learnExhibits(): LearnExhibit[] {
  const tutorialStart = createSession(TUTORIAL_INPUT);
  const afterOneMark = dispatch(
    tutorialStart,
    tutorialStart.lastResult.ok ? "good" : "bad",
  );
  const yesterdayStart = createSession(YESTERDAY_INPUT);
  const lost = lostWalk();
  const lostShort = lost.bisect.accused === null ? "" : lost.bisect.accused.slice(0, 7);
  return [
    {
      id: "tutorial-start",
      caption:
        "The tutorial at minute zero. Eight suspects. The lantern is already on the midpoint.",
      svg: renderWalkGraph(tutorialStart),
    },
    {
      id: "after-one-mark",
      caption:
        "One honest mark later. Half the hallway went dark. That is the whole trick.",
      svg: renderWalkGraph(afterOneMark),
    },
    {
      id: "yesterday-start",
      caption:
        "Yesterday at minute zero. Sixteen suspects and the rot is near the end, where it always is.",
      svg: renderWalkGraph(yesterdayStart),
    },
    {
      id: "lost-walk",
      caption: `A bad investigation. Every mark argued with the suite. Accused ${lostShort}. That SHA was not the first-bad.`,
      svg: renderWalkGraph(lost),
    },
  ];
}
