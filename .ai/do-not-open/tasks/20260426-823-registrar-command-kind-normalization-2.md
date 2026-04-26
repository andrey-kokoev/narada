---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:25:55.906Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:25:56.372Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 823 — Normalize registrar finite nonzero exits

## Goal

Remove remaining registrar-owned direct process.exit/console.error branches for finite commands where safe.

## Context

Residual direct finite exits remain in workbench diagnose, principal sync-from-tasks, and product utility USC validation/init paths. These should use the shared finite result helper where the command already returns an envelope.

## Required Work

1. Replace workbench diagnose direct process.exit with the shared finite result helper.
2. Replace principal sync-from-tasks direct error/exit handling with the shared finite result helper.
3. Replace product utility USC validate direct error/exit handling with the shared finite result helper.
4. If USC init cannot safely be normalized because it throws rather than returns a command envelope, leave it documented as a bounded residual.

## Non-Goals

- Do not change the semantics of USC repository creation.
- Do not broaden output admission changes to non-registrar implementation files.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Registrar-owned finite commands that return envelopes no longer duplicate direct console.error/process.exit handling.
- [x] Any remaining direct finite exception is explicitly bounded in code or task notes.
- [x] Focused help smokes pass for affected commands.
