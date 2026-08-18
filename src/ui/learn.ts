import { costOf, optimalMarks } from "../core/score";
import type { GameSession } from "../harness/session";
import { renderDoors, winExhibit } from "./chrome";
import { learnExhibits, renderWalkGraph, type LearnExhibit } from "./learnExhibits";

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
 * One learn section: mono head, then postmortem paragraphs.
 *
 * @param head - Section head
 * @param bodyHtml - Already-escaped paragraph HTML
 */
function section(head: string, bodyHtml: string): string {
  return [
    `<section class="learn-section">`,
    `<h2>${escapeHtml(head)}</h2>`,
    bodyHtml,
    `</section>`,
  ].join("");
}

/**
 * One frozen hallway with its caption.
 *
 * @param exhibit - Frozen evidence
 */
function frozen(exhibit: LearnExhibit): string {
  return [
    `<figure class="learn-exhibit" data-exhibit="${escapeHtml(exhibit.id)}">`,
    `<div class="learn-map">${exhibit.svg}</div>`,
    `<figcaption>${escapeHtml(exhibit.caption)}</figcaption>`,
    `</figure>`,
  ].join("");
}

/**
 * Status line for the honest walk. Display only; the walk marks itself.
 *
 * @param walk - Current walk session
 */
function walkStatus(walk: GameSession): string {
  if (walk.outcome === "won") {
    return "Accused. That SHA was the first-bad.";
  }
  if (walk.bisect.status === "readyToAccuse") {
    return "One SHA remains. Next accuses it.";
  }
  if (walk.lastResult.ok) {
    return "This checkout is green. The suite passed.";
  }
  return `This checkout is red. Failed: ${walk.lastResult.name}.`;
}

/**
 * The honest-walk stepper. Page memory owns the session; this only paints.
 *
 * @param walk - Current walk session
 */
function stepper(walk: GameSession): string {
  const optimal = optimalMarks(walk.bisect.suspectCount);
  const done = walk.outcome !== "playing";
  const nextDisabled = done ? " disabled" : "";
  const exhibit = walk.outcome === "won" ? winExhibit(walk) : "";
  return [
    `<section class="learn-section" id="learn-walk">`,
    `<h2>Walk it once</h2>`,
    `<p class="learn-walk-note">This walk marks what the suite said. The real case will not.</p>`,
    `<div class="learn-map">${renderWalkGraph(walk)}</div>`,
    `<p class="learn-walk-marks">${String(walk.marks)} / ${String(optimal)}</p>`,
    `<p class="learn-walk-status">${escapeHtml(walkStatus(walk))}</p>`,
    exhibit,
    `<div class="actions">`,
    `<button type="button" class="cmd" data-learn="next"${nextDisabled}>next</button>`,
    `<button type="button" class="cmd" data-learn="reset">reset walk</button>`,
    `</div>`,
    `</section>`,
  ].join("");
}

/**
 * The clock table. Costs come from `costOf` — the copy must not drift from
 * the one table in `src/core/score.ts`.
 */
function clockRows(): string {
  const rows: readonly [string, string, string][] = [
    ["good", String(costOf("good")), "a bisect mark"],
    ["bad", String(costOf("bad")), "a bisect mark"],
    ["reset", String(costOf("reset")), "same seed, new attempt"],
    ["accuse", String(costOf("accuse")), "the ending, not a search step"],
    ["blame", String(costOf("blame")), "costly peek at which path changed"],
  ];
  const body = rows
    .map(
      ([name, cost, why]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(cost)}</td><td>${escapeHtml(why)}</td></tr>`,
    )
    .join("");
  return [
    `<table class="learn-clock">`,
    `<thead><tr><th>command</th><th>marks</th><th>why</th></tr></thead>`,
    `<tbody>${body}</tbody>`,
    `</table>`,
  ].join("");
}

/**
 * The eight authored mutations, one line each. Hand copy; the page never
 * imports the mutations themselves.
 */
function mutationRows(): string {
  const rows: readonly [string, string][] = [
    ["offByOneLoopBound", "a loop bound relaxed from < to <=. One extra lap, one broken suite."],
    ["flippedBoolean", "a boolean literal flipped. The flag says the opposite of yesterday."],
    ["regexMissingEscape", "a regex lost an escape. The dot started matching everything."],
    ["wrongFixtureValue", "a fixture value edited by hand. The test data lied first."],
    ["brokenComparison", "a strict comparison loosened. Equality got an opinion."],
    ["missingReturn", "a return deleted. The function now answers with silence."],
    ["invertedSortComparator", "a sort comparator sign flipped. Order became its mirror."],
    ["sliceFencepost", "a slice end off by one. The last element went missing on purpose."],
  ];
  return rows
    .map(
      ([name, line]) =>
        `<p class="learn-mutation"><span class="learn-mutation-name">${escapeHtml(name)}</span> — ${escapeHtml(line)}</p>`,
    )
    .join("");
}

/**
 * Render the learn case file. A long postmortem with frozen exhibits and
 * one honest-walk stepper. It plants no dungeon of its own.
 *
 * @param walk - Current honest-walk session (page memory)
 */
export function renderLearn(walk: GameSession): string {
  const exhibits = learnExhibits();
  const byId = new Map(exhibits.map((exhibit) => [exhibit.id, exhibit]));
  const tutorialStart = byId.get("tutorial-start");
  const afterOneMark = byId.get("after-one-mark");
  const yesterdayStart = byId.get("yesterday-start");
  const lostWalk = byId.get("lost-walk");
  return [
    `<section id="learn">`,
    `<header class="masthead">`,
    `<p class="wordmark">it-worked-yesterday</p>`,
    `<p class="tagline">It worked yesterday. Then someone committed.</p>`,
    `<p class="case">Learn</p>`,
    `</header>`,
    renderDoors({ current: "learn", seed: 1729 }),
    `<article class="learn">`,
    `<p class="learn-lede">Learn is a case file. It is not a fourth dungeon.</p>`,

    section(
      "The case",
      [
        `<p>You wake at a broken HEAD. The suite is red and nobody is confessing.</p>`,
        `<p>Two facts are already on the desk. HEAD is bad. A known-good ancestor is green. Neither costs a mark; history handed them over before you sat down.</p>`,
        `<p>Everything between those two commits is a suspect. One of them broke it. The rest are bystanders wearing the same diff.</p>`,
      ].join(""),
    ),
    tutorialStart === undefined ? "" : frozen(tutorialStart),

    section(
      "The range is the dungeon",
      [
        `<p>n is the suspect count, not the history length. The history is n + 1 commits: one known-good ancestor, then n suspects ending at HEAD.</p>`,
        `<p>The remaining range is everything after the newest known-good, through the oldest known-bad. Remaining suspects = hi − lo. When that number is 1, the case is ready to close.</p>`,
      ].join(""),
    ),

    section(
      "The midpoint is the room",
      [
        `<p>The engine checks out floor((lo + hi) / 2). That commit is the current room. The suite runs on its tree and reports green or red.</p>`,
        `<p>The report is display. The verdict is yours. You mark the room good or bad, and the range narrows around your word, not the suite&#39;s.</p>`,
      ].join(""),
    ),
    afterOneMark === undefined ? "" : frozen(afterOneMark),

    section(
      "The suite is a witness, not a judge",
      [
        `<p>The suite does not mark for you.</p>`,
        `<p>You can mark against it. The engine will believe you, the range will narrow around a lie, and you will accuse a bystander. That is not a bug. That is a bad investigation.</p>`,
      ].join(""),
    ),

    section(
      "Why the binary search is honest",
      [
        `<p>One first-bad. The failure persists in every descendant.</p>`,
        `<p>The generator plants exactly one mutation. Every commit after it inherits the broken bytes, so the hallway is green, green, green, then red to the end. No flicker, no second culprit.</p>`,
        `<p>That is the only reason halving works. If some later commit went green again, there would be two first-bads and the range would be a lie. This dungeon does not lie about that; it saves its lying for the trees.</p>`,
      ].join(""),
    ),

    section(
      "The clock",
      [
        `<p>The clock is marks, not wall time. Optimal is ceil(log2(n)): ${String(optimalMarks(8))} for the tutorial&#39;s 8, ${String(optimalMarks(16))} for yesterday&#39;s 16, ${String(optimalMarks(32))} and ${String(optimalMarks(64))} for the seeded halls.</p>`,
        clockRows(),
        `<p>checkout is reserved and still refused. Every cost lives in one table; nothing on the desk invents its own price.</p>`,
      ].join(""),
    ),

    section(
      "Blame, the costly shortcut",
      [
        `<p>blame names the path that still differs from the last green tree. A red room gives up its file. A green room gives up nothing, because nothing changed but the salt.</p>`,
        `<p>It costs ${String(costOf("blame"))} marks and it does not move the range. The line-level hunk stays sealed until you win. Paths are cheap; evidence is for closers.</p>`,
      ].join(""),
    ),

    section(
      "How to lose",
      [
        `<p>Mark against the suite, or mark carelessly, and the last SHA standing will be the wrong one. Accuse it and the desk files the loss under that accused SHA.</p>`,
        `<p>The real first-bad stays unnamed. Reset the seed and interview the hallway again.</p>`,
      ].join(""),
    ),
    lostWalk === undefined ? "" : frozen(lostWalk),

    stepper(walk),

    section(
      "The three case files",
      [
        `<p>Tutorial — 8 suspects, first-bad at suspect index 3, offByOneLoopBound. Unskippable once; then free play.</p>`,
        `<p>Yesterday — 16 suspects, first-bad at suspect index 14, flippedBoolean. It worked sixteen suspects back. The emotionally correct case.</p>`,
        `<p>Seeded — 32 or 64 suspects from the URL, first-bad and mutation from the seed. Same seed, same dungeon, same trees, same verdicts. The share URL is the whole case.</p>`,
      ].join(""),
    ),
    yesterdayStart === undefined ? "" : frozen(yesterdayStart),

    section("Eight ways the tree lied", mutationRows()),

    section(
      "The git in this game is fake",
      [
        `<p>A commit here is a SHA, a single parent, a message, and a tiny file tree. The SHA is a content hash, so identical inputs always produce identical hallways.</p>`,
        `<p>History is linear. No merges, no diamonds, no octopus. checkout moves HEAD; log walks to the root; the bisect range is bookkeeping on indexes. Real git survives this game unharmed.</p>`,
      ].join(""),
    ),

    section(
      "What this page is not",
      [
        `<p>Not GitQuest. There are no orcs here and nothing to swing a sword at.</p>`,
        `<p>Not an algorithm race. The clock counts marks, and thinking is free.</p>`,
        `<p>Not a tutorial that stops at git bisect. The point is the investigation: trust the witness, spend the marks, accuse the right SHA.</p>`,
        `<p>The hallway is waiting. <a href="?l=tutorial">Reopen the tutorial</a> or <a href="?l=yesterday">take the Yesterday case</a>.</p>`,
      ].join(""),
    ),

    `</article>`,
    `</section>`,
  ].join("");
}
