---
status: closed
depends_on: []
closed_at: 2026-04-27T01:31:28.271Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 940 — Inbox Payload Ingestion Ergonomics — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inbox-register.ts`

## Context

The ergonomic ingestion modes must be visible through the CLI.

## Goal

Expose payload file and stdin flags.

## Required Work

1. Add `--payload-file <path>`.
2. Add `--payload-stdin`.
3. Wire both to `inboxSubmitCommand`.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Registered `--payload-file` and `--payload-stdin` in `inbox-register.ts`.

## Verification

CLI typecheck passed.

## Acceptance Criteria

- [x] `narada inbox submit --payload-file` is registered.
- [x] `narada inbox submit --payload-stdin` is registered.
- [x] Flags are passed to command implementation.
