---
status: opened
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

- [ ] Identity binding mutation without explicit HWND or stable captured target evidence is refused.
- [ ] Explicit HWND binding mutates only the requested HWND and records before/after evidence.
- [ ] A focus-drift fixture proves mutation targets the captured HWND or fails rather than using current foreground at mutation time.
- [ ] Operator-facing command names or diagnostics no longer imply ambient focus is an admitted authority source.
- [ ] OSM/window-label repair workflows use captured-HWND discipline by construction or report a repair blocker.
