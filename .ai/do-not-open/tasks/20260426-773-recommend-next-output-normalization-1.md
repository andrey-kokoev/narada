---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T01:38:22.879Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T01:38:23.003Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 773 — Make task recommend a shared-boundary result producer

## Goal

Remove bespoke CLI output handling from task recommend while preserving no-recommendation exit semantics.

## Context

<!-- Context placeholder -->

## Required Work

1. Change taskRecommendCommand human output to return _formatted output instead of printing internally.
2. Preserve JSON result shape including guidance and posture diagnostics.
3. Preserve nonzero exit code when no primary recommendation is available.
4. Route the task recommend CLI registration through runDirectCommand or directCommandAction.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task recommend no longer hand-rolls console output and process.exit in main.ts.
- [x] Human recommend output is admitted through emitCommandResult.
- [x] JSON recommend output remains structured.
- [x] No-primary recommendation still exits nonzero while producing bounded output.
