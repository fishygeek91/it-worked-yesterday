# it-worked-yesterday — design

Tagline: **It worked yesterday. Then someone committed.**

This file is the source of truth. If code and this document disagree, the document wins until a human edits it.

## Vision

A zero-backend browser game. The dungeon is a commit graph. The boss is the first bad commit.

The player wakes at a broken HEAD. A known-good ancestor is already marked. That range is the dungeon. They bisect it. They accuse one SHA. They share a seed.

It is a forensic game someone finishes. It is not a git tutorial that stops at explaining `git bisect`. It is not a combat game. It is not an algorithm race.

Tone: dry. Slightly accusatory toward history. Short sentences. UI copy sounds like a postmortem, not a dungeon master.

Good: "HEAD is red. The last green is 31 commits back."

Bad: "A foul goblin lurks in SHA 9f3a!"

## What this is not

- Not a real git implementation. Fake git only: commits, parents, trees, checkout, log, bisect range.
- Not "GitQuest." No orcs, swords, XP, loot, or "you attack the commit."
- Not a sequel to `sorta-fast`. No algorithm race. The joke is forensic, not athletic.
- Not `npc-of-the-internet`. No soulchain, no Discord, no protocol, no keys.
- Not a tutorial that only teaches `git bisect`.

Do not invent a combat system, inventory, LLM, backend, auth, or a real git/WASM port.

## Rules (v1)

### Setup

1. The generator builds a **linear** history (single parent). Merges are v2.
2. It builds a good history first. Then it applies **exactly one** authored mutation at `firstBad`.
3. That failure persists in every descendant. There is exactly one first-bad. Always.
4. The oldest commit is the known-good. It is already marked good. It does not cost a mark.
5. HEAD is the newest commit. It is already marked bad. It does not cost a mark.
6. The dungeon is the open interval of suspects: every commit after the known-good, including HEAD.

`n` is the **suspect count**, not the total commit count. History length is `n + 1` (one known-good ancestor plus `n` suspects). Tutorial `n = 8`. Yesterday `n = 16`. Seeded `n = 32` or `n = 64`.

### Loop

1. The engine checks out the midpoint of the remaining range. That commit is the current room.
2. The suite runs on that room's tree. The room is green or red.
3. The player marks it **good** or **bad** (`git bisect good` / `git bisect bad`). The work clock increments by the cost in `src/core/score.ts`.
4. The engine updates the range and checks out the new midpoint.
5. Repeat until the remaining range is a single commit (known-good and known-bad are adjacent).
6. `accuse` becomes enabled. The player accuses that SHA. If it is the planted first-bad, they win. Show the commit message and the tiny diff that did it.

The player may mark against the suite. That is a bad investigation. They can accuse the wrong SHA and lose. The engine does not auto-mark.

### Commands (v1 only)

| Command | Meaning | Enabled |
| --- | --- | --- |
| `good` | Mark current good | While searching |
| `bad` | Mark current bad | While searching |
| `reset` | Restart this seed | Always |
| `accuse` | Name the remaining SHA | Only when the range is a single commit |

Do not build `blame` or `checkout <sha>` in v1. Reserve them in the score table and the command union so v1.1 can land without inventing costs at call sites.

### Work clock

Headline score: **number of marks**.

Optimal is `ceil(log2(n))` where `n` is the number of suspects in the **initial** range.

Show `marks / optimal`. Same accounting for every level. One table. One file: `src/core/score.ts`. Never hardcode a cost at a call site.

`reset` costs 0 and zeros the clock. `accuse` costs 0. Pre-marked bounds (known-good, HEAD) do not count.

Reserved v1.1 rows (unused in v1, do not change without a human):

| Command | Cost | Why |
| --- | --- | --- |
| `good` | 1 | A bisect mark |
| `bad` | 1 | A bisect mark |
| `reset` | 0 | Same seed, new attempt |
| `accuse` | 0 | The ending, not a search step |
| `blame` | 2 | Costly peek at which path changed |
| `checkout` | 1 | Penalty move; may leave the range |

### Win

Win screen is a **1200×630** screenshot: graph with the guilty SHA lit, mark count vs optimal, seed in the corner. That image is the unit of distribution.

## Levels (v1)

Graphs are **linear only**. No merge-base, diamonds, or octopus.

| Id | Name | `n` | First-bad | Mutation | Notes |
| --- | --- | --- | --- | --- | --- |
| `tutorial` | Tutorial | 8 | Suspect index `3` (near the middle) | `offByOneLoopBound` | Copy teaches the loop in three lines. Unskippable once; then free play. |
| `yesterday` | Yesterday | 16 | Suspect index `14` (near the end) | `flippedBoolean` | The emotionally correct case. |
| `seeded` | Seeded | 32 or 64 from URL | From PRNG | From PRNG | Share mode. |

Tutorial and Yesterday pin first-bad and mutation. Seeded picks both from the seeded PRNG.

Tutorial completion lives in `localStorage` under `iwy.tutorialDone = "1"`. That is the only client persistence in v1. It is not part of the seed.

## URL schema

All of it, deterministic:

```
?l=seeded&n=32&seed=1729&marks=5
```

| Param | Type | Rules |
| --- | --- | --- |
| `l` | `"tutorial" \| "yesterday" \| "seeded"` | Required when any query is present. Default with no query: `tutorial` if unseen, else last free-play choice. |
| `n` | integer | Ignored for tutorial (8) and yesterday (16). For seeded: only `32` or `64`. |
| `seed` | uint32 | Integer in `[0, 4294967295]`. Required for seeded. Ignored for pinned levels (those levels use a pinned internal seed so fixtures stay still). |
| `marks` | integer `>= 0` | Work clock for the share card and the chrome. Not a second history. |

Same seed → identical history, identical first-bad, identical trees, identical test results.

v1 does **not** encode the mark transcript. Reloading a mid-bisect URL restores the dungeon and the displayed clock, not the partial range. Full resume is v2.

Invalid params throw `GameError` with code `INVALID_URL`. Do not coerce silently (no `n=31` → `32`).

## Determinism

- Seeded PRNG: **mulberry32**. No `Math.random()`. No `Date.now()` in `src/core` or `src/harness`.
- Stable iteration order. Walk `repo.order`. Do not depend on `Object.keys` for game logic.
- SHAs are content hashes of parent + tree + message + index. Same inputs, same SHA.
- Trees are `Record<string, string>` (path → file text). Paths are sorted when hashed.

## Fake git

Not a real git. The surface is:

- Commit: `sha`, single `parent` (`null` on root), `message`, `tree`
- `createLinearHistory`
- `checkout(repo, sha)`
- `log(repo)` — newest first, from HEAD to root
- Bisect range: `(knownGood, knownBad]` on the linear order

No blobs, no index, no refs beyond HEAD, no merge commits.

### Bisect math

Commits are indexed `0 … n` on `repo.order`. Index `0` is known-good. Index `n` is HEAD / known-bad at start.

Let `lo` be the index of the newest known-good. Let `hi` be the index of the oldest known-bad.

- Remaining suspects: `order[lo + 1] … order[hi]` inclusive. Count = `hi - lo`.
- Ready to accuse when `hi - lo === 1`. The accused SHA is `order[hi]`.
- Otherwise the midpoint index is `floor((lo + hi) / 2)`.
- That midpoint is always strictly inside `(lo, hi)` when `hi - lo >= 2`.

This is ordinary binary search for the first index where the suite fails. Worst-case marks equal `ceil(log2(n))` if the player marks what the suite said.

Why `floor((lo + hi) / 2)` and not the midpoint of the untested interior alone: it matches the usual lower-bound split and keeps the optimal-mark formula honest for power-of-two `n`.

Why the failure must persist in descendants: if a later commit were green, there would be two first-bads or a flickering suite, and bisect would be a lie.

## Bugs (room contents)

Each commit has a tiny virtual tree. The only oracle is:

```
runSuite(tree) → { ok: boolean; name: string }
```

`runSuite` **parses** trees. It does not `eval` them. The renderer never imports mutations or the suite.

The generator applies exactly one mutation at `firstBad`. Descendants keep the mutated file bytes (plus a per-commit `meta/note.txt` so SHAs differ). Ancestors keep the good file.

Eight authored mutations (each a named function + a fixture test):

1. `offByOneLoopBound` — loop bound `<` becomes `<=`
2. `flippedBoolean` — a boolean literal flips
3. `regexMissingEscape` — a regex loses an escape
4. `wrongFixtureValue` — a fixture number or string is wrong
5. `brokenComparison` — `===` becomes a broken comparison
6. `missingReturn` — a `return` is deleted
7. `invertedSortComparator` — sort comparator sign flips
8. `sliceFencepost` — a slice end is off by one

The suite is a list of named checks. A good tree passes every check. Each mutation fails exactly one check. `runSuite` returns the first failing check name, or `{ ok: true, name: "suite" }`.

v1 ships all eight. The first session may land only `offByOneLoopBound` plus the generator; the rest are a later task. The suite must stay a list so checks append.

## Fairness

- Same seed, same dungeon. Shareable.
- Optimal is shown. The clock is marks, not wall time. No hidden RNG after the seed.
- Color is not the only signal. Good / bad / unknown use shape + label as well (lamp / rot / fog, or ✓ / × / ?).
- The player can play badly and lose. The game does not correct their marks.
- Seeded `n` is 32 or 64 so `optimal` is an integer bit count (5 or 6).

## Architecture

```
URL  →  harness (session, command clock, url state)
              ↓  commands
         core (git, bisect, bugs, prng, score)     ← zero DOM, runs in Node
              ↓  view-model
         render (graph + room)  +  ui (marks, reset, seed, copy)
```

### Invariants

- **Core is a trace/state emitter.** `src/core` has zero DOM. It must run in Node tests.
- **Renderer never imports bug mutations or the suite.** It receives `{ nodes, edges, colors, head, range, lastResult }`.
- **All mark costs come from one table** in `src/core/score.ts`. Never hardcode a cost at a call site.
- **Determinism is sacred.** Same seed → identical everything.

### Directory contract (normative)

Do not add packages or a monorepo. Do not add runtime dependencies without a one-sentence justification in `docs/DEVIATIONS.md`.

```
docs/design.md      source of truth
AGENTS.md           agent contract
TASKS.md            one task per session, AC + deps
README.md           tagline, live link placeholder, one screenshot
src/core/           zero-DOM: git, bisect, bugs, prng, score
src/harness/        game session, command clock, url state
src/render/         graph + room. Consumes view-models only
src/ui/             marks, reset, seed, fairness copy
test/               unit + fuzz
e2e/                playwright: tutorial is winnable
```

### Core modules (v1)

| File | Owns |
| --- | --- |
| `src/core/errors.ts` | `GameError` + codes |
| `src/core/prng.ts` | mulberry32 |
| `src/core/hash.ts` | deterministic content SHA |
| `src/core/types.ts` | public types (`Sha`, `Tree`, `Commit`, `Repo`, …) |
| `src/core/git.ts` | linear history, checkout, log |
| `src/core/suite.ts` | `runSuite` only |
| `src/core/bugs.ts` | authored mutations |
| `src/core/generate.ts` | good history + one mutation at `firstBad` |
| `src/core/bisect.ts` | start, mark, midpoint, accuse |
| `src/core/score.ts` | cost table, `costOf`, `optimalMarks` |
| `src/core/index.ts` | public barrel |

`src/core` must not import `src/harness`, `src/render`, `src/ui`, or any DOM type.

### View-model (renderer input)

The renderer receives only:

```
{
  nodes: { sha, message, shape, label, lit }[]
  edges: { from, to }[]
  colors: { good, bad, unknown, head, range }
  head: Sha
  range: { lo: Sha, hi: Sha }
  lastResult: { ok: boolean, name: string } | null
}
```

Shape + label carry lamp / rot / fog (or ✓ / × / ?). Color is extra. Core does not own CSS.

### Errors

Validate at the edges (URL params, command names, seed). Throw typed errors:

```
class GameError extends Error {
  readonly code: GameErrorCode
}
```

Do not coerce bad input. Do not use `any`, non-null assertions, or `as unknown as T`.

## Visual language

Dark default. Must look good paused, not only in motion. No chartjunk. Tabular numerals on the mark counter.

The graph is a dungeon map: rooms (commits) and corridors (parent links).

| State | Shape | Label | Color token (not green-vs-red only) |
| --- | --- | --- | --- |
| Good / lamp | circle with a wick | ✓ or "lamp" | amber |
| Bad / rot | broken square | × or "rot" | magenta |
| Unknown / fog | dashed diamond | ? or "fog" | slate |
| HEAD | carried lantern on the current room | "HEAD" | amber rim |
| Remaining range | only lit wing | — | dim warm wash |
| Outside range | fogged | — | near-black |

HEAD is a carried lantern. Untested rooms are fogged. The remaining bisect range is the only lit wing.

Win card: 1200×630, guilty SHA lit, `marks / optimal`, seed in the corner.

## v1 / v1.1 / v2 cut

### v1 (build this)

- Linear graphs only
- Commands: `good`, `bad`, `reset`, `accuse`
- Three levels: tutorial, yesterday, seeded
- Eight authored mutations
- 200-seed fuzz bar
- URL: `l`, `n`, `seed`, `marks`
- SVG or Canvas2D renderer
- 1200×630 win card (static, screenshotable)
- GitHub Pages later (do not enable in the first session)

### v1.1 (do not build now; leave room)

- `blame` — costly peek: which path changed
- `checkout <sha>` — penalty move that can leave the range

### v2 (do not build now; do not design toward it in code)

- Merges, diamonds, octopus, merge-base
- Mark-transcript resume in the URL
- GIF export, sound, extra levels
- Real git / WASM
- Backend, auth, LLM, inventory, combat

## Stack

TypeScript (strict) + Vite + SVG or Canvas2D. No backend. `npm` is fine (single package). Live site later: GitHub Pages.

Mandatory style:

- `strict` true. No `any`. No `!`. No `as unknown as T`.
- No casts to silence the checker. If the type is wrong, fix the type.
- Double quotes for strings.
- JSDoc on every exported function and public type.
- Comments explain *why* (especially bisect range math and the persistence rule).
- Small modules. Do not reformat files you did not otherwise touch.

## Locked decisions

Do not reopen these in v1:

- Fake git, not real git
- Linear only
- `n` = suspect count
- Midpoint = `floor((lo + hi) / 2)`
- One first-bad; failure persists in descendants
- Work clock = marks from `score.ts`
- mulberry32, no `Math.random` / `Date.now` in core or harness
- Renderer does not own the rules
- No combat, inventory, LLM, backend, auth
- No UI component libraries
