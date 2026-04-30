---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T00:15:32.333Z
criteria_proof_verification:
  state: unbound
  rationale: Reproduced and fixed the from-file criteria preservation gap by broadening Acceptance Criteria parsing to checkbox, plain bullet, and numbered list items. task create now rejects an Acceptance Criteria section that exists but has no parseable list items, so lifecycle authority cannot silently store an empty criteria set. task read now reports criteria consistently after from-file creation without a separate amend.
closed_at: 2026-04-30T00:15:54.366Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Preserve from-file task criteria in lifecycle authority

## Chapter

Architect Inbox Processing

## Goal

Make narada task create --from-file admit Acceptance Criteria into lifecycle authority, or reject/diagnose bodies whose criteria cannot be admitted, so visible markdown and SQLite lifecycle state do not diverge.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: While creating User Site tasks 11 and 12 from markdown files, the generated task markdown contained Acceptance Criteria, but narada task read showed acceptance_criteria as empty until a separate narada task amend --criteria command was run. This creates extra operator friction and risks divergence between visible task markdown and lifecycle SQLite authority.
1. Read source inbox envelope env_3d17b227-522c-4e36-8806-ffad4c2eb3b8 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Reproduce the defect where task markdown created with --from-file contains Acceptance Criteria but task read/lifecycle authority reports empty acceptance_criteria.
- [x] Parse Acceptance Criteria from --from-file task bodies into lifecycle authority during task creation, or return a clear diagnostic if parsing/admission is impossible.
- [x] Ensure task read/evidence reports criteria consistently after --from-file creation without requiring a separate task amend command.
- [x] Add regression tests covering from-file criteria preservation and malformed/unparseable criteria diagnostics.
- [x] Update task create docs/help if needed to state how --from-file criteria are admitted.
