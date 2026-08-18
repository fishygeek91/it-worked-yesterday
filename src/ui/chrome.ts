import { indexOfSha } from "../core/git";
import { costOf, optimalMarks } from "../core/score";
import type { GameSession, SessionCommand } from "../harness/session";

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
 * One command button. Cost comes from `costOf` only.
 *
 * @param command - v1 command
 * @param enabled - Whether the control is live
 */
function commandButton(command: SessionCommand, enabled: boolean): string {
  const cost = costOf(command);
  const disabled = enabled ? "" : " disabled";
  return `<button type="button" data-command="${command}" data-cost="${String(cost)}"${disabled}>${command}</button>`;
}

/**
 * Room status from the last suite result. Display only; does not mark.
 *
 * @param session - Current session
 */
function roomCopy(session: GameSession): string {
  if (session.lastResult.ok) {
    return "This checkout is green. The suite passed.";
  }
  return `This checkout is red. Failed: ${escapeHtml(session.lastResult.name)}.`;
}

/**
 * Outcome line after accuse. Not the 1200×630 win card.
 *
 * @param session - Current session
 */
function outcomeCopy(session: GameSession): string {
  if (session.outcome === "won") {
    return "Accused. That SHA was the first-bad.";
  }
  if (session.outcome === "lost") {
    return "Accused. That SHA was not the first-bad.";
  }
  return "";
}

/**
 * Render marks, seed, room copy, and v1 controls.
 *
 * @param session - Current session
 */
export function renderChrome(session: GameSession): string {
  const searching = session.bisect.status === "searching";
  const canAccuse = session.bisect.status === "readyToAccuse";
  const optimal = optimalMarks(session.bisect.suspectCount);
  const lo = indexOfSha(session.bisect.repo, session.bisect.knownGood);
  const hi = indexOfSha(session.bisect.repo, session.bisect.knownBad);
  const remaining = hi - lo;
  const outcome = outcomeCopy(session);
  const outcomeBlock = outcome === "" ? "" : `<p class="outcome">${outcome}</p>`;
  return [
    `<section id="chrome">`,
    `<p class="marks">${String(session.marks)} / ${String(optimal)}</p>`,
    `<p class="seed">seed ${escapeHtml(String(session.input.seed))}</p>`,
    `<p class="room">${roomCopy(session)}</p>`,
    `<p class="range">Remaining suspects: ${String(remaining)}.</p>`,
    `<p class="fairness">The clock is marks, not wall time. The suite does not mark for you.</p>`,
    outcomeBlock,
    `<div class="actions">`,
    commandButton("good", searching),
    commandButton("bad", searching),
    commandButton("accuse", canAccuse),
    commandButton("reset", true),
    `</div>`,
    `</section>`,
  ].join("");
}
