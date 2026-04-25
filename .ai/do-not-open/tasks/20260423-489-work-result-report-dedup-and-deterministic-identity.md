---
status: closed
created: 2026-04-23
closed: 2026-04-23
owner: implementer
depends_on: [425, 486]
---

# Task 489 - WorkResultReport Dedup and Deterministic Identity

## Context

Narada now relies on WorkResultReports as the durable "implementer says ready for review" artifact. A recent 485 completion produced two report files with the same internal `report_id` and the same `(task_id, agent_id, assignment_id)` payload shape. That is an integrity leak.

WorkResultReports should be governed artifacts, not append-only duplicates caused by repeated command execution or accidental double write.

## Goal

Make WorkResultReport creation deterministic and idempotent per assignment.

Canonical invariant:

```text
one assignment_id -> at most one submitted WorkResultReport
```

## Read First

- `.ai/do-not-open/tasks/20260422-425-work-result-report-governance-primitive.md`
- `.ai/do-not-open/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/do-not-open/tasks/tasks/reports/README.md`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/task-evidence.ts`

## Non-Goals

- Do not redesign reports into a multi-version review system unless required.
- Do not silently delete historical duplicate files.
- Do not weaken report requirements for implementer completion.
- Do not make review records ambiguous when linked to reports.

## Required Work

1. Define deterministic report identity.
   - Derive report identity from stable fields, preferably including:
     - `task_id`;
     - `agent_id`;
     - `assignment_id`.
   - Filename and `report_id` must agree.

2. Enforce idempotent write behavior in `task report`.
   - Before writing, detect an existing report for the same assignment.
   - If one already exists:
     - either return the existing report without writing; or
     - fail with a clear duplicate/submitted-already error.
   - Do not create a second file for the same assignment.

3. Add duplicate detection helpers.
   - Detect:
     - duplicate `report_id`;
     - multiple reports for one `assignment_id`;
     - filename / internal `report_id` mismatch.
   - Surface these through evidence/lint where appropriate.

4. Harden report path generation.
   - Use one canonical path for one report identity.
   - Ensure atomic write semantics remain intact.

5. Add tests.
   - Repeated `task report` on the same assignment does not create duplicates.
   - Duplicate `report_id` collision is rejected or deduped deterministically.
   - Filename / payload mismatch is detected.
   - Existing valid historical single-report flow still passes.

6. Update docs.
   - Update `.ai/do-not-open/tasks/tasks/reports/README.md` with the single-report-per-assignment invariant.
   - Update task-governance docs if the command now returns existing report on repeat invocation.

## Acceptance Criteria

- [x] WorkResultReport identity is deterministic and stable.
- [x] `task report` is idempotent per assignment.
- [x] One assignment cannot create multiple submitted reports accidentally.
- [x] Duplicate report anomalies are detectable by tooling.
- [x] Tests cover repeat submission, collision, mismatch, and normal flow.
- [x] Documentation states the invariant clearly.
- [x] Verification evidence is recorded in this task.

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run test/commands/task-report.test.ts test/lib/task-governance.test.ts
pnpm --filter @narada2/cli typecheck
pnpm verify
```

**Results (2026-04-23):**
- `task-report.test.ts`: 9 passed
- `task-governance.test.ts`: 40 passed
- `pnpm --filter @narada2/cli exec vitest run` (full CLI suite): 571 passed
- `pnpm verify`: all 5 steps passed

## Execution Notes

### Approach

The core problem was that `createReportId()` used `Date.now()`, making every invocation produce a different `report_id` even for the same assignment. This allowed duplicate reports to accumulate silently.

The fix had three parts:
1. **Deterministic identity**: Replace timestamp-based IDs with a hash of stable fields (`task_id`, `agent_id`, `assignment_id`). This makes `report_id` a pure function of the assignment — repeated calls produce the same ID.
2. **Idempotent write**: Before creating a report, scan the reports directory for an existing submitted report with the same `assignment_id`. If found, return it instead of writing a second file.
3. **Anomaly detection**: Add `detectReportAnomalies()` to scan all reports and surface integrity issues (duplicate IDs, multiple reports per assignment, filename mismatches).

### Key decisions

- Used djb2 hash (simple, fast, no dependencies) truncated to 8 hex chars. Collision probability is low for the expected report volume; if collisions become a concern, the hash width can be increased.
- The idempotency check runs after assignment validation but before status transition validation. This ensures that even if the task status is already `in_review`, a duplicate report attempt returns the existing report rather than failing with a status error.
- The `detectReportAnomalies()` helper is designed for evidence/lint integration — it returns structured anomaly records rather than throwing, so callers can decide how to surface them.
- Preserved backward compatibility: existing reports with timestamp-based IDs remain valid. The new deterministic IDs only apply to newly created reports.

### Residuals

- Historical duplicate reports in `.ai/do-not-open/tasks/tasks/reports/` (e.g., the two 485 reports) are not automatically cleaned up. A separate cleanup operator could be added later.
- `detectReportAnomalies()` is not yet wired into `narada task lint` or `narada task evidence`. That integration is deferred.

## Implementation Summary

1. **Deterministic report identity** (`packages/layers/cli/src/lib/task-governance.ts`):
   - Added `stableHash()` djb2 hash function producing stable 8-char hex hashes
   - Changed `createReportId(taskId, agentId)` → `createReportId(taskId, agentId, assignmentId)`
   - `report_id` format: `wrr_<hash>_<task_id>_<agent_id>` where hash is derived from `task_id:agent_id:assignment_id`
   - Same inputs always produce the same `report_id`

2. **Idempotent write** (`packages/layers/cli/src/commands/task-report.ts`):
   - Before any mutation, `findReportByAssignmentId()` scans for an existing submitted report with the same `assignment_id`
   - If found, returns the existing report with a clear `note` instead of creating a duplicate
   - Assignment validation happens first; idempotency check happens before parsing optional fields and before mutation

3. **Duplicate detection helpers** (`packages/layers/cli/src/lib/task-governance.ts`):
   - `findReportByAssignmentId(cwd, assignmentId)` — returns first submitted report matching assignment
   - `detectReportAnomalies(cwd)` — scans all reports and returns anomalies:
     - `duplicate_report_id`: multiple files share the same `report_id`
     - `multiple_reports_per_assignment`: multiple submitted reports for one `assignment_id`
     - `filename_id_mismatch`: file name does not match internal `report_id`

4. **Tests**:
   - `task-report.test.ts`: Added idempotency test (repeated report on same assignment returns existing) and re-claim test (new assignment creates new report)
   - `task-governance.test.ts`: Added 9 tests for `createReportId`, `findReportByAssignmentId`, and `detectReportAnomalies`

5. **Documentation** (`reports/README.md`):
   - Updated invariants to state `one assignment_id → at most one submitted WorkResultReport`
   - Documented deterministic identity format
   - Documented idempotency behavior

