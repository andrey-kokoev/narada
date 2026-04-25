---
status: closed
depends_on: [614]
closed_at: 2026-04-24T21:37:59.090Z
closed_by: a1
governed_by: task_close:a1
---

# Task 615 - Agent Next-Task Surfaces Closure

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-612-615-agent-next-task-surfaces.md](.ai/do-not-open/tasks/20260424-612-615-agent-next-task-surfaces.md)

## Context

This closure must record the canonical agent workflow for seeing, taking, and starting the next task, and must refuse closure if the semantics remain collapsed or ambiguous.

## Required Work

1. Verify `612–614` are complete by evidence or bounded blocker.
2. Produce the closure artifact.
3. Record the canonical flow:
   - inspect,
   - pull,
   - obtain work packet.
4. Refuse closure if `peek`, `pull`, and `work-next` are still semantically smeared.

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

Closure artifact for the agent next-task surfaces chapter (Tasks 612–614).

Canonical agent workflow:
1. **Inspect** — `narada task peek-next --agent <id>`
   - Non-mutating. Returns the best admissible task with affinity info, or empty.
   - Agent decides whether to pull based on title, goal, and affinity.
2. **Pull** — `narada task pull-next --agent <id>`
   - Mutating. Claims the best admissible task, updates roster to `working`, creates assignment record.
   - Idempotent: if agent already holds the claim, updates roster and returns without duplicate assignment.
   - Respects dependency gating and prevents double-claim by other agents.
3. **Obtain work packet** — `narada task work-next --agent <id>`
   - If agent has current task, returns its execution packet directly (`pulled: false`).
   - If agent is idle, composes pull-next then returns packet (`pulled: true`).
   - Packet contains: task_id, task_number, title, status, goal, required_work, acceptance_criteria, file_path, assignment.
   - Never auto-closes or conflates execution with completion.

Semantics are not smeared: each command has a single responsibility and the mutating boundary is explicit at `pull-next`.

## Verification

- `pnpm typecheck` clean across all packages.
- 11 focused tests in `packages/layers/cli/test/commands/task-next.test.ts` pass.
- Tasks 612, 613, 614 each have execution notes, verification, and checked acceptance criteria.

## Acceptance Criteria

- [x] `612–614` are complete by evidence or bounded blocker.
- [x] The closure artifact records the canonical agent workflow.
- [x] The chapter does not close while next-task semantics remain ambiguous.
- [x] Verification or bounded blocker evidence is recorded.



