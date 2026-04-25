---
status: closed
depends_on: [654]
amended_by: a2
amended_at: 2026-04-25T14:09:50.654Z
closed_at: 2026-04-25T14:09:55.621Z
closed_by: a2
governed_by: task_close:a2
---

# Task 655 — Reconciliation Zone Execution

## Goal

Task 655 — Reconciliation Zone Execution

## Context

Recent execution found several authority drifts: task files confirmed while SQLite said closed, chapter range files counted as child tasks, roster/lifecycle/assignment mismatch risk, and legacy task files leaking into recommender output. Repairs were direct and reactive. Reconciliation Zone should make drift detection and repair explicit.

## Required Work

1. Add `reconciliation_findings` and `reconciliation_repairs` store rows or equivalent request/result artifacts.
2. Define `ReconciliationFinding` with:
   - surface pair(s);
   - expected authority owner;
   - observed mismatch;
   - severity;
   - proposed repair.
3. Define `RepairResult` with:
   - applied/not applied;
   - changed surfaces;
   - before/after summaries;
   - verification query/evidence.
4. Add CLI:
   - `narada task reconcile inspect` for read-only drift detection.
   - `narada task reconcile repair --finding <id>` for sanctioned repair.
5. Initial detectors:
   - SQLite lifecycle vs task front matter;
   - roster working task vs active assignment/lifecycle;
   - confirmed/closed evidence mismatch;
   - duplicate/legacy task-number ownership anomalies.
6. Add focused tests for detector and repair paths.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Planning completed. This task depends on Observation Artifact Zone so reconciliation findings can be observed without dumping raw state.
- Amended by a2 at 2026-04-25T14:09:50.654Z: checked all acceptance criteria

## Verification

Plan checked against recent concrete drift repairs: chapter close SQLite/file mismatch, legacy recommender task leakage, and assignment/roster drift history.

## Acceptance Criteria

- [x] ReconciliationFinding and RepairResult are durable.
- [x] Read-only inspect detects SQLite/front-matter lifecycle mismatch.
- [x] Repair path updates sanctioned authority surfaces only.
- [x] Roster/assignment/lifecycle detector exists.
- [x] Legacy/duplicate task ownership detector exists.
- [x] Focused tests cover inspect and repair.


