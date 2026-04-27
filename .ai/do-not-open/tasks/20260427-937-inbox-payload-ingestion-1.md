---
status: closed
depends_on: []
closed_at: 2026-04-27T01:31:23.820Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 937 — Inbox Payload Ingestion Ergonomics — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inbox.ts`

## Context

Inline JSON payloads are fragile across shells, especially PowerShell. The command needs explicit payload source modes.

## Goal

Define mutually exclusive payload sources for inbox submit.

## Required Work

1. Keep existing inline `--payload`.
2. Add file and stdin source options.
3. Reject ambiguous source combinations.

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

Added payload source resolution that accepts exactly one of inline payload, payload file, or stdin.

## Verification

Focused tests cover ambiguity rejection.

## Acceptance Criteria

- [x] Inline payload remains supported.
- [x] File payload source is represented.
- [x] Stdin payload source is represented.
- [x] Multiple payload sources are rejected.
