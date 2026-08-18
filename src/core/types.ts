/**
 * Content-addressed fake commit id. Forty hex characters.
 */
export type Sha = string;

/**
 * Virtual file tree. Path → file text.
 */
export type Tree = Record<string, string>;

/**
 * One fake commit. `parent` is the first parent (null on root) so linear
 * log and exhibits stay the same. `parents` is empty, one SHA, or two;
 * octopus stays out.
 */
export type Commit = {
  sha: Sha;
  parent: Sha | null;
  parents: Sha[];
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
 * Which lane of the one diamond carries the first-bad.
 */
export type DiamondLane = "trunk" | "branch";

/**
 * Input for the one-fork one-join diamond. Linear histories still use
 * `GenerateInput`; this does not change that pin.
 */
export type DiamondGenerateInput = {
  suspectCount: number;
  seed: number;
  mutation: MutationId;
  firstBadLane: DiamondLane;
  firstBadOnLane: number;
};

/**
 * Measured diamond: two lanes, one merge, one tail commit (HEAD).
 */
export type DiamondLayout = {
  trunkLength: number;
  branchLength: number;
  trunkIndices: number[];
  branchIndices: number[];
  mergeIndex: number;
  tailIndex: number;
};
