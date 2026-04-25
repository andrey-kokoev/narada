---
status: confirmed
depends_on: []
governed_by: chapter_close:a2
closed_at: 2026-04-25T04:22:28.124Z
closed_by: a3
---

# Task 648 — Operator Input Zone

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

Define the missing Operator Input Zone for durable approvals, gates, choices, and live-operation inputs.

## Required Reading

- `docs/concepts/ops-zone-completion.md`.
- Existing operator gates in task artifacts.
- Live-operation and approval rough surfaces from recent execution.

## Context

Operator authority currently appears in chat, task text, CLI flags, and manual approvals. For live operations, credentials, target selection, approval level, and explicit gates must become durable input decisions rather than implicit conversational state.

## Required Work

1. Define Operator Input Zone.
2. Identify operator input request/result artifacts.
3. Specify what must not remain chat-only authority.
4. Relate this zone to CEIZ approval and live task gates.

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

Defined Operator Input Zone in `docs/concepts/ops-zone-completion.md` as priority 4.

Target shape:

- Request artifact: `OperatorInputRequest`.
- Result artifact: `OperatorInputDecision`.
- Owns: approvals, live gates, choices, credential prompts, operator-selected targets.
- Admission: question is explicit, numbered, bounded, and tied to an operation/task context.
- Confirmation: accepted choice is durable and referenceable by downstream commands.

This zone prevents hidden authority from being inferred from chat context.

## Verification

Verified the concept artifact includes Operator Input Zone and lists chat-state approvals as the rough surface it eliminates.

## Acceptance Criteria

- [x] Operator Input Zone is defined.
- [x] Request/result artifacts are named.
- [x] Chat-only authority is rejected.
- [x] CEIZ/live gate relationship is stated.




