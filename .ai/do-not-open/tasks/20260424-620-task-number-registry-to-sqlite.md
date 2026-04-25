---
status: closed
depends_on: [619]
closed_at: 2026-04-25T00:33:36.430Z
closed_by: operator
governed_by: task_close:operator
---

# Task 620 - Task Number Registry To SQLite

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-593-implement-narada-task-create.md](.ai/do-not-open/tasks/20260424-593-implement-narada-task-create.md)

## Context

Task creation still depends on a file-backed registry. That leaves numbering authority outside the main task authority store and keeps a live mutable filesystem counter in the loop.

## Required Work

1. Move task number allocation authority into SQLite.
2. Remove `.registry.json` as the authoritative source for next task number.
3. Preserve collision safety and concurrent allocation guarantees.
4. Keep any on-disk registry only as an export/projection if still needed.
5. Add focused tests for allocation monotonicity and conflict safety.

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

1. Moved task number allocation authority into SQLite and removed `.registry.json` from the live numbering path.
2. Rewired allocator/create and reservation-era support paths to use SQLite-backed sequencing instead of the file-backed registry.
3. Deleted the old registry projection once the live allocation path no longer depended on it.
4. Preserved monotonic allocation behavior by keeping the sequence at the owning layer rather than spreading fallback counters through commands.

## Verification

- `pnpm --filter @narada2/cli build` — passed.
- Focused allocator tests — passed after the SQLite cutover.
- `narada task allocate --dry-run --format json` — returned the next number from SQLite.
- `narada task create --dry-run --format json` — matched SQLite-backed allocation.
- Result: task and chapter allocation no longer depend on `.registry.json` for truth.

## Acceptance Criteria

- [x] Task number allocation is authoritative in SQLite.
- [x] `task create` and chapter/task allocation no longer depend on `.registry.json` for truth.
- [x] Concurrent-safe allocation behavior is preserved.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

