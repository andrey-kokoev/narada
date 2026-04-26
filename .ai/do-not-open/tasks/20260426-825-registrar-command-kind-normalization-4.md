---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:26:22.057Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:26:22.528Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 825 — Verify and close registrar command kind normalization

## Goal

Prove the chapter removed informal registrar output exceptions without destabilizing CLI registration.

## Context

This closes the chapter by checking helper usage, affected command help, typecheck/build, and recording residual exceptions plainly.

## Required Work

1. Run focused static checks for remaining registrar direct process.exit/console output in the touched files.
2. Run affected command help smokes without starting long-lived processes.
3. Run @narada2/cli typecheck and build.
4. Record any deliberately retained residual exceptions and close the chapter.

## Non-Goals

- Do not run full test suites unless focused checks reveal a behavior risk.
- Do not change global command ordering in main.ts in this chapter.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused static checks show touched registrars use shared helpers for finite exits and long-lived startup notices where applicable.
- [x] Affected help smokes pass.
- [x] @narada2/cli typecheck and build pass.
- [x] All tasks in this chapter are closed by command before commit.
