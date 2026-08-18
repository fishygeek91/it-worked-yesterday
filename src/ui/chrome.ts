import { commitAt, indexOfSha } from "../core/git";
import { costOf, optimalMarks } from "../core/score";
import type { GameSession, SessionCommand } from "../harness/session";
import { isTutorialInput, isYesterdayInput } from "../harness/tutorial";
import { shareUrl } from "../harness/url";

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
 * Case file name. Not a new level — the three v1 pins only.
 *
 * @param session - Current session
 */
function caseName(session: GameSession): string {
  if (isTutorialInput(session.input)) {
    return "Tutorial";
  }
  if (isYesterdayInput(session.input)) {
    return "Yesterday";
  }
  return "Seeded";
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
  return `<button type="button" class="cmd cmd-${command}" data-command="${command}" data-cost="${String(cost)}"${disabled}>${command}</button>`;
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
  const current = commitAt(session.bisect.repo, session.bisect.current);
  const shortSha = current.sha.slice(0, 7);
  const outcome = outcomeCopy(session);
  const outcomeBlock = outcome === "" ? "" : `<p class="outcome">${outcome}</p>`;
  const teach = isTutorialInput(session.input)
    ? [
        `<div class="brief">`,
        `<p class="teach">HEAD is red. The last green is 8 suspects back.</p>`,
        `<p class="teach">Mark the checkout. The range narrows.</p>`,
        `<p class="teach">When one SHA remains, accuse it.</p>`,
        `</div>`,
      ].join("")
    : "";
  const share =
    !isTutorialInput(session.input) && !isYesterdayInput(session.input)
      ? `<p class="share">${escapeHtml(shareUrl(session))}</p>`
      : "";
  const roomTone = session.lastResult.ok ? "lamp" : "rot";
  const phase = session.outcome === "playing" ? (canAccuse ? "ready" : "searching") : session.outcome;
  const meterPct = Math.round((remaining / session.bisect.suspectCount) * 100);
  return [
    `<section id="chrome" data-phase="${phase}">`,
    `<header class="masthead">`,
    `<p class="wordmark">it-worked-yesterday</p>`,
    `<p class="tagline">It worked yesterday. Then someone committed.</p>`,
    `<p class="case">${escapeHtml(caseName(session))}</p>`,
    `</header>`,
    teach,
    `<div class="hud">`,
    `<p class="marks">${String(session.marks)} / ${String(optimal)}</p>`,
    `<p class="seed">seed ${escapeHtml(String(session.input.seed))}</p>`,
    share,
    `</div>`,
    `<div class="desk">`,
    `<p class="checkout"><span class="sha">${escapeHtml(shortSha)}</span> ${escapeHtml(current.message)}</p>`,
    `<p class="room" data-tone="${roomTone}">${roomCopy(session)}</p>`,
    `<p class="range">Remaining suspects: ${String(remaining)}.</p>`,
    `<div class="meter" aria-hidden="true"><span style="width:${String(meterPct)}%"></span></div>`,
    `<p class="fairness">The clock is marks, not wall time. The suite does not mark for you.</p>`,
    outcomeBlock,
    `<div class="actions">`,
    commandButton("good", searching),
    commandButton("bad", searching),
    commandButton("accuse", canAccuse),
    commandButton("reset", true),
    `</div>`,
    `<p class="keys">g good · b bad · a accuse · r reset</p>`,
    `</div>`,
    `</section>`,
  ].join("");
}
