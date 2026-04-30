---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T22:48:20.478Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777589261712_9l2dwo
closed_at: 2026-04-30T22:48:36.325Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Align operator-surface identity schema with Windows carrier scripts

## Goal

Remove schema mismatch between Narada operator-surface identity records and Windows carrier/binding scripts so newly admitted identities bind without manual compatibility edits.

## Context

Source inbox envelope env_0e16ff4f-a109-4832-b51a-56dbf57f75db reports that operator-surface identity add emits identity_id-shaped records while Windows carrier scripts still expect identity_name, role_metadata, narada_site_relation, and label_projection.

## Required Work

1. Identify the canonical operator-surface identity schema and the Windows carrier projection boundary. 2. Update Narada proper CLI and/or carrier integration so identities admitted by narada operator-surface identity add are bindable by Set-FocusedWindowIdentityBinding.ps1 and label materialization without manual edits. 3. Add regression coverage for bind-focused or carrier projection against identity records emitted by the CLI. 4. Add doctor or preflight output that fails closed with repair guidance when an identity registry is incompatible with the carrier projection. 5. Preserve Plural Embodiment, Singular Authority: Windows scripts may be projections/carriers, not independent identity authorities.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A newly admitted operator-surface identity can be resolved by the Windows focused-window binding path without manual identity_name compatibility edits.
- [x] Window-label materialization can consume the canonical record or an explicitly generated projection.
- [x] Regression coverage proves CLI-created records work with bind-focused/carrier projection expectations.
- [x] Doctor/preflight reports schema incompatibility with bounded repair guidance.
- [x] Documentation or command help identifies the authority/projection boundary for operator-surface identities.
