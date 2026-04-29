---
status: closed
amended_by: architect
amended_at: 2026-04-29T16:54:31.033Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T17:02:36.796Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented read-only narada task lifecycle status with allocation max/last/next/drift posture, no mutation authority, Builder done posture, snapshot evidence, and direct-SQLite diagnostic-only guidance. Added focused tests for read-only behavior, drift reporting, Builder posture, and human output. pnpm verify passed.
closed_at: 2026-04-29T17:02:54.406Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add governed task lifecycle allocation status read surface

## Chapter

Task Lifecycle Authority Surfaces

## Goal

Prevent direct SQLite inspection for task lifecycle allocation questions by adding or specifying a sanctioned read-only command that reports max task number last allocated next allocatable number and allocation drift posture without mutating lifecycle state.

## Context

Inbox envelope env_6f4cafd3-7b2a-417c-bfe8-8f017379f447 reports that Builder used raw sqlite3 reads against .ai/tasks/task-lifecycle.db to inspect max(task_number) and task_number_sequence.last_allocated. The query was read-only, but it bypassed Narada's governed task lifecycle surface. This is an authority-boundary and ergonomics issue: Builder needed an answer Narada should expose without direct substrate inspection.

## Required Work

1. Inspect existing task lifecycle/list/allocate/status commands for an appropriate home. 2. Add or specify a read-only sanctioned command such as narada task allocation-status, narada task lifecycle-status, narada task done-posture, or narada builder done-posture. 3. The command must report max task number, last allocated number, next allocatable number, drift between sequence and task rows, and whether dry-run allocation would mutate. 4. The command must report builder done posture: open task count, in-progress task count, review-requested or handoff-needed count, blocked/deferred count where applicable, lifecycle vocabulary used by Narada, whether the current Builder work packet is clean to hand back, and residuals preventing clean closure. 5. The command must not allocate, reserve, claim, close, amend, or mutate lifecycle state. 6. Include bounded human and JSON output. 7. Document in AGENTS or task lifecycle posture that direct SQLite reads are diagnostic-only under explicitly admitted diagnosis/repair tasks. 8. Add focused tests for read-only behavior, drift reporting, and done-posture reporting without hardcoded raw SQL status aliases. 9. Run pnpm verify and report residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T16:47:54.768Z: context, required work
- Amended by architect at 2026-04-29T16:54:31.033Z: required work, appended criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A read-only sanctioned command or documented surface answers max task number last allocated next allocatable number and sequence drift posture
- [x] Command does not allocate reserve claim close or mutate task lifecycle state
- [x] Builder and AGENTS guidance says direct task lifecycle SQLite reads are diagnostic-only under explicit admitted repair or diagnosis tasks
- [x] Output is bounded and includes evidence about DB versus exported snapshot or task-file authority where appropriate
- [x] Source inbox envelope is routed and focused tests or pnpm verify pass
- [x] Builder done posture is included without hardcoded raw SQL status vocabulary
