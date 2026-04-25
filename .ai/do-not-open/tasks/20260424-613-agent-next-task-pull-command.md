---
status: closed
depends_on: [612]
closed_at: 2026-04-24T21:37:19.007Z
closed_by: a1
governed_by: task_close:a1
---

# Task 613 - Agent Next-Task Pull Command

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-552-recommendation-zone-boundary-contract.md](.ai/do-not-open/tasks/20260424-552-recommendation-zone-boundary-contract.md)
- [.ai/do-not-open/tasks/20260424-555-recommendation-to-assignment-crossing-contract.md](.ai/do-not-open/tasks/20260424-555-recommendation-to-assignment-crossing-contract.md)

## Context

After inspection, agents need a sanctioned way to take the next admissible task without manual operator relay. That step must be explicit and mutation-bearing.

## Required Work

1. Implement `pull-next` or equivalent.
2. Make its semantics explicit:
   - choose next admissible task,
   - assign/claim it,
   - return the assigned task identity.
3. Preserve dependency, conflict, and review-separation gating.
4. Ensure repeated pulls do not double-claim the same task incorrectly.
5. Add focused tests for admissible, blocked, and empty-queue cases.

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

Implemented `taskPullNextCommand` in `packages/layers/cli/src/commands/task-next.ts`.
Semantics: find next admissible task via `findNextTaskForAgent`, then claim it atomically.
Claim path reuses existing `isValidTransition`, `checkDependencies`, assignment record creation, task file status update, SQLite lifecycle update, and roster update via `updateAgentRosterEntry`.
If the agent already holds the active claim on the best task, `pull-next` idempotently updates roster to `working` and returns `pulled: false`.
Wired into CLI as `narada task pull-next --agent <id>`.

## Verification

- `pnpm typecheck` clean across all packages.
- Focused tests in `packages/layers/cli/test/commands/task-next.test.ts` pass:
  - claims the next admissible task (task file, roster, assignment all updated)
  - does not double-claim (second pull returns empty because task is no longer runnable)
  - returns empty when no admissible tasks exist

## Acceptance Criteria

- [x] A sanctioned mutating next-task pull command exists.
- [x] Pull respects existing assignment and dependency gates.
- [x] Pull returns a deterministic task identity or a truthful empty result.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



