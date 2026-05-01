---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T19:53:51.102Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777665210719_m54irr
closed_at: 2026-05-01T19:52:11.650Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Align operator-surface identity migration with task authority

## Chapter

operator-surface-task-authority-alignment

## Goal

Provide a canonical path and preflight for operator-surface identity changes so task roster, review authority, and role aliases do not drift from the active admitted identity.

## Context

Inbox envelope env_e64d0e27-d024-4dba-abc7-f3e59d0abc5f reports that narada-andrey renamed or rebound the active architect surface as narada-andrey.Kevin, while task review authority still knew only narada-andrey.architect. Reviewing task 60 failed with missing_reviewer_identity until Kevin was manually added to the task roster.

## Required Work

Design and implement or specify the canonical identity migration/admission path that updates operator-surface identity, task roster projection, role/review authority, and aliases together. Add a doctor or preflight that reports when the active operator-surface identity is not admitted to task authority before review, close, or work-next attempts. Ensure errors name the missing authority surface and the exact repair command or admitted migration command. Coordinate with CAPA wording so accepted_with_notes reviews do not receive rejection-specific rationale.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] There is a canonical command or documented flow for admitting an operator-surface identity into task authority with role and capability mapping.
- [x] Task review/close/work-next preflight detects active operator-surface identities missing from task authority and reports a bounded repair path.
- [x] Role aliases and exact identities remain distinguishable; migration does not silently collapse narada-andrey.architect into narada-andrey.Kevin.
- [x] Review authority errors identify the missing authority surface rather than only saying agent not found in roster.
- [x] Regression coverage proves a renamed active architect identity can be admitted and then review a task without manual roster surgery.
