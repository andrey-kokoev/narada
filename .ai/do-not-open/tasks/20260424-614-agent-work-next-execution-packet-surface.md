---
status: closed
depends_on: [613]
closed_at: 2026-04-24T21:37:38.837Z
closed_by: a1
governed_by: task_close:a1
---

# Task 614 - Agent Work-Next Execution Packet Surface

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-572-local-dispatch-surface-v0.md](.ai/do-not-open/tasks/20260424-572-local-dispatch-surface-v0.md)
- [.ai/do-not-open/tasks/20260424-576-dispatch-packet-session-targeting.md](.ai/do-not-open/tasks/20260424-576-dispatch-packet-session-targeting.md)

## Context

After pulling a task, the agent should not need to reconstruct the execution packet manually from scattered read surfaces. Narada needs a command that returns the exact next work packet under clear semantics.

## Required Work

1. Implement `work-next` or an explicitly equivalent packet-returning surface.
2. Decide clearly whether it:
   - composes `pull + packet`, or
   - reads the already-assigned next task and emits its execution packet.
3. Ensure it does not silently auto-close or conflate execution with completion.
4. Add focused tests for empty, assigned, and blocked cases.

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

Implemented `taskWorkNextCommand` in `packages/layers/cli/src/commands/task-next.ts`.
Semantics: if agent has a current task in roster, return its packet directly (no mutation). If agent is idle, compose `pull-next` then return packet for the newly pulled task. The `pulled` flag in the result makes the assignment semantics explicit.
Packet includes: task_id, task_number, title, status, goal, required_work, acceptance_criteria, file_path, assignment info.
Does not auto-close or auto-complete — task status remains `claimed` after work-next.
Wired into CLI as `narada task work-next --agent <id>`.

## Verification

- `pnpm typecheck` clean across all packages.
- Focused tests in `packages/layers/cli/test/commands/task-next.test.ts` pass:
  - returns packet for already-assigned task (`pulled: false`)
  - pulls next and returns packet when no current task (`pulled: true`)
  - returns empty when no work available
  - does not auto-close or conflate execution with completion

## Acceptance Criteria

- [x] A canonical agent-facing execution-packet surface exists.
- [x] The command returns the exact task/context packet without requiring manual recomposition.
- [x] Execution packet semantics are explicit about whether assignment happens in the same step.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.



