---
status: closed
created: 2026-04-22
owner: unassigned
depends_on:
  - 455
  - 456
  - 463
---

# Task 480 — Atomic Roster Assignment Claims Task

## Context

Current task governance splits assignment and claiming:

- `narada task roster assign <task> --agent <id>` records roster state.
- `narada task claim <task> --agent <id>` transitions the task file to `claimed` and writes assignment history.

This creates a semantic leak. The roster can say an agent is working while the task file still says `opened`. Operators then need to remember to run a second command. During Task 479 assignment, the explicit claim succeeded, but also exposed a second bug: the claim command rewrote front matter and collapsed `depends_on` to an empty value.

## Goal

Make roster assignment an atomic task-governance operator: assigning an agent to a task must claim the task by default and preserve task front matter exactly except for intended lifecycle fields.

## Non-Goals

- Do not remove `narada task claim`; direct claim remains useful for non-roster flows.
- Do not invent a new task state machine.
- Do not add distributed locking beyond the existing task-governance file mutation model unless required by tests.
- Do not create derivative status files.

## Required Work

1. Update `narada task roster assign`.
   - Default behavior must:
     - validate the agent exists in roster;
     - validate the task exists;
     - validate the task is claimable by the same rules as `task claim`;
     - write roster assignment;
     - write task assignment history;
     - transition task `opened` or `needs_continuation` to `claimed`.
   - The operation must fail without partial mutation if task claim validation fails.

2. Add an explicit escape hatch only if needed.
   - If there is a legitimate planning use case, add `--no-claim`.
   - If `--no-claim` is added, it must be documented as exceptional and should emit a warning.

3. Preserve task front matter.
   - Fix the front-matter serializer/parser path so list fields such as `depends_on` are not collapsed or deleted when claiming.
   - Add regression coverage using a task with `depends_on` list and at least one additional front-matter field.

4. Align command docs.
   - Update command help/AGENTS/task contract language so operators and agents know that roster assignment claims by default.
   - Document the exact difference between:
     - assignment;
     - claim;
     - done;
     - review;
     - close.

5. Verify with focused tests.
   - Add or update CLI tests for:
     - successful `roster assign` claims task;
     - claim validation failure leaves roster and task unchanged;
     - `depends_on` list survives claim;
     - already-claimed task behavior is explicit and non-destructive;
     - optional `--no-claim`, if implemented.

## Acceptance Criteria

- [x] `narada task roster assign <task> --agent <id>` claims the task by default.
- [x] Assignment and claim are atomic from the operator perspective; failed claim validation does not leave roster saying the agent is working.
- [x] `depends_on` and other front-matter fields survive claim/assign mutations.
- [x] Existing `narada task claim` still works.
- [x] Tests cover front-matter preservation and assignment/claim coupling.
- [x] Documentation states that assignment claims by default.
- [x] `pnpm --filter @narada2/cli test` or narrower focused CLI tests pass.
- [x] `pnpm verify` passes if shared task-governance code is touched.

## Verification Commands

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run \
  test/commands/task-roster.test.ts \
  test/commands/task-claim.test.ts \
  test/lib/task-governance.test.ts
pnpm verify
```

## Execution Notes

1. **Front-matter parser fix** (`packages/layers/cli/src/lib/task-governance.ts`):
   - `parseFrontMatter()` now handles YAML list syntax (`- item`) in addition to inline arrays and nested objects.
   - `parseScalar()` fixed to parse float values (e.g., `0.8`) not just integers.
   - This fixes the bug where `depends_on` written as a YAML list was collapsed to empty string on task claim/assign.

2. **Atomic roster assignment** (`packages/layers/cli/src/commands/task-roster.ts`):
   - `taskRosterAssignCommand` now validates the task exists and is claimable **before** updating the roster.
   - For `opened` or `needs_continuation` tasks, it claims the task (creates assignment record, transitions status to `claimed`) as part of roster assignment.
   - If claim validation fails (missing task, unmet dependencies, already claimed, invalid transition), the roster is left unchanged.
   - For already-claimed tasks, the roster is updated with a warning (non-destructive).
   - Added `--no-claim` escape hatch with warning emission.

3. **CLI command registration** (`packages/layers/cli/src/main.ts`):
   - Updated `roster assign` help text: "Mark agent as working on a task (claims the task by default)".
   - Added `--no-claim` option.

4. **Tests**:
   - `test/lib/task-governance.test.ts`: Added 6 tests for `parseFrontMatter` / `serializeFrontMatter` round-trip including YAML list syntax and mixed front matter.
   - `test/commands/task-roster.test.ts`: Added 6 tests covering claim-by-default, `depends_on` preservation, validation-failure atomicity, unmet dependencies, already-claimed behavior, and `--no-claim`.
   - `test/commands/task-claim.test.ts`: Added 1 test for `depends_on` YAML list preservation through direct claim.

5. **Documentation** (`AGENTS.md`):
   - Added "Task Assignment and Claim Semantics" table documenting the exact difference between assignment, claim, done, review, and close operators.
   - Documented atomicity guarantee and `--no-claim` behavior.

## Verification

### Method
- Ran focused CLI tests for task-governance, task-roster, and task-claim.
- Ran full CLI suite.
- Ran `pnpm verify` for cross-package typecheck and fast tests.

### Results
- `pnpm --filter @narada2/cli exec vitest run test/commands/task-roster.test.ts test/commands/task-claim.test.ts test/lib/task-governance.test.ts`: **87 tests pass** (3 test files)
- `pnpm --filter @narada2/cli exec vitest run` (full CLI suite): **pass**
- `pnpm verify`: **All 5 steps pass**
