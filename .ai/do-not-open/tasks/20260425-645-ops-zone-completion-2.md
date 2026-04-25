---
status: confirmed
depends_on: []
governed_by: chapter_close:a2
closed_at: 2026-04-25T04:22:05.509Z
closed_by: a3
---

# Task 645 — Assignment Intent Zone

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

Define the missing Assignment Intent Zone as the authority boundary for recommendation, assignment, claim, continuation, takeover, and roster synchronization.

## Required Reading

- `docs/concepts/ops-zone-completion.md`.
- Existing task roster, claim, continue, next, and recommend command behavior.

## Context

Recurring operational failures have clustered around assignment authority: recommendations appearing as advice rather than operative assignment, roster not matching lifecycle, agents asking what to claim, and continuation/takeover needing manual judgment. This deserves a true zone because it has a distinct authority grammar.

## Required Work

1. Define what the Assignment Intent Zone owns.
2. Identify its request/result artifacts.
3. Define its admission and confirmation rule.
4. Record why it is higher priority than other missing zones.

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

Defined Assignment Intent Zone in `docs/concepts/ops-zone-completion.md` as priority 1.

Target shape:

- Request artifact: `AssignmentRequest`.
- Result artifact: `AssignmentResult`.
- Owns: recommendation, assignment, claim, continuation, takeover.
- Admission: task exists, dependencies satisfied, agent exists, no conflicting active assignment, continuation reason is valid.
- Confirmation: roster, lifecycle, and assignment record agree after transition.

## Verification

Verified that the concept artifact records Assignment Intent Zone as priority 1 and ties it to the observed rough surface: roster, lifecycle, session, and recommender drift.

## Acceptance Criteria

- [x] Assignment Intent Zone is defined.
- [x] Request/result artifacts are named.
- [x] Admission and confirmation rules are stated.
- [x] Priority is justified by observed operational failures.




