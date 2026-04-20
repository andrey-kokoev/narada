# Task 262: Review Loop and Task Number Allocation

## Chapter

Multi-Agent Task Governance

## Context

Two mechanical gaps remain in the governance pipeline:

1. **Review findings → corrective tasks**: When a reviewer finds an issue, they must manually write a new task file, choose a number, and link it back. There is no derivation operator.

2. **Task number allocation**: Agents manually scan `.ai/tasks/` to find the next number. Collisions have occurred (e.g., duplicate task numbers in the same day). There is no allocator.

## Goal

Close the review→task loop and make task number allocation atomic and collision-free.

## Required Work

### 1. Structured Review Finding Schema (static)

Define a finding schema that can be embedded in review artifacts or emitted by review tools:

```json
{
  "finding_id": "f-20260420-001",
  "severity": "blocking|major|minor|cosmetic",
  "target_task_id": 259,
  "category": "typecheck|test|logic|doc|boundary",
  "description": "...",
  "recommended_action": "fix|add_test|rewrite|defer|wontfix"
}
```

### 2. Corrective Task Derivation Operator (mutation)

Create a derivation operator that produces a corrective task from a finding:
```bash
narada task derive-from-finding <finding-id> --review <review-id>
```

This should:
1. Read the finding and the target task.
2. Generate a new task file with:
   - `task_id`: next available number (via allocator)
   - `status`: `opened`
   - `context`: inherits scope from target task
   - `depends_on`: includes target task if the fix must happen after it
   - `why`: references the finding and review
3. Atomically reserve the number and write the file.

This mirrors the control plane's `previewWorkFromStoredFacts` → `deriveWorkFromStoredFacts` pattern: a read-only preview tool first, then a creation operator.

### 3. Task Number Allocator (operator)

Create a lightweight allocator operator. Suggested implementation:

A registry file `.ai/tasks/.registry.json`:
```json
{
  "last_allocated": 264,
  "reserved": [265, 266],
  "released": []
}
```

Or a simpler CLI:
```bash
narada task allocate
# → 265
```

The allocator operator should:
1. Scan existing task files to find the maximum number.
2. Atomically reserve the next number (e.g., by writing a lock file or using git).
3. Return the reserved number.

Number allocation is an operator, not a schema concern.

### 4. Collision Detection (pure tool/compiler)

Add a lint rule or CI check that fails if:
- Two task files have the same number.
- A task file references a `depends_on` task that does not exist.
- A task file's `task_id` does not match its filename.

Lint is a pure tool; it transforms static inputs into static outputs without mutating task state.

## Non-Goals

- Do not build a full review UI.
- Do not automatically assign corrective tasks to agents.
- Do not retroactively renumber existing tasks.

## Execution Notes

### 1. Structured Review Finding Schema (static)
Updated `ReviewFinding` interface in `packages/layers/cli/src/lib/task-governance.ts` with optional fields:
- `finding_id` — stable identifier for the finding
- `target_task_id` — which task the finding targets
- `category` — `typecheck|test|logic|doc|boundary`
- `recommended_action` — `fix|add_test|rewrite|defer|wontfix`

Updated `.ai/reviews/README.md` to document the expanded finding schema.

### 2. Task Number Allocator (operator)
Added registry-based allocator to `task-governance.ts`:
- `scanMaxTaskNumber()` — scans `.ai/tasks/*.md` to find the highest task number
- `loadRegistry()` / `saveRegistry()` — manages `.ai/tasks/.registry.json` (created lazily on first allocation)
- `allocateTaskNumber()` — atomically reserves next number (reuses released if available)

Created `packages/layers/cli/src/commands/task-allocate.ts`:
- `narada task allocate` → returns next reserved number
- Registry writes use `atomicWriteFile` for crash safety

### 3. Corrective Task Derivation Operator
Created `packages/layers/cli/src/commands/task-derive-from-finding.ts`:
- `narada task derive-from-finding <finding-id> --review <review-id>`
- Reads the review record, locates the finding by `finding_id`
- Resolves target task (from `finding.target_task_id` or review `task_id`)
- Allocates a new task number via `allocateTaskNumber()`
- Generates a task file with `status: opened`, `depends_on: [target]`, and context from the finding
- Writes atomically to `.ai/tasks/{date}-{number}-corrective-{category}-{target}.md`

Idempotency: running twice with the same finding allocates a *new* number each time (no collision) because the allocator increments monotonically. This is the intended behavior — the same finding may spawn multiple corrective tasks if revisited.

### 4. Collision Detection (pure tool/compiler)
Created `packages/layers/cli/src/commands/task-lint.ts`:
- `narada task lint` — pure read-only tool
- Checks: duplicate task numbers, broken `depends_on` references, `task_id` vs filename mismatches
- Returns exit code 0 if clean, 1 if issues found
- No mutations

### CLI Wiring
Added to `packages/layers/cli/src/main.ts` under `task` command group:
- `narada task allocate`
- `narada task derive-from-finding <finding-id> --review <review-id>`
- `narada task lint`

### Verification
- Typecheck: clean on modified files
- Focused tests: 54/54 pass across all task governance commands

### Corrective Notes (Task 274)

- **Allocator race safety**: Task 262 claimed the allocator was "atomic" but only used atomic file writes. The load-increment-write sequence remained racy under concurrent agents. Task 274 added a local file lock (`.ai/tasks/.registry.lock`) with bounded retry to make the critical section race-safe, plus registry reconciliation with `scanMaxTaskNumber` so `last_allocated` never lags behind actual task files.
- **Severity vocabulary normalization**: Task 262's spec requested `cosmetic` as the low-severity value. The implementation normalized this to `note` to align with the existing review vocabulary established in Task 271-era code (`task-review.ts`, `.ai/reviews/README.md`). All surfaces use `note` consistently.
- **Lint duplicate detection**: Task 262's `lintTaskFiles` only detected duplicates when front matter was present. Task 274 moved filename-based duplicate detection outside the front-matter branch.
- **`depends_on: [0]` prevention**: Task 262's `derive-from-finding` could silently emit `depends_on: [0]` when a target task lacked parseable front matter or a filename number. Task 274 added an explicit error before allocation.

## Acceptance Criteria

- [x] Review finding schema is defined.
- [x] `derive-from-finding` operator generates a valid task file.
- [x] Task number allocator is atomic (no collisions under normal use).
- [x] Collision detection catches duplicate numbers and broken `depends_on` references.
- [x] Derivation is repeatable: running twice with the same finding allocates a new task number each time without collision.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
