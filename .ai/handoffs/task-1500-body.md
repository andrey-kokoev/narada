Implemented task 1500 by repairing operational coherence scan lifecycle snapshot checking so it no longer invokes a stale cross-embodiment shell shim.

Files changed:

- `packages/layers/cli/src/commands/coherence-scan.ts`
- `packages/layers/cli/test/commands/coherence-scan.test.ts`
- `.ai/task-lifecycle-snapshot.json`
- `.ai/do-not-open/tasks/20260518-1500-repair-coherence-scan-cross-embodiment-node-resolution.md`

Summary:

- Reproduced the original failure: `narada coherence scan --module operational --format json` reported `/mnt/d/code/narada/node_modules/.bin/narada: 16: exec: node: not found`.
- Root cause was `checkTaskLifecycleSnapshot` spawning `bash scripts/guard-task-lifecycle-db.sh`, whose `narada` resolution crossed into a stale WSL-style shim instead of the current Windows CLI embodiment.
- Replaced the shell guard invocation with a current-process check over Git posture plus `.ai/task-lifecycle.db` and `.ai/task-lifecycle-snapshot.json` mtimes.
- Preserved real stale detection with explicit mtime evidence.
- Added regressions for fresh snapshot plus failing WSL-style guard script, and for real stale snapshot detection.
- Refreshed `.ai/task-lifecycle-snapshot.json` through `narada task lifecycle export`.

Verification:

- `pnpm --filter @narada2/cli typecheck` passed.
- `pnpm --filter @narada2/cli build` passed.
- `pnpm --filter @narada2/cli exec vitest run test/commands/coherence-scan.test.ts --pool=forks --poolOptions.forks.singleFork=true` passed: 1 file, 12 tests.
- `pnpm --filter @narada2/cli test -- test/commands/coherence-scan.test.ts` printed 12 tests passing but exited after teardown with Windows status `3221225477`; the single-fork Vitest command above was the clean passing regression run.
- Before snapshot export, the built CLI reported real stale evidence as mtimes and `snapshot_freshness=snapshot_stale`, with no WSL shim evidence.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json --format json` passed.
- `narada task lifecycle status --format json` reported `snapshot_freshness=snapshot_fresh`.
- `narada coherence scan --module operational --format json` returned `finding_count=0`.
- `git diff --check -- packages/layers/cli/src/commands/coherence-scan.ts packages/layers/cli/test/commands/coherence-scan.test.ts .ai/task-lifecycle-snapshot.json .ai/do-not-open/tasks/20260518-1500-repair-coherence-scan-cross-embodiment-node-resolution.md` passed with existing LF/CRLF warnings.
