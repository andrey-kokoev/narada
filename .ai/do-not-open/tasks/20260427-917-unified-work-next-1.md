---
status: closed
depends_on: []
closed_at: 2026-04-27T01:06:45.128Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 917 — Unified Agent Work Next Surface — Task 1

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/task-next.ts`
- `packages/layers/cli/src/commands/inbox.ts`

## Context

Agents had to know whether to query task governance or Canonical Inbox to answer "what should I do now?" That leaked zone topology into routine operation.

## Goal

Define a unified next-action result contract.

## Required Work

1. Add stable action kinds for task, inbox, and idle.
2. Preserve underlying command result payloads for auditability.
3. Include a concrete next step in human and JSON outputs.

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

Added `workNextCommand` with `action_kind` values `task_work`, `inbox_work`, and `idle`, plus source result payload preservation.

## Verification

Covered by focused `work-next.test.ts` cases.

## Acceptance Criteria

- [x] Unified result has stable `action_kind`.
- [x] Unified result has `primary`.
- [x] Unified result includes source payload for non-idle answers.
