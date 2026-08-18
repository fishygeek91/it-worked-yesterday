# Agent contract

Read this first. Then [docs/design.md](docs/design.md). Then the current ⬜ or ⏳ task in [TASKS.md](TASKS.md). That order is mandatory.

If code and `docs/design.md` disagree, the design doc wins until a human edits it.

## What this is

**it-worked-yesterday** — a zero-backend browser game. The dungeon is a commit graph. The boss is the first bad commit.

Tagline: **It worked yesterday. Then someone committed.**

Not a real git. Not GitQuest. Not a sequel to `sorta-fast`. Not `npc-of-the-internet`. Not a tutorial that only teaches `git bisect`.

## Session rules

1. **One `TASKS.md` task per session.** Finish its acceptance criteria. Stop. Print the next ⬜ task id and title.
2. **Ship each task on its own branch + PR + merge.** Never commit task work to `main`. Follow `.cursor/skills/ship-task/SKILL.md` (branch `task/<id>-<slug>`, push, `gh pr create`, `gh pr merge --merge --delete-branch`, return to `main`).
3. **Do not `gh repo create` or enable Pages** unless the human asked.
4. **Never weaken tests.** Do not delete, skip, or loosen a failing test to go green. Fix the code or stop and say why the test is wrong.
5. **Do not reopen locked v1 decisions.** They live in `docs/design.md` under "Locked decisions."
6. **If a locked decision blocks you**, write one paragraph to `docs/DEVIATIONS.md` (what, why, smallest workaround) and continue. Do not redesign.
7. **Do not invent** a combat system, inventory, LLM, backend, auth, or a real git/WASM port.
8. **Do not install** UI component libraries or add runtime dependencies without a one-sentence justification in `docs/DEVIATIONS.md`.
9. **Do not add** merges, blame, checkout-any, GIF export, sound, or extra levels unless the current task says so.

## Invariants

Copy these into every session. Do not "improve" them.

- **Core is a trace/state emitter.** `src/core` has zero DOM. It must run in Node tests.
- **Renderer never imports bug mutations or the suite.** It receives `{ nodes, edges, colors, head, range, lastResult }`.
- **All mark costs come from one table** in `src/core/score.ts`. Never hardcode a cost at a call site.
- **Determinism is sacred.** Same seed → identical everything. No `Math.random()`. No `Date.now()` in `src/core` or `src/harness`. Seeded PRNG is mulberry32. Stable iteration order via `repo.order`.
- **Directory contract is normative.** `src/core`, `src/harness`, `src/render`, `src/ui`, `test`, `e2e`. Do not add packages or a monorepo.
- **Exactly one first-bad.** The generator applies one mutation. The failure persists in every descendant. Every ancestor is green.
- **TypeScript is strict.** No `any`. No non-null assertion `!`. No `as unknown as T`. No casts to silence the checker. Double quotes. JSDoc on every exported function and public type. Validate at the edges. Throw `GameError` with a `code`.

## Reading order

1. This file
2. [docs/design.md](docs/design.md)
3. The current task in [TASKS.md](TASKS.md)
4. Only then the files that task names

## Quality gates

These must stay green:

```
npm test
npm run typecheck
npm run lint
```

Do not add a task's files unless those three still pass.

## Stop conditions (first sessions and after)

- A passing core + docs is a correct stop if the current task is Phase 1.
- Canvas polish is a later task. Do not "just finish the renderer" on a core session.
- Print a short "next task" line from `TASKS.md` when you stop.
