import { firstChangedFile } from "../core/diff";
import { commitAt, indexOfSha } from "../core/git";
import { costOf, optimalMarks } from "../core/score";
import type { GameSession, SessionCommand } from "../harness/session";
import { isTutorialInput, isYesterdayInput } from "../harness/tutorial";
import { shareUrl } from "../harness/url";

/**
 * Extra visit facts the desk needs. Not part of the seed.
 */
export type ChromeVisit = {
  tutorialDone: boolean;
  helpOpen?: boolean;
};

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
  return session.input.suspectCount === 64 ? "Seeded 64" : "Seeded 32";
}

/**
 * Last blame line. Path only — the hunk stays on the win exhibit.
 *
 * @param session - Current session
 */
function peekCopy(session: GameSession): string {
  if (session.lastPeek === null) {
    return "";
  }
  if (session.lastPeek.path === null) {
    return `<p class="peek">Peek: no path changed.</p>`;
  }
  return `<p class="peek">Peek: ${escapeHtml(session.lastPeek.path)}</p>`;
}

/**
 * Case-file help. Hidden after a win so the exhibit stays the headline.
 *
 * @param open - Keep the panel open across paints
 */
function helpCopy(open: boolean): string {
  const openAttr = open ? " open" : "";
  return [
    `<details class="help"${openAttr}>`,
    `<summary>?</summary>`,
    `<p>g good · b bad · l blame · a accuse · r reset</p>`,
    `<p>Blame costs two marks. It names the path that changed since the last green, not the SHA.</p>`,
    `</details>`,
  ].join("");
}

/**
 * One command button. Cost comes from `costOf` only.
 *
 * @param command - Session command
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
    const accused = session.bisect.accused;
    if (accused === null) {
      return "Accused. That SHA was not the first-bad.";
    }
    return `Accused ${accused.slice(0, 7)}. That SHA was not the first-bad.`;
  }
  return "";
}

/**
 * The interview record, read back only on a loss. Every mark is a line:
 * the room, what the player said, what the suite said. A lost case always
 * contains at least one argument with the suite — this is where it shows.
 *
 * @param session - Current session
 */
function ledgerCopy(session: GameSession): string {
  if (session.outcome !== "lost" || session.ledger.length === 0) {
    return "";
  }
  const lines = session.ledger
    .map((entry) => {
      const suite = entry.suiteOk ? "green" : "red";
      const lied = entry.suiteOk !== (entry.said === "good");
      const cls = lied ? "ledger-line is-lie" : "ledger-line";
      return `<li class="${cls}"><span class="ledger-sha">${escapeHtml(entry.sha.slice(0, 7))}</span> — you said ${entry.said}. The suite said ${suite}.</li>`;
    })
    .join("");
  return [
    `<aside class="ledger">`,
    `<p class="ledger-head">The interview record.</p>`,
    `<ol class="ledger-lines">${lines}</ol>`,
    `<p class="ledger-note">Read it back. Somewhere in here you argued with the suite.</p>`,
    `</aside>`,
  ].join("");
}

/**
 * Next uint32 seed. Wrap, do not read the wall clock.
 *
 * @param seed - Current seed
 */
function nextSeed(seed: number): number {
  return (seed + 1) >>> 0;
}

/**
 * One case door. `aria-current` marks the open file.
 *
 * @param href - Query
 * @param label - Door copy
 * @param current - This is the open case
 */
function doorLink(href: string, label: string, current: boolean): string {
  const cls = current ? "door is-current" : "door";
  const currentAttr = current ? " aria-current=\"page\"" : "";
  return `<a class="${cls}" href="${href}"${currentAttr}>${label}</a>`;
}

/**
 * Which door is the open case file. `none` for the invalid-share desk.
 */
export type OpenCase = "tutorial" | "yesterday" | "seeded32" | "seeded64" | "learn" | "none";

/**
 * Doors into the case files. One cabinet shared by the play desk, the learn
 * page, and the invalid-share desk so the doors cannot drift apart.
 *
 * @param options - Open case, seed for the seeded doors, optional next-seed door
 */
export function renderDoors(options: {
  current: OpenCase;
  seed: number;
  next?: { n: 32 | 64; seed: number };
}): string {
  const { current, seed, next } = options;
  const parts = [
    `<nav class="doors" aria-label="cases">`,
    doorLink("?l=tutorial", "Tutorial", current === "tutorial"),
    doorLink("?l=yesterday", "Yesterday", current === "yesterday"),
    doorLink("?l=learn", "Learn", current === "learn"),
    doorLink(`?l=seeded&n=32&seed=${String(seed)}`, "Seeded 32", current === "seeded32"),
    doorLink(`?l=seeded&n=64&seed=${String(seed)}`, "Seeded 64", current === "seeded64"),
  ];
  if (next !== undefined) {
    parts.push(
      doorLink(`?l=seeded&n=${String(next.n)}&seed=${String(next.seed)}`, "Next seed", false),
    );
  }
  parts.push(`</nav>`);
  return parts.join("");
}

/**
 * Tiny exhibit: message plus the first real file that changed.
 * Shared with the learn walk so the win always shows the same evidence.
 *
 * @param session - Finished winning session
 */
export function winExhibit(session: GameSession): string {
  if (session.outcome !== "won") {
    return "";
  }
  const accused = session.bisect.accused;
  if (accused === null) {
    return "";
  }
  const bad = commitAt(session.bisect.repo, accused);
  if (bad.parent === null) {
    return "";
  }
  const parent = commitAt(session.bisect.repo, bad.parent);
  const hunk = firstChangedFile(parent.tree, bad.tree);
  if (hunk === null) {
    return "";
  }
  const rows = hunk.lines
    .map((line) => {
      const mark = line.kind === "del" ? "-" : line.kind === "add" ? "+" : " ";
      return `<div class="diff-${line.kind}">${mark} ${escapeHtml(line.text)}</div>`;
    })
    .join("");
  return [
    `<aside class="exhibit">`,
    `<p class="exhibit-msg">${escapeHtml(bad.message)}</p>`,
    `<p class="exhibit-path">${escapeHtml(hunk.path)}</p>`,
    `<pre class="diff">${rows}</pre>`,
    `</aside>`,
  ].join("");
}

/**
 * Doors into the three v1 cases. Hidden until the tutorial is finished.
 *
 * @param session - Current session
 */
function caseDoors(session: GameSession): string {
  const seed = session.input.seed;
  const n = session.input.suspectCount === 64 ? 64 : 32;
  const tutorial = isTutorialInput(session.input);
  const yesterday = isYesterdayInput(session.input);
  const current: OpenCase = tutorial
    ? "tutorial"
    : yesterday
      ? "yesterday"
      : n === 64
        ? "seeded64"
        : "seeded32";
  return renderDoors({ current, seed, next: { n, seed: nextSeed(seed) } });
}

/**
 * Render marks, seed, room copy, and v1 controls.
 *
 * @param session - Current session
 * @param visit - Tutorial lock. Doors stay closed until it is done.
 */
export function renderChrome(session: GameSession, visit?: ChromeVisit): string {
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
    : isYesterdayInput(session.input)
      ? `<div class="brief"><p class="teach">HEAD is red. It worked sixteen suspects back.</p></div>`
      : `<div class="brief"><p class="teach">HEAD is red. ${String(session.input.suspectCount)} suspects. The seed is the case number.</p></div>`;
  const query = shareUrl(session);
  const share =
    !isTutorialInput(session.input) && !isYesterdayInput(session.input)
      ? `<p class="share">${escapeHtml(query)}</p><button type="button" class="copy" data-copy="${escapeHtml(query)}">copy</button>`
      : "";
  const doors = visit !== undefined && visit.tutorialDone ? caseDoors(session) : "";
  const exhibit = winExhibit(session);
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
    session.marks > optimal ? `<p class="clock-note">Over the clock.</p>` : "",
    `<p class="seed">seed ${escapeHtml(String(session.input.seed))}</p>`,
    share,
    `</div>`,
    doors,
    `<div class="desk">`,
    `<p class="checkout"><button type="button" class="sha" data-copy="${escapeHtml(current.sha)}">${escapeHtml(shortSha)}</button> ${escapeHtml(current.message)}</p>`,
    `<p class="room" data-tone="${roomTone}">${roomCopy(session)}</p>`,
    peekCopy(session),
    `<p class="range">Remaining suspects: ${String(remaining)}.</p>`,
    canAccuse && session.outcome === "playing"
      ? `<p class="ready">One SHA remains. Accuse it.</p>`
      : "",
    `<div class="meter" aria-hidden="true"><span style="width:${String(meterPct)}%"></span></div>`,
    `<p class="fairness">The clock is marks, not wall time. The suite does not mark for you.</p>`,
    outcomeBlock,
    ledgerCopy(session),
    exhibit,
    `<div class="actions">`,
    commandButton("good", searching),
    commandButton("bad", searching),
    commandButton("blame", searching || canAccuse),
    commandButton("accuse", canAccuse),
    commandButton("reset", true),
    `</div>`,
    `<p class="keys">g good · b bad · l blame · a accuse · r reset</p>`,
    helpCopy(visit !== undefined && visit.helpOpen === true),
    `</div>`,
    `</section>`,
  ].join("");
}
