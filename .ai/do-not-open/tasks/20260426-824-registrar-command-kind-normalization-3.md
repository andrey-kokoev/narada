---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:26:07.643Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:26:08.071Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 824 — Normalize long-lived registrar startup output

## Goal

Make console and workbench serve command output use a named long-lived process startup helper.

## Context

Serve commands are valid exceptions to finite command output admission, but they should use a named helper so the exception is mechanical and searchable.

## Required Work

1. Route console serve startup lines through the shared long-lived startup helper.
2. Route workbench serve startup lines through the shared long-lived startup helper.
3. Keep SIGINT handling unchanged.
4. Add a bounded grep/check that direct serve output is no longer ad hoc console.log in those registrars.

## Non-Goals

- Do not introduce a daemon supervisor.
- Do not run serve commands as part of tests.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] console-register.ts and workbench-register.ts use the named long-lived helper for startup output.
- [x] Serve command help remains available and no server is started during verification.
- [x] SIGINT and server lifecycle behavior remain unchanged.
