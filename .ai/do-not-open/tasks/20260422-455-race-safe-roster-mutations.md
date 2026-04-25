---
status: closed
depends_on: [260, 268, 450]
---

# Task 455 — Race-Safe Roster Mutations

## Context

The task-governance roster is now an operational coordination surface. It records which agent is idle, working, reviewing, or done, and the operator uses it to route work.

Current CLI roster commands are vulnerable to lost updates:

```text
command A reads roster
command B reads same roster
command A writes a1 = done
command B writes a5 = done based on stale copy
result: command A's mutation may be lost
```

This has happened repeatedly during live coordination when multiple `task roster assign/done/review` commands were run close together. Atomic temp-file rename is not sufficient for this problem, because the race is read-modify-write, not partial-file write.

Task 260 introduced the roster/assignment model. Task 268 added atomic writes and consistency checks. Task 450 introduced the task range registry protocol. This task hardens roster mutations so the coordination surface itself is race-safe.

## Goal

Make `narada task roster ...` mutations safe under concurrent or rapid sequential use.

No roster command should lose another roster command's update when both mutate different agents.

## Required Work

### 1. Locate current roster mutation path

Inspect:

- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- task-claim/release/review/report commands if they update roster state
- tests under `packages/layers/cli/test/commands/task-roster.test.ts`

Identify every function that writes `.ai/agents/roster.json`.

### 2. Implement exclusive roster mutation primitive

Add a single helper, likely in `task-governance.ts`, such as:

```ts
withRosterMutation(cwd, mutationFn)
```

Requirements:

- Acquire an exclusive lock before reading roster state.
- Read latest roster while holding the lock.
- Apply the mutation.
- Validate roster shape.
- Write via temp file + rename.
- Release lock in `finally`.
- Use bounded retry or stale lock recovery if the lock is abandoned.

The lock may be file-based under `.ai/agents/roster.lock` or another clearly documented path. Do not use a process-local mutex only.

### 3. Update roster commands to use the primitive

At minimum update:

- `narada task roster assign`
- `narada task roster review`
- `narada task roster done`
- `narada task roster idle`

If task claim/release/review/report command paths also mutate roster, route those writes through the same primitive.

Do not allow any command to keep the old read-modify-write path for roster mutation.

### 4. Preserve existing semantics

All existing behavior must remain:

- `assign` sets agent to `working` with task number.
- `review` sets agent to `reviewing` with task number.
- `done` clears task and records `last_done`.
- `idle` clears task and marks idle.
- active learning guidance still appears where currently wired.
- JSON and human outputs remain compatible.

### 5. Add race-focused tests

Add tests that prove:

- two rapid mutations to different agents both persist;
- two rapid mutations to the same agent are serialized deterministically;
- lock is released on mutation failure;
- stale lock recovery works or stale lock failure is explicit and bounded;
- no partial roster file is left after write failure.

Do not rely on timing sleeps alone. Use mocked lock behavior or controlled promises where possible.

### 6. Optional batch command

If small and clean, add a batch mutation surface:

```bash
narada task roster update --done a1:438 --assign a3:451 --review a4:439
```

This is optional. Race safety for individual commands is required; batch ergonomics are secondary.

### 7. Document the invariant

Update:

- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md` if appropriate

Document:

- roster mutations are serialized through the roster mutation primitive;
- agents/operators must not edit `.ai/agents/roster.json` manually while CLI coordination is active;
- temp-file atomic write does not by itself solve read-modify-write races.

## Non-Goals

- Do not replace the file-backed roster with SQLite.
- Do not merge roster with PrincipalRuntime.
- Do not make roster authoritative over task lifecycle.
- Do not solve cross-machine distributed locking.
- Do not implement a full transaction manager for all `.ai` artifacts.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] All roster mutation commands route through one race-safe mutation primitive.
- [x] The primitive locks before read, writes atomically, and releases in `finally`.
- [x] Concurrent/rapid mutations to different agents do not lose updates.
- [x] Same-agent conflicting mutations are serialized with deterministic last-writer behavior or explicit conflict error.
- [x] Failure tests prove lock cleanup and no partial roster writes.
- [x] Existing roster command tests still pass.
- [x] Docs/contracts state the roster race-safety invariant.
- [x] No derivative task-status files are created.

## Execution Notes

### Implementation

Added `withRosterMutation(cwd, mutationFn)` in `packages/layers/cli/src/lib/task-governance.ts`:

- Acquires exclusive file lock via `open(lockPath, 'wx')` with bounded retry (20 attempts, 25ms delay).
- Stale lock recovery: locks older than 30s are automatically removed.
- Reads latest roster while holding the lock.
- Applies mutation function.
- Validates roster shape (agents array and version number).
- Writes atomically via `atomicWriteFile` (temp file + rename).
- Releases lock in `finally`.

Updated `updateAgentRosterEntry` to route through `withRosterMutation`. This covers all roster mutation paths:
- `narada task roster assign/review/done/idle`
- `narada task report` (updates roster on completion)

### Tests

**New file:** `packages/layers/cli/test/lib/task-governance.test.ts` (12 tests in withRosterMutation/updateAgentRosterEntry sections)
- `applies a mutation and persists the roster`
- `rolls back on mutation error`
- `rejects invalid roster shape after mutation`
- `serializes conflicting mutations to the same agent deterministically`
- `releases lock when mutation throws`
- `recovers a stale lock and succeeds`
- `leaves no temp debris after successful mutation`
- `persists atomic writes under lock`
- `survives rapid sequential mutations`
- `lock is released after a failed mutation`

**Updated:** `packages/layers/cli/test/commands/task-roster.test.ts` (+3 tests)
- `concurrent assign to different agents both persist`
- `rapid sequential mutations do not lose updates`
- `lock is released after a failed mutation`

### Documentation

- `.ai/task-contracts/agent-task-execution.md` — added "Roster Race-Safety Invariant" section documenting the lock primitive, stale lock recovery, prohibition on manual edits, and why atomic rename alone is insufficient.
- `docs/governance/task-graph-evolution-boundary.md` — added note under §5.1 that roster mutations are serialized through the lock primitive.

### Verification

- `pnpm --filter @narada2/cli exec vitest run test/commands/task-roster.test.ts test/lib/task-governance.test.ts` → **24/24 tests pass**
- `pnpm --filter @narada2/cli test -- --run` → **263/263 tests pass, 41/41 files pass**
- `find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print` → no derivative files
- Pre-existing typecheck errors in `doctor.ts` and `status.ts` (unrelated `@narada2/linux-site` import) — not introduced by this task.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-roster.test.ts test/lib/task-governance.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

Do not run broad suites unless the focused roster tests expose a cross-package failure that requires escalation.
