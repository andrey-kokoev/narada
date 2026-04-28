---
status: closed
depends_on: [1050]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:49:25.921Z
criteria_proof_verification:
  state: unbound
  rationale: Docs specify read-only list/show posture for Operator Surfaces and SessionBindings, require bounded no-secret output, define materialization as future dry-run-first governed crossing with explicit --execute and CEIZ/equivalent routing for adapter side effects, and explicitly defer adapter materializers/session registry mutation. pnpm verify passed.
closed_at: 2026-04-28T23:49:36.148Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1051 — Specify Operator Surface inspection and materialization posture

## Goal

Define the CLI posture for inspecting surfaces/session bindings and later materializing Operator Surfaces without creating hidden authority or autonomous UI mutation.

## Context

Operator Surfaces and SessionBindings are useful only if Operators and agents can inspect what surfaces, runtimes, channels, and bindings exist and eventually materialize adapters. The first coherent surface should be read-only inspection; materialization should be deferred or dry-run unless explicitly earned.

## Required Work

1. Specify read-only commands such as narada sites surface list/show and session binding inspection for declared Operator Surfaces and bindings.
2. Specify future materialization commands as governed crossings with dry-run first and explicit --execute if implemented later.
3. Define output bounds and no-secret rules for launch/focus/channel/session metadata.
4. State how adapter-specific side effects and session/runtime mutation must pass through CEIZ or another governed execution boundary.
5. Record adapter materializers and session registry mutation as deferred unless Builder is explicitly assigned an implementation task.

## Non-Goals

- Do not implement the CLI command in this architecture task
- Do not run Windows or Komorebi commands
- Do not auto-edit terminal profiles
- Do not persist or mutate live API/CLI session bindings in this task

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs specify read-only inspection posture for Operator Surfaces and SessionBindings
- [x] Docs define materialization as a future governed crossing, not implicit Site bootstrap side effect
- [x] Docs require bounded output and no raw secrets in surface/channel/session metadata
- [x] Deferred adapter implementation is explicit
