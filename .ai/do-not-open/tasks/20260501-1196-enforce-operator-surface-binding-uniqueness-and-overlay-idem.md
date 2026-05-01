---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T20:21:12.172Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777666853433_dgak57
closed_at: 2026-05-01T20:22:09.377Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Enforce operator-surface binding uniqueness and overlay idempotence

## Chapter

operator-surface-binding-hardening

## Goal

Make runtime binding reconciliation and overlay rendering robust against duplicate HWND, duplicate identity, and stale label state.

## Context

Inbox envelope env_280e20f8-d7f1-4781-8891-3fb18268d29d reports duplicate overlapping labels and contradictory Kevin/Bob bindings after operator-surface repair. OSM later resolved Bob to Kevin because runtime binding truth was polluted.

## Required Work

Add or specify a binding reconciliation path that atomically normalizes runtime bindings for a Site or PC: remove dead HWNDs, reject duplicate HWND-to-identity bindings, reject duplicate live singleton identity bindings unless a declared multi-surface policy exists, validate postconditions, and write repair evidence. Make overlay start/reload destroy stale label windows owned by the overlay process before rendering current labels. Ensure the renderer enforces at most one visible label per live HWND and emits diagnostics instead of duplicate UI when input is contradictory. Make OSM delivery preflight refuse ambiguous or duplicate bindings before focus/sendkeys delivery.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Duplicate live bindings for one HWND are refused or normalized with recorded evidence.
- [x] One singleton identity bound to multiple live HWNDs is refused unless an explicit multi-surface policy exists.
- [x] Starting or reloading overlay twice produces one label per bound live HWND.
- [x] OSM delivery refuses ambiguous binding posture with a machine-readable error such as binding_ambiguous.
- [x] Regression coverage covers duplicate identity, duplicate HWND, dead HWND cleanup, overlay restart idempotence, and OSM ambiguity refusal.
