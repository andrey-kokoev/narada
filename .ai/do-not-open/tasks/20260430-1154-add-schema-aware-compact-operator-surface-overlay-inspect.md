---
status: opened
---

# Add schema-aware compact operator-surface overlay inspect

## Goal

Prevent context-burning overlay inspect failures by providing a stable compact inspect helper/contract for Architect loops.

## Context

Source inbox envelope env_6424109c-2502-4a0e-89ea-7cdefd43e137 reports Inspect-WindowSurfaceOverlay.ps1 output was parsed with an assumed labels property, causing repeated PowerShell Select-Object errors and substantial transcript/context waste.

## Required Work

1. Inventory current operator-surface inspect/status helpers, Inspect-WindowSurfaceOverlay.ps1 output shape, and Architect-loop consumers. 2. Add or specify a stable compact inspect command/helper that returns current bindings and labels in a documented schema for Architect loops. 3. Update Inspect-WindowSurfaceOverlay.ps1 or its sanctioned wrapper to support compact mode or documented properties so callers do not guess JSON shape. 4. Ensure schema mismatch fails once with compact repair guidance, not repeated property-missing errors per object. 5. Update Architect-loop guidance to prefer sanctioned compact inspect helpers over ad hoc Select-Object against unknown JSON. 6. Add regression coverage for missing/changed inspect fields producing bounded output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] There is a stable compact operator-surface inspect path for current bindings/labels.
- [ ] Inspect consumers no longer need to guess a labels property from raw output.
- [ ] Schema mismatch produces one bounded error with repair guidance.
- [ ] Tests or fixtures cover compact inspect and missing-property failure behavior.
- [ ] Architect-loop docs/guidance point to the compact helper instead of ad hoc JSON projection.
