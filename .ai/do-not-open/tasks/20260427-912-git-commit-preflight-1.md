---
status: closed
depends_on: []
closed_at: 2026-04-27T00:51:42.555Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 912 — Git Commit Authority Preflight — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/chapter-status.ts`
- `packages/layers/cli/src/commands/chapter-register.ts`
- `packages/layers/cli/src/lib/cli-output.ts`

## Context

The chapter loop previously reached verified implementation and only then discovered that `.git` metadata was read-only. Chapter state inspection and publication authority inspection were collapsed into unstructured shell failure.

## Goal

Define a separate chapter preflight operator that reports whether the next chapter crossings are admissible without mutating tasks or Git state.

## Required Work

1. Add a read-only command module for chapter preflight.
2. Parse numeric chapter ranges consistently with existing chapter status behavior.
3. Return a bounded JSON/human result with `status`, `ready`, and named checks.

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

Implemented `packages/layers/cli/src/commands/chapter-preflight.ts` with range parsing, structured check records, formatted human output, and a read-only command envelope.

## Verification

Verified through CLI typecheck and focused `chapter-preflight.test.ts`.

## Acceptance Criteria

- [x] Preflight has its own command module and does not overload `chapter status`.
- [x] Invalid ranges return a bounded command error.
- [x] Results include stable check names and a top-level readiness boolean.
