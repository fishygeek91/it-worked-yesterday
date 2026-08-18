/**
 * Content-addressed fake commit id. Forty hex characters.
 */
export type Sha = string;

/**
 * Virtual file tree. Path → file text.
 */
export type Tree = Record<string, string>;

/**
 * One fake commit. Single parent. Linear only in v1.
 */
export type Commit = {
  sha: Sha;
  parent: Sha | null;
  message: string;
  tree: Tree;
};

/**
 * A fake repo. Walk `order` for game logic. Do not use Object.keys as a cursor.
 */
export type Repo = {
  commits: Record<Sha, Commit>;
  order: Sha[];
  head: Sha;
};

/**
 * Oracle result. `name` is the first failing check, or "suite" when green.
 */
export type SuiteResult = {
  ok: boolean;
  name: string;
};

/**
 * Live commands plus reserved `checkout` so the score table stays one file.
 */
export type CommandName = "good" | "bad" | "reset" | "accuse" | "blame" | "checkout";

/**
 * Bisect machine status.
 */
export type BisectStatus = "searching" | "readyToAccuse" | "accused";

/**
 * Bisect search state. Core emits this; the harness owns the session clock.
 */
export type BisectState = {
  repo: Repo;
  knownGood: Sha;
  knownBad: Sha;
  current: Sha;
  marks: number;
  suspectCount: number;
  status: BisectStatus;
  accused: Sha | null;
};

/**
 * Input for building a linear buggy history.
 */
export type GenerateInput = {
  suspectCount: number;
  firstBadIndex: number;
  seed: number;
  mutation: MutationId;
};

/**
 * Planted history plus the three SHAs the session needs.
 */
export type GeneratedHistory = {
  repo: Repo;
  firstBad: Sha;
  knownGood: Sha;
  knownBad: Sha;
};

/**
 * Authored mutation ids. The generator applies exactly one at firstBad.
 */
export type MutationId =
  | "offByOneLoopBound"
  | "flippedBoolean"
  | "regexMissingEscape"
  | "wrongFixtureValue"
  | "brokenComparison"
  | "missingReturn"
  | "invertedSortComparator"
  | "sliceFencepost";
