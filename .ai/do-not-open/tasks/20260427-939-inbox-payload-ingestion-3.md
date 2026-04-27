---
status: closed
depends_on: []
closed_at: 2026-04-27T01:31:26.818Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 939 — Inbox Payload Ingestion Ergonomics — Task 3

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/inbox.ts`

## Context

Pipelines should be able to generate JSON and pipe it directly into inbox submit.

## Goal

Support `--payload-stdin`.

## Required Work

1. Read all stdin chunks as UTF-8.
2. Parse the resulting JSON through the existing payload parser.
3. Make stdin injectable for tests.

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

Added `readStream` and `payloadStdin` support with injectable stream.

## Verification

Focused test submits JSON through `Readable.from`.

## Acceptance Criteria

- [x] Payload can be read from stdin.
- [x] Test can inject stdin stream.
- [x] Invalid stdin read returns bounded error.
