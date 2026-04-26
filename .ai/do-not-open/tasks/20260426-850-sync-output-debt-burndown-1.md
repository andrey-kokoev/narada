---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:39:25.557Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:39:25.915Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 850 — Remove sync multi-mailbox direct output

## Goal

Route multi-mailbox sync human summary through Formatter instead of direct console output.

## Context

sync.ts has one direct console.log around formatMultiSyncResult(result). This is finite command output debt and should be admitted through the existing Formatter path.

## Required Work

1. Replace the direct formatMultiSyncResult console output with Formatter-mediated output.
2. Preserve JSON output behavior and exit code behavior.
3. Remove the corresponding sync allowlist entry from the output admission guard.

## Non-Goals

- Do not perform live sync.
- Do not change multi-mailbox sync semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] sync.ts no longer needs the multi-sync direct-output allowlist entry.
- [x] The output admission guard passes.
- [x] @narada2/cli typecheck passes.
