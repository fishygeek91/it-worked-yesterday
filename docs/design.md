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

Do not invent a combat system, inventory, LLM, backend, or auth. The one narrow real-git exception is the v2.1 importer — an importer behind the fake-git session, never a rewrite of `src/core`. See the v2.1 section.

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

Every mark is written to a session-only interview ledger: the room SHA, what the player said, what the suite said. On a loss the desk reads the record back and flags each line that argued with the suite, so the loss teaches instead of just filing. The ledger is not persisted and clears on `reset`.

### Commands

| Command | Meaning | Enabled |
| --- | --- | --- |
| `good` | Mark current good | While searching |
| `bad` | Mark current bad | While searching |
| `reset` | Restart this seed | Always |
| `accuse` | Name the remaining SHA | Only when the range is a single commit |
| `blame` | Cost-2 peek: which path changed since the last green | While searching or ready to accuse |

`blame` names a path only. The line hunk stays on the win exhibit. Do not build `checkout <sha>` yet. It stays reserved in the score table.

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

`learn` is a fourth `l` value but not a fourth level. It is a case-file page: the rules, the clock, frozen hallway exhibits, and one honest-walk demonstration on the pinned tutorial dungeon. It plants no history of its own, and unseen visitors are still routed to the tutorial first.

## URL schema

All of it, deterministic:

```
?l=seeded&n=32&seed=1729&marks=5
```

| Param | Type | Rules |
| --- | --- | --- |
| `l` | `"tutorial" \| "yesterday" \| "seeded" \| "learn"` | Required when any query is present. Default with no query: `tutorial` if unseen, else last free-play choice. `learn` opens the case-file page; it ignores `n`, `seed`, and `marks` and plants no dungeon. |
| `n` | integer | Ignored for tutorial (8) and yesterday (16). For seeded: only `32` or `64`. |
| `seed` | uint32 | Integer in `[0, 4294967295]`. Required for seeded. Ignored for pinned levels (those levels use a pinned internal seed so fixtures stay still). |
| `marks` | integer `>= 0` | Work clock for the share card and the chrome. Not a second history. |

Same seed → identical history, identical first-bad, identical trees, identical test results.

v1 does **not** encode the mark transcript. Reloading a mid-bisect URL restores the dungeon and the displayed clock, not the partial range. Full resume is the v2.0 `t` param — see the v2.0 section.

Invalid params throw `GameError` with code `INVALID_URL`. Do not coerce silently (no `n=31` → `32`). After the tutorial lock, the desk paints that error as a postmortem. It does not invent a dungeon.

## Determinism

- Seeded PRNG: **mulberry32**. No `Math.random()`. No `Date.now()` in `src/core` or `src/harness`.
- Stable iteration order. Walk `repo.order`. Do not depend on `Object.keys` for game logic.
- SHAs are content hashes of parent + tree + message + index. Same inputs, same SHA.
- Trees are `Record<string, string>` (path → file text). Paths are sorted when hashed.

## Fake git

Not a real git. The surface is:

- Commit: `sha`, single `parent` (`null` on root), `message`, `tree` — v2.0 adds a second parent on the one merge commit; see the v2.0 section
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
- Commands: `good`, `bad`, `reset`, `accuse` (v1.1 adds `blame`)
- Three levels: tutorial, yesterday, seeded
- Eight authored mutations
- 200-seed fuzz bar
- URL: `l`, `n`, `seed`, `marks`
- SVG or Canvas2D renderer
- 1200×630 win card (static, screenshotable)
- GitHub Pages later (do not enable in the first session)

### v1.1

- `blame` — shipped: costly peek at which path changed
- `checkout <sha>` — reserved here; goes live in v2.1 (see the v2.1 section)

### v2.0 (launched — build per the v2.0 section below)

- One diamond: merge commits with two parents, one fork, one join
- Mark-transcript resume in the URL (`t`)
- One new pinned level: `merged`

### v2.1 (launched — build per the v2.1 section below)

Human-authorized 2026-08-18 (chat charter). The old v-later list, unlocked:

- `checkout <sha>` — the reserved score-table row goes live
- Octopus merges, generated DAGs, merge-base as a puzzle primitive
- Extra levels: `octopus`, `friday`, `hotfix` (the v2.1 level table only)
- Sound (UI-only latch)
- GIF export (win-only)
- Real git — one narrow importer exception, not a WASM rewrite

### Never (not this game)

- Backend, auth, LLM, inventory, combat

## v2.0

Human-authorized 2026-08-18. v1 rules stay in force except where this
section amends them. Anything this section does not amend is unchanged.
It amends exactly two locked decisions: **linear only** and **the URL
does not encode the transcript**. Every other locked decision stands.

### Resume: the `t` transcript

The URL gains one param:

| Param | Type | Rules |
| --- | --- | --- |
| `t` | string over `g`, `b`, `l` | Optional on every dungeon level. Mutually exclusive with `marks` — both present is `INVALID_URL`. |

- Replay: plant the dungeon from `l` / `n` / `seed`, then dispatch each
  letter in order — `g` → `good`, `b` → `bad`, `l` → `blame`. The restored
  range, checkout, clock, and ledger are whatever the replay says. Costs go
  through `costOf` like live play. This obsoletes the v1 "overlay, not
  replay" rule when `t` is present; `marks` keeps the old overlay behavior
  for finished games and old links.
- Illegal transcripts throw `INVALID_URL`: an unknown letter, a `g`/`b`
  after the range is a single commit, anything the live engine would
  reject. No coerce, no truncation.
- `accuse` is not in the alphabet. A finished game shares the win card and
  `marks`; the transcript is a save file for a search in progress.
- Share control: while searching, the share link carries `t`. After an
  accuse, it carries `marks` exactly as v1.

### Merges: the diamond

- A commit has `parents`: one SHA, or two on a merge commit. The root has
  none. Octopus stays out. SHAs hash both parents in order.
- The generator builds one diamond: a trunk from the known-good to HEAD,
  one feature branch that forks after the known-good and joins at one merge
  commit before HEAD. Exactly one fork, exactly one join.
- Exactly one first-bad, unchanged — but ancestry is now DAG ancestry. The
  red set is `firstBad` and every commit that can reach it through parent
  links (descendants). The other lane of the diamond is green. The join is
  red when either lane carries the bug.
- Suspect set `S`: ancestors of the known-bad (inclusive) minus ancestors
  of every known-good (inclusive). Marking `good` at `c` removes
  `ancestors(c)` from `S`. Marking `bad` at `c` shrinks `S` to
  `ancestors(c) ∩ S`. Ready to accuse when `|S| = 1`.
- Midpoint on a DAG: for each candidate `c` in `S`, let
  `w(c) = |ancestors(c) ∩ S|` (inclusive). Check out the `c` that maximizes
  `min(w(c), |S| - w(c))`. Tie-break: lowest `repo.order` index. On a
  linear history this reduces to the v1 rule, which stays byte-identical.
- The headline denominator stays `ceil(log2(n))`. A diamond walk can miss
  it by a step; the fairness copy owns that sentence, the formula does not
  move.
- View-model shape is unchanged. `range` names the newest known-good on
  the trunk and the oldest known-bad; per-node `lit` carries `S`.

### Level: merged

| Id | Name | `n` | First-bad | Mutation | Notes |
| --- | --- | --- | --- | --- | --- |
| `merged` | The feature branch | 32 | Pinned on the branch lane | `missingReturn` | v2.0. One diamond. Pinned internal seed like tutorial and yesterday. |

`l=merged` joins the `l` values. It ignores `n` and `seed` like the other
pinned levels. The renderer draws two lanes: trunk on the main row, branch
on a second row, corridors fork and join. Linear dungeons keep the v1
single-row layout byte-identical.

## v2.1

Human-authorized 2026-08-18 by chat charter. v1, v1.1, and v2.0 rules stay
in force except where this section amends them. It unlocks the old
v-later list. "Never" stays never: no backend, auth, LLM, inventory,
combat. It amends exactly three locked decisions and no others:

- **Linear only, except the single v2.0 diamond** → a generated merge
  commit may now hold more than two parents (octopus). Arbitrary DAGs
  stay generated, never imported.
- **`checkout <sha>` stays reserved** → the reserved row goes live as a
  penalty move at its reserved cost.
- **Fake git, not real git** → one narrow importer exception behind the
  existing fake-git session (see "Import a case"). Not a rewrite of
  `src/core` into libgit2. Same seed still produces the same dungeon
  when not importing.

### checkout <sha>

- New session command with one operand: `checkout <sha>` (full SHA). It
  moves the carried lantern to any commit in the repo — including one
  outside the remaining suspect set. That is the penalty: the move costs
  a mark and may buy nothing.
- Cost comes from the reserved `checkout` row through `costOf` only.
  Never hardcoded. It writes no ledger line: the ledger records the
  interview, and a walk is not testimony.
- It does not change the suspect set, the recorded bounds, or the
  status. `lastResult` becomes the suite verdict at the new room; the
  last blame peek clears.
- `good` / `bad` still require the current room to be in the suspect
  set. Outside it they throw `INVALID_MARK` and the desk disables them
  with the line `This room is outside the remaining range.` Walking back
  is another `checkout` and costs again.
- An unknown SHA throws `GameError` (`INVALID_SHA`). After the game
  ends, `checkout` is ignored like every non-reset command.
- Still not a real git checkout: HEAD moves, nothing else does.
- **Not in the transcript alphabet.** `t` stays a string over `g`, `b`,
  `l`. Why: `t` is an alphabet, not a grammar — every letter is one
  operand-free command. `checkout` names a room; encoding rooms would
  put SHAs into share links (a spoiler surface: a link could name the
  guilty room in plain text) and make the save file unbounded. A
  replayed link re-derives its checkout from the range rule, exactly as
  before. So penalty moves do not travel: a mid-search share link
  carries the evidence letters only, and the replayed clock counts the
  evidence marks only. The transcript is the interview, not the pacing.
- UI: clicking a room on the map walks there. One click, one mark.

### Octopus + merge-base

- `parents` may hold any count ≥ 0 in a generated repo. SHAs hash every
  parent in order. The 0-, 1-, and 2-parent formulas are byte-identical
  to v1 and v2.0: linear and diamond histories do not move.
- `mergeBase(repo, shas)` is a core puzzle primitive, not git-for-real:
  the best common ancestors — common ancestors of every input that are
  not themselves ancestors of another common ancestor — in `repo.order`.
  No commit-date heuristics; `repo.order` is the only tiebreak. On a
  line, the merge-base of two commits is the older. On the diamond, the
  merge-base of the two lane tips is the fork point.
- The octopus generator builds one root (the known-good), `k >= 3` lanes
  forking at the root, exactly one octopus merge joining every lane tip,
  and one tail commit (HEAD). The known-good is the merge-base of all
  lane tips — the generator asserts it. First-bad is pinned on one lane;
  the failure persists in DAG descendants; every other lane stays green;
  the join is red.
- Suspect set and max-min split are unchanged. They were defined on DAG
  ancestry in v2.0 and already reduce to the v1 line rule on linear
  histories and the v2.0 diamond rule on a two-parent diamond. Both
  reductions stay byte-identical.
- Fuzz: 200 seeded octopus DAGs join the bars. The 200-linear and
  200-diamond bars do not weaken.
- Renderer: each lane gets one row; corridors fork at the root and meet
  at the join; every commit keeps its `data-sha`; shape + label still
  carry the signal, not color alone.

### Levels (v2.1)

All pinned: they ignore `n` and `seed` like tutorial, yesterday, and
merged, and use a pinned internal seed. Same clock, same cost table,
same postmortem tone. Doors in the cabinet. No loot, no XP, no fourth
tutorial. Unseen visitors are still routed to the tutorial first.
`octopus`, `friday`, and `hotfix` join the `l` values, case-sensitive.

| Id | Name | `n` | Graph | First-bad | Mutation |
| --- | --- | --- | --- | --- | --- |
| `octopus` | The release train | 32 | 3 lanes of 10, one octopus join | Lane index `1`, suspect `4` on that lane | `invertedSortComparator` |
| `friday` | The Friday deploy | 64 | Linear | Suspect index `61` | `sliceFencepost` |
| `hotfix` | The hotfix | 16 | One diamond | Trunk lane, index `3` | `brokenComparison` |

`octopus` ships with the octopus/merge-base task; `friday` and `hotfix`
ship with the extra-levels task. This table is exhaustive: no level
exists that it does not name.

### Sound

- UI-only. `src/ui/sound.ts` synthesizes short cues with the Web Audio
  API — no asset files, no runtime dependency: one cue each for a good
  mark, a bad mark, a win, a loss, and reset.
- Muted by default. One latch in the chrome toggles it for this page
  load (page memory, like the help panel — not `localStorage`). The
  `AudioContext` is created on the unmute gesture. No autoplay surprise.
- `src/core` and `src/harness` are untouched: still no `Date.now` or
  `Math.random` there. The latch never touches the clock.

### GIF export

- Win-only. A `save gif` control beside `save card`, rendered only on a
  win.
- Frames are deterministic view-model states, not a screen grab of
  chrome: replant the session from its input, replay its transcript
  letter by letter through `dispatch`, and render each state's graph
  through `renderGraph` (view-model only), ending on the accused state.
- Rasterized frames quantize to ≤ 256 colors and encode through our own
  GIF89a + LZW writer in `src/ui/gif.ts`. No runtime dependency.
- Spoiler rule: the download name and the copyable result line never
  contain the guilty SHA — the share-kit rule. The pixels show the lit
  map, exactly like the win card already does.
- The export never touches the clock, `src/core`, or `src/harness`.

### Import a case (the real-git exception)

- The one locked "fake git" exception, and it is narrow: a real-git
  **importer** behind the existing fake-git session. Not a WASM libgit2,
  not a rewrite of `src/core`. Why not WASM: a multi-megabyte runtime
  dependency to read files a text parser can read; `docs/DEVIATIONS.md`
  carries the paragraph.
- Input: a user-supplied `git fast-export` file, chosen with a file
  control on the desk. Parsed in the browser. No server, no auth,
  nothing leaves the page.
- The importer walks the commit records to the exported tip and takes
  that chain, oldest first. A merge commit from disk is refused with
  `GameError` (`INVALID_IMPORT`): DAGs stay generated, not imported.
  This is the refuse-octopus-from-disk rule.
- The chain must yield 2–64 suspects (known-good is the oldest commit).
  Outside that it is refused. No coerce, no truncation.
- Determinism: the seed is a deterministic FNV-1a hash of the export
  bytes — same file, same dungeon. The generator plants synthetic trees
  plus exactly one authored mutation from that seed. Real commit
  subjects stay on the rooms; engine SHAs stay ours; the suite still
  parses, never `eval`s.
- Imported cases have no URL: no share link, no `t`, no door. `reset`
  replants from the kept import. The win card and share kit work; the
  result line names the case `Imported`.

`INVALID_IMPORT` joins the `GameError` codes.

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

The v2.0 section amends exactly two of these: **linear only** (the
`merged` diamond, and nothing wilder) and **midpoint** (the DAG split
rule, which reduces to the v1 rule on linear histories). The v2.1
section amends exactly three: **fake git** (one narrow importer, not a
rewrite), **linear only** (generated octopus DAGs), and **`checkout`
stays reserved** (the row goes live). Do not reopen the rest:

- Fake git, not real git — except the single v2.1 importer
- Linear only — except the v2.0 diamond and generated v2.1 octopus DAGs; imports stay linear
- `n` = suspect count
- Midpoint = `floor((lo + hi) / 2)` on linear; the v2.0 max-min split on any DAG
- One first-bad; failure persists in descendants (DAG ancestry since v2.0)
- Work clock = marks from `score.ts`; `checkout` is live at its reserved cost since v2.1
- mulberry32, no `Math.random` / `Date.now` in core or harness
- Renderer does not own the rules
- No combat, inventory, LLM, backend, auth
- No UI component libraries
