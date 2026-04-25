# Task 268: Correct Task 260 Assignment Operator Hardening

## Chapter

Multi-Agent Task Governance

## Context

Task 260 created the first agent roster and assignment operators:

- `.ai/agents/roster.json`
- `.ai/do-not-open/tasks/tasks/assignments/README.md`
- `narada task claim`
- `narada task release`

Review found the basic shape is useful, but the operators are not yet safe enough to become the governance substrate.

Issues:

1. **Writes are not atomic.** `saveAssignment()` and `writeTaskFile()` write directly to final paths. Task 260 required the claim operator to write assignment state atomically.
2. **Claim accepts tasks without explicit `status: opened`.** The current check only rejects a status when it exists and is not `opened`; missing front matter/status becomes claimable. That makes old Markdown files accidentally claimable.
3. **Release accepts arbitrary reason values from CLI.** TypeScript narrows the type at compile time, but runtime CLI input is just a string.
4. **Release does not verify task status is `claimed`.** A stale assignment file can transition a task whose front matter is not actually claimed.
5. **Assignment schema is behind Task 261.** Task 261 added `budget_exhausted` and `needs_continuation`; Task 260's assignment schema and release operator do not support that release reason.
6. **Task 260 notes overclaim typecheck.** The reported typecheck is not clean across the package due unrelated `executeOperatorAction` export errors. The task should record focused validation only, not broad typecheck cleanliness.

## Goal

Harden the task assignment operators so they are safe, explicit, and aligned with Task 261's continuation lifecycle.

## Required Work

### 1. Atomic File Writes

Update task-governance file writes so assignment records, task files, and roster updates are written atomically.

Minimum acceptable pattern:

1. write to a temporary file in the same directory
2. fsync if practical
3. rename over the target

Apply this to:

- assignment record writes
- task file front-matter writes
- roster `last_active_at` update

### 2. Require Explicit Task Status

Change `task claim` so a task is claimable only when front matter contains:

```yaml
status: opened
```

or (per Task 261 continuation lifecycle):

```yaml
status: needs_continuation
```

Missing status, missing front matter, or any other status must fail with a clear error.

### 3. Runtime Validate Release Reasons

At runtime, allow only:

- `completed`
- `abandoned`
- `superseded`
- `transferred`
- `budget_exhausted`

Invalid release reasons must fail before mutation.

### 4. Support Continuation Release

Align with Task 261:

- Add `budget_exhausted` to the assignment record schema.
- `narada task release --reason budget_exhausted` must transition task status to `needs_continuation`.
- Require a continuation packet (`--continuation <path>`) for `budget_exhausted` releases. The packet is a JSON file matching the `ContinuationPacket` schema.

### 5. Verify Claimed State On Release

Before release mutation, verify the task front matter status is `claimed`.

If the assignment record says active but the task file is not `claimed`, fail with a clear consistency error.

### 6. Update Tests

Add focused CLI tests for:

- missing front matter/status cannot be claimed
- invalid release reason fails
- `budget_exhausted` transitions to `needs_continuation`
- release fails if task status is not `claimed`
- atomic-write helper is used, or at least unit-covered enough to catch direct partial-write regressions

### 7. Correct Task 260 Notes

Update `.ai/do-not-open/tasks/20260420-260-agent-roster-and-assignment-state.md`:

- Add a corrective note referencing this task.
- Remove or qualify broad typecheck claims if unrelated failures remain.
- Document that continuation support was added by Task 268.

## Non-Goals

- Do not implement the full Task 261 lifecycle automation.
- Do not add dependency-aware claim enforcement here unless it is already in scope from Task 261.
- Do not build a dashboard.
- Do not run broad/full test suites unless explicitly requested.
- Do not create derivative task-status files.

## Execution Notes

### 1. Atomic File Writes
Added `atomicWriteFile(targetPath, data)` to `packages/layers/cli/src/lib/task-governance.ts`:
- Writes to a `.tmp-{timestamp}-{random}` file in the same directory.
- Renames over the target atomically.
- Applied to `saveAssignment()`, `writeTaskFile()`, and roster `last_active_at` updates in `task-claim.ts`.

### 2. Require Explicit Task Status
`task-claim.ts` now checks `currentStatus !== 'opened' && currentStatus !== 'needs_continuation'`. Missing status, missing front matter, or any other status now fails with `status: missing`.

### 3. Runtime Validate Release Reasons
`task-release.ts` now validates `releaseReason` at runtime against `['completed', 'abandoned', 'superseded', 'transferred', 'budget_exhausted']`. Invalid reasons fail before any mutation.

### 4. Support Continuation Release
- Added `budget_exhausted` to `TaskAssignment.release_reason` type.
- `release --reason budget_exhausted` transitions task status to `needs_continuation`.
- Requires `--continuation <path>` (JSON file matching `ContinuationPacket` schema) for `budget_exhausted` releases.
- Assignment schema README updated.
- `main.ts` wired `--continuation` option to `task release` CLI.

### 5. Verify Claimed State On Release
`task-release.ts` reads task front-matter before mutation and verifies `status === 'claimed'`. If the assignment record is active but the task file status disagrees, it returns a consistency error without mutating anything.

### 6. Tests
Updated `task-claim.test.ts` (11 tests):
- `claims an opened task`
- `fails when task is already claimed`
- `fails when agent is not in roster`
- `fails when task does not exist`
- `fails when task status is not opened`
- `fails when task has no front matter or status`
- `fails without task number`
- `fails without agent`
- `fails when dependencies are not closed or confirmed`
- `succeeds when dependencies are closed`
- `claims a needs_continuation task`

Updated `task-release.test.ts` (11 tests):
- `releases a claimed task as completed` → `in_review`
- `releases a claimed task as abandoned` → `opened`
- `fails when task has no assignment record`
- `fails when task has no active assignment`
- `fails without task number`
- `releases a claimed task as budget_exhausted` → `needs_continuation`
- `fails with invalid release reason`
- `fails if task status is not claimed` (corruption/consistency scenario)
- `fails without reason`
- `requires continuation packet for budget_exhausted`
- `accepts continuation packet for budget_exhausted`

Added `test/lib/task-governance.test.ts` (13 tests):
- `atomicWriteFile` writes readable data, leaves no temp file, overwrites existing
- Transition validation (valid, invalid, unknown)
- Dependency checking (no deps, opened blocks, closed/confirmed pass, in_review blocks)
- Front matter parsing (depends_on array, no front matter)

Total: 35/35 focused tests pass.

### 7. Corrected Task 260 Notes
Added a "Corrective Notes (Task 268)" section to `.ai/do-not-open/tasks/20260420-260-agent-roster-and-assignment-state.md` documenting all hardening changes.

### Review Findings (Post-Task-268 Review)

1. **Missing `--continuation` CLI wiring**: `taskReleaseCommand` accepted `continuation` but `main.ts` did not expose the `--continuation` option. Fixed by adding `.option('--continuation <path>', ...)` and passing it through in the action handler.
2. **Stale test counts in task notes**: Task 260 claimed 13 tests, Task 268 claimed 20 tests; actual focused test count is 35. Both task files updated.
3. **Continuation packet support was under-documented**: Task 268 execution notes originally stated "No continuation packet support added," but the implementation requires and parses continuation packets. Notes corrected to reflect actual behavior.

## Acceptance Criteria

- [x] Assignment, task, and roster writes use atomic write behavior.
- [x] Claim requires explicit `status: opened`.
- [x] Release validates reason at runtime.
- [x] `budget_exhausted` release is supported and transitions to `needs_continuation`.
- [x] Release verifies task status is `claimed` before mutation.
- [x] Focused tests cover the new hardening cases.
- [x] Task 260 notes are corrected.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
