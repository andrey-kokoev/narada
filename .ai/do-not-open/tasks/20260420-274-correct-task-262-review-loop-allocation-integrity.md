# Task 274: Correct Task 262 Review Loop Allocation Integrity

## Chapter

Multi-Agent Task Governance

## Context

Task 262 implemented review findings, task number allocation, derive-from-finding, and task linting.

Architect review found the implementation is directionally useful but not yet clean against the task's own acceptance criteria.

## Findings

### 1. Allocator Is Atomic-Write-Safe, Not Race-Safe

`allocateTaskNumber()` loads `.ai/do-not-open/tasks/tasks/.registry.json`, increments in memory, and writes it back with `atomicWriteFile()`.

That makes the file write atomic, but it does not make allocation atomic under concurrent agents. Two agents can read the same registry state and both reserve the same next number.

Task 262 required number allocation to be collision-free under normal use and suggested a lock file or equivalent. The current implementation does not provide that.

### 2. Lint Misses Duplicate Filename Numbers Without Front Matter

`lintTaskFiles()` only records a task number for duplicate detection inside the `if (frontMatter.task_id !== undefined)` branch.

This means two files with the same filename task number but no front matter can evade duplicate detection, despite Task 262 requiring detection when two task files have the same number.

### 3. Finding Severity Vocabulary Drift

Task 262 specified:

```json
"severity": "blocking|major|minor|cosmetic"
```

The implementation uses:

```ts
'blocking' | 'major' | 'minor' | 'note'
```

This may be defensible if `note` is the intended canonical vocabulary from Task 271, but Task 262's artifact, `.ai/reviews/README.md`, `ReviewFinding`, and `task-review.ts` must be made consistent. Do not leave `cosmetic` vs `note` arbitrarily split.

### 4. `derive-from-finding` Can Generate `depends_on: [0]`

`task-derive-from-finding.ts` computes:

```ts
Number(targetFm.task_id ?? targetTaskId.match(/-(\d+)-/)?.[1] ?? 0)
```

If a target task is a simple numeric file or otherwise lacks parseable front matter, this can silently produce `depends_on: [0]`.

That creates a broken dependency in a task that the derivation operator just created.

## Goal

Make Task 262's review-loop and task-number-allocation implementation honest, race-safe enough for local multi-agent use, and internally consistent.

## Required Work

### 1. Make Allocation Race-Safe

Add a local lock around registry allocation.

Acceptable approach:

- create `.ai/do-not-open/tasks/tasks/.registry.lock` with exclusive create (`open(..., 'wx')`)
- retry with short bounded backoff if the lock exists
- always remove the lock in `finally`
- fail clearly after bounded retries

The critical section must include:

- loading registry
- reconciling with current task-file max
- selecting next number
- writing registry

Also ensure `last_allocated` never moves behind the current maximum task number in `.ai/do-not-open/tasks/`.

### 2. Fix Lint Duplicate Detection

`lintTaskFiles()` must detect duplicate task numbers based on filenames regardless of front matter presence.

It should still separately report `task_id_mismatch` when front matter exists and disagrees with the filename number.

Add focused tests for:

- duplicate filename numbers without front matter
- duplicate filename numbers with front matter
- `task_id` mismatch remains detected

### 3. Resolve Severity Vocabulary

Choose the canonical low-severity review value and make all surfaces consistent:

- `ReviewFinding` type
- `task-review.ts` validation
- `.ai/reviews/README.md`
- Task 262 execution notes if needed
- focused tests

If choosing `note`, explicitly update Task 262's execution notes to say the requested `cosmetic` value was normalized to the existing review vocabulary `note`.

If choosing `cosmetic`, update Task 271-era review validation and tests accordingly.

Do not allow both unless the docs explain why both are semantically distinct.

### 4. Prevent `depends_on: [0]`

Fix `derive-from-finding` so it never emits dependency `0`.

If target task number cannot be resolved from front matter or filename, fail with a clear error before allocating or writing the corrective task.

Add focused tests for a target task without front matter.

### 5. Update Task 262 Artifact

Update `.ai/do-not-open/tasks/20260420-262-review-loop-and-task-number-allocation.md` with corrective notes referencing this task.

Do not claim allocator atomicity until the race-safe critical section exists.

## Non-Goals

- Do not build a review UI.
- Do not auto-assign derived corrective tasks.
- Do not retroactively renumber existing tasks.
- Do not run broad/full test suites.
- Do not create derivative task-status files.

## Execution Notes

### 1. Race-Safe Allocation
Modified `packages/layers/cli/src/lib/task-governance.ts`:
- Added `acquireRegistryLock()` using `open(path, 'wx')` with bounded retry (10 attempts, 50ms delay)
- Added `releaseRegistryLock()` with `finally`-guaranteed cleanup
- Wrapped `allocateTaskNumber()` critical section in lock/unlock
- Added registry reconciliation: `scanMaxTaskNumber()` result overrides stale `last_allocated`

### 2. Lint Duplicate Detection
Modified `lintTaskFiles()` in `task-governance.ts`:
- Moved filename-based number extraction (`base.match(/-(\d+)-/)`) outside the `frontMatter.task_id !== undefined` branch
- Duplicate detection now runs for all `.md` files regardless of front matter presence
- `task_id_mismatch` remains a separate check when front matter exists and disagrees with filename

### 3. Severity Vocabulary
No code changes needed — `note` was already used consistently across `ReviewFinding` type, `task-review.ts` validation, and `.ai/reviews/README.md`. Added a normalization note to Task 262 execution notes explaining that `cosmetic` from the original spec was normalized to the existing `note` vocabulary.

### 4. Prevent `depends_on: [0]`
Modified `packages/layers/cli/src/commands/task-derive-from-finding.ts`:
- Extract target task number before allocation
- If `Number.isNaN(targetTaskNumber) || targetTaskNumber === 0`, return `INVALID_CONFIG` with clear error
- Only proceed to `allocateTaskNumber()` after successful target resolution

### 5. Task 262 Artifact Updated
Added corrective notes section to `.ai/do-not-open/tasks/20260420-262-review-loop-and-task-number-allocation.md` referencing Task 274 and documenting each fix.

### Tests Added
- `task-allocate.test.ts`: "reconciles stale registry with current max"
- `task-lint.test.ts`: "detects duplicate filename numbers without front matter"
- `task-derive-from-finding.test.ts`: "fails when target task has no parseable front matter or number"

### Verification
- All 57 task governance tests pass
- No derivative files created

## Acceptance Criteria

- [x] `allocateTaskNumber()` uses a bounded local lock or equivalent race-safe critical section.
- [x] Allocation reconciles registry state with current max task number before choosing the next number.
- [x] Focused allocator tests cover sequential allocation and simulated lock contention or stale registry reconciliation.
- [x] `lintTaskFiles()` catches duplicate filename task numbers even without front matter.
- [x] Severity vocabulary is consistent across type, validation, docs, and tests.
- [x] `derive-from-finding` cannot emit `depends_on: [0]`.
- [x] Focused derive-from-finding tests cover missing target front matter or unparsable target number.
- [x] Task 262 notes reference this corrective follow-up.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
