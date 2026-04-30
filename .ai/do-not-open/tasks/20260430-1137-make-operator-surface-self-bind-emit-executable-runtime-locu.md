---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T17:10:59.094Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777568987424_yogkrg
closed_at: 2026-04-30T17:11:27.790Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make Operator Surface self-bind emit executable runtime-locus handoff

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Make `operator-surface bind-focused --as self` either bind through the owning runtime locus or emit an exact executable handoff command instead of a placeholder runtime-locus token.

## Context

Builder ran `narada operator-surface bind-focused --as self --format json`. Narada correctly resolved self to builder and deferred because volatile handle authority belongs to a User/PC runtime locus, but the output only gave `--runtime-locus <pc-or-user-site>`. This is technically authority-preserving but operationally incoherent: the command intended to bind the current focused session should not require the agent/operator to already know an opaque runtime locus, and the deferred command should be directly executable or explicitly explain what discovery command must be run next.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada operator-surface bind-focused --as self --format json` no longer returns only `--runtime-locus <pc-or-user-site>` when it defers.
- [x] Deferred output includes either an exact executable command with resolved runtime locus or a bounded exact discovery command sequence.
- [x] Output names resolved identity, durable identity authority, volatile handle authority, and mutation posture.
- [x] Human output is actionable without hidden prior knowledge of runtime-locus ids.
- [x] Tests cover builder self-bind deferral, executable handoff, unknown runtime-locus guidance, and refusal to mutate foreign volatile authority.
- [x] Operator Surface status/send repair guidance reuses the improved executable handoff where applicable.
