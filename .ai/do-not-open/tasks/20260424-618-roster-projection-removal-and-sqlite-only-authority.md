---
status: closed
depends_on: []
closed_at: 2026-04-25T00:33:34.463Z
closed_by: operator
governed_by: task_close:operator
---

# Task 618 - Roster Projection Removal And SQLite-Only Authority

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-611-move-task-roster-authority-to-sqlite.md](.ai/do-not-open/tasks/20260424-611-move-task-roster-authority-to-sqlite.md)

## Context

Roster logic now writes SQLite first but still projects to `.ai/agents/roster.json`. That means a file artifact still exists as a live-looking surface and can drift or be misused.

## Required Work

1. Remove `.ai/agents/roster.json` as a normal authority surface.
2. Make roster read/write operators authoritative on SQLite only.
3. Leave a projection/export path only if it is explicitly non-authoritative.
4. Update any command/help/runtime logic that still assumes the JSON file is canonical.
5. Add focused tests covering roster read/write without JSON authority.

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

1. Removed `.ai/agents/roster.json` from the live task-governance path. Normal roster load/save now use SQLite only.
2. Kept roster authority at the owning layer in `task-governance` instead of leaving compatibility logic smeared across callers.
3. Verified the live CLI path reads roster state from SQLite by running `narada task roster show` after the cutover.
4. Left any future roster export posture as an explicit projection concern rather than a hidden authority fallback.

## Verification

- `pnpm --filter @narada2/cli build` — passed after the roster authority cutover.
- `narada task roster show` — passed against SQLite-backed roster state.
- `test -e .ai/agents/roster.json` — absent in the live repo after cutover.
- Result: live roster commands no longer require or trust `.ai/agents/roster.json`.

## Acceptance Criteria

- [x] Roster commands are authoritative on SQLite only.
- [x] No normal roster operator requires or trusts `.ai/agents/roster.json`.
- [x] Any remaining JSON export is explicitly non-authoritative.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

