---
status: closed
closed_at: 2026-04-28T20:15:31.542Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Ergonomic chapter closure and evidence repair tooling

## Chapter

cli-ergonomics

## Goal

Add practical CLI support for the repeated closure slog patterns: evidence-path linting, malformed criteria detection, existing-evidence verification, and chapter-ready inspection.

## Context

This task captures ergonomics debt observed while closing a long backlog of Narada proper tasks: stale evidence references were easy to miss, malformed acceptance-criteria fragments survived creation, chapter readiness required manual inspection, and live-effect tasks needed a documented existing-evidence verification posture.

## Required Work

1. Extend task lint with evidence-path and acceptance-criteria shape checks.
2. Extend read-only chapter status output with evidence-ready non-terminal tasks.
3. Reduce TIZ command quoting friction.
4. Document no-live-effect existing-evidence verification through TIZ.
5. Cover the behavior with focused tests and final verification.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `missing_evidence_path` linting in `@narada2/task-governance`: task evidence sections now scan explicit repo-path references and fail lint when a referenced path no longer exists.
2. Added `malformed_acceptance_criteria` linting for semicolon-joined criteria fragments and too-short checklist fragments.
3. Extended `narada chapter status` with `ready_tasks`, a read-only list of non-terminal tasks whose criteria, execution evidence, and verification evidence indicate they are ready for review or closure.
4. Added TIZ `--cmd-file` support so agents can store a complex verification command in a temporary file instead of fighting shell quoting.
5. Documented the no-live-effect posture in the agent task execution contract: live-effect work should be verified by existing evidence or fixture/static checks through TIZ rather than rerunning the effect.
6. Added focused tests for task lint, chapter readiness, and TIZ command-file ingestion.

## Verification

TIZ verification runs:

- `run_1777407026680_zj5qtm`: `pnpm --filter @narada2/task-governance test:governance` passed.
- `run_1777407063184_ak1hqa`: initial CLI focused run failed because the CLI imported stale built `@narada2/task-governance/dist`; this proved the package build boundary mattered.
- `run_1777407107585_f3ho15`: `pnpm --filter @narada2/task-governance build && pnpm --filter @narada2/cli exec vitest run packages/layers/cli/test/commands/task-lint.test.ts packages/layers/cli/test/commands/chapter-status.test.ts packages/layers/cli/test/commands/test-run.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed.
- `run_1777407144663_2o32cy`: `pnpm typecheck` passed.
- `run_1777407205983_pbzgum`: `narada task lint --chapter 1029` passed, validating this task's own criteria and evidence references.
- `run_1777407211501_uuxv6i`: `narada chapter status 1029` passed, validating the read-only chapter inspection surface.
- `run_1777407227427_mhkh8s`: initial `pnpm verify` failed because TIZ created a new verification row after the preceding lifecycle export, making the snapshot stale.
- `run_1777407259269_fd9c1b`: `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json && pnpm verify` passed.
- Final lifecycle snapshot export completed after the successful TIZ verification run so commit state includes the latest verification evidence.

## Acceptance Criteria

- [x] Task lint detects missing referenced paths in task evidence
- [x] Task lint detects malformed acceptance-criteria fragments
- [x] CLI exposes a non-mutating chapter-ready inspection for implemented-but-unclosed tasks
- [x] Existing-evidence verification mode is documented or surfaced without rerunning live effects
- [x] Focused tests cover the new ergonomics
- [x] Verification runs through TIZ and pnpm verify
