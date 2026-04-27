---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:22:29.338Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:22:29.828Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Improve inbox runtime origin preflight

## Chapter

cli-ergonomics

## Goal

Make canonical inbox diagnostics disclose repo path, CLI entrypoint/runtime origin, package/build availability, and canonical inbox command availability so Windows/WSL shim contamination is visible before payload submission.

## Context

Canonical Inbox submission has already become portable through ignored SQLite plus exported envelopes, but cross-environment invocation still created friction. A Windows/WSL shell can resolve a different `narada`, `node`, package shim, or build output than the operator expects. The inbox doctor should expose those delivery coordinates before a payload is submitted or published.

## Required Work

1. Extend `narada inbox doctor` with runtime-origin diagnostics for cwd, Node executable/version, platform, WSL posture, CLI entrypoint, package root, repo dist entrypoint, and canonical inbox command availability.
2. Keep the output bounded and operator-readable; do not add broad transcript output.
3. Document the preflight use in Canonical Inbox guidance, especially for Windows/WSL or cross-environment submission.
4. Add focused tests that assert the new doctor fields and checks.
5. Handle the source inbox envelope through a governed archive or pending action after the work is captured.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `inbox doctor` reports cwd, CLI entrypoint, Node executable/version, platform, WSL posture, package root, dist entry existence, and inbox command availability.
- [x] Canonical Inbox docs point operators to `inbox doctor` for delivery-coordinate preflight.
- [x] Focused tests cover doctor runtime fields and command availability.
- [x] The source inbox envelope is handled through a governed pending or archive action.
- [x] `pnpm verify` passes.
