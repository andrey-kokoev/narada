---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:42:46.047Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:42:48.274Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 708 — Extract Task Command Services From CLI Orchestration

## Goal

Move task-domain orchestration out of CLI command files into package-owned services while preserving command behavior.

## Context

The package owns low-level task modules, but CLI commands still contain lifecycle orchestration logic. This keeps authority partially hidden in adapter code.

## Required Work

1. Inventory task CLI commands that contain domain orchestration instead of parse/format adapter logic.
2. Create package service entrypoints for the highest-impact command paths first: finish, close, claim or roster assignment, evidence admission.
3. Change CLI command files to call package services and format bounded results.
4. Keep old command names, flags, and output contracts stable unless a change is explicitly required by existing acceptance criteria.

## Non-Goals

- Do not attempt to convert every task command in one pass.
- Do not weaken evidence, closure, or assignment gates to make extraction easier.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] At least one high-value task lifecycle command is converted so domain transition logic lives in @narada2/task-governance.
- [x] The CLI command file for that path becomes parse/validate/format oriented.
- [x] Focused tests cover the package service directly and the CLI adapter path remains covered.
- [x] No operator-facing command name is renamed.


