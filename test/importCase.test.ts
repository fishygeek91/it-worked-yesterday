import { describe, expect, it } from "vitest";

import { commitAt, GameError, runSuite } from "../src/core";
import {
  createSession,
  dispatch,
  fnv1a,
  importCase,
  isImportInput,
  isTutorialInput,
  isYesterdayInput,
  parseFastExport,
  shareUrl,
  type GameSession,
} from "../src/harness";
import { renderChrome, shareText } from "../src/ui";

const FIXTURE_SOURCES = import.meta.glob("../e2e/fixtures/*.fastexport", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * Bytes of one committed fixture, loaded raw through the bundler like
 * the share-kit source test does.
 *
 * @param name - Fixture file name
 */
function fixtureBytes(name: string): Uint8Array {
  for (const [file, text] of Object.entries(FIXTURE_SOURCES)) {
    if (file.endsWith(name) && typeof text === "string") {
      return new TextEncoder().encode(text);
    }
  }
  throw new Error(`fixture ${name} not found`);
}

const LINEAR_EXPORT = fixtureBytes("imported-case.fastexport");
const MERGED_EXPORT = fixtureBytes("merged-case.fastexport");

/**
 * Fixture subjects, oldest first — what `git log --reverse` said when
 * the fixture repo was exported.
 */
const FIXTURE_SUBJECTS = [
  "boot the service",
  "add the collector",
  "parse the intake form",
  "wire the export path",
  "cache the manifest",
  "trim the audit trail",
  "batch the retries",
  "rotate the keys",
  "adjust the walk bound",
  "polish the summary",
  "ship the Friday build",
];

/**
 * Synthesize a counted fast-export stream of `count` linear commits.
 * Used to probe the 2–64 suspect bounds without giant fixtures.
 *
 * @param count - Commits in the chain
 */
function linearExport(count: number): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = ["reset refs/heads/main\n"];
  for (let i = 1; i <= count; i += 1) {
    const message = `synthetic commit ${String(i)}\n`;
    parts.push(`commit refs/heads/main\n`);
    parts.push(`mark :${String(i)}\n`);
    parts.push("author A <a@example.com> 0 +0000\n");
    parts.push("committer A <a@example.com> 0 +0000\n");
    parts.push(`data ${String(encoder.encode(message).length)}\n${message}`);
    if (i > 1) {
      parts.push(`from :${String(i - 1)}\n`);
    }
    parts.push("\n");
  }
  return encoder.encode(parts.join(""));
}

/**
 * Mark what the suite said until one SHA remains, then accuse.
 *
 * @param session - Starting session
 */
function honestWin(session: GameSession): GameSession {
  let next = session;
  while (next.bisect.status === "searching") {
    next = dispatch(next, next.lastResult.ok ? "good" : "bad");
  }
  return dispatch(next, "accuse");
}

/**
 * Expect a call to refuse with `INVALID_IMPORT`.
 *
 * @param run - Call under test
 */
function expectRefused(run: () => unknown): void {
  try {
    run();
    expect.fail("the import should have been refused");
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    if (error instanceof GameError) {
      expect(error.code).toBe("INVALID_IMPORT");
    }
  }
}

describe("parseFastExport", () => {
  it("extracts topology and subjects from a real fast-export fixture", () => {
    const commits = parseFastExport(LINEAR_EXPORT);
    expect(commits).toHaveLength(11);
    expect(commits[0]?.subject).toBe("boot the service");
    expect(commits[10]?.subject).toBe("ship the Friday build");
    // The root has no parent; every later commit names one.
    expect(commits[0]?.parent).toBeNull();
    expect(commits[1]?.parent).toBe(":3");
  });

  it("skips blob data blocks by byte count, not by scanning lines", () => {
    // The fixture's notes.txt blobs contain lines like "commit log
    // parser" that would look like stream commands to a line scanner.
    const commits = parseFastExport(LINEAR_EXPORT);
    for (const commit of commits) {
      expect(commit.subject).not.toBeNull();
    }
    expect(commits.some((commit) => commit.subject === "commit log parser")).toBe(false);
  });
});

describe("importCase", () => {
  it("refuses a merge commit from disk: DAGs stay generated", () => {
    expectRefused(() => importCase(MERGED_EXPORT));
  });

  it("refuses chains outside 2-64 suspects; no coerce, no truncation", () => {
    expectRefused(() => importCase(linearExport(2)));
    expectRefused(() => importCase(linearExport(66)));
    // The edges of the window are legal.
    expect(importCase(linearExport(3)).suspectCount).toBe(2);
    expect(importCase(linearExport(65)).suspectCount).toBe(64);
  });

  it("seeds from FNV-1a of the export bytes: same file, same pin", () => {
    const once = importCase(LINEAR_EXPORT);
    const twice = importCase(LINEAR_EXPORT);
    expect(once).toEqual(twice);
    expect(once.seed).toBe(fnv1a(LINEAR_EXPORT));
    expect(once.suspectCount).toBe(10);
    expect(once.subjects).toEqual(FIXTURE_SUBJECTS);
    // A different file is a different case.
    expect(importCase(linearExport(12)).seed).not.toBe(once.seed);
  });
});

describe("an imported session", () => {
  it("plants the same dungeon twice with exactly one first-bad", () => {
    const input = importCase(LINEAR_EXPORT);
    const first = createSession(input);
    const second = createSession(input);
    expect(second.bisect.repo.order).toEqual(first.bisect.repo.order);
    expect(second.generated.firstBad).toBe(first.generated.firstBad);
    // Exactly one first-bad: green strictly before it, red from it on.
    const order = first.bisect.repo.order;
    const firstBadAt = order.indexOf(first.generated.firstBad);
    expect(firstBadAt).toBeGreaterThan(0);
    for (let i = 0; i < order.length; i += 1) {
      const sha = order[i];
      if (sha === undefined) {
        throw new Error("order lost a sha");
      }
      const ok = runSuite(commitAt(first.bisect.repo, sha).tree).ok;
      expect(ok).toBe(i < firstBadAt);
    }
  });

  it("keeps the real subjects on the rooms while engine SHAs stay ours", () => {
    const input = importCase(LINEAR_EXPORT);
    const session = createSession(input);
    const order = session.bisect.repo.order;
    expect(order).toHaveLength(FIXTURE_SUBJECTS.length);
    for (let i = 0; i < order.length; i += 1) {
      const sha = order[i];
      if (sha === undefined) {
        throw new Error("order lost a sha");
      }
      expect(commitAt(session.bisect.repo, sha).message).toBe(FIXTURE_SUBJECTS[i]);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("is winnable by marking what the suite said, and reset replants it", () => {
    const input = importCase(LINEAR_EXPORT);
    const won = honestWin(createSession(input));
    expect(won.outcome).toBe("won");
    expect(won.bisect.accused).toBe(won.generated.firstBad);
    const reset = dispatch(won, "reset");
    expect(reset.outcome).toBe("playing");
    expect(reset.bisect.repo.order).toEqual(won.bisect.repo.order);
    expect(isImportInput(reset.input)).toBe(true);
  });

  it("has no url: no share link, no t, and no pinned-level identity", () => {
    const input = importCase(LINEAR_EXPORT);
    const session = createSession(input);
    expect(isTutorialInput(session.input)).toBe(false);
    expect(isYesterdayInput(session.input)).toBe(false);
    try {
      shareUrl(session);
      expect.fail("imported cases must have no url");
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      if (error instanceof GameError) {
        expect(error.code).toBe("INVALID_URL");
      }
    }
  });

  it("names the case Imported on the desk and in the result line", () => {
    const input = importCase(LINEAR_EXPORT);
    const session = createSession(input);
    const html = renderChrome(session, { tutorialDone: true });
    expect(html).toContain("Imported");
    expect(html).not.toContain("class=\"share\"");
    // No door is the open case.
    expect(html).not.toContain("is-current");
    const won = honestWin(session);
    const text = shareText(won);
    expect(text).toContain("Imported");
    expect(text).not.toContain(won.generated.firstBad);
  });

  it("renders the file control after the tutorial and carries a refusal note", () => {
    const input = importCase(LINEAR_EXPORT);
    const session = createSession(input);
    const unlocked = renderChrome(session, { tutorialDone: true, importNote: "merge commits cannot be imported" });
    expect(unlocked).toContain("data-import");
    expect(unlocked).toContain("merge commits cannot be imported");
    // Before the tutorial the desk has no file control.
    const locked = renderChrome(session, { tutorialDone: false });
    expect(locked).not.toContain("data-import");
  });
});
