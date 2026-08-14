# Deviations

## TASK 15 — Blame after v1 closed

Design v1 said do not build `blame` yet. The human asked to go wild after every v1 task was already ✅. Smallest workaround: land the reserved `blame` row as a v1.1 command (cost still from `src/core/score.ts`), keep `checkout` rejected, and do not add merges, sound, GIF export, or extra levels.

## TASK 18 — Learn after the three-level lock

Design v1 locked three levels and the URL union `tutorial | yesterday | seeded`. The human asked for a thorough learning page. Smallest workaround: add `learn` as a fourth `l` value that opens a case-file page and refuses to plant a dungeon (`sessionFromUrl` throws `INVALID_URL` for it), so the three playable levels, the tutorial lock, and the extra-levels ban all stay intact.

## TASK 31 — A text importer, not a WASM git

The v2.1 charter allows one real-git exception: "a WASM git used as an oracle or importer behind the existing fake-git session." We ship the importer without the WASM. A libgit2/wasm-git build is a multi-megabyte runtime dependency whose only job here would be reading files that a few hundred lines of text parsing already read: `git fast-export` output is a documented plain-text stream, and the importer only needs topology and subject lines — blob contents are skipped by their byte counts. So the smallest honest slice is a browser-side fast-export parser in `src/harness/importCase.ts`: deterministic (the seed is FNV-1a of the file bytes), isolated (no server, no auth, nothing leaves the page), zero npm runtime dependencies, merges refused so DAGs stay generated, and chains outside 2–64 suspects refused rather than coerced.
