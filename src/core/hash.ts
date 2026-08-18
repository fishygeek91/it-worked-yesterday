import { GameError } from "./errors";
import type { Sha, Tree } from "./types";

/**
 * FNV-1a 32-bit. Sync and identical in Node and the browser.
 * Why not Web Crypto: core must stay sync for Node tests and the bisect loop.
 */
function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Stable string for a tree. Paths are sorted so key insertion order cannot drift SHAs.
 *
 * @param tree - Virtual files
 */
export function treePayload(tree: Tree): string {
  const paths = Object.keys(tree).sort();
  const chunks: string[] = [];
  for (const path of paths) {
    const body = tree[path];
    if (body === undefined) {
      throw new GameError("MISSING_FILE", `tree missing path ${path}`);
    }
    chunks.push(path, body);
  }
  return chunks.join("\0");
}

/**
 * Build a 40-character hex id from stable parts.
 *
 * @param parts - Already-canonical strings
 */
export function contentSha(parts: readonly string[]): Sha {
  const payload = parts.join("\0");
  const words: string[] = [];
  for (let round = 0; round < 5; round += 1) {
    const word = fnv1a(`${String(round)}\0${payload}\0${words.join("")}`);
    words.push(word.toString(16).padStart(8, "0"));
  }
  return words.join("");
}
