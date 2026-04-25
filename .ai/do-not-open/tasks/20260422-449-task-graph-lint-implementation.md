---
status: closed
closed: 2026-04-22
depends_on: [443]
---

# Task 449 — Task Graph Lint Implementation

## Context

Task 443 defines the Task Graph Evolution Boundary, including a comprehensive lint/check specification (§7). Currently, the only automated check is `scripts/task-file-guard.ts`, which only detects forbidden derivative filename patterns. There is no check for:

- duplicate task numbers;
- filename/heading mismatch;
- stale dependencies;
- chapter DAG range collisions;
- missing self-standing context.

## Goal

Implement the task graph lint command specified in `docs/governance/task-graph-evolution-boundary.md` §7.

## Required Work

### 1. Implement `scripts/task-graph-lint.ts`

Create a TypeScript script (using `tsx`) that scans the task graph and reports findings.

It must detect:

| Check | Severity |
|-------|----------|
| `duplicate-task-number` | error |
| `filename-heading-mismatch` | error |
| `stale-dependency` | warning |
| `stale-blocker` | warning |
| `range-collision` | error |
| `derivative-file` | error |
| `missing-heading` | warning |
| `missing-self-standing-context` | warning |
| `stale-report-reference` | warning |
| `stale-review-reference` | warning |
| `stale-assignment` | warning |
| `stale-learning-reference` | warning |

### 2. Input surfaces to scan

- `.ai/do-not-open/tasks/*.md`
- `.ai/reviews/*.md`
- `.ai/decisions/*.md`
- `.ai/agents/roster.json`
- `.ai/learning/accepted/*.json`

### 3. Output format

```
<severity>: <check-id>: <file>: <message>
```

Example:
```
error: duplicate-task-number: .ai/do-not-open/tasks/20260410-003-migrate-search-to-fts5.md: Task 003 also claimed by 20260410-003-assignment-agent-a-cli-polish.md
warning: stale-dependency: .ai/do-not-open/tasks/20260422-443-task-graph-evolution-boundary.md: depends_on references non-existent task 260
```

### 4. Exit codes

- `0`: no errors (warnings OK)
- `1`: one or more errors
- `2`: internal tool failure

### 5. Extend or replace task-file-guard

**Decision**: Create `scripts/task-graph-lint.ts` as a separate script.

Rationale:
- `task-file-guard.ts` has a narrow, well-defined purpose (forbidden filename patterns).
- `task-graph-lint.ts` is broader and may evolve independently with new checks.
- Keeping them separate allows `task-file-guard` to remain a fast, focused check that runs in `pnpm verify`, while `task-graph-lint` can be run on demand for full graph analysis.
- Future work (Task 451) may add `--fix` to `task-graph-lint`, which would complicate `task-file-guard`.

## Acceptance Criteria

- [x] `scripts/task-graph-lint.ts` exists and is executable via `tsx`.
- [x] Running the script on the current `.ai/do-not-open/tasks/` produces accurate findings.
- [x] The script exits `0` when only warnings are present.
- [x] The script exits `1` when errors are present.
- [x] The script detects the known historical collision: Task 003 (two files).
- [x] The script detects the known historical collision: Task 124 (two files).
- [x] The script detects the known historical collision: Task 288 (two files).
- [x] Findings are documented in the task file under `## Verification`.

## Non-Goals

- Do not implement `--fix` (that is Task 451).
- Do not rewrite existing task history.
- Do not create a database-backed tracker.

## Verification

```bash
$ npx tsx scripts/task-graph-lint.ts
error: duplicate-task-number: .ai/do-not-open/tasks/20260410-003-assignment-agent-a-cli-polish.md: Filename number 3 (date 20260410) also claimed by 20260410-003-assignment-agent-a-cli-polish.md, 20260410-003-migrate-search-to-fts5.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260410-003-migrate-search-to-fts5.md: Filename number 3 (date 20260410) also claimed by 20260410-003-assignment-agent-a-cli-polish.md, 20260410-003-migrate-search-to-fts5.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260414-020-control-plane-v2-to-production-mailbox-agent-gap-closure-plan.md: Filename number 20 (date 20260414) also claimed by 20260414-020-control-plane-v2-to-production-mailbox-agent-gap-closure-plan.md, 20260414-020-impl-replay-recovery-tests.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260414-020-impl-replay-recovery-tests.md: Filename number 20 (date 20260414) also claimed by 20260414-020-control-plane-v2-to-production-mailbox-agent-gap-closure-plan.md, 20260414-020-impl-replay-recovery-tests.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260414-021-A-02-config-secrets.md: Filename number 21 (date 20260414) also claimed by 20260414-021-A-02-config-secrets.md, 20260414-021-A-03-daemon-runtime-wiring.md, 20260414-021-A-04-tool-population.md, 20260414-021-A-05-tool-execution-integration.md, 20260414-021-A-06-e2e-daemon-test.md, 20260414-021-impl-docs-realignment.md
... (6 files for task 21)
error: duplicate-task-number: .ai/do-not-open/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md: Task 124 also claimed by 20260418-124-comprehensive-semantic-architecture-audit-report.md, 20260418-124-comprehensive-semantic-architecture-audit.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260418-124-comprehensive-semantic-architecture-audit.md: Task 124 also claimed by 20260418-124-comprehensive-semantic-architecture-audit-report.md, 20260418-124-comprehensive-semantic-architecture-audit.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260420-288-implement-autonomous-send-as-approved-draft-execution.md: Task 288 also claimed by 20260420-288-implement-autonomous-send-as-approved-draft-execution.md, 20260420-288-plan.md
error: duplicate-task-number: .ai/do-not-open/tasks/20260420-288-plan.md: Task 288 also claimed by 20260420-288-implement-autonomous-send-as-approved-draft-execution.md, 20260420-288-plan.md
warning: stale-decision-reference: .ai/decisions/20260421-338-post-cloudflare-coherence-closure.md: Decision references non-existent task 332
warning: stale-review-reference: .ai/reviews/20260413-010-review-agent-trace-architecture.md: Review references non-existent task 10
... (506 warnings total)

Task Graph Lint complete. 14 error(s), 506 warning(s).
```

**Summary of findings:**

| Check | Count | Notes |
|-------|-------|-------|
| `duplicate-task-number` | 14 errors | Task 003, 020, 021, 124, 288 collisions |
| `stale-decision-reference` | 1 warning | Task 332 referenced in decision but missing |
| `stale-review-reference` | 1 warning | Task 10 referenced in review but missing |
| `missing-heading` | ~370 warnings | Historical tasks predate `# Task NNN` format |
| `missing-self-standing-context` | ~130 warnings | Historical tasks lack Context/Goal/AC sections |
| `derivative-file` | 0 | No forbidden suffixes found |
| `range-collision` | 0 | No chapter DAG range overlaps detected |

Exit code with errors: `1` ✅
Exit code without errors (tested via filtered run): `0` ✅

## Execution Mode

Proceed directly. This is an additive tooling task with a clear write set.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.
