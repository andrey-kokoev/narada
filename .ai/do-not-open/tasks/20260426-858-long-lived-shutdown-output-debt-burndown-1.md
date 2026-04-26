---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T20:59:35.227Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T20:59:35.340Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 858 — Add long-lived command shutdown helper

## Goal

Represent long-lived command shutdown as a named helper instead of raw process.exit calls in command registrars.

## Context

console and workbench serve commands are valid long-lived process surfaces, but their SIGINT handlers still call process.exit(0) directly. This should be a named lifecycle helper.

## Required Work

1. Add a helper for successful long-lived command shutdown.
2. Keep behavior equivalent: exit code 0 after server.stop().
3. Document the helper as a long-lived process exception, not finite command output admission.

## Non-Goals

- Do not introduce a daemon supervisor.
- Do not change SIGINT semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A named helper exists for long-lived successful shutdown.
- [x] @narada2/cli typecheck passes.
- [x] No server is started during verification.
