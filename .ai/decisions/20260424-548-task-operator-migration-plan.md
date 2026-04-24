---
closes_tasks: [548]
decided_at: 2026-04-24
decided_by: codex
reviewed_by: codex
governance: derive -> propose
---

# Decision 548 — Task Operator Migration Plan

## Problem

Decision 546 split authority between SQLite lifecycle state and markdown-authored task spec. Decision 547 defined the minimum schema and projection model. What remains is the operator migration path:

- which current task operators become SQLite writers
- which remain markdown readers or evidence readers
- how to migrate incrementally without breaking governed flows
- how to preserve compatibility while old markdown-state tasks still exist

## Current Operator Families

Current task operators relevant to the migration:

- `task-claim`
- `task-continue`
- `task-report`
- `task-review`
- `task-finish`
- `task-close`
- `task-evidence`
- `task-graph`
- `task-roster assign/done`
- `task-promote-recommendation`

## Decision

Narada migrates operators in **three waves** while keeping CLI behavior stable.

### Wave 1 — Introduce SQLite Authority Without Changing User-Facing Semantics

Affected operators:
- `task-claim`
- `task-continue`
- `task-report`
- `task-review`
- `task-close`
- `task-reopen`
- `task-roster assign`
- `task-promote-recommendation`

Behavior:
- continue writing existing artifact files as needed
- additionally write authoritative lifecycle rows to SQLite
- treat SQLite as shadow authority until validation parity is proven

Goal:
- establish dual-read comparison without immediate cutover

### Wave 2 — Switch Lifecycle Reads To SQLite / Projection

Affected operators:
- `task-evidence`
- `task-graph`
- `task-roster show`
- dependency validation helpers
- recommendation/promotion validation
- workbench task views

Behavior:
- lifecycle state comes from SQLite/projection
- markdown is consulted only for authored spec and evidence body sections
- legacy markdown lifecycle fields become compatibility fallback only

Goal:
- make correctness queries stop depending on raw markdown front matter

### Wave 3 — Remove Markdown Lifecycle Authority

Affected operators:
- all lifecycle writers
- task creation/chapter init templates
- lint/enforcement surfaces

Behavior:
- lifecycle writers only mutate SQLite
- markdown lifecycle fields are stripped from newly written tasks
- lint treats new lifecycle fields in markdown as boundary breach

Goal:
- eliminate direct markdown lifecycle mutation as a valid path

## Operator Mapping

| Operator | SQLite Role | Markdown Role | Projection Role |
|----------|-------------|---------------|-----------------|
| `task-claim` | writer (`task_lifecycle`, `task_assignments`) | reads spec id/deps only | optional read-after-write |
| `task-continue` | writer (`task_lifecycle`, `task_assignments`) | reads task spec only | optional read-after-write |
| `task-report` | writer (`task_reports`, lifecycle status) | writes `Execution Notes` / `Verification` scaffolding | read evidence summary |
| `task-review` | writer (`task_reviews`, lifecycle closure) | reads body evidence; may append review-linked notes if preserved | read merged status |
| `task-close` | writer (`task_lifecycle`) | reads body evidence | read merged status |
| `task-finish` | orchestration only; delegates to report/review/roster | reads body evidence indirectly | consumes projection/evidence |
| `task-evidence` | reader for lifecycle + reviews + reports | reader for criteria/notes/verification | primary merged reader |
| `task-graph` | reader for lifecycle status only | reader for structure/dependencies | merged read surface |
| `task-roster assign` | writer indirectly via claim | no lifecycle write | reads projection for validation |
| `task-roster done` | reader for evidence completeness | reader for body evidence | merged read surface |
| `task-promote-recommendation` | writer indirectly via claim/promotion | no lifecycle write | reads projection for validations |

## Compatibility Rules

During migration:

1. Existing markdown-only closed tasks may continue to read as historical tasks.
2. Reopened or newly mutated tasks must transfer lifecycle authority into SQLite.
3. If both SQLite and markdown lifecycle state exist, SQLite wins.
4. Error messages should distinguish:
   - legacy historical task
   - migrated authoritative task
   - dual-authority breach

## Incremental Migration Order

1. Add SQLite schema and backfill utility.
2. Migrate assignment and report/review records into SQLite-backed stores.
3. Switch shared lifecycle readers used by:
   - dependency validation
   - evidence classification
   - graph status rendering
4. Switch claim/continue/close/review writers to SQLite.
5. Switch recommendation/promotion and roster validation to projection-based reads.
6. Remove lifecycle authority from markdown templates and generated repairs.
7. Raise lint severity on markdown lifecycle fields from compatibility warning to hard error.

## Bounded Compatibility Requirements

- CLI command names and flags remain stable.
- Markdown body sections remain human-readable and git-diffable.
- Existing task ids and task numbers do not change.
- Historical closed tasks remain inspectable without mandatory immediate backfill.
- No all-at-once cutover is required.

## Verification

- All current operator families are mapped to future authority roles ✅
- Incremental migration order is explicit and bounded ✅
- Compatibility posture preserves CLI and markdown ergonomics ✅
- Decision aligns with 546 authority split and 547 projection model ✅

## Closure Statement

Task 548 closes with a concrete operator migration plan: lifecycle writers move first into SQLite-backed authority, lifecycle readers then switch to projection/SQLite, and markdown lifecycle authority is removed only after compatibility and read parity are proven. The migration is incremental, governed, and does not require a destructive all-at-once cutover.
