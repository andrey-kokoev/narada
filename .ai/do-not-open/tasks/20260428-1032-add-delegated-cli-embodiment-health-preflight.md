---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T01:13:12.008Z
criteria_proof_verification:
  state: unbound
  rationale: Delegated CLI embodiment health is proven through command diagnostics, focused broken-embodiment fixtures, source envelope archive status, and full repository verification.
closed_at: 2026-04-29T01:13:19.344Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add delegated CLI embodiment health preflight

## Chapter

site-embodiments

## Goal

Make Site authority and inbox preflight distinguish runtime health from delegated Narada CLI embodiment health for downstream Sites such as Staccato.

## Context

<!-- Context placeholder -->

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

- [x] Preflight reports configured CLI embodiment loadability or missing dependency diagnostics
- [x] Docs distinguish runtime substrate health from operator command-surface health
- [x] Focused tests cover broken delegated CLI embodiment reporting
- [x] Source inbox envelope is handled through governed archive action
- [x] pnpm verify passes
