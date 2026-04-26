---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:28:39.766Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:28:40.160Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 847 — Remove integrity spacing and remediation direct output

## Goal

Remove remaining direct blank-line and remediation command output from integrity.ts.

## Context

integrity.ts still has direct blank-line spacing and a direct remediation command line. These should route through Formatter.

## Required Work

1. Replace direct blank-line console output with Formatter output.
2. Replace the direct remediation command line with Formatter output.
3. Remove integrity.ts from the output admission guard allowlist.

## Non-Goals

- Do not run broad integrity checks against live data.
- Do not change remediation text.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] integrity.ts has no direct console/process output allowance.
- [x] integrity help smoke passes.
- [x] The guard report no longer lists integrity.ts.
