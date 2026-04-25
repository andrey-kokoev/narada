---
status: closed
governed_by: task_review:a3
closed_at: 2026-04-25T04:05:33.617Z
closed_by: a3
---

# Cut Over Build Graph Workbench Diagnostics To CEIZ

## Chapter

CEIZ Residual Migration

## Goal

Move high-value non-test command families onto CEIZ command-run request/result storage and bounded observation.

## Context

CEIZ is the sanctioned command execution zone. After TIZ was routed through CEIZ, the remaining high-value non-test diagnostics still needed explicit CEIZ entry points so agents stop using ad hoc shell commands for build/graph/workbench checks. The target is not to remove the underlying diagnostic commands; it is to make their execution observable through `command_runs` with bounded admitted output.

## Required Work

1. Add named CEIZ diagnostic presets for:
   - CLI build diagnostics.
   - Task graph JSON diagnostics.
   - Workbench health/graph-route diagnostics.
2. Ensure presets persist `command_runs` rows with side-effect class, requester, agent, task linkage, duration, exit code, digests, and bounded excerpts.
3. Add a bounded `workbench diagnose` command that summarizes workbench state without starting a long-running server.
4. Do not emit raw graph or command transcripts by default.
5. Add focused tests for preset declaration/execution and bounded workbench diagnostics.
6. Verify the presets with real `command-run run --preset ...` invocations linked to this task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `command-run run --preset <name>` support in `packages/layers/cli/src/commands/command-run.ts` and `packages/layers/cli/src/main.ts`.
2. Added three named presets:
   - `cli-build`: runs `pnpm --filter @narada2/cli build`, classified as `workspace_write`.
   - `task-graph-json`: records a bounded task graph diagnostic, classified as `read_only`.
   - `workbench-diagnose`: records a bounded workbench diagnostic, classified as `read_only`.
3. Presets reject combination with ad hoc `--cmd` or `--argv`, keeping named diagnostics distinct from arbitrary command requests.
4. Added in-process CEIZ execution for Node-based graph/workbench presets after verification exposed that child Node stdout is empty in this environment. The persisted command argv still records the equivalent CLI command while CEIZ owns request/result persistence and output admission.
5. Added `workbench diagnose` in `packages/layers/cli/src/commands/workbench-server.ts` and wired it in `main.ts`. It reports route count and graph counts without starting the server or expanding graph payloads.
6. Added tests in `command-run.test.ts` for preset declaration, combination rejection, and read-only preset execution through CEIZ storage.
7. Added a focused `workbench diagnose` test proving bounded diagnostic shape without raw graph expansion.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Passed |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/command-run.test.ts --pool=forks"` | Passed, 6/6 tests |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/workbench-server.test.ts --pool=forks -t 'workbench diagnose'"` | Passed, 1/1 selected test |
| `OUTPUT_FORMAT=json narada command-run run --preset workbench-diagnose --task 641 --agent a2 --requester a2 --requester-kind agent ...` | Passed, persisted `run_1777089888396_kvqhf7`, bounded workbench excerpt |
| `OUTPUT_FORMAT=json narada command-run run --preset task-graph-json --task 641 --agent a2 --requester a2 --requester-kind agent ...` | Passed, persisted `run_1777089891970_qo7adv`, bounded/truncated graph excerpt |
| `OUTPUT_FORMAT=json narada command-run run --preset cli-build --task 641 --agent a2 --requester a2 --requester-kind agent ...` | Passed, persisted `run_1777089895993_whfpko` |

Full `workbench-server.test.ts` was not used as closure evidence because the sandbox blocks localhost listen with `EPERM`. The new non-server `workbench diagnose` test passes and covers this task's added surface.

## Acceptance Criteria

- [x] Build diagnostics have a CEIZ preset.
- [x] Task graph diagnostics have a CEIZ preset.
- [x] Workbench diagnostics have a CEIZ preset and bounded non-server command.
- [x] Diagnostic probe results are persisted in `command_runs`.
- [x] Diagnostic probes have bounded list/inspect output.



