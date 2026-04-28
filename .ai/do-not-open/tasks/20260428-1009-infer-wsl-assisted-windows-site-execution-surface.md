---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T01:38:46.566Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T01:38:46.964Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Infer WSL-assisted Windows Site execution surface

## Chapter

Windows Site Execution Surface

## Goal

Make Windows Site bootstrap output distinguish target authority locus from executor surface, and infer wsl_assisted only when a WSL executor targets a Windows user-locus or PC-locus Site.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] sites init exposes authority-locus sync and execution-surface CLI flags.
- [x] Windows Site dry-run output includes execution_surface and authority-preserving inference rationale.
- [x] WSL executor plus Windows user or PC locus infers wsl_assisted.
- [x] WSL executor plus WSL/Linux target does not infer Windows-assisted execution.
- [x] Ambiguous execution surface can be supplied explicitly.
- [x] Focused tests and pnpm verify pass.
