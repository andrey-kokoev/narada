---
status: closed
depends_on: []
closed_at: 2026-04-27T01:31:29.703Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 941 — Inbox Payload Ingestion Ergonomics — Task 5

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/test/commands/inbox.test.ts`

## Context

Payload source behavior needs regression coverage because shell-safe ingestion is the core ergonomic improvement.

## Goal

Verify file/stdin payload ingestion.

## Required Work

1. Test payload file submission.
2. Test stdin payload submission.
3. Test ambiguous source rejection.
4. Keep existing inbox tests passing.

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

Added three focused inbox submit tests.

## Verification

`pnpm --filter @narada2/cli exec vitest run test/commands/inbox.test.ts --pool=forks` passed 15/15.

## Acceptance Criteria

- [x] Payload file test passes.
- [x] Payload stdin test passes.
- [x] Ambiguous source rejection test passes.
- [x] Existing inbox tests still pass.
