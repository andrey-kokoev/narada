---
status: closed
created: 2026-04-24
depends_on: [589]
closed_at: 2026-04-24T20:37:45.702Z
closed_by: a2
governed_by: task_close:a2
---

# Task 593 - Implement `narada task create`

## Goal

Implement a sanctioned standalone `narada task create` operator so new tasks can be created without direct markdown authoring.

## Context

Decision `589` named this as the first executable line after the command-mediated task-authority chapter.

That choice is structurally correct:

- direct task creation by file authoring is one of the remaining substrate-bypass paths
- command-mediated task authority is not real until creation itself is command-owned

So this task is not a convenience feature. It is the first real displacement of direct task-file creation by a sanctioned operator.

## Required Work

1. Implement a standalone `narada task create` command.
2. Define the minimum required inputs explicitly, at minimum deciding:
   - title
   - task number allocation posture
   - dependency declaration
   - task body/spec input posture
   - whether chapter membership is explicit or derived
3. Make task-number allocation governed:
   - use existing reservation/allocation rules
   - do not allow filename-guess or ad hoc numbering
4. Define the canonical authored output shape for newly created tasks:
   - front matter
   - required sections
   - self-standing task structure
   - no derivative status files
5. Ensure the operator can create a valid task in one sanctioned command path.
   If auxiliary authoring is needed, it must still be behind the command.
6. Keep direct file authoring out of the normal workflow.
   The command may write markdown as substrate, but the operator should not have to hand-author the file.
7. Add focused tests covering at least:
   - happy-path task creation
   - governed task-number allocation
   - dependency serialization
   - invalid/missing required inputs
   - collision prevention
8. Record verification or bounded blockers.

## Non-Goals

- Do not implement every future task-mutation operator here.
- Do not widen into chapter creation unless required by the chosen create contract.
- Do not preserve manual file authoring as the normal task-creation path.

## Execution Notes

- Implemented `packages/layers/cli/src/commands/task-create.ts` with `taskCreateCommand()` combining number allocation, spec authoring, and SQLite lifecycle initialization.
- Registered under `narada task create` in `packages/layers/cli/src/main.ts`.
- Command uses `allocateTaskNumber()` (file-locked registry scan) for governed allocation, with `--number` override and `--dry-run` preview.
- Canonical artifact generated with standard sections: Goal, Context, Required Work, Non-Goals, Execution Notes, Verification, Acceptance Criteria. Front matter includes `status: opened` and optional `depends_on`.
- SQLite lifecycle row initialized via `openTaskLifecycleStore().upsertLifecycle()` with `status: opened`, respecting Decision 547 authority split.
- Focused tests added in `packages/layers/cli/test/commands/task-create.test.ts` (14 cases). Tests pass via `vitest run --pool=forks` (on-disk SQLite + worker threads causes cumulative native-resource hang; forks posture recorded explicitly).
- `pnpm typecheck` clean across all 11 packages.

## Verification

```bash
# Test command
cd packages/layers/cli
npx vitest run test/commands/task-create.test.ts --pool=forks
# Result: 14 passed (14)
```

## Acceptance Criteria

- [x] `narada task create` exists and works
- [x] Task number allocation is governed
- [x] Created task artifact is canonical and self-standing
- [x] Direct file authoring is no longer required for normal task creation
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded


