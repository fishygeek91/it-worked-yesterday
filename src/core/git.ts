import { GameError } from "./errors";
import { contentSha, treePayload } from "./hash";
import type { Commit, Repo, Sha, Tree } from "./types";

/**
 * One commit spec for a linear history. Parent is implied by position.
 */
export type LinearCommitSpec = {
  message: string;
  tree: Tree;
};

/**
 * Create a linear repo. Parent of index 0 is null. HEAD is the last commit.
 *
 * @param specs - Oldest first
 */
export function createLinearHistory(specs: readonly LinearCommitSpec[]): Repo {
  if (specs.length === 0) {
    throw new GameError("EMPTY_REPO", "linear history needs at least one commit");
  }
  const commits: Record<Sha, Commit> = {};
  const order: Sha[] = [];
  let parent: Sha | null = null;
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    if (spec === undefined) {
      throw new GameError("INVALID_INDEX", `missing spec at ${String(i)}`);
    }
    const sha = contentSha([parent ?? "root", String(i), spec.message, treePayload(spec.tree)]);
    const commit: Commit = {
      sha,
      parent,
      message: spec.message,
      tree: { ...spec.tree },
    };
    commits[sha] = commit;
    order.push(sha);
    parent = sha;
  }
  const head = order[order.length - 1];
  if (head === undefined) {
    throw new GameError("EMPTY_REPO", "linear history produced no HEAD");
  }
  return { commits, order, head };
}

/**
 * Point HEAD at `sha`. Does not change commit objects.
 *
 * @param repo - Current repo
 * @param sha - Existing commit
 */
export function checkout(repo: Repo, sha: Sha): Repo {
  const commit = repo.commits[sha];
  if (commit === undefined) {
    throw new GameError("INVALID_SHA", `unknown sha ${sha}`);
  }
  return { commits: repo.commits, order: repo.order, head: sha };
}

/**
 * Newest-first walk from HEAD to root, like `git log`.
 *
 * @param repo - Current repo
 */
export function log(repo: Repo): Commit[] {
  const out: Commit[] = [];
  let current: Sha | null = repo.head;
  const seen = new Set<Sha>();
  while (current !== null) {
    if (seen.has(current)) {
      throw new GameError("INVALID_RANGE", "cycle in fake history");
    }
    seen.add(current);
    const commit: Commit | undefined = repo.commits[current];
    if (commit === undefined) {
      throw new GameError("INVALID_SHA", `log hit unknown sha ${current}`);
    }
    out.push(commit);
    current = commit.parent;
  }
  return out;
}

/**
 * Read a commit or throw.
 *
 * @param repo - Current repo
 * @param sha - Existing commit
 */
export function commitAt(repo: Repo, sha: Sha): Commit {
  const commit = repo.commits[sha];
  if (commit === undefined) {
    throw new GameError("INVALID_SHA", `unknown sha ${sha}`);
  }
  return commit;
}

/**
 * Index of `sha` on `repo.order`, or throw.
 *
 * @param repo - Current repo
 * @param sha - Existing commit
 */
export function indexOfSha(repo: Repo, sha: Sha): number {
  const index = repo.order.indexOf(sha);
  if (index < 0) {
    throw new GameError("INVALID_SHA", `sha ${sha} is not in order`);
  }
  return index;
}

/**
 * SHA at `index` on `repo.order`, or throw.
 *
 * @param repo - Current repo
 * @param index - 0-based order index
 */
export function shaAt(repo: Repo, index: number): Sha {
  const sha = repo.order[index];
  if (sha === undefined) {
    throw new GameError("INVALID_INDEX", `no commit at index ${String(index)}`);
  }
  return sha;
}
