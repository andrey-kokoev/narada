---
status: closed
depends_on: [1257]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T02:17:30.372Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T02:17:30.821Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Implement crew launch focus bind request planner

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Implement a repository-local planner that turns a verified crew launch intent sequence into a durable launch/focus/bind carrier request artifact without executing launch.

## Context

Tasks 1254-1257 established sequence contracts, Narada proper sequence artifacts, a verifier, and a descriptor-only carrier admission packet. The remaining admitted work is to make sequences operational as handoff requests while preserving that actual launch/focus/bind execution requires a separate external carrier.

## Required Work

Add a read/write-gated tool under tools/operator-surface-carriers that reads a launch intent sequence, runs the verifier, and plans or writes a .narada/crew/launch-requests request artifact with status awaiting_admitted_carrier. Add tests for plan, apply with mutation authority, refusal without authority, and refusal when direct launch execution is requested. Update .narada/crew docs, record audit/ledger evidence, and do not execute launch, create .lnk files, start processes, mutate PC locus, or mutate/copy operator-surface runtime.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Planner emits a structured request artifact shape for narada-proper.carrier.crew-launch-focus-bind.v0 with status awaiting_admitted_carrier.
- [x] Apply mode is mutation-authorized and writes only .narada/crew/launch-requests artifacts.
- [x] Planner refuses direct launch execution, native shell fallback, PC-locus mutation, operator-surface runtime copying, or failed sequence verification.
- [x] Tests cover plan, apply, authority refusal, and direct-launch refusal.
- [x] Verification proves no launch, .lnk, PC-locus, or operator-surface runtime side effect occurred.
