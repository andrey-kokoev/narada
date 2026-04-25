---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T02:58:36.204Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:45:16.232Z
closed_by: a3
---

# Command Execution Intent Zone Closure And First Cutover

## Goal

Close the CEIZ chapter by selecting and proving the first command-family cutover.

## Context

The chapter is not complete until at least one real Narada command execution path uses CEIZ end to end. The first cutover should be narrow and useful, not a broad shell replacement.

## Required Work

1. Select the first cutover command family from: focused tests, build commands, task graph rendering, workbench server launch, or diagnostic probes.
2. Implement a minimal `narada command run` or equivalent sanctioned surface if no better existing surface owns it.
3. Prove request -> admission -> execution -> persisted result -> bounded observation.
4. State whether TIZ calls CEIZ internally now or remains separate for the next chapter.
5. Record residual migration work as follow-up tasks, not hidden notes.

## Non-Goals

Do not migrate all command execution. Do not create a general remote executor. Do not collapse TIZ evidence semantics into generic command success.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by operator at 2026-04-25T02:58:36.204Z: dependencies
1. Selected diagnostic/read-only command execution as the first CEIZ cutover family. This is narrow, useful, and directly addresses oversized transcript risks.
2. Used the new `narada command-run run` surface from Task 632 as the sanctioned execution path.
3. Proved request -> admission -> execution -> persisted result -> bounded observation with `command-run run` and `command-run inspect`.
4. Verified tasks 629-632 are complete by evidence before closing the chapter.
5. TIZ remains separate for now. It should not be collapsed into generic command success until Task 640 migrates its execution core while preserving verification-specific evidence semantics.
6. Captured residual migration work explicitly as Task 640 and Task 641.

## Verification

| Command | Result |
| --- | --- |
| `narada task evidence 629 --format json` | Complete |
| `narada task evidence 630 --format json` | Complete |
| `narada task evidence 631 --format json` | Complete |
| `narada task evidence 632 --format json` | Complete |
| `narada command-run run --argv '["/usr/bin/printf","hello"]' --agent a2 --task 632 --format json` | Persisted CEIZ run `run_1777088531908_q60afu` with bounded admitted excerpt |
| `narada command-run inspect --run-id run_1777088531908_q60afu --format json` | Bounded persisted observation with digest/excerpt, no raw unbounded streams |
| `narada task create --title "Migrate Testing Intent Zone Onto CEIZ Core" ...` | Created Task 640 |
| `narada task create --title "Cut Over Build Graph Workbench Diagnostics To CEIZ" ...` | Created Task 641 |

## Acceptance Criteria

- [x] At least one real command-family path runs through CEIZ.
- [x] Result is persisted and inspectable without unbounded output.
- [x] Task evidence can reference the command run result.
- [x] TIZ relationship is updated based on implementation reality.
- [x] Residual command-family migrations are captured explicitly.



