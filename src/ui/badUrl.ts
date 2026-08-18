import { GameError } from "../core/errors";
import { renderDoors, type ChromeVisit } from "./chrome";

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
 * Postmortem for a share the parser refused. Does not coerce `n` or `seed`.
 *
 * @param error - `INVALID_URL` from the harness
 * @param visit - Tutorial lock. Doors stay closed until it is done.
 */
export function renderBadUrl(error: GameError, visit?: ChromeVisit): string {
  if (error.code !== "INVALID_URL") {
    throw new GameError(error.code, "bad-url desk is only for INVALID_URL");
  }
  const doors =
    visit !== undefined && visit.tutorialDone
      ? renderDoors({ current: "none", seed: 1729 })
      : `<nav class="doors" aria-label="cases"><a class="door" href="?l=tutorial">Tutorial</a></nav>`;
  return [
    `<section id="chrome" data-phase="invalid">`,
    `<header class="masthead">`,
    `<p class="wordmark">it-worked-yesterday</p>`,
    `<p class="tagline">It worked yesterday. Then someone committed.</p>`,
    `<p class="case">Invalid share</p>`,
    `</header>`,
    `<p class="outcome">Invalid URL. The share was not coerced.</p>`,
    `<p class="room" data-tone="rot">${escapeHtml(error.message)}</p>`,
    `<p class="fairness">n is 32 or 64. seed is a uint32. Unknown keys are rejected.</p>`,
    doors,
    `</section>`,
  ].join("");
}
