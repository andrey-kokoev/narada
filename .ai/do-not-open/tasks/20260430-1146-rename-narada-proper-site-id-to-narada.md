---
status: claimed
---

# Rename Narada proper Site id to narada

## Goal

Remove the '-proper' suffix from Narada proper's canonical Site id so current-site routing uses narada while preserving compatibility with existing narada-proper references.

## Context

Operator observed that operator-surface routing treats the current Site plane as narada-proper, causing site_plane_mismatch when using the desired canonical Site id narada. Commission a governed migration from narada-proper to narada, not an ad hoc alias-only workaround.

## Required Work

1. Inventory all Narada proper Site id declarations, operator-surface identity aliases, binding/status outputs, Site registry records, tests, docs, and mutation evidence paths that refer to narada-proper. 2. Define the migration rule: canonical Site id becomes narada; narada-proper remains only as a backward-compatible alias where needed. 3. Update the owning CLI/domain code and fixtures so --current-site narada resolves to Narada proper without mismatch. 4. Ensure operator-surface send/status/bind-focused guidance uses narada as the canonical Site id and reports narada-proper only as an alias or legacy reference. 5. Add focused regression coverage for routing builder/architect/observer with --current-site narada. 6. Verify no direct SQLite/manual state edits are required; use sanctioned import/export or migration surfaces if runtime state must be reconciled.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Narada proper's canonical Site id is narada in operator-surface routing/status/help surfaces.
- [ ] Existing narada-proper references remain accepted as legacy aliases or receive explicit migration guidance.
- [ ] operator-surface send --to builder --current-site narada no longer fails with site_plane_mismatch when identity is otherwise valid.
- [ ] Focused tests cover narada canonical id and narada-proper compatibility behavior.
- [ ] Documentation or help output no longer teaches narada-proper as the preferred Site id.
