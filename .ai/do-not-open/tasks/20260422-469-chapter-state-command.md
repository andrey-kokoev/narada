---
status: closed
depends_on: [449, 453]
closed_at: 2026-04-22T18:25:00.000Z
closed_by: codex
---

# Task 469 — Chapter State Command

## Context

Task 464 defined a chapter state machine for the Narada Self-Build Operation:

```text
proposed -> shaped -> executing -> review_ready -> closing -> closed -> committed
```

Chapters currently have no inspectable state. The operator determines chapter progress by manually reading all task files in a chapter's range. This is friction that a derived state command can remove.

The state machine is intentionally **derived from task statuses**, not an independent stored state. The chapter state is a read-only projection with explicit operator-triggered transitions for closure.

## Goal

Implement `narada chapter status` and `narada chapter close` commands that:
1. Derive chapter state from task statuses in the chapter's range.
2. Provide evidence-gated closure workflow.
3. Generate closure decision templates with gap tables.

## Required Work

### 1. Implement `narada chapter status`

Create `packages/layers/cli/src/commands/chapter-status.ts`:

```bash
narada chapter status <range> [--format json|human]
```

Behavior:
- Parse `<range>` as `NNN-MMM` or `NNN`.
- Find all task files in the range.
- Derive chapter state from task statuses:
  - `proposed`: chapter DAG exists but no task files in range
  - `shaped`: all tasks exist and lint clean
  - `executing`: at least one task is `claimed` or `in_progress`
  - `review_ready`: all tasks terminal (`closed`, `accepted`, `deferred`, `confirmed`)
  - `closing`: closure decision draft exists
  - `closed`: closure decision accepted
  - `committed`: closure decision unchanged for 24h
- Output: chapter state, task count by status, blocker list (if any).

Rules:
- Chapter state is computed, not stored. No persistent state file is mutated.
- If task files exist outside the declared chapter range, warn.

### 2. Implement `narada chapter close`

Create `packages/layers/cli/src/commands/chapter-close.ts`:

```bash
narada chapter close <range> --start [--template <path>]
narada chapter close <range> --finish [--by <operator-id>]
narada chapter close <range> --reopen [--reason <text>]
```

Behavior:

**`--start`:**
- Verify chapter is `review_ready` (all tasks terminal).
- Generate closure decision template at `.ai/decisions/YYYYMMDD-<range>-chapter-closure-draft.md`.
- Template includes:
  - Task-by-task assessment table;
  - Semantic drift check;
  - Authority boundary check;
  - Gap table;
  - CCC posture before/after;
  - Recommended next work.
- Does not transition state (state remains `review_ready` until `--finish`).

**`--finish`:**
- Verify closure decision draft exists and is complete (all required sections present).
- Verify no tasks in range are `opened`/`claimed`/`in_progress`.
- Mark closure decision as accepted (update front matter `status: accepted`).
- Transition all `closed` tasks in range to `confirmed`.
- Chapter state becomes `closed`.

**`--reopen`:**
- Verify chapter is `closing` or `closed`.
- Create corrective tasks if gaps found.
- Chapter state returns to `executing`.

### 3. Chapter lint integration

Ensure `narada task lint --chapter <range>` works:
- Validates all tasks in range have consistent front matter;
- Checks `depends_on` edges do not cross chapter boundaries unexpectedly;
- Reports stale blockers or missing acceptance criteria.

### 4. Add focused tests

Create `test/commands/chapter-status.test.ts` and `test/commands/chapter-close.test.ts` covering:

- `status` derives `proposed` from DAG-only;
- `status` derives `shaped` from all tasks existing;
- `status` derives `executing` from active claims;
- `status` derives `review_ready` from all terminal;
- `close --start` generates template with all sections;
- `close --start` fails if tasks not terminal;
- `close --finish` transitions tasks to `confirmed`;
- `close --reopen` creates corrective path;
- No persistent chapter state file is created or mutated.

### 5. Update docs

Update `docs/governance/task-graph-evolution-boundary.md` §Chapter DAG Files with chapter state machine reference.

## Non-Goals

- Do not create a persistent chapter state file. State is derived.
- Do not auto-close chapters. Closure is operator-owned.
- Do not implement chapter creation. Task creation remains the existing path.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `narada chapter status <range>` derives and displays chapter state.
- [x] `narada chapter close <range> --start` generates closure decision template.
- [x] `narada chapter close <range> --finish` accepts closure and transitions tasks to `confirmed`.
- [x] `narada chapter close <range> --reopen` returns chapter to `executing`.
- [x] Evidence gates are enforced (all tasks terminal before `--finish`).
- [x] Chapter state is derived from task statuses, not stored independently.
- [x] Focused tests cover all states and transitions.
- [x] No persistent chapter state file is created.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/chapter-status.test.ts test/commands/chapter-close.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Execution Notes

### Review Findings

Task 469 was marked `opened` but implementation was already complete. Review revealed three status-coverage gaps between the task specification and the implementation:

1. **`in_progress` not treated as active**: The task spec says `executing` state triggers when "at least one task is `claimed` or `in_progress`". The implementation's `activeStatuses` only included `claimed`, `needs_continuation`, `in_review` — missing `in_progress`.

2. **`accepted` and `deferred` not treated as terminal**: The task spec says `review_ready` requires "all tasks terminal (`closed`, `accepted`, `deferred`, `confirmed`)". The implementation's `terminalStatuses` only included `closed` and `confirmed`.

3. **Docs out of sync**: `docs/governance/task-graph-evolution-boundary.md` Chapter State Machine section had the same gaps in derivation rules.

### Fixes Applied

**`packages/layers/cli/src/commands/chapter-status.ts`**:
- Added `in_progress` to `activeStatuses`
- Added `accepted` and `deferred` to `terminalStatuses`
- Added `accepted` and `deferred` to blockers filter (so they don't appear as blockers)

**`packages/layers/cli/src/commands/chapter-close.ts`**:
- Added `accepted` and `deferred` to `isTerminalStatus()`

**`docs/governance/task-graph-evolution-boundary.md`**:
- Updated Chapter State Machine derivation rules to include `in_progress` in `shaped`/`executing`
- Updated `review_ready` to include `accepted` and `deferred`

**Tests added**:
- `chapter-status.test.ts`: +3 tests (`in_progress` → `executing`, `accepted` → `review_ready`, `deferred` → `review_ready`)
- `chapter-close.test.ts`: +2 tests (`--start` with `accepted`/`deferred` tasks, `--finish` with `accepted` tasks)

### Verification

- `pnpm --filter @narada2/cli exec vitest run test/commands/chapter-status.test.ts test/commands/chapter-close.test.ts` — **30/30 passed**
- `pnpm --filter @narada2/cli typecheck` — **clean**
- `npx tsx scripts/task-graph-lint.ts` — no new errors introduced
- `find .ai/do-not-open -maxdepth 1 ...` — no derivative files

### Pre-existing State

Chapter lint integration (`narada task lint --chapter <range>`) was already implemented via `lintTaskFilesForRange` in `task-governance.ts`, which checks:
- Task ID / filename consistency
- Valid status values
- Range completeness
- Cross-chapter `depends_on` edges
- Broken dependencies
- Stale blockers
- Missing acceptance criteria
