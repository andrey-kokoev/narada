---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T02:58:23.842Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:37:38.767Z
closed_by: a3
---

# Command Execution Regime Contract

## Goal

Define the policy regime that admits and executes command requests inside CEIZ.

## Context

The command runner must not be a raw shell passthrough. It must classify the request, apply timeout and approval rules, and persist the outcome in a way that is useful for Narada tasks and agent operations.

## Required Work

1. Define command classification: read-only inspection, local mutation, external side effect, network access, destructive operation, long-running server, and GUI/browser open.
2. Define timeout policy defaults and override rules.
3. Define cwd and env admission rules, including how secrets are excluded from persisted output.
4. Define approval/escalation posture: what CEIZ records when platform approval is required, granted, denied, or unavailable.
5. Define cancellation and timeout behavior, including process-tree handling and partial output capture.
6. Define how CEIZ invokes shell commands: argv-first where possible, shell mode only when explicitly requested and classified.

## Non-Goals

Do not bypass platform sandboxing. Do not invent new human approval semantics beyond recording and respecting the available approval state.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by operator at 2026-04-25T02:58:23.842Z: dependencies
1. Extended CEIZ side-effect classes with `long_running_server` and `gui_open`.
2. Added `CommandExecutionRegime` plus deterministic timeout, max-timeout, approval, shell-mode, and cancellation-grace helpers.
3. Documented command classification classes and timeout table in the CEIZ concept doc.
4. Documented cwd/env admission rules, including that persisted env records store policy shape only, never secret values.
5. Documented approval posture as data and failure outcomes as structured `rejected` / `blocked_by_policy` results.
6. Documented cancellation behavior: graceful termination, partial output capture, then force-kill after a 5 second grace period where substrate support exists.
7. Documented argv-first invocation and shell-mode governance.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| Manual review of `docs/concepts/command-execution-intent-zone.md` | Classification, timeout, cwd/env, approval, cancellation, and shell-mode rules present |

## Acceptance Criteria

- [x] Every command request receives a side-effect classification before execution.
- [x] Timeout and cancellation rules are deterministic.
- [x] Approval posture is represented as data, not implicit chat behavior.
- [x] Shell mode is explicitly governed.
- [x] Failure modes produce structured result records.



