---
status: closed
depends_on: [618]
closed_at: 2026-04-25T00:33:35.577Z
closed_by: operator
governed_by: task_close:operator
---

# Task 619 - Promotion Authority To SQLite

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-555-recommendation-to-assignment-crossing-contract.md](.ai/do-not-open/tasks/20260424-555-recommendation-to-assignment-crossing-contract.md)

## Context

Promotion requests are still persisted on disk. If promotion is an authoritative crossing, it should not remain a file-era authority store when the rest of task state is moving into SQLite.

## Required Work

1. Move promotion request authority into SQLite.
2. Preserve auditability and operator inspectability.
3. Ensure promotion freshness, validation, override, and executed/rejected state remain queryable without file scans.
4. Demote any remaining file artifact to projection/export only.
5. Add focused tests for promotion persistence and readback.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

1. Moved promotion authority into SQLite-backed promotion records so promotion freshness and state no longer depend on filesystem artifacts.
2. Removed live review/promotion projection dependence from the normal CLI path and kept inspection/query behavior available through the sanctioned command surface.
3. Backfilled existing promotion state into SQLite so the cutover preserved inspectability instead of resetting history.
4. Tightened the command tests to read promotion state back from SQLite rather than from file-backed artifacts.

## Verification

- `pnpm --filter @narada2/cli build` — passed.
- Focused promotion persistence test — passed after switching to SQLite-backed readback.
- `narada task recommend --agent a1 --limit 1 --format json` — still worked after promotion cutover.
- Result: normal promotion operators no longer require file-backed authoritative records.

## Acceptance Criteria

- [x] Promotion authority is stored in SQLite.
- [x] No normal promotion operator requires file-backed authoritative records.
- [x] Promotion inspection remains available after the cutover.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

