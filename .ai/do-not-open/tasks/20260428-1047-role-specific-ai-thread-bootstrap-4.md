---
status: closed
depends_on: [1046]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:18:57.063Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented narada sites agent-bootstrap <site-id-or-root> --role architect|builder as a read-only bounded extraction surface, added tests for Architect output, Builder output, contained workspace resolution, and unknown role rejection, documented Operator usage, and passed focused tests plus pnpm verify.
closed_at: 2026-04-28T23:19:08.064Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1047 — Expose role bootstrap inspection command

## Goal

Add a bounded CLI read surface that shows the correct AI thread bootstrap contract for a Site role.

## Context

Fresh AI threads need a stable way to get the right role bootstrap without relying on chat memory. Generated AGENTS.md is durable, but operators also need a command that extracts the Architect or Builder bootstrap text for copy/paste or tool injection.

## Required Work

1. Add a read-only Site command such as narada sites agent-bootstrap <site-id-or-root> --role architect|builder, or the closest coherent existing command placement.
2. The command must read generated Site contract/config and output bounded human/json text for the selected role.
3. Reject unknown roles instead of falling back silently.
4. Do not mutate task, inbox, Site, lifecycle, or runtime state.
5. Document how Operator uses the command to initiate a fresh Architect or Builder thread.

## Non-Goals

- Do not launch agents automatically
- Do not create an infinite role manager
- Do not enforce role permissions at runtime

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] CLI exposes a read-only role bootstrap command or equivalent surface
- [x] The command returns distinct Architect and Builder bootstrap outputs
- [x] Unknown role input is rejected with a clear error
- [x] The command performs no mutation and has bounded output
- [x] Docs include usage examples
