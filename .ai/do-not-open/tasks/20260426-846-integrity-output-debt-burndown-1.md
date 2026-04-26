---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:28:22.604Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:28:23.186Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 846 — Remove integrity sample-error direct output

## Goal

Route integrity sample-error rows through Formatter instead of direct console output.

## Context

integrity.ts has direct output for sampled invalid message records. This is finite command output debt and should use Formatter-mediated output.

## Required Work

1. Replace direct console output for sample message errors with Formatter output.
2. Replace the direct 'and N more' sample-error output with Formatter output.
3. Preserve JSON output and integrity report structure.

## Non-Goals

- Do not change integrity checking semantics.
- Do not mutate operation data.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] integrity.ts no longer needs sample-error direct-output allowlist entries.
- [x] The output admission guard passes.
- [x] @narada2/cli typecheck passes.
