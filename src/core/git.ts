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
 * One commit spec for a DAG. Parent indices must already be in `order`.
 */
export type HistoryCommitSpec = {
  message: string;
  tree: Tree;
  parentIndices: readonly number[];
};

/**
 * Content SHA for a commit. Every parent is hashed in order. The 0-, 1-,
 * and 2-parent payloads are byte-identical to v1 and v2.0, so linear and
 * diamond histories do not move. v2.1 allows any parent count (octopus).
 *
 * @param parents - Zero or more parent SHAs, in order
 * @param index - Position on `repo.order`
 * @param message - Commit message
 * @param tree - Virtual files
 */
export function hashCommit(
  parents: readonly Sha[],
  index: number,
  message: string,
  tree: Tree,
): Sha {
  if (parents.length === 0) {
    return contentSha(["root", String(index), message, treePayload(tree)]);
  }
  for (const parent of parents) {
    if (parent.length === 0) {
      throw new GameError("INVALID_SHA", "missing parent");
    }
  }
  return contentSha([...parents, String(index), message, treePayload(tree)]);
}

/**
 * Create a repo from planned parent indices. Walk `order` after this;
 * do not use Object.keys as a cursor.
 *
 * @param specs - Oldest first
 */
export function createHistory(specs: readonly HistoryCommitSpec[]): Repo {
  if (specs.length === 0) {
    throw new GameError("EMPTY_REPO", "history needs at least one commit");
  }
  const commits: Record<Sha, Commit> = {};
  const order: Sha[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    if (spec === undefined) {
      throw new GameError("INVALID_INDEX", `missing spec at ${String(i)}`);
    }
    const parents: Sha[] = [];
    for (const parentIndex of spec.parentIndices) {
      if (!Number.isInteger(parentIndex) || parentIndex < 0 || parentIndex >= i) {
        throw new GameError(
          "INVALID_INDEX",
          `parent index ${String(parentIndex)} is not before ${String(i)}`,
        );
      }
      const parentSha = order[parentIndex];
      if (parentSha === undefined) {
        throw new GameError("INVALID_INDEX", `missing parent at ${String(parentIndex)}`);
      }
      parents.push(parentSha);
    }
    const sha = hashCommit(parents, i, spec.message, spec.tree);
    const parent = parents[0] ?? null;
    commits[sha] = {
      sha,
      parent,
      parents,
      message: spec.message,
      tree: { ...spec.tree },
    };
    order.push(sha);
  }
  const head = order[order.length - 1];
  if (head === undefined) {
    throw new GameError("EMPTY_REPO", "history produced no HEAD");
  }
  return { commits, order, head };
}

/**
 * Create a linear repo. Parent of index 0 is null. HEAD is the last commit.
 *
 * @param specs - Oldest first
 */
export function createLinearHistory(specs: readonly LinearCommitSpec[]): Repo {
  const planned: HistoryCommitSpec[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    if (spec === undefined) {
      throw new GameError("INVALID_INDEX", `missing spec at ${String(i)}`);
    }
    planned.push({
      message: spec.message,
      tree: spec.tree,
      parentIndices: i === 0 ? [] : [i - 1],
    });
  }
  return createHistory(planned);
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

/**
 * Inclusive ancestors of `sha`, in `repo.order`. Walks every parent, not
 * only the first, so a merge sees both lanes.
 *
 * @param repo - Current repo
 * @param sha - Starting commit
 */
export function ancestors(repo: Repo, sha: Sha): Sha[] {
  const found = new Set<Sha>();
  const stack: Sha[] = [sha];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || found.has(current)) {
      continue;
    }
    found.add(current);
    const commit = commitAt(repo, current);
    for (const parent of commit.parents) {
      stack.push(parent);
    }
  }
  return repo.order.filter((id) => found.has(id));
}

/**
 * Best common ancestors of `shas`, in `repo.order`. A puzzle primitive,
 * not git-for-real: a common ancestor of every input that is not itself
 * an ancestor of another common ancestor. No commit-date heuristics —
 * `repo.order` is the only tiebreak. On a line, the merge-base of two
 * commits is the older one. On the diamond, the merge-base of the lane
 * tips is the fork point.
 *
 * @param repo - Current repo
 * @param shas - One or more commits
 */
export function mergeBase(repo: Repo, shas: readonly Sha[]): Sha[] {
  if (shas.length === 0) {
    throw new GameError("INVALID_SHA", "merge-base needs at least one commit");
  }
  const first = shas[0];
  if (first === undefined) {
    throw new GameError("INVALID_SHA", "merge-base needs at least one commit");
  }
  let commonSet = new Set(ancestors(repo, first));
  for (const sha of shas.slice(1)) {
    const reachable = new Set(ancestors(repo, sha));
    commonSet = new Set([...commonSet].filter((id) => reachable.has(id)));
  }
  // Drop every common ancestor that another common ancestor can reach:
  // what remains cannot be improved on, so it is "best".
  const shadowed = new Set<Sha>();
  for (const candidate of commonSet) {
    for (const ancestor of ancestors(repo, candidate)) {
      if (ancestor !== candidate) {
        shadowed.add(ancestor);
      }
    }
  }
  return repo.order.filter((id) => commonSet.has(id) && !shadowed.has(id));
}

/**
 * Inclusive descendants of `sha`, in `repo.order`. A descendant is any
 * commit that can reach `sha` by walking parent links. This is the red
 * set once `sha` is first-bad.
 *
 * @param repo - Current repo
 * @param sha - Starting commit
 */
export function descendants(repo: Repo, sha: Sha): Sha[] {
  commitAt(repo, sha);
  const children = new Map<Sha, Sha[]>();
  for (const id of repo.order) {
    const commit = commitAt(repo, id);
    for (const parent of commit.parents) {
      const list = children.get(parent);
      if (list === undefined) {
        children.set(parent, [id]);
      } else {
        list.push(id);
      }
    }
  }
  const found = new Set<Sha>();
  const stack: Sha[] = [sha];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || found.has(current)) {
      continue;
    }
    found.add(current);
    const next = children.get(current);
    if (next !== undefined) {
      for (const child of next) {
        stack.push(child);
      }
    }
  }
  return repo.order.filter((id) => found.has(id));
}
