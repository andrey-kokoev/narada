---
status: confirmed
depends_on: [1498]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T04:10:45.790Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T04:10:46.298Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Repair coherence scan cross-embodiment node resolution

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1499-1504-global-coherence-cleanup-after-operator-site-communication-relation.md

## Goal

Fix or precisely characterize the coherence scan failure where a Windows run reports a WSL-style `/mnt/d/.../narada` shim with `exec: node: not found`.

## Context

`narada coherence scan --format json` reported `task-lifecycle-snapshot-stale` with evidence `/mnt/d/code/narada/node_modules/.bin/narada: 16: exec: node: not found`, while `narada task lifecycle status` from the Windows authority surface reported the snapshot fresh. This is a cross-embodiment tool invocation coherence issue, not necessarily stale lifecycle state.

## Required Work

1. Reproduce the coherence scan failure and isolate the exact subprocess path used by the snapshot guard.
2. Inspect coherence scan operational module code and any command invocation helper used for lifecycle snapshot checks.
3. Repair the command invocation to use the declared current CLI embodiment, repo-local CLI entrypoint, or direct service path rather than a stale WSL shim.
4. Add focused regression coverage for Windows/current-process execution where the lifecycle snapshot is fresh and the scanner must not report WSL node absence.
5. Verify `narada coherence scan --module operational --format json` no longer reports the false snapshot-stale error in the current environment.

## Non-Goals

- Do not hardcode Node, NVM, WSL, or package-manager paths from memory.
- Do not silence real stale snapshot findings.
- Do not rewrite the whole coherence scanner.

## Execution Notes

- Reproduced the failure with
  `narada coherence scan --module operational --format json`: the scanner
  reported `task-lifecycle-snapshot-stale` with evidence
  `/mnt/d/code/narada/node_modules/.bin/narada: 16: exec: node: not found`.
- Isolated root cause in
  `packages/layers/cli/src/commands/coherence-scan.ts`: operational snapshot
  checking spawned `bash scripts/guard-task-lifecycle-db.sh`, and that shell
  script resolved `narada` through a stale WSL-style shim instead of the current
  Windows CLI embodiment.
- Repaired `checkTaskLifecycleSnapshot` to use current-process Git posture and
  filesystem mtimes for `.ai/task-lifecycle.db` and
  `.ai/task-lifecycle-snapshot.json`, avoiding the cross-embodiment shell shim.
- Preserved real stale detection: if the ignored local DB exists and is newer
  than the tracked snapshot, the scanner still emits
  `task-lifecycle-snapshot-stale` with `db_mtime_ms`,
  `snapshot_mtime_ms`, and `snapshot_freshness=snapshot_stale`.
- Added regression coverage in
  `packages/layers/cli/test/commands/coherence-scan.test.ts`:
  - fresh snapshot plus deliberately failing WSL-style guard script must not
    produce `task-lifecycle-snapshot-stale` or `/mnt/d/...` evidence;
  - stale snapshot still produces a stale finding without `exec: node: not
    found` evidence.
- Fixed the test helper's Git binary selection on Windows by using `git` on
  `win32` instead of hardcoding `/usr/bin/git`.
- Built the CLI, exported the lifecycle snapshot through
  `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json`, and
  verified the live operational coherence scan returns zero findings when
  lifecycle status reports `snapshot_fresh`.

## Verification

- `narada coherence scan --module operational --format json` reproduced the
  original failure before the fix with `/mnt/d/code/narada/node_modules/.bin/narada:
  16: exec: node: not found`.
- `pnpm --filter @narada2/cli typecheck` passed.
- `pnpm --filter @narada2/cli build` passed.
- `pnpm --filter @narada2/cli test -- test/commands/coherence-scan.test.ts`
  printed `12 tests` passing but the Windows process exited afterward with
  status `3221225477`; this was treated as runner/native teardown instability,
  not an assertion failure.
- `pnpm --filter @narada2/cli exec vitest run test/commands/coherence-scan.test.ts --pool=forks --poolOptions.forks.singleFork=true`
  passed: 1 test file, 12 tests.
- After the fix but before snapshot export,
  `narada coherence scan --module operational --format json` reported real
  stale evidence as mtimes and `snapshot_freshness=snapshot_stale`, with no WSL
  shim evidence.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json --format json`
  passed and refreshed the Git-visible lifecycle snapshot.
- `narada task lifecycle status --format json` reported
  `snapshot_freshness=snapshot_fresh`.
- `narada coherence scan --module operational --format json` returned
  `finding_count=0`.
- `git diff --check -- packages/layers/cli/src/commands/coherence-scan.ts packages/layers/cli/test/commands/coherence-scan.test.ts`
  passed with existing LF/CRLF warnings.

## Acceptance Criteria

- [x] The root cause of the `/mnt/d/... exec: node: not found` evidence is documented.
- [x] The operational coherence scan uses an admitted/current command embodiment or direct internal check.
- [x] Regression coverage protects the fixed posture.
- [x] The operational scan no longer emits a false snapshot-stale error when lifecycle status is fresh.
