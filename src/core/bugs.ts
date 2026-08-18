import { GameError } from "./errors";
import {
  COLLECT_PATH,
  COMPARE_PATH,
  COMPUTE_PATH,
  FIXTURE_PATH,
  FLAG_PATH,
  MATCH_PATH,
  SLICE_PATH,
  SORT_PATH,
} from "./suite";
import type { MutationId, Tree } from "./types";

/**
 * Good collect source. The suite looks for `i < xs.length`.
 */
export const COLLECT_SOURCE_GOOD = [
  "export function collect(xs: string[]): string[] {",
  "  const out: string[] = [];",
  "  for (let i = 0; i < xs.length; i += 1) {",
  "    out.push(xs[i]);",
  "  }",
  "  return out;",
  "}",
  "",
].join("\n");

const FLAG_SOURCE_GOOD = "export const enabled = true;\n";

const MATCH_SOURCE_GOOD = "export const DOT = /\\./;\n";

const FIXTURE_SOURCE_GOOD = "export const EXPECTED_COUNT = 3;\n";

const COMPARE_SOURCE_GOOD = [
  "export function same(a: string, b: string): boolean {",
  "  return a === b;",
  "}",
  "",
].join("\n");

const COMPUTE_SOURCE_GOOD = [
  "export function double(n: number): number {",
  "  return n * 2;",
  "}",
  "",
].join("\n");

const SORT_SOURCE_GOOD = "export const bySize = (a: number, b: number) => a - b;\n";

const SLICE_SOURCE_GOOD = [
  "export function rest(xs: string[]): string[] {",
  "  return xs.slice(1, xs.length);",
  "}",
  "",
].join("\n");

/**
 * A passing tree. `note` makes sibling commits hash differently.
 *
 * @param note - Written to meta/note.txt
 */
export function goodTree(note: string): Tree {
  return {
    [COLLECT_PATH]: COLLECT_SOURCE_GOOD,
    [FLAG_PATH]: FLAG_SOURCE_GOOD,
    [MATCH_PATH]: MATCH_SOURCE_GOOD,
    [FIXTURE_PATH]: FIXTURE_SOURCE_GOOD,
    [COMPARE_PATH]: COMPARE_SOURCE_GOOD,
    [COMPUTE_PATH]: COMPUTE_SOURCE_GOOD,
    [SORT_PATH]: SORT_SOURCE_GOOD,
    [SLICE_PATH]: SLICE_SOURCE_GOOD,
    "meta/note.txt": note,
  };
}

/**
 * Copy a tree and replace one site in one file.
 * Why string replace: the suite parses bytes; descendants must inherit the
 * exact mutation so the failure persists.
 *
 * @param tree - Tree to copy
 * @param path - File that holds the site
 * @param from - Good bytes
 * @param to - Mutated bytes
 * @param label - Error label when the site is missing
 */
function replaceSite(tree: Tree, path: string, from: string, to: string, label: string): Tree {
  const src = tree[path];
  if (src === undefined) {
    throw new GameError("MISSING_FILE", `mutation needs ${path}`);
  }
  const next = src.replace(from, to);
  if (next === src) {
    throw new GameError("MUTATION_SITE", `${label} site not found`);
  }
  return { ...tree, [path]: next };
}

/**
 * Off-by-one: `<` becomes `<=`.
 *
 * @param tree - Good or already-copied tree that still has the good bound
 */
export function offByOneLoopBound(tree: Tree): Tree {
  return replaceSite(tree, COLLECT_PATH, "i < xs.length", "i <= xs.length", "off-by-one");
}

/**
 * Flip a boolean literal.
 *
 * @param tree - Tree that still has `enabled = true`
 */
export function flippedBoolean(tree: Tree): Tree {
  return replaceSite(
    tree,
    FLAG_PATH,
    "export const enabled = true;",
    "export const enabled = false;",
    "flipped-boolean",
  );
}

/**
 * Drop the escape in a regex that should match a literal dot.
 *
 * @param tree - Tree that still has `/\\./`
 */
export function regexMissingEscape(tree: Tree): Tree {
  return replaceSite(tree, MATCH_PATH, "/\\./", "/./", "regex-escape");
}

/**
 * Change a fixture number.
 *
 * @param tree - Tree that still has `EXPECTED_COUNT = 3`
 */
export function wrongFixtureValue(tree: Tree): Tree {
  return replaceSite(tree, FIXTURE_PATH, "EXPECTED_COUNT = 3", "EXPECTED_COUNT = 4", "fixture-value");
}

/**
 * Break `===` into loose equality.
 *
 * @param tree - Tree that still has `a === b`
 */
export function brokenComparison(tree: Tree): Tree {
  return replaceSite(tree, COMPARE_PATH, "a === b", "a == b", "broken-comparison");
}

/**
 * Delete a `return` so the function no longer yields a value.
 *
 * @param tree - Tree that still has `return n * 2;`
 */
export function missingReturn(tree: Tree): Tree {
  return replaceSite(tree, COMPUTE_PATH, "return n * 2;", "n * 2;", "missing-return");
}

/**
 * Flip a sort comparator sign.
 *
 * @param tree - Tree that still has `=> a - b`
 */
export function invertedSortComparator(tree: Tree): Tree {
  return replaceSite(tree, SORT_PATH, "=> a - b", "=> b - a", "sort-comparator");
}

/**
 * Push a slice end one past the last index.
 *
 * @param tree - Tree that still has `xs.slice(1, xs.length)`
 */
export function sliceFencepost(tree: Tree): Tree {
  return replaceSite(
    tree,
    SLICE_PATH,
    "xs.slice(1, xs.length)",
    "xs.slice(1, xs.length + 1)",
    "slice-fencepost",
  );
}

const MUTATIONS: Record<MutationId, (tree: Tree) => Tree> = {
  offByOneLoopBound,
  flippedBoolean,
  regexMissingEscape,
  wrongFixtureValue,
  brokenComparison,
  missingReturn,
  invertedSortComparator,
  sliceFencepost,
};

/**
 * Apply one authored mutation. The generator calls this at firstBad and after.
 *
 * @param tree - Tree to copy and edit
 * @param id - Authored mutation
 */
export function applyMutation(tree: Tree, id: MutationId): Tree {
  const apply = MUTATIONS[id];
  if (apply === undefined) {
    throw new GameError("INVALID_COMMAND", `unknown mutation ${id}`);
  }
  return apply(tree);
}
