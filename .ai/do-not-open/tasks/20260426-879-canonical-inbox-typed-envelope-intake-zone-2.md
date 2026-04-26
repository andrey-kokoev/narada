---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T22:05:06.037Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T22:05:06.161Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 879 — Add Canonical Inbox type spine

## Goal

Add exported control-plane types for Canonical Inbox envelopes, source, kind, authority, status, and promotion.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Control-plane exports InboxEnvelope and related typed fields.
- [x] Types support user chat, email, diagnostics, agent reports, file drops, CLI, webhook, and system observation sources.
- [x] Types support promotion targets for task, decision, operator action, knowledge entry, site config change, and archive.
