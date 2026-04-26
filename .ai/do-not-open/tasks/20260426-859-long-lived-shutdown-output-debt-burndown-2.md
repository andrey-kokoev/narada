---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:59:35.169Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:59:35.286Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 859 — Use shutdown helper in long-lived registrars

## Goal

Replace raw process.exit(0) in console and workbench serve handlers with the named shutdown helper.

## Context

The guard currently allowlists two long-lived SIGINT exits. Once routed through a helper, the allowlist entries can be removed.

## Required Work

1. Use the shutdown helper in console-register.ts.
2. Use the shutdown helper in workbench-register.ts.
3. Remove console-register and workbench-register process.exit allowlist entries.

## Non-Goals

- Do not run serve commands.
- Do not change startup notices.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] console-register.ts and workbench-register.ts have no direct process.exit allowance.
- [x] The output admission guard passes.
- [x] Serve help smokes pass without starting servers.
