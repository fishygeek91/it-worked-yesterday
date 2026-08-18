# Tasks

Status: ⬜ not started · ⏳ in progress · ✅ done

One task per session. Do not start the next until the current task's acceptance criteria pass. Design doc wins disputes: [docs/design.md](docs/design.md).

## Phase 0 — Scaffold

### TASK 0 — Tooling scaffold

- **Status:** ✅
- **Deps:** none
- **Deliverables:** Vite + TypeScript (strict) + Vitest + ESLint + Prettier + Playwright. Single npm package. CI runs typecheck + test + lint. MIT license. Node `.gitignore`. Scripts: `npm test`, `npm run typecheck`, `npm run lint`.
- **Acceptance:**
  - [x] `npm test`, `npm run typecheck`, and `npm run lint` exist and pass on the scaffold.
  - [x] `strict` is true. ESLint forbids `any` and non-null assertions.
  - [x] No runtime dependencies.
  - [x] CI workflow exists. Playwright is configured; e2e specs wait for Phase 5.

## Phase 1 — Core + fuzz

### TASK 1 — Core vertical slice

- **Status:** ✅
- **Deps:** TASK 0
- **Deliverables:** `src/core` only: mulberry32; fake repo (linear history, checkout, log); `runSuite`; one authored mutation (`offByOneLoopBound`) + generator that applies it at `firstBad`; bisect state machine (`start`, `mark`, midpoint, `accuse`); score table; tests.
- **Acceptance:**
  - [x] Midpoint math matches `floor((lo + hi) / 2)` and ready-to-accuse when `hi - lo === 1`.
  - [x] Bug persistence: ancestors of `firstBad` are green; it and every descendant are red.
  - [x] A hand-checked 8-suspect walk (first-bad at suspect index 3) accuses that SHA in 3 marks.
  - [x] Fuzz at least 50 seeds: exactly one first-bad; optimal walk accuses that SHA.
  - [x] All mark increments go through `costOf` in `src/core/score.ts`.
  - [x] `src/core` has zero DOM imports and runs under Vitest in Node.

### TASK 2 — Eight authored mutations

- **Status:** ✅
- **Deps:** TASK 1
- **Deliverables:** The remaining seven named mutations in `src/core/bugs.ts`, each with a fixture test. Suite stays a list of checks. Good tree passes every check.
- **Acceptance:**
  - [x] Mutations 1–8 exist as named functions: `offByOneLoopBound`, `flippedBoolean`, `regexMissingEscape`, `wrongFixtureValue`, `brokenComparison`, `missingReturn`, `invertedSortComparator`, `sliceFencepost`.
  - [x] Each has a fixture test: good tree passes; mutated tree fails exactly that check.
  - [x] `runSuite` does not `eval`. Renderer still does not import this file.

### TASK 3 — Fuzz bar (200)

- **Status:** ✅
- **Deps:** TASK 2
- **Deliverables:** Generate 200 seeded histories (vary `n`, first-bad, and mutation from mulberry32).
- **Acceptance:**
  - [x] For each seed: exactly one first-bad.
  - [x] Every ancestor of it is green; it and every descendant is red.
  - [x] An optimal bisect walk (mark what the suite said) accuses that SHA.
  - [x] Do not weaken TASK 1's 50-seed test. Extend it.

## Phase 2 — Harness + URL

### TASK 4 — Game session + command clock

- **Status:** ✅
- **Deps:** TASK 1
- **Deliverables:** `src/harness` session. Commands: `good`, `bad`, `reset`, `accuse`. Clock uses `costOf` only. Headless-winnable tutorial-sized session.
- **Acceptance:**
  - [x] `accuse` throws `GameError` unless the range is a single commit.
  - [x] `reset` rebuilds the same seed and zeros marks.
  - [x] Wrong marks can accuse the wrong SHA (lose). Engine does not auto-mark.
  - [x] No DOM in `src/harness`.

### TASK 5 — URL state

- **Status:** ✅
- **Deps:** TASK 4
- **Deliverables:** Parse and serialize `?l=seeded&n=32&seed=1729&marks=5`.
- **Acceptance:**
  - [x] Invalid params throw `GameError` with code `INVALID_URL`. No silent coerce.
  - [x] Seeded `n` only `32` or `64`. Seed is uint32.
  - [x] Same URL → identical dungeon (history, first-bad, trees, suite results).
  - [x] `marks` is the clock for chrome/share, not a second history.

## Phase 3 — Render + UI

### TASK 6 — View-model

- **Status:** ✅
- **Deps:** TASK 4
- **Deliverables:** Builder that emits `{ nodes, edges, colors, head, range, lastResult }` as specified in the design doc.
- **Acceptance:**
  - [x] `src/render` does not import `src/core/bugs.ts` or `src/core/suite.ts`.
  - [x] Each node has shape + label (lamp / rot / fog or ✓ / × / ?), not color alone.

### TASK 7 — Graph renderer

- **Status:** ✅
- **Deps:** TASK 6
- **Deliverables:** SVG or Canvas2D dungeon map. Dark default. Fog, lantern HEAD, lit remaining range.
- **Acceptance:**
  - [x] Good / bad / unknown are not green-vs-red only.
  - [x] Looks coherent paused. No chartjunk.
  - [x] Consumes the view-model only.

### TASK 8 — Room + chrome UI

- **Status:** ✅
- **Deps:** TASK 6
- **Deliverables:** `src/ui`: mark counter (tabular numerals), `marks / optimal`, reset, seed, fairness copy, good / bad / accuse controls.
- **Acceptance:**
  - [x] Copy is postmortem tone. No dungeon-master voice.
  - [x] Accuse disabled until the range is a single commit.
  - [x] Costs still come only from `score.ts`.

### TASK 9 — Win card 1200×630

- **Status:** ✅
- **Deps:** TASK 7, TASK 8
- **Deliverables:** Screenshot surface: graph with guilty SHA lit, mark count vs optimal, seed in the corner.
- **Acceptance:**
  - [x] Element is 1200×630.
  - [x] Contains SHA, `marks / optimal`, and seed.

## Phase 4 — Tutorial + two levels

### TASK 10 — Tutorial

- **Status:** ✅
- **Deps:** TASK 4, TASK 8
- **Deliverables:** Linear `n=8`, first-bad suspect index `3`, mutation `offByOneLoopBound`. Three-line teach copy. Unskippable once (`localStorage` key `iwy.tutorialDone`).
- **Acceptance:**
  - [x] First visit cannot skip.
  - [x] After completion, free play is allowed.
  - [x] First-bad and mutation stay pinned.

### TASK 11 — Yesterday

- **Status:** ✅
- **Deps:** TASK 10
- **Deliverables:** Linear `n=16`, first-bad suspect index `14`, mutation `flippedBoolean`.
- **Acceptance:**
  - [x] Pinned first-bad is in the last quarter.
  - [x] Same clock accounting as tutorial.

### TASK 12 — Seeded share mode

- **Status:** ✅
- **Deps:** TASK 5, TASK 2, TASK 11
- **Deliverables:** `l=seeded`, `n` 32 or 64 from URL, mutation + first-bad from PRNG.
- **Acceptance:**
  - [x] Same seed → identical history, first-bad, trees, test results.
  - [x] No `Math.random` or `Date.now` on this path.

## Phase 5 — e2e + readme

### TASK 13 — Playwright: tutorial is winnable

- **Status:** ✅
- **Deps:** TASK 10, TASK 8
- **Deliverables:** `e2e/` spec that plays the tutorial by marking what the room said and accuses.
- **Acceptance:**
  - [x] Spec reaches a win without skipping the tutorial by cheat.
  - [x] Does not import mutations. Drives the UI.

### TASK 14 — README screenshot + live placeholder

- **Status:** ✅
- **Deps:** TASK 9
- **Deliverables:** README "Play live" placeholder, one real screenshot of the win card, local run instructions, link to design.
- **Acceptance:**
  - [x] What-it-is stays ≤ 6 lines.
  - [x] Live URL is a placeholder until Pages is enabled by a human.

## Phase 6 — v1.1

### TASK 15 — Blame peek + long hall

- **Status:** ✅
- **Deps:** TASK 8, TASK 12
- **Deliverables:** Live `blame` (cost 2 from `score.ts`). Path-only peek. Compressed n=32/64 halls. Yesterday one-liner. `?` help. Checkout stays rejected.
- **Acceptance:**
  - [x] `blame` increments the clock through `costOf` only and does not move the range.
  - [x] A red room names the mutated path. A green room names no path. The hunk is not shown.
  - [x] `checkout` and unknown commands still throw `INVALID_COMMAND`.
  - [x] Seeded n=32 still emits every `data-sha`. Fogged wings pack tighter than the even hallway.

### TASK 16 — Edge desk

- **Status:** ✅
- **Deps:** TASK 12, TASK 15
- **Deliverables:** Invalid URL paints a postmortem (no coerce). Lose names the accused short SHA and hides search chrome. `Over the clock.` when marks exceed optimal. Current case door. Copy flash. Seeded one-liner.
- **Acceptance:**
  - [x] `?l=seeded&n=31` still throws `INVALID_URL` in the parser and does not become n=32.
  - [x] The desk shows the parser line and case doors; it does not render a map.
  - [x] A loss names the accused short SHA and does not show the win hunk or the first-bad SHA.
  - [x] Blame that exceeds optimal prints `Over the clock.` without changing the `marks / optimal` element.
