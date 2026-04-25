---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T02:58:31.003Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:43:01.565Z
closed_by: a3
---

# Command Run Persistence Output Admission And Observation

## Goal

Implement the CEIZ storage and observation contract so command runs become queryable, bounded, and safe to display.

## Context

Prior failures included oversized CLI transcripts and lost command timing context. CEIZ must persist command runs while preventing raw output dumps from becoming the default viewing behavior.

## Required Work

1. Add SQLite storage for command run requests and results.
2. Persist duration, exit status, status transitions, output digests, admitted excerpts, and optional retained-output references.
3. Add bounded observation commands for listing and inspecting command runs.
4. Integrate output admission defaults: terse by default, explicit full output only by opt-in.
5. Link command runs to tasks, agents, and operator identities when provided.
6. Ensure command-run observation cannot accidentally emit unbounded stdout/stderr.

## Non-Goals

Do not make CEIZ the only execution path yet. Do not require every old command to migrate in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by operator at 2026-04-25T02:58:31.003Z: dependencies
1. Added `command_runs` SQLite storage to `task-lifecycle-store.ts`, including request identity, command argv JSON, cwd/env/stdin policy, task/agent linkage, side-effect class, approval posture, result status, timing, digests, admitted excerpts, retained-output URI, error class, approval outcome, telemetry, and indexes.
2. Added store methods: `insertCommandRun`, `updateCommandRun`, `getCommandRun`, and `listCommandRuns`.
3. Implemented `narada command-run run|inspect|list` in `commands/command-run.ts`.
4. Made output bounded by construction: run/inspect expose digests plus admitted excerpts; list exposes summary rows only and never includes stdout/stderr excerpts.
5. Added policy blocking for command classes requiring approval; blocked commands persist `blocked_by_policy` rather than executing.
6. Linked command runs to tasks and agents when supplied.
7. Added focused tests proving persistence, bounded output, full inspect metadata without raw streams, and bounded list summaries.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/command-run.test.ts --pool=forks"` | Pass, 3/3 |
| `narada command-run run --argv '["/usr/bin/printf","hello"]' --agent a2 --task 632 --format json` | Persisted succeeded run with digest/excerpt and task/agent linkage |
| `narada command-run list --agent a2 --limit 1 --format json` | Bounded summary row, no stdout/stderr payload |

## Acceptance Criteria

- [x] SQLite tables exist for command requests/results.
- [x] Observation commands are bounded by default.
- [x] Full output requires explicit opt-in and does not appear in normal JSON previews.
- [x] Task/agent/operator linkage is persisted when supplied.
- [x] Focused tests prove bounded output behavior.



