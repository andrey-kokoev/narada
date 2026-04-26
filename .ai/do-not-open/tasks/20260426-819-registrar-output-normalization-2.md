---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:19:00.540Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:19:00.963Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 819 — Normalize formatter-backed registry emitters

## Goal

Replace duplicated formatter-backed output/exit helpers in sites, console, and principal registrars with shared helpers.

## Context

sites-register, console-register, and principal-register each define near-identical silentContext and emitFormatterBackedResult helpers.

## Required Work

1. Update sites-register.ts to use the shared helpers.
2. Update console-register.ts to use the shared helpers for control commands.
3. Update principal-register.ts to use the shared helpers for status/list/attach/detach.
4. Preserve existing command names, options, and behavior.

## Non-Goals

- Do not change Site or PrincipalRuntime semantics.
- Do not execute mutating registrar commands as verification.
- Do not start console server.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] No local silentContext or emitFormatterBackedResult duplicates remain in those registrars.
- [x] Bounded help smoke checks confirm sites, console, and principal remain available.
- [x] Typecheck/build succeeds.
- [x] No long-lived server commands are started during verification.
