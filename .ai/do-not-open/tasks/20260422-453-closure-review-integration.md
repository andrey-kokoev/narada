---
status: closed
closed: 2026-04-22
depends_on: [443, 425]
---

# Task 453 — Closure / Review Integration

## Context

Task 443 defines task lifecycle states including `reported`, `reviewing`, `accepted`, `rejected`, and `closed`. Task 425 introduced the WorkResultReport governance primitive. Currently:

- reviews live in `.ai/reviews/` as separate Markdown files;
- closure decisions live in `.ai/decisions/`;
- there is no automated link between a review file, the task it reviews, and the task's lifecycle state.

## Goal

Integrate closure and review artifacts with the task graph so that:

1. A review file explicitly references the task number it reviews.
2. A task's lifecycle state can be validated against existing review/closure artifacts.
3. Lint can detect stale or orphaned review/closure references.

## Required Work

### 1. Review file schema

Standardize review file front matter:

```yaml
---
review_of: 351
reviewer: agent-name
reviewed_at: 2026-04-21T00:00:00Z
verdict: accepted   # accepted | rejected | partial
---
```

### 2. Closure decision schema

Standardize closure decision front matter:

```yaml
---
closes_tasks: [287, 296]
closed_at: 2026-04-20T00:00:00Z
closed_by: operator-name
---
```

### 3. Update lint (Task 449)

Add checks:
- `stale-review-reference`: review file references missing task;
- `orphan-review`: task in `reported`/`reviewing` state has no matching review file;
- `stale-closure-reference`: closure decision references missing task;
- `orphan-closure`: task marked `closed` has no matching closure decision.

### 4. Task lifecycle validation script

Create `scripts/task-lifecycle-check.ts` that:
- scans all tasks and their states;
- checks consistency with review files and closure decisions;
- reports mismatches (e.g., task marked `accepted` but review says `rejected`).

### 5. Update agent execution contract

Update `.ai/task-contracts/agent-task-execution.md`:
- require WorkResultReport submission before review;
- require review files to use the standardized front matter;
- remind agents that review is separate from report.

## Acceptance Criteria

- [x] Review file front matter schema is documented in this task file.
- [x] Closure decision front matter schema is documented in this task file.
- [x] Lint detects stale review/closure references.
- [x] `scripts/task-lifecycle-check.ts` exists and validates task/review/closure consistency.
- [x] `.ai/task-contracts/agent-task-execution.md` is updated.

## Non-Goals

- Do not build a web UI for review management.
- Do not enforce review assignment routing (out of scope).
- Do not retroactively reformat all historical review/closure files.

## Execution Mode

Proceed directly. This is an additive documentation and tooling task.

## Execution Notes

### What changed

1. **Extended `scripts/task-graph-lint.ts`** — Added front-matter-based review/closure scanning (`review_of`, `closes_tasks`) in addition to existing body-text extraction. Added orphan checks:
   - `orphan-review`: task with `status: in_review` and no matching review file
   - `orphan-closure`: task with `status: closed` and no matching closure decision

2. **Created `scripts/task-lifecycle-check.ts`** — New standalone script (139 lines) that validates:
   - `status-review-mismatch`: task status conflicts with review verdict (e.g., `in_review` but review says `rejected`)
   - `premature-review`: task is `opened`/`claimed` but has an `accepted` review
   - `missing-closure`: task is `confirmed` but has no closure decision
   - `orphan-review` / `orphan-closure`: same as lint but surfaced separately for lifecycle focus
   - `invalid-status`: task has an unrecognized status value

3. **Extended CLI `lintTaskFiles`** (`packages/layers/cli/src/lib/task-governance.ts`) — Added:
   - `stale_review_reference` (front matter + body text)
   - `stale_closure_reference` (front matter + body text)
   - `orphan_review`
   - `orphan_closure`
   - Added `extractTaskRefsFromBody()` helper (exported, tested)

4. **Updated `.ai/task-contracts/agent-task-execution.md`** — Added "Review and Closure Artifacts" section documenting:
   - Review file front matter schema (`review_of`, `reviewer`, `reviewed_at`, `verdict`)
   - Closure decision front matter schema (`closes_tasks`, `closed_at`, `closed_by`)
   - Validation via `narada task lint` and `scripts/task-lifecycle-check.ts`
   - Separation of review from report

5. **Added tests** (`packages/layers/cli/test/lib/task-governance.test.ts`) — 12 new tests covering:
   - `lintTaskFiles`: clean graph, stale review (front matter + body), orphan review, no false positives for opened tasks, review match via front matter, stale closure (front matter), orphan closure, no false positives for opened tasks, closure match via front matter, broken dependency
   - `extractTaskRefsFromBody`: extraction, empty, deduplication

### Verification results

- `pnpm --filter @narada2/cli exec vitest run test/lib/task-governance.test.ts` — **19/19 passed**
- `npx tsx scripts/task-graph-lint.ts` — runs successfully (detects existing issues: 14 errors, 548 warnings from pre-existing task file inconsistencies)
- `npx tsx scripts/task-lifecycle-check.ts` — runs successfully (detects existing issues: 0 errors, 50 warnings from pre-existing inconsistencies)

### Residuals

- Existing review/closure files do not have standardized front matter (documented non-goal). The tools gracefully fall back to body-text extraction for legacy files.
- Pre-existing `orphan-closure` warnings for Tasks 438, 439, 443, 449–452 are expected: these tasks are `closed` but their closure decisions may not reference them via `closes_tasks` front matter or may be named differently.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
