---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T19:20:38.390Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777663215324_o9ob3h
closed_at: 2026-05-01T19:16:39.478Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Demote legacy roster projection noise in accepted review CAPA guidance

## Chapter

task-review-capa-ergonomics

## Goal

Prevent accepted task reviews from emitting misleading CAPA recommendations when the only finding is legacy roster projection noise rather than a lifecycle authority defect.

## Context

Inbox envelope env_d48f8d8e-3698-4d5e-bcc2-7af8ff59438c reports that a narada-andrey accepted_with_notes review closed successfully but still emitted a lifecycle_or_roster_authority_mismatch CAPA recommendation because .ai/agents/roster.json last_done moved from a newer task to an older task. The result made an accepted review look like a rejection-grade authority failure.

## Required Work

Audit task review and CAPA recommendation generation for lifecycle/roster mismatch signals. Separate authoritative lifecycle defects from legacy projection-noise notes. Ensure accepted or accepted_with_notes reviews do not emit rejection-language or escalation-grade CAPA recommendations unless an actual authority defect remains. Clarify whether legacy roster projection updates are admitted, compatibility-only, or deprecated, and adjust review diagnostics accordingly. If lower-number task completion after higher-number completion is legal, make last_done/projection wording monotonic or explicitly non-authoritative.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Accepted and accepted_with_notes reviews do not emit rejection-specific CAPA wording solely because of legacy roster projection drift.
- [x] Lifecycle authority defects and compatibility projection noise are classified separately in review diagnostics.
- [x] Human and JSON review outputs identify whether a finding is blocking, non-blocking, compatibility-only, or projection-only.
- [x] Legacy roster projection behavior is documented or encoded so older-task closure after newer-task closure is not misreported as an authority mismatch.
- [x] Regression coverage proves the narada-andrey task-75 style accepted_with_notes case does not produce misleading CAPA guidance.
