---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T02:56:22.214Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:32:58.654Z
closed_by: a3
---

# Command Execution Intent Zone Boundary Contract

## Goal

Define the Command Execution Intent Zone as the governed ops sibling of the Testing Intent Zone.

## Context

TIZ governs verification commands as test intent. Narada still runs many non-test commands directly: build, graph, workbench, git, diagnostics, roster, task, and proof harness commands. Those commands currently mix request, admission, execution, output capture, and result reporting inside the operator/agent shell surface. This task must settle the zone boundary before implementation.

## Required Work

1. Define the input boundary as a durable CommandRunRequest, not an already-executed shell line.
2. Define the output boundary as a durable CommandRunResult, not chat text or raw terminal output.
3. State how CEIZ differs from TIZ: CEIZ is general command execution, TIZ is verification-specialized command execution with stricter evidence semantics.
4. Decide whether TIZ remains a sibling or becomes a typed specialization, and record the decision.
5. Name what CEIZ owns: cwd, env, timeout, approval posture, side-effect classification, output capture, output admission, duration, exit status, and task/agent/operator linkage.

## Non-Goals

Do not implement command execution yet. Do not replace TIZ. Do not redesign shell sandboxing or platform approval policy.

## Execution Notes

1. Added `docs/concepts/command-execution-intent-zone.md` as the CEIZ boundary contract.
2. Defined the three-stage separation: `CommandRunRequest`, admitted `CommandExecution`, and `CommandRunResult`.
3. Fixed the CEIZ/TIZ relationship: TIZ remains a sibling specialization of CEIZ, with verification-specific evidence semantics.
4. Named the authority owner as the Narada command execution controller; the shell is only an execution substrate and chat transcript output is only an observation surface.
5. Classified direct shell execution as legacy/noncanonical for governed Narada ops.
6. Named the first implementation slice: SQLite-backed `command_runs` plus `narada command-run run|inspect|list`.
7. Added the new CEIZ document to the AGENTS.md documentation index.

## Verification

| Command | Result |
| --- | --- |
| `sed -n '1,260p' .ai/do-not-open/tasks/20260425-629-command-execution-intent-zone-1.md` | Reviewed task scope before implementation |
| `rg -n "Testing Intent Zone|TIZ|CommandRun" ...` | Located existing TIZ surfaces and confirmed no CEIZ contract existed |
| `sed -n '1,260p' packages/layers/cli/src/commands/test-run.ts` | Reviewed TIZ shape for sibling/specialization decision |

## Acceptance Criteria

- [x] Boundary between command request, command execution, and command result is explicit.
- [x] CEIZ/TIZ relationship is settled without hidden ambiguity.
- [x] Authority owner and crossing artifact names are fixed.
- [x] Direct shell execution is classified as legacy/noncanonical for governed Narada ops.
- [x] First implementation slice is named.



