---
status: closed
depends_on: []
closed_at: 2026-04-27T01:31:25.276Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 938 — Inbox Payload Ingestion Ergonomics — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inbox.ts`
- `packages/layers/cli/test/commands/inbox.test.ts`

## Context

Generated proposal payloads should be written to JSON files and submitted without shell quoting.

## Goal

Support `--payload-file`.

## Required Work

1. Read payload text from the supplied path.
2. Preserve existing JSON parsing and error handling.
3. Return bounded file-read errors.

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

Implemented `payloadFile` reading with `readFile`.

## Verification

Focused test submits nested JSON from a file.

## Acceptance Criteria

- [x] Payload can be loaded from file.
- [x] Loaded payload is stored unchanged after JSON parse.
- [x] Read failure returns bounded error.
