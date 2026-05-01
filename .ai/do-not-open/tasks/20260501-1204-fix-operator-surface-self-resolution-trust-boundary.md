---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T21:47:30.543Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777671963342_2b7eor
closed_at: 2026-05-01T21:48:05.542Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Fix operator-surface self-resolution trust boundary

## Chapter

Operator Surface Identity CAPA

## Goal

Prevent operator-surface --as self from resolving identity from active roster assignment alone.

## Context

Source inbox envelope env_3e624efe-8fd6-4e3a-8154-7b9a34578847 reports a major CAPA: Architect self-bind resolved as Builder from active_roster_assignment. Active work assignment is a projection, not identity authority.

## Required Work

Change operator-surface self-resolution so active roster assignment cannot determine identity by itself. Prefer explicit environment/session identity or admitted operator-surface binding identity. If only active roster assignment is available, return an ambiguous or untrusted self-resolution error with repair guidance. Include requested/resolved identity, source, and trust class in bind-focused output. Add regression coverage for Architect-vs-Builder roster contamination.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] --as self never resolves identity solely from active_roster_assignment
- [x] bind-focused output exposes self-resolution source and trust class
- [x] ambiguous or untrusted self-resolution blocks runtime binding mutation
- [x] regression covers Architect session with Builder active roster work
