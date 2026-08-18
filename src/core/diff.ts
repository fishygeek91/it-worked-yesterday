import type { Tree } from "./types";

/**
 * One line in a tiny file hunk. Context stays; the mutation is del + add.
 */
export type DiffLine = {
  kind: "ctx" | "del" | "add";
  text: string;
};

/**
 * First real file that changed. Salt notes are not the bug.
 */
export type FileDiff = {
  path: string;
  lines: DiffLine[];
};

const SALT_PATH = "meta/note.txt";

/**
 * Sorted unique paths. Stable so the same trees always pick the same file.
 *
 * @param before - Parent tree
 * @param after - Child tree
 */
function allPaths(before: Tree, after: Tree): string[] {
  const set = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  return [...set].sort();
}

/**
 * Tiny hunk around the first mismatch. One line of context when it exists.
 *
 * @param leftText - Parent file
 * @param rightText - Child file
 */
function hunkLines(leftText: string, rightText: string): DiffLine[] {
  const left = leftText.split("\n");
  const right = rightText.split("\n");
  const minLen = Math.min(left.length, right.length);
  let start = 0;
  while (start < minLen) {
    const a = left[start];
    const b = right[start];
    if (a === undefined || b === undefined || a !== b) {
      break;
    }
    start += 1;
  }
  let endLeft = left.length - 1;
  let endRight = right.length - 1;
  while (endLeft >= start && endRight >= start) {
    const a = left[endLeft];
    const b = right[endRight];
    if (a === undefined || b === undefined || a !== b) {
      break;
    }
    endLeft -= 1;
    endRight -= 1;
  }
  const lines: DiffLine[] = [];
  if (start > 0) {
    const ctx = left[start - 1];
    if (ctx !== undefined) {
      lines.push({ kind: "ctx", text: ctx });
    }
  }
  for (let i = start; i <= endLeft; i += 1) {
    const line = left[i];
    if (line !== undefined) {
      lines.push({ kind: "del", text: line });
    }
  }
  for (let i = start; i <= endRight; i += 1) {
    const line = right[i];
    if (line !== undefined) {
      lines.push({ kind: "add", text: line });
    }
  }
  return lines;
}

/**
 * First non-salt file that differs. Walks sorted paths.
 *
 * @param before - Parent tree
 * @param after - Child tree
 */
export function firstChangedFile(before: Tree, after: Tree): FileDiff | null {
  for (const path of allPaths(before, after)) {
    if (path === SALT_PATH) {
      continue;
    }
    const left = before[path];
    const right = after[path];
    const leftText = left === undefined ? "" : left;
    const rightText = right === undefined ? "" : right;
    if (leftText === rightText) {
      continue;
    }
    return { path, lines: hunkLines(leftText, rightText) };
  }
  return null;
}
