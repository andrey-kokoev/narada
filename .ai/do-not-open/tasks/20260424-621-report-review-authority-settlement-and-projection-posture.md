---
status: closed
depends_on: [620]
closed_at: 2026-04-25T00:33:35.918Z
closed_by: operator
governed_by: task_close:operator
---

# Task 621 - Report Review Authority Settlement And Projection Posture

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-587-task-mutation-command-surface-contract.md](.ai/do-not-open/tasks/20260424-587-task-mutation-command-surface-contract.md)

## Context

Reports, reviews, and decisions do not all need the same substrate posture. The remaining ambiguity is which of them are authoritative runtime state and which are durable human-readable artifacts only.

## Required Work

1. Make the report/review split explicit:
   - what is authoritative in SQLite,
   - what remains on disk as projection or narrative.
2. Ensure task verification and review commands read the authoritative source first.
3. Preserve human-readable artifacts only where they add value and do not create split authority.
4. Add focused tests or command checks proving the post-settlement path.

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

1. Settled report/review authority on SQLite: reports and reviews are live runtime authority there, not in legacy disk artifacts.
2. Removed live dependence on `.ai/reviews` from the CLI and support scripts; lint, lifecycle-check, and renumber now read review state from SQLite.
3. Deleted legacy review projection artifacts once the command and script surfaces no longer needed them.
4. Kept the distinction explicit: SQLite owns live report/review truth, while any future narrative artifacts must remain clearly non-authoritative.

## Verification

- `pnpm --filter @narada2/cli build` — passed.
- Focused review test — passed after the SQLite-first cutover.
- `narada task recommend --agent a1 --limit 1 --format json` — still worked after deleting review projection artifacts.
- Static sweep of CLI/scripts — no remaining live `.ai/reviews` dependency in the command path.
- Result: task verification/review no longer depends on legacy file-backed report/review authority.

## Acceptance Criteria

- [x] Report/review authority vs projection posture is explicit and implemented.
- [x] Task verification no longer depends on legacy file-backed authority for reports/reviews.
- [x] Any remaining disk artifacts are clearly non-authoritative.
- [x] Focused verification exists.
- [x] Verification or bounded blocker evidence is recorded.

