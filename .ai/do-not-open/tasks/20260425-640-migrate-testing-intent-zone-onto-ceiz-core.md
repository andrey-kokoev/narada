---
status: closed
amended_by: a2
amended_at: 2026-04-25T03:56:23.782Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:59:48.819Z
closed_by: a3
---

# Migrate Testing Intent Zone Onto CEIZ Core

## Chapter

CEIZ Residual Migration

## Goal

Route TIZ execution through shared CEIZ `CommandRunRequest` / `CommandRunResult` persistence while preserving verification-specific evidence semantics.

## Context

CEIZ now owns general command execution persistence and bounded output admission. TIZ still has its own direct spawn implementation. The migration must make TIZ use CEIZ for command execution/capture while keeping `VerificationRun` as the verification-specific evidence artifact.

## Required Work

1. Replace TIZ direct process execution with a CEIZ command-run invocation or shared CEIZ execution core.
2. Preserve `VerificationRun` rows and test-specific fields: scope, timeout, task linkage, requester identity, result status, exit code, duration, stdout/stderr digests, admitted excerpts, and completed timestamp.
3. Link the verification record to the CEIZ command run through bounded structured metadata if no first-class column exists yet.
4. Preserve TIZ-only policy: full-suite guard remains TIZ-owned and must not become generic CEIZ behavior.
5. Add or update focused tests proving a test run creates both a verification run and a command run, with bounded output.

## Non-Goals

Do not remove TIZ. Do not collapse verification success into generic command success. Do not migrate every historical verification command in this task.

## Execution Notes

1. Removed the TIZ-local process-spawn path from `packages/layers/cli/src/commands/test-run.ts`.
2. Routed `test-run run` execution through `commandRunCommand()` with explicit shell mode, bounded excerpt output, task linkage, requester identity, timeout, and workspace-write side-effect classification.
3. Preserved `VerificationRun` as the test evidence artifact. CEIZ owns command execution and admitted output; TIZ maps the CEIZ result back into verification status, exit code, duration, digests, excerpts, and completion timestamp.
4. Linked each verification row to its CEIZ command run through `metrics_json.command_run_id`.
5. Preserved TIZ-specific full-suite guard behavior before CEIZ execution is requested.
6. Updated `packages/layers/cli/test/commands/test-run.test.ts` to assert that successful test runs create both `verification_runs` and `command_runs`, and that bounded stdout/stderr admission flows from CEIZ into TIZ evidence.
7. Preserved the prior command contract that failed verification commands return `GENERAL_ERROR` while still storing a failed verification result.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Passed |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/test-run.test.ts --pool=forks"` | Passed, 12/12 tests |

## Acceptance Criteria

- [x] `test-run run` executes through CEIZ command-run storage.
- [x] `VerificationRun` remains the task evidence artifact for tests.
- [x] Full-suite guard remains TIZ-specific.
- [x] Focused tests prove TIZ evidence still works.
- [x] Bounded output admission is inherited from CEIZ.



