import { GameError } from "../core/errors";
import { optimalMarks } from "../core/score";
import type { GameSession } from "../harness/session";
import { shareUrl } from "../harness/url";
import { buildViewModel, renderGraph } from "../render";
import { caseName } from "./chrome";

/**
 * Escape text for SVG attributes and text nodes.
 *
 * @param value - Raw text
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Guard: the share kit exists only after a winning accuse.
 * Why throw instead of returning empty: a silent empty card would let the
 * chrome ship a broken control; the desk should fail loudly like the win card.
 *
 * @param session - Session to check
 */
function requireWin(session: GameSession): string {
  const accused = session.bisect.accused;
  if (session.outcome !== "won" || accused === null) {
    throw new GameError("NOT_READY_TO_ACCUSE", "share kit needs a winning accuse");
  }
  return accused;
}

/**
 * Spoiler-free result line for the clipboard. Names the case, the clock,
 * and the seed — never the guilty SHA, so a pasted result does not solve
 * the dungeon for the next player. The absolute link is appended by the
 * caller, which owns the page origin.
 *
 * @param session - Finished winning session
 */
export function shareText(session: GameSession): string {
  requireWin(session);
  const optimal = optimalMarks(session.bisect.suspectCount);
  return [
    "It worked yesterday. Then someone committed.",
    `${caseName(session)} — accused in ${String(session.marks)} / ${String(optimal)} marks. seed ${String(session.input.seed)}.`,
  ].join("\n");
}

/**
 * Share query for the result line. Re-exported through the kit so the
 * clipboard handler needs one import, not two.
 *
 * @param session - Finished winning session
 */
export function shareQuery(session: GameSession): string {
  requireWin(session);
  return shareUrl(session);
}

/**
 * Deterministic download name for the PNG card. Derived from the case,
 * seed, and clock only — no wall clock, so the same win names the same file.
 *
 * @param session - Finished winning session
 */
export function winCardFileName(session: GameSession): string {
  requireWin(session);
  const optimal = optimalMarks(session.bisect.suspectCount);
  const slug = caseName(session).toLowerCase().replaceAll(" ", "");
  return `iwy-${slug}-seed-${String(session.input.seed)}-${String(session.marks)}-of-${String(optimal)}.png`;
}

/**
 * Nest the dungeon-map SVG inside the card at a fixed frame.
 * String surgery is safe here: `renderGraph` is ours and always opens with
 * a single `<svg ` tag.
 *
 * @param graph - Output of `renderGraph`
 */
function nestGraph(graph: string): string {
  return graph.replace(
    "<svg ",
    "<svg x=\"60\" y=\"190\" width=\"1080\" height=\"250\" preserveAspectRatio=\"xMidYMid meet\" ",
  );
}

const MONO = "IBM Plex Mono, ui-monospace, monospace";

/**
 * Self-contained 1200×630 win card as one SVG document: guilty SHA lit on
 * the map, `marks / optimal`, and the seed in the corner. No external
 * references, so a canvas can rasterize it without tainting. This is the
 * unit of distribution from the design doc, made saveable.
 *
 * @param session - Finished winning session
 */
export function renderWinCardSvg(session: GameSession): string {
  const accused = requireWin(session);
  const optimal = optimalMarks(session.bisect.suspectCount);
  const graph = nestGraph(renderGraph(buildViewModel(session)));
  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"630\" viewBox=\"0 0 1200 630\" role=\"img\" aria-label=\"win card\">",
    "<rect width=\"1200\" height=\"630\" fill=\"#12110f\" />",
    `<text x="60" y="86" font-family="${MONO}" font-size="34" fill="#e8e2d6">it-worked-yesterday</text>`,
    `<text x="60" y="122" font-family="${MONO}" font-size="17" fill="#b7b1a4">It worked yesterday. Then someone committed.</text>`,
    `<text x="1140" y="86" text-anchor="end" font-family="${MONO}" font-size="20" fill="#7d8a99">${escapeXml(caseName(session))}</text>`,
    graph,
    `<text x="60" y="498" font-family="${MONO}" font-size="15" letter-spacing="2" fill="#d65a9a">ACCUSED</text>`,
    `<text x="60" y="532" font-family="${MONO}" font-size="23" fill="#e8e2d6">${escapeXml(accused)}</text>`,
    `<text x="60" y="588" font-family="${MONO}" font-size="40" fill="#e8b86d">${String(session.marks)} / ${String(optimal)}</text>`,
    `<text x="1140" y="588" text-anchor="end" font-family="${MONO}" font-size="18" fill="#b7b1a4">seed ${escapeXml(String(session.input.seed))}</text>`,
    "</svg>",
  ].join("");
}
