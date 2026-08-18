import {
  applyMutation,
  createLinearHistory,
  GameError,
  goodTree,
  mulberry32,
  type GeneratedHistory,
  type LinearCommitSpec,
  type MutationId,
} from "../core";

/**
 * The one locked real-git exception, and it is narrow: an **importer**
 * behind the existing fake-git session. Input is a user-supplied
 * `git fast-export` file parsed here, in text, in the browser. No WASM,
 * no server, no auth — nothing leaves the page. Merge commits are
 * refused: DAGs stay generated, not imported. Determinism: the seed is
 * an FNV-1a hash of the export bytes, so the same file always plants the
 * same dungeon. No `Date.now`, no `Math.random`.
 */

/**
 * Session pin for an imported case. Real commit subjects ride along;
 * everything else (trees, mutation, first-bad) is planted from the seed,
 * so `reset` replants the identical dungeon from this kept input.
 */
export type ImportInput = {
  subjects: readonly string[];
  suspectCount: number;
  firstBadIndex: number;
  seed: number;
  mutation: MutationId;
};

/**
 * Import bounds. The known-good is the oldest commit, so the chain must
 * hold one more commit than suspects.
 */
export const IMPORT_MIN_SUSPECTS = 2;

/**
 * Upper import bound — the seeded-level ceiling.
 */
export const IMPORT_MAX_SUSPECTS = 64;

/**
 * 32-bit FNV-1a over the export bytes. Deterministic and cheap; this is
 * the case number, not a security hash.
 *
 * @param bytes - Raw export file bytes
 */
export function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One parsed commit record: its mark (if any), the subject line of its
 * message, and the mark of its first parent (if any).
 */
export type ExportCommit = {
  mark: string | null;
  subject: string | null;
  parent: string | null;
};

/**
 * Refuse the import with a stable code and a postmortem line.
 *
 * @param reason - What the parser could not accept
 */
function refuse(reason: string): never {
  throw new GameError("INVALID_IMPORT", reason);
}

/**
 * Parse a `git fast-export` stream into its commit records, oldest
 * record first as written. The parser reads bytes, not lines of a
 * decoded string, because `data <count>` blocks are counted in bytes:
 * blob contents are skipped by that count, never scanned — so file
 * contents that look like stream commands cannot confuse it.
 *
 * @param bytes - Raw export file bytes
 */
export function parseFastExport(bytes: Uint8Array): readonly ExportCommit[] {
  const decoder = new TextDecoder();
  const commits: ExportCommit[] = [];
  // Last mark exported per ref: fast-export may omit `from` when a
  // commit continues the ref the previous record left off.
  const refTips = new Map<string, string>();
  let context: "commit" | "other" = "other";
  let at = 0;

  /** Decode one LF-terminated line and advance past it. */
  const readLine = (): string | null => {
    if (at >= bytes.length) {
      return null;
    }
    let end = at;
    while (end < bytes.length && bytes[end] !== 0x0a) {
      end += 1;
    }
    const line = decoder.decode(bytes.subarray(at, end));
    at = end < bytes.length ? end + 1 : end;
    return line;
  };

  /** Skip a counted data block; return its bytes only when asked. */
  const readData = (countText: string, keep: boolean): string => {
    if (countText.startsWith("<<")) {
      refuse("delimited data blocks are not supported; use counted fast-export output");
    }
    const count = Number(countText);
    if (!Number.isInteger(count) || count < 0) {
      refuse(`unreadable data count ${countText}`);
    }
    const body = keep ? decoder.decode(bytes.subarray(at, at + count)) : "";
    at += count;
    // fast-export writes one uncounted LF after the block.
    if (at < bytes.length && bytes[at] === 0x0a) {
      at += 1;
    }
    return body;
  };

  for (;;) {
    const line = readLine();
    if (line === null) {
      break;
    }
    if (line.startsWith("commit ")) {
      const ref = line.slice("commit ".length);
      const record: ExportCommit = {
        mark: null,
        subject: null,
        parent: refTips.get(ref) ?? null,
      };
      commits.push(record);
      context = "commit";
      // Read the commit record body until its message data block.
      for (;;) {
        const body = readLine();
        if (body === null) {
          refuse("commit record ended before its message");
        }
        if (body.startsWith("mark :")) {
          record.mark = body.slice("mark ".length);
          refTips.set(ref, record.mark);
          continue;
        }
        if (body.startsWith("data ")) {
          const message = readData(body.slice("data ".length), true);
          const firstLine = message.split("\n")[0];
          record.subject = firstLine === undefined || firstLine.length === 0 ? "(no subject)" : firstLine;
          break;
        }
        if (
          body.startsWith("author ") ||
          body.startsWith("committer ") ||
          body.startsWith("original-oid ") ||
          body.startsWith("encoding ")
        ) {
          continue;
        }
        refuse(`unexpected line in a commit header: ${body}`);
      }
      continue;
    }
    if (context === "commit" && line.startsWith("merge ")) {
      // The refuse-octopus-from-disk rule: DAGs stay generated.
      refuse("merge commits cannot be imported; export a linear branch");
    }
    if (context === "commit" && line.startsWith("from ")) {
      const parent = line.slice("from ".length);
      const record = commits[commits.length - 1];
      if (record === undefined) {
        refuse("from line outside a commit record");
      }
      record.parent = parent;
      continue;
    }
    if (line.startsWith("data ")) {
      // A counted block outside a commit message (blob or tag body):
      // skip it by byte count without reading it.
      readData(line.slice("data ".length), false);
      continue;
    }
    if (
      line.startsWith("blob") ||
      line.startsWith("reset ") ||
      line.startsWith("tag ") ||
      line.length === 0 ||
      line.startsWith("M ") ||
      line.startsWith("D ") ||
      line.startsWith("R ") ||
      line.startsWith("C ") ||
      line.startsWith("N ") ||
      line === "deleteall" ||
      line.startsWith("mark :") ||
      line.startsWith("original-oid ") ||
      // A tag record's pointer and author. Only a commit-context `from`
      // is a parent; this one is annotation and is skipped.
      line.startsWith("from ") ||
      line.startsWith("tagger ") ||
      line.startsWith("progress ") ||
      line.startsWith("checkpoint") ||
      line.startsWith("feature ") ||
      line.startsWith("option ") ||
      line.startsWith("alias") ||
      line === "done"
    ) {
      if (line.startsWith("blob") || line.startsWith("reset ") || line.startsWith("tag ")) {
        context = "other";
      }
      continue;
    }
    refuse(`unreadable fast-export line: ${line}`);
  }
  return commits;
}

/**
 * Walk the parsed records from the exported tip back to the root and
 * return the subjects oldest first. The tip is the last commit record in
 * the stream — the commit the export ends on.
 *
 * @param commits - Parsed commit records
 */
function chainSubjects(commits: readonly ExportCommit[]): readonly string[] {
  const tip = commits[commits.length - 1];
  if (tip === undefined) {
    refuse("the export holds no commits");
  }
  const byMark = new Map<string, ExportCommit>();
  for (const commit of commits) {
    if (commit.mark !== null) {
      byMark.set(commit.mark, commit);
    }
  }
  const subjects: string[] = [];
  let current: ExportCommit | undefined = tip;
  while (current !== undefined) {
    if (current.subject === null) {
      refuse("a commit record has no message");
    }
    subjects.push(current.subject);
    if (current.parent === null) {
      current = undefined;
      continue;
    }
    const parent = byMark.get(current.parent);
    if (parent === undefined) {
      refuse(`a parent could not be resolved: ${current.parent}`);
    }
    current = parent;
  }
  subjects.reverse();
  return subjects;
}

/**
 * The eight authored mutations, in `MutationId` order, for the seeded
 * pick below. Data, not behavior — the mutation itself still comes from
 * `applyMutation`.
 */
const MUTATION_IDS: readonly MutationId[] = [
  "offByOneLoopBound",
  "flippedBoolean",
  "regexMissingEscape",
  "wrongFixtureValue",
  "brokenComparison",
  "missingReturn",
  "invertedSortComparator",
  "sliceFencepost",
];

/**
 * Turn one export file into a session pin: subjects from disk, seed from
 * FNV-1a of the bytes, and one seeded mutation planted at one seeded
 * first-bad. Refuses merges (in the parser) and chains outside 2–64
 * suspects. Same file, same pin — always.
 *
 * @param bytes - Raw export file bytes
 */
export function importCase(bytes: Uint8Array): ImportInput {
  const subjects = chainSubjects(parseFastExport(bytes));
  const suspectCount = subjects.length - 1;
  if (suspectCount < IMPORT_MIN_SUSPECTS || suspectCount > IMPORT_MAX_SUSPECTS) {
    refuse(
      `imports need ${String(IMPORT_MIN_SUSPECTS)}-${String(IMPORT_MAX_SUSPECTS)} suspects; this chain yields ${String(suspectCount)}`,
    );
  }
  const seed = fnv1a(bytes);
  const rng = mulberry32(seed);
  const firstBadIndex = rng.nextInt(suspectCount);
  const mutation = MUTATION_IDS[rng.nextInt(MUTATION_IDS.length)];
  if (mutation === undefined) {
    refuse("the seed failed to pick a mutation");
  }
  return { subjects, suspectCount, firstBadIndex, seed, mutation };
}

/**
 * Plant the imported dungeon: a linear history with the real subjects as
 * messages, synthetic seeded trees, and exactly one authored mutation
 * from `firstBadIndex` on. Engine SHAs stay ours — they hash our
 * messages, trees, and parents, not the original repository's.
 *
 * @param input - Kept import pin
 */
export function generateImportedHistory(input: ImportInput): GeneratedHistory {
  const { subjects, suspectCount, firstBadIndex, seed, mutation } = input;
  if (subjects.length !== suspectCount + 1) {
    refuse("the kept import lost its chain");
  }
  const rng = mulberry32(seed);
  const specs: LinearCommitSpec[] = [];
  const rootSubject = subjects[0];
  if (rootSubject === undefined) {
    refuse("the kept import has no root");
  }
  specs.push({
    message: rootSubject,
    tree: goodTree(`root salt ${String(rng.nextInt(0x7fffffff))}`),
  });
  for (let suspect = 0; suspect < suspectCount; suspect += 1) {
    const subject = subjects[suspect + 1];
    if (subject === undefined) {
      refuse("the kept import lost a subject");
    }
    const salt = rng.nextInt(0x7fffffff);
    let tree = goodTree(`commit ${String(suspect + 1)} salt ${String(salt)}`);
    if (suspect >= firstBadIndex) {
      // The persistence rule: every descendant keeps the mutated file,
      // so exactly one first-bad exists.
      tree = applyMutation(tree, mutation);
    }
    specs.push({ message: subject, tree });
  }
  const repo = createLinearHistory(specs);
  const knownGood = repo.order[0];
  const knownBad = repo.order[repo.order.length - 1];
  const firstBad = repo.order[firstBadIndex + 1];
  if (knownGood === undefined || knownBad === undefined || firstBad === undefined) {
    refuse("the imported generator failed to pin bounds");
  }
  return { repo, firstBad, knownGood, knownBad };
}
