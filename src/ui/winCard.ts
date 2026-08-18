import { GameError } from "../core/errors";
import { optimalMarks } from "../core/score";
import type { GameSession } from "../harness/session";
import { buildViewModel, renderGraph } from "../render";

/**
 * Escape text for HTML text and attributes.
 *
 * @param value - Raw text
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 1200×630 screenshot surface. Win only. Guilty SHA is the accused checkout.
 *
 * @param session - Finished winning session
 */
export function renderWinCard(session: GameSession): string {
  const accused = session.bisect.accused;
  if (session.outcome !== "won" || accused === null) {
    throw new GameError("NOT_READY_TO_ACCUSE", "win card needs a winning accuse");
  }
  const optimal = optimalMarks(session.bisect.suspectCount);
  const graph = renderGraph(buildViewModel(session));
  return [
    `<article id="win-card" style="width:1200px;height:630px">`,
    graph,
    `<p class="win-sha">${escapeHtml(accused)}</p>`,
    `<p class="win-marks">${String(session.marks)} / ${String(optimal)}</p>`,
    `<p class="win-seed">seed ${escapeHtml(String(session.input.seed))}</p>`,
    `</article>`,
  ].join("");
}
