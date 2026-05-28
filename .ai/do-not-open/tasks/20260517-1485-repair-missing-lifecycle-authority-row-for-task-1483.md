---
status: confirmed
depends_on: [1482, 1484]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:31:15.375Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779053469845_336wc3
closed_at: 2026-05-17T21:31:33.623Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Repair missing lifecycle authority row for task 1483

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md

## Goal

Restore governed lifecycle operability for task 1483 without direct SQLite mutation.

## Context

Task 1483 was created by chapter commission and is readable through `narada task read`, but `narada task claim`, `narada task defer`, and `narada task report` all return `Task not found: 1483`. `chapter status 1482-1484` reports only two tasks in the range while the chapter markdown and task spec include 1483.

## Required Work

1. Diagnose why task 1483 has a readable spec/markdown projection but no claimable lifecycle authority row.
2. Use a sanctioned task reconciliation, lifecycle import/export, or task-governance repair path if one exists; do not mutate SQLite directly unless a separate admitted repair explicitly authorizes it.
3. Restore task 1483 to normal governed lifecycle posture or record an exact blocker and proposed sanctioned repair command.
4. Verify `narada task claim 1483 --agent narada.architect` can proceed or that a bounded blocker is recorded.
5. Preserve all existing task 1483 body content and acceptance criteria.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Diagnosed task 1483 as a lookup/projection problem rather than a missing SQLite `task_lifecycle` row.
- Read-only SQLite inspection showed `task_lifecycle` and `task_specs` both contain task 1483 as `opened`.
- Numeric `narada task claim 1483` resolves to task 1485 because task 1485's filename ends with `task-1483`, creating a numeric lookup collision.
- Full task-id claim for `20260517-1483-refresh-task-lifecycle-snapshot-after-chapter-closure` avoided the numeric filename collision but hit a separate CLI bug: assignment intent recording requires non-null `task_number`, and full-id input left it null.
- No direct SQLite mutation was performed. The repair is precisely blocked on task-governance lookup/claim handling, not on missing lifecycle authority data.
- Task 1483 body content and acceptance criteria were preserved.

## Verification

- `narada task read 1483 --format json --cwd D:\code\narada` reported task 1483 as opened and readable.
- `narada task claim 1483 --agent narada.architect --reason ... --cwd D:\code\narada` failed by resolving to task 1485 and reporting task 1485 is not claimable because it is already claimed.
- `narada task claim 20260517-1483-refresh-task-lifecycle-snapshot-after-chapter-closure --agent narada.architect --reason ... --cwd D:\code\narada` failed with `NOT NULL constraint failed: assignment_intents.task_number`.
- Read-only SQLite inspection showed rows for task 1483 in `task_lifecycle` and `task_specs`; no direct SQLite write was attempted.
- `narada chapter status 1482-1485 --format json --cwd D:\code\narada` reported three tasks in the range and still omitted 1483, confirming range projection remains affected.

## Acceptance Criteria

- [x] The lifecycle/projection mismatch for task 1483 is repaired or precisely blocked.
- [x] No direct SQLite mutation occurs without separate admitted repair authority.
- [x] Task 1483 content and provenance are preserved.
- [x] The next step for lifecycle snapshot refresh is clear.
