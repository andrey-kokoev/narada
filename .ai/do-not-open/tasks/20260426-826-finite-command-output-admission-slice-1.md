---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:34:44.665Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:34:45.107Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 826 — Make principal human output formatter-backed

## Goal

Move principal status/list/attach/detach human output from direct console writes into returned formatted command results.

## Context

The principal registrar already uses formatter-backed result emission, but principal.ts still prints human output directly inside finite command bodies. This violates the output creation versus output admission split.

## Required Work

1. Add local formatting helpers in principal.ts that create human output strings without writing to stdout.
2. Return _formatted human output for status, list, attach, and detach through the existing command result envelope.
3. Preserve JSON result payloads and exit codes.
4. Remove direct console.log calls from principal.ts.

## Non-Goals

- Do not alter PrincipalRuntime registry semantics.
- Do not migrate principal-sync-from-tasks in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] principal.ts has no direct console.log/console.error/process.exit use.
- [x] principal status/list/attach/detach still return JSON payloads for json format.
- [x] @narada2/cli typecheck passes.
