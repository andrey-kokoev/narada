---
status: closed
closed: 2026-04-22
depends_on: [385, 398]
---

# Task 407 — Chapter Init CLI Command

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Dependency assumptions
- Focused verification scope

This task implements tooling. It must not create the Email Marketing Live Dry Run chapter itself unless explicitly required for a focused fixture/test.

## Assignment

Implement a minimal `narada chapter init` command that creates a self-standing chapter skeleton and child task skeletons without task-number collisions.

## Context

Narada now relies heavily on task-governed chapter development. Manual chapter creation has repeatedly caused avoidable errors:
- task number collisions;
- claimed task creation without files;
- non-self-standing child tasks;
- missing DAG files;
- Mermaid drift;
- missing CCC posture tables;
- stale or inconsistent task status.

The command should reduce these errors by creating a correct scaffold. It must not become a planning AI. It is a deterministic file generator.

## Required Reading

- `.ai/task-contracts/chapter-planning.md`
- `.ai/task-contracts/agent-task-execution.md`
- `packages/layers/cli/src/main.ts`
- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/chapter-close.ts`
- `packages/layers/cli/test/commands/`
- `.ai/tasks/20260422-398-email-marketing-live-dry-run-chapter-shaping.md`

## Required Command Shape

Add:

```bash
narada chapter init <slug> \
  --title <title> \
  --from <number> \
  --count <n> \
  --depends-on <numbers>
```

Acceptable aliases/options:
- `--dry-run`
- `--cwd <path>`
- `--task-prefix <prefix>` if needed for child task names

Do not add interactive prompts.

## Required Behavior

1. Validate input.

   Hard fail if:
   - `slug` is empty or not filesystem-safe;
   - `--title` is missing;
   - `--from` is not a positive integer;
   - `--count` is less than 1;
   - any target task number already exists;
   - the DAG range file already exists.

2. Create files.

   For `--from 400 --count 3 --slug live-dry-run`, create:
   - `.ai/tasks/YYYYMMDD-400-402-live-dry-run.md`
   - `.ai/tasks/YYYYMMDD-400-live-dry-run-1.md`
   - `.ai/tasks/YYYYMMDD-401-live-dry-run-2.md`
   - `.ai/tasks/YYYYMMDD-402-live-dry-run-3.md`

   Exact child slug naming can differ if documented and deterministic.

3. Chapter range file requirements.

   The range file must include:
   - `status: opened`
   - explicit `depends_on`
   - chapter title
   - goal placeholder
   - plain Mermaid DAG
   - task table
   - CCC posture table with evidenced/projected columns
   - deferred work section
   - closure criteria

4. Child task file requirements.

   Each child task must be self-standing and include:
   - `status: opened`
   - explicit `depends_on`
   - title
   - execution mode
   - assignment
   - required reading
   - context
   - required work
   - non-goals
   - acceptance criteria

5. Dry-run mode.

   `--dry-run` must print the file paths and generated task numbers without writing files.

6. Output.

   Human output must list created files.
   JSON output may be supported if existing CLI convention makes it simple, but it is not required.

## Non-Goals

- Do not use an LLM to generate tasks.
- Do not infer chapter content from prose.
- Do not close chapters.
- Do not mutate roster state.
- Do not claim tasks.
- Do not implement `chapter plan` or `chapter review`.
- Do not add broad test runs.

## Verification

Use focused CLI tests.

Expected focused tests:
- creates a range file and child files;
- refuses collisions;
- dry-run writes nothing;
- generated child tasks contain required self-standing sections;
- generated range file contains plain Mermaid and CCC table.

Run the smallest relevant commands, likely:

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/chapter-init.test.ts
pnpm --filter @narada2/cli typecheck
```

Run `pnpm verify` only after focused tests pass.

## Acceptance Criteria

- [x] `narada chapter init` is wired into the CLI.
- [x] Command creates a range file and child task files deterministically.
- [x] Command hard-fails on task number collisions.
- [x] Generated child tasks are self-standing.
- [x] Generated range file includes plain Mermaid and CCC posture table.
- [x] `--dry-run` writes no files.
- [x] Focused CLI tests cover success, collision, and dry-run.
- [x] No derivative task-status files are created.

## Residuals

- `pnpm verify` passes.
  - **Rationale:** `pnpm verify` fails due to pre-existing untracked files in `packages/sites/windows/` causing type errors unrelated to this task. The CLI package itself is fully clean. Documented in original execution notes.

## Execution Notes

### Write Set

- `packages/layers/cli/src/commands/chapter-init.ts` — new command implementation
- `packages/layers/cli/test/commands/chapter-init.test.ts` — 11 focused tests
- `packages/layers/cli/src/main.ts` — wired `chapter init` subcommand

### Verification

- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm --filter @narada2/cli build` — passes
- `pnpm --filter @narada2/cli test` — 225/225 tests pass (11 new chapter-init tests)
- End-to-end CLI invocation verified with `--dry-run` and live write modes

### Residual

`pnpm verify` fails due to pre-existing untracked files in `packages/sites/windows/` (`cycle-coordinator.ts`, `cycle-step.ts`) causing type errors unrelated to this task. The CLI package itself is fully clean. No action required from this task.
