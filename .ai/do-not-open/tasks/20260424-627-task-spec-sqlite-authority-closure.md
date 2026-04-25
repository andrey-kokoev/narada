---
status: closed
depends_on: [626]
closed_at: 2026-04-24T23:46:42.337Z
closed_by: codex
governed_by: task_close:codex
---

# Task 627 - Task Spec SQLite Authority Closure

## Execution Mode

Proceed directly. This is a closure and verification task.

## Context

The final task-authority cutover is only real if spec, read, amend, and projection behavior all converge without markdown acting as hidden source.

## Required Work

1. Verify that task spec authority is SQLite-owned.
2. Verify that normal task read/amend surfaces no longer depend on markdown as source.
3. Verify that projection/export posture is coherent.
4. Record remaining bounded blockers honestly if the cutover is incomplete.
5. Close the line only when the authority split is mechanically true.

## Non-Goals

- Do not paper over residual markdown-source fallback.
- Do not close the line on doctrine alone.

## Execution Notes

1. Verified the final normal-path authority split:
   - SQLite owns task spec
   - markdown task files are projection/export only
2. Verified that `task create`, `task read`, `task amend`, and downstream read surfaces now consume SQLite-backed spec data.
3. Verified that repo-wide spec population exists for the unambiguous executable task set.
4. Recorded the remaining bounded blocker honestly:
   - the suites are extremely slow in this environment, but they now complete and pass when given enough time.
5. Closed the chapter on the mechanical authority split, not on doctrine alone.

## Verification

- `pnpm --filter @narada2/cli typecheck` -> passed
- `pnpm --filter @narada2/cli build` -> passed
- `timeout 180s pnpm --filter @narada2/cli exec vitest run test/commands/task-create.test.ts --pool=forks --reporter=dot` -> passed (14/14)
- `timeout 240s pnpm --filter @narada2/cli exec vitest run test/commands/task-read.test.ts --pool=forks --reporter=dot` -> passed (11/11)
- `timeout 420s pnpm --filter @narada2/cli exec vitest run test/commands/task-amend.test.ts --pool=forks --reporter=dot` -> passed (17/17)
- repo migration count:
  - `task_specs = 604`
  - `task_lifecycle = 604`
- temp-repo end-to-end command roundtrip -> passed
- repo `task read`, `task list`, and `task recommend` all succeeded through the cutover path
- residual note:
  - focused Vitest proof exists, but the suites are slow enough that future verification should continue using explicit `timeout` bounds

## Acceptance Criteria

- [x] SQLite owns task spec authority in the normal path.
- [x] Markdown no longer acts as hidden source.
- [x] Projection/export posture is verified.
- [x] Remaining blockers, if any, are explicit.
- [x] Chapter is ready to close honestly.

