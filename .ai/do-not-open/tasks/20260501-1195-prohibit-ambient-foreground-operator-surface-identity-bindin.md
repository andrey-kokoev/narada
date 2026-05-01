---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T20:13:15.735Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777666376007_e56zfa
closed_at: 2026-05-01T20:14:20.244Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Prohibit ambient foreground operator-surface identity binding

## Chapter

operator-surface-binding-hardening

## Goal

Remove ambient foreground window state as an authority source for mutating operator-surface identity bindings.

## Context

Inbox envelope env_78ed9462-2da0-4f64-b3fc-67ef396c147e reports that a binding repair called Set-FocusedWindowIdentityBinding without an explicit HWND. Foreground focus changed between diagnosis and mutation, causing the wrong operator surface to be bound.

## Required Work

Refuse mutating operator-surface identity binding when no explicit captured HWND or equivalent stable target evidence is supplied. If a picker or helper is used, it must capture the target HWND before mutation and pass that explicit HWND through the mutation command. Persist requested HWND, observed HWND, window title/class/process evidence, asserted identity, and postcondition evidence in the mutation artifact. Rename or deprecate casual focus-based command surfaces so they cannot be mistaken for admitted repair paths.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Identity binding mutation without explicit HWND or stable captured target evidence is refused.
- [x] Explicit HWND binding mutates only the requested HWND and records before/after evidence.
- [x] A focus-drift fixture proves mutation targets the captured HWND or fails rather than using current foreground at mutation time.
- [x] Operator-facing command names or diagnostics no longer imply ambient focus is an admitted authority source.
- [x] OSM/window-label repair workflows use captured-HWND discipline by construction or report a repair blocker.
