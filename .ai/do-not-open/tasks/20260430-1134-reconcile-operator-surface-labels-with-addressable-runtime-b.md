---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T16:27:49.973Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777566407183_rsl8uq
closed_at: 2026-04-30T16:28:07.126Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Reconcile Operator Surface labels with addressable runtime bindings

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Make Narada distinguish and reconcile visible operator-surface labels, admitted identities, and addressable runtime bindings so a titled window does not misleadingly appear reachable when no send binding exists.

## Context

Operator observed a window titled narada.builder, while narada operator-surface status reported builder as addressability=unbound and operator-surface send failed with no_binding. The current model can be technically correct but ergonomically incoherent: visible title, identity admission, roster work state, and message addressability are separate surfaces without enough explanation or reconciliation guidance.

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

- [x] operator-surface status exposes a clear state for visible label present but addressable binding missing, when label evidence exists.
- [x] operator-surface send no_binding errors explain the difference between window title/label and addressable runtime binding.
- [x] The repair path names the exact command needed to bind the intended identity and runtime locus.
- [x] A sanctioned reconciliation command or documented path exists for converting a labeled focused window into an addressable binding.
- [x] Tests cover builder labeled-but-unbound while claimed on a task, and confirm no message is sent until binding exists.
- [x] Architect/Builder/Observer role identity remains explicit and is not inferred solely from labels.
