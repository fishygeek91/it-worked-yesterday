import type { SuiteResult, Tree } from "./types";

/**
 * Path of the collect helper the loop-bound mutation edits.
 */
export const COLLECT_PATH = "src/collect.ts";

/**
 * Path of the flag the boolean mutation edits.
 */
export const FLAG_PATH = "src/flag.ts";

/**
 * Path of the regex the escape mutation edits.
 */
export const MATCH_PATH = "src/match.ts";

/**
 * Path of the fixture the value mutation edits.
 */
export const FIXTURE_PATH = "src/fixture.ts";

/**
 * Path of the comparator the broken-comparison mutation edits.
 */
export const COMPARE_PATH = "src/compare.ts";

/**
 * Path of the compute helper the missing-return mutation edits.
 */
export const COMPUTE_PATH = "src/compute.ts";

/**
 * Path of the sort helper the inverted-comparator mutation edits.
 */
export const SORT_PATH = "src/sort.ts";

/**
 * Path of the slice helper the fencepost mutation edits.
 */
export const SLICE_PATH = "src/slice.ts";

/**
 * Check name returned when the loop bound is wrong.
 */
export const LOOP_BOUND_CHECK = "loop-bound";

/**
 * Check name returned when the boolean literal is flipped.
 */
export const FLIPPED_BOOLEAN_CHECK = "flipped-boolean";

/**
 * Check name returned when the regex lost its escape.
 */
export const REGEX_ESCAPE_CHECK = "regex-escape";

/**
 * Check name returned when the fixture value is wrong.
 */
export const FIXTURE_VALUE_CHECK = "fixture-value";

/**
 * Check name returned when `===` was broken.
 */
export const COMPARISON_CHECK = "broken-comparison";

/**
 * Check name returned when the return was deleted.
 */
export const MISSING_RETURN_CHECK = "missing-return";

/**
 * Check name returned when the sort comparator sign flipped.
 */
export const SORT_COMPARATOR_CHECK = "sort-comparator";

/**
 * Check name returned when the slice end is off by one.
 */
export const SLICE_FENCEPOST_CHECK = "slice-fencepost";

type SuiteCheck = {
  name: string;
  pass: (tree: Tree) => boolean;
};

/**
 * True when `path` exists and contains `site`. Missing file fails the check.
 *
 * @param tree - Commit tree
 * @param path - File the check owns
 * @param site - Exact good bytes
 */
function fileHas(tree: Tree, path: string, site: string): boolean {
  const src = tree[path];
  if (src === undefined) {
    return false;
  }
  return src.includes(site);
}

const CHECKS: readonly SuiteCheck[] = [
  {
    name: LOOP_BOUND_CHECK,
    // Why parse, not eval: trees are player-visible bytes, and the oracle
    // must be the same in Node tests and the browser.
    pass: (tree) => {
      const src = tree[COLLECT_PATH];
      if (src === undefined) {
        return false;
      }
      return /for \(let i = 0; i < xs\.length; i \+= 1\)/.test(src);
    },
  },
  {
    name: FLIPPED_BOOLEAN_CHECK,
    pass: (tree) => fileHas(tree, FLAG_PATH, "export const enabled = true;"),
  },
  {
    name: REGEX_ESCAPE_CHECK,
    pass: (tree) => fileHas(tree, MATCH_PATH, "export const DOT = /\\./;"),
  },
  {
    name: FIXTURE_VALUE_CHECK,
    pass: (tree) => fileHas(tree, FIXTURE_PATH, "export const EXPECTED_COUNT = 3;"),
  },
  {
    name: COMPARISON_CHECK,
    pass: (tree) => fileHas(tree, COMPARE_PATH, "a === b"),
  },
  {
    name: MISSING_RETURN_CHECK,
    pass: (tree) => fileHas(tree, COMPUTE_PATH, "return n * 2;"),
  },
  {
    name: SORT_COMPARATOR_CHECK,
    pass: (tree) => fileHas(tree, SORT_PATH, "=> a - b"),
  },
  {
    name: SLICE_FENCEPOST_CHECK,
    // Why include the closing paren: the fencepost edit is `length + 1`, which
    // still contains the `xs.slice(1, xs.length` prefix.
    pass: (tree) => fileHas(tree, SLICE_PATH, "xs.slice(1, xs.length)"),
  },
];

/**
 * Only oracle. Returns the first failing check name, or `{ ok: true, name: "suite" }`.
 *
 * @param tree - Commit tree
 */
export function runSuite(tree: Tree): SuiteResult {
  for (const check of CHECKS) {
    if (!check.pass(tree)) {
      return { ok: false, name: check.name };
    }
  }
  return { ok: true, name: "suite" };
}
