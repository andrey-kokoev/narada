---
status: closed
depends_on: []
closed_at: 2026-04-24T21:36:55.804Z
closed_by: a1
governed_by: task_close:a1
---

# Task 612 - Agent Next-Task Peek Contract

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-570-dispatch-zone-boundary-contract.md](.ai/do-not-open/tasks/20260424-570-dispatch-zone-boundary-contract.md)
- [.ai/do-not-open/tasks/20260424-571-dispatch-packet-and-pickup-contract.md](.ai/do-not-open/tasks/20260424-571-dispatch-packet-and-pickup-contract.md)

## Context

Agents currently need separate recommendation, assignment, and execution steps. The first missing surface is a non-mutating way to ask whether work is waiting.

## Required Work

1. Define the canonical semantics of `peek-next`.
2. Force it to be non-mutating:
   - no assignment
   - no claim
   - no pickup
   - no lease
3. Ensure it returns enough information for an agent to decide whether to pull.
4. Add focused tests proving `peek-next` does not change task or roster state.

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

Implemented `taskPeekNextCommand` in `packages/layers/cli/src/commands/task-next.ts`.
Added `findNextTaskForAgent` helper to `packages/layers/cli/src/lib/task-governance.ts`.
`peek-next` is strictly non-mutating: it calls `findNextTaskForAgent` which only reads roster, task files, and assignment records. No writes to task files, roster, assignments, or SQLite lifecycle occur.
Wired into CLI as `narada task peek-next --agent <id>`.

## Verification

- `pnpm typecheck` clean across all packages.
- Focused tests in `packages/layers/cli/test/commands/task-next.test.ts` pass:
  - returns empty when no runnable tasks
  - returns next opened task without claiming it (roster and task file unchanged)
  - respects dependency gating
  - skips tasks already claimed by another agent

## Acceptance Criteria

- [x] A canonical non-mutating next-task inspection surface is defined or implemented.
- [x] `peek-next` cannot silently claim, assign, or dispatch work.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



