---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:48:20.927Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:48:21.557Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 854 — Remove config existing-file direct output

## Goal

Route non-interactive config existing-file remediation output through Formatter instead of direct console output.

## Context

config.ts has direct blank-line and overwrite-command output in the existing-file error path. This is finite setup command output debt.

## Required Work

1. Replace direct blank-line console output in the existing-file branch with Formatter output.
2. Replace direct overwrite command console output with Formatter output.
3. Preserve JSON error behavior and exit code behavior.

## Non-Goals

- Do not change config file schema.
- Do not migrate config-interactive in this chapter.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] config.ts no longer needs existing-file direct-output allowlist entries.
- [x] The output admission guard passes.
- [x] @narada2/cli typecheck passes.
